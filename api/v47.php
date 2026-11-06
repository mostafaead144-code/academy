<?php
declare(strict_types=1);
/* V47: admin-only bulk student onboarding & controlled contact export. No credentials in audit/export. */
function academy_v47_admin(): array {
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    return $u;
}
function academy_v47_digits(string $raw): string {
    $raw=strtr($raw,['٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9','۰'=>'0','۱'=>'1','۲'=>'2','۳'=>'3','۴'=>'4','۵'=>'5','۶'=>'6','۷'=>'7','۸'=>'8','۹'=>'9']);
    return preg_replace('/[^0-9]/','',$raw);
}
function academy_v47_phone(string $raw): string {
    $n=academy_v47_digits($raw);
    if(preg_match('/^0020(1[0125][0-9]{8})$/D',$n,$m))$n='0'.$m[1];
    elseif(preg_match('/^20(1[0125][0-9]{8})$/D',$n,$m))$n='0'.$m[1];
    return preg_match('/^01[0125][0-9]{8}$/D',$n)?$n:'';
}
function academy_v47_login_email(string $phone): string {return 'p20'.substr($phone,1).'@students.academy.invalid';}
function academy_v47_validate(array $input): array {
    $name=trim((string)($input['name']??''));$phone=academy_v47_phone((string)($input['phone']??''));
    $guardianInput=trim((string)($input['guardianPhone']??''));$guardian=$guardianInput!==''?academy_v47_phone($guardianInput):'';
    $type=(string)($input['educationType']??'public');$stage=(string)($input['stage']??'primary');$grade=filter_var($input['grade']??null,FILTER_VALIDATE_INT);
    if(mb_strlen($name)<2||mb_strlen($name)>160)return ['error'=>'اسم الطالب يجب أن يكون من حرفين إلى 160 حرفًا'];
    if($phone==='')return ['error'=>'رقم هاتف الطالب غير صحيح'];
    if($guardianInput!==''&&$guardian==='')return ['error'=>'رقم ولي الأمر غير صحيح'];
    if(!in_array($type,['public','azhar'],true)||!in_array($stage,['primary','prep','sec'],true))return ['error'=>'نوع التعليم أو المرحلة غير صحيح'];
    $max=$stage==='primary'?6:3;if($grade===false||$grade<1||$grade>$max)return ['error'=>'الصف غير صالح للمرحلة'];
    return ['name'=>$name,'phone'=>$phone,'guardianPhone'=>$guardian,'educationType'=>$type,'stage'=>$stage,'grade'=>$grade];
}
function academy_v47_student_contact(array $u): array {
    $id=(string)$u['id'];$p=academy_read_node('studentProfilesV3/'.$id);$p=is_array($p)?$p:[];
    $dir=academy_read_node('phoneDirectoryV4/students/'.$id);$dir=is_array($dir)?$dir:[];
    $phone=academy_v47_phone((string)($p['phone']??''));if($phone==='')$phone=academy_v47_phone((string)($dir['phone']??''));
    if($phone===''&&preg_match('/^p20(1[0125][0-9]{8})@students\.academy\.invalid$/D',(string)$u['email'],$m))$phone='0'.$m[1];
    $guardian='';foreach([$p['guardianPhone']??'',$p['parentPhone']??'',$dir['guardianPhone']??''] as $candidate){$guardian=academy_v47_phone((string)$candidate);if($guardian!=='')break;}
    return ['name'=>(string)($p['name']??$u['display_name']),'phone'=>$phone,'guardianPhone'=>$guardian,'educationType'=>(string)($p['educationType']??''),'stage'=>(string)($p['stage']??''),'grade'=>(string)($p['grade']??''),'status'=>(string)$u['status']];
}
function academy_v47_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v47/'))return;
    if($route==='/v47/admin/students/import'&&$method==='POST'){
        $admin=academy_v47_admin();$b=academy_body();$rows=$b['students']??null;$dry=($b['dryRun']??false)===true;
        if(!is_array($rows)||!array_is_list($rows)||count($rows)<1||count($rows)>50)academy_json(['ok'=>false,'error'=>'v47_batch_size'],422);
        if(!$dry)academy_rate_limit('v47-import-'.$admin['id'],12,3600);
        $checked=[];$seen=[];$errors=[];$lookup=$pdo->prepare('SELECT 1 FROM academy_users WHERE email=? LIMIT 1');
        foreach($rows as $index=>$raw){
            $row=is_array($raw)?academy_v47_validate($raw):['error'=>'سطر غير صالح'];$n=$index+1;
            if(isset($row['error'])){$errors[]=['row'=>$n,'message'=>$row['error']];continue;}
            $email=academy_v47_login_email($row['phone']);
            if(isset($seen[$email])){$errors[]=['row'=>$n,'message'=>'رقم مكرر داخل الدفعة (سطر '.$seen[$email].')'];continue;}
            $seen[$email]=$n;$lookup->execute([$email]);$registered=(bool)$lookup->fetchColumn();$indexed=academy_read_node('studentPhoneIndexV4/'.'20'.substr($row['phone'],1));if($registered||(is_array($indexed)&&!empty($indexed['studentId']))){$errors[]=['row'=>$n,'message'=>'رقم الطالب مسجل من قبل'];continue;}
            $checked[]=$row;
        }
        if($dry)academy_json(['ok'=>true,'valid'=>count($errors)===0,'validCount'=>count($checked),'totalCount'=>count($rows),'errors'=>$errors]);
        if($errors)academy_json(['ok'=>false,'error'=>'v47_import_review','errors'=>$errors],422);
        $created=[];$now=academy_now_ms();
        // Unique email constraint is the definitive concurrent duplicate guard; entire batch rolls back on any failure.
        try{
            $pdo->beginTransaction();$ins=$pdo->prepare("INSERT INTO academy_users(id,email,password_hash,display_name,primary_role,status) VALUES(?,?,?,?, 'student','active')");
            foreach($checked as $r){
                $id=academy_uuid();$secret=rtrim(strtr(base64_encode(random_bytes(15)),'+/','-_'),'=');$email=academy_v47_login_email($r['phone']);
                $ins->execute([$id,$email,password_hash($secret,PASSWORD_DEFAULT),$r['name']]);
                $p=['uid'=>$id,'name'=>$r['name'],'phone'=>$r['phone'],'educationType'=>$r['educationType'],'stage'=>$r['stage'],'grade'=>(string)$r['grade'],'avatarId'=>'student-01','createdAt'=>$now,'updatedAt'=>$now];
                if($r['guardianPhone']!=='')$p['guardianPhone']=$r['guardianPhone'];
                academy_insert_value_raw($pdo,'studentProfilesV3/'.$id,$p,$admin['id']);
                academy_insert_value_raw($pdo,'phoneDirectoryV4/students/'.$id,['uid'=>$id,'name'=>$r['name'],'phone'=>$r['phone'],'guardianPhone'=>$r['guardianPhone'],'updatedAt'=>$now],$admin['id']);
                academy_insert_value_raw($pdo,'studentPhoneIndexV4/'.'20'.substr($r['phone'],1),['studentId'=>$id,'updatedAt'=>$now],$admin['id']);
                academy_insert_value_raw($pdo,'v50PasswordForceV1/'.$id,['createdAt'=>$now,'createdBy'=>$admin['id'],'source'=>'v47_bulk_import'],$admin['id']);
                $created[]=['name'=>$r['name'],'phone'=>$r['phone'],'temporaryPassword'=>$secret];
            }
            $pdo->commit();
        }catch(PDOException $e){if($pdo->inTransaction())$pdo->rollBack();if((string)$e->getCode()==='23000')academy_json(['ok'=>false,'error'=>'v47_import_conflict'],409);throw $e;}
        catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        academy_audit($admin['id'],'v47.students.bulk_import',null,['count'=>count($created)]);
        academy_json(['ok'=>true,'created'=>$created,'count'=>count($created)],201);
    }
    if($route==='/v47/admin/students/export'&&$method==='GET'){
        $admin=academy_v47_admin();academy_rate_limit('v47-export-'.$admin['id'],120,3600);
        $offset=filter_var($_GET['offset']??0,FILTER_VALIDATE_INT);if($offset===false||$offset<0||$offset>100000)academy_json(['ok'=>false,'error'=>'invalid_offset'],422);
        $limit=200;$stmt=$pdo->prepare('SELECT id,email,display_name,status FROM academy_users WHERE primary_role=\'student\' ORDER BY created_at,id LIMIT ? OFFSET ?');
        $stmt->bindValue(1,$limit,PDO::PARAM_INT);$stmt->bindValue(2,$offset,PDO::PARAM_INT);$stmt->execute();$out=[];
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $user)$out[]=academy_v47_student_contact($user);
        academy_audit($admin['id'],'v47.students.contact_export',null,['offset'=>$offset,'count'=>count($out)]);
        academy_json(['ok'=>true,'students'=>$out,'offset'=>$offset,'nextOffset'=>count($out)===$limit?$offset+$limit:null]);
    }
    if($route==='/v47/admin/assignments'&&$method==='GET'){
        academy_v47_admin();$all=academy_read_node('assignments');$rows=[];
        foreach(is_array($all)?$all:[] as $id=>$item){if(!is_array($item)||($item['status']??'')!=='published')continue;
            $rows[]=['id'=>(string)$id,'title'=>(string)($item['title']??'واجب'),'dueAt'=>$item['dueAt']??null,'type'=>$item['type']??$item['educationType']??'','stage'=>$item['stage']??'','grade'=>$item['grade']??'','teacherId'=>$item['teacherId']??''];
        }
        usort($rows,fn($a,$b)=>($b['dueAt']??0)<=>($a['dueAt']??0));academy_json(['ok'=>true,'assignments'=>array_slice($rows,0,200)]);
    }
    academy_json(['ok'=>false,'error'=>'not_found'],404);
}
