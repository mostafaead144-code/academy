<?php
declare(strict_types=1);
/** EGTAZ V84 - teacher matching and MANUAL financial settlement only.
 * No payment gateway, no automatic money movement, no new SQL tables.
 */
final class AcademyV84Error extends RuntimeException {
    public function __construct(string $message, public int $httpStatus=422) { parent::__construct($message); }
}
function academy_v84_check(bool $ok,string $code,int $http=422): void {
    if(!$ok)throw new AcademyV84Error($code,$http);
}
function academy_v84_id(mixed $v): string {
    $s=strtolower(trim((string)$v)); academy_v84_check((bool)preg_match('/^[a-f0-9]{24}$/D',$s),'invalid_request_id');return $s;
}
function academy_v84_role(): array {
    $u=academy_current_user(true);$role=(string)($u['primary_role']??'');
    academy_v84_check(in_array($role,['student','teacher','admin'],true),'forbidden',403);
    if($role==='teacher')academy_v84_check(academy_teacher_is_active_profile((string)$u['id']),'teacher_unavailable',403);
    if($role==='student')academy_v84_check(!academy_v50_force_reset_required((string)$u['id']),'password_change_required',403);
    return $u;
}
function academy_v84_clean(mixed $v,int $limit): string {
    $s=trim((string)$v);$s=preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$s);return mb_substr($s,0,$limit);
}
function academy_v84_money(mixed $v): int {
    academy_v84_check(is_string($v)||is_int($v)||is_float($v),'invalid_price');
    $s=trim((string)$v);
    academy_v84_check((bool)preg_match('/^(?:[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/D',$s),'invalid_price');
    $parts=explode('.',$s);$pi=(int)$parts[0]*100+(int)str_pad($parts[1]??'0',2,'0');
    academy_v84_check($pi>=1000&&$pi<=5000000,'invalid_price');return $pi;
}
function academy_v84_commission(int $price,int $percent): int {return intdiv($price*$percent+50,100);}
function academy_v84_record(string $id): array {
    $r=academy_read_node('v84Requests/'.$id);
    academy_v84_check(is_array($r)&&($r['id']??'')===$id,'request_not_found',404);return $r;
}
function academy_v84_public(array $r,string $role): array {
    $keys=['id','status','createdAt','updatedAt','type','stage','grade','subject','format','timePreference','notes','teacherName','teacherId','pricePiasters','commissionPercent','teacherDuePiasters','offerNote','preferredTeacherName','paymentConfirmedAt','fulfilledAt','settledAt','v85Stage'];
    if($role==='student')$keys=array_values(array_diff($keys,['teacherId','commissionPercent','teacherDuePiasters','paymentConfirmedAt','settledAt']));
    if($role==='student'&&!in_array((string)($r['status']??''),['quoted','accepted','paid','fulfilled','settled'],true))$keys=array_values(array_diff($keys,['pricePiasters','offerNote','teacherName']));
    $out=array_intersect_key($r,array_flip($keys));
    if($role==='admin'){
        foreach(['studentId','studentName','contactPhone','paymentReference','payoutReference','teacherReply','preferredTeacherId','events'] as $k)if(isset($r[$k]))$out[$k]=$r[$k];
    }
    if($role==='teacher'){
        unset($out['notes']);
        // Do not expose student identity, phone, payment reference, or admin notes before an enrollment relationship exists.
        unset($out['teacherDuePiasters']);
        $out['teacherDuePiasters']=isset($r['teacherDuePiasters'])?(int)$r['teacherDuePiasters']:null;
    }
    return $out;
}
function academy_v84_state_action(array &$r,string $action,array $body,array $u,PDO $pdo): void {
    $status=(string)($r['status']??'');$role=(string)$u['primary_role'];$uid=(string)$u['id'];
    if($role==='admin'&&in_array($action,['fulfill','settle'],true)&&is_array(academy_read_node('v85Plans/'.(string)$r['id'])))academy_v84_check(false,'managed_in_v85',409);
    if($role==='student'){
        academy_v84_check(($r['studentId']??'')===$uid,'forbidden',403);
        if($action==='accept')academy_v84_check($status==='quoted','invalid_transition',409);
        elseif($action==='cancel')academy_v84_check(in_array($status,['new','offered','teacher_accepted','quoted'],true),'cannot_cancel_after_payment',409);
        else academy_v84_check(false,'forbidden',403);
        $r['status']=$action==='accept'?'accepted':'cancelled';
    }elseif($role==='teacher'){
        academy_v84_check(($r['teacherId']??'')===$uid,'forbidden',403);
        academy_v84_check($status==='offered'&&in_array($action,['teacher_accept','teacher_reject'],true),'invalid_transition',409);
        if($action==='teacher_accept'){$r['status']='teacher_accepted';$r['teacherReply']='accepted';}
        else {$r['status']='new';$r['teacherReply']='rejected';$r['teacherId']='';$r['teacherName']='';$r['pricePiasters']=null;$r['commissionPercent']=null;$r['teacherDuePiasters']=null;}
    }else{
        academy_v84_check($role==='admin','forbidden',403);
        if($action==='offer'){
            academy_v84_check($status==='new','invalid_transition',409);
             $tid=strtolower(trim((string)($body['teacherId']??'')));academy_v84_check((bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D',$tid),'invalid_teacher_id');
            $q=$pdo->prepare("SELECT display_name FROM academy_users WHERE id=? AND primary_role='teacher' AND status='active' LIMIT 1");$q->execute([$tid]);$name=$q->fetchColumn();
            academy_v84_check(is_string($name)&&academy_teacher_is_active_profile($tid),'teacher_unavailable',422);
            $scope=['type'=>$r['type'],'stage'=>$r['stage'],'grade'=>$r['grade'],'subject'=>$r['subject']];
            academy_v84_check(academy_teacher_scope_allowed($tid,$scope),'teacher_scope_mismatch',422);
            $price=academy_v84_money($body['price']??'');$percent=filter_var($body['commissionPercent']??null,FILTER_VALIDATE_INT);
            academy_v84_check($percent!==false&&$percent>=0&&$percent<=40,'invalid_commission');
            $r['teacherId']=$tid;$r['teacherName']=academy_v84_clean($name,120);
            $r['pricePiasters']=$price;$r['commissionPercent']=$percent;
            $r['teacherDuePiasters']=$price-academy_v84_commission($price,$percent);
            $r['offerNote']=academy_v84_clean($body['offerNote']??'',500);
            $r['status']='offered';
        }elseif($action==='publish_quote'){
            academy_v84_check($status==='teacher_accepted','teacher_approval_required',409);$r['status']='quoted';
        }elseif($action==='confirm_payment'){
            academy_v84_check($status==='accepted','student_acceptance_required',409);
            $ref=academy_v84_clean($body['reference']??'',100);
            academy_v84_check(mb_strlen($ref)>=4,'payment_reference_required');
            // This is an admin attestation AFTER independent verification, NOT an online payment request.
            academy_v84_check(($body['verified']??false)===true,'payment_not_verified');
            $r['paymentReference']=$ref;$r['paymentConfirmedAt']=academy_now_ms();$r['status']='paid';
        }elseif($action==='fulfill'){
            academy_v84_check($status==='paid','payment_required',409);
            academy_v84_check(($body['delivered']??false)===true,'service_not_confirmed');
            $r['fulfilledAt']=academy_now_ms();$r['status']='fulfilled';
        }elseif($action==='settle'){
            academy_v84_check($status==='fulfilled','service_not_fulfilled',409);
            $ref=academy_v84_clean($body['reference']??'',100);
            academy_v84_check(mb_strlen($ref)>=4&&($body['verified']??false)===true,'payout_proof_required');
            $r['payoutReference']=$ref;$r['settledAt']=academy_now_ms();$r['status']='settled';
        }elseif($action==='cancel'){
            academy_v84_check(in_array($status,['new','offered','teacher_accepted','quoted','accepted'],true),'cannot_cancel_after_payment',409);
            $r['status']='cancelled';
        }else academy_v84_check(false,'invalid_action');
    }
    $r['updatedAt']=academy_now_ms();
    $ev=['action'=>$action,'actorRole'=>$role,'actorId'=>$uid,'at'=>$r['updatedAt']];
    $r['events']=array_slice(array_merge(is_array($r['events']??null)?$r['events']:[],[$ev]),-32);
}
function academy_v84_mutate(PDO $pdo,string $id,string $action,array $body,array $u): array {
    $lockPaths=['v84Requests/'.$id,'v84TeacherIndex','v84StudentIndex'];
    if($action==='confirm_payment')$lockPaths[]='v91PaymentRefs';
    $locks=academy_acquire_data_locks($pdo,$lockPaths);
    try{
        $pdo->beginTransaction();
        try{
            $r=academy_v84_record($id);$oldTeacher=(string)($r['teacherId']??'');
            academy_v84_state_action($r,$action,$body,$u,$pdo);$newTeacher=(string)($r['teacherId']??'');
            if($action==='confirm_payment')academy_v91_assert_unique_payment($pdo,$id,(string)$r['paymentReference']);
            academy_delete_node_raw($pdo,'v84Requests/'.$id);
            academy_insert_value_raw($pdo,'v84Requests/'.$id,$r,(string)$u['id']);
            if($oldTeacher!==''&&$oldTeacher!==$newTeacher)academy_delete_node_raw($pdo,'v84TeacherIndex/'.$oldTeacher.'/'.$id);
            if($newTeacher!==''&&$newTeacher!==$oldTeacher)academy_insert_value_raw($pdo,'v84TeacherIndex/'.$newTeacher.'/'.$id,$r['createdAt'],(string)$u['id']);
            if($action==='confirm_payment')academy_insert_value_raw($pdo,'v91PaymentRefs/'.academy_v91_payment_key((string)$r['paymentReference']),$id,(string)$u['id']);
            $pdo->commit();
            return $r;
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v84_list_ids(PDO $pdo,string $role,string $uid): array {
    if($role==='admin'){
        $q=$pdo->query("SELECT path FROM academy_data WHERE path LIKE 'v84Requests/%/updatedAt' ORDER BY updated_at DESC LIMIT 120");
        $ids=[];foreach($q->fetchAll(PDO::FETCH_COLUMN) as $path){if(preg_match('~^v84Requests/([a-f0-9]{24})/updatedAt$~D',(string)$path,$m))$ids[$m[1]]=true;}
        return array_keys($ids);
    }
    $raw=academy_read_node(($role==='student'?'v84StudentIndex':'v84TeacherIndex').'/'.$uid);
    if(!is_array($raw))return [];
    arsort($raw,SORT_NUMERIC);return array_slice(array_keys($raw),0,80);
}
function academy_v84_impl(string $route,string $method,PDO $pdo): void {
    $u=academy_v84_role();$uid=(string)$u['id'];$role=(string)$u['primary_role'];
    academy_rate_limit('v84-read-'.$uid,160,3600);
    if($method==='GET'&&$route==='/v84/list'){
        $ids=academy_v84_list_ids($pdo,$role,$uid);$rows=[];
        foreach($ids as $id){if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;$r=academy_read_node('v84Requests/'.$id);if(!is_array($r))continue;
            if($role==='student'&&($r['studentId']??'')!==$uid)continue;
            if($role==='teacher'&&($r['teacherId']??'')!==$uid)continue;
            $rows[]=academy_v84_public($r,$role);
        }
        usort($rows,static fn($a,$b)=>(int)$b['updatedAt']<=>(int)$a['updatedAt']);
        academy_json(['ok'=>true,'items'=>array_slice($rows,0,60),'truncated'=>count($ids)>=($role==='admin'?120:80),'manualPaymentsOnly'=>true]);
    }
    if($method==='GET'&&$route==='/v84/admin/teachers'){
        academy_v84_check($role==='admin','forbidden',403);
        $q=$pdo->query("SELECT id,display_name FROM academy_users WHERE primary_role='teacher' AND status='active' ORDER BY display_name LIMIT 160");$rows=[];
        foreach($q->fetchAll(PDO::FETCH_ASSOC) as $t){$id=(string)$t['id'];if(!academy_teacher_is_active_profile($id))continue;
            foreach(array_slice(academy_teacher_assignments($id),0,30) as $s){if(!is_array($s)||empty($s['subject']))continue;
                $rows[]=['id'=>$id,'name'=>$t['display_name'],'scope'=>array_intersect_key($s,array_flip(['type','stage','grade','subject']))];
                if(count($rows)>=240)break 2;
            }
        }
        academy_json(['ok'=>true,'teachers'=>$rows,'limited'=>count($rows)>=240]);
    }
    if($method==='POST'&&$route==='/v84/student/create'){
        academy_v84_check($role==='student','forbidden',403);
        academy_rate_limit('v84-create-'.$uid,5,86400);
        $profile=academy_read_node('studentProfilesV3/'.$uid);academy_v84_check(is_array($profile),'student_profile_missing',422);
        $type=(string)($profile['educationType']??$profile['type']??'');$stage=(string)($profile['stage']??'');$grade=(string)($profile['grade']??'');
        academy_v84_check(in_array($type,['public','azhar'],true)&&isset(['primary'=>6,'prep'=>3,'sec'=>3][$stage])&&preg_match('/^[1-6]$/D',$grade)===1&&(int)$grade<=['primary'=>6,'prep'=>3,'sec'=>3][$stage],'profile_scope_missing');
        $b=academy_body();$subject=academy_v84_clean($b['subject']??'',80);$format=(string)($b['format']??'private');
        academy_v84_check(mb_strlen($subject)>=2&&preg_match('/^[\p{L}\p{N} _-]+$/uD',$subject)===1,'invalid_subject');
        academy_v84_check(in_array($format,['private','group'],true),'invalid_format');
        $phone=preg_replace('/[\s\-+()]/','',(string)($b['contactPhone']??''));
        academy_v84_check((bool)preg_match('/^[0-9]{10,15}$/D',$phone),'invalid_contact_phone');
        academy_v84_check(($b['contactConsent']??false)===true,'contact_consent_required');
        $ids=academy_v84_list_ids($pdo,'student',$uid);$open=0;
        foreach($ids as $rid){if(!preg_match('/^[a-f0-9]{24}$/D',(string)$rid))continue;$r=academy_read_node('v84Requests/'.$rid);if(is_array($r)&&in_array((string)($r['status']??''),['new','offered','teacher_accepted','quoted','accepted'],true))$open++;}
        academy_v84_check($open<3,'too_many_active_requests',429);
        $preferredId=trim((string)($b['preferredTeacherId']??''));$preferredName='';
        if($preferredId!==''){
            $preferredId=academy_v87_teacher_id($preferredId);
            $preferred=academy_v87_directory_item($preferredId);
            academy_v84_check(is_array($preferred)&&$preferred['bookingOpen']===true,'preferred_teacher_unavailable',422);
            academy_v84_check(in_array((string)($preferred['format']??''),['both',$format],true),'preferred_teacher_format_mismatch',422);
            $scoped=false;
            foreach($preferred['scopes'] as $scope)if($scope['type']===$type&&$scope['stage']===$stage&&(string)$scope['grade']===$grade&&(string)$scope['subject']===$subject){$scoped=true;break;}
            academy_v84_check($scoped,'preferred_teacher_scope_mismatch',422);
            $preferredName=academy_v84_clean((string)$preferred['name'],120);
        }
        $id=bin2hex(random_bytes(12));$now=academy_now_ms();
        $r=['id'=>$id,'studentId'=>$uid,'studentName'=>academy_v84_clean($profile['name']??$u['display_name']??'طالب',110),
            'contactPhone'=>$phone,'type'=>$type,'stage'=>$stage,'grade'=>$grade,'subject'=>$subject,'format'=>$format,
            'timePreference'=>academy_v84_clean($b['timePreference']??'',160),'notes'=>academy_v84_clean($b['notes']??'',600),
            'status'=>'new','preferredTeacherId'=>$preferredId,'preferredTeacherName'=>$preferredName,'teacherId'=>'','teacherName'=>'','pricePiasters'=>null,'commissionPercent'=>null,
            'teacherDuePiasters'=>null,'createdAt'=>$now,'updatedAt'=>$now,
            'events'=>[['action'=>'create','actorRole'=>'student','actorId'=>$uid,'at'=>$now]]];
        $locks=academy_acquire_data_locks($pdo,['v84Requests','v84StudentIndex']);
        try{$pdo->beginTransaction();try{
            academy_insert_value_raw($pdo,'v84Requests/'.$id,$r,$uid);
            academy_insert_value_raw($pdo,'v84StudentIndex/'.$uid.'/'.$id,$now,$uid);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($uid,'v84.student_request_created',$id);academy_json(['ok'=>true,'request'=>academy_v84_public($r,'student')],201);
    }
    if($method==='POST'&&in_array($route,['/v84/student/action','/v84/teacher/action','/v84/admin/action'],true)){
        $expected=explode('/',$route)[2];academy_v84_check($role===$expected,'forbidden',403);
        academy_rate_limit('v84-write-'.$uid,60,3600);
        $b=academy_body();$id=academy_v84_id($b['id']??'');$action=(string)($b['action']??'');
        $r=academy_v84_mutate($pdo,$id,$action,$b,$u);
        academy_audit($uid,'v84.'.$action,$id,['status'=>$r['status']]);
        academy_json(['ok'=>true,'request'=>academy_v84_public($r,$role)]);
    }
    academy_v84_check(false,'not_found',404);
}
function academy_v84_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v84/'))return;
    try{academy_v84_impl($route,$method,$pdo);}
    catch(AcademyV84Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->httpStatus);}
}
