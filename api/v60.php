<?php
/** EGTAZ V60 — least-privilege delegated staff, operational metrics & read-only audit. */
declare(strict_types=1);

const ACADEMY_V60_CAPABILITIES = ['analytics','audit','quality'];

function academy_v60_staff_record(string $uid): ?array {
    $record=academy_read_node('adminDelegationsV60/'.$uid);
    return is_array($record)&&($record['kind']??'')==='delegated_admin'?$record:null;
}
function academy_v60_is_owner(array $user):bool {
    return ($user['primary_role']??'')==='admin'&&academy_v60_staff_record((string)$user['id'])===null;
}
function academy_v60_capabilities(mixed $raw):array {
    if(!is_array($raw))return [];
    $result=[];
    foreach(ACADEMY_V60_CAPABILITIES as $cap)if(($raw[$cap]??false)===true)$result[$cap]=true;
    return $result;
}
function academy_v60_allows(array $delegation,string $route,string $method,string $dataPath=''):bool {
    // Auth is always available for password rotation, session revocation and profile updates.
    if(in_array($route,['/auth/me','/auth/logout','/auth/profile','/auth/password','/auth/reauth'],true))return true;
    if(($delegation['enabled']??false)!==true)return false;
    if($route==='/health'&&$method==='GET')return true;
    $permissions=academy_v60_capabilities($delegation['capabilities']??[]);
    if($method==='GET'){
        if($route==='/v60/me')return true;
        if($route==='/v60/overview'||$route==='/v60/backup-check')return !empty($permissions['analytics']);
        if($route==='/v60/audit')return !empty($permissions['audit']);
        if($route==='/v58/quality')return !empty($permissions['quality']);
    }
    // Deny by default, including generic /data writes, existing admin/teacher/moderation
    // actions, subscription changes, staff management and private student/parent records.
    return false;
}
function academy_v60_guard_delegated(string $route,string $method):void {
    if(!academy_bearer())return;
    $u=academy_current_user(false);
    if(!is_array($u)||!in_array(($u['primary_role']??''),['admin','parent'],true))return;
    $staff=academy_v60_staff_record((string)$u['id']);
    if($staff!==null&&!academy_v60_allows($staff,$route,$method))academy_json(['ok'=>false,'error'=>'staff_forbidden'],403);
}
function academy_v60_require_admin(string $cap=''):array {
    $u=academy_current_user(true);
    $delegation=academy_v60_staff_record((string)$u['id']);
    // Staff are stored as low-privilege parent-role accounts for safe rollback.
    if($delegation===null){
        if(($u['primary_role']??'')!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    }else{
        if(($u['primary_role']??'')!=='parent'||($delegation['enabled']??false)!==true
            ||($cap!==''&&empty(academy_v60_capabilities($delegation['capabilities']??[])[$cap])))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    }
    return $u;
}
function academy_v60_require_owner():array {
    $u=academy_current_user(true);
    if(!academy_v60_is_owner($u))academy_json(['ok'=>false,'error'=>'owner_required'],403);
    return $u;
}
function academy_v60_overview(PDO $pdo):array {
    $stmt=$pdo->query("SELECT primary_role role,status,COUNT(*) amount FROM academy_users GROUP BY primary_role,status");
    $roles=[];$total=0;
    foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $r){$roles[$r['role']][$r['status']]=(int)$r['amount'];$total+=(int)$r['amount'];}
    // Delegated accounts are a separate category and should not inflate guardian counts.
    $delegatedRows=$pdo->query("SELECT status,COUNT(*) amount FROM academy_users WHERE primary_role='parent' AND email LIKE '%@staff.academy.invalid' GROUP BY status")->fetchAll(PDO::FETCH_ASSOC);
    foreach($delegatedRows as $dr){$status=(string)$dr['status'];$n=(int)$dr['amount'];$roles['parent'][$status]=max(0,(int)($roles['parent'][$status]??0)-$n);$roles['staff'][$status]=$n;}
    $active=(int)$pdo->query('SELECT COUNT(*) FROM academy_sessions WHERE revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()')->fetchColumn();
    $events=(int)$pdo->query('SELECT COUNT(*) FROM academy_audit_log WHERE created_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY')->fetchColumn();
    $content=[];
    foreach(['lessons','quizzes','files'] as $key){
        $rows=academy_read_node($key);
        $content[$key]=is_array($rows)?count($rows):0;
    }
    return ['ok'=>true,'generatedAt'=>gmdate('c'),'accounts'=>['total'=>$total,'byRole'=>$roles],
       'sessions'=>['active'=>$active],'audit'=>['past24h'=>$events],'content'=>$content,
       'notes'=>['أعداد الحسابات والجلسات من قاعدة البيانات مباشرة.','أعداد المحتوى من مفاتيح البيانات المخزنة. لا تُستخدم هذه الأرقام لحساب الأداء الدراسي.']];
}
function academy_v60_audit(PDO $pdo,int $before,int $limit):array {
    $limit=max(1,min(50,$limit));
    $sql='SELECT id,user_id,action,target_path,created_at FROM academy_audit_log';
    if($before>0)$sql.=' WHERE id<'.max(1,$before);
    $sql.=' ORDER BY id DESC LIMIT '.$limit;
    $raw=$pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $entries=[];
    foreach($raw as $r){
        $target=explode('/',(string)($r['target_path']??''))[0];
        $uid=(string)($r['user_id']??'');
        $entries[]=['id'=>(int)$r['id'],'action'=>(string)$r['action'],'actor'=>$uid!==''?substr($uid,0,8).'…':null,
            'targetType'=>substr($target,0,55),'createdAt'=>$r['created_at']];
    }
    return ['ok'=>true,'events'=>$entries,'nextBefore'=>count($entries)===$limit?(int)end($entries)['id']:null,
        'privacy'=>'لا تُعرض كلمات المرور أو تفاصيل البيانات أو IP أو رقم الهاتف أو metadata_json في سجل المتابعة.'];
}
function academy_v60_backup_check(PDO $pdo):array {
    $data=(int)$pdo->query('SELECT COUNT(*) FROM academy_data')->fetchColumn();
    $users=(int)$pdo->query('SELECT COUNT(*) FROM academy_users')->fetchColumn();
    return ['ok'=>true,'checkedAt'=>gmdate('c'),'database'=>'connected','dataRows'=>$data,'userRows'=>$users,
        'backedUp'=>false,'instructions'=>[
        'من Hostinger أنشئ نسخة احتياطية كاملة للملفات خارج public_html.',
        'صدّر قاعدة بيانات الأكاديمية من phpMyAdmin كملف SQL خاص، واحفظها في مكان آمن.',
        'لا تضع ملف SQL أو config.local.php داخل موقع عام أو ترسله في رابط عام.',
        'احتفظ بتاريخ النسخة، واختبر الاستعادة على بيئة تجريبية قبل الحاجة إليها.',
        'هذه الشاشة تتحقق من اتصال قاعدة البيانات فقط ولا تقوم بإنشاء نسخة احتياطية تلقائية.'
    ]];
}
function academy_v60_route(string $route,string $method,PDO $pdo):void {
    if(!str_starts_with($route,'/v60/'))return;
    if($route==='/v60/me'&&$method==='GET'){
        $u=academy_v60_require_admin();$d=academy_v60_staff_record((string)$u['id']);
        academy_json(['ok'=>true,'owner'=>$d===null,'capabilities'=>$d===null?array_fill_keys(ACADEMY_V60_CAPABILITIES,true):academy_v60_capabilities($d['capabilities']??[]),
             'name'=>$u['display_name']??'','email'=>$u['email']??'']);
    }
    if($route==='/v60/overview'&&$method==='GET'){
        academy_v60_require_admin('analytics');academy_rate_limit('v60-overview',60,3600);academy_json(academy_v60_overview($pdo));
    }
    if($route==='/v60/audit'&&$method==='GET'){
        academy_v60_require_admin('audit');academy_rate_limit('v60-audit',120,3600);
        academy_json(academy_v60_audit($pdo,max(0,(int)($_GET['before']??0)),max(1,(int)($_GET['limit']??30))));
    }
    if($route==='/v60/backup-check'&&$method==='GET'){
        academy_v60_require_admin('analytics');academy_rate_limit('v60-backup',15,3600);academy_json(academy_v60_backup_check($pdo));
    }
    if($route==='/v60/staff'&&$method==='GET'){
        academy_v60_require_owner();
        $records=academy_read_node('adminDelegationsV60');$all=[];
        foreach(is_array($records)?$records:[] as $uid=>$d){
            if(!is_array($d)||($d['kind']??'')!=='delegated_admin')continue;
            $q=$pdo->prepare('SELECT email,display_name,status,primary_role FROM academy_users WHERE id=? LIMIT 1');$q->execute([(string)$uid]);$row=$q->fetch(PDO::FETCH_ASSOC);if(!$row)continue;
            $all[]=['uid'=>(string)$uid,'phone'=>preg_match('/^p20(1[0125][0-9]{8})@staff\.academy\.invalid$/D',(string)$row['email'],$m)?'0'.$m[1]:'—','name'=>$row['display_name'],'status'=>$row['status'],
                'enabled'=>($d['enabled']??false)===true,'capabilities'=>academy_v60_capabilities($d['capabilities']??[])];
            if(count($all)>=150)break;
        }
        academy_json(['ok'=>true,'staff'=>$all,'truncated'=>count(is_array($records)?$records:[])>150]);
    }
    if($route==='/v60/staff/create'&&$method==='POST'){
        $owner=academy_v60_require_owner();academy_rate_limit('v60-staff-create-'.$owner['id'],12,3600);
        $body=academy_body();$phone=academy_v47_phone((string)($body['phone']??''));
        $email=$phone!==''?'p20'.substr($phone,1).'@staff.academy.invalid':'';
        $name=trim((string)($body['name']??''));$password=(string)($body['password']??'');
        $cap=academy_v60_capabilities($body['capabilities']??[]);
        if($phone===''||!filter_var($email,FILTER_VALIDATE_EMAIL)||$name===''||mb_strlen($name)>120||!academy_password_valid($password)||!$cap)academy_json(['ok'=>false,'error'=>'invalid_staff_input'],422);
        $uid=academy_uuid();$delegate=['kind'=>'delegated_admin','enabled'=>true,'capabilities'=>$cap,
            'createdAt'=>academy_now_ms(),'createdBy'=>$owner['id']];
        // Atomic account+delegation prevents a temporary full-access admin window.
        try{
            $pdo->beginTransaction();
            $pdo->prepare("INSERT INTO academy_users(id,email,password_hash,display_name,primary_role,status,email_verified) VALUES(?,?,?,?,'parent','active',1)")
              ->execute([$uid,$email,password_hash($password,PASSWORD_DEFAULT),$name]);
            academy_insert_value_raw($pdo,'adminDelegationsV60/'.$uid,$delegate,$owner['id']);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();if($e instanceof PDOException&&$e->getCode()==='23000')academy_json(['ok'=>false,'error'=>'email_exists'],409);throw $e;}
        academy_audit($owner['id'],'v60.staff.create',$uid,['capabilities'=>array_keys($cap)]);
        academy_json(['ok'=>true,'uid'=>$uid,'phone'=>$phone,'capabilities'=>$cap],201);
    }
    if($route==='/v60/staff/update'&&$method==='POST'){
        $owner=academy_v60_require_owner();academy_rate_limit('v60-staff-update-'.$owner['id'],45,3600);
        $body=academy_body();$uid=trim((string)($body['uid']??''));
        if($uid===''||$uid===$owner['id']||!preg_match('/^[a-f0-9-]{36}$/i',$uid))academy_json(['ok'=>false,'error'=>'invalid_staff'],422);
        $existing=academy_v60_staff_record($uid);if($existing===null)academy_json(['ok'=>false,'error'=>'staff_not_found'],404);
        $stmt=$pdo->prepare("SELECT primary_role FROM academy_users WHERE id=? LIMIT 1");$stmt->execute([$uid]);
        if($stmt->fetchColumn()!=='parent')academy_json(['ok'=>false,'error'=>'invalid_staff_role'],409);
        $cap=array_key_exists('capabilities',$body)?academy_v60_capabilities($body['capabilities']):academy_v60_capabilities($existing['capabilities']??[]);
        $enabled=array_key_exists('enabled',$body)?($body['enabled']===true):(($existing['enabled']??false)===true);
        if(!$cap)academy_json(['ok'=>false,'error'=>'capability_required'],422);
        $existing['capabilities']=$cap;$existing['enabled']=$enabled;$existing['updatedBy']=$owner['id'];$existing['updatedAt']=academy_now_ms();
        academy_write_node('adminDelegationsV60/'.$uid,$existing,$owner['id']);
        // Force a new login after any privileges change. Revocation is safe also for disabled staff.
        $pdo->prepare('UPDATE academy_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?')->execute([$uid]);
        academy_audit($owner['id'],'v60.staff.update',$uid,['enabled'=>$enabled,'capabilities'=>array_keys($cap)]);
        academy_json(['ok'=>true,'uid'=>$uid,'enabled'=>$enabled,'capabilities'=>$cap]);
    }
    academy_json(['ok'=>false,'error'=>'route_not_found'],404);
}
