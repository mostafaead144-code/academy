<?php
/** V48.2: preview-only balanced team allocations, immutable distinct model question sets and team certificate captions. */
declare(strict_types=1);
function academy_v482_fail(string $reason,int $status=422): never {academy_json(['ok'=>false,'error'=>$reason],$status);}
function academy_v482_variant_questions(PDO $pdo,string $challengeId,array $context,array $original): array {
 if(empty($context['team'])||empty($context['tournamentId']))return $original;
 $q=$pdo->prepare('SELECT questions_json FROM v482_round_models WHERE tournament_id=? AND challenge_id=? AND model_key=?');
 $q->execute([$context['tournamentId'],$challengeId,$context['model']]);$json=$q->fetchColumn();
 if($json!==false){$modelQuestions=json_decode((string)$json,true);if(!is_array($modelQuestions)||!$modelQuestions)academy_v482_fail('invalid_saved_model',503);return $modelQuestions;}
 return academy_v481_variant_questions($original,$context['model']);
}
function academy_v482_model_summaries(PDO $pdo,string $id): array {
 $q=$pdo->prepare('SELECT challenge_id,model_key FROM v482_round_models WHERE tournament_id=? ORDER BY challenge_id,model_key');$q->execute([$id]);$r=[];
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $row)$r[$row['challenge_id']][]=$row['model_key'];return $r;
}
function academy_v482_lock_event(PDO $pdo,array $user,string $id): array {
 $t=academy_m4_tournament($pdo,$id,true);
 if($t['mode']!=='team'||!academy_m4_can_manage($user,$t))academy_v482_fail('forbidden',403);
 if(!in_array($t['status'],['pending','published'],true)||$t['starts_at']<=gmdate('Y-m-d H:i:s'))academy_v482_fail('team_settings_locked',409);
 $q=$pdo->prepare('SELECT COUNT(*) FROM v481_team_status s JOIN m4_teams t ON t.id=s.team_id WHERE t.tournament_id=? AND s.started_at IS NOT NULL');$q->execute([$id]);if((int)$q->fetchColumn())academy_v482_fail('teams_already_started',409);
 $q=$pdo->prepare('SELECT COUNT(*) FROM v48_attempt_sessions s JOIN m4_tournament_rounds r ON r.challenge_id=s.challenge_id WHERE r.tournament_id=?');$q->execute([$id]);if((int)$q->fetchColumn())academy_v482_fail('round_attempts_already_started',409);
 return $t;
}
function academy_v482_balance_plan(array $teams,array $members,array $percentages,int $maxSize): array {
 $n=count($teams);if($n<2||$n>24)academy_v482_fail('two_to_twenty_four_teams_required',422);
 $m=count($members);if($m<$n||$m>240||$m>$n*$maxSize)academy_v482_fail('team_roster_out_of_range',422);
 $rows=[];$ids=[];foreach($teams as $team){$ids[$team['id']]=true;$rows[$team['id']]=['id'=>$team['id'],'name'=>$team['title'],'captain'=>$team['captain_id'],'members'=>[],'score'=>0.0];}
 $players=[];foreach($members as $mem){if(!isset($ids[$mem['team_id']]))academy_v482_fail('invalid_team_member');$sid=$mem['student_id'];if(isset($players[$sid]))academy_v482_fail('duplicate_team_member');$players[$sid]=['id'=>$sid,'score'=>round((float)($percentages[$sid]??50.0),2),'originalTeam'=>$mem['team_id']];}
 foreach($rows as $tid=>&$team){$captain=$team['captain'];if(!isset($players[$captain])||$players[$captain]['originalTeam']!==$tid)academy_v482_fail('team_captain_missing',409);$team['members'][]=$captain;$team['score']+=$players[$captain]['score'];}unset($team);
 $targets=[];foreach(array_keys($rows) as $idx=>$tid)$targets[$tid]=intdiv($m,$n)+($idx<($m%$n)?1:0);
 $candidates=[];foreach($players as $sid=>$player){if($rows[$player['originalTeam']]['captain']!==(string)$sid)$candidates[]=$player;}
 usort($candidates,static fn($a,$b)=>($b['score']<=>$a['score'])?:strcmp($a['id'],$b['id']));
 foreach($candidates as $pl){$available=array_values(array_filter(array_keys($rows),static fn($tid)=>count($rows[$tid]['members'])<$targets[$tid]));if(!$available)academy_v482_fail('balance_capacity_exceeded');
  usort($available,static fn($a,$b)=>($rows[$a]['score']<=>$rows[$b]['score'])?:(count($rows[$a]['members'])<=>count($rows[$b]['members']))?:strcmp($a,$b));$best=$available[0];$rows[$best]['members'][]=$pl['id'];$rows[$best]['score']+=$pl['score'];
 }
 $assigned=[];$view=[];foreach($rows as $tid=>$row){foreach($row['members'] as $sid)$assigned[$sid]=$tid;$view[]=['id'=>$tid,'name'=>$row['name'],'members'=>count($row['members']),'skillScore'=>$row['score']];}
 return ['assignments'=>$assigned,'teams'=>$view];
}
function academy_v482_balance_data(PDO $pdo,string $id): array {
 $q=$pdo->prepare('SELECT id,title,captain_id FROM m4_teams WHERE tournament_id=? ORDER BY created_at,id');$q->execute([$id]);$teams=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$pdo->prepare('SELECT student_id,team_id FROM m4_team_members WHERE tournament_id=? ORDER BY team_id,student_id FOR UPDATE');$q->execute([$id]);$members=$q->fetchAll(PDO::FETCH_ASSOC);
 if(count($members)>240)academy_v482_fail('too_many_students_to_balance',422);
 $ids=array_column($members,'student_id');$skill=[];
 if($ids){$params=implode(',',array_fill(0,count($ids),'?'));
  $q=$pdo->prepare("SELECT a.student_id,AVG(a.percentage) AS proficiency FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id AND c.is_training=0 WHERE a.student_id IN ($params) GROUP BY a.student_id");$q->execute($ids);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $row)$skill[$row['student_id']]=(float)$row['proficiency'];
 }
 $hash=hash('sha256',implode('|',array_map(static fn($m)=>$m['student_id'].':'.$m['team_id'],$members)));
 return ['teams'=>$teams,'members'=>$members,'skill'=>$skill,'rosterHash'=>$hash];
}
function academy_v482_record_team_certificate(PDO $pdo,string $tournamentId,string $studentId,string $teamId,string $teamName): void {
 $q=$pdo->prepare("SELECT id FROM m7_certificates WHERE source_type='tournament' AND source_id=? AND student_id=? AND award_kind='rank' AND award_rank BETWEEN 1 AND 3");$q->execute([$tournamentId,$studentId]);$certId=$q->fetchColumn();if(!$certId)return;
 $pdo->prepare('INSERT IGNORE INTO v482_team_certificate_details(certificate_id,team_id,team_name_snapshot) VALUES(?,?,?)')->execute([$certId,$teamId,mb_substr($teamName,0,100)]);
}
function academy_v482_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v482/'))return;
 $user=academy_current_user(true);academy_m1_guard_role($user,['admin','teacher']);$uid=$user['id'];$b=$method==='POST'?academy_body():[];
 if($route==='/v482/team/balance-preview'&&$method==='GET'){
  $id=academy_m4_uuid($_GET['tournamentId']??'');$pdo->beginTransaction();try{
   $t=academy_v482_lock_event($pdo,$user,$id);$data=academy_v482_balance_data($pdo,$id);
   $plan=academy_v482_balance_plan($data['teams'],$data['members'],$data['skill'],(int)$t['max_team_size']);$pdo->commit();
   academy_json(['ok'=>true,'teams'=>$plan['teams'],'rosterHash'=>$data['rosterHash'],'participants'=>count($data['members'])]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v482/team/balance-apply'&&$method==='POST'){
  $id=academy_m4_uuid($b['tournamentId']??'');$hash=(string)($b['rosterHash']??'');if(!preg_match('/^[a-f0-9]{64}$/D',$hash))academy_v482_fail('preview_required',422);
  $pdo->beginTransaction();try{
   $t=academy_v482_lock_event($pdo,$user,$id);$data=academy_v482_balance_data($pdo,$id);
   if(!hash_equals($data['rosterHash'],$hash))academy_v482_fail('roster_changed_preview_again',409);
   $plan=academy_v482_balance_plan($data['teams'],$data['members'],$data['skill'],(int)$t['max_team_size']);$moved=0;
   $update=$pdo->prepare('UPDATE m4_team_members SET team_id=? WHERE tournament_id=? AND student_id=?');
   foreach($data['members'] as $member){$dest=$plan['assignments'][$member['student_id']];if($dest===$member['team_id'])continue;
    $update->execute([$dest,$id,$member['student_id']]);$moved++;
    $pdo->prepare('DELETE FROM v481_member_ready WHERE tournament_id=? AND student_id=?')->execute([$id,$member['student_id']]);
   }
   // All assignments follow roster slots; never keep a stale model after balancing.
   $pdo->prepare('DELETE FROM v481_model_assignments WHERE tournament_id=?')->execute([$id]);
   $pdo->commit();academy_audit($uid,'v482.team.balance',$id,['moved'=>$moved]);academy_json(['ok'=>true,'moved'=>$moved]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/v482/models/generate'&&$method==='POST'){
  $id=academy_m4_uuid($b['tournamentId']??'');$cid=academy_m4_uuid($b['challengeId']??'');$per=filter_var($b['questionsPerModel']??null,FILTER_VALIDATE_INT);
  if($per===false||$per<1||$per>60)academy_v482_fail('invalid_questions_per_model');
  $pdo->beginTransaction();try{
   $t=academy_v482_lock_event($pdo,$user,$id);$r=academy_v481_rules($pdo,$id);$count=(int)$r['model_count'];if($count<2||$count>3)academy_v482_fail('choose_two_or_three_models_first',409);
   $q=$pdo->prepare('SELECT c.* FROM m4_tournament_rounds round_link JOIN m1_challenges c ON c.id=round_link.challenge_id WHERE round_link.tournament_id=? AND round_link.challenge_id=? FOR UPDATE');$q->execute([$id,$cid]);$c=$q->fetch(PDO::FETCH_ASSOC);
   if(!$c||$c['status']!=='published'||!academy_v48_rule($pdo,$cid))academy_v482_fail('advanced_published_round_required',409);
   $qs=json_decode((string)$c['questions_json'],true);if(!is_array($qs)||count($qs)<$count*$per)academy_v482_fail('not_enough_questions_for_distinct_models',422);
   // Nonoverlapping sets eliminate answer-sharing between variants. Each is persisted before the tournament begins.
   $pool=$qs;shuffle($pool);$pdo->prepare('DELETE FROM v482_round_models WHERE tournament_id=? AND challenge_id=?')->execute([$id,$cid]);
   $insert=$pdo->prepare('INSERT INTO v482_round_models(tournament_id,challenge_id,model_key,questions_json,question_count,created_by) VALUES(?,?,?,?,?,?)');
   for($i=0;$i<$count;$i++){$key=['A','B','C'][$i];$subset=array_slice($pool,$i*$per,$per);$subset=academy_v481_variant_questions($subset,$key);$insert->execute([$id,$cid,$key,json_encode($subset,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR),$per,$uid]);}
   $pdo->commit();academy_audit($uid,'v482.models.generate',$id,['challenge'=>$cid,'modelCount'=>$count,'questionsPerModel'=>$per]);academy_json(['ok'=>true,'modelCount'=>$count,'questionsPerModel'=>$per]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 academy_v482_fail('not_found',404);
}
