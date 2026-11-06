<?php
declare(strict_types=1);
/** EGTAZ V62: first-phase group/student relationships. Uses existing academy_data paths. */
function academy_v62_uuid(mixed $raw): string {
    $id=strtolower(trim((string)$raw));
    if(!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D',$id))academy_json(['ok'=>false,'error'=>'invalid_account_id'],422);
    return $id;
}
function academy_v62_gid(mixed $raw): string {
    $id=trim((string)$raw);
    if(!preg_match('/^[a-zA-Z0-9_-]{5,80}$/D',$id))academy_json(['ok'=>false,'error'=>'invalid_group_id'],422);
    return $id;
}
function academy_v62_role(string $role): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!==$role)academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='teacher'&&!academy_teacher_is_active_profile((string)$u['id']))academy_json(['ok'=>false,'error'=>'teacher_unavailable'],403);
    return $u;
}
function academy_v62_memberships(string $teacherId): array {
    $groups=academy_read_node('teacherGroupsV4/'.$teacherId);
    return is_array($groups)?$groups:[];
}
function academy_v62_teacher_student_allowed(string $teacherId,string $studentId,?array $profile=null,?array $groups=null): bool {
    // Request-local caches avoid repeated full JSON reads for every student in reports.
    static $activeCache=[],$scopeAllowedCache=[];
    if(!array_key_exists($teacherId,$activeCache))$activeCache[$teacherId]=academy_teacher_is_active_profile($teacherId);
    if(!$activeCache[$teacherId])return false;
    $profile=$profile??academy_read_node('studentProfilesV3/'.$studentId);
    if(!is_array($profile))return false;
    $groups=$groups??academy_v62_memberships($teacherId);
    foreach($groups as $gid=>$g){
        if(!is_array($g)||($g['teacherId']??$teacherId)!==$teacherId)continue;
        if(!academy_v534_group_member_allowed($g,$profile,$studentId,(string)$gid))continue;
        $key=$teacherId.'|'.(string)$gid;
        if(!array_key_exists($key,$scopeAllowedCache))$scopeAllowedCache[$key]=academy_teacher_scope_allowed($teacherId,[
            'type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),
            'grade'=>(string)($g['grade']??''),'subject'=>(string)($g['subject']??'')]);
        if(!$scopeAllowedCache[$key])continue;
        return true;
    }
    return false;
}
function academy_v62_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v62/'))return;
    if($route==='/v62/admin/catalog'&&$method==='GET'){
        $admin=academy_v62_role('admin');academy_rate_limit('v62-admin-catalog-'.$admin['id'],90,3600);
        $t=$pdo->query("SELECT id,display_name,status FROM academy_users WHERE primary_role='teacher' ORDER BY display_name ASC LIMIT 501")->fetchAll(PDO::FETCH_ASSOC);
        $all=academy_read_node('teacherGroupsV4');$groups=[];
        if(is_array($all))foreach($all as $tid=>$sets){
            if(!is_array($sets))continue;
            foreach($sets as $gid=>$g){
                if(!is_array($g))continue;
                $groups[]=['teacherId'=>(string)$tid,'id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,100),
                    'subject'=>(string)($g['subject']??''),'subjectName'=>(string)($g['subjectName']??''),
                    'type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),
                    'active'=>($g['active']??true)===true,'membersCount'=>is_array($g['members']??null)?count($g['members']):0];
                if(count($groups)>=600)break 2;
            }
        }
        academy_json(['ok'=>true,'teachers'=>array_slice($t,0,500),'groups'=>$groups,'truncated'=>count($t)>500||count($groups)>=600]);
    }
    if($route==='/v62/admin/roster'&&$method==='GET'){
        academy_v62_role('admin');$tid=academy_v62_uuid($_GET['teacherId']??'');$gid=academy_v62_gid($_GET['groupId']??'');
        $g=academy_read_node('teacherGroupsV4/'.$tid.'/'.$gid);
        if(!is_array($g)||($g['teacherId']??$tid)!==$tid)academy_json(['ok'=>false,'error'=>'group_not_found'],404);
        $rows=[];$allMembers=$g['members']??[];
        if(is_array($allMembers))foreach($allMembers as $sid=>$member){
            if(is_int($sid))$sid=(string)(is_array($member)?($member['studentId']??''):$member);
            if(!preg_match('/^[a-f\d-]{36}$/i',(string)$sid))continue;
            $q=$pdo->prepare("SELECT id,display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");$q->execute([(string)$sid]);$account=$q->fetch(PDO::FETCH_ASSOC);
            $p=academy_read_node('studentProfilesV3/'.(string)$sid);
            $rows[]=['id'=>(string)$sid,'name'=>mb_substr((string)($p['name']??$account['display_name']??'طالب'),0,100),
                'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??''),
                'status'=>(string)($account['status']??'missing'),
                'linked'=>is_array($p)&&academy_v534_group_member_allowed($g,$p,(string)$sid,$gid)];
            if(count($rows)>=300)break;
        }
        academy_json(['ok'=>true,'rows'=>$rows,'truncated'=>is_array($allMembers)&&count($allMembers)>300]);
    }
    if($route==='/v62/admin/enrollment'&&$method==='POST'){
        $admin=academy_v62_role('admin');academy_rate_limit('v62-enrollment-'.$admin['id'],80,3600);
        $b=academy_body();$tid=academy_v62_uuid($b['teacherId']??'');$gid=academy_v62_gid($b['groupId']??'');$sid=academy_v62_uuid($b['studentId']??'');
        $action=(string)($b['action']??'');if(!in_array($action,['add','remove'],true))academy_json(['ok'=>false,'error'=>'invalid_action'],422);
        $groupPath='teacherGroupsV4/'.$tid.'/'.$gid;$studentPath='studentProfilesV3/'.$sid;
        // The existing academy_data lock convention serializes writes at collection root.
        $locks=academy_acquire_data_locks($pdo,[$groupPath,$studentPath]);
        try{
            $pdo->beginTransaction();
            try{
                $t=$pdo->prepare("SELECT id,status FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");$t->execute([$tid]);$teacher=$t->fetch(PDO::FETCH_ASSOC);
                $s=$pdo->prepare("SELECT id,status,display_name FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1 FOR UPDATE");$s->execute([$sid]);$student=$s->fetch(PDO::FETCH_ASSOC);
                $g=academy_read_node($groupPath);$p=academy_read_node($studentPath);
                if(!$teacher||!$student||!is_array($g)||($g['teacherId']??$tid)!==$tid||!is_array($p))academy_json(['ok'=>false,'error'=>'enrollment_target_missing'],404);
                $memberPath=$groupPath.'/members/'.$sid;$linkPath=$studentPath.'/groupIds/'.$gid;
                if($action==='add'){
                    if(($teacher['status']??'')!=='active'||$student['status']!=='active'||($g['active']??true)!==true||!academy_teacher_is_active_profile($tid))academy_json(['ok'=>false,'error'=>'inactive_account_or_group'],422);
                    if(!academy_scope_matches($g,$p)||!academy_teacher_scope_allowed($tid,['type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),'subject'=>(string)($g['subject']??'')]))academy_json(['ok'=>false,'error'=>'scope_mismatch'],422);
                    // Existing groupIds use group ID as unique key; reject rare collisions across teachers.
                    $existing=academy_read_node('teacherGroupsV4');
                    if(is_array($existing))foreach($existing as $owner=>$sets)if((string)$owner!==$tid&&is_array($sets)&&isset($sets[$gid]))academy_json(['ok'=>false,'error'=>'group_id_collision'],409);
                    academy_delete_node_raw($pdo,$memberPath);academy_insert_value_raw($pdo,$memberPath,['studentId'=>$sid,'name'=>(string)($p['name']??$student['display_name']),'joinedAt'=>academy_now_ms()],$admin['id']);
                    academy_delete_node_raw($pdo,$linkPath);academy_insert_value_raw($pdo,$linkPath,true,$admin['id']);
                }else{
                    academy_delete_node_raw($pdo,$memberPath);
                    academy_delete_node_raw($pdo,$linkPath);
                }
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        }finally{academy_release_data_locks($pdo,$locks);}
        academy_audit((string)$admin['id'],'v62.enrollment.'.$action,$gid,['teacherId'=>$tid,'studentId'=>$sid]);
        academy_json(['ok'=>true,'action'=>$action]);
    }
    if($route==='/v62/teacher/my-students'&&$method==='GET'){
        $teacher=academy_v62_role('teacher');academy_rate_limit('v62-roster-'.$teacher['id'],80,3600);
        $tid=(string)$teacher['id'];$groups=academy_v62_memberships($tid);$unique=[];$groupRows=[];
        foreach($groups as $gid=>$g){
            if(!is_array($g)||($g['teacherId']??$tid)!==$tid)continue;
            $members=is_array($g['members']??null)?$g['members']:[];$count=0;
            foreach($members as $sid=>$member){
                if(is_int($sid))$sid=(string)(is_array($member)?($member['studentId']??''):$member);
                $sid=(string)$sid;if(!preg_match('/^[a-f\d-]{36}$/i',$sid))continue;
                $p=academy_read_node('studentProfilesV3/'.$sid);
                if(!is_array($p)||!academy_v62_teacher_student_allowed($tid,$sid,$p,[$gid=>$g]))continue;
                if(!isset($unique[$sid])){
                    $q=$pdo->prepare("SELECT id,display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");$q->execute([$sid]);$account=$q->fetch(PDO::FETCH_ASSOC);
                    if(!$account||$account['status']!=='active')continue;
                    $unique[$sid]=['id'=>$sid,'name'=>mb_substr((string)($p['name']??$account['display_name']),0,100),
                        'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??''),'groups'=>[]];
                }
                $unique[$sid]['groups'][]=(string)$gid;$count++;
            }
            $groupRows[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,100),
                'active'=>($g['active']??true)===true,'subjectName'=>(string)($g['subjectName']??$g['subject']??''),'membersCount'=>$count];
            if(count($unique)>600)break;
        }
        $rows=array_values($unique);usort($rows,fn($a,$b)=>strcmp($a['name'],$b['name']));
        academy_json(['ok'=>true,'students'=>array_slice($rows,0,600),'groups'=>$groupRows,'total'=>count($rows),'truncated'=>count($rows)>600]);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
