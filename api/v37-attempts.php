<?php
/** V37 — idempotent quiz attempts. Sensitive review is available only after saving. */
declare(strict_types=1);
function academy_v37_answers_hash(mixed $answers): string {
    if(!is_array($answers)||!array_is_list($answers)||count($answers)<1||count($answers)>100)throw new InvalidArgumentException('answers_invalid');
    foreach($answers as $n)if(!is_int($n)||$n<0||$n>5)throw new InvalidArgumentException('answers_invalid');
    return hash('sha256',json_encode($answers,JSON_THROW_ON_ERROR));
}
function academy_v37_assert_retry(array $stored,string $lessonId,string $quizId,string $sourceType,mixed $answers): void {
    if((string)($stored['quizId']??'')!==$quizId||(string)($stored['lessonId']??'')!==$lessonId||
       (isset($stored['sourceType'])&&(string)$stored['sourceType']!==$sourceType))throw new DomainException('attempt_conflict');
    // Hash is absent only on attempts created before V37, whose answer choices were not retained.
    if(isset($stored['answersHash'])&&!hash_equals((string)$stored['answersHash'],academy_v37_answers_hash($answers)))throw new DomainException('attempt_conflict');
}
function academy_v37_retry_payload(array $stored): array {
    $review=is_array($stored['reviewV37']??null)?$stored['reviewV37']:null;
    unset($stored['answersHash'],$stored['reviewV37']);
    return ['ok'=>true,'result'=>$stored,'review'=>$review,'xpEarned'=>0,'reused'=>true];
}
