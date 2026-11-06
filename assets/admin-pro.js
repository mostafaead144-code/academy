(()=>{
'use strict';
const P=window.AcademyPro,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]||m));
let directoryCache={students:[],parents:[]};

async function approveQ(id,status){
  await P.db.ref(P.paths.bank+'/'+id).update({status,reviewedAt:Date.now(),reviewerUid:P.auth.currentUser.uid});
  await P.audit('question.review','question',id,{status});
  await load();
}
async function reviewS(id,status){
  await P.reviewContent(id,status,status==='rejected'?'مرفوض من الإدارة':'');
  await load();
}
function setResetTarget(uid,name){
  if($('resetAccountUid'))$('resetAccountUid').value=uid||'';
  if($('resetAccountName'))$('resetAccountName').value=name||'';
  $('resetAccountPassword')?.focus();
  $('passwordResetStatus').textContent=uid?'تم اختيار الحساب. اكتب كلمة مرور جديدة.':'';
}
function renderDirectory(){
  const term=($('directorySearch')?.value||'').trim().toLowerCase();
  const html=(items,emptyText)=>{
    const filtered=items.filter(x=>!term||((x.name||'')+' '+(x.phone||'')).toLowerCase().includes(term));
    return filtered.length?filtered.map(x=>
      '<div class="pro-item"><div class="pro-space"><div><strong>'+esc(x.name||'بدون اسم')+'</strong><div class="pro-muted">'+esc(x.phone||'—')+'</div></div><button class="pro-btn" type="button" data-reset-uid="'+esc(x.uid||'')+'" data-reset-name="'+esc(x.name||'الحساب')+'">اختيار الحساب</button></div></div>'
    ).join(''):'<div class="pro-empty">'+emptyText+'</div>';
  };
  if($('studentDirectory'))$('studentDirectory').innerHTML=html(directoryCache.students,'لا توجد بيانات طلاب.');
  if($('parentDirectory'))$('parentDirectory').innerHTML=html(directoryCache.parents,'لا توجد بيانات أولياء أمور.');
  document.querySelectorAll('[data-reset-uid]').forEach(b=>b.onclick=()=>setResetTarget(b.dataset.resetUid,b.dataset.resetName));
}
async function resetPassword(event){
  event.preventDefault();
  const uid=$('resetAccountUid').value.trim(),password=$('resetAccountPassword').value,status=$('passwordResetStatus'),btn=event.submitter||event.target.querySelector('button[type="submit"]');
  if(!uid)return status.textContent='اختر حسابًا أو اكتب UID أولًا.';
  if(password.length<6)return status.textContent='كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.';
  if(!window.AcademyBackend?.functions)return status.textContent='خدمة إعادة تعيين كلمة المرور غير متاحة حاليًا.';
  btn.disabled=true;status.textContent='جاري تعيين كلمة المرور الجديدة...';
  try{
    const call=AcademyBackend.functions().httpsCallable('adminSetUserPassword');
    await call({uid,password});
    $('resetAccountPassword').value='';
    status.textContent='تم تعيين كلمة المرور الجديدة بنجاح. لا يتم حفظها أو عرض القديمة.';
  }catch(err){
    console.error(err);
    status.textContent=(err?.code||'').includes('not-found')?'خدمة إعادة تعيين كلمة المرور غير متاحة على الخادم.':'تعذر تعيين كلمة المرور الجديدة. تأكد من اتصال API وصلاحية حساب المدير.';
  }finally{btn.disabled=false}
}
async function load(){
  if(await P.roleOf()!=='admin'){location.href='./admin.html';return}
  const [qb,su,au,ce,dir]=await Promise.all([
    P.db.ref(P.paths.bank).once('value'),
    P.db.ref(P.paths.submissions).once('value'),
    P.db.ref(P.paths.audit).limitToLast(100).once('value'),
    P.db.ref(P.paths.certificates).once('value'),
    P.db.ref('phoneDirectoryV4').once('value')
  ]);
  const q=Object.values(qb.val()||{}).filter(x=>x.status==='pending');
  const s=Object.values(su.val()||{}).filter(x=>x.status==='pending');
  const a=Object.values(au.val()||{}).sort((x,y)=>(y.createdAt||y.at||0)-(x.createdAt||x.at||0));
  const d=dir.val()||{};
  directoryCache={
    students:Object.values(d.students||{}),
    parents:Object.values(d.parents||{})
  };

  $('questions').innerHTML=q.length?q.map(x=>'<div class="pro-item"><strong>'+esc(x.question||x.text)+'</strong><div class="pro-muted">'+esc(x.subject||'')+' • صعوبة '+esc(x.difficulty||2)+'</div><div class="pro-row" style="margin-top:8px"><button class="pro-btn primary" data-qa="'+esc(x.id)+'">اعتماد</button><button class="pro-btn" data-qr="'+esc(x.id)+'">رفض</button></div></div>').join(''):'<div class="pro-empty">لا توجد أسئلة معلقة.</div>';
  $('submissions').innerHTML=s.length?s.map(x=>'<div class="pro-item"><div class="pro-space"><div><strong>'+esc(x.type)+'</strong><div class="pro-muted">'+esc(x.authorRole)+' • '+new Date(x.createdAt).toLocaleString('ar-EG')+'</div></div><div class="pro-row"><button class="pro-btn primary" data-sa="'+esc(x.id)+'">اعتماد</button><button class="pro-btn" data-sr="'+esc(x.id)+'">رفض</button></div></div></div>').join(''):'<div class="pro-empty">لا يوجد محتوى معلق.</div>';
  $('audit').innerHTML=a.length?a.slice(0,50).map(x=>'<div class="pro-item"><strong>'+esc(x.action)+'</strong><div class="pro-muted">'+esc(x.entity)+' '+esc(x.entityId||'')+' • '+new Date(x.createdAt||x.at).toLocaleString('ar-EG')+'</div></div>').join(''):'<div class="pro-empty">سجل التعديلات فارغ.</div>';
  $('summary').innerHTML='<div class="pro-item"><strong>'+q.length+'</strong><div class="pro-muted">أسئلة معلقة</div></div><div class="pro-item"><strong>'+s.length+'</strong><div class="pro-muted">محتوى معلق</div></div><div class="pro-item"><strong>'+Object.keys(ce.val()||{}).length+'</strong><div class="pro-muted">شهادات صادرة</div></div><div class="pro-item"><strong>'+(directoryCache.students.length+directoryCache.parents.length)+'</strong><div class="pro-muted">أرقام محفوظة</div></div>';

  renderDirectory();
  document.querySelectorAll('[data-qa]').forEach(b=>b.onclick=()=>approveQ(b.dataset.qa,'approved'));
  document.querySelectorAll('[data-qr]').forEach(b=>b.onclick=()=>approveQ(b.dataset.qr,'rejected'));
  document.querySelectorAll('[data-sa]').forEach(b=>b.onclick=()=>reviewS(b.dataset.sa,'approved'));
  document.querySelectorAll('[data-sr]').forEach(b=>b.onclick=()=>reviewS(b.dataset.sr,'rejected'));
}
if($('directorySearch'))$('directorySearch').oninput=renderDirectory;
if($('adminPasswordResetForm'))$('adminPasswordResetForm').onsubmit=resetPassword;
P.auth.onAuthStateChanged(u=>u?load():location.href='./admin.html');
})();