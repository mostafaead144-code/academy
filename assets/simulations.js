(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,access=null,data={simulations:{},quizzes:{}},current=null,timer=null,endAt=0,index=0,answers=[];

const map={ar:'arabic',ma:'math',sc:'science',en:'english'};
const labels={ar:'عربي',ma:'رياضيات',sc:'علوم',en:'إنجليزي'};

function history(){
 return Object.entries(profile.simulationHistory||{}).map(([id,v])=>({id,...v})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function sims(){
 return Object.entries(data.simulations||{}).map(([id,v])=>({id,...v})).filter(s=>!s.isHidden&&s.type===profile.educationType&&s.stage===profile.stage&&String(s.grade)===String(profile.grade)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function renderStats(){
 const hs=history(),available=sims().filter(x=>!S||S.canAccess(x,access,x.subject||''));$('simAvailable').textContent=available.length;$('simAttempts').textContent=hs.length;$('simBest').textContent=(hs.length?Math.max(...hs.map(x=>Number(x.score||0))):0)+'%';$('simEarnedXp').textContent=hs.reduce((a,x)=>a+Number(x.xp||0),0);
}
function render(){
 const list=sims();$('simGrid').innerHTML=list.length?list.map(s=>{
   const counts=s.counts||{},total=Object.values(counts).reduce((a,n)=>a+Number(n||0),0);
   const allowed=!S||S.canAccess(s,access,s.subject||'');return '<article class="sim-card '+(allowed?'':'locked')+'"><span class="feature-card-icon amber"><i class="fa-solid '+(allowed?'fa-stopwatch':'fa-lock')+'"></i></span><h3>'+C.esc(s.name||'محاكي')+' '+(s.isFree?'<span class="subscription-access-pill">مجاني</span>':!allowed?'<span class="subscription-access-pill paid">اشتراك</span>':'')+'</h3><p>'+Number(s.time||60)+' دقيقة • '+total+' سؤال</p><div class="sim-counts">'+Object.entries(map).map(([k])=>'<span><strong>'+Number(counts[k]||0)+'</strong>'+labels[k]+'</span>').join('')+'</div><button class="btn '+(allowed?'btn-primary':'btn-soft')+' btn-block" data-start-sim="'+s.id+'">'+(allowed?'ابدأ المحاكاة':'<i class="fa-solid fa-crown"></i> يتطلب اشتراك')+'</button></article>';
 }).join(''):'<div class="feature-empty"><span>⏱️</span><h3>لا توجد محاكيات متاحة لصفك الآن</h3><p>عندما تضيف الإدارة محاكيًا مناسبًا لمرحلتك سيظهر هنا.</p></div>';
 $$('[data-start-sim]').forEach(b=>b.onclick=()=>start(b.dataset.startSim));
}
function pools(sim){
 const q=Object.values(data.quizzes||{}).filter(x=>!x.isHidden&&x.workflowStatus!=='draft'&&(!Number(x.publishAt||0)||Number(x.publishAt)<=Date.now())&&x.type===profile.educationType&&x.stage===profile.stage&&String(x.grade)===String(profile.grade)&&(sim?.isFree?x.isFree===true:(!S||S.canAccess(x,access,x.subject||''))));
 const out={};Object.values(map).forEach(sub=>out[sub]=[]);
 q.forEach(quiz=>{if(!out[quiz.subject])return;(quiz.questions||[]).forEach(x=>{if(x?.text&&Array.isArray(x.opts)&&x.opts.length>=2)out[quiz.subject].push({...x,subject:quiz.subject})})});
 return out;
}
function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
function buildQuestions(sim){
 const p=pools(sim),result=[];
 Object.entries(map).forEach(([key,subject])=>{const want=Number(sim.counts?.[key]||0);result.push(...shuffle(p[subject]||[]).slice(0,want))});
 return shuffle(result);
}
async function start(id){
 const sim=sims().find(x=>x.id===id);if(!sim)return;if(S&&!S.canAccess(sim,access,sim.subject||'')){S.lockOverlay({title:'المحاكي ضمن الاشتراك',text:'هذا المحاكي يحتاج باقة نشطة مناسبة.'});return}
 const questions=buildQuestions(sim);const requested=Object.values(sim.counts||{}).reduce((a,n)=>a+Number(n||0),0);
 if(!questions.length)return C.toast('لا توجد أسئلة كافية لهذا المحاكي بعد.','error');
 if(questions.length<requested){const ok=await window.AcademyUI.confirm({title:'عدد الأسئلة أقل من المطلوب',message:'المحاكي سيبدأ بالأسئلة المتاحة حاليًا بدل العدد الكامل المحدد.',tone:'warning',acceptText:'ابدأ بالمتاح'});if(!ok)return;}
 current={sim,questions};answers=new Array(questions.length).fill(null);index=0;endAt=Date.now()+Number(sim.time||60)*60000;
 $('simRunnerTitle').textContent=sim.name||'المحاكي';$('simulationRunner').classList.remove('hidden');document.body.style.overflow='hidden';$('simResult').classList.add('hidden');$('simQuestionArea').classList.remove('hidden');$('simRunnerNav').classList.remove('hidden');
 $('simNext').disabled=false;$('simNext').onclick=handleNext;tick();timer=setInterval(tick,1000);renderQuestion();
}
function tick(){
 const left=Math.max(0,endAt-Date.now()),min=Math.floor(left/60000),sec=Math.floor((left%60000)/1000);$('simTimer').textContent=String(min).padStart(2,'0')+':'+String(sec).padStart(2,'0');
 if(left<=0){clearInterval(timer);finish(true)}
}
function renderQuestion(){
 const q=current.questions[index],letters=['أ','ب','ج','د','هـ'];$('simQuestionArea').innerHTML='<article class="sim-question"><span class="section-kicker">'+labels[Object.keys(map).find(k=>map[k]===q.subject)]+' • السؤال '+(index+1)+' من '+current.questions.length+'</span><h3>'+C.esc(q.text)+'</h3><div class="sim-options">'+q.opts.map((o,i)=>'<button class="sim-option '+(answers[index]===i?'selected':'')+'" data-sim-answer="'+i+'">'+(letters[i]||i+1)+'. '+C.esc(o)+'</button>').join('')+'</div></article>';
 $$('[data-sim-answer]').forEach(b=>b.onclick=()=>{answers[index]=Number(b.dataset.simAnswer);renderQuestion()});
 $('simPrev').disabled=index===0;$('simNext').textContent=index===current.questions.length-1?'إنهاء الامتحان':'التالي';
}
$('simPrev').onclick=()=>{if(index>0){index--;renderQuestion()}};
async function handleNext(){if(index===current.questions.length-1){const ok=await window.AcademyUI.confirm({title:'إنهاء المحاكاة؟',message:'سيتم إنهاء المحاكاة الآن وحساب نتيجتك بناءً على الإجابات الحالية.',tone:'warning',acceptText:'إنهاء وإظهار النتيجة'});if(ok)finish(false)}else{index++;renderQuestion()}}
$('simNext').onclick=handleNext;
$('quitSimulation').onclick=async()=>{const ok=await window.AcademyUI.confirm({title:'الخروج من المحاكاة؟',message:'لن يتم حفظ المحاولة غير المكتملة إذا خرجت الآن.',tone:'danger',acceptText:'خروج بدون حفظ'});if(ok)closeRunner()};
function closeRunner(){clearInterval(timer);$('simulationRunner').classList.add('hidden');document.body.style.overflow='';current=null}

const xpTarget=score=>score>=80?100:score>=60?60:30;
async function finish(auto){
 if(!current||current.finishing)return;
 const run=current,selected=[...answers];run.finishing=true;clearInterval(timer);$('simNext').disabled=true;$('simPrev').disabled=true;$$('[data-sim-answer]').forEach(b=>b.disabled=true);
 try{
   const correct=run.questions.reduce((n,q,i)=>n+(selected[i]!==null&&Number(selected[i])===Number(q.correctAnswer)?1:0),0);
   const score=Math.round(correct/run.questions.length*100),answered=selected.filter(x=>x!==null).length;
   const attemptId=run.attemptId||(run.attemptId=C.db.ref('studentProfilesV3/'+user.uid+'/simulationHistory').push().key);
   const createdAt=Date.now();
   const result=await C.db.ref('studentProfilesV3/'+user.uid).transaction(p=>{
     if(!p||p.simulationHistory?.[attemptId])return;
     const prior=Object.values(p.simulationHistory||{}).filter(x=>x.simulationId===run.sim.id);
     const previous=prior.length?Math.max(...prior.map(x=>xpTarget(Number(x.score||0)))):0;
     const gained=Math.max(0,xpTarget(score)-previous);
     const rec={simulationId:run.sim.id,name:run.sim.name||'محاكي',score,correct,total:run.questions.length,answered,xp:gained,createdAt,autoFinished:!!auto};
     p.simulationHistory=p.simulationHistory||{};p.simulationHistory[attemptId]=rec;
     const stats=p.stats=p.stats||{};
     stats.completedSimulations=Number(stats.completedSimulations||0)+(prior.length?0:1);
     stats.totalXP=Number(stats.totalXP||0)+gained;stats.level=Math.floor(stats.totalXP/1000)+1;
     return p;
   });
   profile=result.snapshot.val()||profile;
   const rec=profile.simulationHistory?.[attemptId];if(!rec)throw new Error('Simulation save not confirmed');
   if(result.committed&&rec.xp){try{await C.addLeaderboardXP(user.uid,profile.name||user.displayName||'طالب',rec.xp,0)}catch(err){console.warn('Leaderboard sync deferred',err)}}
   if(current!==run)return;
   $('simQuestionArea').classList.add('hidden');$('simRunnerNav').classList.add('hidden');$('simResult').classList.remove('hidden');
   const xpText=rec.xp?(' • +'+rec.xp+' XP'):' • لا نقاط إضافية لهذه الدرجة';
   $('simResult').innerHTML='<div class="big-score">'+rec.score+'%</div><h2>'+(rec.score>=80?'ممتاز جدًا 🌟':rec.score>=60?'أداء جيد 👏':'راجع المواد وحاول مرة أخرى')+'</h2><p>إجابات صحيحة: '+rec.correct+' من '+rec.total+' • أجبت عن '+rec.answered+' سؤال'+xpText+'</p><button class="btn btn-primary" id="closeResult">العودة للمحاكيات</button>';
   $('closeResult').onclick=()=>{closeRunner();renderStats();render()};
 }catch(err){
   console.error(err);C.toast('تعذر حفظ نتيجة المحاكاة الآن. حاول مرة أخرى.','error');
   if(current===run){run.finishing=false;$('simNext').disabled=false;$('simNext').textContent='إعادة حفظ النتيجة';$('simNext').onclick=()=>finish(auto)}
 }
}

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز المحاكيات...');
 try{
   ({user,profile}=await C.requireStudent());access=S?await S.load(user.uid,profile,true):null;$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   const [s,q]=await Promise.all([
     C.db.ref('simulations').orderByChild('stage').equalTo(profile.stage).once('value'),
     C.db.ref('quizzes').orderByChild('stage').equalTo(profile.stage).once('value')
   ]);
   data={simulations:s.val()||{},quizzes:q.val()||{}};renderStats();render();
 }catch(err){
   console.error(err);C.toast('تعذر تحميل المحاكيات الآن.','error');
   $('simGrid').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل المحاكيات','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();