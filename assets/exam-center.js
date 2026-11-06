(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let profile,user,access=null,data={customSubjects:{},quizzes:{},lessons:{}},filter='all';
function contentVisible(item){
 if(!item||item.isHidden||item.workflowStatus==='draft')return false;
 const at=Number(item.publishAt||0);
 return !at||at<=Date.now();
}
function formatDuration(seconds){
 const sec=Math.max(0,Number(seconds||0)),m=Math.floor(sec/60),s=Math.floor(sec%60);
 return m?(m+' د '+(s?String(s).padStart(2,'0')+' ث':'')):(s+' ث');
}
function subjectMeta(id){
 const rows=C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType)||[];
 return rows.find(s=>String(s.id)===String(id))||{id,name:C.subjectName(data,id,profile.stage,String(profile.grade),profile.educationType),emoji:'📚'};
}
function quizHref(q){return C.quizUrl({type:q.type,stage:q.stage,grade:q.grade,subject:q.subject},q.id)}
function supportHrefForQuiz(q){
 return './support.html?'+new URLSearchParams({source:'exam_center',category:'quiz_question',sourceId:q.id||'',quizId:q.id||'',quizTitle:q.name||'اختبار',type:q.type||profile?.educationType||'public',stage:q.stage||profile?.stage||'',grade:String(q.grade||profile?.grade||''),subject:q.subject||'',href:quizHref(q),title:'مشكلة في اختبار '+(q.name||'')}).toString();
}


function historyItems(){
 const raw=profile.quizHistory||{};
 return Object.entries(raw).map(([id,v])=>({id,...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function scoreClass(v){return v>=80?'good':v>=60?'mid':'low'}
function attemptsFor(sourceId){return historyItems().filter(x=>x.sourceId===sourceId)}
function bestAttempt(sourceId){
 const rows=attemptsFor(sourceId);
 return rows.length?rows.reduce((best,x)=>Number(x.score||0)>Number(best.score||0)?x:best,rows[0]):null;
}
function lessonDone(id){return !!profile.learningProgress?.[id]?.completed}
function relevantLessons(subject){
 return Object.entries(data.lessons||{}).map(([id,v])=>({id,...v})).filter(l=>
   contentVisible(l)&&l.subject===subject&&l.type===profile.educationType&&l.stage===profile.stage&&String(l.grade)===String(profile.grade)
 );
}
function quizUnlockInfo(q){
 const lessons=relevantLessons(q.subject),unit=Number(q.unit||0);
 if(q.lessonId){const related=lessons.find(lesson=>lesson.id===q.lessonId);return {unlocked:!!related&&lessonDone(q.lessonId),complete:related&&lessonDone(q.lessonId)?1:0,total:1,reason:'أكمل الدرس المرتبط لفتح الاختبار'};}
 const required=unit===0?lessons:lessons.filter(l=>Number(l.unit||1)===unit);
 const complete=required.filter(l=>lessonDone(l.id)).length;
 const unlocked=!required.length||complete===required.length;
 return {
   unlocked,
   complete,
   total:required.length,
   reason:unit===0?'أكمل جميع دروس المادة لفتح الاختبار الشامل':'أكمل دروس الوحدة لفتح الاختبار'
 };
}
function retakeHref(item){
 const q=data.quizzes?.[item.sourceId];
 if(q){
   const ctx={type:q.type||profile.educationType,stage:q.stage||profile.stage,grade:q.grade||profile.grade,subject:q.subject||item.subject||''};
   return C.quizUrl(ctx,item.sourceId);
 }
 const l=data.lessons?.[item.sourceId];
 if(l){
   const ctx={type:l.type||profile.educationType,stage:l.stage||profile.stage,grade:l.grade||profile.grade,subject:l.subject||item.subject||''};
   return C.lessonUrl(ctx,item.sourceId);
 }
 return '';
}
function historyTitle(x){
 if(x.title&&x.title!=='اختبار')return x.title;
 return data.quizzes?.[x.sourceId]?.name||data.lessons?.[x.sourceId]?.title||'محاولة اختبار';
}
function historySubjectId(x){return x.subject||data.quizzes?.[x.sourceId]?.subject||data.lessons?.[x.sourceId]?.subject||''}
function historySubject(x){return C.subjectName(data,historySubjectId(x),profile.stage,String(profile.grade),profile.educationType)}
function filteredHistory(){
 const subject=$('examSubjectFilter').value,search=($('examSearchInput')?.value||'').trim().toLowerCase();
 return historyItems().filter(x=>(!subject||historySubjectId(x)===subject)&&(!search||[historyTitle(x),historySubject(x)].join(' ').toLowerCase().includes(search)));
}
function renderHistory(){
 const h=historyItems();
 $('completedExamCount').textContent=h.length;
 const avg=h.length?Math.round(h.reduce((a,x)=>a+Number(x.score||0),0)/h.length):0;
 $('averageExamScore').textContent=avg+'%';

 $('examHistoryMini').innerHTML=h.length?h.slice(0,5).map(x=>
   '<div class="exam-history-item"><div><strong>'+C.esc(historyTitle(x))+'</strong><span>'+new Date(x.createdAt||Date.now()).toLocaleDateString('ar-EG')+'</span></div><strong class="score-pill '+scoreClass(Number(x.score||0))+'">'+Number(x.score||0)+'%</strong></div>'
 ).join(''):'<div class="exam-mini-empty"><span>📝</span><p>لسه مفيش محاولات.</p></div>';

 const visible=filteredHistory();
 $('examHistoryFull').innerHTML=visible.length?'<div class="exam-history-grid">'+visible.map(x=>{
   const href=retakeHref(x),sub=historySubject(x),score=Number(x.score||0);
   return '<article class="exam-history-card">'+
     '<div class="exam-history-card-head"><span class="exam-icon history"><i class="fa-solid fa-chart-simple"></i></span><strong class="score-pill '+scoreClass(score)+'">'+score+'%</strong></div>'+
     '<h3>'+C.esc(historyTitle(x))+'</h3>'+
     '<p>'+C.esc(sub)+' • '+new Date(x.createdAt||Date.now()).toLocaleString('ar-EG')+'</p>'+
     '<div class="exam-history-meta"><span><i class="fa-solid fa-check"></i> '+Number(x.correct||0)+' صحيحة</span><span><i class="fa-solid fa-list"></i> '+Number(x.total||0)+' سؤال</span>'+(Number(x.durationSeconds||0)?'<span><i class="fa-regular fa-clock"></i> '+formatDuration(x.durationSeconds)+'</span>':'')+'</div>'+
     (href?'<a class="btn btn-soft btn-block" href="'+href+'"><i class="fa-solid fa-rotate-right"></i> إعادة المحاولة</a>':'')+
   '</article>';
 }).join('')+'</div>':(h.length?'<div class="feature-empty"><span>🔎</span><h3>لا توجد نتائج مطابقة</h3><p>غيّر البحث أو امسح الفلاتر لاستعراض محاولاتك.</p></div>':'<div class="feature-empty"><span>📝</span><h3>لا يوجد سجل نتائج بعد</h3><p>أكمل أول اختبار وسيظهر هنا.</p></div>');
}
function quizTargetMatches(q){
 const mode=q.targetMode||'all';
 if(mode==='students'){
   const ids=Array.isArray(q.targetStudentIds)?q.targetStudentIds:Object.keys(q.targetStudentIds||{});
   return ids.includes(user?.uid);
 }
 if(mode==='group'){
   const groups=Array.isArray(profile?.groupIds)?profile.groupIds:Object.keys(profile?.groupIds||{});
   return !!q.targetGroupId&&(profile?.classGroupId===q.targetGroupId||groups.includes(q.targetGroupId));
 }
 return true;
}
function quizzes(){
 return Object.entries(data.quizzes||{}).map(([id,v])=>({id,...v})).filter(q=>
   contentVisible(q)&&q.type===profile.educationType&&q.stage===profile.stage&&String(q.grade)===String(profile.grade)&&quizTargetMatches(q)
 );
}
function renderSubjects(){
 const subs=C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType);
 $('examSubjectFilter').innerHTML='<option value="">كل المواد</option>'+subs.map(s=>'<option value="'+C.esc(s.id)+'">'+C.esc(s.name)+'</option>').join('');
}
function renderRecommended(all){
 const box=$('examRecommendedCard');if(!box)return;
 const unlocked=all.filter(q=>quizUnlockInfo(q).unlocked&&(!S||S.canAccess(q,access,q.subject)));
 if(!unlocked.length){box.classList.add('hidden');return}
 const fresh=unlocked.filter(q=>!bestAttempt(q.id));
 let pick=fresh[0];
 if(!pick){
   pick=unlocked.slice().sort((a,b)=>Number(bestAttempt(a.id)?.score??100)-Number(bestAttempt(b.id)?.score??100))[0];
 }
 if(!pick){box.classList.add('hidden');return}
 const best=bestAttempt(pick.id),sub=subjectMeta(pick.subject),unit=Number(pick.unit||0),questions=pick.questions?.length||0,duration=Number(pick.durationMinutes||0);
 box.classList.remove('hidden');
 $('examRecommendedTitle').textContent=pick.name||'اختبار مقترح';
 $('examRecommendedText').textContent=best?'دي أقل نتيجة محتاجة تحسين عندك حاليًا — جرّب مرة تانية بعد مراجعة سريعة.':'اختبار متاح لم تجربه بعد، وده أفضل وقت تبدأ به.';
 $('examRecommendedMeta').innerHTML='<span><i class="fa-solid fa-book-open"></i> '+C.esc(sub.name||'المادة')+'</span><span><i class="fa-regular fa-circle-question"></i> '+questions+' سؤال</span><span><i class="fa-regular fa-clock"></i> '+(duration?duration+' دقيقة':'بدون حد زمني')+'</span>'+(best?'<span><i class="fa-solid fa-trophy"></i> أفضل نتيجة '+Number(best.score||0)+'%</span>':'')+'<span><i class="fa-solid fa-layer-group"></i> '+(unit===0?'اختبار شامل':'الوحدة '+unit)+'</span>';
 $('examRecommendedAction').href=quizHref(pick);
 $('examRecommendedAction').innerHTML=best?'حسّن نتيجتك <i class="fa-solid fa-arrow-left"></i>':'ابدأ الآن <i class="fa-solid fa-arrow-left"></i>';
}
function render(){
 renderHistory();
 $('examStreak').textContent=profile.stats?.streak||0;
 const all=quizzes(),available=all.filter(q=>quizUnlockInfo(q).unlocked&&(!S||S.canAccess(q,access,q.subject)));
 $('availableExamCount').textContent=available.length;

 if(filter==='history'){
   $('examRecommendedCard')?.classList.add('hidden');
   $('examList').classList.add('hidden');$('examHistoryFull').classList.remove('hidden');
   $('examResultCount').textContent=filteredHistory().length+' محاولة';
   $('examListHint').textContent='راجع نتائجك وأعد الاختبارات التي تحتاج تحسينًا.';
   return;
 }
 $('examHistoryFull').classList.add('hidden');$('examList').classList.remove('hidden');
 renderRecommended(all);

 const subject=$('examSubjectFilter').value,search=($('examSearchInput')?.value||'').trim().toLowerCase();
 const list=all.filter(q=>{
   const sub=C.subjectName(data,q.subject,q.stage,String(q.grade),q.type);
   const matchesSubject=!subject||q.subject===subject;
   const matchesType=filter==='all'||(filter==='unit'&&Number(q.unit||0)>0)||(filter==='comprehensive'&&Number(q.unit||0)===0);
   const matchesSearch=!search||(q.name||'اختبار').toLowerCase().includes(search)||sub.toLowerCase().includes(search);
   return matchesSubject&&matchesType&&matchesSearch;
 });
 $('examResultCount').textContent=list.length+' اختبار';
 $('examListHint').textContent=list.length?'اختر اختبارًا مناسبًا وابدأ عندما تكون جاهزًا.':'غيّر الفلاتر أو ابحث باسم مادة أخرى.';

 $('examList').innerHTML=list.length?list.map((q,index)=>{
   const sub=subjectMeta(q.subject),unlock=quizUnlockInfo(q),subLocked=!!S&&!S.canAccess(q,access,q.subject),best=bestAttempt(q.id),unit=Number(q.unit||0),questions=q.questions?.length||0,duration=Number(q.durationMinutes||0);
   const kind=unit===0?'اختبار شامل':'اختبار الوحدة '+unit,status=subLocked?'يتطلب اشتراك':unlock.unlocked?(best?'تمت المحاولة':'جاهز الآن'):'مغلق';
   const safeImage=window.AcademyUtils?.safeUrl(sub.imageUrl||'')||'',progress=unlock.total?Math.round(unlock.complete/unlock.total*100):unlock.unlocked?100:0;
   const palette=['blue','violet','green','orange','rose','teal'][index%6];
   return '<article class="exam-card-v5 '+palette+' '+(!subLocked&&unlock.unlocked?'available':'locked')+'">'+
     '<div class="exam-card-cover-v5 '+(safeImage?'has-image':'')+'">'+
       (window.AcademyStudentDesign?.subjectArt(q.subject,sub.emoji||'🧠')||'<span class="academy-emoji">'+C.esc(sub.emoji||'🧠')+'</span>')+
       (safeImage?'<img class="tools-cover-image" data-tools-image src="'+C.esc(safeImage)+'" alt="" loading="lazy">':'')+
       '<em>'+C.esc(sub.name||'المادة')+'</em><b class="exam-status '+(!subLocked&&unlock.unlocked?(best?'attempted':'ready'):'locked')+'">'+status+'</b>'+
     '</div>'+
     '<div class="exam-card-body-v5">'+
       '<div class="exam-card-title-row-v5"><div><small>'+kind+'</small><h3>'+C.esc(q.name||'اختبار')+(q.isFree?' <span class="subscription-access-pill">مجاني</span>':subLocked?' <span class="subscription-access-pill paid">اشتراك</span>':'')+'</h3></div><span class="exam-card-arrow-v5"><i class="fa-solid '+(!subLocked&&unlock.unlocked?'fa-arrow-left':'fa-lock')+'"></i></span></div>'+
       '<div class="exam-card-metrics-v5"><span><i class="fa-regular fa-circle-question"></i><b>'+questions+'</b><small>سؤال</small></span><span><i class="fa-regular fa-clock"></i><b>'+(duration||'∞')+'</b><small>'+(duration?'دقيقة':'بدون حد')+'</small></span><span><i class="fa-solid fa-trophy"></i><b>'+(best?Number(best.score||0)+'%':'—')+'</b><small>أفضل نتيجة</small></span></div>'+
       (unlock.total?'<div class="exam-unlock-progress-v5"><div><span style="width:'+progress+'%"></span></div><small>'+unlock.complete+' من '+unlock.total+' دروس مكتملة</small></div>':'')+
       '<div class="exam-card-foot-v5 exam-card-actions">'+
       (subLocked?'<button class="btn btn-soft subscription-exam-lock" data-subscription-exam="'+q.id+'"><i class="fa-solid fa-crown"></i> يتطلب اشتراك</button>':unlock.unlocked?'<a class="btn btn-primary" href="'+quizHref(q)+'">'+(best?'إعادة الاختبار':'ابدأ الاختبار')+' <i class="fa-solid fa-arrow-left"></i></a>':'<button class="btn btn-soft locked-exam-btn" data-locked-exam="'+q.id+'" data-lock-reason="'+C.esc(unlock.reason)+'"><i class="fa-solid fa-lock"></i> أكمل المتطلبات أولًا</button>')+
       '<a class="btn btn-soft support-report-link" href="'+supportHrefForQuiz(q)+'"><i class="fa-regular fa-flag"></i> إبلاغ</a>'+
       '</div>'+
     '</div></article>';
 }).join(''):'<div class="feature-empty"><span>📭</span><h3>لا توجد اختبارات مطابقة</h3><p>جرّب مادة أخرى أو غيّر عبارة البحث.</p></div>';

 $$('[data-subscription-exam]').forEach(btn=>btn.onclick=()=>S?.lockOverlay({title:'هذا الاختبار ضمن الاشتراك',text:'فعّل باقة تشمل هذه المادة لتبدأ الاختبار.'}));
 $$('[data-locked-exam]').forEach(btn=>btn.onclick=()=>C.toast(btn.dataset.lockReason||'أكمل الدروس المطلوبة أولًا.','error'));
}
$$('[data-exam-filter]').forEach(b=>b.onclick=()=>{
 filter=b.dataset.examFilter;
 $$('[data-exam-filter]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',active?'true':'false')});
 render();
});
$('examSubjectFilter').onchange=render;
$('examSearchInput')?.addEventListener('input',render);
$('examClearFilters')?.addEventListener('click',()=>{$('examSearchInput').value='';$('examSubjectFilter').value='';render()});

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز اختباراتك...');
 try{
   ({user,profile}=await C.requireStudent());
   access=S?await S.load(user.uid,profile,true):null;
   $('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   $('examHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — اختبارات مناسبة لمرحلتك.';
   const [s,q,l]=await Promise.all([
     C.db.ref('customSubjects').once('value'),
     C.db.ref('quizzes').orderByChild('stage').equalTo(profile.stage).once('value'),
     C.db.ref('lessons').orderByChild('stage').equalTo(profile.stage).once('value')
   ]);
   data={customSubjects:s.val()||{},quizzes:q.val()||{},lessons:l.val()||{}};
   renderSubjects();render();
 }catch(err){
   console.error(err);
   C.toast('تعذر تحميل مركز الاختبارات الآن.','error');
   $('examList').innerHTML='<div class="feature-empty"><span>⚠️</span><h3>تعذر تحميل الاختبارات</h3><p>تحقق من الاتصال ثم حاول مرة أخرى.</p><button type="button" class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button></div>';
 }finally{
   window.AcademyUI?.hidePageLoading();
 }
})();
})();
