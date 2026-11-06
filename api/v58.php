<?php
/** V58: non-destructive, admin-only educational content diagnostics. */
declare(strict_types=1);

function academy_v58_text(mixed $value,int $limit=150): string {
    if(!is_scalar($value))return '';
    return mb_substr(trim(preg_replace('/\s+/u',' ',strip_tags((string)$value))??''),0,$limit);
}
function academy_v58_normalize(mixed $value): string {
    $text=mb_strtolower(academy_v58_text($value,600),'UTF-8');
    $text=preg_replace('/[\x{064B}-\x{065F}\x{0670}]/u','',$text)??$text;
    return trim(preg_replace('/[\p{P}\p{S}\s]+/u',' ', $text)??'');
}
function academy_v58_link_status(mixed $value): string {
    if(!is_string($value)||trim($value)==='')return 'empty';
    $url=trim($value);
    // Relative paths are legal for first-party resources; no HTTP checks or SSRF.
    if(str_starts_with($url,'./')||str_starts_with($url,'/')&&!str_starts_with($url,'//'))return 'relative';
    $parts=parse_url($url);
    if(!is_array($parts))return 'invalid';
    if(!in_array(strtolower((string)($parts['scheme']??'')),['http','https'],true)||empty($parts['host'])||filter_var($url,FILTER_VALIDATE_URL)===false)return 'invalid';
    return strtolower((string)$parts['scheme'])==='http'?'http':'unverified';
}
function academy_v58_item(string $kind,string $id,string $label,string $type,string $severity,string $message): array {
    return ['kind'=>$kind,'id'=>mb_substr($id,0,120),'title'=>academy_v58_text($label),'type'=>$type,'severity'=>$severity,'message'=>$message];
}
function academy_v58_questions(mixed $raw): array {
    if(!is_array($raw))return [];
    // Legacy questions may be keyed by id. Normalized V57 questions are lists.
    return array_values(array_filter(array_values($raw),'is_array'));
}
function academy_v58_report(array $lessons,array $quizzes,array $files,array $teacherContents,array $bank=[],int $limit=1500): array {
    $issues=[];$totals=['lessons'=>0,'quizzes'=>0,'files'=>0,'questions'=>0,'bank'=>0,'teacherPackages'=>0];
    $seen=[];$duplicateGroups=[];$scanLimit=max(50,min(3000,$limit));$truncated=[];
    $summary=['high'=>0,'medium'=>0,'low'=>0];$omittedIssues=0;$priority=['high'=>0,'medium'=>1,'low'=>2];
    $add=static function(array $issue) use (&$issues,&$summary,&$omittedIssues,$priority):void {
        $s=$issue['severity']??'medium';$summary[$s]=($summary[$s]??0)+1;
        if(count($issues)<300){$issues[]=$issue;return;}
        $omittedIssues++;$worst=-1;$worstRank=-1;
        foreach($issues as $i=>$existing){$rank=$priority[$existing['severity']??'medium']??9;if($rank>$worstRank){$worstRank=$rank;$worst=$i;}}
        if($worst>=0&&($priority[$s]??9)<$worstRank)$issues[$worst]=$issue;
    };
    $normal=static function(mixed $text,string $subject,string $stage,string $grade,string $type,string $ref) use (&$seen,&$duplicateGroups):void {
        $normalized=academy_v58_normalize($text);
        if(mb_strlen($normalized)<12)return;
        $key=hash('sha256',implode('|',[$type,$stage,$grade,$subject,$normalized]));
        if(isset($seen[$key])){
            if(!isset($duplicateGroups[$key]))$duplicateGroups[$key]=['first'=>$seen[$key],'matches'=>[],'text'=>academy_v58_text($text,100)];
            if(count($duplicateGroups[$key]['matches'])<5)$duplicateGroups[$key]['matches'][]=$ref;
        }else $seen[$key]=$ref;
    };
    $scope=static fn(array $x):array=>[(string)($x['subject']??''),(string)($x['stage']??''),(string)($x['grade']??''),(string)($x['type']??$x['education_type']??'')];
    $links=static function(string $kind,string $id,string $label,array $row,array $keys)use($add):void{
        foreach($keys as $key){
            $url=$row[$key]??null;
            if(!is_string($url)||trim($url)==='')continue;
            $status=academy_v58_link_status($url);
            if($status==='invalid')$add(academy_v58_item($kind,$id,$label,'invalid_link','high','صيغة رابط '. $key .' غير صحيحة أو غير مسموح بها؛ راجعه يدويًا.'));
            elseif($status==='http')$add(academy_v58_item($kind,$id,$label,'insecure_link','low','الرابط '. $key .' يستخدم HTTP غير المشفر؛ تحقق من وجود نسخة HTTPS.'));
        }
    };
    $media=static function(string $kind,string $id,string $label,mixed $value)use($links):bool{
        if(!is_array($value))return false;
        $has=false;$i=0;
        foreach($value as $entry){if(++$i>30)break;
            if(is_string($entry)){$entry=['url'=>$entry];}
            if(!is_array($entry))continue;
            if(array_filter([$entry['url']??null,$entry['href']??null,$entry['fileUrl']??null],fn($u)=>is_string($u)&&trim($u)!==''))$has=true;
            $links($kind,$id,$label,$entry,['url','href','fileUrl','videoUrl']);
        }
        return $has;
    };
    $last=0;
    foreach($teacherContents as $lessonId=>$teachers){if(++$last>$scanLimit){$truncated[]='teacherContentsV6';break;}
        if(!is_array($teachers))continue;
        foreach($teachers as $teacherId=>$package){if(!is_array($package))continue;
            $totals['teacherPackages']++;
            if(!isset($lessons[$lessonId]))$add(academy_v58_item('teacher-package',(string)$lessonId,'محتوى معلم مرتبط بدرس مفقود','orphan_package','high','هذا المحتوى يشير إلى درس غير موجود.'));
        }
    }
    $count=0;
    foreach($lessons as $id=>$lesson){if(++$count>$scanLimit){$truncated[]='lessons';break;}
        if(!is_array($lesson))continue;$totals['lessons']++;
        $id=(string)$id;$name=academy_v58_text($lesson['title']??$lesson['name']??'درس بلا عنوان');
        if($name==='')$add(academy_v58_item('lesson',$id,'درس بلا عنوان','missing_title','high','أضف عنوانًا واضحًا للدرس.'));
        if(empty($lesson['stage'])||empty($lesson['grade'])||empty($lesson['subject']))$add(academy_v58_item('lesson',$id,$name,'missing_scope','high','الدرس لا يحتوي على بيانات المرحلة أو الصف أو المادة كاملة.'));
        if(!empty($lesson['isHidden'])||in_array((string)($lesson['workflowStatus']??''),['draft','hidden'],true))continue;
        $ownContent=trim(strip_tags((string)($lesson['content']??$lesson['description']??$lesson['explanation']??'')))!=='';
        $hasMedia=$media('lesson',$id,$name,$lesson['videos']??[]);
        $packageContent=false;
        $packs=$teacherContents[$id]??[];
        if(is_array($packs))foreach($packs as $tid=>$pkg){if(!is_array($pkg))continue;
            if(trim(strip_tags((string)($pkg['content']??'')))!=='')$packageContent=true;
            if($media('teacher-package',$id,$name,$pkg['videos']??[]))$packageContent=true;
            $links('teacher-package',$id,$name,$pkg,['fileUrl','videoUrl']);
        }
        if(!$ownContent&&!$hasMedia&&!$packageContent)$add(academy_v58_item('lesson',$id,$name,'missing_explanation','medium','الدرس ظاهر ولكنه لا يحتوي على شرح نصي أو فيديو في محتواه الحالي.'));
        $links('lesson',$id,$name,$lesson,['videoUrl','imageUrl','fileUrl']);
    }
    $count=0;
    foreach($quizzes as $id=>$quiz){if(++$count>$scanLimit){$truncated[]='quizzes';break;}
        if(!is_array($quiz))continue;$totals['quizzes']++;
        $id=(string)$id;$name=academy_v58_text($quiz['title']??$quiz['name']??'اختبار بلا عنوان');
        if($name==='')$add(academy_v58_item('quiz',$id,'اختبار بلا عنوان','missing_title','high','يحتاج الاختبار إلى عنوان واضح.'));
        $lessonId=(string)($quiz['lessonId']??'');
        if($lessonId!==''&&!isset($lessons[$lessonId]))$add(academy_v58_item('quiz',$id,$name,'orphan_quiz','high','الاختبار مربوط بمعرّف درس لم يعد موجودًا.'));
        $questions=academy_v58_questions($quiz['questions']??[]);
        if(!$questions)$add(academy_v58_item('quiz',$id,$name,'empty_quiz','high','لا يحتوي الاختبار على أسئلة صالحة للمراجعة.'));
        [$subject,$stage,$grade,$type]=$scope($quiz);
        if($lessonId!==''&&isset($lessons[$lessonId])&&is_array($lessons[$lessonId])){
            $lesson=$lessons[$lessonId];$subject=$subject?:((string)($lesson['subject']??''));$stage=$stage?:((string)($lesson['stage']??''));$grade=$grade?:((string)($lesson['grade']??''));$type=$type?:((string)($lesson['type']??''));
        }
        foreach(array_slice($questions,0,100) as $i=>$question){$totals['questions']++;
            $text=academy_v58_text($question['question']??$question['text']??'',600);
            if($text===''){$add(academy_v58_item('quiz',$id,$name,'blank_question','high','يوجد سؤال رقم '.($i+1).' بدون نص.'));continue;}
            $normal($text,$subject,$stage,$grade,$type,'اختبار '.$id.' / سؤال '.($i+1));
            $qtype=(string)($question['type']??'multiple_choice');
            if($qtype==='multiple_choice' || $qtype==='mcq'){
                $opts=$question['options']??$question['opts']??[];
                if(!is_array($opts)||count($opts)<2)$add(academy_v58_item('quiz',$id,$name,'invalid_options','medium','السؤال رقم '.($i+1).' يحتاج اختيارين على الأقل.'));
                else {$correct=$question['correctAnswer']??$question['correct']??null;if($correct===null||!is_numeric($correct)||(int)$correct<0||(int)$correct>=count($opts))$add(academy_v58_item('quiz',$id,$name,'invalid_answer_key','high','مفتاح إجابة السؤال رقم '.($i+1).' غير صالح.'));}
            }
        }
        $links('quiz',$id,$name,$quiz,['url','fileUrl']);
    }
    $count=0;
    foreach($files as $id=>$file){if(++$count>$scanLimit){$truncated[]='files';break;}
        if(!is_array($file))continue;$totals['files']++;
        $id=(string)$id;$name=academy_v58_text($file['title']??$file['name']??'ملف بلا عنوان');
        if($name==='')$add(academy_v58_item('file',$id,'ملف بلا عنوان','missing_title','medium','أضف عنوان الملف.'));
        $path=$file['url']??$file['fileUrl']??$file['href']??'';
        if(!is_string($path)||trim($path)==='')$add(academy_v58_item('file',$id,$name,'file_no_link','medium','الملف لا يحتوي على رابط فتح.'));
        $links('file',$id,$name,$file,['url','fileUrl','href','imageUrl']);
    }
    $count=0;
    foreach($bank as $row){if(++$count>=$scanLimit){$truncated[]='m2_questions';break;}
        if(!is_array($row))continue;$totals['bank']++;
        $txt=(string)($row['question_text']??'');
        $normal($txt,(string)($row['subject']??''),(string)($row['stage']??''),(string)($row['grade']??''),(string)($row['education_type']??''),'بنك الأسئلة / '.(string)($row['id']??''));
    }
    foreach($duplicateGroups as $group){
        $add(academy_v58_item('question',$group['first'],$group['text'],'duplicate_question','medium', 'نص سؤال متكرر في نفس النطاق الدراسي، مواضع أخرى: '.implode('، ',$group['matches']).'. راجع قبل الدمج.'));
    }
    usort($issues,static fn($a,$b)=>($priority[$a['severity']]??9)<=>($priority[$b['severity']]??9));
    return ['ok'=>true,'generatedAt'=>gmdate('c'),'totals'=>$totals,'summary'=>$summary,'issues'=>$issues,'omittedIssues'=>$omittedIssues,'truncated'=>array_values(array_unique($truncated)),'limitPerCollection'=>$scanLimit,'notes'=>['الفحص للقراءة والتنبيه فقط.','الأسئلة المكررة مطابقة في النص بعد التطبيع داخل نفس النطاق، وليست تكرارًا معنويًا.','روابط HTTPS لم تُفحص عبر الشبكة؛ صلاحية الصيغة لا تؤكد أنها تعمل.','الفحص يقتصر على أول عناصر كل مجموعة ضمن الحد المعلن ولا يتضمن حذفًا أو دمجًا تلقائيًا.']];
}
function academy_v58_route(string $route,string $method,PDO $pdo):void {
    if(!str_starts_with($route,'/v58/'))return;
    $user=academy_current_user(true);
    if(($user['primary_role']??'')!=='admin'){
        $delegate=academy_v60_staff_record((string)$user['id']);
        if(($user['primary_role']??'')!=='parent'||!is_array($delegate)||($delegate['enabled']??false)!==true||empty($delegate['capabilities']['quality']))academy_json(['ok'=>false,'error'=>'forbidden'],403);
    }
    if($route!=='/v58/quality'||$method!=='GET')academy_json(['ok'=>false,'error'=>'route_not_found'],404);
    academy_rate_limit('v58-quality-'.$user['id'],12,3600);
    $lessons=academy_read_node('lessons');$quizzes=academy_read_node('quizzes');$files=academy_read_node('files');$packs=academy_read_node('teacherContentsV6');
    $bank=[];$bankAvailable=true;
    try{$stmt=$pdo->query("SELECT id,question_text,subject,stage,grade,education_type FROM m2_questions WHERE status IN ('approved','pending') ORDER BY created_at DESC LIMIT 1200");$bank=$stmt->fetchAll(PDO::FETCH_ASSOC);}catch(PDOException $e){$bankAvailable=false;}
    $result=academy_v58_report(is_array($lessons)?$lessons:[],is_array($quizzes)?$quizzes:[],is_array($files)?$files:[],is_array($packs)?$packs:[],$bank,1500);
    $result['bankAvailable']=$bankAvailable;
    academy_json($result);
}
