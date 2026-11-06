<?php
declare(strict_types=1);

/** Conditional reads only. Call AFTER the existing ACL and response filters. */
function academy_v95_read_json(?array $user, string $path, mixed $value): never {
    $body = json_encode(['ok'=>true, 'path'=>$path, 'value'=>$value], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    if ($body === false) throw new RuntimeException('read_response_encoding_failed');
    // Bind the validator to the account, portal and final permitted response.
    // Never validate against raw database rows or a timestamp alone.
    $identity = (string)($user['id']??'guest').'|'.(string)($user['app_name']??'');
    $secret = (string)(academy_config()['app']['app_secret']??'');
    $etag = '"'.hash_hmac('sha256', $identity.'|'.$path.'|'.$body, $secret).'"';
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store');
    header('Vary: Origin, Authorization');
    header('ETag: '.$etag);
    header('Access-Control-Expose-Headers: ETag');
    $validator = trim((string)($_SERVER['HTTP_IF_NONE_MATCH']??''));
    if ($validator !== '' && hash_equals($etag, $validator)) {
        http_response_code(304);
        exit;
    }
    echo $body;
    exit;
}
