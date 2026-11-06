<?php
/** EGTAZ V86: private booked live classes. Public M5 sessions stay unchanged. */
declare(strict_types=1);
function academy_v86_fail(bool $ok,string $err,int $code=422): void {
    if(!$ok)throw new AcademyV84Error($err,$code);
}
function academy_v86_context(string $requestId,string $sessionId,array $user): array {
    $booking=academy_v84_record($requestId);
    $role=(string)($user['primary_role']??'');$uid=(string)($user['id']??'');
    $access=$role==='admin'||($role==='teacher'&&($booking['teacherId']??'')===$uid&&academy_teacher_is_active_profile($uid))||($role==='student'&&($booking['studentId']??'')===$uid);
    academy_v86_fail($access,'forbidden',403);
    academy_v86_fail(in_array((string)($booking['status']??''),['paid','fulfilled'],true)&&!empty($booking['paymentConfirmedAt'])&&!empty($booking['paymentReference']),'booking_unpaid',403);
    $plan=academy_read_node('v85Plans/'.$requestId);
    academy_v86_fail(is_array($plan),'booking_has_no_sessions',409);
    $s=$plan['sessions'][$sessionId]??null;
    academy_v86_fail(is_array($s),'session_not_found',404);
    return [$booking,$plan,$s];
}
/** Access is per paid booking + its own session, never merely by student's grade. */
function academy_v86_can_join(array $booking,array $plan,array $s,string $uid,int $now): bool {
    if(($booking['studentId']??'')!==$uid||!in_array((string)($booking['status']??''),['paid','fulfilled'],true)||empty($booking['paymentConfirmedAt'])||empty($booking['paymentReference']))return false;
    if(($s['status']??'')!=='scheduled'||empty($s['startsAt'])||empty($s['durationMinutes']))return false;
    $start=strtotime((string)$s['startsAt']);$duration=(int)$s['durationMinutes'];
    if($start===false||$duration<15||$duration>240)return false;
    // A completely refunded booking cannot grant further access. Partial refunds are managed by session cancellation.
    if(academy_v85_sums($booking,$plan)['netCollectedPiasters']<=0)return false;
    return $now>=$start-1800&&$now<=$start+$duration*60+1200;
}
function academy_v86_room_path(string $bid,string $sid): string {
    return 'v86MeetingLinks/'.$bid.'/'.$sid;
}
function academy_v86_public_session(array $booking,array $plan,array $s,?array $rooms=null): array {
    $room=$rooms===null?academy_read_node(academy_v86_room_path((string)$booking['id'],(string)$s['id'])):($rooms[(string)$s['id']]??null);
    return [
        'requestId'=>(string)$booking['id'],'sessionId'=>(string)$s['id'],
        'title'=>'الحصة الخاصة '.((int)($s['number']??0)),'subject'=>(string)($booking['subject']??''),
        'teacherName'=>(string)($booking['teacherName']??'معلم الأكاديمية'),
        'startsAt'=>$s['startsAt']??null,'durationMinutes'=>$s['durationMinutes']??null,
        'status'=>(string)($s['status']??'unscheduled'),
        'ready'=>is_array($room)&&!empty($room['url']),
        'provider'=>is_array($room)?(string)($room['provider']??'external'):'external'
    ];
}
function academy_v86_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v86/'))return;
    try {
        $u=academy_v84_role();$role=(string)$u['primary_role'];$uid=(string)$u['id'];
        academy_rate_limit('v86-read-'.$uid,120,3600);
        if($route==='/v86/student/sessions'&&$method==='GET'){
            academy_v86_fail($role==='student','forbidden',403);
            $ids=academy_v84_list_ids($pdo,'student',$uid);$items=[];$cut=false;
            foreach(array_slice($ids,0,80) as $rid){
                if(!preg_match('/^[a-f0-9]{24}$/D',(string)$rid))continue;
                $booking=academy_read_node('v84Requests/'.$rid);
                if(!is_array($booking)||($booking['studentId']??'')!==$uid||!in_array((string)($booking['status']??''),['paid','fulfilled'],true)||empty($booking['paymentConfirmedAt'])||empty($booking['paymentReference']))continue;
                $plan=academy_read_node('v85Plans/'.$rid);
                if(!is_array($plan)||academy_v85_sums($booking,$plan)['netCollectedPiasters']<=0)continue;
                $rooms=academy_read_node('v86MeetingLinks/'.$rid);if(!is_array($rooms))$rooms=[];
                foreach(($plan['sessions']??[]) as $session){
                    if(!is_array($session)||($session['status']??'')!=='scheduled')continue;
                    $items[]=academy_v86_public_session($booking,$plan,$session,$rooms);
                    if(count($items)>=160){$cut=true;break 2;}
                }
            }
            usort($items,static fn($a,$b)=>strcmp((string)($a['startsAt']??''),(string)($b['startsAt']??'')));
            academy_json(['ok'=>true,'sessions'=>$items,'serverNow'=>gmdate('c'),'truncated'=>$cut||count($ids)>=80]);
        }
        if($route==='/v86/room'&&$method==='GET'){
            academy_v86_fail(in_array($role,['teacher','admin'],true),'forbidden',403);
            $bid=academy_v84_id($_GET['requestId']??'');$sid=(string)($_GET['sessionId']??'');
            academy_v86_fail((bool)preg_match('/^s[0-9]{2}$/D',$sid),'invalid_session_id');
            [$booking,$plan,$s]=academy_v86_context($bid,$sid,$u);
            $room=academy_read_node(academy_v86_room_path($bid,$sid));
            academy_json(['ok'=>true,'session'=>academy_v86_public_session($booking,$plan,$s),'url'=>is_array($room)?(string)($room['url']??''):'']);
        }
        if($route==='/v86/room/save'&&$method==='POST'){
            academy_v86_fail(in_array($role,['admin','teacher'],true),'forbidden',403);
            academy_rate_limit('v86-write-'.$uid,20,3600);
            $b=academy_body();$bid=academy_v84_id($b['requestId']??'');$sid=(string)($b['sessionId']??'');
            academy_v86_fail((bool)preg_match('/^s[0-9]{2}$/D',$sid),'invalid_session_id');
            [$booking,$plan,$s]=academy_v86_context($bid,$sid,$u);
            academy_v86_fail(($s['status']??'')==='scheduled','session_not_scheduled',409);
            $action=(string)($b['action']??'save');academy_v86_fail(in_array($action,['save','clear'],true),'invalid_action');
            $url=$action==='save'?academy_m5_url($b['meetingUrl']??''):'';
            // A separate lock prevents two administrators from overwriting the same invitation concurrently.
            $path=academy_v86_room_path($bid,$sid);
            $locks=academy_acquire_data_locks($pdo,[$path]);
            try{
                $pdo->beginTransaction();
                try{
                    // Recheck the booking and session after taking a mutation lock.
                    [$latestBooking,$latestPlan,$latestSession]=academy_v86_context($bid,$sid,$u);
                    academy_v86_fail(($latestSession['status']??'')==='scheduled','session_not_scheduled',409);
                    academy_delete_node_raw($pdo,$path);
                    if($action==='save')academy_insert_value_raw($pdo,$path,['url'=>$url,'provider'=>academy_m5_provider($url),'updatedAt'=>academy_now_ms(),'updatedBy'=>$uid],$uid);
                    $pdo->commit();
                }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
            }finally{academy_release_data_locks($pdo,$locks);}
            academy_audit($uid,'v86.room.'.$action,$bid,['sessionId'=>$sid]);
            academy_json(['ok'=>true,'ready'=>$action==='save']);
        }
        if($route==='/v86/student/join'&&$method==='POST'){
            academy_v86_fail($role==='student','forbidden',403);
            academy_rate_limit('v86-join-'.$uid,25,3600);
            $b=academy_body();$bid=academy_v84_id($b['requestId']??'');$sid=(string)($b['sessionId']??'');
            academy_v86_fail((bool)preg_match('/^s[0-9]{2}$/D',$sid),'invalid_session_id');
            [$booking,$plan,$s]=academy_v86_context($bid,$sid,$u);
            academy_v86_fail(academy_v86_can_join($booking,$plan,$s,$uid,time()),'private_join_not_allowed',403);
            $room=academy_read_node(academy_v86_room_path($bid,$sid));
            academy_v86_fail(is_array($room)&&!empty($room['url']),'meeting_link_not_ready',409);
            // Return invitation only to entitled student during join window. Never expose in listing.
            academy_json(['ok'=>true,'meetingUrl'=>$room['url'],'notice'=>'opening_external_service_not_attendance_confirmation']);
        }
        academy_v86_fail(false,'not_found',404);
    }catch(AcademyV84Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->httpStatus);}
}
