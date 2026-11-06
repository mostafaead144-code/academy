(() => {
'use strict';
if(!window.AcademyBackend||!AcademyBackend.apps.length)return;
const auth=AcademyBackend.auth(),db=AcademyBackend.database(),qs=new URLSearchParams(location.search);
const lessonId=qs.get('id')||'';if(!lessonId)return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,profile={},lesson={},threads={},submissions={},editingId='',stopThreads=null,stopSubs=null;

function initials(name='طالب'){return String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')||'ط'}
function statusLabel(s){return s==='approved'?'معتمد':s==='rejected'?'مرفوض':s==='changes_requested'?'يحتاج تعديل':'قيد المراجعة'}
function statusClass(s){return ['approved','rejected','changes_requested'].includes(s)?s:'pending'}
function teacherInfo(){
 const teacherId=lesson.teacherId||(Array.isArray(lesson.videos)?lesson.videos.find(v=>v?.teacherId)?.teacherId:'')||'';
 const teacherName=lesson.teacherName||(Array.isArray(lesson.videos)?lesson.videos.find(v=>v?.teacherId||v?.name)?.name:'')||'مدرس المادة';
 return{teacherId,teacherName};
}
function lessonContext(){
 return{type:lesson.type||qs.get('type')||profile.educationType||'public',stage:lesson.stage||qs.get('stage')||profile.stage||'',grade:String(lesson.grade||qs.get('grade')||profile.grade||''),subject:lesson.subject||qs.get('subject')||'',lessonId,lessonTitle:lesson.title||document.getElementById('lessonTitle')?.textContent||'درس'};
}
function mount(){
 if($('lessonCommunication'))return;
 const finish=$('lessonFinishCard');if(!finish)return;
 const section=document.createElement('section');section.id='lessonCommunication';section.className='comm-card lesson-communication-card';
 section.innerHTML='<div class="comm-head"><div><span class="section-kicker">اسأل عن الدرس</span><h3>سؤال للمدرس — بعد مراجعة الإدارة</h3><p>اكتب سؤالك وحدد هل تريده عامًا ليستفيد باقي الطلاب أم خاصًا بينك وبين المدرس. لن يظهر السؤال للمدرس قبل موافقة الإدارة.</p></div><span>💬</span></div>'+
 '<form id="studentQuestionForm" class="comm-form"><label><span>نوع السؤال</span><select id="studentQuestionVisibility"><option value="public">عام — يظهر للطلاب بعد الموافقة</option><option value="private">خاص — يظهر لي وللمدرس فقط</option></select></label><label><span>المدرس المستهدف</span><select id="studentQuestionTeacher"></select></label><label class="full"><span>سؤالك</span><textarea id="studentQuestionText" required minlength="5" maxlength="1200" placeholder="اكتب سؤالك بوضوح..."></textarea></label><div class="full comm-note"><i class="fa-solid fa-shield-halved"></i><span>كل سؤال يمر أولًا على الإدارة. إذا طلبت الإدارة تعديلًا، سيظهر السبب لك هنا ويمكنك تعديله وإعادة إرساله.</span></div><div class="full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="studentQuestionSubmit" type="submit"><i class="fa-solid fa-paper-plane"></i> إرسال للإدارة</button><button class="btn btn-soft hidden" id="studentQuestionCancelEdit" type="button">إلغاء التعديل</button></div></form>'+
 '<div style="height:18px"></div><div class="comm-head"><div><span class="section-kicker">طلباتك</span><h3>حالة أسئلتك على هذا الدرس</h3></div><span>🛡️</span></div><div id="studentQuestionRequests" class="comm-list"></div>'+
 '<div style="height:20px"></div><div class="comm-head"><div><span class="section-kicker">الأسئلة المعتمدة</span><h3>أسئلة وأجوبة هذا الدرس</h3><p>الأسئلة العامة المعتمدة، بالإضافة إلى أسئلتك الخاصة.</p></div><span>🧠</span></div><div id="lessonDiscussionList" class="comm-list"></div>';
 finish.insertAdjacentElement('beforebegin',section);
 const teachers=lessonTeachers(),select=$('studentQuestionTeacher');select.innerHTML=teachers.length?teachers.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join(''):'<option value="">مدرس المادة — تحدده الإدارة</option>';select.disabled=!teachers.length;
 $('studentQuestionForm').addEventListener('submit',submitQuestion);
 $('studentQuestionCancelEdit').addEventListener('click',cancelEdit);
}
function cancelEdit(){
 editingId='';$('studentQuestionText').value='';$('studentQuestionVisibility').value='public';$('studentQuestionCancelEdit').classList.add('hidden');$('studentQuestionSubmit').innerHTML='<i class="fa-solid fa-paper-plane"></i> إرسال للإدارة';
}
async function submitQuestion(e){
 e.preventDefault();if(!user)return;
 const text=$('studentQuestionText').value.trim(),visibility=$('studentQuestionVisibility').value;
 if(text.length<5)return window.AcademyUI?.toast?.('اكتب سؤالًا أوضح.','error');
 const ctx=lessonContext(),{teacherId,teacherName}=teacherInfo(),now=Date.now(),payload={
   kind:'student_question',actorRole:'student',actorId:user.uid,actorName:profile.name||user.displayName||'طالب',
   ...ctx,recipientTeacherId:teacherId,recipientTeacherName:teacherName,visibility,text,status:'pending',
   updatedAt:now
 };
 const btn=$('studentQuestionSubmit');window.AcademyUI?.setButtonLoading(btn,true,editingId?'إعادة الإرسال':'إرسال');
 try{
   if(editingId){
     const current=submissions[editingId];if(!current||current.status!=='changes_requested')throw Error('هذا الطلب لم يعد متاحًا للتعديل');
     await db.ref('communicationSubmissionsV1/'+user.uid+'/'+editingId).update({...payload,resubmittedAt:now,reviewNote:'',status:'pending'});
   }else{
     const ref=db.ref('communicationSubmissionsV1/'+user.uid).push();await ref.set({...payload,createdAt:now});
   }
   cancelEdit();window.AcademyUI?.toast?.('تم إرسال السؤال للإدارة للمراجعة ✅');
 }catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر إرسال السؤال الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function ownRows(){
 return Object.entries(submissions||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>x.kind==='student_question'&&x.lessonId===lessonId).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function renderRequests(){
 const box=$('studentQuestionRequests');if(!box)return;const rows=ownRows();
 box.innerHTML=rows.length?rows.map(x=>'<article class="comm-item"><div class="comm-item-top"><div><strong>'+esc(x.text||'سؤال')+'</strong><small>'+(x.visibility==='private'?'خاص':'عام')+' • '+new Date(Number(x.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="comm-status '+statusClass(x.status)+'">'+statusLabel(x.status)+'</span></div>'+(x.reviewNote?'<div class="comm-review-note"><b>ملاحظة الإدارة:</b> '+esc(x.reviewNote)+'</div>':'')+(x.status==='changes_requested'?'<div class="comm-teacher-question-actions"><button class="comm-reply-btn" type="button" data-edit-student-question="'+x.id+'"><i class="fa-solid fa-pen"></i> تعديل وإعادة الإرسال</button></div>':'')+'</article>').join(''):'<div class="comm-empty"><span>💬</span>لم ترسل سؤالًا على هذا الدرس بعد.</div>';
 box.querySelectorAll('[data-edit-student-question]').forEach(b=>b.onclick=()=>startEdit(b.dataset.editStudentQuestion));
}
function startEdit(id){
 const row=submissions[id];if(!row||row.status!=='changes_requested')return;
 editingId=id;$('studentQuestionText').value=row.text||'';$('studentQuestionVisibility').value=row.visibility||'public';$('studentQuestionCancelEdit').classList.remove('hidden');$('studentQuestionSubmit').innerHTML='<i class="fa-solid fa-rotate"></i> إعادة الإرسال للإدارة';$('studentQuestionText').focus();$('lessonCommunication').scrollIntoView({behavior:'smooth',block:'start'});
}
function visibleThreads(){
 return Object.entries(threads||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>x.status==='approved'&&(x.visibility==='public'||x.studentId===user?.uid)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
}
function renderThreads(){
 const box=$('lessonDiscussionList');if(!box)return;const rows=visibleThreads();
 box.innerHTML=rows.length?rows.map(t=>{
   const replies=Object.entries(t.replies||{}).map(([id,v])=>({id,...(v||{})})).filter(r=>r.status==='approved').sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
   return '<article class="comm-thread '+(t.pinned?'pinned':'')+'" id="discussion-'+esc(t.id)+'">'+(t.pinned?'<i class="fa-solid fa-thumbtack comm-thread-pin" title="سؤال مثبت"></i>':'')+'<div class="comm-thread-author"><span class="comm-thread-avatar">'+esc(initials(t.studentName||'طالب'))+'</span><div><strong>'+esc(t.visibility==='private'?'سؤالك الخاص':t.studentName||'طالب')+'</strong><small>'+new Date(Number(t.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div></div><p class="comm-thread-body">'+esc(t.text||'')+'</p><div class="comm-thread-meta"><span>'+(t.visibility==='private'?'🔒 خاص':'🌐 عام')+'</span><span>👨‍🏫 '+esc(t.teacherName||'مدرس المادة')+'</span></div><div class="comm-replies">'+(replies.length?replies.map(r=>'<div class="comm-reply"><strong><i class="fa-solid fa-chalkboard-user"></i> '+esc(r.teacherName||'المدرس')+'</strong><p>'+esc(r.text||'')+'</p></div>').join(''):'<div class="comm-note"><i class="fa-regular fa-clock"></i><span>لم يُنشر رد معتمد بعد.</span></div>')+'</div></article>';
 }).join(''):'<div class="comm-empty"><span>🧠</span>لا توجد أسئلة معتمدة على هذا الدرس حتى الآن.</div>';
}
async function init(){
 const u=await new Promise(resolve=>{const off=auth.onAuthStateChanged(x=>{off();resolve(x)})});if(!u)return;
 user=u;const [p,l]=await Promise.all([db.ref('studentProfilesV3/'+u.uid).once('value'),db.ref('lessons/'+lessonId).once('value')]);profile=p.val()||{};lesson=l.val()||{};
 mount();
 const subRef=db.ref('communicationSubmissionsV1/'+u.uid),threadRef=db.ref('lessonDiscussionsV1/'+lessonId);
 const subHandler=s=>{submissions=s.val()||{};renderRequests()},threadHandler=s=>{threads=s.val()||{};renderThreads()};
 subRef.on('value',subHandler);threadRef.on('value',threadHandler);stopSubs=()=>subRef.off('value',subHandler);stopThreads=()=>threadRef.off('value',threadHandler);
}
window.addEventListener('pagehide',()=>{stopSubs?.();stopThreads?.()});
init().catch(err=>console.warn('Student communications unavailable',err));
})();