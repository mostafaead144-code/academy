(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),DAY=86400000;if(!C)return;
let user,profile,mistakes=[],archive={},mode='due',subjectFilter='',queue=[],index=0,answered=false;
const qs=new URLSearchParams(location.search),sourceFilter=qs.get('source')||'',initialSubject=qs.get('subject')||'',teacherFilter=qs.get('teacher')||'';
const subjectLabel=id=>({arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',studies:'الدراسات الاجتماعية',religion:'التربية الدينية'}[id]||id||'المادة');
const flat=o=>{const a=[];Object.entries(o||{}).forEach(([sourceId,g])=>Object.entries(g||{}).forEach(([key,v])=>a.push({sourceId,key,...(v||{})})));return a};
const due=q=>!Number(q.nextReviewAt||0)||Number(q.nextReviewAt)<=Date.now();
const qid=q=>(q.sourceId+'__'+q.key).replace(/[.#$\[\]\/]/g,'_');
function filtered(){
 let a=mistakes.filter(q=>(!sourceFilter||q.sourceId===sourceFilter)&&(!teacherFilter||q.teacherId===teacherFilter)&&(!subjectFilter||q.subject===subjectFilter));
 if(mode==='due')a=a.filter(due);
 return a.sort((x,y)=>Number(x.nextReviewAt||0)-Number(y.nextReviewAt||0)||Number(x.updatedAt||0)-Number(y.updatedAt||0));
}
function stats(){
 $('reviewTotal').textContent=mistakes.length;$('reviewDue').textContent=mistakes.filter(due).length;
 let mastered=0;Object.values(archive||{}).forEach(g=>mastered+=Object.keys(g||{}).length);$('reviewMastered').textContent=mastered;
}
function renderFilters(){
 const subjects=[...new Set(mistakes.map(x=>x.subject).filter(Boolean))];
 $('reviewSubjectFilter').innerHTML='<option value="">كل المواد</option>'+subjects.map(id=>'<option value="'+C.esc(id)+'">'+C.esc(subjectLabel(id))+'</option>').join('');
 if(initialSubject&&subjects.includes(initialSubject)){subjectFilter=initialSubject;$('reviewSubjectFilter').value=initialSubject}
}
function scheduleLabel(q){
 if(!q.nextReviewAt)return'جاهز الآن';
 const diff=Number(q.nextReviewAt)-Date.now();if(diff<=0)return'مستحق الآن';
 const d=Math.ceil(diff/DAY);return d===1?'غدًا':'بعد '+d+' أيام';
}
function sourceHref(q){
 const ctx={type:q.type||profile.educationType||'public',stage:q.stage||profile.stage||'prep',grade:String(q.grade||profile.grade||1),subject:q.subject||''};
 const href=q.sourceType==='quiz'?C.quizUrl(ctx,q.sourceId):C.lessonUrl(ctx,q.sourceId),url=new URL(href,location.href);
 if(q.teacherId)url.searchParams.set('teacher',q.teacherId);
 return url.pathname+url.search;
}
function renderOverview(){
 const a=filtered();$('reviewOverviewBadge').textContent=a.length+' سؤال';
 $('reviewOverviewTitle').textContent=a.length?(mode==='due'?'هذه الأسئلة أولويتك الآن':'كل أخطائك النشطة'):'لا توجد مراجعات في هذا القسم 🎉';
 $('reviewOverviewText').textContent=a.length?'ابدأ بجلسة قصيرة. النظام يرتب الأسئلة حسب موعد المراجعة وليس عشوائيًا.':'يمكنك العودة لاحقًا أو حل اختبارات جديدة لإضافة أسئلة تحتاج تثبيتًا.';
 $('reviewDueList').innerHTML=a.length?a.slice(0,8).map(q=>'<div class="growth-row"><div class="growth-row-main"><span>🧠</span><div><strong>'+C.esc(q.title||q.text||'سؤال')+'</strong><small>'+C.esc(subjectLabel(q.subject))+' • '+scheduleLabel(q)+' • سلسلة '+Number(q.reviewStreak||0)+'/3</small></div></div>'+'<a href="'+C.esc(sourceHref(q))+'">'+(q.sourceType==='quiz'?'الاختبار':'الدرس')+'</a>'+'</div>').join(''):'<div class="growth-empty">دفتر المراجعة في هذا الفلتر فارغ.</div>';
 stats();
}
function start(){
 queue=filtered().slice(0,20);index=0;if(!queue.length){C.toast('لا توجد أسئلة للمراجعة في هذا القسم.','error');return}
 $('reviewOverview').classList.add('hidden');$('reviewSession').classList.remove('hidden');renderQuestion();$('reviewSession').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderQuestion(){
 const q=queue[index];if(!q){finish();return}answered=false;$('reviewQuestionMeta').textContent=subjectLabel(q.subject)+' • '+(q.title||'مراجعة خطأ');$('reviewQuestionText').textContent=q.text||'السؤال';
 $('reviewSessionProgress').textContent=(index+1)+' / '+queue.length;$('reviewFeedback').className='review-feedback hidden';$('reviewFeedback').textContent='';$('reviewNextSchedule').textContent='اختر إجابتك أولًا.';$('reviewNextBtn').disabled=true;$('reviewNextBtn').textContent=index===queue.length-1?'إنهاء المراجعة':'السؤال التالي';$('reviewNextBtn').onclick=()=>{index++;renderQuestion()};
 const opts=Array.isArray(q.opts)?q.opts:[];$('reviewOptions').innerHTML=opts.map((o,i)=>'<button type="button" data-review-answer="'+i+'">'+C.esc(o)+'</button>').join('');
 document.querySelectorAll('[data-review-answer]').forEach(b=>b.onclick=()=>answer(q,Number(b.dataset.reviewAnswer)));
}
async function answer(q,chosen,retry=false){
 if(answered&&!retry)return;answered=true;$('reviewNextBtn').disabled=true;const correct=Number(q.correctAnswer),ok=chosen===correct;
 document.querySelectorAll('[data-review-answer]').forEach((b,i)=>{b.disabled=true;if(i===correct)b.classList.add('correct');else if(i===chosen&&!ok)b.classList.add('wrong')});
 const streak=ok?Number(q.reviewStreak||0)+1:0,total=Number(q.correctReviews||0)+(ok?1:0),level=ok?Math.min(4,Number(q.reviewLevel||0)+1):0,intervals=[1,3,7,14,30],next=Date.now()+intervals[Math.max(0,level-1)]*DAY;
 const feedback=$('reviewFeedback');feedback.className='review-feedback '+(ok?'good':'bad');feedback.textContent=ok?'إجابة صحيحة ✅':'إجابة غير صحيحة. الصحيح: '+String(q.opts?.[correct]??'');
 let mastered=ok&&streak>=3;
 const patch={reviewLevel:level,reviewStreak:streak,correctReviews:total,lastReviewedAt:Date.now(),nextReviewAt:next,chosen,updatedAt:Date.now()};
 try{
   const base='studentProfilesV3/'+user.uid+'/mistakeNotebook/'+q.sourceId+'/'+q.key;
   if(mastered){
     await C.db.ref().update({['studentProfilesV3/'+user.uid+'/reviewArchive/'+q.sourceId+'/'+q.key]:{...q,...patch,masteredAt:Date.now()},[base]:null});
     mistakes=mistakes.filter(x=>!(x.sourceId===q.sourceId&&x.key===q.key));archive[q.sourceId]=archive[q.sourceId]||{};archive[q.sourceId][q.key]={...q,...patch,masteredAt:Date.now()};
   }else{
     await C.db.ref(base).update(patch);Object.assign(q,patch);
   }
   C.db.ref('learningV4/reviews/'+user.uid+'/'+qid(q)).set({questionId:qid(q),sourceId:q.sourceId,teacherId:q.teacherId||'',teacherName:q.teacherName||'',subject:q.subject||'',title:q.title||'',text:q.text||'',opts:q.opts||[],correctAnswer:correct,nextReviewAt:mastered?Date.now()+30*DAY:next,correctReviews:total,status:mastered?'mastered':'learning',updatedAt:Date.now()}).catch(()=>{});
 }catch(err){
   console.error(err);C.toast('تعذر حفظ نتيجة المراجعة. حاول الحفظ مرة أخرى.','error');
   $('reviewNextSchedule').textContent='لم يتم تأكيد حفظ النتيجة. تحقق من الاتصال وأعد المحاولة.';
   $('reviewNextBtn').textContent='إعادة حفظ النتيجة';$('reviewNextBtn').disabled=false;
   $('reviewNextBtn').onclick=()=>answer(q,chosen,true);return;
 }
 $('reviewNextSchedule').textContent=mastered?'أتقنت السؤال 🎉 وتم نقله من دفتر الأخطاء.':ok?'المراجعة التالية: '+new Date(next).toLocaleDateString('ar-EG',{day:'numeric',month:'long'}):'سيعود السؤال غدًا لتثبيته.';
 $('reviewNextBtn').textContent=index===queue.length-1?'إنهاء المراجعة':'السؤال التالي';$('reviewNextBtn').onclick=()=>{index++;renderQuestion()};$('reviewNextBtn').disabled=false;stats();
}
function finish(){
 $('reviewSession').classList.add('hidden');$('reviewOverview').classList.remove('hidden');renderOverview();C.toast('انتهت جلسة المراجعة ✅');
}
$('reviewNextBtn').onclick=()=>{index++;renderQuestion()};
$('startSmartReview').onclick=start;
document.querySelectorAll('[data-review-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.reviewMode;document.querySelectorAll('[data-review-mode]').forEach(x=>x.classList.toggle('active',x===b));renderOverview()});
$('reviewSubjectFilter').onchange=e=>{subjectFilter=e.target.value;renderOverview()};

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز مراجعتك الذكية...');
 try{
   ({user,profile}=await C.requireStudent());$('reviewAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   mistakes=flat(profile.mistakeNotebook);archive=profile.reviewArchive||{};renderFilters();renderOverview();
   if(sourceFilter){mode='all';document.querySelectorAll('[data-review-mode]').forEach(x=>x.classList.toggle('active',x.dataset.reviewMode==='all'));renderOverview()}
 }catch(err){console.error(err);C.toast('تعذر تحميل دفتر المراجعة.','error')}
 finally{window.AcademyUI?.hidePageLoading()}
})();
})();