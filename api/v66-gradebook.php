<?php
declare(strict_types=1);
/** EGTAZ V66 – teacher-owned gradebook and admin assignment overview.
 * Reuses existing teacherGroupsV4 / assignments / assignmentSubmissions / studentProfilesV3.
 * Read-only new routes: no DB migration and no grade mutation here.
 */
function academy_v66_teacher_groups(string $tid): array {
    $out=[];
    foreach(academy_v62_memberships($tid) as $gid=>$g){
        if(!is_array($g)||($g['teacherId']??$tid)!==$tid)continue;
        if(!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))continue;
        $out[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'فصل'),0,100),
            'subject'=>(string)($g['subject']??''),'subjectName'=>(string)($g['subjectName']??$g['subject']??''),
            'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),
            'type'=>(string)($g['type']??''),'active'=>($g['active']??true)===true,
            'membersCount'=>is_array($g['members']??null)?count($g['members']):0];
        if(count($out)>=100)break;
    }
    return $out;
}
function academy_v66_assignment_matches(string $sid,array $a,array $p,array $g,string $gid): bool {
    if(!academy_scope_matches($a,$p))return false;
    foreach(['type','stage','grade','subject'] as $k){
        $pv=$k==='type'?($a[$k]??''):($a[$k]??'');
        if((string)$pv!==(string)($g[$k]??''))return false;
    }
    $mode=(string)($a['targetMode']??'stage');
    if($mode==='group')return (string)($a['targetGroupId']??'')===$gid && academy_v534_assignment_group_allowed($a,$p,$sid);
    if($mode==='students')return is_array($a['targetStudentIds']??null)&&in_array($sid,array_map('strval',$a['targetStudentIds']),true);
    return in_array($mode,['stage','all',''],true);
}
function academy_v66_graded_authorized(string $teacherId,string $assignmentId,string $sid): bool {
    // Recheck current, verified group membership and assignment scope on the server.
    $a=academy_read_node('assignments/'.$assignmentId);
    if(!is_array($a)||($a['teacherId']??'')!==$teacherId||($a['status']??'')!=='published'||!empty($a['isHidden']))return false;
    $p=academy_read_node('studentProfilesV3/'.$sid);
    if(!is_array($p)||!academy_v62_teacher_student_allowed($teacherId,$sid,$p))return false;
    $groups=academy_v62_memberships($teacherId);
    foreach($groups as $gid=>$g){
        if(!is_array($g)||($g['teacherId']??$teacherId)!==$teacherId)continue;
        if(!academy_v534_group_member_allowed($g,$p,$sid,(string)$gid))continue;
        if(!academy_teacher_scope_allowed($teacherId,academy_v64_group_scope($g)))continue;
        if(academy_v66_assignment_matches($sid,$a,$p,$g,(string)$gid))return true;
    }
    return false;
}
function academy_v66_gradebook_page(string $tid,string $gid,int $offset,PDO $pdo): array {
    $g=academy_read_node('teacherGroupsV4/'.$tid.'/'.$gid);
    if(!is_array($g)||($g['teacherId']??$tid)!==$tid||!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))
        academy_json(['ok'=>false,'error'=>'group_not_allowed'],403);
    $members=is_array($g['members']??null)?$g['members']:[];
    // IMPORTANT: page first, verify each row second. Never fetch thousands of profiles on every gradebook open.
    // Membership count comes from the group index; rows still require reciprocal group/profile verification.
    $memberIds=[];$truncated=false;
    foreach($members as $sid=>$entry){
        if(is_int($sid))$sid=(string)(is_array($entry)?($entry['studentId']??''):$entry);
        $sid=strtolower((string)$sid);
        if(!preg_match('/^[0-9a-f-]{36}$/D',$sid))continue;
        $memberIds[$sid]=true;
        if(count($memberIds)>=10000){$truncated=count($members)>10000;break;}
    }
    $ids=array_keys($memberIds);sort($ids,SORT_STRING);
    $total=count($ids);$pageIds=array_slice($ids,$offset,20);$page=[];
    $check=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");
    foreach($pageIds as $sid){
        $p=academy_read_node('studentProfilesV3/'.$sid);
        if(!is_array($p)||!academy_v534_group_member_allowed($g,$p,$sid,$gid))continue;
        $check->execute([$sid]);$acc=$check->fetch(PDO::FETCH_ASSOC);
        if(!$acc||($acc['status']??'')!=='active')continue;
        $page[]=['id'=>$sid,'name'=>mb_substr((string)($p['name']??$acc['display_name']??'طالب'),0,110),'profile'=>$p];
    }
    $all=academy_read_node('assignments');$assignmentRows=[];
    if(is_array($all))foreach($all as $aid=>$a){
        if(!is_array($a)||($a['teacherId']??'')!==$tid||($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
        if(!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',(string)$aid))continue;
        $same=true;foreach(['type','stage','grade','subject'] as $key)if((string)($a[$key]??'')!==(string)($g[$key]??''))$same=false;
        if(!$same)continue;
        if(($a['targetMode']??'stage')==='group'&&(string)($a['targetGroupId']??'')!==$gid)continue;
        $assignmentRows[]=['id'=>(string)$aid,'title'=>mb_substr((string)($a['title']??'واجب'),0,110),'dueAt'=>(int)($a['dueAt']??0),
            'createdAt'=>(int)($a['createdAt']??0),'data'=>$a];
    }
    usort($assignmentRows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
    $assignments=array_slice($assignmentRows,0,10);$students=[];$kpis=['graded'=>0,'submitted'=>0,'notSubmitted'=>0];
    foreach($page as $student){
        $sid=$student['id'];$p=$student['profile'];$cells=[];$scores=[];
        foreach($assignments as $a){
            $item=$a['data'];$eligible=academy_v66_assignment_matches($sid,$item,$p,$g,$gid);
            if(!$eligible){$cells[$a['id']]=['status'=>'not_assigned','score'=>null];continue;}
            $s=academy_read_node('assignmentSubmissions/'.$a['id'].'/'.$sid);
            $state=is_array($s)?(string)($s['status']??'new'):'new';
            $score=$state==='graded'&&isset($s['score'])&&is_numeric($s['score'])?max(0,min(100,(float)$s['score'])):null;
            if($score!==null){$kpis['graded']++;$scores[]=$score;$state='graded';}
            elseif($state==='submitted'){$kpis['submitted']++;}
            else{$state='new';$kpis['notSubmitted']++;}
            $cells[$a['id']]=['status'=>$state,'score'=>$score];
        }
        // V64's conservative rule: only explicitly teacher-attributed quiz scores are shown.
        $quiz=academy_v64_teacher_quizzes($p,$tid,[['subject'=>(string)($g['subject']??''),'subjectName'=>(string)($g['subjectName']??'')]]);
        $students[]=['id'=>$sid,'name'=>$student['name'],'cells'=>$cells,
            'homeworkAverage'=>$scores?round(array_sum($scores)/count($scores),1):null,
            'quizAverage'=>$quiz['average'],'quizCount'=>$quiz['count']];
    }
    return ['group'=>['id'=>$gid,'name'=>mb_substr((string)($g['name']??'فصل'),0,110),'subjectName'=>(string)($g['subjectName']??$g['subject']??''),'active'=>($g['active']??true)===true],
        'assignments'=>array_map(static fn($a)=>['id'=>$a['id'],'title'=>$a['title'],'dueAt'=>$a['dueAt']],$assignments),
        'students'=>$students,'total'=>$total,'offset'=>$offset,'nextOffset'=>($offset+count($pageIds)<$total)?$offset+20:null,
        'truncated'=>$truncated,'membershipCountUnverified'=>true,'assignmentsTruncated'=>count($assignmentRows)>10,'pageStats'=>$kpis,'generatedAt'=>academy_now_ms(),
        'note'=>'متوسط الواجبات للدرجات المصححة فقط؛ لا يُحسب عدم التسليم صفرًا. الاختبارات تظهر عند وجود معرّف المعلم الموثوق في النتيجة. عدد العضويات من سجل الفصل وقد يشمل سجلات تحتاج مراجعة.'];
}
function academy_v66_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v66/'))return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    if($route==='/v66/teacher/groups'){
        $u=academy_v64_role('teacher');academy_rate_limit('v66-groups-'.$u['id'],150,3600);
        academy_json(['ok'=>true,'groups'=>academy_v66_teacher_groups((string)$u['id'])]);
    }
    if($route==='/v66/teacher/gradebook'){
        $u=academy_v64_role('teacher');academy_rate_limit('v66-grades-'.$u['id'],120,3600);
        $gid=academy_v62_gid($_GET['groupId']??'');$offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);
        if($offset===false||$offset<0||$offset>10000||$offset%20!==0)academy_json(['ok'=>false,'error'=>'invalid_page'],422);
        academy_json(['ok'=>true]+academy_v66_gradebook_page((string)$u['id'],$gid,$offset,$pdo));
    }
    if($route==='/v66/admin/assignments'){
        $u=academy_v64_role('admin');academy_rate_limit('v66-admin-'.$u['id'],150,3600);
        $all=academy_read_node('assignments');$rows=[];$totals=['all'=>0,'pending'=>0,'published'=>0,'rejected'=>0];
        if(is_array($all))foreach($all as $id=>$a){
            if(!is_array($a))continue;$totals['all']++;$s=(string)($a['status']??'published');if(isset($totals[$s]))$totals[$s]++;
            $rows[]=['id'=>(string)$id,'title'=>mb_substr((string)($a['title']??'واجب'),0,130),'teacherId'=>(string)($a['teacherId']??''),
                'status'=>$s,'subject'=>mb_substr((string)($a['subjectName']??$a['subject']??''),0,100),
                'targetMode'=>(string)($a['targetMode']??'stage'),'dueAt'=>(int)($a['dueAt']??0),
                'createdAt'=>(int)($a['createdAt']??0)];
        }
        usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
        $rows=array_slice($rows,0,100);$tidSet=[];foreach($rows as $r)if(preg_match('/^[0-9a-f-]{36}$/i',$r['teacherId']))$tidSet[$r['teacherId']]=true;
        $names=[];$q=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");
        foreach(array_keys($tidSet) as $tid){$q->execute([$tid]);$names[$tid]=(string)($q->fetchColumn()?:'معلم');}
        foreach($rows as &$r)$r['teacherName']=$names[$r['teacherId']]??'غير محدد';unset($r);
        academy_json(['ok'=>true,'summary'=>$totals,'items'=>$rows,'truncated'=>$totals['all']>100,'generatedAt'=>academy_now_ms()]);
    }
    academy_json(['ok'=>false,'error'=>'not_found'],404);
}
