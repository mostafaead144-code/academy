<?php
/** M2: permission-checked question bank, moderation, real response analytics. */
declare(strict_types=1);
function academy_m2_error(string $code,int $http=422): never {academy_json(['ok'=>false,'error'=>$code],$http);}
function academy_m2_question(mixed $raw): array {
 if(!is_array($raw))academy_m2_error('invalid_question');
 $text=trim((string)($raw['question']??$raw['text']??''));$opts=$raw['options']??$raw['opts']??null;
 $index=$raw['correctAnswer']??null;
 if(!is_array($opts)||!array_is_list($opts)||count($opts)<2||count($opts)>6||!is_int($index)||$index<0||$index>=count($opts)||mb_strlen($text)<5||mb_strlen($text)>600)academy_m2_error('invalid_question');
 $items=[];foreach($opts as$o){if(!is_string($o)||mb_strlen(trim($o))<1||mb_strlen($o)>300)academy_m2_error('invalid_question');$items[]=trim($o);}
 $skill=trim((string)($raw['skill']??''));$note=trim((string)($raw['hint']??$raw['explanation']??''));
 $subject=trim((string)($raw['subject']??''));if(!preg_match('/^[a-zA-Z0-9_-]{2,80}$/D',$subject)||mb_strlen($skill)>140||mb_strlen($note)>1200)academy_m2_error('invalid_question');
 $unit=(int)($raw['unit']??1);$lessonId=trim((string)($raw['lessonId']??''));$difficulty=(int)($raw['difficulty']??2);
 if($unit<1||$unit>100||!preg_match('/^[a-zA-Z0-9_-]{0,80}$/D',$lessonId)||$difficulty<1||$difficulty>3)academy_m2_error('invalid_question');
 $scope=academy_m1_scope($raw);$fp=hash('sha256',mb_strtolower(preg_replace('/\s+/u',' ',trim($text)),'UTF-8'));
 return ['scope'=>$scope,'subject'=>$subject,'question'=>$text,'options'=>$items,'correct'=>$index,'explanation'=>$note,'skill'=>$skill,'unit'=>$unit,'lessonId'=>$lessonId,'difficulty'=>$difficulty,'fingerprint'=>$fp];
}
function academy_m2_legacy(array $q,string $id,string $status): array {
 return ['id'=>$id,'question'=>$q['question_text'],'options'=>json_decode((string)$q['options_json'],true)?:[], 'correctAnswer'=>(int)$q['correct_index'], 'explanation'=>$q['explanation']??'', 'skill'=>$q['skill']??'', 'difficulty'=>(int)$q['difficulty'], 'type'=>$q['education_type'], 'stage'=>$q['stage'], 'grade'=>(string)$q['grade'], 'subject'=>$q['subject'], 'unit'=>(int)$q['unit_number'], 'lessonId'=>$q['lesson_id'], 'status'=>$status, 'source'=>'m2'];
}
function academy_m2_sync(PDO $pdo,string $id,string $by): void {
 $st=$pdo->prepare('SELECT * FROM m2_questions WHERE id=?');$st->execute([$id]);$q=$st->fetch(PDO::FETCH_ASSOC);if(!$q)return;
 // Existing diagnostic/live competition modules read questionBankV4. Keep their contract.
 academy_write_node('questionBankV4/'.$id,academy_m2_legacy($q,$id,$q['status']),$by);
}
function academy_m2_safe(array $q): array {
 return ['id'=>$q['id'],'authorId'=>$q['author_id'],'type'=>$q['education_type'],'stage'=>$q['stage'],'grade'=>(int)$q['grade'],'subject'=>$q['subject'],'unit'=>(int)$q['unit_number'],'lessonId'=>$q['lesson_id'],'skill'=>$q['skill'],'difficulty'=>(int)$q['difficulty'],'question'=>$q['question_text'],'options'=>json_decode($q['options_json'],true)?:[],'correctAnswer'=>(int)$q['correct_index'],'hint'=>$q['explanation'],'status'=>$q['status'],'createdAt'=>$q['created_at']];
}
function academy_m2_role(array $u): void {if(!in_array($u['primary_role'],['admin','teacher'],true))academy_m2_error('forbidden',403);if($u['primary_role']==='teacher'&&!academy_teacher_is_active_profile($u['id']))academy_m2_error('teacher_inactive',403);}
function academy_m2_route(string $route,string $method,PDO $pdo): void {
 if(!str_starts_with($route,'/m2/'))return;
 $u=academy_current_user(true);academy_m2_role($u);$role=$u['primary_role'];$uid=$u['id'];$b=$method==='GET'?[]:academy_body();
 if($route==='/m2/questions'&&$method==='GET'){
  $where=$role==='admin'?'1=1':'(status=\'approved\' OR author_id=?)';$args=$role==='admin'?[]:[$uid];
  $st=$pdo->prepare("SELECT * FROM m2_questions WHERE $where ORDER BY created_at DESC LIMIT 500");$st->execute($args);
  $items=[];foreach($st->fetchAll(PDO::FETCH_ASSOC) as$q){if($role==='teacher'&&!academy_teacher_scope_allowed($uid,['type'=>$q['education_type'],'stage'=>$q['stage'],'grade'=>(string)$q['grade'],'subject'=>$q['subject']]))continue;$items[]=academy_m2_safe($q);}
  $legacy=[];if($role==='admin'){$old=academy_read_node('questionBankV4');if(is_array($old)){foreach($old as$id=>$q){if(!is_array($q)||($q['source']??'')==='m2')continue;$legacy[]=['id'=>(string)$id,'question'=>mb_substr((string)($q['question']??$q['text']??'سؤال قديم'),0,220),'subject'=>(string)($q['subject']??''),'status'=>(string)($q['status']??'legacy'),'legacy'=>true];if(count($legacy)>=100)break;}}}
  academy_json(['ok'=>true,'items'=>$items,'legacy'=>$legacy,'count'=>count($items)]);
 }
 if($route==='/m2/questions/import'&&$method==='POST'){
  academy_rate_limit('m2-import-'.$uid,20,3600);$items=$b['items']??null;
  if(!is_array($items)||!array_is_list($items)||count($items)<1||count($items)>50)academy_m2_error('invalid_bulk');
  $clean=[];foreach($items as$q){$q=academy_m2_question($q);if($role==='teacher'&&!academy_teacher_scope_allowed($uid,['type'=>$q['scope']['type'],'stage'=>$q['scope']['stage'],'grade'=>(string)$q['scope']['grade'],'subject'=>$q['subject']]))academy_m2_error('scope_not_assigned',403);$clean[]=$q;}
  $status=$role==='admin'?'approved':(!empty(academy_teacher_permissions($uid)['publishQuestions'])?'approved':'pending');
  $ins=$pdo->prepare('INSERT IGNORE INTO m2_questions(id,author_id,author_role,education_type,stage,grade,subject,unit_number,lesson_id,skill,difficulty,question_text,options_json,correct_index,explanation,fingerprint,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  $ids=[];$skipped=0;$pdo->beginTransaction();try{foreach($clean as$q){$id=academy_uuid();$s=$q['scope'];$ins->execute([$id,$uid,$role,$s['type'],$s['stage'],$s['grade'],$q['subject'],$q['unit'],$q['lessonId'],$q['skill'],$q['difficulty'],$q['question'],json_encode($q['options'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$q['correct'],$q['explanation'],$q['fingerprint'],$status]);if($ins->rowCount())$ids[]=$id;else $skipped++;}$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
  $syncError=0;if($status==='approved')foreach($ids as$id){try{academy_m2_sync($pdo,$id,$uid);}catch(Throwable $e){$syncError++;error_log('M2 question bank sync failed '.$id);}}
  academy_audit($uid,'m2.questions.import',null,['added'=>count($ids),'duplicates'=>$skipped,'status'=>$status,'syncErrors'=>$syncError]);academy_json(['ok'=>true,'added'=>count($ids),'duplicates'=>$skipped,'status'=>$status,'syncErrors'=>$syncError]);
 }
 if($route==='/m2/questions/decision'&&$method==='POST'){
  if($role!=='admin')academy_m2_error('forbidden',403);$id=(string)($b['id']??'');$decision=(string)($b['decision']??'');if(!academy_m1_uuid($id)||!in_array($decision,['approve','reject','archive','restore'],true))academy_m2_error('invalid_decision');
  $st=$pdo->prepare('SELECT status FROM m2_questions WHERE id=?');$st->execute([$id]);$previous=$st->fetchColumn();if($previous===false)academy_m2_error('not_found',404);
  if($decision==='approve'&&!in_array($previous,['pending','rejected','approved'],true)||$decision==='restore'&&$previous!=='archived'||$decision==='reject'&&!in_array($previous,['pending','rejected'],true)||$decision==='archive'&&$previous==='archived')academy_m2_error('invalid_state',409);
  $status=match($decision){'approve','restore'=>'approved','reject'=>'rejected',default=>'archived'};
  $pdo->prepare('UPDATE m2_questions SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?')->execute([$status,$uid,$id]);
  try{academy_m2_sync($pdo,$id,$uid);}catch(Throwable $e){error_log('M2 sync error '.$id);academy_m2_error('legacy_sync_pending',503);}
  academy_audit($uid,'m2.question.'.$decision,$id);academy_json(['ok'=>true,'status'=>$status]);
 }
 if($route==='/m2/analytics'&&$method==='GET'){
  // Response-level analysis from real M1 challenge submissions, not invented grades.
  $sql='SELECT a.answers_json,c.questions_json,c.subject,c.education_type,c.stage,c.grade FROM m1_challenge_attempts a JOIN m1_challenges c ON c.id=a.challenge_id';
  $args=[];if($role==='teacher'){$sql.=' WHERE c.creator_id=?';$args[]=$uid;}$sql.=' ORDER BY a.created_at DESC LIMIT 2000';
  $st=$pdo->prepare($sql);$st->execute($args);$totals=['attempts'=>0,'answers'=>0,'correct'=>0,'questions'=>[],'subjects'=>[]];
  foreach($st->fetchAll(PDO::FETCH_ASSOC)as$row){$qs=json_decode((string)$row['questions_json'],true);$ans=json_decode((string)$row['answers_json'],true);if(!is_array($qs)||!is_array($ans))continue;
   $subject=(string)$row['subject'];if(!isset($totals['subjects'][$subject]))$totals['subjects'][$subject]=['subject'=>$subject,'attempts'=>0,'correct'=>0,'answers'=>0];$totals['attempts']++;$totals['subjects'][$subject]['attempts']++;
   foreach($qs as$i=>$q){if(!is_array($q)||!isset($ans[$i])||!isset($q['correctAnswer']))continue;$good=(int)($ans[$i]===$q['correctAnswer']);$totals['answers']++;$totals['correct']+=$good;$totals['subjects'][$subject]['answers']++;$totals['subjects'][$subject]['correct']+=$good;
    $txt=mb_substr((string)($q['question']??''),0,170);$key=hash('sha256',$subject.'|'.mb_strtolower($txt,'UTF-8'));if(!isset($totals['questions'][$key]))$totals['questions'][$key]=['question'=>$txt,'subject'=>$subject,'attempts'=>0,'wrong'=>0];$totals['questions'][$key]['attempts']++;$totals['questions'][$key]['wrong']+=(1-$good);
   }
  }
  $hard=array_values($totals['questions']);usort($hard,static fn($a,$b)=>($b['wrong']<=>$a['wrong'])?:($b['attempts']<=>$a['attempts']));$by=array_values($totals['subjects']);foreach($by as &$x)$x['accuracy']=$x['answers']?round($x['correct']*100/$x['answers'],1):null;unset($x);usort($by,static fn($a,$b)=>$b['attempts']<=>$a['attempts']);
  academy_json(['ok'=>true,'attempts'=>$totals['attempts'],'answers'=>$totals['answers'],'accuracy'=>$totals['answers']?round($totals['correct']*100/$totals['answers'],1):null,'hardest'=>array_slice($hard,0,20),'subjects'=>$by,'scopeLabel'=>$role==='admin'?'جميع تحديات M1':'تحدياتك التي أنشأتها','sampleLimit'=>2000]);
 }
 academy_json(['ok'=>false,'error'=>'not_found'],404);
}
