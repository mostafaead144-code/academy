(() => {
'use strict';

const backendConfig=window.ACADEMY_BACKEND_CONFIG;
const adminSession=window.AcademyRoleSession?.get('admin');
if(!adminSession)throw new Error('Admin session unavailable');
const auth=adminSession.auth,db=adminSession.db;
const $=id=>document.getElementById(id), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const askConfirm=opts=>window.AcademyUI?.confirm?window.AcademyUI.confirm(opts):(console.error('AcademyUI confirm unavailable'),Promise.resolve(false));

let currentUser=null,root={},unsubscribe=null,currentAdminTab='overview',adminRootPrimed=false,adminModalTrigger=null,curriculumViewMode=localStorage.getItem('academy-admin-curriculum-view')||'tree',curriculumOpenSubjects=new Set(),contentCopySource=null,contentReviewTarget=null;
const selectedLessonIds=new Set(),selectedQuizIds=new Set();
const adminPathStops=new Map(),adminPathPromises=new Map();
const editState={subject:null,lesson:null,quiz:null,file:null,simulation:null,live:null,schedule:null,news:null};
const stageNames={primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};
const defaultSubjects={
 primary:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'religion',name:'التربية الدينية',emoji:'🕌'}],
 prep:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'computer',name:'الحاسب الآلي',emoji:'💻'}],
 sec:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'physics',name:'الفيزياء',emoji:'⚛️'},{id:'chemistry',name:'الكيمياء',emoji:'🧪'},{id:'biology',name:'الأحياء',emoji:'🧬'},{id:'history',name:'التاريخ',emoji:'🏛️'},{id:'geography',name:'الجغرافيا',emoji:'🌍'}]
};

const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cleanUrl=(u='')=>{try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:'#'}catch{return'#'}};
const typeLabel=t=>t==='azhar'?'أزهر':'تعليم عام';
const gradeCount=s=>s==='primary'?6:3;
const gradeLabel=(s,g)=>'الصف '+g+' '+(stageNames[s]||'');

function toast(msg,type='success'){
 const el=$('toast'); if(!el)return;
 el.textContent=msg; el.className='toast show '+type;
 clearTimeout(toast.t); toast.t=setTimeout(()=>el.className='toast',3200);
}
async function writeAudit(action,entity,entityId,meta={}){
 if(!currentUser?.uid)return;
 try{
  const ts=Date.now(),key=ts+'-'+Math.random().toString(36).slice(2,10);
  await db.ref('auditLogV4/'+key).set({uid:currentUser.uid,action,entity,entityId:entityId||'',meta,at:ts,createdAt:ts});
 }catch(err){console.warn('Audit log write skipped',err)}
}
function empty(title='لا توجد بيانات',text=''){
 return '<div class="empty-admin"><span>📭</span><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p></div>';
}
function openModal(id){
 const modal=$(id);if(!modal)return;
 adminModalTrigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
 setTimeout(()=>modal.querySelector('.modal-panel')?.focus(),30);
}
function closeModal(id){
 const modal=$(id);if(!modal)return;
 modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';
 if(id==='contentReviewModal'){const frame=$('contentReviewFrame');if(frame)frame.src='about:blank';contentReviewTarget=null}
 const target=adminModalTrigger;adminModalTrigger=null;setTimeout(()=>target?.focus(),30);
}
function values(obj){return Object.entries(obj||{}).map(([id,v])=>({id,...(v||{})}))}
function flattenSubmissions(){
 const out=[];Object.entries(root.teacherSubmissions||{}).forEach(([uid,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({uid,id,...(v||{})})));
 return out.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function subjectsFor(stage,grade,type){
 const list=[...(defaultSubjects[stage]||[])];
 const custom=root.customSubjects?.[stage]?.[grade];
 const arr=Array.isArray(custom)?custom:Object.values(custom||{});
 arr.forEach(s=>{
   if(!s?.id||!s?.name||(s.type&&s.type!==type))return;
   const i=list.findIndex(x=>x.id===s.id),item={id:s.id,name:s.name,emoji:s.emoji||'📚',imageUrl:s.imageUrl||'',units:s.units||[]};
   if(i>=0)list[i]={...list[i],...item}; else list.push(item);
 });
 return list;
}
function customSubjectsFor(stage,grade,type){
 const custom=root.customSubjects?.[stage]?.[grade],arr=Array.isArray(custom)?custom:Object.values(custom||{});
 return arr.filter(s=>s?.id&&s?.name&&(!s.type||s.type===type));
}
function adminSubjectMeta(stage,grade,type,id){
 return subjectsFor(stage,String(grade||1),type||'public').find(s=>s.id===id)||{id:id||'',name:id||'مادة دراسية',emoji:'📚',imageUrl:'',units:[]};
}
function adminUnitLabel(item){
 const subject=adminSubjectMeta(item?.stage,item?.grade,item?.type,item?.subject),unit=Number(item?.unit||0);
 if(!unit)return'اختبار شامل';
 return subject.units?.[unit-1]?.name||('الوحدة '+unit);
}
function adminLessonTeachers(lesson){
 const names=new Set();
 if(lesson?.teacherId){
   const profile=root.teacherProfiles?.[lesson.teacherId];
   if(profile?.name)names.add(profile.name);
 }
 if(lesson?.teacherName)names.add(lesson.teacherName);
 (Array.isArray(lesson?.videos)?lesson.videos:[]).forEach(v=>{
   const profile=v?.teacherId?root.teacherProfiles?.[v.teacherId]:null;
   const name=profile?.name||v?.name;
   if(name)names.add(name);
 });
 return [...names];
}
function adminPreviewQuery(item,extra={}){
 const q=new URLSearchParams({type:item?.type||'public',stage:item?.stage||'prep',grade:String(item?.grade||1),subject:item?.subject||'',...extra});
 return q.toString();
}
function publicationState(item,now=Date.now()){
 if(item?.workflowStatus==='draft')return'draft';
 if(item?.isHidden)return'hidden';
 const at=Number(item?.publishAt||0);
 if(at&&at>now)return'scheduled';
 return'published';
}
function publicationLabel(item){
 const s=publicationState(item);return s==='draft'?'مسودة':s==='hidden'?'مخفي':s==='scheduled'?'مجدول':'منشور';
}
function publicationPillClass(item){const s=publicationState(item);return s==='draft'?'pending':s==='hidden'?'rejected':s==='scheduled'?'pending':'approved'}
function formatAdminDateTime(value){
 const n=Number(value||0);if(!n)return'';try{return new Date(n).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})}catch{return new Date(n).toLocaleString('ar-EG')}
}
function toLocalDateTimeInput(value){
 const d=new Date(Number(value||Date.now()));const pad=n=>String(n).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function lessonAdminPreviewUrl(lesson){return './lesson.html?'+adminPreviewQuery(lesson,{id:lesson.id,adminPreview:'1'})}
function quizAdminPreviewUrl(quiz){return './lesson.html?'+adminPreviewQuery(quiz,{quiz:quiz.id,adminPreview:'1'})}
function quizQuestionBankStatus(quiz,ts=Date.now()){
 if(quiz?.workflowStatus==='draft')return'draft';
 if(quiz?.isHidden)return'hidden';
 if(Number(quiz?.publishAt||0)>ts)return'scheduled';
 return'approved';
}
function reviewRecord(kind,id){
 const collection=kind==='quiz'?'quizzes':'lessons',item=root[collection]?.[id];return item?{kind,id,collection,item}:null;
}
function renderContentReviewState(){
 if(!contentReviewTarget)return;
 const rec=reviewRecord(contentReviewTarget.kind,contentReviewTarget.id);if(!rec)return;
 const {item}=rec,stateName=publicationState(item),status=$('contentReviewStatus'),approval=$('contentReviewApproval'),note=$('contentReviewScheduleNote'),cancel=$('contentReviewCancelSchedule');
 if(status){status.textContent=publicationLabel(item);status.className='status-pill '+publicationPillClass(item)}
 if(approval){
   const approved=item.reviewStatus==='approved';
   approval.classList.toggle('approved',approved);
   approval.innerHTML='<i class="fa-'+(approved?'solid':'regular')+' fa-circle-check"></i> '+(approved?'معتمد':'غير معتمد');
 }
 if($('contentReviewScheduleAt'))$('contentReviewScheduleAt').value=toLocalDateTimeInput(item.publishAt&&Number(item.publishAt)>Date.now()?item.publishAt:Date.now()+3600000);
 if(note){
   const scheduled=stateName==='scheduled';note.classList.toggle('hidden',!scheduled);
   note.innerHTML=scheduled?'<i class="fa-regular fa-clock"></i> سيتم النشر تلقائيًا في <strong>'+esc(formatAdminDateTime(item.publishAt))+'</strong>':'';
 }
 if(cancel)cancel.classList.toggle('hidden',stateName!=='scheduled');
}
function refreshContentReviewFrame(){
 if(!contentReviewTarget)return;
 const rec=reviewRecord(contentReviewTarget.kind,contentReviewTarget.id);if(!rec)return;
 const url=contentReviewTarget.kind==='quiz'?quizAdminPreviewUrl({...rec.item,id:rec.id}):lessonAdminPreviewUrl({...rec.item,id:rec.id});
 const frame=$('contentReviewFrame'),open=$('contentReviewOpenNew');
 if(frame)frame.src=url+'&previewNonce='+Date.now();
 if(open)open.href=url;
}
function openContentReview(kind,id){
 const rec=reviewRecord(kind,id);if(!rec)return;
 contentReviewTarget={kind,id};
 const item=rec.item,subject=adminSubjectMeta(item.stage,item.grade,item.type,item.subject);
 if($('contentReviewModalTitle'))$('contentReviewModalTitle').textContent=(kind==='quiz'?item.name:item.title)||'معاينة المحتوى';
 if($('contentReviewMeta'))$('contentReviewMeta').textContent=subject.name+' • '+gradeLabel(item.stage,item.grade)+' • '+adminUnitLabel(item);
 renderContentReviewState();refreshContentReviewFrame();openModal('contentReviewModal');
}
async function updateContentReview(changes,action,label){
 if(!contentReviewTarget)return;
 const rec=reviewRecord(contentReviewTarget.kind,contentReviewTarget.id);if(!rec)return;
 const now=Date.now(),payload={...changes,updatedAt:now};
 await db.ref(rec.collection+'/'+rec.id).update(payload);
 Object.assign(rec.item,payload);
 if(contentReviewTarget.kind==='quiz'){
   const bankStatus=quizQuestionBankStatus(rec.item,now),bankUpdates={};
   (Array.isArray(rec.item.questions)?rec.item.questions:[]).forEach((_,i)=>bankUpdates['questionBankV4/quiz-'+rec.id+'-'+i+'/status']=bankStatus);
   if(Object.keys(bankUpdates).length)await db.ref().update(bankUpdates);
 }
 await writeAudit(action,contentReviewTarget.kind,rec.id,{...changes});
 renderContentReviewState();refreshContentReviewFrame();toast(label);
}
async function approveReviewedContent(){
 return updateContentReview({reviewStatus:'approved',reviewedAt:Date.now(),reviewedBy:currentUser?.uid||''},'content.approve','تم اعتماد المحتوى');
}
async function publishReviewedContent(){
 return updateContentReview({isHidden:false,workflowStatus:'published',publishAt:null,reviewStatus:'approved',reviewedAt:Date.now(),reviewedBy:currentUser?.uid||'',publishedAt:Date.now()},'content.publish_now','تم نشر المحتوى الآن');
}
async function hideReviewedContent(){
 return updateContentReview({isHidden:true,workflowStatus:'hidden',publishAt:null},'content.hide','تم إخفاء المحتوى');
}
async function scheduleReviewedContent(){
 const raw=$('contentReviewScheduleAt')?.value||'',at=new Date(raw).getTime();
 if(!raw||!Number.isFinite(at)||at<=Date.now()+60000)return toast('اختر موعدًا مستقبليًا بعد دقيقة على الأقل.','error');
 return updateContentReview({isHidden:false,workflowStatus:'published',publishAt:at,reviewStatus:'approved',reviewedAt:Date.now(),reviewedBy:currentUser?.uid||''},'content.schedule_publish','تمت جدولة النشر في '+formatAdminDateTime(at));
}
async function cancelReviewedSchedule(){
 return updateContentReview({isHidden:true,workflowStatus:'hidden',publishAt:null},'content.cancel_schedule','تم إلغاء الجدولة وإبقاء المحتوى مخفيًا');
}
function editReviewedContent(){
 if(!contentReviewTarget)return;const {kind,id}=contentReviewTarget;closeModal('contentReviewModal');
 if(kind==='quiz')editQuiz(id);else editLesson(id);
}

function fillGrades(select,stage,keep){
 if(!select)return;const max=gradeCount(stage),current=keep||select.value||'1';
 select.innerHTML=Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">'+gradeLabel(stage,i+1)+'</option>').join('');
 if(Number(current)<=max)select.value=String(current);
}
function fillSubjects(select,stage,grade,type){
 if(!select)return;const list=subjectsFor(stage,String(grade),type);
 select.innerHTML=list.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
}
function bindHierarchy(typeId,stageId,gradeId,subjectId){
 const type=$(typeId),stage=$(stageId),grade=$(gradeId),subject=$(subjectId);
 if(!stage||!grade)return;
 const refreshGrade=()=>{fillGrades(grade,stage.value);if(subject)fillSubjects(subject,stage.value,grade.value,type?.value||'public');if(typeId==='subjectType')refreshSubjectPicker()};
 const refreshSubject=()=>{if(subject)fillSubjects(subject,stage.value,grade.value,type?.value||'public');if(typeId==='subjectType')refreshSubjectPicker()};
 stage.onchange=refreshGrade;grade.onchange=refreshSubject;if(type)type.onchange=refreshSubject;refreshGrade();
}
function adminName(){
 return root.adminProfiles?.[currentUser?.uid]?.name||currentUser?.displayName||'مدير المنصة';
}

const ADMIN_CORE_PATHS=['lessons','quizzes','studentProfilesV3','parentProfilesV4','teacherProfiles','teacherSubmissions','communicationSubmissionsV1','supportTicketsV1','subscriptionRequestsV1','community'];
const ADMIN_TAB_PATHS={
 overview:ADMIN_CORE_PATHS,
 analytics:['studentProfilesV3','lessons','quizzes','files','assignments','assignmentSubmissions','teacherProfiles','teacherSubmissions','contentAnalytics','customSubjects'],
 curriculum:['customSubjects','lessons','quizzes'],
 lessons:['lessons','quizzes','customSubjects','teacherProfiles','settings'],
 quizzes:['quizzes','customSubjects','lessons','teacherProfiles'],
 simulations:['simulations'],
 files:['files','customSubjects','lessons'],
 live:['liveSessions','customSubjects'],
 schedule:['scheduleEvents','customSubjects'],
 'content-ops':[],
 teachers:['teacherProfiles','teacherSubmissions','studentProfilesV3','customSubjects','settings'],
 students:['studentProfilesV3'],
 subscriptions:[],
 readiness:['studentProfilesV3','parentProfilesV4','teacherProfiles','teacherSubmissions','communicationSubmissionsV1','supportTicketsV1','subscriptionRequestsV1','subscriptionPlansV1','studentSubscriptionsV1','subscriptionSettingsV1','lessons','quizzes','files','simulations','liveSessions','assignments','community'],
 news:['posts'],
 community:['community'],
 communications:[],
 support:['supportTicketsV1'],
 notifications:[],
 announcements:['announcements'],
 settings:['settings']
};
const adminMeta={
 overview:['لوحة المعلومات','صباح الخير 👋'],
 analytics:['ذكاء الإدارة','التحليلات ومركز المشكلات'],
 curriculum:['هيكل المنهج','المواد والوحدات'],
 lessons:['المحتوى','إدارة الدروس'],
 quizzes:['التقييم','إدارة الاختبارات'],
 simulations:['التدريب','إدارة المحاكيات'],
 files:['المكتبة','الملفات والمراجع'],
 schedule:['المواعيد','جدول الحصص'],
 'content-ops':['المحتوى','عمليات المحتوى المتقدمة'],
 live:['الجلسات','البث المباشر'],
 teachers:['فريق التدريس','المدرسون والمراجعات'],
 students:['المتعلمون','إدارة الطلاب'],
 subscriptions:['الوصول','الاشتراكات والباقات'],
 news:['التواصل','الأخبار والتحديثات'],
 community:['الإشراف','المجتمع والبلاغات'],
 communications:['التواصل','مراجعة التواصل'],
 support:['الدعم','الدعم والشكاوى'],
 notifications:['التواصل','الإشعارات الموجهة'],
 announcements:['التواصل','الإعلانات'],
 readiness:['Phase 11','جاهزية الإطلاق'],
 settings:['المنصة','الإعدادات']
};
function renderAdminIdentity(){
 $('adminName').textContent=adminName();
 $('adminEmailMini').textContent=currentUser?.email||'';
 $('adminAvatar').textContent=(adminName()[0]||'م').toUpperCase();
}
function flattenAdminNested(obj){
 const out=[];Object.entries(obj||{}).forEach(([owner,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({owner,id,...(v||{})})));return out;
}
function releaseContentPublished(item){
 return item?.workflowStatus!=='draft'&&item?.isHidden!==true&&Number(item?.publishAt||0)<=Date.now();
}
function renderReleaseReadiness(){
 const checksBox=$('releaseReadinessChecks'),queuesBox=$('releaseReadinessQueues'),integrityBox=$('releaseReadinessIntegrity');if(!checksBox||!queuesBox||!integrityBox)return;
 const lessons=values(root.lessons),quizzes=values(root.quizzes),files=values(root.files),teachers=values(root.teacherProfiles),students=values(root.studentProfilesV3),parents=values(root.parentProfilesV4);
 const publishedLessons=lessons.filter(releaseContentPublished),publishedQuizzes=quizzes.filter(releaseContentPublished);
 const pendingTeacher=flattenSubmissions().filter(x=>!x.status||x.status==='pending').length;
 const pendingComm=flattenAdminNested(root.communicationSubmissionsV1).filter(x=>!x.status||x.status==='pending'||x.status==='approving').length;
 const openSupport=flattenAdminNested(root.supportTicketsV1).filter(x=>!['resolved','closed'].includes(x.status)).length;
 const pendingSubs=flattenAdminNested(root.subscriptionRequestsV1).filter(x=>x.status==='pending').length;
 const activeTeachers=teachers.filter(x=>x.isActive!==false),activePlans=values(root.subscriptionPlansV1).filter(x=>x.isActive!==false);
 const subscriptionEnforced=root.subscriptionSettingsV1?.enforceAccess===true;
 const integrity=[];
 lessons.forEach(x=>{const missing=[];if(!x.title)missing.push('العنوان');if(!x.type)missing.push('المسار');if(!x.stage)missing.push('المرحلة');if(!x.grade)missing.push('الصف');if(!x.subject)missing.push('المادة');if(missing.length)integrity.push({kind:'درس',title:x.title||x.id,missing,tab:'lessons'})});
 quizzes.forEach(x=>{const missing=[];if(!x.name&&!x.title)missing.push('الاسم');if(!x.type)missing.push('المسار');if(!x.stage)missing.push('المرحلة');if(!x.grade)missing.push('الصف');if(!x.subject)missing.push('المادة');if(!Array.isArray(x.questions)||!x.questions.length)missing.push('الأسئلة');if(missing.length)integrity.push({kind:'اختبار',title:x.name||x.title||x.id,missing,tab:'quizzes'})});
 files.forEach(x=>{const missing=[];if(!x.title)missing.push('العنوان');if(!x.url)missing.push('الرابط');if(!x.stage)missing.push('المرحلة');if(!x.grade)missing.push('الصف');if(!x.subject)missing.push('المادة');if(missing.length)integrity.push({kind:'ملف',title:x.title||x.id,missing,tab:'files'})});
 const checks=[
  {label:'صلاحية الإدارة',pass:currentUser?.role==='admin',detail:'جلسة المدير موثّقة من نظام Hostinger ويمكنها الوصول للعمليات الحساسة.',fail:'جلسة الإدارة الحالية لا تحمل صلاحية مدير.',tab:'settings',critical:true},
  {label:'رحلة المدرس',pass:activeTeachers.length>0,detail:activeTeachers.length+' مدرس نشط متاح حاليًا.',fail:'لا يوجد مدرس نشط لاختبار رحلة المدرس.',tab:'teachers',critical:true},
  {label:'رحلة الطالب',pass:students.length>0,detail:students.length+' حساب طالب متاح للاختبار.',fail:'لا يوجد حساب طالب لاختبار الرحلة الكاملة.',tab:'students',critical:true},
  {label:'المحتوى المنشور',pass:publishedLessons.length>0&&publishedQuizzes.length>0,detail:publishedLessons.length+' درس منشور و'+publishedQuizzes.length+' اختبار منشور.',fail:'يجب وجود درس واختبار منشورين على الأقل لاختبار المسار.',tab:'lessons',critical:true},
  {label:'سلامة المحتوى',pass:integrity.length===0,detail:'لا توجد عناصر ناقصة في البيانات الأساسية.',fail:integrity.length+' عنصرًا يحتاج استكمال بيانات.',tab:'content-ops',critical:true},
  {label:'ولي الأمر',pass:parents.length>0,detail:parents.length+' حساب ولي أمر متاح لاختبار الربط والمتابعة.',fail:'لم يُختبر مسار ولي الأمر ببيانات فعلية بعد.',tab:'students',critical:false},
  {label:'نظام الاشتراكات',pass:subscriptionEnforced&&activePlans.length>0,detail:'التحكم في الوصول مفعل ومعه '+activePlans.length+' باقة متاحة.',fail:subscriptionEnforced?'قفل الاشتراكات مفعل لكن لا توجد باقة نشطة.':'قفل الاشتراكات غير مفعل بعد؛ فعّله قبل الإطلاق إذا كان المحتوى المدفوع مطلوبًا.',tab:'subscriptions',critical:subscriptionEnforced&&activePlans.length===0}
 ];
 const passed=checks.filter(x=>x.pass).length,critical=checks.filter(x=>!x.pass&&x.critical).length,attention=checks.filter(x=>!x.pass&&!x.critical).length;
 const queues=[
  {label:'محتوى المدرسين',count:pendingTeacher,tab:'teachers',icon:'fa-chalkboard-user',hint:'طلبات محتوى تنتظر الاعتماد'},
  {label:'التواصل',count:pendingComm,tab:'communications',icon:'fa-comments',hint:'أسئلة وردود ومنشورات تنتظر المراجعة'},
  {label:'الدعم والشكاوى',count:openSupport,tab:'support',icon:'fa-headset',hint:'تذاكر لم تُغلق بعد'},
  {label:'طلبات الاشتراك',count:pendingSubs,tab:'subscriptions',icon:'fa-crown',hint:'طلبات دفع أو تجديد تنتظر القرار'}
 ];
 const queueTotal=queues.reduce((n,x)=>n+x.count,0),score=Math.round((passed/checks.length)*100);
 $('releaseReadinessScore').textContent=score+'%';$('releaseCriticalCount').textContent=critical;$('releaseAttentionCount').textContent=attention;$('releaseReadyCount').textContent=passed;$('releaseQueueCount').textContent=queueTotal;
 const badge=$('releaseReadinessBadge');if(badge){const n=critical+queueTotal;badge.textContent=n;badge.classList.toggle('hidden',n===0)}
 $('releaseReadinessSummary').textContent=critical?'يوجد '+critical+' فحص حرج يحتاج معالجة قبل QA النهائي.':queueTotal?'المسارات الأساسية سليمة، ويتبقى إنهاء '+queueTotal+' عنصرًا في طوابير الإدارة.':'الفحوص الحالية سليمة ولا توجد طوابير تشغيلية معلقة.';
 checksBox.innerHTML=checks.map(x=>'<article class="release-check '+(x.pass?'ok':x.critical?'critical':'attention')+'"><span><i class="fa-solid '+(x.pass?'fa-check':'fa-exclamation')+'"></i></span><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.pass?x.detail:x.fail)+'</small></div><button type="button" data-readiness-tab="'+esc(x.tab)+'">فتح</button></article>').join('');
 queuesBox.innerHTML=queues.map(x=>'<article class="release-queue '+(x.count?'has-items':'clear')+'"><span><i class="fa-solid '+x.icon+'"></i></span><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.hint)+'</small></div><b>'+x.count+'</b><button type="button" data-readiness-tab="'+esc(x.tab)+'">مراجعة</button></article>').join('');
 integrityBox.innerHTML=integrity.length?integrity.slice(0,30).map(x=>'<article class="release-integrity-item"><div><strong>'+esc(x.kind)+' — '+esc(x.title)+'</strong><small>ناقص: '+esc(x.missing.join('، '))+'</small></div><button type="button" data-readiness-tab="'+esc(x.tab)+'">إصلاح</button></article>').join(''):'<div class="release-all-clear"><span>✅</span><div><strong>سلامة المحتوى الأساسية جيدة</strong><small>لم يتم العثور على عنوان أو تصنيف أو رابط أساسي مفقود في العناصر الحالية.</small></div></div>';
 document.querySelectorAll('#admin-tab-readiness [data-readiness-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.readinessTab));
 const refresh=$('releaseReadinessRefresh');if(refresh&&!refresh.dataset.bound){refresh.dataset.bound='true';refresh.onclick=()=>{renderReleaseReadiness();toast('تم تحديث فحص الجاهزية ✅')}}
}
function renderTab(tab){
 ({overview:renderOverview,analytics:renderAdminIntelligence,curriculum:renderCurriculum,lessons:renderLessons,quizzes:renderQuizzes,simulations:renderSimulations,files:renderFiles,live:renderLiveSessions,schedule:renderScheduleEvents,teachers:renderTeachers,students:renderStudents,readiness:renderReleaseReadiness,news:renderNews,community:renderCommunityAdmin,announcements:loadAnnouncement,settings:loadSettings}[tab]||(()=>{}))();
}
function pathsForTab(tab){
 return [...new Set([...(ADMIN_TAB_PATHS[tab]||[]),...(tab==='overview'?ADMIN_CORE_PATHS:[])])];
}
function attachAdminPath(path){
 if(adminPathPromises.has(path))return adminPathPromises.get(path);
 const promise=new Promise(resolve=>{
   const ref=db.ref(path);let first=true;
   const handler=s=>{
     root[path]=s.val()||{};
     if(first){first=false;resolve(true);return}
     if(path==='adminProfiles')renderAdminIdentity();
     if(path==='teacherSubmissions')updatePendingBadge();
     if(path==='community')updateCommunityBadge();
     if(pathsForTab(currentAdminTab).includes(path))renderTab(currentAdminTab);
     if(currentAdminTab==='overview'&&ADMIN_CORE_PATHS.includes(path))renderOverview();
   };
   const errorHandler=err=>{
     console.error('Admin data listener failed:',path,err);
     root[path]=root[path]||{};first=false;resolve(false);
   };
   ref.on('value',handler,errorHandler);
   adminPathStops.set(path,()=>ref.off('value',handler));
 });
 adminPathPromises.set(path,promise);
 return promise;
}
async function ensureAdminPaths(paths){
 const list=[...new Set(paths||[])];
 if(!list.length)return true;
 if(adminRootPrimed){
   list.forEach(path=>attachAdminPath(path));
   return true;
 }
 const results=await Promise.all(list.map(attachAdminPath));
 return results.every(Boolean);
}
async function primeAdminRoot(){
 try{
   const snap=await db.ref().once('value');
   root=snap.val()||{};
   adminRootPrimed=true;
   return true;
 }catch(err){
   console.error('Admin initial snapshot failed',err);
   adminRootPrimed=false;
   return false;
 }
}
function stopAdminListeners(){
 adminPathStops.forEach(stop=>{try{stop()}catch{}});
 adminPathStops.clear();adminPathPromises.clear();
}
async function setTab(tab,updateUrl=true){
 if(!adminMeta[tab]&&!document.getElementById('admin-tab-'+tab))tab='overview';
 currentAdminTab=tab;
 $$('.admin-tab').forEach(s=>s.classList.toggle('active',s.id==='admin-tab-'+tab));
 $$('[data-admin-tab]').forEach(b=>{
   const active=b.dataset.adminTab===tab;
   b.classList.toggle('active',active);
   if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });
 const meta=adminMeta[tab]||['الإدارة','لوحة الإدارة'];
 $('adminSectionKicker').textContent=meta[0];$('adminSectionTitle').textContent=meta[1];
 $('adminSidebar').classList.remove('open');$('adminOverlay').classList.add('hidden');
 if(updateUrl){
   const url=new URL(location.href);
   if(tab==='overview')url.searchParams.delete('tab');else url.searchParams.set('tab',tab);
   history.replaceState({},'',url);
 }
 const needed=pathsForTab(tab),missing=needed.filter(path=>!adminPathPromises.has(path));
 if(missing.length)window.AcademyUI?.showPageLoading('جاري تحميل '+meta[1]+'...');
 const ok=await ensureAdminPaths(needed);
 renderAdminIdentity();updatePendingBadge();updateCommunityBadge();renderTab(tab);
 if(missing.length)window.AcademyUI?.hidePageLoading();
 if(!ok)toast('تم تحميل القسم مع تعذر قراءة جزء من البيانات.','error');
}

/* Admin intelligence */
function renderAdminIntelligence(){
 if(!window.AdminIntelligence?.render){
   console.warn('Admin intelligence module is unavailable');
   return;
 }
 window.AdminIntelligence.render({
   root,
   setTab,
   toast,
   values,
   subjectsFor,
   adminSubjectMeta,
   typeLabel,
   gradeLabel,
   stageNames
 });
}

/* Overview */
function renderOverview(){
 const lessons=values(root.lessons),quizzes=values(root.quizzes),students=values(root.studentProfilesV3),parents=values(root.parentProfilesV4),teachers=values(root.teacherProfiles);
 const submissions=flattenSubmissions(),pending=submissions.filter(x=>(x.status||'pending')==='pending'),approved=submissions.filter(x=>x.status==='approved'),rejected=submissions.filter(x=>x.status==='rejected');
 const communicationRows=[];Object.values(root.communicationSubmissionsV1||{}).forEach(items=>Object.values(items||{}).forEach(x=>x&&communicationRows.push(x)));const communicationPending=communicationRows.filter(x=>(x.status||'pending')==='pending');
 const supportRows=[];Object.values(root.supportTicketsV1||{}).forEach(items=>Object.values(items||{}).forEach(x=>x&&supportRows.push(x)));const supportOpen=supportRows.filter(x=>!['resolved','closed'].includes(x.status));const supportUrgent=supportOpen.filter(x=>x.priority==='urgent');
 const subscriptionRequestRows=[];Object.values(root.subscriptionRequestsV1||{}).forEach(items=>Object.values(items||{}).forEach(x=>x&&subscriptionRequestRows.push(x)));const subscriptionPending=subscriptionRequestRows.filter(x=>(x.status||'pending')==='pending');
 const activeTeachers=teachers.filter(t=>t.isActive!==false),inactiveTeachers=teachers.filter(t=>t.isActive===false),reports=communityReportCount();
 const contentGaps=lessons.filter(l=>publicationState(l)==='published'&&!(Array.isArray(l.questions)&&l.questions.length)&&!quizzes.some(q=>publicationState(q)==='published'&&q.lessonId===l.id)).length;
 const readyLessons=lessons.filter(l=>{
   const hasVideo=Array.isArray(l.videos)&&l.videos.some(v=>v?.url);
   const hasText=String(l.content||l.explanation||'').trim().length>15;
   return !l.isHidden&&(hasVideo||hasText);
 }).length;
 const readiness=lessons.length?Math.round(readyLessons/lessons.length*100):100;
 const reviewed=submissions.length?Math.round((approved.length+rejected.length)/submissions.length*100):100;
 const activeTeacherPct=teachers.length?Math.round(activeTeachers.length/teachers.length*100):100;
 const profiledStudents=students.length?Math.round(students.filter(s=>s.stage&&s.grade).length/students.length*100):100;

 const stats=[
   ['fa-user-graduate',students.length,'طالب'],
   ['fa-chalkboard-user',activeTeachers.length,'مدرس نشط'],
   ['fa-people-roof',parents.length,'ولي أمر'],
   ['fa-circle-play',lessons.length,'درس'],
   ['fa-file-circle-question',quizzes.length,'اختبار'],
   ['fa-clock',pending.length+communicationPending.length+supportOpen.length+subscriptionPending.length,'مراجعة معلقة']
 ];
 $('overviewStats').innerHTML=stats.map((s,i)=>'<article class="mix-admin-stat stat-'+i+'"><span><i class="fa-solid '+s[0]+'"></i></span><div><strong>'+s[1]+'</strong><small>'+s[2]+'</small></div></article>').join('');

 if($('adminOverviewGreeting'))$('adminOverviewGreeting').textContent='أهلًا '+adminName()+'، هذه أهم حالة للأكاديمية الآن.';
 if($('adminOverviewHealth')){$('adminOverviewHealth').textContent=readiness+'%';$('adminOverviewHealth').closest('.mix-admin-command-ring')?.style.setProperty('--health-angle',(readiness*3.6)+'deg')}
 if($('adminOverviewAttention')){
   const totalAttention=pending.length+communicationPending.length+supportOpen.length+subscriptionPending.length+reports+inactiveTeachers.length+contentGaps;
   $('adminOverviewAttention').innerHTML='<i class="fa-solid fa-bell"></i> '+(totalAttention?totalAttention+' عناصر تحتاج متابعة':'لا توجد مهام عاجلة');
   $('adminOverviewAttention').classList.toggle('has-attention',totalAttention>0);
 }

 const attention=[];
 if(pending.length)attention.push({icon:'fa-clock',tone:'orange',title:pending.length+' مراجعة محتوى معلقة',text:'طلبات مدرسين تنتظر قرار الإدارة.',tab:'teachers'});
 if(communicationPending.length)attention.push({icon:'fa-comments',tone:'violet',title:communicationPending.length+' طلب تواصل معلق',text:'أسئلة وردود ورسائل تنتظر موافقتك.',tab:'communications'});
 if(supportOpen.length)attention.push({icon:'fa-headset',tone:supportUrgent.length?'red':'blue',title:supportOpen.length+' تذكرة دعم مفتوحة',text:supportUrgent.length?supportUrgent.length+' منها عاجلة وتحتاج تدخلًا سريعًا.':'راجع التذاكر الجديدة والجارية.',tab:'support'});
 if(subscriptionPending.length)attention.push({icon:'fa-crown',tone:'violet',title:subscriptionPending.length+' طلب اشتراك معلق',text:'طلاب ينتظرون اعتماد أو رفض طلب الباقة.',tab:'subscriptions'});
 if(reports)attention.push({icon:'fa-flag',tone:'red',title:reports+' بلاغ في المجتمع',text:'راجع المنشورات المبلّغ عنها.',tab:'community'});
 if(inactiveTeachers.length)attention.push({icon:'fa-user-slash',tone:'gray',title:inactiveTeachers.length+' مدرس غير نشط',text:'راجع حالة حسابات فريق التدريس.',tab:'teachers'});
 if(contentGaps)attention.push({icon:'fa-stethoscope',tone:'orange',title:contentGaps+' درس بلا تدريب مرتبط',text:'مركز التحليلات حدد محتوى يحتاج استكمالًا.',tab:'analytics'});
 if(!lessons.length)attention.push({icon:'fa-circle-plus',tone:'blue',title:'لا توجد دروس منشورة بعد',text:'ابدأ بإضافة أول محتوى تعليمي.',tab:'lessons'});
 if($('adminAttentionList'))$('adminAttentionList').innerHTML=attention.length?attention.map(a=>
   '<button type="button" class="mix-admin-attention-item" data-jump-tab="'+a.tab+'"><span class="'+a.tone+'"><i class="fa-solid '+a.icon+'"></i></span><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.text)+'</small></div><i class="fa-solid fa-chevron-left"></i></button>'
 ).join(''):'<div class="mix-admin-all-clear"><span><i class="fa-solid fa-circle-check"></i></span><div><strong>كل شيء تحت السيطرة</strong><small>لا توجد مراجعات أو بلاغات عاجلة حاليًا.</small></div></div>';

 const health=[
   {label:'جاهزية الدروس المنشورة',value:readiness,meta:readyLessons+' من '+lessons.length+' درس'},
   {label:'المدرسون النشطون',value:activeTeacherPct,meta:activeTeachers.length+' من '+teachers.length+' مدرس'},
   {label:'الطلبات التي تمت مراجعتها',value:reviewed,meta:(approved.length+rejected.length)+' من '+submissions.length+' طلب'},
   {label:'اكتمال ملفات الطلاب الأساسية',value:profiledStudents,meta:students.length+' طالب'}
 ];
 if($('adminHealthBars'))$('adminHealthBars').innerHTML=health.map(h=>
   '<div class="mix-admin-health-row"><div><strong>'+esc(h.label)+'</strong><small>'+esc(h.meta)+'</small></div><b>'+h.value+'%</b><div class="mix-admin-health-track"><span style="width:'+Math.max(0,Math.min(100,h.value))+'%"></span></div></div>'
 ).join('');

 const latest=[...lessons].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,6);
 $('latestContentList').innerHTML=latest.length?latest.map(l=>'<div class="admin-list-item"><div><strong>'+esc(l.title||'درس')+'</strong><small>'+esc(typeLabel(l.type))+' • '+esc(stageNames[l.stage]||l.stage)+' • '+esc(l.subject||'')+'</small></div><span class="status-pill info">درس</span></div>').join(''):empty('لا يوجد محتوى بعد','أضف أول درس من قسم الدروس.');
 $('overviewPendingList').innerHTML=pending.length?pending.slice(0,5).map(s=>'<div class="admin-list-item"><div><strong>'+esc(s.title||'محتوى')+'</strong><small>'+esc(s.teacherName||'مدرس')+'</small></div><span class="status-pill pending">مراجعة</span></div>').join(''):empty('لا توجد مراجعات معلقة','كل محتوى المدرسين تمت مراجعته.');

 $$('[data-jump-tab]',$('admin-tab-overview')).forEach(b=>b.onclick=()=>setTab(b.dataset.jumpTab));
}

/* Curriculum */
function lessonAdminSortValue(l){
 const order=Number(l?.sortOrder);
 return Number.isFinite(order)?order:Number(l?.createdAt||0);
}
function curriculumScope(){
 return {type:$('curriculumType')?.value||'public',stage:$('curriculumStage')?.value||'primary',grade:$('curriculumGrade')?.value||'1'};
}
function curriculumLessonRows(type,stage,grade,subject,unit){
 return values(root.lessons).filter(l=>l.type===type&&l.stage===stage&&String(l.grade)===String(grade)&&l.subject===subject&&Number(l.unit||1)===Number(unit)).sort((a,b)=>lessonAdminSortValue(a)-lessonAdminSortValue(b)||(a.createdAt||0)-(b.createdAt||0));
}
function curriculumQuizUnit(q){
 if(q?.lessonId&&root.lessons?.[q.lessonId])return Number(root.lessons[q.lessonId].unit||q.unit||1);
 return Number(q?.unit||0);
}
function applyCurriculumView(){
 const tree=$('curriculumTreeWrap'),cards=$('curriculumAdminGrid'),mode=curriculumViewMode==='cards'?'cards':'tree';
 if(tree)tree.classList.toggle('hidden',mode!=='tree');
 if(cards)cards.classList.toggle('hidden',mode!=='cards');
 $$('[data-curriculum-view]').forEach(b=>{const active=b.dataset.curriculumView===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false')});
}
function curriculumSubjectUnits(subject,lessons,quizzes){
 const configured=(subject.units||[]).map((u,i)=>({number:i+1,name:u?.name||u||('الوحدة '+(i+1))}));
 const numbers=new Set(configured.map(x=>x.number));
 lessons.forEach(l=>numbers.add(Number(l.unit||1)));
 quizzes.forEach(q=>{const u=curriculumQuizUnit(q);if(u>0)numbers.add(u)});
 return [...numbers].sort((a,b)=>a-b).map(number=>configured.find(x=>x.number===number)||{number,name:'الوحدة '+number});
}
function curriculumLessonTreeRow(l,index,total,units,linkedQuizzes=[]){
 const teachers=adminLessonTeachers(l),videos=Array.isArray(l.videos)?l.videos.filter(v=>v?.url).length:0,questions=Array.isArray(l.questions)?l.questions.length:0;
 const available=units?.length?units:[{number:Number(l.unit||1),name:'الوحدة '+Number(l.unit||1)}];
 const options=available.map(u=>'<option value="'+u.number+'" '+(Number(l.unit||1)===Number(u.number)?'selected':'')+'>'+esc(u.name||('الوحدة '+u.number))+'</option>').join('');
 return '<div class="admin-tree-lesson-block"><article class="admin-tree-lesson '+(publicationState(l)==='hidden'?'is-hidden ':publicationState(l)==='scheduled'?'is-scheduled ':'')+'" draggable="true" data-tree-lesson="'+esc(l.id)+'">'+
  '<button type="button" class="admin-tree-drag" title="اسحب لإعادة الترتيب" aria-label="اسحب لإعادة ترتيب الدرس"><i class="fa-solid fa-grip-vertical"></i></button>'+
  '<span class="admin-tree-index">'+(index+1)+'</span>'+
  '<div class="admin-tree-lesson-copy"><div><strong>'+esc(l.title||'درس')+'</strong><span class="status-pill '+publicationPillClass(l)+'">'+publicationLabel(l)+'</span></div><small>'+videos+' فيديو • '+questions+' سؤال'+(teachers.length?' • '+esc(teachers.slice(0,2).join('، ')):'')+(publicationState(l)==='scheduled'?' • النشر '+esc(formatAdminDateTime(l.publishAt)):'')+'</small></div>'+
  '<div class="admin-tree-move"><select data-tree-move-unit="'+esc(l.id)+'" title="نقل إلى وحدة">'+options+'</select></div>'+
  '<div class="admin-tree-actions">'+
   '<button type="button" data-tree-up="'+esc(l.id)+'" '+(index===0?'disabled':'')+' title="تحريك لأعلى"><i class="fa-solid fa-arrow-up"></i></button>'+
   '<button type="button" data-tree-down="'+esc(l.id)+'" '+(index===total-1?'disabled':'')+' title="تحريك لأسفل"><i class="fa-solid fa-arrow-down"></i></button>'+
   '<button type="button" data-review-content="lesson|'+esc(l.id)+'" title="معاينة ومراجعة"><i class="fa-solid fa-eye"></i></button><a href="'+lessonAdminPreviewUrl(l)+'" target="_blank" rel="noopener" title="فتح المعاينة"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>'+
   '<button type="button" data-tree-edit="'+esc(l.id)+'" title="تعديل"><i class="fa-solid fa-pen"></i></button>'+
   '<button type="button" data-tree-copy="'+esc(l.id)+'" title="نسخ الدرس"><i class="fa-regular fa-copy"></i></button>'+
  '</div>'+
 '</article>'+
 (linkedQuizzes.length?'<div class="admin-tree-linked-quizzes"><span class="admin-tree-link-line"></span>'+linkedQuizzes.map(q=>curriculumQuizTreeRow(q,true)).join('')+'</div>':'')+
 '</div>';
}
function curriculumQuizTreeRow(q,linked=false){
 const lesson=q.lessonId?root.lessons?.[q.lessonId]:null,count=Array.isArray(q.questions)?q.questions.length:0;
 return '<article class="admin-tree-quiz '+(linked?'linked ':'')+(publicationState(q)==='hidden'?'is-hidden ':publicationState(q)==='scheduled'?'is-scheduled ':'')+'"><span><i class="fa-solid '+(linked?'fa-link':'fa-brain')+'"></i></span><div><strong>'+esc(q.name||'اختبار')+'</strong><small>'+count+' سؤال'+(linked?' • اختبار مرتبط بهذا الدرس':lesson?' • مرتبط بـ '+esc(lesson.title||'درس'):'')+(publicationState(q)==='scheduled'?' • النشر '+esc(formatAdminDateTime(q.publishAt)):'')+'</small></div><span class="status-pill '+publicationPillClass(q)+'">'+publicationLabel(q)+'</span><div class="admin-tree-quiz-actions"><button type="button" data-review-content="quiz|'+esc(q.id)+'" title="معاينة ومراجعة"><i class="fa-solid fa-eye"></i></button><button type="button" data-tree-edit-quiz="'+esc(q.id)+'" title="تعديل الاختبار"><i class="fa-solid fa-pen"></i></button></div></article>';
}
function renderCurriculumTree(type,stage,grade,subjects,scopeLessons,scopeQuizzes){
 const wrap=$('curriculumTreeWrap');if(!wrap)return;
 if(!subjects.length){wrap.innerHTML=empty('لا توجد مواد','أضف مادة أولًا.');return}
 wrap.innerHTML=subjects.map((subject,si)=>{
   const lessons=scopeLessons.filter(l=>l.subject===subject.id),quizzes=scopeQuizzes.filter(q=>q.subject===subject.id),units=curriculumSubjectUnits(subject,lessons,quizzes);
   const image=safeSubjectImageUrl(subject.imageUrl||''),open=(curriculumOpenSubjects.has(subject.id)||(!curriculumOpenSubjects.size&&si===0))?' open':'';
   const unitHtml=units.length?units.map(u=>{
     const rows=lessons.filter(l=>Number(l.unit||1)===u.number).sort((a,b)=>lessonAdminSortValue(a)-lessonAdminSortValue(b)||(a.createdAt||0)-(b.createdAt||0));
     const qs=quizzes.filter(q=>curriculumQuizUnit(q)===u.number),unitOnlyQs=qs.filter(q=>!q.lessonId);
     return '<section class="admin-tree-unit" data-tree-subject="'+esc(subject.id)+'" data-tree-unit="'+u.number+'">'+
       '<header><div><span class="admin-tree-unit-number">'+u.number+'</span><div><strong>'+esc(u.name)+'</strong><small>'+rows.length+' درس • '+qs.length+' اختبار</small></div></div><div class="admin-tree-unit-head-actions"><button type="button" data-tree-new-lesson="'+esc(subject.id)+'|'+u.number+'"><i class="fa-solid fa-plus"></i> درس</button><button type="button" data-tree-new-quiz="'+esc(subject.id)+'|'+u.number+'"><i class="fa-solid fa-plus"></i> اختبار</button><button type="button" data-tree-copy-unit="'+esc(subject.id)+'|'+u.number+'"><i class="fa-regular fa-copy"></i> نسخ الوحدة</button></div></header>'+
       '<div class="admin-tree-lesson-list '+(!rows.length?'is-empty':'')+'" data-tree-drop-subject="'+esc(subject.id)+'" data-tree-drop-unit="'+u.number+'">'+
         (rows.length?rows.map((l,i)=>curriculumLessonTreeRow(l,i,rows.length,units,qs.filter(q=>String(q.lessonId||'')===String(l.id)))).join(''):'<div class="admin-tree-drop-empty"><i class="fa-solid fa-arrow-down"></i><span>اسحب درسًا إلى هنا أو أضف درسًا جديدًا</span></div>')+
       '</div>'+
       (unitOnlyQs.length?'<div class="admin-tree-quizzes"><span class="admin-tree-subtitle">اختبارات الوحدة</span>'+unitOnlyQs.map(q=>curriculumQuizTreeRow(q,false)).join('')+'</div>':'')+
     '</section>';
   }).join(''):'<div class="admin-tree-no-units"><span>📚</span><strong>لا توجد وحدات لهذه المادة</strong><p>أضف وحدات من تعديل المادة ثم رتّب الدروس بداخلها.</p></div>';
   const comprehensive=quizzes.filter(q=>curriculumQuizUnit(q)===0);
   return '<details class="admin-tree-subject"'+open+' data-tree-subject-card="'+esc(subject.id)+'"><summary>'+
     '<div class="admin-tree-subject-art '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+(!image?'<span>'+esc(subject.emoji||'📚')+'</span>':'')+'</div>'+
     '<div class="admin-tree-subject-copy"><strong>'+esc(subject.name)+'</strong><small>'+lessons.length+' درس • '+quizzes.length+' اختبار • '+units.length+' وحدة</small></div>'+
     '<span class="admin-tree-chevron"><i class="fa-solid fa-chevron-down"></i></span>'+
   '</summary><div class="admin-tree-subject-body">'+
     '<div class="admin-tree-subject-tools"><button type="button" data-edit-subject="'+esc(subject.id)+'"><i class="fa-solid fa-pen"></i> تعديل المادة</button><button type="button" data-tree-copy-subject="'+esc(subject.id)+'"><i class="fa-regular fa-copy"></i> نسخ المادة</button><a href="./subject.html?'+adminPreviewQuery({type,stage,grade,subject:subject.id})+'" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i> معاينة المادة</a></div>'+
     unitHtml+
     (comprehensive.length?'<section class="admin-tree-comprehensive"><header><strong><i class="fa-solid fa-award"></i> اختبارات شاملة للمادة</strong><small>'+comprehensive.length+' اختبار</small></header>'+comprehensive.map(curriculumQuizTreeRow).join('')+'</section>':'')+
   '</div></details>';
 }).join('');
 bindCurriculumTree();
}
async function persistCurriculumLessonOrder(lessonId,targetUnit,targetIndex=null){
 const lesson=root.lessons?.[lessonId];if(!lesson)return;
 const type=lesson.type,stage=lesson.stage,grade=String(lesson.grade),subject=lesson.subject,sourceUnit=Number(lesson.unit||1),destUnit=Number(targetUnit||1);
 const source=curriculumLessonRows(type,stage,grade,subject,sourceUnit).filter(x=>x.id!==lessonId);
 const target=sourceUnit===destUnit?[...source]:curriculumLessonRows(type,stage,grade,subject,destUnit).filter(x=>x.id!==lessonId);
 const moved={id:lessonId,...lesson,unit:destUnit};
 const insertAt=targetIndex==null?target.length:Math.max(0,Math.min(Number(targetIndex),target.length));
 target.splice(insertAt,0,moved);
 const updates={};
 target.forEach((item,i)=>{updates['lessons/'+item.id+'/sortOrder']=(i+1)*1000;updates['lessons/'+item.id+'/unit']=destUnit});
 if(sourceUnit!==destUnit)source.forEach((item,i)=>updates['lessons/'+item.id+'/sortOrder']=(i+1)*1000);
 updates['lessons/'+lessonId+'/orderUpdatedAt']=Date.now();
 await db.ref().update(updates);
 await writeAudit('lesson.reorder','lesson',lessonId,{fromUnit:sourceUnit,toUnit:destUnit,index:insertAt});
 toast(sourceUnit===destUnit?'تم تحديث ترتيب الدروس':'تم نقل الدرس إلى الوحدة '+destUnit);
}
async function moveCurriculumLessonRelative(id,direction){
 const l=root.lessons?.[id];if(!l)return;
 const rows=curriculumLessonRows(l.type,l.stage,String(l.grade),l.subject,Number(l.unit||1)),i=rows.findIndex(x=>x.id===id),next=i+direction;
 if(i<0||next<0||next>=rows.length)return;
 const ids=rows.map(x=>x.id);[ids[i],ids[next]]=[ids[next],ids[i]];
 const updates={};ids.forEach((lessonId,index)=>updates['lessons/'+lessonId+'/sortOrder']=(index+1)*1000);updates['lessons/'+id+'/orderUpdatedAt']=Date.now();
 await db.ref().update(updates);await writeAudit('lesson.reorder','lesson',id,{direction});toast('تم تحديث ترتيب الدرس');
}
async function duplicateCurriculumLesson(id){
 const lesson=root.lessons?.[id];if(!lesson)return;
 const ok=await askConfirm({title:'نسخ هذا الدرس؟',message:'سيتم إنشاء نسخة مخفية من الدرس بنفس الشرح والفيديوهات والأسئلة لتراجعها قبل النشر.',acceptText:'إنشاء نسخة'});
 if(!ok)return;
 const siblings=curriculumLessonRows(lesson.type,lesson.stage,String(lesson.grade),lesson.subject,Number(lesson.unit||1));
 const max=Math.max(0,...siblings.map(x=>lessonAdminSortValue(x)).filter(Number.isFinite)),now=Date.now();
 const copy={...lesson,title:(lesson.title||'درس')+' — نسخة',isHidden:true,createdAt:now,updatedAt:now,sortOrder:max+1000};
 delete copy.id;delete copy.teacherSubmissionId;delete copy.orderUpdatedAt;
 const ref=db.ref('lessons').push();await ref.set(copy);await writeAudit('lesson.duplicate','lesson',ref.key,{sourceLessonId:id});toast('تم نسخ الدرس كمسودة مخفية');
}
function openCurriculumLessonCreator(subject,unit){
 const c=curriculumScope();resetLessonEditor();$('newLessonType').value=c.type;$('newLessonStage').value=c.stage;fillGrades($('newLessonGrade'),c.stage,c.grade);$('newLessonGrade').value=String(c.grade);fillSubjects($('newLessonSubject'),c.stage,c.grade,c.type);$('newLessonSubject').value=subject;$('newLessonUnit').value=Number(unit||1);renderLessonEditorPreview();openModal('lessonModal');
}
function openCurriculumQuizCreator(subject,unit){
 const c=curriculumScope();resetQuizEditor();$('newQuizType').value=c.type;$('newQuizStage').value=c.stage;fillGrades($('newQuizGrade'),c.stage,c.grade);$('newQuizGrade').value=String(c.grade);fillSubjects($('newQuizSubject'),c.stage,c.grade,c.type);$('newQuizSubject').value=subject;$('newQuizUnit').value=Number(unit||1);renderQuizEditorPreview();openModal('quizModal');
}
function sourceCustomSubjectRecord(scope,subjectId){
 return customSubjectsFor(scope.stage,String(scope.grade),scope.type).find(x=>x.id===subjectId)||null;
}
function openContentCopyModal(kind,subjectId,unit=0){
 const source=curriculumScope(),subject=adminSubjectMeta(source.stage,source.grade,source.type,subjectId);
 contentCopySource={kind,subject:subjectId,unit:Number(unit||0),...source};
 $('contentCopyKind').value=kind;$('contentCopySubject').value=subjectId;$('contentCopySourceUnit').value=String(unit||0);
 $('contentCopyType').value=source.type;$('contentCopyStage').value=source.stage;
 const suggested=Number(source.grade)<gradeCount(source.stage)?Number(source.grade)+1:Number(source.grade);
 fillGrades($('contentCopyGrade'),source.stage,String(suggested));$('contentCopyGrade').value=String(suggested);
 $('contentCopyTargetUnit').value=String(unit||1);$('contentCopyUnitField').classList.toggle('hidden',kind!=='unit');
 $('contentCopyLessons').checked=true;$('contentCopyQuizzes').checked=true;
 if($('contentCopySourceTitle'))$('contentCopySourceTitle').textContent=kind==='unit'?(adminUnitLabel({stage:source.stage,grade:source.grade,type:source.type,subject:subjectId,unit})+' — '+subject.name):subject.name;
 if($('contentCopySourceMeta'))$('contentCopySourceMeta').textContent=typeLabel(source.type)+' • '+gradeLabel(source.stage,source.grade)+(kind==='unit'?' • الوحدة '+unit:' • المادة كاملة');
 if($('contentCopyModalTitle'))$('contentCopyModalTitle').textContent=kind==='unit'?'نسخ الوحدة إلى صف آخر':'نسخ المادة إلى صف آخر';
 openModal('contentCopyModal');
}
function targetCustomSubjectUpdate(source,target,kind,targetUnit){
 const subject=adminSubjectMeta(source.stage,source.grade,source.type,source.subject),sourceCustom=sourceCustomSubjectRecord(source,source.subject);
 const raw=root.customSubjects?.[target.stage]?.[target.grade],arr=Array.isArray(raw)?[...raw]:Object.values(raw||{}),idx=arr.findIndex(x=>x?.id===source.subject&&(!x.type||x.type===target.type));
 if(idx>=0){
   if(kind==='unit'){
     const current={...arr[idx]},units=Array.isArray(current.units)?[...current.units]:[];
     const sourceUnitName=subject.units?.[Number(source.unit)-1]?.name||subject.units?.[Number(source.unit)-1]||('الوحدة '+source.unit);
     while(units.length<targetUnit)units.push({name:'الوحدة '+(units.length+1)});
     if(!units[targetUnit-1]?.name)units[targetUnit-1]={name:sourceUnitName};
     current.units=units;current.updatedAt=Date.now();arr[idx]=current;return arr;
   }
   return null;
 }
 const defaultExists=(defaultSubjects[target.stage]||[]).some(x=>x.id===source.subject);
 if(!sourceCustom&&defaultExists)return null;
 const base={id:source.subject,name:subject.name||source.subject,type:target.type,emoji:subject.emoji||'📚',imageUrl:subject.imageUrl||'',createdAt:Date.now(),updatedAt:Date.now()};
 if(kind==='subject')base.units=(subject.units||[]).map(u=>({name:u?.name||u||''})).filter(u=>u.name);
 else{
   const units=[],sourceUnitName=subject.units?.[Number(source.unit)-1]?.name||subject.units?.[Number(source.unit)-1]||('الوحدة '+source.unit);
   for(let i=1;i<=targetUnit;i++)units.push({name:i===targetUnit?sourceUnitName:'الوحدة '+i});
   base.units=units;
 }
 arr.push(base);return arr;
}
async function executeContentCopy(e){
 e.preventDefault();if(!contentCopySource)return;
 const source={...contentCopySource},target={type:$('contentCopyType').value,stage:$('contentCopyStage').value,grade:String($('contentCopyGrade').value)},kind=source.kind,targetUnit=Math.max(1,Number($('contentCopyTargetUnit').value||source.unit||1));
 const includeLessons=$('contentCopyLessons').checked,includeQuizzes=$('contentCopyQuizzes').checked;
 const sameScope=source.type===target.type&&source.stage===target.stage&&String(source.grade)===String(target.grade);
 if(kind==='subject'&&sameScope)return toast('اختر صفًا أو مرحلة مختلفة لنسخ المادة كاملة.','error');
 if(kind==='unit'&&sameScope&&Number(source.unit)===targetUnit)return toast('اختر وحدة مختلفة أو صفًا مختلفًا للنسخ.','error');
 let sourceLessons=values(root.lessons).filter(l=>l.type===source.type&&l.stage===source.stage&&String(l.grade)===String(source.grade)&&l.subject===source.subject);
 let sourceQuizzes=values(root.quizzes).filter(q=>q.type===source.type&&q.stage===source.stage&&String(q.grade)===String(source.grade)&&q.subject===source.subject);
 if(kind==='unit'){sourceLessons=sourceLessons.filter(l=>Number(l.unit||1)===Number(source.unit));sourceQuizzes=sourceQuizzes.filter(q=>curriculumQuizUnit(q)===Number(source.unit))}
 if(!includeLessons)sourceLessons=[];if(!includeQuizzes)sourceQuizzes=[];
 if(!sourceLessons.length&&!sourceQuizzes.length)return toast('لا يوجد محتوى مطابق لإعدادات النسخ.','error');
 const updates={},lessonMap=new Map(),now=Date.now(),orderByUnit=new Map();
 const existingTarget=values(root.lessons).filter(l=>l.type===target.type&&l.stage===target.stage&&String(l.grade)===String(target.grade)&&l.subject===source.subject);
 const initialOrder=unit=>Math.max(0,...existingTarget.filter(l=>Number(l.unit||1)===Number(unit)).map(lessonAdminSortValue).filter(Number.isFinite));
 sourceLessons.sort((a,b)=>Number(a.unit||1)-Number(b.unit||1)||lessonAdminSortValue(a)-lessonAdminSortValue(b)).forEach(l=>{
   const destUnit=kind==='unit'?targetUnit:Number(l.unit||1),key=String(destUnit);
   if(!orderByUnit.has(key))orderByUnit.set(key,initialOrder(destUnit));
   const newId=db.ref('lessons').push().key,order=orderByUnit.get(key)+1000;orderByUnit.set(key,order);lessonMap.set(l.id,newId);
   const copy={...l,type:target.type,stage:target.stage,grade:target.grade,subject:source.subject,unit:destUnit,sortOrder:order,isHidden:true,createdAt:now,updatedAt:now};
   if(sameScope)copy.title=(copy.title||'درس')+' — نسخة';
   delete copy.id;delete copy.teacherSubmissionId;delete copy.orderUpdatedAt;updates['lessons/'+newId]=copy;
 });
 sourceQuizzes.forEach(q=>{
   const sourceUnit=curriculumQuizUnit(q),destUnit=kind==='unit'?targetUnit:Number(sourceUnit||q.unit||0),newId=db.ref('quizzes').push().key;
   const copy={...q,type:target.type,stage:target.stage,grade:target.grade,subject:source.subject,unit:destUnit,isHidden:true,createdAt:now,updatedAt:now};
   if(sameScope)copy.name=(copy.name||'اختبار')+' — نسخة';
   if(q.lessonId&&lessonMap.has(q.lessonId))copy.lessonId=lessonMap.get(q.lessonId);
   else if(q.lessonId)delete copy.lessonId;
   delete copy.id;delete copy.teacherSubmissionId;updates['quizzes/'+newId]=copy;quizBankUpdates(newId,copy,updates,now);
 });
 const nextCustom=targetCustomSubjectUpdate(source,target,kind,targetUnit);
 if(nextCustom)updates['customSubjects/'+target.stage+'/'+target.grade]=nextCustom;
 await db.ref().update(updates);
 await writeAudit(kind==='unit'?'curriculum.copy_unit':'curriculum.copy_subject','subject',source.subject,{sourceType:source.type,sourceStage:source.stage,sourceGrade:source.grade,sourceUnit:source.unit||0,targetType:target.type,targetStage:target.stage,targetGrade:target.grade,targetUnit:kind==='unit'?targetUnit:0,lessonCount:sourceLessons.length,quizCount:sourceQuizzes.length});
 closeModal('contentCopyModal');contentCopySource=null;
 toast('تم النسخ بنجاح: '+sourceLessons.length+' درس و'+sourceQuizzes.length+' اختبار — جميعها مخفية للمراجعة');
}
function bindCurriculumTree(){
 const wrap=$('curriculumTreeWrap');if(!wrap)return;
 $$('.admin-tree-subject',wrap).forEach(details=>details.addEventListener('toggle',()=>{const id=details.dataset.treeSubjectCard;if(!id)return;if(details.open)curriculumOpenSubjects.add(id);else curriculumOpenSubjects.delete(id)}));
 $$('[data-review-content]',wrap).forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.reviewContent.split('|');openContentReview(kind,id)});
 $$('[data-tree-edit]',wrap).forEach(b=>b.onclick=()=>editLesson(b.dataset.treeEdit));
 $$('[data-tree-edit-quiz]',wrap).forEach(b=>b.onclick=()=>editQuiz(b.dataset.treeEditQuiz));
 $$('[data-tree-copy]',wrap).forEach(b=>b.onclick=()=>duplicateCurriculumLesson(b.dataset.treeCopy));
 $$('[data-tree-up]',wrap).forEach(b=>b.onclick=()=>moveCurriculumLessonRelative(b.dataset.treeUp,-1));
 $$('[data-tree-down]',wrap).forEach(b=>b.onclick=()=>moveCurriculumLessonRelative(b.dataset.treeDown,1));
 $$('[data-tree-new-lesson]',wrap).forEach(b=>b.onclick=()=>{const [subject,unit]=b.dataset.treeNewLesson.split('|');openCurriculumLessonCreator(subject,unit)});
 $$('[data-tree-new-quiz]',wrap).forEach(b=>b.onclick=()=>{const [subject,unit]=b.dataset.treeNewQuiz.split('|');openCurriculumQuizCreator(subject,unit)});
 $$('[data-tree-copy-unit]',wrap).forEach(b=>b.onclick=()=>{const [subject,unit]=b.dataset.treeCopyUnit.split('|');openContentCopyModal('unit',subject,Number(unit))});
 $$('[data-tree-copy-subject]',wrap).forEach(b=>b.onclick=()=>openContentCopyModal('subject',b.dataset.treeCopySubject,0));
 $$('[data-tree-move-unit]',wrap).forEach(s=>s.onchange=()=>persistCurriculumLessonOrder(s.dataset.treeMoveUnit,Number(s.value),null));
 let draggedId='';
 $$('[data-tree-lesson]',wrap).forEach(row=>{
   row.addEventListener('dragstart',e=>{draggedId=row.dataset.treeLesson||'';row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedId)});
   row.addEventListener('dragend',()=>{row.classList.remove('dragging');$$('.admin-tree-lesson-list',wrap).forEach(x=>x.classList.remove('drag-over'));draggedId=''});
 });
 $$('.admin-tree-lesson-list',wrap).forEach(list=>{
   list.addEventListener('dragover',e=>{e.preventDefault();list.classList.add('drag-over');e.dataTransfer.dropEffect='move'});
   list.addEventListener('dragleave',e=>{if(!list.contains(e.relatedTarget))list.classList.remove('drag-over')});
   list.addEventListener('drop',async e=>{
     e.preventDefault();list.classList.remove('drag-over');
     const id=draggedId||e.dataTransfer.getData('text/plain');if(!id)return;
     const unit=Number(list.dataset.treeDropUnit||1),subject=list.dataset.treeDropSubject,lesson=root.lessons?.[id];if(!lesson||lesson.subject!==subject)return toast('يمكن نقل الدرس بين وحدات المادة نفسها فقط.','error');
     const rows=$$('[data-tree-lesson]',list).filter(x=>x.dataset.treeLesson!==id);
     let index=rows.length;
     for(let i=0;i<rows.length;i++){const rect=rows[i].getBoundingClientRect();if(e.clientY<rect.top+rect.height/2){index=i;break}}
     await persistCurriculumLessonOrder(id,unit,index);
   });
 });
}
function renderCurriculum(){
 fillGrades($('curriculumGrade'),$('curriculumStage').value);
 const type=$('curriculumType').value,stage=$('curriculumStage').value,grade=$('curriculumGrade').value,list=subjectsFor(stage,grade,type);
 const scopeLessons=values(root.lessons).filter(l=>l.type===type&&l.stage===stage&&String(l.grade)===String(grade));
 const scopeQuizzes=values(root.quizzes).filter(q=>q.type===type&&q.stage===stage&&String(q.grade)===String(grade));
 const totalUnits=list.reduce((sum,s)=>sum+(customSubjectsFor(stage,grade,type).find(x=>x.id===s.id)?.units||s.units||[]).length,0);
 if($('curriculumSubjectCount'))$('curriculumSubjectCount').textContent=list.length;
 if($('curriculumUnitCount'))$('curriculumUnitCount').textContent=totalUnits;
 if($('curriculumLessonCount'))$('curriculumLessonCount').textContent=scopeLessons.length;
 if($('curriculumQuizCount'))$('curriculumQuizCount').textContent=scopeQuizzes.length;
 if($('curriculumScopeLabel'))$('curriculumScopeLabel').textContent=typeLabel(type)+' • '+gradeLabel(stage,grade);
 $('curriculumAdminGrid').innerHTML=list.length?list.map(s=>{
   const custom=customSubjectsFor(stage,grade,type).find(x=>x.id===s.id),units=custom?.units||s.units||[],image=safeSubjectImageUrl(custom?.imageUrl||s.imageUrl||'');
   const lessons=scopeLessons.filter(l=>l.subject===s.id),quizzes=scopeQuizzes.filter(q=>q.subject===s.id),published=lessons.filter(l=>!l.isHidden).length;
   const preview='./subject.html?'+adminPreviewQuery({type,stage,grade,subject:s.id});
   return '<article class="admin-subject-card mix-admin-curriculum-card '+(image?'has-image':'')+'">'+
     '<div class="mix-admin-curriculum-art '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+
       (!image?'<span>'+esc(s.emoji||'📚')+'</span>':'')+'<em>'+units.length+' وحدة</em>'+
     '</div>'+
     '<div class="mix-admin-curriculum-body"><span class="section-kicker">'+esc(typeLabel(type))+' • '+esc(gradeLabel(stage,grade))+'</span><h3>'+esc(s.name)+'</h3>'+
       '<div class="mix-admin-content-meta"><span><i class="fa-solid fa-circle-play"></i> '+lessons.length+' درس</span><span><i class="fa-solid fa-eye"></i> '+published+' منشور</span><span><i class="fa-solid fa-brain"></i> '+quizzes.length+' اختبار</span></div>'+
       '<div class="admin-unit-tags">'+(units.length?units.slice(0,4).map((u,i)=>'<span>'+(i+1)+'. '+esc(u.name||u)+'</span>').join('')+(units.length>4?'<span>+'+(units.length-4)+' وحدات</span>':''):'<span>بدون وحدات مخصصة</span>')+'</div>'+
       '<div class="mix-admin-card-actions"><a class="admin-action-btn success" href="'+preview+'" target="_blank" rel="noopener" title="فتح المادة"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button class="admin-action-btn" data-edit-subject="'+esc(s.id)+'" title="تعديل المادة"><i class="fa-solid fa-pen"></i></button>'+(custom?'<button class="admin-action-btn danger" data-delete-subject="'+esc(s.id)+'" title="حذف التخصيص والعودة للوضع الافتراضي"><i class="fa-solid fa-rotate-left"></i></button>':'')+'</div>'+
     '</div></article>';
 }).join(''):empty();
 $$('[data-edit-subject]').forEach(b=>b.onclick=()=>editSubject(b.dataset.editSubject));
 $$('[data-delete-subject]').forEach(b=>b.onclick=()=>deleteSubject(b.dataset.deleteSubject));
 renderCurriculumTree(type,stage,grade,list,scopeLessons,scopeQuizzes);applyCurriculumView();
}
function safeSubjectImageUrl(value=''){
 try{if(!value)return'';const u=new URL(value,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}
}
function renderSubjectImagePreview(){
 const box=$('subjectImagePreview');if(!box)return;
 const safe=safeSubjectImageUrl($('subjectImageUrl')?.value.trim()||'');
 box.classList.toggle('has-image',!!safe);
 box.style.backgroundImage=safe?'linear-gradient(180deg,rgba(5,31,84,.05),rgba(5,31,84,.28)),url("'+safe.replace(/"/g,'%22')+'")':'';
 const label=box.querySelector('span');if(label)label.textContent=safe?'معاينة صورة المادة':'سيظهر التصميم التلقائي عند عدم إضافة صورة';
 renderSubjectEditorPreview();
}
function collectSubjectUnits(){
 return $$('.admin-subject-unit-row',$('subjectUnitsBuilder')||document).map(row=>row.querySelector('input')?.value.trim()||'').filter(Boolean);
}
function syncSubjectUnits(){
 const units=collectSubjectUnits();if($('subjectUnits'))$('subjectUnits').value=units.join('\n');if($('subjectUnitCountEditor'))$('subjectUnitCountEditor').textContent=units.length;renderSubjectEditorPreview();
}
function subjectUnitRowHtml(name='',i=0,total=1){
 return '<div class="admin-subject-unit-row" data-unit-index="'+i+'"><span class="admin-unit-number">'+(i+1)+'</span><input value="'+esc(name)+'" placeholder="اسم الوحدة"><div><button type="button" data-unit-up="'+i+'" '+(i===0?'disabled':'')+' title="تحريك لأعلى"><i class="fa-solid fa-arrow-up"></i></button><button type="button" data-unit-down="'+i+'" '+(i===total-1?'disabled':'')+' title="تحريك لأسفل"><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="danger" data-unit-remove="'+i+'" title="حذف الوحدة"><i class="fa-solid fa-trash"></i></button></div></div>';
}
function renderSubjectUnitsEditor(units=[]){
 const wrap=$('subjectUnitsBuilder');if(!wrap)return;
 const names=(Array.isArray(units)?units:[]).map(u=>String(u?.name??u??'').trim()).filter(Boolean);
 wrap.innerHTML=names.length?names.map((name,i)=>subjectUnitRowHtml(name,i,names.length)).join(''):'<div class="admin-question-empty"><span>📚</span><strong>لا توجد وحدات بعد</strong><p>أضف أول وحدة أو استورد قائمة كاملة.</p></div>';
 if($('subjectUnitCountEditor'))$('subjectUnitCountEditor').textContent=names.length;
 $$('.admin-subject-unit-row input',wrap).forEach(input=>input.addEventListener('input',syncSubjectUnits));
 $$('[data-unit-remove]',wrap).forEach(b=>b.onclick=()=>{const rows=collectSubjectUnits();rows.splice(Number(b.dataset.unitRemove),1);renderSubjectUnitsEditor(rows);syncSubjectUnits()});
 $$('[data-unit-up]',wrap).forEach(b=>b.onclick=()=>{const rows=collectSubjectUnits(),i=Number(b.dataset.unitUp);if(i>0)[rows[i-1],rows[i]]=[rows[i],rows[i-1]];renderSubjectUnitsEditor(rows);syncSubjectUnits()});
 $$('[data-unit-down]',wrap).forEach(b=>b.onclick=()=>{const rows=collectSubjectUnits(),i=Number(b.dataset.unitDown);if(i<rows.length-1)[rows[i+1],rows[i]]=[rows[i],rows[i+1]];renderSubjectUnitsEditor(rows);syncSubjectUnits()});
 if($('subjectUnits')&&!$('subjectUnits').value.trim())$('subjectUnits').value=names.join('\n');
 renderSubjectEditorPreview();
}
function addSubjectUnit(){
 const rows=collectSubjectUnits();rows.push('');const wrap=$('subjectUnitsBuilder');
 wrap.innerHTML=(rows.length?rows.map((name,i)=>subjectUnitRowHtml(name,i,rows.length)).join(''):'');
 if($('subjectUnitCountEditor'))$('subjectUnitCountEditor').textContent=rows.filter(Boolean).length;
 $$('.admin-subject-unit-row input',wrap).forEach(input=>input.addEventListener('input',syncSubjectUnits));
 $$('[data-unit-remove]',wrap).forEach(b=>b.onclick=()=>{const list=$$('.admin-subject-unit-row',wrap).map(r=>r.querySelector('input')?.value||'');list.splice(Number(b.dataset.unitRemove),1);renderSubjectUnitsEditor(list);syncSubjectUnits()});
 $$('[data-unit-up]',wrap).forEach(b=>b.onclick=()=>{const list=$$('.admin-subject-unit-row',wrap).map(r=>r.querySelector('input')?.value||''),i=Number(b.dataset.unitUp);if(i>0)[list[i-1],list[i]]=[list[i],list[i-1]];renderSubjectUnitsEditor(list);syncSubjectUnits()});
 $$('[data-unit-down]',wrap).forEach(b=>b.onclick=()=>{const list=$$('.admin-subject-unit-row',wrap).map(r=>r.querySelector('input')?.value||''),i=Number(b.dataset.unitDown);if(i<list.length-1)[list[i+1],list[i]]=[list[i],list[i+1]];renderSubjectUnitsEditor(list);syncSubjectUnits()});
 wrap?.lastElementChild?.querySelector('input')?.focus();
}
function importSubjectUnitsLines(){
 const rows=($('subjectUnits')?.value||'').split('\n').map(x=>x.trim()).filter(Boolean);renderSubjectUnitsEditor(rows);syncSubjectUnits();toast('تم تحميل '+rows.length+' وحدة إلى المحرر.');
}
// The administrator chooses a subject name. IDs remain stable and hidden from the UI.
const subjectExtraChoices=[
 {id:'quran',name:'القرآن الكريم',emoji:'📖'},
 {id:'fiqh',name:'الفقه',emoji:'🕌'},
 {id:'tawhid',name:'التوحيد',emoji:'🕌'},
 {id:'hadith',name:'الحديث الشريف',emoji:'📖'},
 {id:'tafsir',name:'التفسير',emoji:'📖'},
 {id:'nahw',name:'النحو',emoji:'📚'},
 {id:'sarf',name:'الصرف',emoji:'📚'},
 {id:'balagha',name:'البلاغة',emoji:'📚'},
 {id:'aqida',name:'العقيدة',emoji:'🕌'},
 {id:'seerah',name:'السيرة النبوية',emoji:'🕌'},
 {id:'computer',name:'الحاسب الآلي',emoji:'💻'},
 {id:'ict',name:'تكنولوجيا المعلومات',emoji:'💻'},
 {id:'history',name:'التاريخ',emoji:'🏛️'},
 {id:'geography',name:'الجغرافيا',emoji:'🌍'},
 {id:'physics',name:'الفيزياء',emoji:'⚛️'},
 {id:'chemistry',name:'الكيمياء',emoji:'🧪'},
 {id:'biology',name:'الأحياء',emoji:'🧬'},
 {id:'french',name:'اللغة الفرنسية',emoji:'🇫🇷'},
 {id:'philosophy',name:'الفلسفة والمنطق',emoji:'🧠'}
];
function subjectPickCatalog(type,stage,grade){
 const pool=new Map();
 const add=s=>{if(s?.id&&s?.name&&!pool.has(s.id))pool.set(String(s.id),{id:String(s.id),name:String(s.name),emoji:s.emoji||'📚'})};
 (defaultSubjects[stage]||[]).forEach(add);
 // Names from subjects used elsewhere retain their existing IDs.
 if(type==='azhar')subjectExtraChoices.filter(s=>['quran','fiqh','tawhid','hadith','tafsir','nahw','sarf','balagha','aqida','seerah'].includes(s.id)).forEach(add);
 else subjectExtraChoices.forEach(add);
 Object.entries(root.customSubjects||{}).forEach(([st,byGrade])=>Object.entries(byGrade||{}).forEach(([gr,items])=>{
  (Array.isArray(items)?items:Object.values(items||{})).forEach(s=>{if(s?.type&&s.type!==type)return;add(s)});
 }));
 // Current-grade saved names have priority (for legacy renamed subjects).
 const existing=root.customSubjects?.[stage]?.[String(grade)];
 (Array.isArray(existing)?existing:Object.values(existing||{})).forEach(s=>{if(s?.id&&s?.name&&(!s.type||s.type===type))pool.set(String(s.id),{id:String(s.id),name:String(s.name),emoji:s.emoji||'📚'})});
 return [...pool.values()];
}
function refreshSubjectPicker(keep=''){
 const select=$('subjectName');if(!select)return;
 const type=$('subjectType')?.value||'public',stage=$('subjectStage')?.value||'primary',grade=$('subjectGrade')?.value||'1';
 const previous=keep||select.value;
 const list=subjectPickCatalog(type,stage,grade);
 select.innerHTML='<option value="">اختر المادة من القائمة</option>'+list.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 if(list.some(s=>s.id===previous))select.value=previous;
 $('subjectId').value=select.value;
 renderSubjectEditorPreview();
}
function onSubjectPicked(){
 const select=$('subjectName');$('subjectId').value=select.value;
 const s=subjectPickCatalog($('subjectType').value,$('subjectStage').value,$('subjectGrade').value).find(x=>x.id===select.value);
 if(s&&$('subjectEmoji'))$('subjectEmoji').value=s.emoji||'📚';
 renderSubjectEditorPreview();
}
function renderSubjectEditorPreview(){
 const box=$('subjectEditorPreview');if(!box)return;
 const type=$('subjectType')?.value||'public',stage=$('subjectStage')?.value||'primary',grade=$('subjectGrade')?.value||'1',name=$('subjectName')?.selectedOptions?.[0]?.textContent?.trim()||'اسم المادة سيظهر هنا',emoji=$('subjectEmoji')?.value.trim()||'📚',units=collectSubjectUnits(),image=safeSubjectImageUrl($('subjectImageUrl')?.value.trim()||'');
 if($('subjectEditorPreviewTitle'))$('subjectEditorPreviewTitle').textContent=$('subjectName')?.value?name:'اختر المادة من القائمة';
 if($('subjectEditorPreviewMeta'))$('subjectEditorPreviewMeta').textContent=typeLabel(type)+' • '+gradeLabel(stage,grade);
 if($('subjectEditorPreviewText'))$('subjectEditorPreviewText').textContent=units.length+' وحدة • ستظهر للطلاب في الصف المحدد.';
 const art=$('subjectEditorPreviewArt');if(art){art.classList.toggle('has-image',!!image);art.style.backgroundImage=image?'url("'+image.replace(/"/g,'%22')+'")':'';art.innerHTML=image?'':'<span>'+esc(emoji)+'</span>'}
}
function resetSubjectEditor(){
 editState.subject=null;$('subjectForm').reset();
 ['subjectType','subjectStage','subjectGrade','subjectName'].forEach(id=>{$(id).disabled=false});
 $('subjectType').value='public';$('subjectStage').value='primary';fillGrades($('subjectGrade'),'primary');$('subjectEmoji').value='📚';$('subjectImageUrl').value='';$('subjectUnits').value='';renderSubjectUnitsEditor([]);refreshSubjectPicker();renderSubjectImagePreview();renderSubjectEditorPreview();
 if($('subjectModalTitle'))$('subjectModalTitle').textContent='إضافة مادة ووحداتها';
}
function editSubject(id){
 const type=$('curriculumType').value,stage=$('curriculumStage').value,grade=$('curriculumGrade').value;
 const current=root.customSubjects?.[stage]?.[grade],arr=Array.isArray(current)?current:Object.values(current||{});
 const custom=arr.find(x=>x?.id===id&&(!x.type||x.type===type));
 const fallback=(defaultSubjects[stage]||[]).find(x=>x.id===id);
 const s=custom||fallback;if(!s)return;
 editState.subject={id,type,stage,grade,isDefaultOverride:!custom};
 $('subjectType').value=type;$('subjectStage').value=stage;fillGrades($('subjectGrade'),stage,grade);$('subjectGrade').value=String(grade);
 refreshSubjectPicker(s.id||id);$('subjectId').value=s.id||id;$('subjectEmoji').value=s.emoji||'📚';$('subjectImageUrl').value=s.imageUrl||'';$('subjectUnits').value=(s.units||[]).map(u=>u?.name||u||'').filter(Boolean).join('\n');renderSubjectUnitsEditor(s.units||[]);renderSubjectImagePreview();renderSubjectEditorPreview();
 ['subjectType','subjectStage','subjectGrade','subjectName'].forEach(key=>{$(key).disabled=true});
 if($('subjectModalTitle'))$('subjectModalTitle').textContent='تعديل المادة والوحدات';openModal('subjectModal');
}
async function deleteSubject(id){
 const type=$('curriculumType').value,stage=$('curriculumStage').value,grade=$('curriculumGrade').value;
 const linkedLessons=values(root.lessons).filter(x=>x.type===type&&x.stage===stage&&String(x.grade)===String(grade)&&x.subject===id),linkedQuizzes=values(root.quizzes).filter(x=>x.type===type&&x.stage===stage&&String(x.grade)===String(grade)&&x.subject===id);
 if(linkedLessons.length||linkedQuizzes.length)return toast('لا يمكن حذف مادة مرتبطة بمحتوى. انقل أو أرشف '+linkedLessons.length+' درس و'+linkedQuizzes.length+' اختبار أولًا من عمليات المحتوى.','error');
 if(!(await askConfirm({title:'حذف المادة؟',message:'لا يوجد محتوى مرتبط بهذه المادة. سيتم حذف تعريف المادة والوحدات فقط.',tone:'danger',acceptText:'حذف المادة'})))return;
 const current=root.customSubjects?.[stage]?.[grade],arr=Array.isArray(current)?[...current]:Object.values(current||{});
 const next=arr.filter(x=>!(x?.id===id&&(!x.type||x.type===type)));
 await db.ref('customSubjects/'+stage+'/'+grade).set(next);await writeAudit('subject.delete','subject',id,{type,stage,grade});toast('تم حذف المادة');
}
async function saveSubject(e){
 e.preventDefault();syncSubjectUnits();
 const editing=editState.subject;
 const stage=editing?.stage||$('subjectStage').value,grade=String(editing?.grade||$('subjectGrade').value),type=editing?.type||$('subjectType').value;
 const current=root.customSubjects?.[stage]?.[grade],arr=Array.isArray(current)?[...current]:Object.values(current||{});
 const id=editing?.id||$('subjectName').value;
 const item=subjectPickCatalog(type,stage,grade).find(s=>s.id===id);
 const name=editing?(item?.name||$('subjectName').selectedOptions[0]?.textContent||''):(item?.name||'');
 if(!id||!name)return toast('اختر المادة من القائمة أولًا.','error');
 const units=$('subjectUnits').value.split('\n').map(x=>x.trim()).filter(Boolean).map(name=>({name}));
 const rawImage=$('subjectImageUrl').value.trim(),imageUrl=safeSubjectImageUrl(rawImage);
 if(rawImage&&!imageUrl)return toast('رابط صورة المادة غير صحيح.','error');
 const value={id,name,type,emoji:$('subjectEmoji').value.trim()||'📚',imageUrl,units};
 if(editing){
   const idx=arr.findIndex(x=>x?.id===editing.id&&(!x.type||x.type===editing.type));
   if(idx<0)arr.push({...value,createdAt:Date.now(),updatedAt:Date.now()});
   else arr[idx]={...arr[idx],...value,updatedAt:Date.now()};
   await db.ref('customSubjects/'+stage+'/'+grade).set(arr);await writeAudit('subject.update','subject',id,{type,stage,grade,unitCount:units.length});toast('تم تحديث المادة والصورة والوحدات');
 }else{
   if(arr.some(x=>x?.id===id&&(!x.type||x.type===type)))return toast('المادة موجودة بالفعل لهذا الصف؛ استخدم زر تعديل المادة من قائمة المواد.','error');
   arr.push({...value,createdAt:Date.now()});
   await db.ref('customSubjects/'+stage+'/'+grade).set(arr);await writeAudit('subject.create','subject',id,{type,stage,grade,unitCount:units.length});toast('تمت إضافة المادة');
 }
 closeModal('subjectModal');resetSubjectEditor();
}

function adminTeacherEditorMeta(uid=''){
 const profile=root.teacherProfiles?.[uid]||{},publicProfile=root.settings?.publicTeachers?.[uid]||{};
 return {id:uid,name:publicProfile.name||profile.name||'',title:publicProfile.title||profile.role||'مدرس',photoUrl:publicProfile.photoUrl||'',active:profile.isActive!==false};
}
function adminTeacherOptions(selected=''){
 const teachers=values(root.teacherProfiles).sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar'));
 const rows=['<option value="">اسم مدرس يدوي / غير مرتبط بحساب</option>'];
 teachers.forEach(t=>rows.push('<option value="'+esc(t.id)+'" '+(String(selected)===String(t.id)?'selected':'')+'>'+(t.isActive===false?'⏸️ ':'')+esc(t.name||t.email||'مدرس')+'</option>'));
 return rows.join('');
}
function lessonVideoRowHtml(v={},i=0){
 const teacherId=String(v?.teacherId||''),meta=adminTeacherEditorMeta(teacherId),name=v?.name||meta.name||'',photo=safeSubjectImageUrl(meta.photoUrl||'');
 const avatar=photo?'<img src="'+esc(photo)+'" alt="" loading="lazy">':'<span>'+esc((name.trim()[0]||'م'))+'</span>';
 const safeVideo=cleanUrl(v?.url||'');
 return '<article class="admin-video-row" data-video-row="'+i+'">'+
   '<div class="admin-video-teacher-preview">'+avatar+'<div><small>المدرس</small><strong class="lesson-video-teacher-label">'+esc(name||'غير محدد')+'</strong><em>'+esc(meta.title||'')+'</em></div></div>'+
   '<label><span>اختر حساب المدرس</span><select class="lesson-video-teacher">'+adminTeacherOptions(teacherId)+'</select></label>'+
   '<label class="lesson-video-manual-name '+(teacherId?'hidden':'')+'"><span>اسم المدرس</span><input class="lesson-video-name" value="'+esc(name)+'" placeholder="اسم المدرس"></label>'+
   '<label class="lesson-video-url-field"><span>رابط YouTube</span><input class="lesson-video-url" type="url" dir="ltr" value="'+esc(v?.url||'')+'" placeholder="https://youtube.com/..."></label>'+
   '<details class="admin-video-checkpoints"><summary><i class="fa-solid fa-circle-question"></i> أسئلة تفاعلية داخل الفيديو</summary><label><span>JSON — الوقت بالثواني</span><textarea class="lesson-video-checkpoints-input" dir="ltr" rows="4" placeholder="[{&quot;time&quot;:60,&quot;question&quot;:&quot;سؤال؟&quot;,&quot;options&quot;:[&quot;أ&quot;,&quot;ب&quot;,&quot;ج&quot;,&quot;د&quot;],&quot;correctAnswer&quot;:0,&quot;explanation&quot;:&quot;التفسير&quot;}]">'+esc(JSON.stringify(v?.checkpoints||v?.videoQuestions||[]))+'</textarea><small>يتوقف الفيديو عند الوقت المحدد حتى يجيب الطالب إجابة صحيحة.</small></label></details>'+
   '<div class="admin-video-row-actions">'+(safeVideo!=='#'?'<a class="admin-action-btn success lesson-video-open" href="'+esc(safeVideo)+'" target="_blank" rel="noopener" title="فتح الفيديو"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>':'<a class="admin-action-btn success lesson-video-open hidden" href="#" target="_blank" rel="noopener" title="فتح الفيديو"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>')+'<button type="button" class="admin-action-btn danger" data-remove-video-row="'+i+'" title="حذف الفيديو"><i class="fa-solid fa-trash"></i></button></div>'+
 '</article>';
}
function bindLessonVideoRows(){
 const wrap=$('lessonVideosEditor');if(!wrap)return;
 $$('.admin-video-row',wrap).forEach(row=>{
   const select=row.querySelector('.lesson-video-teacher'),nameInput=row.querySelector('.lesson-video-name'),manual=row.querySelector('.lesson-video-manual-name'),urlInput=row.querySelector('.lesson-video-url'),label=row.querySelector('.lesson-video-teacher-label'),preview=row.querySelector('.admin-video-teacher-preview'),open=row.querySelector('.lesson-video-open');
   const refreshTeacher=()=>{
     const meta=adminTeacherEditorMeta(select?.value||'');
     if(manual)manual.classList.toggle('hidden',!!select?.value);
     if(select?.value&&nameInput)nameInput.value=meta.name||'المدرس';
     const name=(select?.value?meta.name:nameInput?.value)||'غير محدد';
     if(label)label.textContent=name;
     const photo=safeSubjectImageUrl(meta.photoUrl||'');
     const avatar=preview?.querySelector(':scope > img,:scope > span');
     if(preview&&avatar){
       if(photo){
         if(avatar.tagName==='IMG')avatar.src=photo;
         else{const img=document.createElement('img');img.src=photo;img.alt='';img.loading='lazy';avatar.replaceWith(img)}
       }else{
         if(avatar.tagName==='SPAN')avatar.textContent=(name.trim()[0]||'م');
         else{const span=document.createElement('span');span.textContent=(name.trim()[0]||'م');avatar.replaceWith(span)}
       }
       const em=preview.querySelector('em');if(em)em.textContent=meta.title||'';
     }
     renderLessonEditorPreview();
   };
   select?.addEventListener('change',refreshTeacher);
   nameInput?.addEventListener('input',refreshTeacher);
   urlInput?.addEventListener('input',()=>{
     const safe=cleanUrl(urlInput.value.trim());
     if(open){open.classList.toggle('hidden',safe==='#');if(safe!=='#')open.href=safe}
     updateLessonVideoEditorCount();renderLessonEditorPreview();
   });
 });
 $$('[data-remove-video-row]',wrap).forEach(b=>b.onclick=()=>{
   const rows=$$('.admin-video-row',wrap);
   if(rows.length<=1){
     const row=rows[0];if(!row)return;
     row.querySelector('.lesson-video-teacher').value='';
     row.querySelector('.lesson-video-name').value='';
     row.querySelector('.lesson-video-url').value='';
     renderLessonVideosEditor([{name:'',url:''}]);return;
   }
   b.closest('.admin-video-row')?.remove();updateLessonVideoEditorCount();renderLessonEditorPreview();
 });
 updateLessonVideoEditorCount();
}
function renderLessonVideosEditor(videos){
 const list=Array.isArray(videos)&&videos.length?videos:[{name:'',url:'',teacherId:''}];
 const wrap=$('lessonVideosEditor');if(!wrap)return;
 wrap.innerHTML=list.map(lessonVideoRowHtml).join('');
 bindLessonVideoRows();
}
function normalizeVideoCheckpoints(raw=''){
 const text=String(raw||'').trim();if(!text)return[];
 try{
  const list=JSON.parse(text);if(!Array.isArray(list))throw new Error();
  return list.map((q,i)=>{
   const options=Array.isArray(q?.options)?q.options.map(x=>String(x??'')).filter(Boolean):[];
   const correct=Math.max(0,Math.min(options.length-1,Number(q?.correctAnswer||0)));
   return{id:String(q?.id||('checkpoint-'+i)),time:Math.max(1,Number(q?.time||q?.second||0)),question:String(q?.question||q?.text||'').trim(),options,correctAnswer:correct,explanation:String(q?.explanation||'').trim()};
  }).filter(q=>q.time>0&&q.question&&q.options.length>=2).sort((a,b)=>a.time-b.time);
 }catch{return null}
}
function collectLessonVideos(includeEmpty=false){
 return $$('.admin-video-row',$('lessonVideosEditor')||document).map(row=>{
   const teacherId=row.querySelector('.lesson-video-teacher')?.value||'',meta=adminTeacherEditorMeta(teacherId);
   const name=(teacherId?meta.name:row.querySelector('.lesson-video-name')?.value.trim())||'المدرس';
   const url=row.querySelector('.lesson-video-url')?.value.trim()||'';
   const checkpoints=normalizeVideoCheckpoints(row.querySelector('.lesson-video-checkpoints-input')?.value||'');
   return {name,url,teacherId,checkpoints};
 }).filter(v=>includeEmpty||v.url);
}
function updateLessonVideoEditorCount(){
 const count=collectLessonVideos(false).length;if($('lessonVideoEditorCount'))$('lessonVideoEditorCount').textContent=count;
}
function addLessonVideoRow(){
 const rows=collectLessonVideos(true);rows.push({name:'',url:'',teacherId:''});renderLessonVideosEditor(rows);
 const wrap=$('lessonVideosEditor');wrap?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

const adminQuestionEditors={
 lesson:{builder:'lessonQuestionBuilder',textarea:'newLessonQuestions',count:'lessonQuestionCountEditor'},
 quiz:{builder:'quizQuestionBuilder',textarea:'newQuizQuestions',count:'quizQuestionCountEditor'}
};
function defaultAdminQuestion(){return{text:'',opts:['','','',''],correctAnswer:0,explanation:'',hint:'',difficulty:2}}
function normalizeAdminQuestion(q={}){
 const source={...(q||{})},rawOpts=Array.isArray(q?.opts)?q.opts:Array.isArray(q?.options)?q.options:[];
 const opts=(rawOpts.length?rawOpts:['','','','']).slice(0,4).map(x=>String(x??''));while(opts.length<2)opts.push('');
 const answer=Math.max(0,Math.min(opts.length-1,Number.isInteger(Number(q?.correctAnswer))?Number(q.correctAnswer):0));
 delete source.question;delete source.options;delete source.text;delete source.opts;delete source.correctAnswer;delete source.explanation;delete source.hint;delete source.difficulty;
 return {...source,text:String(q?.text??q?.question??''),opts,correctAnswer:answer,explanation:String(q?.explanation||''),hint:String(q?.hint||''),difficulty:Number(q?.difficulty||2)};
}
function questionCardHtml(kind,q,index){
 const item=normalizeAdminQuestion(q),extra={...item};['text','opts','correctAnswer','explanation','hint','difficulty'].forEach(k=>delete extra[k]);
 const opts=item.opts.map((opt,oi)=>'<div class="admin-question-option-row"><span>'+String.fromCharCode(65+oi)+'</span><input class="admin-question-option" value="'+esc(opt)+'" placeholder="الخيار '+(oi+1)+'"><button type="button" class="admin-option-remove '+(item.opts.length<=2?'hidden':'')+'" data-remove-option="'+oi+'" title="حذف الاختيار"><i class="fa-solid fa-xmark"></i></button></div>').join('');
 const correctOptions=item.opts.map((_,oi)=>'<option value="'+oi+'" '+(oi===item.correctAnswer?'selected':'')+'>الخيار '+(oi+1)+'</option>').join('');
 return '<article class="admin-question-card" data-question-index="'+index+'" data-question-extra="'+encodeURIComponent(JSON.stringify(extra))+'">'+
   '<div class="admin-question-card-head"><span class="admin-question-number">'+(index+1)+'</span><div><strong>السؤال '+(index+1)+'</strong><small>اختر الإجابة الصحيحة وأضف تفسيرًا إن أردت.</small></div><div class="admin-question-card-actions"><button type="button" data-duplicate-question="'+index+'" title="نسخ السؤال"><i class="fa-regular fa-copy"></i></button><button type="button" class="danger" data-remove-question="'+index+'" title="حذف السؤال"><i class="fa-solid fa-trash"></i></button></div></div>'+
   '<label class="full"><span>نص السؤال</span><textarea class="admin-question-text" rows="2" placeholder="اكتب السؤال...">'+esc(item.text)+'</textarea></label>'+
   '<div class="admin-question-options">'+opts+'</div>'+
   '<div class="admin-question-option-tools"><button type="button" class="btn btn-soft '+(item.opts.length>=4?'hidden':'')+'" data-add-option="'+index+'"><i class="fa-solid fa-plus"></i> إضافة اختيار</button></div>'+
   '<div class="admin-question-settings"><label><span>الإجابة الصحيحة</span><select class="admin-question-correct">'+correctOptions+'</select></label><label><span>الصعوبة</span><select class="admin-question-difficulty"><option value="1" '+(item.difficulty===1?'selected':'')+'>سهل</option><option value="2" '+(item.difficulty===2?'selected':'')+'>متوسط</option><option value="3" '+(item.difficulty===3?'selected':'')+'>صعب</option></select></label></div>'+
   '<label class="full"><span>شرح الإجابة — اختياري</span><textarea class="admin-question-explanation" rows="2" placeholder="لماذا هذه هي الإجابة الصحيحة؟">'+esc(item.explanation)+'</textarea></label>'+
   '<label class="full"><span>تلميح — اختياري</span><input class="admin-question-hint" value="'+esc(item.hint)+'" placeholder="تلميح قصير للطالب"></label>'+
   '<label class="full"><span>المهارة / ناتج التعلم — اختياري</span><input class="admin-question-skill" value="'+esc(item.skill||'')+'" maxlength="120" placeholder="مثال: إعراب الفعل المضارع"></label>'+
 '</article>';
}
function collectQuestionBuilder(kind){
 const cfg=adminQuestionEditors[kind],wrap=$(cfg?.builder);if(!cfg||!wrap)return[];
 return $$('.admin-question-card',wrap).map(card=>{
   let extra={};try{extra=JSON.parse(decodeURIComponent(card.dataset.questionExtra||'%7B%7D'))}catch{}
   const opts=$$('.admin-question-option',card).map(x=>x.value.trim());
   return {...extra,text:card.querySelector('.admin-question-text')?.value.trim()||'',opts,correctAnswer:Number(card.querySelector('.admin-question-correct')?.value||0),explanation:card.querySelector('.admin-question-explanation')?.value.trim()||'',hint:card.querySelector('.admin-question-hint')?.value.trim()||'',skill:card.querySelector('.admin-question-skill')?.value.trim()||'',difficulty:Number(card.querySelector('.admin-question-difficulty')?.value||2)};
 });
}
function syncQuestionBuilder(kind){
 const cfg=adminQuestionEditors[kind];if(!cfg)return;
 const list=collectQuestionBuilder(kind),textarea=$(cfg.textarea);if(textarea)textarea.value=JSON.stringify(list,null,2);
 if($(cfg.count))$(cfg.count).textContent=list.length;
 renderLessonEditorPreview();renderQuizEditorPreview();
}
function renderQuestionBuilder(kind,questions=[]){
 const cfg=adminQuestionEditors[kind],wrap=$(cfg?.builder);if(!cfg||!wrap)return;
 const list=(Array.isArray(questions)?questions:[]).map(normalizeAdminQuestion);
 wrap.innerHTML=list.length?list.map((q,i)=>questionCardHtml(kind,q,i)).join(''):'<div class="admin-question-empty"><span>📝</span><strong>لا توجد أسئلة بعد</strong><p>اضغط «سؤال جديد» أو استورد JSON دفعة واحدة.</p></div>';
 if($(cfg.count))$(cfg.count).textContent=list.length;
 $$('.admin-question-card',wrap).forEach(card=>{
   $$('input,textarea,select',card).forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>syncQuestionBuilder(kind)));
 });
 $$('[data-remove-question]',wrap).forEach(b=>b.onclick=()=>{const rows=collectQuestionBuilder(kind);rows.splice(Number(b.dataset.removeQuestion),1);renderQuestionBuilder(kind,rows);syncQuestionBuilder(kind)});
 $$('[data-duplicate-question]',wrap).forEach(b=>b.onclick=()=>{const rows=collectQuestionBuilder(kind),i=Number(b.dataset.duplicateQuestion);rows.splice(i+1,0,JSON.parse(JSON.stringify(rows[i]||defaultAdminQuestion())));renderQuestionBuilder(kind,rows);syncQuestionBuilder(kind)});
 $$('[data-add-option]',wrap).forEach(b=>b.onclick=()=>{const rows=collectQuestionBuilder(kind),i=Number(b.dataset.addOption);if(rows[i]&&rows[i].opts.length<4)rows[i].opts.push('');renderQuestionBuilder(kind,rows);syncQuestionBuilder(kind)});
 $$('[data-remove-option]',wrap).forEach(b=>b.onclick=()=>{const card=b.closest('.admin-question-card'),rows=collectQuestionBuilder(kind),i=Number(card?.dataset.questionIndex),oi=Number(b.dataset.removeOption);if(rows[i]?.opts.length>2){rows[i].opts.splice(oi,1);if(rows[i].correctAnswer>=rows[i].opts.length)rows[i].correctAnswer=rows[i].opts.length-1;else if(rows[i].correctAnswer>oi)rows[i].correctAnswer--;}renderQuestionBuilder(kind,rows);syncQuestionBuilder(kind)});
 if($(cfg.textarea)&&!$(cfg.textarea).value.trim())$(cfg.textarea).value=JSON.stringify(list,null,2);
 renderLessonEditorPreview();renderQuizEditorPreview();
}
function addAdminQuestion(kind){
 const rows=collectQuestionBuilder(kind);rows.push(defaultAdminQuestion());renderQuestionBuilder(kind,rows);syncQuestionBuilder(kind);
 const cfg=adminQuestionEditors[kind],wrap=$(cfg.builder);wrap?.lastElementChild?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function importQuestionJson(kind){
 const cfg=adminQuestionEditors[kind],textarea=$(cfg?.textarea);if(!textarea)return;
 try{
   const raw=JSON.parse(textarea.value.trim()||'[]');if(!Array.isArray(raw))throw new Error();
   const questions=raw.length?window.AcademyUtils.validateQuestions(raw):[];
   renderQuestionBuilder(kind,questions);syncQuestionBuilder(kind);toast('تم تحميل '+questions.length+' سؤال إلى المحرر.');
 }catch(err){toast(err?.message||'صيغة JSON للأسئلة غير صحيحة.','error')}
}
function renderLessonImagePreview(){
 const box=$('lessonImagePreview');if(!box)return;
 const raw=$('newLessonImage')?.value.trim()||'',safe=safeSubjectImageUrl(raw);
 box.classList.toggle('has-image',!!safe);box.style.backgroundImage=safe?'linear-gradient(90deg,rgba(15,23,42,.62),rgba(15,23,42,.12)),url("'+safe.replace(/"/g,'%22')+'")':'';
 const strong=box.querySelector('strong'),small=box.querySelector('small');
 if(strong)strong.textContent=safe?'الصورة جاهزة للعرض':'معاينة صورة الدرس';
 if(small)small.textContent=raw&&!safe?'الرابط غير صالح. استخدم رابط http أو https.':safe?'ستظهر هذه الصورة داخل شرح الدرس.':'إذا لم تضف صورة سيستخدم تصميم المادة تلقائيًا.';
}
function renderLessonEditorPreview(){
 const box=$('lessonEditorPreview');if(!box)return;
 const type=$('newLessonType')?.value||'public',stage=$('newLessonStage')?.value||'primary',grade=$('newLessonGrade')?.value||'1',subjectId=$('newLessonSubject')?.value||'',subject=adminSubjectMeta(stage,grade,type,subjectId),title=$('newLessonTitle')?.value.trim()||'عنوان الدرس سيظهر هنا',unit=Number($('newLessonUnit')?.value||1),videos=collectLessonVideos(false).length,questions=collectQuestionBuilder('lesson').length,hidden=!!$('newLessonHidden')?.checked;
 if($('lessonEditorPreviewTitle'))$('lessonEditorPreviewTitle').textContent=title;
 if($('lessonEditorPreviewMeta'))$('lessonEditorPreviewMeta').textContent=subject.name+' • '+gradeLabel(stage,grade)+' • '+(subject.units?.[unit-1]?.name||'الوحدة '+unit);
 if($('lessonEditorPreviewText'))$('lessonEditorPreviewText').textContent=videos+' فيديو شرح • '+questions+' سؤال تدريب';
 const draft=!!$('newLessonDraft')?.checked,status=$('lessonEditorPreviewStatus');if(status){status.textContent=draft?'مسودة':hidden?'مخفي':'منشور';status.className='status-pill '+(draft?'pending':hidden?'rejected':'approved')}
 const art=$('lessonEditorPreviewArt'),image=safeSubjectImageUrl($('newLessonImage')?.value.trim()||'')||safeSubjectImageUrl(subject.imageUrl||'');
 if(art){art.classList.toggle('has-image',!!image);art.style.backgroundImage=image?'url("'+image.replace(/"/g,'%22')+'")':'';art.innerHTML=image?'':'<span>'+esc(subject.emoji||'📚')+'</span>'}
 renderLessonImagePreview();
}
function renderQuizEditorPreview(){
 const box=$('quizEditorPreview');if(!box)return;
 const type=$('newQuizType')?.value||'public',stage=$('newQuizStage')?.value||'primary',grade=$('newQuizGrade')?.value||'1',subject=adminSubjectMeta(stage,grade,type,$('newQuizSubject')?.value||''),unit=Number($('newQuizUnit')?.value||0),count=collectQuestionBuilder('quiz').length,hidden=!!$('newQuizHidden')?.checked;
 if($('quizEditorPreviewTitle'))$('quizEditorPreviewTitle').textContent=$('newQuizName')?.value.trim()||'اسم الاختبار سيظهر هنا';
 if($('quizEditorPreviewMeta'))$('quizEditorPreviewMeta').textContent=subject.name+' • '+gradeLabel(stage,grade);
 if($('quizEditorPreviewText'))$('quizEditorPreviewText').textContent=count+' سؤال • '+(unit===0?'اختبار شامل':subject.units?.[unit-1]?.name||'الوحدة '+unit);
 const draft=!!$('newQuizDraft')?.checked,status=$('quizEditorPreviewStatus');if(status){status.textContent=draft?'مسودة':hidden?'مخفي':'منشور';status.className='status-pill '+(draft?'pending':hidden?'rejected':'approved')}
}
const adminLessonRichEditor=window.AcademyRichEditor?.init('newLessonContent',{placeholder:'ابدأ كتابة شرح الدرس... استخدم العناوين والقوائم والألوان، وأدرج الصور داخل المقال من زر «صورة».'});
function resetLessonEditor(){
 editState.lesson=null;$('lessonForm').reset();adminLessonRichEditor?.clear();if($('newLessonFree'))$('newLessonFree').checked=false;if($('newLessonDraft'))$('newLessonDraft').checked=false;fillGrades($('newLessonGrade'),$('newLessonStage').value);fillSubjects($('newLessonSubject'),$('newLessonStage').value,$('newLessonGrade').value,$('newLessonType').value);renderLessonVideosEditor([{name:'',url:'',teacherId:''}]);$('newLessonImagePosition').value='top';$('newLessonQuestions').value='[]';renderQuestionBuilder('lesson',[]);renderLessonEditorPreview();if($('lessonModalTitle'))$('lessonModalTitle').textContent='إضافة درس جديد';
}

/* Lessons */
function pruneContentSelections(){
 [...selectedLessonIds].forEach(id=>{if(!root.lessons?.[id])selectedLessonIds.delete(id)});
 [...selectedQuizIds].forEach(id=>{if(!root.quizzes?.[id])selectedQuizIds.delete(id)});
}
function updateBulkSelectionUI(kind){
 pruneContentSelections();
 const lessonMode=kind!=='quiz',set=lessonMode?selectedLessonIds:selectedQuizIds;
 const visible=lessonMode?filteredLessons():filteredQuizzes(),prefix=lessonMode?'Lesson':'Quiz',selectAll=$(lessonMode?'selectVisibleLessons':'selectVisibleQuizzes');
 if($(lessonMode?'selectedLessonCount':'selectedQuizCount'))$(lessonMode?'selectedLessonCount':'selectedQuizCount').textContent=set.size;
 if(selectAll){
   const ids=visible.map(x=>x.id),count=ids.filter(id=>set.has(id)).length;
   selectAll.checked=!!ids.length&&count===ids.length;selectAll.indeterminate=count>0&&count<ids.length;
 }
 $$('[data-select-'+(lessonMode?'lesson':'quiz')+']').forEach(input=>{
   const id=lessonMode?input.dataset.selectLesson:input.dataset.selectQuiz,checked=set.has(id);
   input.checked=checked;input.closest('.admin-content-card')?.classList.toggle('selected',checked);
 });
 $$('[data-bulk-'+(lessonMode?'lessons':'quizzes')+']').forEach(b=>b.disabled=!set.size);
}
function clearBulkSelection(kind){
 const lessonMode=kind!=='quiz';(lessonMode?selectedLessonIds:selectedQuizIds).clear();updateBulkSelectionUI(lessonMode?'lesson':'quiz');
}
async function archiveLessons(ids=[]){
 const unique=[...new Set(ids)].filter(id=>root.lessons?.[id]);if(!unique.length)return 0;
 const idSet=new Set(unique),linked=values(root.quizzes).filter(q=>q.lessonId&&idSet.has(String(q.lessonId))),now=Date.now(),updates={};
 unique.forEach(id=>{
   const lesson=root.lessons[id],related={};
   linked.filter(q=>String(q.lessonId)===String(id)).forEach(q=>{const copy={...q};delete copy.id;related[q.id]=copy});
   updates['contentArchiveV1/lesson/'+id]={kind:'lesson',sourceId:id,title:lesson.title||'درس',data:lesson,relatedQuizzes:related,archivedAt:now,archivedBy:currentUser?.uid||''};
   updates['lessons/'+id]=null;
 });
 linked.forEach(q=>{
   updates['quizzes/'+q.id]=null;
   (Array.isArray(q.questions)?q.questions:[]).forEach((_,i)=>updates['questionBankV4/quiz-'+q.id+'-'+i]=null);
 });
 await db.ref().update(updates);await writeAudit('lesson.archive','lesson','bulk',{count:unique.length,linkedQuizCount:linked.length,ids:unique});return unique.length;
}
async function archiveQuizzes(ids=[]){
 const unique=[...new Set(ids)].filter(id=>root.quizzes?.[id]);if(!unique.length)return 0;
 const now=Date.now(),updates={};
 unique.forEach(id=>{
   const quiz=root.quizzes[id];
   updates['contentArchiveV1/quiz/'+id]={kind:'quiz',sourceId:id,title:quiz.name||'اختبار',data:quiz,archivedAt:now,archivedBy:currentUser?.uid||''};
   updates['quizzes/'+id]=null;
   (Array.isArray(quiz.questions)?quiz.questions:[]).forEach((_,i)=>updates['questionBankV4/quiz-'+id+'-'+i]=null);
 });
 await db.ref().update(updates);await writeAudit('quiz.archive','quiz','bulk',{count:unique.length,ids:unique});return unique.length;
}
async function bulkLessonVisibility(hidden){
 const ids=[...selectedLessonIds];if(!ids.length)return;
 const updates={},now=Date.now();ids.forEach(id=>{updates['lessons/'+id+'/isHidden']=!!hidden;updates['lessons/'+id+'/workflowStatus']=hidden?'hidden':'published';updates['lessons/'+id+'/publishAt']=null;if(!hidden){updates['lessons/'+id+'/reviewStatus']='approved';updates['lessons/'+id+'/reviewedAt']=now;updates['lessons/'+id+'/reviewedBy']=currentUser?.uid||'';updates['lessons/'+id+'/publishedAt']=now}});await db.ref().update(updates);
 await writeAudit(hidden?'lesson.bulk_hide':'lesson.bulk_publish','lesson','bulk',{count:ids.length,ids});clearBulkSelection('lesson');toast((hidden?'تم إخفاء ':'تم نشر ')+ids.length+' درس');
}
async function bulkMoveLessons(){
 const ids=[...selectedLessonIds],targetUnit=Math.max(1,Number($('bulkLessonUnit')?.value||1));if(!ids.length)return;
 const groups=new Map();
 ids.forEach(id=>{const l=root.lessons?.[id];if(!l)return;const key=[l.type,l.stage,String(l.grade),l.subject].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id,...l})});
 const updates={},now=Date.now();
 groups.forEach(items=>{
   const sample=items[0],selected=new Set(items.map(x=>x.id));
   const existing=values(root.lessons).filter(l=>!selected.has(l.id)&&l.type===sample.type&&l.stage===sample.stage&&String(l.grade)===String(sample.grade)&&l.subject===sample.subject&&Number(l.unit||1)===targetUnit);
   let order=Math.max(0,...existing.map(lessonAdminSortValue).filter(Number.isFinite));
   items.sort((a,b)=>lessonAdminSortValue(a)-lessonAdminSortValue(b)).forEach(l=>{order+=1000;updates['lessons/'+l.id+'/unit']=targetUnit;updates['lessons/'+l.id+'/sortOrder']=order;updates['lessons/'+l.id+'/orderUpdatedAt']=now});
 });
 await db.ref().update(updates);await writeAudit('lesson.bulk_move','lesson','bulk',{count:ids.length,targetUnit,ids});clearBulkSelection('lesson');toast('تم نقل '+ids.length+' درس إلى الوحدة '+targetUnit);
}
async function bulkDuplicateLessons(){
 const ids=[...selectedLessonIds];if(!ids.length)return;
 const ok=await askConfirm({title:'نسخ '+ids.length+' درس؟',message:'سيتم إنشاء نسخ مخفية للمراجعة قبل النشر.',acceptText:'إنشاء النسخ'});if(!ok)return;
 const updates={},groupOrder=new Map(),now=Date.now();
 ids.map(id=>({id,...(root.lessons?.[id]||{})})).filter(x=>x.id&&x.title).sort((a,b)=>lessonAdminSortValue(a)-lessonAdminSortValue(b)).forEach(l=>{
   const key=[l.type,l.stage,String(l.grade),l.subject,Number(l.unit||1)].join('|');
   if(!groupOrder.has(key)){
     const max=Math.max(0,...values(root.lessons).filter(x=>x.type===l.type&&x.stage===l.stage&&String(x.grade)===String(l.grade)&&x.subject===l.subject&&Number(x.unit||1)===Number(l.unit||1)).map(lessonAdminSortValue).filter(Number.isFinite));
     groupOrder.set(key,max);
   }
   const newId=db.ref('lessons').push().key,order=groupOrder.get(key)+1000;groupOrder.set(key,order);
   const copy={...l,title:(l.title||'درس')+' — نسخة',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:now,updatedAt:now,sortOrder:order};
   delete copy.id;delete copy.teacherSubmissionId;delete copy.orderUpdatedAt;updates['lessons/'+newId]=copy;
 });
 await db.ref().update(updates);await writeAudit('lesson.bulk_duplicate','lesson','bulk',{count:ids.length,ids});clearBulkSelection('lesson');toast('تم إنشاء '+ids.length+' نسخة كمسودات');
}
async function bulkArchiveLessons(){
 const ids=[...selectedLessonIds];if(!ids.length)return;
 const linked=values(root.quizzes).filter(q=>q.lessonId&&ids.includes(String(q.lessonId)));
 const ok=await askConfirm({title:'أرشفة '+ids.length+' درس؟',message:'سيتم نقل الدروس المحددة إلى الأرشيف'+(linked.length?' ومعها '+linked.length+' اختبار مرتبط، ويمكن استرجاعها لاحقًا.':'.'),acceptText:'نقل إلى الأرشيف'});if(!ok)return;
 const count=await archiveLessons(ids);clearBulkSelection('lesson');toast('تمت أرشفة '+count+' درس'+(linked.length?' مع الاختبارات المرتبطة':''));
}
function quizBankUpdates(quizId,quiz,updates,now){
 (Array.isArray(quiz.questions)?quiz.questions:[]).forEach((q,qi)=>{
   const bankId='quiz-'+quizId+'-'+qi;
   updates['questionBankV4/'+bankId]={id:bankId,question:q.text,options:q.opts,correctAnswer:Number(q.correctAnswer),explanation:q.explanation||'',skill:q.skill||'',difficulty:Number(q.difficulty||2),type:quiz.type,stage:quiz.stage,grade:String(quiz.grade),subject:quiz.subject,unit:Number(quiz.unit||0),lessonId:quiz.lessonId||'',sourceQuizId:quizId,authorUid:currentUser?.uid||'',authorRole:'admin',status:quizQuestionBankStatus(quiz,now),createdAt:now,updatedAt:now};
 });
}
async function bulkQuizVisibility(hidden){
 const ids=[...selectedQuizIds];if(!ids.length)return;const updates={},now=Date.now();ids.forEach(id=>{const q=root.quizzes?.[id];updates['quizzes/'+id+'/isHidden']=!!hidden;updates['quizzes/'+id+'/workflowStatus']=hidden?'hidden':'published';updates['quizzes/'+id+'/publishAt']=null;(Array.isArray(q?.questions)?q.questions:[]).forEach((_,i)=>updates['questionBankV4/quiz-'+id+'-'+i+'/status']=hidden?'hidden':'approved');if(!hidden){updates['quizzes/'+id+'/reviewStatus']='approved';updates['quizzes/'+id+'/reviewedAt']=now;updates['quizzes/'+id+'/reviewedBy']=currentUser?.uid||'';updates['quizzes/'+id+'/publishedAt']=now}});await db.ref().update(updates);
 await writeAudit(hidden?'quiz.bulk_hide':'quiz.bulk_publish','quiz','bulk',{count:ids.length,ids});clearBulkSelection('quiz');toast((hidden?'تم إخفاء ':'تم نشر ')+ids.length+' اختبار');
}
async function bulkDuplicateQuizzes(){
 const ids=[...selectedQuizIds];if(!ids.length)return;
 const ok=await askConfirm({title:'نسخ '+ids.length+' اختبار؟',message:'سيتم إنشاء نسخ مخفية مع نسخ أسئلتها إلى بنك الأسئلة.',acceptText:'إنشاء النسخ'});if(!ok)return;
 const updates={},now=Date.now();
 ids.forEach(id=>{const q=root.quizzes?.[id];if(!q)return;const newId=db.ref('quizzes').push().key,copy={...q,name:(q.name||'اختبار')+' — نسخة',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:now,updatedAt:now};delete copy.id;delete copy.teacherSubmissionId;updates['quizzes/'+newId]=copy;quizBankUpdates(newId,copy,updates,now)});
 await db.ref().update(updates);await writeAudit('quiz.bulk_duplicate','quiz','bulk',{count:ids.length,ids});clearBulkSelection('quiz');toast('تم إنشاء '+ids.length+' نسخة اختبار كمسودات');
}
async function bulkArchiveQuizzes(){
 const ids=[...selectedQuizIds];if(!ids.length)return;
 const ok=await askConfirm({title:'أرشفة '+ids.length+' اختبار؟',message:'سيتم نقل الاختبارات وأسئلتها إلى الأرشيف ويمكن استرجاعها لاحقًا.',acceptText:'نقل إلى الأرشيف'});if(!ok)return;
 const count=await archiveQuizzes(ids);clearBulkSelection('quiz');toast('تمت أرشفة '+count+' اختبار');
}
async function handleBulkLessonAction(action){
 if(action==='publish')return bulkLessonVisibility(false);if(action==='hide')return bulkLessonVisibility(true);if(action==='move')return bulkMoveLessons();if(action==='duplicate')return bulkDuplicateLessons();if(action==='archive')return bulkArchiveLessons();
}
async function handleBulkQuizAction(action){
 if(action==='publish')return bulkQuizVisibility(false);if(action==='hide')return bulkQuizVisibility(true);if(action==='duplicate')return bulkDuplicateQuizzes();if(action==='archive')return bulkArchiveQuizzes();
}

function filteredLessons(){
 const q=($('lessonSearch')?.value||'').trim().toLowerCase(),stage=$('lessonFilterStage')?.value||'',type=$('lessonFilterType')?.value||'',status=$('lessonFilterStatus')?.value||'';
 return values(root.lessons).filter(l=>{
   const subject=adminSubjectMeta(l.stage,l.grade,l.type,l.subject),teachers=adminLessonTeachers(l).join(' ');
   const hay=((l.title||'')+' '+(l.subject||'')+' '+(subject.name||'')+' '+teachers).toLowerCase();
   return (!q||hay.includes(q))&&(!stage||l.stage===stage)&&(!type||l.type===type)&&(!status||publicationState(l)===status);
 }).sort((a,b)=>(b.createdAt||b.updatedAt||0)-(a.createdAt||a.updatedAt||0));
}
// Label existing actions without replacing their nodes or event bindings.
function labelAdminContentActions(container){
 if(!container)return;
 container.querySelectorAll('.admin-action-btn').forEach(button=>{
  if(button.querySelector('.admin-action-label'))return;
  const title=button.getAttribute('title')||'';
  if(!title)return;
  const label=document.createElement('span');label.className='admin-action-label';
  label.textContent=title.startsWith('معاينة ومراجعة')?'معاينة':title==='فتح المعاينة في تبويب جديد'?'فتح':title;
  button.appendChild(label);button.setAttribute('aria-label',title);
 });
}
function renderLessons(){
 const all=values(root.lessons),arr=filteredLessons();
 if($('adminLessonTotal'))$('adminLessonTotal').textContent=all.length;
 if($('adminLessonPublished'))$('adminLessonPublished').textContent=all.filter(l=>publicationState(l)==='published').length;
 if($('adminLessonHidden'))$('adminLessonHidden').textContent=all.filter(l=>publicationState(l)==='hidden').length;
 if($('adminLessonVideos'))$('adminLessonVideos').textContent=all.reduce((sum,l)=>sum+(Array.isArray(l.videos)?l.videos.filter(v=>v?.url).length:0),0);
 if($('lessonResultCount'))$('lessonResultCount').textContent=arr.length+' نتيجة';
 $('lessonsAdminList').innerHTML=arr.length?arr.map(l=>{
   const subject=adminSubjectMeta(l.stage,l.grade,l.type,l.subject),subjectImage=safeSubjectImageUrl(subject.imageUrl||''),lessonImage=safeSubjectImageUrl(l.imageUrl||''),image=lessonImage||subjectImage,teachers=adminLessonTeachers(l),videos=Array.isArray(l.videos)?l.videos.filter(v=>v?.url).length:0,questions=Array.isArray(l.questions)?l.questions.length:0;
   const preview=lessonAdminPreviewUrl(l),unit=adminUnitLabel(l),date=l.updatedAt||l.createdAt||0;
   return '<article class="admin-content-card admin-lesson-content-card '+(publicationState(l)==='draft'?'is-draft ':l.isHidden?'is-hidden ':'is-published ')+(selectedLessonIds.has(l.id)?'selected':'')+'">'+
     '<label class="admin-card-selection" title="تحديد الدرس"><input type="checkbox" data-select-lesson="'+esc(l.id)+'" '+(selectedLessonIds.has(l.id)?'checked':'')+'><span><i class="fa-solid fa-check"></i></span></label>'+
     '<div class="admin-content-card-art '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+
       (!image?'<span>'+esc(subject.emoji||'📚')+'</span>':'')+'<div class="admin-content-card-status"><span class="status-pill '+publicationPillClass(l)+'">'+publicationLabel(l)+'</span><span class="status-pill '+(l.isFree?'approved':'info')+'">'+(l.isFree?'مجاني':'اشتراك')+'</span></div>'+
       '<em>'+esc(subject.name)+'</em>'+
     '</div>'+
     '<div class="admin-content-card-body"><div class="admin-content-card-top"><span>'+esc(typeLabel(l.type))+' • '+esc(gradeLabel(l.stage,l.grade))+'</span><small>'+esc(unit)+'</small></div><h3>'+esc(l.title||'درس')+'</h3>'+
       '<div class="mix-admin-content-meta"><span><i class="fa-solid fa-video"></i> '+videos+' فيديو</span><span><i class="fa-solid fa-list-check"></i> '+questions+' سؤال</span><span><i class="fa-solid fa-chalkboard-user"></i> '+(teachers.length||'—')+' مدرس</span></div>'+
       '<div class="admin-content-teachers">'+(teachers.length?teachers.slice(0,3).map(n=>'<span><i class="fa-solid fa-user"></i> '+esc(n)+'</span>').join(''):'<span class="muted"><i class="fa-solid fa-user"></i> بدون مدرس محدد</span>')+'</div>'+
       (publicationState(l)==='scheduled'?'<p class="admin-content-schedule"><i class="fa-regular fa-clock"></i> النشر '+esc(formatAdminDateTime(l.publishAt))+'</p>':'')+(date?'<p class="admin-content-date"><i class="fa-regular fa-clock"></i> آخر تحديث '+new Date(date).toLocaleDateString('ar-EG')+'</p>':'')+
       '<div class="mix-admin-card-actions"><button class="admin-action-btn success" type="button" data-review-content="lesson|'+l.id+'" title="معاينة ومراجعة الدرس"><i class="fa-solid fa-eye"></i></button><a class="admin-action-btn" href="'+preview+'" target="_blank" rel="noopener" title="فتح المعاينة في تبويب جديد"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button class="admin-action-btn" data-edit-lesson="'+l.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="admin-action-btn '+(l.isHidden?'success':'warning')+'" data-toggle-lesson="'+l.id+'" title="'+(l.isHidden?'نشر الدرس':'إخفاء الدرس')+'"><i class="fa-solid '+(l.isHidden?'fa-eye':'fa-eye-slash')+'"></i></button><button class="admin-action-btn danger" data-delete-lesson="'+l.id+'" title="أرشفة"><i class="fa-solid fa-box-archive"></i></button></div>'+
     '</div></article>';
 }).join(''):empty('لا توجد دروس','غيّر الفلاتر أو أضف أول درس جديد.');
 labelAdminContentActions($('lessonsAdminList'));
 $$('[data-review-content]').forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.reviewContent.split('|');openContentReview(kind,id)});
 $$('[data-edit-lesson]').forEach(b=>b.onclick=()=>editLesson(b.dataset.editLesson));
 $$('[data-toggle-lesson]').forEach(b=>b.onclick=async()=>{const id=b.dataset.toggleLesson,l=root.lessons?.[id],publish=!!l?.isHidden;await db.ref('lessons/'+id).update({isHidden:!publish,workflowStatus:publish?'published':'hidden',publishAt:null,...(publish?{reviewStatus:'approved',reviewedAt:Date.now(),reviewedBy:currentUser?.uid||'',publishedAt:Date.now()}:{})});await writeAudit(publish?'lesson.publish':'lesson.hide','lesson',id)});
 $$('[data-delete-lesson]').forEach(b=>b.onclick=async()=>{const id=b.dataset.deleteLesson;if(await askConfirm({title:'أرشفة الدرس؟',message:'سيختفي من المنصة وينتقل إلى الأرشيف مع اختباراته المرتبطة، ويمكن استرجاعه لاحقًا.',acceptText:'أرشفة الدرس'})){await archiveLessons([id]);toast('تم نقل الدرس إلى الأرشيف')}});
 $$('[data-select-lesson]').forEach(input=>input.onchange=()=>{const id=input.dataset.selectLesson;if(input.checked)selectedLessonIds.add(id);else selectedLessonIds.delete(id);updateBulkSelectionUI('lesson')});
 updateBulkSelectionUI('lesson');
}
async function editLesson(id){
 const l=root.lessons?.[id];if(!l)return;
 editState.lesson=id;
 $('newLessonType').value=l.type||'public';$('newLessonStage').value=l.stage||'primary';fillGrades($('newLessonGrade'),$('newLessonStage').value,l.grade||'1');$('newLessonGrade').value=String(l.grade||'1');fillSubjects($('newLessonSubject'),l.stage||'primary',String(l.grade||'1'),l.type||'public');$('newLessonSubject').value=l.subject||'';
 $('newLessonUnit').value=Number(l.unit||1);$('newLessonTitle').value=l.title||'';$('newLessonContent').value=l.content||'';adminLessonRichEditor?.setContent(l.content||'',l.contentFormat||'auto');$('newLessonImage').value=l.imageUrl||'';$('newLessonImagePosition').value=l.imagePosition||'top';$('newLessonQuestions').value=JSON.stringify(l.questions||[],null,2);if($('newLessonFree'))$('newLessonFree').checked=!!l.isFree;if($('newLessonDraft'))$('newLessonDraft').checked=l.workflowStatus==='draft';$('newLessonHidden').checked=!!l.isHidden&&l.workflowStatus!=='draft';renderLessonVideosEditor(l.videos||[]);renderQuestionBuilder('lesson',l.questions||[]);renderLessonEditorPreview();
 if($('lessonModalTitle'))$('lessonModalTitle').textContent='تعديل الدرس';openModal('lessonModal');
}
async function saveLesson(e){
 e.preventDefault();syncQuestionBuilder('lesson');
 const videos=collectLessonVideos(),existing=editState.lesson?root.lessons?.[editState.lesson]:null;
 let questions=[];
 try{
   questions=JSON.parse($('newLessonQuestions').value.trim()||'[]');
   if(!Array.isArray(questions))throw new Error();
 }catch{return toast('صيغة JSON لأسئلة الدرس غير صحيحة.','error')}
 try{questions=questions.length?window.AcademyUtils.validateQuestions(questions):[]}catch(err){return toast(err.message,'error')}
 const rawImage=$('newLessonImage').value.trim(),imageUrl=rawImage?safeSubjectImageUrl(rawImage):'';
 if(rawImage&&!imageUrl)return toast('رابط صورة الدرس غير صحيح.','error');
 if(videos.some(v=>!window.AcademyUtils.safeUrl(v.url)))return toast('راجع روابط فيديوهات الدرس.','error');
 if(videos.some(v=>v.checkpoints===null))return toast('صيغة JSON للأسئلة التفاعلية داخل أحد الفيديوهات غير صحيحة.','error');
 const targetType=$('newLessonType').value,targetStage=$('newLessonStage').value,targetGrade=$('newLessonGrade').value,targetSubject=$('newLessonSubject').value,targetUnit=Number($('newLessonUnit').value||1);
 const sameSlot=existing&&existing.type===targetType&&existing.stage===targetStage&&String(existing.grade)===String(targetGrade)&&existing.subject===targetSubject&&Number(existing.unit||1)===targetUnit;
 const siblings=values(root.lessons).filter(l=>l.id!==editState.lesson&&l.type===targetType&&l.stage===targetStage&&String(l.grade)===String(targetGrade)&&l.subject===targetSubject&&Number(l.unit||1)===targetUnit);
 const maxOrder=Math.max(0,...siblings.map(lessonAdminSortValue).filter(Number.isFinite));
 const sortOrder=sameSlot&&Number.isFinite(Number(existing?.sortOrder))?Number(existing.sortOrder):maxOrder+1000;
 const isDraft=!!$('newLessonDraft')?.checked,manualHidden=!!$('newLessonHidden')?.checked;const payload={type:targetType,stage:targetStage,grade:targetGrade,subject:targetSubject,unit:targetUnit,sortOrder,title:$('newLessonTitle').value.trim(),content:$('newLessonContent').value.trim(),contentFormat:'html',imageUrl,imagePosition:$('newLessonImagePosition').value,videos,questions,isLocked:existing?.isLocked||false,isFree:!!$('newLessonFree')?.checked,isHidden:isDraft||manualHidden,workflowStatus:isDraft?'draft':manualHidden?'hidden':'published',publishAt:(isDraft||manualHidden)?null:(existing?.publishAt||null),reviewStatus:isDraft?'draft':(existing?.reviewStatus||'approved')};
 if(!payload.title)return toast('اكتب عنوان الدرس.','error');
 if(!videos.length&&!payload.content)return toast('أضف فيديو شرح أو شرحًا مكتوبًا للدرس.','error');
 if(editState.lesson){payload.updatedAt=Date.now();await db.ref('lessons/'+editState.lesson).update(payload);await writeAudit('lesson.update','lesson',editState.lesson,{subject:payload.subject,unit:payload.unit,workflowStatus:payload.workflowStatus});toast('تم تحديث الدرس')}
 else{payload.createdAt=Date.now();const ref=db.ref('lessons').push();await ref.set(payload);await writeAudit('lesson.create','lesson',ref.key,{subject:payload.subject,unit:payload.unit,workflowStatus:payload.workflowStatus});toast(isDraft?'تم حفظ الدرس كمسودة':'تم نشر الدرس')}
 closeModal('lessonModal');resetLessonEditor();
}

/* Quizzes */
function filteredQuizzes(){
 const q=($('quizSearch')?.value||'').trim().toLowerCase(),stage=$('quizFilterStage')?.value||'',type=$('quizFilterType')?.value||'',mode=$('quizFilterMode')?.value||'',status=$('quizFilterStatus')?.value||'';
 return values(root.quizzes).filter(item=>{
   const subject=adminSubjectMeta(item.stage,item.grade,item.type,item.subject),lesson=item.lessonId?root.lessons?.[item.lessonId]:null;
   const hay=((item.name||'')+' '+(item.subject||'')+' '+(subject.name||'')+' '+(lesson?.title||'')).toLowerCase();
   const itemMode=item.lessonId?'lesson':Number(item.unit||0)>0?'unit':'comprehensive';
   return (!q||hay.includes(q))&&(!stage||item.stage===stage)&&(!type||item.type===type)&&(!mode||mode===itemMode)&&(!status||publicationState(item)===status);
 }).sort((a,b)=>(b.createdAt||b.updatedAt||0)-(a.createdAt||a.updatedAt||0));
}
function renderQuizzes(){
 const all=values(root.quizzes),arr=filteredQuizzes();
 if($('adminQuizTotal'))$('adminQuizTotal').textContent=all.length;
 if($('adminQuizPublished'))$('adminQuizPublished').textContent=all.filter(q=>publicationState(q)==='published').length;
 if($('adminQuizLinked'))$('adminQuizLinked').textContent=all.filter(q=>q.lessonId).length;
 if($('adminQuizQuestions'))$('adminQuizQuestions').textContent=all.reduce((sum,q)=>sum+(Array.isArray(q.questions)?q.questions.length:0),0);
 if($('quizResultCount'))$('quizResultCount').textContent=arr.length+' نتيجة';
 $('quizzesAdminList').innerHTML=arr.length?arr.map(q=>{
   const subject=adminSubjectMeta(q.stage,q.grade,q.type,q.subject),image=safeSubjectImageUrl(subject.imageUrl||''),lesson=q.lessonId?root.lessons?.[q.lessonId]:null,questions=Array.isArray(q.questions)?q.questions.length:0;
   const mode=q.lessonId?'مرتبط بدرس':Number(q.unit||0)>0?'اختبار وحدة':'اختبار شامل',preview=quizAdminPreviewUrl(q),teacher=q.teacherId?root.teacherProfiles?.[q.teacherId]?.name||'مدرس':'';
   return '<article class="admin-content-card admin-quiz-content-card '+(publicationState(q)==='draft'?'is-draft ':q.isHidden?'is-hidden ':'is-published ')+(selectedQuizIds.has(q.id)?'selected':'')+'">'+
     '<label class="admin-card-selection" title="تحديد الاختبار"><input type="checkbox" data-select-quiz="'+esc(q.id)+'" '+(selectedQuizIds.has(q.id)?'checked':'')+'><span><i class="fa-solid fa-check"></i></span></label>'+
     '<div class="admin-content-card-art quiz '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+
       (!image?'<span>'+esc(subject.emoji||'🧠')+'</span>':'')+'<div class="admin-content-card-status"><span class="status-pill '+publicationPillClass(q)+'">'+publicationLabel(q)+'</span><span class="status-pill '+(q.isFree?'approved':'info')+'">'+(q.isFree?'مجاني':'اشتراك')+'</span></div><em>'+esc(mode)+'</em>'+
     '</div>'+
     '<div class="admin-content-card-body"><div class="admin-content-card-top"><span>'+esc(typeLabel(q.type))+' • '+esc(gradeLabel(q.stage,q.grade))+'</span><small>'+esc(adminUnitLabel(q))+'</small></div><h3>'+esc(q.name||'اختبار')+'</h3>'+
       '<div class="mix-admin-content-meta"><span><i class="fa-solid fa-list-check"></i> '+questions+' سؤال</span><span><i class="fa-solid fa-book-open"></i> '+esc(subject.name)+'</span>'+(teacher?'<span><i class="fa-solid fa-chalkboard-user"></i> '+esc(teacher)+'</span>':'')+'</div>'+
       (lesson?'<div class="admin-linked-content"><i class="fa-solid fa-link"></i><span>مرتبط بدرس</span><strong>'+esc(lesson.title||'درس')+'</strong></div>':'<div class="admin-linked-content neutral"><i class="fa-solid fa-layer-group"></i><span>'+esc(mode)+'</span></div>')+(publicationState(q)==='scheduled'?'<p class="admin-content-schedule"><i class="fa-regular fa-clock"></i> النشر '+esc(formatAdminDateTime(q.publishAt))+'</p>':'')+
       '<div class="mix-admin-card-actions"><button class="admin-action-btn success" type="button" data-review-content="quiz|'+q.id+'" title="معاينة ومراجعة الاختبار"><i class="fa-solid fa-eye"></i></button><a class="admin-action-btn" href="'+preview+'" target="_blank" rel="noopener" title="فتح المعاينة في تبويب جديد"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button class="admin-action-btn" data-edit-quiz="'+q.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="admin-action-btn '+(q.isHidden?'success':'warning')+'" data-toggle-quiz="'+q.id+'" title="'+(q.isHidden?'نشر الاختبار':'إخفاء الاختبار')+'"><i class="fa-solid '+(q.isHidden?'fa-eye':'fa-eye-slash')+'"></i></button><button class="admin-action-btn danger" data-delete-quiz="'+q.id+'" title="أرشفة"><i class="fa-solid fa-box-archive"></i></button></div>'+
     '</div></article>';
 }).join(''):empty('لا توجد اختبارات','غيّر الفلاتر أو أنشئ أول اختبار.');
 labelAdminContentActions($('quizzesAdminList'));
 $$('[data-review-content]').forEach(b=>b.onclick=()=>{const [kind,id]=b.dataset.reviewContent.split('|');openContentReview(kind,id)});
 $$('[data-edit-quiz]').forEach(b=>b.onclick=()=>editQuiz(b.dataset.editQuiz));
 $$('[data-toggle-quiz]').forEach(b=>b.onclick=async()=>{const id=b.dataset.toggleQuiz,q=root.quizzes?.[id],publish=!!q?.isHidden,ts=Date.now(),updates={};updates['quizzes/'+id]={...q,isHidden:!publish,workflowStatus:publish?'published':'hidden',publishAt:null,updatedAt:ts,...(publish?{reviewStatus:'approved',reviewedAt:ts,reviewedBy:currentUser?.uid||'',publishedAt:ts}:{})};(Array.isArray(q?.questions)?q.questions:[]).forEach((_,i)=>updates['questionBankV4/quiz-'+id+'-'+i+'/status']=publish?'approved':'hidden');await db.ref().update(updates);await writeAudit(publish?'quiz.publish':'quiz.hide','quiz',id)});
 $$('[data-delete-quiz]').forEach(b=>b.onclick=async()=>{const id=b.dataset.deleteQuiz;if(await askConfirm({title:'أرشفة الاختبار؟',message:'سيختفي الاختبار من المنصة وينتقل إلى الأرشيف ويمكن استرجاعه لاحقًا.',acceptText:'أرشفة الاختبار'})){await archiveQuizzes([id]);toast('تم نقل الاختبار إلى الأرشيف')}});
 $$('[data-select-quiz]').forEach(input=>input.onchange=()=>{const id=input.dataset.selectQuiz;if(input.checked)selectedQuizIds.add(id);else selectedQuizIds.delete(id);updateBulkSelectionUI('quiz')});
 updateBulkSelectionUI('quiz');
}
function resetQuizEditor(){
 editState.quiz=null;$('quizForm').reset();if($('newQuizFree'))$('newQuizFree').checked=false;if($('newQuizDraft'))$('newQuizDraft').checked=false;fillGrades($('newQuizGrade'),$('newQuizStage').value);fillSubjects($('newQuizSubject'),$('newQuizStage').value,$('newQuizGrade').value,$('newQuizType').value);$('newQuizQuestions').value='[]';if($('newQuizHidden'))$('newQuizHidden').checked=false;if($('newQuizDuration'))$('newQuizDuration').value=0;renderQuestionBuilder('quiz',[]);renderQuizEditorPreview();if($('quizModalTitle'))$('quizModalTitle').textContent='إنشاء اختبار';
}
function editQuiz(id){
 const q=root.quizzes?.[id];if(!q)return;editState.quiz=id;
 $('newQuizType').value=q.type||'public';$('newQuizStage').value=q.stage||'primary';fillGrades($('newQuizGrade'),q.stage||'primary',q.grade||'1');$('newQuizGrade').value=String(q.grade||'1');fillSubjects($('newQuizSubject'),q.stage||'primary',String(q.grade||'1'),q.type||'public');$('newQuizSubject').value=q.subject||'';$('newQuizUnit').value=Number(q.unit||0);$('newQuizName').value=q.name||'';if($('newQuizDuration'))$('newQuizDuration').value=Number(q.durationMinutes||0);$('newQuizQuestions').value=JSON.stringify(q.questions||[],null,2);if($('newQuizFree'))$('newQuizFree').checked=!!q.isFree;if($('newQuizDraft'))$('newQuizDraft').checked=q.workflowStatus==='draft';if($('newQuizHidden'))$('newQuizHidden').checked=!!q.isHidden&&q.workflowStatus!=='draft';renderQuestionBuilder('quiz',q.questions||[]);renderQuizEditorPreview();if($('quizModalTitle'))$('quizModalTitle').textContent='تعديل الاختبار';openModal('quizModal');
}
async function saveQuiz(e){
 e.preventDefault();syncQuestionBuilder('quiz');let questions=[];
 try{questions=JSON.parse($('newQuizQuestions').value.trim()||'[]');if(!Array.isArray(questions))throw new Error()}catch{return toast('صيغة JSON للأسئلة غير صحيحة.','error')}
 try{questions=window.AcademyUtils.validateQuestions(questions)}catch(err){return toast(err.message,'error')}
 if(!questions.length)return toast('أضف سؤالًا صحيحًا واحدًا على الأقل.','error');
 const existing=editState.quiz?root.quizzes?.[editState.quiz]:null;
 const isDraft=!!$('newQuizDraft')?.checked,manualHidden=!!$('newQuizHidden')?.checked;const payload={type:$('newQuizType').value,stage:$('newQuizStage').value,grade:$('newQuizGrade').value,subject:$('newQuizSubject').value,unit:Number($('newQuizUnit').value||0),name:$('newQuizName').value.trim(),durationMinutes:Math.max(0,Number($('newQuizDuration')?.value||0)),questions,isFree:!!$('newQuizFree')?.checked,isHidden:isDraft||manualHidden,workflowStatus:isDraft?'draft':manualHidden?'hidden':'published',publishAt:(isDraft||manualHidden)?null:(existing?.publishAt||null),reviewStatus:isDraft?'draft':(existing?.reviewStatus||'approved')};
 if(!payload.name)return toast('اكتب اسم الاختبار.','error');
 if(existing?.lessonId){payload.lessonId=existing.lessonId;payload.teacherId=existing.teacherId||'';payload.teacherSubmissionId=existing.teacherSubmissionId||''}
 const quizId=editState.quiz||db.ref('quizzes').push().key,now=Date.now(),updates={};
 payload[editState.quiz?'updatedAt':'createdAt']=now;updates['quizzes/'+quizId]=editState.quiz?{...existing,...payload}:payload;
 questions.forEach((q,qi)=>{
   const bankId='quiz-'+quizId+'-'+qi;
   updates['questionBankV4/'+bankId]={id:bankId,question:q.text,options:q.opts,correctAnswer:Number(q.correctAnswer),explanation:q.explanation||'',skill:q.skill||'',difficulty:Number(q.difficulty||2),type:payload.type,stage:payload.stage,grade:String(payload.grade),subject:payload.subject,unit:Number(payload.unit||0),lessonId:payload.lessonId||'',sourceQuizId:quizId,authorUid:currentUser?.uid||'',authorRole:'admin',status:quizQuestionBankStatus(payload,now),createdAt:now,updatedAt:now};
 });
 const oldCount=Array.isArray(existing?.questions)?existing.questions.length:0;
 for(let qi=questions.length;qi<oldCount;qi++)updates['questionBankV4/quiz-'+quizId+'-'+qi]=null;
 await db.ref().update(updates);
 await writeAudit(editState.quiz?'quiz.update':'quiz.create','quiz',quizId,{questionCount:questions.length,subject:payload.subject});
 toast(editState.quiz?'تم تحديث الاختبار وبنك الأسئلة':isDraft?'تم حفظ الاختبار كمسودة':'تم حفظ الاختبار وإضافة أسئلته للبنك');
 closeModal('quizModal');resetQuizEditor();
}

/* Simulations */
function renderSimulations(){
 const arr=values(root.simulations).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 $('simulationsAdminGrid').innerHTML=arr.length?arr.map(s=>{
   const total=Object.values(s.counts||{}).reduce((a,n)=>a+Number(n||0),0);
   return '<article class="admin-subject-card"><span class="section-kicker">'+esc(typeLabel(s.type))+' • '+esc(gradeLabel(s.stage,s.grade))+'</span><div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><span class="status-pill '+(s.isFree?'approved':'info')+'">'+(s.isFree?'مجاني':'اشتراك')+'</span></div><h3>⏱️ '+esc(s.name||'محاكي')+'</h3><p>'+Number(s.time||60)+' دقيقة • '+total+' سؤال</p><div class="admin-unit-tags"><span>عربي '+Number(s.counts?.ar||0)+'</span><span>رياضيات '+Number(s.counts?.ma||0)+'</span><span>علوم '+Number(s.counts?.sc||0)+'</span><span>إنجليزي '+Number(s.counts?.en||0)+'</span></div><div class="admin-action-row" style="margin-top:12px"><button class="admin-action-btn" data-edit-sim="'+s.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="admin-action-btn '+(s.isHidden?'success':'')+'" data-toggle-sim="'+s.id+'" title="إظهار/إخفاء"><i class="fa-solid fa-eye"></i></button><button class="admin-action-btn danger" data-delete-sim="'+s.id+'" title="حذف"><i class="fa-solid fa-trash"></i></button></div></article>';
 }).join(''):empty('لا توجد محاكيات','أنشئ أول محاكي لطلابك.');
 $$('[data-edit-sim]').forEach(b=>b.onclick=()=>editSimulation(b.dataset.editSim));
 $$('[data-toggle-sim]').forEach(b=>b.onclick=()=>db.ref('simulations/'+b.dataset.toggleSim+'/isHidden').set(!root.simulations?.[b.dataset.toggleSim]?.isHidden));
 $$('[data-delete-sim]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف المحاكي؟',message:'سيتم حذف إعدادات هذا المحاكي من المنصة.',tone:'danger',acceptText:'حذف المحاكي'}))await db.ref('simulations/'+b.dataset.deleteSim).remove()});
}
function resetSimulationEditor(){editState.simulation=null;$('simulationForm').reset();if($('simFree'))$('simFree').checked=false;$('simTime').value=60;['simAr','simMa','simSc','simEn'].forEach(id=>$(id).value=5);fillGrades($('simGrade'),$('simStage').value);if($('simulationModalTitle'))$('simulationModalTitle').textContent='إنشاء محاكي جديد'}
function editSimulation(id){
 const s=root.simulations?.[id];if(!s)return;editState.simulation=id;
 $('simName').value=s.name||'';$('simType').value=s.type||'public';$('simStage').value=s.stage||'primary';fillGrades($('simGrade'),s.stage||'primary',s.grade||'1');$('simGrade').value=String(s.grade||'1');$('simTime').value=Number(s.time||60);$('simAr').value=Number(s.counts?.ar||0);$('simMa').value=Number(s.counts?.ma||0);$('simSc').value=Number(s.counts?.sc||0);$('simEn').value=Number(s.counts?.en||0);if($('simFree'))$('simFree').checked=!!s.isFree;$('simHidden').checked=!!s.isHidden;if($('simulationModalTitle'))$('simulationModalTitle').textContent='تعديل المحاكي';openModal('simulationModal');
}
async function saveSimulation(e){
 e.preventDefault();
 const counts={ar:Number($('simAr').value||0),ma:Number($('simMa').value||0),sc:Number($('simSc').value||0),en:Number($('simEn').value||0)};
 if(Object.values(counts).reduce((a,n)=>a+n,0)<=0)return toast('حدد سؤالًا واحدًا على الأقل.','error');
 const payload={name:$('simName').value.trim(),type:$('simType').value,stage:$('simStage').value,grade:$('simGrade').value,time:Number($('simTime').value||60),counts,isLocked:false,isFree:!!$('simFree')?.checked,isHidden:$('simHidden').checked};
 if(editState.simulation){payload.updatedAt=Date.now();await db.ref('simulations/'+editState.simulation).update(payload);toast('تم تحديث المحاكي')}else{payload.createdAt=Date.now();await db.ref('simulations').push(payload);toast('تم حفظ المحاكي')}
 closeModal('simulationModal');resetSimulationEditor();
}

/* Files */
function fileKindLabel(kind){return kind==='note'?'مذكرة':kind==='review'?'مراجعة':kind==='reference'?'مرجع':'PDF'}
function fileKindIcon(kind){return kind==='note'?'fa-note-sticky':kind==='review'?'fa-list-check':kind==='reference'?'fa-book':'fa-file-pdf'}
function refreshFileLessons(keep){
 const select=$('newFileLesson');if(!select)return;
 const type=$('newFileType')?.value||'public',stage=$('newFileStage')?.value||'primary',grade=$('newFileGrade')?.value||'1',subject=$('newFileSubject')?.value||'';
 const current=keep!==undefined?String(keep||''):select.value;
 const rows=values(root.lessons).filter(l=>l.type===type&&l.stage===stage&&String(l.grade)===String(grade)&&(!subject||l.subject===subject)).sort((a,b)=>Number(a.unit||1)-Number(b.unit||1)||String(a.title||'').localeCompare(String(b.title||''),'ar'));
 select.innerHTML='<option value="">بدون ربط بدرس</option>'+rows.map(l=>'<option value="'+esc(l.id)+'">'+esc((l.title||'درس')+' • '+adminUnitLabel(l))+'</option>').join('');
 if(rows.some(l=>String(l.id)===current))select.value=current;
}
function renderFiles(){
 const arr=values(root.files).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 $('filesAdminGrid').innerHTML=arr.length?arr.map(f=>{
   const subject=adminSubjectMeta(f.stage,f.grade,f.type,f.subject),lesson=f.lessonId?root.lessons?.[f.lessonId]:null,kind=f.kind||'pdf';
   return '<article class="admin-file-card '+(f.isFeatured?'featured':'')+'"><i class="fa-solid '+fileKindIcon(kind)+'"></i><div><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:3px"><span class="status-pill info">'+esc(fileKindLabel(kind))+'</span>'+(f.isFeatured?'<span class="status-pill pending">مهم</span>':'')+(f.isFree?'<span class="status-pill approved">مجاني</span>':'<span class="status-pill info">اشتراك</span>')+'</div><strong>'+esc(f.title||'ملف')+'</strong><small>'+esc(gradeLabel(f.stage,f.grade))+' • '+esc(subject.name||f.subject||'')+(lesson?' • مرتبط: '+esc(lesson.title||'درس'):'')+'</small>'+(f.description?'<p style="margin:4px 0 0;font-size:7px;color:#64748b">'+esc(String(f.description).slice(0,130))+'</p>':'')+'</div><div class="admin-action-row"><button class="admin-action-btn" data-edit-file="'+f.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><a class="admin-action-btn success" href="'+cleanUrl(f.url)+'" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button class="admin-action-btn danger" data-delete-file="'+f.id+'"><i class="fa-solid fa-trash"></i></button></div></article>';
 }).join(''):empty('لا توجد ملفات','أضف ملفات أو مذكرات للمادة.');
 $$('[data-edit-file]').forEach(b=>b.onclick=()=>editFile(b.dataset.editFile));
 $$('[data-delete-file]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف الملف؟',message:'سيتم إزالة الملف من مكتبة المنصة.',tone:'danger',acceptText:'حذف الملف'}))await db.ref('files/'+b.dataset.deleteFile).remove()});
}
function resetFileEditor(){
 editState.file=null;$('fileForm').reset();$('newFileKind').value='pdf';$('newFileFeatured').checked=false;if($('newFileFree'))$('newFileFree').checked=false;
 fillGrades($('newFileGrade'),$('newFileStage').value);fillSubjects($('newFileSubject'),$('newFileStage').value,$('newFileGrade').value,$('newFileType').value);refreshFileLessons('');
 if($('fileModalTitle'))$('fileModalTitle').textContent='إضافة ملف';
}
function editFile(id){
 const f=root.files?.[id];if(!f)return;editState.file=id;
 $('newFileTitle').value=f.title||'';$('newFileUrl').value=f.url||'';$('newFileKind').value=f.kind||'pdf';$('newFileDescription').value=f.description||'';$('newFileFeatured').checked=!!f.isFeatured;if($('newFileFree'))$('newFileFree').checked=!!f.isFree;
 $('newFileType').value=f.type||'public';$('newFileStage').value=f.stage||'primary';fillGrades($('newFileGrade'),f.stage||'primary',f.grade||'1');$('newFileGrade').value=String(f.grade||'1');fillSubjects($('newFileSubject'),f.stage||'primary',String(f.grade||'1'),f.type||'public');$('newFileSubject').value=f.subject||'';refreshFileLessons(f.lessonId||'');
 if($('fileModalTitle'))$('fileModalTitle').textContent='تعديل الملف';openModal('fileModal');
}
async function saveFile(e){
 e.preventDefault();
 const rawUrl=$('newFileUrl').value.trim();if(cleanUrl(rawUrl)==='#')return toast('رابط الملف غير صالح.','error');
 const lessonId=$('newFileLesson')?.value||'',lesson=lessonId?root.lessons?.[lessonId]:null;
 const payload={title:$('newFileTitle').value.trim(),url:rawUrl,kind:$('newFileKind')?.value||'pdf',description:$('newFileDescription')?.value.trim()||'',isFeatured:!!$('newFileFeatured')?.checked,isFree:!!$('newFileFree')?.checked,type:$('newFileType').value,stage:$('newFileStage').value,grade:$('newFileGrade').value,subject:$('newFileSubject').value,lessonId,lessonTitle:lesson?.title||''};
 if(!payload.title)return toast('أدخل عنوان الملف.','error');
 if(editState.file){payload.updatedAt=Date.now();await db.ref('files/'+editState.file).update(payload);toast('تم تحديث الملف')}else{payload.createdAt=Date.now();await db.ref('files').push(payload);toast('تمت إضافة الملف')}
 closeModal('fileModal');resetFileEditor();
}

/* Live Sessions */
function renderLiveSessions(){
 const arr=values(root.liveSessions).sort((a,b)=>(b.scheduledTime||0)-(a.scheduledTime||0));
 $('liveAdminGrid').innerHTML=arr.length?arr.map(s=>{
   const cls=s.status==='live'?'rejected':s.status==='upcoming'?'info':'approved';
   const label=s.status==='live'?'مباشر':s.status==='upcoming'?'قادم':'منتهي';
   const target=[s.type?typeLabel(s.type):'كل الأنواع',s.stage?(stageNames[s.stage]||s.stage):'كل المراحل',s.grade?'صف '+esc(s.grade):'كل الصفوف',s.subjectName||s.subject||'كل المواد'].join(' • ');
   return '<article class="admin-subject-card"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="status-pill '+cls+'">'+label+'</span>'+(s.recordingUrl?'<span class="status-pill approved">إعادة متاحة</span>':'')+'<span class="status-pill '+(s.isFree?'approved':'info')+'">'+(s.isFree?'مجاني':'اشتراك')+'</span></div><h3 style="margin-top:10px">📡 '+esc(s.title||'جلسة')+'</h3><p>👨‍🏫 '+esc(s.teacher||'غير محدد')+' • ⏱️ '+Number(s.duration||60)+' دقيقة</p><p>'+esc(target)+'</p><p>'+(s.scheduledTime?new Date(s.scheduledTime).toLocaleString('ar-EG'):'موعد غير محدد')+'</p><div class="admin-action-row" style="margin-top:12px"><button class="admin-action-btn" data-edit-live="'+s.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><a class="admin-action-btn success" href="'+cleanUrl(s.recordingUrl||s.youtubeLiveUrl||s.zoomLink||'#')+'" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><button class="admin-action-btn danger" data-delete-live="'+s.id+'"><i class="fa-solid fa-trash"></i></button></div></article>';
 }).join(''):empty('لا توجد جلسات','أضف أول بث مباشر أو جلسة قادمة.');
 $$('[data-edit-live]').forEach(b=>b.onclick=()=>editLiveSession(b.dataset.editLive));
 $$('[data-delete-live]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف الجلسة؟',message:'سيتم حذف موعد البث أو الجلسة من جداول الطلاب.',tone:'danger',acceptText:'حذف الجلسة'}))await db.ref('liveSessions/'+b.dataset.deleteLive).remove()});
}
function toLocalDateTimeInput(ts){if(!ts)return'';const d=new Date(Number(ts));return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function refreshLiveTargets(keep={}){
 const type=$('liveType')?.value||keep.type||'',stage=$('liveStage')?.value||keep.stage||'',gradeEl=$('liveGrade'),subjectEl=$('liveSubject');
 if(!gradeEl||!subjectEl)return;
 const keepGrade=keep.grade!==undefined?String(keep.grade||''):gradeEl.value;
 if(stage){
   const max=gradeCount(stage);gradeEl.innerHTML='<option value="">كل الصفوف</option>'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">'+gradeLabel(stage,i+1)+'</option>').join('');
   if(keepGrade&&Number(keepGrade)<=max)gradeEl.value=keepGrade;
 }else gradeEl.innerHTML='<option value="">كل الصفوف</option>';
 const grade=gradeEl.value,keepSubject=keep.subject!==undefined?String(keep.subject||''):subjectEl.value;
 if(type&&stage&&grade){
   const list=subjectsFor(stage,grade,type);subjectEl.innerHTML='<option value="">كل المواد</option>'+list.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
   if(list.some(s=>String(s.id)===keepSubject))subjectEl.value=keepSubject;
 }else subjectEl.innerHTML='<option value="">كل المواد</option>';
}
function bindLiveTargets(){
 if($('liveType'))$('liveType').onchange=()=>refreshLiveTargets();
 if($('liveStage'))$('liveStage').onchange=()=>refreshLiveTargets();
 if($('liveGrade'))$('liveGrade').onchange=()=>refreshLiveTargets();
}
function resetLiveEditor(){
 editState.live=null;$('liveForm').reset();if($('liveFree'))$('liveFree').checked=false;$('liveDuration').value=60;$('liveStatus').value='upcoming';
 if($('liveType'))$('liveType').value='';if($('liveStage'))$('liveStage').value='';refreshLiveTargets();bindLiveTargets();
 if($('liveModalTitle'))$('liveModalTitle').textContent='إضافة جلسة بث'
}
function editLiveSession(id){
 const s=root.liveSessions?.[id];if(!s)return;editState.live=id;
 $('liveTitle').value=s.title||'';$('liveTeacher').value=s.teacher||'';$('liveStatus').value=s.status||'upcoming';$('liveTime').value=toLocalDateTimeInput(s.scheduledTime);$('liveDuration').value=Number(s.duration||60);$('liveYoutube').value=s.youtubeLiveUrl||'';$('liveZoom').value=s.zoomLink||'';if($('liveRecording'))$('liveRecording').value=s.recordingUrl||'';if($('liveFree'))$('liveFree').checked=!!s.isFree;
 if($('liveType'))$('liveType').value=s.type||'';if($('liveStage'))$('liveStage').value=s.stage||'';refreshLiveTargets({type:s.type||'',stage:s.stage||'',grade:s.grade||'',subject:s.subject||''});bindLiveTargets();
 if($('liveModalTitle'))$('liveModalTitle').textContent='تعديل جلسة البث';openModal('liveModal');
}
async function saveLiveSession(e){
 e.preventDefault();
 const subject=$('liveSubject')?.value||'',subjectName=$('liveSubject')?.selectedOptions?.[0]?.textContent||'';
 const payload={
   title:$('liveTitle').value.trim(),teacher:$('liveTeacher').value.trim()||'غير محدد',
   type:$('liveType')?.value||'',stage:$('liveStage')?.value||'',grade:$('liveGrade')?.value||'',subject,subjectName:subject?subjectName:'',
   status:$('liveStatus').value,scheduledTime:$('liveTime').value?new Date($('liveTime').value).getTime():Date.now(),duration:Number($('liveDuration').value||60),
   youtubeLiveUrl:$('liveYoutube').value.trim(),zoomLink:$('liveZoom').value.trim(),recordingUrl:$('liveRecording')?.value.trim()||'',isFree:!!$('liveFree')?.checked
 };
 if(!payload.title)return toast('أدخل عنوان الجلسة.','error');
 for(const [label,url] of [['YouTube',payload.youtubeLiveUrl],['Zoom',payload.zoomLink],['الإعادة',payload.recordingUrl]])if(url&&cleanUrl(url)==='#')return toast('رابط '+label+' غير صالح.','error');
 if(editState.live){payload.updatedAt=Date.now();await db.ref('liveSessions/'+editState.live).update(payload);toast('تم تحديث الجلسة')}else{payload.createdAt=Date.now();await db.ref('liveSessions').push(payload);toast('تم حفظ الجلسة')}
 closeModal('liveModal');resetLiveEditor();
}

/* Weekly schedule */
const scheduleDayNames={0:'الأحد',1:'الاثنين',2:'الثلاثاء',3:'الأربعاء',4:'الخميس',5:'الجمعة',6:'السبت'};
function renderScheduleEvents(){
 const list=values(root.scheduleEvents).sort((a,b)=>Number(a.dayOfWeek||0)-Number(b.dayOfWeek||0)||String(a.time||'').localeCompare(String(b.time||'')));
 const el=$('scheduleAdminList');if(!el)return;
 el.innerHTML=list.length?list.map(e=>{
   const status=e.isActive===false?'موقوفة':'نشطة';
   return '<div class="admin-list-item"><div><strong>'+esc(e.title||'حصة')+'</strong><small>'+esc(typeLabel(e.type))+' • '+esc(gradeLabel(e.stage,e.grade))+' • '+esc(e.subjectName||e.subject||'')+'</small><small>'+esc(scheduleDayNames[Number(e.dayOfWeek)]||'')+' • '+esc(e.time||'')+' • '+Number(e.duration||60)+' دقيقة • '+esc(e.teacher||'بدون مدرس')+'</small></div><div class="admin-action-row"><button class="admin-action-btn" data-edit-schedule="'+e.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="admin-action-btn '+(e.isActive===false?'success':'')+'" data-toggle-schedule="'+e.id+'" title="تفعيل/إيقاف"><i class="fa-solid '+(e.isActive===false?'fa-play':'fa-pause')+'"></i></button><button class="admin-action-btn danger" data-delete-schedule="'+e.id+'" title="حذف"><i class="fa-solid fa-trash"></i></button></div></div>';
 }).join(''):empty('لا توجد حصص أسبوعية','أضف أول حصة من النموذج.');
 $$('[data-edit-schedule]').forEach(b=>b.onclick=()=>editScheduleEvent(b.dataset.editSchedule));
 $$('[data-toggle-schedule]').forEach(b=>b.onclick=()=>db.ref('scheduleEvents/'+b.dataset.toggleSchedule+'/isActive').set(root.scheduleEvents?.[b.dataset.toggleSchedule]?.isActive===false));
 $$('[data-delete-schedule]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف الحصة؟',message:'سيختفي هذا الموعد من جداول الطلاب المستهدفين.',tone:'danger',acceptText:'حذف الحصة'}))await db.ref('scheduleEvents/'+b.dataset.deleteSchedule).remove()});
}
function resetScheduleEditor(){
 editState.schedule=null;$('scheduleEventForm')?.reset();
 if($('scheduleTime'))$('scheduleTime').value='18:00';
 if($('scheduleDuration'))$('scheduleDuration').value=60;
 if($('scheduleActive'))$('scheduleActive').checked=true;
 fillGrades($('scheduleGrade'),$('scheduleStage')?.value||'primary');
 fillSubjects($('scheduleSubject'),$('scheduleStage')?.value||'primary',$('scheduleGrade')?.value||'1',$('scheduleType')?.value||'public');
}
function editScheduleEvent(id){
 const e=root.scheduleEvents?.[id];if(!e)return;editState.schedule=id;
 $('scheduleType').value=e.type||'public';$('scheduleStage').value=e.stage||'primary';
 fillGrades($('scheduleGrade'),e.stage||'primary',e.grade||'1');$('scheduleGrade').value=String(e.grade||1);
 fillSubjects($('scheduleSubject'),e.stage||'primary',String(e.grade||1),e.type||'public');$('scheduleSubject').value=e.subject||'';
 $('scheduleTitle').value=e.title||'';$('scheduleTeacher').value=e.teacher||'';$('scheduleDay').value=String(e.dayOfWeek??6);
 $('scheduleTime').value=e.time||'18:00';$('scheduleDuration').value=Number(e.duration||60);$('scheduleUrl').value=e.url||'';$('scheduleActive').checked=e.isActive!==false;
 $('scheduleTitle').focus();window.scrollTo({top:0,behavior:'smooth'});
}
async function saveScheduleEvent(e){
 e.preventDefault();
 const subject=$('scheduleSubject').value,subjectName=$('scheduleSubject').selectedOptions[0]?.textContent||subject;
 const payload={type:$('scheduleType').value,stage:$('scheduleStage').value,grade:$('scheduleGrade').value,subject,subjectName,title:$('scheduleTitle').value.trim(),teacher:$('scheduleTeacher').value.trim(),dayOfWeek:Number($('scheduleDay').value),time:$('scheduleTime').value,duration:Number($('scheduleDuration').value||60),url:$('scheduleUrl').value.trim(),isActive:$('scheduleActive').checked};
 if(!payload.title||!payload.time)return toast('أكمل عنوان الحصة والوقت.','error');
 if(editState.schedule){payload.updatedAt=Date.now();await db.ref('scheduleEvents/'+editState.schedule).update(payload);toast('تم تحديث موعد الحصة')}
 else{payload.createdAt=Date.now();await db.ref('scheduleEvents').push(payload);toast('تمت إضافة الحصة للجدول')}
 resetScheduleEditor();
}

/* Community */
function communityReportCount(){
 return Object.values(root.community?.forums||{}).reduce((n,p)=>n+Object.keys(p?.reports||{}).length,0);
}
function updateCommunityBadge(){
 const n=communityReportCount(),b=$('communityReportBadge');if(!b)return;b.textContent=n;b.classList.toggle('hidden',!n);
}
function renderCommunityAdmin(){
 const posts=Object.entries(root.community?.forums||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const groups=Object.entries(root.community?.studyGroups||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 $('communityPostsAdminList').innerHTML=posts.length?posts.map(p=>{
   const reports=Object.keys(p.reports||{}).length,likes=Object.keys(p.likesBy||{}).length;
   return '<div class="admin-list-item"><div><strong>'+esc(p.title||'منشور')+'</strong><small>'+esc(p.author||'طالب')+' • ❤️ '+likes+' • 🚩 '+reports+'</small><p style="font-size:9px;color:#64748b;margin:5px 0 0">'+esc((p.content||'').slice(0,140))+'</p></div><div class="admin-action-row">'+(reports?'<button class="admin-action-btn success" data-clear-reports="'+p.id+'" title="تصفير البلاغات"><i class="fa-solid fa-check"></i></button>':'')+'<button class="admin-action-btn danger" data-delete-post="'+p.id+'" title="حذف المنشور"><i class="fa-solid fa-trash"></i></button></div></div>';
 }).join(''):empty('لا توجد منشورات','المجتمع هادئ حتى الآن.');
 $('communityGroupsAdminList').innerHTML=groups.length?groups.map(g=>'<div class="admin-list-item"><div><strong>'+esc(g.name||'مجموعة')+'</strong><small>'+Object.keys(g.members||{}).length+' عضو • '+esc(g.subjectName||'كل المواد')+'</small></div><button class="admin-action-btn danger" data-delete-group="'+g.id+'"><i class="fa-solid fa-trash"></i></button></div>').join(''):empty('لا توجد مجموعات','أنشئ مجموعة دراسة من النموذج أعلاه.');
 $$('[data-delete-post]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف المنشور؟',message:'سيتم حذف المنشور من مجتمع الطلاب نهائيًا.',tone:'danger',acceptText:'حذف المنشور'}))await db.ref('community/forums/'+b.dataset.deletePost).remove()});
 $$('[data-clear-reports]').forEach(b=>b.onclick=()=>db.ref('community/forums/'+b.dataset.clearReports+'/reports').remove());
 $$('[data-delete-group]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف مجموعة الدراسة؟',message:'سيتم حذف المجموعة وإزالتها من قائمة الطلاب.',tone:'danger',acceptText:'حذف المجموعة'}))await db.ref('community/studyGroups/'+b.dataset.deleteGroup).remove()});
 updateCommunityBadge();
}
async function saveStudyGroup(e){
 e.preventDefault();const name=$('studyGroupName').value.trim();if(!name)return;
 const payload={name,stage:$('studyGroupStage').value||'',subjectName:$('studyGroupSubject').value.trim(),members:{},createdBy:'admin',createdAt:Date.now()};
 await db.ref('community/studyGroups').push(payload);e.target.reset();toast('تم إنشاء مجموعة الدراسة');
}

/* Teachers */
function assignmentsOf(t){return Array.isArray(t?.assignments)?t.assignments:Object.values(t?.assignments||{})}
async function createTeacherAccount(event){
 event.preventDefault();
 const form=event.currentTarget,button=$('createTeacherBtn'),status=$('createTeacherStatus');
 const name=$('newTeacherName').value.trim(),email=$('newTeacherEmail').value.trim().toLowerCase(),password=$('newTeacherPassword').value,role=$('newTeacherRole')?.value||'teacher';
 if(!name||!email||password.length<8){status.textContent='أكمل اسم المدرس والبريد وكلمة مرور من 8 أحرف على الأقل.';status.classList.add('error');return}
 if(!currentUser||!(await verifyAdmin(currentUser))){status.textContent='انتهت صلاحية الإدارة. سجّل الدخول من جديد.';status.classList.add('error');return}
 button.disabled=true;status.textContent='جاري إنشاء حساب المدرس...';status.classList.remove('error');
 try{
   const created=await AcademyBackend.adminCreateUser({email,password,displayName:name,role:'teacher'});
   const uid=created.user.uid;
   await db.ref('teacherProfiles/'+uid).set({name,email,role,isActive:true,createdAt:Date.now(),assignments:[]});
   form.reset();
   status.textContent='تم إنشاء حساب '+name+' بنجاح. اسند له المادة والصف من القائمة أدناه، ثم أعطه بيانات الدخول بشكل خاص.';
   toast('تم إنشاء حساب المدرس.');
 }catch(err){
   console.error('Teacher account creation failed:',err);status.classList.add('error');
   status.textContent=err.code==='auth/email-already-in-use'?'البريد مستخدم بالفعل.':'تعذر إنشاء حساب المدرس على خادم الأكاديمية.';
 }finally{$('newTeacherPassword').value='';button.disabled=false}
}
const publicProfileFields=['name','title','photoUrl','coverUrl','bio','qualifications','experience','teachingStyle'];
function cleanPublicProfile(raw={}){
 const limits={name:80,title:100,photoUrl:500,coverUrl:500,bio:1200,qualifications:200,experience:200,teachingStyle:450},out={};
 publicProfileFields.forEach(key=>out[key]=String(raw[key]||'').trim().slice(0,limits[key]));
 out.photoUrl=out.photoUrl&&cleanUrl(out.photoUrl)!=='#'?out.photoUrl:'';
 out.coverUrl=out.coverUrl&&cleanUrl(out.coverUrl)!=='#'?out.coverUrl:'';
 return out;
}
function fillTeacherProfileEditor(){
 const uid=$('profileTeacherId').value,t=root.teacherProfiles?.[uid]||{},p=root.settings?.publicTeachers?.[uid]||{};
 const fields={Name:p.name||t.name||'',Title:p.title||'',Photo:p.photoUrl||'',Cover:p.coverUrl||'',Bio:p.bio||'',Qualifications:p.qualifications||'',Experience:p.experience||'',Style:p.teachingStyle||''};
 Object.entries(fields).forEach(([key,value])=>{$('profileTeacher'+key).value=value});
}
async function saveTeacherProfile(e){
 e.preventDefault();const uid=$('profileTeacherId').value,t=root.teacherProfiles?.[uid];
 if(!t||t.isActive===false)return toast('اختر مدرسًا نشطًا أولًا.','error');
 const raw={name:$('profileTeacherName').value,title:$('profileTeacherTitle').value,photoUrl:$('profileTeacherPhoto').value,coverUrl:$('profileTeacherCover').value,bio:$('profileTeacherBio').value,qualifications:$('profileTeacherQualifications').value,experience:$('profileTeacherExperience').value,teachingStyle:$('profileTeacherStyle').value};
 const profile=cleanPublicProfile(raw);if(!profile.name||!profile.title)return toast('الاسم والتخصص مطلوبان.','error');
 if(raw.photoUrl.trim()&&!profile.photoUrl)return toast('رابط الصورة يجب أن يبدأ بـ https:// أو http://.','error');
 if(raw.coverUrl.trim()&&!profile.coverUrl)return toast('رابط الغلاف يجب أن يبدأ بـ https:// أو http://.','error');
 try{await db.ref('settings/publicTeachers/'+uid).set({...profile,active:true,updatedAt:Date.now()});toast('تم نشر ملف المدرس للطلاب')}catch(err){console.error(err);toast('تعذر حفظ ملف المدرس.','error')}
}
async function reviewTeacherProfile(key,approved){
 const [uid,id]=key.split('|'),s=root.teacherSubmissions?.[uid]?.[id],t=root.teacherProfiles?.[uid];
 if(!s||s.type!=='profile'||s.status!=='pending')return;
 if(approved&&(!t||t.isActive===false))return toast('المدرس غير نشط؛ لا يمكن نشر ملفه.','error');
 try{
   if(approved){const profile=cleanPublicProfile(s.profile);if(!profile.name||!profile.title)throw Error('بيانات الملف غير مكتملة');await db.ref('settings/publicTeachers/'+uid).set({...profile,active:true,updatedAt:Date.now()})}
   await db.ref('teacherSubmissions/'+uid+'/'+id).update({status:approved?'approved':'rejected',reviewedAt:Date.now()});
   await writeAudit(approved?'teacher_profile.approve':'teacher_profile.reject','teacherSubmission',id,{teacherUid:uid});
   toast(approved?'تم اعتماد الملف ونشره':'تم رفض طلب التعديل');
 }catch(err){console.error(err);toast('تعذر مراجعة الطلب.','error')}
}
function renderTeachers(){
 const teachers=values(root.teacherProfiles),students=values(root.studentProfilesV3),all=flattenSubmissions(),subs=all.filter(s=>s.type!=='profile'),profileRequests=all.filter(s=>s.type==='profile').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),pending=subs.filter(s=>(s.status||'pending')==='pending');
 const activeTeachers=teachers.filter(t=>t.isActive!==false),inactiveTeachers=teachers.filter(t=>t.isActive===false),pendingProfiles=profileRequests.filter(s=>(s.status||'pending')==='pending');
 if($('adminTeacherActiveCount'))$('adminTeacherActiveCount').textContent=activeTeachers.length;
 if($('adminTeacherInactiveCount'))$('adminTeacherInactiveCount').textContent=inactiveTeachers.length;
 if($('adminTeacherPendingContent'))$('adminTeacherPendingContent').textContent=pending.length;
 if($('adminTeacherPendingProfiles'))$('adminTeacherPendingProfiles').textContent=pendingProfiles.length;
 const selected=$('profileTeacherId').value;
 $('profileTeacherId').innerHTML='<option value="">اختر المدرس</option>'+teachers.filter(t=>t.isActive!==false).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name||t.email||'مدرس')+'</option>').join('');
 $('profileTeacherId').value=teachers.some(t=>t.id===selected&&t.isActive!==false)?selected:'';
 if(!$('profileTeacherId').value&&teachers.some(t=>t.isActive!==false))$('profileTeacherId').value=teachers.find(t=>t.isActive!==false).id;
 if(document.activeElement?.closest('#adminTeacherProfileForm')===null||document.activeElement===$('profileTeacherId'))fillTeacherProfileEditor();
 $('teacherProfileRequestsList').innerHTML=profileRequests.length?profileRequests.map(s=>{const p=s.profile||{},photo=cleanUrl(p.photoUrl||'');return '<div class="admin-list-item"><div><strong>'+esc(p.name||root.teacherProfiles?.[s.uid]?.name||'مدرس')+'</strong><small>'+esc(p.title||'')+'</small><details class="teacher-profile-review"><summary>عرض المعلومات المقترحة</summary>'+(photo!=='#'?'<img src="'+esc(photo)+'" alt="الصورة المقترحة" loading="lazy">':'')+(cleanUrl(p.coverUrl||'')!=='#'?'<p><a href="'+esc(cleanUrl(p.coverUrl||''))+'" target="_blank" rel="noopener">فتح صورة الغلاف المقترحة</a></p>':'')+'<p><b>النبذة:</b> '+esc(p.bio||'—')+'</p><p><b>المؤهلات:</b> '+esc(p.qualifications||'—')+'</p><p><b>الخبرة:</b> '+esc(p.experience||'—')+'</p><p><b>أسلوب الشرح:</b> '+esc(p.teachingStyle||'—')+'</p></details></div><div class="admin-action-row">'+(s.status==='pending'?'<button class="admin-action-btn success" data-approve-profile="'+s.uid+'|'+s.id+'" title="اعتماد ونشر" aria-label="اعتماد ملف '+esc(p.name||'المدرس')+'">✓</button><button class="admin-action-btn danger" data-reject-profile="'+s.uid+'|'+s.id+'" title="رفض" aria-label="رفض ملف '+esc(p.name||'المدرس')+'">✕</button>':'<span class="status-pill '+(s.status==='approved'?'approved':'rejected')+'">'+(s.status==='approved'?'معتمد':'مرفوض')+'</span>')+'</div></div>'}).join(''):empty('لا توجد طلبات ملفات','يمكن للمدرس تقديم معلومات ملفه من بوابته.');
 $$('[data-approve-profile]').forEach(b=>b.onclick=()=>reviewTeacherProfile(b.dataset.approveProfile,true));
 $$('[data-reject-profile]').forEach(b=>b.onclick=()=>reviewTeacherProfile(b.dataset.rejectProfile,false));
 $('pendingCountText').textContent=pending.length+' قيد المراجعة';
 $('teachersAdminList').innerHTML=teachers.length?teachers.map(t=>'<div class="admin-list-item"><div><strong>'+esc(t.name||t.email||'مدرس')+'</strong><small>'+esc(t.email||'')+' • '+assignmentsOf(t).length+' صلاحية • '+(t.isActive===false?'موقوف':'نشط')+'</small><select class="admin-inline-select" data-teacher-role="'+t.id+'" aria-label="دور '+esc(t.name||'المدرس')+'"><option value="teacher" '+((t.role||'teacher')==='teacher'?'selected':'')+'>معلم</option><option value="assistant" '+(t.role==='assistant'?'selected':'')+'>مساعد معلم</option><option value="supervisor" '+(t.role==='supervisor'?'selected':'')+'>مشرف مادة</option></select></div><div class="admin-action-row"><button class="admin-action-btn" data-reset-teacher="'+t.id+'" title="إرسال رابط تغيير كلمة المرور" aria-label="إرسال رابط تغيير كلمة المرور إلى '+esc(t.name||t.email||'المدرس')+'"><i class="fa-solid fa-key"></i></button><button class="admin-action-btn '+(t.isActive===false?'success':'')+'" data-toggle-teacher="'+t.id+'" title="تفعيل أو إيقاف" aria-label="تفعيل أو إيقاف '+esc(t.name||'المدرس')+'"><i class="fa-solid '+(t.isActive===false?'fa-play':'fa-pause')+'"></i></button><button class="admin-action-btn danger" data-remove-teacher="'+t.id+'" title="إزالة الصلاحية" aria-label="إزالة صلاحية '+esc(t.name||'المدرس')+'"><i class="fa-solid fa-user-minus"></i></button></div></div>').join(''):empty('لا يوجد مدرسون','أنشئ حسابًا جديدًا من النموذج أعلاه أو رقّ حسابًا موجودًا.');
 const teacherIds=new Set(teachers.map(t=>t.id)),candidates=students.filter(s=>!teacherIds.has(s.id)&&s.email&&!s.phone);
 $('teacherCandidates').innerHTML=candidates.length?candidates.map(s=>'<div class="admin-list-item"><div><strong>'+esc(s.name||s.email||'طالب')+'</strong><small>'+esc(s.email||'')+'</small></div><button class="admin-action-btn success" data-promote="'+s.id+'"><i class="fa-solid fa-plus"></i></button></div>').join(''):empty('لا توجد حسابات للترقية','كل الحسابات الحالية لها حالة مدرس أو لا توجد حسابات.');
 $('assignTeacher').innerHTML=teachers.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name||t.email||t.id)+'</option>').join('');
 refreshAssignmentSubjects();
 $('teacherSubmissionsList').innerHTML=subs.length?subs.map(s=>{
   const kind=s.submissionKind==='teacherQuizV6'?'اختبار مدرس':s.submissionKind==='teacherContentV6'?'شرح مدرس':s.submissionKind==='quiz'?'اختبار':s.submissionKind==='assignment'?'واجب':s.submissionKind==='notification'?'إشعار':'درس';
   const related=s.lessonId?root.lessons?.[s.lessonId]?.title||'درس غير موجود':'';
   const preview=s.submissionKind==='teacherQuizV6'?'<details class="teacher-submission-preview"><summary>مراجعة اختبار المدرس ('+(s.quiz?.questions?.length||0)+')</summary><p>الدرس المرتبط: '+esc(s.lessonId||'—')+'</p>'+(Array.isArray(s.quiz?.questions)?s.quiz.questions.map((q,i)=>'<p><strong>'+(i+1)+'. '+esc(q.text||q.question||'سؤال')+'</strong><br>الاختيارات: '+(q.opts||q.options||[]).map((option,j)=>esc(option)+(j===Number(q.correctAnswer)?' ✓':'')).join(' • ')+'</p>').join(''):'')+'</details>':s.submissionKind==='teacherContentV6'?'<details class="teacher-submission-preview"><summary>معاينة شرح المدرس الكامل</summary><div class="admin-rich-submission-preview"><strong>الشرح المكتوب:</strong>'+(s.package?.content?window.AcademyUtils.sanitizeRichHtml(s.package.content):'<p>لا يوجد شرح مكتوب</p>')+'</div><p><strong>الفيديوهات:</strong> '+(s.package?.videos?.length||0)+' • <strong>التدريبات:</strong> '+(s.package?.practiceQuestions?.length||0)+' • <strong>الملفات:</strong> '+(s.package?.files?.length||0)+'</p>'+(Array.isArray(s.package?.practiceQuestions)&&s.package.practiceQuestions.length?'<div>'+s.package.practiceQuestions.slice(0,10).map((q,i)=>'<p><strong>'+(i+1)+'. '+esc(q.text||q.question||'سؤال')+'</strong><br>الاختيارات: '+(q.opts||q.options||[]).map((option,j)=>esc(option)+(j===Number(q.correctAnswer)?' ✓':'')).join(' • ')+'</p>').join('')+'</div>':'')+'</details>':s.submissionKind==='quiz'?'<details class="teacher-submission-preview"><summary>مراجعة الأسئلة ('+(s.questions?.length||0)+')</summary><p>الدرس المرتبط: '+esc(related)+'</p>'+(Array.isArray(s.questions)?s.questions.map((q,i)=>'<p><strong>'+(i+1)+'. '+esc(q.text||q.question||'سؤال')+'</strong><br>الاختيارات: '+(q.opts||q.options||[]).map((option,j)=>esc(option)+(j===Number(q.correctAnswer)?' ✓':'')).join(' • ')+'</p>').join(''):'')+'</details>':s.submissionKind==='assignment'?'<details class="teacher-submission-preview"><summary>عرض تعليمات الواجب</summary><p>'+esc(s.instructions||'—')+'</p><p>آخر موعد: '+(Number.isFinite(Number(s.dueAt))?new Date(Number(s.dueAt)).toLocaleString('ar-EG'):'غير محدد')+'</p></details>':s.submissionKind==='notification'?'<details class="teacher-submission-preview"><summary>معاينة الإشعار للطلاب</summary><p><strong>'+esc(s.title||'إشعار')+'</strong></p><p>'+esc(s.text||'—')+'</p><p>الأولوية: '+esc(s.priority==='urgent'?'عاجل':s.priority==='high'?'مهم':'عادي')+' • مدة الظهور: '+Math.max(1,Number(s.durationDays||5))+' أيام</p>'+(s.href?'<p>الرابط: '+esc(s.href)+'</p>':'')+'</details>':s.submissionKind==='lesson'?'<details class="teacher-submission-preview"><summary>معاينة الدرس الكامل</summary><div class="admin-rich-submission-preview"><strong>الشرح المكتوب:</strong>'+(s.content?(s.contentFormat==='html'?window.AcademyUtils.sanitizeRichHtml(s.content):'<p>'+esc(String(s.content).slice(0,3000))+'</p>'):'<p>لا يوجد شرح مكتوب</p>')+'</div><p><strong>تدريب الدرس:</strong> '+(Array.isArray(s.questions)?s.questions.length:0)+' سؤال</p>'+(s.imageUrl?'<p><a href="'+cleanUrl(s.imageUrl)+'" target="_blank" rel="noopener">فتح الصورة التوضيحية</a></p>':'')+(Array.isArray(s.questions)&&s.questions.length?'<div>'+s.questions.slice(0,10).map((q,i)=>'<p><strong>'+(i+1)+'. '+esc(q.text||q.question||'سؤال')+'</strong><br>الاختيارات: '+(q.opts||q.options||[]).map((option,j)=>esc(option)+(j===Number(q.correctAnswer)?' ✓':'')).join(' • ')+'</p>').join('')+'</div>':'')+'</details>':'';
   const pending=(s.status||'pending')==='pending',accessChoice=pending&&!['notification','teacherContentV6','teacherQuizV6'].includes(s.submissionKind)?'<label class="switch-field" style="margin-top:8px"><span>الوصول بعد الاعتماد</span><div><input type="checkbox" data-submission-free="'+s.uid+'|'+s.id+'" '+(s.isFree===true?'checked':'')+'><strong>مجاني</strong></div></label>':'';return '<div class="admin-list-item"><div><strong>'+esc(kind+': '+(s.title||'محتوى'))+'</strong><small>'+esc(s.teacherName||root.teacherProfiles?.[s.uid]?.name||'مدرس')+' • '+esc(typeLabel(s.type))+' • '+esc(gradeLabel(s.stage,s.grade))+' • '+esc(s.subjectName||s.subject||'')+'</small>'+preview+accessChoice+(s.videoUrl?'<a href="'+cleanUrl(s.videoUrl)+'" target="_blank" rel="noopener" style="font-size:9px;color:#2563eb">فتح الفيديو</a>':'')+'</div><div class="admin-action-row">'+(pending?'<button class="admin-action-btn success" data-approve="'+s.uid+'|'+s.id+'" title="اعتماد '+kind+'"><i class="fa-solid fa-check"></i></button><button class="admin-action-btn danger" data-reject="'+s.uid+'|'+s.id+'" title="رفض '+kind+'"><i class="fa-solid fa-xmark"></i></button>':'<span class="status-pill '+(s.status==='approved'?'approved':'rejected')+'">'+(s.status==='approved'?'معتمد':'مرفوض')+'</span>')+'</div></div>';
 }).join(''):empty('لا توجد طلبات محتوى','عندما يرسل مدرس درسًا أو اختبارًا أو واجبًا أو إشعارًا سيظهر هنا.');
 $$('[data-teacher-role]').forEach(s=>s.onchange=async()=>{try{await db.ref('teacherProfiles/'+s.dataset.teacherRole+'/role').set(s.value);await writeAudit('teacher.role_change','teacher',s.dataset.teacherRole,{role:s.value});toast('تم تحديث دور المدرس')}catch(err){console.error(err);toast('تعذر تحديث الدور.','error')}});
 $$('[data-toggle-teacher]').forEach(b=>b.onclick=async()=>{const uid=b.dataset.toggleTeacher,activate=root.teacherProfiles?.[uid]?.isActive===false;try{await AcademyBackend.adminUpdateUserAccess({uid,status:activate?'active':'suspended'});await db.ref('teacherProfiles/'+uid+'/isActive').set(activate);if(root.settings?.publicTeachers?.[uid])await db.ref('settings/publicTeachers/'+uid+'/active').set(activate);toast(activate?'تم تفعيل حساب المدرس':'تم إيقاف حساب المدرس')}catch(err){console.error(err);toast('تعذر تغيير حالة المدرس.','error')}});
 $$('[data-reset-teacher]').forEach(b=>b.onclick=async()=>{const email=root.teacherProfiles?.[b.dataset.resetTeacher]?.email;if(!email)return toast('لا يوجد بريد لهذا المدرس.','error');try{await auth.sendPasswordResetEmail(email);toast('تم إرسال رابط تغيير كلمة المرور إلى بريد المدرس.')}catch(err){console.error(err);toast('تعذر إرسال رابط تغيير كلمة المرور.','error')}});
 $$('[data-remove-teacher]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'إزالة صلاحية المدرس؟',message:'سيتم تعطيل حساب المدرس وإزالة ملفه من بوابة التدريس. يمكنك إنشاء حساب جديد له لاحقًا عند الحاجة.',tone:'warning',acceptText:'إزالة الصلاحية'})){const uid=b.dataset.removeTeacher;try{await AcademyBackend.adminUpdateUserAccess({uid,status:'disabled'});await db.ref('settings/publicTeachers/'+uid).remove();await db.ref('teacherProfiles/'+uid).remove();toast('تم تعطيل حساب المدرس وإزالة صلاحيته')}catch(err){console.error(err);toast('تعذرت إزالة صلاحية المدرس.','error')}}});
 $$('[data-promote]').forEach(b=>b.onclick=async()=>{const uid=b.dataset.promote,s=root.studentProfilesV3?.[uid]||{};try{await AcademyBackend.adminUpdateUserAccess({uid,role:'teacher',status:'active'});await db.ref('teacherProfiles/'+uid).set({name:s.name||'',email:s.email||'',role:'teacher',isActive:true,createdAt:Date.now(),assignments:[]});toast('تم تحويل الحساب إلى مدرس ويمكنه الدخول من بوابة المعلم')}catch(err){console.error(err);toast('تعذر تحويل الحساب إلى مدرس.','error')}});
 $$('[data-approve]').forEach(b=>b.onclick=()=>approveSubmission(b.dataset.approve));
 $$('[data-reject]').forEach(b=>b.onclick=async()=>{const [uid,id]=b.dataset.reject.split('|');await db.ref('teacherSubmissions/'+uid+'/'+id).update({status:'rejected',reviewedAt:Date.now()});await writeAudit('teacher_submission.reject','teacherSubmission',id,{teacherUid:uid});toast('تم رفض المحتوى')});
}
function refreshAssignmentSubjects(){
 fillGrades($('assignGrade'),$('assignStage').value);fillSubjects($('assignSubject'),$('assignStage').value,$('assignGrade').value,$('assignType').value);
}
async function addAssignment(){
 const uid=$('assignTeacher').value,btn=$('addAssignmentBtn');if(!uid)return toast('لا يوجد مدرس محدد.','error');
 const payload={type:$('assignType').value,stage:$('assignStage').value,grade:$('assignGrade').value,subject:$('assignSubject').value,subjectName:$('assignSubject').selectedOptions[0]?.textContent||'',createdAt:Date.now()};
 if(!payload.subject)return toast('اختر مادة صحيحة أولًا.','error');
 const teacherProfile=root.teacherProfiles?.[uid]||{};
 const existing=Array.isArray(teacherProfile.assignments)?teacherProfile.assignments:Object.values(teacherProfile.assignments||{});
 if(existing.some(a=>a?.type===payload.type&&a?.stage===payload.stage&&String(a?.grade)===String(payload.grade)&&a?.subject===payload.subject)){
   return toast('هذه المادة مسندة لهذا المدرس بالفعل.','error');
 }
 window.AcademyUI?.setButtonLoading(btn,true,'إسناد');
 try{
   await db.ref('teacherProfiles/'+uid+'/assignments').push(payload);toast('تم إسناد المادة للمدرس');
 }catch(err){console.error(err);toast('تعذر إسناد المادة الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
async function approveSubmission(key){
 const [uid,id]=key.split('|'),s=root.teacherSubmissions?.[uid]?.[id];if(!s)return;
 if(s.type==='profile')return;
 if((s.status||'pending')!=='pending')return toast('تمت مراجعة هذا الطلب بالفعل.','error');
 const t=root.teacherProfiles?.[uid];if(!t||t.isActive!==true)return toast('حساب المعلم غير نشط؛ لا يمكن اعتماد الطلب.','error');
 let claimed=false;
 try{
   const kind=s.submissionKind||'lesson',now=Date.now(),updates={},freeChoice=!!document.querySelector('[data-submission-free="'+uid+'|'+id+'"]')?.checked;let publishedId='',publishedType='';
   const scopes=assignmentsOf(t).length?assignmentsOf(t):(Array.isArray(t.subjects)?t.subjects:[]);
   if(!scopes.some(raw=>{const item=typeof raw==='string'?{subject:raw}:raw;return item&&(!item.type||item.type===s.type)&&(!item.stage||item.stage===s.stage)&&(!item.grade||String(item.grade)===String(s.grade))&&(!item.subject||item.subject===s.subject)}))throw Error('المادة والصف غير مسندين إلى هذا المعلم');
   if(kind==='notification'){
     if(!s.title||!s.text||!s.subject||!s.grade)throw Error('بيانات الإشعار غير مكتملة');
     const href=String(s.href||'').trim();
     if(href&&!href.startsWith('./')&&!href.startsWith('/')&&!/^https?:\/\//i.test(href))throw Error('رابط الإشعار غير صالح');
     const durationDays=Math.max(1,Math.min(14,Number(s.durationDays||5)));
     publishedType='notificationBroadcasts';publishedId=db.ref('notificationBroadcasts').push().key;
     updates['notificationBroadcasts/'+publishedId]={
       source:'teacher',teacherId:uid,teacherName:s.teacherName||t.name||'المدرس',
       title:s.title,text:s.text,type:s.type,stage:s.stage,grade:String(s.grade),subject:s.subject,subjectName:s.subjectName||'',
       priority:['normal','high','urgent'].includes(s.priority)?s.priority:'normal',href,isActive:true,
       createdAt:now,expiresAt:now+durationDays*86400000,teacherSubmissionId:id
     };
   }else if(kind==='quiz'){
     const lesson=root.lessons?.[s.lessonId];
     if(!lesson||lesson.isHidden)throw Error('الدرس المرتبط غير متاح');
     if(lesson.type!==s.type||lesson.stage!==s.stage||String(lesson.grade)!==String(s.grade)||lesson.subject!==s.subject)throw Error('بيانات الاختبار لا تطابق الدرس');
     const questions=window.AcademyUtils.validateQuestions(s.questions);
     if(!questions.length||questions.length>100||questions.some(q=>q.opts.length>4))throw Error('راجع أسئلة الاختبار قبل الاعتماد');
     publishedType='quizzes';publishedId=db.ref('quizzes').push().key;
     updates['quizzes/'+publishedId]={name:s.title,lessonId:s.lessonId,type:s.type,stage:s.stage,grade:String(s.grade),subject:s.subject,unit:Number(lesson.unit||1),questions,targetMode:s.targetMode||'all',targetStudentIds:s.targetStudentIds||[],targetGroupId:s.targetGroupId||'',teacherId:uid,teacherSubmissionId:id,isFree:freeChoice,isHidden:false,createdAt:now};
     questions.forEach((q,qi)=>{
       const bankId='quiz-'+publishedId+'-'+qi;
       updates['questionBankV4/'+bankId]={id:bankId,question:q.text,options:q.opts,correctAnswer:Number(q.correctAnswer),explanation:q.explanation||'',skill:q.skill||'',difficulty:Number(q.difficulty||2),type:s.type,stage:s.stage,grade:String(s.grade),subject:s.subject,unit:Number(lesson.unit||1),lessonId:s.lessonId,sourceQuizId:publishedId,authorUid:uid,authorRole:'teacher',status:'approved',createdAt:now,updatedAt:now};
     });
   }else if(kind==='assignment'){
     if(!Number(s.dueAt)||Number(s.dueAt)<=now)throw Error('انتهى موعد الواجب؛ اطلب من المعلم إرساله بموعد جديد');
     if(!s.title||!s.subject||!s.grade||!Number.isFinite(Number(s.maxScore))||Number(s.maxScore)<1||Number(s.maxScore)>1000)throw Error('بيانات الواجب غير مكتملة');
     publishedType='assignments';publishedId=db.ref('assignments').push().key;
     updates['assignments/'+publishedId]={title:s.title,instructions:s.instructions||'',type:s.type,stage:s.stage,grade:String(s.grade),subject:s.subject,subjectName:s.subjectName||'',dueAt:Number(s.dueAt),maxScore:Number(s.maxScore),targetMode:s.targetMode||'all',targetStudentIds:s.targetStudentIds||[],targetGroupId:s.targetGroupId||'',teacherId:uid,teacherName:s.teacherName||t.name||'المدرس',teacherSubmissionId:id,isFree:freeChoice,isHidden:false,createdAt:now};
   }else if(kind==='lesson'){
     const title=String(s.title||'').trim(),content=String(s.content||'').trim(),videoUrl=String(s.videoUrl||'').trim(),imageUrl=String(s.imageUrl||'').trim();
     if(!title)throw Error('عنوان الدرس غير مكتمل');
     if(!videoUrl&&!content)throw Error('الدرس يحتاج شرحًا مكتوبًا أو فيديو واحدًا على الأقل');
     if(videoUrl){
       let video;try{video=new URL(videoUrl)}catch{throw Error('رابط فيديو الدرس غير صالح')}
       if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(video.hostname))throw Error('رابط الفيديو يجب أن يكون من YouTube');
     }
     if(imageUrl&&cleanUrl(imageUrl)==='#')throw Error('رابط صورة الدرس غير صالح');
     const questions=s.questions?.length?window.AcademyUtils.validateQuestions(s.questions):[];
     if(questions.length>100||questions.some(q=>q.opts.length>4))throw Error('راجع أسئلة تدريب الدرس قبل الاعتماد');
     publishedType='lessons';publishedId=db.ref('lessons').push().key;
     updates['lessons/'+publishedId]={title,content,contentFormat:s.contentFormat==='html'?'html':'text',imageUrl,imagePosition:s.imagePosition==='bottom'?'bottom':'top',type:s.type||'public',stage:s.stage||'prep',grade:String(s.grade||1),subject:s.subject||'',unit:Number(s.unit||1),videos:videoUrl?[{name:s.teacherName||t.name||'المدرس',url:videoUrl,teacherId:uid,checkpoints:Array.isArray(s.videoCheckpoints)?s.videoCheckpoints:[]}]:[],questions,isLocked:false,isFree:freeChoice,isHidden:false,workflowStatus:'published',reviewStatus:'approved',reviewedAt:now,reviewedBy:currentUser?.uid||'',teacherId:uid,teacherSubmissionId:id,createdAt:now};
   }else throw Error('نوع الطلب غير معروف');
   updates['teacherSubmissions/'+uid+'/'+id+'/status']='approved';
   updates['teacherSubmissions/'+uid+'/'+id+'/reviewedAt']=now;
   const publishedField={lessons:'lessonId',quizzes:'quizId',assignments:'assignmentId',notificationBroadcasts:'notificationId'}[publishedType];
   if(publishedField)updates['teacherSubmissions/'+uid+'/'+id+'/'+publishedField]=publishedId;
   const statusRef=db.ref('teacherSubmissions/'+uid+'/'+id+'/status');
   const claim=await statusRef.transaction(current=>!current||current==='pending'?'approving':undefined);
   if(!claim.committed)return toast('هذا الطلب قيد المراجعة أو تم اعتماده بالفعل.','error');
   claimed=true;
   await db.ref().update(updates);
   await writeAudit('teacher_submission.approve','teacherSubmission',id,{teacherUid:uid,kind,publishedType,publishedId,isFree:freeChoice});
   toast('تم اعتماد '+(kind==='quiz'?'الاختبار':kind==='assignment'?'الواجب':kind==='notification'?'الإشعار':'الدرس')+' ونشره');
 }catch(err){
   if(claimed)await db.ref('teacherSubmissions/'+uid+'/'+id+'/status').transaction(current=>current==='approving'?'pending':undefined).catch(console.error);
   console.error(err);toast('تعذر اعتماد المحتوى: '+err.message,'error');
 }
}

/* Students */
function renderStudents(){
 const all=values(root.studentProfilesV3),q=($('studentSearch')?.value||'').trim().toLowerCase(),type=$('studentFilterType')?.value||'',stage=$('studentFilterStage')?.value||'',weekAgo=Date.now()-7*86400000;
 const active=all.filter(s=>Number(s.lastActiveAt||s.activity?.lastSeenAt||0)>=weekAgo).length,phones=all.filter(s=>String(s.phone||'').trim()).length,profiled=all.filter(s=>s.stage&&s.grade&&s.educationType).length;
 if($('adminStudentTotalCount'))$('adminStudentTotalCount').textContent=all.length;
 if($('adminStudentActiveCount'))$('adminStudentActiveCount').textContent=active;
 if($('adminStudentPhoneCount'))$('adminStudentPhoneCount').textContent=phones;
 if($('adminStudentProfiledCount'))$('adminStudentProfiledCount').textContent=profiled;
 const arr=all.filter(s=>{
   const matchText=!q||(s.name||'').toLowerCase().includes(q)||(s.phone||'').includes(q)||(s.email||'').toLowerCase().includes(q);
   const matchType=!type||s.educationType===type,matchStage=!stage||s.stage===stage;
   return matchText&&matchType&&matchStage;
 }).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 if($('studentResultsCount'))$('studentResultsCount').textContent=arr.length+' طالب ظاهر';
 $('studentsAdminList').innerHTML=arr.length?'<table class="admin-table mix-admin-student-table"><thead><tr><th>الطالب</th><th>المرحلة</th><th>XP</th><th>الدروس</th><th>الاختبارات</th><th>آخر نشاط</th></tr></thead><tbody>'+arr.map(s=>{
   const last=Number(s.lastActiveAt||s.activity?.lastSeenAt||0),recent=last>=weekAgo;
   return '<tr><td><div class="mix-admin-student-cell"><span>'+esc((s.name||'ط').trim()[0]||'ط')+'</span><div><strong>'+esc(s.name||'طالب')+'</strong><small>'+esc(s.phone||s.email||'بدون وسيلة تواصل')+'</small></div></div></td><td>'+esc(typeLabel(s.educationType))+' • '+esc(gradeLabel(s.stage,s.grade))+'</td><td><strong>'+Number(s.stats?.totalXP||0)+'</strong></td><td>'+Number(s.stats?.completedLessons||0)+'</td><td>'+Number(s.stats?.completedQuizzes||0)+'</td><td><span class="mix-admin-activity '+(recent?'active':'')+'"><i></i>'+ (last?new Date(last).toLocaleDateString('ar-EG'):'لا يوجد')+'</span></td></tr>';
 }).join('')+'</tbody></table>':empty('لا يوجد طلاب مطابقون','غيّر البحث أو الفلاتر لعرض نتائج أخرى.');
}

/* News */
function newsItems(){return values(root.posts).sort((a,b)=>(b.date||b.createdAt||0)-(a.date||a.createdAt||0))}
function resetNewsEditor(){
 editState.news=null;$('newsForm')?.reset();
 if($('newsEditorTitle'))$('newsEditorTitle').textContent='خبر جديد';
 if($('newsSaveBtn'))$('newsSaveBtn').textContent='نشر الخبر';
 $('newsCancelEdit')?.classList.add('hidden');
}
function renderNews(){
 const list=newsItems(),el=$('newsAdminList');if(!el)return;
 el.innerHTML=list.length?list.map(n=>'<div class="admin-list-item"><div><strong>'+esc(n.title||'خبر')+'</strong><small>'+(n.date?new Date(n.date).toLocaleDateString('ar-EG'):'')+'</small><p style="font-size:9px;color:#64748b;margin:5px 0 0">'+esc((n.content||'').slice(0,150))+'</p></div><div class="admin-action-row"><button class="admin-action-btn" data-edit-news="'+n.id+'" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="admin-action-btn danger" data-delete-news="'+n.id+'" title="حذف"><i class="fa-solid fa-trash"></i></button></div></div>').join(''):empty('لا توجد أخبار','اكتب أول تحديث للمنصة.');
 $$('[data-edit-news]').forEach(b=>b.onclick=()=>editNews(b.dataset.editNews));
 $$('[data-delete-news]').forEach(b=>b.onclick=async()=>{if(await askConfirm({title:'حذف الخبر؟',message:'سيتم حذف الخبر أو التحديث من المنصة.',tone:'danger',acceptText:'حذف الخبر'}))await db.ref('posts/'+b.dataset.deleteNews).remove()});
}
function editNews(id){
 const n=root.posts?.[id];if(!n)return;editState.news=id;
 $('newsTitle').value=n.title||'';$('newsContent').value=n.content||'';$('newsImage').value=n.image||'';
 $('newsEditorTitle').textContent='تعديل الخبر';$('newsSaveBtn').textContent='حفظ التعديل';$('newsCancelEdit').classList.remove('hidden');
 $('newsTitle').focus();
}
async function saveNews(e){
 e.preventDefault();
 const payload={title:$('newsTitle').value.trim(),content:$('newsContent').value.trim(),image:$('newsImage').value.trim()};
 if(editState.news){payload.updatedAt=Date.now();await db.ref('posts/'+editState.news).update(payload);toast('تم تحديث الخبر')}
 else{payload.date=Date.now();await db.ref('posts').push(payload);toast('تم نشر الخبر')}
 resetNewsEditor();
}

/* Announcement + settings */
function loadAnnouncement(){
 const a=root.announcements||{};$('announcementText').value=a.text||'';$('announcementActive').checked=!!a.isActive;
 if(a.expiry)$('announcementDays').value=Math.max(1,Math.ceil((a.expiry-Date.now())/86400000));
}
async function saveAnnouncement(e){e.preventDefault();const days=Math.max(1,Number($('announcementDays').value||3));await db.ref('announcements').set({text:$('announcementText').value.trim(),isActive:$('announcementActive').checked,expiry:Date.now()+days*86400000,updatedAt:Date.now()});toast('تم حفظ الإعلان')}
function safeAdminImageUrl(value=''){
 try{
   if(!value)return'';
   const u=new URL(value,location.href);
   return ['http:','https:'].includes(u.protocol)?u.href:'';
 }catch{return''}
}
function renderVisualSettingPreview(inputId,previewId,label,defaultImage='./assets/dashboard-hero.jpg'){
 const preview=$(previewId);if(!preview)return;
 const value=$(inputId)?.value.trim()||'',safe=safeAdminImageUrl(value),image=(safe||defaultImage).replace(/"/g,'%22');
 preview.style.backgroundImage='linear-gradient(90deg,rgba(7,35,111,.22),rgba(108,66,255,.10)),url("'+image+'")';
 preview.classList.toggle('custom',!!safe);
 const caption=preview.querySelector('span');if(caption)caption.textContent=safe?label+' — صورة مخصصة':label+' — الصورة الافتراضية';
}
function renderDashboardHeroSettingPreview(){
 renderVisualSettingPreview('settingPublicHero','settingPublicHeroPreview','الصفحة قبل تسجيل الدخول','./assets/reference-hero.jpg');
 renderVisualSettingPreview('settingAuthVisual','settingAuthVisualPreview','تسجيل الدخول','./assets/reference-hero.jpg');
 renderVisualSettingPreview('settingDashboardHero','settingDashboardHeroPreview','غلاف لوحة الطالب','./assets/dashboard-hero.jpg');
}
function loadSettings(){
 const s=root.settings||{};
 $('settingSiteName').value=s.siteName||'الأكاديمية';
 $('settingWhatsapp').value=s.whatsapp||'';
 $('settingLogo').value=s.siteLogo||'';
 $('settingPublicHero').value=s.publicHeroUrl||'';
 $('settingAuthVisual').value=s.authVisualUrl||'';
 $('settingDashboardHero').value=s.dashboardHeroUrl||'';
 $('settingStagePrimary').value=s.stageImages?.primary||'';
 $('settingStagePrep').value=s.stageImages?.prep||'';
 $('settingStageSec').value=s.stageImages?.sec||'';
 $('settingStageAzhar').value=s.stageImages?.azhar||'';
 $('settingDashboardHeroSubtitle').value=s.dashboardHeroSubtitle||'كل يوم هو فرصة جديدة للتعلم وتقترب من أهدافك';
 $('settingAbout').value=s.aboutText||'';
 renderDashboardHeroSettingPreview();
}
async function saveSettings(e){
 e.preventDefault();
 const heroValue=$('settingDashboardHero').value.trim(),publicHero=$('settingPublicHero').value.trim(),authVisual=$('settingAuthVisual').value.trim();
 const stageImages={primary:$('settingStagePrimary').value.trim(),prep:$('settingStagePrep').value.trim(),sec:$('settingStageSec').value.trim(),azhar:$('settingStageAzhar').value.trim()};
 const imageValues=[heroValue,publicHero,authVisual,...Object.values(stageImages)].filter(Boolean);
 if(imageValues.some(v=>!safeAdminImageUrl(v)))return toast('يوجد رابط صورة غير صحيح. استخدم رابط http أو https صالحًا.','error');
 await db.ref('settings').update({
   siteName:$('settingSiteName').value.trim(),
   whatsapp:$('settingWhatsapp').value.trim(),
   siteLogo:$('settingLogo').value.trim(),
   publicHeroUrl:publicHero,
   authVisualUrl:authVisual,
   dashboardHeroUrl:heroValue,
   stageImages,
   dashboardHeroSubtitle:$('settingDashboardHeroSubtitle').value.trim()||'كل يوم هو فرصة جديدة للتعلم وتقترب من أهدافك',
   aboutText:$('settingAbout').value.trim(),
   updatedAt:Date.now()
 });
 toast('تم حفظ الإعدادات وتحديث غلاف لوحة الطالب');
}

/* Pending + auth */
function updatePendingBadge(){
 const n=flattenSubmissions().filter(s=>(s.status||'pending')==='pending').length;$('pendingBadge').textContent=n;$('pendingBadge').classList.toggle('hidden',!n);
}
async function verifyAdmin(user){
 return user?.role==='admin';
}

async function syncStudentPhoneIndex(){
 const students=root.studentProfilesV3||{},parents=root.parentProfilesV4||{},updates={},ts=Date.now();
 Object.entries(students).forEach(([studentId,p])=>{
  const phone=String(p?.phone||''),key=phone.replace(/\D/g,'');
  if(key){
   updates['studentPhoneIndexV4/'+key]={studentId,updatedAt:ts};
   updates['phoneDirectoryV4/students/'+studentId]={uid:studentId,name:p?.name||'',phone,updatedAt:ts};
  }
 });
 Object.entries(parents).forEach(([parentId,p])=>{
  const phone=String(p?.phone||'');
  if(phone)updates['phoneDirectoryV4/parents/'+parentId]={uid:parentId,name:p?.name||'',phone,updatedAt:ts};
 });
 if(Object.keys(updates).length){
  try{await db.ref().update(updates)}catch(err){console.warn('Phone directory backfill skipped',err)}
 }
}
async function startDataListener(){
 if(unsubscribe)unsubscribe();
 stopAdminListeners();adminRootPrimed=false;
 const primed=await primeAdminRoot();
 const ok=primed?true:await ensureAdminPaths(ADMIN_CORE_PATHS);
 if(primed)ADMIN_CORE_PATHS.forEach(path=>attachAdminPath(path));
 await syncStudentPhoneIndex();
 renderAdminIdentity();updatePendingBadge();updateCommunityBadge();
 const requested=new URLSearchParams(location.search).get('tab')||'overview';
 await setTab(requested,false);
 window.AcademyUI?.hidePageLoading();
 if(!ok)toast('تعذر تحميل بيانات الإدارة من الخادم. أعد المحاولة من زر التحديث.','error');
 unsubscribe=()=>stopAdminListeners();
}

function initAdminCollapse(){
 if(document.body.classList.contains('academy-suite')){$('adminApp')?.classList.remove('admin-collapsed');return}
 const shell=$('adminApp'),btn=$('adminCollapseBtn');if(!shell||!btn)return;
 const apply=()=>{const collapsed=innerWidth>900&&localStorage.getItem('academyAdminCollapsed')==='1';shell.classList.toggle('admin-collapsed',collapsed)};
 apply();
 btn.onclick=()=>{if(innerWidth<=900)return;const next=!shell.classList.contains('admin-collapsed');shell.classList.toggle('admin-collapsed',next);localStorage.setItem('academyAdminCollapsed',next?'1':'0')};
 $$('.admin-nav button,.admin-sidebar-footer a,.admin-sidebar-footer button').forEach(el=>{if(!el.title)el.title=el.textContent.trim().replace(/\s+/g,' ')});
 window.addEventListener('resize',apply,{passive:true});
}

function bindAdminForm(id,handler,label='حفظ'){
 const form=$(id);if(!form)return;
 form.onsubmit=async e=>{
   e.preventDefault();
   const btn=e.submitter||form.querySelector('button[type="submit"]');
   window.AcademyUI?.setButtonLoading(btn,true,label);
   try{
     await handler(e);
   }catch(err){
     console.error('Admin form failed:',id,err);
     toast('تعذر حفظ البيانات الآن. حاول مرة أخرى.','error');
   }finally{
     window.AcademyUI?.setButtonLoading(btn,false);
     if(id==='newsForm'&&btn)btn.textContent=editState.news?'حفظ التعديل':'نشر الخبر';
   }
 };
}

/* events */
$$('[data-admin-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.adminTab));
$$('[data-jump-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.jumpTab));
$$('[data-admin-quick]').forEach(b=>b.onclick=async()=>{
 const action=b.dataset.adminQuick;
 if(action==='lesson'){await setTab('lessons');resetLessonEditor();openModal('lessonModal')}
 else if(action==='quiz'){await setTab('quizzes');resetQuizEditor();openModal('quizModal')}
 else if(action==='teachers'){await setTab('teachers')}
});
$$('[data-close-admin-modal]').forEach(b=>b.onclick=()=>closeModal(b.dataset.closeAdminModal));
$$('.modal-backdrop[id]').forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal.id)}));
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 const open=$$('.modal-backdrop[id]:not(.hidden)')[0];
 if(open)closeModal(open.id);
});
$('openSubjectModal').onclick=()=>{resetSubjectEditor();openModal('subjectModal')};$('openLessonModal').onclick=()=>{resetLessonEditor();openModal('lessonModal')};$('openQuizModal').onclick=()=>{resetQuizEditor();openModal('quizModal')};$('openFileModal').onclick=()=>{resetFileEditor();openModal('fileModal')};$('openSimulationModal').onclick=()=>{resetSimulationEditor();openModal('simulationModal')};$('openLiveModal').onclick=()=>{resetLiveEditor();openModal('liveModal')};
$('addLessonVideoRow').onclick=addLessonVideoRow;
$('addLessonQuestion')?.addEventListener('click',()=>addAdminQuestion('lesson'));
$('addQuizQuestion')?.addEventListener('click',()=>addAdminQuestion('quiz'));
$('importLessonQuestionsJson')?.addEventListener('click',()=>importQuestionJson('lesson'));
$('importQuizQuestionsJson')?.addEventListener('click',()=>importQuestionJson('quiz'));
renderLessonVideosEditor([{name:'',url:'',teacherId:''}]);
renderQuestionBuilder('lesson',[]);
renderQuestionBuilder('quiz',[]);
bindAdminForm('newsForm',saveNews,'نشر');
$('newsCancelEdit').onclick=resetNewsEditor;
bindAdminForm('subjectForm',saveSubject,'حفظ المادة');
$('subjectImageUrl')?.addEventListener('input',renderSubjectImagePreview);
$('addSubjectUnit')?.addEventListener('click',addSubjectUnit);
$('importSubjectUnitsLines')?.addEventListener('click',importSubjectUnitsLines);
['subjectType','subjectStage','subjectGrade'].forEach(id=>$(id)?.addEventListener('change',()=>refreshSubjectPicker()));
 $('subjectName')?.addEventListener('change',onSubjectPicked);
 $('subjectEmoji')?.addEventListener('input',renderSubjectEditorPreview);
bindAdminForm('lessonForm',saveLesson,'حفظ الدرس');
bindAdminForm('quizForm',saveQuiz,'حفظ الاختبار');
$('contentCopyForm')?.addEventListener('submit',executeContentCopy);
$('contentCopyStage')?.addEventListener('change',()=>fillGrades($('contentCopyGrade'),$('contentCopyStage').value));
$('contentReviewEdit')?.addEventListener('click',editReviewedContent);
$('contentReviewApprove')?.addEventListener('click',approveReviewedContent);
$('contentReviewPublish')?.addEventListener('click',publishReviewedContent);
$('contentReviewHide')?.addEventListener('click',hideReviewedContent);
$('contentReviewSchedule')?.addEventListener('click',scheduleReviewedContent);
$('contentReviewCancelSchedule')?.addEventListener('click',cancelReviewedSchedule);
$('contentReviewReload')?.addEventListener('click',refreshContentReviewFrame);
bindAdminForm('fileForm',saveFile,'حفظ الملف');
bindAdminForm('simulationForm',saveSimulation,'حفظ المحاكي');
bindAdminForm('liveForm',saveLiveSession,'حفظ الجلسة');
bindAdminForm('scheduleEventForm',saveScheduleEvent,'حفظ الموعد');
bindAdminForm('studyGroupForm',saveStudyGroup,'إنشاء المجموعة');
bindAdminForm('announcementForm',saveAnnouncement,'حفظ الإعلان');
bindAdminForm('settingsForm',saveSettings,'حفظ الإعدادات');
$('profileTeacherId')?.addEventListener('change',fillTeacherProfileEditor);
$('adminTeacherProfileForm')?.addEventListener('submit',saveTeacherProfile);
['settingPublicHero','settingAuthVisual','settingDashboardHero'].forEach(id=>$(id)?.addEventListener('input',renderDashboardHeroSettingPreview));
$('resetDashboardHero')?.addEventListener('click',()=>{
  ['settingPublicHero','settingAuthVisual','settingDashboardHero','settingStagePrimary','settingStagePrep','settingStageSec','settingStageAzhar'].forEach(id=>{if($(id))$(id).value=''});
  renderDashboardHeroSettingPreview();
  toast('تم اختيار كل الصور الافتراضية. اضغط حفظ الإعدادات لتطبيقها.');
});
$('lessonSearch').oninput=renderLessons;$('lessonFilterStage').onchange=renderLessons;$('lessonFilterType').onchange=renderLessons;$('lessonFilterStatus')?.addEventListener('change',renderLessons);
$('quizSearch')?.addEventListener('input',renderQuizzes);$('quizFilterStage')?.addEventListener('change',renderQuizzes);$('quizFilterType')?.addEventListener('change',renderQuizzes);$('quizFilterMode')?.addEventListener('change',renderQuizzes);$('quizFilterStatus')?.addEventListener('change',renderQuizzes);
$('selectVisibleLessons')?.addEventListener('change',e=>{const ids=filteredLessons().map(x=>x.id);ids.forEach(id=>e.target.checked?selectedLessonIds.add(id):selectedLessonIds.delete(id));updateBulkSelectionUI('lesson')});
$('selectVisibleQuizzes')?.addEventListener('change',e=>{const ids=filteredQuizzes().map(x=>x.id);ids.forEach(id=>e.target.checked?selectedQuizIds.add(id):selectedQuizIds.delete(id));updateBulkSelectionUI('quiz')});
$$('[data-bulk-lessons]').forEach(b=>b.onclick=()=>handleBulkLessonAction(b.dataset.bulkLessons));
$$('[data-bulk-quizzes]').forEach(b=>b.onclick=()=>handleBulkQuizAction(b.dataset.bulkQuizzes));
$('studentSearch').oninput=renderStudents;$('studentFilterType')?.addEventListener('change',renderStudents);$('studentFilterStage')?.addEventListener('change',renderStudents);
$('curriculumType').onchange=renderCurriculum;$('curriculumStage').onchange=()=>{fillGrades($('curriculumGrade'),$('curriculumStage').value);renderCurriculum()};$('curriculumGrade').onchange=renderCurriculum;
$$('[data-curriculum-view]').forEach(b=>b.onclick=()=>{curriculumViewMode=b.dataset.curriculumView==='cards'?'cards':'tree';localStorage.setItem('academy-admin-curriculum-view',curriculumViewMode);applyCurriculumView()});
$('assignType').onchange=refreshAssignmentSubjects;$('assignStage').onchange=refreshAssignmentSubjects;$('assignGrade').onchange=refreshAssignmentSubjects;$('addAssignmentBtn').onclick=addAssignment;
initAdminCollapse();
$('adminMenuBtn').onclick=()=>{$('adminSidebar').classList.add('open');$('adminOverlay').classList.remove('hidden')};$('adminOverlay').onclick=()=>{$('adminSidebar').classList.remove('open');$('adminOverlay').classList.add('hidden')};
$('adminRefreshBtn').onclick=async()=>{
 const btn=$('adminRefreshBtn');
 window.AcademyUI?.setButtonLoading(btn,true,'تحديث');
 try{
   const ok=await primeAdminRoot();if(!ok)throw new Error('admin_snapshot_failed');
   [...new Set([...ADMIN_CORE_PATHS,...pathsForTab(currentAdminTab)])].forEach(path=>attachAdminPath(path));
   renderAdminIdentity();updatePendingBadge();updateCommunityBadge();renderTab(currentAdminTab);toast('تم تحديث بيانات لوحة الإدارة');
 }catch(err){
   console.error(err);toast('تعذر تحديث البيانات الآن. تأكد من اتصال API ثم حاول مرة أخرى.','error');
 }finally{
   window.AcademyUI?.setButtonLoading(btn,false);
 }
};
$('adminLogout').onclick=async()=>{
 const ok=await askConfirm({title:'تسجيل الخروج؟',message:'سيتم إغلاق جلسة الإدارة الحالية.',tone:'warning',acceptText:'تسجيل الخروج'});
 if(!ok)return;
 try{await auth.signOut()}catch(err){console.error(err);toast('تعذر تسجيل الخروج الآن.','error')}
};
function globalSearchItems(q){
 const needle=q.trim().toLowerCase();if(!needle)return[];
 const out=[];
 values(root.lessons).forEach(x=>{
   const hay=((x.title||'')+' '+(x.subject||'')+' '+(x.teacherName||'')).toLowerCase();
   if(hay.includes(needle))out.push({type:'lesson',id:x.id,title:x.title||'درس',meta:'درس • '+(x.subject||'')});
 });
 values(root.studentProfilesV3).forEach(x=>{
   const hay=((x.name||'')+' '+(x.phone||'')+' '+(x.email||'')).toLowerCase();
   if(hay.includes(needle))out.push({type:'student',id:x.id,title:x.name||x.phone||x.email||'طالب',meta:'طالب • '+(x.phone||x.email||'')});
 });
 values(root.teacherProfiles).forEach(x=>{
   const hay=((x.name||'')+' '+(x.email||'')).toLowerCase();
   if(hay.includes(needle))out.push({type:'teacher',id:x.id,title:x.name||x.email||'مدرس',meta:'مدرس • '+(x.email||'')});
 });
 values(root.quizzes).forEach(x=>{
   const hay=((x.name||'')+' '+(x.subject||'')).toLowerCase();
   if(hay.includes(needle))out.push({type:'quiz',id:x.id,title:x.name||'اختبار',meta:'اختبار • '+(x.subject||'')});
 });
 return out.slice(0,8);
}
function hideGlobalSearch(){
 $('adminGlobalSearchResults')?.classList.add('hidden');
}
function renderGlobalSearch(q){
 const box=$('adminGlobalSearchResults');if(!box)return;
 const items=globalSearchItems(q);
 if(!q.trim()){box.innerHTML='';box.classList.add('hidden');return}
 box.innerHTML=items.length?items.map((x,i)=>
   '<button type="button" class="admin-search-result" data-admin-search-type="'+x.type+'" data-admin-search-id="'+esc(x.id)+'" role="option">'+
   '<span class="admin-search-result-icon"><i class="fa-solid '+(x.type==='lesson'?'fa-circle-play':x.type==='student'?'fa-user-graduate':x.type==='teacher'?'fa-chalkboard-user':'fa-file-circle-question')+'"></i></span>'+
   '<span><strong>'+esc(x.title)+'</strong><small>'+esc(x.meta)+'</small></span></button>'
 ).join(''):'<div class="admin-search-empty">لا توجد نتائج مطابقة.</div>';
 box.classList.remove('hidden');
 $$('[data-admin-search-type]',box).forEach(btn=>btn.onclick=async()=>{
   const type=btn.dataset.adminSearchType,id=btn.dataset.adminSearchId;
   if(type==='lesson'){
     await setTab('lessons');const item=root.lessons?.[id];$('lessonSearch').value=item?.title||'';renderLessons();
   }else if(type==='student'){
     await setTab('students');const item=root.studentProfilesV3?.[id];$('studentSearch').value=item?.name||item?.phone||item?.email||'';renderStudents();
   }else if(type==='teacher'){
     await setTab('teachers');
   }else if(type==='quiz'){
     await setTab('quizzes');const item=root.quizzes?.[id];if($('quizSearch'))$('quizSearch').value=item?.name||'';renderQuizzes();
   }
   $('adminGlobalSearch').value='';hideGlobalSearch();
 });
}
$('adminGlobalSearch').oninput=e=>renderGlobalSearch(e.target.value);
$('adminGlobalSearch').onkeydown=e=>{if(e.key==='Escape'){e.target.value='';hideGlobalSearch()}};
document.addEventListener('click',e=>{if(!e.target.closest('.admin-global-search-wrap'))hideGlobalSearch()});
if($('adminLoginForm')?.dataset.adminAuthBound!=='true'){
 $('adminLoginForm').onsubmit=async e=>{
  e.preventDefault();const btn=$('adminLoginBtn');btn.disabled=true;btn.textContent='جاري التحقق...';
  try{
   await auth.setPersistence(AcademyBackend.auth.Auth.Persistence.LOCAL);
   await auth.signInWithEmailAndPassword($('adminEmail').value.trim(),$('adminPassword').value);
  }catch(err){toast('البريد أو كلمة المرور غير صحيحة.','error')}
  finally{btn.disabled=false;btn.textContent='دخول لوحة الإدارة'}
 };
}
$('adminResetPassword').onclick=async()=>{const email=$('adminEmail').value.trim();if(!email)return toast('اكتب البريد أولًا.','error');try{await auth.sendPasswordResetEmail(email);toast('تم إرسال رابط إعادة تعيين كلمة المرور.')}catch{toast('تعذر إرسال الرابط.','error')}};
$('createTeacherForm').addEventListener('submit',createTeacherAccount);

bindHierarchy('subjectType','subjectStage','subjectGrade',null);refreshSubjectPicker();
bindHierarchy('newLessonType','newLessonStage','newLessonGrade','newLessonSubject');
bindHierarchy('newQuizType','newQuizStage','newQuizGrade','newQuizSubject');
bindHierarchy('newFileType','newFileStage','newFileGrade','newFileSubject');
['newFileType','newFileStage','newFileGrade','newFileSubject'].forEach(id=>$(id)?.addEventListener('change',()=>refreshFileLessons()));
['newLessonType','newLessonStage','newLessonGrade','newLessonSubject','newLessonUnit','newLessonTitle','newLessonContent','newLessonImage','newLessonImagePosition','newLessonHidden'].forEach(id=>{
 const el=$(id);if(!el)return;el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',renderLessonEditorPreview);
});
['newQuizType','newQuizStage','newQuizGrade','newQuizSubject','newQuizUnit','newQuizName','newQuizHidden'].forEach(id=>{
 const el=$(id);if(!el)return;el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',renderQuizEditorPreview);
});
bindHierarchy('scheduleType','scheduleStage','scheduleGrade','scheduleSubject');
bindHierarchy('simType','simStage','simGrade',null);
fillGrades($('curriculumGrade'),$('curriculumStage').value);
refreshAssignmentSubjects();

auth.onAuthStateChanged(async user=>{
 currentUser=user;
 if(unsubscribe){unsubscribe();unsubscribe=null}
 stopAdminListeners();root={};adminRootPrimed=false;
 if(!user){window.AcademyUI?.hidePageLoading();$('adminApp').classList.add('hidden');$('adminLogin').classList.remove('hidden');return}
 window.AcademyUI?.showPageLoading('جاري التحقق من صلاحيات الإدارة وتحميل البيانات...');
 try{
   const ok=await verifyAdmin(user);
   if(auth.currentUser?.uid!==user.uid)return;
   if(!ok){window.AcademyUI?.hidePageLoading();$('adminApp').classList.add('hidden');$('adminLogin').classList.remove('hidden');toast('هذا الحساب ليس له صلاحية مدير.','error');return}
   $('adminLogin').classList.add('hidden');$('adminApp').classList.remove('hidden');await startDataListener();
 }catch(err){console.error(err);window.AcademyUI?.hidePageLoading();$('adminApp').classList.add('hidden');$('adminLogin').classList.remove('hidden');toast('تعذر التحقق من صلاحية الإدارة.','error')}
});
})();
