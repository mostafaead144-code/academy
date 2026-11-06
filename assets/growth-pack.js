(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(window.ACADEMY_BACKEND_CONFIG);
const auth=AcademyBackend.auth(),db=AcademyBackend.database(),DAY=86400000;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const values=o=>Object.entries(o||{}).map(([id,v])=>({id,...(v||{})}));
const path=location.pathname.split('/').pop()||'index.html';
const qs=new URLSearchParams(location.search);
const visible=x=>x&&x.isHidden!==true&&(!Number(x.publishAt||0)||Number(x.publishAt)<=Date.now());
const sameCtx=(x,p)=>visible(x)&&(!x.type||x.type===p.educationType)&&(!x.stage||x.stage===p.stage)&&(!x.grade||String(x.grade)===String(p.grade));
const waitUser=()=>new Promise(resolve=>{const off=auth.onAuthStateChanged(u=>{off();resolve(u)})});
const profileOf=async uid=>(await db.ref('studentProfilesV3/'+uid).once('value')).val()||{};
function flatMistakes(profile){
 const out=[];Object.entries(profile?.mistakeNotebook||{}).forEach(([sourceId,group])=>Object.entries(group||{}).forEach(([key,m])=>out.push({sourceId,key,...(m||{})})));
 return out;
}
function history(profile){return Object.values(profile?.quizHistory||{}).filter(Boolean)}
function avg(list,key='score'){return list.length?Math.round(list.reduce((n,x)=>n+Number(x?.[key]||0),0)/list.length):0}
function fmtDate(ts){return ts?new Date(Number(ts)).toLocaleDateString('ar-EG',{day:'numeric',month:'short'}):'—'}
function safeHref(href){return String(href||'').startsWith('./')?href:'#'}
function insertAfter(anchor,html){
 if(!anchor||document.getElementById('growthPackAnchor'))return null;
 const wrap=document.createElement('section');wrap.id='growthPackAnchor';wrap.className='container growth-surface';wrap.innerHTML=html;anchor.insertAdjacentElement('afterend',wrap);return wrap;
}
function subjectUrl(ctx,id){return './subject.html?'+new URLSearchParams({...ctx,subject:id}).toString()}
function lessonUrl(ctx,id){return './lesson.html?'+new URLSearchParams({...ctx,id}).toString()}
function subjectLabel(id){const common={arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',studies:'الدراسات الاجتماعية',religion:'التربية الدينية'};return common[id]||id||'المادة'}

async function enhanceSubject(){
 const C=window.AcademyCore;if(!C)return;
 const user=await waitUser();if(!user)return;
 const profile=await profileOf(user.uid),ctx={type:qs.get('type')||profile.educationType||'public',stage:qs.get('stage')||profile.stage||'prep',grade:qs.get('grade')||profile.grade||1,subject:qs.get('subject')||''};
 if(!ctx.subject)return;
 const [ls,qq]=await Promise.all([db.ref('lessons').orderByChild('subject').equalTo(ctx.subject).once('value'),db.ref('quizzes').orderByChild('subject').equalTo(ctx.subject).once('value')]);
 const lessons=values(ls.val()).filter(x=>sameCtx(x,{educationType:ctx.type,stage:ctx.stage,grade:ctx.grade})).sort((a,b)=>Number(a.unit||1)-Number(b.unit||1)||Number(a.order||0)-Number(b.order||0));
 const quizzes=values(qq.val()).filter(x=>sameCtx(x,{educationType:ctx.type,stage:ctx.stage,grade:ctx.grade}));
 const incomplete=lessons.filter(l=>!profile.learningProgress?.[l.id]?.completed),done=lessons.length-incomplete.length;
 const attempts=history(profile).filter(x=>x.subject===ctx.subject),mistakes=flatMistakes(profile).filter(x=>x.subject===ctx.subject);
 const tried=new Set(attempts.map(x=>x.sourceId)),openQuizzes=quizzes.filter(q=>!tried.has(q.id)).length,best=attempts.length?Math.max(...attempts.map(x=>Number(x.score||0))):0;
 let actionTitle='ابدأ أول درس',actionHref=incomplete[0]?lessonUrl(ctx,incomplete[0].id):'./exam-center.html?subject='+encodeURIComponent(ctx.subject),actionIcon='fa-play';
 if(mistakes.length>=3){actionTitle='راجع '+mistakes.length+' أخطاء قبل التقدم';actionHref='./smart-review.html?subject='+encodeURIComponent(ctx.subject);actionIcon='fa-rotate'}
 else if(incomplete[0]) actionTitle='كمّل: '+(incomplete[0].title||'الدرس التالي');
 else if(openQuizzes){actionTitle='انتقل لاختبارات المادة';actionIcon='fa-file-circle-question'}
 else {actionTitle='حافظ على الإتقان بالمراجعة';actionHref='./smart-review.html?subject='+encodeURIComponent(ctx.subject);actionIcon='fa-brain'}
 const pct=lessons.length?Math.round(done/lessons.length*100):0;
 const html='<article class="growth-card"><div class="growth-head"><div><span class="growth-kicker">لوحة قيادة المادة</span><h2>اعرف مكانك والخطوة التالية بدون تشتت</h2><p class="growth-muted">نجمع الدروس والاختبارات والأخطاء في قرار واحد واضح.</p></div><span class="growth-pill '+(pct===100?'good':'')+'"><i class="fa-solid fa-route"></i> '+pct+'% مكتمل</span></div>'+
 '<div class="growth-grid"><div class="growth-metric"><i class="fa-solid fa-book-open"></i><div><strong>'+incomplete.length+'</strong><small>درس متبقٍ</small></div></div><div class="growth-metric"><i class="fa-solid fa-file-circle-question"></i><div><strong>'+openQuizzes+'</strong><small>اختبار لم تجربه</small></div></div><div class="growth-metric"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>'+mistakes.length+'</strong><small>خطأ للمراجعة</small></div></div><div class="growth-metric"><i class="fa-solid fa-trophy"></i><div><strong>'+best+'%</strong><small>أفضل نتيجة</small></div></div></div>'+
 '<div class="growth-progress"><span style="width:'+pct+'%"></span></div><div class="growth-action"><div class="growth-action-copy"><small>الأولوية الآن</small><strong>'+esc(actionTitle)+'</strong></div><a href="'+esc(safeHref(actionHref))+'"><i class="fa-solid '+actionIcon+'"></i> ابدأ الآن</a></div>'+
 (mistakes.length?'<div class="growth-review-banner"><div><strong>عندك '+mistakes.length+' نقطة تحتاج تثبيت</strong><div class="growth-muted">المراجعة الذكية ستعيد لك الأسئلة على فترات حتى تثبت المعلومة.</div></div><a href="./smart-review.html?subject='+encodeURIComponent(ctx.subject)+'">افتح المراجعة الذكية</a></div>':'')+'</article>';
 insertAfter(document.querySelector('.subject-path-section'),html);
}

async function enhanceLesson(){
 const C=window.AcademyCore;if(!C||!qs.get('id'))return;
 const user=await waitUser();if(!user)return;
 const id=qs.get('id'),[ps,ls]=await Promise.all([db.ref('studentProfilesV3/'+user.uid).once('value'),db.ref('lessons/'+id).once('value')]);
 const profile=ps.val()||{},lesson=ls.val()||{};if(!lesson||!Object.keys(lesson).length)return;
 const ctx={type:lesson.type||qs.get('type')||profile.educationType||'public',stage:lesson.stage||qs.get('stage')||profile.stage||'prep',grade:lesson.grade||qs.get('grade')||profile.grade||1,subject:lesson.subject||qs.get('subject')||''};
 let mastery={};try{mastery=(await db.ref('learningV4/mastery/'+user.uid+'/'+ctx.type+'/'+ctx.stage+'/'+ctx.grade+'/'+ctx.subject+'/'+id).once('value')).val()||{}}catch{}
 const mistakes=flatMistakes(profile).filter(x=>x.sourceId===id),attempts=history(profile).filter(x=>x.sourceId===id).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
 const last=attempts[0],completed=!!profile.learningProgress?.[id]?.completed,video=Math.round(Number(mastery.video||0)),quiz=last?Number(last.score||0):Math.round(Number(mastery.quiz||0));
 const steps=[video>=70||!lesson.videos?.length,!!last,mistakes.length===0&&!!last,completed],progress=Math.round(steps.filter(Boolean).length/steps.length*100);
 let next='شاهد الشرح حتى النهاية',href='#lessonVideoTheater';
 if(steps[0]&&!steps[1]){next='ابدأ تدريب الدرس';href='#lessonQuizPanel'}
 else if(steps[1]&&mistakes.length){next='ثبّت أخطاء هذا الدرس';href='./smart-review.html?source='+encodeURIComponent(id)}
 else if(steps[2]&&!completed){next='علّم الدرس كمكتمل';href='#lessonFinishCard'}
 else if(completed){next='انتقل إلى الخطوة التالية';href='#lessonFinishCard'}
 const html='<article class="growth-card"><div class="growth-head"><div><span class="growth-kicker">مؤشر جاهزية الدرس</span><h2>أكمل الدرس كرحلة واحدة</h2><p class="growth-muted">الشرح ثم التدريب ثم تثبيت الأخطاء ثم الإكمال.</p></div><span class="growth-pill '+(progress===100?'good':'')+'">'+progress+'% جاهزية</span></div>'+
 '<div class="growth-grid"><div class="growth-metric"><i class="fa-solid fa-circle-play"></i><div><strong>'+video+'%</strong><small>تقدم الفيديو</small></div></div><div class="growth-metric"><i class="fa-solid fa-bullseye"></i><div><strong>'+quiz+'%</strong><small>آخر تدريب</small></div></div><div class="growth-metric"><i class="fa-solid fa-rotate"></i><div><strong>'+mistakes.length+'</strong><small>أخطاء نشطة</small></div></div><div class="growth-metric"><i class="fa-solid fa-circle-check"></i><div><strong>'+(completed?'تم':'—')+'</strong><small>حالة الدرس</small></div></div></div>'+
 '<div class="growth-action"><div class="growth-action-copy"><small>خطوتك داخل الدرس</small><strong>'+esc(next)+'</strong></div>'+(String(href).startsWith('./')?'<a href="'+esc(href)+'">نفّذ الخطوة</a>':'<button type="button" id="growthLessonJump">نفّذ الخطوة</button>')+'</div>'+
 (last?'<div class="growth-pills"><span class="growth-pill '+(last.score>=80?'good':last.score<60?'bad':'warn')+'">آخر نتيجة '+Number(last.score||0)+'%</span><span class="growth-pill">آخر محاولة '+fmtDate(last.createdAt)+'</span>'+(mistakes.length?'<a class="growth-pill warn" href="./smart-review.html?source='+encodeURIComponent(id)+'">راجع أخطاء الدرس</a>':'')+'</div>':'')+'</article>';
 const wrap=insertAfter(document.querySelector('.lesson-journey-strip'),html);
 wrap?.querySelector('#growthLessonJump')?.addEventListener('click',()=>document.querySelector(href)?.scrollIntoView({behavior:'smooth',block:'start'}));
}

async function enhanceExamCenter(){
 const C=window.AcademyCore;if(!C)return;
 const user=await waitUser();if(!user)return;
 const profile=await profileOf(user.uid),attempts=history(profile),mistakes=flatMistakes(profile);
 const recent=attempts.filter(x=>Number(x.createdAt||0)>=Date.now()-14*DAY),previous=attempts.filter(x=>Number(x.createdAt||0)<Date.now()-14*DAY&&Number(x.createdAt||0)>=Date.now()-28*DAY);
 const delta=avg(recent)-avg(previous),bySubject={};
 attempts.forEach(x=>{if(!x.subject)return;(bySubject[x.subject]??=[]).push(x)});
 const weakest=Object.entries(bySubject).map(([subject,list])=>({subject,score:avg(list)})).sort((a,b)=>a.score-b.score)[0];
 const html='<article class="growth-card"><div class="growth-head"><div><span class="growth-kicker">تحليل الاستعداد</span><h2>اختبر ما يحتاجه مستواك الآن</h2><p class="growth-muted">نعتمد على نتائجك الأخيرة ودفتر الأخطاء لتحديد أولوية المراجعة.</p></div><a class="growth-pill warn" href="./smart-review.html"><i class="fa-solid fa-rotate"></i> '+mistakes.length+' خطأ نشط</a></div>'+
 '<div class="growth-grid"><div class="growth-metric"><i class="fa-solid fa-chart-line"></i><div><strong>'+avg(recent)+'%</strong><small>متوسط 14 يومًا</small></div></div><div class="growth-metric"><i class="fa-solid '+(delta>=0?'fa-arrow-trend-up':'fa-arrow-trend-down')+'"></i><div><strong>'+(delta>0?'+':'')+delta+'</strong><small>تغير الأداء</small></div></div><div class="growth-metric"><i class="fa-solid fa-layer-group"></i><div><strong>'+Object.keys(bySubject).length+'</strong><small>مواد مختبرة</small></div></div><div class="growth-metric"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>'+(weakest?weakest.score+'%':'—')+'</strong><small>'+(weakest?'أضعف: '+esc(subjectLabel(weakest.subject)):'لا توجد بيانات كافية')+'</small></div></div></div>'+
 '<div class="growth-action"><div class="growth-action-copy"><small>اقتراح قبل الاختبار التالي</small><strong>'+(mistakes.length?'راجع أخطاءك المستحقة ثم أعد الاختبار':'ابدأ اختبارًا جديدًا وحافظ على سجل منتظم')+'</strong></div><a href="'+(mistakes.length?'./smart-review.html':'#examList')+'">'+(mistakes.length?'المراجعة الذكية':'استعرض الاختبارات')+'</a></div></article>';
 const hero=document.querySelector('.feature-hero');if(hero)insertAfter(hero,html);
}

async function enhanceProfile(){
 const user=await waitUser();if(!user)return;
 const profile=await profileOf(user.uid),mistakes=flatMistakes(profile);
 const tab=document.getElementById('tab-mistakes');if(!tab||document.getElementById('profileSmartReviewCard'))return;
 const due=mistakes.filter(x=>!Number(x.nextReviewAt||0)||Number(x.nextReviewAt)<=Date.now()),subjects=new Set(mistakes.map(x=>x.subject).filter(Boolean));
 const card=document.createElement('article');card.id='profileSmartReviewCard';card.className='profile-card growth-card';card.innerHTML='<div class="growth-head"><div><span class="growth-kicker">المراجعة المتباعدة</span><h2>حوّل الأخطاء إلى نقاط قوة</h2><p class="growth-muted">الإجابة الصحيحة عدة مرات على فترات تنقل السؤال تلقائيًا خارج دفتر الأخطاء.</p></div><span class="growth-pill '+(due.length?'warn':'good')+'">'+due.length+' مستحق الآن</span></div><div class="growth-grid"><div class="growth-metric"><i class="fa-solid fa-list-check"></i><div><strong>'+mistakes.length+'</strong><small>إجمالي الأخطاء</small></div></div><div class="growth-metric"><i class="fa-solid fa-clock-rotate-left"></i><div><strong>'+due.length+'</strong><small>للمراجعة الآن</small></div></div><div class="growth-metric"><i class="fa-solid fa-book"></i><div><strong>'+subjects.size+'</strong><small>مواد تحتاج تثبيت</small></div></div><div class="growth-metric"><i class="fa-solid fa-fire"></i><div><strong>'+mistakes.filter(x=>Number(x.correctReviews||0)>0).length+'</strong><small>بدأت تتحسن</small></div></div></div><div class="growth-action"><div class="growth-action-copy"><small>جلسة قصيرة ومركزة</small><strong>'+(mistakes.length?'ابدأ بأكثر الأخطاء استحقاقًا الآن':'دفتر أخطائك نظيف حاليًا')+'</strong></div><a href="./smart-review.html">'+(mistakes.length?'ابدأ المراجعة':'فتح المركز')+'</a></div>';
 tab.insertBefore(card,document.getElementById('mistakeNotebookList'));
}

async function enhanceTeacher(){
 const user=await waitUser();if(!user)return;
 const tSnap=await db.ref('teacherProfiles/'+user.uid).once('value');if(!tSnap.exists())return;
 const tab=document.getElementById('teacher-tab-students');if(!tab||document.getElementById('teacherGrowthGroups'))return;
 const host=document.createElement('section');host.id='teacherGrowthGroups';host.className='teacher-grid';host.innerHTML='<article class="teacher-card"><div class="teacher-card-head"><div><span class="section-kicker">الفصول والمجموعات</span><h3>أنشئ مجموعة تستهدفها بضغطة واحدة</h3></div><span>👥</span></div><form id="teacherGroupForm" class="teacher-group-form"><input id="teacherGroupName" required maxlength="80" placeholder="اسم المجموعة — مثال: 1 إعدادي A"><input id="teacherGroupSubject" maxlength="60" placeholder="المادة أو رمزها"><input id="teacherGroupGrade" maxlength="30" placeholder="الصف"><textarea class="full" id="teacherGroupMembers" rows="3" placeholder="معرّفات الطلاب UID مفصولة بفاصلة أو كل طالب في سطر"></textarea><button class="full" type="submit"><i class="fa-solid fa-plus"></i> حفظ المجموعة</button></form><div id="teacherGroupList" class="teacher-group-list"></div></article><article class="teacher-card"><div class="teacher-card-head"><div><span class="section-kicker">مؤشر الاختبارات</span><h3>أين يحتاج طلابك دعمًا؟</h3></div><span>📊</span></div><div id="teacherGrowthAnalytics" class="growth-list"><div class="growth-empty">يتم تحليل نتائج محتواك...</div></div></article>';
 tab.appendChild(host);
 let groups={};
 const groupsRef=db.ref('teacherGroupsV4/'+user.uid);
 function renderGroups(){
   const arr=values(groups);
   document.getElementById('teacherGroupList').innerHTML=arr.length?arr.map(g=>'<div class="teacher-group-item"><div><strong>'+esc(g.name||'مجموعة')+'</strong><small>'+esc(g.subject||'بدون مادة')+' • '+esc(g.grade||'بدون صف')+' • '+(Array.isArray(g.members)?g.members.length:0)+' طالب</small></div><button type="button" data-delete-growth-group="'+g.id+'">حذف</button></div>').join(''):'<div class="growth-empty">أنشئ أول مجموعة، وبعدها اخترها عند إرسال اختبار أو واجب.</div>';
   document.querySelectorAll('[data-delete-growth-group]').forEach(b=>b.onclick=async()=>{const ok=window.AcademyUI?.confirm?await window.AcademyUI.confirm({title:'حذف المجموعة؟',message:'سيتم حذف المجموعة فقط ولن تتأثر حسابات الطلاب.',tone:'danger',acceptText:'حذف المجموعة'}):false;if(ok)await groupsRef.child(b.dataset.deleteGrowthGroup).remove()});
   let dl=document.getElementById('teacherGrowthGroupOptions');if(!dl){dl=document.createElement('datalist');dl.id='teacherGrowthGroupOptions';document.body.appendChild(dl)}
   dl.innerHTML=arr.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name||g.id)+'</option>').join('');
   ['teacherQuizTargetValue','assignmentTargetValue'].forEach(id=>document.getElementById(id)?.setAttribute('list','teacherGrowthGroupOptions'));
 }
 groupsRef.on('value',s=>{groups=s.val()||{};renderGroups()});
 document.getElementById('teacherGroupForm').onsubmit=async e=>{e.preventDefault();const members=document.getElementById('teacherGroupMembers').value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);if(!members.length){document.getElementById('teacherGroupNotice').textContent='أضف طالبًا واحدًا على الأقل.';return}document.getElementById('teacherGroupNotice').textContent='';const payload={name:document.getElementById('teacherGroupName').value.trim(),subject:document.getElementById('teacherGroupSubject').value.trim(),grade:document.getElementById('teacherGroupGrade').value.trim(),members:[...new Set(members)],createdAt:Date.now(),updatedAt:Date.now()};await groupsRef.push(payload);e.target.reset()};
 function expandGroupTarget(form,modeId,valueId){
   form?.addEventListener('submit',e=>{const mode=document.getElementById(modeId),input=document.getElementById(valueId);if(mode?.value!=='group'||!input)return;const raw=input.value.trim(),entry=Object.entries(groups).find(([id,g])=>id===raw||String(g?.name||'').trim()===raw);if(!entry)return;const members=Array.isArray(entry[1].members)?entry[1].members:[];if(!members.length){e.preventDefault();e.stopImmediatePropagation();document.getElementById('teacherGroupNotice').textContent='هذه المجموعة لا تحتوي طلابًا.';return}mode.value='students';input.value=members.join(',')},true);
 }
 expandGroupTarget(document.getElementById('teacherQuizForm'),'teacherQuizTargetMode','teacherQuizTargetValue');
 expandGroupTarget(document.getElementById('teacherAssignmentForm'),'assignmentTargetMode','assignmentTargetValue');
 try{
   const a=(await db.ref('analyticsV4/teachers/'+user.uid+'/lessons').once('value')).val()||{},rows=values(a).sort((x,y)=>Number(x.average||0)-Number(y.average||0));
   const box=document.getElementById('teacherGrowthAnalytics');
   if(!rows.length)box.innerHTML='<div class="growth-empty">ستظهر هنا الدروس التي تحتاج مراجعة بعد وصول محاولات الطلاب.</div>';
   else box.innerHTML=rows.slice(0,6).map(x=>'<div class="growth-row"><div class="growth-row-main"><span>'+(Number(x.average||0)<60?'⚠️':'📘')+'</span><div><strong>'+esc(x.title||'درس')+'</strong><small>'+Number(x.attempts||0)+' محاولة • '+Number(x.low||0)+' أقل من 60%</small></div></div><span class="growth-pill '+(Number(x.average||0)<60?'bad':Number(x.average||0)<80?'warn':'good')+'">'+Number(x.average||0)+'%</span></div>').join('');
 }catch{}
}

function weeklyParentStats(profile){
 const now=Date.now(),week=now-7*DAY,prev=now-14*DAY,h=history(profile),current=h.filter(x=>Number(x.createdAt||0)>=week),previous=h.filter(x=>Number(x.createdAt||0)<week&&Number(x.createdAt||0)>=prev);
 const completions=Object.values(profile.learningProgress||{}).filter(x=>Number(x.completedAt||x.updatedAt||0)>=week).length;
 const mistakes=flatMistakes(profile),bySubject={};
 h.forEach(x=>{if(!x.subject)return;(bySubject[x.subject]??=[]).push(x)});
 const ranked=Object.entries(bySubject).map(([subject,list])=>({subject,score:avg(list)})).sort((a,b)=>b.score-a.score);
 return{currentAvg:avg(current),prevAvg:avg(previous),tests:current.length,completions,mistakes:mistakes.length,best:ranked[0],weak:ranked[ranked.length-1]};
}
async function enhanceParent(){
 if(!window.AcademyPro)return;
 const user=await waitUser();if(!user)return;
 let parent;try{parent=(await db.ref('parentProfilesV4/'+user.uid).once('value')).val()}catch{}if(!parent)return;
 const ids=await window.AcademyPro.getChildren(user.uid);if(!ids.length)return;
 let host=document.getElementById('parentGrowthReports');if(!host){host=document.createElement('section');host.id='parentGrowthReports';host.className='pro-grid';document.getElementById('children')?.insertAdjacentElement('beforebegin',host)}
 host.innerHTML='';
 for(const id of ids){
   try{
     const report=await window.AcademyPro.parentReport(id),s=weeklyParentStats(report.profile),delta=s.currentAvg-s.prevAvg,name=report.profile?.name||'الطالب';
     const card=document.createElement('article');card.className='pro-card full';card.innerHTML='<div class="growth-head"><div><span class="growth-kicker">ملخص أسبوعي ذكي</span><h2>'+esc(name)+'</h2><p class="growth-muted">ملخص سريع يساعدك تعرف هل الأداء يتحسن وما المادة التي تحتاج دعمًا.</p></div><span class="growth-pill '+(delta>=0?'good':'warn')+'">'+(delta>0?'+':'')+delta+' نقطة</span></div><div class="parent-week-grid"><div><strong>'+s.completions+'</strong><small>دروس مكتملة</small></div><div><strong>'+s.tests+'</strong><small>اختبارات هذا الأسبوع</small></div><div><strong>'+s.currentAvg+'%</strong><small>متوسط النتائج</small></div><div><strong>'+s.mistakes+'</strong><small>أخطاء نشطة</small></div></div><div class="parent-strengths"><div><small>أقوى مادة حتى الآن</small><strong>'+(s.best?esc(subjectLabel(s.best.subject))+' • '+s.best.score+'%':'لا توجد اختبارات كافية')+'</strong></div><div><small>تحتاج اهتمامًا أكبر</small><strong>'+(s.weak?esc(subjectLabel(s.weak.subject))+' • '+s.weak.score+'%':'لا توجد اختبارات كافية')+'</strong></div></div>';
     host.appendChild(card);
   }catch{}
 }
}

const runners={'subject.html':enhanceSubject,'lesson.html':enhanceLesson,'exam-center.html':enhanceExamCenter,'profile.html':enhanceProfile,'teacher.html':enhanceTeacher,'parent.html':enhanceParent};
Promise.resolve().then(()=>runners[path]?.()).catch(err=>console.warn('Growth pack:',err));
})();