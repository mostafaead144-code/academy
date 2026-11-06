<?php
declare(strict_types=1);
/** EGTAZ V68 — teacher follow-ups, admin moderation, and approved guardian reports. */
function academy_v68_note_id(mixed $raw): string {
    $s=(string)$raw;
    if(!preg_match('/^[a-f0-9]{24}$/D',$s))academy_json(['ok'=>false,'error'=>'invalid_note'],422);
    return $s;
}
function academy_v68_teacher_student(string $tid,string $sid,string $gid,PDO $pdo): array {
    $g=academy_v67_group($tid,$gid);$p=academy_read_node('studentProfilesV3/'.$sid);
    if(!is_array($p)||!academy_v534_group_member_allowed($g,$p,$sid,$gid)||!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))
        academy_json(['ok'=>false,'error'=>'student_not_in_group'],403);
    $st=$pdo->prepare("SELECT id,display_name FROM academy_users WHERE id=? AND primary_role='student' AND status='active' LIMIT 1");$st->execute([$sid]);
    $row=$st->fetch(PDO::FETCH_ASSOC);if(!$row)academy_json(['ok'=>false,'error'=>'student_not_active'],403);
    return ['group'=>$g,'profile'=>$p,'name'=>mb_substr((string)($p['name']??$row['display_name']),0,110)];
}
function academy_v68_public_note(array $note,bool $admin=false): array {
    $data=['id'=>(string)($note['id']??''),'studentId'=>(string)($note['studentId']??''),
      'teacherId'=>(string)($note['teacherId']??''),'teacherName'=>(string)($note['teacherName']??''),
      'studentName'=>(string)($note['studentName']??''),'groupName'=>(string)($note['groupName']??''),
      'subject'=>(string)($note['subject']??''),'category'=>(string)($note['category']??''),
      'summary'=>(string)($note['summary']??''),'nextStep'=>(string)($note['nextStep']??''),
      'visibility'=>(string)($note['visibility']??'internal'),'status'=>(string)($note['status']??'internal'),
      'createdAt'=>(int)($note['createdAt']??0)];
    if($admin)$data['reviewedAt']=(int)($note['reviewedAt']??0);
    return $data;
}
function academy_v68_is_linked_parent(string $parentId,string $studentId): bool {
    $link=academy_read_node('parentLinksV4/'.$parentId.'/'.$studentId);
    return is_array($link)&&($link['studentId']??'')===$studentId;
}
function academy_v68_notes_for_student(string $tid,string $sid,int $max=30): array {
    $index=academy_read_node('studentFollowupTeacherIndexV68/'.$tid.'/'.$sid);
    $rows=[];if(is_array($index)){arsort($index,SORT_NUMERIC);foreach(array_keys($index) as $id){
        if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
        $note=academy_read_node('studentFollowupsV68/'.$id);
        if(is_array($note)&&($note['studentId']??'')===$sid&&($note['teacherId']??'')===$tid)$rows[]=academy_v68_public_note($note);
        if(count($rows)>=250)break;
    }}
    usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);return array_slice($rows,0,$max);
}
function academy_v68_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v68/'))return;
    $u=academy_current_user(true);$uid=(string)$u['id'];$role=(string)$u['primary_role'];
    academy_rate_limit('v68-'.$uid,220,3600);
    if($route==='/v68/teacher/student'&&$method==='GET'){
        if($role!=='teacher'||!academy_teacher_is_active_profile($uid))academy_json(['ok'=>false,'error'=>'forbidden'],403);
        $sid=academy_v62_uuid($_GET['studentId']??'');$gid=academy_v62_gid($_GET['groupId']??'');
        $student=academy_v68_teacher_student($uid,$sid,$gid,$pdo);
        academy_json(['ok'=>true,'student'=>['id'=>$sid,'name'=>$student['name']],
          'notes'=>academy_v68_notes_for_student($uid,$sid),
          'quizzes'=>academy_v64_teacher_quizzes($student['profile'],$uid,academy_v64_verified_groups($uid,$sid,$student['profile'])),
          'assignments'=>academy_v64_teacher_assignments($sid,$uid,$student['profile'],academy_v64_verified_groups($uid,$sid,$student['profile'])),
          'note'=>'الدرجات المعروضة تنتمي للمعلم صراحةً. لا تظهر بيانات الاتصال أو تقييمات المعلمين الآخرين.']);
    }
    if($route==='/v68/teacher/create'&&$method==='POST'){
        if($role!=='teacher'||!academy_teacher_is_active_profile($uid))academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_rate_limit('v68-create-'.$uid,35,3600);$b=academy_body();
        $sid=academy_v62_uuid($b['studentId']??'');$gid=academy_v62_gid($b['groupId']??'');
        $student=academy_v68_teacher_student($uid,$sid,$gid,$pdo);
        $category=(string)($b['category']??'review');$visibility=(string)($b['visibility']??'internal');
        $summary=trim((string)($b['summary']??''));$next=trim((string)($b['nextStep']??''));
        if(!in_array($category,['review','progress','achievement'],true)||!in_array($visibility,['internal','parent'],true)||
          mb_strlen($summary)<12||mb_strlen($summary)>1000||mb_strlen($next)>500)academy_json(['ok'=>false,'error'=>'invalid_note'],422);
        $t=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='teacher' AND status='active' LIMIT 1");$t->execute([$uid]);
        $teacherName=(string)($t->fetchColumn()?:'المعلم');
        $id=bin2hex(random_bytes(12));$created=academy_now_ms();
        $note=['id'=>$id,'teacherId'=>$uid,'studentId'=>$sid,'teacherName'=>mb_substr($teacherName,0,120),
           'studentName'=>$student['name'],'groupId'=>$gid,'groupName'=>mb_substr((string)($student['group']['name']??'فصل'),0,100),
           'subject'=>mb_substr((string)($student['group']['subjectName']??$student['group']['subject']??''),0,110),
           'category'=>$category,'summary'=>$summary,'nextStep'=>$next,'visibility'=>$visibility,
           'status'=>$visibility==='parent'?'pending':'internal','createdAt'=>$created];
        $paths=['studentFollowupsV68/'.$id,'studentFollowupTeacherIndexV68/'.$uid.'/'.$sid.'/'.$id];
        $locks=academy_acquire_data_locks($pdo,$paths);
        try{$pdo->beginTransaction();try{
            academy_insert_value_raw($pdo,$paths[0],$note,$uid);
            academy_insert_value_raw($pdo,$paths[1],$created,$uid);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($uid,'v68.followup.create',$id,['visibility'=>$visibility]);
        academy_json(['ok'=>true,'note'=>academy_v68_public_note($note)],201);
    }
    if($route==='/v68/admin/notes'&&$method==='GET'){
        if($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
        $filter=(string)($_GET['filter']??'pending');$offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT);
        if(!in_array($filter,['pending','recent'],true)||$offset===false||$offset<0||$offset>1000||$offset%25!==0)
            academy_json(['ok'=>false,'error'=>'invalid_filter'],422);
        $sql="SELECT path FROM academy_data WHERE path LIKE 'studentFollowupsV68/%/".($filter==='pending'?'status':'createdAt')."'";
        if($filter==='pending')$sql.=" AND value_json='\"pending\"'";
        $sql.=' ORDER BY updated_at DESC,path DESC LIMIT 25 OFFSET ?';
        $st=$pdo->prepare($sql);$st->bindValue(1,$offset,PDO::PARAM_INT);$st->execute();$items=[];
        foreach($st->fetchAll(PDO::FETCH_COLUMN) as $path){
            if(!preg_match('~^studentFollowupsV68/([a-f0-9]{24})/(?:createdAt|status)$~D',(string)$path,$m))continue;
            $r=academy_read_node('studentFollowupsV68/'.$m[1]);
            if(is_array($r)&&($filter==='recent'||($r['status']??'')==='pending'))$items[]=academy_v68_public_note($r,true);
        }
        academy_json(['ok'=>true,'items'=>$items,'offset'=>$offset,'hasMore'=>count($items)===25,
         'note'=>'تقارير المعلمين الجاهزة للمراجعة. الموافقة لا ترسل واتساب تلقائيًا.']);
    }
    if($route==='/v68/admin/decision'&&$method==='POST'){
        if($role!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
        academy_rate_limit('v68-decide-'.$uid,70,3600);$b=academy_body();$id=academy_v68_note_id($b['id']??'');
        $decision=(string)($b['decision']??'');if(!in_array($decision,['approve','reject','revoke'],true))academy_json(['ok'=>false,'error'=>'invalid_decision'],422);
        $path='studentFollowupsV68/'.$id;$locks=academy_acquire_data_locks($pdo,[$path,'studentFollowupParentIndexV68']);
        try{$pdo->beginTransaction();try{
            $note=academy_read_node($path);
            if(!is_array($note))throw new DomainException('note_missing');
            $current=(string)($note['status']??'');
            if(($decision==='revoke'&&$current!=='approved')||($decision!=='revoke'&&$current!=='pending'))throw new DomainException('note_state_changed');
            $sid=(string)($note['studentId']??'');
            if(!preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/D',$sid))throw new DomainException('note_invalid_student');
            $index='studentFollowupParentIndexV68/'.$sid.'/'.$id;
            $note['status']=$decision==='approve'?'approved':($decision==='revoke'?'revoked':'rejected');
            $note['reviewedBy']=$uid;$note['reviewedAt']=academy_now_ms();
            academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$note,$uid);
            academy_delete_node_raw($pdo,$index);
            if($decision==='approve')academy_insert_value_raw($pdo,$index,(int)($note['createdAt']??0),$uid);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}catch(DomainException $e){
            $err=$e->getMessage();
        }finally{academy_release_data_locks($pdo,$locks);}
        if(isset($err))academy_json(['ok'=>false,'error'=>$err],$err==='note_missing'?404:409);
        academy_audit($uid,'v68.followup.'.$decision,$id);academy_json(['ok'=>true,'status'=>$note['status']]);
    }
    if($route==='/v68/parent/children'&&$method==='GET'){
        if($role!=='parent'||academy_v60_staff_record($uid)!==null)academy_json(['ok'=>false,'error'=>'forbidden'],403);
        $links=academy_read_node('parentLinksV4/'.$uid);$rows=[];
        if(is_array($links))foreach($links as $sid=>$link){
            if(count($rows)>=30)break;
            if(!is_array($link)||($link['studentId']??'')!==$sid||!preg_match('/^[a-f0-9-]{36}$/D',(string)$sid))continue;
            $st=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='student' AND status='active' LIMIT 1");
            $st->execute([$sid]);$name=$st->fetchColumn();if(!$name)continue;
            $p=academy_read_node('studentProfilesV3/'.$sid);
            $rows[]=['id'=>$sid,'name'=>mb_substr((string)(is_array($p)?($p['name']??$name):$name),0,110)];
        }
        academy_json(['ok'=>true,'children'=>$rows,'truncated'=>is_array($links)&&count($links)>30]);
    }
    if($route==='/v68/parent/notes'&&$method==='GET'){
        if($role!=='parent'||academy_v60_staff_record($uid)!==null)academy_json(['ok'=>false,'error'=>'forbidden'],403);
        $sid=academy_v62_uuid($_GET['studentId']??'');
        if(!academy_v68_is_linked_parent($uid,$sid))academy_json(['ok'=>false,'error'=>'student_not_linked'],403);
        $index=academy_read_node('studentFollowupParentIndexV68/'.$sid);$notes=[];
        if(is_array($index)){arsort($index,SORT_NUMERIC);foreach(array_keys($index) as $id){
            if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
            $n=academy_read_node('studentFollowupsV68/'.$id);
            if(is_array($n)&&($n['studentId']??'')===$sid&&($n['status']??'')==='approved'&&($n['visibility']??'')==='parent')
                $notes[]=academy_v68_public_note($n);
            if(count($notes)>=200)break;
        }}
        usort($notes,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
        academy_json(['ok'=>true,'items'=>array_slice($notes,0,40),'truncated'=>count($notes)>40]);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
