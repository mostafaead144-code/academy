<?php
declare(strict_types=1);
/** EGTAZ V71: read-only, group-scoped educational evidence. No progress inference across subjects. */
function academy_v71_quiz_evidence(array $profile,string $tid,string $subject): array {
    $attempts=$profile['quizResultsV22']??[];$scores=[];$bySkill=[];$visited=0;$limited=false;
    if(!is_array($attempts))$attempts=[];
    foreach($attempts as $r){
        if(++$visited>500){$limited=true;break;}
        if(!is_array($r))continue;
        $owner=(string)($r['teacherId']??$r['createdBy']??$r['createdByUid']??'');
        if($owner!==$tid||(string)($r['subject']??'')!==$subject)continue;
        $raw=$r['percentage']??null;
        if(!is_numeric($raw)||!is_finite((float)$raw)||(float)$raw<0||(float)$raw>100)continue;
        $score=(float)$raw;$scores[]=$score;
        // Only a skill explicitly stored on an attributed attempt is used. No guessed skill classifications.
        $skill=trim((string)($r['skill']??''));
        if($skill!==''&&mb_strlen($skill)<=90&&count($bySkill)<100){
            if(!isset($bySkill[$skill]))$bySkill[$skill]=['count'=>0,'sum'=>0];
            $bySkill[$skill]['count']++;$bySkill[$skill]['sum']+=$score;
        }
    }
    $needs=[];
    foreach($bySkill as $name=>$s){
        if($s['count']>=2&&$s['sum']/$s['count']<60)$needs[]=['name'=>$name,'count'=>$s['count'],'average'=>round($s['sum']/$s['count'],1)];
    }
    usort($needs,static fn($a,$b)=>$a['average']<=>$b['average']);
    return ['count'=>count($scores),'average'=>$scores?round(array_sum($scores)/count($scores),1):null,
        'skills'=>array_slice($needs,0,4),'limited'=>$limited];
}
function academy_v71_lessons(string $studentId,array $group): array {
    $type=(string)($group['type']??'');$stage=(string)($group['stage']??'');
    $grade=(string)($group['grade']??'');$subject=(string)($group['subject']??'');
    $lessons=academy_read_node('learningV4/mastery/'.$studentId.'/'.$type.'/'.$stage.'/'.$grade.'/'.$subject);
    if(!is_array($lessons))return ['completed'=>0,'inProgress'=>0,'recorded'=>0,'limited'=>false];
    $completed=0;$active=0;$visited=0;$limited=false;
    foreach($lessons as $entry){
        if(++$visited>500){$limited=true;break;}
        if(!is_array($entry))continue;
        $status=(string)($entry['status']??'not_started');
        if(in_array($status,['completed','mastered','done'],true))$completed++;
        elseif($status!=='not_started'&&$status!=='')$active++;
    }
    return ['completed'=>$completed,'inProgress'=>$active,'recorded'=>$completed+$active,'limited'=>$limited];
}
function academy_v71_assignments(string $sid,array $p,array $g,string $gid,array $assignments): array {
    $done=0;$waiting=0;$missing=0;$total=0;$scores=[];$now=academy_now_ms();
    foreach($assignments as $a){
        $id=(string)($a['id']??'');
        if(!academy_v66_assignment_matches($sid,$a,$p,$g,$gid))continue;
        if(($a['recipientMode']??'')==='selected'){
            $targets=academy_read_node('assignmentTargetsV67/'.$id);
            if(!is_array($targets)||!is_array($targets['studentIds']??null)||!in_array($sid,$targets['studentIds'],true))continue;
        }
        $total++;
        $submission=academy_read_node('assignmentSubmissions/'.$id.'/'.$sid);
        if(is_array($submission)&&($submission['status']??'')==='graded'&&is_numeric($submission['score']??null)
           &&is_finite((float)$submission['score'])&&(float)$submission['score']>=0&&(float)$submission['score']<=100){
            $done++;$scores[]=(float)$submission['score'];
        }elseif(is_array($submission)&&in_array(($submission['status']??''),['submitted','graded'],true))$waiting++;
        elseif((int)($a['dueAt']??0)>0&&(int)$a['dueAt']<$now)$missing++;
    }
    return ['assigned'=>$total,'graded'=>$done,'awaitingGrading'=>$waiting,'overdue'=>$missing,
        'average'=>$scores?round(array_sum($scores)/count($scores),1):null];
}
function academy_v71_group_report(PDO $pdo,string $tid,string $gid,int $offset,string $role): array {
    $g=academy_read_node('teacherGroupsV4/'.$tid.'/'.$gid);
    if(!is_array($g)||($g['teacherId']??$tid)!==$tid)academy_json(['ok'=>false,'error'=>'group_not_found'],404);
    if($role==='teacher'&&!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))academy_json(['ok'=>false,'error'=>'group_not_allowed'],403);
    $ids=academy_v67_member_ids($g);$total=count($ids);$pageIds=array_slice($ids,$offset,20);
    $q=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");
    $all=academy_read_node('assignments');$matches=[];$considered=0;$limited=false;
    if(is_array($all))foreach($all as $id=>$a){
        if(++$considered>7000){$limited=true;break;}
        if(!is_array($a)||!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$id))continue;
        if(($a['teacherId']??'')!==$tid||($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
        $same=true;foreach(['type','stage','grade','subject'] as $key){
            if((string)($a[$key]??'')!==(string)($g[$key]??'')){$same=false;break;}
        }
        if(!$same||(($a['targetMode']??'stage')==='group'&&(string)($a['targetGroupId']??'')!==$gid))continue;
        $a['id']=$id;$matches[]=$a;
    }
    usort($matches,static fn($a,$b)=>(int)($b['createdAt']??0)<=>(int)($a['createdAt']??0));
    $assignmentsLimited=count($matches)>30||$limited;$matches=array_slice($matches,0,30);
    $rows=[];$sums=['quiz'=>0,'quizStudents'=>0,'homework'=>0,'gradedStudents'=>0,'completed'=>0,'inProgress'=>0,'overdue'=>0];
    foreach($pageIds as $sid){
        $p=academy_read_node('studentProfilesV3/'.$sid);
        if(!is_array($p)||!academy_v534_group_member_allowed($g,$p,$sid,$gid))continue;
        $q->execute([$sid]);$a=$q->fetch(PDO::FETCH_ASSOC);
        if(!$a||($a['status']??'')!=='active')continue;
        $quiz=academy_v71_quiz_evidence($p,$tid,(string)($g['subject']??''));
        $lessons=academy_v71_lessons($sid,$g);$homework=academy_v71_assignments($sid,$p,$g,$gid,$matches);
        if($quiz['average']!==null){$sums['quiz']+=$quiz['average'];$sums['quizStudents']++;}
        if($homework['average']!==null){$sums['homework']+=$homework['average'];$sums['gradedStudents']++;}
        $sums['completed']+=$lessons['completed'];$sums['inProgress']+=$lessons['inProgress'];$sums['overdue']+=$homework['overdue'];
        $rows[]=['id'=>$sid,'name'=>mb_substr((string)($p['name']??$a['display_name']),0,100),
            'quizzes'=>$quiz,'lessons'=>$lessons,'homework'=>$homework];
    }
    return ['group'=>['id'=>$gid,'name'=>mb_substr((string)($g['name']??'فصل'),0,100),
           'teacherId'=>$tid,'subject'=>mb_substr((string)($g['subjectName']??$g['subject']??''),0,95),'active'=>($g['active']??true)===true],
        'rows'=>$rows,'summary'=>['verifiedOnPage'=>count($rows),'quizAverage'=>$sums['quizStudents']?round($sums['quiz']/$sums['quizStudents'],1):null,
          'quizStudents'=>$sums['quizStudents'],'homeworkAverage'=>$sums['gradedStudents']?round($sums['homework']/$sums['gradedStudents'],1):null,
          'gradedStudents'=>$sums['gradedStudents'],'completedActivities'=>$sums['completed'],'activeActivities'=>$sums['inProgress'],
          'overdueAssignments'=>$sums['overdue']],
        'offset'=>$offset,'registeredMemberships'=>$total,'nextOffset'=>$offset+20<$total?$offset+20:null,
        'limited'=>['groupMembers'=>$total>=10000,'assignments'=>$assignmentsLimited],
        'generatedAt'=>academy_now_ms(),
        'scopeNote'=>'الأرقام تخص طلاب هذه الصفحة الموثقين فقط (حدها 20)، وليست متوسط الفصل بالكامل. الاختبارات محسوبة فقط عندما تسجل معرف هذا المعلم ومادته صراحةً؛ الأنشطة المكتملة تخص المادة المحددة والمسجلة بالنظام وليست نسبة إنجاز المنهج. الواجبات تمثل أحدث 30 واجبًا مؤهلًا على الأكثر، والمهارات تظهر عند توافر اسم مهارة صريح ومحاولتين على الأقل؛ الطالب بلا اختبار لا يحصل على صفر.'];
}
function academy_v71_route(string $route,string $method,PDO $pdo): void {
    if($route!=='/v71/performance/group')return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $u=academy_current_user(true);$role=(string)($u['primary_role']??'');$uid=(string)$u['id'];
    if(!in_array($role,['teacher','admin'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='teacher'&&!academy_teacher_is_active_profile($uid))academy_json(['ok'=>false,'error'=>'teacher_unavailable'],403);
    academy_rate_limit('v71-report-'.$uid,120,3600);
    $gid=academy_v62_gid($_GET['groupId']??'');$tid=$role==='teacher'?$uid:academy_v62_uuid($_GET['teacherId']??'');
    $offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);
    if($offset===false||$offset<0||$offset>10000||$offset%20!==0)academy_json(['ok'=>false,'error'=>'invalid_page'],422);
    academy_json(['ok'=>true]+academy_v71_group_report($pdo,$tid,$gid,$offset,$role));
}
