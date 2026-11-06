<?php
declare(strict_types=1);
/** EGTAZ V89 — verified, booking-scoped service quality. NOT Zoom attendance tracking. */
function academy_v89_review_key(mixed $v): string {
    $s=(string)$v;
    academy_v84_check((bool)preg_match('/^s(?:0[1-9]|1[0-9]|2[0-4])$/D',$s),'invalid_session_id',422);
    return $s;
}
function academy_v89_booking_allowed(array $b,string $role,string $uid): bool {
    return $role==='admin'||($role==='student'&&($b['studentId']??null)===$uid)||($role==='teacher'&&($b['teacherId']??null)===$uid);
}
function academy_v89_review_visible(mixed $r): bool {return is_array($r)&&($r['hidden']??false)!==true&&($r['rating']??0)>=1&&($r['rating']??0)<=5;}
function academy_v89_summary(array $b,?array $plan,mixed $reviews,string $role): array {
    $sessions=is_array($plan['sessions']??null)?$plan['sessions']:[];
    $total=['scheduled'=>0,'completed'=>0,'cancelled'=>0,'unscheduled'=>0,'reviewCount'=>0,'ratingSum'=>0];
    $detail=[];
    foreach($sessions as $s){
        if(!is_array($s))continue;
        $status=(string)($s['status']??'unscheduled');
        if(isset($total[$status]))$total[$status]++;
        $sid=(string)($s['id']??'');
        $rev=is_array($reviews)?($reviews[$sid]??null):null;
        if($status==='completed'&&academy_v89_review_visible($rev)){
            $total['reviewCount']++;$total['ratingSum']+=(int)$rev['rating'];
        }
        if($role==='student'){
            $detail[]=['sessionId'=>$sid,'status'=>$status,'startsAt'=>$s['startsAt']??null,'completedAt'=>$s['completedAt']??null,
                'durationMinutes'=>(int)($s['durationMinutes']??0),'myRating'=>is_array($rev)?(int)($rev['rating']??0):0,
                'reviewHidden'=>is_array($rev)?(bool)($rev['hidden']??false):false];
        }
        if($role==='admin'&&is_array($rev)){
            $detail[]=['sessionId'=>$sid,'status'=>$status,'startsAt'=>$s['startsAt']??null,'rating'=>(int)($rev['rating']??0),
                'comment'=>(string)($rev['comment']??''),'hidden'=>(bool)($rev['hidden']??false),'createdAt'=>$rev['createdAt']??null];
        }
    }
    $count=$total['completed']+$total['cancelled'];
    return ['requestId'=>(string)($b['id']??''),'teacherId'=>(string)($b['teacherId']??''),
        'teacherName'=>(string)($b['teacherName']??''),'subject'=>(string)($b['subject']??''),
        'status'=>(string)($b['status']??''),'totalSessions'=>count($sessions),
        'scheduledSessions'=>$total['scheduled'],'completedSessions'=>$total['completed'],
        'cancelledSessions'=>$total['cancelled'],'unscheduledSessions'=>$total['unscheduled'],
        'concludedSessions'=>$count,'completionRate'=>$count>0?round($total['completed']*100/$count,1):null,
        'reviewCount'=>$total['reviewCount'],'ratingSum'=>$total['ratingSum'],
        'ratingAvg'=>$total['reviewCount']?round($total['ratingSum']/$total['reviewCount'],2):null,
        'sessions'=>$detail];
}
function academy_v89_student_rows(string $uid): array {
    $raw=academy_read_node('v84StudentIndex/'.$uid);
    if(!is_array($raw))return [];
    arsort($raw,SORT_NUMERIC);$rows=[];
    foreach(array_slice(array_keys($raw),0,80) as $id){
        if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
        $b=academy_read_node('v84Requests/'.$id);
        if(!is_array($b)||!academy_v89_booking_allowed($b,'student',$uid)||!in_array(($b['status']??''),['paid','fulfilled','settled'],true))continue;
        $plan=academy_read_node('v85Plans/'.$id);if(!is_array($plan))continue;
        $rev=academy_read_node('v89Reviews/'.$id);
        $sum=academy_v89_summary($b,$plan,$rev,'student');
        $sum['sessions']=array_values(array_filter($sum['sessions'],static fn($s)=>$s['status']==='completed'));
        if($sum['sessions'])$rows[]=$sum;
    }
    return array_slice($rows,0,50);
}
function academy_v89_page(PDO $pdo,string $role,string $uid,int $offset,int $limit): array {
    academy_v84_check($offset>=0&&$offset<=10000&&$limit>=1&&$limit<=40,'invalid_page');
    $ids=[];$more=false;$next=$offset;
    if($role==='admin'){
        $q=$pdo->prepare("SELECT path FROM academy_data WHERE path LIKE 'v84Requests/%/updatedAt' ORDER BY updated_at DESC, path DESC LIMIT ? OFFSET ?");
        $q->bindValue(1,$limit+1,PDO::PARAM_INT);$q->bindValue(2,$offset,PDO::PARAM_INT);$q->execute();
        $paths=$q->fetchAll(PDO::FETCH_COLUMN);$more=count($paths)>$limit;
        foreach(array_slice($paths,0,$limit) as $path){$next++;if(preg_match('~^v84Requests/([a-f0-9]{24})/updatedAt$~D',(string)$path,$m))$ids[]=$m[1];}
    }else{
        $raw=academy_read_node('v84TeacherIndex/'.$uid);$raw=is_array($raw)?$raw:[];
        arsort($raw,SORT_NUMERIC);$all=array_keys($raw);
        $ids=array_slice($all,$offset,$limit);$next=$offset+count($ids);$more=$next<count($all);
    }
    $rows=[];
    foreach($ids as $id){
        if(!preg_match('/^[a-f0-9]{24}$/D',(string)$id))continue;
        $b=academy_read_node('v84Requests/'.$id);
        if(!is_array($b)||!academy_v89_booking_allowed($b,$role,$uid))continue;
        $p=academy_read_node('v85Plans/'.$id);if(!is_array($p))continue; // Legacy no per-session verification
        $rev=academy_read_node('v89Reviews/'.$id);
        $rows[]=academy_v89_summary($b,$p,$rev,$role);
    }
    return ['items'=>$rows,'nextOffset'=>$next,'hasMore'=>$more,'scope'=>'loaded_bookings_only','count'=>count($rows)];
}
function academy_v89_rate(PDO $pdo,string $uid,array $body): array {
    $id=academy_v84_id($body['requestId']??'');$sid=academy_v89_review_key($body['sessionId']??'');
    $rating=filter_var($body['rating']??null,FILTER_VALIDATE_INT);
    academy_v84_check($rating!==false&&$rating>=1&&$rating<=5,'rating_out_of_range');
    $comment=academy_v84_clean($body['comment']??'',350);
    $path='v89Reviews/'.$id.'/'.$sid;
    $locks=academy_acquire_data_locks($pdo,[$path]);
    try{$pdo->beginTransaction();try{
        $b=academy_v84_record($id);
        academy_v84_check(academy_v89_booking_allowed($b,'student',$uid),'forbidden',403);
        academy_v84_check(in_array((string)($b['status']??''),['paid','fulfilled','settled'],true),'booking_not_confirmed',409);
        $p=academy_read_node('v85Plans/'.$id);
        academy_v84_check(is_array($p),'session_not_found',404);
        $s=$p['sessions'][$sid]??null;
        academy_v84_check(is_array($s)&&($s['status']??'')==='completed','session_not_completed',409);
        academy_v84_check(!is_array(academy_read_node($path)),'already_reviewed',409);
        $review=['rating'=>$rating,'comment'=>$comment,'studentId'=>$uid,'createdAt'=>academy_now_ms(),'hidden'=>false];
        academy_insert_value_raw($pdo,$path,$review,$uid);
        $pdo->commit();return ['rating'=>$rating,'sessionId'=>$sid];
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
    finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v89_moderate(PDO $pdo,string $uid,array $body): array {
    $id=academy_v84_id($body['requestId']??'');$sid=academy_v89_review_key($body['sessionId']??'');
    academy_v84_check(is_bool($body['hidden']??null),'invalid_visibility');
    $path='v89Reviews/'.$id.'/'.$sid;$locks=academy_acquire_data_locks($pdo,[$path]);
    try{$pdo->beginTransaction();try{
        $r=academy_read_node($path);academy_v84_check(is_array($r),'review_not_found',404);
        $r['hidden']=$body['hidden'];$r['moderatedBy']=$uid;$r['moderatedAt']=academy_now_ms();
        academy_delete_node_raw($pdo,$path);academy_insert_value_raw($pdo,$path,$r,$uid);$pdo->commit();
        return ['hidden'=>$r['hidden']];
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
    finally{academy_release_data_locks($pdo,$locks);}
}
function academy_v89_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v89/'))return;
    try{
        $u=academy_v84_role();$uid=(string)$u['id'];$role=(string)$u['primary_role'];
        academy_rate_limit('v89-read-'.$uid,120,3600);
        if($method==='GET'&&$route==='/v89/student/reviews'){
            academy_v84_check($role==='student','forbidden',403);
            academy_json(['ok'=>true,'items'=>academy_v89_student_rows($uid)]);
        }
        if($method==='GET'&&$route==='/v89/report'){
            academy_v84_check(in_array($role,['teacher','admin'],true),'forbidden',403);
            $offset=filter_var($_GET['offset']??'0',FILTER_VALIDATE_INT);
            $limit=filter_var($_GET['limit']??'25',FILTER_VALIDATE_INT);
            academy_v84_check($offset!==false&&$limit!==false,'invalid_page');
            academy_json(['ok'=>true,'report'=>academy_v89_page($pdo,$role,$uid,$offset,$limit)]);
        }
        if($method==='POST'&&$route==='/v89/student/rate'){
            academy_v84_check($role==='student','forbidden',403);
            academy_rate_limit('v89-rate-'.$uid,15,86400);
            $r=academy_v89_rate($pdo,$uid,academy_body());
            academy_audit($uid,'v89.session_rated',$r['sessionId']);academy_json(['ok'=>true,'review'=>$r],201);
        }
        if($method==='POST'&&$route==='/v89/admin/moderate'){
            academy_v84_check($role==='admin','forbidden',403);
            academy_rate_limit('v89-moderate-'.$uid,50,3600);
            $r=academy_v89_moderate($pdo,$uid,academy_body());
            academy_audit($uid,'v89.review_moderated','quality_review');academy_json(['ok'=>true,'result'=>$r]);
        }
        academy_v84_check(false,'not_found',404);
    }catch(AcademyV84Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->httpStatus);}
}
