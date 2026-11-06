<?php
declare(strict_types=1);
/** EGTAZ V74: read-only, scoped lesson roadmap for a student and a linked guardian. */
function academy_v74_visible_lesson(array $lesson,array $profile): bool {
    if(($lesson['isHidden']??false)===true||in_array(($lesson['workflowStatus']??'published'),['draft','pending','rejected'],true))return false;
    foreach(['stage','grade'] as $key)if((string)($lesson[$key]??'')!==(string)($profile[$key]??''))return false;
    return (string)($lesson['type']??'public')===(string)($profile['educationType']??'');
}
function academy_v74_lessons(string $sid,array $profile,PDO $pdo): array {
    // Bounded candidate scan. No private lesson assets, teacher drafts or answer keys are returned.
    $grade=(string)($profile['grade']??'');
    if(!preg_match('/^[1-6]$/D',$grade)||!in_array(($profile['stage']??''),['primary','prep','sec'],true)||!in_array(($profile['educationType']??''),['public','azhar'],true))
        return ['items'=>[],'scanned'=>0,'candidateLimitReached'=>false,'scopeNote'=>'الملف التعليمي يحتاج مرحلة وصف ونوع تعليم صالحًا.'];
    $stmt=$pdo->prepare("SELECT path FROM academy_data WHERE path LIKE 'lessons/%/grade' AND value_json IN (?,?) ORDER BY path DESC LIMIT 400");
    $stmt->execute([json_encode($grade),(string)(int)$grade]);
    $paths=$stmt->fetchAll(PDO::FETCH_COLUMN);
    $progress=$profile['learningProgress']??[];
    if(!is_array($progress))$progress=[];
    $last=academy_read_node('learningV4/resume/'.$sid.'/lastLesson');
    $lastId=is_array($last)?(string)($last['lessonId']??''):'';
    $out=[];
    foreach($paths as $path){
        if(!preg_match('~^lessons/([a-zA-Z0-9_-]{1,120})/grade$~D',(string)$path,$matches))continue;
        $id=$matches[1];$l=academy_read_node('lessons/'.$id);
        if(!is_array($l)||!academy_v74_visible_lesson($l,$profile))continue;
        $status=is_array($progress[$id]??null)&&($progress[$id]['completed']??false)===true?'completed':'not_confirmed';
        $out[]=['id'=>$id,'title'=>mb_substr((string)($l['title']??'درس'),0,140),
          'subject'=>(string)($l['subject']??''),'unit'=>mb_substr((string)($l['unit']??''),0,24),
          'progress'=>$status,'lastVisited'=>$id===$lastId];
        if(count($out)>=80)break;
    }
    usort($out,static fn($a,$b)=>((int)$b['lastVisited']<=>(int)$a['lastVisited'])?:strcmp($a['subject'],$b['subject'])?:strcmp($a['id'],$b['id']));
    return ['items'=>$out,'scanned'=>count($paths),'candidateLimitReached'=>count($paths)===400||count($out)===80,
      'scopeNote'=>'عينة تصل إلى 80 درسًا مطابقًا من أحدث 400 سجل صف كحد أقصى. علامة مكتمل تعتمد على completed=true صراحةً؛ عدم وجود العلامة لا يعني عدم دراسة الدرس.'];
}
function academy_v74_route(string $route,string $method,PDO $pdo): void {
    if($route!=='/v74/learning/roadmap')return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $u=academy_current_user(true);$uid=(string)$u['id'];$role=(string)$u['primary_role'];
    if(!in_array($role,['student','parent'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='parent'&&academy_v60_staff_record($uid)!==null)academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='student'&&academy_v50_force_reset_required($uid))academy_json(['ok'=>false,'error'=>'v50_password_change_required'],403);
    academy_rate_limit('v74-roadmap-'.$uid,80,3600);
    $sid=$role==='student'?$uid:academy_v62_uuid($_GET['studentId']??'');
    if($role==='parent'&&!academy_v68_is_linked_parent($uid,$sid))academy_json(['ok'=>false,'error'=>'student_not_linked'],403);
    $q=$pdo->prepare("SELECT id FROM academy_users WHERE id=? AND primary_role='student' AND status='active' LIMIT 1");$q->execute([$sid]);
    if(!$q->fetchColumn())academy_json(['ok'=>false,'error'=>'student_not_found'],404);
    $profile=academy_read_node('studentProfilesV3/'.$sid);
    if(!is_array($profile))academy_json(['ok'=>false,'error'=>'profile_missing'],404);
    academy_json(['ok'=>true,'studentId'=>$sid,'catalog'=>academy_v74_lessons($sid,$profile,$pdo),'generatedAt'=>academy_now_ms()]);
}
