(() => {
'use strict';
const cfg=window.ACADEMY_BACKEND_CONFIG;
if(!cfg||!window.AcademyBackend) return;
const portalPage=location.pathname.split('/').pop()||'';
const portalRole=portalPage==='parent.html'?'parent':portalPage==='admin-pro.html'?'admin':portalPage==='teacher-insights.html'?'teacher':null;
const portalSession=portalRole?window.AcademyRoleSession?.get(portalRole):null;
if(!portalSession&&!AcademyBackend.apps.length) AcademyBackend.initializeApp(cfg);
const auth=portalSession?.auth||AcademyBackend.auth(),db=portalSession?.db||AcademyBackend.database();
const now=()=>Date.now(), day=86400000;
const dateKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const uid=()=>auth.currentUser?.uid||'';
const clean=v=>v===undefined?null:v;
const paths={
 mastery:'learningV4/mastery',reviews:'learningV4/reviews',resume:'learningV4/resume',
 notes:'learningV4/notes',favorites:'learningV4/favorites',goals:'learningV4/goals',
 streaks:'learningV4/streaks',xp:'learningV4/xp',achievements:'learningV4/achievements',diagnostics:'learningV4/diagnostics',
 recommendations:'learningV4/recommendations',questionStats:'analyticsV4/questions',
 teacherAnalytics:'analyticsV4/teachers',studentAnalytics:'analyticsV4/students',
 bank:'questionBankV4',submissions:'contentReviewV4',audit:'auditLogV4',
 parentLinks:'parentLinksV4',parentInvites:'parentInvitesV4',certificates:'certificatesV4',
 attendance:'attendanceV4',ratings:'lessonRatingsV4',targets:'targetedContentV4'
};
async function push(path,data){const r=db.ref(path).push();await r.set({...data,createdAt:now()});return r.key}
async function audit(action,entity,entityId,meta={}){const u=uid();if(!u)return;return AcademyBackend.request('events/audit',{method:'POST',token:auth._token(),body:{action,entity,entityId:entityId||'',meta}}).catch(()=>null)}
async function roleOf(userId=uid()){
 if(!userId)return 'guest';
 if(userId===uid()&&auth.currentUser?.role){
  const ownRole=auth.currentUser.role;
  if(ownRole==='admin'||ownRole==='parent'||ownRole==='student')return ownRole;
  if(ownRole==='teacher'){
   try{const profile=(await db.ref('teacherProfiles/'+userId).once('value')).val()||{};const r=profile.role||'teacher';return r==='assistant'?'assistant_teacher':r==='supervisor'?'subject_supervisor':'teacher'}catch{return 'teacher'}
  }
 }
 const [a,t,p]=await Promise.all([
  db.ref('adminProfiles/'+userId).once('value'),db.ref('teacherProfiles/'+userId).once('value'),db.ref('parentProfilesV4/'+userId).once('value')
 ]);
 if(a.val()?.isAdmin===true)return 'admin'; if(t.exists()&&t.val()?.isActive!==false){const role=t.val()?.role||'teacher';return role==='assistant'?'assistant_teacher':role==='supervisor'?'subject_supervisor':'teacher'} if(p.exists())return 'parent'; return 'student';
}
const permissions={
 admin:['*'],
 teacher:['content.submit','quiz.submit','assignment.manage','analytics.teacher','students.assigned','live.manage','questionBank.write','questionBank.read'],
 assistant_teacher:['content.submit','quiz.submit','analytics.teacher','questionBank.write','questionBank.read'],
 subject_supervisor:['content.submit','quiz.submit','assignment.manage','analytics.teacher','students.assigned','questionBank.write','questionBank.read'],
 parent:['children.read','reports.read','notifications.read'],
 student:['learning.read','learning.write','quiz.take','notes.write','favorites.write','certificate.read']
};
async function can(action){const r=await roleOf();return permissions[r]?.includes('*')||permissions[r]?.includes(action)}
function levelForXP(xp){return Math.max(1,Math.floor(Math.sqrt(Math.max(0,Number(xp||0))/120))+1)}
async function touchStreak(userId=uid()){
 if(!userId)return null; const ref=db.ref(paths.streaks+'/'+userId); const today=dateKey();
 let out;
 await ref.transaction(s=>{
  s=s||{count:0,best:0,lastDate:'',totalDays:0};
  if(s.lastDate===today){out=s;return s}
  const y=new Date();y.setDate(y.getDate()-1);
  s.count=s.lastDate===dateKey(y)?Number(s.count||0)+1:1;
  s.best=Math.max(Number(s.best||0),s.count);s.totalDays=Number(s.totalDays||0)+1;s.lastDate=today;s.updatedAt=now();out=s;return s;
 }); return out;
}
async function awardXP(amount,reason,meta={},userId=uid()){
 if(!userId||!amount)return null; const ref=db.ref(paths.xp+'/'+userId);
 let result;
 await ref.transaction(x=>{x=x||{total:0,level:1,historyCount:0};x.total=Number(x.total||0)+Number(amount);x.level=levelForXP(x.total);x.historyCount=Number(x.historyCount||0)+1;x.updatedAt=now();result=x;return x});
 await push(paths.xp+'/'+userId+'/history',{amount:Number(amount),reason,meta,at:now()});
 await touchStreak(userId); return result;
}
async function setWeeklyGoals(goals,userId=uid()){
 if(!userId)return; const d=new Date(),m=new Date(d);m.setDate(d.getDate()-((d.getDay()+6)%7));
 const key=dateKey(m);await db.ref(paths.goals+'/'+userId+'/'+key).update({...goals,week:key,updatedAt:now()});return key;
}
async function incrementGoal(field,delta=1,userId=uid()){
 if(!userId)return; const d=new Date(),m=new Date(d);m.setDate(d.getDate()-((d.getDay()+6)%7));const key=dateKey(m);
 await db.ref(paths.goals+'/'+userId+'/'+key+'/progress/'+field).transaction(v=>Number(v||0)+Number(delta||1));
}
async function recordMastery(ctx,metrics={},userId=uid()){
 if(!userId||!ctx?.lessonId)return;
 const key=[ctx.type||'public',ctx.stage||'prep',ctx.grade||1,ctx.subject||'general',ctx.lessonId].join('/'),ref=db.ref(paths.mastery+'/'+userId+'/'+key);
 let earnedMastery=false,payload=null;
 await ref.transaction(current=>{
  current=current||{};
  const v=metrics.video===undefined?Number(current.video||0):Math.max(Number(current.video||0),Number(metrics.video||0));
  const q=metrics.quiz===undefined?Number(current.quiz||0):Math.max(Number(current.quiz||0),Number(metrics.quiz||0));
  const p=metrics.practice===undefined?Number(current.practice||0):Math.max(Number(current.practice||0),Number(metrics.practice||0));
  const rv=metrics.review===undefined?Number(current.review||0):Math.max(Number(current.review||0),Number(metrics.review||0));
  const score=Math.round(v*.25+q*.45+p*.2+rv*.1);
  const status=score>=85?'mastered':score>=60?'learning':score>0?'review':'not_started';
  earnedMastery=current.status!=='mastered'&&status==='mastered';
  payload={...current,...ctx,video:v,quiz:q,practice:p,review:rv,score,status,updatedAt:now()};
  return payload;
 });
 if(earnedMastery){await awardXP(40,'lesson_mastered',{lessonId:ctx.lessonId},userId);await incrementGoal('lessons',1,userId)}
 return payload;
}
async function saveResume(kind,id,position,total,userId=uid()){
 if(!userId||!id)return;const pct=total?Math.min(100,Math.round((position/total)*100)):0;
 await db.ref(paths.resume+'/'+userId+'/'+kind+'/'+id).set({position:Number(position||0),total:Number(total||0),percent:pct,updatedAt:now()});
}
async function getResume(kind,id,userId=uid()){return (await db.ref(paths.resume+'/'+userId+'/'+kind+'/'+id).once('value')).val()}
async function saveNote(ctx,text,userId=uid()){if(!userId||!ctx?.lessonId)return;const id=ctx.noteId||db.ref().push().key;await db.ref(paths.notes+'/'+userId+'/'+ctx.lessonId+'/'+id).set({...ctx,text:String(text||'').slice(0,5000),updatedAt:now()});return id}
async function toggleFavorite(type,id,data={},userId=uid()){if(!userId||!id)return false;const ref=db.ref(paths.favorites+'/'+userId+'/'+type+'/'+id),s=await ref.once('value');if(s.exists()){await ref.remove();return false}await ref.set({...data,id,type,createdAt:now()});return true}
const reviewIntervals=[1,3,7,14,30,60];
async function logMistake(question,ctx={},userId=uid()){
 if(!userId||!question?.id)return;const ref=db.ref(paths.reviews+'/'+userId+'/'+question.id),s=(await ref.once('value')).val()||{};
 const step=Math.max(0,Number(s.step||0)-1);
 const options=question.options||question.opts||[];
 const rawCorrect=question.correctAnswer??question.correct??'',correctIndex=Number.isInteger(Number(rawCorrect))?Number(rawCorrect):options.findIndex(x=>String(x)===String(rawCorrect));
 await ref.set({questionId:question.id,questionText:question.question||question.text||'',options,correctIndex,correctAnswer:correctIndex>=0?options[correctIndex]:rawCorrect,explanation:question.explanation||'',studentAnswer:ctx.studentAnswer??'',lessonId:ctx.lessonId||'',subject:ctx.subject||'',step,nextReviewAt:now()+reviewIntervals[step]*day,lastWrongAt:now(),wrongCount:Number(s.wrongCount||0)+1,correctReviews:Number(s.correctReviews||0),status:'due'});
}
async function markReview(questionId,correct,userId=uid()){
 if(!userId||!questionId)return;const ref=db.ref(paths.reviews+'/'+userId+'/'+questionId);
 await ref.transaction(s=>{if(!s)return s;let step=Number(s.step||0);step=correct?Math.min(reviewIntervals.length-1,step+1):Math.max(0,step-1);s.step=step;s.lastReviewAt=now();s.nextReviewAt=now()+reviewIntervals[step]*day;s.status=step>=reviewIntervals.length-1&&correct?'mastered':'scheduled';s.correctReviews=Number(s.correctReviews||0)+(correct?1:0);return s});
 if(correct)await awardXP(5,'mistake_review',{questionId},userId);
}
async function dueReviews(userId=uid(),limit=30()){if(!userId)return[];const s=await db.ref(paths.reviews+'/'+userId).once('value');return Object.values(s.val()||{}).filter(x=>Number(x.nextReviewAt||0)<=now()&&x.status!=='mastered').sort((a,b)=>a.nextReviewAt-b.nextReviewAt).slice(0,limit)}
async function updateQuestionStats(questionId,correct,answer){
 if(!questionId||!auth.currentUser)return;
 return AcademyBackend.request('events/question-answer',{method:'POST',token:auth._token(),body:{questionId:String(questionId),correct:!!correct,answer:String(answer??'')}}).catch(()=>null);
}
function adaptiveDifficulty(history=[]){const last=history.slice(-5);if(!last.length)return 2;const rate=last.filter(Boolean).length/last.length;return rate>=.8?3:rate<=.4?1:2}
function selectAdaptiveQuestions(bank,history,count=10){const difficulty=adaptiveDifficulty(history);const scored=[...(bank||[])].sort((a,b)=>Math.abs(Number(a.difficulty||2)-difficulty)-Math.abs(Number(b.difficulty||2)-difficulty));return scored.slice(0,count)}
async function submitAnswer(question,correct,answer,ctx={}){
 await updateQuestionStats(question.id,correct,answer);
 if(!correct){await logMistake(question,{...ctx,studentAnswer:answer});return}
 const userId=uid();if(!userId)return;
 const review=await db.ref(paths.reviews+'/'+userId+'/'+question.id).once('value');
 if(review.exists())await markReview(question.id,true,userId);
 else await awardXP(2,'correct_answer',{questionId:question.id},userId);
}
async function saveDiagnostic(subject,result,userId=uid()){if(!userId)return;const id=dateKey();const strengths=(result.skills||[]).filter(x=>x.score>=80),weaknesses=(result.skills||[]).filter(x=>x.score<60);const report={subject,score:result.score||0,strengths,weaknesses,recommendations:weaknesses.map(x=>x.lessonId).filter(Boolean),createdAt:now()};await db.ref(paths.diagnostics+'/'+userId+'/'+subject+'/'+id).set(report);return report}
async function recommendNext(ctx,userId=uid()){
 if(!userId)return null;
 const [m,r,d,l]=await Promise.all([
  db.ref(paths.mastery+'/'+userId).once('value'),db.ref(paths.reviews+'/'+userId).once('value'),
  db.ref(paths.diagnostics+'/'+userId+'/'+(ctx.subject||'general')).once('value'),db.ref('lessons').once('value')
 ]);
 const due=Object.values(r.val()||{}).filter(x=>x.subject===ctx.subject&&x.nextReviewAt<=now()&&x.status!=='mastered');
 if(due.length)return{type:'review',title:'مراجعة أخطائك',count:due.length,reason:'لديك أسئلة حان وقت مراجعتها'};
 const lessons=Object.entries(l.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>
  !x.isHidden&&(!ctx.type||!x.type||x.type===ctx.type)&&(!ctx.stage||!x.stage||x.stage===ctx.stage)&&(!ctx.grade||!x.grade||String(x.grade)===String(ctx.grade))&&(!ctx.subject||x.subject===ctx.subject)
 );
 const diagnostics=Object.values(d.val()||{}).filter(Boolean).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
 const latest=diagnostics[0];
 if(latest){
  const weak=(latest.weaknesses||latest.skills||[]).filter(x=>Number(x.score||0)<60&&x.lessonId).sort((a,b)=>Number(a.score||0)-Number(b.score||0));
  const target=weak.map(w=>lessons.find(x=>x.id===w.lessonId)).find(Boolean);
  if(target)return{type:'lesson',lessonId:target.id,title:target.title||'راجع هذا الدرس',reason:'اختبار تحديد المستوى كشف أن هذه المهارة تحتاج تقوية',score:weak[0]?.score};
 }
 const flat=[];const walk=o=>{Object.values(o||{}).forEach(v=>v&&typeof v==='object'&&'lessonId'in v?flat.push(v):walk(v))};walk(m.val()||{});
 const weak=flat.filter(x=>x.subject===ctx.subject&&x.status!=='mastered').sort((a,b)=>Number(a.score||0)-Number(b.score||0))[0];
 if(weak){const target=lessons.find(x=>x.id===weak.lessonId);return{type:'lesson',lessonId:weak.lessonId,title:target?.title||'استكمل هذا الدرس',reason:'هذا أقل درس في مستوى الإتقان لديك',score:weak.score}}
 const mastered=new Set(flat.filter(x=>x.status==='mastered').map(x=>x.lessonId)),nextLesson=lessons.sort((a,b)=>Number(a.unit||0)-Number(b.unit||0)||Number(a.order||0)-Number(b.order||0)).find(x=>!mastered.has(x.id));
 return nextLesson?{type:'lesson',lessonId:nextLesson.id,title:nextLesson.title||'ابدأ الدرس التالي',reason:'هذه هي الخطوة التالية في مسارك حسب تقدمك الحالي'}:null;
}
async function addQuestion(question,mode='pending'){
 if(!await can('questionBank.write')&&!await can('*'))throw new Error('غير مصرح');
 const id=question.id||db.ref().push().key;const role=await roleOf();const status=role==='admin'?'approved':mode;
 const payload={...question,id,status,authorUid:uid(),authorRole:role,updatedAt:now(),createdAt:question.createdAt||now()};
 await db.ref(paths.bank+'/'+id).set(payload);await audit('question.create','question',id,{status});return id;
}
async function bulkAddQuestions(items=[],defaults={}){const ids=[];for(const q of items){ids.push(await addQuestion({...defaults,...q}))}return ids}
async function generateExam(filter={},count=20){
 const s=await db.ref(paths.bank).once('value');let arr=Object.values(s.val()||{}).filter(q=>q.status==='approved');
 for(const [k,v] of Object.entries(filter)){if(v!==undefined&&v!==''&&k!=='difficultyMix')arr=arr.filter(q=>String(q[k]??'')===String(v))}
 if(filter.difficultyMix){const mix=filter.difficultyMix,out=[];for(const [d,n] of Object.entries(mix))out.push(...arr.filter(q=>String(q.difficulty||2)===String(d)).sort(()=>Math.random()-.5).slice(0,n));return out.slice(0,count)}
 return arr.sort(()=>Math.random()-.5).slice(0,count);
}
async function submitContent(type,payload){
 const id=db.ref().push().key,role=await roleOf();const item={id,type,payload,status:role==='admin'?'approved':'pending',authorUid:uid(),authorRole:role,createdAt:now(),updatedAt:now()};
 await db.ref(paths.submissions+'/'+id).set(item);await audit('content.submit',type,id,{status:item.status});return id;
}
async function reviewContent(id,status,reason=''){if(await roleOf()!=='admin')throw new Error('غير مصرح');await db.ref(paths.submissions+'/'+id).update({status,reason,reviewerUid:uid(),reviewedAt:now()});await audit('content.review','submission',id,{status,reason})}
async function recordAttendance(sessionId,joined=true,userId=uid()){
 if(!userId||!sessionId)return;
 const ref=db.ref(paths.attendance+'/'+sessionId+'/'+userId),ts=now();
 const result=await ref.transaction(row=>{
  row=row||{totalSeconds:0,visits:0};
  if(joined){
    if(!row.activeSince){row.activeSince=ts;row.visits=Number(row.visits||0)+1}
    row.joinedAt=row.joinedAt||ts;row.lastSeenAt=ts;row.isPresent=true;
  }else{
    const start=Number(row.activeSince||row.lastSeenAt||ts);
    row.totalSeconds=Number(row.totalSeconds||0)+Math.max(0,Math.round((ts-start)/1000));
    row.leftAt=ts;row.lastSeenAt=ts;row.isPresent=false;delete row.activeSince;
  }
  return row;
 });
 const row=result?.snapshot?.val?.()||{};
 await db.ref(paths.studentAnalytics+'/'+userId+'/attendance/'+sessionId).set({
  totalSeconds:Number(row.totalSeconds||0),visits:Number(row.visits||0),lastSeenAt:Number(row.lastSeenAt||ts),updatedAt:ts
 }).catch(()=>{});
}
async function recordTeacherOutcome(teacherId,ctx={},score=0){
 if(!teacherId||!ctx.lessonId)return;
 const ref=db.ref(paths.teacherAnalytics+'/'+teacherId+'/lessons/'+ctx.lessonId);
 await ref.transaction(row=>{
  row=row||{attempts:0,scoreTotal:0,average:0,low:0,mid:0,high:0};
  const s=Math.max(0,Math.min(100,Number(score||0)));
  row.attempts=Number(row.attempts||0)+1;row.scoreTotal=Number(row.scoreTotal||0)+s;row.average=Math.round(row.scoreTotal/row.attempts);
  if(s<60)row.low=Number(row.low||0)+1;else if(s<80)row.mid=Number(row.mid||0)+1;else row.high=Number(row.high||0)+1;
  row.subject=ctx.subject||row.subject||'';row.title=ctx.title||row.title||'';row.updatedAt=now();return row;
 });
}async function rateLesson(lessonId,value,comment='',userId=uid()){if(!userId||!lessonId)return;await db.ref(paths.ratings+'/'+lessonId+'/'+userId).set({value:Number(value),comment:String(comment||'').slice(0,500),createdAt:now()})}
function normalizePhone(raw=''){
 const digits=String(raw||'').replace(/[٠-٩۰-۹]/g,ch=>String(ch.charCodeAt(0)-(ch.charCodeAt(0)>=1776?1776:1632))).replace(/[\s()\-.]/g,'');
 let phone=digits;
 if(/^01[0125]\d{8}$/.test(phone))phone='+20'+phone.slice(1);
 else if(/^0020(1[0125]\d{8})$/.test(phone))phone='+20'+phone.slice(4);
 else if(/^20(1[0125]\d{8})$/.test(phone))phone='+'+phone;
 if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('رقم الهاتف غير صحيح');
 return phone;
}
async function createParentInvite(studentId=uid()){if(!studentId||studentId!==uid())return null;const r=await AcademyBackend.request('parent/invite',{method:'POST',token:auth._token()});return r.code}
async function linkParent(code,parentId=uid()){if(!parentId||parentId!==uid())throw new Error('سجّل الدخول أولًا');const r=await AcademyBackend.request('parent/link/code',{method:'POST',token:auth._token(),body:{code:String(code||'').toUpperCase()}});return r.studentId}
async function linkParentByPhone(rawPhone,parentId=uid()){
 if(!parentId||parentId!==uid())throw new Error('سجّل الدخول أولًا');
 const phone=normalizePhone(rawPhone);const r=await AcademyBackend.request('parent/link/phone',{method:'POST',token:auth._token(),body:{phone}});return r.studentId;
}
async function getChildren(parentId=uid()){const s=await db.ref(paths.parentLinks+'/'+parentId).once('value');return Object.keys(s.val()||{})}
async function parentReport(studentId){
 const [p,x,m,g,r,a,as]=await Promise.all([
  db.ref('studentProfilesV3/'+studentId).once('value'),db.ref(paths.xp+'/'+studentId).once('value'),db.ref(paths.mastery+'/'+studentId).once('value'),db.ref(paths.goals+'/'+studentId).once('value'),db.ref(paths.reviews+'/'+studentId).once('value'),db.ref(paths.studentAnalytics+'/'+studentId).once('value'),db.ref('assignments').once('value')
 ]);
 const profile=p.val()||{},allAssignments=Object.entries(as.val()||{}).map(([id,v])=>({id,...(v||{})}));
 const matches=a=>{
  if(a.isHidden)return false;
  if(a.type&&a.type!==profile.educationType)return false;
  if(a.stage&&a.stage!==profile.stage)return false;
  if(a.grade&&String(a.grade)!==String(profile.grade))return false;
  const mode=a.targetMode||'all';
  if(mode==='students'){const ids=Array.isArray(a.targetStudentIds)?a.targetStudentIds:Object.keys(a.targetStudentIds||{});return ids.includes(studentId)}
  if(mode==='group'){const groups=Array.isArray(profile.groupIds)?profile.groupIds:Object.keys(profile.groupIds||{});return !!a.targetGroupId&&(profile.classGroupId===a.targetGroupId||groups.includes(a.targetGroupId))}
  return true;
 };
 const assignments=allAssignments.filter(matches),submissions={};
 await Promise.all(assignments.map(async a=>{try{const s=await db.ref('assignmentSubmissions/'+a.id+'/'+studentId).once('value');if(s.exists())submissions[a.id]=s.val()}catch{}}));
 const nowTs=now(),assignmentSummary={total:assignments.length,submitted:0,graded:0,pending:0,overdue:0,dueSoon:0};
 assignments.forEach(a=>{const s=submissions[a.id],due=Number(a.dueAt||0);if(s?.status==='graded')assignmentSummary.graded++;else if(s)assignmentSummary.submitted++;else{assignmentSummary.pending++;if(due&&due<nowTs)assignmentSummary.overdue++;else if(due&&due-nowTs<=48*3600000)assignmentSummary.dueSoon++}});
 return{profile,xp:x.val()||{},mastery:m.val()||{},goals:g.val()||{},reviews:r.val()||{},analytics:a.val()||{},assignmentSummary};
}
function certificateIdFor(data,userId=uid()){
 const raw=[userId,data.type||'public',data.stage||'',data.grade||'',data.subject||''].join('-').replace(/[^a-zA-Z0-9_-]/g,'-');
 return 'ACD-'+raw.slice(0,72).toUpperCase();
}
async function issueCertificate(data,userId=uid()){
 if(!userId||userId!==uid())return null;
 const r=await AcademyBackend.request('certificates/issue',{method:'POST',token:auth._token(),body:data});return r.id||null;
}
async function verifyCertificate(id){const r=await AcademyBackend.request('certificates/verify',{query:{id:String(id||'').trim().toUpperCase()}});return r.certificate||null}
async function refreshAchievements(userId=uid()){
 if(!userId)return{};
 const [x,s,m,r,a]=await Promise.all([
  db.ref(paths.xp+'/'+userId).once('value'),
  db.ref(paths.streaks+'/'+userId).once('value'),
  db.ref(paths.mastery+'/'+userId).once('value'),
  db.ref(paths.reviews+'/'+userId).once('value'),
  db.ref(paths.achievements+'/'+userId).once('value')
 ]);
 const xp=Number(x.val()?.total||0),streak=Number(s.val()?.best||s.val()?.count||0),existing=a.val()||{};
 const mastered=[];(function walk(o){Object.values(o||{}).forEach(v=>v&&typeof v==='object'&&'lessonId'in v?(v.status==='mastered'&&mastered.push(v)):walk(v))})(m.val()||{});
 const reviews=Object.values(r.val()||{}),reviewWins=reviews.reduce((n,v)=>n+Number(v.correctReviews||0),0);
 const defs=[
  ['first_mastery','أول إتقان','أتقنت أول درس','🌟',mastered.length>=1],
  ['mastery_10','خبير البداية','أتقنت 10 دروس','🏅',mastered.length>=10],
  ['streak_7','أسبوع متواصل','تعلمت 7 أيام متتالية','🔥',streak>=7],
  ['streak_30','شهر من الالتزام','حافظت على سلسلة 30 يومًا','👑',streak>=30],
  ['xp_1000','ألف نقطة','وصلت إلى 1000 XP','⚡',xp>=1000],
  ['review_50','صياد الأخطاء','راجعت 50 خطأ بنجاح','🧠',reviewWins>=50]
 ];
 const patch={};
 defs.forEach(([id,title,description,icon,earned])=>{
  if(earned&&!existing[id])patch[id]={id,title,description,icon,earnedAt:now()};
 });
 if(Object.keys(patch).length)await db.ref(paths.achievements+'/'+userId).update(patch);
 return{...existing,...patch};
}
async function snapshot(userId=uid()){
 const [x,s,g,r]=await Promise.all([db.ref(paths.xp+'/'+userId).once('value'),db.ref(paths.streaks+'/'+userId).once('value'),db.ref(paths.goals+'/'+userId).once('value'),db.ref(paths.reviews+'/'+userId).once('value')]);
 const achievements=await refreshAchievements(userId);return{xp:x.val()||{total:0,level:1},streak:s.val()||{count:0,best:0},goals:g.val()||{},achievements,due:Object.values(r.val()||{}).filter(v=>v.nextReviewAt<=now()&&v.status!=='mastered').length};
}
window.AcademyPro={auth,db,paths,roleOf,can,audit,awardXP,touchStreak,setWeeklyGoals,incrementGoal,recordMastery,saveResume,getResume,saveNote,toggleFavorite,logMistake,markReview,dueReviews,updateQuestionStats,adaptiveDifficulty,selectAdaptiveQuestions,submitAnswer,saveDiagnostic,recommendNext,addQuestion,bulkAddQuestions,generateExam,submitContent,reviewContent,recordAttendance,recordTeacherOutcome,rateLesson,createParentInvite,linkParent,linkParentByPhone,getChildren,parentReport,issueCertificate,certificateIdFor,verifyCertificate,refreshAchievements,snapshot,levelForXP,dateKey};
})();