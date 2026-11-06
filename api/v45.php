<?php
/** V45 – academic years, safe content copying, visibility, and quiz attempt policy. */
declare(strict_types=1);
function academy_v45_years(): array {
 $raw=academy_read_node('academicYearsV45');return is_array($raw)?$raw:[];
}
function academy_v45_year_id(string $id): bool {
 if(!preg_match('/^(20[0-9]{2})-(20[0-9]{2})$/D',$id,$m))return false;
 return (int)$m[2]===(int)$m[1]+1;
}
function academy_v45_items(string $root): array {
 $raw=academy_read_node($root);return is_array($raw)?$raw:[];
}
function academy_v45_scope(array $item,array $scope): bool {
 foreach(['type','stage','grade','subject'] as $key){
  $got=(string)($item[$key]??($key==='type'?'public':''));
  if($got!==$scope[$key])return false;
 }
 return true;
}
function academy_v45_summary(string $root): array {
 $list=[];foreach(academy_v45_items($root) as $id=>$row){
  if(!is_array($row)||!preg_match('/^[a-zA-Z0-9_-]{2,130}$/D',(string)$id))continue;
  $list[]=['id'=>(string)$id,'title'=>(string)($row['title']??$row['name']??$id),'year'=>(string)($row['academicYear']??''),'type'=>(string)($row['type']??'public'),'stage'=>(string)($row['stage']??''),'grade'=>(string)($row['grade']??''),'subject'=>(string)($row['subject']??''),'lessonId'=>(string)($row['lessonId']??''),'hidden'=>($row['isHidden']??false)===true,'draft'=>($row['workflowStatus']??'')==='draft','maxAttempts'=>(int)($row['v45Options']['maxAttempts']??0),'shuffleQuestions'=>($row['v45Options']['shuffleQuestions']??false)===true,'shuffleAnswers'=>($row['v45Options']['shuffleAnswers']??false)===true];
 }
 return $list;
}
function academy_v45_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v45/'))return;
 $user=academy_current_user(true);
 if($user['primary_role']!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
 if($route==='/v45/admin/overview'&&$method==='GET'){
  academy_json(['ok'=>true,'years'=>academy_v45_years(),'lessons'=>academy_v45_summary('lessons'),'quizzes'=>academy_v45_summary('quizzes'),'files'=>academy_v45_summary('files')]);
 }
 if($method!=='POST')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
 academy_rate_limit('v45-admin-'.$user['id'],120,3600);
 $b=academy_body();$now=academy_now_ms();
 if($route==='/v45/admin/years/save'){
  $id=trim((string)($b['id']??''));$title=trim((string)($b['title']??''));
  if(!academy_v45_year_id($id)||$title===''||mb_strlen($title)>100)academy_json(['ok'=>false,'error'=>'invalid_year'],422);
  $lock='academy:v45:years';$locks=academy_acquire_data_locks($pdo,['academicYearsV45']);
  try{$pdo->beginTransaction();try{
   $years=academy_v45_years();$old=$years[$id]??null;
   if(is_array($old)&&($old['archived']??false))academy_json(['ok'=>false,'error'=>'year_archived'],409);
   $years[$id]=['id'=>$id,'title'=>$title,'archived'=>false,'active'=>is_array($old)?(bool)($old['active']??false):!array_filter($years,fn($y)=>is_array($y)&&($y['active']??false)),'createdAt'=>is_array($old)?($old['createdAt']??$now):$now,'updatedAt'=>$now];
   academy_delete_node_raw($pdo,'academicYearsV45');academy_insert_value_raw($pdo,'academicYearsV45',$years,$user['id']);$pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
  finally{academy_release_data_locks($pdo,$locks);}academy_audit($user['id'],'v45.year.save',$id);academy_json(['ok'=>true,'years'=>academy_v45_years()]);
 }
 if($route==='/v45/admin/years/decision'){
  $id=(string)($b['id']??'');$action=(string)($b['action']??'');
  if(!academy_v45_year_id($id)||!in_array($action,['activate','archive','restore'],true))academy_json(['ok'=>false,'error'=>'invalid_action'],422);
  $locks=academy_acquire_data_locks($pdo,['academicYearsV45']);
  try{$pdo->beginTransaction();try{
   $years=academy_v45_years();if(!is_array($years[$id]??null))academy_json(['ok'=>false,'error'=>'year_not_found'],404);
   if($action==='activate'){
    if(($years[$id]['archived']??false)===true)academy_json(['ok'=>false,'error'=>'year_archived'],409);
    foreach($years as &$row)if(is_array($row))$row['active']=false;unset($row);$years[$id]['active']=true;
   }elseif($action==='archive'){$years[$id]['archived']=true;$years[$id]['active']=false;}
   else{$years[$id]['archived']=false;}
   $years[$id]['updatedAt']=$now;academy_delete_node_raw($pdo,'academicYearsV45');academy_insert_value_raw($pdo,'academicYearsV45',$years,$user['id']);$pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
  finally{academy_release_data_locks($pdo,$locks);}academy_audit($user['id'],'v45.year.'.$action,$id);academy_json(['ok'=>true,'years'=>academy_v45_years()]);
 }
 if($route==='/v45/admin/visibility'){
  $root=['lesson'=>'lessons','quiz'=>'quizzes','file'=>'files'][(string)($b['kind']??'')]??null;$id=(string)($b['id']??'');
  if(!$root||!preg_match('/^[a-zA-Z0-9_-]{2,130}$/D',$id)||!is_bool($b['hidden']??null))academy_json(['ok'=>false,'error'=>'invalid_content'],422);
  $path=$root.'/'.$id;$locks=academy_acquire_data_locks($pdo,[$path]);
  try{$pdo->beginTransaction();try{$row=academy_read_node($path);if(!is_array($row))academy_json(['ok'=>false,'error'=>'content_not_found'],404);$row['isHidden']=$b['hidden'];$row['updatedAt']=$now;academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$row,$user['id']);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}}
  finally{academy_release_data_locks($pdo,$locks);}academy_audit($user['id'],'v45.visibility',$path,['hidden'=>$b['hidden']]);academy_json(['ok'=>true,'hidden'=>$b['hidden']]);
 }
 if($route==='/v45/admin/quiz/options'){
  $id=(string)($b['id']??'');$attempts=filter_var($b['maxAttempts']??null,FILTER_VALIDATE_INT);
  if(!preg_match('/^[a-zA-Z0-9_-]{2,130}$/D',$id)||$attempts===false||$attempts===null||$attempts<0||$attempts>20)academy_json(['ok'=>false,'error'=>'invalid_quiz_options'],422);
  $path='quizzes/'.$id;$locks=academy_acquire_data_locks($pdo,[$path]);
  try{$pdo->beginTransaction();try{$row=academy_read_node($path);if(!is_array($row))academy_json(['ok'=>false,'error'=>'quiz_not_found'],404);$row['v45Options']=['maxAttempts'=>$attempts,'shuffleQuestions'=>($b['shuffleQuestions']??false)===true,'shuffleAnswers'=>($b['shuffleAnswers']??false)===true];$row['updatedAt']=$now;academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$row,$user['id']);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}}
  finally{academy_release_data_locks($pdo,$locks);}academy_audit($user['id'],'v45.quiz.options',$id,['maxAttempts'=>$attempts,'shuffleQuestions'=>$row['v45Options']['shuffleQuestions'],'shuffleAnswers'=>$row['v45Options']['shuffleAnswers']]);academy_json(['ok'=>true,'maxAttempts'=>$attempts]);
 }
 if($route==='/v45/admin/copy/scope'){
  $from=(string)($b['sourceYear']??'');$to=(string)($b['targetYear']??'');$years=academy_v45_years();
  // Legacy items have no year field. Explicit opt-in to copy them avoids accidental duplication.
  if(($from!==''&&!academy_v45_year_id($from))||!academy_v45_year_id($to)||$from===$to||!is_array($years[$to]??null)||($years[$to]['archived']??false)===true||($from!==''&&!is_array($years[$from]??null)))academy_json(['ok'=>false,'error'=>'year_invalid'],422);
  $scope=['type'=>(string)($b['type']??''),'stage'=>(string)($b['stage']??''),'grade'=>(string)($b['grade']??''),'subject'=>(string)($b['subject']??'')];
  if(!in_array($scope['type'],['public','azhar'],true)||!in_array($scope['stage'],['primary','prep','sec'],true)||!in_array($scope['grade'],['1','2','3','4','5','6'],true)||!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$scope['subject'])||(int)$scope['grade']>($scope['stage']==='primary'?6:3))academy_json(['ok'=>false,'error'=>'scope_invalid'],422);
  $withQuizzes=($b['includeQuizzes']??true)===true;$withFiles=($b['includeFiles']??true)===true;
  $lessons=array_filter(academy_v45_items('lessons'),fn($l)=>is_array($l)&&academy_v45_scope($l,$scope)&&(string)($l['academicYear']??'')===$from);
  if(count($lessons)>60)academy_json(['ok'=>false,'error'=>'copy_limit_60_lessons'],422);
  if(!$lessons)academy_json(['ok'=>false,'error'=>'no_lessons_for_scope'],422);
  $quizzes=academy_v45_items('quizzes');$files=academy_v45_items('files');
  $copyId=(string)($b['copyId']??'');if(!preg_match('/^[a-zA-Z0-9_-]{10,100}$/D',$copyId))academy_json(['ok'=>false,'error'=>'copy_id_required'],422);
  $fingerprint=hash('sha256',json_encode([$from,$to,$scope,$withQuizzes,$withFiles],JSON_THROW_ON_ERROR));
  $jobPath='v45CopyJobs/'.$user['id'].'/'.$copyId;
  $matchedQuizzes=0;$matchedFiles=0;
  foreach(['quizzes'=>$quizzes,'files'=>$files]as$kind=>$rows){foreach($rows as$r){if(!is_array($r)||!academy_v45_scope($r,$scope)||(string)($r['academicYear']??'')!==$from||!array_key_exists((string)($r['lessonId']??''),$lessons))continue;if($kind==='quizzes')$matchedQuizzes++;else $matchedFiles++;}}
  if(($withQuizzes&&$matchedQuizzes>180)||($withFiles&&$matchedFiles>180))academy_json(['ok'=>false,'error'=>'copy_scope_too_large'],422);
  $map=[];$created=['lessons'=>[],'quizzes'=>[],'files'=>[]];$replayed=null;
  $locks=academy_acquire_data_locks($pdo,['v45CopyLock']);
  try{ $seen=academy_read_node($jobPath);
   if(is_array($seen)){if(($seen['fingerprint']??'')!==$fingerprint)academy_json(['ok'=>false,'error'=>'copy_request_conflict'],409);$replayed=$seen['created']??[];}
   else{ $pdo->beginTransaction();try{
   foreach($lessons as $id=>$row){if(!is_array($row))continue;$newId='v45_'.str_replace('-','',academy_uuid());$map[(string)$id]=$newId;
    $copy=$row;$copy['id']=$newId;$copy['academicYear']=$to;$copy['copiedFrom']=(string)$id;$copy['copiedAt']=$now;$copy['createdAt']=$now;$copy['updatedAt']=$now;$copy['isHidden']=true;$copy['workflowStatus']='draft';$copy['reviewStatus']='pending';unset($copy['viewCount'],$copy['ratingCount'],$copy['ratingTotal'],$copy['completedCount'],$copy['studentCount']);
    $path='lessons/'.$newId;academy_insert_value_raw($pdo,$path,$copy,$user['id']);$created['lessons'][]=$newId;
   }
   foreach(['quizzes'=>$withQuizzes,'files'=>$withFiles] as $root=>$include){if(!$include)continue;
    foreach(($root==='quizzes'?$quizzes:$files)as $id=>$row){if(!is_array($row)||!academy_v45_scope($row,$scope)||(string)($row['academicYear']??'')!==$from)continue;
     $lid=(string)($row['lessonId']??'');if($lid!==''&&!isset($map[$lid]))continue;
     // Only copy attached assessments/files. Prevent picking up unrelated global assets.
     if($lid==='')continue;
     $newId='v45_'.str_replace('-','',academy_uuid());$copy=$row;$copy['id']=$newId;$copy['lessonId']=$map[$lid];$copy['academicYear']=$to;$copy['copiedFrom']=(string)$id;$copy['copiedAt']=$now;$copy['createdAt']=$now;$copy['updatedAt']=$now;$copy['isHidden']=true;
     if($root==='quizzes'){$copy['workflowStatus']='draft';$copy['reviewStatus']='pending';}
     academy_insert_value_raw($pdo,$root.'/'.$newId,$copy,$user['id']);$created[$root][]=$newId;
    }
   }
   academy_insert_value_raw($pdo,$jobPath,['fingerprint'=>$fingerprint,'created'=>$created,'createdAt'=>$now],$user['id']);
   $pdo->commit();
  }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;} }
  }finally{academy_release_data_locks($pdo,$locks);}
  if($replayed!==null)academy_json(['ok'=>true,'replayed'=>true,'created'=>$replayed,'counts'=>array_map('count',$replayed)]);
  academy_audit($user['id'],'v45.copy.scope',$from.'->'.$to,['scope'=>$scope,'counts'=>array_map('count',$created)]);
  academy_json(['ok'=>true,'created'=>$created,'counts'=>array_map('count',$created)]);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
/** Called *inside* the existing student-wide quiz submission lock, after idempotent replay. */
function academy_v45_check_quiz_limit(string $studentId,string $quizId,?array $source): void {
 $opts=is_array($source)?($source['v45Options']??null):null;
 $max=is_array($opts)?(int)($opts['maxAttempts']??0):0;
 if($max<1)return;
 $history=academy_read_node('studentProfilesV3/'.$studentId.'/quizHistory');$taken=0;
 if(is_array($history))foreach($history as $attempt){if(is_array($attempt)&&(string)($attempt['quizId']??'')===$quizId)$taken++;}
 if($taken>=$max)academy_json(['ok'=>false,'error'=>'v45_attempt_limit','used'=>$taken,'maxAttempts'=>$max],409);
}

/** Validate and apply display permutations on the server before scoring. */
function academy_v45_permutation(mixed $raw,int $size): array {
 if(!is_array($raw)||!array_is_list($raw)||count($raw)!==$size)throw new InvalidArgumentException('v45_order_invalid');
 if($size<1||$size>100)return [];
 $found=[];foreach($raw as $ix){if(!is_int($ix)||$ix<0||$ix>=$size||isset($found[$ix]))throw new InvalidArgumentException('v45_order_invalid');$found[$ix]=true;}
 return $raw;
}
function academy_v45_display_questions(array $questions,?array $source,array $body): array {
 $opts=is_array($source)?($source['v45Options']??[]):[];
 $shuffleQ=($opts['shuffleQuestions']??false)===true;
 $shuffleA=($opts['shuffleAnswers']??false)===true;
 $rawQ=$body['questionOrder']??null;$rawA=$body['optionOrders']??null;
 if($shuffleQ){$indexes=academy_v45_permutation($rawQ,count($questions));$questions=array_map(fn($idx)=>$questions[$idx],$indexes);}
 elseif($rawQ!==null)throw new InvalidArgumentException('v45_order_invalid');
 if($shuffleA){if(!is_array($rawA)||!array_is_list($rawA)||count($rawA)!==count($questions))throw new InvalidArgumentException('v45_order_invalid');
  foreach($questions as $i=>&$q){$perm=academy_v45_permutation($rawA[$i],count($q['options']));$original=$q['options'];$oldCorrect=$q['correct'];$q['options']=array_map(fn($idx)=>$original[$idx],$perm);$q['correct']=array_search($oldCorrect,$perm,true);}
  unset($q);
 }elseif($rawA!==null)throw new InvalidArgumentException('v45_order_invalid');
 return $questions;
}
function academy_v45_assert_retry_order(array $saved,array $body): void {
 foreach(['questionOrder','optionOrders']as $key){$savedValue=$saved['v45Orders'][$key]??null;$received=$body[$key]??null;if($savedValue!==$received)throw new DomainException('attempt_conflict');}
}
