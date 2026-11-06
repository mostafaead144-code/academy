<?php
/** V53 — direct but manually confirmed WhatsApp report targeting for authorized guardians. */
declare(strict_types=1);
function academy_v53_fail(string $code,int $status=422): never {academy_json(['ok'=>false,'error'=>$code],$status);}
function academy_v53_e164(string $raw): string {
 $national=academy_v47_phone($raw);
 return $national!==''?'20'.substr($national,1):'';
}
function academy_v53_recipients(PDO $pdo,string $sid): array {
 $st=$pdo->prepare("SELECT primary_role,status FROM academy_users WHERE id=? LIMIT 1");$st->execute([$sid]);$student=$st->fetch(PDO::FETCH_ASSOC);
 if(!$student||$student['primary_role']!=='student'||$student['status']!=='active')academy_v53_fail('student_not_available',404);
 $out=[];
 foreach(academy_v51_parent_list($pdo,$sid) as $parent){
  $pid=(string)($parent['parentId']??'');
  if(empty($parent['canExportContact'])||!academy_v51_contact_ready($sid,$pid))continue;
  $national=academy_v47_phone(academy_v51_parent_number($pid));if($national==='')continue;
  $out[]=['parentId'=>$pid,'name'=>mb_substr((string)($parent['name']??'ولي الأمر'),0,100),'maskedPhone'=>substr($national,0,3).'*****'.substr($national,-3)];
  if(count($out)>=60)break;
 }
 return $out;
}
function academy_v53_route(string $route,string $method,PDO $pdo):void {
 if(!str_starts_with($route,'/v53/'))return;
 $u=academy_current_user(true);
 if(($u['primary_role']??'')!=='admin')academy_v53_fail('forbidden',403);
 $uid=(string)$u['id'];
 if($route==='/v53/report/recipients'&&$method==='GET'){
  academy_rate_limit('v53-report-target-list-'.$uid,80,3600);
  $sid=academy_v51_student_id($_GET['studentId']??'');
  academy_json(['ok'=>true,'studentId'=>$sid,'recipients'=>academy_v53_recipients($pdo,$sid)]);
 }
 if($route==='/v53/report/whatsapp-target'&&$method==='POST'){
  academy_rate_limit('v53-report-target-open-'.$uid,60,3600);
  $b=academy_body();$sid=academy_v51_student_id($b['studentId']??'');$pid=academy_v51_parent_id($b['parentId']??'');
  $recipients=academy_v53_recipients($pdo,$sid);
  $allowed=false;foreach($recipients as $r)if($r['parentId']===$pid){$allowed=true;break;}
  if(!$allowed)academy_v53_fail('contact_not_permitted',403);
  // Revalidate consent and phone immediately, never trust client-supplied numbers.
  if(!academy_v51_contact_ready($sid,$pid))academy_v53_fail('contact_not_permitted',403);
  $phone=academy_v53_e164(academy_v51_parent_number($pid));
  if($phone===''||!preg_match('/^201[0125][0-9]{8}$/D',$phone))academy_v53_fail('invalid_parent_phone',422);
  academy_audit($uid,'v53.report.whatsapp.prepare',$sid,['parentId'=>$pid]);
  academy_json(['ok'=>true,'phone'=>$phone,'requiresManualSend'=>true]);
 }
 academy_v53_fail('not_found',404);
}
