<?php
declare(strict_types=1);
/*
 * V101 — lightweight housekeeping for technical tables that otherwise grow forever.
 * Runs on roughly 1 in 200 API requests, deletes at most 500 rows per table per run,
 * and never touches user data, content, results or the audit log.
 *  - academy_rate_limits: windows older than 2 days (the longest limit window in the code is 1 day).
 *  - academy_sessions: rows that expired or were revoked more than 30 days ago (they can no longer log in).
 *  - academy_password_resets: links that expired more than 7 days ago (each link is valid for 1 hour).
 * Failures are logged and swallowed so housekeeping can never break a user request.
 */
function academy_v101_housekeeping(PDO $pdo, bool $force=false): array {
    if(!$force && random_int(1,200)!==1) return [];
    $done=[];
    $jobs=[
        'rate_limits'=>'DELETE FROM academy_rate_limits WHERE window_started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) LIMIT 500',
        'sessions'=>'DELETE FROM academy_sessions WHERE (expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) LIMIT 500',
        'password_resets'=>'DELETE FROM academy_password_resets WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) LIMIT 500',
    ];
    foreach($jobs as $name=>$sql){
        try{$done[$name]=(int)$pdo->exec($sql);}
        catch(Throwable $e){error_log('[academy-api] housekeeping '.$name.': '.$e->getMessage());}
    }
    return $done;
}
