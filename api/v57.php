<?php
/** V57 — typed, server-graded interactive quizzes (no new database tables). */
declare(strict_types=1);
function academy_v57_fail(string $err,int $status=422):never{academy_json(['ok'=>false,'error'=>$err],$status);}
function academy_v57_text(mixed $v,int $max=450):string{return is_string($v)?mb_substr(trim($v),0,$max):'';}
function academy_v57_items(mixed $raw,int $max=12):array {
 if(!is_array($raw)||!array_is_list($raw)||count($raw)<2||count($raw)>$max)throw new InvalidArgumentException('interactive_question_invalid');
 $out=[];foreach($raw as $item){$v=academy_v57_text($item,140);if($v==='')throw new InvalidArgumentException('interactive_question_invalid');$out[]=$v;}
 if(count(array_unique($out))!==count($out))throw new InvalidArgumentException('interactive_question_invalid');return $out;
}
function academy_v57_normalize(mixed $raw):array{
 if(!is_array($raw)||!array_is_list($raw)||count($raw)<1||count($raw)>60)throw new InvalidArgumentException('interactive_questions_invalid');
 $out=[];foreach($raw as $input){
  if(!is_array($input))throw new InvalidArgumentException('interactive_question_invalid');
  $type=(string)($input['type']??'');$text=academy_v57_text($input['question']??null,600);if($text===''||!in_array($type,['true_false','fill_blank','matching','ordering','essay','multiple_choice'],true))throw new InvalidArgumentException('interactive_question_invalid');
  $q=['type'=>$type,'question'=>$text,'hint'=>academy_v57_text($input['hint']??'',450)];
  if($type==='true_false'){if(!is_bool($input['correctAnswer']??null))throw new InvalidArgumentException('interactive_answer_invalid');$q['correctAnswer']=$input['correctAnswer'];}
  if($type==='fill_blank'){$rawAnswers=$input['acceptedAnswers']??[];if(!is_array($rawAnswers)||!array_is_list($rawAnswers)||count($rawAnswers)<1||count($rawAnswers)>7)throw new InvalidArgumentException('interactive_answer_invalid');$q['acceptedAnswers']=[];foreach($rawAnswers as $a){$t=academy_v57_text($a,180);if($t==='')throw new InvalidArgumentException('interactive_answer_invalid');$q['acceptedAnswers'][]=$t;}}
  if($type==='matching'){
   $rawPairs=$input['pairs']??null;if(!is_array($rawPairs)||!array_is_list($rawPairs)||count($rawPairs)<2||count($rawPairs)>8)throw new InvalidArgumentException('interactive_answer_invalid');$pairs=[];
   foreach($rawPairs as $pair){if(!is_array($pair))throw new InvalidArgumentException('interactive_answer_invalid');$l=academy_v57_text($pair['left']??null,140);$r=academy_v57_text($pair['right']??null,140);if($l===''||$r==='')throw new InvalidArgumentException('interactive_answer_invalid');$pairs[]=['left'=>$l,'right'=>$r];}
   if(count(array_unique(array_column($pairs,'left')))!==count($pairs)||count(array_unique(array_column($pairs,'right')))!==count($pairs))throw new InvalidArgumentException('interactive_answer_invalid');$q['pairs']=$pairs;
  }
  if($type==='ordering')$q['items']=academy_v57_items($input['items']??[],10);
  if($type==='essay'){$rubric=academy_v57_text($input['rubric']??'',800);if($rubric==='')throw new InvalidArgumentException('interactive_answer_invalid');$q['rubric']=$rubric;}
  if($type==='multiple_choice'){$q['options']=academy_v57_items($input['options']??[],6);$a=$input['correctAnswer']??null;if(!is_int($a)||$a<0||$a>=count($q['options']))throw new InvalidArgumentException('interactive_answer_invalid');$q['correctAnswer']=$a;}
  $out[]=$q;
 }
 return $out;
}
function academy_v57_permuted(array $items,string $seed):array{
 $entries=[];foreach($items as $i=>$value)$entries[]=['id'=>$i,'text'=>$value,'sort'=>hash('sha256',$seed.'|'.$i.'|'.$value)];
 usort($entries,static fn($a,$b)=>strcmp($a['sort'],$b['sort']));
 return array_values(array_map(static fn($e)=>$e['text'],$entries));
}
function academy_v57_public_questions(mixed $raw):array{
 $out=[];foreach(academy_v57_normalize($raw) as $q){$type=$q['type'];$public=['type'=>$type,'question'=>$q['question']];
  if($type==='multiple_choice')$public['options']=$q['options'];
  if($type==='matching'){$public['lefts']=array_column($q['pairs'],'left');$public['rights']=academy_v57_permuted(array_column($q['pairs'],'right'),$q['question']);}
  if($type==='ordering')$public['items']=academy_v57_permuted($q['items'],$q['question']);
  $out[]=$public;
 }
 return $out;
}
function academy_v57_norm_answer(string $v):string {return mb_strtolower(preg_replace('/\s+/u',' ',trim($v)));}
function academy_v57_grade(array $questions,mixed $answers):array{
 if(!is_array($answers)||!array_is_list($answers)||count($answers)!==count($questions))throw new InvalidArgumentException('interactive_answers_invalid');
 $correct=0;$pending=0;$review=[];
 foreach($questions as $i=>$q){$ans=$answers[$i];$type=$q['type'];$ok=false;$expected=null;
  if($type==='true_false'){if(!is_bool($ans))throw new InvalidArgumentException('interactive_answers_invalid');$ok=$ans===$q['correctAnswer'];$expected=$q['correctAnswer'];}
  if($type==='multiple_choice'){if(!is_int($ans)||$ans<0||$ans>=count($q['options']))throw new InvalidArgumentException('interactive_answers_invalid');$ok=$ans===$q['correctAnswer'];$expected=$q['options'][$q['correctAnswer']];}
  if($type==='fill_blank'){if(!is_string($ans)||mb_strlen($ans)<1||mb_strlen($ans)>180)throw new InvalidArgumentException('interactive_answers_invalid');$ok=in_array(academy_v57_norm_answer($ans),array_map('academy_v57_norm_answer',$q['acceptedAnswers']),true);$expected=$q['acceptedAnswers'][0];}
  if($type==='essay'){if(!is_string($ans)||mb_strlen(trim($ans))<2||mb_strlen($ans)>4000)throw new InvalidArgumentException('interactive_answers_invalid');$pending++;}
  if(in_array($type,['matching','ordering'],true)){
   $visible=$type==='matching'?academy_v57_permuted(array_column($q['pairs'],'right'),$q['question']):academy_v57_permuted($q['items'],$q['question']);
   if(!is_array($ans)||!array_is_list($ans)||count($ans)!==count($visible))throw new InvalidArgumentException('interactive_answers_invalid');
   $seen=[];foreach($ans as $a)if(!is_int($a)||$a<0||$a>=count($visible)||isset($seen[$a]))throw new InvalidArgumentException('interactive_answers_invalid');else $seen[$a]=true;
   $given=array_map(static fn($a)=>$visible[$a],$ans);
   $expected=$type==='matching'?array_column($q['pairs'],'right'):$q['items'];$ok=$given===$expected;
  }
  if($ok)$correct++;
  $displayAnswer=$ans;if($type==='multiple_choice')$displayAnswer=$q['options'][$ans];if(in_array($type,['matching','ordering'],true))$displayAnswer=$given;
  $review[]=['question'=>$q['question'],'type'=>$type,'selected'=>$displayAnswer,'isCorrect'=>$type==='essay'?null:$ok,'correct'=>$type==='essay'?null:$expected,'hint'=>$type==='essay'?null:$q['hint']];
 }
 $total=count($questions);return ['score'=>$correct,'questions'=>$total,'pendingEssays'=>$pending,'percentage'=>$pending>0?null:(int)round(100*$correct/$total),'review'=>$review];
}
function academy_v57_can_grade(array $user,string $teacherId):bool{return $user['primary_role']==='admin'||($user['primary_role']==='teacher'&&$teacherId!==''&&$teacherId===$user['id']&&academy_teacher_is_active_profile($teacherId));}
function academy_v57_lock(PDO $pdo,string $uid):string{$name='ac:v57:'.sha1($uid);if((int)$pdo->query('SELECT GET_LOCK('.$pdo->quote($name).',5)')->fetchColumn()!==1)academy_v57_fail('busy',409);return $name;}
/** One database transaction for all state derived from a single attempt. */
function academy_v57_commit(PDO $pdo,array $writes,string $uid):void{
 $locks=academy_acquire_data_locks($pdo,array_keys($writes));
 try{
  $pdo->beginTransaction();
  try{
   foreach($writes as $path=>$value){academy_delete_node_raw($pdo,$path);if($value!==null)academy_insert_value_raw($pdo,$path,$value,$uid);}
   $pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v57_route(string $route,string $method,PDO $pdo):void {
 if(!str_starts_with($route,'/v57/'))return;
 $user=academy_current_user(true);$uid=(string)$user['id'];
 if($route==='/v57/create'&&$method==='POST'){
  if(!in_array($user['primary_role'],['admin','teacher'],true))academy_v57_fail('forbidden',403);
  academy_rate_limit('v57-create-'.$uid,30,3600);
  $b=academy_body();$lessonId=(string)($b['lessonId']??'');$lesson=academy_read_node('lessons/'.$lessonId);
  if(!preg_match('/^[\w-]{2,120}$/D',$lessonId)||!is_array($lesson))academy_v57_fail('lesson_not_found',404);
  if($user['primary_role']==='teacher'&&(!academy_teacher_is_active_profile($uid)||!academy_teacher_scope_allowed($uid,$lesson)))academy_v57_fail('lesson_not_allowed',403);
  try{$questions=academy_v57_normalize($b['questions']??null);}catch(InvalidArgumentException $e){academy_v57_fail($e->getMessage());}
  $title=academy_v57_text($b['title']??'اختبار تفاعلي',150);if($title==='')academy_v57_fail('title_required');$now=academy_now_ms();
  if($user['primary_role']==='teacher'){
   $teacher=academy_read_node('teacherProfiles/'.$uid);
   $quiz=['title'=>$title,'questions'=>$questions,'assessmentMode'=>'interactive','teacherId'=>$uid,'teacherName'=>$teacher['name']??$user['display_name'],'updatedAt'=>$now,'isFree'=>($lesson['isFree']??false)===true,'active'=>true];
   $subid=substr(str_replace('-','',academy_uuid()),0,22);
   $submission=['submissionKind'=>'teacherQuizV6','status'=>'pending','teacherId'=>$uid,'teacherName'=>$quiz['teacherName'],'lessonId'=>$lessonId,'title'=>$title,'quiz'=>$quiz,'type'=>$lesson['type']??'public','stage'=>$lesson['stage']??'','grade'=>(string)($lesson['grade']??''),'subject'=>$lesson['subject']??'','createdAt'=>$now];
   academy_write_node('teacherSubmissions/'.$uid.'/'.$subid,$submission,$uid);academy_audit($uid,'v57.quiz.pending',$subid);academy_json(['ok'=>true,'pending'=>true,'submissionId'=>$subid]);
  }
  $editId=(string)($b['quizId']??'');$previous=null;
  if($editId!==''){
   if(!preg_match('/^[a-zA-Z0-9_-]{2,100}$/D',$editId))academy_v57_fail('quiz_request_invalid');
   $previous=academy_read_node('quizzes/'.$editId);
   if(!is_array($previous)||($previous['assessmentMode']??'')!=='interactive'||($previous['lessonId']??'')!==$lessonId)academy_v57_fail('quiz_not_found',404);
  }
  $id=$editId!==''?$editId:substr(str_replace('-','',academy_uuid()),0,22);
  $quiz=['id'=>$id,'name'=>$title,'title'=>$title,'lessonId'=>$lessonId,'type'=>$lesson['type']??'public','stage'=>$lesson['stage']??'','grade'=>$lesson['grade']??'','subject'=>$lesson['subject']??'','assessmentMode'=>'interactive','questions'=>$questions,'isFree'=>($previous['isFree']??($lesson['isFree']??false))===true,'isHidden'=>$previous['isHidden']??false,'workflowStatus'=>$previous['workflowStatus']??'published','reviewStatus'=>$previous['reviewStatus']??'approved','createdAt'=>$previous['createdAt']??$now,'updatedAt'=>max($now,(int)($previous['updatedAt']??0)+1)];
  academy_write_node('quizzes/'.$id,$quiz,$uid);academy_audit($uid,'v57.quiz.create',$id);academy_json(['ok'=>true,'quizId'=>$id]);
 }
 if($route==='/v57/submit'&&$method==='POST'){
  if($user['primary_role']!=='student')academy_v57_fail('forbidden',403);
  $b=academy_body();$lessonId=(string)($b['lessonId']??'');$quizId=(string)($b['quizId']??'');$teacherId=(string)($b['teacherId']??'');$attemptId=(string)($b['attemptId']??'');$sourceType=(string)($b['sourceType']??'');
  foreach([$lessonId,$quizId,$attemptId] as $id)if(!preg_match('/^[a-zA-Z0-9_-]{2,180}$/D',$id))academy_v57_fail('request_invalid');
  if(!in_array($sourceType,['standalone','teacher'],true)||strlen($attemptId)<8||strlen($attemptId)>80)academy_v57_fail('request_invalid');
  $ans=$b['answers']??null;if(!is_array($ans)||!array_is_list($ans))academy_v57_fail('answers_invalid');$finger=hash('sha256',json_encode($ans,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
  $lock=academy_v57_lock($pdo,$uid);try{
   $historyPath='studentProfilesV3/'.$uid.'/quizHistory/'.$attemptId;
   $existing=academy_read_node($historyPath);
   if(is_array($existing)){
    if(($existing['quizId']??'')!==$quizId||($existing['lessonId']??'')!==$lessonId||($existing['sourceType']??'')!==$sourceType||($existing['v57Hash']??'')!==$finger)academy_v57_fail('attempt_conflict',409);
    $review=academy_read_node('v57ReviewsV1/'.$uid.'/'.$attemptId);
    academy_json(['ok'=>true,'reused'=>true,'result'=>$existing,'review'=>$review,'pendingEssays'=>(int)($existing['pendingEssays']??0)]);
   }
   $lesson=academy_read_node('lessons/'.$lessonId);$profile=academy_read_node('studentProfilesV3/'.$uid);
   if(!is_array($lesson)||!academy_content_visible_to_reader($user,$lesson)||!academy_student_can_access_content($user,$lesson,'lessons/'.$lessonId))academy_v57_fail('lesson_not_found',404);
   if(!is_array($profile)||!academy_scope_matches($lesson,$profile))academy_v57_fail('lesson_scope_mismatch',403);
   $source=null;$owner='';
   if($sourceType==='standalone'){$source=academy_read_node('quizzes/'.$quizId);if(!is_array($source)||($source['lessonId']??'')!==$lessonId||!academy_content_visible_to_reader($user,$source)||!academy_student_can_access_content($user,$source,'quizzes/'.$quizId))academy_v57_fail('quiz_not_found',404);}
   else{
    if(!preg_match('/^[a-zA-Z0-9_-]{2,120}$/D',$teacherId)||$quizId!=='teacher_'.$teacherId.'_'.$lessonId)academy_v57_fail('quiz_not_found',404);
    $pack=academy_read_node('teacherContentsV6/'.$lessonId.'/'.$teacherId);
    if(!is_array($pack)||!is_array(academy_public_teacher_package($lessonId,$teacherId,$pack,$user,$lesson)))academy_v57_fail('quiz_not_found',404);
    $source=$pack['quiz']??null;$owner=$teacherId;
   }
   if(!is_array($source)||($source['assessmentMode']??'')!=='interactive')academy_v57_fail('quiz_not_found',404);
   if((int)($source['updatedAt']??0)!==(int)($b['sourceVersion']??-1))academy_v57_fail('quiz_changed',409);
   try{$questions=academy_v57_normalize($source['questions']??null);$grade=academy_v57_grade($questions,$ans);}catch(InvalidArgumentException $e){academy_v57_fail('answers_invalid');}
   academy_rate_limit('v57-submit-'.$uid,50,3600);
   $now=academy_now_ms();$pending=(int)$grade['pendingEssays'];$result=['attemptId'=>$attemptId,'quizId'=>$quizId,'lessonId'=>$lessonId,'title'=>academy_v57_text($source['title']??'اختبار تفاعلي',150),'sourceType'=>$sourceType,'teacherId'=>$owner,'type'=>$lesson['type']??'public','stage'=>$lesson['stage']??'','grade'=>$lesson['grade']??'','subject'=>$lesson['subject']??'','score'=>$grade['score'],'questions'=>$grade['questions'],'percentage'=>$grade['percentage'],'pendingEssays'=>$pending,'status'=>$pending?'pending_review':'graded','at'=>$now,'createdAt'=>$now,'v57Hash'=>$finger];
   $review=$grade['review'];
   // Publish only the summary to progress screens; essay answers stay in a server-owned queue.
   $writes=[$historyPath=>$result,'v57ReviewsV1/'.$uid.'/'.$attemptId=>$review];
   if(!$pending)$writes['studentProfilesV3/'.$uid.'/quizResultsV22/'.$quizId]=$result;
   if($pending){
    $queueOwner=$owner!==''?$owner:'admin';$pendingRows=[];
    foreach($questions as $i=>$q)if($q['type']==='essay')$pendingRows[]=['index'=>$i,'question'=>$q['question'],'rubric'=>$q['rubric'],'answer'=>$ans[$i]];
    $writes['v57PendingV1/'.$queueOwner.'/'.$attemptId]=['studentId'=>$uid,'quizId'=>$quizId,'lessonId'=>$lessonId,'title'=>$result['title'],'autoScore'=>$result['score'],'totalQuestions'=>$result['questions'],'essays'=>$pendingRows,'at'=>$now];
   }
   academy_v57_commit($pdo,$writes,$uid);
   academy_audit($uid,'v57.quiz.submit',$attemptId,['quizId'=>$quizId,'pendingEssays'=>$pending]);
   academy_json(['ok'=>true,'result'=>$result,'review'=>$review,'pendingEssays'=>$pending]);
  }finally{$pdo->query('SELECT RELEASE_LOCK('.$pdo->quote($lock).')');}
 }
 if($route==='/v57/pending'&&$method==='GET'){
  if(!in_array($user['primary_role'],['admin','teacher'],true))academy_v57_fail('forbidden',403);
  $rows=[];$isAdmin=$user['primary_role']==='admin';
  $all=$isAdmin?academy_read_node('v57PendingV1'):[$uid=>academy_read_node('v57PendingV1/'.$uid)];
  if(is_array($all))foreach($all as $owner=>$entries){if(!$isAdmin&&$owner!==$uid)continue;if(!is_array($entries))continue;foreach($entries as $id=>$entry)if(is_array($entry))$rows[]=['attemptId'=>$id,'teacherId'=>$owner,'title'=>$entry['title']??'اختبار تفاعلي','essays'=>$entry['essays']??[],'at'=>$entry['at']??0];}
  usort($rows,static fn($a,$b)=>(int)($b['at']??0)<=>(int)($a['at']??0));academy_json(['ok'=>true,'items'=>array_slice($rows,0,100)]);
 }
 if($route==='/v57/grade'&&$method==='POST'){
  $b=academy_body();$attempt=(string)($b['attemptId']??'');$owner=(string)($b['teacherId']??'');$marks=$b['marks']??null;
  if(!academy_v57_can_grade($user,$owner)||!preg_match('/^[a-zA-Z0-9_-]{8,80}$/D',$attempt)||!is_array($marks)||!array_is_list($marks))academy_v57_fail('forbidden',403);
  $path='v57PendingV1/'.$owner.'/'.$attempt;$pending=academy_read_node($path);if(!is_array($pending))academy_v57_fail('review_not_found',404);
  $studentId=(string)($pending['studentId']??'');$essays=$pending['essays']??[];if(count($marks)!==count($essays))academy_v57_fail('grade_invalid');foreach($marks as $m)if(!is_int($m)||!in_array($m,[0,1],true))academy_v57_fail('grade_invalid');
  $lock=academy_v57_lock($pdo,$studentId);try{
   $pending=academy_read_node($path);if(!is_array($pending))academy_v57_fail('review_not_found',404);
   $historyPath='studentProfilesV3/'.$studentId.'/quizHistory/'.$attempt;$result=academy_read_node($historyPath);$review=academy_read_node('v57ReviewsV1/'.$studentId.'/'.$attempt);
   if(!is_array($result)||!is_array($review)||($result['status']??'')!=='pending_review')academy_v57_fail('review_not_found',404);
   foreach($essays as $i=>$item){$ix=(int)$item['index'];$review[$ix]['isCorrect']=$marks[$i]===1;$review[$ix]['correct']=$item['rubric'];$review[$ix]['selected']=$item['answer'];}
   $result['score']=(int)$pending['autoScore']+array_sum($marks);$result['percentage']=(int)round(100*$result['score']/max(1,(int)$result['questions']));$result['pendingEssays']=0;$result['status']='graded';$result['gradedBy']=$uid;$result['gradedAt']=academy_now_ms();
   $latestPath='studentProfilesV3/'.$studentId.'/quizResultsV22/'.$result['quizId'];$latest=academy_read_node($latestPath);
   $writes=[$historyPath=>$result,'v57ReviewsV1/'.$studentId.'/'.$attempt=>$review,$path=>null];
   if(!is_array($latest)||($latest['attemptId']??'')===$attempt||(int)($latest['at']??0)<=(int)($result['at']??0))$writes[$latestPath]=$result;
   academy_v57_commit($pdo,$writes,$uid);
   academy_audit($uid,'v57.essay.grade',$attempt,['studentId'=>$studentId]);academy_json(['ok'=>true,'result'=>$result]);
  }finally{$pdo->query('SELECT RELEASE_LOCK('.$pdo->quote($lock).')');}
 }
 academy_v57_fail('route_not_found',404);
}
