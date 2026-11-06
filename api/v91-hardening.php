<?php
declare(strict_types=1);
/**
 * V91 operational hardening: stop the SAME manual collection reference being
 * booked as cash received on two separate teacher requests.
 *
 * The source of truth remains the administrator's verified payment record.
 * This check does not verify receipt with a bank/payment provider.
 */
function academy_v91_payment_key(string $reference): string {
    return hash('sha256', strtolower(trim($reference)));
}
function academy_v91_assert_unique_payment(PDO $pdo,string $bookingId,string $reference): void {
    $ref=trim($reference);
    academy_v84_check(mb_strlen($ref)>=4,'payment_reference_required');
    $indexed=academy_read_node('v91PaymentRefs/'.academy_v91_payment_key($ref));
    // Refuse duplicates even when the index belongs to the same booking: the
    // state machine is responsible for idempotency/transition rules.
    academy_v84_check($indexed===null,'duplicate_payment_reference',409);
    // Historical V84 payments predate this index: check them too, so installing
    // V91 does not permit reusing a previously recorded collection reference.
    // The v84Requests advisory lock is held by the caller throughout this scan.
    $st=$pdo->prepare("SELECT path FROM academy_data WHERE path LIKE 'v84Requests/%/paymentReference' AND LOWER(value_json)=LOWER(?)");
    $encoded=json_encode($ref,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    $st->execute([$encoded]);
    foreach($st->fetchAll(PDO::FETCH_COLUMN) as $path){
        if(preg_match('~^v84Requests/[a-f0-9]{24}/paymentReference$~D',(string)$path)===1){
            academy_v84_check(false,'duplicate_payment_reference',409);
        }
    }
}
