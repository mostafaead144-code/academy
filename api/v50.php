<?php
declare(strict_types=1);
/** V50 administrative student tools. No changes to quiz results or earned score rows. */
function academy_v50_admin(): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    return $u;
}
function academy_v50_uuid(mixed $raw): string {
    $id=strtolower(trim((string)$raw));
    if(!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D',$id))academy_json(['ok'=>false,'error'=>'student_invalid'],422);
    return $id;
}
function academy_v50_student(PDO $pdo,string $id,bool $lock=false): array {
    $st=$pdo->prepare('SELECT id,email,display_name,primary_role,status FROM academy_users WHERE id=? AND primary_role=\'student\' LIMIT 1'.($lock?' FOR UPDATE':''));
    $st->execute([$id]);$row=$st->fetch(PDO::FETCH_ASSOC);
    if(!$row)academy_json(['ok'=>false,'error'=>'student_not_found'],404);
    return $row;
}
function academy_v50_scope(array $b): array {
    $type=(string)($b['educationType']??'');$stage=(string)($b['stage']??'');$grade=(string)($b['grade']??'');
    if(!in_array($type,['public','azhar'],true)||!in_array($stage,['primary','prep','sec'],true)||!preg_match('/^[1-6]$/D',$grade)||((int)$grade)>($stage==='primary'?6:3))academy_json(['ok'=>false,'error'=>'invalid_school_scope'],422);
    return ['educationType'=>$type,'stage'=>$stage,'grade'=>$grade];
}
function academy_v50_profile_row(PDO $pdo,array $dbUser): array {
    $id=$dbUser['id'];$p=academy_read_node('studentProfilesV3/'.$id);if(!is_array($p))$p=[];
    $st=$pdo->prepare('SELECT COALESCE(SUM(points),0) AS points FROM m1_points_ledger WHERE student_id=?');$st->execute([$id]);
    return ['id'=>$id,'name'=>(string)($p['name']??$dbUser['display_name']),'phone'=>(string)($p['phone']??''),'guardianPhone'=>(string)($p['guardianPhone']??$p['parentPhone']??''),'educationType'=>(string)($p['educationType']??'public'),'stage'=>(string)($p['stage']??'primary'),'grade'=>(string)($p['grade']??'1'),'status'=>$dbUser['status'],'points'=>(int)$st->fetchColumn(),'mustChangePassword'=>is_array(academy_read_node('v50PasswordForceV1/'.$id))];
}
function academy_v50_new_balance(int $before,int $delta): int {if($before+$delta<0)academy_json(['ok'=>false,'error'=>'points_below_zero'],422);return $before+$delta;}
function academy_v50_force_reset_required(string $uid): bool {return is_array(academy_read_node('v50PasswordForceV1/'.$uid));}
function academy_v50_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v50/'))return;
 $u=academy_v50_admin();$uid=$u['id'];
 if($route==='/v50/admin/students'&&$method==='GET'){
  $q=trim((string)($_GET['search']??''));$offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);if($offset===false||$offset<0||$offset>100000||mb_strlen($q)>100)academy_json(['ok'=>false,'error'=>'invalid_search'],422);
  $where="primary_role='student'";$params=[];
  if($q!==''){$where.=" AND (display_name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')";$escaped=str_replace(['!','%','_'],['!!','!%','!_'],$q);$params=array_fill(0,2,'%'.$escaped.'%');}
  $stmt=$pdo->prepare("SELECT id,email,display_name,status FROM academy_users WHERE $where ORDER BY created_at DESC,id DESC LIMIT 31 OFFSET ?");
  foreach($params as $i=>$value)$stmt->bindValue($i+1,$value,PDO::PARAM_STR);
  $stmt->bindValue(count($params)+1,(int)$offset,PDO::PARAM_INT);$stmt->execute();$rows=$stmt->fetchAll(PDO::FETCH_ASSOC);$hasMore=count($rows)>30;
  $students=[];foreach(array_slice($rows,0,30)as $row)$students[]=academy_v50_profile_row($pdo,$row);
  academy_json(['ok'=>true,'students'=>$students,'offset'=>$offset,'nextOffset'=>$hasMore?$offset+30:null]);
 }
 if($route==='/v50/admin/student'&&$method==='GET'){
  $id=academy_v50_uuid($_GET['id']??'');$target=academy_v50_student($pdo,$id);$profile=academy_v50_profile_row($pdo,$target);
  $audit=academy_read_node('v50PointsAuditV1/'.$id);$rows=is_array($audit)?array_values(array_filter($audit,'is_array')):[];
  usort($rows,static fn($a,$b)=>((int)($b['createdAt']??0))<=>((int)($a['createdAt']??0)));
  $profileAudit=academy_read_node('v50ProfileAuditV1/'.$id);$profileChanges=is_array($profileAudit)?array_values(array_filter($profileAudit,'is_array')):[];
  usort($profileChanges,static fn($a,$b)=>((int)($b['createdAt']??0))<=>((int)($a['createdAt']??0)));
  academy_json(['ok'=>true,'student'=>$profile,'adjustments'=>array_slice($rows,0,30),'profileChanges'=>array_slice($profileChanges,0,12)]);
 }
 if($route==='/v50/admin/profile'&&$method==='POST'){
  academy_rate_limit('v50-edit-'.$uid,90,3600);$b=academy_body();$id=academy_v50_uuid($b['id']??'');$name=trim((string)($b['name']??''));$scope=academy_v50_scope($b);
  if(mb_strlen($name)<2||mb_strlen($name)>100)academy_json(['ok'=>false,'error'=>'invalid_student_name'],422);
  $path='studentProfilesV3/'.$id;$lock=academy_acquire_data_locks($pdo,[$path,'phoneDirectoryV4/students/'.$id,'v50ProfileAuditV1/'.$id]);
  try{$pdo->beginTransaction();try{
   $target=academy_v50_student($pdo,$id,true);$old=academy_read_node($path);if(!is_array($old))$old=[];
   $before=['name'=>(string)($old['name']??$target['display_name']),'educationType'=>(string)($old['educationType']??''),'stage'=>(string)($old['stage']??''),'grade'=>(string)($old['grade']??'')];
   $next=['name'=>$name]+$scope;$changed=$next!==$before;
   if($changed){$pdo->prepare('UPDATE academy_users SET display_name=? WHERE id=?')->execute([$name,$id]);
    foreach($next as $field=>$value){$node=$path.'/'.$field;academy_delete_node_raw($pdo,$node);academy_insert_value_raw($pdo,$node,$value,$uid);}
    $directory=academy_read_node('phoneDirectoryV4/students/'.$id);if(is_array($directory)){$node='phoneDirectoryV4/students/'.$id.'/name';academy_delete_node_raw($pdo,$node);academy_insert_value_raw($pdo,$node,$name,$uid);}
    $op=academy_uuid();academy_insert_value_raw($pdo,'v50ProfileAuditV1/'.$id.'/'.$op,['id'=>$op,'before'=>$before,'after'=>$next,'adminId'=>$uid,'createdAt'=>academy_now_ms()],$uid);
    academy_audit($uid,'v50.student.profile_update',$id,['before'=>$before,'after'=>$next]);}
   $pdo->commit();academy_json(['ok'=>true,'changed'=>$changed,'student'=>academy_v50_profile_row($pdo,array_merge($target,['display_name'=>$name]))]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$lock);}
 }
 if($route==='/v50/admin/password-reset'&&$method==='POST'){
  academy_rate_limit('v50-password-reset-'.$uid,18,3600);$b=academy_body();$id=academy_v50_uuid($b['id']??'');
  $reason=trim((string)($b['reason']??''));if(($b['identityVerified']??false)!==true||mb_strlen($reason)<12||mb_strlen($reason)>350)academy_json(['ok'=>false,'error'=>'identity_verification_required'],422);
  $password='EgT-'.rtrim(strtr(base64_encode(random_bytes(18)),'+/','-_'),'=');$hash=password_hash($password,PASSWORD_DEFAULT);
  $path='v50PasswordForceV1/'.$id;$locks=academy_acquire_data_locks($pdo,[$path]);
  try{$pdo->beginTransaction();try{
   academy_v50_student($pdo,$id,true);
   $pdo->prepare('UPDATE academy_users SET password_hash=? WHERE id=?')->execute([$hash,$id]);
   $pdo->prepare('UPDATE academy_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL')->execute([$id]);
   $pdo->prepare('UPDATE academy_password_resets SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL')->execute([$id]);
   academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,['createdAt'=>academy_now_ms(),'createdBy'=>$uid],$uid);
   academy_audit($uid,'v50.student.password_reset',$id,['reason'=>$reason,'sessionsRevoked'=>true]);
   $pdo->commit();academy_json(['ok'=>true,'temporaryPassword'=>$password,'mustChangePassword'=>true]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
 }
 if($route==='/v50/admin/points'&&$method==='POST'){
  academy_rate_limit('v50-points-'.$uid,80,3600);$b=academy_body();$id=academy_v50_uuid($b['id']??'');$operation=academy_v50_uuid($b['operationId']??'');
  $delta=filter_var($b['delta']??null,FILTER_VALIDATE_INT);$reason=trim((string)($b['reason']??''));
  if($delta===false||$delta===0||abs($delta)>10000||mb_strlen($reason)<12||mb_strlen($reason)>350)academy_json(['ok'=>false,'error'=>'invalid_points_adjustment'],422);
  $locks=academy_acquire_data_locks($pdo,['v50PointsAuditV1/'.$id]);
  try{$pdo->beginTransaction();try{
   $target=academy_v50_student($pdo,$id,true);$p=academy_read_node('studentProfilesV3/'.$id);if(!is_array($p))academy_json(['ok'=>false,'error'=>'student_profile_missing'],422);
   $scope=academy_v50_scope(['educationType'=>$p['educationType']??'','stage'=>$p['stage']??'','grade'=>$p['grade']??'']);
   $stmt=$pdo->prepare("SELECT id,student_id,points FROM m1_points_ledger WHERE id=? OR (student_id=? AND source_type='admin_adjustment' AND source_id=?) LIMIT 1");$stmt->execute([$operation,$id,$operation]);$existing=$stmt->fetch(PDO::FETCH_ASSOC);
   if($existing){$pdo->commit();if($existing['student_id']!==$id||(int)$existing['points']!==$delta)academy_json(['ok'=>false,'error'=>'operation_conflict'],409);academy_json(['ok'=>true,'alreadyApplied'=>true]);}
   $stmt=$pdo->prepare('SELECT COALESCE(SUM(points),0) FROM m1_points_ledger WHERE student_id=?');$stmt->execute([$id]);$before=(int)$stmt->fetchColumn();$balance=academy_v50_new_balance($before,$delta);
   $stmt=$pdo->prepare("INSERT INTO m1_points_ledger(id,student_id,source_type,source_id,education_type,stage,grade,subject,points) VALUES(?,?, 'admin_adjustment', ?,?,?,?,'general',?)");
   $stmt->execute([$operation,$id,$operation,$scope['educationType'],$scope['stage'],(int)$scope['grade'],$delta]);
   $audit=['id'=>$operation,'studentId'=>$id,'delta'=>$delta,'before'=>$before,'after'=>$balance,'reason'=>$reason,'adminId'=>$uid,'createdAt'=>academy_now_ms()];
   academy_insert_value_raw($pdo,'v50PointsAuditV1/'.$id.'/'.$operation,$audit,$uid);
   academy_audit($uid,'v50.student.points_adjustment',$id,['operationId'=>$operation,'delta'=>$delta,'reason'=>$reason]);
   $pdo->commit();academy_json(['ok'=>true,'balance'=>$balance,'adjustment'=>$audit]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
