<?php
/** V36 — assessment question review and server-owned XP rewards. No secrets. */
declare(strict_types=1);
function academy_v36_exam_review(array $questions,array $answers): array {
    $review=[];
    foreach($questions as $i=>$q){
       $review[]=['question'=>$q['question'],'options'=>$q['options'],'correct'=>$q['correct'],'selected'=>$answers[$i],'isCorrect'=>$answers[$i]===$q['correct']];
    }
    return $review;
}
function academy_v36_quiz_xp(array $score): int {
    if(($score['questions']??0)<1)return 0;
    return 20+min(30,max(0,(int)floor((int)$score['percentage']/4)));
}
