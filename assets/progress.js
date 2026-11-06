(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id);
let user,profile,data={customSubjects:{}};

function localDateKey(d=new Date()){
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return y+'-'+m+'-'+day;
}
function quizHistory(){return Object.values(profile.quizHistory||{}).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function simHistory(){return Object.values(profile.simulationHistory||{}).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function scoreClass(v){return v>=80?'good':v>=60?'mid':'low'}
function subjectHref(id){
 return './subject.html?'+new URLSearchParams({type:profile.educationType,stage:profile.stage,grade:String(profile.grade),subject:id});
}
function historyTitle(x,fallback){return x.title||x.name||fallback}
function formatDuration(seconds){
 const sec=Math.max(0,Number(seconds||0)),m=Math.floor(sec/60),s=Math.floor(sec%60);
 return m?(m+' د'+(s?' '+String(s).padStart(2,'0')+' ث':'')):(s+' ث');
}
function mistakeItems(){
 return Object.values(profile.mistakeNotebook||{}).flatMap(group=>Object.values(group||{}).filter(Boolean));
}
function subjectQuizRows(subject){
 return quizHistory().filter(x=>String(x.subject||'')===String(subject));
}
function subjectQuizAverage(subject){
 const rows=subjectQuizRows(subject);return rows.length?Math.round(rows.reduce((n,x)=>n+Number(x.score||0),0)/rows.length):null;
}
function subjectMistakeCount(subject){
 return mistakeItems().filter(x=>String(x.subject||'')===String(subject)).length;
}
function renderAchievements(subjects,qh){
 const stats=profile.stats||{},xp=Number(stats.totalXP||0),level=Number(stats.level||Math.floor(xp/1000)+1),best=qh.length?Math.max(...qh.map(x=>Number(x.score||0))):0;
 const defs=[
   {emoji:'🚀',name:'البداية',desc:'أكمل أول درس',ok:Number(stats.completedLessons||0)>=1},
   {emoji:'📚',name:'مستمر',desc:'أكمل 5 دروس',ok:Number(stats.completedLessons||0)>=5},
   {emoji:'🎯',name:'أول اختبار',desc:'أنهِ أول اختبار',ok:qh.length>=1},
   {emoji:'🌟',name:'نتيجة مميزة',desc:'احصل على 90% أو أكثر',ok:best>=90},
   {emoji:'⭐',name:'500 XP',desc:'اجمع 500 نقطة خبرة',ok:xp>=500},
   {emoji:'🔥',name:'ثبات 3 أيام',desc:'حافظ على 3 أيام متتالية',ok:Number(stats.streak||0)>=3},
   {emoji:'🏅',name:'المستوى 3',desc:'وصل إلى المستوى الثالث',ok:level>=3},
   {emoji:'🏆',name:'مادة مكتملة',desc:'أكمل مادة بنسبة 100%',ok:subjects.some(s=>C.subjectProgressValue(profile,s.id)>=100)}
 ];
 $('progressAchievements').innerHTML=defs.map(a=>'<article class="progress-achievement-v6 '+(a.ok?'unlocked':'locked')+'"><span>'+a.emoji+'</span><div><strong>'+C.esc(a.name)+'</strong><small>'+C.esc(a.desc)+'</small></div><i class="fa-solid '+(a.ok?'fa-circle-check':'fa-lock')+'"></i></article>').join('');
}
function render(){
 const stats=profile.stats||{},qh=quizHistory(),sh=simHistory(),subjects=C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType);
 const avg=qh.length?Math.round(qh.reduce((a,x)=>a+Number(x.score||0),0)/qh.length):null;
 const best=qh.length?Math.max(...qh.map(x=>Number(x.score||0))):null;
 const mistakes=mistakeItems(),totalXP=Number(stats.totalXP||0),level=Number(stats.level||Math.floor(totalXP/1000)+1),levelXP=totalXP%1000;
 const progressValues=subjects.map(s=>Math.max(0,Math.min(100,C.subjectProgressValue(profile,s.id)))),overall=progressValues.length?Math.round(progressValues.reduce((a,b)=>a+b,0)/progressValues.length):0;

 $('progressStudentName').textContent=profile.name||user.displayName||'طالبنا';
 $('progressStageTitle').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — كل أرقامك التعليمية في مكان واحد.';
 $('progressLessons').textContent=Number(stats.completedLessons||0);
 $('progressAverage').textContent=avg===null?'—':avg+'%';
 $('progressMinutes').textContent=Number(stats.studyMinutes||0);
 $('progressStreak').textContent=Number(stats.streak||0);
 $('progressBest').textContent=best===null?'—':best+'%';
 $('progressMistakes').textContent=mistakes.length;
 $('progressOverall').textContent=overall+'%';
 $('progressOverallRing').style.setProperty('--progress-overall',(overall*3.6)+'deg');
 $('progressLevel').textContent=level;
 $('progressXp').textContent=totalXP;
 $('progressLevelBar').style.width=(levelXP/10)+'%';
 $('progressNextLevel').textContent=(1000-levelXP)+' XP للمستوى التالي';
 $('progressSubjectCount').textContent=subjects.length;

 $('subjectProgressList').innerHTML=subjects.length?subjects.map((s,index)=>{
   const p=Math.max(0,Math.min(100,C.subjectProgressValue(profile,s.id))),subjectAvg=subjectQuizAverage(s.id),mistakesCount=subjectMistakeCount(s.id);
   const img=C.safeUrl(s.imageUrl||''),hasImage=img&&img!=='#',stateLabel=p>=100?'مكتملة':p>=60?'تقدم قوي':p>0?'قيد التعلم':'لم تبدأ';
   return '<a class="progress-subject-card-v6 '+(p>=100?'complete':p>0?'active':'')+'" href="'+subjectHref(s.id)+'">'+
     '<div class="progress-subject-cover-v6 '+(hasImage?'has-image':'')+'" '+(hasImage?'style="background-image:url(&quot;'+C.esc(img)+'&quot;)"':'')+'>'+
       (!hasImage?'<span>'+C.esc(s.emoji||'📚')+'</span>':'')+'<em>'+C.esc(stateLabel)+'</em>'+
     '</div>'+
     '<div class="progress-subject-copy-v6"><small>المادة</small><h3>'+C.esc(s.name)+'</h3>'+
       '<div class="progress-subject-metrics-v6"><span><b>'+p+'%</b><small>التقدم</small></span><span><b>'+(subjectAvg===null?'—':subjectAvg+'%')+'</b><small>متوسط الاختبارات</small></span><span><b>'+mistakesCount+'</b><small>أخطاء مفتوحة</small></span></div>'+
       '<div class="progress-subject-track-v6"><span style="width:'+p+'%"></span></div>'+
       '<div class="progress-subject-foot-v6"><span>فتح المادة</span><i class="fa-solid fa-arrow-left"></i></div>'+
     '</div></a>';
 }).join(''):'<div class="feature-empty compact"><span>📚</span><h3>لا توجد مواد بعد</h3><p>ستظهر مواد مرحلتك هنا تلقائيًا.</p></div>';

 const days=[];
 for(let i=6;i>=0;i--){
   const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);
   const key=localDateKey(d),minutes=Number(profile.activityDaily?.[key]?.minutes||0),active=!!profile.activity?.days?.[key]||minutes>0;
   days.push({key,label:d.toLocaleDateString('ar-EG',{weekday:'short'}),minutes,active});
 }
 const max=Math.max(1,...days.map(d=>d.minutes)),weekMinutes=days.reduce((n,d)=>n+d.minutes,0),activeDays=days.filter(d=>d.active).length;
 $('progressWeekMinutes').textContent=weekMinutes;$('progressActiveDays').textContent=activeDays;
 $('activityBars').innerHTML=days.map(d=>{
   const height=d.minutes?Math.max(12,Math.round(d.minutes/max*155)):(d.active?10:6);
   return '<div class="activity-bar '+(d.active?'active':'')+'" style="height:'+height+'px" title="'+d.minutes+' دقيقة"><span>'+d.minutes+'</span><strong>'+C.esc(d.label)+'</strong></div>';
 }).join('');

 const scored=subjects.map(s=>({s,avg:subjectQuizAverage(s.id),mistakes:subjectMistakeCount(s.id)})).filter(x=>x.avg!==null);
 const strongest=scored.slice().sort((a,b)=>b.avg-a.avg).slice(0,3),weakest=scored.slice().sort((a,b)=>a.avg-b.avg).slice(0,3);
 const insightIcon=$('progressInsightIcon'),insightTitle=$('progressInsightTitle'),insightText=$('progressInsightText');
 if(!qh.length){insightIcon.textContent='🌱';insightTitle.textContent='ابدأ أول اختبار';insightText.textContent='بعد أول محاولاتك سنوضح لك المواد الأقوى وما يحتاج مراجعة.'}
 else if(avg>=85){insightIcon.textContent='🏆';insightTitle.textContent='أداء ممتاز';insightText.textContent='متوسط اختباراتك '+avg+'%. حافظ على مستواك وركز على الأخطاء القليلة المتبقية.'}
 else if(avg>=70){insightIcon.textContent='💪';insightTitle.textContent='أداء قوي';insightText.textContent='متوسطك '+avg+'%. عندك أساس جيد، ومراجعة المواد الأضعف ستصنع فرقًا واضحًا.'}
 else if(avg>=50){insightIcon.textContent='📈';insightTitle.textContent='تقدم يحتاج تثبيت';insightText.textContent='متوسطك '+avg+'%. راجع الأخطاء ثم أعد الاختبارات الأقل نتيجة.'}
 else{insightIcon.textContent='🎯';insightTitle.textContent='ركز على الأساسيات';insightText.textContent='متوسطك '+avg+'%. ارجع للشرح في المواد الأضعف ثم اختبر نفسك من جديد.'}
 const subjectPill=x=>'<a href="'+subjectHref(x.s.id)+'"><span>'+C.esc(x.s.emoji||'📚')+'</span><div><strong>'+C.esc(x.s.name)+'</strong><small>'+x.avg+'% متوسط'+(x.mistakes?' • '+x.mistakes+' خطأ':'')+'</small></div></a>';
 $('progressStrengthList').innerHTML=strongest.length?strongest.map(subjectPill).join(''):'<p class="progress-insight-empty-v6">لا توجد نتائج كافية بعد.</p>';
 $('progressWeakList').innerHTML=weakest.length?weakest.map(subjectPill).join(''):'<p class="progress-insight-empty-v6">لا توجد نتائج كافية بعد.</p>';

 renderAchievements(subjects,qh);

 $('progressQuizHistory').innerHTML=qh.length?qh.slice(0,7).map(x=>
   '<div class="exam-history-item progress-history-item-v6"><div><strong>'+C.esc(historyTitle(x,'اختبار'))+'</strong><span>'+C.esc(C.subjectName(data,x.subject||'',profile.stage,String(profile.grade),profile.educationType))+' • '+new Date(x.createdAt||Date.now()).toLocaleDateString('ar-EG')+(Number(x.durationSeconds||0)?' • '+formatDuration(x.durationSeconds):'')+'</span></div><strong class="score-pill '+scoreClass(Number(x.score||0))+'">'+Number(x.score||0)+'%</strong></div>'
 ).join(''):'<div class="feature-empty compact"><span>🎯</span><h3>لا توجد نتائج بعد</h3><p>أكمل أول اختبار وسيظهر هنا.</p></div>';

 $('progressSimulationHistory').innerHTML=sh.length?sh.slice(0,7).map(x=>
   '<div class="exam-history-item progress-history-item-v6"><div><strong>'+C.esc(historyTitle(x,'محاكي'))+'</strong><span>'+new Date(x.createdAt||Date.now()).toLocaleDateString('ar-EG')+'</span></div><strong class="score-pill '+scoreClass(Number(x.score||0))+'">'+Number(x.score||0)+'%</strong></div>'
 ).join(''):'<div class="feature-empty compact"><span>🧪</span><h3>لا توجد محاكيات مكتملة</h3><p>جرّب أول محاكي وسيظهر مستواك هنا.</p></div>';
}

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تحليل تقدمك...');
 try{
   ({user,profile}=await C.requireStudent());
   $('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   const s=await C.db.ref('customSubjects').once('value');
   data.customSubjects=s.val()||{};
   render();
 }catch(err){
   console.error(err);C.toast('تعذر تحميل التقدم الآن.','error');
   $('subjectProgressList').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل التقدم','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();