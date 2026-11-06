<?php
/** V56: teacher-only aggregated class insights. Uses existing academy_data. */
declare(strict_types=1);
function academy_v56_quiz_sources(string $uid): array {
 $sources=[];
 $raw=academy_read_node('quizzes');
 if(is_array($raw))foreach($raw as $id=>$q){
  if(!is_array($q)||($q['teacherId']??$q['createdBy']??$q['createdByUid']??'')!==$uid)continue;
  if(!academy_content_visible_to_reader(null,$q))continue;
  $sources[(string)$id]=$q;
 }
 // Quiz IDs created from approved V6 teacher packages follow this exact server convention.
 $all=academy_read_node('teacherContentsV6');
 if(is_array($all))foreach($all as $lessonId=>$teachers){
  if(!is_array($teachers)||!is_array($teachers[$uid]??null))continue;
  $package=$teachers[$uid];if(($package['status']??'published')!=='published'||($package['active']??true)===false||!is_array($package['quiz']??null))continue;
  $lesson=academy_read_node('lessons/'.(string)$lessonId);
  if(!is_array($lesson)||!academy_content_visible_to_reader(null,$lesson))continue;
  $sources['teacher_'.$uid.'_'.$lessonId]=$lesson;
 }
 return $sources;
}
function academy_v56_calculate(string $uid,array $students,array $allAssignments,array $submissions,array $groups,array $quizSources,int $now):array {
 $my=[];foreach($allAssignments as $aid=>$a){
  if(!is_array($a)||($a['teacherId']??'')!==$uid||($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
  $my[(string)$aid]=$a;
 }
 $myTotal=count($my);$profileTotal=count($students);$my=array_slice($my,0,120,true);$students=array_slice($students,0,3000,true);
 $rows=[];$allEligible=0;$allCompleted=0;$allGraded=0;$allLate=0;
 foreach($my as $aid=>$a){
  $eligible=0;$completed=0;$graded=0;$late=0;
  foreach($students as $sid=>$profile){
   if(!is_array($profile)||!academy_scope_matches($a,$profile))continue;
   if(($a['targetMode']??'stage')==='group'&&!academy_v534_assignment_group_allowed($a,$profile,(string)$sid))continue;
   $eligible++;
   $sub=$submissions[$aid][$sid]??null;
   $status=is_array($sub)?($sub['status']??''):'';
   if($status==='graded'){$graded++;$completed++;}
   elseif($status==='submitted')$completed++;
   elseif((int)($a['dueAt']??0)>0&&(int)$a['dueAt']<$now)$late++;
  }
  $rows[]=['id'=>$aid,'title'=>mb_substr((string)($a['title']??'واجب'),0,90),'subject'=>(string)($a['subject']??''),
   'eligible'=>$eligible,'completed'=>$completed,'graded'=>$graded,'overdue'=>$late,
   'completionPercent'=>$eligible?(int)round(100*$completed/$eligible):null];
  $allEligible+=$eligible;$allCompleted+=$completed;$allGraded+=$graded;$allLate+=$late;
 }
 usort($rows,static fn($a,$b)=>($a['completionPercent']??101)<=>($b['completionPercent']??101)?:($b['eligible']<=>$a['eligible']));
 $activeGroups=0;$groupRows=[];
 foreach(array_slice($groups,0,80,true) as $gid=>$g){if(!is_array($g))continue;
  $isActive=($g['active']??true)===true;if($isActive)$activeGroups++;
  $members=0;if($isActive)foreach($students as $sid=>$p)if(is_array($p)&&academy_v534_group_member_allowed($g,$p,(string)$sid,(string)$gid))$members++;
  $groupRows[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,90),'active'=>$isActive,'members'=>$members];
 }
 $mistakeCounts=[];
 foreach($students as $sid=>$p){if(!is_array($p))continue;
  $mistakes=$p['quizMistakesV32']??[];if(!is_array($mistakes))continue;
  foreach($mistakes as $report){if(!is_array($report))continue;
   $qid=(string)($report['quizId']??'');$source=$quizSources[$qid]??null;
   if(!is_array($source)||!academy_scope_matches($source,$p))continue;
   foreach(($report['wrong']??[]) as $wrong){if(!is_array($wrong))continue;
    $question=trim((string)($wrong['question']??''));if($question==='')continue;
    $question=mb_substr($question,0,210);$key=hash('sha256',$qid.'|'.$question);
    if(!isset($mistakeCounts[$key]))$mistakeCounts[$key]=['question'=>$question,'subject'=>(string)($source['subject']??''),'wrongCount'=>0];
    $mistakeCounts[$key]['wrongCount']++;
   }
  }
 }
 $hard=array_values($mistakeCounts);usort($hard,static fn($a,$b)=>$b['wrongCount']<=>$a['wrongCount']);
 return ['assignmentSummary'=>['assignments'=>$myTotal,'eligibleTotal'=>$allEligible,'completed'=>$allCompleted,'graded'=>$allGraded,'overdue'=>$allLate,'completionPercent'=>$allEligible?(int)round(100*$allCompleted/$allEligible):null],
  'assignments'=>array_slice($rows,0,25),'groups'=>array_slice($groupRows,0,40),
  'groupSummary'=>['total'=>count($groups),'active'=>$activeGroups],
  'hardQuestions'=>array_slice($hard,0,12),
  'limits'=>['partial'=>$myTotal>120||$profileTotal>3000||count($groups)>80,'questionEvidence'=>'تكرارات أخطاء الأسئلة في اختبارات المعلم المتاحة فقط، وليس نسبة صعوبة إحصائية']];
}
function academy_v56_route(string $route,string $method,PDO $pdo): void {
 if($route!=='/teacher/insights/v56')return;
 if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
 $u=academy_current_user(true);
 if(($u['primary_role']??'')!=='teacher'||!academy_teacher_is_active_profile((string)$u['id']))academy_json(['ok'=>false,'error'=>'forbidden'],403);
 academy_rate_limit('teacher-v56-'.$u['id'],40,3600);
 $uid=(string)$u['id'];$assignments=academy_read_node('assignments');$students=academy_read_node('studentProfilesV3');$v62Groups=academy_v62_memberships($uid);
 // V62: analyze only students with verified active group membership.
 if(is_array($students))foreach($students as $sid=>$profile){if(!is_array($profile)||!academy_v62_teacher_student_allowed($uid,(string)$sid,$profile,$v62Groups))unset($students[$sid]);}
 $submissions=academy_read_node('assignmentSubmissions');$groups=$v62Groups;
 $result=academy_v56_calculate($uid,is_array($students)?$students:[],is_array($assignments)?$assignments:[],is_array($submissions)?$submissions:[],is_array($groups)?$groups:[],academy_v56_quiz_sources($uid),academy_now_ms());
 academy_json(array_merge(['ok'=>true],$result));
}
