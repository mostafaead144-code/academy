<?php
/** EGTAZ V73: bounded, scope-controlled catalog for the existing multi-teacher lessons and M2 bank. */
declare(strict_types=1);
function academy_v73_scopes_match(array $scopes,array $lesson): bool {
    foreach($scopes as $s){
        if(!is_array($s))continue;
        if(!empty($s['type'])&&($lesson['type']??'')!==$s['type'])continue;
        if(!empty($s['stage'])&&($lesson['stage']??'')!==$s['stage'])continue;
        if(isset($s['grade'])&&(string)$s['grade']!==''&&(string)($lesson['grade']??'')!==(string)$s['grade'])continue;
        if(!empty($s['subject'])&&($lesson['subject']??'')!==$s['subject'])continue;
        return true;
    }
    return false;
}
function academy_v73_sanitized_package(string $teacherId,array $p,string $default): array {
    return [
      'teacherId'=>$teacherId,
      'name'=>mb_substr((string)($p['teacherName']??'معلم الأكاديمية'),0,90),
      'status'=>in_array(($p['status']??'published'),['published','pending','rejected','draft'],true)?($p['status']??'published'):'other',
      'active'=>($p['active']??true)===true,
      'default'=>$teacherId!==''&&$teacherId===$default,
      'videos'=>count(academy_list_values($p['videos']??[])),
      'practice'=>count(academy_list_values($p['practiceQuestions']??[])),
      'files'=>count(academy_list_values($p['files']??[])),
      'quiz'=>is_array($p['quiz']??null),
      'legacy'=>(bool)($p['legacy']??false)
    ];
}
function academy_v73_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v73/'))return;
    $user=academy_current_user(true);
    $role=(string)($user['primary_role']??'');
    if(!in_array($role,['admin','teacher'],true))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='teacher'&&!academy_teacher_is_active_profile($user['id']))academy_json(['ok'=>false,'error'=>'teacher_inactive'],403);
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $scopes=$role==='teacher'?academy_teacher_assignments($user['id']):[];
    if($route==='/v73/lessons'){
        $cursor=(string)($_GET['cursor']??'');
        // The cursor is a previously returned path. It may not contain wildcards or slash nesting.
        if($cursor!==''&&!preg_match('#^lessons/[a-zA-Z0-9_-]{1,120}/title$#D',$cursor))academy_json(['ok'=>false,'error'=>'invalid_cursor'],422);
        $q=mb_strtolower(mb_substr(trim((string)($_GET['q']??'')),0,100),'UTF-8');
        $type=(string)($_GET['type']??'');$stage=(string)($_GET['stage']??'');$grade=(string)($_GET['grade']??'');$subject=(string)($_GET['subject']??'');
        if(!in_array($type,['','public','azhar'],true)||!in_array($stage,['','primary','prep','sec'],true)||($grade!==''&&(!ctype_digit($grade)||(int)$grade<1||(int)$grade>6))||($subject!==''&&!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',$subject)))academy_json(['ok'=>false,'error'=>'invalid_filter'],422);
        $st=$pdo->prepare("SELECT path,value_json FROM academy_data WHERE path LIKE 'lessons/%/title' AND path>? ORDER BY path LIMIT 140");
        $st->execute([$cursor]);$candidates=$st->fetchAll(PDO::FETCH_ASSOC);
        $rows=[];$last=$cursor;$totalScanned=0;
        foreach($candidates as $raw){
            $last=(string)$raw['path'];$totalScanned++;
            if(!preg_match('#^lessons/([a-zA-Z0-9_-]{1,120})/title$#D',$last,$match))continue;
            $id=$match[1];$title=json_decode((string)$raw['value_json'],true);
            if(!is_string($title))continue;
            if($q!==''&&mb_strpos(mb_strtolower($title,'UTF-8'),$q)===false)continue;
            $l=academy_read_node('lessons/'.$id);
            if(!is_array($l))continue;
            if($role==='teacher'&&(!academy_v73_scopes_match($scopes,$l)||($l['isHidden']??false)===true||($l['workflowStatus']??'published')==='draft'))continue;
            if($type!==''&&($l['type']??'')!==$type)continue;
            if($stage!==''&&($l['stage']??'')!==$stage)continue;
            if($grade!==''&&(string)($l['grade']??'')!==$grade)continue;
            if($subject!==''&&($l['subject']??'')!==$subject)continue;
            $pkg=academy_read_node('teacherContentsV6/'.$id);$pkg=is_array($pkg)?$pkg:[];
            $published=[];$all=[];$default=(string)($l['defaultTeacherId']??'');
            foreach($pkg as $tid=>$p){
                if(!is_array($p))continue;
                $tid=(string)$tid;
                if($role==='teacher'&&$tid!==$user['id']&&(($p['status']??'published')!=='published'||($p['active']??true)!==true))continue;
                $item=academy_v73_sanitized_package($tid,$p,$default);if(!academy_teacher_is_active_profile($tid))$item['active']=false;
                $all[]=$item;
                if($item['active']&&$item['status']==='published')$published[$tid]=true;
            }
            // Legacy teacher metadata is informational; it cannot be toggled using V6 visibility API.
            $legacyId=(string)($l['teacherId']??'');
            if($legacyId!==''&&!isset($pkg[$legacyId])&&($role==='admin'||$role==='teacher'&&$legacyId===$user['id'])){
                $all[]=academy_v73_sanitized_package($legacyId,['teacherName'=>$l['teacherName']??'معلم سابق','videos'=>$l['videos']??[],'legacy'=>true],$default);
            }
            $rows[]=['id'=>$id,'title'=>mb_substr($title,0,160),'type'=>$l['type']??'', 'stage'=>$l['stage']??'', 'grade'=>(string)($l['grade']??''),'subject'=>$l['subject']??'', 'unit'=>$l['unit']??1,'status'=>$l['workflowStatus']??'published','packages'=>$all,'activeTeachers'=>count($published),'defaultTeacherId'=>$default];
            if(count($rows)>=20)break;
        }
        academy_json(['ok'=>true,'items'=>$rows,'nextCursor'=>($totalScanned===140||$totalScanned>0&&count($rows)>=20)?$last:null,'scanned'=>$totalScanned,'pageLimit'=>20,'notice'=>'النتائج مقتصرة على الصفحة الحالية. تابع إلى الصفحة التالية لاستكمال البحث.']);
    }
    if($route==='/v73/questions'){
        $sql=$role==='admin'?'SELECT id,author_id,education_type,stage,grade,subject,unit_number,lesson_id,skill,difficulty,question_text,status,created_at FROM m2_questions ORDER BY (status=\'pending\') DESC,created_at DESC LIMIT 180':"SELECT id,author_id,education_type,stage,grade,subject,unit_number,lesson_id,skill,difficulty,question_text,status,created_at FROM m2_questions WHERE author_id=? OR status='approved' ORDER BY created_at DESC LIMIT 180";
        $st=$pdo->prepare($sql);$st->execute($role==='admin'?[]:[$user['id']]);$items=[];$counts=['pending'=>0,'approved'=>0,'rejected'=>0,'archived'=>0];
        foreach($st->fetchAll(PDO::FETCH_ASSOC) as $q){
            if($role==='teacher'&&!academy_v73_scopes_match($scopes,['type'=>$q['education_type'],'stage'=>$q['stage'],'grade'=>(string)$q['grade'],'subject'=>$q['subject']]))continue;
            $status=(string)$q['status'];if(isset($counts[$status]))$counts[$status]++;
            $items[]=['id'=>$q['id'],'authorId'=>$q['author_id'],'type'=>$q['education_type'],'stage'=>$q['stage'],'grade'=>(string)$q['grade'],'subject'=>$q['subject'],'unit'=>$q['unit_number'],'lessonId'=>$q['lesson_id'],'skill'=>$q['skill'],'difficulty'=>(int)$q['difficulty'],'text'=>mb_substr((string)$q['question_text'],0,300),'status'=>$status,'createdAt'=>$q['created_at']];
            if(count($items)>=90)break;
        }
        academy_json(['ok'=>true,'items'=>$items,'sampleCounts'=>$counts,'limited'=>true,'scopeNote'=>'الأعداد تخص أحدث السجلات المعروضة فقط ولا تمثل إجمالي بنك الأسئلة. لم تُرسل مفاتيح الإجابات في هذا التقرير.']);
    }
    academy_json(['ok'=>false,'error'=>'not_found'],404);
}
