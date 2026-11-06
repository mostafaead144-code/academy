(() => {
'use strict';
if(!document.getElementById('admin-tab-notifications'))return;
const session=window.AcademyRoleSession?.get('admin');if(!session)return;
const db=session.db,auth=session.auth,$=id=>document.getElementById(id),queryAll=(s,r=document)=>[...r.querySelectorAll(s)];
let broadcasts={},listening=false;
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const typeLabel=t=>t==='azhar'?'أزهر':t==='public'?'تعليم عام':'كل المسارات';
const stageLabel=s=>({primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'}[s]||'كل المراحل');

function toast(msg,type='success'){
  let el=$('toast');if(!el)return;el.textContent=msg;el.className='toast show '+type;
  clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3000);
}
function updateGrades(){
  const stage=$('broadcastStage').value,sel=$('broadcastGrade');
  if(!stage){sel.innerHTML='<option value="">كل الصفوف</option>';return}
  const max=stage==='primary'?6:3;
  sel.innerHTML='<option value="">كل الصفوف</option>'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join('');
}
function render(){
  const arr=Object.entries(broadcasts||{}).map(([id,v])=>({id,...(v||{})})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const el=$('broadcastAdminList');if(!el)return;
  el.innerHTML=arr.length?arr.map(n=>{
    const target=[typeLabel(n.type),stageLabel(n.stage),n.grade?'صف '+n.grade:'كل الصفوف'].join(' • ');
    const expired=n.expiresAt&&Date.now()>Number(n.expiresAt),active=n.isActive!==false&&!expired;
    return '<div class="admin-list-item"><div><strong>'+esc(n.title||'إشعار')+'</strong><small>'+esc(target)+'</small><small>'+esc((n.text||'').slice(0,120))+'</small></div><div class="admin-action-row"><span class="status-pill '+(active?'approved':'rejected')+'">'+(active?'نشط':'منتهي')+'</span><button class="admin-action-btn '+(n.isActive===false?'success':'')+'" data-broadcast-toggle="'+id+'"><i class="fa-solid '+(n.isActive===false?'fa-play':'fa-pause')+'"></i></button><button class="admin-action-btn danger" data-broadcast-delete="'+id+'"><i class="fa-solid fa-trash"></i></button></div></div>';
  }).join(''):'<div class="empty-admin"><span>📭</span><h3>لا توجد إشعارات موجهة</h3><p>أنشئ أول إشعار للفئة المناسبة.</p></div>';
  queryAll('[data-broadcast-toggle]').forEach(b=>b.onclick=()=>db.ref('notificationBroadcasts/'+b.dataset.broadcastToggle+'/isActive').set(broadcasts?.[b.dataset.broadcastToggle]?.isActive===false));
  queryAll('[data-broadcast-delete]').forEach(b=>b.onclick=async()=>{const ok=await window.AcademyUI.confirm({title:'حذف الإشعار؟',message:'سيتم حذف الإشعار الموجه ولن يظهر للطلاب بعد ذلك.',tone:'danger',acceptText:'حذف الإشعار'});if(ok)await db.ref('notificationBroadcasts/'+b.dataset.broadcastDelete).remove()});
}
$('broadcastStage').onchange=updateGrades;
$('broadcastForm').onsubmit=async e=>{
  e.preventDefault();
  const user=auth.currentUser,btn=$('broadcastSubmitBtn')||e.submitter;if(!user)return toast('سجل دخول الإدارة أولًا.','error');
  const days=Math.max(1,Math.min(30,Number($('broadcastDays').value||7)));
  const payload={
    title:$('broadcastTitle').value.trim(),text:$('broadcastText').value.trim(),
    type:$('broadcastType').value,stage:$('broadcastStage').value,grade:$('broadcastGrade').value,
    priority:$('broadcastPriority').value,href:$('broadcastHref').value.trim(),
    isActive:$('broadcastActive').checked,createdAt:Date.now(),expiresAt:Date.now()+days*86400000,createdBy:user.uid
  };
  if(!payload.title||!payload.text)return toast('أكمل عنوان الإشعار ونصه.','error');
  window.AcademyUI?.setButtonLoading(btn,true,'نشر');
  try{
    await db.ref('notificationBroadcasts').push(payload);
    e.target.reset();$('broadcastDays').value=7;$('broadcastActive').checked=true;updateGrades();toast('تم نشر الإشعار الموجه ✅');
  }catch(err){console.error(err);toast('تعذر نشر الإشعار الآن.','error')}
  finally{window.AcademyUI?.setButtonLoading(btn,false)}
};
const nav=queryAll('[data-admin-tab="notifications"]')[0];
if(nav)nav.addEventListener('click',()=>{
  setTimeout(()=>{if($('adminSectionKicker'))$('adminSectionKicker').textContent='التواصل';if($('adminSectionTitle'))$('adminSectionTitle').textContent='الإشعارات الموجهة'},0);
});
auth.onAuthStateChanged(user=>{
  const ref=db.ref('notificationBroadcasts');
  if(!user){
    if(listening){ref.off();listening=false}
    broadcasts={};render();return;
  }
  if(listening)return;
  listening=true;
  ref.on('value',s=>{broadcasts=s.val()||{};render()},err=>{console.warn('Broadcast notifications read blocked',err);listening=false});
});
updateGrades();
})();