(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id);if(!C)return;
const q=new URLSearchParams(location.search),esc=C.esc;
let user,profile,tickets={},filter='all';
const statusLabels={new:'جديدة',reviewing:'قيد المراجعة',in_progress:'جاري الحل',waiting_user:'مطلوب رد منك',resolved:'تم الحل',closed:'مغلقة'};
const categoryLabels={technical:'مشكلة تقنية',lesson:'مشكلة في درس',quiz_question:'سؤال أو إجابة خاطئة',video:'فيديو لا يعمل',file:'ملف غير متاح',assignment:'مشكلة في واجب',account:'مشكلة في الحساب أو الدخول',general:'مشكلة عامة'};
function safeUrl(u=''){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)?x.href:''}catch{return''}}
function safeSourceHref(u=''){
 if(!u)return'';if(String(u).startsWith('./')||String(u).startsWith('/'))return String(u);
 return safeUrl(u);
}
async function compressImage(file){
 if(!file)return'';if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('صيغة الصورة غير مدعومة');
 if(file.size>5*1024*1024)throw Error('حجم الصورة أكبر من 5MB');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
 const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data});
 const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
 canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const out=canvas.toDataURL('image/jpeg',.72);
 if(out.length>520000)throw Error('تعذر ضغط الصورة بما يكفي؛ استخدم لقطة أصغر');
 return out;
}
function currentContext(){
 return{
  source:q.get('source')||'support',
  sourceId:q.get('sourceId')||'',
  type:q.get('type')||profile.educationType||'public',
  stage:q.get('stage')||profile.stage||'',
  grade:String(q.get('grade')||profile.grade||''),
  subject:q.get('subject')||'',
  lessonId:q.get('lessonId')||'',
  lessonTitle:q.get('lessonTitle')||'',
  quizId:q.get('quizId')||'',
  quizTitle:q.get('quizTitle')||'',
  questionIndex:q.get('questionIndex')||'',
  questionText:q.get('questionText')||'',
  href:safeSourceHref(q.get('href')||document.referrer||'')
 };
}
function initPrefill(){
 const ctx=currentContext(),category=q.get('category')||'',title=q.get('title')||'';
 if(category&&document.querySelector('#supportCategory option[value="'+CSS.escape(category)+'"]'))$('supportCategory').value=category;
 if(title)$('supportTitle').value=title;
 if(ctx.questionText&&!$('supportDescription').value)$('supportDescription').value='المشكلة في السؤال: '+ctx.questionText;
 const labels=[];
 if(ctx.lessonTitle)labels.push('📘 '+ctx.lessonTitle);if(ctx.quizTitle)labels.push('🎯 '+ctx.quizTitle);if(ctx.questionIndex)labels.push('❓ السؤال '+ctx.questionIndex);if(ctx.subject)labels.push('📚 '+ctx.subject);if(ctx.stage)labels.push('🎓 '+ctx.stage+' / '+ctx.grade);
 $('supportContext').innerHTML=labels.length?labels.map(x=>'<span>'+esc(x)+'</span>').join(''):'<span>تذكرة عامة من مركز الدعم</span>';
}
function rows(){return Object.entries(tickets||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))}
function filteredRows(){
 const all=rows();if(filter==='all')return all;if(filter==='open')return all.filter(x=>!['resolved','closed'].includes(x.status));return all.filter(x=>x.status===filter);
}
function stats(){
 const all=rows(),open=all.filter(x=>!['resolved','closed'].includes(x.status)).length,waiting=all.filter(x=>x.status==='waiting_user').length,resolved=all.filter(x=>x.status==='resolved').length;
 $('supportOpenCount').textContent=open;$('supportWaitingCount').textContent=waiting;$('supportResolvedCount').textContent=resolved;$('supportTotalCount').textContent=all.length;
}
function messages(t){
 return Object.entries(t.messages||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
}
function render(){
 stats();const list=filteredRows(),box=$('supportTicketList');
 box.innerHTML=list.length?list.map(t=>{
   const msg=messages(t),canReply=!['closed'].includes(t.status);
   return '<article class="support-ticket"><div class="support-ticket-top"><div><strong>#'+esc(t.ticketCode||t.id.slice(-6).toUpperCase())+' — '+esc(t.title||'تذكرة دعم')+'</strong><small>'+esc(categoryLabels[t.category]||'دعم')+' • '+new Date(Number(t.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="support-status '+esc(t.status||'new')+'">'+esc(statusLabels[t.status]||'جديدة')+'</span></div><p>'+esc(t.description||'')+'</p><div class="support-ticket-meta"><span class="support-priority '+esc(t.priority||'normal')+'">الأولوية: '+esc(t.priority==='urgent'?'عاجل':t.priority==='high'?'مهم':'عادي')+'</span>'+(t.lessonTitle?'<span>📘 '+esc(t.lessonTitle)+'</span>':'')+(t.quizTitle?'<span>🎯 '+esc(t.quizTitle)+'</span>':'')+(t.questionIndex?'<span>❓ سؤال '+esc(t.questionIndex)+'</span>':'')+'</div>'+(msg.length?'<div class="support-thread">'+msg.map(m=>'<div class="support-message '+(m.role==='admin'?'admin':'requester')+'"><strong>'+(m.role==='admin'?'إدارة الأكاديمية':esc(profile.name||'أنت'))+'</strong><p>'+esc(m.text||'')+'</p><small>'+new Date(Number(m.createdAt||0)).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')+'</div>':'')+(canReply?'<form class="support-reply" data-ticket-reply="'+t.id+'"><textarea maxlength="1200" placeholder="'+(t.status==='waiting_user'?'اكتب المعلومات المطلوبة...':'أضف ردًا أو توضيحًا...')+'"></textarea><button class="btn btn-primary" type="submit">إرسال</button></form>':'')+'</article>';
 }).join(''):'<div class="support-empty"><span>🎫</span>لا توجد تذاكر في هذا القسم.</div>';
 box.querySelectorAll('[data-ticket-reply]').forEach(f=>f.addEventListener('submit',reply));
 document.querySelectorAll('[data-support-filter]').forEach(b=>b.classList.toggle('active',b.dataset.supportFilter===filter));
}
async function reply(e){
 e.preventDefault();const id=e.currentTarget.dataset.ticketReply,text=e.currentTarget.querySelector('textarea').value.trim(),btn=e.submitter;if(!text)return;
 window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   const now=Date.now(),ref=C.db.ref('supportTicketsV1/'+user.uid+'/'+id+'/messages').push();
   const updates={};updates['supportTicketsV1/'+user.uid+'/'+id+'/messages/'+ref.key]={role:'requester',actorId:user.uid,text,createdAt:now};updates['supportTicketsV1/'+user.uid+'/'+id+'/updatedAt']=now;updates['supportTicketsV1/'+user.uid+'/'+id+'/lastRequesterReplyAt']=now;
   if(tickets[id]?.status==='waiting_user')updates['supportTicketsV1/'+user.uid+'/'+id+'/status']='reviewing';
   await C.db.ref().update(updates);e.currentTarget.reset();C.toast('تم إرسال ردك للإدارة ✅');
 }catch(err){console.error(err);C.toast('تعذر إرسال الرد الآن.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
$('supportTicketForm').addEventListener('submit',async e=>{
 e.preventDefault();const category=$('supportCategory').value,priority=$('supportPriority').value,title=$('supportTitle').value.trim(),description=$('supportDescription').value.trim(),rawUrl=$('supportScreenshotUrl').value.trim(),screenshotUrl=rawUrl?safeUrl(rawUrl):'';
 if(!title||description.length<5)return C.toast('اكتب عنوانًا ووصفًا أوضح للمشكلة.','error');if(rawUrl&&!screenshotUrl)return C.toast('رابط الصورة غير صالح.','error');
 const btn=$('supportSubmitBtn');window.AcademyUI?.setButtonLoading(btn,true,'فتح');
 try{
   const screenshotData=await compressImage($('supportScreenshotFile')?.files?.[0]),ctx=currentContext(),now=Date.now(),ref=C.db.ref('supportTicketsV1/'+user.uid).push(),ticketCode=('T'+now.toString(36).slice(-5)+ref.key.slice(-3)).toUpperCase();
   const payload={ticketCode,requesterId:user.uid,requesterRole:'student',requesterName:profile.name||user.displayName||'طالب',requesterPhone:profile.phone||'',category,priority,title,description,screenshotUrl,screenshotData,status:'new',...ctx,createdAt:now,updatedAt:now};
   await ref.set(payload);e.target.reset();initPrefill();C.toast('تم فتح التذكرة بنجاح ✅')
 }catch(err){console.error(err);C.toast(err?.message||'تعذر فتح التذكرة الآن.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
});
document.querySelectorAll('[data-support-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.supportFilter;render()});
(async()=>{
 window.AcademyUI?.showPageLoading('جاري تحميل مركز الدعم...');
 try{({user,profile}=await C.requireStudent());$('supportAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');initPrefill();const ref=C.db.ref('supportTicketsV1/'+user.uid),handler=s=>{tickets=s.val()||{};render()};ref.on('value',handler);window.addEventListener('pagehide',()=>ref.off('value',handler),{once:true})}
 catch(err){console.error(err);C.toast('تعذر تحميل مركز الدعم.','error')}finally{window.AcademyUI?.hidePageLoading()}
})();
})();