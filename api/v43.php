<?php
/** V43: public, metadata-only, read-only home sections. No student contact details. */
declare(strict_types=1);
function academy_v43_route(string $route,string $method,PDO $pdo): void {
 if($route!=='/v43/public')return;
 if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
 header('Cache-Control: public, max-age=45');
 // Only a pseudonym is public unless the student expressly configured a display name.
 $names=[];
 $nameOf=static function(string $id)use(&$names):string{
  if(!isset($names[$id])){
   $p=academy_read_node('studentProfilesV3/'.$id);
   $nickname=is_array($p)?trim((string)($p['publicDisplayName']??'')):'';
   $names[$id]=$nickname!==''?mb_substr($nickname,0,38):'متسابق '.strtoupper(substr(hash('sha256',$id),0,5));
  }return $names[$id];
 };
 $board=[];
 // The leaderboard uses only actual official challenges and the already-awarded ledger.
 $sql="SELECT a.student_id,COALESCE(SUM(l.points),0) AS points,SUM(a.correct_count) AS correct_count,MIN(a.created_at) AS first_at FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id AND c.is_training=0 AND c.status IN ('published','closed') JOIN m1_points_ledger l ON l.student_id=a.student_id AND l.source_type='challenge' AND l.source_id=a.challenge_id GROUP BY a.student_id ORDER BY points DESC,correct_count DESC,first_at ASC,a.student_id ASC LIMIT 200";
 foreach($pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $row)$board[]=['name'=>$nameOf((string)$row['student_id']),'points'=>(int)$row['points']];
 $challenges=[];$q=$pdo->query("SELECT id,title,description,education_type,stage,grade,subject,starts_at,ends_at,status FROM m1_challenges WHERE status='published' AND ends_at >= UTC_TIMESTAMP() ORDER BY starts_at ASC LIMIT 20");
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)$challenges[]=['title'=>$r['title'],'description'=>mb_substr((string)$r['description'],0,170),'type'=>$r['education_type'],'stage'=>$r['stage'],'grade'=>(int)$r['grade'],'subject'=>$r['subject'],'startsAt'=>$r['starts_at'],'endsAt'=>$r['ends_at']];
 $seasons=[];$q=$pdo->query("SELECT id,title,description,education_type,stage,grade,starts_at,ends_at FROM m4_seasons WHERE status='published' AND ends_at >= UTC_TIMESTAMP() ORDER BY starts_at ASC LIMIT 20");
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)$seasons[]=['title'=>$r['title'],'description'=>mb_substr((string)$r['description'],0,170),'type'=>$r['education_type'],'stage'=>$r['stage'],'grade'=>(int)$r['grade'],'startsAt'=>$r['starts_at'],'endsAt'=>$r['ends_at']];
 academy_json(['ok'=>true,'leaders'=>$board,'challenges'=>$challenges,'seasons'=>$seasons,'limit'=>200,'official'=>true]);
}
