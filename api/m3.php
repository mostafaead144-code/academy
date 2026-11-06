<?php
/** M3: authentic challenge rankings and reports, backed exclusively by saved M1 attempts & ledger. */
declare(strict_types=1);
function academy_m3_period(string $period): ?string {
 if($period==='all')return null;
 $days=match($period){'week'=>7,'month'=>30,default=>0};
 if(!$days)academy_json(['ok'=>false,'error'=>'invalid_period'],422);
 return gmdate('Y-m-d H:i:s',time()-86400*$days);
}
function academy_m3_subject(string $subject): string {
 if($subject!==''&&!preg_match('/^[A-Za-z0-9_-]{2,80}$/D',$subject))academy_json(['ok'=>false,'error'=>'invalid_subject'],422);
 return $subject;
}
function academy_m3_public_name(string $studentId): string {
 // Privacy: do not expose pupils' profile names by default in a public ranking.
 $profile=academy_read_node('studentProfilesV3/'.$studentId);
 $display=is_array($profile)?trim((string)($profile['publicDisplayName']??'')):'';
 return $display!==''?mb_substr($display,0,60):'طالب مشارك';
}
function academy_m3_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m3/'))return;
 if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
 $user=academy_current_user(true);$role=(string)$user['primary_role'];$uid=(string)$user['id'];
 if(in_array($route,['/m3/leaderboard','/m3/history','/m3/overview'],true))academy_v48_finalize_due_batch($pdo,3);
 if($route==='/m3/leaderboard'){
  academy_m1_guard_role($user,['student']);
  $profile=academy_read_node('studentProfilesV3/'.$uid);
  if(!is_array($profile))academy_json(['ok'=>true,'items'=>[],'myRank'=>null,'myPoints'=>0,'notice'=>'أكمل بيانات المرحلة والصف أولًا.']);
  $scope=academy_m1_scope(['type'=>$profile['educationType']??'','stage'=>$profile['stage']??'','grade'=>$profile['grade']??0]);
  $mode=(string)($_GET['mode']??'training');if(!in_array($mode,['training','official'],true))academy_json(['ok'=>false,'error'=>'invalid_mode'],422);
  $period=(string)($_GET['period']??'all');$since=academy_m3_period($period);$subject=academy_m3_subject((string)($_GET['subject']??''));
  $conditions=['c.education_type=?','c.stage=?','c.grade=?','c.is_training=?',"c.status IN ('published','closed')"];
  $args=[$scope['type'],$scope['stage'],$scope['grade'],$mode==='training'?1:0];
  if($subject!==''){$conditions[]='c.subject=?';$args[]=$subject;}
  if($since!==null){$conditions[]='a.created_at>=?';$args[]=$since;}
  $sql="SELECT a.student_id, SUM(l.points) AS points, SUM(a.correct_count) AS correct_answers, COUNT(*) AS attempts, MIN(a.created_at) AS first_attempt FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id JOIN m1_points_ledger l ON l.student_id=a.student_id AND l.source_id=a.challenge_id AND l.source_type='challenge' WHERE ".implode(' AND ',$conditions).' GROUP BY a.student_id ORDER BY points DESC, correct_answers DESC, first_attempt ASC, a.student_id ASC LIMIT 120';
  $st=$pdo->prepare($sql);$st->execute($args);$items=[];
  foreach($st->fetchAll(PDO::FETCH_ASSOC) as $r){$studentId=(string)$r['student_id'];$items[]=['id'=>$studentId,'name'=>academy_m3_public_name($studentId),'points'=>(int)$r['points'],'correct'=>(int)$r['correct_answers'],'attempts'=>(int)$r['attempts'],'virtual'=>false,'isMine'=>$studentId===$uid];}
  // Simulated competitors belong only to all-time/all-subject training lists.
  if($mode==='training'&&$period==='all'&&$subject===''){
   $bots=$pdo->prepare('SELECT id,display_name,simulated_points FROM m1_virtual_students WHERE education_type=? AND stage=? AND grade=? AND is_active=1 ORDER BY simulated_points DESC LIMIT 100');
   $bots->execute([$scope['type'],$scope['stage'],$scope['grade']]);
   foreach($bots->fetchAll(PDO::FETCH_ASSOC) as $bot)$items[]=['id'=>$bot['id'],'name'=>mb_substr((string)$bot['display_name'],0,60),'points'=>(int)$bot['simulated_points'],'correct'=>0,'attempts'=>0,'virtual'=>true,'isMine'=>false];
  }
  usort($items,static fn($a,$b)=>($b['points']<=>$a['points'])?:($b['correct']<=>$a['correct'])?:strcmp((string)$a['id'],(string)$b['id']));
  $myRank=null;$myPoints=0;foreach($items as$i=>$item){if($item['isMine']){$myRank=$i+1;$myPoints=$item['points'];break;}}
  academy_json(['ok'=>true,'items'=>array_map(static fn($r)=>['name'=>$r['name'],'points'=>$r['points'],'isMine'=>$r['isMine']],array_slice($items,0,50)),'myRank'=>$myRank,'myPoints'=>$myPoints,'mode'=>$mode,'period'=>$period,'subject'=>$subject,'scope'=>$scope,'notice'=>$mode==='official'?'ترتيب رسمي من نتائج التحديات الرسمية للطلاب الحقيقيين فقط.':'ترتيب تدريبي وقد يضم مشاركين افتراضيين في العرض العام. لا يمثل المراكز الرسمية.']);
 }
 if($route==='/m3/history'){
  academy_m1_guard_role($user,['student']);
  $st=$pdo->prepare('SELECT c.id AS challenge_id,c.title,c.subject,c.is_training,a.correct_count,a.question_count,a.percentage,a.points_awarded,a.created_at FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id WHERE a.student_id=? ORDER BY a.created_at DESC LIMIT 75');
  $st->execute([$uid]);academy_json(['ok'=>true,'items'=>$st->fetchAll(PDO::FETCH_ASSOC)]);
 }
 if($route==='/m3/overview'){
  academy_m1_guard_role($user,['admin','teacher']);
  $where=$role==='teacher'?' WHERE c.creator_id=?':'';$args=$role==='teacher'?[$uid]:[];
  $st=$pdo->prepare('SELECT c.id,c.title,c.subject,c.status,c.is_training,c.starts_at,c.ends_at,COUNT(a.id) AS attempts,ROUND(AVG(a.percentage),1) AS average_percent,COALESCE(SUM(a.points_awarded),0) AS total_points FROM m1_challenges c LEFT JOIN m1_challenge_attempts a ON a.challenge_id=c.id'.$where.' GROUP BY c.id,c.title,c.subject,c.status,c.is_training,c.starts_at,c.ends_at,c.created_at ORDER BY c.created_at DESC LIMIT 150');
  $st->execute($args);$rows=$st->fetchAll(PDO::FETCH_ASSOC);$summary=['all'=>count($rows),'pending'=>0,'published'=>0,'official'=>0,'training'=>0,'attempts'=>0];$items=[];
  foreach($rows as$r){$summary['pending']+=$r['status']==='pending'?1:0;$summary['published']+=$r['status']==='published'?1:0;$summary['official']+=(int)$r['is_training']===0?1:0;$summary['training']+=(int)$r['is_training']===1?1:0;$summary['attempts']+=(int)$r['attempts'];$items[]=['id'=>$r['id'],'title'=>$r['title'],'subject'=>$r['subject'],'status'=>$r['status'],'isTraining'=>(bool)$r['is_training'],'attempts'=>(int)$r['attempts'],'average'=>$r['average_percent']===null?null:(float)$r['average_percent'],'totalPoints'=>(int)$r['total_points'],'startsAt'=>$r['starts_at'],'endsAt'=>$r['ends_at']];}
  academy_json(['ok'=>true,'summary'=>$summary,'items'=>$items,'sampleLimit'=>150]);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
