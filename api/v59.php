<?php
/** V59: Evidence-based automatic milestones, extending (not replacing) V46 manual badges. */
declare(strict_types=1);

function academy_v59_catalog(): array {
 return [
  'first_quiz'=>['name'=>'أول اختبار','description'=>'أتممت اختبارًا مصححًا في صفك','icon'=>'📝','metric'=>'quizzes','target'=>1],
  'quiz_ten'=>['name'=>'عشرة اختبارات','description'=>'أتممت 10 محاولات اختبار مصححة','icon'=>'🎯','metric'=>'quizzes','target'=>10],
  'high_score'=>['name'=>'نجم التفوق','description'=>'حصلت على 90% أو أكثر في اختبار مصحح','icon'=>'🌟','metric'=>'excellent','target'=>1],
  'five_lessons'=>['name'=>'متدرّب على 5 دروس','description'=>'أنهيت اختبارات مصححة لخمسة دروس مختلفة','icon'=>'📚','metric'=>'lessons','target'=>5],
  'three_days'=>['name'=>'ثلاثة أيام من المثابرة','description'=>'أديت اختبارات مصححة في ثلاثة أيام متتالية','icon'=>'🔥','metric'=>'streak','target'=>3],
  'review_master'=>['name'=>'بطل المراجعة','description'=>'أتقنت 3 بطاقات بمراجعة متباعدة حتى المستوى الخامس','icon'=>'🧠','metric'=>'mastered','target'=>3],
 ];
}
function academy_v59_scope_key(array $scope): string {
 return implode('-',[$scope['educationType'],$scope['stage'],$scope['grade']]);
}
function academy_v59_metrics(array $history,array $cards,array $scope): array {
 $count=0;$quizIds=[];$lessonIds=[];$days=[];$excellent=0;$cutoff=0;
 // Limit work for shared-hosting accounts; no partial counting with fabricated evidence.
 $recent=array_slice($history,-1500,null,true);
 foreach($recent as $row){
  if(!is_array($row)||($row['type']??'')!==$scope['educationType']||($row['stage']??'')!==$scope['stage']||(string)($row['grade']??'')!==$scope['grade'])continue;
  if(($row['status']??'')==='pending_review'||(int)($row['pendingEssays']??0)>0)continue;
  $qid=(string)($row['quizId']??'');$lid=(string)($row['lessonId']??'');
  $pct=$row['percentage']??null;$total=$row['questions']??null;$ts=$row['at']??$row['createdAt']??0;
  if($qid===''||$lid===''||!is_numeric($pct)||!is_numeric($total)||(int)$total<1||(int)$total>1000||!is_numeric($ts)||(int)$ts<1000000000000||($pct<0)||($pct>100))continue;
  $count++;$quizIds[$qid]=true;$lessonIds[$lid]=true;if((float)$pct>=90)$excellent++;
  $date=gmdate('Y-m-d',(int)floor(((int)$ts)/1000));$days[$date]=true;
 }
 $streak=0;$maxStreak=0;$prev=null;$dates=array_keys($days);sort($dates,SORT_STRING);
 foreach($dates as $day){$curr=strtotime($day.' UTC');$streak=($prev!==null&&($curr-$prev)===86400)?$streak+1:1;$maxStreak=max($maxStreak,$streak);$prev=$curr;}
 $mastered=0;foreach(array_slice($cards,-450,null,true) as $card){if(!is_array($card)||($card['scope']??null)!==$scope)continue;if((int)($card['repetitions']??0)>=5)$mastered++;}
 return ['quizzes'=>$count,'uniqueQuizzes'=>count($quizIds),'lessons'=>count($lessonIds),'excellent'=>$excellent,'streak'=>$maxStreak,'mastered'=>$mastered];
}
function academy_v59_milestones(array $metrics,array $existing,array $scope,int $now): array {
 $catalog=academy_v59_catalog();$awards=$existing;$added=0;$rows=[];
 foreach($catalog as $id=>$def){
  $progress=min((int)$def['target'],max(0,(int)($metrics[$def['metric']]??0)));
  $earned=isset($awards[$id])&&is_array($awards[$id])&&($awards[$id]['status']??'active')==='active';
  if(!$earned&&$progress >= $def['target']){
   $awards[$id]=['id'=>'v59-'.$id,'name'=>$def['name'],'description'=>$def['description'],'icon'=>$def['icon'],'scope'=>$scope,'status'=>'active','awardedAt'=>$now,'source'=>'verified_quiz_or_review'];$earned=true;$added++;
  }
  $rows[]=['id'=>$id,'name'=>$def['name'],'description'=>$def['description'],'icon'=>$def['icon'],'target'=>$def['target'],'progress'=>$progress,'earned'=>$earned];
 }
 return [$awards,$rows,$added];
}
function academy_v59_public_awards(array $awards): array {
 $catalog=academy_v59_catalog();$out=[];
 foreach($catalog as $key=>$def){$row=$awards[$key]??null;if(!is_array($row)||($row['status']??'active')!=='active')continue;
  $out[]=['id'=>'v59-'.$key,'name'=>$def['name'],'description'=>$def['description'],'icon'=>$def['icon'],'awardedAt'=>(int)($row['awardedAt']??0)];
 }return $out;
}
function academy_v59_award_path(string $uid,array $scope): string {return 'learningV59/awards/'.$uid.'/'.academy_v59_scope_key($scope);}
function academy_v59_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v59/'))return;
 $u=academy_current_user(true);$role=(string)($u['primary_role']??'');$uid=(string)$u['id'];
 if($route==='/v59/overview'&&$method==='GET'){
  if($role!=='student')academy_json(['ok'=>false,'error'=>'forbidden'],403);
  academy_rate_limit('v59-overview-'.$uid,90,3600);
  $profile=academy_v54_profile($uid);$scope=academy_v54_scope($profile);$path=academy_v59_award_path($uid,$scope);
  // All proof is read on the server; none of the badge awards are supplied by the browser.
  $locks=academy_acquire_data_locks($pdo,[$path]);
  try{
   $existing=academy_read_node($path);$existing=is_array($existing)?$existing:[];
   $history=academy_read_node('studentProfilesV3/'.$uid.'/quizHistory');$cards=academy_read_node('learningV55/cards/'.$uid);
   $metrics=academy_v59_metrics(is_array($history)?$history:[],is_array($cards)?$cards:[],$scope);
   [$awards,$milestones,$new]=academy_v59_milestones($metrics,$existing,$scope,academy_now_ms());
   if($new){$pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$awards,$uid);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
  }finally{academy_release_data_locks($pdo,$locks);}
  academy_json(['ok'=>true,'scope'=>$scope,'awards'=>academy_v59_public_awards($awards),'milestones'=>$milestones,'newCount'=>$new]);
 }
 if($route==='/v59/parent/child'&&$method==='GET'){
  if($role!=='parent')academy_json(['ok'=>false,'error'=>'forbidden'],403);
  academy_rate_limit('v59-parent-'.$uid,90,3600);
  $student=(string)($_GET['studentId']??'');if(!preg_match('/^[a-f0-9-]{36}$/D',$student)||!academy_parent_can_access_student($uid,$student))academy_json(['ok'=>false,'error'=>'forbidden'],403);
  $profile=academy_read_node('studentProfilesV3/'.$student);if(!is_array($profile))academy_json(['ok'=>false,'error'=>'not_found'],404);
  $scope=academy_v54_scope($profile);$awards=academy_read_node(academy_v59_award_path($student,$scope));
  academy_json(['ok'=>true,'awards'=>academy_v59_public_awards(is_array($awards)?$awards:[])]);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
