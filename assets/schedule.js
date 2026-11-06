(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,data={customSubjects:{}},scheduleEvents={},liveSessions={},planner={},filter='all';
const DAY=86400000;

function startOfDay(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);return x}
function monday(){const d=startOfDay(),n=(d.getDay()+6)%7;d.setDate(d.getDate()-n);return d}
function weekEnd(){return new Date(monday().getTime()+7*DAY)}
function dateKey(d=new Date()){
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return y+'-'+m+'-'+day;
}
function matchesStudent(e){
 return e?.isActive!==false &&
   (!e.type||e.type===profile.educationType) &&
   (!e.stage||e.stage===profile.stage) &&
   (!e.grade||String(e.grade)===String(profile.grade));
}
function eventDateForDay(dayOfWeek,time='00:00'){
 const start=monday(),jsDay=Number(dayOfWeek),offset=(jsDay+6)%7,d=new Date(start.getTime()+offset*DAY);
 const [h,m]=String(time).split(':').map(Number);d.setHours(h||0,m||0,0,0);return d;
}
function allItems(){
 const start=monday(),end=weekEnd(),items=[];
 Object.entries(scheduleEvents||{}).forEach(([id,e])=>{
   if(!matchesStudent(e))return;
   const at=eventDateForDay(e.dayOfWeek,e.time||'00:00');
   items.push({id:'class-'+id,kind:'class',title:e.title||'حصة',subject:e.subjectName||e.subject||'',teacher:e.teacher||'',at:at.getTime(),duration:Number(e.duration||60),url:e.url||'',done:false});
 });
 Object.entries(liveSessions||{}).forEach(([id,e])=>{
   if(e?.isHidden===true||!matchesStudent({...e,isActive:e.status!=='ended'}))return;
   const at=Number(e.scheduledTime||0);if(!at||at<start.getTime()||at>=end.getTime())return;
   items.push({id:'live-'+id,kind:'live',title:e.title||'جلسة مباشرة',subject:'بث مباشر',teacher:e.teacher||'',at,duration:Number(e.duration||60),url:'./live.html',done:false});
 });
 Object.entries(planner||{}).forEach(([id,t])=>{
   if(!t?.date)return;
   const d=new Date(t.date+'T12:00:00');if(d<start||d>=end)return;
   d.setHours(18,0,0,0);
   items.push({id:'task-'+id,kind:'task',title:t.title||'مهمة مذاكرة',subject:subjectName(t.subject||''),teacher:'',at:d.getTime(),duration:Number(t.duration||30),url:'./planner.html',done:!!t.done});
 });
 return items.sort((a,b)=>a.at-b.at);
}
function filtered(items){return filter==='all'?items:items.filter(x=>x.kind===filter)}
function kindLabel(k){return k==='class'?'حصة':k==='live'?'بث مباشر':'مذاكرة'}
function kindIcon(k){return k==='class'?'fa-chalkboard-user':k==='live'?'fa-tower-broadcast':'fa-list-check'}
function subjectName(id){
 if(!id)return'';
 return C.subjectName(data,id,profile.stage,String(profile.grade),profile.educationType)||id;
}
function timeUntil(ts){
 const diff=Number(ts||0)-Date.now();
 if(diff<=0)return'الآن';
 const mins=Math.ceil(diff/60000);
 if(mins<60)return'بعد '+mins+' د';
 const hours=Math.floor(mins/60),rem=mins%60;
 if(hours<24)return'بعد '+hours+' س'+(rem?' '+rem+' د':'');
 const days=Math.floor(hours/24);return'بعد '+days+' يوم';
}
function render(){
 const items=allItems(),start=monday(),todayKey=dateKey(),filteredItems=filtered(items);
 const todayItems=items.filter(x=>dateKey(new Date(x.at))===todayKey),liveCount=items.filter(x=>x.kind==='live').length,classCount=items.filter(x=>x.kind==='class').length,taskCount=items.filter(x=>x.kind==='task'&&!x.done).length;
 $('scheduleTodayCount').textContent=todayItems.length;
 $('scheduleWeekCount').textContent=items.length;
 $('scheduleLiveCount').textContent=liveCount;
 $('scheduleTaskCount').textContent=taskCount;
 if($('scheduleClassCount'))$('scheduleClassCount').textContent=classCount;
 if($('scheduleHeroToday'))$('scheduleHeroToday').textContent=todayItems.length;
 if($('scheduleHeroWeek'))$('scheduleHeroWeek').textContent=items.length;
 if($('scheduleHeroLive'))$('scheduleHeroLive').textContent=liveCount;
 $('scheduleWeekLabel').textContent=start.toLocaleDateString('ar-EG',{day:'numeric',month:'short'})+' — '+new Date(start.getTime()+6*DAY).toLocaleDateString('ar-EG',{day:'numeric',month:'short'});

 const days=[];
 for(let i=0;i<7;i++){
   const d=new Date(start.getTime()+i*DAY),key=dateKey(d),dayItems=filteredItems.filter(x=>dateKey(new Date(x.at))===key);
   days.push('<section class="schedule-day schedule-day-v7 '+(key===todayKey?'today':'')+'">'+
     '<header><div><span>'+d.toLocaleDateString('ar-EG',{weekday:'long'})+'</span><strong>'+d.toLocaleDateString('ar-EG',{day:'numeric',month:'short'})+'</strong></div><b>'+dayItems.length+' '+(dayItems.length===1?'موعد':'مواعيد')+'</b></header>'+
     '<div class="schedule-day-items">'+(dayItems.length?dayItems.map(itemCard).join(''):'<div class="schedule-empty-day"><span>☕</span><strong>يوم هادئ</strong><small>لا توجد مواعيد محددة</small></div>')+'</div></section>');
 }
 $('scheduleWeek').innerHTML=days.join('');
 const freeDays=Array.from({length:7},(_,i)=>dateKey(new Date(start.getTime()+i*DAY))).filter(key=>!items.some(x=>dateKey(new Date(x.at))===key)).length;
 if($('scheduleFreeDays'))$('scheduleFreeDays').textContent=freeDays;

 const next=items.filter(x=>x.at>=Date.now()&&!x.done)[0];
 $('nextScheduleItem').innerHTML=next
  ?'<span class="next-schedule-icon '+next.kind+'"><i class="fa-solid '+kindIcon(next.kind)+'"></i></span><strong>'+C.esc(next.title)+'</strong><p>'+new Date(next.at).toLocaleString('ar-EG',{weekday:'long',hour:'numeric',minute:'2-digit'})+'</p><small>'+kindLabel(next.kind)+(next.subject?' • '+C.esc(next.subject):'')+(next.teacher?' • '+C.esc(next.teacher):'')+'</small>'+(next.url?'<a class="btn btn-soft btn-block schedule-next-action" href="'+(next.kind==='class'?C.safeUrl(next.url):next.url)+'">فتح الموعد</a>':'')
  :'<div class="feature-empty compact"><span>🎉</span><h3>مفيش موعد قريب</h3><p>استغل الوقت في مراجعة بسيطة.</p><a class="btn btn-soft" href="./planner.html">أضف مهمة</a></div>';
 if($('scheduleHeroNextTitle'))$('scheduleHeroNextTitle').textContent=next?(next.title||'موعد'):'لا يوجد موعد قريب';
 if($('scheduleHeroNextMeta'))$('scheduleHeroNextMeta').textContent=next?(new Date(next.at).toLocaleString('ar-EG',{weekday:'long',hour:'numeric',minute:'2-digit'})+' • '+kindLabel(next.kind)+(next.subject?' • '+next.subject:'')):'استغل المساحة الفاضية في مراجعة قصيرة أو مهمة من المخطط.';
 if($('scheduleHeroCountdown'))$('scheduleHeroCountdown').textContent=next?timeUntil(next.at):'أسبوع هادئ';
 const heroAction=$('scheduleHeroNextAction');
 if(heroAction){
   const href=next?.url?(next.kind==='class'?C.safeUrl(next.url):next.url):'';
   heroAction.classList.toggle('hidden',!href);heroAction.href=href||'#';
   heroAction.target=href&&href.startsWith('http')?'_blank':'';
   if(href&&href.startsWith('http'))heroAction.rel='noopener noreferrer';else heroAction.removeAttribute('rel');
 }

}
function itemCard(x){
 const time=new Date(x.at).toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});
 const href=x.kind==='class'?(x.url?C.safeUrl(x.url):''):x.url;
 const external=href&&href.startsWith('http');
 const open=href?'<a class="schedule-open" href="'+C.esc(href)+'" '+(external?'target="_blank" rel="noopener noreferrer"':'')+' aria-label="فتح '+C.esc(x.title)+'"><i class="fa-solid fa-arrow-up-left-from-square"></i></a>':'';
 return '<article class="schedule-item schedule-item-v7 '+x.kind+' '+(x.done?'done':'')+'"><span class="schedule-kind-icon"><i class="fa-solid '+kindIcon(x.kind)+'"></i></span><div><span class="schedule-time">'+time+' • '+x.duration+' د</span><h4>'+C.esc(x.title)+'</h4><p>'+kindLabel(x.kind)+(x.subject?' • '+C.esc(x.subject):'')+(x.teacher?' • '+C.esc(x.teacher):'')+(x.done?' • مكتملة':'')+'</p></div>'+open+'</article>';
}
$$('[data-schedule-filter]').forEach(b=>b.onclick=()=>{
 filter=b.dataset.scheduleFilter;
 $$('[data-schedule-filter]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
 render();
});

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز جدولك ومواعيدك...');
 try{
   ({user,profile}=await C.requireStudent());$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   if($('scheduleHeroText'))$('scheduleHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — كل حصصك وبثك ومهامك مرتبة في أسبوع واحد.';
   try{const cs=await C.db.ref('customSubjects').once('value');data.customSubjects=cs.val()||{}}catch(e){console.warn('Subjects lookup skipped',e)}
   const scheduleRef=C.db.ref('scheduleEvents').orderByChild('stage').equalTo(profile.stage);
   const liveRef=C.db.ref('liveSessions');
   const plannerRef=C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner');
   const ready=new Set();let failed=false;
   const done=key=>{
     ready.add(key);
     if(ready.size===3){
       render();window.AcademyUI?.hidePageLoading();
       if(failed)C.toast('تم تحميل الجدول مع تعذر مزامنة جزء من البيانات.','error');
     }
   };
   scheduleRef.on('value',s=>{scheduleEvents=s.val()||{};if(ready.has('schedule'))render();else done('schedule')},err=>{console.error(err);failed=true;scheduleEvents={};done('schedule')});
   liveRef.on('value',s=>{liveSessions=s.val()||{};if(ready.has('live'))render();else done('live')},err=>{console.error(err);failed=true;liveSessions={};done('live')});
   plannerRef.on('value',s=>{planner=s.val()||{};if(ready.has('planner'))render();else done('planner')},err=>{console.error(err);failed=true;planner={};done('planner')});
 }catch(err){
   console.error(err);C.toast('تعذر تحميل الجدول الآن.','error');
   $('scheduleWeek').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل الجدول','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
   window.AcademyUI?.hidePageLoading();
 }
})();
})();
