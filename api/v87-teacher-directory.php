<?php
declare(strict_types=1);
/** V87 — Verified teacher profiles and booking preferences; manual approval only. */
class AcademyV87Error extends RuntimeException {
    public function __construct(string $message, public int $status=422) {parent::__construct($message);}
}
function academy_v87_assert(bool $test,string $error,int $status=422): void {if(!$test)throw new AcademyV87Error($error,$status);}
function academy_v87_clean(mixed $v,int $max): string {
    academy_v87_assert(is_string($v),'invalid_text');
    $s=trim(preg_replace('/[\x00-\x1F\x7F]/u',' ', $v)??'');
    return mb_substr($s,0,$max);
}
function academy_v87_video(mixed $v): string {
    $url=academy_v87_clean($v,450);
    if($url==='')return '';
    $p=parse_url($url);
    academy_v87_assert(is_array($p)&&strtolower((string)($p['scheme']??''))==='https'&&!isset($p['user'])&&!isset($p['pass'])&&!isset($p['port']),'invalid_video_url');
    $host=strtolower((string)($p['host']??''));
    academy_v87_assert(in_array($host,['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'],true),'invalid_video_host');
    return $url;
}
function academy_v87_teacher_id(mixed $id): string {
    $id=(string)$id;
    academy_v87_assert($id!==''&&strlen($id)<150&&preg_match('/^[a-zA-Z0-9_-]+$/D',$id)===1,'invalid_teacher_id');
    return $id;
}
function academy_v87_scopes(string $id,?array $profile=null): array {
    $scopes=[];
    $assignments=$profile===null?academy_teacher_assignments($id):academy_list_values($profile['assignments']??$profile['subjects']??[]);
    foreach($assignments as $s){
        if(!is_array($s)||empty($s['subject']))continue;
        $v=['type'=>(string)($s['type']??'public'),'stage'=>(string)($s['stage']??''),'grade'=>(string)($s['grade']??''),'subject'=>(string)($s['subject']??''),'subjectName'=>(string)($s['subjectName']??$s['subject']??'')];
        if(!in_array($v['type'],['public','azhar'],true)||!in_array($v['stage'],['primary','prep','sec'],true)||!preg_match('/^[1-6]$/',$v['grade']))continue;
        $scopes[implode('|',array_slice(array_values($v),0,4))]=$v;
        if(count($scopes)>=25)break;
    }
    return array_values($scopes);
}
function academy_v87_published(string $id): ?array {
    if(!academy_teacher_is_active_profile($id))return null;
    $p=academy_read_node('settings/publicTeachers/'.$id);
    if(!is_array($p)||($p['active']??true)===false||trim((string)($p['name']??''))==='')return null;
    return $p;
}
function academy_v87_compose(string $id,array $teacher,array $p,array $card): ?array {
    if(($teacher['isActive']??true)===false||($teacher['isArchived']??false)===true||($teacher['accountState']??'')==='archived')return null;
    if(($p['active']??true)===false||trim((string)($p['name']??''))==='')return null;
    if(($card['approved']??false)!==true||($card['listed']??false)!==true)return null;
    $scopes=academy_v87_scopes($id,$teacher);if(!$scopes)return null;
    $safe=[];foreach(['name','title','bio','photoUrl','coverUrl','qualifications','experience','teachingStyle'] as $key){
        $safe[$key]=mb_substr((string)($p[$key]??''),0,$key==='bio'?1200:($key==='photoUrl'||$key==='coverUrl'?500:200));
    }
    $safe['id']=$id;$safe['introUrl']=(string)($card['introUrl']??'');
    $safe['availabilityNote']=(string)($card['availabilityNote']??'');
    $safe['format']=(string)($card['format']??'both');
    $safe['bookingOpen']=($card['bookingOpen']??false)===true;
    $safe['scopes']=$scopes;
    return $safe;
}
function academy_v87_directory_item(string $id): ?array {
    $teacher=academy_read_node('teacherProfiles/'.$id);
    $published=academy_read_node('settings/publicTeachers/'.$id);
    $card=academy_read_node('v87TeacherCards/'.$id);
    return is_array($teacher)&&is_array($published)&&is_array($card)?academy_v87_compose($id,$teacher,$published,$card):null;
}
function academy_v87_impl(string $route,string $method,PDO $pdo): void {
    $user=academy_current_user(true);$role=(string)($user['primary_role']??'guest');$uid=(string)($user['id']??'guest');
    academy_rate_limit('v87-'.($role==='guest'?'guest':$uid),120,3600);
    if($route==='/v87/directory'&&$method==='GET'){
        academy_v87_assert($role==='student','forbidden',403);
        $student=academy_read_node('studentProfilesV3/'.$uid);
        academy_v87_assert(is_array($student),'student_profile_missing',422);
        $st=(string)($student['educationType']??'');$ss=(string)($student['stage']??'');$sg=(string)($student['grade']??'');
        $q=$pdo->query("SELECT id FROM academy_users WHERE primary_role='teacher' AND status='active' ORDER BY id LIMIT 180");
        $teachers=academy_read_node('teacherProfiles');$published=academy_read_node('settings/publicTeachers');$cards=academy_read_node('v87TeacherCards');
        $teachers=is_array($teachers)?$teachers:[];$published=is_array($published)?$published:[];$cards=is_array($cards)?$cards:[];
        $items=[];
        foreach($q->fetchAll(PDO::FETCH_COLUMN) as $tid){$tid=(string)$tid;
            $tp=$teachers[$tid]??null;$pp=$published[$tid]??null;$cc=$cards[$tid]??null;
            if(!is_array($tp)||!is_array($pp)||!is_array($cc))continue;
            $row=academy_v87_compose($tid,$tp,$pp,$cc);if($row===null)continue;
            $row['scopes']=array_values(array_filter($row['scopes'],static fn($scope)=>$scope['type']===$st&&$scope['stage']===$ss&&$scope['grade']===$sg));
            if($row['scopes'])$items[]=$row;}
        academy_json(['ok'=>true,'items'=>$items,'limited'=>count($items)>=180]);
    }
    academy_v87_assert(in_array($role,['admin','teacher'],true),'forbidden',403);
    if($role==='teacher')academy_v87_assert(academy_teacher_is_active_profile($uid),'teacher_inactive',403);
    if($route==='/v87/teacher/my-card'&&$method==='GET'){
        academy_v87_assert($role==='teacher','forbidden',403);
        $pub=academy_v87_published($uid);
        academy_json(['ok'=>true,'publishedProfile'=>$pub!==null,'approved'=>$pub?array_intersect_key($pub,array_flip(['name','title','photoUrl','bio'])):null,'draft'=>academy_read_node('v87TeacherDrafts/'.$uid),'card'=>academy_read_node('v87TeacherCards/'.$uid),'scopes'=>academy_v87_scopes($uid)]);
    }
    if($route==='/v87/teacher/submit'&&$method==='POST'){
        academy_v87_assert($role==='teacher','forbidden',403);
        academy_rate_limit('v87-submit-'.$uid,8,86400);
        $b=academy_body();academy_v87_assert(is_array($b),'invalid_request');
        $format=(string)($b['format']??'');academy_v87_assert(in_array($format,['private','group','both'],true),'invalid_format');
        $draft=['format'=>$format,'availabilityNote'=>academy_v87_clean($b['availabilityNote']??'',240),'introUrl'=>academy_v87_video($b['introUrl']??''),'status'=>'pending','submittedAt'=>academy_now_ms()];
        academy_v87_assert(count(academy_v87_scopes($uid))>0,'no_assigned_scopes');
        academy_write_node('v87TeacherDrafts/'.$uid,$draft,$uid);
        academy_audit($uid,'v87.card.submit',$uid);
        academy_json(['ok'=>true,'pending'=>true]);
    }
    if($role==='admin'&&$route==='/v87/admin/list'&&$method==='GET'){
        $q=$pdo->query("SELECT id,display_name,status FROM academy_users WHERE primary_role='teacher' ORDER BY display_name LIMIT 160");$items=[];
        foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){$id=(string)$r['id'];$p=academy_v87_published($id);$draft=academy_read_node('v87TeacherDrafts/'.$id);$card=academy_read_node('v87TeacherCards/'.$id);
            $items[]=['id'=>$id,'name'=>(string)($p['name']??$r['display_name']),'publishedProfile'=>$p!==null,'accountActive'=>$r['status']==='active'&&academy_teacher_is_active_profile($id),'scopes'=>academy_v87_scopes($id),'draft'=>is_array($draft)?$draft:null,'card'=>is_array($card)?$card:null];
        }
        academy_json(['ok'=>true,'items'=>$items,'limited'=>count($items)>=160]);
    }
    if($role==='admin'&&$route==='/v87/admin/action'&&$method==='POST'){
        $b=academy_body();$id=academy_v87_teacher_id($b['teacherId']??'');$action=(string)($b['action']??'');
        academy_rate_limit('v87-admin-'.$uid,60,3600);
        academy_v87_assert(in_array($action,['approve','reject','toggle_listing','toggle_booking'],true),'invalid_action');
        $path='v87TeacherCards/'.$id;$card=academy_read_node($path);if(!is_array($card))$card=[];
        if(in_array($action,['approve','reject'],true)){
            $draft=academy_read_node('v87TeacherDrafts/'.$id);academy_v87_assert(is_array($draft)&&($draft['status']??'')==='pending','no_pending_draft',409);
            if($action==='approve'){
                academy_v87_assert(academy_v87_published($id)!==null&&count(academy_v87_scopes($id))>0,'teacher_profile_not_published',409);
                $card=['approved'=>true,'listed'=>($card['approved']??false)?($card['listed']??false):true,'bookingOpen'=>($card['approved']??false)?($card['bookingOpen']??false):true,'format'=>$draft['format'],'availabilityNote'=>$draft['availabilityNote'],'introUrl'=>$draft['introUrl'],'approvedAt'=>academy_now_ms(),'approvedBy'=>$uid];
                academy_write_node($path,$card,$uid);
            }
            academy_write_node('v87TeacherDrafts/'.$id.'/status',$action==='approve'?'approved':'rejected',$uid);
            academy_write_node('v87TeacherDrafts/'.$id.'/reviewedAt',academy_now_ms(),$uid);
        }else{
            academy_v87_assert(($card['approved']??false)===true,'card_not_approved',409);
            if($action==='toggle_listing'){
                if(($card['listed']??false)!==true)academy_v87_assert(academy_v87_published($id)!==null,'teacher_profile_not_published',409);
                $card['listed']=!($card['listed']??false);
            }else{$card['bookingOpen']=!($card['bookingOpen']??false);}
            $card['updatedAt']=academy_now_ms();academy_write_node($path,$card,$uid);
        }
        academy_audit($uid,'v87.card.'.$action,$id);
        academy_json(['ok'=>true,'action'=>$action]);
    }
    throw new AcademyV87Error('not_found',404);
}
function academy_v87_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v87/'))return;
    try{academy_v87_impl($route,$method,$pdo);}catch(AcademyV87Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->status);}
}
