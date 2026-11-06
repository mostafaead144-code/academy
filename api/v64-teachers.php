<?php
declare(strict_types=1);
/** V64 — read-only teacher directory / confirmed teacher-student academic records. */
function academy_v64_role(string $role): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!==$role) academy_json(['ok'=>false,'error'=>'forbidden'],403);
    if($role==='teacher' && !academy_teacher_is_active_profile((string)$u['id'])) academy_json(['ok'=>false,'error'=>'teacher_unavailable'],403);
    return $u;
}
function academy_v64_id(mixed $value): string {return academy_v62_uuid($value);}
function academy_v64_group_scope(array $g): array {
    return ['type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),'subject'=>(string)($g['subject']??'')];
}
function academy_v64_verified_groups(string $tid,string $sid,array $p): array {
    $groups=academy_v62_memberships($tid);$out=[];
    foreach($groups as $gid=>$g){
        if(!is_array($g)||($g['teacherId']??$tid)!==$tid)continue;
        if(!academy_v534_group_member_allowed($g,$p,$sid,(string)$gid))continue;
        if(!academy_teacher_scope_allowed($tid,academy_v64_group_scope($g)))continue;
        $out[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,100),
           'subject'=>(string)($g['subject']??''),'subjectName'=>(string)($g['subjectName']??''),
           'type'=>(string)($g['type']??''),'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??'')];
        if(count($out)>=40)break;
    }
    return $out;
}
function academy_v64_teacher_quizzes(array $p,string $tid,array $groups): array {
    // Never include subject-wide scores: another teacher may teach the same subject.
    $results=$p['quizResultsV22']??[];
    $rows=[];
    if(!is_array($results))return ['count'=>0,'average'=>null,'recent'=>[],'note'=>'نتائج الاختبارات المعروفة بمنشئها فقط'];
    $subjects=[];
    foreach($groups as $g){$subjects[(string)$g['subject']]=true;$sn=(string)$g['subjectName'];if($sn!=='')$subjects[$sn]=true;}
    foreach($results as $key=>$r){
        if(!is_array($r)||!isset($r['percentage'])||!is_numeric($r['percentage']))continue;
        $creator=(string)($r['teacherId']??$r['createdBy']??$r['createdByUid']??'');
        if($creator!==$tid)continue;
        $subject=(string)($r['subject']??'');
        if($subject===''||!isset($subjects[$subject]))continue;
        $score=(float)$r['percentage'];if($score<0||$score>100)continue;
        $rows[]=['title'=>mb_substr((string)($r['title']??'اختبار'),0,120),'subject'=>$subject,'percentage'=>round($score,1),
             'createdAt'=>(int)($r['submittedAt']??$r['createdAt']??0)];
    }
    usort($rows,static fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);
    return ['count'=>count($rows),'average'=>$rows?round(array_sum(array_column($rows,'percentage'))/count($rows),1):null,
        'recent'=>array_slice($rows,0,8),'note'=>'النتائج التي تحمل معرف المعلم صراحةً وتطابق المادة فقط'];
}
function academy_v64_teacher_assignments(string $sid,string $tid,array $p,array $groups): array {
    $all=academy_read_node('assignments');$rows=[];$total=0;
    $ids=array_fill_keys(array_column($groups,'id'),true);
    if(!is_array($all))return ['count'=>0,'recent'=>[],'truncated'=>false];
    foreach($all as $aid=>$a){
        if(!is_array($a)||($a['teacherId']??'')!==$tid||($a['status']??'')!=='published'||!empty($a['isHidden']))continue;
        if(!academy_scope_matches($a,$p))continue;
        $mode=(string)($a['targetMode']??'stage');
        if($mode==='group'){
            if(!isset($ids[(string)($a['targetGroupId']??'')])||!academy_v534_assignment_group_allowed($a,$p,$sid))continue;
        }else{
            // Individual targeting must be checked in addition to grade / subject scope.
            if($mode==='students'){
                $target=$a['targetStudentIds']??[];
                if(!is_array($target)||!in_array($sid,array_map('strval',$target),true))continue;
            }elseif(!in_array($mode,['stage','all',''],true))continue;
            $matched=false;
            foreach($groups as $g){if((string)($a['subject']??'')===(string)($g['subject']??'')){$matched=true;break;}}
            if(!$matched)continue;
        }
        $total++;
        if(count($rows)>=30)continue;
        $sub=academy_read_node('assignmentSubmissions/'.(string)$aid.'/'.$sid);
        $state=is_array($sub)?(string)($sub['status']??'new'):'new';
        $rows[]=['title'=>mb_substr((string)($a['title']??'واجب'),0,120),'status'=>in_array($state,['new','submitted','graded'],true)?$state:'new',
           'dueAt'=>(int)($a['dueAt']??0),'score'=>is_array($sub)&&($sub['status']??'')==='graded'&&is_numeric($sub['score']??null)?max(0,min(100,(float)$sub['score'])):null];
        if($total>=400)break;
    }
    return ['count'=>$total,'recent'=>array_slice($rows,0,10),'truncated'=>$total>=400];
}
function academy_v64_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v64/'))return;
    if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    if($route==='/v64/admin/teachers'){
        $u=academy_v64_role('admin');academy_rate_limit('v64-tlist-'.$u['id'],180,3600);
        $search=trim((string)($_GET['search']??''));$status=(string)($_GET['status']??'');
        $offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);
        if($offset===false||$offset<0||$offset>100000||mb_strlen($search)>80||($status!==''&&!in_array($status,['active','pending','suspended','disabled'],true)))academy_json(['ok'=>false,'error'=>'invalid_filter'],422);
        $where="primary_role='teacher'";$args=[];
        if($search!==''){$where.=" AND (display_name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')";
            $needle='%'.academy_v63_esc_like($search).'%';$args=[$needle,$needle];}
        if($status!==''){$where.=' AND status=?';$args[]=$status;}
        $count=$pdo->prepare("SELECT COUNT(*) FROM academy_users WHERE $where");$count->execute($args);$total=(int)$count->fetchColumn();
        $q=$pdo->prepare("SELECT id,display_name,status,created_at,last_login_at FROM academy_users WHERE $where ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?");
        foreach($args as $i=>$v)$q->bindValue($i+1,$v,PDO::PARAM_STR);$q->bindValue(count($args)+1,$offset,PDO::PARAM_INT);$q->execute();
        $rows=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)$rows[]=['id'=>$r['id'],'name'=>$r['display_name'],'status'=>$r['status'],
            'createdAt'=>$r['created_at'],'lastLoginAt'=>$r['last_login_at']];
        academy_json(['ok'=>true,'teachers'=>$rows,'total'=>$total,'offset'=>$offset,'nextOffset'=>($offset+count($rows)<$total)?$offset+20:null]);
    }
    if($route==='/v64/admin/teacher'){
        $u=academy_v64_role('admin');academy_rate_limit('v64-tdetail-'.$u['id'],150,3600);
        $tid=academy_v64_id($_GET['id']??'');
        $q=$pdo->prepare("SELECT id,display_name,email,status,created_at,last_login_at FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");$q->execute([$tid]);$acc=$q->fetch(PDO::FETCH_ASSOC);
        if(!$acc)academy_json(['ok'=>false,'error'=>'teacher_not_found'],404);
        $p=academy_read_node('teacherProfiles/'.$tid);if(!is_array($p))$p=[];
        $all=academy_v62_memberships($tid);$groups=[];$seen=[];$extra=false;$checked=0;
        $qStudent=$pdo->prepare("SELECT status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");
        foreach($all as $gid=>$g){
            if(!is_array($g)||($g['teacherId']??$tid)!==$tid)continue;
            if(count($groups)>=40){$extra=true;break;}
            $members=is_array($g['members']??null)?$g['members']:[];$valid=0;
            foreach($members as $sid=>$member){
                if($checked>=220){$extra=true;break;}
                if(is_int($sid))$sid=(string)(is_array($member)?($member['studentId']??''):$member);
                if(!preg_match('/^[a-f0-9-]{36}$/i',(string)$sid))continue;
                $checked++;$sid=strtolower((string)$sid);$student=academy_read_node('studentProfilesV3/'.$sid);
                if(!is_array($student)||!academy_v534_group_member_allowed($g,$student,$sid,(string)$gid))continue;
                $qStudent->execute([$sid]);if($qStudent->fetchColumn()!=='active')continue;
                $valid++;$seen[$sid]=true;
            }
            $groups[]=['id'=>(string)$gid,'name'=>mb_substr((string)($g['name']??'مجموعة'),0,100),
                'subject'=>(string)($g['subjectName']??$g['subject']??''),'type'=>(string)($g['type']??''),
                'stage'=>(string)($g['stage']??''),'grade'=>(string)($g['grade']??''),'active'=>($g['active']??true)===true,
                'verifiedCount'=>$valid,'countLimited'=>$checked>=220];
            if($checked>=220)break;
        }
        $subs=academy_read_node('teacherSubmissions/'.$tid);$reviews=['pending'=>0,'approved'=>0,'rejected'=>0,'other'=>0];
        if(is_array($subs))foreach($subs as $item){if(!is_array($item))continue;$s=(string)($item['status']??'other');$reviews[array_key_exists($s,$reviews)?$s:'other']++;}
        $assign=academy_teacher_assignments($tid);$allowedFields=['type','stage','grade','subject','subjectName'];$assignments=[];
        foreach(array_slice($assign,0,50) as $a){$part=[];foreach($allowedFields as $f)$part[$f]=mb_substr((string)($a[$f]??''),0,90);$assignments[]=$part;}
        $perms=academy_teacher_permissions($tid);$permitted=[];foreach($perms as $key=>$val)if(is_bool($val))$permitted[$key]=$val;
        academy_json(['ok'=>true,'teacher'=>['id'=>$tid,'name'=>mb_substr((string)($p['name']??$acc['display_name']),0,120),
           'email'=>$acc['email'],'status'=>$acc['status'],'profileActive'=>academy_teacher_is_active_profile($tid),
           'bio'=>mb_substr((string)($p['bio']??''),0,1200),'createdAt'=>$acc['created_at'],'lastLoginAt'=>$acc['last_login_at']],
           'assignments'=>$assignments,'assignmentsTruncated'=>count($assign)>50,'permissions'=>$permitted,
           'groups'=>$groups,'groupsTruncated'=>$extra,'studentsCountAtLeast'=>count($seen),
           'studentsCountLimited'=>$extra,'reviews'=>$reviews,'generatedAt'=>academy_now_ms()]);
    }
    if($route==='/v64/teacher/student'){
        $teacher=academy_v64_role('teacher');academy_rate_limit('v64-sdetail-'.$teacher['id'],160,3600);
        $tid=(string)$teacher['id'];$sid=academy_v64_id($_GET['id']??'');
        $q=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='student' LIMIT 1");$q->execute([$sid]);$acc=$q->fetch(PDO::FETCH_ASSOC);
        if(!$acc||$acc['status']!=='active')academy_json(['ok'=>false,'error'=>'student_not_available'],404);
        $p=academy_read_node('studentProfilesV3/'.$sid);
        if(!is_array($p)||!academy_v62_teacher_student_allowed($tid,$sid,$p))academy_json(['ok'=>false,'error'=>'student_not_linked'],403);
        $groups=academy_v64_verified_groups($tid,$sid,$p);
        if(!$groups)academy_json(['ok'=>false,'error'=>'student_not_linked'],403);
        $quiz=academy_v64_teacher_quizzes($p,$tid,$groups);
        $assign=academy_v64_teacher_assignments($sid,$tid,$p,$groups);
        academy_json(['ok'=>true,'student'=>['id'=>$sid,'name'=>mb_substr((string)($p['name']??$acc['display_name']),0,120),
           'educationType'=>(string)($p['educationType']??''),'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??'')],
           'groups'=>$groups,'quizzes'=>$quiz,'assignments'=>$assign,'generatedAt'=>academy_now_ms(),
           'scopeNote'=>'لا تظهر بيانات الاتصال أو نتائج اختبارات المعلمين الآخرين أو الدروس خارج النطاق الموثق.']);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
