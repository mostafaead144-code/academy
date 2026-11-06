<?php
/** EGTAZ M7: verified awards, public verification, safely scoped appearance settings. PHP 8.1+. */
declare(strict_types=1);
function academy_m7_fail(string $message,int $code=422): never { academy_json(['ok'=>false,'error'=>$message],$code); }
function academy_m7_uuid(mixed $id): string { $id=(string)$id; if(!academy_m1_uuid($id))academy_m7_fail('invalid_id');return $id; }
function academy_m7_default(): array {return ['title'=>'أكاديمية اجتاز','tagline'=>'كل خطوة تصنع فارقًا','primaryColor'=>'#4f55e8','accentColor'=>'#7257e8','template'=>'modern','sealLabel'=>'شهادة إنجاز معتمدة','logoUrl'=>'','coverUrl'=>'','minPercentage'=>70];}
function academy_m7_settings(PDO $pdo): array {
 $q=$pdo->query('SELECT settings_json FROM m7_certificate_settings WHERE id=1');$raw=$q->fetchColumn();$data=$raw?json_decode((string)$raw,true):[];
 return array_replace(academy_m7_default(),is_array($data)?$data:[]);
}
function academy_m7_https_url(mixed $url): string {
 $url=trim((string)$url);if($url==='')return '';
 if(strlen($url)>700||!filter_var($url,FILTER_VALIDATE_URL))academy_m7_fail('invalid_image_url');
 $p=parse_url($url);if(!is_array($p)||strtolower($p['scheme']??'')!=='https'||empty($p['host'])||isset($p['user'])||isset($p['pass'])||isset($p['fragment']))academy_m7_fail('https_url_required');
 if(filter_var($p['host'],FILTER_VALIDATE_IP)||strtolower($p['host'])==='localhost'||!str_contains($p['host'],'.'))academy_m7_fail('external_image_url_required');
 return $url;
}
function academy_m7_validate(array $b): array {
 $title=trim((string)($b['title']??''));$tagline=trim((string)($b['tagline']??''));$seal=trim((string)($b['sealLabel']??''));
 if(mb_strlen($title)<3||mb_strlen($title)>90||mb_strlen($tagline)>140||mb_strlen($seal)<3||mb_strlen($seal)>80)academy_m7_fail('invalid_brand_text');
 $p=strtolower((string)($b['primaryColor']??''));$a=strtolower((string)($b['accentColor']??''));if(!preg_match('/^#[0-9a-f]{6}$/D',$p)||!preg_match('/^#[0-9a-f]{6}$/D',$a))academy_m7_fail('invalid_brand_color');
 $template=(string)($b['template']??'modern');if(!in_array($template,['modern','classic'],true))academy_m7_fail('invalid_template');
 $min=filter_var($b['minPercentage']??70,FILTER_VALIDATE_INT);if($min===false||$min<0||$min>100)academy_m7_fail('invalid_min_percentage');
 return ['title'=>$title,'tagline'=>$tagline,'sealLabel'=>$seal,'primaryColor'=>$p,'accentColor'=>$a,'template'=>$template,'logoUrl'=>academy_m7_https_url($b['logoUrl']??''),'coverUrl'=>academy_m7_https_url($b['coverUrl']??''),'minPercentage'=>$min];
}
function academy_m7_public(array $row,bool $owner=false): array {
 $result=['id'=>$row['id'],'code'=>$row['public_code'],'sourceType'=>$row['source_type'],'sourceTitle'=>$row['source_title'],'kind'=>$row['award_kind'],'rank'=>$row['award_rank']===null?null:(int)$row['award_rank'],'points'=>(int)$row['points_snapshot'],'issuedAt'=>$row['issued_at'],'status'=>$row['status'],'recipientName'=>$owner?$row['recipient_name']:$row['public_name'],'educationType'=>$row['education_type'],'stage'=>$row['stage'],'grade'=>(int)$row['grade']];
 if(!empty($row['team_name_snapshot']))$result['teamName']=$row['team_name_snapshot'];
 if($owner)$result['studentId']=$row['student_id'];return $result;
}
function academy_m7_issued(PDO $pdo,string $sourceType,string $sourceId,string $studentId): bool {
 $q=$pdo->prepare('SELECT id FROM m7_certificates WHERE source_type=? AND source_id=? AND student_id=? LIMIT 1');$q->execute([$sourceType,$sourceId,$studentId]);return (bool)$q->fetchColumn();
}
function academy_m7_insert(PDO $pdo,array $d,string $issuer): bool {
 if(academy_m7_issued($pdo,$d['sourceType'],$d['sourceId'],$d['studentId']))return false;
 $q=$pdo->prepare("SELECT display_name,primary_role,status FROM academy_users WHERE id=? LIMIT 1");$q->execute([$d['studentId']]);$u=$q->fetch(PDO::FETCH_ASSOC);
 if(!$u||$u['primary_role']!=='student'||$u['status']!=='active')return false;
 $profile=academy_read_node('studentProfilesV3/'.$d['studentId']);if(!is_array($profile))return false;
 if(($profile['educationType']??'')!==$d['educationType']||($profile['stage']??'')!==$d['stage']||(int)($profile['grade']??0)!==(int)$d['grade'])return false;
 $privateName=mb_substr(trim((string)($profile['name']??$u['display_name'])),0,160);
 $publicName=trim((string)($profile['publicDisplayName']??''));if($publicName==='')$publicName='طالب مشارك';
 $publicName=mb_substr($publicName,0,90);
 $q=$pdo->prepare('INSERT IGNORE INTO m7_certificates(id,public_code,source_type,source_id,student_id,recipient_name,public_name,source_title,award_kind,award_rank,points_snapshot,education_type,stage,grade,issued_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 $q->execute([academy_uuid(),strtoupper(bin2hex(random_bytes(12))),$d['sourceType'],$d['sourceId'],$d['studentId'],$privateName,$publicName,mb_substr($d['title'],0,180),$d['kind'],$d['rank'],$d['points'],$d['educationType'],$d['stage'],$d['grade'],$issuer]);
 return $q->rowCount()===1;
}
/** V53.2 guard: certificates must never be based on unpublished V48 attempt results. */
function academy_m7_require_released_challenge(PDO $pdo,array $c): void {
 $now=gmdate('Y-m-d H:i:s');
 if(!in_array((string)$c['status'],['published','closed'],true)||$c['ends_at']>=$now)academy_m7_fail('certificate_round_not_finished',409);
 $rule=academy_v48_rule($pdo,(string)$c['id']);
 if(!$rule)return; // Legacy M1 attempts were already published immediately.
 if($rule['reveal_policy']==='after_end'&&empty($rule['results_released_at'])){
  // Automatic scheduled releases are safe to finalize before considering an award.
  academy_v48_release_due($pdo,$c);
  $rule=academy_v48_rule($pdo,(string)$c['id']);
 }
 if($rule['reveal_policy']!=='instant'&&empty($rule['results_released_at']))academy_m7_fail('certificate_results_not_released',409);
}
function academy_m7_require_released_tournament(PDO $pdo,array $t): void {
 $q=$pdo->prepare('SELECT c.* FROM m4_tournament_rounds rd JOIN m1_challenges c ON c.id=rd.challenge_id WHERE rd.tournament_id=? ORDER BY rd.round_no');
 $q->execute([$t['id']]);$rounds=$q->fetchAll(PDO::FETCH_ASSOC);
 if(!$rounds)academy_m7_fail('certificate_tournament_has_no_rounds',409);
 foreach($rounds as $challenge)academy_m7_require_released_challenge($pdo,$challenge);
}
function academy_m7_issue_challenge(PDO $pdo,string $id,array $settings,string $uid): array {
 $c=academy_m1_fetch($pdo,$id);if(!$c)academy_m7_fail('challenge_not_found',404);
 if((int)$c['is_training']!==0||!in_array($c['status'],['published','closed'],true)||$c['ends_at']>=gmdate('Y-m-d H:i:s'))academy_m7_fail('official_completed_challenge_required',409);
 academy_m7_require_released_challenge($pdo,$c);
 $q=$pdo->prepare("SELECT a.student_id,a.percentage,a.points_awarded FROM m1_challenge_attempts a JOIN academy_users u ON u.id=a.student_id AND u.primary_role='student' AND u.status='active' WHERE a.challenge_id=? AND a.created_at>=? AND a.created_at<=? ORDER BY a.percentage DESC,a.correct_count DESC,a.created_at ASC,a.student_id ASC LIMIT 1000");
 $q->execute([$id,$c['starts_at'],$c['ends_at']]);$attempts=$q->fetchAll(PDO::FETCH_ASSOC);$issued=0;$eligible=0;
 foreach($attempts as $a){if((int)$a['percentage']<(int)$settings['minPercentage'])continue;$eligible++;$rank=$eligible<=3?$eligible:null;
  $issued+=academy_m7_insert($pdo,['sourceType'=>'challenge','sourceId'=>$id,'studentId'=>$a['student_id'],'title'=>$c['title'],'kind'=>$rank?'rank':'completion','rank'=>$rank,'points'=>(int)$a['points_awarded'],'educationType'=>$c['education_type'],'stage'=>$c['stage'],'grade'=>(int)$c['grade']],$uid)?1:0;
 }
 return ['issued'=>$issued,'eligible'=>$eligible,'scope'=>'challenge'];
}
function academy_m7_issue_tournament(PDO $pdo,string $id,string $uid): array {
 $t=academy_m4_tournament($pdo,$id);
 if((int)$t['is_training']!==0||!in_array($t['status'],['published','closed'],true)||$t['ends_at']>=gmdate('Y-m-d H:i:s'))academy_m7_fail('official_completed_tournament_required',409);
 academy_m7_require_released_tournament($pdo,$t);
 $rank=academy_m4_rank($pdo,$t);$issued=0;$eligible=0;
 foreach($rank as $i=>$r){if((int)$r['completed']===0)continue;$recipients=[];
  if($t['mode']==='team'){$s=$pdo->prepare('SELECT student_id FROM m4_team_members WHERE team_id=? AND tournament_id=? ORDER BY joined_at LIMIT 50');$s->execute([$r['id'],$id]);$recipients=$s->fetchAll(PDO::FETCH_COLUMN);}else $recipients=[$r['id']];
  foreach($recipients as $studentId){$eligible++;$issued+=academy_m7_insert($pdo,['sourceType'=>'tournament','sourceId'=>$id,'studentId'=>$studentId,'title'=>$t['title'],'kind'=>$i<3?'rank':'completion','rank'=>$i<3?$i+1:null,'points'=>(int)round($r['score']),'educationType'=>$t['education_type'],'stage'=>$t['stage'],'grade'=>(int)$t['grade']],$uid)?1:0;
   if($t['mode']==='team'&&$i<3)academy_v482_record_team_certificate($pdo,$id,$studentId,(string)$r['id'],(string)$r['name']);}
 }
 return ['issued'=>$issued,'eligible'=>$eligible,'scope'=>'tournament'];
}
function academy_m7_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m7/'))return;
 if($route==='/m7/public-settings'&&$method==='GET')academy_json(['ok'=>true,'settings'=>academy_m7_settings($pdo)]);
 if($route==='/m7/verify'&&$method==='GET'){
  academy_rate_limit('m7-verify',35,900);$code=strtoupper(trim((string)($_GET['code']??'')));
  if(!preg_match('/^[A-F0-9]{24}$/D',$code))academy_m7_fail('invalid_certificate_code',422);
  $q=$pdo->prepare('SELECT c.*,tc.team_name_snapshot FROM m7_certificates c LEFT JOIN v482_team_certificate_details tc ON tc.certificate_id=c.id WHERE c.public_code=?');$q->execute([$code]);$r=$q->fetch(PDO::FETCH_ASSOC);
  if(!$r)academy_m7_fail('certificate_not_found',404);
  academy_json(['ok'=>true,'certificate'=>academy_m7_public($r,false),'settings'=>academy_m7_settings($pdo)]);
 }
 $u=academy_current_user(true);$uid=$u['id'];$role=$u['primary_role'];$b=$method==='GET'?[]:academy_body();
 if($route==='/m7/settings'&&$method==='GET')academy_json(['ok'=>true,'settings'=>academy_m7_settings($pdo)]);
 if($route==='/m7/settings'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$data=academy_m7_validate($b);$pdo->prepare('INSERT INTO m7_certificate_settings(id,settings_json,updated_by) VALUES(1,?,?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()')->execute([json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$uid]);academy_audit($uid,'m7.settings.update');academy_json(['ok'=>true,'settings'=>$data]);
 }
 if($route==='/m7/sources'&&$method==='GET'){
  academy_m1_guard_role($u,['admin']);
  $q=$pdo->query("SELECT id,title,'challenge' AS source_type,ends_at FROM m1_challenges WHERE is_training=0 AND status IN ('published','closed') AND ends_at<UTC_TIMESTAMP() ORDER BY ends_at DESC LIMIT 100");$items=$q->fetchAll(PDO::FETCH_ASSOC);
  $q=$pdo->query("SELECT id,title,'tournament' AS source_type,ends_at FROM m4_tournaments WHERE is_training=0 AND status IN ('published','closed') AND ends_at<UTC_TIMESTAMP() ORDER BY ends_at DESC LIMIT 100");$items=array_merge($items,$q->fetchAll(PDO::FETCH_ASSOC));
  academy_json(['ok'=>true,'items'=>$items]);
 }
 if($route==='/m7/certificates'&&$method==='GET'){
  academy_m1_guard_role($u,['admin','student','parent']);$studentId=$uid;
  if($role==='parent'){$studentId=(string)($_GET['studentId']??'');academy_m7_uuid($studentId);if(!academy_parent_can_access_student($uid,$studentId))academy_m7_fail('child_not_linked',403);}
  $sql='SELECT c.*,tc.team_name_snapshot FROM m7_certificates c LEFT JOIN v482_team_certificate_details tc ON tc.certificate_id=c.id';$params=[];if($role!=='admin'){$sql.=' WHERE c.student_id=?';$params[]=$studentId;}
  $sql.=' ORDER BY c.issued_at DESC,c.id DESC LIMIT 200';$q=$pdo->prepare($sql);$q->execute($params);$rows=$q->fetchAll(PDO::FETCH_ASSOC);
  academy_json(['ok'=>true,'items'=>array_map(static fn($r)=>academy_m7_public($r,true),$rows),'settings'=>academy_m7_settings($pdo)]);
 }
 if($route==='/m7/issue'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);academy_rate_limit('m7-issue-'.$uid,12,900);$kind=(string)($b['sourceType']??'');$id=academy_m7_uuid($b['sourceId']??'');$settings=academy_m7_settings($pdo);
  if($kind==='challenge')$result=academy_m7_issue_challenge($pdo,$id,$settings,$uid);
  elseif($kind==='tournament')$result=academy_m7_issue_tournament($pdo,$id,$uid);
  else academy_m7_fail('invalid_source_type');academy_audit($uid,'m7.certificate.issue',$id,$result);academy_json(['ok'=>true]+$result);
 }
 if($route==='/m7/revoke'&&$method==='POST'){
  academy_m1_guard_role($u,['admin']);$id=academy_m7_uuid($b['id']??'');$reason=trim((string)($b['reason']??''));if(mb_strlen($reason)<4||mb_strlen($reason)>200)academy_m7_fail('revocation_reason_required');
  $q=$pdo->prepare("UPDATE m7_certificates SET status='revoked',revoked_by=?,revoked_at=UTC_TIMESTAMP(),revocation_reason=? WHERE id=? AND status='valid'");$q->execute([$uid,$reason,$id]);if(!$q->rowCount())academy_m7_fail('certificate_missing_or_revoked',409);academy_audit($uid,'m7.certificate.revoke',$id);academy_json(['ok'=>true]);
 }
 academy_m7_fail('not_found',404);
}
