(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,data={customSubjects:{}},tasks={},filter='all';

function localDateKey(d=new Date()){
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
 return y+'-'+m+'-'+day;
}
const today=()=>localDateKey();
const weekStart=()=>{const d=new Date();const day=(d.getDay()+6)%7;d.setHours(0,0,0,0);d.setDate(d.getDate()-day);return d.getTime()};
function dateLabel(value){
 if(!value)return'بدون تاريخ';
 const d=new Date(value+'T12:00:00');
 if(value===today())return'اليوم';
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
 if(value===localDateKey(tomorrow))return'غدًا';
 return d.toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
}
function isOverdue(t){return !t.done&&!!t.date&&t.date<today()}
function priorityWeight(p){return p==='urgent'?3:p==='high'?2:1}
function taskArray(){
 return Object.entries(tasks||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>{
   if(!!a.done!==!!b.done)return a.done?1:-1;
   const ao=isOverdue(a),bo=isOverdue(b);if(ao!==bo)return ao?-1:1;
   const dateCmp=String(a.date||'').localeCompare(String(b.date||''));if(dateCmp)return dateCmp;
   const priorityCmp=priorityWeight(b.priority)-priorityWeight(a.priority);if(priorityCmp)return priorityCmp;
   return (b.createdAt||0)-(a.createdAt||0);
 });
}
function currentSubjects(){return C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType)}
function renderStats(){
 const arr=taskArray(),done=arr.filter(x=>x.done).length,todayPending=arr.filter(x=>x.date===today()&&!x.done),overdue=arr.filter(isOverdue),pending=arr.filter(x=>!x.done);
 const todayMinutes=todayPending.reduce((n,x)=>n+Number(x.duration||30),0),pendingMinutes=pending.reduce((n,x)=>n+Number(x.duration||30),0);
 $('plannerTotal').textContent=arr.length;$('plannerDone').textContent=done;$('plannerToday').textContent=todayPending.length;$('plannerRate').textContent=(arr.length?Math.round(done/arr.length*100):0)+'%';
 if($('plannerOverdueCount'))$('plannerOverdueCount').textContent=overdue.length;
 if($('plannerPendingMinutes'))$('plannerPendingMinutes').textContent=pendingMinutes;
 if($('plannerHeroTodayCount'))$('plannerHeroTodayCount').textContent=todayPending.length;
 if($('plannerHeroTodayMinutes'))$('plannerHeroTodayMinutes').textContent=todayMinutes;
 if($('plannerHeroOverdue'))$('plannerHeroOverdue').textContent=overdue.length;
 const weekDone=arr.filter(x=>x.done&&Number(x.completedAt||0)>=weekStart()).length,cap=Math.min(5,weekDone);
 $('plannerWeekDone').textContent=cap+'/5';$('plannerWeekRing').style.background='conic-gradient(#10b981 '+(cap/5*360)+'deg,#e5e7eb 0deg)';
 renderTodayFocus(arr);
}
function filteredTasks(){
 const arr=taskArray();
 if(filter==='today')return arr.filter(x=>x.date===today());
 if(filter==='pending')return arr.filter(x=>!x.done);
 if(filter==='done')return arr.filter(x=>x.done);
 return arr;
}
function priorityLabel(p){return p==='urgent'?'عاجلة':p==='high'?'مهمة':'عادية'}
function renderTodayFocus(arr=taskArray()){
 const now=new Date();
 if($('plannerTodayDay'))$('plannerTodayDay').textContent=now.toLocaleDateString('ar-EG',{weekday:'long'});
 if($('plannerTodayDate'))$('plannerTodayDate').textContent=now.toLocaleDateString('ar-EG',{day:'numeric',month:'long'});
 const candidate=arr.find(x=>!x.done&&(isOverdue(x)||x.date===today()))||arr.find(x=>!x.done);
 if($('plannerHeroNextTask'))$('plannerHeroNextTask').textContent=candidate?(candidate.title||'مهمة مذاكرة'):'مفيش مهام متبقية 🎉';
 const btn=$('plannerHeroNextBtn');
 if(btn){
   btn.disabled=!candidate;
   btn.innerHTML=candidate?'عرض المهمة <i class="fa-solid fa-arrow-left"></i>':'أضف مهمة جديدة <i class="fa-solid fa-plus"></i>';
   btn.onclick=()=>{
     if(!candidate){$('plannerAddCard')?.scrollIntoView({behavior:'smooth',block:'start'});$('plannerTitle')?.focus();return}
     filter=candidate.date===today()?'today':'pending';
     $$('[data-planner-filter]').forEach(x=>{const active=x.dataset.plannerFilter===filter;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
     renderTasks();
     requestAnimationFrame(()=>{
       const row=document.querySelector('[data-task-id="'+candidate.id+'"]');
       row?.scrollIntoView({behavior:'smooth',block:'center'});row?.classList.add('planner-task-highlight');
       setTimeout(()=>row?.classList.remove('planner-task-highlight'),1600);
     });
   };
 }
}
function renderTasks(){
 const arr=filteredTasks();
 $('plannerTaskList').innerHTML=arr.length?arr.map(t=>{
   const sub=currentSubjects().find(s=>s.id===t.subject),overdue=isOverdue(t);
   return '<article class="planner-task planner-task-v7 '+(t.done?'done ':'')+(overdue?'overdue':'')+'" data-task-id="'+t.id+'">'+
     '<button class="planner-check" data-toggle-task="'+t.id+'" aria-label="'+(t.done?'إعادة فتح':'إكمال')+' '+C.esc(t.title||'المهمة')+'" aria-pressed="'+(t.done?'true':'false')+'"><i class="fa-solid '+(t.done?'fa-check':'fa-circle')+'"></i></button>'+
     '<div class="planner-task-copy"><div class="planner-task-title-row"><h3>'+C.esc(t.title||'مهمة')+'</h3>'+(overdue?'<span class="status-pill rejected">متأخرة</span>':'')+'</div>'+
     '<div class="planner-task-meta"><span>'+(sub?C.esc((sub.emoji||'📚')+' '+sub.name):'📚 مادة')+'</span><span class="'+(overdue?'planner-overdue-date':'')+'"><i class="fa-regular fa-calendar"></i> '+C.esc(dateLabel(t.date))+'</span><span><i class="fa-regular fa-clock"></i> '+Number(t.duration||30)+' دقيقة</span><span class="priority '+C.esc(t.priority||'normal')+'"><i class="fa-solid fa-flag"></i> '+priorityLabel(t.priority)+'</span>'+(t.href&&String(t.href).startsWith('./')?'<a class="planner-task-auto-link" href="'+C.esc(t.href)+'"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح</a>':'')+'</div></div>'+
     '<button class="planner-delete" data-delete-task="'+t.id+'" aria-label="حذف '+C.esc(t.title||'المهمة')+'"><i class="fa-solid fa-trash"></i></button></article>';
 }).join(''):'<div class="feature-empty"><span>🗒️</span><h3>مفيش مهام في القسم ده</h3><p>أضف مهمة صغيرة وابدأ خطوة بخطوة.</p></div>';
 $$('[data-toggle-task]').forEach(b=>b.onclick=()=>toggleTask(b.dataset.toggleTask,b));
 $$('[data-delete-task]').forEach(b=>b.onclick=()=>removeTask(b.dataset.deleteTask,b));
}
function renderSuggestion(){
 const subjects=currentSubjects(),arr=taskArray(),overdue=arr.filter(isOverdue),todayPending=arr.filter(x=>!x.done&&x.date===today());
 const weak=[...subjects].sort((a,b)=>C.subjectProgressValue(profile,a.id)-C.subjectProgressValue(profile,b.id))[0],box=$('plannerSuggestion');
 if(overdue.length){
   const t=overdue[0],sub=subjects.find(s=>s.id===t.subject);
   box.innerHTML='<span class="planner-suggest-emoji">⚠️</span><strong>رتّب مهمة متأخرة</strong><p>'+C.esc(t.title||'مهمة')+(sub?' • '+C.esc(sub.name):'')+' — ابدأ بها قبل إضافة شيء جديد.</p><button class="btn btn-soft btn-block" id="useSuggestion">اعرض المهمة</button>';
   $('useSuggestion').onclick=()=>{document.querySelector('[data-planner-filter="pending"]')?.click();setTimeout(()=>document.querySelector('[data-task-id="'+t.id+'"]')?.scrollIntoView({behavior:'smooth',block:'center'}),120)};
   return;
 }
 if(todayPending.length){
   const minutes=todayPending.reduce((n,x)=>n+Number(x.duration||30),0);
   box.innerHTML='<span class="planner-suggest-emoji">✅</span><strong>خطتك لليوم جاهزة</strong><p>عندك '+todayPending.length+' مهمة بإجمالي '+minutes+' دقيقة. خلّصها قبل إضافة مهام جديدة.</p><button class="btn btn-soft btn-block" id="useSuggestion">افتح مهام اليوم</button>';
   $('useSuggestion').onclick=()=>document.querySelector('[data-planner-filter="today"]')?.click();
   return;
 }
 if(!weak){box.innerHTML='<p>ابدأ بإضافة أول مهمة مذاكرة.</p>';return}
 const pct=C.subjectProgressValue(profile,weak.id);
 box.innerHTML='<span class="planner-suggest-emoji">'+C.esc(weak.emoji||'📚')+'</span><strong>'+C.esc(weak.name)+'</strong><p>تقدمك الحالي '+pct+'%. خصص 30 دقيقة اليوم لمراجعة درس واحد فيها.</p><button class="btn btn-soft btn-block" id="useSuggestion">أضفها للخطة</button>';
 $('useSuggestion').onclick=()=>{
   $('plannerTitle').value='مراجعة درس في '+weak.name;$('plannerSubject').value=weak.id;$('plannerDate').value=today();$('plannerDuration').value='30';
   $('plannerAddCard')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('plannerTitle')?.focus(),250);
 };
}
async function toggleTask(id,btn){
 const t=tasks[id];if(!t)return;
 const done=!t.done;btn.disabled=true;
 try{
   await C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner/'+id).update({done,completedAt:done?Date.now():null,updatedAt:Date.now()});
 }catch(err){console.error(err);btn.disabled=false;C.toast('تعذر تحديث المهمة الآن.','error')}
}
async function removeTask(id,btn){
 const ok=await window.AcademyUI.confirm({title:'حذف المهمة؟',message:'سيتم حذف المهمة من مخطط المذاكرة الخاص بك.',tone:'danger',acceptText:'حذف المهمة'});
 if(!ok)return;
 btn.disabled=true;
 try{await C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner/'+id).remove()}
 catch(err){console.error(err);btn.disabled=false;C.toast('تعذر حذف المهمة الآن.','error')}
}
$('plannerForm').onsubmit=async e=>{
 e.preventDefault();
 const btn=e.submitter||e.target.querySelector('button[type="submit"]');
 const payload={title:$('plannerTitle').value.trim(),subject:$('plannerSubject').value,date:$('plannerDate').value,duration:Number($('plannerDuration').value||30),priority:$('plannerPriority').value,done:false,createdAt:Date.now()};
 if(!payload.title||!payload.date)return C.toast('اكتب المهمة وحدد تاريخها.','error');
 if(!payload.subject)return C.toast('اختر مادة للمهمة.','error');
 window.AcademyUI?.setButtonLoading(btn,true,'إضافة');
 try{
   await C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner').push(payload);
   e.target.reset();$('plannerDate').value=today();C.toast('تمت إضافة المهمة للخطة ✅');
 }catch(err){console.error(err);C.toast('تعذر إضافة المهمة الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
};
$$('[data-planner-filter]').forEach(b=>b.onclick=()=>{
 filter=b.dataset.plannerFilter;
 $$('[data-planner-filter]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
 renderTasks();
});

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز خطة مذاكرتك...');
 try{
   ({user,profile}=await C.requireStudent());$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   if($('plannerStudentName'))$('plannerStudentName').textContent=profile.name||user.displayName||'طالبنا';
   if($('plannerHeroText'))$('plannerHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — خلّي خطتك واقعية وقابلة للتنفيذ.';
   if($('plannerHeroAddBtn'))$('plannerHeroAddBtn').onclick=()=>{$('plannerAddCard')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('plannerTitle')?.focus(),250)};
   const s=await C.db.ref('customSubjects').once('value');data.customSubjects=s.val()||{};
   const subjects=currentSubjects();
   $('plannerSubject').innerHTML=subjects.length?subjects.map(s=>'<option value="'+C.esc(s.id)+'">'+C.esc(s.name)+'</option>').join(''):'<option value="">لا توجد مواد متاحة</option>';
   $('plannerDate').value=today();
   const plannerRef=C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner');
   const first=await plannerRef.once('value');
   tasks=first.val()||{};renderStats();renderTasks();renderSuggestion();
   plannerRef.on('value',snap=>{tasks=snap.val()||{};renderStats();renderTasks();renderSuggestion()},err=>{console.error(err);C.toast('تعذر مزامنة خطة المذاكرة.','error')});
 }catch(err){
   console.error(err);C.toast('تعذر تحميل مخطط المذاكرة الآن.','error');
   $('plannerTaskList').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل الخطة','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();