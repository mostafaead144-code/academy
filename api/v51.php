<?php
/** V51 — revocable guardian links, explicit contact consent, scoped educational progress reports. */
declare(strict_types=1);
function academy_v51_fail(string $error,int $code=422): never {academy_json(['ok'=>false,'error'=>$error],$code);}
function academy_v51_student_id(mixed $id): string {
 $s=strtolower(trim((string)$id));if(!preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/D',$s))academy_v51_fail('student_invalid');return $s;
}
function academy_v51_parent_id(mixed $id): string {return academy_v51_student_id($id);}
function academy_v51_link(string $parent,string $student): bool {return academy_parent_can_access_student($parent,$student);}
function academy_v51_consent(string $sid,string $pid): array {
 $r=academy_read_node('v51ContactPermissionsV1/'.$sid.'/'.$pid);
 return is_array($r)?$r:[];
}
function academy_v51_guardian_number(string $sid): string {
 $p=academy_read_node('studentProfilesV3/'.$sid);
 if(!is_array($p))return '';
 foreach([$p['guardianPhone']??'',$p['parentPhone']??''] as $candidate){$number=academy_v47_phone((string)$candidate);if($number!=='')return $number;}
 return '';
}
function academy_v51_parent_number(string $pid): string {
 foreach(['parentProfilesV4/'.$pid,'phoneDirectoryV4/parents/'.$pid] as $path){$p=academy_read_node($path);if(!is_array($p))continue;
  $n=academy_v47_phone((string)($p['phone']??$p['phoneNumber']??''));if($n!=='')return $n;}
 return '';
}
function academy_v51_contact_ready(string $sid,string $pid): bool {
 if(!academy_v51_link($pid,$sid))return false;
 $c=academy_v51_consent($sid,$pid);if(($c['studentApproved']??false)!==true||($c['parentOptIn']??false)!==true)return false;
 $studentPhone=academy_v51_guardian_number($sid);$parentPhone=academy_v51_parent_number($pid);
 return $studentPhone!==''&&$studentPhone===$parentPhone;
}
function academy_v51_parent_list(PDO $pdo,string $sid): array {
 $all=academy_read_node('parentLinksV4');$out=[];
 if(!is_array($all))return [];
 $query=$pdo->prepare("SELECT id,display_name,status FROM academy_users WHERE id=? AND primary_role='parent' LIMIT 1");
 foreach($all as $parentId=>$children){if(!is_array($children)||!is_array($children[$sid]??null))continue;
  $link=$children[$sid];if(($link['studentId']??$sid)!==$sid)continue;
  $query->execute([(string)$parentId]);$user=$query->fetch(PDO::FETCH_ASSOC);if(!$user||$user['status']!=='active')continue;
  $c=academy_v51_consent($sid,(string)$parentId);
  $out[]=['parentId'=>$parentId,'name'=>mb_substr((string)$user['display_name'],0,100),'linkedAt'=>(int)($link['linkedAt']??0),
    'studentApproved'=>($c['studentApproved']??false)===true,'parentOptIn'=>($c['parentOptIn']??false)===true,
    'phoneMatchesGuardianRecord'=>academy_v51_guardian_number($sid)!==''&&academy_v51_guardian_number($sid)===academy_v51_parent_number((string)$parentId),
    'canExportContact'=>academy_v51_contact_ready($sid,(string)$parentId)];
  if(count($out)>=60)break;
 }
 return $out;
}
function academy_v51_mastery(array $p,mixed $raw): array {
 $entries=[];$raw=is_array($raw)?$raw:[];
 foreach($raw as $type=>$stages)if(is_array($stages))foreach($stages as $stage=>$grades)if(is_array($grades))foreach($grades as $grade=>$subjects)if(is_array($subjects))foreach($subjects as $subject=>$lessons)if(is_array($lessons))foreach($lessons as $key=>$entry){
  if(!is_array($entry))continue;$id=(string)($entry['lessonId']??$key);if($id==='')continue;$status=(string)($entry['status']??'not_started');
  if($status==='not_started')continue;$entries[$id]=in_array($status,['completed','mastered','done'],true)?'completed':'active';
 }
 foreach((is_array($p['learningProgress']??null)?$p['learningProgress']:[]) as $id=>$entry)if(is_array($entry)&&($entry['completed']??false)===true)$entries[(string)$id]='completed';
 return ['completed'=>count(array_filter($entries,static fn($x)=>$x==='completed')),'active'=>count(array_filter($entries,static fn($x)=>$x==='active'))];
}
function academy_v51_scores(array $p): array {
 $results=$p['quizResultsV22']??[];if(!is_array($results))$results=[];
 $list=[];$subjects=[];
 foreach($results as $key=>$result){if(!is_array($result)||!isset($result['percentage'])||!is_numeric($result['percentage']))continue;
  $score=(float)$result['percentage'];if($score<0||$score>100)continue;
  $subject=mb_substr((string)($result['subject']??'غير محدد'),0,80);
  $list[]=['title'=>mb_substr((string)($result['title']??'اختبار'),0,140),'subject'=>$subject,'percentage'=>round($score,1),'createdAt'=>(int)($result['submittedAt']??$result['createdAt']??0)];
  if(!isset($subjects[$subject]))$subjects[$subject]=['count'=>0,'sum'=>0];$subjects[$subject]['count']++;$subjects[$subject]['sum']+=$score;
 }
 usort($list,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);$weak=[];
 foreach($subjects as $subject=>$data){$avg=$data['sum']/$data['count'];if($data['count']>=2&&$avg<60&&$subject!=='غير محدد')$weak[]=['subject'=>$subject,'average'=>round($avg,1),'attempts'=>$data['count']];}
 usort($weak,static fn($a,$b)=>$a['average']<=>$b['average']);
 return ['count'=>count($list),'average'=>$list?round(array_sum(array_column($list,'percentage'))/count($list),1):null,'recent'=>array_slice($list,0,12),'needsPractice'=>array_slice($weak,0,8)];
}
function academy_v51_homework(string $sid,array $profile): array {
 $raw=academy_read_node('assignments');$all=is_array($raw)?$raw:[];$now=academy_now_ms();$items=[];$scores=[];$graded=0;$submitted=0;$overdue=0;
 foreach($all as $id=>$a){if(!is_array($a)||($a['status']??'')!=='published'||($a['isHidden']??false)===true||!academy_scope_matches($a,$profile))continue;
  // Same server-side membership check used by the student's own assignment list.
  if(($a['targetMode']??'stage')==='group'&&!academy_v534_assignment_group_allowed($a,$profile,$sid))continue;
  $submission=academy_read_node('assignmentSubmissions/'.$id.'/'.$sid);$status='new';$score=null;
  if(is_array($submission)&&($submission['status']??'')==='graded'&&is_numeric($submission['score']??null)){$status='graded';$score=max(0,min(100,(float)$submission['score']));$graded++;$scores[]=$score;}
  elseif(is_array($submission)&&($submission['status']??'')==='submitted'){$status='submitted';$submitted++;}
  elseif((int)($a['dueAt']??0)>0&&(int)$a['dueAt']<$now){$status='overdue';$overdue++;}
  $items[]=['title'=>mb_substr((string)($a['title']??'واجب'),0,130),'status'=>$status,'score'=>$score,'dueAt'=>(int)($a['dueAt']??0),'subject'=>(string)($a['subject']??'')];
  if(count($items)>=300)break;
 }
 usort($items,static fn($a,$b)=>$b['dueAt']<=>$a['dueAt']);
 return ['total'=>count($items),'graded'=>$graded,'submitted'=>$submitted,'overdue'=>$overdue,'average'=>$scores?round(array_sum($scores)/count($scores),1):null,'recent'=>array_slice($items,0,12)];
}
function academy_v51_report(PDO $pdo,string $sid): array {
 $st=$pdo->prepare("SELECT status,primary_role FROM academy_users WHERE id=? LIMIT 1");$st->execute([$sid]);$student=$st->fetch(PDO::FETCH_ASSOC);
 if(!$student||$student['primary_role']!=='student'||$student['status']!=='active')academy_v51_fail('student_not_available',404);
 $p=academy_read_node('studentProfilesV3/'.$sid);if(!is_array($p))academy_v51_fail('student_not_found',404);
 $mastery=academy_v51_mastery($p,academy_read_node('learningV4/mastery/'.$sid));$quizzes=academy_v51_scores($p);$homework=academy_v51_homework($sid,$p);
 $scope=['type'=>(string)($p['educationType']??'public'),'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??'')];
 $attendance=['present'=>0,'absent'=>0,'excused'=>0,'unmarked'=>0,'recent'=>[]];
 if(in_array($scope['type'],['public','azhar'],true)&&in_array($scope['stage'],['primary','prep','sec'],true)&&preg_match('/^[1-6]$/D',$scope['grade'])){
  $q=$pdo->prepare("SELECT s.title,s.starts_at,a.attendance_status,a.first_joined_at FROM m5_sessions s LEFT JOIN m5_attendance a ON a.session_id=s.id AND a.student_id=? WHERE s.status='published' AND s.education_type=? AND s.stage=? AND s.grade=? AND s.starts_at<=UTC_TIMESTAMP() ORDER BY s.starts_at DESC LIMIT 60");
  $q->execute([$sid,$scope['type'],$scope['stage'],$scope['grade']]);foreach($q->fetchAll(PDO::FETCH_ASSOC)as $row){$status=in_array($row['attendance_status'],['present','absent','excused'],true)?$row['attendance_status']:'unmarked';$attendance[$status]++;if(count($attendance['recent'])<10)$attendance['recent'][]=['title'=>mb_substr((string)$row['title'],0,120),'date'=>$row['starts_at'],'status'=>$status,'joinRecorded'=>!empty($row['first_joined_at'])];}
 }
 $q=$pdo->prepare('SELECT c.title,a.percentage,a.correct_count,a.question_count,a.created_at FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id WHERE a.student_id=? ORDER BY a.created_at DESC LIMIT 30');$q->execute([$sid]);$challenges=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$pdo->prepare("SELECT source_title,award_kind,award_rank,issued_at FROM m7_certificates WHERE student_id=? AND status='valid' ORDER BY issued_at DESC LIMIT 30");$q->execute([$sid]);$awards=$q->fetchAll(PDO::FETCH_ASSOC);
 $q=$pdo->prepare('SELECT COALESCE(SUM(points),0) FROM m1_points_ledger WHERE student_id=?');$q->execute([$sid]);$points=(int)$q->fetchColumn();
 return ['student'=>['id'=>$sid,'name'=>mb_substr((string)($p['name']??'طالب'),0,120),'educationType'=>$scope['type'],'stage'=>$scope['stage'],'grade'=>$scope['grade']],
   'generatedAt'=>academy_now_ms(),'lessons'=>$mastery,'quizzes'=>$quizzes,'homework'=>$homework,'attendance'=>$attendance,
   'challenges'=>['count'=>count($challenges),'recent'=>array_map(static fn($r)=>['title'=>mb_substr((string)$r['title'],0,140),'percentage'=>(float)$r['percentage'],'correct'=>(int)$r['correct_count'],'total'=>(int)$r['question_count'],'createdAt'=>$r['created_at']],array_slice($challenges,0,12))],
   'certificates'=>['count'=>count($awards),'recent'=>array_map(static fn($r)=>['title'=>mb_substr((string)$r['source_title'],0,140),'rank'=>$r['award_rank'],'issuedAt'=>$r['issued_at']],array_slice($awards,0,8))],
   'points'=>$points,'notes'=>['الحضور غير المسجل لا يُحتسب غيابًا.','أرقام التحديات والشهادات الحديثة محدودة بأحدث 30 سجلًا.','نقاط الطالب قد تشمل تسويات إدارية، ولا تعني مجموع درجات الاختبارات.']];
}
function academy_v51_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/v51/'))return;
 $u=academy_current_user(true);$role=(string)$u['primary_role'];$uid=(string)$u['id'];
 if($route==='/v51/report'&&$method==='GET'){
  if(!in_array($role,['admin','parent','student'],true))academy_v51_fail('forbidden',403);
  $sid=academy_v51_student_id($_GET['studentId']??($role==='student'?$uid:''));
  if($role==='student'&&$uid!==$sid||$role==='parent'&&!academy_v51_link($uid,$sid))academy_v51_fail('student_not_linked',403);
  academy_rate_limit('v51-report-'.$uid,80,3600);academy_json(['ok'=>true,'report'=>academy_v51_report($pdo,$sid)]);
 }
 if($route==='/v51/student/guardians'&&$method==='GET'){
  if($role!=='student')academy_v51_fail('forbidden',403);
  academy_json(['ok'=>true,'guardians'=>academy_v51_parent_list($pdo,$uid)]);
 }
 if($route==='/v51/parent/links'&&$method==='GET'){
  if($role!=='parent')academy_v51_fail('forbidden',403);
  $all=academy_read_node('parentLinksV4/'.$uid);$out=[];
  if(is_array($all))foreach($all as $sid=>$link){if(!is_array($link)||!academy_v51_link($uid,(string)$sid))continue;
   $p=academy_read_node('studentProfilesV3/'.$sid);$consent=academy_v51_consent((string)$sid,$uid);
   $out[]=['studentId'=>$sid,'name'=>mb_substr((string)($p['name']??'طالب مرتبط'),0,100),'contactOptIn'=>($consent['parentOptIn']??false)===true,'studentApproved'=>($consent['studentApproved']??false)===true,'phoneMatchesGuardianRecord'=>academy_v51_guardian_number((string)$sid)!==''&&academy_v51_guardian_number((string)$sid)===academy_v51_parent_number($uid),'canExportContact'=>academy_v51_contact_ready((string)$sid,$uid)];if(count($out)>=30)break;
  }
  academy_json(['ok'=>true,'links'=>$out,'phone'=>academy_v51_parent_number($uid)]);
 }
 if($route==='/v51/admin/contacts'&&$method==='GET'){
  if($role!=='admin')academy_v51_fail('forbidden',403);
  academy_rate_limit('v51-contact-export-'.$uid,30,3600);
  $type=(string)($_GET['educationType']??'');$stage=(string)($_GET['stage']??'');$grade=(string)($_GET['grade']??'');
  if($type!==''&&!in_array($type,['public','azhar'],true)||$stage!==''&&!in_array($stage,['primary','prep','sec'],true)||$grade!==''&&!preg_match('/^[1-6]$/D',$grade))academy_v51_fail('invalid_scope');
  $links=academy_read_node('parentLinksV4');$out=[];
  $userStatus=$pdo->prepare("SELECT primary_role,status FROM academy_users WHERE id=? LIMIT 1");
  if(is_array($links))foreach($links as $pid=>$children){if(!is_array($children))continue;
   $userStatus->execute([(string)$pid]);$parent=$userStatus->fetch(PDO::FETCH_ASSOC);if(!$parent||$parent['primary_role']!=='parent'||$parent['status']!=='active')continue;
   foreach($children as $sid=>$link){if(!is_array($link)||!academy_v51_contact_ready((string)$sid,(string)$pid))continue;
    $userStatus->execute([(string)$sid]);$student=$userStatus->fetch(PDO::FETCH_ASSOC);if(!$student||$student['primary_role']!=='student'||$student['status']!=='active')continue;
    $p=academy_read_node('studentProfilesV3/'.$sid);if(!is_array($p)||($type!==''&&($p['educationType']??'')!==$type)||($stage!==''&&($p['stage']??'')!==$stage)||($grade!==''&&(string)($p['grade']??'')!==$grade))continue;
    $out[]=['studentName'=>mb_substr((string)($p['name']??''),0,120),'parentPhone'=>academy_v51_parent_number((string)$pid),'educationType'=>(string)($p['educationType']??''),'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??'')];if(count($out)>=2000)break 2;
   }
  }
  academy_audit($uid,'v51.opt_in_contacts.export',null,['count'=>count($out),'filters'=>[$type,$stage,$grade]]);
  academy_json(['ok'=>true,'contacts'=>$out,'limited'=>count($out)>=2000,'requirements'=>'Both student and parent consent, and matching recorded phone. No SMS verification.']);
 }
 if($method!=='POST')academy_v51_fail('method_not_allowed',405);
 $b=academy_body();academy_rate_limit('v51-write-'.$uid,50,3600);
 if($route==='/v51/student/guardian/revoke'){
  if($role!=='student')academy_v51_fail('forbidden',403);$pid=academy_v51_parent_id($b['parentId']??'');
  $path='parentLinksV4/'.$pid.'/'.$uid;$consent='v51ContactPermissionsV1/'.$uid.'/'.$pid;
  $locks=academy_acquire_data_locks($pdo,[$path,$consent]);try{$pdo->beginTransaction();try{
   if(!academy_v51_link($pid,$uid))academy_v51_fail('link_missing',404);
   academy_delete_node_raw($pdo,$path);academy_delete_node_raw($pdo,$consent);
   academy_audit($uid,'v51.student.guardian.revoke',$pid);$pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
  academy_json(['ok'=>true]);
 }
 if($route==='/v51/student/guardian/contact-consent'){
  if($role!=='student')academy_v51_fail('forbidden',403);$pid=academy_v51_parent_id($b['parentId']??'');$allow=$b['allow']??null;if(!is_bool($allow))academy_v51_fail('invalid_choice');
  $path='v51ContactPermissionsV1/'.$uid.'/'.$pid;$locks=academy_acquire_data_locks($pdo,[$path]);try{$pdo->beginTransaction();try{
   if(!academy_v51_link($pid,$uid))academy_v51_fail('link_missing',403);
   $c=academy_v51_consent($uid,$pid);$c['studentApproved']=$allow;$c['studentUpdatedAt']=academy_now_ms();
   academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$c,$uid);
   academy_audit($uid,'v51.student.guardian.contact_consent',$pid,['approved'=>$allow]);$pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
  academy_json(['ok'=>true]);
 }
 if($route==='/v51/parent/contact-consent'){
  if($role!=='parent')academy_v51_fail('forbidden',403);$sid=academy_v51_student_id($b['studentId']??'');$optIn=$b['optIn']??null;if(!is_bool($optIn))academy_v51_fail('invalid_choice');
  $rawPhone=trim((string)($b['phone']??''));$phone=$rawPhone===''&&!$optIn?academy_v51_parent_number($uid):academy_v47_phone($rawPhone);if($phone===''&&$optIn)academy_v51_fail('invalid_parent_phone');
  $path='v51ContactPermissionsV1/'.$sid.'/'.$uid;$phonePath='parentProfilesV4/'.$uid.'/phone';$dir='phoneDirectoryV4/parents/'.$uid.'/phone';
  $locks=academy_acquire_data_locks($pdo,[$path,$phonePath,$dir]);try{$pdo->beginTransaction();try{
   if(!academy_v51_link($uid,$sid))academy_v51_fail('student_not_linked',403);
   if($phone!=='')foreach([$phonePath,$dir] as $node){academy_delete_node_raw($pdo,$node);academy_insert_value_raw($pdo,$node,$phone,$uid);}
   $c=academy_v51_consent($sid,$uid);$c['parentOptIn']=$optIn;$c['parentUpdatedAt']=academy_now_ms();
   academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$c,$uid);
   academy_audit($uid,'v51.parent.contact_consent',$sid,['optIn'=>$optIn]);$pdo->commit();
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
  academy_json(['ok'=>true,'phoneMatchesGuardianRecord'=>academy_v51_guardian_number($sid)===$phone&&$phone!=='','contactReady'=>academy_v51_contact_ready($sid,$uid)]);
 }
 academy_v51_fail('not_found',404);
}
