<?php
declare(strict_types=1);
/** EGTAZ V90 — booking journey and scoped, manual in-platform updates. No automatic money movement or external messaging. */
function academy_v90_allowed(array $request,string $role,string $uid): bool {
    if($role==='admin')return true;
    if($role==='student')return (string)($request['studentId']??'')===$uid;
    if($role==='teacher')return (string)($request['teacherId']??'')===$uid;
    return false;
}
function academy_v90_message_visible(array $m,string $role,string $uid,array $r): bool {
    if($role==='admin')return true;
    $target=(string)($m['audience']??'');
    if($role==='student')return (string)($r['studentId']??'')===$uid && in_array($target,['student','both'],true);
    if($role==='teacher')return (string)($r['teacherId']??'')===$uid && (string)($m['teacherId']??'')===$uid && in_array($target,['teacher','both'],true);
    return false;
}
function academy_v90_sanitize_action(string $name): ?string {
    return match($name) {
        'create'=>'تم إرسال الطلب إلى الأكاديمية',
        'offer'=>'رشحت الأكاديمية معلمًا للطلب',
        'teacher_accept'=>'وافق المعلم على عرض التدريس',
        'teacher_reject'=>'المعلم غير متاح، والأكاديمية تبحث عن بديل',
        'publish_quote'=>'أرسلت الأكاديمية عرض السعر',
        'accept'=>'وافق الطالب على العرض',
        'confirm_payment'=>'أكدت الإدارة تسجيل التحصيل',
        'fulfill'=>'أكدت الإدارة تنفيذ الخدمة',
        'settle'=>'سجلت الإدارة تسوية مستحق المعلم',
        'cancel'=>'تم إلغاء الطلب',
        default=>null
    };
}
function academy_v90_row(array $r,string $role,string $uid): array {
    $id=(string)$r['id'];
    $item=['id'=>$id,'status'=>(string)($r['status']??''),'subject'=>(string)($r['subject']??''),
        'format'=>(string)($r['format']??''),'teacherName'=>($role==='student'&&!in_array((string)($r['status']??''),['quoted','accepted','paid','fulfilled','settled'],true))?'':(string)($r['teacherName']??''),
        'createdAt'=>(int)($r['createdAt']??0),'updatedAt'=>(int)($r['updatedAt']??0),
        'pricePiasters'=>in_array((string)($r['status']??''),['quoted','accepted','paid','fulfilled','settled'],true)?($r['pricePiasters']??null):null,
        'stage'=>(string)($r['stage']??''),'grade'=>(string)($r['grade']??''),'v85Stage'=>(string)($r['v85Stage']??'')];
    if($role==='admin'){$item['studentName']=(string)($r['studentName']??'');$item['teacherId']=(string)($r['teacherId']??'');}
    $steps=[];
    foreach(array_slice(is_array($r['events']??null)?$r['events']:[],-24) as $e){
        if(!is_array($e))continue;$label=academy_v90_sanitize_action((string)($e['action']??''));
        if($label===null)continue;
        $steps[]=['title'=>$label,'at'=>(int)($e['at']??0),'kind'=>'status'];
    }
    $plan=in_array((string)($r['status']??''),['paid','fulfilled','settled','cancelled'],true)?academy_read_node('v85Plans/'.$id):null;
    $sessions=[];
    if(is_array($plan)){
        foreach(array_slice(is_array($plan['sessions']??null)?array_values($plan['sessions']):[],0,24) as $s){
            if(!is_array($s))continue;
            $sessions[]=['id'=>(string)($s['id']??''),'status'=>(string)($s['status']??''),'startsAt'=>$s['startsAt']??null,
                'durationMinutes'=>(int)($s['durationMinutes']??0)];
        }
    }
    $all=academy_read_node('v90Messages/'.$id);$messages=[];
    $seen=is_array($all)&&count($all)>0?academy_read_node('v90Read/'.$uid.'/'.$id):[];
    if(!is_array($seen))$seen=[];
    if(is_array($all))foreach(array_slice(array_values($all),-45) as $m){
        if(!is_array($m)||!academy_v90_message_visible($m,$role,$uid,$r))continue;
        $mid=(string)($m['id']??'');
        $messages[]=['id'=>$mid,'body'=>(string)($m['body']??''),'at'=>(int)($m['at']??0),
            'from'=>(string)($m['fromRole']??''),'audience'=>(string)($m['audience']??''),'read'=>isset($seen[$mid])];
    }
    usort($messages,static fn($a,$b)=>$a['at']<=>$b['at']);
    $item['steps']=$steps;$item['sessions']=$sessions;$item['messages']=$messages;
    $item['unreadMessages']=count(array_filter($messages,static fn($m)=>!$m['read']&&$m['from']!==$role));
    return $item;
}
function academy_v90_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v90/'))return;
    try {
        $u=academy_v84_role();$role=(string)$u['primary_role'];$uid=(string)$u['id'];
        academy_rate_limit('v90-'.$uid,120,3600);
        if($method==='GET'&&$route==='/v90/list') {
            $ids=academy_v84_list_ids($pdo,$role,$uid);
            $rows=[];
            foreach(array_slice($ids,0,30) as $id){
                if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
                $r=academy_read_node('v84Requests/'.$id);
                if(!is_array($r)||($r['id']??'')!==$id||!academy_v90_allowed($r,$role,$uid))continue;
                $rows[]=academy_v90_row($r,$role,$uid);
            }
            usort($rows,static fn($a,$b)=>$b['updatedAt']<=>$a['updatedAt']);
            academy_json(['ok'=>true,'items'=>$rows,'limited'=>count($ids)>30,'limit'=>30,'manualOnly'=>true]);
        }
        if($method==='POST'&&$route==='/v90/message'){
            academy_rate_limit('v90-write-'.$uid,12,3600);
            $body=academy_body();$id=academy_v84_id($body['id']??'');
            $content=academy_v84_clean($body['message']??'',500);
            academy_v84_check(mb_strlen($content)>=5,'message_too_short',422);
            $target=$role==='admin'?(string)($body['audience']??''):($role==='student'?'student':'teacher');
            academy_v84_check(in_array($target,$role==='admin'?['student','teacher','both','admin']:[$role],true),'invalid_audience',422);
            $locks=academy_acquire_data_locks($pdo,['v84Requests/'.$id,'v90Messages/'.$id]);
            try{$pdo->beginTransaction();try{
                $r=academy_v84_record($id);
                academy_v84_check(academy_v90_allowed($r,$role,$uid),'forbidden',403);
                if(in_array($target,['teacher','both'],true))academy_v84_check((string)($r['teacherId']??'')!=='','teacher_not_assigned',409);
                $messages=academy_read_node('v90Messages/'.$id);
                if(!is_array($messages))$messages=[];
                academy_v84_check(count($messages)<80,'message_limit_reached',409);
                $mid=bin2hex(random_bytes(8));
                $m=['id'=>$mid,'body'=>$content,'at'=>academy_now_ms(),'fromRole'=>$role,'fromId'=>$uid,
                    'audience'=>$target,'teacherId'=>(string)($r['teacherId']??'')];
                academy_insert_value_raw($pdo,'v90Messages/'.$id.'/'.$mid,$m,$uid);
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
            finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($uid,'v90.message',$id,['audience'=>$target]);
            academy_json(['ok'=>true,'id'=>$mid]);
        }
        if($method==='POST'&&$route==='/v90/read'){
            $body=academy_body();$id=academy_v84_id($body['id']??'');$mid=(string)($body['messageId']??'');
            academy_v84_check((bool)preg_match('/^[a-f0-9]{16}$/D',$mid),'invalid_message',422);
            $r=academy_v84_record($id);academy_v84_check(academy_v90_allowed($r,$role,$uid),'forbidden',403);
            $m=academy_read_node('v90Messages/'.$id.'/'.$mid);
            academy_v84_check(is_array($m)&&academy_v90_message_visible($m,$role,$uid,$r),'not_found',404);
            $locks=academy_acquire_data_locks($pdo,['v90Read/'.$uid.'/'.$id.'/'.$mid]);
            try{$pdo->beginTransaction();try{
                academy_delete_node_raw($pdo,'v90Read/'.$uid.'/'.$id.'/'.$mid);
                academy_insert_value_raw($pdo,'v90Read/'.$uid.'/'.$id.'/'.$mid,academy_now_ms(),$uid);
                $pdo->commit();
            }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
            finally{academy_release_data_locks($pdo,$locks);}
            academy_json(['ok'=>true]);
        }
        academy_v84_check(false,'not_found',404);
    }catch(AcademyV84Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->httpStatus);}
}
