<?php
/** V55: server-scored spaced repetition over real saved quiz errors. No table migration. */
declare(strict_types=1);
function academy_v55_fail(string $code,int $http=422): never {academy_json(['ok'=>false,'error'=>$code],$http);}
function academy_v55_scope(array $profile): array {return academy_v54_scope($profile);}
function academy_v55_store(string $uid): string {return 'learningV55/cards/'.$uid;}
function academy_v55_rows(string $uid): array {$v=academy_read_node(academy_v55_store($uid));return is_array($v)?$v:[];}
function academy_v55_card_key(string $source,string $attempt,string $key): string {return substr(hash('sha256',$source.'|'.$attempt.'|'.$key),0,24);}
function academy_v55_card(array $q,string $source,string $uid,string $attempt,string $idx,string $subject,array $scope,string $lesson=''): ?array {
 $options=$q['options']??null;$correct=$q['correct']??$q['correctAnswer']??null;
 if(!is_array($options)||!array_is_list($options)||count($options)<2||count($options)>6||!is_int($correct)||$correct<0||$correct>=count($options))return null;
 $options=array_map(static fn($v)=>is_scalar($v)?mb_substr(trim((string)$v),0,300):'', $options);
 if(in_array('',$options,true))return null;
 $question=mb_substr(trim((string)($q['question']??$q['text']??'')),0,600);
 if($question==='')return null;
 return ['id'=>academy_v55_card_key($source,$attempt,$idx),'source'=>$source,'sourceId'=>$idx,'attemptId'=>$attempt,'lessonId'=>$lesson,'subject'=>$subject,'scope'=>$scope,'question'=>$question,'options'=>$options,'correct'=>$correct,'explanation'=>mb_substr((string)($q['explanation']??''),0,600),'repetitions'=>0,'wrongCount'=>1,'lastReviewedAt'=>null,'dueAt'=>academy_now_ms(),'createdAt'=>academy_now_ms()];
}
function academy_v55_is_available(array $card,array $profile,array $user): bool {
 if(($card['scope']??null)!==academy_v55_scope($profile))return false;
 if(($card['source']??'')==='diagnostic'){
  $q=academy_read_node('questionBankV4/'.($card['sourceId']??''));
  return is_array($q)&&($q['status']??'')==='approved'&&academy_v54_scoped($q,$profile);
 }
 $lessonId=(string)($card['lessonId']??'');$lesson=academy_read_node('lessons/'.$lessonId);
 if(!is_array($lesson)||!academy_v54_scoped($lesson,$profile)||!academy_content_visible_to_reader($user,$lesson)||!academy_student_can_access_content($user,$lesson,'lessons/'.$lessonId))return false;
 $quizId=(string)($card['quizId']??'');
 if($quizId==='lesson_'.$lessonId)return true;
 $quiz=academy_read_node('quizzes/'.$quizId);
 if(is_array($quiz)&&($quiz['lessonId']??'')===$lessonId)return academy_content_visible_to_reader($user,$quiz)&&academy_student_can_access_content($user,$quiz,'quizzes/'.$quizId);
 $suffix='_'.$lessonId;
 if(str_starts_with($quizId,'teacher_')&&str_ends_with($quizId,$suffix)){
  $teacherId=substr($quizId,8,-strlen($suffix));
  $package=academy_read_node('teacherContentsV6/'.$lessonId.'/'.$teacherId);
  if(!is_array($package))return false; // Never resurface archived or legacy teacher work from a stale mistake snapshot.
  $safe=academy_public_teacher_package($lessonId,$teacherId,$package,$user,$lesson);
  return is_array($safe)&&empty($safe['accessLocked'])&&is_array($safe['quiz']??null);
 }
 return false;
}
function academy_v55_schedule(array $card,bool $correct,int $now): array {
 $reps=max(0,min(5,(int)($card['repetitions']??0)));
 if($correct){$reps=min(5,$reps+1);$days=[1,3,7,14,30][$reps-1];$due=$now+$days*86400000;}
 else{$reps=0;$days=0;$due=$now+10*60000;$card['wrongCount']=max(0,(int)($card['wrongCount']??0))+1;}
 $card['repetitions']=$reps;$card['intervalDays']=$days;$card['dueAt']=$due;$card['lastReviewedAt']=$now;
 return $card;
}
function academy_v55_public_card(array $card): array {return ['id'=>$card['id'],'subject'=>$card['subject'],'question'=>$card['question'],'options'=>$card['options'],'repetitions'=>$card['repetitions'],'dueAt'=>$card['dueAt']];}
function academy_v55_sync_quiz_mistakes(PDO $pdo,string $uid,array $profile,array $user): int {
 $path=academy_v55_store($uid);$locks=academy_acquire_data_locks($pdo,[$path]);
 try{
  $rows=academy_v55_rows($uid);
  $history=academy_read_node('studentProfilesV3/'.$uid.'/quizMistakesV32');if(!is_array($history))$history=[];
  uasort($history,static fn($a,$b)=>(int)($b['at']??0)<=>(int)($a['at']??0));
  $added=0;$seen=0;
  foreach($history as $attempt=>$item){if(++$seen>200||count($rows)>=450)break;if(!is_array($item))continue;
   $lessonId=(string)($item['lessonId']??'');$lesson=academy_read_node('lessons/'.$lessonId);
   if(!is_array($lesson)||!academy_v54_scoped($lesson,$profile)||!academy_content_visible_to_reader($user,$lesson)||!academy_student_can_access_content($user,$lesson,'lessons/'.$lessonId))continue;
   foreach(array_slice($item['wrong']??[],0,60) as $idx=>$wrong){if(!is_array($wrong))continue;
    $card=academy_v55_card($wrong,'quiz',$uid,(string)$attempt,(string)$idx,(string)($lesson['subject']??''),academy_v55_scope($profile),$lessonId);
    if($card){$card['quizId']=(string)($item['quizId']??'');if(!academy_v55_is_available($card,$profile,$user))continue;}
    if($card&&count($rows)<450&&!isset($rows[$card['id']])){$rows[$card['id']]=$card;$added++;}
   }
  }
  if($added>0){$pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$rows,$uid);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
  return $added;
 }finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v55_record_diagnostic(PDO $pdo,string $uid,array $profile,array $attempt,array $questions,array $details): void {
 $path=academy_v55_store($uid);$locks=academy_acquire_data_locks($pdo,[$path]);
 try{$rows=academy_v55_rows($uid);$n=0;
  foreach($details as $i=>$detail){if(!empty($detail['correct'])||!is_array($questions[$i]??null)||count($rows)>=450)continue;
   $q=$questions[$i];$card=academy_v55_card($q,'diagnostic',$uid,(string)$attempt['id'],(string)($q['id']??$i),(string)($attempt['subject']??''),academy_v55_scope($profile),(string)($q['lessonId']??''));
   if($card&&!isset($rows[$card['id']])){$rows[$card['id']]=$card;$n++;}
  }
  if($n){$pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$rows,$uid);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
 }finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v55_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v55/'))return;
 $user=academy_current_user(true);if(($user['primary_role']??'')!=='student')academy_v55_fail('forbidden',403);
 $uid=(string)$user['id'];$profile=academy_v54_profile($uid);$scope=academy_v55_scope($profile);$now=academy_now_ms();
 if($route==='/v55/sync'&&$method==='POST'){
  academy_rate_limit('v55-sync-'.$uid,30,3600);$added=academy_v55_sync_quiz_mistakes($pdo,$uid,$profile,$user);academy_json(['ok'=>true,'added'=>$added]);
 }
 if($route==='/v55/overview'&&$method==='GET'){
  academy_rate_limit('v55-overview-'.$uid,120,3600);$rows=academy_v55_rows($uid);$due=0;$future=0;$mastered=0;$subjects=[];
  foreach($rows as $card){if(!is_array($card)||!academy_v55_is_available($card,$profile,$user))continue;
   $sub=(string)($card['subject']??'');if($sub==='')continue;$subjects[$sub]=($subjects[$sub]??0)+1;
   if(($card['dueAt']??0)<=$now)$due++;else $future++;
   if((int)($card['repetitions']??0)>=5)$mastered++;
  }
  academy_json(['ok'=>true,'scope'=>$scope,'due'=>$due,'upcoming'=>$future,'mastered'=>$mastered,'total'=>$due+$future,'subjects'=>$subjects,'method'=>'1, 3, 7, 14, 30 days']);
 }
 if($route==='/v55/session/start'&&$method==='POST'){
  academy_rate_limit('v55-session-'.$uid,20,3600);$body=academy_body();$subject=(string)($body['subject']??'all');$limit=max(1,min(15,(int)($body['count']??10)));
  if($subject!=='all'&&!preg_match('/^[a-zA-Z0-9_-]{2,80}$/D',$subject))academy_v55_fail('invalid_subject');
  $rows=academy_v55_rows($uid);$ready=[];
  foreach($rows as $card){if(!is_array($card)||($card['dueAt']??0)>$now||($subject!=='all'&&($card['subject']??'')!==$subject)||!academy_v55_is_available($card,$profile,$user))continue;$ready[]=$card;}
  usort($ready,static fn($a,$b)=>(int)($a['dueAt']??0)<=>(int)($b['dueAt']??0));$ready=array_slice($ready,0,$limit);
  if(!$ready)academy_v55_fail('no_due_reviews',409);
  $sid=substr(str_replace('-','',academy_uuid()),0,24);$session=['id'=>$sid,'cardIds'=>array_column($ready,'id'),'scope'=>$scope,'createdAt'=>$now,'expiresAt'=>$now+3600000,'used'=>false];
  academy_write_node('learningV55/sessions/'.$uid.'/'.$sid,$session,$uid);
  academy_json(['ok'=>true,'sessionId'=>$sid,'questions'=>array_map('academy_v55_public_card',$ready),'expiresAt'=>$session['expiresAt']]);
 }
 if($route==='/v55/session/submit'&&$method==='POST'){
  academy_rate_limit('v55-submit-'.$uid,50,3600);$body=academy_body();$sid=(string)($body['sessionId']??'');$answers=$body['answers']??null;
  if(!preg_match('/^[a-f0-9]{24}$/D',$sid)||!is_array($answers)||!array_is_list($answers)||count($answers)>15)academy_v55_fail('invalid_answers');
  $sessionPath='learningV55/sessions/'.$uid.'/'.$sid;$cardsPath=academy_v55_store($uid);
  $locks=academy_acquire_data_locks($pdo,[$cardsPath,$sessionPath]);
  try{
   $session=academy_read_node($sessionPath);if(!is_array($session)||($session['scope']??null)!==$scope)academy_v55_fail('session_not_found',404);
   if(!empty($session['used']))academy_json(['ok'=>true,'reused'=>true,'report'=>$session['report']??null]);
   if(($session['expiresAt']??0)<$now)academy_v55_fail('session_expired',409);
   $ids=$session['cardIds']??[];if(count($answers)!==count($ids))academy_v55_fail('invalid_answers');
   $rows=academy_v55_rows($uid);$correct=0;$details=[];
   foreach($ids as $i=>$id){$card=$rows[$id]??null;$ans=$answers[$i];if(!is_array($card)||!academy_v55_is_available($card,$profile,$user)||!is_int($ans)||$ans<0||$ans>=count($card['options']))academy_v55_fail('invalid_answers');
    $ok=$ans===$card['correct'];if($ok)$correct++;
    $details[]=['id'=>$id,'question'=>$card['question'],'selected'=>$ans,'correct'=>$ok,'correctAnswer'=>$card['correct'],'explanation'=>$card['explanation']??''];
    $rows[$id]=academy_v55_schedule($card,$ok,$now);
   }
   $report=['correct'=>$correct,'total'=>count($ids),'percentage'=>count($ids)?(int)round($correct*100/count($ids)):0,'details'=>$details,'createdAt'=>$now];
   $session['used']=true;$session['report']=$report;unset($session['cardIds']);
   $pdo->beginTransaction();try{academy_delete_node_raw($pdo,$cardsPath);academy_insert_value_raw($pdo,$cardsPath,$rows,$uid);academy_delete_node_raw($pdo,$sessionPath);academy_insert_value_raw($pdo,$sessionPath,$session,$uid);$pdo->commit();}
   catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
   academy_audit($uid,'v55.remedial.complete',$sid,['correct'=>$correct,'total'=>count($ids)]);
   academy_json(['ok'=>true,'reused'=>false,'report'=>$report]);
  }finally{academy_release_data_locks($pdo,$locks);}
 }
 academy_v55_fail('not_found',404);
}
