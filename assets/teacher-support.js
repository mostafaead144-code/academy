(() => {
'use strict';
const cfg=window.ACADEMY_BACKEND_CONFIG||JSON.parse(localStorage.getItem('academyBackendConfig')||'null');if(!cfg)return;
const app=AcademyBackend.apps.find(a=>a.name==='teacher-portal')||AcademyBackend.initializeApp(cfg,'teacher-portal'),auth=app.auth(),db=app.database(),$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,teacher={},tickets={},filter='all',stop=null;
const statusLabels={new:'جديدة',reviewing:'قيد المراجعة',in_progress:'جاري الحل',waiting_user:'مطلوب رد منك',resolved:'تم الحل',closed:'مغلقة'};
const categoryLabels={technical:'مشكلة تقنية',content:'مشكلة محتوى',students:'مشكلة مع الطلاب',assignment:'واجب أو تصحيح',account:'الحساب والصلاحيات',general:'طلب أو مشكلة عامة'};
function safeUrl(u=''){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:''}catch{return''}}
async function compressImage(file){
 if(!file)return'';if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('صيغة الصورة غير مدعومة');
 if(file.size>5*1024*1024)throw Error('حجم الصورة أكبر من 5MB');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
 const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});
 const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const out=canvas.toDataURL('image/jpeg',.72);if(out.length>520000)throw Error('تعذر ضغط الصورة بما يكفي؛ استخدم لقطة أصغر');return out;
}
function rows(){return Object.entries(tickets||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))}
function filteredRows(){const all=rows();if(filter==='all')return all;if(filter==='open')return all.filter(x=>!['resolved','closed'].includes(x.status));return all.filter(x=>x.status===filter)}
function messages(t){return Object.entries(t.messages||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))}
function updateCounts(){
 const all=rows(),open=all.filter(x=>!['resolved','closed'].includes(x.status)).length,waiting=all.filter(x=>x.status==='waiting_user').length;
 if($('teacherSupportOpenCount'))$('teacherSupportOpenCount').textContent=open;
 if($('teacherSupportWaitingCount'))$('teacherSupportWaitingCount').textContent=waiting;
 const badge=$('teacherSupportNavBadge');if(badge){badge.textContent=waiting||open;badge.classList.toggle('hidden',!(waiting||open))}
}
function render(){
 updateCounts();const box=$('teacherSupportList');if(!box)return;const list=filteredRows();
 box.innerHTML=list.length?list.map(t=>{
   const msg=messages(t),canReply=t.status!=='closed';
   return '<article class="support-ticket"><div class="support-ticket-top"><div><strong>#'+esc(t.ticketCode||t.id.slice(-6).toUpperCase())+' — '+esc(t.title||'تذكرة دعم')+'</strong><small>'+esc(categoryLabels[t.category]||'دعم')+' • '+new Date(Number(t.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="support-status '+esc(t.status||'new')+'">'+esc(statusLabels[t.status]||'جديدة')+'</span></div><p>'+esc(t.description||'')+'</p><div class="support-ticket-meta"><span class="support-priority '+esc(t.priority||'normal')+'">الأولوية: '+esc(t.priority==='urgent'?'عاجل':t.priority==='high'?'مهم':'عادي')+'</span></div>'+(msg.length?'<div class="support-thread">'+msg.map(m=>'<div class="support-message '+(m.role==='admin'?'admin':'requester')+'"><strong>'+(m.role==='admin'?'إدارة الأكاديمية':esc(teacher.name||'أنت'))+'</strong><p>'+esc(m.text||'')+'</p><small>'+new Date(Number(m.createdAt||0)).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')+'</div>':'')+(canReply?'<form class="support-reply" data-teacher-support-reply="'+t.id+'"><textarea maxlength="1200" placeholder="'+(t.status==='waiting_user'?'اكتب المعلومات المطلوبة...':'أضف توضيحًا للإدارة...')+'"></textarea><button class="btn btn-primary" type="submit">إرسال</button></form>':'')+'</article>';
 }).join(''):'<div class="support-empty"><span>🎫</span>لا توجد تذاكر في هذا القسم.</div>';
 box.querySelectorAll('[data-teacher-support-reply]').forEach(f=>f.addEventListener('submit',reply));
 document.querySelectorAll('[data-teacher-support-filter]').forEach(b=>b.classList.toggle('active',b.dataset.teacherSupportFilter===filter));
}
async function reply(e){
 e.preventDefault();const id=e.currentTarget.dataset.teacherSupportReply,text=e.currentTarget.querySelector('textarea').value.trim(),btn=e.submitter;if(!text)return;
 window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const now=Date.now(),ref=db.ref('supportTicketsV1/'+user.uid+'/'+id+'/messages').push(),updates={};
   updates['supportTicketsV1/'+user.uid+'/'+id+'/messages/'+ref.key]={role:'requester',actorId:user.uid,text,createdAt:now};updates['supportTicketsV1/'+user.uid+'/'+id+'/updatedAt']=now;updates['supportTicketsV1/'+user.uid+'/'+id+'/lastRequesterReplyAt']=now;
   if(tickets[id]?.status==='waiting_user')updates['supportTicketsV1/'+user.uid+'/'+id+'/status']='reviewing';
   await db.ref().update(updates);e.currentTarget.reset();window.AcademyUI?.toast?.('تم إرسال الرد للإدارة ✅');
 }catch(err){console.error(err);window.AcademyUI?.toast?.('تعذر إرسال الرد الآن.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
async function submit(e){
 e.preventDefault();const category=$('teacherSupportCategory').value,priority=$('teacherSupportPriority').value,title=$('teacherSupportTitle').value.trim(),description=$('teacherSupportDescription').value.trim(),raw=$('teacherSupportScreenshot').value.trim(),screenshotUrl=raw?safeUrl(raw):'';
 if(!title||description.length<5)return window.AcademyUI?.toast?.('اكتب عنوانًا ووصفًا أوضح.','error');if(raw&&!screenshotUrl)return window.AcademyUI?.toast?.('رابط الصورة غير صالح.','error');
 const btn=$('teacherSupportSubmit');window.AcademyUI?.setButtonLoading(btn,true,'فتح');
 try{
   const screenshotData=await compressImage($('teacherSupportScreenshotFile')?.files?.[0]),now=Date.now(),ref=db.ref('supportTicketsV1/'+user.uid).push(),ticketCode=('T'+now.toString(36).slice(-5)+ref.key.slice(-3)).toUpperCase();
   const payload={ticketCode,requesterId:user.uid,requesterRole:'teacher',requesterName:teacher.name||user.displayName||'مدرس',requesterEmail:teacher.email||user.email||'',category,priority,title,description,screenshotUrl,screenshotData,status:'new',source:'teacher_portal',createdAt:now,updatedAt:now};
   await ref.set(payload);e.target.reset();window.AcademyUI?.toast?.('تم فتح تذكرة الدعم ✅')
 }catch(err){console.error(err);window.AcademyUI?.toast?.(err?.message||'تعذر فتح التذكرة.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function mount(){
 $('teacherSupportForm')?.addEventListener('submit',submit);
 document.querySelectorAll('[data-teacher-support-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.teacherSupportFilter;render()});
}
auth.onAuthStateChanged(async u=>{
 if(stop){stop();stop=null}user=u;if(!u)return;
 try{teacher=(await db.ref('teacherProfiles/'+u.uid).once('value')).val()||{};if(teacher.isActive===false)return;mount();const ref=db.ref('supportTicketsV1/'+u.uid),handler=s=>{tickets=s.val()||{};render()};ref.on('value',handler);stop=()=>ref.off('value',handler)}
 catch(err){console.warn('Teacher support unavailable',err)}
});
window.addEventListener('pagehide',()=>stop?.());
})();