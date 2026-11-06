(() => {
'use strict';
const cfg=window.ACADEMY_BACKEND_CONFIG||JSON.parse(localStorage.getItem('academyBackendConfig')||'null');if(!cfg)return;
const app=AcademyBackend.apps.find(a=>a.name==='teacher-portal')||AcademyBackend.initializeApp(cfg,'teacher-portal'),auth=app.auth(),db=app.database();
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,teacher={},assignments=[],groups={},inbox={},subs={},students={},activeReply='',editingReplyId='',stops=[];
const stageName={primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};
const normalizePhone=x=>String(x||'').replace(/\D/g,'');
function assignmentRows(t){
 if(Array.isArray(t.assignments))return t.assignments.filter(Boolean);
 if(t.assignments&&typeof t.assignments==='object')return Object.values(t.assignments).filter(Boolean);
 if(Array.isArray(t.subjects))return t.subjects.map(x=>typeof x==='string'?{subject:x}:x);
 return[];
}
function statusLabel(s){return s==='approved'?'معتمد':s==='rejected'?'مرفوض':s==='changes_requested'?'يحتاج تعديل':'قيد المراجعة'}
function statusClass(s){return ['approved','rejected','changes_requested'].includes(s)?s:'pending'}
function contextLabel(a){return (a.type==='azhar'?'أزهر':'عام')+' • '+(stageName[a.stage]||a.stage||'كل المراحل')+' • '+(a.grade?'صف '+a.grade:'كل الصفوف')+' • '+(a.subjectName||a.subject||'كل المواد')}
function contextValue(a){return [a.type||'public',a.stage||'',String(a.grade||''),a.subject||'',a.subjectName||''].map(encodeURIComponent).join('|')}
function parseContext(v){const [type,stage,grade,subject,subjectName]=String(v||'').split('|').map(decodeURIComponent);return{type,stage,grade,subject,subjectName}}
function mountSelectors(){
 const select=$('teacherCommContext');if(select){select.innerHTML=assignments.length?assignments.map(a=>'<option value="'+esc(contextValue(a))+'">'+esc(contextLabel(a))+'</option>').join(''):'<option value="">لا توجد مواد مسندة</option>'}
 const group=$('teacherCommGroup');if(group){const rows=Object.entries(groups||{});group.innerHTML='<option value="">اختر المجموعة</option>'+rows.map(([id,g])=>'<option value="'+esc(id)+'">'+esc(g.name||id)+'</option>').join('')}
 toggleTargets();
}
function toggleTargets(){
 const mode=$('teacherCommTargetMode')?.value||'all';
 $('teacherCommGroupWrap')?.classList.toggle('hidden',mode!=='group');
 $('teacherCommStudentsWrap')?.classList.toggle('hidden',mode!=='students');
}
function mount(){
 if($('teacherCommReady'))return;
 const marker=document.createElement('span');marker.id='teacherCommReady';marker.hidden=true;document.body.appendChild(marker);
 $('teacherCommTargetMode')?.addEventListener('change',toggleTargets);
 $('teacherBroadcastForm')?.addEventListener('submit',submitBroadcast);
 $('teacherQuestionInbox')?.addEventListener('click',handleInboxClick);
 $('teacherCommunicationRequests')?.addEventListener('click',handleRequestClick);
}
function inboxRows(){
 return Object.entries(inbox||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>x.status==='approved').sort((a,b)=>Number(b.pinned)-Number(a.pinned)||Number(b.createdAt||0)-Number(a.createdAt||0));
}
function renderInbox(){
 const box=$('teacherQuestionInbox');if(!box)return;const rows=inboxRows();
 if($('teacherQuestionPendingCount'))$('teacherQuestionPendingCount').textContent=rows.filter(x=>!x.hasApprovedReply).length;
 box.innerHTML=rows.length?rows.map(q=>'<article class="comm-thread '+(q.pinned?'pinned':'')+'">'+(q.pinned?'<i class="fa-solid fa-thumbtack comm-thread-pin"></i>':'')+'<div class="comm-thread-author"><span class="comm-thread-avatar">'+esc((q.studentName||'ط')[0])+'</span><div><strong>'+esc(q.studentName||'طالب')+'</strong><small>'+esc(q.lessonTitle||'درس')+' • '+(q.visibility==='private'?'خاص':'عام')+'</small></div></div><p class="comm-thread-body">'+esc(q.text||'')+'</p><div class="comm-thread-meta"><span>'+esc(q.subjectName||q.subject||'مادة')+'</span><span>'+(q.hasApprovedReply?'✅ تم الرد':'⏳ بدون رد معتمد')+'</span></div><div class="comm-teacher-question-actions"><button class="comm-reply-btn" type="button" data-teacher-reply="'+q.id+'"><i class="fa-solid fa-reply"></i> رد على الطالب</button>'+(q.visibility==='public'&&!q.pinned?'<button class="comm-pin-btn" type="button" data-teacher-pin="'+q.id+'"><i class="fa-solid fa-thumbtack"></i> طلب تثبيت</button>':'')+'<a class="btn btn-soft" href="./lesson.html?'+new URLSearchParams({type:q.type||'public',stage:q.stage||'',grade:q.grade||'',subject:q.subject||'',id:q.lessonId||''}).toString()+'" target="_blank">فتح الدرس</a></div><form class="comm-teacher-reply-form '+(activeReply===q.id?'':'hidden')+'" data-reply-form="'+q.id+'"><textarea maxlength="1200" required placeholder="اكتب ردك... سيتم إرساله للإدارة أولًا"></textarea><div style="display:flex;gap:8px"><button class="btn btn-primary" type="submit">إرسال الرد للإدارة</button><button class="btn btn-soft" type="button" data-cancel-reply="'+q.id+'">إلغاء</button></div></form></article>').join(''):'<div class="comm-empty"><span>💬</span>لا توجد أسئلة معتمدة موجهة إليك حاليًا.</div>';
 box.querySelectorAll('[data-reply-form]').forEach(form=>form.addEventListener('submit',submitReply));
}
function requestRows(){return Object.entries(subs||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>['teacher_reply','teacher_broadcast','pin_request'].includes(x.kind)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))}
function renderRequests(){
 const box=$('teacherCommunicationRequests');if(!box)return;const rows=requestRows();
 const pendingCount=rows.filter(x=>(x.status||'pending')==='pending').length;if($('teacherCommPendingCount'))$('teacherCommPendingCount').textContent=pendingCount;const nav=$('teacherCommNavBadge');if(nav){const openQuestions=inboxRows().filter(x=>!x.hasApprovedReply).length,total=pendingCount+openQuestions;nav.textContent=total;nav.classList.toggle('hidden',!total)}
 box.innerHTML=rows.length?rows.map(x=>'<article class="comm-item"><div class="comm-item-top"><div><strong>'+esc(x.kind==='teacher_reply'?'رد على سؤال':x.kind==='pin_request'?'طلب تثبيت سؤال':x.communicationType==='message'?'رسالة للطلاب':'إعلان للطلاب')+'</strong><small>'+esc(x.title||x.lessonTitle||x.subjectName||x.subject||'')+' • '+new Date(Number(x.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="comm-status '+statusClass(x.status)+'">'+statusLabel(x.status)+'</span></div><p>'+esc(x.text||'')+'</p>'+(x.reviewNote?'<div class="comm-review-note"><b>ملاحظة الإدارة:</b> '+esc(x.reviewNote)+'</div>':'')+(x.status==='changes_requested'&&x.kind==='teacher_broadcast'?'<div class="comm-teacher-question-actions"><button class="comm-reply-btn" type="button" data-edit-broadcast="'+x.id+'"><i class="fa-solid fa-pen"></i> تعديل وإعادة إرسال</button></div>':x.status==='changes_requested'&&x.kind==='teacher_reply'?'<div class="comm-teacher-question-actions"><button class="comm-reply-btn" type="button" data-edit-reply-request="'+x.id+'"><i class="fa-solid fa-pen"></i> تعديل الرد وإعادة إرساله</button></div>':'')+'</article>').join(''):'<div class="comm-empty"><span>📨</span>طلبات التواصل التي ترسلها ستظهر هنا.</div>';
}
function render(){mountSelectors();renderInbox();renderRequests()}
function handleInboxClick(e){
 const reply=e.target.closest('[data-teacher-reply]');if(reply){activeReply=reply.dataset.teacherReply;renderInbox();return}
 const cancel=e.target.closest('[data-cancel-reply]');if(cancel){activeReply='';editingReplyId='';renderInbox();return}
 const pin=e.target.closest('[data-teacher-pin]');if(pin)submitPin(pin.dataset.teacherPin);
}
function handleRequestClick(e){
 const rb=e.target.closest('[data-edit-reply-request]');
 if(rb){
   const row=subs[rb.dataset.editReplyRequest];if(!row||row.kind!=='teacher_reply'||row.status!=='changes_requested')return;
   activeReply=row.threadId;editingReplyId=row.id;renderInbox();
   const form=document.querySelector('[data-reply-form="'+CSS.escape(row.threadId)+'"]');if(form){form.dataset.editId=row.id;const ta=form.querySelector('textarea');if(ta){ta.value=row.text||'';ta.focus()}form.scrollIntoView({behavior:'smooth',block:'center'})}
   return;
 }
 const b=e.target.closest('[data-edit-broadcast]');if(!b)return;const row=subs[b.dataset.editBroadcast];if(!row)return;
 $('teacherCommType').value=row.communicationType||'announcement';$('teacherCommTitle').value=row.title||'';$('teacherCommText').value=row.text||'';$('teacherCommPriority').value=row.priority||'normal';$('teacherCommDays').value=Number(row.durationDays||5);$('teacherCommTargetMode').value=row.targetMode||'all';mountSelectors();
 $('teacherBroadcastForm').dataset.editId=row.id;$('teacherBroadcastSubmit').innerHTML='<i class="fa-solid fa-rotate"></i> إعادة الإرسال للإدارة';$('teacherBroadcastForm').scrollIntoView({behavior:'smooth',block:'start'});
}
async function resolvePhones(raw){
 const phones=String(raw||'').split(/[\s,;]+/).map(normalizePhone).filter(Boolean),ids=[];
 for(const phone of [...new Set(phones)]){
   const s=await db.ref('studentPhoneIndexV4/'+phone).once('value');const id=s.val()?.studentId;if(id)ids.push(id);
 }
 return[...new Set(ids)];
}
async function submitBroadcast(e){
 e.preventDefault();if(!user)return;
 const ctx=parseContext($('teacherCommContext').value),communicationType=$('teacherCommType').value,title=$('teacherCommTitle').value.trim(),text=$('teacherCommText').value.trim(),priority=$('teacherCommPriority').value,targetMode=$('teacherCommTargetMode').value,durationDays=Math.max(1,Math.min(14,Number($('teacherCommDays').value||5)));
 if(!ctx.subject||!title||!text)return window.AcademyUI?.toast?.('أكمل المادة والعنوان ونص الرسالة.','error');
 let targetGroupId='',targetStudentIds=[];
 if(targetMode==='group'){targetGroupId=$('teacherCommGroup').value;if(!targetGroupId)return window.AcademyUI?.toast?.('اختر المجموعة المستهدفة.','error')}
 if(targetMode==='students'){targetStudentIds=await resolvePhones($('teacherCommStudents').value);if(!targetStudentIds.length)return window.AcademyUI?.toast?.('لم نعثر على طلاب بهذه الأرقام.','error')}
 const now=Date.now(),payload={kind:'teacher_broadcast',actorRole:'teacher',actorId:user.uid,actorName:teacher.name||user.displayName||'المدرس',communicationType,title,text,...ctx,priority,durationDays,targetMode,targetGroupId,targetStudentIds,status:'pending',updatedAt:now};
 const btn=$('teacherBroadcastSubmit');window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const editId=e.currentTarget.dataset.editId;
   if(editId){
     const current=subs[editId];if(!current||current.status!=='changes_requested')throw Error('هذا الطلب لم يعد قابلًا للتعديل');
     await db.ref('communicationSubmissionsV1/'+user.uid+'/'+editId).update({...payload,reviewNote:'',resubmittedAt:now,status:'pending'});delete e.currentTarget.dataset.editId;
   }else{
     const ref=db.ref('communicationSubmissionsV1/'+user.uid).push();await ref.set({...payload,createdAt:now});
   }
   e.currentTarget.reset();$('teacherCommDays').value=5;$('teacherBroadcastSubmit').innerHTML='<i class="fa-solid fa-paper-plane"></i> إرسال للإدارة';mountSelectors();window.AcademyUI?.toast?.('تم إرسال الطلب للإدارة للمراجعة ✅');
 }catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر إرسال الطلب الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
async function submitReply(e){
 e.preventDefault();const threadId=e.currentTarget.dataset.replyForm,q=inbox[threadId],text=e.currentTarget.querySelector('textarea').value.trim();if(!q||text.length<2)return;
 const now=Date.now(),payload={kind:'teacher_reply',actorRole:'teacher',actorId:user.uid,actorName:teacher.name||user.displayName||'المدرس',threadId,lessonId:q.lessonId,lessonTitle:q.lessonTitle||'',studentId:q.studentId,studentName:q.studentName||'',type:q.type||'public',stage:q.stage||'',grade:String(q.grade||''),subject:q.subject||'',subjectName:q.subjectName||'',visibility:q.visibility||'public',text,status:'pending',createdAt:now,updatedAt:now};
 const btn=e.submitter;window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const editId=e.currentTarget.dataset.editId||editingReplyId;
   if(editId){
     const current=subs[editId];if(!current||current.kind!=='teacher_reply'||current.status!=='changes_requested')throw Error('هذا الرد لم يعد قابلًا للتعديل');
     await db.ref('communicationSubmissionsV1/'+user.uid+'/'+editId).update({...payload,createdAt:Number(current.createdAt||now),reviewNote:'',resubmittedAt:now,status:'pending'});
   }else{
     const ref=db.ref('communicationSubmissionsV1/'+user.uid).push();await ref.set(payload);
   }
   activeReply='';editingReplyId='';renderInbox();window.AcademyUI?.toast?.('تم إرسال الرد للإدارة. لن يصل للطالب قبل الاعتماد ✅')
 }
 catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر إرسال الرد.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
async function submitPin(threadId){
 const q=inbox[threadId];if(!q||q.visibility!=='public')return;
 if(requestRows().some(x=>x.kind==='pin_request'&&x.threadId===threadId&&(x.status||'pending')==='pending'))return window.AcademyUI?.toast?.('طلب التثبيت قيد المراجعة بالفعل.','error');
 try{const ref=db.ref('communicationSubmissionsV1/'+user.uid).push();await ref.set({kind:'pin_request',actorRole:'teacher',actorId:user.uid,actorName:teacher.name||'المدرس',threadId,lessonId:q.lessonId,lessonTitle:q.lessonTitle||'',studentId:q.studentId,studentName:q.studentName||'',type:q.type||'public',stage:q.stage||'',grade:String(q.grade||''),subject:q.subject||'',subjectName:q.subjectName||'',text:q.text||'',status:'pending',createdAt:Date.now(),updatedAt:Date.now()});window.AcademyUI?.toast?.('تم إرسال طلب التثبيت للإدارة ✅')}catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر إرسال طلب التثبيت.','error')}
}
function listen(ref,cb){ref.on('value',cb);stops.push(()=>ref.off('value',cb))}
auth.onAuthStateChanged(async u=>{
 stops.splice(0).forEach(fn=>fn());user=u;if(!u)return;
 const t=await db.ref('teacherProfiles/'+u.uid).once('value');teacher=t.val()||{};if(!teacher||teacher.isActive===false)return;assignments=assignmentRows(teacher);
 listen(db.ref('teacherGroupsV4/'+u.uid),s=>{groups=s.val()||{};render()});
 listen(db.ref('teacherCommunicationInboxV1/'+u.uid),s=>{inbox=s.val()||{};renderInbox()});
 listen(db.ref('communicationSubmissionsV1/'+u.uid),s=>{subs=s.val()||{};renderRequests()});
 mount();render();
});
window.addEventListener('pagehide',()=>stops.splice(0).forEach(fn=>fn()));
})();