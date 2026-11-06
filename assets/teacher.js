(() => {
'use strict';

const backendConfig = window.ACADEMY_BACKEND_CONFIG || JSON.parse(localStorage.getItem('academyBackendConfig') || 'null');
if(!backendConfig){location.replace('./index.html');return}
// Keep the teacher's session separate from the admin/student session in other tabs.
const teacherApp=AcademyBackend.apps.find(app=>app.name==='teacher-portal')||AcademyBackend.initializeApp(backendConfig,'teacher-portal');
const auth=teacherApp.auth(),db=teacherApp.database();
const $=id=>document.getElementById(id), $$=(s,r=document)=>[...r.querySelectorAll(s)];
let user=null,teacher=null,data={},submissions={},analytics={},homeworkAssignments={},assignmentSubmissions={},activeGrade=null,gradeModalTrigger=null;
const unavailableSubmissions=new Set();

const defaults={
 primary:[{id:'arabic',name:'اللغة العربية'},{id:'math',name:'الرياضيات'},{id:'science',name:'العلوم'},{id:'english',name:'اللغة الإنجليزية'},{id:'social',name:'الدراسات الاجتماعية'},{id:'religion',name:'التربية الدينية'}],
 prep:[{id:'arabic',name:'اللغة العربية'},{id:'math',name:'الرياضيات'},{id:'science',name:'العلوم'},{id:'english',name:'اللغة الإنجليزية'},{id:'social',name:'الدراسات الاجتماعية'},{id:'computer',name:'الحاسب الآلي'}],
 sec:[{id:'arabic',name:'اللغة العربية'},{id:'english',name:'اللغة الإنجليزية'},{id:'math',name:'الرياضيات'},{id:'physics',name:'الفيزياء'},{id:'chemistry',name:'الكيمياء'},{id:'biology',name:'الأحياء'},{id:'history',name:'التاريخ'},{id:'geography',name:'الجغرافيا'}]
};
const stageName={primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};

function safeUrl(u=''){
 try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:'#'}catch{return'#'}
}
function toast(msg,type='success'){
 const el=$('toast');el.textContent=msg;el.className='toast show '+type;
 clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3000);
}
function normalizeAssignments(){
 if(Array.isArray(teacher.assignments)) return teacher.assignments.filter(Boolean);
 if(teacher.assignments && typeof teacher.assignments==='object') return Object.values(teacher.assignments).filter(Boolean);
 const arr=[];
 if(Array.isArray(teacher.subjects)){
   teacher.subjects.forEach(s=>arr.push(typeof s==='string'?{subject:s}:s));
 }
 return arr;
}
function getSubjects(stage,grade,type){
 const list=[...(defaults[stage]||[])], custom=data.customSubjects?.[stage]?.[grade];
 if(Array.isArray(custom))custom.forEach(s=>{
   if(!s?.id||!s?.name||(s.type&&s.type!==type))return;
   const i=list.findIndex(x=>x.id===s.id), item={id:s.id,name:s.name};
   if(i>=0)list[i]={...list[i],...item};else list.push(item);
 });
 const assignments=normalizeAssignments();
 if(!assignments.length) return [];
 const allowed=assignments.filter(a=>(!a.type||a.type===type)&&(!a.stage||a.stage===stage)&&(!a.grade||String(a.grade)===String(grade))).map(a=>a.subject).filter(Boolean);
 return allowed.length?list.filter(s=>allowed.includes(s.id)):[];
}
function assignmentAllowed(type,stage,grade,subject){
 const assignments=normalizeAssignments();
 return assignments.some(a=>
   (!a.type||a.type===type)&&
   (!a.stage||a.stage===stage)&&
   (!a.grade||String(a.grade)===String(grade))&&
   (!a.subject||a.subject===subject)
 );
}
function updateSubmitAvailability(){
 const contentOk=!!$('teacherSubject')?.value;
 if($('teacherSubmitBtn'))$('teacherSubmitBtn').disabled=!contentOk;
 const assignmentOk=!!$('assignmentSubject')?.value;
 if($('teacherAssignmentSubmitBtn'))$('teacherAssignmentSubmitBtn').disabled=!assignmentOk;
}
function updateGrades(){
 const stage=$('teacherStage').value,max=stage==='primary'?6:3;
 $('teacherGrade').innerHTML=Array.from({length:max},(_,i)=>i+1).map(g=>'<option value="'+g+'">الصف '+g+'</option>').join('');
 updateSubjects();
}
function updateSubjects(){
 const list=getSubjects($('teacherStage').value,$('teacherGrade').value,$('teacherEducationType').value);
 $('teacherSubject').innerHTML=list.length
   ?list.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join('')
   :'<option value="">لا توجد مادة مسندة لهذا الصف</option>';
 updateSubmitAvailability();
}
function updateQuizGrades(){
 const stage=$('teacherQuizStage').value,max=stage==='primary'?6:3,current=$('teacherQuizGrade').value;
 $('teacherQuizGrade').innerHTML=Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join('');
 if(current&&Number(current)<=max)$('teacherQuizGrade').value=current;
 updateQuizSubjects();
}
function updateQuizSubjects(){
 const stage=$('teacherQuizStage').value,grade=$('teacherQuizGrade').value,type=$('teacherQuizType').value,current=$('teacherQuizSubject').value;
 const list=getSubjects(stage,grade,type);
 $('teacherQuizSubject').innerHTML=list.length?list.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join(''):'<option value="">لا توجد مادة مسندة</option>';
 if(list.some(s=>s.id===current))$('teacherQuizSubject').value=current;
 updateQuizLessons();
}
function updateQuizLessons(){
 const type=$('teacherQuizType').value,stage=$('teacherQuizStage').value,grade=$('teacherQuizGrade').value,subject=$('teacherQuizSubject').value,select=$('teacherQuizLesson'),current=select.value;
 const lessons=availableQuizLessons().filter(l=>l.type===type&&l.stage===stage&&String(l.grade)===grade&&l.subject===subject);
 select.innerHTML='<option value="">'+(lessons.length?'اختر الدرس المعتمد':'لا توجد دروس معتمدة لهذه المادة')+'</option>'+lessons.map(l=>'<option value="'+escapeHtml(l.id)+'">'+escapeHtml(l.title||'درس')+'</option>').join('');
 if(lessons.some(l=>l.id===current))select.value=current;
 $('teacherQuizSubmitBtn').disabled=!lessons.length;
}
function availableQuizLessons(){
 return Object.entries(data.lessons||{}).map(([id,lesson])=>({...(lesson||{}),id})).filter(lesson=>!lesson.isHidden&&assignmentAllowed(lesson.type,lesson.stage,lesson.grade,lesson.subject));
}
function addQuizQuestion(q={}){
 const box=$('teacherQuizQuestionRows');if(box.children.length>=100)return toast('الحد الأقصى 100 سؤال لكل اختبار.','error');
 const row=document.createElement('article');row.className='teacher-question-row';
 row.innerHTML='<div class="teacher-question-head"><strong>السؤال <span class="question-position"></span></strong><button type="button" class="teacher-remove-question" aria-label="حذف السؤال"><i class="fa-solid fa-trash"></i> حذف</button></div>'+
   '<label><span>نص السؤال</span><textarea class="teacher-question-text" maxlength="500" rows="2" required>'+escapeHtml(q.text||'')+'</textarea></label>'+
   '<div class="teacher-question-options">'+Array.from({length:4},(_,i)=>'<label><span>الخيار '+(i+1)+'</span><input class="teacher-question-option" maxlength="250" value="'+escapeHtml(q.opts?.[i]||'')+'" '+(i<2?'required':'')+'></label>').join('')+'</div>'+
   '<label><span>الإجابة الصحيحة</span><select class="teacher-question-correct">'+Array.from({length:4},(_,i)=>'<option value="'+i+'" '+(Number(q.correctAnswer)===i?'selected':'')+'>الخيار '+(i+1)+'</option>').join('')+'</select></label>'+
   '<label><span>المهارة / ناتج التعلم</span><input class="teacher-question-skill" maxlength="120" value="'+escapeHtml(q.skill||'')+'" placeholder="مثال: المبتدأ والخبر"></label>'+
   '<label><span>مستوى الصعوبة</span><select class="teacher-question-difficulty"><option value="1" '+(Number(q.difficulty||2)===1?'selected':'')+'>سهل</option><option value="2" '+(Number(q.difficulty||2)===2?'selected':'')+'>متوسط</option><option value="3" '+(Number(q.difficulty||2)===3?'selected':'')+'>صعب</option></select></label>'+
   '<label class="full"><span>تفسير الإجابة — يظهر بعد الحل</span><textarea class="teacher-question-explanation" maxlength="1000" rows="2" placeholder="اشرح باختصار لماذا هذه الإجابة صحيحة...">'+escapeHtml(q.explanation||'')+'</textarea></label>';
 row.querySelector('.teacher-remove-question').onclick=()=>{row.remove();updateQuestionNumbers()};box.append(row);updateQuestionNumbers();return row;
}
function updateQuestionNumbers(){$$('#teacherQuizQuestionRows .question-position').forEach((node,i)=>node.textContent=i+1)}
function collectQuizQuestions(){
 const rows=$$('#teacherQuizQuestionRows .teacher-question-row');if(!rows.length)throw Error('أضف سؤالًا واحدًا على الأقل.');
 return window.AcademyUtils.validateQuestions(rows.map((row,i)=>{
   const opts=$$('.teacher-question-option',row).map(input=>input.value.trim());while(opts.length&&!opts.at(-1))opts.pop();
   if(opts.length<2||opts.some(o=>!o))throw Error('أكمل الخيارات بالترتيب في السؤال '+(i+1)+'.');
   return {text:row.querySelector('.teacher-question-text').value.trim(),opts,correctAnswer:Number(row.querySelector('.teacher-question-correct').value),skill:row.querySelector('.teacher-question-skill')?.value.trim()||'',difficulty:Number(row.querySelector('.teacher-question-difficulty')?.value||2),explanation:row.querySelector('.teacher-question-explanation')?.value.trim()||''};
 }));
}
async function generateQuizQuestionsFromBank(){
 const btn=$('teacherGenerateQuestions'),type=$('teacherQuizType').value,stage=$('teacherQuizStage').value,grade=$('teacherQuizGrade').value,subject=$('teacherQuizSubject').value,lessonId=$('teacherQuizLesson').value,count=Math.max(1,Math.min(50,Number($('teacherGeneratedCount')?.value||10))),difficulty=$('teacherGeneratedDifficulty')?.value||'';
 if(!subject||!lessonId)return toast('اختر المادة والدرس أولًا.','error');
 window.AcademyUI?.setButtonLoading(btn,true,'توليد');
 try{
  const snap=await db.ref('questionBankV4').once('value');
  let rows=Object.values(snap.val()||{}).filter(q=>q?.status==='approved'&&q.type===type&&q.stage===stage&&String(q.grade)===String(grade)&&q.subject===subject);
  if(difficulty)rows=rows.filter(q=>String(q.difficulty||2)===String(difficulty));
  const exact=rows.filter(q=>q.lessonId===lessonId),source=exact.length>=Math.min(count,3)?exact:rows;
  const shuffled=[...source].sort(()=>Math.random()-.5).slice(0,count);
  if(!shuffled.length)return toast('لا توجد أسئلة معتمدة مطابقة في بنك الأسئلة بعد.','error');
  if(shuffled.length+$$('#teacherQuizQuestionRows .teacher-question-row').length>100)return toast('سيؤدي التوليد إلى تجاوز حد 100 سؤال.','error');
  shuffled.forEach(q=>addQuizQuestion({text:q.question||q.text||'',opts:q.options||q.opts||[],correctAnswer:Number(q.correctAnswer),difficulty:Number(q.difficulty||2),skill:q.skill||'',explanation:q.explanation||''}));
  toast('تم توليد '+shuffled.length+' سؤال من بنك الأسئلة. راجعها قبل الإرسال.');
 }catch(err){console.error(err);toast('تعذر توليد الأسئلة من البنك الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function importQuizQuestions(){
 let items;try{items=JSON.parse($('teacherQuizBulk').value.trim());items=window.AcademyUtils.validateQuestions(items)}catch(err){return toast('تعذر قراءة المجموعة: '+(err.message||'صيغة JSON غير صحيحة.'),'error')}
 if(!items.length)return toast('لا توجد أسئلة في المجموعة.','error');
 if(items.length+$$('#teacherQuizQuestionRows .teacher-question-row').length>100)return toast('الحد الأقصى 100 سؤال لكل اختبار.','error');
 if(items.some(q=>q.opts.length>4||q.text.length>500||q.opts.some(o=>o.length>250)||String(q.explanation||'').length>1000))return toast('كل سؤال يقبل 2 إلى 4 خيارات، ونصًا لا يتجاوز 500 حرف، وتفسيرًا لا يتجاوز 1000 حرف.','error');
 items.forEach(addQuizQuestion);$('teacherQuizBulk').value='';toast('تمت إضافة '+items.length+' سؤال. راجعها قبل الإرسال.');
}
function updateLessonQuestionNumbers(){$$('#teacherLessonQuestionRows .question-position').forEach((node,i)=>node.textContent=i+1)}
function addLessonQuestion(q={}){
 const box=$('teacherLessonQuestionRows');if(!box)return null;
 if(box.children.length>=100)return toast('الحد الأقصى 100 سؤال لتدريب الدرس.','error');
 const row=document.createElement('article');row.className='teacher-question-row';
 row.innerHTML='<div class="teacher-question-head"><strong>السؤال <span class="question-position"></span></strong><button type="button" class="teacher-remove-question" aria-label="حذف السؤال"><i class="fa-solid fa-trash"></i> حذف</button></div>'+
   '<label><span>نص السؤال</span><textarea class="teacher-question-text" maxlength="500" rows="2" required>'+escapeHtml(q.text||q.question||'')+'</textarea></label>'+
   '<div class="teacher-question-options">'+Array.from({length:4},(_,i)=>'<label><span>الخيار '+(i+1)+'</span><input class="teacher-question-option" maxlength="250" value="'+escapeHtml((q.opts||q.options||[])[i]||'')+'" '+(i<2?'required':'')+'></label>').join('')+'</div>'+
   '<label><span>الإجابة الصحيحة</span><select class="teacher-question-correct">'+Array.from({length:4},(_,i)=>'<option value="'+i+'" '+(Number(q.correctAnswer)===i?'selected':'')+'>الخيار '+(i+1)+'</option>').join('')+'</select></label>'+
   '<label><span>المهارة / ناتج التعلم</span><input class="teacher-question-skill" maxlength="120" value="'+escapeHtml(q.skill||'')+'" placeholder="مثال: المبتدأ والخبر"></label>'+
   '<label><span>مستوى الصعوبة</span><select class="teacher-question-difficulty"><option value="1" '+(Number(q.difficulty||2)===1?'selected':'')+'>سهل</option><option value="2" '+(Number(q.difficulty||2)===2?'selected':'')+'>متوسط</option><option value="3" '+(Number(q.difficulty||2)===3?'selected':'')+'>صعب</option></select></label>'+
   '<label class="full"><span>تفسير الإجابة — يظهر بعد الحل</span><textarea class="teacher-question-explanation" maxlength="1000" rows="2" placeholder="اشرح باختصار لماذا هذه الإجابة صحيحة...">'+escapeHtml(q.explanation||'')+'</textarea></label>';
 row.querySelector('.teacher-remove-question').onclick=()=>{row.remove();updateLessonQuestionNumbers()};
 box.append(row);updateLessonQuestionNumbers();return row;
}
function collectLessonQuestions(){
 const rows=$$('#teacherLessonQuestionRows .teacher-question-row');if(!rows.length)return[];
 return window.AcademyUtils.validateQuestions(rows.map((row,i)=>{
   const opts=$$('.teacher-question-option',row).map(input=>input.value.trim());while(opts.length&&!opts.at(-1))opts.pop();
   if(opts.length<2||opts.some(o=>!o))throw Error('أكمل الخيارات بالترتيب في سؤال الدرس '+(i+1)+'.');
   return {text:row.querySelector('.teacher-question-text').value.trim(),opts,correctAnswer:Number(row.querySelector('.teacher-question-correct').value),skill:row.querySelector('.teacher-question-skill')?.value.trim()||'',difficulty:Number(row.querySelector('.teacher-question-difficulty')?.value||2),explanation:row.querySelector('.teacher-question-explanation')?.value.trim()||''};
 }));
}
function importLessonQuestions(){
 let items;try{items=JSON.parse($('teacherLessonQuestionsBulk').value.trim());items=window.AcademyUtils.validateQuestions(items)}catch(err){return toast('تعذر قراءة أسئلة الدرس: '+(err.message||'صيغة JSON غير صحيحة.'),'error')}
 if(!items.length)return toast('لا توجد أسئلة في المجموعة.','error');
 if(items.length+$$('#teacherLessonQuestionRows .teacher-question-row').length>100)return toast('الحد الأقصى 100 سؤال لتدريب الدرس.','error');
 if(items.some(q=>q.opts.length>4||q.text.length>500||q.opts.some(o=>o.length>250)||String(q.explanation||'').length>1000))return toast('راجع أطوال نصوص أسئلة الدرس والاختيارات.','error');
 items.forEach(addLessonQuestion);$('teacherLessonQuestionsBulk').value='';toast('تمت إضافة '+items.length+' سؤال لتدريب الدرس.');
}
async function submitTeacherQuiz(e){
 e.preventDefault();
 const lessonId=$('teacherQuizLesson').value,lesson=availableQuizLessons().find(l=>l.id===lessonId),type=$('teacherQuizType').value,stage=$('teacherQuizStage').value,grade=$('teacherQuizGrade').value,subject=$('teacherQuizSubject').value,title=$('teacherQuizTitle').value.trim();
 if(!title||!lesson||lesson.isHidden||lesson.type!==type||lesson.stage!==stage||String(lesson.grade)!==grade||lesson.subject!==subject)return toast('اختر درسًا معتمدًا مطابقًا للمادة والصف.','error');
 if(!assignmentAllowed(type,stage,grade,subject))return toast('هذه المادة غير مسندة إلى حسابك.','error');
 let questions;try{questions=collectQuizQuestions()}catch(err){return toast(err.message,'error')}
 const targetMode=$('teacherQuizTargetMode')?.value||'all',targetRaw=$('teacherQuizTargetValue')?.value.trim()||'';
 const targetStudentIds=targetMode==='students'?targetRaw.split(/[،,\s]+/).map(x=>x.trim()).filter(Boolean):[];
 if(targetMode==='students'&&!targetStudentIds.length)return toast('أدخل معرّف طالب واحد على الأقل.','error');
 if(targetMode==='group'&&!targetRaw)return toast('أدخل رمز المجموعة أو الفصل.','error');
 const payload={submissionKind:'quiz',title,lessonId,type,stage,grade,subject,subjectName:$('teacherQuizSubject').selectedOptions[0]?.textContent||subject,unit:Number(lesson.unit||1),questions,targetMode,targetStudentIds,targetGroupId:targetMode==='group'?targetRaw:'',status:'pending',teacherId:user.uid,teacherName:teacher.name||user.displayName||'',createdAt:Date.now()};
 const btn=$('teacherQuizSubmitBtn');window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{const ref=db.ref('teacherSubmissions/'+user.uid).push();await ref.set(payload);submissions[ref.key]=payload;$('teacherQuizForm').reset();$('teacherQuizQuestionRows').replaceChildren();updateQuizGrades();render();toast('تم إرسال الاختبار للإدارة للمراجعة ✅')}
 catch(err){console.error(err);toast('تعذر إرسال الاختبار الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false);updateQuizLessons()}
}
function initTeacherCollapse(){
 if(document.body.classList.contains('academy-suite')){$('teacherPortal')?.classList.remove('teacher-collapsed');return}
 const shell=$('teacherPortal'),btn=$('teacherCollapseBtn');if(!shell||!btn)return;
 const apply=()=>{const collapsed=innerWidth>900&&localStorage.getItem('academyTeacherCollapsed')==='1';shell.classList.toggle('teacher-collapsed',collapsed)};
 apply();
 btn.onclick=()=>{if(innerWidth<=900)return;const next=!shell.classList.contains('teacher-collapsed');shell.classList.toggle('teacher-collapsed',next);localStorage.setItem('academyTeacherCollapsed',next?'1':'0')};
 $$('[data-teacher-tab]').forEach(el=>{if(!el.title)el.title=el.textContent.trim().replace(/\s+/g,' ')});
 window.addEventListener('resize',apply,{passive:true});
}
function switchTab(tab,updateUrl=true){
 const allowed=['home','content','submit','quizzes','assignments','notifications','communications','students','classes','analytics','profile','support'];
 if(!allowed.includes(tab))tab='home';
 const labels={
   home:['الرئيسية','ملخص عملك التعليمي اليوم'],
   content:['محتواي','الدروس والفيديوهات المنشورة باسمك'],
   submit:['إضافة محتوى','أرسل درسًا جديدًا لمراجعة الإدارة'],
   quizzes:['إنشاء اختبار','أضف أسئلة مرتبطة بدرس وأرسلها لاعتماد الإدارة'],
   assignments:['الواجبات','إنشاء الواجبات ومتابعة تسليمات الطلاب'],
   notifications:['إشعارات الطلاب','أرسل رسالة لطلاب موادك بعد اعتماد الإدارة'],
 support:['الدعم','افتح تذكرة وتابع رد إدارة الأكاديمية'],
   students:['تفاعل الطلاب','إحصائيات مجمعة لأداء محتواك'],
   classes:['الفصول والمتابعة','أنشئ مجموعات بكود انضمام وتابع الطلاب الذين يحتاجون تدخلًا'],
   analytics:['الإحصائيات','تحليل المشاهدات والإكمال ونتائج التدريبات'],
   profile:['ملفي العام','معلوماتك التي يراها الطلاب بعد الموافقة']
 };
 if($('teacherTopRole'))$('teacherTopRole').textContent=labels[tab]?.[1]||'بوابة إدارة المحتوى التعليمي';
 $$('.teacher-nav [data-teacher-tab]').forEach(b=>{
   const active=b.dataset.teacherTab===tab;
   b.classList.toggle('active',active);if(document.body.classList.contains('academy-suite')){b.removeAttribute('aria-selected');b.setAttribute('aria-pressed',String(active));b.tabIndex=0}else{b.setAttribute('aria-selected',active?'true':'false');b.tabIndex=active?0:-1;}
 });
 $$('#teacherMobileBottomNav [data-teacher-tab]').forEach(b=>b.classList.toggle('active',b.dataset.teacherTab===tab));
 $$('.teacher-tab').forEach(s=>s.classList.add('hidden'));
 $('teacher-tab-'+tab)?.classList.remove('hidden');
 if(updateUrl){
   const url=new URL(location.href);
   if(tab==='home')url.searchParams.delete('tab');else url.searchParams.set('tab',tab);
   history.replaceState({},'',url);
 }
 if(innerWidth<900){$('teacherSide').classList.remove('open');$('teacherOverlay')?.classList.add('hidden')}
}
function statusLabel(s){
 return s==='approved'?'معتمد':s==='rejected'?'مرفوض':'قيد المراجعة';
}
function renderSubmissionList(target,items){
 $(target).innerHTML=items.length?items.map(x=>'<article class="submission-item"><div><h4>'+escapeHtml(x.title||'محتوى بدون عنوان')+'</h4><p>'+(stageName[x.stage]||x.stage||'')+' • صف '+(x.grade||'')+' • '+(x.subjectName||x.subject||'')+'</p></div><span class="status-pill '+(x.status||'pending')+'">'+statusLabel(x.status)+'</span></article>').join(''):'<p class="profile-muted">لا يوجد محتوى هنا حتى الآن.</p>';
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderTeacherProfile(published={}){
 const pending=Object.values(submissions||{}).filter(s=>s?.type==='profile'&&s.status==='pending').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
 const current=pending?.profile||published;
 const fields={Name:current.name||teacher.name||'',Title:current.title||'',Photo:current.photoUrl||'',Cover:current.coverUrl||'',Bio:current.bio||'',Qualifications:current.qualifications||'',Experience:current.experience||'',Style:current.teachingStyle||''};
 Object.entries(fields).forEach(([key,value])=>{$('teacherProfile'+key).value=value});
 $('teacherProfileStatus').textContent=pending?'لديك تحديث قيد مراجعة الإدارة. يمكنك إرسال طلب جديد لتصحيحه.':published.name?'ملفك منشور للطلاب. أي تعديل جديد يحتاج موافقة الإدارة.':'لم يُنشر ملفك بعد. أرسل بياناتك للمراجعة.';
 const link=$('teacherProfilePublicLink');link.classList.toggle('hidden',!published.name||published.active===false);link.href='./teacher-profile.html?id='+encodeURIComponent(user.uid);
}
async function submitTeacherProfile(e){
 e.preventDefault();const profile={name:$('teacherProfileName').value.trim().slice(0,80),title:$('teacherProfileTitle').value.trim().slice(0,100),photoUrl:$('teacherProfilePhoto').value.trim().slice(0,500),coverUrl:$('teacherProfileCover').value.trim().slice(0,500),bio:$('teacherProfileBio').value.trim().slice(0,1200),qualifications:$('teacherProfileQualifications').value.trim().slice(0,200),experience:$('teacherProfileExperience').value.trim().slice(0,200),teachingStyle:$('teacherProfileStyle').value.trim().slice(0,450)};
 if(!profile.name||!profile.title)return toast('أدخل الاسم والتخصص.','error');
 if(profile.photoUrl&&safeUrl(profile.photoUrl)==='#')return toast('أدخل رابط صورة صالحًا.','error');
 if(profile.coverUrl&&safeUrl(profile.coverUrl)==='#')return toast('أدخل رابط غلاف صالحًا.','error');
 const payload={type:'profile',title:'طلب تحديث الملف التعريفي',teacherName:teacher.name||profile.name,profile,status:'pending',createdAt:Date.now()};
 try{const ref=db.ref('teacherSubmissions/'+user.uid).push();await ref.set(payload);submissions[ref.key]=payload;$('teacherProfileStatus').textContent='أُرسل طلبك للإدارة. سيظهر بعد الموافقة.';toast('تم إرسال ملفك للمراجعة')}catch(err){console.error(err);toast('تعذر إرسال الملف الآن.','error')}
}
function ownLessons(){
 return Object.entries(data.lessons||{}).map(([id,v])=>({id,...(v||{})})).filter(l=>l.teacherId===user?.uid||l.teacherIds?.[user?.uid]||Array.isArray(l.teacherIds)&&l.teacherIds.map(String).includes(String(user?.uid||''))||Array.isArray(l.videos)&&l.videos.some(v=>v?.teacherId===user?.uid));
}
function metricFor(id){return analytics?.[id]||{}}
function renderTeacherAnalytics(){
 const lessons=ownLessons();
 const metrics=lessons.map(l=>({lesson:l,m:metricFor(l.id)}));
 const totalViews=metrics.reduce((a,x)=>a+Number(x.m.views||0),0);
 const totalCompletions=metrics.reduce((a,x)=>a+Number(x.m.completions||0),0);
 const quizAttempts=metrics.reduce((a,x)=>a+Number(x.m.quizAttempts||0),0);
 const scoreTotal=metrics.reduce((a,x)=>a+Number(x.m.quizScoreTotal||0),0);
 const completionRate=totalViews?Math.min(100,Math.round(totalCompletions/totalViews*100)):0;
 const averageQuiz=quizAttempts?Math.round(scoreTotal/quizAttempts):0;
 if($('teacherTotalViews'))$('teacherTotalViews').textContent=totalViews;
 if($('teacherTotalCompletions'))$('teacherTotalCompletions').textContent=totalCompletions;
 if($('teacherQuizAttempts'))$('teacherQuizAttempts').textContent=quizAttempts;
 if($('teacherCompletionRate'))$('teacherCompletionRate').textContent=completionRate+'%';

 const engagement=$('teacherEngagementList');
 if(engagement)engagement.innerHTML=metrics.length?metrics.map(x=>{
   const views=Number(x.m.views||0),done=Number(x.m.completions||0),rate=views?Math.min(100,Math.round(done/views*100)):0;
   return '<article class="teacher-engagement-item"><div><strong>'+escapeHtml(x.lesson.title||'درس')+'</strong><small>'+views+' مشاهدة • '+done+' إكمال</small></div><div class="teacher-mini-progress"><span style="width:'+rate+'%"></span></div><b>'+rate+'%</b></article>';
 }).join(''):'<div class="portal-empty-state"><span>📊</span><h3>لا يوجد محتوى منشور بعد</h3><p>بعد اعتماد أول درس ستبدأ التحليلات في الظهور.</p></div>';

 const top=[...metrics].sort((a,b)=>Number(b.m.views||0)-Number(a.m.views||0))[0];
 if($('teacherTopLesson'))$('teacherTopLesson').innerHTML=top?'<strong>'+escapeHtml(top.lesson.title||'درس')+'</strong><span>'+Number(top.m.views||0)+' مشاهدة</span>':'<strong>—</strong><span>لا توجد بيانات بعد</span>';
 if($('teacherAverageQuiz'))$('teacherAverageQuiz').innerHTML='<strong>'+averageQuiz+'%</strong><span>'+quizAttempts+' محاولة تدريب</span>';
 if($('teacherHomeViews'))$('teacherHomeViews').textContent=totalViews;
 if($('teacherHomeCompletions'))$('teacherHomeCompletions').textContent=totalCompletions;
 if($('teacherHomeAverageQuiz'))$('teacherHomeAverageQuiz').textContent=averageQuiz+'%';
 if($('teacherHomeTopLesson'))$('teacherHomeTopLesson').innerHTML=top?'<span>🏆</span><div><small>أكثر درس مشاهدة</small><strong>'+escapeHtml(top.lesson.title||'درس')+'</strong><em>'+Number(top.m.views||0)+' مشاهدة</em></div>':'<span>🌱</span><div><small>أكثر درس مشاهدة</small><strong>سيظهر بعد أول تفاعل</strong></div>';

 const list=$('teacherAnalyticsList');
 if(list)list.innerHTML=metrics.length?metrics.map(x=>{
   const views=Number(x.m.views||0),done=Number(x.m.completions||0),attempts=Number(x.m.quizAttempts||0),avg=Number(x.m.quizAverage||0);
   const rate=views?Math.min(100,Math.round(done/views*100)):0;
   return '<div class="teacher-analytics-row"><div><strong>'+escapeHtml(x.lesson.title||'درس')+'</strong><small>'+(stageName[x.lesson.stage]||x.lesson.stage||'')+' • صف '+(x.lesson.grade||'')+'</small></div><span><b>'+views+'</b><small>مشاهدة</small></span><span><b>'+rate+'%</b><small>إكمال</small></span><span><b>'+attempts+'</b><small>تدريب</small></span><span><b>'+avg+'%</b><small>متوسط</small></span></div>';
 }).join(''):'<div class="portal-empty-state"><span>📈</span><h3>لا توجد تحليلات بعد</h3><p>ستظهر الأرقام عندما يبدأ الطلاب في استخدام المحتوى.</p></div>';

 const difficult=metrics.flatMap(({lesson,m})=>Object.entries(m.questionStats||{}).map(([key,stats])=>{
   const question=lesson.questions?.[Number(key)],attempts=Number(stats?.attempts||0),correct=Number(stats?.correct||0);
   if(!question||!Number.isInteger(Number(key))||!attempts)return null;
   return {lesson,question,index:Number(key),attempts,wrong:Math.max(0,attempts-correct),rate:Math.round(Math.max(0,attempts-correct)/attempts*100)};
 }).filter(Boolean)).filter(item=>item.wrong>0).sort((a,b)=>b.rate-a.rate||b.attempts-a.attempts).slice(0,12);
 const difficultList=$('teacherDifficultQuestions');
 if(difficultList)difficultList.innerHTML=difficult.length?difficult.map(item=>'<article class="teacher-difficult-item"><div><small>'+escapeHtml(item.lesson.title||'درس')+' • السؤال '+(item.index+1)+'</small><h4>'+escapeHtml(item.question.text||item.question.question||'سؤال')+'</h4><span>الإجابة الصحيحة: '+escapeHtml((item.question.opts||item.question.options||[])[Number(item.question.correctAnswer)]||'—')+'</span></div><strong>'+item.rate+'% خطأ<small>'+item.wrong+' من '+item.attempts+' محاولة</small></strong></article>').join(''):'<div class="portal-empty-state"><span>🌟</span><h3>لا توجد أسئلة صعبة مسجلة بعد</h3><p>تظهر هنا الأسئلة التي أخطأ فيها الطلاب بعد إنهاء تدريبات دروسك.</p></div>';
}

function updateAssignmentGrades(){
 const stage=$('assignmentStage')?.value||'primary',max=stage==='primary'?6:3;
 if($('assignmentGrade'))$('assignmentGrade').innerHTML=Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join('');
 updateAssignmentSubjects();
}
function updateAssignmentSubjects(){
 if(!$('assignmentSubject'))return;
 const list=getSubjects($('assignmentStage').value,$('assignmentGrade').value,$('assignmentEducationType').value);
 $('assignmentSubject').innerHTML=list.length
   ?list.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join('')
   :'<option value="">لا توجد مادة مسندة لهذا الصف</option>';
 updateSubmitAvailability();
}
function ownHomework(){
 return Object.entries(homeworkAssignments||{}).map(([id,v])=>({id,...(v||{})})).filter(a=>a.teacherId===user?.uid).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function renderTeacherAssignments(){
 const own=ownHomework(),list=$('teacherAssignmentsList');
 if(list)list.innerHTML=own.length?own.map(a=>{
   const rows=Object.values(assignmentSubmissions[a.id]||{}),count=rows.length,graded=rows.filter(s=>s?.status==='graded').length,newCount=Math.max(0,count-graded);
   const dueAt=Number(a.dueAt||0),isPast=!!dueAt&&Date.now()>dueAt,due=dueAt?new Date(dueAt).toLocaleString('ar-EG'):'بدون موعد';
   return '<article class="teacher-homework-card '+(isPast?'closed':'active')+'">'+
     '<div class="teacher-homework-main"><span class="teacher-homework-icon"><i class="fa-solid fa-clipboard-check"></i></span><div><div class="teacher-homework-title-row"><strong>'+escapeHtml(a.title||'واجب')+'</strong><span class="status-pill '+(isPast?'rejected':'approved')+'">'+(isPast?'انتهى الموعد':'نشط')+'</span></div>'+
     '<small>'+(stageName[a.stage]||a.stage||'')+' • صف '+(a.grade||'')+' • '+escapeHtml(a.subjectName||a.subject||'')+'</small>'+
     '<small><i class="fa-regular fa-calendar"></i> '+escapeHtml(due)+'</small></div></div>'+
     '<div class="teacher-homework-metrics"><span><b>'+(unavailableSubmissions.has(a.id)?'—':count)+'</b><small>تسليم</small></span><span class="'+(newCount?'has-new':'')+'"><b>'+(unavailableSubmissions.has(a.id)?'—':newCount)+'</b><small>جديد</small></span><span><b>'+(unavailableSubmissions.has(a.id)?'—':graded)+'</b><small>مصحح</small></span></div>'+
     '<button class="admin-action-btn danger" data-delete-assignment="'+a.id+'" title="حذف الواجب" aria-label="حذف '+escapeHtml(a.title||'الواجب')+'"><i class="fa-solid fa-trash"></i></button>'+
   '</article>';
 }).join(''):'<div class="portal-empty-state"><span>📝</span><h3>لسه مفيش واجبات</h3><p>أنشئ أول واجب من النموذج.</p></div>';

 $$('[data-delete-assignment]').forEach(b=>b.onclick=async()=>{
   if(!(await window.AcademyUI.confirm({title:'حذف الواجب؟',message:'سيتم حذف الواجب وكل تسليمات الطلاب المرتبطة به نهائيًا.',tone:'danger',acceptText:'حذف الواجب'})))return;
   const id=b.dataset.deleteAssignment;b.disabled=true;
   try{
     await AcademyBackend.request('teacher/assignments/delete',{method:'POST',token:auth._token(),body:{id}});
     delete assignmentSubmissions[id];delete homeworkAssignments[id];renderTeacherAssignments();toast('تم حذف الواجب');
   }catch(err){console.error(err);b.disabled=false;toast('تعذر حذف الواجب الآن.','error')}
 });

 const rows=[];
 own.forEach(a=>Object.entries(assignmentSubmissions[a.id]||{}).forEach(([uid,s])=>rows.push({assignment:a,uid,...(s||{})})));
 rows.sort((a,b)=>{
   const ag=a.status==='graded'?1:0,bg=b.status==='graded'?1:0;
   return ag-bg||(b.submittedAt||0)-(a.submittedAt||0);
 });
 const box=$('teacherAssignmentSubmissions');
 if(box)box.innerHTML=rows.length?rows.map(r=>{
   const graded=r.status==='graded',late=r.late===true||(!r.late&&r.assignment.dueAt&&Number(r.submittedAt||0)>Number(r.assignment.dueAt));
   const submitted=r.submittedAt?new Date(r.submittedAt).toLocaleString('ar-EG'):'بدون وقت';
   return '<div class="teacher-analytics-row assignment-review-row '+(graded?'graded':'new-submission')+'">'+
     '<div><div class="teacher-student-title"><strong>'+escapeHtml(r.studentName||'طالب')+'</strong>'+(late?'<span class="status-pill rejected">متأخر</span>':'')+'</div><small>'+escapeHtml(r.assignment.title||'واجب')+'</small><small>'+escapeHtml(submitted)+'</small></div>'+
     '<span><b>'+(graded?Number(r.score||0)+' / '+Number(r.maxScore||r.assignment.maxScore||100):'—')+'</b><small>الدرجة</small></span>'+
     '<span><b>'+(graded?'مصحح':'جديد')+'</b><small>الحالة</small></span>'+
     '<button class="btn '+(graded?'btn-soft':'btn-primary')+'" data-grade-assignment="'+r.assignment.id+'|'+r.uid+'">'+(graded?'تعديل التصحيح':'تصحيح الآن')+'</button>'+
   '</div>';
 }).join(''):'<div class="portal-empty-state"><span>📥</span><h3>لا توجد تسليمات بعد</h3><p>تسليمات الطلاب هتظهر هنا، والجديد سيظهر أولًا.</p></div>';
 if(box&&unavailableSubmissions.size)box.insertAdjacentHTML('afterbegin',window.AcademyUI.errorStateHtml('بعض التسليمات غير متاحة','تعذر تحميل تسليمات '+unavailableSubmissions.size+' واجب. أعد المحاولة بعد التحقق من الاتصال والصلاحيات.','<button class="btn btn-soft" onclick="location.reload()">إعادة المحاولة</button>'));
 $$('[data-grade-assignment]').forEach(b=>b.onclick=()=>openGradeSubmission(b.dataset.gradeAssignment,b));
}
async function submitTeacherAssignment(e){
 e.preventDefault();
 if(teacher?.role==='assistant')return toast('مساعد المعلم لا يملك صلاحية إنشاء الواجبات.','error');
 const subject=$('assignmentSubject').value,subjectName=$('assignmentSubject').selectedOptions[0]?.textContent||subject;
 const targetMode=$('assignmentTargetMode')?.value||'all',targetRaw=$('assignmentTargetValue')?.value.trim()||'';
 const targetStudentIds=targetMode==='students'?targetRaw.split(/[،,\s]+/).map(x=>x.trim()).filter(Boolean):[];
 const payload={
   title:$('assignmentTitle').value.trim(),instructions:$('assignmentInstructions').value.trim(),
   type:$('assignmentEducationType').value,stage:$('assignmentStage').value,grade:$('assignmentGrade').value,
   subject,subjectName,dueAt:$('assignmentDueAt').value?new Date($('assignmentDueAt').value).getTime():0,
   maxScore:Number($('assignmentMaxScore').value||100),teacherId:user.uid,teacherName:teacher.name||user.displayName||'المدرس',
   targetMode,targetStudentIds,targetGroupId:targetMode==='group'?targetRaw:'',
   submissionKind:'assignment',status:'pending',createdAt:Date.now()
 };
 if(!payload.title||!payload.dueAt)return toast('أكمل عنوان الواجب وآخر موعد.','error');
 if(payload.targetMode==='students'&&!payload.targetStudentIds.length)return toast('أدخل معرّف طالب واحد على الأقل.','error');
 if(payload.targetMode==='group'&&!payload.targetGroupId)return toast('أدخل رمز المجموعة أو الفصل.','error');
 if(!assignmentAllowed(payload.type,payload.stage,payload.grade,payload.subject))return toast('لا يمكنك إرسال واجب لمادة غير مسندة إلى حسابك.','error');
 if(payload.dueAt<=Date.now())return toast('اختر موعد تسليم في المستقبل.','error');
 if(!Number.isFinite(payload.maxScore)||payload.maxScore<1||payload.maxScore>1000)return toast('الدرجة النهائية يجب أن تكون بين 1 و1000.','error');
 const btn=$('teacherAssignmentSubmitBtn');
 window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const ref=db.ref('teacherSubmissions/'+user.uid).push();await ref.set(payload);submissions[ref.key]=payload;
   e.target.reset();updateAssignmentGrades();render();toast('تم إرسال الواجب للإدارة؛ سيُنشر بعد الموافقة ✅');
 }catch(err){console.error(err);toast('تعذر إرسال الواجب. حاول مرة أخرى.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false);updateSubmitAvailability()}
}
function openGradeSubmission(key,trigger=null){
 const [assignmentId,uid]=key.split('|'),a=homeworkAssignments[assignmentId],s=assignmentSubmissions[assignmentId]?.[uid];if(!a||!s)return;
 gradeModalTrigger=trigger;activeGrade={assignmentId,uid};$('gradeModalTitle').textContent=(s.studentName||'طالب')+' • '+(a.title||'واجب');
 $('gradeSubmissionPreview').innerHTML='<div><small>إجابة الطالب</small><p>'+escapeHtml(s.answer||'لا توجد إجابة نصية')+'</p>'+(s.link?'<a href="'+escapeHtml(safeUrl(s.link))+'" target="_blank" rel="noopener">فتح الرابط المرفق <i class="fa-solid fa-arrow-up-right-from-square"></i></a>':'')+'</div>';
 const maxScore=Number(a.maxScore||100);$('gradeScore').max=maxScore;$('gradeScoreLabel').textContent='الدرجة من '+maxScore;
 $('gradeScore').value=s.status==='graded'?Number(s.score||0):'';$('gradeFeedback').value=s.feedback||'';
 $('teacherGradeModal').classList.remove('hidden');$('teacherGradeModal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
 setTimeout(()=>$('gradeScore')?.focus(),30);
}
function closeGradeModal(){
 activeGrade=null;$('teacherGradeModal')?.classList.add('hidden');$('teacherGradeModal')?.setAttribute('aria-hidden','true');document.body.style.overflow='';
 const target=gradeModalTrigger;gradeModalTrigger=null;setTimeout(()=>target?.focus(),30);
}
async function saveGrade(e){
 e.preventDefault();if(!activeGrade)return;
 if(teacher?.role==='assistant')return toast('مساعد المعلم لا يملك صلاحية تصحيح الواجبات.','error');
 const a=homeworkAssignments[activeGrade.assignmentId]||{},maxScore=Number(a.maxScore||100),raw=$('gradeScore').value;
 if(raw==='')return toast('أدخل درجة الطالب.','error');
 const score=Number(raw);
 if(!Number.isFinite(score)||score<0||score>maxScore)return toast('الدرجة يجب أن تكون بين 0 و'+maxScore+'.','error');
 const percent=Math.round(score/maxScore*100),feedback=$('gradeFeedback').value.trim(),btn=e.submitter||e.target.querySelector('button[type="submit"]');
 window.AcademyUI?.setButtonLoading(btn,true,'حفظ');
 try{
   const patch={status:'graded',score,maxScore,percent,feedback,gradedAt:Date.now(),gradedBy:user.uid};
   await db.ref('assignmentSubmissions/'+activeGrade.assignmentId+'/'+activeGrade.uid).update(patch);
   assignmentSubmissions[activeGrade.assignmentId]=assignmentSubmissions[activeGrade.assignmentId]||{};
   assignmentSubmissions[activeGrade.assignmentId][activeGrade.uid]={...(assignmentSubmissions[activeGrade.assignmentId][activeGrade.uid]||{}),...patch};
   closeGradeModal();renderTeacherAssignments();toast('تم حفظ التصحيح وإرساله للطالب ✅');
 }catch(err){console.error(err);toast('تعذر حفظ التصحيح الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}

function updateNotificationGrades(){
 const stage=$('teacherNotificationStage')?.value||'primary',max=stage==='primary'?6:3,current=$('teacherNotificationGrade')?.value;
 if(!$('teacherNotificationGrade'))return;
 $('teacherNotificationGrade').innerHTML=Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join('');
 if(current&&Number(current)<=max)$('teacherNotificationGrade').value=current;
 updateNotificationSubjects();
}
function updateNotificationSubjects(){
 if(!$('teacherNotificationSubject'))return;
 const type=$('teacherNotificationType')?.value||'public',stage=$('teacherNotificationStage')?.value||'primary',grade=$('teacherNotificationGrade')?.value||'1',current=$('teacherNotificationSubject').value;
 const list=getSubjects(stage,grade,type);
 $('teacherNotificationSubject').innerHTML=list.length?list.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join(''):'<option value="">لا توجد مادة مسندة لهذا الصف</option>';
 if(list.some(s=>s.id===current))$('teacherNotificationSubject').value=current;
 if($('teacherNotificationSubmitBtn'))$('teacherNotificationSubmitBtn').disabled=!list.length;
}
function renderTeacherNotifications(){
 const rows=Object.entries(submissions||{}).filter(([,v])=>v?.submissionKind==='notification').map(([id,v])=>({id,...(v||{})})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const box=$('teacherNotificationRequests');if(!box)return;
 box.innerHTML=rows.length?rows.map(n=>{
   const status=n.status||'pending',label=statusLabel(status);
   return '<article class="submission-item teacher-notification-request-v11"><div><h4><i class="fa-regular fa-bell"></i> '+escapeHtml(n.title||'إشعار')+'</h4><p>'+escapeHtml(n.subjectName||n.subject||'مادة')+' • '+(stageName[n.stage]||n.stage||'')+' • صف '+escapeHtml(n.grade||'')+'</p><small>'+escapeHtml((n.text||'').slice(0,120))+'</small></div><span class="status-pill '+status+'">'+label+'</span></article>';
 }).join(''):'<div class="portal-empty-state"><span>🔔</span><h3>لم ترسل إشعارات بعد</h3><p>أي رسالة ترسلها ستظهر هنا أثناء مراجعتها من الإدارة.</p></div>';
}
async function submitTeacherNotification(e){
 e.preventDefault();
 if(teacher?.role==='assistant')return toast('مساعد المعلم لا يملك صلاحية إرسال إشعارات للطلاب.','error');
 const type=$('teacherNotificationType').value,stage=$('teacherNotificationStage').value,grade=$('teacherNotificationGrade').value,subject=$('teacherNotificationSubject').value;
 const title=$('teacherNotificationTitle').value.trim(),text=$('teacherNotificationText').value.trim(),priority=$('teacherNotificationPriority').value;
 const subjectName=$('teacherNotificationSubject').selectedOptions[0]?.textContent||subject,durationDays=Math.max(1,Math.min(14,Number($('teacherNotificationDays').value||5)));
 const href=$('teacherNotificationHref').value.trim();
 if(!title||!text||!subject)return toast('أكمل المادة والعنوان ونص الإشعار.','error');
 if(!assignmentAllowed(type,stage,grade,subject))return toast('لا يمكنك إرسال إشعار لمادة غير مسندة إلى حسابك.','error');
 if(href&&!href.startsWith('./')&&!href.startsWith('/')&&!/^https?:\/\//i.test(href))return toast('رابط الإجراء غير صالح. استخدم رابطًا داخليًا يبدأ بـ ./ أو رابط https.','error');
 const payload={submissionKind:'notification',title,text,type,stage,grade,subject,subjectName,priority,durationDays,href,status:'pending',teacherId:user.uid,teacherName:teacher.name||user.displayName||'المدرس',createdAt:Date.now()};
 const btn=$('teacherNotificationSubmitBtn');window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const ref=db.ref('teacherSubmissions/'+user.uid).push();await ref.set(payload);submissions[ref.key]=payload;
   e.target.reset();$('teacherNotificationDays').value=5;updateNotificationGrades();render();toast('تم إرسال الإشعار للإدارة للمراجعة ✅');
 }catch(err){console.error(err);toast('تعذر إرسال الإشعار الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false);updateNotificationSubjects()}
}

function render(){
 const name=teacher.name||user.displayName||user.email.split('@')[0]||'أستاذنا';
 $('teacherTopName').textContent='أهلًا '+name+' 👋';$('teacherWelcomeName').textContent=name;
 const assignments=normalizeAssignments(),subs=Object.entries(submissions||{}).filter(([,v])=>v?.type!=='profile').map(([id,v])=>({id,...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const approved=subs.filter(s=>s.status==='approved'),pending=subs.filter(s=>(s.status||'pending')==='pending'),rejected=subs.filter(s=>s.status==='rejected'),lessons=ownLessons();
 const publicProfile=data.publicProfile||{},pendingProfile=Object.values(submissions||{}).some(s=>s?.type==='profile'&&s.status==='pending');
 const roleLabel=teacher.role==='assistant'?'مساعد معلم':teacher.role==='supervisor'?'مشرف مادة':'معلم';
 if($('teacherHomeRoleBadge'))$('teacherHomeRoleBadge').innerHTML='<i class="fa-solid fa-shield-halved"></i> '+roleLabel;
 if($('teacherHomeProfileStatus')){
   const profileLabel=pendingProfile?'الملف قيد المراجعة':publicProfile.name&&publicProfile.active!==false?'الملف منشور':'أكمل ملفك العام';
   $('teacherHomeProfileStatus').innerHTML='<i class="fa-regular fa-id-card"></i> '+profileLabel;
   $('teacherHomeProfileStatus').classList.toggle('pending',pendingProfile);
   $('teacherHomeProfileStatus').classList.toggle('published',!pendingProfile&&!!publicProfile.name&&publicProfile.active!==false);
 }
 if($('teacherHomeSubtitle'))$('teacherHomeSubtitle').textContent=publicProfile.title||'أضف محتوى منظم، تابع ما تم اعتماده، وركّز على جودة الشرح.';
 const hero=$('teacherHomeHero'),avatar=$('teacherHomeAvatar'),photo=safeUrl(publicProfile.photoUrl||''),cover=safeUrl(publicProfile.coverUrl||'');
 if(hero){hero.classList.toggle('has-cover',cover!=='#');hero.style.setProperty('--teacher-home-cover',cover!=='#'?'url("'+cover.replace(/"/g,'%22')+'")':'none')}
 if(avatar)avatar.innerHTML=photo!=='#'?'<img src="'+escapeHtml(photo)+'" alt="" loading="eager">':'<span>'+escapeHtml((name.trim()[0]||'م'))+'</span>';
 if($('teacherPipelinePending'))$('teacherPipelinePending').textContent=pending.length;
 if($('teacherPipelineApproved'))$('teacherPipelineApproved').textContent=approved.length;
 if($('teacherPipelineRejected'))$('teacherPipelineRejected').textContent=rejected.length;
 if($('teacherPipelineHint'))$('teacherPipelineHint').textContent=pending.length?'لديك '+pending.length+' طلب '+(pending.length===1?'ينتظر':'تنتظر')+' مراجعة الإدارة.':rejected.length?'راجع المحتوى المرفوض وعدّله قبل إعادة الإرسال.':'كل طلباتك الحالية تمت مراجعتها.';

 $('teacherApprovedCount').textContent=lessons.length||approved.length;$('teacherPendingCount').textContent=pending.length;
 $('teacherSubjectCount').textContent=new Set(assignments.map(a=>a.subject).filter(Boolean)).size||teacher.subjectCount||0;
 $('teacherGradeCount').textContent=new Set(assignments.map(a=>(a.stage||'')+'-'+(a.grade||'')).filter(x=>x!=='-')).size||teacher.gradeCount||0;

 $('teacherAssignments').innerHTML=assignments.length?assignments.map(a=>'<article class="teacher-assignment"><span>📘</span><div><strong>'+escapeHtml(a.subjectName||a.subject||'مادة مسندة')+'</strong><small>'+(a.type==='azhar'?'أزهر':'تعليم عام')+' • '+escapeHtml(stageName[a.stage]||a.stage||'كل المراحل')+' • '+(a.grade?'صف '+escapeHtml(a.grade):'كل الصفوف')+'</small></div><i class="fa-solid fa-circle-check teacher-assigned-check"></i></article>').join(''):'<div class="portal-empty-state compact"><span>🔒</span><h3>لا توجد مواد مسندة بعد</h3><p>لن تتمكن من إرسال محتوى أو واجبات حتى تسند الإدارة مادة لحسابك.</p></div>';
 renderSubmissionList('teacherRecentSubmissions',subs.slice(0,5));
 renderSubmissionList('teacherQuizRequests',subs.filter(s=>s.submissionKind==='quiz'));
 renderSubmissionList('teacherAssignmentRequests',subs.filter(s=>s.submissionKind==='assignment'));
 renderTeacherNotifications();
 if($('teacherApprovedList')){
   $('teacherApprovedList').innerHTML=lessons.length?lessons.map(l=>'<article class="submission-item"><div><h4>'+escapeHtml(l.title||'درس')+'</h4><p>'+(stageName[l.stage]||l.stage||'')+' • صف '+(l.grade||'')+' • '+(l.subject||'')+'</p></div><span class="status-pill approved">منشور</span></article>').join(''):'<p class="profile-muted">لا يوجد محتوى منشور حتى الآن.</p>';
 }
 renderTeacherAnalytics();
 renderTeacherAssignments();
}
async function submitContent(e){
 e.preventDefault();
 const btn=$('teacherSubmitBtn'),subjectId=$('teacherSubject').value,subjectName=$('teacherSubject').selectedOptions[0]?.textContent||subjectId;
 const videoUrl=$('teacherVideoUrl').value.trim(),content=$('teacherLessonContent').value.trim(),rawImage=$('teacherLessonImage').value.trim();
 let videoCheckpoints=[];try{const raw=String($('teacherVideoCheckpoints')?.value||'').trim();videoCheckpoints=raw?JSON.parse(raw):[];if(!Array.isArray(videoCheckpoints))throw new Error()}catch{return toast('صيغة الأسئلة التفاعلية داخل الفيديو غير صحيحة.','error')}
 videoCheckpoints=videoCheckpoints.map((q,i)=>({id:String(q?.id||('checkpoint-'+i)),time:Math.max(1,Number(q?.time||q?.second||0)),question:String(q?.question||q?.text||'').trim(),options:Array.isArray(q?.options)?q.options.map(x=>String(x??'')).filter(Boolean):[],correctAnswer:Number(q?.correctAnswer||0),explanation:String(q?.explanation||'').trim()})).filter(q=>q.time>0&&q.question&&q.options.length>=2);
 let questions=[];try{questions=collectLessonQuestions()}catch(err){return toast(err.message,'error')}
 const payload={
   submissionKind:'lesson',title:$('teacherLessonTitle').value.trim(),videoUrl,videoCheckpoints,content,contentFormat:'html',
   imageUrl:rawImage,imagePosition:$('teacherLessonImagePosition').value==='bottom'?'bottom':'top',
   questions,type:$('teacherEducationType').value,stage:$('teacherStage').value,grade:$('teacherGrade').value,
   subject:subjectId,subjectName,unit:Number($('teacherUnit').value||1),notes:$('teacherNotes').value.trim(),
   status:'pending',teacherId:user.uid,teacherName:teacher.name||user.displayName||'',createdAt:Date.now()
 };
 if(!payload.title)return toast('اكتب عنوان الدرس.','error');
 if(!payload.videoUrl&&!payload.content)return toast('أضف شرحًا مكتوبًا أو رابط فيديو واحدًا على الأقل.','error');
 if(!assignmentAllowed(payload.type,payload.stage,payload.grade,payload.subject))return toast('هذه المادة غير مسندة إلى حسابك.','error');
 if(payload.videoUrl){
   try{
     const video=new URL(payload.videoUrl);
     if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(video.hostname))return toast('أدخل رابط YouTube صحيحًا.','error');
   }catch{return toast('رابط الفيديو غير صحيح.','error')}
 }
 if(payload.imageUrl&&safeUrl(payload.imageUrl)==='#')return toast('رابط صورة الدرس غير صحيح.','error');
 window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const ref=db.ref('teacherSubmissions/'+user.uid).push();await ref.set(payload);submissions[ref.key]=payload;
   $('teacherSubmissionForm').reset();teacherLessonRichEditor?.clear();$('teacherLessonQuestionRows').replaceChildren();$('teacherLessonQuestionsBulk').value='';updateGrades();render();switchTab('home');toast('تم إرسال الدرس الكامل للإدارة للمراجعة ✅');
 }catch(err){console.error(err);toast('تعذر الإرسال. راجع الاتصال أو حاول لاحقًا.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false);updateSubmitAvailability()}
}
function showNoAccess(message){
 window.AcademyUI?.hidePageLoading();
 $('teacherPortal').classList.add('hidden');$('teacherAccess').classList.remove('hidden');$('teacherAccessText').textContent=message;
 $('teacherLoginForm')?.classList.toggle('hidden',!!auth.currentUser);
 $('teacherSwitchAccount')?.classList.toggle('hidden',!auth.currentUser);
}
$('teacherLoginForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const button=$('teacherLoginBtn'),email=$('teacherLoginEmail').value.trim(),password=$('teacherLoginPassword').value;
 if(!email||!password)return;
 button.disabled=true;button.textContent='جاري تسجيل الدخول...';
 try{
   await auth.setPersistence(AcademyBackend.auth.Auth.Persistence.LOCAL);
   await auth.signInWithEmailAndPassword(email,password);
   $('teacherLoginPassword').value='';
 }catch(err){
   console.error('Teacher sign-in failed:',err);
   $('teacherAccessText').textContent=err.code==='auth/too-many-requests'?'محاولات كثيرة. انتظر قليلًا أو أعد تعيين كلمة المرور.':'تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور.';
 }finally{button.disabled=false;button.textContent='الدخول إلى بوابة المدرس'}
});
$('teacherResetPassword')?.addEventListener('click',async()=>{
 const email=$('teacherLoginEmail').value.trim();if(!email){$('teacherAccessText').textContent='اكتب بريدك الإلكتروني أولًا لاستعادة كلمة المرور.';$('teacherLoginEmail').focus();return}
 try{await auth.sendPasswordResetEmail(email);$('teacherAccessText').textContent='إذا كان البريد مسجّلًا فستصلك رسالة لإعادة تعيين كلمة المرور.'}
 catch(err){console.error(err);$('teacherAccessText').textContent='تعذر إرسال الرسالة الآن. حاول مجددًا لاحقًا.'}
});
$('teacherSwitchAccount')?.addEventListener('click',()=>auth.signOut().catch(err=>{console.error(err);toast('تعذر تبديل الحساب الآن.','error')}));
const teacherNavTabs=$$('.teacher-nav [data-teacher-tab]');
teacherNavTabs.forEach(b=>b.onkeydown=e=>{
 if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
 e.preventDefault();
 const visible=teacherNavTabs.filter(x=>!x.closest('[hidden]'));
 const i=visible.indexOf(b);if(i<0)return;
 let next=i;
 if(e.key==='ArrowRight')next=(i-1+visible.length)%visible.length;
 if(e.key==='ArrowLeft')next=(i+1)%visible.length;
 if(e.key==='Home')next=0;
 if(e.key==='End')next=visible.length-1;
 visible[next].focus();switchTab(visible[next].dataset.teacherTab);
});
$$('[data-teacher-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.teacherTab));
$$('[data-open-teacher-submit]').forEach(b=>b.onclick=()=>switchTab('submit'));
$('teacherStage').addEventListener('change',updateGrades);$('teacherGrade').addEventListener('change',updateSubjects);$('teacherEducationType').addEventListener('change',updateSubjects);
const teacherLessonRichEditor=window.AcademyRichEditor?.init('teacherLessonContent',{placeholder:'اكتب شرحًا احترافيًا للدرس... استخدم العناوين والقوائم والألوان وأدرج الصور داخل المقال من زر «صورة».'});
window.AcademyTeacherCoreV6={addQuizQuestion,addLessonQuestion,collectQuizQuestions,collectLessonQuestions,availableQuizLessons,updateQuizLessons,updateGrades,updateQuizGrades,assignmentAllowed,toast,getUser:()=>user,getTeacher:()=>teacher,getData:()=>data,getDb:()=>db,getAuth:()=>auth,getSubmissions:()=>submissions};
$('teacherSubmissionForm').addEventListener('submit',submitContent);
$('teacherAddLessonQuestion')?.addEventListener('click',()=>addLessonQuestion()?.querySelector('.teacher-question-text')?.focus());
$('teacherImportLessonQuestions')?.addEventListener('click',importLessonQuestions);
$('teacherQuizType').addEventListener('change',updateQuizSubjects);
$('teacherQuizStage').addEventListener('change',updateQuizGrades);
$('teacherQuizGrade').addEventListener('change',updateQuizSubjects);
$('teacherQuizSubject').addEventListener('change',updateQuizLessons);
$('teacherAddQuestion').onclick=()=>addQuizQuestion()?.querySelector('.teacher-question-text')?.focus();
$('teacherImportQuestions').onclick=importQuizQuestions;
$('teacherGenerateQuestions').onclick=generateQuizQuestionsFromBank;
$('teacherQuizForm').addEventListener('submit',submitTeacherQuiz);
$('teacherProfileForm')?.addEventListener('submit',submitTeacherProfile);
$('teacherAssignmentForm')?.addEventListener('submit',submitTeacherAssignment);
$('teacherNotificationForm')?.addEventListener('submit',submitTeacherNotification);
$('teacherNotificationType')?.addEventListener('change',updateNotificationSubjects);
$('teacherNotificationStage')?.addEventListener('change',updateNotificationGrades);
$('teacherNotificationGrade')?.addEventListener('change',updateNotificationSubjects);
$('assignmentStage')?.addEventListener('change',updateAssignmentGrades);
$('assignmentGrade')?.addEventListener('change',updateAssignmentSubjects);
$('assignmentEducationType')?.addEventListener('change',updateAssignmentSubjects);
$('teacherGradeForm')?.addEventListener('submit',saveGrade);
$('closeTeacherGradeModal')?.addEventListener('click',closeGradeModal);
$('teacherGradeModal')?.addEventListener('click',e=>{if(e.target===$('teacherGradeModal'))closeGradeModal()});
initTeacherCollapse();
$('teacherMenuBtn').onclick=()=>{$('teacherSide').classList.add('open');$('teacherOverlay')?.classList.remove('hidden')};
$('teacherOverlay')?.addEventListener('click',()=>{$('teacherSide').classList.remove('open');$('teacherOverlay').classList.add('hidden')});
$('teacherLogout').onclick=async()=>{
 const ok=await window.AcademyUI.confirm({title:'تسجيل الخروج؟',message:'سيتم إغلاق جلسة المدرس الحالية ويمكنك العودة في أي وقت.',tone:'warning',acceptText:'تسجيل الخروج'});
 if(!ok)return;
 try{await auth.signOut();location.replace('./index.html')}catch(err){console.error(err);toast('تعذر تسجيل الخروج الآن.','error')}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('teacherGradeModal')?.classList.contains('hidden'))closeGradeModal()});

auth.onAuthStateChanged(async u=>{
 if(!u){user=null;teacher=null;showNoAccess('ادخل ببريد المدرس وكلمة المرور التي حددتها الإدارة.');return}
 user=u;
 window.AcademyUI?.showPageLoading('جاري تحميل بوابة المدرس وصلاحياتك...');
 try{
   const t=await db.ref('teacherProfiles/'+u.uid).once('value');
   teacher=t.val();
   if(teacher?.role==='assistant'){
     $$('[data-teacher-tab="assignments"]').forEach(el=>el.classList.add('hidden'));
     $$('[data-teacher-tab="notifications"]').forEach(el=>el.classList.add('hidden'));
     $$('[data-teacher-tab="students"]').forEach(el=>el.classList.add('hidden'));
     $$('[data-teacher-tab="classes"]').forEach(el=>el.classList.add('hidden'));
   }else{
     $$('[data-teacher-tab="assignments"]').forEach(el=>el.classList.remove('hidden'));
     $$('[data-teacher-tab="notifications"]').forEach(el=>el.classList.remove('hidden'));
     $$('[data-teacher-tab="students"]').forEach(el=>el.classList.remove('hidden'));
     $$('[data-teacher-tab="classes"]').forEach(el=>el.classList.remove('hidden'));
   }
   if($('teacherTopRole')){
     $('teacherTopRole').textContent=teacher?.role==='assistant'?'مساعد معلم • إعداد محتوى واختبارات':teacher?.role==='supervisor'?'مشرف مادة • متابعة المحتوى والتحليلات':'بوابة إدارة المحتوى التعليمي';
   }
   if(!teacher){showNoAccess('الحساب الحالي ليس له ملف مدرس. الإدارة لازم تضيفه كمدرس أولًا.');if(auth.currentUser?.uid===u.uid)await auth.signOut().catch(()=>{});return}
   if(teacher.isActive!==true||teacher.status==='blocked'){showNoAccess('حساب المدرس غير مفعل حاليًا. تواصل مع الإدارة.');return}

   const [subjectsSnap,submissionSnap,directLessonsSnap,homeworkSnap,publicProfileSnap]=await Promise.all([
     db.ref('customSubjects').once('value'),
     db.ref('teacherSubmissions/'+u.uid).once('value'),
     db.ref('lessons').orderByChild('teacherId').equalTo(u.uid).once('value'),
     db.ref('assignments').orderByChild('teacherId').equalTo(u.uid).once('value'),
     db.ref('settings/publicTeachers/'+u.uid).once('value')
   ]);
   submissions=submissionSnap.val()||{};
   const lessons=directLessonsSnap.val()||{};

   const legacyLessonIds=[...new Set(Object.values(submissions).map(s=>s?.lessonId).filter(Boolean).filter(id=>!lessons[id]))];
   if(legacyLessonIds.length){
     const legacySnaps=await Promise.all(legacyLessonIds.map(id=>db.ref('lessons/'+id).once('value')));
     legacyLessonIds.forEach((id,i)=>{if(legacySnaps[i].exists())lessons[id]=legacySnaps[i].val()});
   }
   const assignedSubjects=[...new Set(normalizeAssignments().map(scope=>typeof scope==='string'?scope:scope.subject).filter(Boolean))];
   const scopeSnaps=await Promise.allSettled(assignedSubjects.map(subject=>db.ref('lessons').orderByChild('subject').equalTo(subject).once('value')));
   scopeSnaps.forEach(result=>{if(result.status==='fulfilled')Object.assign(lessons,result.value.val()||{})});
   data={customSubjects:subjectsSnap.val()||{},lessons,publicProfile:publicProfileSnap.val()||{}};
   homeworkAssignments=homeworkSnap.val()||{};

   const lessonIds=ownLessons().map(lesson=>lesson.id),ownIds=Object.keys(homeworkAssignments);
   const [metricSnaps,submissionSnaps]=await Promise.all([
     Promise.allSettled(lessonIds.map(id=>db.ref('contentAnalytics/'+id).once('value'))),
     Promise.allSettled(ownIds.map(id=>db.ref('assignmentSubmissions/'+id).once('value')))
   ]);
   analytics={};lessonIds.forEach((id,i)=>{if(metricSnaps[i].status==='fulfilled')analytics[id]=metricSnaps[i].value.val()||{}});
   assignmentSubmissions={};unavailableSubmissions.clear();ownIds.forEach((id,i)=>{if(submissionSnaps[i].status==='fulfilled')assignmentSubmissions[id]=submissionSnaps[i].value.val()||{};else unavailableSubmissions.add(id)});
   if(unavailableSubmissions.size)toast('تم فتح البوابة، لكن تعذر تحميل بعض تسليمات الواجبات.','error');

   $('teacherAccess').classList.add('hidden');$('teacherPortal').classList.remove('hidden');
   updateGrades();updateAssignmentGrades();updateQuizGrades();updateNotificationGrades();render();renderTeacherProfile(publicProfileSnap.val()||{});
   let requested=new URLSearchParams(location.search).get('tab')||'home';
   if(teacher?.role==='assistant'&&['assignments','notifications','students'].includes(requested))requested='home';
   switchTab(requested,false);
 }catch(err){console.error(err);showNoAccess('تعذر تحميل صلاحيات المدرس الآن.')}
 finally{window.AcademyUI?.hidePageLoading()}
});
})();
