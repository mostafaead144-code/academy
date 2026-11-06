<?php
/** V44: public pages and authenticated admin publishing. No new database tables. */
declare(strict_types=1);
function academy_v44_length(string $value): int {return function_exists('mb_strlen')?mb_strlen($value,'UTF-8'):(preg_match_all('/./us',$value,$m)?:strlen($value));}
function academy_v44_titles(): array {
 return ['about'=>'من نحن','privacy'=>'سياسة الخصوصية','terms'=>'شروط الاستخدام'];
}
function academy_v44_default(string $slug): array {
 $titles=academy_v44_titles();
 $about="مرحبًا بك في أكاديمية اجتاز.\n\nأكاديمية اجتاز منصة تعليمية تساعد الطلاب في التعليم العام والأزهري على الوصول إلى المواد والدروس والاختبارات والتدريبات المناسبة لمراحلهم الدراسية.\n\n## ماذا نقدم؟\n- دروس وشروحات تعليمية من معلمين متعددين.\n- اختبارات وتدريبات ومتابعة التقدم الدراسي.\n- تحديات ومنافسات ومواسم تعليمية وفق قواعد كل نشاط.\n- أدوات لمتابعة رحلة التعلم من الطالب وولي الأمر.\n\n## رسالتنا\nنسعى إلى جعل الوصول إلى المعرفة والممارسة التعليمية أكثر تنظيمًا وتشويقًا، مع تشجيع الطلاب على التعلم المستمر.\n\nللاستفسارات، يُرجى استخدام قنوات التواصل الرسمية المنشورة في الأكاديمية.";
 $privacy="## مقدمة\nتوضح هذه السياسة كيفية التعامل مع المعلومات الشخصية عند استخدام أكاديمية اجتاز.\n\n## المعلومات التي تُستخدم\nقد تشمل بيانات الحساب الاسم ورقم الهاتف وبيانات المرحلة والصف، بالإضافة إلى نتائج الأنشطة التعليمية ومعلومات مرتبطة بمتابعة ولي الأمر.\n\n## استخدام البيانات\nتُستخدم البيانات لتشغيل الحسابات وتقديم المحتوى المناسب وحفظ التقدم وتوفير المتابعة التعليمية.\n\n## الحماية وحقوق المستخدم\nاستكمل هنا سياسة الاحتفاظ بالمعلومات، وطلبات التصحيح والحذف، وبيانات مسؤول الخصوصية، وأي خدمات خارجية مستخدمة.\n\n## التواصل\nاستكمل هنا وسيلة التواصل الرسمية لطلبات الخصوصية.\n\nراجع هذه المسودة قبل النشر للتأكد من مطابقتها للتشغيل الفعلي والمتطلبات القانونية.";
 $terms="## قبول الشروط\nتنظم هذه الشروط استعمال أكاديمية اجتاز وخدماتها التعليمية.\n\n## الحسابات\nيلتزم المستخدم بتقديم بيانات صحيحة وحماية بيانات دخوله وعدم إساءة استخدام حسابات الآخرين.\n\n## الدروس والاختبارات\nيستخدم المحتوى لأغراض تعليمية، وتخضع المنافسات والمحاولات لقواعد كل اختبار أو تحدٍّ معروض للمشارك.\n\n## حقوق المحتوى\nاستكمل هنا حقوق المحتوى واستخدام المواد التعليمية وإجراءات الشكاوى.\n\n## الاشتراكات والمدفوعات\nاستكمل هنا شروط الاشتراك والاسترداد والإلغاء إذا كانت الخدمات المدفوعة متاحة.\n\n## التواصل والتعديلات\nاستكمل هنا بيانات الدعم وطريقة الإبلاغ عن تعديلات الشروط.\n\nراجع هذه المسودة قانونيًا قبل النشر.";
 $contents=['about'=>$about,'privacy'=>$privacy,'terms'=>$terms];
 return ['slug'=>$slug,'title'=>$titles[$slug],'content'=>$contents[$slug],'published'=>$slug==='about','updatedAt'=>0,'revision'=>0,'updatedBy'=>''];
}
function academy_v44_page(string $slug): array {
 $default=academy_v44_default($slug);
 $row=academy_read_node('publicPagesV44/'.$slug);
 if(!is_array($row))return $default;
 return ['slug'=>$slug,'title'=>(string)($row['title']??$default['title']),'content'=>(string)($row['content']??$default['content']),'published'=>($row['published']??false)===true,'updatedAt'=>(int)($row['updatedAt']??0),'revision'=>(int)($row['revision']??0),'updatedBy'=>(string)($row['updatedBy']??'')];
}
function academy_v44_route(string $route,string $method,PDO $pdo): void {
 $publicPrefix='/v44/pages/';
 if(str_starts_with($route,$publicPrefix)){
   if($method!=='GET')academy_json(['ok'=>false,'error'=>'method_not_allowed'],405);
   $slug=substr($route,strlen($publicPrefix));
   if(!array_key_exists($slug,academy_v44_titles()))academy_json(['ok'=>false,'error'=>'page_not_found'],404);
   $page=academy_v44_page($slug);
   header('Cache-Control: no-store');
   if(!$page['published'])academy_json(['ok'=>true,'page'=>['slug'=>$slug,'title'=>$page['title'],'published'=>false,'updatedAt'=>0]]);
   academy_json(['ok'=>true,'page'=>['slug'=>$slug,'title'=>$page['title'],'content'=>$page['content'],'published'=>true,'updatedAt'=>$page['updatedAt']]]);
 }
 if($route==='/v44/admin/pages'&&$method==='GET'){
   $user=academy_current_user(true);
   if($user['primary_role']!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
   $pages=[];
   foreach(array_keys(academy_v44_titles())as$slug)$pages[$slug]=academy_v44_page($slug);
   academy_json(['ok'=>true,'pages'=>$pages]);
 }
 if($route==='/v44/admin/pages/save'&&$method==='POST'){
   $user=academy_current_user(true);
   if($user['primary_role']!=='admin')academy_json(['ok'=>false,'error'=>'forbidden'],403);
   academy_rate_limit('v44-page-'.$user['id'],60,3600);
   $body=academy_body();$slug=(string)($body['slug']??'');
   if(!array_key_exists($slug,academy_v44_titles()))academy_json(['ok'=>false,'error'=>'invalid_page'],422);
   $title=trim((string)($body['title']??''));$content=trim((string)($body['content']??''));$published=($body['published']??false)===true;
   if($title===''||academy_v44_length($title)>130||academy_v44_length($content)>16000||($published&&academy_v44_length($content)<120))academy_json(['ok'=>false,'error'=>'invalid_page_content'],422);
   // Legal templates contain outstanding instructions. They must not be published as policies.
   if($published&&$slug!=='about'&&(str_contains($content,'استكمل هنا')||str_contains($content,'راجع هذه المسودة')))academy_json(['ok'=>false,'error'=>'legal_template_not_ready'],422);
   $expected=filter_var($body['revision']??null,FILTER_VALIDATE_INT);
   if($expected===false||$expected===null||$expected<0)academy_json(['ok'=>false,'error'=>'invalid_revision'],422);
   $path='publicPagesV44/'.$slug;
   $conflict=false;
   $locks=academy_acquire_data_locks($pdo,[$path]);
   try{
     $pdo->beginTransaction();
     try{
       $existing=academy_read_node($path);$currentRevision=is_array($existing)?(int)($existing['revision']??0):0;
       if($currentRevision!==$expected){$pdo->rollBack();$conflict=true;}
       else{
         $new=['title'=>$title,'content'=>$content,'published'=>$published,'revision'=>$currentRevision+1,'updatedAt'=>academy_now_ms(),'updatedBy'=>$user['id']];
         academy_delete_node_raw($pdo,$path);
         academy_insert_value_raw($pdo,$path,$new,$user['id']);
         $pdo->commit();
       }
     }catch(Throwable$e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
   }finally{academy_release_data_locks($pdo,$locks);}
   if($conflict)academy_json(['ok'=>false,'error'=>'page_updated_elsewhere'],409);
   academy_audit($user['id'],'v44.page.save',$path,['published'=>$published,'revision'=>$new['revision']]);
   academy_json(['ok'=>true,'page'=>['slug'=>$slug,'title'=>$title,'published'=>$published,'revision'=>$new['revision'],'updatedAt'=>$new['updatedAt']]]);
 }
 if(str_starts_with($route,'/v44/'))academy_json(['ok'=>false,'error'=>'not_found'],404);
}
