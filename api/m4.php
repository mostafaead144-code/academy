<?php
/** M4 seasons, tournaments and teams — only server-verified M1 challenges/attempts contribute to results. */
declare(strict_types=1);
function academy_m4_fail(string $error,int $code=422): never {academy_json(['ok'=>false,'error'=>$error],$code);}
function academy_m4_uuid(mixed $v): string {$s=(string)$v;if(!academy_m1_uuid($s))academy_m4_fail('invalid_id');return $s;}
function academy_m4_scope_profile(string $uid): array {
 $p=academy_read_node('studentProfilesV3/'.$uid);
 if(!is_array($p))academy_m4_fail('student_profile_required',403);
 return academy_m1_scope(['type'=>$p['educationType']??'','stage'=>$p['stage']??'','grade'=>$p['grade']??0]);
}
function academy_m4_scope_match(array $row,array $scope): bool {
 return $row['education_type']===$scope['type']&&$row['stage']===$scope['stage']&&(int)$row['grade']===$scope['grade'];
}
function academy_m4_tournament(PDO $pdo,string $id,bool $lock=false): array {
 $st=$pdo->prepare('SELECT * FROM m4_tournaments WHERE id=?'.($lock?' FOR UPDATE':''));$st->execute([$id]);$row=$st->fetch(PDO::FETCH_ASSOC);if(!$row)academy_m4_fail('tournament_not_found',404);return $row;
}
function academy_m4_can_manage(array $user,array $t): bool {
 return $user['primary_role']==='admin'||($user['primary_role']==='teacher'&&$t['creator_id']===$user['id']&&academy_teacher_is_active_profile($user['id']));
}
function academy_m4_scope_payload(array $b): array {
 return academy_m1_scope($b);
}
function academy_m4_date(mixed $val): string {return academy_m1_date($val);}
function academy_m4_ready_to_join(array $t): bool {
 $now=gmdate('Y-m-d H:i:s');return $t['status']==='published'&&$now<$t['starts_at']&&$now<=$t['ends_at'];
}
function academy_m4_rounds(PDO $pdo,string $id): array {
 $q=$pdo->prepare('SELECT r.id,r.round_no,r.challenge_id,c.title AS challenge_title,c.starts_at,c.ends_at,c.status AS challenge_status FROM m4_tournament_rounds r JOIN m1_challenges c ON c.id=r.challenge_id WHERE r.tournament_id=? ORDER BY r.round_no ASC LIMIT 40');$q->execute([$id]);return $q->fetchAll(PDO::FETCH_ASSOC);
}
function academy_m4_rank(PDO $pdo,array $t): array {
 $id=$t['id'];$roundCount=count(academy_m4_rounds($pdo,$id));
 if($t['mode']==='solo'){
  // Only attempts after actual enrollment, and within this tournament's configured window.
  $sql='SELECT e.student_id AS member_id,COALESCE(SUM(a.points_awarded),0) AS score,COUNT(a.id) AS completed FROM m4_solo_enrollments e LEFT JOIN m4_tournament_rounds r ON r.tournament_id=e.tournament_id LEFT JOIN m1_challenge_attempts a ON a.challenge_id=r.challenge_id AND a.student_id=e.student_id AND a.created_at>=e.enrolled_at AND a.created_at>=? AND a.created_at<=? WHERE e.tournament_id=? GROUP BY e.student_id ORDER BY score DESC,completed DESC,e.student_id ASC LIMIT 100';
  $q=$pdo->prepare($sql);$q->execute([$t['starts_at'],$t['ends_at'],$id]);$out=[];foreach($q->fetchAll(PDO::FETCH_ASSOC)as$r)$out[]=['id'=>$r['member_id'],'name'=>academy_m3_public_name($r['member_id']),'score'=>(int)$r['score'],'completed'=>(int)$r['completed']];return $out;
 }
 // V48.1 configurable team ranking: average (legacy default), sum, or average of top N members.
 return academy_v481_team_rank($pdo,$t,academy_v481_rules($pdo,$id));

}
function academy_m4_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m4/'))return;
 $u=academy_current_user(true);$role=(string)$u['primary_role'];$uid=(string)$u['id'];$b=$method==='GET'?[]:academy_body();
 if($route==='/m4/overview'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher','student']);
  $scope=$role==='student'?academy_m4_scope_profile($uid):null;
  if($role==='student'){$cond="WHERE education_type=? AND stage=? AND grade=? AND status IN ('published','closed')";$args=[$scope['type'],$scope['stage'],$scope['grade']];}
  elseif($role==='teacher'){$cond='WHERE creator_id=?';$args=[$uid];}else{$cond='';$args=[];}
  $q=$pdo->prepare('SELECT id,season_id,title,description,education_type,stage,grade,subject,mode,is_training,status,starts_at,ends_at,max_team_size,creator_id FROM m4_tournaments '.$cond.' ORDER BY starts_at DESC LIMIT 120');$q->execute($args);$tours=$q->fetchAll(PDO::FETCH_ASSOC);
  $sq=$pdo->prepare('SELECT id,title,description,education_type,stage,grade,starts_at,ends_at,status FROM m4_seasons '.($role==='student'?"WHERE education_type=? AND stage=? AND grade=? AND status IN ('published','closed')":($role==='teacher'?"WHERE status='published' OR creator_id=?":'')).' ORDER BY starts_at DESC LIMIT 80');$sq->execute($role==='student'?[$scope['type'],$scope['stage'],$scope['grade']]:($role==='teacher'?[$uid]:[]));
  academy_json(['ok'=>true,'tournaments'=>$tours,'seasons'=>$sq->fetchAll(PDO::FETCH_ASSOC)]);
 }
 if($route==='/m4/seasons/create'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);if($role==='teacher'&&(!academy_teacher_is_active_profile($uid)||empty(academy_teacher_permissions($uid)['createTournaments'])))academy_m4_fail('teacher_permission',403);$scope=academy_m4_scope_payload($b);if($role==='teacher'){$granted=false;foreach(academy_teacher_assignments($uid)as $assignment){if(!empty($assignment['type'])&&$assignment['type']!==$scope['type'])continue;if(!empty($assignment['stage'])&&$assignment['stage']!==$scope['stage'])continue;if(isset($assignment['grade'])&&(string)$assignment['grade']!==(string)$scope['grade'])continue;$granted=true;break;}if(!$granted)academy_m4_fail('teacher_scope_or_permission',403);}$title=trim((string)($b['title']??''));$desc=trim((string)($b['description']??''));$start=academy_m4_date($b['startsAt']??null);$end=academy_m4_date($b['endsAt']??null);
  if(mb_strlen($title)<4||mb_strlen($title)>160||mb_strlen($desc)>1000||$end<=$start||$end<=gmdate('Y-m-d H:i:s'))academy_m4_fail('invalid_season');$reveal=academy_v48_policy($b['revealPolicy']??'after_end',['instant','after_end','manual'],'reveal_policy');$id=academy_uuid();$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO m4_seasons(id,title,description,education_type,stage,grade,starts_at,ends_at,creator_id) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$id,$title,$desc,$scope['type'],$scope['stage'],$scope['grade'],$start,$end,$uid]);$pdo->prepare('INSERT INTO v48_season_rules(season_id,reveal_policy) VALUES(?,?)')->execute([$id,$reveal]);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}academy_audit($uid,'m4.season.create',$id);academy_json(['ok'=>true,'id'=>$id],201);
 }
 if($route==='/m4/seasons/status'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=academy_m4_uuid($b['id']??'');$decision=(string)($b['decision']??'');if(!in_array($decision,['publish','close'],true))academy_m4_fail('invalid_decision');$from=$decision==='publish'?'draft':'published';$to=$decision==='publish'?'published':'closed';$st=$pdo->prepare('UPDATE m4_seasons SET status=? WHERE id=? AND status=?');$st->execute([$to,$id,$from]);if($st->rowCount()!==1)academy_m4_fail('invalid_transition',409);academy_audit($uid,'m4.season.'.$to,$id);academy_json(['ok'=>true,'status'=>$to]);
 }
 if($route==='/m4/tournaments/create'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);$scope=academy_m4_scope_payload($b);$title=trim((string)($b['title']??''));$desc=trim((string)($b['description']??''));$subject=trim((string)($b['subject']??''));$mode=(string)($b['mode']??'solo');$training=($b['isTraining']??true)!==false;$size=(int)($b['maxTeamSize']??5);$start=academy_m4_date($b['startsAt']??null);$end=academy_m4_date($b['endsAt']??null);
  if(mb_strlen($title)<4||mb_strlen($title)>160||mb_strlen($desc)>1000||!preg_match('/^[A-Za-z0-9_-]{2,80}$/D',$subject)||!in_array($mode,['solo','team'],true)||$size<2||$size>12||$end<=$start||$start<=gmdate('Y-m-d H:i:s'))academy_m4_fail('invalid_tournament');
  if($role==='teacher'){$perms=academy_teacher_permissions($uid);if(!academy_teacher_is_active_profile($uid)||empty($perms['createTournaments'])||!academy_teacher_scope_allowed($uid,['type'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>(string)$scope['grade'],'subject'=>$subject]))academy_m4_fail('teacher_scope_or_permission',403);$status=$training&&!empty($perms['publishTournaments'])?'published':'pending';}else $status='published';
  $seasonId=($b['seasonId']??'')!==''?academy_m4_uuid($b['seasonId']):null;
  if($seasonId){$st=$pdo->prepare('SELECT * FROM m4_seasons WHERE id=?');$st->execute([$seasonId]);$season=$st->fetch(PDO::FETCH_ASSOC);if(!$season||$season['status']!=='published'||!academy_m4_scope_match($season,$scope)||$start<$season['starts_at']||$end>$season['ends_at'])academy_m4_fail('season_scope_or_dates',422);}
  $teamRules=$mode==='team'?academy_v481_rules_payload($b,$size):null;$id=academy_uuid();$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO m4_tournaments(id,season_id,title,description,education_type,stage,grade,subject,mode,is_training,status,starts_at,ends_at,max_team_size,creator_id,creator_role) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id,$seasonId,$title,$desc,$scope['type'],$scope['stage'],$scope['grade'],$subject,$mode,$training?1:0,$status,$start,$end,$size,$uid,$role]);if($teamRules)academy_v481_store_rules($pdo,$id,$teamRules);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}academy_audit($uid,'m4.tournament.create',$id,['status'=>$status]);academy_json(['ok'=>true,'id'=>$id,'status'=>$status],201);
 }
 if($route==='/m4/tournaments/decision'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=academy_m4_uuid($b['id']??'');$decision=(string)($b['decision']??'');if(!in_array($decision,['approve','reject','close'],true))academy_m4_fail('invalid_decision');$from=$decision==='close'?'published':'pending';if($decision==='approve'){$current=academy_m4_tournament($pdo,$id);if($current['starts_at']<=gmdate('Y-m-d H:i:s'))academy_m4_fail('approval_after_start_forbidden',409);}$to=match($decision){'approve'=>'published','reject'=>'rejected','close'=>'closed'};$st=$pdo->prepare('UPDATE m4_tournaments SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status=?');$st->execute([$to,$uid,$id,$from]);if($st->rowCount()!==1)academy_m4_fail('invalid_transition',409);academy_audit($uid,'m4.tournament.'.$to,$id);academy_json(['ok'=>true,'status'=>$to]);
 }
 if($route==='/m4/rounds/add'&&$method==='POST'){
  academy_m1_guard_role($u,['admin','teacher']);$id=academy_m4_uuid($b['tournamentId']??'');$challengeId=academy_m4_uuid($b['challengeId']??'');$t=academy_m4_tournament($pdo,$id);
  if(!academy_m4_can_manage($u,$t))academy_m4_fail('forbidden',403);
  if($t['status']==='closed'||$t['status']==='rejected'||gmdate('Y-m-d H:i:s')>=$t['starts_at'])academy_m4_fail('round_edit_locked',409);
  $c=academy_m1_fetch($pdo,$challengeId);if(!$c||$c['status']!=='published'||!academy_m4_scope_match($c,['type'=>$t['education_type'],'stage'=>$t['stage'],'grade'=>(int)$t['grade']])||$c['subject']!==$t['subject']||(int)$c['is_training']!==(int)$t['is_training']||$c['starts_at']<$t['starts_at']||$c['ends_at']>$t['ends_at'])academy_m4_fail('challenge_scope_or_schedule',422);
  if($role==='teacher'&&$c['creator_id']!==$uid)academy_m4_fail('teacher_challenge_owner_required',403);
  $count=$pdo->prepare('SELECT COALESCE(MAX(round_no),0) FROM m4_tournament_rounds WHERE tournament_id=?');$count->execute([$id]);$next=(int)$count->fetchColumn()+1;if($next>30)academy_m4_fail('too_many_rounds',422);
  try{$pdo->prepare('INSERT INTO m4_tournament_rounds(id,tournament_id,challenge_id,round_no) VALUES(?,?,?,?)')->execute([academy_uuid(),$id,$challengeId,$next]);}catch(PDOException $e){if($e->getCode()==='23000')academy_m4_fail('duplicate_round',409);throw $e;}
  academy_audit($uid,'m4.round.add',$challengeId,['tournamentId'=>$id]);academy_json(['ok'=>true,'roundNo'=>$next],201);
 }
 if($route==='/m4/tournament'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','teacher','student']);$id=academy_m4_uuid($_GET['id']??'');$t=academy_m4_tournament($pdo,$id);
  if($role==='student'){if(!in_array($t['status'],['published','closed'],true)||!academy_m4_scope_match($t,academy_m4_scope_profile($uid)))academy_m4_fail('tournament_unavailable',403);}elseif(!academy_m4_can_manage($u,$t))academy_m4_fail('forbidden',403);
  $rounds=academy_m4_rounds($pdo,$id);$enrolled=false;$myTeam=null;$teams=[];
  if($role==='student'){
   if($t['mode']==='solo'){$st=$pdo->prepare('SELECT COUNT(*) FROM m4_solo_enrollments WHERE tournament_id=? AND student_id=?');$st->execute([$id,$uid]);$enrolled=(bool)$st->fetchColumn();}
   else{$st=$pdo->prepare('SELECT team_id FROM m4_team_members WHERE tournament_id=? AND student_id=?');$st->execute([$id,$uid]);$myTeam=$st->fetchColumn()?:null;$enrolled=$myTeam!==null;}
  }
  if($t['mode']==='team'){$st=$pdo->prepare('SELECT tm.id,tm.title,COUNT(mem.student_id) AS member_count FROM m4_teams tm LEFT JOIN m4_team_members mem ON mem.team_id=tm.id WHERE tm.tournament_id=? GROUP BY tm.id,tm.title ORDER BY tm.created_at LIMIT 100');$st->execute([$id]);$teams=$st->fetchAll(PDO::FETCH_ASSOC);}
  // Delayed V48 rounds are published on safe reads once their end time passes.
  foreach($rounds as $rd){$challenge=academy_m1_fetch($pdo,(string)$rd['challenge_id']);if($challenge)academy_v48_release_due($pdo,$challenge);}
  $rank=academy_m4_rank($pdo,$t);$visible=($role!=='student'||$t['is_training']||$t['ends_at']<gmdate('Y-m-d H:i:s'));
  $extra=$t['mode']==='team'?academy_v481_team_extra($pdo,$t,$uid,$role,$myTeam):[];
  if($t['mode']==='team'&&$role!=='student')$extra['modelSets']=academy_v482_model_summaries($pdo,$id);
  academy_json(array_merge($extra,['ok'=>true,'tournament'=>$t,'rounds'=>array_map(static fn($r)=>['roundNo'=>(int)$r['round_no'],'challengeId'=>$r['challenge_id'],'title'=>$r['challenge_title'],'startsAt'=>$r['starts_at'],'endsAt'=>$r['ends_at'],'status'=>$r['challenge_status']],$rounds),'teams'=>$teams,'enrolled'=>$enrolled,'myTeamId'=>$myTeam,'ranking'=>$visible?$rank:[],'rankingLocked'=>!$visible,'canJoin'=>academy_m4_ready_to_join($t)]));
 }
 if($route==='/m4/enroll'&&$method==='POST'){
  academy_m1_guard_role($u,['student']);$id=academy_m4_uuid($b['tournamentId']??'');$scope=academy_m4_scope_profile($uid);$pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='solo'||!academy_m4_ready_to_join($t)||!academy_m4_scope_match($t,$scope)){$pdo->rollBack();academy_m4_fail('enrollment_closed',403);}
   $pdo->prepare('INSERT IGNORE INTO m4_solo_enrollments(tournament_id,student_id) VALUES(?,?)')->execute([$id,$uid]);$pdo->commit();academy_json(['ok'=>true,'enrolled'=>true]);
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/m4/teams/create'&&$method==='POST'){
  academy_m1_guard_role($u,['student']);$id=academy_m4_uuid($b['tournamentId']??'');$title=trim((string)($b['title']??''));if(mb_strlen($title)<3||mb_strlen($title)>100)academy_m4_fail('invalid_team_name');$scope=academy_m4_scope_profile($uid);
  $pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='team'||!academy_m4_ready_to_join($t)||!academy_m4_scope_match($t,$scope)){$pdo->rollBack();academy_m4_fail('team_creation_closed',403);}
   $already=$pdo->prepare('SELECT team_id FROM m4_team_members WHERE tournament_id=? AND student_id=?');$already->execute([$id,$uid]);if($already->fetchColumn()){$pdo->rollBack();academy_m4_fail('already_in_team',409);}
   $code=strtoupper(bin2hex(random_bytes(5)));$teamId=academy_uuid();$pdo->prepare('INSERT INTO m4_teams(id,tournament_id,title,join_code_hash,captain_id) VALUES(?,?,?,?,?)')->execute([$teamId,$id,$title,hash('sha256',$code),$uid]);$pdo->prepare('INSERT INTO m4_team_members(tournament_id,student_id,team_id) VALUES(?,?,?)')->execute([$id,$uid,$teamId]);$pdo->commit();academy_audit($uid,'m4.team.create',$teamId);academy_json(['ok'=>true,'teamId'=>$teamId,'joinCode'=>$code],201);
  }catch(PDOException $e){if($pdo->inTransaction())$pdo->rollBack();if($e->getCode()==='23000')academy_m4_fail('duplicate_team_name_or_membership',409);throw $e;}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 if($route==='/m4/teams/join'&&$method==='POST'){
  academy_m1_guard_role($u,['student']);academy_rate_limit('m4-join-'.$uid,12,900);$id=academy_m4_uuid($b['tournamentId']??'');$code=strtoupper(trim((string)($b['joinCode']??'')));if(!preg_match('/^[A-F0-9]{10}$/D',$code))academy_m4_fail('invalid_join_code');$scope=academy_m4_scope_profile($uid);
  $pdo->beginTransaction();try{
   $t=academy_m4_tournament($pdo,$id,true);if($t['mode']!=='team'||!academy_m4_ready_to_join($t)||!academy_m4_scope_match($t,$scope)){$pdo->rollBack();academy_m4_fail('joining_closed',403);}
   $st=$pdo->prepare('SELECT id FROM m4_teams WHERE tournament_id=? AND join_code_hash=?');$st->execute([$id,hash('sha256',$code)]);$teamId=$st->fetchColumn();if(!$teamId){$pdo->rollBack();academy_m4_fail('join_code_not_found',404);}
   $has=$pdo->prepare('SELECT team_id FROM m4_team_members WHERE tournament_id=? AND student_id=?');$has->execute([$id,$uid]);if($has->fetchColumn()){$pdo->rollBack();academy_m4_fail('already_in_team',409);}
   $size=$pdo->prepare('SELECT COUNT(*) FROM m4_team_members WHERE team_id=?');$size->execute([$teamId]);if((int)$size->fetchColumn()>=(int)$t['max_team_size']){$pdo->rollBack();academy_m4_fail('team_is_full',409);}
   $pdo->prepare('INSERT INTO m4_team_members(tournament_id,student_id,team_id) VALUES(?,?,?)')->execute([$id,$uid,$teamId]);$pdo->commit();academy_audit($uid,'m4.team.join',$teamId);academy_json(['ok'=>true,'teamId'=>$teamId],201);
  }catch(PDOException $e){if($pdo->inTransaction())$pdo->rollBack();if($e->getCode()==='23000')academy_m4_fail('already_in_team',409);throw $e;}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 academy_m4_fail('not_found',404);
}
