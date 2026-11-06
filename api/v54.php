<?php
/** V54: student diagnostic overview and scoped weekly study plans. No database migration. */
declare(strict_types=1);
function academy_v54_fail(string $code,int $status=422): never {academy_json(['ok'=>false,'error'=>$code],$status);}
function academy_v54_profile(string $uid): array {
 $p=academy_read_node('studentProfilesV3/'.$uid);
 if(!is_array($p)||!in_array(($p['educationType']??''),['public','azhar'],true)||!in_array(($p['stage']??''),['primary','prep','sec'],true)||!preg_match('/^[1-6]$/D',(string)($p['grade']??'')))academy_v54_fail('complete_student_profile',422);
 if((int)$p['grade']>($p['stage']==='primary'?6:3))academy_v54_fail('invalid_student_grade',422);
 return $p;
}
function academy_v54_scope(array $p): array {return ['educationType'=>(string)$p['educationType'],'stage'=>(string)$p['stage'],'grade'=>(string)$p['grade']];}
function academy_v54_scoped(array $item,array $p): bool {
 return ($item['type']??$item['educationType']??'public')===$p['educationType']
  &&($item['stage']??'')===$p['stage']&&(string)($item['grade']??'')===(string)$p['grade'];
}
function academy_v54_available(array $item,array $p,array $user,array $settings,bool $enforce,array &$paidAccessCache): bool {
 if(!academy_v54_scoped($item,$p)||!academy_content_visible_to_reader($user,$item))return false;
 if($enforce&&empty($item['isFree'])){
  $subject=(string)($item['subject']??'');
  if(!array_key_exists($subject,$paidAccessCache))$paidAccessCache[$subject]=academy_student_can_access_content($user,$item);
  if(!$paidAccessCache[$subject])return false;
 }
 $unit=(string)(max(1,(int)($item['unit']??1)));$subject=(string)($item['subject']??'');
 return empty($settings['curriculumUnits'][$p['educationType']][$p['stage']][(string)$p['grade']][$subject][$unit]['isHidden']);
}
function academy_v54_catalog(array $p,array $user): array {
 $settings=academy_read_node('settings');if(!is_array($settings))$settings=[];
 $lessons=academy_read_node('lessons');if(!is_array($lessons))$lessons=[];
 $quizzes=academy_read_node('quizzes');if(!is_array($quizzes))$quizzes=[];
 $subscription=academy_read_node('subscriptionSettingsV1');$enforce=is_array($subscription)&&($subscription['enforceAccess']??false)===true;$paidAccessCache=[];
 $out=['lessons'=>[],'quizzes'=>[],'subjects'=>[]];
 foreach($lessons as $id=>$lesson){if(!is_array($lesson)||!academy_v54_available($lesson,$p,$user,$settings,$enforce,$paidAccessCache))continue;
  $subject=(string)($lesson['subject']??'');if($subject==='')continue;
  $out['lessons'][]=['id'=>(string)$id,'title'=>mb_substr((string)($lesson['title']??$lesson['name']??'درس'),0,140),'subject'=>$subject,'unit'=>max(1,(int)($lesson['unit']??1)),'order'=>(int)($lesson['order']??0),'minutes'=>max(15,min(90,(int)($lesson['estimatedMinutes']??35)))];$out['subjects'][$subject]=true;
 }
 foreach($quizzes as $id=>$quiz){if(!is_array($quiz)||!academy_v54_available($quiz,$p,$user,$settings,$enforce,$paidAccessCache))continue;
  $subject=(string)($quiz['subject']??'');if($subject==='')continue;
  $out['quizzes'][]=['id'=>(string)$id,'title'=>mb_substr((string)($quiz['name']??$quiz['title']??'اختبار'),0,140),'subject'=>$subject,'unit'=>max(1,(int)($quiz['unit']??1)),'order'=>(int)($quiz['order']??0),'minutes'=>max(10,min(60,(int)($quiz['durationMinutes']??20)))];$out['subjects'][$subject]=true;
 }
 usort($out['lessons'],fn($a,$b)=>[$a['subject'],$a['unit'],$a['order'],$a['id']]<=>[$b['subject'],$b['unit'],$b['order'],$b['id']]);
 usort($out['quizzes'],fn($a,$b)=>[$a['subject'],$a['unit'],$a['order'],$a['id']]<=>[$b['subject'],$b['unit'],$b['order'],$b['id']]);
 $out['subjects']=array_keys($out['subjects']);sort($out['subjects'],SORT_STRING);
 return $out;
}
function academy_v54_latest_diagnostic(string $uid,string $subject,array $scope): ?array {
 $all=academy_read_node('learningV4/diagnostics/'.$uid.'/'.$subject);
 if(!is_array($all))return null;$found=null;
 foreach($all as $report){if(!is_array($report)||($report['subject']??'')!==$subject||($report['scope']??null)!==$scope)continue;
  if($found===null||(int)($report['createdAt']??0)>(int)($found['createdAt']??0))$found=$report;
 }
 if(!$found)return null;
 return ['score'=>(int)($found['score']??0),'createdAt'=>(int)($found['createdAt']??0),'weaknesses'=>array_values(array_slice(array_filter($found['weaknesses']??[],'is_array'),0,20)),'recommendations'=>array_values(array_slice(array_filter($found['recommendations']??[],'is_string'),0,30))];
}
function academy_v54_plan_current(mixed $plan,array $scope): bool {return is_array($plan)&&($plan['scope']??null)===$scope&&is_array($plan['tasks']??null);}
function academy_v54_container(mixed $data): array {
 if(is_array($data)&&array_key_exists('current',$data))return ['current'=>$data['current']??null,'history'=>is_array($data['history']??null)?$data['history']:[]];
 return ['current'=>is_array($data)?$data:null,'history'=>[]];
}
function academy_v54_archive_and_set(PDO $pdo,string $path,array $next,string $uid): array {
 $locks=academy_acquire_data_locks($pdo,[$path]);
 try{
  $box=academy_v54_container(academy_read_node($path));
  if(is_array($box['current'])){
   $old=$box['current'];$oldId=(string)($old['planId']??substr(hash('sha256',json_encode($old,JSON_UNESCAPED_UNICODE)),0,24));
   if(preg_match('/^[a-f0-9-]{24,36}$/D',$oldId))$box['history'][$oldId]=$old;
  }
  $box['current']=$next;
  // Retain the 20 most recent earlier plans without altering completed task history.
  if(count($box['history'])>20)$box['history']=array_slice($box['history'],-20,null,true);
  $pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$box,$uid);$pdo->commit();}
  catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
  return $box;
 }finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v54_make_plan(array $catalog,array $profile,?array $diagnostic,string $subject,int $daily,array $studyDays,DateTimeImmutable $start): array {
 $seen=[];$tasks=[];$progress=is_array($profile['learningProgress']??null)?$profile['learningProgress']:[];
 $priority=array_fill_keys(array_map('strval',$diagnostic['recommendations']??[]),true);$weakSubjects=$diagnostic['weakSubjects']??[];
 $items=[];
 foreach($catalog['lessons'] as $row){if(($subject!=='all'&&$row['subject']!==$subject)||!empty($progress[$row['id']]['completed']))continue;
  $row['kind']='lesson';$row['priority']=isset($priority[$row['id']])?0:(isset($weakSubjects[$row['subject']])?1:2);$items[]=$row;
 }
 foreach($catalog['quizzes'] as $row){if($subject!=='all'&&$row['subject']!==$subject)continue;$row['kind']='quiz';$row['priority']=3;$items[]=$row;}
 usort($items,fn($a,$b)=>[$a['priority'],$a['unit'],$a['order'],$a['id']]<=>[$b['priority'],$b['unit'],$b['order'],$b['id']]);
 $dates=[];for($i=0;$i<7;$i++){ $d=$start->modify('+'.$i.' days');if(in_array((int)$d->format('w'),$studyDays,true))$dates[]=$d->format('Y-m-d');}
 if(!$dates)academy_v54_fail('select_study_day',422);
 $used=array_fill_keys($dates,0);$length=count($dates);$di=0;$remaining=0;
 foreach($items as $row){$minutes=min($daily,(int)$row['minutes']);$placed=false;
  for($i=0;$i<$length;$i++){$ix=($di+$i)%$length;$date=$dates[$ix];if($used[$date]+$minutes>$daily)continue;
   $key=$row['kind'].':'.$row['id'];if(isset($seen[$key]))continue;$seen[$key]=true;
   $tasks[]=['id'=>substr(hash('sha256',$key.'|'.$date),0,18),'kind'=>$row['kind'],'sourceId'=>$row['id'],'title'=>$row['title'],'subject'=>$row['subject'],'date'=>$date,'minutes'=>$minutes,'done'=>false,'priority'=>$row['priority']];
   $used[$date]+=$minutes;$di=($ix+1)%$length;$placed=true;break;
  }
  if(!$placed)$remaining++;
  if(count($tasks)>=60)break;
 }
 return ['planId'=>academy_uuid(),'scope'=>academy_v54_scope($profile),'subject'=>$subject,'dailyMinutes'=>$daily,'studyDays'=>$studyDays,'weekStart'=>$start->format('Y-m-d'),'generatedAt'=>academy_now_ms(),'tasks'=>$tasks,'remainingNotScheduled'=>$remaining];
}
function academy_v54_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v54/'))return;
 $user=academy_current_user(true);if(($user['primary_role']??'')!=='student')academy_v54_fail('forbidden',403);
 $uid=(string)$user['id'];$profile=academy_v54_profile($uid);$scope=academy_v54_scope($profile);$path='learningV54/plans/'.$uid;
 if($route==='/v54/overview'&&$method==='GET'){
  academy_rate_limit('v54-overview-'.$uid,90,3600);
  $catalog=academy_v54_catalog($profile,$user);$reports=[];
  foreach($catalog['subjects'] as $subject){$report=academy_v54_latest_diagnostic($uid,$subject,$scope);if($report)$reports[$subject]=$report;}
  $container=academy_v54_container(academy_read_node($path));$stored=$container['current'];$current=academy_v54_plan_current($stored,$scope);
  $history=[];foreach(array_reverse($container['history']) as $old){if(!is_array($old))continue;$history[]=['subject'=>(string)($old['subject']??''),'weekStart'=>(string)($old['weekStart']??''),'taskCount'=>count($old['tasks']??[]),'completed'=>count(array_filter($old['tasks']??[],fn($x)=>!empty($x['done'])))];}
  if(is_array($stored)&&!$current)$history=array_merge([['subject'=>(string)($stored['subject']??''),'weekStart'=>(string)($stored['weekStart']??''),'taskCount'=>count($stored['tasks']??[]),'completed'=>count(array_filter($stored['tasks']??[],fn($x)=>!empty($x['done'])))]] ,$history);
  academy_json(['ok'=>true,'scope'=>$scope,'subjects'=>$catalog['subjects'],'diagnostics'=>$reports,'plan'=>$current?$stored:null,'previousPlanAvailable'=>is_array($stored)&&!$current,'history'=>array_slice($history,0,20)]);
 }
 if($route==='/v54/plan/generate'&&$method==='POST'){
  academy_rate_limit('v54-generate-'.$uid,15,3600);$body=academy_body();$subject=(string)($body['subject']??'');
  if(!preg_match('/^[a-zA-Z0-9_-]{2,80}$/D',$subject))academy_v54_fail('invalid_subject',422);
  $daily=filter_var($body['dailyMinutes']??null,FILTER_VALIDATE_INT);
  if($daily===false||$daily<20||$daily>180)academy_v54_fail('invalid_daily_minutes',422);
  $days=$body['studyDays']??[];if(!is_array($days)||count($days)<1||count($days)>7||count(array_unique($days))!==count($days))academy_v54_fail('invalid_study_days',422);
  foreach($days as $d)if(!is_int($d)||$d<0||$d>6)academy_v54_fail('invalid_study_days',422);
  $startRaw=(string)($body['startDate']??'');$tz=new DateTimeZone('Africa/Cairo');$today=new DateTimeImmutable('today',$tz);
  if(!preg_match('/^20\d\d-\d\d-\d\d$/D',$startRaw))academy_v54_fail('invalid_start_date',422);
  $start=DateTimeImmutable::createFromFormat('!Y-m-d',$startRaw,$tz);
  if(!$start||$start->format('Y-m-d')!==$startRaw||$start<$today->modify('-1 day')||$start>$today->modify('+7 days'))academy_v54_fail('invalid_start_date',422);
  $catalog=academy_v54_catalog($profile,$user);if($subject!=='all'&&!in_array($subject,$catalog['subjects'],true)||!count($catalog['subjects']))academy_v54_fail('subject_unavailable',403);
  $diag=['recommendations'=>[],'weakSubjects'=>[]];
  foreach(($subject==='all'?$catalog['subjects']:[$subject]) as $s){$d=academy_v54_latest_diagnostic($uid,$s,$scope);if(!$d)continue;$diag['recommendations']=array_merge($diag['recommendations'],$d['recommendations']);if(($d['score']??100)<60)$diag['weakSubjects'][$s]=true;}
  $plan=academy_v54_make_plan($catalog,$profile,$diag,$subject,(int)$daily,$days,$start);
  // Save separately from the pre-existing manual/automatic planner; preserve all previous tasks and quiz results.
  academy_v54_archive_and_set($pdo,$path,$plan,$uid);academy_audit($uid,'v54.study_plan.generated',$subject,['taskCount'=>count($plan['tasks'])]);
  academy_json(['ok'=>true,'plan'=>$plan]);
 }
 if($route==='/v54/plan/task'&&$method==='POST'){
  academy_rate_limit('v54-task-'.$uid,200,3600);$b=academy_body();$id=(string)($b['taskId']??'');$done=$b['done']??null;$action=(string)($b['action']??'toggle');
  if(!preg_match('/^[a-f0-9]{18}$/D',$id)||!in_array($action,['toggle','reschedule'],true)||($action==='toggle'&&!is_bool($done)))academy_v54_fail('invalid_task',422);
  $locks=academy_acquire_data_locks($pdo,[$path]);
  try{$container=academy_v54_container(academy_read_node($path));$plan=$container['current'];if(!academy_v54_plan_current($plan,$scope))academy_v54_fail('plan_not_available',409);
   $found=false;foreach($plan['tasks'] as &$task){if(($task['id']??'')!==$id)continue;
    if($action==='toggle'){$task['done']=$done;$task['completedAt']=$done?academy_now_ms():null;}
    else{
     $date=(string)($b['date']??'');$week=DateTimeImmutable::createFromFormat('!Y-m-d',(string)($plan['weekStart']??''),new DateTimeZone('Africa/Cairo'));
     $target=DateTimeImmutable::createFromFormat('!Y-m-d',$date,new DateTimeZone('Africa/Cairo'));
     if(!$week||!$target||$target->format('Y-m-d')!==$date||$target<$week||$target>$week->modify('+6 days')||!in_array((int)$target->format('w'),$plan['studyDays']??[],true))academy_v54_fail('invalid_task_date',422);
     $used=0;foreach($plan['tasks'] as $other)if($other['date']===$date&&$other['id']!==$id)$used+=(int)($other['minutes']??0);
     if($used+(int)($task['minutes']??0)>(int)$plan['dailyMinutes'])academy_v54_fail('daily_time_exceeded',409);
     $task['date']=$date;
    }
    $found=true;break;
   }unset($task);
   if(!$found)academy_v54_fail('task_not_found',404);
   $container['current']=$plan;$pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$container,$uid);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
   academy_json(['ok'=>true,'plan'=>$plan]);
  }finally{academy_release_data_locks($pdo,$locks);}
 }
 academy_v54_fail('not_found',404);
}
