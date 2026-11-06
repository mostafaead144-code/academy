<?php
declare(strict_types=1);
/** V67: a private, group-scoped teacher homework workflow. No schema migration. */
function academy_v67_group(string $tid,string $gid): array {
    $g=academy_read_node('teacherGroupsV4/'.$tid.'/'.$gid);
    if(!is_array($g)||($g['teacherId']??$tid)!==$tid||($g['active']??true)!==true||!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))
        academy_json(['ok'=>false,'error'=>'group_not_allowed'],403);
    return $g;
}
function academy_v67_member_ids(array $group): array {
    $out=[];$members=$group['members']??[];
    if(!is_array($members))return [];
    foreach($members as $key=>$entry){
        $id=is_int($key)?(is_array($entry)?(string)($entry['studentId']??''):(string)$entry):(string)$key;
        $id=strtolower($id);
        if(preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/D',$id))$out[$id]=true;
        if(count($out)>=10000)break;
    }
    $ids=array_keys($out);sort($ids,SORT_STRING);return $ids;
}
function academy_v67_allowed_member(string $tid,string $gid,array $g,string $sid,PDO $pdo): ?array {
    $p=academy_read_node('studentProfilesV3/'.$sid);
    if(!is_array($p)||!academy_v534_group_member_allowed($g,$p,$sid,$gid))return null;
    $q=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");
    $q->execute([$sid]);$row=$q->fetch(PDO::FETCH_ASSOC);
    if(!$row||$row['status']!=='active')return null;
    return ['id'=>$sid,'name'=>mb_substr((string)($p['name']??$row['display_name']??'طالب'),0,100)];
}
function academy_v67_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v67/'))return;
    $u=academy_v62_role('teacher');$tid=(string)$u['id'];
    academy_rate_limit('v67-'.$tid,200,3600);
    if($route==='/v67/teacher/members'&&$method==='GET'){
        $gid=academy_v62_gid($_GET['groupId']??'');$offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT);
        if($offset===false||$offset<0||$offset>10000||$offset%40!==0)academy_json(['ok'=>false,'error'=>'invalid_page'],422);
        $g=academy_v67_group($tid,$gid);$ids=academy_v67_member_ids($g);
        $subset=array_slice($ids,$offset,40);$items=[];
        foreach($subset as $sid){$safe=academy_v67_allowed_member($tid,$gid,$g,$sid,$pdo);if($safe)$items[]=$safe;}
        academy_json(['ok'=>true,'items'=>$items,'offset'=>$offset,'total'=>count($ids),
            'nextOffset'=>$offset+40<count($ids)?$offset+40:null,'note'=>'العدد مبني على فهرس العضوية، ولا تظهر إلا الحسابات النشطة ذات الربط الموثق من الجانبين.']);
    }
    if($route==='/v67/teacher/create'&&$method==='POST'){
        academy_rate_limit('v67-create-'.$tid,25,3600);
        $b=academy_body();$gid=academy_v62_gid($b['groupId']??'');$g=academy_v67_group($tid,$gid);
        $title=trim((string)($b['title']??''));$instructions=trim((string)($b['instructions']??''));
        $ts=academy_now_ms();$dueAt=filter_var($b['dueAt']??null,FILTER_VALIDATE_INT);
        if(mb_strlen($title)<3||mb_strlen($title)>140||mb_strlen($instructions)>5000||$dueAt===false||$dueAt<$ts+60000||$dueAt>$ts+366*86400000)
            academy_json(['ok'=>false,'error'=>'invalid_assignment'],422);
        $mode=(string)($b['recipientMode']??'all');
        if(!in_array($mode,['all','selected'],true))academy_json(['ok'=>false,'error'=>'invalid_target'],422);
        $ids=[];
        if($mode==='selected'){
            $raw=$b['studentIds']??null;
            if(!is_array($raw)||!array_is_list($raw)||count($raw)<1||count($raw)>100)academy_json(['ok'=>false,'error'=>'invalid_students'],422);
            foreach($raw as $sid){
                if(!is_string($sid)||!preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/D',$sid))academy_json(['ok'=>false,'error'=>'invalid_students'],422);
                $ids[$sid]=true;
            }
            if(count($ids)!==count($raw))academy_json(['ok'=>false,'error'=>'duplicate_students'],422);
            // Verify group membership and current account at save time: do not trust client selection.
            foreach($ids as $sid=>$_)if(!academy_v67_allowed_member($tid,$gid,$g,$sid,$pdo))academy_json(['ok'=>false,'error'=>'student_not_in_group'],403);
        }
        $id=substr(str_replace('-','',academy_uuid()),0,24);
        $scope=['type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),
            'grade'=>(string)($g['grade']??''),'subject'=>(string)($g['subject']??'')];
        if(!in_array($scope['type'],['public','azhar'],true)||!in_array($scope['stage'],['primary','prep','sec'],true)||!preg_match('/^[1-6]$/D',$scope['grade'])||!preg_match('/^[a-zA-Z0-9_-]{1,90}$/D',$scope['subject']))
            academy_json(['ok'=>false,'error'=>'group_scope_invalid'],422);
        $row=['id'=>$id,'teacherId'=>$tid,'title'=>$title,'description'=>$instructions,'instructions'=>$instructions]
            +$scope+['subjectName'=>mb_substr((string)($g['subjectName']??$scope['subject']),0,100),
            'targetMode'=>'group','targetGroupId'=>$gid,'recipientMode'=>$mode,'recipientCount'=>$mode==='selected'?count($ids):null,
            'dueAt'=>$dueAt,'maxScore'=>100,'status'=>'pending','isHidden'=>false,'createdAt'=>$ts,'updatedAt'=>$ts];
        $paths=['assignments/'.$id];if($mode==='selected')$paths[]='assignmentTargetsV67/'.$id;
        $locks=academy_acquire_data_locks($pdo,$paths);
        try{
            $pdo->beginTransaction();
            try{
                // A single transaction ensures recipients cannot be lost while leaving a public assignment behind.
                if(academy_read_node('assignments/'.$id)!==null)throw new RuntimeException('assignment_id_collision');
                if($mode==='selected')academy_insert_value_raw($pdo,'assignmentTargetsV67/'.$id,['studentIds'=>array_keys($ids)],$tid);
                academy_insert_value_raw($pdo,'assignments/'.$id,$row,$tid);
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($tid,'v67.assignment.create',$id,['groupId'=>$gid,'recipientMode'=>$mode,'count'=>count($ids)]);
        academy_json(['ok'=>true,'assignment'=>['id'=>$id,'title'=>$title,'status'=>'pending']],201);
    }
    if($route==='/v67/teacher/submissions'&&$method==='GET'){
        $id=trim((string)($_GET['assignmentId']??''));$offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT);
        if(!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$id)||$offset===false||$offset<0||$offset>10000||$offset%25!==0)
            academy_json(['ok'=>false,'error'=>'invalid_request'],422);
        $a=academy_read_node('assignments/'.$id);
        if(!is_array($a)||($a['teacherId']??'')!==$tid||($a['status']??'')!=='published'||!empty($a['isHidden']))academy_json(['ok'=>false,'error'=>'assignment_unavailable'],403);
        $subs=academy_read_node('assignmentSubmissions/'.$id);$items=[];
        if(is_array($subs))foreach($subs as $sid=>$r){
            if(!is_array($r)||!is_string($sid)||!preg_match('/^[a-f0-9-]{36}$/D',$sid))continue;
            if(!academy_v66_graded_authorized($tid,$id,$sid))continue;
            $items[]=['studentId'=>$sid,'studentName'=>mb_substr((string)($r['studentName']??'طالب'),0,100),
                'answer'=>mb_substr((string)($r['answer']??''),0,12000),'link'=>mb_substr((string)($r['link']??''),0,700),
                'status'=>in_array(($r['status']??''),['submitted','graded'],true)?$r['status']:'submitted',
                'score'=>isset($r['score'])&&is_numeric($r['score'])?max(0,min(100,(int)$r['score'])):null,
                'feedback'=>mb_substr((string)($r['feedback']??''),0,1500),'late'=>!empty($r['late']),
                'submittedAt'=>(int)($r['submittedAt']??0)];
        }
        usort($items,static fn($a,$b)=>$b['submittedAt']<=>$a['submittedAt']);
        $total=count($items);$pending=count(array_filter($items,static fn($r)=>$r['status']==='submitted'));
        academy_json(['ok'=>true,'items'=>array_slice($items,$offset,25),'total'=>$total,'pending'=>$pending,
            'nextOffset'=>$offset+25<$total?$offset+25:null,'offset'=>$offset,
            'note'=>'تظهر التسليمات للطلاب المرتبطين حاليًا بفصول المعلم فقط.']);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
