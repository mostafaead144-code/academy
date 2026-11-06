<?php
declare(strict_types=1);
/** V82: authenticated, bounded student homework and verified quiz summaries. Read-only. */
function academy_v82_status(?array $submission, int $dueAt, int $now): array {
    if(is_array($submission) && ($submission['status']??'')==='graded' && isset($submission['score']) && is_numeric($submission['score'])) {
        $score=(float)$submission['score'];
        if(is_finite($score) && $score>=0 && $score<=100)return ['graded',round($score,1)];
    }
    if(is_array($submission)&&in_array(($submission['status']??''),['submitted','graded'],true))return ['submitted',null];
    if($dueAt>0 && $dueAt<$now)return ['overdue',null];
    return ['pending',null];
}
function academy_v82_route(string $route,string $method,PDO $pdo): void {
    if($route!=='/v82/student/workspace')return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!=='student')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    $sid=(string)$u['id'];
    if(academy_v50_force_reset_required($sid))academy_json(['ok'=>false,'error'=>'v50_password_change_required'],403);
    academy_rate_limit('v82-workspace-'.$sid,100,3600);
    $profile=academy_read_node('studentProfilesV3/'.$sid);
    if(!is_array($profile))academy_json(['ok'=>false,'error'=>'profile_missing'],404);
    $all=academy_read_node('assignments');$eligible=[];
    if(is_array($all))foreach($all as $id=>$a){
        if(!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{6,100}$/D',$id)||!is_array($a))continue;
        if(!empty($a['isHidden'])||($a['status']??'published')!=='published'||!academy_scope_matches($a,$profile))continue;
        if(($a['targetMode']??'stage')==='group'&&!academy_v534_assignment_group_allowed($a,$profile,$sid))continue;
        $eligible[$id]=$a;
    }
    // Bounded per-student reads: newest 150 published, matching assignments only.
    uasort($eligible,static fn($a,$b)=>(int)($b['createdAt']??0)<=>(int)($a['createdAt']??0));
    $total=count($eligible);$limited=$total>150;
    $eligible=array_slice($eligible,0,150,true);
    $now=academy_now_ms();$rows=[];$stats=['pending'=>0,'overdue'=>0,'submitted'=>0,'graded'=>0];
    foreach($eligible as $id=>$a){
        $sub=academy_read_node('assignmentSubmissions/'.$id.'/'.$sid);
        $due=max(0,(int)($a['dueAt']??0));[$state,$score]=academy_v82_status(is_array($sub)?$sub:null,$due,$now);
        $stats[$state]++;
        $rows[]=['id'=>$id,'title'=>mb_substr((string)($a['title']??'واجب دراسي'),0,140),
          'subject'=>mb_substr((string)($a['subjectName']??$a['subject']??'مادة دراسية'),0,100),
          'instructions'=>mb_substr((string)($a['instructions']??$a['description']??''),0,5000),
          'dueAt'=>$due,'createdAt'=>(int)($a['createdAt']??0),'status'=>$state,'score'=>$score,
          'feedback'=>$state==='graded'?mb_substr((string)($sub['feedback']??''),0,1500):'',
          'submittedAt'=>is_array($sub)?(int)($sub['submittedAt']??0):0,
          'answer'=>$state==='submitted'?mb_substr((string)($sub['answer']??''),0,12000):'',
          'link'=>$state==='submitted'?mb_substr((string)($sub['link']??''),0,700):''];
    }
    $priority=['overdue'=>0,'pending'=>1,'submitted'=>2,'graded'=>3];
    usort($rows,static fn($a,$b)=>($priority[$a['status']]<=>$priority[$b['status']])?:
      (($a['status']==='graded' ? $b['submittedAt']<=>$a['submittedAt'] : $a['dueAt']<=>$b['dueAt'])));
    // Summary from actual recorded quiz attempts; zero means an attempt with a recorded zero, never an unattempted test.
    $quizzes=academy_v69_quizzes($profile);
    academy_json(['ok'=>true,'items'=>$rows,'stats'=>$stats,'considered'=>count($rows),'totalEligible'=>$total,
      'limited'=>$limited,'quizzes'=>$quizzes,'serverNow'=>$now,
      'note'=>'إحصاءات الواجبات مبنية على أحدث 150 واجبًا منشورًا ومتاحًا للحساب كحد أقصى. النتائج مأخوذة من محاولات الاختبارات المسجلة فقط.']);
}
