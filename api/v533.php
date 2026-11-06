<?php
/** V53.3: consistent student phone directory indexes and safe synchronization. */
declare(strict_types=1);
function academy_v533_phone_key(string $value): string {
    $number=academy_v47_phone($value);
    return $number!=='' ? '20'.substr($number,1) : '';
}
function academy_v533_phone_sync(PDO $pdo,array $user,array $body): never {
    if(($user['primary_role']??'')!=='student')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    $uid=(string)$user['id'];academy_rate_limit('v533-student-phone-'.$uid,30,3600);
    // Never accept a different phone number or a claimed owner supplied by the browser.
    $profile=academy_read_node('studentProfilesV3/'.$uid);
    $saved=is_array($profile)?academy_v533_phone_key((string)($profile['phone']??'')):'';
    $submitted=academy_v533_phone_key((string)($body['phone']??''));
    if($saved===''||$submitted===''||$submitted!==$saved)academy_json(['ok'=>false,'error'=>'phone_profile_mismatch'],422);
    $name=trim((string)($profile['name']??$user['display_name']??''));
    $name=mb_substr($name,0,190);
    $phone='0'.substr($saved,2);
    $directoryPath='phoneDirectoryV4/students/'.$uid;
    $currentDirectory=academy_read_node($directoryPath);
    $prior=is_array($currentDirectory)?academy_v533_phone_key((string)($currentDirectory['phone']??'')):'';
    $targets=['studentPhoneIndexV4/'.$saved,$directoryPath];
    if($prior!==''&&$prior!==$saved)$targets[]='studentPhoneIndexV4/'.$prior;
    // Some older installs wrote the national 01... key, while import uses 201... .
    $legacy='studentPhoneIndexV4/'.$phone;
    $targets[]=$legacy;
    if($prior!==''&&$prior!==$saved)$targets[]='studentPhoneIndexV4/0'.substr($prior,2);
    try{$locks=academy_acquire_data_locks($pdo,$targets);}
    catch(RuntimeException $e){if($e->getMessage()==='academy_data_busy')academy_json(['ok'=>false,'error'=>'busy'],409);throw $e;}
    $conflict=false;
    try{
        $pdo->beginTransaction();
        try{
            $check=$pdo->prepare('SELECT id FROM academy_users WHERE email=? AND id<>? LIMIT 1');
            $check->execute([academy_v47_login_email($phone),$uid]);
            if($check->fetchColumn())throw new DomainException('phone_already_registered');
            $existing=academy_read_node('studentPhoneIndexV4/'.$saved);
            if(is_array($existing)&&!empty($existing['studentId'])&&(string)$existing['studentId']!==$uid)throw new DomainException('phone_already_registered');
            $conflictingLegacy=academy_read_node($legacy);
            if(is_array($conflictingLegacy)&&!empty($conflictingLegacy['studentId'])&&(string)$conflictingLegacy['studentId']!==$uid)throw new DomainException('phone_already_registered');
            $oldDir=academy_read_node($directoryPath);$oldDir=is_array($oldDir)?$oldDir:[];
            $prior=academy_v533_phone_key((string)($oldDir['phone']??''));
            if($prior!==''&&$prior!==$saved){
                foreach(['studentPhoneIndexV4/'.$prior,'studentPhoneIndexV4/0'.substr($prior,2)] as $oldPath){
                    $old=academy_read_node($oldPath);
                    if(is_array($old)&&($old['studentId']??'')===$uid)academy_delete_node_raw($pdo,$oldPath);
                }
            }
            $oldLegacy=academy_read_node($legacy);
            if(is_array($oldLegacy)&&($oldLegacy['studentId']??'')===$uid)academy_delete_node_raw($pdo,$legacy);
            $indexPath='studentPhoneIndexV4/'.$saved;
            academy_delete_node_raw($pdo,$indexPath);
            academy_insert_value_raw($pdo,$indexPath,['studentId'=>$uid,'updatedAt'=>academy_now_ms()],$uid);
            // Preserve guardianPhone and any other directory fields while correcting phone & name.
            $updated=array_merge($oldDir,['uid'=>$uid,'name'=>$name,'phone'=>$phone,'updatedAt'=>academy_now_ms()]);
            academy_delete_node_raw($pdo,$directoryPath);
            academy_insert_value_raw($pdo,$directoryPath,$updated,$uid);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }catch(DomainException $e){
        if($e->getMessage()!=='phone_already_registered')throw $e;
        $conflict=true;
    }finally{academy_release_data_locks($pdo,$locks);}
    if($conflict)academy_json(['ok'=>false,'error'=>'phone_already_registered'],409);
    academy_audit($uid,'student.phone_index.sync','studentProfilesV3/'.$uid);
    academy_json(['ok'=>true]);
}
