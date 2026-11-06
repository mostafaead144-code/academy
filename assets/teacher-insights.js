(()=>{'use strict';
const P=window.AcademyPro,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let questionLessons={};
const subjectNames={arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',social:'الدراسات الاجتماعية',religion:'التربية الدينية',physics:'الفيزياء',chemistry:'الكيمياء',biology:'الأحياء',history:'التاريخ',geography:'الجغرافيا',computer:'الحاسب الآلي'};
function questionSources(lessons,teacher){
 questionLessons=lessons;
 const subjects=new Map();
 Object.values(lessons).forEach(l=>{if(l?.subject)subjects.set(l.subject,l.subjectName||subjectNames[l.subject]||l.subject)});
 assignmentsOf(teacher).forEach(scope=>{const id=typeof scope==='string'?scope:scope?.subject;if(id)subjects.set(id,typeof scope==='object'?scope.subjectName||subjectNames[id]||id:subjectNames[id]||id)});
 const previous=$('singleQuestionSubject').value;
 $('singleQuestionSubject').innerHTML='<option value="">اختر المادة</option>'+[...subjects].map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 if(subjects.has(previous))$('singleQuestionSubject').value=previous;
 function update(){
  const selected=$('singleQuestionLesson').value,subject=$('singleQuestionSubject').value;
  const rows=Object.entries(lessons).filter(([,l])=>l?.subject===subject&&!l.isHidden);
  $('singleQuestionLesson').innerHTML='<option value="">بدون درس مرتبط</option>'+rows.map(([id,l])=>'<option value="'+esc(id)+'">'+esc(l.title||'درس')+' — '+esc(({primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'}[l.stage]||l.stage||'')+' / الصف '+(l.grade||''))+'</option>').join('');
  if(rows.some(([id])=>id===selected))$('singleQuestionLesson').value=selected;
 }
 $('singleQuestionSubject').onchange=update;update();
}
function assignmentsOf(t){return Array.isArray(t?.assignments)?t.assignments:Object.values(t?.assignments||{})}
function inScope(lesson,scope){
 if(!scope)return false;const s=typeof scope==='string'?{subject:scope}:scope;
 return (!s.type||s.type===lesson.type)&&(!s.stage||s.stage===lesson.stage)&&(!s.grade||String(s.grade)===String(lesson.grade))&&(!s.subject||s.subject===lesson.subject);
}
async function load(){
 const role=await P.roleOf(),uid=P.auth.currentUser?.uid;
 if(!['teacher','assistant_teacher','subject_supervisor','admin'].includes(role)){location.href='./index.html';return}
 const [statsSnap,bankSnap,analyticsSnap,lessonSnap,ratingSnap,teacherSnap,liveSnap]=await Promise.all([
  P.db.ref(P.paths.questionStats).once('value'),
  P.db.ref(P.paths.bank).once('value'),
  P.db.ref('contentAnalytics').once('value'),
  P.db.ref('lessons').once('value'),
  P.db.ref(P.paths.ratings).once('value'),
  uid?P.db.ref('teacherProfiles/'+uid).once('value'):Promise.resolve({val:()=>({})}),
  P.db.ref('liveSessions').once('value')
 ]);
 const stats=statsSnap.val()||{},bank=bankSnap.val()||{},contentAnalytics=analyticsSnap.val()||{},allLessons=lessonSnap.val()||{},ratings=ratingSnap.val()||{},teacher=teacherSnap.val?.()||{},liveSessions=liveSnap.val()||{};
 let lessons={};
 if(role==='admin')lessons=allLessons;
 else if(role==='subject_supervisor'){
  const scopes=assignmentsOf(teacher);
  Object.entries(allLessons).forEach(([id,l])=>{if(scopes.some(s=>inScope(l,s)))lessons[id]=l});
 }else{
  Object.entries(allLessons).forEach(([id,l])=>{if(l?.teacherId===uid||Object.values(l?.videos||{}).some(v=>v?.teacherId===uid)||l?.teacherIds?.[uid]===true||Object.values(l?.teacherIds||{}).includes(uid))lessons[id]=l});
 }
 questionSources(lessons,teacher);
 const lessonIds=new Set(Object.keys(lessons));
 const rows=Object.entries(stats).map(([id,v])=>({id,...v,q:bank[id]})).filter(x=>
  role==='admin'||x.q?.authorUid===uid||x.q?.teacherId===uid||lessonIds.has(x.q?.lessonId)
 ).sort((a,b)=>(b.difficultyIndex||0)-(a.difficultyIndex||0));
 $('stats').innerHTML=rows.length?rows.slice(0,60).map(x=>
  '<div class="pro-item"><div class="pro-space"><div><strong>'+esc((x.q&&(x.q.question||x.q.text))||x.id)+'</strong><div class="pro-muted">'+esc((x.q&&x.q.subject)||'')+' • '+(x.attempts||0)+' محاولة</div></div><span class="pro-badge '+((x.difficultyIndex||0)>=60?'bad':(x.difficultyIndex||0)>=35?'warn':'ok')+'">'+(x.difficultyIndex||0)+'% أخطأوا</span></div></div>'
 ).join(''):'<div class="pro-empty">لا توجد بيانات محاولات بعد.</div>';
 const heat=Object.keys(lessons).map(id=>{const v=contentAnalytics[id]||{};return{id,title:lessons[id]?.title||'درس',subject:lessons[id]?.subject||'',attempts:Number(v.quizAttempts||0),average:Number(v.quizAverage||0),completions:Number(v.completions||0),views:Number(v.views||0)}}).filter(x=>x.attempts||x.completions||x.views).sort((a,b)=>(a.average||0)-(b.average||0));
 $('heatmap').innerHTML=heat.length?'<div class="pro-heatmap">'+heat.map(x=>
  '<div class="pro-heat-cell '+((x.average||0)>=80?'hot-good':(x.average||0)>=60?'hot-mid':'hot-low')+'" title="'+esc(x.title)+'"><strong>'+esc(x.title)+'</strong><span>'+(x.average||0)+'%</span><small>'+(x.attempts||0)+' محاولة • '+x.views+' مشاهدة</small></div>'
 ).join('')+'</div>':'<div class="pro-empty">تظهر الخريطة بعد بدء الطلاب في حل تدريبات الدروس.</div>';
 const rated=Object.keys(lessons).map(id=>{const vals=Object.values(ratings[id]||{}).map(x=>Number(x.value||0)).filter(Boolean);return{id,title:lessons[id]?.title||'درس',vals,avg:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0}}).filter(x=>x.vals.length).sort((a,b)=>a.avg-b.avg);
 $('ratings').innerHTML=rated.length?rated.map(x=>{const yes=x.vals.filter(v=>v===3).length,partial=x.vals.filter(v=>v===2).length,no=x.vals.filter(v=>v===1).length;return '<div class="pro-item"><div class="pro-space"><strong>'+esc(x.title)+'</strong><span class="pro-badge '+(x.avg>=2.5?'ok':x.avg>=1.8?'warn':'bad')+'">'+Math.round(x.avg/3*100)+'% وضوح</span></div><div class="pro-muted">فهمت: '+yes+' • إلى حد ما: '+partial+' • يحتاج شرحًا: '+no+'</div></div>'}).join(''):'<div class="pro-empty">لا توجد تقييمات طلاب حتى الآن.</div>';
 const avg=heat.length?Math.round(heat.reduce((n,x)=>n+Number(x.average||0),0)/heat.length):0,attempts=heat.reduce((n,x)=>n+Number(x.attempts||0),0),needs=heat.filter(x=>Number(x.average||0)<60).length;
 const ownSessions=Object.entries(liveSessions).filter(([id,s])=>role==='admin'||s?.teacherId===uid||s?.createdBy===uid);
 const sessionRows=[];
 for(const [id,s] of ownSessions){
  try{
   const attendanceSnap=await P.db.ref(P.paths.attendance+'/'+id).once('value'),rows=Object.values(attendanceSnap.val()||{}),students=rows.length,totalSeconds=rows.reduce((n,x)=>n+Number(x.totalSeconds||0),0),avg=students?Math.round(totalSeconds/students):0,visits=rows.reduce((n,x)=>n+Number(x.visits||0),0);
   sessionRows.push({id,title:s?.title||'جلسة مباشرة',students,totalSeconds,avg,visits});
  }catch(err){console.warn('Attendance not readable for session',id)}
 }
 sessionRows.sort((a,b)=>b.totalSeconds-a.totalSeconds);
 if($('attendanceStats'))$('attendanceStats').innerHTML=sessionRows.length?sessionRows.map(x=>'<div class="pro-item"><div class="pro-space"><div><strong>'+esc(x.title)+'</strong><div class="pro-muted">'+x.students+' طالب • '+x.visits+' دخول</div></div><span class="pro-badge">'+Math.round(x.totalSeconds/60)+' دقيقة إجمالي</span></div><div class="pro-muted">متوسط حضور الطالب: '+Math.round(x.avg/60)+' دقيقة</div></div>').join(''):'<div class="pro-empty">لا توجد بيانات حضور للحصص المباشرة حتى الآن.</div>';

 $('teacherSummary').innerHTML='<div class="pro-item"><strong>'+avg+'%</strong><div class="pro-muted">متوسط أداء الدروس</div></div><div class="pro-item"><strong>'+attempts+'</strong><div class="pro-muted">محاولات مسجلة</div></div><div class="pro-item"><strong>'+needs+'</strong><div class="pro-muted">دروس تحتاج دعمًا</div></div><div class="pro-item"><strong>'+Object.keys(lessons).length+'</strong><div class="pro-muted">'+(role==='subject_supervisor'?'دروس ضمن نطاق الإشراف':'دروس ضمن نطاقك')+'</div></div>';
}
async function safeLoad(){
 window.AcademyUI?.showPageLoading('جاري تحميل تحليلاتك...');
 try{await load()}catch(err){console.error(err);['stats','heatmap','ratings','attendanceStats','teacherSummary'].forEach(id=>{if($(id))$(id).innerHTML='<div class="pro-empty">تعذر تحميل البيانات. تحقق من الاتصال واضغط تحديث.</div>'})}
 finally{window.AcademyUI?.hidePageLoading()}
}
$('refresh').onclick=safeLoad;if($('refreshQuestions'))$('refreshQuestions').onclick=safeLoad;if($('refreshAttendance'))$('refreshAttendance').onclick=safeLoad;
if($('singleQuestionForm'))$('singleQuestionForm').onsubmit=async e=>{e.preventDefault();try{
 const entries=[$('singleOption1').value.trim(),$('singleOption2').value.trim(),$('singleOption3').value.trim(),$('singleOption4').value.trim()].map((text,index)=>({text,index})).filter(x=>x.text);
 const correct=entries.findIndex(x=>x.index===Number($('singleCorrect').value)),options=entries.map(x=>x.text);
 if(options.length<2||correct<0)throw new Error('اختيار الإجابة الصحيحة غير صالح');
 const lesson=questionLessons[$('singleQuestionLesson').value],context=lesson?{type:lesson.type,stage:lesson.stage,grade:String(lesson.grade)}:{};
 await P.addQuestion({...context,question:$('singleQuestionText').value.trim(),options,correctAnswer:correct,subject:$('singleQuestionSubject').value.trim(),lessonId:$('singleQuestionLesson').value.trim(),difficulty:Number($('singleQuestionDifficulty').value||2),explanation:$('singleExplanation').value.trim()});
 alert('تم إرسال السؤال للمراجعة');$('singleQuestionForm').reset();safeLoad();
}catch(err){console.error(err);alert(err.message||'تعذر إرسال السؤال')}};
$('importBtn').onclick=async()=>{try{const arr=JSON.parse($('bulk').value);if(!Array.isArray(arr))throw 0;const ids=await P.bulkAddQuestions(arr);alert('تم إرسال '+ids.length+' سؤال بنجاح');$('bulk').value='';safeLoad()}catch(e){console.error(e);alert('تأكد أن المحتوى JSON Array صحيح وأن حسابك يملك صلاحية بنك الأسئلة.')}};
P.auth.onAuthStateChanged(u=>u?safeLoad():location.href='./teacher.html');
})();