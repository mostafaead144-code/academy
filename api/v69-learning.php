<?php
declare(strict_types=1);
/** EGTAZ V69 — Read-only, permission-scoped student/guardian learning overview. */
function academy_v69_quizzes(array $profile): array {
    $history=academy_list_values($profile['quizHistory']??[]); $rows=[];
    foreach($history as $h){
        if(!is_array($h))continue;
        $n=(int)($h['questions']??0); $correct=$h['correct']??null;
        if($n<1||$n>1000||!is_numeric($correct)||$correct<0||$correct>$n)continue;
        $percent=round(100*(float)$correct/$n,1);
        $rows[]=['title'=>mb_substr((string)($h['title']??$h['lessonTitle']??'اختبار'),0,110),
          'subject'=>mb_substr((string)($h['subjectName']??$h['subject']??''),0,85),
          'percentage'=>$percent,'createdAt'=>(int)($h['createdAt']??$h['at']??0)];
        if(count($rows)>=250)break;
    }
    usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
    $sum=array_sum(array_column($rows,'percentage'));
    return ['count'=>count($rows),'average'=>$rows?round($sum/count($rows),1):null,
       'latest'=>array_slice($rows,0,6),'historyLimited'=>count($rows)===250];
}
function academy_v69_assignments(array $profile,string $sid): array {
    $raw=academy_read_node('assignments');$all=[]; $now=academy_now_ms();
    if(is_array($raw))foreach($raw as $id=>$a){
        if(!is_array($a)||!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$id))continue;
        if(!empty($a['isHidden'])||($a['status']??'published')!=='published'||!academy_scope_matches($a,$profile))continue;
        if(($a['targetMode']??'stage')==='group'&&!academy_v534_assignment_group_allowed($a,$profile,$sid))continue;
        $all[$id]=$a;
    }
    // Sort by creation date; bounded reads avoid an unbounded per-student query fan-out.
    uasort($all,static fn($a,$b)=>(int)($b['createdAt']??0)<=>(int)($a['createdAt']??0));
    $truncated=count($all)>150;$candidate=array_slice($all,0,150,true);
    $rows=[];$stats=['total'=>count($candidate),'graded'=>0,'submitted'=>0,'overdue'=>0,'pending'=>0];
    foreach($candidate as $id=>$a){
        $s=academy_read_node('assignmentSubmissions/'.$id.'/'.$sid);
        $due=(int)($a['dueAt']??0);$state='pending';$score=null;
        if(is_array($s)&&($s['status']??'')==='graded'&&isset($s['score'])&&is_numeric($s['score'])){
            $state='graded';$score=max(0,min(100,round((float)$s['score'],1)));
        }elseif(is_array($s)&&in_array(($s['status']??''),['submitted','graded'],true))$state='submitted';
        elseif($due>0&&$due<$now)$state='overdue';
        $stats[$state]++;
        $rows[]=['id'=>$id,'title'=>mb_substr((string)($a['title']??'واجب'),0,140),
           'subject'=>mb_substr((string)($a['subjectName']??$a['subject']??''),0,100),
           'dueAt'=>$due,'status'=>$state,'score'=>$score];
    }
    // Actionable tasks first; completed work follows. Never treat unsubmitted work as a score of zero.
    $order=['overdue'=>0,'pending'=>1,'submitted'=>2,'graded'=>3];
    usort($rows,static fn($a,$b)=>($order[$a['status']]<=>$order[$b['status']])?:($a['dueAt']<=>$b['dueAt']));
    return ['stats'=>$stats,'items'=>array_slice($rows,0,18),'truncated'=>$truncated,
        'scope'=>'تغطي الإحصائيات أحدث 150 واجبًا منشورًا مستهدفًا لهذا الطالب على الأكثر.'];
}
function academy_v69_groups(array $profile,string $sid,PDO $pdo): array {
    $ids=$profile['groupIds']??[];if(!is_array($ids))return [];
    $lookup=[];
    foreach($ids as $k=>$v){$gid=is_int($k)?(string)(is_string($v)?$v:''):(string)$k;
        if(preg_match('/^[a-zA-Z0-9_-]{4,40}$/D',$gid)&&($v!==false)&&($v!==null))$lookup[$gid]=true;
        if(count($lookup)>100)break;
    }
    if(!$lookup)return [];
    $root=academy_read_node('teacherGroupsV4');$result=[];
    if(is_array($root))foreach($root as $tid=>$groups){
        if(!is_string($tid)||!is_array($groups)||!academy_teacher_is_active_profile($tid))continue;
        foreach($groups as $gid=>$g){
            if(!isset($lookup[$gid])||!is_array($g)||!academy_v534_group_member_allowed($g,$profile,$sid,(string)$gid))continue;
            $result[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,110),
              'subject'=>mb_substr((string)($g['subjectName']??$g['subject']??''),0,90),'teacherId'=>$tid];
            if(count($result)>=30)break 2;
        }
    }
    if(!$result)return [];
    $stmt=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='teacher' AND status='active' LIMIT 1");
    foreach($result as &$g){$stmt->execute([$g['teacherId']]);$g['teacherName']=mb_substr((string)($stmt->fetchColumn()?:'المعلم'),0,100);unset($g['teacherId']);}unset($g);
    return $result;
}
function academy_v69_approved_notes(string $sid): array {
    $idx=academy_read_node('studentFollowupParentIndexV68/'.$sid);if(!is_array($idx))return ['count'=>0,'latest'=>[]];
    arsort($idx,SORT_NUMERIC);$valid=[];
    foreach(array_keys($idx) as $id){
        if(!is_string($id)||!preg_match('/^[a-f0-9]{24}$/D',$id))continue;
        $n=academy_read_node('studentFollowupsV68/'.$id);
        if(!is_array($n)||($n['studentId']??'')!==$sid||($n['status']??'')!=='approved'||($n['visibility']??'')!=='parent')continue;
        $valid[]=['teacherName'=>mb_substr((string)($n['teacherName']??'المعلم'),0,100),
          'subject'=>mb_substr((string)($n['subject']??''),0,100),
          'summary'=>mb_substr((string)($n['summary']??''),0,400),
          'nextStep'=>mb_substr((string)($n['nextStep']??''),0,280),
          'createdAt'=>(int)($n['createdAt']??0)];
        if(count($valid)>=40)break;
    }
    return ['count'=>count($valid),'latest'=>array_slice($valid,0,3),'limited'=>count($valid)===40];
}
function academy_v69_route(string $route,string $method,PDO $pdo): void {
    if($route!=='/v69/learning/overview')return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $u=academy_current_user(true);$uid=(string)$u['id'];$role=(string)$u['primary_role'];
    if(!in_array($role,['student','parent'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='parent'&&academy_v60_staff_record($uid)!==null)academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='student'&&academy_v50_force_reset_required($uid))academy_json(['ok'=>false,'error'=>'v50_password_change_required'],403);
    academy_rate_limit('v69-overview-'.$uid,100,3600);
    $sid=$role==='student'?$uid:academy_v62_uuid($_GET['studentId']??'');
    if($role==='parent'&&!academy_v68_is_linked_parent($uid,$sid))academy_json(['ok'=>false,'error'=>'student_not_linked'],403);
    $query=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='student' AND status='active' LIMIT 1");
    $query->execute([$sid]);$name=$query->fetchColumn();if($name===false)academy_json(['ok'=>false,'error'=>'student_not_found'],404);
    $p=academy_read_node('studentProfilesV3/'.$sid);if(!is_array($p))academy_json(['ok'=>false,'error'=>'profile_missing'],404);
    $student=['id'=>$sid,'name'=>mb_substr((string)($p['name']??$name),0,110),
      'educationType'=>in_array(($p['educationType']??''),['public','azhar'],true)?$p['educationType']:'',
      'stage'=>in_array(($p['stage']??''),['primary','prep','sec'],true)?$p['stage']:'',
      'grade'=>max(0,min(6,(int)($p['grade']??0)))];
    academy_json(['ok'=>true,'student'=>$student,'quizzes'=>academy_v69_quizzes($p),
      'assignments'=>academy_v69_assignments($p,$sid),'groups'=>academy_v69_groups($p,$sid,$pdo),
      'followups'=>academy_v69_approved_notes($sid),'generatedAt'=>academy_now_ms(),
      'note'=>'لا تظهر الملاحظات الداخلية. متوسط الاختبارات يحتسب المحاولات ذات أعداد الإجابات الموثقة فقط؛ عدم التسليم ليس صفرًا.']);
}
