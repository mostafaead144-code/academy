(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
const session=window.AcademyRoleSession?.get('admin');if(!session)return;
const auth=session.auth,db=session.db,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,rows=[],filter='pending',search='',stop=null,teacherGroups={};
function flatten(raw){
 const out=[];Object.entries(raw||{}).forEach(([actorId,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({actorId,id,...(v||{})})));
 return out.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function statusLabel(s){return s==='approved'?'معتمد':s==='rejected'?'مرفوض':s==='changes_requested'?'يحتاج تعديل':s==='approving'?'جارٍ الاعتماد':'قيد المراجعة'}
function statusClass(s){return ['approved','rejected','changes_requested'].includes(s)?s:'pending'}
function kindLabel(k,c){return k==='student_question'?'سؤال طالب':k==='student_forum_post'?'منشور مجتمع':k==='teacher_reply'?'رد معلم':k==='pin_request'?'طلب تثبيت':c==='message'?'رسالة معلم':'إعلان معلم'}
function kindIcon(k){return k==='student_question'?'fa-circle-question':k==='student_forum_post'?'fa-users':k==='teacher_reply'?'fa-reply':k==='pin_request'?'fa-thumbtack':'fa-bullhorn'}
function isPending(r){return !r.status||r.status==='pending'}
function teacherAssignments(t){
 if(Array.isArray(t?.assignments))return t.assignments.filter(Boolean);
 if(t?.assignments&&typeof t.assignments==='object')return Object.values(t.assignments).filter(Boolean);
 if(Array.isArray(t?.subjects))return t.subjects.map(x=>typeof x==='string'?{subject:x}:x);
 return[];
}
function teacherMatches(t,row){
 return t?.isActive!==false&&teacherAssignments(t).some(a=>
   (!a.type||a.type===row.type)&&(!a.stage||a.stage===row.stage)&&(!a.grade||String(a.grade)===String(row.grade))&&(!a.subject||a.subject===row.subject)
 );
}
function filtered(){
 const q=search.trim().toLowerCase();
 return rows.filter(r=>{
   if(filter==='pending'&&!isPending(r))return false;
   if(filter==='questions'&&r.kind!=='student_question')return false;
   if(filter==='replies'&&r.kind!=='teacher_reply')return false;
   if(filter==='community'&&r.kind!=='student_forum_post')return false;
   if(filter==='broadcasts'&&r.kind!=='teacher_broadcast')return false;
   if(filter==='pins'&&r.kind!=='pin_request')return false;
   if(filter==='reviewed'&&isPending(r))return false;
   if(q){
     const hay=[r.actorName,r.studentName,r.teacherName,r.title,r.text,r.lessonTitle,r.subjectName,r.subject,r.reviewNote].join(' ').toLowerCase();
     if(!hay.includes(q))return false;
   }
   return true;
 });
}
function counts(){
 const pending=rows.filter(isPending),questions=pending.filter(x=>x.kind==='student_question').length,replies=pending.filter(x=>x.kind==='teacher_reply').length,broadcasts=pending.filter(x=>x.kind==='teacher_broadcast').length;
 return{pending:pending.length,questions,replies,broadcasts,pins:pending.filter(x=>x.kind==='pin_request').length,community:pending.filter(x=>x.kind==='student_forum_post').length};
}
function renderStats(){
 const c=counts();
 if($('adminCommPending'))$('adminCommPending').textContent=c.pending;if($('adminCommHeroPending'))$('adminCommHeroPending').textContent=c.pending;
 if($('adminCommQuestions'))$('adminCommQuestions').textContent=c.questions;if($('adminCommHeroQuestions'))$('adminCommHeroQuestions').textContent=c.questions;
 if($('adminCommReplies'))$('adminCommReplies').textContent=c.replies;
 if($('adminCommBroadcasts'))$('adminCommBroadcasts').textContent=c.broadcasts;
 const badge=$('communicationAlertBadge');if(badge){badge.textContent=c.pending;badge.classList.toggle('hidden',!c.pending)}
 document.querySelectorAll('[data-comm-filter]').forEach(b=>{
   const key=b.dataset.commFilter,n=key==='pending'?c.pending:key==='questions'?c.questions:key==='replies'?c.replies:key==='broadcasts'?c.broadcasts:key==='pins'?c.pins:key==='community'?c.community:key==='reviewed'?rows.filter(x=>!isPending(x)).length:rows.length;
   const span=b.querySelector('span');if(span)span.textContent=n;b.classList.toggle('active',key===filter);
 });
}
function render(){
 renderStats();const box=$('adminCommunicationList');if(!box)return;const list=filtered();
 box.innerHTML=list.length?list.map(r=>{
   const pending=isPending(r),noteId='comm-note-'+r.actorId+'-'+r.id;
   const context=[r.type==='azhar'?'أزهر':r.type?'عام':'',r.stage||'',r.grade?'صف '+r.grade:'',r.subjectName||r.subject||'',r.lessonTitle||''].filter(Boolean);
   return '<article class="comm-review-card"><div class="comm-review-head"><div><strong><i class="fa-solid '+kindIcon(r.kind)+'"></i> '+esc(kindLabel(r.kind,r.communicationType))+'</strong><small>'+esc(r.actorName||r.studentName||r.teacherName||'مستخدم')+' • '+new Date(Number(r.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="comm-status '+statusClass(r.status)+'">'+statusLabel(r.status)+'</span></div><div class="comm-review-context">'+context.map(x=>'<span>'+esc(x)+'</span>').join('')+(r.visibility?'<span>'+(r.visibility==='private'?'🔒 خاص':'🌐 عام')+'</span>':'')+(r.targetMode?'<span>الاستهداف: '+esc(r.targetMode==='all'?'الصف/المادة':r.targetMode==='group'?'مجموعة':'طلاب محددون')+'</span>':'')+'</div><div class="comm-review-content">'+(r.title?'<strong>'+esc(r.title)+'</strong><br>':'')+esc(r.text||'')+'</div>'+(r.reviewNote?'<div class="comm-review-note"><b>آخر ملاحظة مراجعة:</b> '+esc(r.reviewNote)+'</div>':'')+(pending?'<div class="comm-review-actions"><input id="'+noteId+'" maxlength="300" placeholder="ملاحظة للإرسال عند طلب التعديل أو الرفض"><button class="approve" type="button" data-comm-approve="'+r.actorId+'|'+r.id+'"><i class="fa-solid fa-check"></i> اعتماد</button><button class="changes" type="button" data-comm-changes="'+r.actorId+'|'+r.id+'"><i class="fa-solid fa-pen"></i> طلب تعديل</button><button class="reject" type="button" data-comm-reject="'+r.actorId+'|'+r.id+'"><i class="fa-solid fa-xmark"></i> رفض</button></div>':'')+'</article>';
 }).join(''):'<div class="comm-empty"><span>🛡️</span>لا توجد عناصر في هذا القسم.</div>';
 box.querySelectorAll('[data-comm-approve]').forEach(b=>b.onclick=()=>approve(b.dataset.commApprove,b));
 box.querySelectorAll('[data-comm-changes]').forEach(b=>b.onclick=()=>review(b.dataset.commChanges,'changes_requested',b));
 box.querySelectorAll('[data-comm-reject]').forEach(b=>b.onclick=()=>review(b.dataset.commReject,'rejected',b));
}
function getRow(key){const [actorId,id]=String(key).split('|');return{actorId,id,row:rows.find(x=>x.actorId===actorId&&x.id===id)}}
function noteFor(actorId,id){return String($('comm-note-'+actorId+'-'+id)?.value||'').trim()}
async function audit(action,row,meta={}){
 if(!user?.uid)return;const at=Date.now(),key=at+'-'+Math.random().toString(36).slice(2,9);
 await db.ref('auditLogV4/'+key).set({uid:user.uid,action,entity:'communicationSubmission',entityId:row.id,meta:{actorId:row.actorId,kind:row.kind,...meta},at,createdAt:at}).catch(()=>{});
}
async function review(key,status,btn){
 const {actorId,id,row}=getRow(key);if(!row||!isPending(row))return;
 const note=noteFor(actorId,id);if(status==='changes_requested'&&!note)return window.AcademyUI?.toast?.('اكتب التعديل المطلوب أولًا.','error');
 window.AcademyUI?.setButtonLoading(btn,true,status==='rejected'?'رفض':'إرجاع');
 try{
   await db.ref('communicationSubmissionsV1/'+actorId+'/'+id).update({status,reviewNote:note,reviewedAt:Date.now(),reviewedBy:user.uid});
   await audit('communication.'+status,row,{note});window.AcademyUI?.toast?.(status==='rejected'?'تم رفض الطلب':'تم إرجاع الطلب للتعديل');
 }catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر تحديث حالة الطلب.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function lessonHref(r){return './lesson.html?'+new URLSearchParams({type:r.type||'public',stage:r.stage||'',grade:String(r.grade||''),subject:r.subject||'',id:r.lessonId||''}).toString()+'#lessonCommunication'}
async function approve(key,btn){
 const {actorId,id,row}=getRow(key);if(!row||!isPending(row))return;
 window.AcademyUI?.setButtonLoading(btn,true,'اعتماد');let claimed=false;
 try{
   const statusRef=db.ref('communicationSubmissionsV1/'+actorId+'/'+id+'/status'),claim=await statusRef.transaction(v=>!v||v==='pending'?'approving':undefined);
   if(!claim.committed)throw Error('هذا الطلب قيد المراجعة أو تمت مراجعته بالفعل');claimed=true;
   const now=Date.now(),updates={};
   if(row.kind==='student_question'){
     if(!row.lessonId||!row.text||!row.studentId)throw Error('بيانات السؤال غير مكتملة');
     const lesson=(await db.ref('lessons/'+row.lessonId).once('value')).val();if(!lesson)throw Error('الدرس غير موجود');
     const context={type:row.type||lesson.type||'public',stage:row.stage||lesson.stage||'',grade:String(row.grade||lesson.grade||''),subject:row.subject||lesson.subject||''};
     let routedTeacherId=row.recipientTeacherId||lesson.teacherId||(Array.isArray(lesson.videos)?lesson.videos.find(v=>v?.teacherId)?.teacherId:'')||'',routedTeacherName=row.recipientTeacherName||lesson.teacherName||'';
     if(!routedTeacherId){
       const teacherSnap=await db.ref('teacherProfiles').once('value'),teacherRows=Object.entries(teacherSnap.val()||{}).map(([tid,t])=>({id:tid,...(t||{})})),match=teacherRows.find(t=>teacherMatches(t,context));
       if(match){routedTeacherId=match.id;routedTeacherName=match.name||match.email||'مدرس المادة'}
     }
     const thread={id,status:'approved',studentId:row.studentId,studentName:row.actorName||row.studentName||'طالب',teacherId:routedTeacherId,teacherName:routedTeacherName||'مدرس المادة',type:context.type,stage:context.stage,grade:context.grade,subject:context.subject,subjectName:row.subjectName||'',lessonId:row.lessonId,lessonTitle:row.lessonTitle||lesson.title||'درس',visibility:row.visibility==='private'?'private':'public',text:row.text,pinned:false,createdAt:Number(row.createdAt||now),approvedAt:now,updatedAt:now,submissionId:id};
     updates['lessonDiscussionsV1/'+row.lessonId+'/'+id]=thread;
     if(thread.teacherId)updates['teacherCommunicationInboxV1/'+thread.teacherId+'/'+id]={...thread,hasApprovedReply:false};
     const nId=db.ref('notificationBroadcasts').push().key;
     updates['notificationBroadcasts/'+nId]={source:'admin',title:'تم اعتماد سؤالك في الدرس',text:'سؤالك في «'+thread.lessonTitle+'» أصبح معتمدًا'+(thread.teacherId?' وسيظهر للمدرس.':'.'),targetMode:'students',targetStudentIds:[thread.studentId],type:thread.type,stage:thread.stage,grade:thread.grade,subject:thread.subject,href:lessonHref(thread),priority:'normal',isActive:true,createdAt:now,expiresAt:now+7*86400000};
   }else if(row.kind==='student_forum_post'){
     if(!row.title||!row.text||!row.actorId)throw Error('بيانات المنشور غير مكتملة');
     updates['community/forums/'+id]={id,title:row.title,content:row.text,author:row.actorName||'طالب',authorId:row.actorId,status:'approved',isHidden:false,likesBy:{},createdAt:Number(row.createdAt||now),approvedAt:now};
     const nId=db.ref('notificationBroadcasts').push().key;
     updates['notificationBroadcasts/'+nId]={source:'admin',title:'تم اعتماد منشورك',text:'منشورك «'+row.title+'» أصبح ظاهرًا في مجتمع الطلاب.',targetMode:'students',targetStudentIds:[row.actorId],href:'./community.html',priority:'normal',isActive:true,createdAt:now,expiresAt:now+7*86400000};
   }else if(row.kind==='teacher_reply'){
     if(!row.lessonId||!row.threadId||!row.studentId||!row.text)throw Error('بيانات الرد غير مكتملة');
     const thread=(await db.ref('lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId).once('value')).val();if(!thread)throw Error('السؤال الأصلي غير موجود');if(thread.teacherId&&thread.teacherId!==row.actorId)throw Error('هذا السؤال موجه إلى مدرس آخر');
     updates['lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId+'/replies/'+id]={id,status:'approved',teacherId:row.actorId,teacherName:row.actorName||'المدرس',text:row.text,createdAt:Number(row.createdAt||now),approvedAt:now,submissionId:id};
     updates['lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId+'/updatedAt']=now;
     updates['teacherCommunicationInboxV1/'+row.actorId+'/'+row.threadId+'/hasApprovedReply']=true;
     updates['teacherCommunicationInboxV1/'+row.actorId+'/'+row.threadId+'/updatedAt']=now;
     const nId=db.ref('notificationBroadcasts').push().key;
     updates['notificationBroadcasts/'+nId]={source:'teacher',teacherId:row.actorId,teacherName:row.actorName||'المدرس',title:'رد جديد على سؤالك',text:row.text,targetMode:'students',targetStudentIds:[row.studentId],type:row.type||thread.type||'public',stage:row.stage||thread.stage||'',grade:String(row.grade||thread.grade||''),subject:row.subject||thread.subject||'',href:lessonHref({...thread,lessonId:row.lessonId}),priority:'high',isActive:true,createdAt:now,expiresAt:now+14*86400000};
   }else if(row.kind==='teacher_broadcast'){
     if(!row.title||!row.text||!row.subject)throw Error('بيانات الرسالة غير مكتملة');
     const teacher=(await db.ref('teacherProfiles/'+row.actorId).once('value')).val();if(!teacher||teacher.isActive===false)throw Error('حساب المعلم غير نشط');if(!teacherMatches(teacher,row))throw Error('المادة أو الصف غير مسندين لهذا المعلم');
     let targetMode=row.targetMode||'all',targetStudentIds=Array.isArray(row.targetStudentIds)?row.targetStudentIds:[],targetGroupId=row.targetGroupId||'';
     if(targetMode==='group'){
       const members=teacherGroups?.[row.actorId]?.[targetGroupId]?.members||[];
       targetStudentIds=Array.isArray(members)?members:Object.keys(members||{});targetMode='students';targetGroupId='';
       if(!targetStudentIds.length)throw Error('المجموعة لا تحتوي طلابًا');
     }
     const nId=db.ref('notificationBroadcasts').push().key,duration=Math.max(1,Math.min(14,Number(row.durationDays||5)));
     updates['notificationBroadcasts/'+nId]={source:'teacher',teacherId:row.actorId,teacherName:row.actorName||'المدرس',title:row.title,text:row.text,type:row.type||'public',stage:row.stage||'',grade:String(row.grade||''),subject:row.subject,subjectName:row.subjectName||'',priority:['normal','high','urgent'].includes(row.priority)?row.priority:'normal',targetMode,targetStudentIds,targetGroupId,isActive:true,createdAt:now,expiresAt:now+duration*86400000,communicationSubmissionId:id,communicationType:row.communicationType||'announcement'};
     updates['communicationSubmissionsV1/'+actorId+'/'+id+'/broadcastId']=nId;
   }else if(row.kind==='pin_request'){
     if(!row.lessonId||!row.threadId)throw Error('بيانات طلب التثبيت غير مكتملة');
     const teacher=(await db.ref('teacherProfiles/'+row.actorId).once('value')).val();if(!teacher||teacher.isActive===false)throw Error('حساب المعلم غير نشط');
     const thread=(await db.ref('lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId).once('value')).val();if(!thread||thread.visibility==='private')throw Error('لا يمكن تثبيت هذا السؤال');
     updates['lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId+'/pinned']=true;
     updates['lessonDiscussionsV1/'+row.lessonId+'/'+row.threadId+'/pinnedAt']=now;
     if(row.actorId)updates['teacherCommunicationInboxV1/'+row.actorId+'/'+row.threadId+'/pinned']=true;
   }else throw Error('نوع الطلب غير معروف');
   updates['communicationSubmissionsV1/'+actorId+'/'+id+'/status']='approved';updates['communicationSubmissionsV1/'+actorId+'/'+id+'/reviewedAt']=now;updates['communicationSubmissionsV1/'+actorId+'/'+id+'/reviewedBy']=user.uid;updates['communicationSubmissionsV1/'+actorId+'/'+id+'/reviewNote']=noteFor(actorId,id);
   await db.ref().update(updates);await audit('communication.approve',row);window.AcademyUI?.toast?.('تم اعتماد '+kindLabel(row.kind,row.communicationType)+' ونشره ✅');
 }catch(err){
   if(claimed)await db.ref('communicationSubmissionsV1/'+actorId+'/'+id+'/status').transaction(v=>v==='approving'?'pending':undefined).catch(()=>{});
   console.error(err);window.AcademyUI?.toast?.('تعذر الاعتماد: '+err.message,'error');
 }finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function bindUi(){
 document.querySelectorAll('[data-comm-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.commFilter;render()});
 $('adminCommunicationSearch')?.addEventListener('input',e=>{search=e.target.value;render()});
 $('adminCommunicationRefresh')?.addEventListener('click',()=>loadOnce());
}
async function loadOnce(){
 const [a,g]=await Promise.all([db.ref('communicationSubmissionsV1').once('value'),db.ref('teacherGroupsV4').once('value')]);rows=flatten(a.val());teacherGroups=g.val()||{};render();
}
auth.onAuthStateChanged(async u=>{
 if(stop){stop();stop=null}user=u;if(!u)return;
 try{
   if(u.role!=='admin')return;
   bindUi();const ref=db.ref('communicationSubmissionsV1'),handler=s=>{rows=flatten(s.val());render()};ref.on('value',handler);stop=()=>ref.off('value',handler);
   db.ref('teacherGroupsV4').on('value',s=>{teacherGroups=s.val()||{}});
 }catch(err){console.warn('Admin communication center unavailable',err)}
});
window.addEventListener('pagehide',()=>stop?.());
})();