<?php
/** V61: admin-only curriculum package preview/import; reuses existing V30/V29 storage. */
declare(strict_types=1);

function academy_v61_fail(string $message, int $status=422): never {
    academy_json(['ok'=>false,'error'=>'invalid_curriculum','message'=>$message],$status);
}
function academy_v61_text(mixed $value, int $max, string $label, bool $required=true): string {
    if (!is_string($value)) academy_v61_fail($label.' يجب أن يكون نصًا');
    $value=trim($value);
    if(($required&&$value==='')||(function_exists('mb_strlen')?mb_strlen($value,'UTF-8'):(function_exists('iconv_strlen')?iconv_strlen($value,'UTF-8'):strlen($value)))>$max)academy_v61_fail('راجع '.$label.' (الحد الأقصى '.$max.' حرفًا)');
    return $value;
}
function academy_v61_key(mixed $value,string $label): string {
    $key=academy_v61_text($value,90,$label);
    if(!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$/D',$key))academy_v61_fail($label.' يجب أن يضم أحرفًا إنجليزية أو أرقامًا أو _ أو -');
    return $key;
}
function academy_v61_url(mixed $value,string $label): string {
    if($value===null||$value==='')return '';
    $url=academy_v61_text($value,700,$label);
    $parts=parse_url($url);
    if(!is_array($parts)||!in_array(strtolower((string)($parts['scheme']??'')),['https','http'],true)||empty($parts['host'])||!filter_var($url,FILTER_VALIDATE_URL))academy_v61_fail('رابط غير صحيح في '.$label);
    return $url;
}
function academy_v61_prepare(mixed $raw, mixed $target=null): array {
    if(!is_array($raw)||array_is_list($raw))academy_v61_fail('يجب أن يكون الملف كائن JSON يحتوي على units');
    if(($raw['schemaVersion']??'')!=='egtaz-curriculum-v1')academy_v61_fail('نسخة القالب غير مدعومة: schemaVersion');
    // V63: an explicit admin-selected target overrides metadata in the JSON file.
    // Older V62 importers remain compatible when target is omitted.
    if($target!==null&&(!is_array($target)||array_is_list($target)))academy_v61_fail('وجهة الرفع غير صحيحة');
    $scopeData=$target??$raw;
    $type=(string)($scopeData['educationType']??'');$stage=(string)($scopeData['stage']??'');$grade=$scopeData['grade']??null;
    if(!in_array($type,['public','azhar'],true)||!in_array($stage,['primary','prep','sec'],true))academy_v61_fail('نوع التعليم أو المرحلة غير صحيح');
    $limit=$stage==='primary'?6:3;
    if(!is_int($grade)||$grade<1||$grade>$limit)academy_v61_fail('رقم الصف لا يناسب المرحلة');
    $sub=$scopeData['subject']??null;
    if(!is_array($sub)||array_is_list($sub))academy_v61_fail('subject يجب أن يحتوي على id و name');
    $subjectId=academy_v61_key($sub['id']??null,'رمز المادة');
    $subjectName=academy_v61_text($sub['name']??null,90,'اسم المادة');
    $units=$raw['units']??null;
    if(!is_array($units)||!array_is_list($units)||count($units)<1||count($units)>50)academy_v61_fail('عدد الوحدات يجب أن يكون من 1 إلى 50');
    $seenUnits=[];$seenKeys=[];$ready=[];$lessonTotal=0;$questionTotal=0;
    foreach($units as $ui=>$unit){
        $x=$ui+1;if(!is_array($unit)||array_is_list($unit))academy_v61_fail('الوحدة '.$x.' غير صحيحة');
        $number=$unit['number']??null;
        if(!is_int($number)||$number<1||$number>99||isset($seenUnits[$number]))academy_v61_fail('رقم الوحدة '.$x.' غير صحيح أو مكرر');
        $seenUnits[$number]=true;
        $unitName=academy_v61_text($unit['name']??null,100,'اسم الوحدة '.$x);
        $ls=$unit['lessons']??null;
        if(!is_array($ls)||!array_is_list($ls)||count($ls)<1)academy_v61_fail('الوحدة '.$x.' يجب أن تحتوي على درس واحد على الأقل');
        $items=[];
        foreach($ls as $li=>$lesson){
            $y=$li+1;$lessonTotal++;
            if($lessonTotal>150)academy_v61_fail('الحد الأقصى 150 درسًا في الملف الواحد');
            if(!is_array($lesson)||array_is_list($lesson))academy_v61_fail('بيانات الدرس '.$y.' غير صحيحة');
            $key=academy_v61_key($lesson['key']??null,'رمز الدرس '.$x.'-'.$y);
            if(isset($seenKeys[$key]))academy_v61_fail('رمز درس مكرر: '.$key);
            $seenKeys[$key]=true;
            $title=academy_v61_text($lesson['title']??null,140,'عنوان الدرس '.$key);
            $summary=academy_v61_text($lesson['summary']??'',400,'ملخص الدرس '.$key,false);
            $content=academy_v61_text($lesson['content']??null,50000,'شرح الدرس '.$key);
            $image=academy_v61_url($lesson['imageUrl']??'','صورة الدرس '.$key);
            $qs=$lesson['questions']??[];
            if(!is_array($qs)||!array_is_list($qs)||count($qs)>100)academy_v61_fail('عدد أسئلة الدرس '.$key.' لا يتجاوز 100');
            $questions=[];
            foreach($qs as $qi=>$q){
                $qn=$qi+1;$questionTotal++;
                if(!is_array($q)||array_is_list($q))academy_v61_fail('السؤال '.$qn.' غير صحيح في '.$key);
                $qtext=academy_v61_text($q['question']??null,1500,'نص السؤال '.$qn.' في '.$key);
                $options=$q['options']??null;
                if(!is_array($options)||!array_is_list($options)||count($options)<2||count($options)>6)academy_v61_fail('من 2 إلى 6 اختيارات للسؤال '.$qn.' في '.$key);
                $opts=[];foreach($options as $oi=>$option)$opts[]=academy_v61_text($option,500,'الاختيار '.($oi+1).' في '.$key);
                $answer=$q['correctAnswer']??null;
                if(!is_int($answer)||$answer<0||$answer>=count($opts))academy_v61_fail('رقم الإجابة الصحيحة للسؤال '.$qn.' في '.$key.' يبدأ من صفر');
                $questions[]=['question'=>$qtext,'options'=>$opts,'correctAnswer'=>$answer,'hint'=>academy_v61_text($q['hint']??'',1500,'تعليل السؤال '.$qn.' في '.$key,false)];
            }
            $items[]=['key'=>$key,'title'=>$title,'summary'=>$summary,'content'=>$content,'imageUrl'=>$image,'questions'=>$questions,'order'=>($li+1)*10];
        }
        $ready[]=['number'=>$number,'name'=>$unitName,'lessons'=>$items,'order'=>$x*10];
    }
    $fileScope=is_array($raw['subject']??null)?$raw['subject']:[];
    $different=$target!==null&&(($raw['educationType']??null)!==$type||($raw['stage']??null)!==$stage||($raw['grade']??null)!==$grade||($fileScope['id']??null)!==$subjectId);
    return ['type'=>$type,'stage'=>$stage,'grade'=>$grade,'subjectId'=>$subjectId,'subjectName'=>$subjectName,'sourceDifferent'=>$different,'units'=>$ready,'lessonsCount'=>$lessonTotal,'questionsCount'=>$questionTotal];
}
function academy_v61_route(string $route,string $method,PDO $pdo):void {
    if($route!=='/v61/admin/curriculum/import')return;
    if($method!=='POST')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
    $u=academy_current_user(true);
    if(($u['primary_role']??'')!=='admin'||($u['app_name']??'')!=='admin-portal')academy_json(['ok'=>false,'error'=>'forbidden'],403);
    academy_rate_limit('v61:import:'.$u['id'],120,3600);
    $body=academy_body();$mode=(string)($body['mode']??'preview');
    if(!in_array($mode,['preview','import'],true))academy_v61_fail('وضع التنفيذ غير معروف');
    $publish=($body['publish']??false)===true;
    $p=academy_v61_prepare($body['curriculum']??null,$body['target']??null);
    $type=$p['type'];$stage=$p['stage'];$grade=$p['grade'];$sid=$p['subjectId'];
    $scope=$type.'/'.$stage.'/'.$grade.'/'.$sid;
    $allLessonIds=[];$units=$p['units'];
    foreach($units as $unit)foreach($unit['lessons'] as $l){
        $id='ci_'.substr(hash('sha256',$scope.'|'.$l['key']),0,36);
        $allLessonIds[]=$id;
    }
    // Lock all affected top-level trees; guard preview/import from concurrent admins.
    try{$locks=academy_acquire_data_locks($pdo,['settings','customSubjects','lessons','quizzes']);}
    catch(RuntimeException $e){if($e->getMessage()==='academy_data_busy')academy_json(['ok'=>false,'error'=>'busy'],409);throw $e;}
    try{
        $existingLessons=academy_read_node('lessons');if(!is_array($existingLessons))$existingLessons=[];
        $existingQuiz=academy_read_node('quizzes');if(!is_array($existingQuiz))$existingQuiz=[];
        $existingUnits=academy_read_node('settings/curriculumUnits/'.$scope);if(!is_array($existingUnits))$existingUnits=[];
        $subjectRoot=academy_read_node('customSubjects/'.$stage.'/'.$grade);if(!is_array($subjectRoot))$subjectRoot=[];
        $createdUnits=0;$skippedUnits=0;$addedLessons=0;$skippedLessons=0;$addedQuizzes=0;$skippedQuizzes=0;
        $toWrite=[];$already=[];$now=academy_now_ms();
        $subjectPresent=false;
        foreach($subjectRoot as $row)if(is_array($row)&&($row['id']??'')===$sid&&(!isset($row['type'])||$row['type']===$type)){$subjectPresent=true;break;}
        // Do not override built-in subject labels or ordering in the existing V30 UI.
        $builtin=['public'=>['primary'=>['arabic','math','science','english','social','religion'],'prep'=>['arabic','math','science','english','social','computer'],'sec'=>['arabic','english','math','physics','chemistry','biology','history','geography']], 'azhar'=>['primary'=>['arabic','math','english','science','quran','religion'],'prep'=>['arabic','math','english','science','quran','fiqh','tawhid','hadith','tafsir'],'sec'=>['arabic','math','english','quran','fiqh','tawhid','hadith','tafsir','nahw','sarf','balagha']]];
        if(!$subjectPresent&&!in_array($sid,$builtin[$type][$stage],true)){$subKey=$type.'__'.$sid;$toWrite['customSubjects/'.$stage.'/'.$grade.'/'.$subKey]=['id'=>$sid,'name'=>$p['subjectName'],'type'=>$type,'stage'=>$stage,'grade'=>(string)$grade,'order'=>100,'isHidden'=>false,'createdAt'=>$now,'updatedAt'=>$now];}
        foreach($units as $unit){
            $n=$unit['number'];
            if(isset($existingUnits[(string)$n]))$skippedUnits++;
            else{$createdUnits++;$toWrite['settings/curriculumUnits/'.$scope.'/'.$n]=['number'=>$n,'name'=>$unit['name'],'imageUrl'=>'','order'=>$unit['order'],'isHidden'=>false,'updatedAt'=>$now];}
            foreach($unit['lessons'] as $l){
                $id='ci_'.substr(hash('sha256',$scope.'|'.$l['key']),0,36);
                // Re-imports never erase edits; matching manual lessons also stay untouched.
                $existingId=null;
                if(isset($existingLessons[$id]))$existingId=$id;
                else foreach($existingLessons as $oldId=>$old){
                    if(!is_array($old))continue;
                    if(($old['type']??'public')===$type&&($old['stage']??'')===$stage&&(int)($old['grade']??0)===$grade&&($old['subject']??'')===$sid&&(int)($old['unit']??0)===$n&&trim((string)($old['title']??''))===$l['title']){$existingId=(string)$oldId;break;}
                }
                if($existingId!==null){
                    $skippedLessons++;$already[]=['title'=>$l['title'],'id'=>$existingId];
                    if(count($l['questions'])>0){
                        $quizExists=false;
                        foreach($existingQuiz as $q)if(is_array($q)&&($q['lessonId']??'')===$existingId){$quizExists=true;break;}
                        if($quizExists){$skippedQuizzes++;}
                        else {
                            // A prior manual/imported lesson without an existing quiz may receive
                            // its first quiz without rewriting its text, videos or progress.
                            $quizId='cq_'.substr(hash('sha256',$scope.'|'.$l['key']),0,36);
                            if(!isset($existingQuiz[$quizId])){
                                $addedQuizzes++;
                                $toWrite['quizzes/'.$quizId]=['name'=>'اختبار: '.$l['title'],'title'=>'اختبار: '.$l['title'],'lessonId'=>$existingId,'academicYear'=>'','type'=>$type,'stage'=>$stage,'grade'=>(string)$grade,'subject'=>$sid,'questions'=>$l['questions'],'assessmentMode'=>'practice','workflowStatus'=>$publish?'published':'draft','reviewStatus'=>'approved','isHidden'=>!$publish,'isFree'=>true,'importVersion'=>'v61','createdAt'=>$now,'updatedAt'=>$now];
                            }else $skippedQuizzes++;
                        }
                    }
                    continue;
                }
                $addedLessons++;
                $toWrite['lessons/'.$id]=['title'=>$l['title'],'summary'=>$l['summary'],'content'=>$l['content'],'contentFormat'=>'html','type'=>$type,'stage'=>$stage,'grade'=>(string)$grade,'subject'=>$sid,'unit'=>$n,'order'=>$l['order'],'videos'=>[],'files'=>[],'imageUrl'=>$l['imageUrl'],'teacherId'=>'','isFree'=>true,'academicYear'=>'','isHidden'=>!$publish,'workflowStatus'=>$publish?'published':'draft','reviewStatus'=>'approved','importKey'=>$l['key'],'importVersion'=>'v61','createdAt'=>$now,'updatedAt'=>$now];
                if(count($l['questions'])>0){
                    $quizId='cq_'.substr(hash('sha256',$scope.'|'.$l['key']),0,36);
                    if(isset($existingQuiz[$quizId])){$skippedQuizzes++;continue;}
                    $addedQuizzes++;
                    $toWrite['quizzes/'.$quizId]=['name'=>'اختبار: '.$l['title'],'title'=>'اختبار: '.$l['title'],'lessonId'=>$id,'academicYear'=>'','type'=>$type,'stage'=>$stage,'grade'=>(string)$grade,'subject'=>$sid,'questions'=>$l['questions'],'assessmentMode'=>'practice','workflowStatus'=>$publish?'published':'draft','reviewStatus'=>'approved','isHidden'=>!$publish,'isFree'=>true,'importVersion'=>'v61','createdAt'=>$now,'updatedAt'=>$now];
                }
            }
        }
        $summary=['units'=>$createdUnits,'existingUnits'=>$skippedUnits,'lessons'=>$addedLessons,'existingLessons'=>$skippedLessons,'quizzes'=>$addedQuizzes,'existingQuizzes'=>$skippedQuizzes,'questionsInFile'=>$p['questionsCount'],'subject'=>$p['subjectName'],'stage'=>$stage,'grade'=>$grade,'educationType'=>$type,'publish'=>$publish,'sourceScopeDifferent'=>($p['sourceDifferent']??false),'existingPreview'=>array_slice($already,0,12)];
        if($mode==='preview')academy_json(['ok'=>true,'mode'=>'preview','summary'=>$summary]);
        // Insert only new nodes, in a single SQL transaction. No overwrite or deletion.
        $pdo->beginTransaction();
        try{
            foreach($toWrite as $path=>$value)academy_insert_value_raw($pdo,$path,$value,$u['id']);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        academy_audit($u['id'],'curriculum.quick_import',$scope,['units'=>$createdUnits,'lessons'=>$addedLessons,'quizzes'=>$addedQuizzes,'published'=>$publish]);
        academy_json(['ok'=>true,'mode'=>'import','summary'=>$summary]);
    }finally{academy_release_data_locks($pdo,$locks);}
}
