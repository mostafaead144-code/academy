<?php
declare(strict_types=1);

const ACADEMY_API_VERSION = '2026-11-01.V95';

function academy_config(): array {
    static $config = null;
    if ($config !== null) return $config;
    $file = __DIR__ . '/config.local.php';
    if (!is_file($file)) throw new RuntimeException('Hostinger API is not configured. Create api/config.local.php.');
    $config = require $file;
    return $config;
}
function academy_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $cfg = academy_config()['db'];
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $cfg['host'], $cfg['name'], $cfg['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    return $pdo;
}
function academy_json(mixed $data, int $status=200): never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function academy_body(): array {
    // Four megabytes accommodates bulk questions, but rejects oversized payloads early.
    $limit=4*1024*1024;
    if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)academy_json(['ok'=>false,'error'=>'payload_too_large'],413);
    $raw=file_get_contents('php://input',false,null,0,$limit+1);
    if($raw===false)academy_json(['ok'=>false,'error'=>'invalid_body'],400);
    if(strlen($raw)>$limit)academy_json(['ok'=>false,'error'=>'payload_too_large'],413);
    if($raw==='')return[];
    $data=json_decode($raw,true,128);
    if(!is_array($data))academy_json(['ok'=>false,'error'=>'invalid_json'],400);
    return$data;
}
function academy_password_valid(string $password): bool {
    // PHP bcrypt truncates input at 72 bytes; reject oversize input rather than silently truncating.
    return strlen($password)>=8&&strlen($password)<=72;
}
function academy_uuid(): string {$d=random_bytes(16);$d[6]=chr((ord($d[6])&0x0f)|0x40);$d[8]=chr((ord($d[8])&0x3f)|0x80);return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($d),4));}
function academy_token(): string {return rtrim(strtr(base64_encode(random_bytes(48)),'+/','-_'),'=');}
function academy_token_hash(string $token): string {return hash('sha256',$token);}
function academy_ip_hash(): string {return hash_hmac('sha256',$_SERVER['REMOTE_ADDR']??'unknown',academy_config()['app']['app_secret']??'');}
function academy_user_agent_hash(): string {return hash('sha256',$_SERVER['HTTP_USER_AGENT']??'');}
function academy_path(string $path): string {$path=trim(trim($path),'/');if($path==='')return'';if(strlen($path)>700||str_contains($path,'..')||preg_match('/[\x00-\x1F]/',$path))academy_json(['ok'=>false,'error'=>'invalid_path'],400);return preg_replace('#/+#','/',$path);}
function academy_bearer(): ?string {$h=$_SERVER['HTTP_AUTHORIZATION']??'';return preg_match('/^Bearer\s+(.+)$/i',trim($h),$m)?trim($m[1]):null;}
function academy_current_user(bool $required=false): ?array {
    $token=academy_bearer();if(!$token){if($required)academy_json(['ok'=>false,'error'=>'auth_required'],401);return null;}
    $st=academy_db()->prepare("SELECT u.id,u.email,u.display_name,u.primary_role,u.status,s.app_name,TIMESTAMPDIFF(SECOND,s.last_seen_at,UTC_TIMESTAMP()) AS idle_seconds FROM academy_sessions s JOIN academy_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP() LIMIT 1");
    $st->execute([academy_token_hash($token)]);$u=$st->fetch();if(!$u||$u['status']!=='active'){if($required)academy_json(['ok'=>false,'error'=>'invalid_session'],401);return null;}
    if((int)($u['idle_seconds']??0)>=60)academy_db()->prepare('UPDATE academy_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE token_hash=? AND last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 60 SECOND)')->execute([academy_token_hash($token)]);return$u;
}
function academy_audit(?string $uid,string $action,?string $path=null,array $meta=[]): void {$st=academy_db()->prepare('INSERT INTO academy_audit_log(user_id,action,target_path,metadata_json,ip_hash) VALUES(?,?,?,?,?)');$st->execute([$uid,$action,$path,$meta?json_encode($meta,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null,academy_ip_hash()]);}
function academy_rate_limit(string $scope,int $maxHits,int $windowSeconds): void {
    $key=hash('sha256',$scope.'|'.academy_ip_hash());$pdo=academy_db();$pdo->beginTransaction();try{$st=$pdo->prepare('SELECT hits,UNIX_TIMESTAMP(window_started_at) started FROM academy_rate_limits WHERE bucket_key=? FOR UPDATE');$st->execute([$key]);$r=$st->fetch();$now=time();if(!$r||$now-(int)$r['started']>=$windowSeconds)$pdo->prepare('REPLACE INTO academy_rate_limits(bucket_key,hits,window_started_at) VALUES(?,1,UTC_TIMESTAMP())')->execute([$key]);else{if((int)$r['hits']>=$maxHits){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'too_many_requests'],429);}$pdo->prepare('UPDATE academy_rate_limits SET hits=hits+1 WHERE bucket_key=?')->execute([$key]);}$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
}
function academy_value_type(mixed $v): string {return $v===null?'null':(is_bool($v)?'boolean':((is_int($v)||is_float($v))?'number':(is_string($v)?'string':(is_array($v)&&array_is_list($v)?'array':'object'))));}
function academy_flatten_value(string $path,mixed $value,array &$rows): void {if(is_array($value)&&!array_is_list($value)&&count($value)>0){foreach($value as $k=>$child)academy_flatten_value($path===''?(string)$k:$path.'/'.(string)$k,$child,$rows);return;}$rows[]=[$path,$value];}
// Escape LIKE metacharacters in path segments, including underscore in generated IDs.
// An unescaped underscore would delete or read sibling records sharing a pattern.
function academy_path_like_prefix(string $path): string {return strtr($path,['!'=>'!!','%'=>'!%','_'=>'!_']).'/%';}
function academy_delete_node_raw(PDO $pdo,string $path): void {if($path==='')$pdo->exec('DELETE FROM academy_data');else$pdo->prepare("DELETE FROM academy_data WHERE path=? OR path LIKE ? ESCAPE '!'")->execute([$path,academy_path_like_prefix($path)]);}
// All generic data writes on the same top-level collection share an advisory lock.
// Keeps parent/child writes and simultaneous multi-updates from interleaving.
function academy_data_lock_names(array $paths): array {
    $names=[];
    foreach($paths as $path){$root=explode('/',academy_path((string)$path),2)[0];$names['ac:v29:'.sha1($root)]='ac:v29:'.sha1($root);}
    sort($names,SORT_STRING);return array_values($names);
}
function academy_acquire_data_locks(PDO $pdo,array $paths): array {
    $got=[];
    foreach(academy_data_lock_names($paths) as $name){
        $ok=(int)$pdo->query('SELECT GET_LOCK('.$pdo->quote($name).', 5)')->fetchColumn();
        if($ok!==1){academy_release_data_locks($pdo,$got);throw new RuntimeException('academy_data_busy');}
        $got[]=$name;
    }
    return $got;
}
function academy_release_data_locks(PDO $pdo,array $names): void {
    foreach(array_reverse($names) as $name)try{$pdo->query('SELECT RELEASE_LOCK('.$pdo->quote($name).')');}catch(Throwable $ignored){}
}

function academy_insert_value_raw(PDO $pdo,string $path,mixed $value,?string $uid): void {$rows=[];if($value!==null)academy_flatten_value($path,$value,$rows);if(!$rows)return;$st=$pdo->prepare('INSERT INTO academy_data(path,value_json,value_type,updated_by) VALUES(?,?,?,?)');foreach($rows as[$p,$v])$st->execute([$p,json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),academy_value_type($v),$uid]);}
function academy_write_node(string $path,mixed $value,?string $uid): void {$pdo=academy_db();$path=academy_path($path);$locks=academy_acquire_data_locks($pdo,[$path]);try{$pdo->beginTransaction();try{academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$value,$uid);$pdo->commit();}catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}}finally{academy_release_data_locks($pdo,$locks);}}
function academy_read_node(string $path): mixed {
    $path=academy_path($path);$st=academy_db()->prepare("SELECT path,value_json FROM academy_data WHERE path=? OR path LIKE ? ESCAPE '!' ORDER BY CHAR_LENGTH(path)");$st->execute([$path,$path===''?'%':academy_path_like_prefix($path)]);$rows=$st->fetchAll();if(!$rows)return null;
    foreach($rows as$r)if($r['path']===$path)return json_decode($r['value_json'],true);$root=[];foreach($rows as$r){$rel=$path===''?$r['path']:substr($r['path'],strlen($path)+1);if($rel==='')continue;$parts=explode('/',$rel);$cursor=&$root;foreach($parts as$i=>$part){if($i===count($parts)-1)$cursor[$part]=json_decode($r['value_json'],true);else{if(!isset($cursor[$part])||!is_array($cursor[$part]))$cursor[$part]=[];$cursor=&$cursor[$part];}}unset($cursor);}return$root;
}
function academy_stable(mixed $v): string {if(!is_array($v))return json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);if(array_is_list($v))return'['.implode(',',array_map('academy_stable',$v)).']';ksort($v,SORT_STRING);$parts=[];foreach($v as$k=>$x)$parts[]=json_encode((string)$k,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).':'.academy_stable($x);return'{'.implode(',',$parts).'}';}
function academy_data_hash(mixed $v): string {return hash('sha256',academy_stable($v));}
function academy_expected_role(string $app): ?string {if($app==='admin-portal')return'admin';if($app==='teacher-portal')return'teacher';if($app==='parent-portal')return'parent';if($app==='[DEFAULT]')return'student';return null;}
function academy_path_is(string $path,string $root): bool {return $path===$root||str_starts_with($path,$root.'/');}
function academy_now_ms(): int {return (int)round(microtime(true)*1000);}
function academy_list_values(mixed $value): array {
    if(!is_array($value))return[];
    return array_is_list($value)?array_values(array_filter($value,fn($x)=>$x!==null)):array_values($value);
}
function academy_teacher_assignments(string $uid): array {
    $profile=academy_read_node('teacherProfiles/'.$uid);if(!is_array($profile))return[];
    $raw=$profile['assignments']??($profile['subjects']??[]);$out=[];
    foreach(academy_list_values($raw) as $a){if(is_string($a))$a=['subject'=>$a];if(is_array($a))$out[]=$a;}
    return$out;
}

function academy_teacher_permissions(string $uid): array {
    $profile=academy_read_node('teacherProfiles/'.$uid);$raw=is_array($profile)?($profile['permissions']??[]):[];if(!is_array($raw))$raw=[];
    return array_merge([
        'publishLessons'=>false,'publishQuizzes'=>false,'publishFiles'=>false,'publishProfile'=>false,
        'publishQuestions'=>false,'publishEdits'=>false,'createGroups'=>true,'shareContent'=>true,'createChallenges'=>true,'publishChallenges'=>false,'createTournaments'=>false,'publishTournaments'=>false,'createLiveSessions'=>true,'publishLiveSessions'=>false
    ],$raw);
}
function academy_teacher_is_archived(string $uid): bool {
    $profile=academy_read_node('teacherProfiles/'.$uid);if(!is_array($profile))return true;
    return ($profile['accountState']??'active')==='archived'||($profile['isArchived']??false)===true;
}
function academy_teacher_is_active_profile(string $uid): bool {
    $profile=academy_read_node('teacherProfiles/'.$uid);return is_array($profile)&&($profile['isActive']??true)!==false&&!academy_teacher_is_archived($uid);
}
function academy_teacher_scope_allowed(string $uid,array $scope): bool {
    foreach(academy_teacher_assignments($uid) as $a){
        if(!empty($a['type'])&&($scope['type']??'')!==$a['type'])continue;
        if(!empty($a['stage'])&&($scope['stage']??'')!==$a['stage'])continue;
        if(isset($a['grade'])&&$a['grade']!==''&&(string)($scope['grade']??'')!==(string)$a['grade'])continue;
        if(!empty($a['subject'])&&($scope['subject']??'')!==$a['subject'])continue;
        return true;
    }
    return false;
}
function academy_normalize_question(mixed $q): ?array {
    if(!is_array($q))return null;$text=trim((string)($q['text']??$q['question']??''));$opts=academy_list_values($q['opts']??$q['options']??[]);$opts=array_values(array_filter(array_map(fn($x)=>trim((string)$x),$opts),fn($x)=>$x!==''));
    if($text===''||count($opts)<2||count($opts)>6)return null;$correct=(int)($q['correctAnswer']??0);if($correct<0||$correct>=count($opts))$correct=0;
    return ['text'=>mb_substr($text,0,500),'opts'=>array_map(fn($x)=>mb_substr($x,0,250),$opts),'correctAnswer'=>$correct,'explanation'=>mb_substr(trim((string)($q['explanation']??'')),0,1200),'skill'=>mb_substr(trim((string)($q['skill']??'')),0,140),'difficulty'=>max(1,min(3,(int)($q['difficulty']??2)))];
}
function academy_normalize_questions(mixed $questions,int $limit=100): array {
    $out=[];foreach(academy_list_values($questions) as $q){$n=academy_normalize_question($q);if($n)$out[]=$n;if(count($out)>=$limit)break;}return$out;
}
function academy_public_teacher_package(string $lessonId,string $teacherId,array $package,?array $user,array $lesson): ?array {
    if(($package['status']??'published')!=='published'||($package['active']??true)===false)return null;
    if(academy_teacher_is_archived($teacherId)||!academy_teacher_is_active_profile($teacherId))return null;
    $package['teacherId']=$teacherId;$package['lessonId']=$lessonId;
    if(!academy_v36_can_read_quiz_keys($user)&&academy_v36_exam_quiz($package['quiz']??null))$package['quiz']=academy_v36_public_quiz($package['quiz']);
    if(!academy_student_can_access_content($user,$lesson)){
        $package['accessLocked']=true;$package['videosCount']=count(academy_list_values($package['videos']??[]));$package['questionsCount']=count(academy_list_values($package['practiceQuestions']??$package['questions']??[]));
        foreach(['content','videos','practiceQuestions','questions','quiz','files','imageUrl']as$k)unset($package[$k]);
    }
    return$package;
}
function academy_legacy_teacher_packages(string $lessonId,array $lesson): array {
    $profiles=academy_public_teacher_profiles();$out=[];$primary=(string)($lesson['teacherId']??'');$videos=academy_list_values($lesson['videos']??[]);$disabledRaw=$lesson['legacyTeacherContentDisabled']??[];$disabled=[];
    if(is_array($disabledRaw)){
        if(array_is_list($disabledRaw)){foreach($disabledRaw as$id){if($id!==null&&$id!=='')$disabled[(string)$id]=true;}}
        else{foreach($disabledRaw as$id=>$on){if($on)$disabled[(string)$id]=true;}}
    }
    $isDisabled=fn(string $tid):bool=>$tid!==''&&isset($disabled[$tid]);
    foreach($videos as $v){if(!is_array($v)||empty($v['url']))continue;$tid=(string)($v['teacherId']??$primary);if($tid===''||$isDisabled($tid)||academy_teacher_is_archived($tid))continue;if(!isset($out[$tid]))$out[$tid]=['lessonId'=>$lessonId,'teacherId'=>$tid,'teacherName'=>$profiles[$tid]['name']??($v['name']??'مدرس'),'status'=>'published','active'=>true,'videos'=>[],'content'=>'','contentFormat'=>'html','practiceQuestions'=>[],'files'=>[],'legacy'=>true];$out[$tid]['videos'][]=['url'=>$v['url'],'title'=>$v['title']??'','checkpoints'=>$v['checkpoints']??[]];}
    if($primary!==''&&!$isDisabled($primary)&&!academy_teacher_is_archived($primary)){
        if(!isset($out[$primary]))$out[$primary]=['lessonId'=>$lessonId,'teacherId'=>$primary,'teacherName'=>$profiles[$primary]['name']??'مدرس','status'=>'published','active'=>true,'videos'=>[],'files'=>[],'legacy'=>true];
        $out[$primary]['content']=$lesson['content']??'';$out[$primary]['contentFormat']=$lesson['contentFormat']??'html';$out[$primary]['imageUrl']=$lesson['imageUrl']??'';$out[$primary]['imagePosition']=$lesson['imagePosition']??'top';$out[$primary]['practiceQuestions']=$lesson['questions']??[];
    }
    $quizzes=academy_read_node('quizzes');if(is_array($quizzes))foreach($quizzes as$qid=>$q){if(!is_array($q)||($q['lessonId']??'')!==$lessonId||!academy_content_visible_to_reader(null,$q)||academy_v36_exam_quiz($q))continue;$tid=(string)($q['teacherId']??$primary);if($tid===''||$isDisabled($tid)||academy_teacher_is_archived($tid))continue;if(!isset($out[$tid]))$out[$tid]=['lessonId'=>$lessonId,'teacherId'=>$tid,'teacherName'=>$profiles[$tid]['name']??'مدرس','status'=>'published','active'=>true,'videos'=>[],'files'=>[],'legacy'=>true];if(!isset($out[$tid]['quiz'])){$safeQuiz=academy_v36_public_quiz($q);$out[$tid]['quiz']=['id'=>(string)$qid,'title'=>$q['name']??$q['title']??'اختبار الدرس','questions'=>$safeQuiz['questions']??[],'assessmentMode'=>$q['assessmentMode']??'practice','isFree'=>$q['isFree']??($lesson['isFree']??false)];}}
    $files=academy_read_node('files');if(is_array($files))foreach($files as$fid=>$f){if(!is_array($f)||($f['lessonId']??'')!==$lessonId||!academy_content_visible_to_reader(null,$f))continue;$tid=(string)($f['teacherId']??$primary);if($tid===''||$isDisabled($tid)||academy_teacher_is_archived($tid))continue;$url=(string)($f['url']??$f['fileUrl']??$f['downloadUrl']??'');if($url==='')continue;if(!isset($out[$tid]))$out[$tid]=['lessonId'=>$lessonId,'teacherId'=>$tid,'teacherName'=>$profiles[$tid]['name']??'مدرس','status'=>'published','active'=>true,'videos'=>[],'files'=>[],'legacy'=>true];$out[$tid]['files'][]=['id'=>(string)$fid,'name'=>$f['title']??$f['name']??'ملف','url'=>$url,'type'=>$f['type']??''];}
    return$out;
}
function academy_public_teacher_profiles(): array {
    $teachers=academy_read_node('teacherProfiles');if(!is_array($teachers))$teachers=[];
    $published=academy_read_node('settings/publicTeachers');if(!is_array($published))$published=[];
    $ids=array_unique(array_merge(array_map('strval',array_keys($teachers)),array_map('strval',array_keys($published))));$out=[];
    $allowed=['name','title','photoUrl','coverUrl','bio','qualifications','experience','teachingStyle','updatedAt'];
    foreach($ids as$uid){
        $teacher=$teachers[$uid]??null;$public=$published[$uid]??null;
        if(!is_array($teacher))$teacher=[];if(!is_array($public))$public=[];
        if(array_key_exists('isActive',$teacher)&&$teacher['isActive']===false)continue;
        if(($teacher['accountState']??'active')==='archived'||($teacher['isArchived']??false)===true)continue;
        if(array_key_exists('active',$public)&&$public['active']===false)continue;
        $name=trim((string)($public['name']??$teacher['name']??''));if($name==='')continue;
        $safe=['name'=>$name,'active'=>true];
        foreach($allowed as$key)if($key!=='name'&&array_key_exists($key,$public))$safe[$key]=$public[$key];
        if(empty($safe['title'])){
            $subjectName='';foreach(academy_list_values($teacher['assignments']??[])as$a){if(is_array($a)&&!empty($a['subjectName'])){$subjectName=trim((string)$a['subjectName']);break;}}
            $safe['title']=$subjectName!==''?'مدرس '.$subjectName:'مدرس بالأكاديمية';
        }
        foreach(['photoUrl','coverUrl','bio','qualifications','experience','teachingStyle']as$key)if(!isset($safe[$key]))$safe[$key]='';
        $out[$uid]=$safe;
    }
    return$out;
}
function academy_scope_matches(array $scope,array $profile): bool {
    if(!empty($scope['type'])&&($scope['type']??'')!==($profile['educationType']??$profile['type']??''))return false;
    if(!empty($scope['stage'])&&($scope['stage']??'')!==($profile['stage']??''))return false;
    if(isset($scope['grade'])&&$scope['grade']!==''&&(string)$scope['grade']!==(string)($profile['grade']??''))return false;
    if(!empty($scope['subject'])&&isset($profile['subject'])&&$scope['subject']!==$profile['subject'])return false;
    return true;
}
function academy_teacher_can_access_student(string $teacherUid,string $studentUid): bool {
    // V62: a teaching assignment alone never grants access to all students in a grade.
    // Only active, two-sided group membership qualifies. The V62 helper also checks scope.
    return function_exists('academy_v62_teacher_student_allowed')
        && academy_v62_teacher_student_allowed($teacherUid,$studentUid);
}
function academy_teacher_owns_assignment(string $teacherUid,string $assignmentId): bool {
    $a=academy_read_node('assignments/'.$assignmentId);return is_array($a)&&($a['teacherId']??'')===$teacherUid;
}
function academy_teacher_owns_live_session(string $teacherUid,string $sessionId): bool {
    $s=academy_read_node('liveSessions/'.$sessionId);return is_array($s)&&(($s['teacherId']??'')===$teacherUid||($s['createdBy']??'')===$teacherUid);
}
function academy_teacher_owns_lesson(string $teacherUid,string $lessonId): bool {
    $lesson=academy_read_node('lessons/'.$lessonId);if(!is_array($lesson))return false;
    if(($lesson['teacherId']??'')===$teacherUid)return true;
    foreach(academy_list_values($lesson['videos']??[]) as $v)if(is_array($v)&&($v['teacherId']??'')===$teacherUid)return true;
    $package=academy_read_node('teacherContentsV6/'.$lessonId.'/'.$teacherUid);if(is_array($package))return true;
    return false;
}
function academy_parent_can_access_student(string $parentUid,string $studentUid): bool {
    $link=academy_read_node('parentLinksV4/'.$parentUid.'/'.$studentUid);return is_array($link)&&($link['studentId']??$studentUid)===$studentUid;
}
function academy_plan_has_subject(array $plan,string $subject): bool {
    if(($plan['accessMode']??'all')!=='subjects'||$subject==='')return true;$subjects=$plan['subjects']??[];
    if(is_array($subjects)&&array_is_list($subjects))return in_array($subject,array_map('strval',$subjects),true);
    return is_array($subjects)&&!empty($subjects[$subject]);
}
function academy_student_can_access_content(?array $user,array $item): bool {
    if(($user['primary_role']??'')==='admin'||($user['primary_role']??'')==='teacher')return true;
    $settings=academy_read_node('subscriptionSettingsV1');if(!is_array($settings)||($settings['enforceAccess']??false)!==true)return true;
    if(($item['isFree']??false)===true)return true;
    if(!$user||($user['primary_role']??'')!=='student')return false;
    $uid=$user['id'];$profile=academy_read_node('studentProfilesV3/'.$uid);$sub=academy_read_node('studentSubscriptionsV1/'.$uid);
    if(!is_array($profile)||!is_array($sub)||($sub['status']??'')!=='active')return false;
    $now=academy_now_ms();$starts=(int)($sub['startsAt']??0);$ends=(int)($sub['endsAt']??0);if($starts&&$starts>$now)return false;if($ends&&$ends<=$now)return false;
    $planId=(string)($sub['planId']??'');$plan=$planId!==''?academy_read_node('subscriptionPlansV1/'.$planId):null;if(!is_array($plan)||($plan['isActive']??true)===false)return false;
    if(!empty($plan['targetType'])&&$plan['targetType']!==($profile['educationType']??''))return false;
    if(!empty($plan['targetStage'])&&$plan['targetStage']!==($profile['stage']??''))return false;
    if(!empty($plan['targetGrade'])&&(string)$plan['targetGrade']!==(string)($profile['grade']??''))return false;
    return academy_plan_has_subject($plan,(string)($item['subject']??''));
}
function academy_sanitize_content_item(string $root,array $item,?array $user): array {
    if(academy_student_can_access_content($user,$item))return$item;
    $item['accessLocked']=true;
    if($root==='lessons'){$item['questionsCount']=is_array($item['questions']??null)?count($item['questions']):0;$item['videosCount']=is_array($item['videos']??null)?count($item['videos']):0;foreach(['content','questions','videos','videoUrl','attachments']as$k)unset($item[$k]);}
    elseif($root==='quizzes'){$item['questionsCount']=is_array($item['questions']??null)?count($item['questions']):0;unset($item['questions']);}
    elseif($root==='files'){foreach(['url','fileUrl','downloadUrl','storageUrl']as$k)unset($item[$k]);}
    elseif($root==='simulations'){foreach(['questions','content','launchUrl','url','answers']as$k)unset($item[$k]);}
    elseif($root==='liveSessions'){foreach(['joinUrl','streamUrl','replayUrl','meetingUrl','password']as$k)unset($item[$k]);}
    return$item;
}
function academy_strip_archived_teacher_content(string $root,array $item,?array $user): ?array {
    $role=$user['primary_role']??'';if(in_array($role,['admin','teacher'],true))return$item;
    $owner=(string)($item['teacherId']??'');
    if($root==='lessons'){
        $disabled=$item['legacyTeacherContentDisabled']??[];$isDisabled=function(string $tid)use($disabled):bool{if($tid===''||!is_array($disabled))return false;if(array_is_list($disabled))return in_array($tid,array_map('strval',$disabled),true);return ($disabled[$tid]??false)===true;};
        $videos=[];foreach(academy_list_values($item['videos']??[])as$v){if(!is_array($v))continue;$tid=(string)($v['teacherId']??$owner);if(($tid!==''&&academy_teacher_is_archived($tid))||$isDisabled($tid))continue;$videos[]=$v;}
        if(isset($item['videos']))$item['videos']=$videos;
        if($owner!==''&&(academy_teacher_is_archived($owner)||$isDisabled($owner))){
            foreach(['content','questions','videoUrl','imageUrl','attachments']as$k)unset($item[$k]);$item['legacyTeacherArchived']=academy_teacher_is_archived($owner);$item['legacyTeacherMoved']=$isDisabled($owner);
        }
        return$item;
    }
    if(in_array($root,['quizzes','files'],true)&&$owner!==''&&academy_teacher_is_archived($owner))return null;
    return$item;
}

// V36: do not disclose answers from standalone assessment quizzes until the attempt is submitted.
function academy_v36_exam_quiz(mixed $item): bool {
    return is_array($item)&&in_array(($item['assessmentMode']??'practice'),['exam','interactive'],true);
}
function academy_v36_public_quiz(array $item): array {
    if(!academy_v36_exam_quiz($item))return $item;
    // V57: typed questions are filtered by allow-list; never expose accepted answers, rubrics or pairs.
    if(($item['assessmentMode']??'')==='interactive'){
        $item['questions']=is_array($item['questions']??null)?academy_v57_public_questions($item['questions']):[];
        $allowed=['id','name','title','lessonId','teacherId','type','stage','grade','subject','assessmentMode','isFree','isHidden','workflowStatus','reviewStatus','createdAt','updatedAt','status','questions','questionsCount','accessLocked'];
        return array_intersect_key($item,array_flip($allowed));
    }
    // V37: allow-list only the visible fields of a server-normalized exam question.
    // Blacklisting names such as `correctAnswer` missed nested options and new key aliases.
    $clean=[];
    foreach(academy_v29_questions($item['questions']??[]) as $q){
        $clean[]=['question'=>$q['question'],'options'=>$q['options']];
    }
    $item['questions']=$clean;
    // Do not pass arbitrary extra teacher/editor metadata into the browser.
    $allowed=['id','name','title','lessonId','teacherId','type','stage','grade',
      'subject','subjectName','assessmentMode','isFree','isHidden','workflowStatus',
      'reviewStatus','createdAt','updatedAt','status','questions','questionsCount',
      'accessLocked','unit','order','sortOrder'];
    return array_intersect_key($item,array_flip($allowed));
}
function academy_v36_can_read_quiz_keys(?array $user): bool {
    return ($user['primary_role']??'')==='admin';
}

// V53.6: pending submissions created through legacy generic API stay review-only.
function academy_teacher_pending_submission_valid(string $teacherUid,mixed $value): bool {
    return is_array($value)
        && ($value['status']??null)==='pending'
        && (!isset($value['teacherId'])||(string)$value['teacherId']===$teacherUid)
        && !isset($value['reviewedBy'])&&!isset($value['reviewedAt'])
        && (in_array((string)($value['submissionKind']??''),['lesson','quiz','assignment','notification','profile','teacherContentV6','teacherQuizV6'],true)
            || (($value['type']??'')==='profile'&&!isset($value['submissionKind'])));
}
// V53.6: server-side publication rules; client-side hiding is not an access control.
// Preserve administrative/teacher previews; guests, students and parents only see released items.
function academy_content_visible_to_reader(?array $user,array $item,?int $nowMs=null): bool {
    if(in_array($user['primary_role']??'', ['admin','teacher'], true))return true;
    if(!empty($item['isHidden']))return false;
    if(in_array((string)($item['workflowStatus']??''),['draft','hidden'],true))return false;
    $release=$item['publishAt']??null;
    if($release!==null&&$release!==''&&is_numeric($release)&&(float)$release>($nowMs??academy_now_ms()))return false;
    return true;
}
function academy_filter_read_response(?array $user,string $path,mixed $value): mixed {
    $parts=$path===''?[]:explode('/',$path);$root=$parts[0]??'';
    if($root==='settings'&&($parts[1]??'')==='publicTeachers'){
        $profiles=academy_public_teacher_profiles();
        if(count($parts)===2)return$profiles;
        $node=$profiles[$parts[2]??'']??null;
        for($i=3;$i<count($parts);$i++){if(!is_array($node)||!array_key_exists($parts[$i],$node))return null;$node=$node[$parts[$i]];}
        return$node;
    }
    if($root==='settings'&&count($parts)===1){
        if(!is_array($value))$value=[];
        if(($user['primary_role']??'')!=='admin')$value=academy_public_settings_only($value);
        $value['publicTeachers']=academy_public_teacher_profiles();
    }
    if($value===null)return null;
    // V67: legacy /data readers must not discover homework restricted to other students.
    // Other legacy assignments are left unchanged for backwards compatibility.
    if($root==='assignments'&&($user['primary_role']??'')==='student'){
        $studentId=(string)$user['id'];
        $studentProfile=academy_read_node('studentProfilesV3/'.$studentId);
        $mayReadSelected=static function(array $assignment)use($studentId,$studentProfile):bool{
            return is_array($studentProfile)
                &&($assignment['status']??'published')==='published'
                &&empty($assignment['isHidden'])
                &&academy_scope_matches($assignment,$studentProfile)
                &&($assignment['targetMode']??'stage')==='group'
                &&academy_v534_assignment_group_allowed($assignment,$studentProfile,$studentId);
        };
        if(count($parts)===1&&is_array($value)){
            foreach($value as $id=>$assignment){
                if(!is_array($assignment))continue;
                if(($assignment['recipientMode']??'all')==='selected'&&!$mayReadSelected($assignment))unset($value[$id]);
            }
            return $value;
        }
        if(count($parts)>=2){
            $assignment=academy_read_node('assignments/'.$parts[1]);
            if(is_array($assignment)&&($assignment['recipientMode']??'all')==='selected'&&!$mayReadSelected($assignment))return null;
        }
    }
    if(in_array($root,['lessons','quizzes','files','simulations','liveSessions'],true)){
        if(count($parts)===1&&is_array($value)){foreach($value as$id=>$item)if(is_array($item)){if(!academy_content_visible_to_reader($user,$item)){unset($value[$id]);continue;}$_clean=academy_strip_archived_teacher_content($root,$item,$user);if($_clean===null){unset($value[$id]);continue;}$result=academy_sanitize_content_item($root,$_clean,$user);if($root==='quizzes'&&!academy_v36_can_read_quiz_keys($user))$result=academy_v36_public_quiz($result);$value[$id]=$result;}return$value;}
        if(count($parts)>=2){$item=academy_read_node($root.'/'.$parts[1]);if(is_array($item)){if(!academy_content_visible_to_reader($user,$item))return null;$clean=academy_strip_archived_teacher_content($root,$item,$user);if($clean===null)return null;$item=$clean;if(count($parts)===2)$value=$clean;}
          // Reading quizzes/ID/questions/... directly must not bypass full-quiz redaction.
          if($root==='quizzes'&&academy_v36_exam_quiz($item)&&!academy_v36_can_read_quiz_keys($user)){
             if(count($parts)>2)return null;
             if(count($parts)===2&&is_array($value))$value=academy_v36_public_quiz($value);
          }
          if(is_array($item)&&!academy_student_can_access_content($user,$item)){
            $sensitive=['lessons'=>['content','questions','videos','videoUrl','attachments'],'quizzes'=>['questions'],'files'=>['url','fileUrl','downloadUrl','storageUrl'],'simulations'=>['questions','content','launchUrl','url','answers'],'liveSessions'=>['joinUrl','streamUrl','replayUrl','meetingUrl','password']][$root]??[];
            if(count($parts)===2)return academy_sanitize_content_item($root,$item,$user);
            if(in_array($parts[2]??'',$sensitive,true))return null;
        }}
    }
    // V38: the subscription gate is public, but arbitrary future payment/config keys are not.
    if($root==='subscriptionSettingsV1'&&count($parts)===1&&($user['primary_role']??'')!=='admin'){
        if(!is_array($value))return null;
        return ['enforceAccess'=>($value['enforceAccess']??false)===true];
    }
    if(($user['primary_role']??'')==='teacher'&&$root==='studentProfilesV3'){
        $uid=$user['id'];if(count($parts)===1&&is_array($value)){foreach(array_keys($value)as$sid)if(!academy_teacher_can_access_student($uid,(string)$sid))unset($value[$sid]);return$value;}
    }
    if(($user['primary_role']??'')==='teacher'&&$root==='contentAnalytics'&&count($parts)===1&&is_array($value)){
        $uid=$user['id'];$lessons=academy_read_node('lessons');$allowed=[];if(is_array($lessons))foreach($lessons as$id=>$l){if(!is_array($l))continue;$mine=($l['teacherId']??'')===$uid||(!empty($l['teacherIds'])&&((is_array($l['teacherIds'])&&array_key_exists($uid,$l['teacherIds'])&&$l['teacherIds'][$uid]!==false)||(is_array($l['teacherIds'])&&in_array($uid,array_map('strval',$l['teacherIds']),true))));foreach(academy_list_values($l['videos']??[])as$v)if(is_array($v)&&($v['teacherId']??'')===$uid)$mine=true;if($mine)$allowed[(string)$id]=true;}foreach(array_keys($value)as$id)if(empty($allowed[(string)$id]))unset($value[$id]);return$value;
    }
    if(($user['primary_role']??'')==='teacher'&&$root==='lessonRatingsV4'&&count($parts)===1&&is_array($value)){
        $uid=$user['id'];foreach(array_keys($value)as$id)if(!academy_teacher_owns_lesson($uid,(string)$id))unset($value[$id]);return$value;
    }
    if(($user['primary_role']??'')==='teacher'&&$root==='analyticsV4'&&($parts[1]??'')==='students'&&count($parts)===2&&is_array($value)){
        $uid=$user['id'];foreach(array_keys($value)as$sid)if(!academy_teacher_can_access_student($uid,(string)$sid))unset($value[$sid]);return$value;
    }
    return$value;
}
// V35: allowlist for visitor-facing settings. New keys are private until explicitly reviewed.
function academy_public_setting_keys(): array {
    return [
        'aboutText','appearanceBrand','authVisualUrl','curriculumUnits',
        'curriculumVisuals','dashboardHeroSubtitle','dashboardHeroUrl',
        'homeSections','publicHeroEnd','publicHeroHighlight','publicHeroLead',
        'publicHeroUrl','publicTeachers','siteLogo','siteName','socialLinks',
        'socialLinksV6','appearanceV52','updatedAt','whatsapp'
    ];
}
function academy_public_settings_only(mixed $settings): array {
    if(!is_array($settings))return [];
    return array_intersect_key($settings,array_flip(academy_public_setting_keys()));
}
function academy_role_allows(?array $user,string $method,string $path): bool {
    $path=academy_path($path);$read=$method==='GET';$parts=$path===''?[]:explode('/',$path);
    $public=['customSubjects','settings','posts','lessons','quizzes','files','simulations','liveSessions','announcements','subscriptionPlansV1','subscriptionSettingsV1'];
    // The generic settings document is public, but only explicit presentation keys.
    // A future settings/paymentSecrets must never become public by accident.
    if($read&&academy_path_is($path,'settings')&&count($parts)>=2&&!in_array($parts[1],academy_public_setting_keys(),true)){
        if(!$user||$user['primary_role']!=='admin')return false;
    }
    // V38: only the access-enforcement flag may be read from this public collection.
    if($read&&academy_path_is($path,'subscriptionSettingsV1')&&count($parts)>=2&&$parts[1]!=='enforceAccess'){
        if(!$user||$user['primary_role']!=='admin')return false;
    }
    foreach($public as$r)if($read&&academy_path_is($path,$r))return true;
    // V52 design writes only through its admin-authenticated validated endpoint.
    if(!$read&&academy_path_is($path,'settings/appearanceV52'))return false;
    // Delegation records are server-owned. Even a full admin uses the dedicated V60 service.
    if(!$read&&academy_path_is($path,'adminDelegationsV60'))return false;
    if(!$user)return false;$uid=$user['id'];$role=$user['primary_role'];if($role==='admin')return true;
    foreach(["adminProfiles/$uid","teacherProfiles/$uid","parentProfilesV4/$uid"]as$r)if($read&&academy_path_is($path,$r))return true;
    if($role==='student'){
        // V29/2: grade/history must be written by the verified server endpoint only.
        // Also block writing the entire profile, which could overwrite protected children.
        if(!$read&&($path==="studentProfilesV3/$uid"||academy_path_is($path,"studentProfilesV3/$uid/quizResultsV22")||academy_path_is($path,"studentProfilesV3/$uid/quizHistory")||academy_path_is($path,"studentProfilesV3/$uid/quizMistakesV32")))return false;
        if(!$read&&academy_path_is($path,"studentProfilesV3/$uid/groupIds"))return false;
        // V76: academic scope changes must pass the validated /student/profile/save endpoint.
        // Generic /data PUT, DELETE, multi-update and transaction paths must not bypass
        // stage/grade/type validation, including through nested child paths.
        if(!$read&&count($parts)>=3&&$parts[0]==='studentProfilesV3'&&$parts[1]===$uid
            &&in_array($parts[2],['educationType','stage','grade','type','guardianPhone','parentPhone'],true))return false;
        // V36: profile counters (XP, level and badges) are server-owned, not browser-owned.
        if(!$read&&(academy_path_is($path,"studentProfilesV3/$uid/stats")||academy_path_is($path,"studentProfilesV3/$uid/achievements")||academy_path_is($path,"studentProfilesV3/$uid/badges")))return false;
        // XP and achievements cannot be granted by a self-issued generic JSON write.
        // Keep existing records readable; awards require a future validated server action.
        if(!$read&&(academy_path_is($path,"learningV4/xp/$uid")||academy_path_is($path,"learningV4/achievements/$uid")))return false;
        foreach(["studentProfilesV3/$uid","communicationSubmissionsV1/$uid","learningV4/mastery/$uid","learningV4/reviews/$uid","learningV4/resume/$uid","learningV4/notes/$uid","learningV4/favorites/$uid","learningV4/goals/$uid","learningV4/streaks/$uid","learningV4/xp/$uid","learningV4/achievements/$uid","supportTicketsV1/$uid"]as$r)if(academy_path_is($path,$r))return true;
        foreach(["studentSubscriptionsV1/$uid","subscriptionRequestsV1/$uid","learningV4/diagnostics/$uid","learningV4/recommendations/$uid"]as$r)if($read&&academy_path_is($path,$r))return true;
        foreach(['assignments','scheduleEvents','leaderboardV3','notificationBroadcasts','community','lessonDiscussionsV1']as$r)if($read&&academy_path_is($path,$r))return true;
        if(!$read&&($parts[0]??'')==='community'){
            // Students may create a new forum post, or only mutate their own per-user reaction/report/membership leaves.
            if(($parts[1]??'')==='forums'&&isset($parts[2])&&!isset($parts[3]))return academy_read_node('community/forums/'.$parts[2])===null;
            if(($parts[1]??'')==='forums'&&isset($parts[2],$parts[3],$parts[4])&&in_array($parts[3],['likesBy','reports'],true)&&$parts[4]===$uid)return true;
            if(($parts[1]??'')==='studyGroups'&&isset($parts[2],$parts[3],$parts[4])&&$parts[3]==='members'&&$parts[4]===$uid)return true;
            return false;
        }
        if($read&&($parts[0]??'')==='assignmentSubmissions'&&isset($parts[2])&&$parts[2]===$uid)return true;
        if(($parts[0]??'')==='lessonDiscussionsV1'&&isset($parts[3])&&$parts[3]===$uid)return true;
        if(($parts[0]??'')==='attendanceV4'&&isset($parts[2])&&$parts[2]===$uid)return true;
        if(($parts[0]??'')==='lessonRatingsV4'&&isset($parts[2])&&$parts[2]===$uid)return true;
        if($read&&($parts[0]??'')==='certificatesV4'&&isset($parts[1])){$c=academy_read_node('certificatesV4/'.$parts[1]);return is_array($c)&&($c['studentId']??'')===$uid;}
    }
    if($role==='teacher'){
        // V53.4: group membership and join codes are server-owned, never direct JSON writes.
        // Dedicated /teacher/groups endpoints keep create/status/delete available.
        if(!$read&&academy_path_is($path,'teacherGroupsV4/'.$uid))return false;
        // A teacher must never self-edit their assignments, permissions, role or activation.
        // Profile updates go through teacherSubmissions for administrator approval.
        if($read&&academy_path_is($path,"teacherProfiles/$uid"))return true;
        if(academy_path_is($path,"teacherSubmissions/$uid")){
            if($read)return true;
            // Allow creating a new pending submission only, not rewriting its status or an approved item.
            return $method==='PUT'&&count($parts)===3&&academy_read_node($path)===null;
        }
        foreach(["communicationSubmissionsV1/$uid","teacherCommunicationInboxV1/$uid","supportTicketsV1/$uid","teacherGroupsV4/$uid"]as$r)if(academy_path_is($path,$r))return true;
        foreach(['assignments','questionBankV4','contentAnalytics','lessonDiscussionsV1','notificationBroadcasts']as$r)if($read&&academy_path_is($path,$r))return true;
        if($read&&academy_path_is($path,'analyticsV4/questions'))return true;
        if($read&&academy_path_is($path,'analyticsV4/teachers/'.$uid))return true;
        if($read&&($parts[0]??'')==='analyticsV4'&&($parts[1]??'')==='students'){
            if(!isset($parts[2]))return true;return academy_teacher_can_access_student($uid,$parts[2]);
        }
        if($read&&($parts[0]??'')==='lessonRatingsV4'){
            if(!isset($parts[1]))return true;return academy_teacher_owns_lesson($uid,$parts[1]);
        }
        if($read&&($parts[0]??'')==='attendanceV4'&&isset($parts[1]))return academy_teacher_owns_live_session($uid,$parts[1]);
        // V62 privacy: never expose raw student records/phone indices to teachers.
        // Teacher rosters and authorized metrics are served via filtered endpoints.
        if($read&&in_array($parts[0]??'',['studentProfilesV3','studentPhoneIndexV4','phoneDirectoryV4'],true))return false;
        if($read&&($parts[0]??'')==='assignmentSubmissions'&&isset($parts[1]))return false; // V67: only teacher-scoped filtered service endpoints; no raw submission tree.
        // V38: aggregate analytics are derived from verified events; teachers read, never author them.
        if(academy_path_is($path,'analyticsV4/teachers/'.$uid))return $read;
        if($read&&academy_path_is($path,'contentReviewV4'))return true;
    }
    if($role==='parent'){
        foreach(["parentProfilesV4/$uid","phoneDirectoryV4/parents/$uid"]as$r)if(academy_path_is($path,$r))return true;
        if($read&&academy_path_is($path,"parentLinksV4/$uid"))return true;
        if($read&&isset($parts[1])){
            if(($parts[0]??'')==='studentProfilesV3')return academy_parent_can_access_student($uid,$parts[1]);
            if(($parts[0]??'')==='learningV4'&&isset($parts[2]))return academy_parent_can_access_student($uid,$parts[2]);
            if(($parts[0]??'')==='analyticsV4'&&($parts[1]??'')==='students'&&isset($parts[2]))return academy_parent_can_access_student($uid,$parts[2]);
            if(($parts[0]??'')==='assignmentSubmissions'&&isset($parts[2]))return academy_parent_can_access_student($uid,$parts[2]);
        }
        foreach(['assignments','notificationBroadcasts']as$r)if($read&&academy_path_is($path,$r))return true;
    }
    return false;
}
