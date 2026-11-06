<?php
/** V48.1: Optional team round models, readiness, score formula and one-time team awards. */
declare(strict_types=1);
function academy_v481_fail(string $code,int $http=422): never {academy_json(['ok'=>false,'error'=>$code],$http);}
function academy_v481_rules_payload(array $b,int $size): array {
 $models=(int)($b['modelCount']??1);$mode=(string)($b['scoreMode']??'average');$top=(int)($b['topCount']??2);$min=(int)($b['minReady']??2);
 if($models<1||$models>3||!in_array($mode,['average','sum','top_n'],true)||$top<1||$top>$size||$min<1||$min>$size)academy_v481_fail('invalid_team_rules');
 $prizes=[];foreach(['firstPoints','secondPoints','thirdPoints'] as $key){$n=(int)($b[$key]??0);if($n<0||$n>1000)academy_v481_fail('invalid_prize_amount');$prizes[]=$n;}
 return ['model_count'=>$models,'score_mode'=>$mode,'top_n'=>$top,'require_ready'=>!empty($b['requireReady'])?1:0,'min_ready'=>$min,'first_points'=>$prizes[0],'second_points'=>$prizes[1],'third_points'=>$prizes[2]];
}
function academy_v481_store_rules(PDO $pdo,string $id,array $r): void {
 // Invalidate generated distinct sets when the model count changes before launch.
 $previous=$pdo->prepare('SELECT model_count FROM v481_tournament_rules WHERE tournament_id=?');$previous->execute([$id]);$oldCount=$previous->fetchColumn();
 if($oldCount!==false&&(int)$oldCount!==(int)$r['model_count'])$pdo->prepare('DELETE FROM v482_round_models WHERE tournament_id=?')->execute([$id]);
 $pdo->prepare('INSERT INTO v481_tournament_rules(tournament_id,model_count,score_mode,top_n,require_ready,min_ready,first_points,second_points,third_points) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE model_count=VALUES(model_count),score_mode=VALUES(score_mode),top_n=VALUES(top_n),require_ready=VALUES(require_ready),min_ready=VALUES(min_ready),first_points=VALUES(first_points),second_points=VALUES(second_points),third_points=VALUES(third_points)')->execute([$id,$r['model_count'],$r['score_mode'],$r['top_n'],$r['require_ready'],$r['min_ready'],$r['first_points'],$r['second_points'],$r['third_points']]);
}
function academy_v481_rules(PDO $pdo,string $id): array {
 $q=$pdo->prepare('SELECT * FROM v481_tournament_rules WHERE tournament_id=?');$q->execute([$id]);$r=$q->fetch(PDO::FETCH_ASSOC);
 return $r?:['model_count'=>1,'score_mode'=>'average','top_n'=>2,'require_ready'=>0,'min_ready'=>2,'first_points'=>0,'second_points'=>0,'third_points'=>0];
}
function academy_v481_score(array $scores,string $mode,int $top): float {
 $scores=array_map('intval',$scores);rsort($scores,SORT_NUMERIC);$count=count($scores);if(!$count)return 0;
 return round($mode==='sum'?array_sum($scores):($mode==='top_n'?array_sum(array_slice($scores,0,$top))/min($count,$top):array_sum($scores)/$count),2);
}
function academy_v481_team_rank(PDO $pdo,array $t,array $rules): array {
 $q=$pdo->prepare('SELECT id,title FROM m4_teams WHERE tournament_id=? ORDER BY created_at,id');$q->execute([$t['id']]);$teams=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$pdo->prepare('SELECT tm.id AS team_id,mem.student_id,COALESCE(SUM(a.points_awarded),0) AS points,COUNT(a.id) AS completed FROM m4_teams tm JOIN m4_team_members mem ON mem.team_id=tm.id LEFT JOIN m4_tournament_rounds r ON r.tournament_id=tm.tournament_id LEFT JOIN m1_challenge_attempts a ON a.challenge_id=r.challenge_id AND a.student_id=mem.student_id AND a.created_at>=mem.joined_at AND a.created_at>=? AND a.created_at<=? WHERE tm.tournament_id=? GROUP BY tm.id,mem.student_id');$q->execute([$t['starts_at'],$t['ends_at'],$t['id']]);$members=[];
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $member)$members[$member['team_id']][]=$member;
 $out=[];foreach($teams as $team){$players=$members[$team['id']]??[];$scores=array_map(static fn($x)=>(int)$x['points'],$players);$count=count($scores);$points=academy_v481_score($scores,$rules['score_mode'],(int)$rules['top_n']);$completed=array_sum(array_map(static fn($x)=>(int)$x['completed'],$players));$out[]=['id'=>$team['id'],'name'=>$team['title'],'score'=>round($points,2),'completed'=>$completed,'members'=>$count];}
 usort($out,static fn($a,$b)=>($b['score']<=>$a['score'])?:($b['completed']<=>$a['completed'])?:strcmp($a['id'],$b['id']));return array_slice($out,0,100);
}
function academy_v481_team_context(PDO $pdo,string $challengeId,string $studentId): ?array {
 $q=$pdo->prepare("SELECT t.id AS tournament_id,mem.team_id,r.model_count,r.require_ready,s.started_at FROM m4_tournament_rounds rd JOIN m4_tournaments t ON t.id=rd.tournament_id AND t.mode='team' AND t.status='published' JOIN m4_team_members mem ON mem.tournament_id=t.id AND mem.student_id=? LEFT JOIN v481_tournament_rules r ON r.tournament_id=t.id LEFT JOIN v481_team_status s ON s.team_id=mem.team_id WHERE rd.challenge_id=? ORDER BY t.id LIMIT 2");$q->execute([$studentId,$challengeId]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);if(count($rows)>1)academy_v481_fail('multiple_team_rounds_for_student',409);return $rows[0]??null;
}
function academy_v481_model(PDO $pdo,array $ctx,string $uid): string {
 $count=max(1,min(3,(int)($ctx['model_count']??1)));if($count===1)return 'A';
 $q=$pdo->prepare('SELECT model_key FROM v481_model_assignments WHERE tournament_id=? AND student_id=?');$q->execute([$ctx['tournament_id'],$uid]);$found=$q->fetchColumn();if($found)return (string)$found;
 $q=$pdo->prepare('SELECT student_id FROM m4_team_members WHERE tournament_id=? AND team_id=? ORDER BY joined_at ASC,student_id ASC');$q->execute([$ctx['tournament_id'],$ctx['team_id']]);$list=$q->fetchAll(PDO::FETCH_COLUMN);$slot=array_search($uid,$list,true);if($slot===false)academy_v481_fail('team_membership_missing',403);$model=['A','B','C'][$slot%$count];
 $pdo->prepare('INSERT IGNORE INTO v481_model_assignments(tournament_id,student_id,model_key,assigned_at) VALUES(?,?,?,UTC_TIMESTAMP())')->execute([$ctx['tournament_id'],$uid,$model]);$q=$pdo->prepare('SELECT model_key FROM v481_model_assignments WHERE tournament_id=? AND student_id=?');$q->execute([$ctx['tournament_id'],$uid]);return (string)($q->fetchColumn()?:$model);
}
function academy_v481_variant_questions(array $questions,string $model): array {
 $index=array_search($model,['A','B','C'],true);if($index===false)$index=0;
 if($index===0)return $questions;
 $n=count($questions);if($n>1){$shift=$index%$n;$questions=array_merge(array_slice($questions,$shift),array_slice($questions,0,$shift));}
 foreach($questions as &$q){$count=count($q['options']??[]);if($count<2)continue;$shift=$index%$count;$indices=$shift>0?array_merge(range($shift,$count-1),range(0,$shift-1)):range(0,$count-1);$correct=array_search((int)$q['correctAnswer'],$indices,true);$q['options']=array_map(static fn($i)=>$q['options'][$i],$indices);$q['correctAnswer']=$correct;}
 unset($q);return $questions;
}
function academy_v481_context_model(PDO $pdo,string $challengeId,string $uid): array {
 $ctx=academy_v481_team_context($pdo,$challengeId,$uid);
 if(!$ctx)return ['model'=>'A','team'=>false];
 if(!empty($ctx['require_ready'])&&empty($ctx['started_at']))academy_v481_fail('team_not_started_by_captain',409);
 return ['model'=>academy_v481_model($pdo,$ctx,$uid),'team'=>true,'tournamentId'=>$ctx['tournament_id']];
}
function academy_v481_team_extra(PDO $pdo,array $t,string $uid,string $role,?string $myTeam): array {
 $rules=academy_v481_rules($pdo,$t['id']);$q=$pdo->prepare('SELECT mem.team_id,COUNT(*) AS ready_count FROM v481_member_ready r JOIN m4_team_members mem ON mem.tournament_id=r.tournament_id AND mem.student_id=r.student_id WHERE r.tournament_id=? GROUP BY mem.team_id');$q->execute([$t['id']]);$counts=[];foreach($q->fetchAll(PDO::FETCH_ASSOC)as$row)$counts[$row['team_id']]=(int)$row['ready_count'];
 $q=$pdo->prepare('SELECT team_id,started_at FROM v481_team_status s JOIN m4_teams t ON t.id=s.team_id WHERE t.tournament_id=?');$q->execute([$t['id']]);$starts=[];foreach($q->fetchAll(PDO::FETCH_ASSOC)as$row)$starts[$row['team_id']]=$row['started_at'];
 $me=false;$captain=false;$model=null;if($role==='student'&&$myTeam){$q=$pdo->prepare('SELECT COUNT(*) FROM v481_member_ready WHERE tournament_id=? AND student_id=?');$q->execute([$t['id'],$uid]);$me=(bool)$q->fetchColumn();$q=$pdo->prepare('SELECT captain_id FROM m4_teams WHERE id=?');$q->execute([$myTeam]);$captain=$q->fetchColumn()===$uid;$q=$pdo->prepare('SELECT model_key FROM v481_model_assignments WHERE tournament_id=? AND student_id=?');$q->execute([$t['id'],$uid]);$model=$q->fetchColumn()?:null;}
 return ['teamRules'=>['modelCount'=>(int)$rules['model_count'],'scoreMode'=>$rules['score_mode'],'topCount'=>(int)$rules['top_n'],'requireReady'=>(bool)$rules['require_ready'],'minReady'=>(int)$rules['min_ready'],'firstPoints'=>(int)$rules['first_points'],'secondPoints'=>(int)$rules['second_points'],'thirdPoints'=>(int)$rules['third_points']],'readyCounts'=>$counts,'teamStarts'=>$starts,'myReady'=>$me,'amCaptain'=>$captain,'myModel'=>$model];
}
function academy_v481_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v481/'))return;
 $user=academy_current_user(true);$role=$user['primary_role'];$uid=$user['id'];$b=$method==='POST'?academy_body():[];
 if($route==='/v481/team/rules'&&$method==='POST'){
  academy_m1_guard_role($user,['admin','teacher']);$id=academy_m4_uuid($b['tournamentId']??'');$pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='team'||!academy_m4_can_manage($user,$t))academy_v481_fail('forbidden',403);if($t['starts_at']<=gmdate('Y-m-d H:i:s')||in_array($t['status'],['closed','rejected'],true))academy_v481_fail('rules_locked',409);
   $rules=academy_v481_rules_payload($b,(int)$t['max_team_size']);academy_v481_store_rules($pdo,$id,$rules);$pdo->commit();academy_audit($uid,'v481.team.rules',$id);academy_json(['ok'=>true]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v481/team/ready'&&$method==='POST'){
  academy_m1_guard_role($user,['student']);$id=academy_m4_uuid($b['tournamentId']??'');$ready=($b['ready']??false)===true;$pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='team'||$t['status']!=='published'||$t['ends_at']<=gmdate('Y-m-d H:i:s'))academy_v481_fail('team_unavailable',403);
   $q=$pdo->prepare('SELECT team_id FROM m4_team_members WHERE tournament_id=? AND student_id=?');$q->execute([$id,$uid]);$team=$q->fetchColumn();if(!$team)academy_v481_fail('not_in_team',403);
   $q=$pdo->prepare('SELECT started_at FROM v481_team_status WHERE team_id=?');$q->execute([$team]);if($q->fetchColumn())academy_v481_fail('team_already_started',409);
   if($ready)$pdo->prepare('INSERT INTO v481_member_ready(tournament_id,student_id,ready_at) VALUES(?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE ready_at=VALUES(ready_at)')->execute([$id,$uid]);else $pdo->prepare('DELETE FROM v481_member_ready WHERE tournament_id=? AND student_id=?')->execute([$id,$uid]);$pdo->commit();academy_json(['ok'=>true,'ready'=>$ready]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v481/team/start'&&$method==='POST'){
  academy_m1_guard_role($user,['student']);$id=academy_m4_uuid($b['tournamentId']??'');$pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);$now=gmdate('Y-m-d H:i:s');if($t['mode']!=='team'||$t['status']!=='published'||$now<$t['starts_at']||$now>=$t['ends_at'])academy_v481_fail('team_start_unavailable',403);
   $q=$pdo->prepare('SELECT id FROM m4_teams WHERE tournament_id=? AND captain_id=?');$q->execute([$id,$uid]);$team=$q->fetchColumn();if(!$team)academy_v481_fail('captain_required',403);
   $rule=academy_v481_rules($pdo,$id);if(!$rule['require_ready'])academy_v481_fail('readiness_not_enabled',409);
   $q=$pdo->prepare('SELECT COUNT(*) FROM v481_member_ready r JOIN m4_team_members mem ON mem.tournament_id=r.tournament_id AND mem.student_id=r.student_id WHERE mem.team_id=?');$q->execute([$team]);if((int)$q->fetchColumn()<(int)$rule['min_ready'])academy_v481_fail('not_enough_ready_members',409);
   $pdo->prepare('INSERT IGNORE INTO v481_team_status(team_id,started_at,started_by) VALUES(?,UTC_TIMESTAMP(),?)')->execute([$team,$uid]);$pdo->commit();academy_audit($uid,'v481.team.start',$team);academy_json(['ok'=>true]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v481/team/award'&&$method==='POST'){
  academy_m1_guard_role($user,['admin']);$id=academy_m4_uuid($b['tournamentId']??'');
  // Finalize due delayed rounds BEFORE opening prize transaction (release_due uses its own transaction).
  $due=$pdo->prepare('SELECT c.* FROM m4_tournament_rounds rd JOIN m1_challenges c ON c.id=rd.challenge_id WHERE rd.tournament_id=?');$due->execute([$id]);foreach($due->fetchAll(PDO::FETCH_ASSOC) as $c)academy_v48_release_due($pdo,$c);
  $pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='team'||$t['status']!=='closed'||$t['ends_at']>gmdate('Y-m-d H:i:s'))academy_v481_fail('tournament_not_final',409);
   $q=$pdo->prepare('SELECT COUNT(*) FROM m4_tournament_rounds WHERE tournament_id=?');$q->execute([$id]);if(!(int)$q->fetchColumn())academy_v481_fail('no_rounds',409);
   $q=$pdo->prepare("SELECT COUNT(*) FROM m4_tournament_rounds rd JOIN m1_challenges c ON c.id=rd.challenge_id LEFT JOIN v48_challenge_rules r ON r.challenge_id=c.id WHERE rd.tournament_id=? AND (c.ends_at>UTC_TIMESTAMP() OR (r.reveal_policy='manual' AND r.results_released_at IS NULL) OR (r.reveal_policy='after_end' AND r.results_released_at IS NULL))");$q->execute([$id]);if((int)$q->fetchColumn()>0)academy_v481_fail('rounds_results_pending',409);
   $q=$pdo->prepare('SELECT 1 FROM v481_tournament_prize_runs WHERE tournament_id=?');$q->execute([$id]);if($q->fetchColumn())academy_v481_fail('prizes_already_awarded',409);
   $rules=academy_v481_rules($pdo,$id);$rank=array_values(array_filter(academy_v481_team_rank($pdo,$t,$rules),static fn($x)=>$x['completed']>0));$rewards=[$rules['first_points'],$rules['second_points'],$rules['third_points']];
   foreach(array_slice($rank,0,3) as $i=>$team){$points=(int)$rewards[$i];if($points===0)continue;$q=$pdo->prepare('SELECT student_id FROM m4_team_members WHERE team_id=?');$q->execute([$team['id']]);foreach($q->fetchAll(PDO::FETCH_COLUMN) as $sid){$pdo->prepare("INSERT IGNORE INTO m1_points_ledger(id,student_id,source_type,source_id,education_type,stage,grade,subject,points) VALUES(?,?,'team_award',?,?,?,?,?,?)")->execute([academy_uuid(),$sid,$id,$t['education_type'],$t['stage'],$t['grade'],$t['subject'],$points]);}}
   $pdo->prepare('INSERT INTO v481_tournament_prize_runs(tournament_id,awarded_at,awarded_by) VALUES(?,UTC_TIMESTAMP(),?)')->execute([$id,$uid]);$pdo->commit();academy_audit($uid,'v481.team.award',$id);academy_json(['ok'=>true,'winnerCount'=>count(array_slice($rank,0,3))]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 academy_v481_fail('not_found',404);
}
