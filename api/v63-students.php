<?php
declare(strict_types=1);
/** EGTAZ V63 — Admin-only, read-only student directory and learning dossier. */
function academy_v63_require_admin(): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!=='admin') academy_json(['ok'=>false,'error'=>'forbidden'],403);
    return $u;
}
function academy_v63_esc_like(string $s): string {
    return str_replace(['!','%','_'],['!!','!%','!_'],$s);
}
function academy_v63_profile_ids(array $profile): array {
    $raw=$profile['groupIds']??[];if(!is_array($raw))return [];
    if(array_is_list($raw))return array_map('strval',$raw);
    return array_map('strval',array_keys(array_filter($raw,static fn($v)=>$v===true||$v===1||$v==='1')));
}
function academy_v63_groups(PDO $pdo,string $id,array $p): array {
    $ids=array_fill_keys(academy_v63_profile_ids($p),true);
    if(!$ids)return ['rows'=>[],'truncated'=>false];
    $all=academy_read_node('teacherGroupsV4');$rows=[];$more=false;
    $query=$pdo->prepare("SELECT display_name,status FROM academy_users WHERE id=? AND primary_role='teacher' LIMIT 1");
    if(is_array($all))foreach($all as $tid=>$sets){
        if(!is_array($sets))continue;
        foreach($sets as $gid=>$g){
            if(!isset($ids[(string)$gid])||!is_array($g))continue;
            if(!academy_v534_group_member_allowed($g,$p,$id,(string)$gid))continue;
            // Ignore malformed or mismatched ownership records.
            if(($g['teacherId']??(string)$tid)!==(string)$tid)continue;
            $query->execute([(string)$tid]);$teacher=$query->fetch(PDO::FETCH_ASSOC);
            if(!$teacher)continue;
            if(count($rows)>=80){$more=true;break 2;}
            $rows[]=['id'=>(string)$gid,'teacherId'=>(string)$tid,'teacherName'=>mb_substr((string)$teacher['display_name'],0,100),
                'teacherStatus'=>(string)$teacher['status'],'name'=>mb_substr((string)($g['name']??'مجموعة'),0,110),
                'subject'=>(string)($g['subjectName']??$g['subject']??''),'active'=>($g['active']??true)===true];
        }
    }
    return ['rows'=>$rows,'truncated'=>$more];
}
function academy_v63_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v63/'))return;
    $admin=academy_v63_require_admin();
    if($route==='/v63/admin/students'&&$method==='GET'){
        academy_rate_limit('v63-list-'.$admin['id'],240,3600);
        $search=trim((string)($_GET['search']??''));$type=trim((string)($_GET['type']??''));$stage=trim((string)($_GET['stage']??''));
        $grade=trim((string)($_GET['grade']??''));$status=trim((string)($_GET['status']??''));
        $offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);
        if($offset===false||$offset<0||$offset>100000||mb_strlen($search)>80||($type!==''&&!in_array($type,['public','azhar'],true))||
            ($stage!==''&&!in_array($stage,['primary','prep','sec'],true))||($grade!==''&&!preg_match('/^[1-6]$/D',$grade))||
            ($status!==''&&!in_array($status,['active','pending','suspended','disabled'],true)))academy_json(['ok'=>false,'error'=>'invalid_filter'],422);
        $joins=" FROM academy_users u
          LEFT JOIN academy_data pn ON pn.path=CONCAT('studentProfilesV3/',u.id,'/name')
          LEFT JOIN academy_data pt ON pt.path=CONCAT('studentProfilesV3/',u.id,'/educationType')
          LEFT JOIN academy_data ps ON ps.path=CONCAT('studentProfilesV3/',u.id,'/stage')
          LEFT JOIN academy_data pg ON pg.path=CONCAT('studentProfilesV3/',u.id,'/grade')
          LEFT JOIN academy_data pp ON pp.path=CONCAT('studentProfilesV3/',u.id,'/phone')";
        $where=" WHERE u.primary_role='student'";$params=[];
        if($search!==''){
            $where.=" AND (u.display_name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!' OR JSON_UNQUOTE(pn.value_json) LIKE ? ESCAPE '!' OR JSON_UNQUOTE(pp.value_json) LIKE ? ESCAPE '!')";
            $needle='%'.academy_v63_esc_like($search).'%';$params=array_merge($params,[$needle,$needle,$needle,$needle]);
        }
        foreach([[$type,'pt'],[$stage,'ps'],[$grade,'pg']] as [$filter,$alias])if($filter!==''){$where.=" AND JSON_UNQUOTE($alias.value_json)=?";$params[]=$filter;}
        if($status!==''){$where.=' AND u.status=?';$params[]=$status;}
        $count=$pdo->prepare('SELECT COUNT(*)'.$joins.$where);$count->execute($params);$total=(int)$count->fetchColumn();
        $sql='SELECT u.id,u.display_name,u.status,u.created_at,u.last_login_at,pn.value_json AS student_name,pt.value_json AS education_type,ps.value_json AS student_stage,pg.value_json AS student_grade'.$joins.$where.' ORDER BY u.created_at DESC,u.id DESC LIMIT 25 OFFSET ?';
        $st=$pdo->prepare($sql);foreach($params as $i=>$v)$st->bindValue($i+1,$v,PDO::PARAM_STR);$st->bindValue(count($params)+1,$offset,PDO::PARAM_INT);$st->execute();
        $rows=[];foreach($st->fetchAll(PDO::FETCH_ASSOC) as $r){
            $decode=static fn($v)=>$v===null?null:json_decode((string)$v,true);
            $name=$decode($r['student_name']);$rows[]=['id'=>(string)$r['id'],'name'=>mb_substr((string)($name?:$r['display_name']),0,110),
                'status'=>(string)$r['status'],'educationType'=>(string)($decode($r['education_type'])??''),'stage'=>(string)($decode($r['student_stage'])??''),
                'grade'=>(string)($decode($r['student_grade'])??''),'createdAt'=>$r['created_at'],'lastLoginAt'=>$r['last_login_at']];
        }
        academy_json(['ok'=>true,'students'=>$rows,'total'=>$total,'offset'=>$offset,'nextOffset'=>($offset+count($rows)<$total)?$offset+25:null]);
    }
    if($route==='/v63/admin/student'&&$method==='GET'){
        academy_rate_limit('v63-detail-'.$admin['id'],180,3600);
        $id=academy_v50_uuid($_GET['id']??'');$target=academy_v50_student($pdo,$id);
        $p=academy_read_node('studentProfilesV3/'.$id);if(!is_array($p))$p=[];
        $groups=academy_v63_groups($pdo,$id,$p);
        $mastery=academy_v51_mastery($p,academy_read_node('learningV4/mastery/'.$id));
        $scores=academy_v51_scores($p);
        $phone=(string)($p['phone']??'');$guardianPhone=(string)($p['guardianPhone']??$p['parentPhone']??'');
        $q=$pdo->prepare('SELECT COALESCE(SUM(points),0) FROM m1_points_ledger WHERE student_id=?');$q->execute([$id]);$points=(int)$q->fetchColumn();
        $parents=academy_v51_parent_list($pdo,$id);
        $last=(int)($p['lastActiveAt']??($p['activity']['lastSeenAt']??0));
        academy_json(['ok'=>true,'student'=>[
            'id'=>$id,'name'=>mb_substr((string)($p['name']??$target['display_name']),0,120),
            'phone'=>mb_substr($phone,0,40),'guardianPhone'=>mb_substr($guardianPhone,0,40),
            'educationType'=>(string)($p['educationType']??''),'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??''),
            'status'=>(string)$target['status'],'lastActiveAt'=>$last,'points'=>$points
        ],'groups'=>$groups,'guardians'=>$parents,'lessons'=>$mastery,'quizzes'=>$scores,'generatedAt'=>academy_now_ms()]);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
