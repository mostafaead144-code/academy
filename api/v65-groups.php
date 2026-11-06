<?php
declare(strict_types=1);
/** EGTAZ V65 - Administrative classrooms. Reuses teacherGroupsV4 and two-sided student groupIds.
 * No new SQL tables; every mutation is atomic under academy_data collection advisory locks.
 */
function academy_v65_teacher(PDO $pdo,string $teacherId): array {
    $st=$pdo->prepare("SELECT id,display_name,status FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");
    $st->execute([$teacherId]);$u=$st->fetch(PDO::FETCH_ASSOC);
    if(!$u)academy_json(['ok'=>false,'error'=>'teacher_not_found'],404);
    return $u;
}
function academy_v65_group(string $teacherId,string $groupId): array {
    $g=academy_read_node('teacherGroupsV4/'.$teacherId.'/'.$groupId);
    if(!is_array($g)||($g['teacherId']??$teacherId)!==$teacherId)academy_json(['ok'=>false,'error'=>'group_not_found'],404);
    return $g;
}
function academy_v65_scope(array $g): array {
    return array_intersect_key($g,array_flip(['type','stage','grade','subject']));
}
function academy_v65_scope_complete(array $scope): bool {
    foreach(['type','stage','grade','subject'] as $key)if(!isset($scope[$key]))return false;
    $type=(string)$scope['type'];$stage=(string)$scope['stage'];$grade=(string)$scope['grade'];
    $limit=['primary'=>6,'prep'=>3,'sec'=>3];
    return in_array($type,['public','azhar'],true)&&isset($limit[$stage])&&
        preg_match('/^[1-9][0-9]?$/D',$grade)===1&&(int)$grade<=$limit[$stage]&&
        mb_strlen(trim((string)$scope['subject']))>0&&mb_strlen((string)$scope['subject'])<=80;
}
function academy_v65_group_code(PDO $pdo): string {
    for($tries=0;$tries<16;$tries++){
        $code='CLS-'.strtoupper(substr(bin2hex(random_bytes(4)),0,6));
        if(academy_read_node('groupJoinCodesV1/'.$code)===null)return $code;
    }
    throw new RuntimeException('join_code_unavailable');
}
function academy_v65_has_other_owner(array $all,string $groupId,string $ownerId): bool {
    foreach($all as $tid=>$sets)if((string)$tid!==$ownerId&&is_array($sets)&&array_key_exists($groupId,$sets))return true;
    return false;
}
function academy_v65_profile_has_id(array $profile,string $groupId): bool {
    $ids=$profile['groupIds']??[];
    if(!is_array($ids))return false;
    return array_is_list($ids)?in_array($groupId,array_map('strval',$ids),true):!empty($ids[$groupId]);
}
function academy_v65_member_exists(array $group,string $studentId): bool {
    $members=$group['members']??[];
    if(!is_array($members))return false;
    if(array_is_list($members)){
        foreach($members as $m)if($m===$studentId||(is_array($m)&&($m['studentId']??null)===$studentId))return true;
        return false;
    }
    return array_key_exists($studentId,$members)&&$members[$studentId]!==null&&$members[$studentId]!==false;
}
function academy_v65_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v65/'))return;
    $admin=academy_v62_role('admin');
    academy_rate_limit('v65-admin-'.$admin['id'],160,3600);
    if($route==='/v65/admin/groups'&&$method==='GET'){
        $filterTeacher=trim((string)($_GET['teacherId']??''));
        if($filterTeacher!=='')$filterTeacher=academy_v62_uuid($filterTeacher);
        $search=mb_substr(trim((string)($_GET['search']??'')),0,80);
        $status=(string)($_GET['status']??'');
        if(!in_array($status,['','active','paused'],true))academy_json(['ok'=>false,'error'=>'invalid_filter'],422);
        $offset=max(0,min(100000,(int)($_GET['offset']??0)));
        $teacherRows=$pdo->query("SELECT id,display_name,status FROM academy_users WHERE primary_role='teacher' ORDER BY display_name LIMIT 2001")->fetchAll(PDO::FETCH_ASSOC);
        $truncatedTeachers=count($teacherRows)>2000;$teacherRows=array_slice($teacherRows,0,2000);
        $teacherMap=[];foreach($teacherRows as $t)$teacherMap[$t['id']]=$t;
        $all=academy_read_node('teacherGroupsV4');$found=[];
        if(is_array($all))foreach($all as $tid=>$groups){
            if($filterTeacher!==''&&(string)$tid!==$filterTeacher)continue;
            if(!is_array($groups))continue;
            foreach($groups as $gid=>$g){
                if(!is_array($g)||($g['teacherId']??(string)$tid)!==(string)$tid)continue;
                $active=($g['active']??true)===true;
                if($status==='active'&&!$active||$status==='paused'&&$active)continue;
                $name=(string)($g['name']??'فصل');$teacherName=(string)($teacherMap[$tid]['display_name']??'معلم غير متاح');
                if($search!==''&&mb_stripos($name,$search)===false&&mb_stripos($teacherName,$search)===false)continue;
                $found[]=['id'=>(string)$gid,'teacherId'=>(string)$tid,'teacherName'=>$teacherName,
                    'name'=>mb_substr($name,0,100),'subject'=>(string)($g['subject']??''),
                    'subjectName'=>(string)($g['subjectName']??$g['subject']??''),'type'=>(string)($g['type']??''),
                    'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),'active'=>$active,
                    'memberCount'=>is_array($g['members']??null)?count($g['members']):0,
                    'updatedAt'=>(int)($g['updatedAt']??$g['createdAt']??0)];
            }
        }
        usort($found,fn($a,$b)=>$b['updatedAt']<=>$a['updatedAt']);
        $total=count($found);
        academy_json(['ok'=>true,'groups'=>array_slice($found,$offset,20),'total'=>$total,
            'nextOffset'=>$offset+20<$total?$offset+20:null,'offset'=>$offset,
            'teachers'=>array_map(fn($t)=>['id'=>$t['id'],'name'=>$t['display_name'],'status'=>$t['status']],$teacherRows),
            'teachersTruncated'=>$truncatedTeachers]);
    }
    if($route==='/v65/admin/scopes'&&$method==='GET'){
        $tid=academy_v62_uuid($_GET['teacherId']??'');
        $teacher=academy_v65_teacher($pdo,$tid);
        $assignments=[];foreach(academy_teacher_assignments($tid) as $i=>$scope){
            $scope=academy_v65_scope($scope);
            if(!academy_v65_scope_complete($scope))continue;
            $assignments[]=['index'=>$i,'type'=>(string)$scope['type'],'stage'=>(string)$scope['stage'],
                'grade'=>(string)$scope['grade'],'subject'=>(string)$scope['subject']];
        }
        academy_json(['ok'=>true,'teacher'=>$teacher,'assignments'=>$assignments,'profileActive'=>academy_teacher_is_active_profile($tid)]);
    }
    if($route==='/v65/admin/group'&&$method==='GET'){
        $tid=academy_v62_uuid($_GET['teacherId']??'');$gid=academy_v62_gid($_GET['groupId']??'');
        $g=academy_v65_group($tid,$gid);
        $offset=max(0,min(100000,(int)($_GET['offset']??0)));
        $members=$g['members']??[];
        if(!is_array($members))$members=[];
        $ids=[];
        foreach($members as $key=>$m){
            $id=is_int($key)?(is_array($m)?(string)($m['studentId']??''):(string)$m):(string)$key;
            if(preg_match('/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iD',$id))$ids[]=$id;
        }
        $allCount=count($ids);$list=array_slice($ids,$offset,30);$students=[];
        $st=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");
        foreach($list as $sid){
            $st->execute([$sid]);$account=$st->fetch(PDO::FETCH_ASSOC);
            $p=academy_read_node('studentProfilesV3/'.$sid);
            $membership=is_array($p)&&academy_v65_profile_has_id($p,$gid);
            $matches=is_array($p)&&academy_scope_matches($g,$p);
            $students[]=['id'=>$sid,'name'=>mb_substr((string)($p['name']??$account['display_name']??'طالب'),0,110),
                'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??''),
                'status'=>(string)($account['status']??'missing'),'valid'=>$membership&&$matches&&$account!==false];
        }
        academy_json(['ok'=>true,'group'=>['id'=>$gid,'teacherId'=>$tid,'name'=>(string)($g['name']??'مجموعة'),
           'description'=>(string)($g['description']??''),'type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),
           'grade'=>(string)($g['grade']??''),'subject'=>(string)($g['subject']??''),
           'subjectName'=>(string)($g['subjectName']??''),'active'=>($g['active']??true)===true,
           'code'=>(string)($g['code']??''),'membersCount'=>$allCount],
           'students'=>$students,'offset'=>$offset,'nextOffset'=>$offset+30<$allCount?$offset+30:null]);
    }
    if($route==='/v65/admin/targets'&&$method==='GET'){
        $tid=academy_v62_uuid($_GET['teacherId']??'');$gid=academy_v62_gid($_GET['groupId']??'');
        $source=academy_v65_group($tid,$gid);$all=academy_read_node('teacherGroupsV4');$targets=[];
        if(is_array($all))foreach($all as $owner=>$groups){
            if(!is_array($groups))continue;
            foreach($groups as $groupId=>$g){
                if(!is_array($g)||($g['active']??true)!==true||($g['teacherId']??(string)$owner)!==(string)$owner)continue;
                if((string)$owner===$tid&&(string)$groupId===$gid)continue;
                $same=true;foreach(['type','stage','grade','subject'] as $key)
                    if((string)($g[$key]??'')!==(string)($source[$key]??''))$same=false;
                if(!$same)continue;
                $targets[]=['teacherId'=>(string)$owner,'groupId'=>(string)$groupId,
                    'name'=>(string)($g['name']??'فصل'),'subjectName'=>(string)($g['subjectName']??''),
                    'membersCount'=>is_array($g['members']??null)?count($g['members']):0];
                if(count($targets)>=401)break 2;
            }
        }
        $more=count($targets)>400;$targets=array_slice($targets,0,400);
        $st=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");
        $teacherStatus=[];
        $targets=array_values(array_filter(array_map(function($target)use($st,&$teacherStatus){
            $tid=$target['teacherId'];
            if(!isset($teacherStatus[$tid])){$st->execute([$tid]);$t=$st->fetch(PDO::FETCH_ASSOC);$teacherStatus[$tid]=$t?:['status'=>'missing','display_name'=>''];}
            if($teacherStatus[$tid]['status']!=='active'||!academy_teacher_is_active_profile($tid))return null;
            $target['teacherName']=$teacherStatus[$tid]['display_name'];return $target;
        },$targets)));
        academy_json(['ok'=>true,'targets'=>$targets,'truncated'=>$more]);
    }
    if($method==='POST'&&in_array($route,['/v65/admin/create','/v65/admin/status','/v65/admin/transfer'],true)){
        academy_rate_limit('v65-mutation-'.$admin['id'],40,3600);
        $b=academy_body();
        if($route==='/v65/admin/create'){
            $tid=academy_v62_uuid($b['teacherId']??'');$name=trim((string)($b['name']??''));
            $description=trim((string)($b['description']??''));$index=filter_var($b['assignmentIndex']??null,FILTER_VALIDATE_INT);
            if(mb_strlen($name)<3||mb_strlen($name)>90||mb_strlen($description)>300||$index===false||$index<0)
                academy_json(['ok'=>false,'error'=>'invalid_group_data'],422);
            $locks=academy_acquire_data_locks($pdo,['teacherGroupsV4','groupJoinCodesV1']);
            try{
                $pdo->beginTransaction();try{
                    $teacher=academy_v65_teacher($pdo,$tid);
                    if($teacher['status']!=='active'||!academy_teacher_is_active_profile($tid))academy_json(['ok'=>false,'error'=>'teacher_unavailable'],422);
                    $assignments=academy_teacher_assignments($tid);$a=$assignments[$index]??null;
                    if(!is_array($a))academy_json(['ok'=>false,'error'=>'assignment_not_found'],422);
                    $scope=academy_v65_scope($a);
                    if(!academy_v65_scope_complete($scope))academy_json(['ok'=>false,'error'=>'assignment_incomplete'],422);
                    $gid=substr(str_replace('-','',academy_uuid()),0,20);
                    $code=academy_v65_group_code($pdo);$ts=academy_now_ms();
                    $g=['id'=>$gid,'code'=>$code,'name'=>$name,'description'=>$description,'teacherId'=>$tid,
                        'type'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>(string)$scope['grade'],
                        'subject'=>$scope['subject'],'subjectName'=>(string)($a['subjectName']??$scope['subject']),
                        'active'=>true,'members'=>[],'createdAt'=>$ts,'updatedAt'=>$ts];
                    academy_insert_value_raw($pdo,'teacherGroupsV4/'.$tid.'/'.$gid,$g,$admin['id']);
                    academy_insert_value_raw($pdo,'groupJoinCodesV1/'.$code,['teacherId'=>$tid,'groupId'=>$gid,'active'=>true,'createdAt'=>$ts],$admin['id']);
                    $pdo->commit();
                }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
            }finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($admin['id'],'v65.group.create',$gid,['teacherId'=>$tid]);
            academy_json(['ok'=>true,'group'=>['id'=>$gid,'teacherId'=>$tid,'name'=>$name]],201);
        }
        if($route==='/v65/admin/status'){
            $tid=academy_v62_uuid($b['teacherId']??'');$gid=academy_v62_gid($b['groupId']??'');
            if(!array_key_exists('active',$b)||!is_bool($b['active']))academy_json(['ok'=>false,'error'=>'invalid_status'],422);
            $active=$b['active'];$gp='teacherGroupsV4/'.$tid.'/'.$gid;
            $locks=academy_acquire_data_locks($pdo,[$gp,'groupJoinCodesV1']);
            try{$pdo->beginTransaction();try{
                $g=academy_v65_group($tid,$gid);$code=(string)($g['code']??'');
                if($active){$t=academy_v65_teacher($pdo,$tid);if($t['status']!=='active'||!academy_teacher_is_active_profile($tid))academy_json(['ok'=>false,'error'=>'teacher_unavailable'],422);}
                $g['active']=$active;$g['updatedAt']=academy_now_ms();
                academy_delete_node_raw($pdo,$gp);academy_insert_value_raw($pdo,$gp,$g,$admin['id']);
                if($code!==''){
                    $idx=academy_read_node('groupJoinCodesV1/'.$code);
                    if(is_array($idx)&&(($idx['teacherId']??'')!==$tid||($idx['groupId']??'')!==$gid))academy_json(['ok'=>false,'error'=>'join_code_conflict'],409);
                    $idx=is_array($idx)?$idx:['teacherId'=>$tid,'groupId'=>$gid];
                    $idx['active']=$active;$idx['updatedAt']=academy_now_ms();
                    academy_delete_node_raw($pdo,'groupJoinCodesV1/'.$code);academy_insert_value_raw($pdo,'groupJoinCodesV1/'.$code,$idx,$admin['id']);
                }
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($admin['id'],'v65.group.status',$gid,['teacherId'=>$tid,'active'=>$active]);academy_json(['ok'=>true,'active'=>$active]);
        }
        if($route==='/v65/admin/transfer'){
            $fromTid=academy_v62_uuid($b['fromTeacherId']??'');$fromGid=academy_v62_gid($b['fromGroupId']??'');
            $toTid=academy_v62_uuid($b['toTeacherId']??'');$toGid=academy_v62_gid($b['toGroupId']??'');
            $sid=academy_v62_uuid($b['studentId']??'');
            if($fromTid===$toTid&&$fromGid===$toGid)academy_json(['ok'=>false,'error'=>'same_group'],422);
            $fromPath='teacherGroupsV4/'.$fromTid.'/'.$fromGid;
            $toPath='teacherGroupsV4/'.$toTid.'/'.$toGid;
            $profilePath='studentProfilesV3/'.$sid;
            $locks=academy_acquire_data_locks($pdo,[$fromPath,$toPath,$profilePath]);
            try{$pdo->beginTransaction();try{
                $from=academy_v65_group($fromTid,$fromGid);$to=academy_v65_group($toTid,$toGid);
                $query=$pdo->prepare("SELECT status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1 FOR UPDATE");
                $query->execute([$sid]);$student=$query->fetch(PDO::FETCH_ASSOC);
                $teacher=academy_v65_teacher($pdo,$toTid);
                $profile=academy_read_node($profilePath);
                if(!$student||$student['status']!=='active'||!is_array($profile))academy_json(['ok'=>false,'error'=>'student_unavailable'],422);
                if(is_array($profile['groupIds']??null)&&array_is_list($profile['groupIds'])&&count($profile['groupIds'])>0)
                    academy_json(['ok'=>false,'error'=>'legacy_group_links_require_review'],409);
                if($teacher['status']!=='active'||!academy_teacher_is_active_profile($toTid)||($to['active']??true)!==true)
                    academy_json(['ok'=>false,'error'=>'destination_unavailable'],422);
                foreach(['type','stage','grade','subject'] as $field){
                    if((string)($from[$field]??'')!==(string)($to[$field]??''))academy_json(['ok'=>false,'error'=>'different_scope'],422);
                }
                if(!academy_scope_matches($to,$profile)||!academy_teacher_scope_allowed($toTid,academy_v65_scope($to)))
                    academy_json(['ok'=>false,'error'=>'scope_mismatch'],422);
                // Paused source groups can be transferred out, but both membership halves must still match.
                $oldActive=$from;$oldActive['active']=true;
                if(!academy_v534_group_member_allowed($oldActive,$profile,$sid,$fromGid))academy_json(['ok'=>false,'error'=>'source_membership_invalid'],409);
                if(is_array($from['members']??null)&&array_is_list($from['members'])&&count($from['members'])>0)academy_json(['ok'=>false,'error'=>'legacy_members_require_review'],409);
                if(is_array($to['members']??null)&&array_is_list($to['members'])&&count($to['members'])>0)academy_json(['ok'=>false,'error'=>'legacy_members_require_review'],409);
                if(academy_v65_member_exists($to,$sid)||academy_v65_profile_has_id($profile,$toGid))academy_json(['ok'=>false,'error'=>'already_in_destination'],409);
                $all=academy_read_node('teacherGroupsV4');
                if(is_array($all)&&(
                    academy_v65_has_other_owner($all,$fromGid,$fromTid)||academy_v65_has_other_owner($all,$toGid,$toTid)
                ))academy_json(['ok'=>false,'error'=>'group_id_collision'],409);
                $oldMember='teacherGroupsV4/'.$fromTid.'/'.$fromGid.'/members/'.$sid;
                $newMember='teacherGroupsV4/'.$toTid.'/'.$toGid.'/members/'.$sid;
                academy_delete_node_raw($pdo,$oldMember);
                academy_delete_node_raw($pdo,$profilePath.'/groupIds/'.$fromGid);
                academy_insert_value_raw($pdo,$newMember,['studentId'=>$sid,'name'=>(string)($profile['name']??'طالب'),'joinedAt'=>academy_now_ms()],$admin['id']);
                academy_insert_value_raw($pdo,$profilePath.'/groupIds/'.$toGid,true,$admin['id']);
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($admin['id'],'v65.group.transfer',$fromGid,['studentId'=>$sid,'fromTeacherId'=>$fromTid,'toTeacherId'=>$toTid,'toGroupId'=>$toGid]);
            academy_json(['ok'=>true,'studentId'=>$sid]);
        }
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
