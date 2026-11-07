<?php
declare(strict_types=1);
/*
 * V101 — Courses.
 *
 * Storage (academy_data, no SQL migration):
 *   coursesV1/{courseId}                      course definition (never readable through generic /data except by admins)
 *   courseEnrollmentsV1/{studentId}/{courseId} active/revoked access records
 *   courseCodesV1/{sha256(code)}              activation codes; plaintext codes are shown once and never stored
 *   courseCodesV1/{key}/redemptions/{student} redemption log
 *   courseSettingsV1                          {whatsapp, messageTemplate, featured:[courseId,...]}
 *
 * Policies agreed with the academy owner:
 *   - A course groups curriculum lessons/quizzes/files and may add its own videos, PDFs, links and notes.
 *   - Each course decides whether an active general subscription plan unlocks it (planUnlocks).
 *   - Access length is defined by the activation code (days, or 0 = lifetime).
 *   - Teachers publish directly only with the publishCourses permission; otherwise admins review.
 */

const ACADEMY_V101_ROOT='coursesV1';
const ACADEMY_V101_ENROLL='courseEnrollmentsV1';
const ACADEMY_V101_CODES='courseCodesV1';
const ACADEMY_V101_SETTINGS='courseSettingsV1';
const ACADEMY_V101_ITEM_KINDS=['lesson','quiz','file','video','pdf','link','note'];
const ACADEMY_V101_DEFAULT_TEMPLATE="مرحبًا، أريد الاشتراك في كورس: {course}\nالمادة: {subject} — {grade}\nالسعر: {price}\nاسم الطالب: {student}\nالبريد/الحساب: {account}";

function academy_v101_fail(string $error,int $status=422,array $extra=[]): never {academy_json(['ok'=>false,'error'=>$error]+$extra,$status);}
function academy_v101_id(string $prefix): string {return $prefix.bin2hex(random_bytes(6));}
function academy_v101_valid_id(string $id): bool {return (bool)preg_match('/^[A-Za-z0-9_-]{2,80}$/D',$id);}
function academy_v101_text(mixed $v,int $max): string {
    $s=trim(str_replace("\r",'',(string)(is_scalar($v)?$v:'')));
    $s=preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$s)??'';
    return mb_substr($s,0,$max);
}
function academy_v101_url(mixed $v,bool $allowRelative=false): string {
    $s=trim((string)(is_scalar($v)?$v:''));
    if($s==='')return'';
    if($allowRelative&&preg_match('#^\./assets/[A-Za-z0-9_./-]{1,200}$#D',$s)&&!str_contains($s,'..'))return$s;
    if(strlen($s)>1000||!preg_match('#^https://#i',$s))return'';
    $p=parse_url($s);
    if(!is_array($p)||empty($p['host'])||!str_contains((string)$p['host'],'.')||isset($p['user'])||isset($p['pass']))return'';
    return$s;
}
function academy_v101_phone(mixed $v): string {
    $d=preg_replace('/\D+/','',(string)(is_scalar($v)?$v:''))??'';
    if(preg_match('/^01[0125]\d{8}$/',$d))$d='2'.$d; // Egyptian local format -> international
    return preg_match('/^[1-9]\d{7,14}$/',$d)?$d:'';
}
function academy_v101_settings(): array {
    $s=academy_read_node(ACADEMY_V101_SETTINGS);$s=is_array($s)?$s:[];
    $fallback=academy_read_node('settings/whatsapp');
    $phone=academy_v101_phone($s['whatsapp']??'');if($phone==='')$phone=academy_v101_phone(is_scalar($fallback)?$fallback:'');
    $featured=array_values(array_filter(array_map('strval',is_array($s['featured']??null)?array_values($s['featured']):[]),'academy_v101_valid_id'));
    return ['whatsapp'=>$phone,'messageTemplate'=>is_string($s['messageTemplate']??null)&&trim($s['messageTemplate'])!==''?$s['messageTemplate']:ACADEMY_V101_DEFAULT_TEMPLATE,'featured'=>$featured];
}
function academy_v101_all(): array {$all=academy_read_node(ACADEMY_V101_ROOT);return is_array($all)?$all:[];}
function academy_v101_get(string $id): ?array {
    if(!academy_v101_valid_id($id))return null;
    $c=academy_read_node(ACADEMY_V101_ROOT.'/'.$id);if(!is_array($c))return null;$c['id']=$id;return$c;
}

/* ---------- validation of a course payload ---------- */
function academy_v101_clean_sections(mixed $raw): array {
    $sections=[];
    foreach(academy_list_values($raw) as $s){
        if(!is_array($s))continue;if(count($sections)>=30)break;
        $title=academy_v101_text($s['title']??'',150);$items=[];
        foreach(academy_list_values($s['items']??[]) as $it){
            if(!is_array($it))continue;if(count($items)>=60)break;
            $kind=(string)($it['kind']??'');if(!in_array($kind,ACADEMY_V101_ITEM_KINDS,true))continue;
            $id=(string)($it['id']??'');if(!academy_v101_valid_id($id))$id=academy_v101_id('i');
            $row=['id'=>$id,'kind'=>$kind,'title'=>academy_v101_text($it['title']??'',150),'preview'=>($it['preview']??false)===true];
            if(in_array($kind,['lesson','quiz','file'],true)){
                $ref=(string)($it['refId']??'');if(!academy_v101_valid_id($ref))continue;
                $root=['lesson'=>'lessons','quiz'=>'quizzes','file'=>'files'][$kind];
                if(!is_array(academy_read_node($root.'/'.$ref)))academy_v101_fail('course_item_missing',422,['refId'=>$ref,'kind'=>$kind]);
                $row['refId']=$ref;
            }elseif($kind==='note'){
                $row['text']=academy_v101_text($it['text']??'',5000);if($row['text']==='')continue;
            }else{
                $row['url']=academy_v101_url($it['url']??'');if($row['url']==='')academy_v101_fail('course_item_url_invalid',422,['title'=>$row['title']]);
            }
            if($row['title']===''&&!in_array($kind,['lesson','quiz','file'],true))$row['title']=['video'=>'فيديو','pdf'=>'ملف PDF','link'=>'رابط','note'=>'ملاحظة'][$kind];
            $items[]=$row;
        }
        if($title===''&&!$items)continue;
        $sections[]=['id'=>academy_v101_valid_id((string)($s['id']??''))?(string)$s['id']:academy_v101_id('s'),'title'=>$title!==''?$title:'القسم '.(count($sections)+1),'items'=>$items];
    }
    return$sections;
}
function academy_v101_clean_course(array $b,?array $existing): array {
    $title=academy_v101_text($b['title']??'',150);if(mb_strlen($title)<3)academy_v101_fail('course_title_required');
    $type=(string)($b['type']??'');$stage=(string)($b['stage']??'');$grade=(string)($b['grade']??'');$subject=academy_v101_text($b['subject']??'',80);
    if(!in_array($type,['public','azhar'],true))academy_v101_fail('course_type_invalid');
    if(!in_array($stage,['primary','prep','sec'],true))academy_v101_fail('course_stage_invalid');
    $max=$stage==='primary'?6:3;
    if($grade!==''&&(!ctype_digit($grade)||(int)$grade<1||(int)$grade>$max))academy_v101_fail('course_grade_invalid');
    if($subject===''||!preg_match('/^[A-Za-z0-9_-]{1,80}$/D',$subject))academy_v101_fail('course_subject_invalid');
    $price=$b['price']??0;if(!is_numeric($price)||(float)$price<0||(float)$price>100000)academy_v101_fail('course_price_invalid');
    $price=round((float)$price,2);
    $cover=academy_v101_url($b['coverUrl']??'',true);
    if(trim((string)($b['coverUrl']??''))!==''&&$cover==='')academy_v101_fail('course_cover_invalid');
    $intro=academy_v101_url($b['introUrl']??'');
    if(trim((string)($b['introUrl']??''))!==''&&$intro==='')academy_v101_fail('course_intro_invalid');
    $sections=academy_v101_clean_sections($b['sections']??[]);
    $now=academy_now_ms();
    return [
        'title'=>$title,'subtitle'=>academy_v101_text($b['subtitle']??'',220),'description'=>academy_v101_text($b['description']??'',4000),
        'outcomes'=>array_values(array_filter(array_map(fn($x)=>academy_v101_text($x,160),array_slice(academy_list_values($b['outcomes']??[]),0,10)))),
        'coverUrl'=>$cover,'introUrl'=>$intro,'type'=>$type,'stage'=>$stage,'grade'=>$grade,'subject'=>$subject,
        'price'=>$price,'oldPrice'=>is_numeric($b['oldPrice']??null)&&(float)$b['oldPrice']>$price?round((float)$b['oldPrice'],2):null,
        'planUnlocks'=>($b['planUnlocks']??false)===true,'level'=>in_array(($b['level']??''),['beginner','intermediate','advanced','revision'],true)?$b['level']:'',
        'sections'=>$sections,'updatedAt'=>$now,'createdAt'=>(int)($existing['createdAt']??$now),
    ];
}

/* ---------- access ---------- */
function academy_v101_enrollment(string $studentId,string $courseId): ?array {
    $e=academy_read_node(ACADEMY_V101_ENROLL.'/'.$studentId.'/'.$courseId);
    if(!is_array($e)||($e['status']??'')!=='active')return null;
    $ends=$e['endsAt']??null;if($ends!==null&&(int)$ends>0&&(int)$ends<=academy_now_ms())return null;
    return$e;
}
function academy_v101_plan_covers(array $user,array $course): bool {
    if(($course['planUnlocks']??false)!==true||($user['primary_role']??'')!=='student')return false;
    $uid=(string)$user['id'];$sub=academy_read_node('studentSubscriptionsV1/'.$uid);$profile=academy_read_node('studentProfilesV3/'.$uid);
    if(!is_array($sub)||!is_array($profile)||($sub['status']??'')!=='active')return false;
    $now=academy_now_ms();$starts=(int)($sub['startsAt']??0);$ends=(int)($sub['endsAt']??0);
    if(($starts&&$starts>$now)||($ends&&$ends<=$now))return false;
    $plan=academy_read_node('subscriptionPlansV1/'.(string)($sub['planId']??''));
    if(!is_array($plan)||($plan['isActive']??true)===false)return false;
    foreach(['targetType'=>'educationType','targetStage'=>'stage','targetGrade'=>'grade'] as $p=>$s)
        if(!empty($plan[$p])&&(string)$plan[$p]!==(string)($profile[$s]??''))return false;
    return academy_plan_has_subject($plan,(string)($course['subject']??''));
}
function academy_v101_is_free(array $course): bool {return (float)($course['price']??0)<=0;}
/** @return array{level:string,reason:string,endsAt:?int} level: full|preview */
function academy_v101_access(?array $user,array $course): array {
    $role=$user['primary_role']??'';$uid=(string)($user['id']??'');
    if($role==='admin')return['level'=>'full','reason'=>'admin','endsAt'=>null];
    if($role==='teacher'&&$uid!==''&&($course['teacherId']??'')===$uid)return['level'=>'full','reason'=>'owner','endsAt'=>null];
    if($role==='student'){
        $e=academy_v101_enrollment($uid,(string)$course['id']);
        if($e)return['level'=>'full','reason'=>'enrolled','endsAt'=>isset($e['endsAt'])&&$e['endsAt']!==null?(int)$e['endsAt']:null];
        if(academy_v101_is_free($course))return['level'=>'full','reason'=>'free','endsAt'=>null];
        if(academy_v101_plan_covers($user,$course))return['level'=>'full','reason'=>'plan','endsAt'=>null];
    }
    return['level'=>'preview','reason'=>academy_v101_is_free($course)?'login':'locked','endsAt'=>null];
}
/** Hook used by academy_student_can_access_content: enrollment opens the curriculum items a course includes. */
function academy_v101_enrollment_grants(?array $user,string $ref): bool {
    static $cache=[];
    if(($user['primary_role']??'')!=='student')return false;
    $uid=(string)$user['id'];
    if(!isset($cache[$uid])){
        $refs=[];$rows=academy_read_node(ACADEMY_V101_ENROLL.'/'.$uid);
        if(is_array($rows))foreach($rows as $cid=>$row){
            if(!academy_v101_enrollment($uid,(string)$cid))continue;
            $course=academy_v101_get((string)$cid);if(!$course||($course['status']??'')!=='published')continue;
            foreach(academy_list_values($course['sections']??[]) as $s)foreach(academy_list_values(is_array($s)?($s['items']??[]):[]) as $it){
                if(!is_array($it)||empty($it['refId']))continue;
                $root=['lesson'=>'lessons','quiz'=>'quizzes','file'=>'files'][$it['kind']??'']??null;
                if($root)$refs[$root.'/'.$it['refId']]=true;
            }
        }
        $cache[$uid]=$refs;
    }
    return isset($cache[$uid][$ref]);
}
function academy_v101_visible_to(?array $user,array $course): bool {
    $role=$user['primary_role']??'';$st=(string)($course['status']??'draft');
    if($role==='admin')return true;
    if($role==='teacher'&&($course['teacherId']??'')===($user['id']??null))return true;
    if($st!=='published')return false;
    $tid=(string)($course['teacherId']??'');
    if($tid!==''&&academy_teacher_is_archived($tid))return false;
    return true;
}
function academy_v101_matches_profile(array $course,?array $profile): bool {
    if(!is_array($profile))return true;
    if(!empty($course['type'])&&$course['type']!==($profile['educationType']??''))return false;
    if(!empty($course['stage'])&&$course['stage']!==($profile['stage']??''))return false;
    if(($course['grade']??'')!==''&&(string)$course['grade']!==(string)($profile['grade']??''))return false;
    return true;
}
function academy_v101_item_counts(array $course): array {
    $c=['lessons'=>0,'quizzes'=>0,'videos'=>0,'files'=>0,'items'=>0];
    foreach(academy_list_values($course['sections']??[]) as $s)foreach(academy_list_values(is_array($s)?($s['items']??[]):[]) as $it){
        if(!is_array($it))continue;$c['items']++;$k=$it['kind']??'';
        if($k==='lesson')$c['lessons']++;elseif($k==='quiz')$c['quizzes']++;elseif($k==='video')$c['videos']++;elseif(in_array($k,['file','pdf'],true))$c['files']++;
    }
    return$c;
}
function academy_v101_teacher_card(string $tid): ?array {
    static $profiles=null;if($tid==='')return null;
    $profiles??=academy_public_teacher_profiles();
    $p=$profiles[$tid]??null;
    if(!$p){$raw=academy_read_node('teacherProfiles/'.$tid);if(!is_array($raw))return null;$p=['name'=>(string)($raw['name']??'معلم'),'title'=>'','photoUrl'=>''];}
    return ['id'=>$tid,'name'=>(string)($p['name']??'معلم'),'title'=>(string)($p['title']??''),'photoUrl'=>academy_v101_url($p['photoUrl']??'',true)];
}
function academy_v101_summary(array $course,?array $user,bool $withAccess=true): array {
    $out=['id'=>$course['id'],'title'=>$course['title']??'','subtitle'=>$course['subtitle']??'','coverUrl'=>$course['coverUrl']??'',
        'type'=>$course['type']??'','stage'=>$course['stage']??'','grade'=>(string)($course['grade']??''),'subject'=>$course['subject']??'',
        'price'=>(float)($course['price']??0),'oldPrice'=>$course['oldPrice']??null,'level'=>$course['level']??'','planUnlocks'=>($course['planUnlocks']??false)===true,
        'teacher'=>academy_v101_teacher_card((string)($course['teacherId']??'')),'counts'=>academy_v101_item_counts($course),
        'status'=>$course['status']??'draft','updatedAt'=>(int)($course['updatedAt']??0)];
    if($withAccess){$a=academy_v101_access($user,$course);$out['access']=$a['reason'];$out['accessEndsAt']=$a['endsAt'];}
    return$out;
}
function academy_v101_ref_summary(string $kind,string $ref,bool $full): array {
    $root=['lesson'=>'lessons','quiz'=>'quizzes','file'=>'files'][$kind];$n=academy_read_node($root.'/'.$ref);
    if(!is_array($n)||!academy_content_visible_to_reader(null,$n))return['missing'=>true];
    $o=['refTitle'=>(string)($n['title']??$n['name']??'')];
    if($kind==='lesson'){$o['summary']=mb_substr((string)($n['summary']??''),0,300);$o['videos']=count(academy_list_values($n['videos']??[]));$o['unit']=$n['unit']??null;}
    if($kind==='quiz'){$o['questions']=count(academy_list_values($n['questions']??[]));$o['lessonId']=(string)($n['lessonId']??'');}
    if($kind==='file'&&$full){$o['url']=academy_v101_url($n['url']??$n['fileUrl']??$n['downloadUrl']??'');}
    return$o;
}
function academy_v101_detail(array $course,?array $user): array {
    $a=academy_v101_access($user,$course);$full=$a['level']==='full';
    $sections=[];
    foreach(academy_list_values($course['sections']??[]) as $s){
        if(!is_array($s))continue;$items=[];
        foreach(academy_list_values($s['items']??[]) as $it){
            if(!is_array($it))continue;$open=$full||($it['preview']??false)===true;
            $row=['id'=>$it['id']??'','kind'=>$it['kind']??'','title'=>$it['title']??'','preview'=>($it['preview']??false)===true,'locked'=>!$open];
            if(!empty($it['refId'])){
                $row['refId']=$open?$it['refId']:null;
                $row+=academy_v101_ref_summary((string)$it['kind'],(string)$it['refId'],$open);
                if(($row['title']??'')==='')$row['title']=$row['refTitle']??'';
            }elseif($open){
                if(isset($it['url']))$row['url']=$it['url'];
                if(isset($it['text']))$row['text']=$it['text'];
            }
            $items[]=$row;
        }
        $sections[]=['id'=>$s['id']??'','title'=>$s['title']??'','items'=>$items];
    }
    $settings=academy_v101_settings();
    return academy_v101_summary($course,$user)+['description'=>$course['description']??'','outcomes'=>$course['outcomes']??[],
        'introUrl'=>$course['introUrl']??'','sections'=>$sections,'accessLevel'=>$a['level'],
        'contact'=>['whatsapp'=>$settings['whatsapp'],'messageTemplate'=>$settings['messageTemplate']]];
}

/* ---------- writes ---------- */
function academy_v101_write(PDO $pdo,string $path,mixed $value,string $uid): void {
    $locks=academy_acquire_data_locks($pdo,[$path]);
    try{$pdo->beginTransaction();academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$value,$uid);$pdo->commit();}
    catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
    finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v101_require(string $role): array {
    $u=academy_current_user(true);if(($u['primary_role']??'')!==$role)academy_v101_fail('forbidden',403);return$u;
}
function academy_v101_student_profile(array $u): ?array {$p=academy_read_node('studentProfilesV3/'.$u['id']);return is_array($p)?$p:null;}
function academy_v101_code_key(string $code): string {return hash('sha256','course:'.$code);}
function academy_v101_grant(PDO $pdo,string $studentId,string $courseId,int $days,string $source,string $by,array $meta=[]): array {
    $path=ACADEMY_V101_ENROLL.'/'.$studentId.'/'.$courseId;$now=academy_now_ms();
    $old=academy_read_node($path);$old=is_array($old)?$old:[];
    $active=($old['status']??'')==='active'&&(($old['endsAt']??null)===null||(int)$old['endsAt']>$now);
    if($days===0)$ends=null;
    else{$base=$active&&($old['endsAt']??null)!==null?(int)$old['endsAt']:$now;$ends=$base+$days*86400000;}
    if($active&&($old['endsAt']??null)===null)$ends=null; // lifetime access is never shortened
    return ['status'=>'active','courseId'=>$courseId,'studentId'=>$studentId,'source'=>$source,'grantedAt'=>$active?(int)($old['grantedAt']??$now):$now,
        'updatedAt'=>$now,'endsAt'=>$ends,'grantedBy'=>$by,'history'=>array_slice(array_merge(academy_list_values($old['history']??[]),[['at'=>$now,'source'=>$source,'days'=>$days]+$meta]),-20)];
}

function academy_v101_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v101/'))return;

    /* ----- catalog (guests, students, everyone) ----- */
    if($route==='/v101/courses'&&$method==='GET'){
        $u=academy_current_user(false);academy_rate_limit('v101-list',240,3600);
        $teacher=(string)($_GET['teacher']??'');$scope=(string)($_GET['scope']??'');
        $profile=($u&&($u['primary_role']??'')==='student')?academy_v101_student_profile($u):null;
        $list=[];
        foreach(academy_v101_all() as $id=>$c){
            if(!is_array($c))continue;$c['id']=(string)$id;
            if(($c['status']??'')!=='published')continue;if(!academy_v101_visible_to(null,$c))continue;
            if($teacher!==''&&($c['teacherId']??'')!==$teacher)continue;
            if($scope==='mine'&&$profile&&!academy_v101_matches_profile($c,$profile))continue;
            if($scope==='enrolled'&&!($u&&academy_v101_enrollment((string)$u['id'],(string)$id)))continue;
            $list[]=academy_v101_summary($c,$u);
        }
        usort($list,fn($a,$b)=>$b['updatedAt']<=>$a['updatedAt']);
        academy_json(['ok'=>true,'courses'=>$list,'profile'=>$profile?['type'=>$profile['educationType']??'','stage'=>$profile['stage']??'','grade'=>(string)($profile['grade']??'')]:null]);
    }
    if($route==='/v101/courses/featured'&&$method==='GET'){
        $u=academy_current_user(false);$profile=($u&&($u['primary_role']??'')==='student')?academy_v101_student_profile($u):null;
        $out=[];
        foreach(academy_v101_settings()['featured'] as $id){
            $c=academy_v101_get($id);if(!$c||($c['status']??'')!=='published'||!academy_v101_visible_to(null,$c))continue;
            if($profile&&!academy_v101_matches_profile($c,$profile))continue;
            $out[]=academy_v101_summary($c,$u);if(count($out)>=12)break;
        }
        academy_json(['ok'=>true,'courses'=>$out]);
    }
    if($route==='/v101/course'&&$method==='GET'){
        $u=academy_current_user(false);$c=academy_v101_get((string)($_GET['id']??''));
        if(!$c||!academy_v101_visible_to($u,$c))academy_v101_fail('course_not_found',404);
        academy_json(['ok'=>true,'course'=>academy_v101_detail($c,$u)]);
    }

    /* ----- student ----- */
    if($route==='/v101/redeem'&&$method==='POST'){
        $u=academy_v101_require('student');academy_rate_limit('v101-redeem-'.$u['id'],10,3600);academy_rate_limit('v101-redeem-ip',30,3600);
        $b=academy_body();$code=strtoupper(preg_replace('/\s+/','',(string)($b['code']??''))??'');
        if(!preg_match('/^CRS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/D',$code))academy_v101_fail('code_invalid');
        $key=academy_v101_code_key($code);$codePath=ACADEMY_V101_CODES.'/'.$key;
        $pre=academy_read_node($codePath);if(!is_array($pre))academy_v101_fail('code_unavailable');
        $courseId=(string)($pre['courseId']??'');$enrollPath=ACADEMY_V101_ENROLL.'/'.$u['id'].'/'.$courseId;
        $locks=academy_acquire_data_locks($pdo,[$codePath,$enrollPath]);
        try{
            $pdo->beginTransaction();
            $rec=academy_read_node($codePath);$now=academy_now_ms();
            $fail=function(string $e)use($pdo){$pdo->rollBack();academy_v101_fail($e);};
            if(!is_array($rec)||($rec['status']??'')!=='active')$fail('code_unavailable');
            if(!empty($rec['expiresAt'])&&(int)$rec['expiresAt']<$now)$fail('code_expired');
            if((int)($rec['uses']??0)>=(int)($rec['maxUses']??1))$fail('code_exhausted');
            if(isset($rec['redemptions'][$u['id']]))$fail('code_already_used');
            $course=academy_v101_get($courseId);if(!$course||($course['status']??'')!=='published')$fail('course_unavailable');
            $current=academy_v101_enrollment((string)$u['id'],$courseId);
            if($current&&($current['endsAt']??null)===null)$fail('already_enrolled');
            $days=max(0,min(3650,(int)($rec['accessDays']??0)));
            $enroll=academy_v101_grant($pdo,(string)$u['id'],$courseId,$days,'code',(string)$u['id'],['codeSuffix'=>(string)($rec['suffix']??'')]);
            $rec['uses']=(int)($rec['uses']??0)+1;$rec['lastUsedAt']=$now;
            $rec['redemptions'][$u['id']]=['at'=>$now,'name'=>(string)($u['display_name']??''),'endsAt'=>$enroll['endsAt']];
            if($rec['uses']>=(int)($rec['maxUses']??1))$rec['status']='exhausted';
            academy_delete_node_raw($pdo,$codePath);academy_insert_value_raw($pdo,$codePath,$rec,(string)$u['id']);
            academy_delete_node_raw($pdo,$enrollPath);academy_insert_value_raw($pdo,$enrollPath,$enroll,(string)$u['id']);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}
        finally{academy_release_data_locks($pdo,$locks);}
        academy_audit((string)$u['id'],'v101.course.redeem',$courseId,['codeSuffix'=>$rec['suffix']??'','days'=>$days]);
        academy_json(['ok'=>true,'courseId'=>$courseId,'title'=>$course['title']??'','endsAt'=>$enroll['endsAt']]);
    }

    /* ----- teacher ----- */
    if($route==='/v101/teacher/courses'&&$method==='GET'){
        $u=academy_v101_require('teacher');$perm=academy_teacher_permissions((string)$u['id']);$out=[];
        foreach(academy_v101_all() as $id=>$c){if(!is_array($c)||($c['teacherId']??'')!==$u['id']||($c['status']??'')==='archived')continue;$c['id']=(string)$id;
            $row=academy_v101_summary($c,$u,false)+['reviewNote'=>$c['reviewNote']??'','hasPendingRevision'=>is_array($c['pendingRevision']??null),'enrolled'=>academy_v101_count_enrolled((string)$id)];
            $out[]=$row;}
        usort($out,fn($a,$b)=>$b['updatedAt']<=>$a['updatedAt']);
        academy_json(['ok'=>true,'courses'=>$out,'permissions'=>['create'=>($perm['createCourses']??true)!==false,'publish'=>($perm['publishCourses']??false)===true],'assignments'=>academy_teacher_assignments((string)$u['id'])]);
    }
    if($route==='/v101/teacher/course'&&$method==='GET'){
        $u=academy_v101_require('teacher');$c=academy_v101_get((string)($_GET['id']??''));
        if(!$c||($c['teacherId']??'')!==$u['id'])academy_v101_fail('course_not_found',404);
        $edit=is_array($c['pendingRevision']??null)?array_merge($c,$c['pendingRevision']):$c;
        academy_json(['ok'=>true,'course'=>$edit+['hasPendingRevision'=>is_array($c['pendingRevision']??null)]]);
    }
    if($route==='/v101/teacher/course/save'&&$method==='POST'){
        $u=academy_v101_require('teacher');$uid=(string)$u['id'];academy_rate_limit('v101-teacher-save-'.$uid,60,3600);
        if(!academy_teacher_is_active_profile($uid))academy_v101_fail('teacher_inactive',403);
        $perm=academy_teacher_permissions($uid);if(($perm['createCourses']??true)===false)academy_v101_fail('permission_denied',403);
        $b=academy_body();$id=(string)($b['id']??'');$existing=$id!==''?academy_v101_get($id):null;
        if($id!==''&&(!$existing||($existing['teacherId']??'')!==$uid))academy_v101_fail('course_not_found',404);
        $clean=academy_v101_clean_course($b,$existing);
        // Whether a general plan unlocks the course is an academy (admin) decision, never the teacher's.
        $clean['planUnlocks']=($existing['planUnlocks']??false)===true;
        if(!academy_teacher_scope_allowed($uid,['type'=>$clean['type'],'stage'=>$clean['stage'],'grade'=>$clean['grade'],'subject'=>$clean['subject']]))academy_v101_fail('scope_not_assigned',403);
        foreach($clean['sections'] as $s)foreach($s['items'] as $it){
            if(empty($it['refId']))continue;$root=['lesson'=>'lessons','quiz'=>'quizzes','file'=>'files'][$it['kind']];$n=academy_read_node($root.'/'.$it['refId']);
            if(!is_array($n)||!academy_teacher_scope_allowed($uid,['type'=>$n['type']??'','stage'=>$n['stage']??'','grade'=>(string)($n['grade']??''),'subject'=>$n['subject']??'']))academy_v101_fail('course_item_out_of_scope',403,['refId'=>$it['refId']]);
        }
        $direct=($perm['publishCourses']??false)===true;$wantDraft=($b['draft']??false)===true;$now=academy_now_ms();
        $id=$existing?$id:academy_v101_id('c');
        if($existing&&($existing['status']??'')==='published'&&!$direct){
            // Live course stays unchanged until an admin approves the revision.
            $course=$existing;unset($course['id']);$course['pendingRevision']=$clean+['submittedAt'=>$now];$course['reviewNote']='';
            $state='revision_pending';
        }else{
            $course=$clean+['teacherId'=>$uid,'createdBy'=>$existing['createdBy']??$uid,'featured'=>false];
            $course['status']=$wantDraft?'draft':($direct?'published':'pending');
            if($course['status']==='published')$course['publishedAt']=$existing['publishedAt']??$now;
            $course['reviewNote']='';unset($course['pendingRevision']);$state=$course['status'];
        }
        academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,$course,$uid);
        academy_audit($uid,'v101.teacher.course.save',$id,['state'=>$state]);
        academy_json(['ok'=>true,'id'=>$id,'state'=>$state]);
    }
    if($route==='/v101/teacher/course/action'&&$method==='POST'){
        $u=academy_v101_require('teacher');$uid=(string)$u['id'];$b=academy_body();$c=academy_v101_get((string)($b['id']??''));$a=(string)($b['action']??'');
        if(!$c||($c['teacherId']??'')!==$uid)academy_v101_fail('course_not_found',404);
        $perm=academy_teacher_permissions($uid);$st=(string)($c['status']??'draft');$id=$c['id'];unset($c['id']);
        if($a==='submit'&&$st==='draft'){$c['status']=($perm['publishCourses']??false)===true?'published':'pending';if($c['status']==='published')$c['publishedAt']=academy_now_ms();}
        elseif($a==='withdraw'&&in_array($st,['pending','rejected'],true))$c['status']='draft';
        elseif($a==='discard-revision'&&is_array($c['pendingRevision']??null))unset($c['pendingRevision']);
        elseif($a==='delete'&&in_array($st,['draft','rejected','pending'],true)){academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,null,$uid);academy_audit($uid,'v101.teacher.course.delete',$id);academy_json(['ok'=>true,'deleted'=>true]);}
        else academy_v101_fail('action_not_allowed',409);
        academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,$c,$uid);academy_audit($uid,'v101.teacher.course.'.$a,$id);academy_json(['ok'=>true,'status'=>$c['status']]);
    }
    if($route==='/v101/teacher/content'&&$method==='GET'){
        // Curriculum items a teacher may attach to a course: only inside their assigned scope.
        $u=academy_v101_require('teacher');academy_json(['ok'=>true]+academy_v101_attachable((string)$u['id']));
    }

    /* ----- admin ----- */
    if(str_starts_with($route,'/v101/admin/')){
        $u=academy_v101_require('admin');$uid=(string)$u['id'];
        if($route==='/v101/admin/courses'&&$method==='GET'){
            $out=[];foreach(academy_v101_all() as $id=>$c){if(!is_array($c))continue;$c['id']=(string)$id;
                $out[]=academy_v101_summary($c,$u,false)+['hasPendingRevision'=>is_array($c['pendingRevision']??null),'reviewNote'=>$c['reviewNote']??'','enrolled'=>academy_v101_count_enrolled((string)$id),'teacherId'=>(string)($c['teacherId']??'')];}
            usort($out,fn($a,$b)=>$b['updatedAt']<=>$a['updatedAt']);
            $teachers=[];foreach((array)academy_read_node('teacherProfiles') as $tid=>$t)if(is_array($t)&&!academy_teacher_is_archived((string)$tid))$teachers[]=['id'=>(string)$tid,'name'=>(string)($t['name']??'معلم')];
            academy_json(['ok'=>true,'courses'=>$out,'settings'=>academy_v101_settings(),'teachers'=>$teachers]);
        }
        if($route==='/v101/admin/course'&&$method==='GET'){
            $c=academy_v101_get((string)($_GET['id']??''));if(!$c)academy_v101_fail('course_not_found',404);academy_json(['ok'=>true,'course'=>$c]);
        }
        if($route==='/v101/admin/content'&&$method==='GET'){academy_json(['ok'=>true]+academy_v101_attachable(null));}
        if($route==='/v101/admin/course/save'&&$method==='POST'){
            $b=academy_body();$id=(string)($b['id']??'');$existing=$id!==''?academy_v101_get($id):null;if($id!==''&&!$existing)academy_v101_fail('course_not_found',404);
            $clean=academy_v101_clean_course($b,$existing);$tid=(string)($b['teacherId']??'');
            if($tid!==''&&!is_array(academy_read_node('teacherProfiles/'.$tid)))academy_v101_fail('teacher_not_found');
            $status=(string)($b['status']??($existing['status']??'draft'));if(!in_array($status,['draft','published','hidden'],true))$status='draft';
            $id=$existing?$id:academy_v101_id('c');$now=academy_now_ms();
            $course=$clean+['teacherId'=>$tid,'createdBy'=>$existing['createdBy']??$uid,'status'=>$status,'reviewNote'=>'','publishedAt'=>$status==='published'?($existing['publishedAt']??$now):($existing['publishedAt']??null)];
            academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,$course,$uid);academy_audit($uid,'v101.admin.course.save',$id,['status'=>$status]);
            academy_json(['ok'=>true,'id'=>$id]);
        }
        if($route==='/v101/admin/course/review'&&$method==='POST'){
            $b=academy_body();$c=academy_v101_get((string)($b['id']??''));if(!$c)academy_v101_fail('course_not_found',404);
            $d=(string)($b['decision']??'');$note=academy_v101_text($b['note']??'',500);$id=$c['id'];unset($c['id']);$now=academy_now_ms();
            if(is_array($c['pendingRevision']??null)){
                if($d==='approve'){$rev=$c['pendingRevision'];unset($rev['submittedAt'],$c['pendingRevision']);$c=array_merge($c,$rev);$c['reviewNote']='';}
                elseif($d==='reject'){unset($c['pendingRevision']);$c['reviewNote']=$note!==''?$note:'رُفض التعديل المقترح.';}
                else academy_v101_fail('decision_invalid');
            }elseif(($c['status']??'')==='pending'){
                if($d==='approve'){$c['status']='published';$c['publishedAt']=$c['publishedAt']??$now;$c['reviewNote']='';}
                elseif($d==='reject'){$c['status']='rejected';$c['reviewNote']=$note!==''?$note:'يحتاج الكورس إلى تعديل قبل النشر.';}
                else academy_v101_fail('decision_invalid');
            }else academy_v101_fail('nothing_to_review',409);
            $c['reviewedAt']=$now;$c['reviewedBy']=$uid;
            academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,$c,$uid);academy_audit($uid,'v101.admin.course.review',$id,['decision'=>$d]);academy_json(['ok'=>true,'status'=>$c['status']]);
        }
        if($route==='/v101/admin/course/status'&&$method==='POST'){
            $b=academy_body();$c=academy_v101_get((string)($b['id']??''));if(!$c)academy_v101_fail('course_not_found',404);
            $s=(string)($b['status']??'');if(!in_array($s,['published','hidden','draft','archived'],true))academy_v101_fail('status_invalid');
            $id=$c['id'];unset($c['id']);$c['status']=$s;if($s==='published')$c['publishedAt']=$c['publishedAt']??academy_now_ms();
            academy_v101_write($pdo,ACADEMY_V101_ROOT.'/'.$id,$c,$uid);
            if(in_array($s,['hidden','draft','archived'],true)){ // keep the featured list consistent
                $set=academy_read_node(ACADEMY_V101_SETTINGS);$set=is_array($set)?$set:[];$f=array_values(array_filter(academy_list_values($set['featured']??[]),fn($x)=>$x!==$id));
                if(count($f)!==count(academy_list_values($set['featured']??[])))academy_v101_write($pdo,ACADEMY_V101_SETTINGS.'/featured',$f?:null,$uid);
            }
            academy_audit($uid,'v101.admin.course.status',$id,['status'=>$s]);academy_json(['ok'=>true]);
        }
        if($route==='/v101/admin/settings'&&$method==='POST'){
            $b=academy_body();$set=academy_read_node(ACADEMY_V101_SETTINGS);$set=is_array($set)?$set:[];
            if(array_key_exists('whatsapp',$b)){$p=academy_v101_phone($b['whatsapp']);if(trim((string)$b['whatsapp'])!==''&&$p==='')academy_v101_fail('whatsapp_invalid');$set['whatsapp']=$p;}
            if(array_key_exists('messageTemplate',$b)){$t=academy_v101_text($b['messageTemplate'],800);$set['messageTemplate']=$t;}
            if(array_key_exists('featured',$b)){
                $ids=[];foreach(academy_list_values($b['featured']) as $fid){$fid=(string)$fid;$c=academy_v101_get($fid);if(!$c||($c['status']??'')!=='published')academy_v101_fail('featured_course_invalid',422,['id'=>$fid]);if(!in_array($fid,$ids,true))$ids[]=$fid;if(count($ids)>12)academy_v101_fail('featured_limit');}
                $set['featured']=$ids;
            }
            academy_v101_write($pdo,ACADEMY_V101_SETTINGS,$set,$uid);academy_audit($uid,'v101.admin.settings');academy_json(['ok'=>true,'settings'=>academy_v101_settings()]);
        }
        if($route==='/v101/admin/codes'&&$method==='GET'){
            $cid=(string)($_GET['courseId']??'');$rows=[];$all=academy_read_node(ACADEMY_V101_CODES);
            if(is_array($all))foreach($all as $key=>$r){if(!is_array($r)||($cid!==''&&($r['courseId']??'')!==$cid))continue;
                $red=[];foreach((is_array($r['redemptions']??null)?$r['redemptions']:[]) as $sid=>$x)$red[]=['studentId'=>(string)$sid,'name'=>(string)($x['name']??''),'at'=>(int)($x['at']??0),'endsAt'=>$x['endsAt']??null];
                $rows[]=['key'=>(string)$key,'courseId'=>$r['courseId']??'','suffix'=>$r['suffix']??'','maxUses'=>(int)($r['maxUses']??1),'uses'=>(int)($r['uses']??0),'accessDays'=>(int)($r['accessDays']??0),'expiresAt'=>$r['expiresAt']??null,'status'=>$r['status']??'active','note'=>$r['note']??'','createdAt'=>(int)($r['createdAt']??0),'redemptions'=>$red];}
            usort($rows,fn($a,$b)=>$b['createdAt']<=>$a['createdAt']);academy_json(['ok'=>true,'codes'=>array_slice($rows,0,500)]);
        }
        if($route==='/v101/admin/codes/create'&&$method==='POST'){
            academy_rate_limit('v101-codes-'.$uid,60,3600);$b=academy_body();$cid=(string)($b['courseId']??'');$c=academy_v101_get($cid);if(!$c)academy_v101_fail('course_not_found',404);
            $count=(int)($b['count']??1);$maxUses=(int)($b['maxUses']??1);$days=(int)($b['accessDays']??0);$until=(int)($b['validUntil']??0);$now=academy_now_ms();
            if($count<1||$count>50)academy_v101_fail('code_count_invalid');if($maxUses<1||$maxUses>500)academy_v101_fail('max_uses_invalid');
            if($days<0||$days>3650)academy_v101_fail('access_days_invalid');if($until!==0&&($until<=$now||$until>$now+3*365*86400000))academy_v101_fail('expiration_invalid');
            $note=academy_v101_text($b['note']??'',120);$codes=[];$locks=academy_acquire_data_locks($pdo,[ACADEMY_V101_CODES]);
            try{$pdo->beginTransaction();for($i=0;$i<$count;$i++){$h=strtoupper(bin2hex(random_bytes(8)));$code='CRS-'.implode('-',str_split($h,4));
                academy_insert_value_raw($pdo,ACADEMY_V101_CODES.'/'.academy_v101_code_key($code),['courseId'=>$cid,'suffix'=>substr($h,-4),'maxUses'=>$maxUses,'uses'=>0,'accessDays'=>$days,'expiresAt'=>$until?:null,'status'=>'active','note'=>$note,'createdAt'=>$now,'createdBy'=>$uid],$uid);$codes[]=$code;}
                $pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($uid,'v101.admin.codes.create',$cid,['count'=>$count,'maxUses'=>$maxUses,'days'=>$days]);academy_json(['ok'=>true,'codes'=>$codes],201);
        }
        if($route==='/v101/admin/codes/disable'&&$method==='POST'){
            $b=academy_body();$key=strtolower((string)($b['key']??''));if(!preg_match('/^[a-f0-9]{64}$/D',$key))academy_v101_fail('code_invalid');
            $path=ACADEMY_V101_CODES.'/'.$key;$locks=academy_acquire_data_locks($pdo,[$path]);
            try{$pdo->beginTransaction();$r=academy_read_node($path);if(!is_array($r)||($r['status']??'')!=='active'){$pdo->rollBack();academy_v101_fail('code_not_active',409);}
                $r['status']='disabled';$r['disabledAt']=academy_now_ms();$r['disabledBy']=$uid;academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$r,$uid);$pdo->commit();}
            catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw$e;}finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($uid,'v101.admin.codes.disable',$key);academy_json(['ok'=>true]);
        }
        if($route==='/v101/admin/enrollments'&&$method==='GET'){
            $cid=(string)($_GET['courseId']??'');if(!academy_v101_get($cid))academy_v101_fail('course_not_found',404);
            $rows=[];$all=academy_read_node(ACADEMY_V101_ENROLL);$names=[];
            if(is_array($all))foreach($all as $sid=>$courses){if(!is_array($courses)||!is_array($courses[$cid]??null))continue;$e=$courses[$cid];$rows[]=['studentId'=>(string)$sid,'status'=>$e['status']??'','source'=>$e['source']??'','grantedAt'=>(int)($e['grantedAt']??0),'endsAt'=>$e['endsAt']??null,'active'=>academy_v101_enrollment((string)$sid,$cid)!==null];$names[]=(string)$sid;}
            if($names){$in=implode(',',array_fill(0,count($names),'?'));$st=$pdo->prepare("SELECT id,display_name,email FROM academy_users WHERE id IN ($in)");$st->execute($names);$map=[];foreach($st->fetchAll() as $r)$map[$r['id']]=$r;
                foreach($rows as &$r){$r['name']=$map[$r['studentId']]['display_name']??'';$r['email']=$map[$r['studentId']]['email']??'';}unset($r);}
            academy_json(['ok'=>true,'enrollments'=>$rows]);
        }
        if($route==='/v101/admin/enrollment'&&$method==='POST'){
            $b=academy_body();$cid=(string)($b['courseId']??'');$sid=(string)($b['studentId']??'');$a=(string)($b['action']??'');
            if(!academy_v101_get($cid))academy_v101_fail('course_not_found',404);
            $st=$pdo->prepare("SELECT id FROM academy_users WHERE (id=? OR email=?) AND primary_role='student' LIMIT 1");$st->execute([$sid,strtolower(trim($sid))]);$sid=(string)$st->fetchColumn();if($sid==='')academy_v101_fail('student_not_found',404);
            $path=ACADEMY_V101_ENROLL.'/'.$sid.'/'.$cid;
            if($a==='grant'){$days=(int)($b['accessDays']??0);if($days<0||$days>3650)academy_v101_fail('access_days_invalid');
                $locks=academy_acquire_data_locks($pdo,[$path]);try{$pdo->beginTransaction();$e=academy_v101_grant($pdo,$sid,$cid,$days,'admin',$uid);academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$e,$uid);$pdo->commit();}catch(Throwable $x){if($pdo->inTransaction())$pdo->rollBack();throw$x;}finally{academy_release_data_locks($pdo,$locks);}}
            elseif($a==='revoke'){$e=academy_read_node($path);if(!is_array($e))academy_v101_fail('enrollment_not_found',404);$e['status']='revoked';$e['revokedAt']=academy_now_ms();$e['revokedBy']=$uid;academy_v101_write($pdo,$path,$e,$uid);}
            else academy_v101_fail('action_invalid');
            academy_audit($uid,'v101.admin.enrollment.'.$a,$cid,['studentId'=>$sid]);academy_json(['ok'=>true,'studentId'=>$sid]);
        }
    }
    academy_v101_fail('not_found',404);
}
function academy_v101_count_enrolled(string $courseId): int {
    static $all=null;$all??=academy_read_node(ACADEMY_V101_ENROLL);$n=0;
    if(is_array($all))foreach($all as $sid=>$rows)if(is_array($rows)&&($rows[$courseId]['status']??'')==='active')$n++;
    return$n;
}
/** Curriculum content that can be attached to a course (teacher: assigned scope only). */
function academy_v101_attachable(?string $teacherId): array {
    $out=['lessons'=>[],'quizzes'=>[],'files'=>[]];
    foreach(['lessons'=>'lessons','quizzes'=>'quizzes','files'=>'files'] as $key=>$root){
        $all=academy_read_node($root);if(!is_array($all))continue;
        foreach($all as $id=>$n){
            if(!is_array($n)||!empty($n['isHidden']))continue;
            $scope=['type'=>$n['type']??'','stage'=>$n['stage']??'','grade'=>(string)($n['grade']??''),'subject'=>$n['subject']??''];
            if($teacherId!==null&&!academy_teacher_scope_allowed($teacherId,$scope))continue;
            $out[$key][]=['id'=>(string)$id,'title'=>(string)($n['title']??$n['name']??$id)]+$scope+['unit'=>$n['unit']??null,'order'=>$n['order']??null];
            if(count($out[$key])>=1500)break;
        }
    }
    return$out;
}
