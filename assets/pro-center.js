(()=>{'use strict';
const $=id=>document.getElementById(id),P=window.AcademyPro,C=window.AcademyCore;
let ctx={subject:''},targetCount=10,diagAttemptId='',diagQuestions=[],diagAnswers=[],diagIndex=0;
function flatMastery(o){const a=[];(function w(x){Object.values(x||{}).forEach(v=>v&&typeof v==='object'&&'lessonId'in v?a.push(v):w(v))})(o);return a}
function row(label,val,max){const p=max?Math.min(100,Math.round(val/max*100)):0;return '<div class="pro-item"><div class="pro-space"><strong>'+label+'</strong><span>'+val+' / '+max+'</span></div><div class="pro-progress"><span style="width:'+p+'%"></span></div></div>'}
async function load(){
 const {user,profile}=await C.requireStudent();
 ctx={type:profile.educationType||'public',stage:profile.stage||'prep',grade:String(profile.grade||1),subject:profile.lastSubject||profile.lastSubjectId||'arabic'};
 try{const custom=(await P.db.ref('customSubjects').once('value')).val()||{};const subjects=C.subjectsFor({customSubjects:custom},ctx.stage,ctx.grade,ctx.type);$('diagSubject').innerHTML=subjects.map(x=>'<option value="'+C.esc(x.id)+'">'+C.esc(x.name)+'</option>').join('');if(subjects.some(x=>x.id===ctx.subject))$('diagSubject').value=ctx.subject;else if(subjects[0])ctx.subject=subjects[0].id}catch{}
 await P.touchStreak();
 const snap=await P.snapshot(user.uid);
 $('level').textContent=snap.xp.level||1;$('xp').textContent=(snap.xp.total||0)+' XP';$('streak').textContent=(snap.streak.count||0)+' 🔥';$('bestStreak').textContent='أفضل سلسلة: '+(snap.streak.best||0);$('due').textContent=snap.due||0;
 const ach=Object.values(snap.achievements||{}).sort((a,b)=>(b.earnedAt||0)-(a.earnedAt||0));
 $('achievementList').innerHTML=ach.length?ach.map(x=>'<div class="pro-item"><div class="pro-space"><div><strong>'+C.esc((x.icon||'🏆')+' '+(x.title||'إنجاز'))+'</strong><div class="pro-muted">'+C.esc(x.description||'')+'</div></div><span class="pro-badge ok">مفتوحة</span></div></div>').join(''):'<div class="pro-empty">أكمل أول درس أو حافظ على سلسلة تعلم لفتح أول شارة.</div>';
 const rec=await P.recommendNext(ctx,user.uid);$('nextTitle').textContent=rec?.title||'أكمل رحلتك التعليمية';$('nextReason').textContent=rec?.reason||'اختر مادة وابدأ درسًا جديدًا';$('nextAction').onclick=()=>location.href=rec?.lessonId?'./lesson.html?id='+encodeURIComponent(rec.lessonId):'./explore.html';
 const ms=(await P.db.ref(P.paths.mastery+'/'+user.uid).once('value')).val()||{},m=flatMastery(ms),counts={mastered:0,learning:0,review:0};m.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
 $('masterySummary').innerHTML=['متقن','قيد التعلم','يحتاج مراجعة'].map((n,i)=>'<div class="pro-item"><div class="pro-space"><strong>'+n+'</strong><span class="pro-badge '+(i===0?'ok':i===2?'bad':'warn')+'">'+[counts.mastered,counts.learning,counts.review][i]+'</span></div></div>').join('')||'<div class="pro-empty">ابدأ أول درس ليظهر مستوى الإتقان.</div>';
 const due=await P.dueReviews(user.uid,12);$('reviewList').innerHTML=due.length?due.map((q,i)=>'<div class="pro-item"><div class="pro-space"><div><strong>'+C.esc(q.questionText||'سؤال مراجعة')+'</strong><div class="pro-muted">'+C.esc(q.subject||'')+' • مرحلة المراجعة '+(Number(q.step||0)+1)+'</div></div>'+(Array.isArray(q.options)&&q.options.length?'<button class="pro-btn" data-review-index="'+i+'">راجع الآن</button>':'<span class="pro-badge warn">سيُحدّث عند محاولتك القادمة</span>')+'</div></div>').join(''):'<div class="pro-empty">لا توجد مراجعات مستحقة الآن 🎉</div>';
 $('reviewList').querySelectorAll('[data-review-index]').forEach(b=>b.onclick=()=>playReview(due[Number(b.dataset.reviewIndex)]));
 const goals=snap.goals||{},latest=Object.values(goals).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]||{};$('goalLessons').value=latest.lessons||'';$('goalQuizzes').value=latest.quizzes||'';$('goalMinutes').value=latest.minutes||'';const pr=latest.progress||{};
 $('goalProgress').innerHTML=(latest.lessons?row('الدروس',pr.lessons||0,latest.lessons):'')+(latest.quizzes?row('الاختبارات',pr.quizzes||0,latest.quizzes):'')+(latest.minutes?row('دقائق المذاكرة',pr.minutes||0,latest.minutes):'');
 $('saveGoals').onclick=async()=>{await P.setWeeklyGoals({lessons:+$('goalLessons').value||3,quizzes:+$('goalQuizzes').value||2,minutes:+$('goalMinutes').value||60});alert('تم حفظ أهدافك الأسبوعية');load()};
 $('parentCodeBtn').onclick=async()=>{$('parentCode').textContent=await P.createParentInvite(user.uid)};
 $('startDiagnostic').onclick=startDiag;
}
function playReview(q){
 const opts=Array.isArray(q.options)?q.options:[];if(!opts.length)return;
 $('reviewList').innerHTML='<div class="pro-item"><span class="pro-badge">مراجعة متباعدة</span><h3>'+C.esc(q.questionText||'')+'</h3><div class="pro-list">'+opts.map((o,i)=>'<button class="pro-btn" data-review-answer="'+i+'">'+C.esc(o)+'</button>').join('')+'</div><div id="reviewFeedback" class="pro-muted" style="margin-top:10px"></div></div>';
 $('reviewList').querySelectorAll('[data-review-answer]').forEach(b=>b.onclick=async()=>{
  const chosen=Number(b.dataset.reviewAnswer),correct=chosen===Number(q.correctIndex),buttons=[...$('reviewList').querySelectorAll('[data-review-answer]')];buttons.forEach(x=>x.disabled=true);
  const fb=$('reviewFeedback');fb.innerHTML=correct?'✅ إجابة صحيحة. ستنتقل هذه المعلومة إلى فترة مراجعة أطول.':'❌ الإجابة الصحيحة: <strong>'+C.esc(q.correctAnswer||opts[q.correctIndex]||'')+'</strong>'+(q.explanation?'<br>'+C.esc(q.explanation):'');
  await P.markReview(q.questionId,correct);
  setTimeout(load,900);
 });
}
async function startDiag(){
 const subject=$('diagSubject').value.trim()||ctx.subject;targetCount=+$('diagCount').value||10;if(!subject)return;
 $('startDiagnostic').disabled=true;$('diagnosticArea').innerHTML='<div class="pro-item">جاري تجهيز اختبار آمن ومتدرج الصعوبة…</div>';
 try{
  const r=await AcademyBackend.request('learning/diagnostic/start',{method:'POST',token:C.auth._token(),body:{subject,count:targetCount}});
  diagAttemptId=r.attemptId;diagQuestions=r.questions||[];diagAnswers=[];diagIndex=0;if(!diagQuestions.length)throw new Error('لا توجد أسئلة كافية');renderDiagnosticQuestion();
 }catch(e){console.error(e);$('diagnosticArea').innerHTML='<div class="pro-empty">لا توجد أسئلة معتمدة كافية لهذه المادة حاليًا.</div>'}
 finally{$('startDiagnostic').disabled=false}
}
function renderDiagnosticQuestion(){
 if(diagIndex>=diagQuestions.length)return finishDiag();const q=diagQuestions[diagIndex],opts=q.options||[],difficulty=Number(q.difficulty||2),labels={1:'سهل',2:'متوسط',3:'صعب'};
 $('diagnosticArea').innerHTML='<div class="pro-item"><div class="pro-space"><span class="pro-badge">سؤال '+(diagIndex+1)+' من '+diagQuestions.length+'</span><span class="pro-badge '+(difficulty===3?'bad':difficulty===1?'ok':'warn')+'">'+(labels[difficulty]||'متوسط')+'</span></div><h3>'+C.esc(q.question||'')+'</h3><div class="pro-list">'+opts.map((o,j)=>'<button class="pro-btn" data-a="'+j+'">'+C.esc(o)+'</button>').join('')+'</div><div class="pro-muted">لن تظهر صحة الإجابة الآن حتى يظل اختبار تحديد المستوى آمنًا.</div></div>';
 $('diagnosticArea').querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{diagAnswers[diagIndex]=Number(b.dataset.a);diagIndex++;renderDiagnosticQuestion()});
}
async function finishDiag(){
 if(!diagAttemptId)return;$('diagnosticArea').innerHTML='<div class="pro-item">جاري تحليل مستواك وبناء توصياتك…</div>';
 try{
  const r=await AcademyBackend.request('learning/diagnostic/submit',{method:'POST',token:C.auth._token(),body:{attemptId:diagAttemptId,answers:diagAnswers}}),report=r.report||{},score=Number(report.score||0),skills=report.skills||[],weak=(report.weaknesses||skills.filter(x=>Number(x.score||0)<60)).sort((a,b)=>Number(a.score||0)-Number(b.score||0));
  $('diagnosticArea').innerHTML='<div class="pro-item"><div class="pro-kpi">'+score+'%</div><strong>نتيجة تحديد المستوى</strong><div class="pro-muted">'+(score>=80?'مستواك قوي. سيعطي المسار أولوية للتقدم والدروس الأعلى مستوى.':score>=60?'مستواك متوسط. سيوازن المسار بين الدروس الجديدة وتثبيت نقاط الضعف.':'سيبدأ مسارك من المهارات الأساسية التي تحتاج تقوية أولًا.')+'</div>'+(weak.length?'<div class="pro-list" style="margin-top:10px">'+weak.slice(0,5).map(x=>'<div class="pro-item"><strong>'+C.esc(x.skill||'مهارة')+'</strong><span class="pro-badge bad">'+Number(x.score||0)+'%</span></div>').join('')+'</div>':'<div class="pro-badge ok" style="margin-top:10px">لا توجد نقطة ضعف واضحة في هذه المحاولة</div>')+'</div>';
  await P.awardXP(10,'diagnostic_complete',{score,attemptId:diagAttemptId});diagAttemptId='';
  const rec=await P.recommendNext({...ctx,subject:$('diagSubject').value.trim()||ctx.subject});if(rec){$('nextTitle').textContent=rec.title||'خطوتك التالية';$('nextReason').textContent=rec.reason||'';$('nextAction').onclick=()=>location.href=rec.lessonId?'./lesson.html?id='+encodeURIComponent(rec.lessonId):'./explore.html'}
 }catch(e){console.error(e);$('diagnosticArea').innerHTML='<div class="pro-empty">تعذر حفظ نتيجة الاختبار. ابدأ محاولة جديدة.</div>';diagAttemptId=''}
}
load().catch(e=>{console.error(e);$('nextTitle').textContent='تعذر تحميل المركز'});
})();