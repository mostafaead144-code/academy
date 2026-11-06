<?php
/** V29 phase 2: side-effect-free quiz normalization, server-side scoring, input validation. */
declare(strict_types=1);
function academy_v29_questions(mixed $raw): array {
    $out=[];
    foreach (academy_list_values($raw) as $q) {
        if (!is_array($q)) continue;
        $text=trim((string)($q['question']??$q['text']??$q['q']??''));
        $choices=academy_list_values($q['options']??$q['opts']??[]);
        $options=[];
        foreach ($choices as $choice) {
            if (is_array($choice)) $choice=$choice['text']??$choice['label']??$choice['value']??'';
            if (!is_scalar($choice)) { $options=[];break; }
            $options[]=trim((string)$choice);
        }
        if ($text===''||count($options)<2||count($options)>6||in_array('', $options, true)) continue;
        $answer=$q['correctAnswer']??$q['correct']??$q['answerIndex']??$q['answer']??null;
        if ($answer===null||$answer==='') continue;
        $index=-1;
        if (is_int($answer)||(is_string($answer)&&preg_match('/^\d+$/D',$answer))) $index=(int)$answer;
        else $index=array_search((string)$answer,$options,true);
        if ($index===false||$index<0||$index>=count($options))continue;
        $out[]=['question'=>$text,'options'=>$options,'correct'=>(int)$index];
        if(count($out)>=100)break;
    }
    return $out;
}
function academy_v29_score(array $questions, mixed $answers): array {
    if (!is_array($answers)||!array_is_list($answers)||count($answers)!==count($questions)) throw new InvalidArgumentException('answers_invalid');
    $correct=0;
    foreach ($answers as $i=>$answer) {
        if (!is_int($answer)||$answer<0||$answer>=count($questions[$i]['options']))throw new InvalidArgumentException('answers_invalid');
        if ($answer===$questions[$i]['correct'])$correct++;
    }
    return ['score'=>$correct,'questions'=>count($questions),'percentage'=>count($questions)?(int)round(100*$correct/count($questions)):0];
}
