<?php
/** M5: Calendar, approved live sessions and teacher-verified attendance. All times UTC. */
declare(strict_types=1);
function academy_m5_fail(string $error,int $status=422): never {academy_json(['ok'=>false,'error'=>$error],$status);}
function academy_m5_uuid(mixed $v): string {$s=(string)$v;if(!academy_m1_uuid($s))academy_m5_fail('invalid_id');return $s;}
function academy_m5_student_scope(string $uid): array {
 $p=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($p))academy_m5_fail('student_profile_required',403);
 return academy_m1_scope(['type'=>$p['educationType']??'','stage'=>$p['stage']??'','grade'=>$p['grade']??0]);
}
function academy_m5_scope_match(array $r,array $scope): bool {
 return $r['education_type']===$scope['type']&&$r['stage']===$scope['stage']&&(int)$r['grade']===$scope['grade'];
}
function academy_m5_session(PDO $pdo,string $id): array {
 $q=$pdo->prepare('SELECT * FROM m5_sessions WHERE id=?');$q->execute([$id]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r)academy_m5_fail('session_not_found',404);return $r;
}
function academy_m5_can_manage(array $u,array $s): bool {
 return $u['primary_role']==='admin'||($u['primary_role']==='teacher'&&$s['teacher_id']===$u['id']&&academy_teacher_is_active_profile($u['id']));
}
/** Provider is descriptive; any other public HTTPS host remains supported. */
function academy_m5_provider(string $link): string {
 $host=strtolower((string)(parse_url($link,PHP_URL_HOST)??''));
 if($host==='zoom.us'||str_ends_with($host,'.zoom.us')||$host==='zoom.com'||str_ends_with($host,'.zoom.com'))return 'zoom';
 if($host==='meet.google.com')return 'meet';
 if($host==='teams.microsoft.com'||str_ends_with($host,'.teams.microsoft.com')||$host==='teams.live.com')return 'teams';
 if(in_array($host,['youtube.com','www.youtube.com','youtu.be','www.youtube-nocookie.com'],true))return 'youtube';
 return 'external';
}
function academy_m5_url(mixed $input): string {
 $str=trim((string)$input);
 // DB column m5_sessions.meeting_url is VARCHAR(700) in the supplied schema.
 if($str===''||strlen($str)>700)academy_m5_fail('meeting_link_required_or_too_long');
 if(preg_match('/[\x00-\x20\x7f]/',$str)||!filter_var($str,FILTER_VALIDATE_URL))academy_m5_fail('invalid_meeting_url');
 $parts=parse_url($str);$host=strtolower((string)($parts['host']??''));
 if(!is_array($parts)||strtolower((string)($parts['scheme']??''))!=='https'||$host===''||isset($parts['user'])||isset($parts['pass']))academy_m5_fail('https_meeting_link_required');
 if(filter_var($host,FILTER_VALIDATE_IP)||$host==='localhost'||str_ends_with($host,'.localhost')||str_ends_with($host,'.local')||!str_contains($host,'.'))academy_m5_fail('external_meeting_host_required');
 // URL fragments and query parameters are legitimate for Teams/Zoom invitations.
 return $str;
}
/** M5 DATETIME columns are stored in UTC; PHP server timezone must not affect checks. */
function academy_m5_utc_timestamp(string $datetime): int {
 if(!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D',$datetime))academy_m5_fail('invalid_session_time');
 $utc=new DateTimeZone('UTC');
 $parsed=DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$datetime,$utc);
 if(!$parsed||$parsed->format('Y-m-d H:i:s')!==$datetime)academy_m5_fail('invalid_session_time');
 return $parsed->getTimestamp();
}
function academy_m5_start_valid(int $start,int $end,int $now): bool {
 // Allow "start now" and sessions that began up to 15 minutes ago.
 return $end>$now&&$start>=$now-900&&$start<=$now+180*86400&&$end>$start&&$end-$start<=6*3600;
}
function academy_m5_join_allowed(int $start,int $end,int $now): bool {
 return $now >= $start-30*60 && $now <= $end+20*60;
}
function academy_m5_public(array $s,bool $staff=false): array {
 $out=['id'=>$s['id'],'title'=>$s['title'],'description'=>$s['description'],'type'=>$s['education_type'],'stage'=>$s['stage'],'grade'=>(int)$s['grade'],'subject'=>$s['subject'],'teacherId'=>$s['teacher_id'],'startsAt'=>$s['starts_at'],'endsAt'=>$s['ends_at'],'status'=>$s['status'],'provider'=>($s['provider']==='external'||empty($s['provider']))?academy_m5_provider((string)$s['meeting_url']):$s['provider']];
 if($staff){$out['meetingUrl']=$s['meeting_url'];$out['creatorId']=$s['creator_id'];}
 return $out;
}
function academy_m5_roster(PDO $pdo,array $s): array {
 // Limit candidate accounts before reading private profiles; never return student email/phone.
 $q=$pdo->query("SELECT id,display_name FROM academy_users WHERE primary_role='student' AND status='active' ORDER BY created_at DESC LIMIT 500");
 $out=[];
 $marks=$pdo->prepare('SELECT first_joined_at,last_joined_at,join_count,attendance_status,teacher_note FROM m5_attendance WHERE session_id=? AND student_id=?');
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $row){
  $p=academy_read_node('studentProfilesV3/'.$row['id']);if(!is_array($p))continue;
  $stage=(string)($p['stage']??'');$type=(string)($p['educationType']??'');$grade=(int)($p['grade']??0);
  if(!in_array($type,['public','azhar'],true)||!in_array($stage,['primary','prep','sec'],true)||$grade<1||$grade>($stage==='primary'?6:3))continue;
  $scope=['type'=>$type,'stage'=>$stage,'grade'=>$grade];
  if(!academy_m5_scope_match($s,$scope))continue;
  $marks->execute([$s['id'],$row['id']]);$a=$marks->fetch(PDO::FETCH_ASSOC)?:[];
  $out[]=['id'=>$row['id'],'name'=>(string)($p['name']??$row['display_name']),'status'=>$a['attendance_status']??'unmarked','joinedAt'=>$a['first_joined_at']??null,'lastJoinedAt'=>$a['last_joined_at']??null,'joinCount'=>(int)($a['join_count']??0),'note'=>$a['teacher_note']??''];
  if(count($out)>=250)break;
 }
 return $out;
}
function academy_m5_range(mixed $a,mixed $b): array {
 $from=is_string($a)&&preg_match('/^\d{4}-\d{2}-\d{2}$/D',$a)?$a:gmdate('Y-m-d',strtotime('-7 days'));
 $to=is_string($b)&&preg_match('/^\d{4}-\d{2}-\d{2}$/D',$b)?$b:gmdate('Y-m-d',strtotime('+45 days'));
 if(!checkdate((int)substr($from,5,2),(int)substr($from,8,2),(int)substr($from,0,4))||!checkdate((int)substr($to,5,2),(int)substr($to,8,2),(int)substr($to,0,4))||$to<$from||strtotime($to)-strtotime($from)>120*86400)academy_m5_fail('invalid_calendar_range');
 return [$from.' 00:00:00',$to.' 23:59:59'];
}
function academy_m5_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m5/'))return;
 $u=academy_current_user(true);$role=$u['primary_role'];$uid=$u['id'];$b=$method==='GET'?[]:academy_body();
 if($route==='/m5/calendar'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher','student','parent']);[$from,$to]=academy_m5_range($_GET['from']??null,$_GET['to']??null);
  $childId='';$scope=null;
  if($role==='student')$scope=academy_m5_student_scope($uid);
  elseif($role==='parent'){
   $childId=trim((string)($_GET['childId']??''));if($childId!==''){academy_m5_uuid($childId);if(!academy_parent_can_access_student($uid,$childId))academy_m5_fail('child_not_linked',403);$scope=academy_m5_student_scope($childId);}
  }
  $where=['ends_at >= ?','starts_at <= ?'];$args=[$from,$to];
  if($scope){$where[]='education_type=?';$where[]='stage=?';$where[]='grade=?';array_push($args,$scope['type'],$scope['stage'],$scope['grade']);}
  if(in_array($role,['student','parent'],true)){$where[]="status='published'";}
  elseif($role==='teacher'){$where[]='teacher_id=?';$args[]=$uid;}
  if($role==='parent'&&$childId==='')academy_json(['ok'=>true,'sessions'=>[],'events'=>[],'childRequired'=>true]);
  $q=$pdo->prepare('SELECT * FROM m5_sessions WHERE '.implode(' AND ',$where).' ORDER BY starts_at ASC LIMIT 180');$q->execute($args);$sessions=array_map(static fn($s)=>academy_m5_public($s,in_array($role,['admin','teacher'],true)),$q->fetchAll(PDO::FETCH_ASSOC));
  $events=[];
  if($role==='student'||$role==='parent'){
   // Only public events for the requested student's exact grade and type.
   $q=$pdo->prepare("SELECT id,title,subject,starts_at,ends_at FROM m1_challenges WHERE status='published' AND education_type=? AND stage=? AND grade=? AND ends_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 120");$q->execute([$scope['type'],$scope['stage'],$scope['grade'],$from,$to]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $v)$events[]=['kind'=>'challenge','id'=>$v['id'],'title'=>$v['title'],'subject'=>$v['subject'],'startsAt'=>$v['starts_at'],'endsAt'=>$v['ends_at']];
   $q=$pdo->prepare("SELECT id,title,subject,starts_at,ends_at FROM m4_tournaments WHERE status='published' AND education_type=? AND stage=? AND grade=? AND ends_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 120");$q->execute([$scope['type'],$scope['stage'],$scope['grade'],$from,$to]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $v)$events[]=['kind'=>'tournament','id'=>$v['id'],'title'=>$v['title'],'subject'=>$v['subject'],'startsAt'=>$v['starts_at'],'endsAt'=>$v['ends_at']];
  }
  // Include approved assignment deadlines. School/group visibility is checked for students and linked parents.
  $rawAssignments=academy_read_node('assignments');
  if(is_array($rawAssignments)){
   $profile=null;
   if($role==='student'||$role==='parent')$profile=academy_read_node('studentProfilesV3/'.($role==='student'?$uid:$childId));
   $count=0;
   foreach($rawAssignments as $aid=>$a){
    if(!is_array($a)||($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
    $dueMs=(int)($a['dueAt']??0);if($dueMs<1)continue;$date=gmdate('Y-m-d H:i:s',(int)floor($dueMs/1000));if($date<$from||$date>$to)continue;
    if($role==='teacher'&&($a['teacherId']??'')!==$uid)continue;
    if($scope){
     if(($a['type']??'')!==$scope['type']||($a['stage']??'')!==$scope['stage']||(int)($a['grade']??0)!==$scope['grade'])continue;
     if(($a['targetMode']??'stage')==='group'&&!academy_v534_assignment_group_allowed(
       $a,is_array($profile)?$profile:[],$role==='student'?$uid:$childId))continue;
    }
    $events[]=['kind'=>'assignment','id'=>(string)$aid,'title'=>(string)($a['title']??'واجب'),'subject'=>(string)($a['subject']??''),'startsAt'=>$date,'endsAt'=>$date];if(++$count>=100)break;
   }
  }
  // Calendar events are filtered per class for families, and by ownership for teachers.
  if($role==='admin'||$role==='teacher'){
   $where="status='published' AND ends_at>=? AND starts_at<=?";$args=[$from,$to];if($role==='teacher'){$where.=' AND creator_id=?';$args[]=$uid;}
   foreach([['m1_challenges','challenge'],['m4_tournaments','tournament']] as $spec){
    $q=$pdo->prepare('SELECT id,title,subject,starts_at,ends_at FROM '.$spec[0].' WHERE '.$where.' ORDER BY starts_at LIMIT 100');$q->execute($args);
    foreach($q->fetchAll(PDO::FETCH_ASSOC)as $v)$events[]=['kind'=>$spec[1],'id'=>$v['id'],'title'=>$v['title'],'subject'=>$v['subject'],'startsAt'=>$v['starts_at'],'endsAt'=>$v['ends_at']];
   }
  }
  academy_json(['ok'=>true,'sessions'=>$sessions,'events'=>$events]);
 }
 if($route==='/m5/sessions/create'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);$scope=academy_m1_scope($b);$title=trim((string)($b['title']??''));$desc=trim((string)($b['description']??''));$subject=trim((string)($b['subject']??''));$link=academy_m5_url($b['meetingUrl']??'');$start=academy_m1_date($b['startsAt']??null);$end=academy_m1_date($b['endsAt']??null);
  $teacherId=$role==='admin'?academy_m5_uuid($b['teacherId']??$uid):$uid;
  if(mb_strlen($title)<4||mb_strlen($title)>160||mb_strlen($desc)>1000||!preg_match('/^[A-Za-z0-9_-]{2,80}$/D',$subject)||!academy_m5_start_valid(academy_m5_utc_timestamp($start),academy_m5_utc_timestamp($end),time()))academy_m5_fail('invalid_session');
  $t=$pdo->prepare("SELECT primary_role,status FROM academy_users WHERE id=?");$t->execute([$teacherId]);$teacher=$t->fetch(PDO::FETCH_ASSOC);
  if(!$teacher||$teacher['primary_role']!=='teacher'||$teacher['status']!=='active'||!academy_teacher_is_active_profile($teacherId)||!academy_teacher_scope_allowed($teacherId,['type'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>(string)$scope['grade'],'subject'=>$subject]))academy_m5_fail('teacher_scope_or_permission',403);
  if($role==='teacher'){if(empty(academy_teacher_permissions($uid)['createLiveSessions']))academy_m5_fail('permission_denied',403);$published=!empty(academy_teacher_permissions($uid)['publishLiveSessions']);}else{$published=true;}
  $id=academy_uuid();$status=$published?'published':'pending';$provider=academy_m5_provider($link);$pdo->prepare('INSERT INTO m5_sessions(id,title,description,education_type,stage,grade,subject,teacher_id,creator_id,meeting_url,provider,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id,$title,$desc,$scope['type'],$scope['stage'],$scope['grade'],$subject,$teacherId,$uid,$link,$provider,$start,$end,$status]);academy_audit($uid,'m5.session.create',$id,['status'=>$status]);academy_json(['ok'=>true,'id'=>$id,'status'=>$status],201);
 }
 if($route==='/m5/sessions/reschedule'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);
  $id=academy_m5_uuid($b['id']??'');$s=academy_m5_session($pdo,$id);
  if(!academy_m5_can_manage($u,$s))academy_m5_fail('forbidden',403);
  if($s['status']!=='pending')academy_m5_fail('reschedule_pending_only',409);
  $start=academy_m1_date($b['startsAt']??null);$end=academy_m1_date($b['endsAt']??null);
  if(!academy_m5_start_valid(academy_m5_utc_timestamp($start),academy_m5_utc_timestamp($end),time()))academy_m5_fail('invalid_session_time',422);
  if($s['starts_at']===$start&&$s['ends_at']===$end)academy_json(['ok'=>true,'status'=>'pending','startsAt'=>$start,'endsAt'=>$end]);
  $q=$pdo->prepare("UPDATE m5_sessions SET starts_at=?,ends_at=? WHERE id=? AND status='pending'");
  $q->execute([$start,$end,$id]);
  if($q->rowCount()!==1)academy_m5_fail('invalid_transition',409);
  academy_audit($uid,'m5.session.reschedule',$id,['startsAt'=>$start,'endsAt'=>$end]);
  academy_json(['ok'=>true,'status'=>'pending','startsAt'=>$start,'endsAt'=>$end]);
 }
 if($route==='/m5/sessions/decision'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=academy_m5_uuid($b['id']??'');$decision=(string)($b['decision']??'');if(!in_array($decision,['approve','reject','cancel'],true))academy_m5_fail('invalid_decision');$s=academy_m5_session($pdo,$id);
  if($decision==='approve'&&academy_m5_utc_timestamp((string)$s['ends_at'])<=time())academy_m5_fail('session_already_ended',409);
  $from=$decision==='cancel'?'published':'pending';$to=['approve'=>'published','reject'=>'rejected','cancel'=>'cancelled'][$decision];$q=$pdo->prepare('UPDATE m5_sessions SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status=?');$q->execute([$to,$uid,$id,$from]);if($q->rowCount()!==1)academy_m5_fail('invalid_transition',409);academy_audit($uid,'m5.session.'.$to,$id);academy_json(['ok'=>true,'status'=>$to]);
 }
 if($route==='/m5/sessions/join'&&$method==='POST'){
  academy_m1_guard_role($u,['student']);academy_rate_limit('m5-join-'.$uid,30,3600);$id=academy_m5_uuid($b['id']??'');$s=academy_m5_session($pdo,$id);
  if($s['status']!=='published'||!academy_m5_scope_match($s,academy_m5_student_scope($uid)))academy_m5_fail('session_not_available',403);
  $now=time();if(!academy_m5_join_allowed(academy_m5_utc_timestamp((string)$s['starts_at']),academy_m5_utc_timestamp((string)$s['ends_at']),$now))academy_m5_fail('join_window_closed',403);
  $pdo->prepare("INSERT INTO m5_attendance(session_id,student_id,first_joined_at,last_joined_at,join_count) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),1) ON DUPLICATE KEY UPDATE last_joined_at=UTC_TIMESTAMP(),join_count=LEAST(join_count+1,65535)")->execute([$id,$uid]);academy_json(['ok'=>true,'meetingUrl'=>$s['meeting_url'],'notice'=>'join_recorded_not_attendance_confirmed']);
 }
 if($route==='/m5/sessions/roster'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher']);$id=academy_m5_uuid($_GET['id']??'');$s=academy_m5_session($pdo,$id);if(!academy_m5_can_manage($u,$s))academy_m5_fail('forbidden',403);
  academy_json(['ok'=>true,'session'=>academy_m5_public($s,true),'students'=>academy_m5_roster($pdo,$s)]);
 }
 if($route==='/m5/sessions/attendance'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);$id=academy_m5_uuid($b['id']??'');$sid=academy_m5_uuid($b['studentId']??'');$status=(string)($b['status']??'');$note=trim((string)($b['note']??''));
  if(!in_array($status,['present','absent','excused','unmarked'],true)||mb_strlen($note)>300)academy_m5_fail('invalid_attendance');$s=academy_m5_session($pdo,$id);if(!academy_m5_can_manage($u,$s))academy_m5_fail('forbidden',403);
  $q=$pdo->prepare('SELECT primary_role,status FROM academy_users WHERE id=?');$q->execute([$sid]);$student=$q->fetch(PDO::FETCH_ASSOC);if(!$student||$student['primary_role']!=='student'||$student['status']!=='active'||!academy_m5_scope_match($s,academy_m5_student_scope($sid)))academy_m5_fail('invalid_student_scope',403);
  $pdo->prepare('INSERT INTO m5_attendance(session_id,student_id,attendance_status,marked_by,marked_at,teacher_note) VALUES(?,?,?, ?,UTC_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE attendance_status=VALUES(attendance_status),marked_by=VALUES(marked_by),marked_at=UTC_TIMESTAMP(),teacher_note=VALUES(teacher_note)')->execute([$id,$sid,$status,$uid,$note]);academy_audit($uid,'m5.attendance.mark',$id,['studentId'=>$sid,'status'=>$status]);academy_json(['ok'=>true]);
 }
 if($route==='/m5/attendance/mine'&&$method==='GET'){
  academy_m1_guard_role($u,['student','parent']);$studentId=$role==='student'?$uid:academy_m5_uuid($_GET['childId']??'');if($role==='parent'&&!academy_parent_can_access_student($uid,$studentId))academy_m5_fail('child_not_linked',403);
  $scope=academy_m5_student_scope($studentId);$q=$pdo->prepare("SELECT s.id,s.title,s.subject,s.starts_at,s.ends_at,a.attendance_status,a.first_joined_at FROM m5_sessions s LEFT JOIN m5_attendance a ON a.session_id=s.id AND a.student_id=? WHERE s.status='published' AND s.education_type=? AND s.stage=? AND s.grade=? AND s.starts_at<=UTC_TIMESTAMP() ORDER BY s.starts_at DESC LIMIT 60");$q->execute([$studentId,$scope['type'],$scope['stage'],$scope['grade']]);academy_json(['ok'=>true,'rows'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
 }
 academy_m5_fail('not_found',404);
}
