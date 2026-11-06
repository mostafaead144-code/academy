(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),DAY=86400000;if(!C||!document.getElementById('plannerAddCard'))return;
let user,profile,lessons=[],quizzes=[];
const dateKey=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const today=()=>dateKey(new Date());
const visible=x=>x&&x.isHidden!==true&&(!Number(x.publishAt||0)||Number(x.publishAt)<=Date.now());
const matches=x=>visible(x)&&(!x.type||x.type===profile.educationType)&&(!x.stage||x.stage===profile.stage)&&(!x.grade||String(x.grade)===String(profile.grade));
const flatMistakes=p=>{const a=[];Object.entries(p?.mistakeNotebook||{}).forEach(([sourceId,g])=>Object.values(g||{}).forEach(v=>a.push({sourceId,...(v||{})})));return a};
const history=()=>Object.values(profile?.quizHistory||{}).filter(Boolean);
const subjectAverages=()=>{const map={};history().forEach(x=>{if(!x.subject)return;(map[x.subject]??=[]).push(Number(x.score||0))});return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,Math.round(v.reduce((a,b)=>a+b,0)/v.length)]))};
const label=id=>({arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',studies:'الدراسات الاجتماعية',religion:'التربية الدينية'}[id]||id||'المادة');
function addDays(key,n){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d)}
function availableDates(start,end,off){
 const a=[];let k=start,guard=0;while(k<=end&&guard++<370){const d=new Date(k+'T12:00:00');if(!off.has(d.getDay()))a.push(k);k=addDays(k,1)}return a;
}
function planItems(){
 const scores=subjectAverages(),mistakes=flatMistakes(profile),items=[];
 const dueBySubject={};mistakes.filter(m=>!Number(m.nextReviewAt||0)||Number(m.nextReviewAt)<=Date.now()).forEach(m=>{const s=m.subject||'general';dueBySubject[s]=(dueBySubject[s]||0)+1});
 Object.entries(dueBySubject).sort((a,b)=>b[1]-a[1]).forEach(([subject,count])=>items.push({title:'مراجعة '+count+' من أخطائي في '+label(subject),subject,duration:Math.min(40,15+count*3),priority:'urgent',sourceType:'review',sourceId:subject,href:'./smart-review.html?subject='+encodeURIComponent(subject),weight:0}));
 const incomplete=lessons.filter(l=>matches(l)&&!profile.learningProgress?.[l.id]?.completed).sort((a,b)=>(Number(scores[a.subject]??100)-Number(scores[b.subject]??100))||Number(a.unit||1)-Number(b.unit||1)||Number(a.order||0)-Number(b.order||0));
 incomplete.forEach(l=>items.push({title:'درس: '+(l.title||'درس جديد'),subject:l.subject||'',duration:Number(l.estimatedMinutes||35),priority:Number(scores[l.subject]??100)<60?'urgent':'high',sourceType:'lesson',sourceId:l.id,href:'./lesson.html?'+new URLSearchParams({type:l.type||profile.educationType,stage:l.stage||profile.stage,grade:l.grade||profile.grade,subject:l.subject||'',id:l.id}).toString(),weight:1}));
 const tried=new Set(history().map(x=>x.sourceId));
 quizzes.filter(q=>matches(q)&&!tried.has(q.id)).sort((a,b)=>Number(a.unit||0)-Number(b.unit||0)).forEach(q=>items.push({title:'اختبار: '+(q.name||q.title||'اختبار'),subject:q.subject||'',duration:Number(q.durationMinutes||20),priority:'high',sourceType:'quiz',sourceId:q.id,href:'./lesson.html?'+new URLSearchParams({type:q.type||profile.educationType,stage:q.stage||profile.stage,grade:q.grade||profile.grade,subject:q.subject||'',quiz:q.id}).toString(),weight:2}));
 return items;
}
function mount(){
 const box=document.createElement('article');box.id='autoPlannerBox';box.className='feature-card growth-card auto-plan-box';box.innerHTML='<div class="growth-head"><div><span class="growth-kicker">الخطة الذكية التلقائية</span><h2>قل لنا موعد الانتهاء ووقت يومك — ونحن نوزع المنهج</h2><p class="growth-muted">نبدأ بالأخطاء المستحقة، ثم أضعف المواد، ثم الدروس والاختبارات التي لم تُنجز بعد.</p></div><span class="growth-pill"><i class="fa-solid fa-wand-magic-sparkles"></i> تلقائي</span></div><form id="autoPlannerForm" class="auto-plan-form"><label><span>أريد الانتهاء قبل</span><input id="autoPlanEnd" type="date" required></label><label><span>وقت المذاكرة يوميًا</span><select id="autoPlanMinutes"><option value="60">ساعة</option><option value="90">ساعة ونصف</option><option value="120" selected>ساعتان</option><option value="180">3 ساعات</option><option value="240">4 ساعات</option></select></label><label><span>ابدأ من</span><input id="autoPlanStart" type="date" required></label><label><span>طريقة التوزيع</span><select id="autoPlanStyle"><option value="balanced">متوازن</option><option value="weak-first">الأضعف أولًا</option><option value="fast">إنجاز سريع</option></select></label><div class="full"><span style="font-weight:900;color:#334155">أيام الراحة</span><div class="auto-plan-days" id="autoPlanOffDays">'+['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map((n,i)=>'<label><input type="checkbox" value="'+i+'" '+(i===5?'checked':'')+'> '+n+'</label>').join('')+'</div></div><div class="auto-plan-actions"><button class="primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i> أنشئ خطتي تلقائيًا</button><a class="soft btn" href="./smart-review.html"><i class="fa-solid fa-brain"></i> المراجعة الذكية</a></div></form><div id="autoPlanSummary" class="auto-plan-summary growth-muted"></div>';
 document.getElementById('plannerAddCard').insertAdjacentElement('beforebegin',box);
 $('autoPlanStart').value=today();const end=new Date();end.setDate(end.getDate()+30);$('autoPlanEnd').value=dateKey(end);
 $('autoPlannerForm').onsubmit=generate;
}
async function generate(e){
 e.preventDefault();const btn=e.submitter,start=$('autoPlanStart').value,end=$('autoPlanEnd').value,daily=Number($('autoPlanMinutes').value||120),off=new Set([...document.querySelectorAll('#autoPlanOffDays input:checked')].map(x=>Number(x.value)));
 if(!start||!end||end<start)return C.toast('اختر تاريخ نهاية بعد تاريخ البداية.','error');
 const items=planItems();if(!items.length){$('autoPlanSummary').textContent='رائع — لا توجد دروس أو اختبارات أو مراجعات متبقية ضمن مرحلتك الحالية.';return}
 const dates=availableDates(start,end,off);if(!dates.length)return C.toast('كل الأيام المحددة أيام راحة. افتح يومًا واحدًا على الأقل.','error');
 const total=items.reduce((n,x)=>n+Math.max(10,Number(x.duration||30)),0),required=Math.ceil(total/dates.length/15)*15,effective=Math.max(daily,required);
 const style=$('autoPlanStyle').value;
 if(style==='weak-first')items.sort((a,b)=>a.weight-b.weight||String(a.subject).localeCompare(String(b.subject)));
 if(style==='fast')items.sort((a,b)=>Number(a.duration||0)-Number(b.duration||0));
 const buckets=Object.fromEntries(dates.map(d=>[d,0])),assigned=[];let di=0;
 for(const item of items){
   let tries=0;while(tries<dates.length&&buckets[dates[di]]+item.duration>effective){di=(di+1)%dates.length;tries++}
   const date=dates[di];assigned.push({...item,date});buckets[date]+=item.duration;di=(di+1)%dates.length;
 }
 window.AcademyUI?.setButtonLoading(btn,true,'إنشاء الخطة');
 try{
   const ref=C.db.ref('studentProfilesV3/'+user.uid+'/studyPlanner'),old=(await ref.once('value')).val()||{},updates={};
   Object.entries(old).forEach(([id,t])=>{if(t?.autoGenerated&&!t.done)updates[id]=null});
   const planId='auto-'+Date.now();
   assigned.forEach(t=>{const id=ref.push().key;updates[id]={title:t.title,subject:t.subject,date:t.date,duration:t.duration,priority:t.priority,done:false,autoGenerated:true,autoPlanId:planId,sourceType:t.sourceType,sourceId:t.sourceId,href:t.href,createdAt:Date.now()}});
   await ref.update(updates);
   $('autoPlanSummary').innerHTML='<strong>تم إنشاء '+assigned.length+' مهمة حتى '+new Date(end+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'})+'.</strong> إجمالي المحتوى '+total+' دقيقة. '+(required>daily?'ولكي تنتهي في موعدك رفعنا المتوسط إلى نحو '+required+' دقيقة في يوم المذاكرة.':'الخطة تناسب الوقت اليومي الذي اخترته.')+' تم استبدال المهام التلقائية غير المكتملة فقط، ولم نلمس مهامك اليدوية أو المكتملة.';
   C.toast('تم بناء خطة المذاكرة تلقائيًا ✅');
 }catch(err){console.error(err);C.toast('تعذر إنشاء الخطة الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
(async()=>{
 try{
   ({user,profile}=await C.requireStudent());
   const [l,q]=await Promise.all([C.db.ref('lessons').orderByChild('stage').equalTo(profile.stage).once('value'),C.db.ref('quizzes').orderByChild('stage').equalTo(profile.stage).once('value')]);
   lessons=Object.entries(l.val()||{}).map(([id,v])=>({id,...(v||{})}));quizzes=Object.entries(q.val()||{}).map(([id,v])=>({id,...(v||{})}));mount();
 }catch(err){console.warn('Auto planner unavailable',err)}
})();
})();