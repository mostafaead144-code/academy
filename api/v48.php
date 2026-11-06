<?php
/** V48: advanced contests. New challenges opt into this engine; legacy M1 data is never rewritten by migration. */
declare(strict_types=1);
function academy_v48_error(string $code,int $status=422): never {academy_json(['ok'=>false,'error'=>$code],$status);}
function academy_v48_rule(PDO $pdo,string $id): ?array {
 $q=$pdo->prepare('SELECT * FROM v48_challenge_rules WHERE challenge_id=?');$q->execute([$id]);return $q->fetch(PDO::FETCH_ASSOC)?:null;
}
function academy_v48_policy(mixed $value,array $allowed,string $field): string {
 $v=(string)$value;if(!in_array($v,$allowed,true))academy_v48_error('invalid_'.$field);return $v;
}
function academy_v48_build_rules(array $b): array {
 $max=(int)($b['maxAttempts']??1);if($max<1||$max>10)academy_v48_error('invalid_max_attempts');
 return ['maxAttempts'=>$max,'revealPolicy'=>academy_v48_policy($b['revealPolicy']??'instant',['instant','after_end','manual'],'reveal_policy'),'scorePolicy'=>academy_v48_policy($b['scorePolicy']??'best',['best','first','last'],'score_policy'),'shuffleQuestions'=>!empty($b['shuffleQuestions']),'shuffleOptions'=>!empty($b['shuffleOptions'])];
}
function academy_v48_setup_rules(PDO $pdo,string $challengeId,array $rule): void {
 $pdo->prepare('INSERT INTO v48_challenge_rules(challenge_id,max_attempts,reveal_policy,score_policy,shuffle_questions,shuffle_options) VALUES(?,?,?,?,?,?)')->execute([$challengeId,$rule['maxAttempts'],$rule['revealPolicy'],$rule['scorePolicy'],$rule['shuffleQuestions']?1:0,$rule['shuffleOptions']?1:0]);
}
function academy_v48_is_visible(array $challenge,array $rule): bool {
 if($rule['reveal_policy']==='instant')return true;
 if(!empty($rule['results_released_at']))return true;
 return $rule['reveal_policy']==='after_end'&&gmdate('Y-m-d H:i:s')>=$challenge['ends_at'];
}
function academy_v48_rank_name(string $studentId,string $role): string {
 if($role==='student')return academy_m3_public_name($studentId);
 $p=academy_read_node('studentProfilesV3/'.$studentId);$name=is_array($p)?trim((string)($p['name']??'')):'';
 return $name!==''?mb_substr($name,0,80):academy_m3_public_name($studentId);
}
function academy_v48_student_results(PDO $pdo,string $challengeId,string $studentId): array {
 $q=$pdo->prepare('SELECT * FROM v48_attempt_results WHERE challenge_id=? AND student_id=? ORDER BY attempt_no');$q->execute([$challengeId,$studentId]);return $q->fetchAll(PDO::FETCH_ASSOC);
}
function academy_v48_choice(array $all,string $policy): ?array {
 if(!$all)return null;if($policy==='first')return $all[0];if($policy==='last')return $all[count($all)-1];
 usort($all,static fn($a,$b)=>((int)$b['points_awarded']<=>(int)$a['points_awarded'])?:((int)$b['correct_count']<=>(int)$a['correct_count'])?:strcmp($a['submitted_at'],$b['submitted_at']));return $all[0];
}
function academy_v48_publish_student(PDO $pdo,array $c,array $rule,string $studentId): void {
 $choice=academy_v48_choice(academy_v48_student_results($pdo,$c['id'],$studentId),$rule['score_policy']);if(!$choice)return;
 $pdo->prepare('INSERT INTO m1_challenge_attempts(id,challenge_id,student_id,answers_json,correct_count,question_count,percentage,points_awarded,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE answers_json=VALUES(answers_json),correct_count=VALUES(correct_count),question_count=VALUES(question_count),percentage=VALUES(percentage),points_awarded=VALUES(points_awarded),created_at=VALUES(created_at)')->execute([academy_uuid(),$c['id'],$studentId,$choice['answers_json'],$choice['correct_count'],$choice['question_count'],$choice['percentage'],$choice['points_awarded'],$choice['submitted_at']]);
 $pdo->prepare("INSERT INTO m1_points_ledger(id,student_id,source_type,source_id,education_type,stage,grade,subject,points) VALUES(?,?,'challenge',?,?,?,?,?,?) ON DUPLICATE KEY UPDATE points=VALUES(points)")->execute([academy_uuid(),$studentId,$c['id'],$c['education_type'],$c['stage'],$c['grade'],$c['subject'],$choice['points_awarded']]);
}
function academy_v48_release_due(PDO $pdo,array $c): void {
 $rule=academy_v48_rule($pdo,$c['id']);if(!$rule||$rule['reveal_policy']!=='after_end'||!empty($rule['results_released_at'])||$c['ends_at']>gmdate('Y-m-d H:i:s'))return;
 $pdo->beginTransaction();try{
  $q=$pdo->prepare('SELECT results_released_at FROM v48_challenge_rules WHERE challenge_id=? FOR UPDATE');$q->execute([$c['id']]);$released=$q->fetchColumn();if($released){$pdo->commit();return;}
  $q=$pdo->prepare('SELECT DISTINCT student_id FROM v48_attempt_results WHERE challenge_id=?');$q->execute([$c['id']]);foreach($q->fetchAll(PDO::FETCH_COLUMN) as $studentId)academy_v48_publish_student($pdo,$c,$rule,(string)$studentId);
  $pdo->prepare('UPDATE v48_challenge_rules SET results_released_at=UTC_TIMESTAMP() WHERE challenge_id=?')->execute([$c['id']]);$pdo->commit();
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function academy_v48_safe_attempt(array $a,bool $visible): array {
 $out=['attemptNo'=>(int)$a['attempt_no'],'submittedAt'=>$a['submitted_at'],'resultsVisible'=>$visible];if($visible)$out+=['correct'=>(int)$a['correct_count'],'total'=>(int)$a['question_count'],'percentage'=>(int)$a['percentage'],'points'=>(int)$a['points_awarded']];return $out;
}
function academy_v48_open(PDO $pdo,array $u,array $c): never {
 $uid=$u['id'];$rule=academy_v48_rule($pdo,$c['id']);if(!$rule)academy_v48_error('challenge_rules_missing',503);
 $p=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($p)||!academy_scope_matches(['type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(string)$c['grade']],$p))academy_v48_error('forbidden',403);
 academy_v48_release_due($pdo,$c);
 $teamModel=academy_v481_context_model($pdo,$c['id'],$uid);
 $now=gmdate('Y-m-d H:i:s');$all=academy_v48_student_results($pdo,$c['id'],$uid);$visible=academy_v48_is_visible($c,$rule);
 $pdo->beginTransaction();try{
  $q=$pdo->prepare('SELECT attempt_no,opened_at FROM v48_attempt_sessions WHERE challenge_id=? AND student_id=? ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE');$q->execute([$c['id'],$uid]);$last=$q->fetch(PDO::FETCH_ASSOC);$lastNo=(int)($last['attempt_no']??0);
  $submitted=array_column($all,null,'attempt_no');$lastFinished=$lastNo>0&&isset($submitted[$lastNo]);$lastExpired=$lastNo>0&&time()>strtotime($last['opened_at'])+(int)$c['duration_minutes']*60;
  $canStart=$c['status']==='published'&&$now>=$c['starts_at']&&$now<=$c['ends_at'];if($now<$c['starts_at']){$pdo->rollBack();academy_v48_error('challenge_not_started',403);}
  if(!$canStart||($lastNo>=(int)$rule['max_attempts']&&($lastFinished||$lastExpired))){
   $pdo->commit();$picked=academy_v48_choice($all,$rule['score_policy']);$meta=['ok'=>true,'challenge'=>academy_m1_public_challenge($c),'completed'=>true,'usedAttempts'=>$lastNo,'maxAttempts'=>(int)$rule['max_attempts'],'resultsVisible'=>$visible];
   if($picked)$meta['attempt']=academy_v48_safe_attempt($picked,$visible);academy_json($meta);
  }
  if($lastNo>0&&!$lastFinished&&!$lastExpired){$num=$lastNo;$opened=$last['opened_at'];}
  else{$num=$lastNo+1;if($num>(int)$rule['max_attempts']){$pdo->rollBack();academy_v48_error('attempt_limit_reached',409);}
   $pdo->prepare('INSERT INTO v48_attempt_sessions(challenge_id,student_id,attempt_no,opened_at) VALUES(?,?,?,UTC_TIMESTAMP())')->execute([$c['id'],$uid,$num]);$opened=$now;}
  $pdo->commit();
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}

 $deadline=min(strtotime($c['ends_at']),strtotime($opened)+(int)$c['duration_minutes']*60);if($deadline<=time())academy_v48_error('challenge_time_expired',403);
 $out=academy_m1_public_challenge($c,true);if($teamModel['team']){$qs=academy_v482_variant_questions($pdo,$c['id'],$teamModel,json_decode($c['questions_json'],true)?:[]);$out['questions']=array_map(static fn($q)=>['question'=>$q['question'],'options'=>$q['options']],$qs);$out['teamModel']=$teamModel['model'];}$out['deadlineAt']=gmdate('Y-m-d H:i:s',$deadline);$out['attemptNo']=$num;$out['maxAttempts']=(int)$rule['max_attempts'];$out['revealPolicy']=$rule['reveal_policy'];
 academy_json(['ok'=>true,'challenge'=>$out,'usedAttempts'=>count($all),'resultsVisible'=>$visible]);
}
function academy_v48_submit(PDO $pdo,array $u,string $id,array $answers,int $attemptNo): never {
 $uid=$u['id'];$profile=academy_read_node('studentProfilesV3/'.$uid);if(!is_array($profile))academy_v48_error('profile_missing',403);
 $pdo->beginTransaction();try{
  $st=$pdo->prepare('SELECT * FROM m1_challenges WHERE id=? FOR UPDATE');$st->execute([$id]);$c=$st->fetch(PDO::FETCH_ASSOC);
  if(!$c||$c['status']!=='published'||!academy_scope_matches(['type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(string)$c['grade']],$profile)){ $pdo->rollBack();academy_v48_error('challenge_unavailable',403);}
  $rule=academy_v48_rule($pdo,$id);if(!$rule){$pdo->rollBack();academy_v48_error('challenge_rules_missing',503);}
  if($attemptNo<1||$attemptNo>(int)$rule['max_attempts']){$pdo->rollBack();academy_v48_error('invalid_attempt_number');}
  $existing=$pdo->prepare('SELECT * FROM v48_attempt_results WHERE challenge_id=? AND student_id=? AND attempt_no=?');$existing->execute([$id,$uid,$attemptNo]);$saved=$existing->fetch(PDO::FETCH_ASSOC);
  if($saved){$pdo->commit();$visible=academy_v48_is_visible($c,$rule);academy_json(['ok'=>true,'existing'=>true,'result'=>academy_v48_safe_attempt($saved,$visible),'resultsVisible'=>$visible]);}
  $latest=$pdo->prepare('SELECT MAX(attempt_no) FROM v48_attempt_sessions WHERE challenge_id=? AND student_id=?');$latest->execute([$id,$uid]);if((int)$latest->fetchColumn()!==$attemptNo){$pdo->rollBack();academy_v48_error('attempt_out_of_order',409);}
  $now=gmdate('Y-m-d H:i:s');$q=$pdo->prepare('SELECT opened_at FROM v48_attempt_sessions WHERE challenge_id=? AND student_id=? AND attempt_no=?');$q->execute([$id,$uid,$attemptNo]);$opened=$q->fetchColumn();
  if(!$opened||$now<$c['starts_at']||$now>$c['ends_at']||time()>strtotime($opened)+(int)$c['duration_minutes']*60){$pdo->rollBack();academy_v48_error('challenge_time_expired',403);}
  $teamModel=academy_v481_context_model($pdo,$id,$uid);$questions=json_decode($c['questions_json'],true);if(is_array($questions)&&$teamModel['team'])$questions=academy_v482_variant_questions($pdo,$id,$teamModel,$questions);if(!is_array($questions)||count($questions)!==count($answers)){$pdo->rollBack();academy_v48_error('invalid_answers');}
  $correct=0;foreach($questions as$i=>$q){if(!is_int($answers[$i])||$answers[$i]<0||$answers[$i]>=count($q['options'])){$pdo->rollBack();academy_v48_error('invalid_answers');}if($answers[$i]===$q['correctAnswer'])$correct++;}
  $total=count($questions);$pct=(int)round($correct*100/$total);$points=(int)round((int)$c['max_points']*$correct/$total);
  $pdo->prepare('INSERT INTO v48_attempt_results(id,challenge_id,student_id,attempt_no,answers_json,correct_count,question_count,percentage,points_awarded,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([academy_uuid(),$id,$uid,$attemptNo,json_encode($answers),$correct,$total,$pct,$points]);
  if($rule['reveal_policy']==='instant')academy_v48_publish_student($pdo,$c,$rule,$uid);
  $pdo->commit();$visible=academy_v48_is_visible($c,$rule);academy_audit($uid,'v48.challenge.submit',$id,['attemptNo'=>$attemptNo]);
  $out=['ok'=>true,'resultsVisible'=>$visible,'usedAttempts'=>$attemptNo,'maxAttempts'=>(int)$rule['max_attempts']];
  if($visible)$out['result']=['correct'=>$correct,'total'=>$total,'percentage'=>$pct,'points'=>$points];else $out['result']=['pending'=>true,'attemptNo'=>$attemptNo];academy_json($out);
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function academy_v48_source_questions(mixed $raw): array {
 $items=[];foreach(academy_list_values($raw??[])as$question){if(!is_array($question)||!isset($question['correctAnswer'])||!is_numeric($question['correctAnswer']))continue;$normalized=academy_normalize_question($question);if(!$normalized)continue;
  $ix=(int)$question['correctAnswer'];if($ix<0||$ix>=count($normalized['opts']))continue;$items[]=$normalized;
  if(count($items)>=100)break;
 }return $items;
}
function academy_v48_quiz_sources(array $scope,string $subject): array {
 $quizzes=academy_read_node('quizzes');$lessons=academy_read_node('lessons');$packages=academy_read_node('teacherContentsV6');if(!is_array($quizzes))$quizzes=[];if(!is_array($lessons))$lessons=[];$out=[];
 foreach($quizzes as $id=>$q){if(!is_array($q)||($q['isHidden']??false)===true||($q['active']??true)===false||($q['workflowStatus']??'')==='draft')continue;
  $lesson=is_array($lessons[$q['lessonId']??'']??null)?$lessons[$q['lessonId']]:[];
  $t=$q['educationType']??$lesson['type']??$lesson['educationType']??$q['type']??'';
  $st=$q['stage']??$lesson['stage']??'';$grade=(int)($q['grade']??$lesson['grade']??0);$sub=$q['subject']??$lesson['subject']??'';
  if($t!==$scope['type']||$st!==$scope['stage']||$grade!==$scope['grade']||$sub!==$subject)continue;
  $items=academy_v48_source_questions($q['questions']??[]);if(!$items)continue;$key='quiz:'.(string)$id;
  $out[$key]=['id'=>$key,'title'=>mb_substr((string)($q['title']??$q['name']??'اختبار'),0,150),'questionCount'=>count($items),'questions'=>$items];if(count($out)>=100)return $out;
 }
 if(is_array($packages))foreach($packages as $lessonId=>$teachers){$lesson=$lessons[(string)$lessonId]??null;
  if(!is_array($lesson)||($lesson['isHidden']??false)===true||($lesson['workflowStatus']??'')==='draft')continue;
  if(($lesson['type']??$lesson['educationType']??'')!==$scope['type']||($lesson['stage']??'')!==$scope['stage']||(int)($lesson['grade']??0)!==$scope['grade']||($lesson['subject']??'')!==$subject)continue;
  if(!is_array($teachers))continue;foreach($teachers as $teacherId=>$package){if(!is_array($package)||($package['status']??'published')!=='published'||($package['active']??true)===false)continue;
   $quiz=$package['quiz']??null;if(!is_array($quiz))continue;$items=academy_v48_source_questions($quiz['questions']??[]);if(!$items)continue;
   $key='teacher:'.(string)$lessonId.':'.(string)$teacherId;$out[$key]=['id'=>$key,'title'=>mb_substr((string)($quiz['title']??'اختبار درس').' — '.(string)($package['teacherName']??'معلم'),0,150),'questionCount'=>count($items),'questions'=>$items];if(count($out)>=100)return $out;
  }
 }
 return $out;
}
function academy_v48_materialize(PDO $pdo,array $u,array $b,array $scope,string $subject): array {
 $manual=$b['questions']??[];if(!is_array($manual)||!array_is_list($manual))academy_v48_error('invalid_manual_questions');$combined=$manual;$ids=$b['sourceIds']??[];
 if(!is_array($ids)||!array_is_list($ids)||count($ids)>12)academy_v48_error('invalid_source_ids');$ids=array_values(array_unique(array_map('strval',$ids)));
 if($ids){$sourceMap=academy_v48_quiz_sources($scope,$subject);
  foreach($ids as $sid){if(!isset($sourceMap[$sid]))academy_v48_error('source_unavailable',422);foreach($sourceMap[$sid]['questions'] as$q)$combined[]=['question'=>$q['text'],'options'=>$q['opts'],'correctAnswer'=>$q['correctAnswer']];}
 }
 if(count($combined)<1||count($combined)>1260)academy_v48_error('questions_count_out_of_range');$pick=(int)($b['pickCount']??0);if($pick<0||$pick>60)academy_v48_error('invalid_pick_count');if($pick>0&&$pick<count($combined)){if(!empty($b['randomSample']))shuffle($combined);$combined=array_slice($combined,0,$pick);}if(count($combined)>60)academy_v48_error('questions_count_out_of_range');$clean=academy_m1_questions($combined);
 $rules=academy_v48_build_rules($b);
 if($rules['shuffleQuestions'])shuffle($clean);
 if($rules['shuffleOptions'])foreach($clean as &$q){$order=range(0,count($q['options'])-1);shuffle($order);$answer=array_search($q['correctAnswer'],$order,true);$q['options']=array_map(static fn($i)=>$q['options'][$i],$order);$q['correctAnswer']=(int)$answer;}unset($q);
 return [$clean,$rules];
}
function academy_v48_finalize_due_batch(PDO $pdo,int $limit=5): void {
 $limit=max(1,min(15,$limit));$q=$pdo->prepare("SELECT c.* FROM m1_challenges c JOIN v48_challenge_rules r ON r.challenge_id=c.id WHERE r.reveal_policy='after_end' AND r.results_released_at IS NULL AND c.ends_at<=UTC_TIMESTAMP() ORDER BY c.ends_at ASC LIMIT ".$limit);$q->execute();foreach($q->fetchAll(PDO::FETCH_ASSOC)as $c)academy_v48_release_due($pdo,$c);
}
function academy_v48_pending_manual_rounds(PDO $pdo,string $seasonId): int {
 $q=$pdo->prepare("SELECT COUNT(*) FROM m4_tournaments t JOIN m4_tournament_rounds rd ON rd.tournament_id=t.id JOIN m1_challenges c ON c.id=rd.challenge_id JOIN v48_challenge_rules r ON r.challenge_id=c.id WHERE t.season_id=? AND t.status IN ('published','closed') AND r.reveal_policy='manual' AND r.results_released_at IS NULL");$q->execute([$seasonId]);return (int)$q->fetchColumn();
}
function academy_v48_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v48/'))return;
 $u=academy_current_user(true);$role=$u['primary_role'];$uid=$u['id'];$b=$method==='GET'?[]:academy_body();
 if($route==='/v48/sources'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher']);$scope=academy_m1_scope($_GET);$subject=trim((string)($_GET['subject']??''));if(!preg_match('/^[A-Za-z0-9_-]{2,80}$/D',$subject))academy_v48_error('invalid_subject');
  if($role==='teacher'&&(!academy_teacher_is_active_profile($uid)||!academy_teacher_scope_allowed($uid,['type'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>(string)$scope['grade'],'subject'=>$subject])))academy_v48_error('scope_not_assigned',403);
  $sources=academy_v48_quiz_sources($scope,$subject);academy_json(['ok'=>true,'items'=>array_map(static fn($s)=>['id'=>$s['id'],'title'=>$s['title'],'questionCount'=>$s['questionCount']],array_values($sources))]);
 }
 if($route==='/v48/challenge/ranking'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher','student']);$id=(string)($_GET['id']??'');if(!academy_m1_uuid($id))academy_v48_error('invalid_id');$c=academy_m1_fetch($pdo,$id);if(!$c)academy_v48_error('not_found',404);
  if($role==='teacher'&&$c['creator_id']!==$uid)academy_v48_error('forbidden',403);
  if($role==='student'){$p=academy_read_node('studentProfilesV3/'.$uid);if(!in_array($c['status'],['published','closed'],true)||!is_array($p)||!academy_scope_matches(['type'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(string)$c['grade']],$p))academy_v48_error('forbidden',403);}
  academy_v48_release_due($pdo,$c);$r=academy_v48_rule($pdo,$id);$visible=$r?academy_v48_is_visible($c,$r):true;$unlocked=$role!=='student'||$visible;
  $q=$pdo->prepare('SELECT COUNT(DISTINCT student_id) FROM v48_attempt_sessions WHERE challenge_id=?');$q->execute([$id]);$count=(int)$q->fetchColumn();
  if(!$unlocked)academy_json(['ok'=>true,'locked'=>true,'participants'=>$count,'items'=>[],'endsAt'=>$c['ends_at']]);
  $out=[];
  if($r&&!$visible&&$role!=='student'){
   $q=$pdo->prepare('SELECT * FROM v48_attempt_results WHERE challenge_id=? ORDER BY student_id,attempt_no');$q->execute([$id]);$by=[];foreach($q->fetchAll(PDO::FETCH_ASSOC)as $row)$by[$row['student_id']][]=$row;
   foreach($by as $sid=>$arr){$choice=academy_v48_choice($arr,$r['score_policy']);if($choice)$out[]=['name'=>academy_v48_rank_name((string)$sid,$role),'points'=>(int)$choice['points_awarded'],'percentage'=>(int)$choice['percentage']];}
   usort($out,static fn($a,$b)=>($b['points']<=>$a['points'])?:($b['percentage']<=>$a['percentage']));
  }else{
   $q=$pdo->prepare('SELECT student_id,points_awarded,percentage,correct_count,created_at FROM m1_challenge_attempts WHERE challenge_id=? ORDER BY points_awarded DESC,correct_count DESC,created_at ASC LIMIT 200');$q->execute([$id]);
   foreach($q->fetchAll(PDO::FETCH_ASSOC)as $x)$out[]=['name'=>academy_v48_rank_name($x['student_id'],$role),'isMine'=>$role==='student'&&$uid===$x['student_id'],'points'=>(int)$x['points_awarded'],'percentage'=>(int)$x['percentage']];
  }
  $out=array_slice($out,0,200);foreach($out as $i=>&$row)$row['rank']=$i+1;unset($row);
  $waiting=[];if($role!=='student'){$q=$pdo->prepare('SELECT s.student_id FROM v48_attempt_sessions s LEFT JOIN v48_attempt_results a ON a.challenge_id=s.challenge_id AND a.student_id=s.student_id WHERE s.challenge_id=? GROUP BY s.student_id HAVING COUNT(a.id)=0 LIMIT 100');$q->execute([$id]);foreach($q->fetchAll(PDO::FETCH_COLUMN)as $sid)$waiting[]=academy_v48_rank_name((string)$sid,$role);}
  academy_json(['ok'=>true,'locked'=>false,'privatePreview'=>!$visible,'participants'=>max($count,count($out)),'items'=>$out,'enteredNotSubmitted'=>$waiting]);
 }
 if($route==='/v48/challenge/release'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=(string)($b['id']??'');if(!academy_m1_uuid($id))academy_v48_error('invalid_id');$pdo->beginTransaction();try{
   $q=$pdo->prepare('SELECT * FROM m1_challenges WHERE id=? FOR UPDATE');$q->execute([$id]);$c=$q->fetch(PDO::FETCH_ASSOC);if(!$c)academy_v48_error('not_found',404);$rule=academy_v48_rule($pdo,$id);if(!$rule||$rule['reveal_policy']!=='manual'||!empty($rule['results_released_at']))academy_v48_error('release_unavailable',409);
   if($c['ends_at']>gmdate('Y-m-d H:i:s'))academy_v48_error('cannot_release_before_end',409);
   $q=$pdo->prepare('SELECT DISTINCT student_id FROM v48_attempt_results WHERE challenge_id=?');$q->execute([$id]);foreach($q->fetchAll(PDO::FETCH_COLUMN) as $sid)academy_v48_publish_student($pdo,$c,$rule,(string)$sid);
   $pdo->prepare('UPDATE v48_challenge_rules SET results_released_at=UTC_TIMESTAMP() WHERE challenge_id=?')->execute([$id]);$pdo->commit();academy_audit($uid,'v48.challenge.results.release',$id);academy_json(['ok'=>true]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v48/season/ranking'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher','student']);$id=(string)($_GET['id']??'');if(!academy_m1_uuid($id))academy_v48_error('invalid_id');
  $q=$pdo->prepare('SELECT * FROM m4_seasons WHERE id=?');$q->execute([$id]);$season=$q->fetch(PDO::FETCH_ASSOC);if(!$season)academy_v48_error('not_found',404);
  if($role==='student'){$p=academy_read_node('studentProfilesV3/'.$uid);if(($season['status']!=='published'&&$season['status']!=='closed')||!is_array($p)||!academy_scope_matches(['type'=>$season['education_type'],'stage'=>$season['stage'],'grade'=>(string)$season['grade']],$p))academy_v48_error('forbidden',403);}
  $q=$pdo->prepare('SELECT * FROM v48_season_rules WHERE season_id=?');$q->execute([$id]);$rule=$q->fetch(PDO::FETCH_ASSOC)?:['reveal_policy'=>'after_end','results_released_at'=>null];
  $visible=$rule['reveal_policy']==='instant'||!empty($rule['results_released_at'])||($rule['reveal_policy']==='after_end'&&gmdate('Y-m-d H:i:s')>=$season['ends_at']);
  if($role==='student'&&!$visible)academy_json(['ok'=>true,'locked'=>true,'items'=>[],'endsAt'=>$season['ends_at']]);
  if($visible&&$role==='student'&&academy_v48_pending_manual_rounds($pdo,$id)>0)academy_json(['ok'=>true,'locked'=>true,'items'=>[],'reason'=>'pending_round_approval']);
  $q=$pdo->prepare("SELECT * FROM m4_tournaments WHERE season_id=? AND status IN ('published','closed') ORDER BY starts_at LIMIT 30");$q->execute([$id]);$scores=['solo'=>[],'team'=>[]];
  foreach($q->fetchAll(PDO::FETCH_ASSOC)as $tour){foreach(academy_m4_rounds($pdo,$tour['id']) as $rr){$challenge=academy_m1_fetch($pdo,$rr['challenge_id']);if($challenge)academy_v48_release_due($pdo,$challenge);}
   foreach(academy_m4_rank($pdo,$tour)as $row){$category=$tour['mode']==='team'?'team':'solo';$key=$row['id'];if(!isset($scores[$category][$key]))$scores[$category][$key]=['name'=>$row['name'],'points'=>0,'completed'=>0];$scores[$category][$key]['points']+=(float)$row['score'];$scores[$category][$key]['completed']+=(int)$row['completed'];}
  }
  $rank=function(array $entries): array {$rows=array_values($entries);usort($rows,static fn($a,$b)=>($b['points']<=>$a['points'])?:($b['completed']<=>$a['completed'])?:strcmp($a['name'],$b['name']));$rows=array_slice($rows,0,100);foreach($rows as $i=>&$row)$row['rank']=$i+1;unset($row);return $rows;};
  academy_json(['ok'=>true,'locked'=>false,'items'=>$rank($scores['solo']),'teams'=>$rank($scores['team']),'seasonTitle'=>$season['title']]);
 }
 if($route==='/v48/season/release'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=(string)($b['id']??'');$q=$pdo->prepare('SELECT ends_at FROM m4_seasons WHERE id=?');$q->execute([$id]);$end=$q->fetchColumn();if(!$end)academy_v48_error('not_found',404);if($end>gmdate('Y-m-d H:i:s'))academy_v48_error('cannot_release_before_end',409);$rounds=$pdo->prepare('SELECT c.* FROM m4_tournaments t JOIN m4_tournament_rounds rd ON rd.tournament_id=t.id JOIN m1_challenges c ON c.id=rd.challenge_id WHERE t.season_id=?');$rounds->execute([$id]);foreach($rounds->fetchAll(PDO::FETCH_ASSOC)as $challenge)academy_v48_release_due($pdo,$challenge);if(academy_v48_pending_manual_rounds($pdo,$id)>0)academy_v48_error('pending_round_approval',409);
  $st=$pdo->prepare("UPDATE v48_season_rules SET results_released_at=UTC_TIMESTAMP() WHERE season_id=? AND reveal_policy='manual' AND results_released_at IS NULL");$st->execute([$id]);if($st->rowCount()!==1)academy_v48_error('release_unavailable',409);academy_audit($uid,'v48.season.results.release',$id);academy_json(['ok'=>true]);
 }
 academy_v48_error('not_found',404);
}
