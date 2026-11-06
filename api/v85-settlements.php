<?php
declare(strict_types=1);
/** EGTAZ V85: manual fulfillment/refund/payout ledger. NO payment transfers here. */
function academy_v85_fail(bool $condition,string $message,int $status=422): void {
    if (!$condition) throw new AcademyV84Error($message,$status);
}
function academy_v85_amount(mixed $input): int {
    academy_v85_fail(is_string($input)||is_int($input),'amount_invalid');
    $s=trim((string)$input);
    academy_v85_fail((bool)preg_match('/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/D',$s),'amount_invalid');
    $parts=explode('.',$s);
    $value=(int)$parts[0]*100+(int)str_pad($parts[1]??'0',2,'0');
    academy_v85_fail($value>=1&&$value<=5000000,'amount_invalid');
    return $value;
}
function academy_v85_share(int $total,int $n,int $i): int {
    return intdiv($total,$n)+($i<($total%$n)?1:0);
}
function academy_v85_sums(array $booking,array $plan): array {
    $price=(int)($booking['pricePiasters']??0);
    $percent=(int)($booking['commissionPercent']??0);
    $due=(int)($booking['teacherDuePiasters']??0);
    $sessions=$plan['sessions']??[];
    $delivered=0;$earned=0;$completeCount=0;$cancelled=0;
    foreach($sessions as $s) {
        if(($s['status']??'')==='completed') {$delivered+=(int)$s['grossPiasters'];$earned+=(int)$s['teacherDuePiasters'];$completeCount++;}
        if(($s['status']??'')==='cancelled')$cancelled++;
    }
    $refunded=array_sum(array_map(static fn($x)=>(int)($x['amountPiasters']??0),$plan['refunds']??[]));
    $paidOut=array_sum(array_map(static fn($x)=>(int)($x['amountPiasters']??0),$plan['payouts']??[]));
    $net=max(0,$price-$refunded);
    $maxTeacher=max(0,$net-academy_v84_commission($net,$percent));
    $entitled=min($earned,$maxTeacher);
    return ['totalPiasters'=>$price,'refundedPiasters'=>$refunded,'netCollectedPiasters'=>$net,'paidOutPiasters'=>$paidOut,
       'teacherEarnedPiasters'=>$entitled,'teacherAvailablePiasters'=>max(0,$entitled-$paidOut),'teacherOverpaymentPiasters'=>max(0,$paidOut-$entitled),
       'commissionRealizedPiasters'=>max(0,min($net,$delivered)-$entitled),'cashHeldPiasters'=>max(0,$net-$paidOut),'unfulfilledLiabilityPiasters'=>max(0,$net-min($net,$delivered)),'deliveredGrossPiasters'=>$delivered,
       'completedSessions'=>$completeCount,'cancelledSessions'=>$cancelled,'totalSessions'=>count($sessions),
       'refundBalancePiasters'=>$price-$refunded,'unearnedTeacherPiasters'=>max(0,$due-$earned)];
}
function academy_v85_ledger(array $booking,int $count,string $uid): array {
    $price=(int)$booking['pricePiasters'];$due=(int)$booking['teacherDuePiasters'];
    academy_v85_fail($price>0&&$due>=0,'booking_not_priced',409);
    $sessions=[];$alreadyFulfilled=($booking['status']??'')==='fulfilled';
    if($alreadyFulfilled)academy_v85_fail($count===1,'legacy_booking_one_session_only',409);
    for($i=0;$i<$count;$i++){
        $id='s'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT);
        $sessions[$id]=['id'=>$id,'number'=>$i+1,'status'=>$alreadyFulfilled?'completed':'unscheduled',
           'startsAt'=>null,'durationMinutes'=>null,'grossPiasters'=>academy_v85_share($price,$count,$i),
           'teacherDuePiasters'=>academy_v85_share($due,$count,$i),
           'completedAt'=>$alreadyFulfilled?((int)($booking['fulfilledAt']??academy_now_ms())):null];
    }
    return ['id'=>$booking['id'],'teacherId'=>$booking['teacherId'],'studentId'=>$booking['studentId'],'createdAt'=>academy_now_ms(),
        'createdBy'=>$uid,'updatedAt'=>academy_now_ms(),'revision'=>1,'sessions'=>$sessions,'refunds'=>[],'payouts'=>[],
        'events'=>[['action'=>'enable','at'=>academy_now_ms(),'actorId'=>$uid]]];
}
function academy_v85_datetime(mixed $v): string {
    academy_v85_fail(is_string($v)&&preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/D',$v)===1,'invalid_session_datetime');
    $dt=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.v\Z',$v,new DateTimeZone('UTC'));
    academy_v85_fail($dt!==false&&$dt->format('Y-m-d\TH:i:s.v\Z')===$v,'invalid_session_datetime');
    $t=$dt->getTimestamp();
    academy_v85_fail($t>=time()-90*86400&&$t<=time()+366*86400,'session_date_out_of_range');
    return $v;
}
function academy_v85_mutation(array &$booking,?array &$plan,string $action,array $b,string $uid): void {
    academy_v85_fail(in_array((string)($booking['status']??''),['paid','fulfilled'],true),'booking_not_paid_or_legacy_settled',409);
    if($action==='enable') {
        academy_v85_fail($plan===null,'already_enabled',409);
        $count=filter_var($b['sessionCount']??null,FILTER_VALIDATE_INT);
        academy_v85_fail($count!==false&&$count>=1&&$count<=24,'invalid_session_count');
        $plan=academy_v85_ledger($booking,$count,$uid);return;
    }
    academy_v85_fail(is_array($plan),'finance_not_enabled',409);
    $sessionId=(string)($b['sessionId']??'');
    if(in_array($action,['schedule','complete','cancel_session'],true)) {
        academy_v85_fail(isset($plan['sessions'][$sessionId]),'unknown_session',404);
        $s=&$plan['sessions'][$sessionId];
        if($action==='schedule') {
            academy_v85_fail(in_array($s['status'],['unscheduled','scheduled'],true),'session_locked',409);
            $s['startsAt']=academy_v85_datetime($b['startsAt']??null);
            $duration=filter_var($b['durationMinutes']??null,FILTER_VALIDATE_INT);
            academy_v85_fail($duration!==false&&$duration>=15&&$duration<=240,'invalid_duration');
            $s['durationMinutes']=$duration;$s['status']='scheduled';
        } elseif($action==='complete') {
            academy_v85_fail($s['status']==='scheduled','session_not_scheduled',409);
            academy_v85_fail((strtotime((string)$s['startsAt'])?:PHP_INT_MAX)<=time(),'session_not_started',409);
            academy_v85_fail(($b['verified']??false)===true,'completion_not_verified');
            $note=academy_v84_clean($b['note']??'',300);academy_v85_fail(mb_strlen($note)>=4,'completion_note_required');
            $s['completedAt']=academy_now_ms();$s['completedBy']=$uid;$s['completionNote']=$note;$s['status']='completed';
        } else {
            academy_v85_fail(in_array($s['status'],['unscheduled','scheduled'],true),'session_locked',409);
            $reason=academy_v84_clean($b['note']??'',300);academy_v85_fail(mb_strlen($reason)>=4,'cancellation_reason_required');
            $s['status']='cancelled';$s['cancelledAt']=academy_now_ms();$s['cancellationNote']=$reason;
        }
        unset($s);
    }elseif(in_array($action,['refund','payout'],true)) {
        academy_v85_fail(($b['verified']??false)===true,'transaction_not_verified');
        $reference=academy_v84_clean($b['reference']??'',100);
        academy_v85_fail(mb_strlen($reference)>=4,'transaction_reference_required');
        $note=academy_v84_clean($b['note']??'',300);
        academy_v85_fail(mb_strlen($note)>=4,'transaction_reason_required');
        foreach(array_merge($plan['refunds']??[],$plan['payouts']??[]) as $entry)
            academy_v85_fail(mb_strtolower($entry['reference'])!==mb_strtolower($reference),'duplicate_transaction_reference',409);
        academy_v85_fail(mb_strtolower($reference)!==mb_strtolower((string)($booking['paymentReference']??'')),'duplicate_transaction_reference',409);
        $amount=academy_v85_amount($b['amount']??'');$stats=academy_v85_sums($booking,$plan);
        if($action==='refund')academy_v85_fail($amount<=$stats['refundBalancePiasters'],'refund_exceeds_collected',409);
        else {
            academy_v85_fail($stats['teacherOverpaymentPiasters']===0,'teacher_recovery_required',409);
            academy_v85_fail($amount<=$stats['teacherAvailablePiasters'],'payout_exceeds_earned',409);
        }
        $entry=['id'=>bin2hex(random_bytes(8)),'reference'=>$reference,'amountPiasters'=>$amount,
           'note'=>$note,'verifiedBy'=>$uid,'at'=>academy_now_ms()];
        $key=$action==='refund'?'refunds':'payouts';$plan[$key][]=$entry;
        $stats=academy_v85_sums($booking,$plan);
        if($action==='refund'&&$stats['teacherOverpaymentPiasters']>0)
            $plan['teacherRecoveryAlertAt']=academy_now_ms();
    }else academy_v85_fail(false,'invalid_action');
    $plan['revision']=(int)($plan['revision']??0)+1;$plan['updatedAt']=academy_now_ms();
    $plan['events']=array_slice(array_merge($plan['events']??[],[['action'=>$action,'at'=>$plan['updatedAt'],'actorId'=>$uid]]),-80);
}
function academy_v85_admin_update(PDO $pdo,string $id,string $action,array $body,string $uid): array {
    $locks=academy_acquire_data_locks($pdo,['v84Requests/'.$id,'v85Plans/'.$id]);
    try {
        $pdo->beginTransaction();
        try {
            $booking=academy_v84_record($id);
            $plan=academy_read_node('v85Plans/'.$id);if(!is_array($plan))$plan=null;
            academy_v85_mutation($booking,$plan,$action,$body,$uid);
            $stats=academy_v85_sums($booking,$plan);
            $remainingUnfinished=$stats['totalSessions']-$stats['completedSessions']-$stats['cancelledSessions'];
            $booking['v85Stage']=$stats['teacherOverpaymentPiasters']>0?'recovery_required':
                ($stats['refundBalancePiasters']===0?'fully_refunded':
                ($remainingUnfinished===0&&$stats['teacherAvailablePiasters']===0&&$stats['unfulfilledLiabilityPiasters']===0?'fully_reconciled':
                ($remainingUnfinished===0&&$stats['unfulfilledLiabilityPiasters']>0?'refund_review':
                ($stats['completedSessions']>0?'in_progress':'planned'))));
            $booking['updatedAt']=academy_now_ms();
            academy_delete_node_raw($pdo,'v85Plans/'.$id);
            academy_insert_value_raw($pdo,'v85Plans/'.$id,$plan,$uid);
            academy_delete_node_raw($pdo,'v84Requests/'.$id);
            academy_insert_value_raw($pdo,'v84Requests/'.$id,$booking,$uid);
            $pdo->commit();
            return ['booking'=>$booking,'plan'=>$plan,'totals'=>academy_v85_sums($booking,$plan)];
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }finally {academy_release_data_locks($pdo,$locks);}
}
function academy_v85_view(array $booking,?array $plan,string $role): array {
    $base=['id'=>$booking['id'],'status'=>$booking['status'],'subject'=>$booking['subject']??'',
       'teacherName'=>$booking['teacherName']??'','pricePiasters'=>$booking['pricePiasters']??null];
    if($plan===null){$base['enabled']=false;return $base;}
    $totals=academy_v85_sums($booking,$plan);
    $base['enabled']=true;$base['sessions']=array_values($plan['sessions']??[]);
    $base['totals']=$totals;
    if($role==='admin'){$base['refunds']=$plan['refunds']??[];$base['payouts']=$plan['payouts']??[];$base['events']=$plan['events']??[];}
    else {
        foreach($base['sessions'] as &$s)unset($s['completedBy'],$s['completionNote'],$s['cancellationNote']);unset($s);
        // Student and teacher can see dates/statuses. Student sees only paid/refunded summary, not commission/payouts.
        if($role==='student')foreach(['teacherEarnedPiasters','teacherAvailablePiasters','teacherOverpaymentPiasters','commissionRealizedPiasters','paidOutPiasters','unearnedTeacherPiasters'] as $k)unset($base['totals'][$k]);
        if($role==='student')foreach($base['sessions'] as &$s)unset($s['teacherDuePiasters']);unset($s);
    }
    return $base;
}
function academy_v85_route(string $route,string $method,PDO $pdo): void {
    if(!str_starts_with($route,'/v85/'))return;
    try {
        $u=academy_v84_role();$role=(string)$u['primary_role'];$uid=(string)$u['id'];
        academy_rate_limit('v85-'.$uid,100,3600);
        if($method==='GET'&&$route==='/v85/detail') {
            $id=academy_v84_id($_GET['id']??'');$booking=academy_v84_record($id);
            if($role==='student')academy_v85_fail(($booking['studentId']??'')===$uid,'forbidden',403);
            if($role==='teacher')academy_v85_fail(($booking['teacherId']??'')===$uid,'forbidden',403);
            $plan=academy_read_node('v85Plans/'.$id);
            academy_json(['ok'=>true,'detail'=>academy_v85_view($booking,is_array($plan)?$plan:null,$role)]);
        }
        if($method==='POST'&&$route==='/v85/admin/action') {
            academy_v85_fail($role==='admin','forbidden',403);
            academy_rate_limit('v85-write-'.$uid,30,3600);
            $body=academy_body();$id=academy_v84_id($body['id']??'');$action=(string)($body['action']??'');
            $out=academy_v85_admin_update($pdo,$id,$action,$body,$uid);
            academy_audit($uid,'v85.'.$action,$id,['revision'=>$out['plan']['revision']]);
            academy_json(['ok'=>true,'detail'=>academy_v85_view($out['booking'],$out['plan'],'admin')]);
        }
        academy_v85_fail(false,'not_found',404);
    }catch(AcademyV84Error $e){academy_json(['ok'=>false,'error'=>$e->getMessage()],$e->httpStatus);}
}
