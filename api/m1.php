<?php
/** M1: competitions foundation. Explicit per-route authorization; no direct client DB writes. */
declare(strict_types=1);

function academy_m1_guard_role(array $u,array $allowed): void {
 if(!in_array((string)$u['primary_role'],$allowed,true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
}
function academy_m1_uuid(string $id): bool {return (bool)preg_match('/^[a-f0-9-]{36}$/iD',$id);}
function academy_m1_scope(array $input): array {
 $type=(string)($input['educationType']??$input['type']??'');$stage=(string)($input['stage']??'');$grade=(int)($input['grade']??0);
 if(!in_array($type,['public','azhar'],true)||!in_array($stage,['primary','prep','sec'],true)||$grade<1||$grade>($stage==='primary'?6:3))academy_json(['ok'=>false,'error'=>'invalid_scope'],422);
 return ['type'=>$type,'stage'=>$stage,'grade'=>$grade];
}
function academy_m1_questions(mixed $raw): array {
 if(!is_array($raw)||!array_is_list($raw)||count($raw)<1||count($raw)>60)academy_json(['ok'=>false,'error'=>'questions_required'],422);
 $out=[];
 foreach($raw as $q){
  if(!is_array($q))academy_json(['ok'=>false,'error'=>'invalid_questions'],422);
  $title=trim((string)($q['question']??''));$opts=$q['options']??null;$ans=$q['correctAnswer']??null;
  if(mb_strlen($title)<5||mb_strlen($title)>600||!is_array($opts)||!array_is_list($opts)||count($opts)<2||count($opts)>6||!is_int($ans)||$ans<0||$ans>=count($opts))academy_json(['ok'=>false,'error'=>'invalid_questions'],422);
  $clean=[];foreach($opts as $option){if(!is_string($option)||mb_strlen(trim($option))<1||mb_strlen($option)>300)academy_json(['ok'=>false,'error'=>'invalid_questions'],422);$clean[]=trim($option);}
  $out[]=['question'=>$title,'options'=>$clean,'correctAnswer'=>$ans];
 }
 return $out;
}
function academy_m1_date(mixed $raw): string {
 if(!is_string($raw)||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/D',$raw))academy_json(['ok'=>false,'error'=>'invalid_date'],422);
 try{$date=new DateTimeImmutable($raw);}catch(Throwable $e){academy_json(['ok'=>false,'error'=>'invalid_date'],422);}
 return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
function academy_m1_fetch(PDO $pdo,string $id): ?array {
 $q=$pdo->prepare('SELECT * FROM m1_challenges WHERE id=?');$q->execute([$id]);$r=$q->fetch(PDO::FETCH_ASSOC);return $r?:null;
}
function academy_m1_public_challenge(array $c,bool $includeQuestions=false): array {
 $r=['id'=>$c['id'],'title'=>$c['title'],'description'=>$c['description'],'creatorId'=>$c['creator_id'],'type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(int)$c['grade'],'subject'=>$c['subject'],'durationMinutes'=>(int)$c['duration_minutes'],'startsAt'=>$c['starts_at'],'endsAt'=>$c['ends_at'],'maxPoints'=>(int)$c['max_points'],'status'=>$c['status'],'isTraining'=>(bool)$c['is_training'],'createdAt'=>$c['created_at'],'questionCount'=>count(json_decode($c['questions_json'],true)?:[]),'maxAttempts'=>(int)($c['v48_max_attempts']??1),'revealPolicy'=>$c['v48_reveal_policy']??'instant','scorePolicy'=>$c['v48_score_policy']??'best'];
 if($includeQuestions){$raw=json_decode($c['questions_json'],true)?:[];$r['questions']=array_map(static fn($q)=>['question'=>$q['question'],'options'=>$q['options']],$raw);}
 return $r;
}
function academy_m1_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m1/'))return;
 $user=academy_current_user(true);$role=$user['primary_role'];$b=$method==='GET'?[]:academy_body();$uid=$user['id'];
 if($route==='/m1/virtual'&&$method==='GET'){
  academy_m1_guard_role($user,['admin']);$records=$pdo->query('SELECT * FROM m1_virtual_students ORDER BY created_at DESC LIMIT 300')->fetchAll(PDO::FETCH_ASSOC);academy_json(['ok'=>true,'items'=>$records]);
 }
 if($route==='/m1/virtual/bulk'&&$method==='POST'){
  academy_m1_guard_role($user,['admin']);academy_rate_limit('m1-virtual-bulk-'.$uid,10,3600);
  $scope=academy_m1_scope($b);$names=preg_split('/\r?\n/',(string)($b['names']??''));$names=array_values(array_filter(array_map('trim',$names),static fn($n)=>$n!==''));$points=(int)($b['points']??0);
  if(count($names)<1||count($names)>30||$points<0||$points>1000000)academy_json(['ok'=>false,'error'=>'invalid_bulk'],422);
  foreach($names as$name)if(mb_strlen($name)<2||mb_strlen($name)>100)academy_json(['ok'=>false,'error'=>'invalid_virtual_student'],422);
  $insert=$pdo->prepare('INSERT INTO m1_virtual_students(id,display_name,education_type,stage,grade,simulated_points,created_by) VALUES(?,?,?,?,?,?,?)');$pdo->beginTransaction();try{foreach($names as$name)$insert->execute([academy_uuid(),$name,$scope['type'],$scope['stage'],$scope['grade'],$points,$uid]);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
  academy_audit($uid,'m1.virtual.bulk',null,['count'=>count($names)]);academy_json(['ok'=>true,'count'=>count($names)]);
 }
 if($route==='/m1/virtual/create'&&$method==='POST'){
  academy_m1_guard_role($user,['admin']);$s=academy_m1_scope($b);$name=trim((string)($b['name']??''));$url=trim((string)($b['avatarUrl']??''));$level=(string)($b['level']??'intermediate');$points=(int)($b['points']??0);
  if(mb_strlen($name)<2||mb_strlen($name)>100||!in_array($level,['beginner','intermediate','advanced'],true)||$points<0||$points>1000000||strlen($url)>500||($url!==''&&(!filter_var($url,FILTER_VALIDATE_URL)||!str_starts_with($url,'https://'))))academy_json(['ok'=>false,'error'=>'invalid_virtual_student'],422);
  $id=academy_uuid();$pdo->prepare('INSERT INTO m1_virtual_students(id,display_name,avatar_url,education_type,stage,grade,skill_level,simulated_points,created_by) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$id,$name,$url?:null,$s['type'],$s['stage'],$s['grade'],$level,$points,$uid]);academy_audit($uid,'m1.virtual.create',$id);academy_json(['ok'=>true,'id'=>$id],201);
 }
 if($route==='/m1/virtual/update'&&$method==='POST'){
  academy_m1_guard_role($user,['admin']);$id=(string)($b['id']??'');if(!academy_m1_uuid($id))academy_json(['ok'=>false,'error'=>'invalid_id'],422);
  $q=$pdo->prepare('SELECT id FROM m1_virtual_students WHERE id=?');$q->execute([$id]);if(!$q->fetchColumn())academy_json(['ok'=>false,'error'=>'not_found'],404);
  $active=($b['active']??true)===true;$points=(int)($b['points']??0);$name=trim((string)($b['name']??''));if($points<0||$points>1000000||($name!==''&&(mb_strlen($name)<2||mb_strlen($name)>100)))academy_json(['ok'=>false,'error'=>'invalid_virtual_student'],422);
  if($name!=='')$pdo->prepare('UPDATE m1_virtual_students SET display_name=?,is_active=?,simulated_points=? WHERE id=?')->execute([$name,(int)$active,$points,$id]);
  else $pdo->prepare('UPDATE m1_virtual_students SET is_active=?,simulated_points=? WHERE id=?')->execute([(int)$active,$points,$id]);
  academy_audit($uid,'m1.virtual.update',$id,['active'=>$active]);academy_json(['ok'=>true]);
 }
 if($route==='/m1/challenges'&&$method==='GET'){
  $sql='SELECT c.*,v.max_attempts AS v48_max_attempts,v.reveal_policy AS v48_reveal_policy,v.score_policy AS v48_score_policy,v.results_released_at AS v48_released_at FROM m1_challenges c LEFT JOIN v48_challenge_rules v ON v.challenge_id=c.id';$args=[];
  if($role==='teacher'){$sql.=' WHERE c.creator_id=?';$args[]=$uid;}
  elseif($role==='student'){$profile=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($profile))academy_json(['ok'=>true,'items'=>[]]);$scope=academy_m1_scope(['type'=>$profile['educationType']??'', 'stage'=>$profile['stage']??'', 'grade'=>$profile['grade']??0]);$sql.=" WHERE c.status IN ('published','closed') AND c.education_type=? AND c.stage=? AND c.grade=?";$args=[$scope['type'],$scope['stage'],$scope['grade']];}
  elseif($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
  $sql.=' ORDER BY c.created_at DESC LIMIT 200';$stmt=$pdo->prepare($sql);$stmt->execute($args);$data=$stmt->fetchAll(PDO::FETCH_ASSOC);
  $items=[];foreach($data as $c){if($c['v48_reveal_policy']==='after_end'&&empty($c['v48_released_at'])&&$c['ends_at']<=gmdate('Y-m-d H:i:s'))academy_v48_release_due($pdo,$c);$safe=academy_m1_public_challenge($c);if($role!=='student'&&($role==='admin'||$c['creator_id']===$uid))$safe['questions']=json_decode($c['questions_json'],true)?:[];$items[]=$safe;}
  academy_json(['ok'=>true,'items'=>$items]);
 }
 if($route==='/m1/challenges/create'&&$method==='POST'){
  academy_m1_guard_role($user,['admin','teacher']);academy_rate_limit('m1-challenge-create-'.$uid,20,3600);$scope=academy_m1_scope($b);$subject=trim((string)($b['subject']??''));$name=trim((string)($b['title']??''));$desc=trim((string)($b['description']??''));[$questions,$v48Rules]=academy_v48_materialize($pdo,$user,$b,$scope,$subject);$start=academy_m1_date($b['startsAt']??null);$end=academy_m1_date($b['endsAt']??null);$duration=(int)($b['durationMinutes']??20);$points=(int)($b['maxPoints']??100);$isTraining=($b['isTraining']??true)!==false;
  if(mb_strlen($name)<5||mb_strlen($name)>180||mb_strlen($desc)>1500||!preg_match('/^[a-zA-Z0-9_-]{2,80}$/D',$subject)||$end<=$start||$duration<1||$duration>180||$points<0||$points>1000)academy_json(['ok'=>false,'error'=>'invalid_challenge'],422);
  if(strtotime($end)<time()-60)academy_json(['ok'=>false,'error'=>'invalid_period'],422);
  if($role==='teacher'){
   $perms=academy_teacher_permissions($uid);
   if(!academy_teacher_is_active_profile($uid)||empty($perms['createChallenges'])||!academy_teacher_scope_allowed($uid,['type'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>(string)$scope['grade'],'subject'=>$subject]))academy_json(['ok'=>false,'error'=>'scope_not_assigned'],403);
   $status=(!$isTraining||empty($perms['publishChallenges']))?'pending':'published';
  }else $status='published';
  $id=academy_uuid();$pdo->beginTransaction();try{$stmt=$pdo->prepare('INSERT INTO m1_challenges(id,creator_id,creator_role,title,description,education_type,stage,grade,subject,questions_json,duration_minutes,starts_at,ends_at,max_points,status,is_training) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');$stmt->execute([$id,$uid,$role,$name,$desc,$scope['type'],$scope['stage'],$scope['grade'],$subject,json_encode($questions,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$duration,$start,$end,$points,$status,$isTraining?1:0]);academy_v48_setup_rules($pdo,$id,$v48Rules);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}academy_audit($uid,'m1.challenge.create',$id,['status'=>$status]);academy_json(['ok'=>true,'id'=>$id,'status'=>$status],201);
 }
 if($route==='/m1/challenges/decision'&&$method==='POST'){
  academy_m1_guard_role($user,['admin']);$id=(string)($b['id']??'');$decision=(string)($b['decision']??'');if(!academy_m1_uuid($id)||!in_array($decision,['approve','reject','close'],true))academy_json(['ok'=>false,'error'=>'invalid_decision'],422);
  $row=academy_m1_fetch($pdo,$id);if(!$row)academy_json(['ok'=>false,'error'=>'not_found'],404);
  if($decision==='close'){$valid=$row['status']==='published';$to='closed';}
  else{$valid=$row['status']==='pending';$to=$decision==='approve'?'published':'rejected';}
  // A challenge approved after its start would unfairly shorten or invalidate the available window.
  if($decision==='approve'&&$valid&&$row['starts_at']<=gmdate('Y-m-d H:i:s'))academy_json(['ok'=>false,'error'=>'approval_after_start_forbidden'],409);
  if(!$valid)academy_json(['ok'=>false,'error'=>'invalid_transition'],409);
  $st=$pdo->prepare('UPDATE m1_challenges SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status=?');$st->execute([$to,$uid,$id,$row['status']]);if($st->rowCount()!==1)academy_json(['ok'=>false,'error'=>'conflict'],409);
  academy_audit($uid,'m1.challenge.'.$to,$id);academy_json(['ok'=>true,'status'=>$to]);
 }
 if($route==='/m1/challenges/open'&&$method==='POST'){
  academy_m1_guard_role($user,['student']);$id=trim((string)($b['id']??''));if(!academy_m1_uuid($id))academy_json(['ok'=>false,'error'=>'invalid_id'],422);$c=academy_m1_fetch($pdo,$id);if(!$c)academy_json(['ok'=>false,'error'=>'not_found'],404);
  $v48r=academy_v48_rule($pdo,$id);if($v48r&&in_array($c['status'],['published','closed'],true))academy_v48_open($pdo,$user,$c);if($c['status']!=='published')academy_json(['ok'=>false,'error'=>'not_found'],404);
  $profile=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($profile)||!academy_scope_matches(['type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(string)$c['grade']],$profile))academy_json(['ok'=>false,'error'=>'forbidden'],403);
  if(gmdate('Y-m-d H:i:s')<$c['starts_at']||gmdate('Y-m-d H:i:s')>$c['ends_at'])academy_json(['ok'=>false,'error'=>'challenge_not_active'],403);
  $existing=$pdo->prepare('SELECT percentage,correct_count,question_count,points_awarded FROM m1_challenge_attempts WHERE challenge_id=? AND student_id=?');$existing->execute([$id,$uid]);$attempt=$existing->fetch(PDO::FETCH_ASSOC);if($attempt)academy_json(['ok'=>true,'challenge'=>academy_m1_public_challenge($c),'attempt'=>$attempt]);
  $pdo->prepare('INSERT IGNORE INTO m1_challenge_sessions(challenge_id,student_id) VALUES(?,?)')->execute([$id,$uid]);
  $started=$pdo->prepare('SELECT opened_at FROM m1_challenge_sessions WHERE challenge_id=? AND student_id=?');$started->execute([$id,$uid]);$opened=$started->fetchColumn();$deadline=min(strtotime($c['ends_at']),strtotime((string)$opened)+((int)$c['duration_minutes']*60));
  if($deadline<=time())academy_json(['ok'=>false,'error'=>'challenge_time_expired'],403);
  $info=academy_m1_public_challenge($c,true);$info['deadlineAt']=gmdate('Y-m-d H:i:s',$deadline);academy_json(['ok'=>true,'challenge'=>$info]);
 }
 if($route==='/m1/challenges/submit'&&$method==='POST'){
  academy_m1_guard_role($user,['student']);$id=trim((string)($b['id']??''));$answers=$b['answers']??null;if(!academy_m1_uuid($id)||!is_array($answers)||!array_is_list($answers))academy_json(['ok'=>false,'error'=>'invalid_answers'],422);
  $v48r=academy_v48_rule($pdo,$id);if($v48r)academy_v48_submit($pdo,$user,$id,$answers,(int)($b['attemptNo']??0));
  $profile=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($profile))academy_json(['ok'=>false,'error'=>'profile_missing'],403);
  $pdo->beginTransaction();try{
   $st=$pdo->prepare('SELECT * FROM m1_challenges WHERE id=? FOR UPDATE');$st->execute([$id]);$c=$st->fetch(PDO::FETCH_ASSOC);if(!$c||$c['status']!=='published'||!academy_scope_matches(['type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(string)$c['grade']],$profile)){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'challenge_unavailable'],403);}
   $existing=$pdo->prepare('SELECT * FROM m1_challenge_attempts WHERE challenge_id=? AND student_id=?');$existing->execute([$id,$uid]);$saved=$existing->fetch(PDO::FETCH_ASSOC);if($saved){$pdo->commit();academy_json(['ok'=>true,'existing'=>true,'result'=>['correct'=>$saved['correct_count'],'total'=>$saved['question_count'],'percentage'=>$saved['percentage'],'points'=>$saved['points_awarded']]]);}
   $now=gmdate('Y-m-d H:i:s');if($now<$c['starts_at']||$now>$c['ends_at']){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'challenge_not_active'],403);}
   $started=$pdo->prepare('SELECT opened_at FROM m1_challenge_sessions WHERE challenge_id=? AND student_id=?');$started->execute([$id,$uid]);$opened=$started->fetchColumn();if(!$opened||time()>strtotime((string)$opened)+(int)$c['duration_minutes']*60){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'challenge_time_expired'],403);}
   $questions=json_decode($c['questions_json'],true);if(!is_array($questions)||count($questions)!==count($answers)){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'invalid_answers'],422);}
   $correct=0;foreach($questions as$i=>$q){if(!is_int($answers[$i])||$answers[$i]<0||$answers[$i]>=count($q['options'])){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'invalid_answers'],422);}if($answers[$i]===$q['correctAnswer'])$correct++;}
   $total=count($questions);$pct=(int)round($correct*100/$total);$points=(int)round((int)$c['max_points']*$correct/$total);$attemptId=academy_uuid();
   $st=$pdo->prepare('INSERT INTO m1_challenge_attempts(id,challenge_id,student_id,answers_json,correct_count,question_count,percentage,points_awarded) VALUES(?,?,?,?,?,?,?,?)');$st->execute([$attemptId,$id,$uid,json_encode($answers),$correct,$total,$pct,$points]);
   $ledger=$pdo->prepare('INSERT INTO m1_points_ledger(id,student_id,source_type,source_id,education_type,stage,grade,subject,points) VALUES(?,?,?,?,?,?,?,?,?)');$ledger->execute([academy_uuid(),$uid,'challenge',$id,$c['education_type'],$c['stage'],$c['grade'],$c['subject'],$points]);$pdo->commit();
   academy_audit($uid,'m1.challenge.submit',$id,['percentage'=>$pct,'points'=>$points]);academy_json(['ok'=>true,'result'=>['correct'=>$correct,'total'=>$total,'percentage'=>$pct,'points'=>$points]]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/m1/points'&&$method==='GET'){
  academy_m1_guard_role($user,['student']);$st=$pdo->prepare('SELECT COALESCE(SUM(points),0) FROM m1_points_ledger WHERE student_id=?');$st->execute([$uid]);$points=(int)$st->fetchColumn();$recent=$pdo->prepare('SELECT source_type,source_id,points,created_at FROM m1_points_ledger WHERE student_id=? ORDER BY created_at DESC LIMIT 20');$recent->execute([$uid]);academy_json(['ok'=>true,'points'=>$points,'recent'=>$recent->fetchAll(PDO::FETCH_ASSOC)]);
 }
 if($route==='/m1/leaderboard'&&$method==='GET'){
  academy_m1_guard_role($user,['student']);$profile=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($profile))academy_json(['ok'=>true,'items'=>[]]);$s=academy_m1_scope(['type'=>$profile['educationType']??'', 'stage'=>$profile['stage']??'', 'grade'=>$profile['grade']??0]);
  $stmt=$pdo->prepare('SELECT student_id,SUM(points) AS points FROM m1_points_ledger WHERE education_type=? AND stage=? AND grade=? GROUP BY student_id ORDER BY points DESC LIMIT 50');$stmt->execute([$s['type'],$s['stage'],$s['grade']]);$real=[];foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as$r){$p=academy_read_node('studentProfilesV3/'.$r['student_id']);$real[]=['id'=>$r['student_id'],'name'=>mb_substr((string)($p['publicDisplayName']??'طالب مشارك'),0,80),'points'=>(int)$r['points'],'virtual'=>false];}
  // Training-only simulation is disclosed in the UI, never used for official award decisions.
  $bots=$pdo->prepare('SELECT id,display_name,simulated_points FROM m1_virtual_students WHERE education_type=? AND stage=? AND grade=? AND is_active=1 ORDER BY simulated_points DESC LIMIT 50');$bots->execute([$s['type'],$s['stage'],$s['grade']]);foreach($bots->fetchAll(PDO::FETCH_ASSOC)as$v)$real[]=['id'=>$v['id'],'name'=>$v['display_name'],'points'=>(int)$v['simulated_points'],'virtual'=>true];usort($real,static fn($a,$b)=>$b['points']<=>$a['points']);academy_json(['ok'=>true,'items'=>array_map(static fn($x)=>['name'=>$x['name'],'points'=>$x['points']],array_slice($real,0,50)),'training'=>true,'notice'=>'ترتيب تدريبي قد يشمل منافسين افتراضيين، ولا يمثل مراكز الجوائز الرسمية.']);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
