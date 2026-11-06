<?php
declare(strict_types=1);
/* V46 subscription activation and achievement badges. Uses existing academy_data, no SQL migration. */
function academy_v46_require_role(string $wanted): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!==$wanted)academy_json(['ok'=>false,'error'=>'forbidden'],403);
    return $u;
}
function academy_v46_code_key(string $code): string {return hash('sha256',$code);}
function academy_v46_code_valid(string $code): bool {return (bool)preg_match('/^EGT-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/D',$code);}
function academy_v46_plan_for_student(string $planId,array $profile): array {
    $plan=academy_read_node('subscriptionPlansV1/'.$planId);
    if(!is_array($plan)||($plan['isActive']??true)===false)academy_json(['ok'=>false,'error'=>'plan_unavailable'],422);
    foreach(['targetType'=>'educationType','targetStage'=>'stage','targetGrade'=>'grade'] as $p=>$s) {
        if(!empty($plan[$p])&&(string)$plan[$p] !== (string)($profile[$s]??''))academy_json(['ok'=>false,'error'=>'plan_scope_mismatch'],422);
    }
    return $plan;
}
function academy_v46_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v46/'))return;
    if($route==='/v46/admin/plans'&&$method==='GET'){
        academy_v46_require_role('admin');$items=academy_read_node('subscriptionPlansV1');$plans=[];
        foreach(is_array($items)?$items:[] as $id=>$p)if(is_array($p))$plans[]=['id'=>(string)$id,'name'=>(string)($p['name']??$id),'isActive'=>($p['isActive']??true)!==false,'durationDays'=>(int)($p['durationDays']??30)];
        academy_json(['ok'=>true,'plans'=>$plans]);
    }
    if($route==='/v46/admin/codes'&&$method==='GET'){
        academy_v46_require_role('admin');$raw=academy_read_node('v46ActivationCodes');$result=[];
        if(is_array($raw))foreach($raw as $key=>$r)if(is_array($r))$result[]=['key'=>$key,'suffix'=>$r['suffix']??'','planName'=>$r['planName']??'','days'=>(int)($r['days']??30),'status'=>$r['status']??'active','createdAt'=>$r['createdAt']??0,'expiresAt'=>$r['expiresAt']??null,'redeemedAt'=>$r['redeemedAt']??null];
        usort($result,fn($a,$b)=>($b['createdAt']??0)<=>($a['createdAt']??0));academy_json(['ok'=>true,'codes'=>array_slice($result,0,200)]);
    }
    if($route==='/v46/admin/codes/create'&&$method==='POST'){
        $u=academy_v46_require_role('admin');academy_rate_limit('v46-generate-'.$u['id'],100,3600);
        $b=academy_body();$planId=(string)($b['planId']??'');if(!preg_match('/^[A-Za-z0-9_-]{1,80}$/D',$planId))academy_json(['ok'=>false,'error'=>'plan_invalid'],422);
        $plan=academy_read_node('subscriptionPlansV1/'.$planId);if(!is_array($plan)||($plan['isActive']??true)===false)academy_json(['ok'=>false,'error'=>'plan_unavailable'],422);
        $count=(int)($b['count']??1);if($count<1||$count>30)academy_json(['ok'=>false,'error'=>'code_count_invalid'],422);
        $days=(int)($b['days']??$plan['durationDays']??30);if($days<1||$days>3650)academy_json(['ok'=>false,'error'=>'duration_invalid'],422);
        $validUntil=(int)($b['validUntil']??0);$now=academy_now_ms();if($validUntil!==0&&($validUntil<=$now||$validUntil>$now+3*365*86400000))academy_json(['ok'=>false,'error'=>'expiration_invalid'],422);
        $codes=[];$root='v46ActivationCodes';$locks=academy_acquire_data_locks($pdo,[$root]);
        try{$pdo->beginTransaction();for($i=0;$i<$count;$i++){
            $h=strtoupper(bin2hex(random_bytes(12)));$code='EGT-'.implode('-',str_split($h,6));$key=academy_v46_code_key($code);
            $record=['suffix'=>substr($h,-6),'planId'=>$planId,'planName'=>(string)($plan['name']??$planId),'days'=>$days,'status'=>'active','createdAt'=>$now,'createdBy'=>$u['id'],'expiresAt'=>$validUntil?:null];
            academy_insert_value_raw($pdo,$root.'/'.$key,$record,$u['id']);$codes[]=$code;
        }$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($u['id'],'v46.codes.create',null,['planId'=>$planId,'count'=>$count,'days'=>$days]);academy_json(['ok'=>true,'codes'=>$codes,'count'=>$count],201);
    }
    if($route==='/v46/admin/codes/disable'&&$method==='POST'){
        $u=academy_v46_require_role('admin');$b=academy_body();$key=strtolower((string)($b['key']??''));if(!preg_match('/^[a-f0-9]{64}$/D',$key))academy_json(['ok'=>false,'error'=>'code_invalid'],422);
        $root='v46ActivationCodes/'.$key;$locks=academy_acquire_data_locks($pdo,[$root]);
        try{$pdo->beginTransaction();$code=academy_read_node($root);if(!is_array($code)||($code['status']??'')!=='active'){ $pdo->rollBack();academy_json(['ok'=>false,'error'=>'code_not_active'],409);}
            $code['status']='disabled';$code['disabledAt']=academy_now_ms();$code['disabledBy']=$u['id'];academy_delete_node_raw($pdo,$root);academy_insert_value_raw($pdo,$root,$code,$u['id']);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($u['id'],'v46.codes.disable',$key);academy_json(['ok'=>true]);
    }
    if($route==='/v46/student/redeem'&&$method==='POST'){
        $u=academy_v46_require_role('student');academy_rate_limit('v46-redeem-'.$u['id'],12,3600);
        $b=academy_body();$code=strtoupper(trim((string)($b['code']??'')));if(!academy_v46_code_valid($code))academy_json(['ok'=>false,'error'=>'code_invalid'],422);
        $key=academy_v46_code_key($code);$root='v46ActivationCodes/'.$key;$subRoot='studentSubscriptionsV1/'.$u['id'];
        $locks=academy_acquire_data_locks($pdo,[$root,$subRoot]);
        try{$pdo->beginTransaction();$record=academy_read_node($root);$now=academy_now_ms();
            if(!is_array($record)||($record['status']??'')!=='active'||(!empty($record['expiresAt'])&&(int)$record['expiresAt']<$now)){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'code_unavailable'],422);}
            $profile=academy_read_node('studentProfilesV3/'.$u['id']);if(!is_array($profile)){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'profile_missing'],422);}
            $planId=(string)($record['planId']??'');$plan=academy_v46_plan_for_student($planId,$profile);
            $old=academy_read_node($subRoot);$old=is_array($old)?$old:[];
            if(($old['status']??'')==='active'&&(int)($old['endsAt']??0)>$now&&($old['planId']??'')!==$planId){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'different_active_plan'],409);}
            $renewing=($old['status']??'')==='active'&&($old['planId']??'')===$planId&&(int)($old['endsAt']??0)>$now;
            $days=max(1,min(3650,(int)($record['days']??30)));$ends=($renewing?(int)$old['endsAt']:$now)+$days*86400000;
            $new=['planId'=>$planId,'status'=>'active','startsAt'=>$renewing?(int)($old['startsAt']??$now):$now,'endsAt'=>$ends,'notes'=>'تم التفعيل بكود اشتراك','createdAt'=>$old['createdAt']??$now,'updatedAt'=>$now,'updatedBy'=>$u['id'],'activatedAt'=>$old['activatedAt']??$now,'lastRenewedAt'=>$renewing?$now:null,'activationSource'=>'v46_code'];
            $record['status']='redeemed';$record['redeemedAt']=$now;$record['redeemedBy']=$u['id'];academy_delete_node_raw($pdo,$root);academy_insert_value_raw($pdo,$root,$record,$u['id']);academy_delete_node_raw($pdo,$subRoot);academy_insert_value_raw($pdo,$subRoot,$new,$u['id']);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($u['id'],'v46.subscription.redeem',null,['planId'=>$planId,'codeSuffix'=>substr($code,-6),'days'=>$days]);academy_json(['ok'=>true,'subscription'=>$new]);
    }
    if($route==='/v46/admin/students'&&$method==='GET'){
        academy_v46_require_role('admin');$rows=$pdo->query("SELECT id,display_name FROM academy_users WHERE primary_role='student' AND status='active' ORDER BY created_at DESC LIMIT 250")->fetchAll();
        academy_json(['ok'=>true,'students'=>array_map(fn($x)=>['id'=>$x['id'],'name'=>$x['display_name']],$rows)]);
    }
    if($route==='/v46/badges'&&$method==='GET'){
        $u=academy_v46_require_role('student');$raw=academy_read_node('v46BadgeAwards/'.$u['id']);$awards=[];if(is_array($raw))foreach($raw as $r)if(is_array($r)&&($r['status']??'active')==='active')$awards[]=$r;
        usort($awards,fn($a,$b)=>($b['awardedAt']??0)<=>($a['awardedAt']??0));academy_json(['ok'=>true,'badges'=>$awards]);
    }
    if($route==='/v46/admin/badges'&&$method==='GET'){
        academy_v46_require_role('admin');$defs=academy_read_node('v46BadgeDefinitions');$awards=academy_read_node('v46BadgeAwards');academy_json(['ok'=>true,'definitions'=>is_array($defs)?$defs:[],'awards'=>is_array($awards)?$awards:[]]);
    }
    if($route==='/v46/admin/badges/save'&&$method==='POST'){
        $u=academy_v46_require_role('admin');$b=academy_body();$id=(string)($b['id']??'');if($id!==''&&!preg_match('/^[a-f0-9-]{36}$/D',$id))academy_json(['ok'=>false,'error'=>'badge_invalid'],422);
        $name=trim((string)($b['name']??''));$description=trim((string)($b['description']??''));$emoji=trim((string)($b['icon']??'🏅'));if($name===''||mb_strlen($name)>80||mb_strlen($description)>250||mb_strlen($emoji)>5)academy_json(['ok'=>false,'error'=>'badge_data_invalid'],422);
        $id=$id?:academy_uuid();$path='v46BadgeDefinitions/'.$id;$existing=academy_read_node($path);$now=academy_now_ms();$def=['id'=>$id,'name'=>$name,'description'=>$description,'icon'=>$emoji,'active'=>!array_key_exists('active',$b)||$b['active']===true,'createdAt'=>$existing['createdAt']??$now,'updatedAt'=>$now];academy_write_node($path,$def,$u['id']);academy_audit($u['id'],'v46.badge.save',$id);academy_json(['ok'=>true,'badge'=>$def]);
    }
    if($route==='/v46/admin/badges/award'&&$method==='POST'){
        $u=academy_v46_require_role('admin');$b=academy_body();$studentId=(string)($b['studentId']??'');$badgeId=(string)($b['badgeId']??'');if(!preg_match('/^[a-f0-9-]{36}$/D',$studentId)||!preg_match('/^[a-f0-9-]{36}$/D',$badgeId))academy_json(['ok'=>false,'error'=>'invalid_id'],422);
        $st=$pdo->prepare("SELECT id FROM academy_users WHERE id=? AND primary_role='student' AND status='active'");$st->execute([$studentId]);if(!$st->fetchColumn())academy_json(['ok'=>false,'error'=>'student_unavailable'],422);
        $def=academy_read_node('v46BadgeDefinitions/'.$badgeId);if(!is_array($def)||($def['active']??false)!==true)academy_json(['ok'=>false,'error'=>'badge_unavailable'],422);
        $root='v46BadgeAwards/'.$studentId.'/'.$badgeId;$locks=academy_acquire_data_locks($pdo,[$root]);
        try{$pdo->beginTransaction();$existing=academy_read_node($root);if(is_array($existing)&&($existing['status']??'active')==='active'){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'already_awarded'],409);}
            $award=['id'=>$badgeId,'studentId'=>$studentId,'name'=>$def['name'],'description'=>$def['description'],'icon'=>$def['icon'],'status'=>'active','awardedAt'=>academy_now_ms(),'awardedBy'=>$u['id']];academy_delete_node_raw($pdo,$root);academy_insert_value_raw($pdo,$root,$award,$u['id']);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($u['id'],'v46.badge.award',$studentId,['badgeId'=>$badgeId]);academy_json(['ok'=>true,'award'=>$award]);
    }
    if($route==='/v46/admin/badges/revoke'&&$method==='POST'){
        $u=academy_v46_require_role('admin');$b=academy_body();$studentId=(string)($b['studentId']??'');$badgeId=(string)($b['badgeId']??'');if(!preg_match('/^[a-f0-9-]{36}$/D',$studentId)||!preg_match('/^[a-f0-9-]{36}$/D',$badgeId))academy_json(['ok'=>false,'error'=>'invalid_id'],422);
        $root='v46BadgeAwards/'.$studentId.'/'.$badgeId;$locks=academy_acquire_data_locks($pdo,[$root]);
        try{$pdo->beginTransaction();$award=academy_read_node($root);if(!is_array($award)||($award['status']??'')!=='active'){$pdo->rollBack();academy_json(['ok'=>false,'error'=>'award_missing'],404);}
            $award['status']='revoked';$award['revokedAt']=academy_now_ms();$award['revokedBy']=$u['id'];academy_delete_node_raw($pdo,$root);academy_insert_value_raw($pdo,$root,$award,$u['id']);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}finally{academy_release_data_locks($pdo,$locks);}
        academy_audit($u['id'],'v46.badge.revoke',$studentId,['badgeId'=>$badgeId]);academy_json(['ok'=>true]);
    }
    academy_json(['ok'=>false,'error'=>'not_found'],404);
}
