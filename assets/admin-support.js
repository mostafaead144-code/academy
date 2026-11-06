(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
const session=window.AcademyRoleSession?.get('admin');if(!session)return;
const auth=session.auth,db=session.db,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,tickets=[],filter='open',search='',stop=null;
const statusLabels={new:'جديدة',reviewing:'قيد المراجعة',in_progress:'جاري الحل',waiting_user:'مطلوب رد من المستخدم',resolved:'تم الحل',closed:'مغلقة'};
const categoryLabels={technical:'مشكلة تقنية',lesson:'مشكلة في درس',quiz_question:'سؤال أو إجابة خاطئة',video:'فيديو لا يعمل',file:'ملف غير متاح',assignment:'مشكلة في واجب',account:'الحساب أو الدخول',general:'مشكلة عامة',content:'مشكلة محتوى',students:'مشكلة مع الطلاب'};
function flatten(raw){
 const out=[];Object.entries(raw||{}).forEach(([uid,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({uid,id,...(v||{})})));
 return out.sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
}
function messages(t){return Object.entries(t.messages||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))}
function isOpen(t){return !['resolved','closed'].includes(t.status)}
function isStale(t){return isOpen(t)&&Date.now()-Number(t.updatedAt||t.createdAt||Date.now())>48*3600000}
function counts(){
 return{
  all:tickets.length,
  open:tickets.filter(isOpen).length,
  new:tickets.filter(x=>x.status==='new').length,
  urgent:tickets.filter(x=>isOpen(x)&&x.priority==='urgent').length,
  waiting:tickets.filter(x=>x.status==='waiting_user').length,
  resolved:tickets.filter(x=>x.status==='resolved').length,
  stale:tickets.filter(isStale).length,
  students:tickets.filter(x=>x.requesterRole==='student').length,
  teachers:tickets.filter(x=>x.requesterRole==='teacher').length
 };
}
function filtered(){
 const q=search.trim().toLowerCase();
 return tickets.filter(t=>{
   if(filter==='open'&&!isOpen(t))return false;
   if(filter==='new'&&t.status!=='new')return false;
   if(filter==='urgent'&&!(isOpen(t)&&t.priority==='urgent'))return false;
   if(filter==='waiting'&&t.status!=='waiting_user')return false;
   if(filter==='stale'&&!isStale(t))return false;
   if(filter==='resolved'&&t.status!=='resolved')return false;
   if(filter==='students'&&t.requesterRole!=='student')return false;
   if(filter==='teachers'&&t.requesterRole!=='teacher')return false;
   if(q){
     const hay=[t.ticketCode,t.requesterName,t.requesterPhone,t.requesterEmail,t.title,t.description,t.lessonTitle,t.quizTitle,t.questionText,t.subject,t.category].join(' ').toLowerCase();
     if(!hay.includes(q))return false;
   }
   return true;
 });
}
function renderStats(){
 const c=counts();
 if($('supportAdminOpen'))$('supportAdminOpen').textContent=c.open;
 if($('supportAdminUrgent'))$('supportAdminUrgent').textContent=c.urgent;
 if($('supportAdminWaiting'))$('supportAdminWaiting').textContent=c.waiting;
 if($('supportAdminStale'))$('supportAdminStale').textContent=c.stale;
 if($('supportAdminHeroOpen'))$('supportAdminHeroOpen').textContent=c.open;
 if($('supportAdminHeroUrgent'))$('supportAdminHeroUrgent').textContent=c.urgent;
 const badge=$('supportAlertBadge');if(badge){badge.textContent=c.open;badge.classList.toggle('hidden',!c.open)}
 document.querySelectorAll('[data-support-admin-filter]').forEach(b=>{
   const k=b.dataset.supportAdminFilter,n=k==='all'?c.all:k==='open'?c.open:k==='new'?c.new:k==='urgent'?c.urgent:k==='waiting'?c.waiting:k==='stale'?c.stale:k==='resolved'?c.resolved:k==='students'?c.students:c.teachers;
   const span=b.querySelector('span');if(span)span.textContent=n;b.classList.toggle('active',k===filter);
 });
}
function insightRows(){
 const open=tickets.filter(isOpen),categories={},lessons={},questions={};
 open.forEach(t=>{
   categories[t.category]=(categories[t.category]||0)+1;
   if(t.lessonId||t.lessonTitle){const k=t.lessonId||t.lessonTitle;lessons[k]=lessons[k]||{name:t.lessonTitle||t.lessonId,count:0};lessons[k].count++}
   if(t.category==='quiz_question'&&(t.questionText||t.questionIndex)){const k=(t.quizId||t.lessonId||'quiz')+'|'+(t.questionIndex||t.questionText);questions[k]=questions[k]||{name:t.questionText||('السؤال '+t.questionIndex),count:0};questions[k].count++}
 });
 const topCat=Object.entries(categories).sort((a,b)=>b[1]-a[1])[0],topLesson=Object.values(lessons).sort((a,b)=>b.count-a.count)[0],topQuestion=Object.values(questions).sort((a,b)=>b.count-a.count)[0];
 return{topCat,topLesson,topQuestion};
}
function renderInsights(){
 const x=insightRows(),box=$('supportAdminInsights');if(!box)return;
 box.innerHTML=[
  ['أكثر نوع متكرر',x.topCat?categoryLabels[x.topCat[0]]||x.topCat[0]:'لا توجد بيانات',x.topCat?x.topCat[1]+' تذكرة مفتوحة':'—'],
  ['أكثر درس عليه بلاغات',x.topLesson?.name||'لا توجد بيانات',x.topLesson?x.topLesson.count+' بلاغ':'—'],
  ['أكثر سؤال مبلّغ عنه',x.topQuestion?.name||'لا توجد بيانات',x.topQuestion?x.topQuestion.count+' بلاغ':'—']
 ].map(r=>'<article><small>'+esc(r[0])+'</small><strong>'+esc(r[1])+'</strong><small>'+esc(r[2])+'</small></article>').join('');
}
function screenshotLink(t){
 if(t.screenshotData&&/^data:image\/jpeg;base64,/i.test(t.screenshotData))return '<a class="btn btn-soft support-report-link" href="'+esc(t.screenshotData)+'" target="_blank" rel="noopener"><i class="fa-regular fa-image"></i> فتح لقطة الشاشة</a>';
 if(!t.screenshotUrl)return'';try{const u=new URL(t.screenshotUrl);if(!['http:','https:'].includes(u.protocol))return'';return '<a class="btn btn-soft support-report-link" href="'+esc(u.href)+'" target="_blank" rel="noopener"><i class="fa-regular fa-image"></i> فتح لقطة الشاشة</a>'}catch{return''}
}
function sourceLink(u=''){
 const raw=String(u||'').trim();if(!raw)return'';
 if(raw.startsWith('./')||raw.startsWith('/'))return raw;
 try{const x=new URL(raw);return ['http:','https:'].includes(x.protocol)?x.href:''}catch{return''}
}
function render(){
 renderStats();renderInsights();const list=filtered(),box=$('supportAdminList');if(!box)return;
 box.innerHTML=list.length?list.map(t=>{
   const msg=messages(t),ctx=[t.requesterRole==='teacher'?'👨‍🏫 معلم':'🎓 طالب',categoryLabels[t.category]||t.category,t.lessonTitle?'📘 '+t.lessonTitle:'',t.quizTitle?'🎯 '+t.quizTitle:'',t.questionIndex?'❓ سؤال '+t.questionIndex:'',t.subject?'📚 '+t.subject:''].filter(Boolean),sourceHref=sourceLink(t.href||'');
   return '<article class="support-admin-card"><div class="support-admin-head"><div><strong>#'+esc(t.ticketCode||t.id.slice(-6).toUpperCase())+' — '+esc(t.title||'تذكرة دعم')+'</strong><small>'+esc(t.requesterName||'مستخدم')+(t.requesterPhone?' • '+esc(t.requesterPhone):t.requesterEmail?' • '+esc(t.requesterEmail):'')+' • '+new Date(Number(t.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+(isStale(t)?' • ⚠️ متأخرة +48 ساعة':'')+'</small></div><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="support-status '+esc(t.status||'new')+'">'+esc(statusLabels[t.status]||'جديدة')+'</span><span class="support-priority '+esc(t.priority||'normal')+'">'+esc(t.priority==='urgent'?'عاجل':t.priority==='high'?'مهم':t.priority==='low'?'منخفض':'عادي')+'</span></div></div><div class="support-admin-context">'+ctx.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><div class="support-admin-body">'+esc(t.description||'')+(t.questionText?'<hr style="border:0;border-top:1px solid #e5edf7;margin:9px 0"><b>نص السؤال:</b> '+esc(t.questionText):'')+'</div><div class="support-actions">'+screenshotLink(t)+(sourceHref?'<a class="btn btn-soft support-report-link" href="'+esc(sourceHref)+'" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح المصدر</a>':'')+'</div>'+(msg.length?'<div class="support-thread">'+msg.map(m=>'<div class="support-message '+(m.role==='admin'?'admin':'requester')+'"><strong>'+(m.role==='admin'?'الإدارة':esc(t.requesterName||'المستخدم'))+'</strong><p>'+esc(m.text||'')+'</p><small>'+new Date(Number(m.createdAt||0)).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')+'</div>':'')+'<form class="support-admin-controls" data-support-admin-action="'+t.uid+'|'+t.id+'"><select name="status">'+Object.entries(statusLabels).map(([k,v])=>'<option value="'+k+'" '+(t.status===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><select name="priority"><option value="low" '+(t.priority==='low'?'selected':'')+'>منخفض</option><option value="normal" '+((t.priority||'normal')==='normal'?'selected':'')+'>عادي</option><option value="high" '+(t.priority==='high'?'selected':'')+'>مهم</option><option value="urgent" '+(t.priority==='urgent'?'selected':'')+'>عاجل</option></select><textarea name="reply" maxlength="1400" placeholder="اكتب رد الإدارة — اختياري"></textarea><button type="submit"><i class="fa-solid fa-floppy-disk"></i> حفظ وإرسال</button></form></article>';
 }).join(''):'<div class="support-empty"><span>✅</span>لا توجد تذاكر في هذا القسم.</div>';
 box.querySelectorAll('[data-support-admin-action]').forEach(f=>f.addEventListener('submit',saveTicket));
}
async function audit(action,t,meta={}){
 if(!user?.uid)return;const at=Date.now(),key=at+'-'+Math.random().toString(36).slice(2,9);
 await db.ref('auditLogV4/'+key).set({uid:user.uid,action,entity:'supportTicket',entityId:t.id,meta:{requesterId:t.uid,...meta},at,createdAt:at}).catch(()=>{});
}
async function notifyRequester(t,status,reply,now,updates){
 if(t.requesterRole!=='student')return;
 const id=db.ref('notificationBroadcasts').push().key,title=reply?'رد جديد من دعم الأكاديمية':status==='resolved'?'تم حل تذكرة الدعم':status==='waiting_user'?'الدعم يحتاج معلومات إضافية':'تم تحديث تذكرة الدعم';
 updates['notificationBroadcasts/'+id]={source:'admin',title,text:reply||('حالة التذكرة #'+(t.ticketCode||t.id.slice(-6).toUpperCase())+': '+(statusLabels[status]||status)),targetMode:'students',targetStudentIds:[t.uid],href:'./support.html',priority:status==='waiting_user'?'high':'normal',isActive:true,createdAt:now,expiresAt:now+14*86400000};
}
async function saveTicket(e){
 e.preventDefault();const [uid,id]=e.currentTarget.dataset.supportAdminAction.split('|'),t=tickets.find(x=>x.uid===uid&&x.id===id);if(!t)return;
 const status=e.currentTarget.elements.status.value,priority=e.currentTarget.elements.priority.value,reply=e.currentTarget.elements.reply.value.trim(),btn=e.submitter,now=Date.now(),updates={};
 updates['supportTicketsV1/'+uid+'/'+id+'/status']=status;updates['supportTicketsV1/'+uid+'/'+id+'/priority']=priority;updates['supportTicketsV1/'+uid+'/'+id+'/updatedAt']=now;updates['supportTicketsV1/'+uid+'/'+id+'/lastAdminActionAt']=now;updates['supportTicketsV1/'+uid+'/'+id+'/lastAdminId']=user.uid;
 if(status==='resolved')updates['supportTicketsV1/'+uid+'/'+id+'/resolvedAt']=now;if(status==='closed')updates['supportTicketsV1/'+uid+'/'+id+'/closedAt']=now;
 if(reply){const mid=db.ref('supportTicketsV1/'+uid+'/'+id+'/messages').push().key;updates['supportTicketsV1/'+uid+'/'+id+'/messages/'+mid]={role:'admin',actorId:user.uid,text:reply,createdAt:now}}
 notifyRequester(t,status,reply,now,updates);
 window.AcademyUI?.setButtonLoading(btn,true,'حفظ');
 try{await db.ref().update(updates);await audit('support.update',t,{status,priority,reply:!!reply});e.currentTarget.elements.reply.value='';window.AcademyUI?.toast?.('تم تحديث التذكرة'+(reply?' وإرسال الرد':'')+' ✅')}
 catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر تحديث التذكرة.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function bind(){
 document.querySelectorAll('[data-support-admin-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.supportAdminFilter;render()});
 $('supportAdminSearch')?.addEventListener('input',e=>{search=e.target.value;render()});
 $('supportAdminRefresh')?.addEventListener('click',async()=>{const s=await db.ref('supportTicketsV1').once('value');tickets=flatten(s.val());render()});
}
auth.onAuthStateChanged(async u=>{
 if(stop){stop();stop=null}user=u;if(!u)return;
 try{
   if(u.role!=='admin')return;
   bind();const ref=db.ref('supportTicketsV1'),handler=s=>{tickets=flatten(s.val());render()};ref.on('value',handler);stop=()=>ref.off('value',handler);
 }catch(err){console.warn('Admin support center unavailable',err)}
});
window.addEventListener('pagehide',()=>stop?.());
})();