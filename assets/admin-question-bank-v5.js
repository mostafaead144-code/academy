(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
if(!$('v5BankList')||!window.AcademyRoleSession)return;
const session=AcademyRoleSession.get('admin'),auth=session?.auth,db=session?.db;let bank={},stop=null;
const difficultyLabel=n=>({1:'سهل',2:'متوسط',3:'صعب'}[Number(n)]||'متوسط');
const statusLabel=s=>({approved:'معتمد',pending:'قيد المراجعة',hidden:'مخفي',draft:'مسودة'}[s]||s||'معتمد');
function rows(){
 const q=($('v5BankSearch')?.value||'').trim().toLowerCase(),status=$('v5BankStatus')?.value||'all',difficulty=$('v5BankDifficulty')?.value||'all',subject=($('v5BankSubject')?.value||'').trim().toLowerCase();
 return Object.entries(bank||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>{
  const hay=[x.question,x.text,x.skill,x.subject,x.subjectName,x.lessonId,x.sourceQuizId].join(' ').toLowerCase();
  return(!q||hay.includes(q))&&(status==='all'||String(x.status||'approved')===status)&&(difficulty==='all'||String(Number(x.difficulty||2))===difficulty)&&(!subject||String(x.subject||'').toLowerCase().includes(subject)||String(x.subjectName||'').toLowerCase().includes(subject));
 }).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
}
function renderStats(filtered){
 const all=Object.values(bank||{}),approved=all.filter(x=>(x?.status||'approved')==='approved').length,pending=all.filter(x=>x?.status==='pending').length,skills=new Set(all.map(x=>String(x?.skill||'').trim()).filter(Boolean)).size;
 $('v5BankStats').innerHTML=`<article><strong>${all.length}</strong><small>كل الأسئلة</small></article><article><strong>${approved}</strong><small>معتمد</small></article><article><strong>${pending}</strong><small>قيد المراجعة</small></article><article><strong>${skills}</strong><small>مهارة مسجلة</small></article><article><strong>${filtered.length}</strong><small>نتيجة الفلترة</small></article>`;
}
function render(){
 const list=rows();renderStats(list);const box=$('v5BankList');
 box.innerHTML=list.length?list.slice(0,250).map(x=>{
  const opts=Array.isArray(x.options)?x.options:Object.values(x.options||{}),correct=Number(x.correctAnswer||0);
  return `<article class="v5-bank-item" data-bank-id="${esc(x.id)}"><div class="v5-bank-item-head"><div><strong>${esc(x.question||x.text||'سؤال بدون نص')}</strong><small>${esc(x.subjectName||x.subject||'بدون مادة')} • ${esc(x.stage||'')} ${esc(x.grade||'')} • ${x.unit?'الوحدة '+esc(x.unit):'بدون وحدة'}</small></div><div class="v5-bank-badges"><span class="v5-bank-status ${esc(x.status||'approved')}">${esc(statusLabel(x.status||'approved'))}</span><span>${esc(difficultyLabel(x.difficulty||2))}</span></div></div><div class="v5-bank-options">${opts.map((o,i)=>`<span class="${i===correct?'correct':''}">${i===correct?'✓ ':''}${esc(o)}</span>`).join('')}</div><div class="v5-bank-edit"><label><span>المهارة / ناتج التعلم</span><input data-bank-skill="${esc(x.id)}" value="${esc(x.skill||'')}" placeholder="مثال: إعراب الفعل المضارع"></label><label><span>الصعوبة</span><select data-bank-difficulty="${esc(x.id)}"><option value="1" ${Number(x.difficulty||2)===1?'selected':''}>سهل</option><option value="2" ${Number(x.difficulty||2)===2?'selected':''}>متوسط</option><option value="3" ${Number(x.difficulty||2)===3?'selected':''}>صعب</option></select></label></div><div class="v5-bank-actions"><button class="btn btn-soft" data-bank-save="${esc(x.id)}"><i class="fa-solid fa-floppy-disk"></i> حفظ التصنيف</button><button class="btn btn-soft" data-bank-status="${esc(x.id)}" data-next-status="${(x.status||'approved')==='hidden'?'approved':'hidden'}"><i class="fa-solid ${(x.status||'approved')==='hidden'?'fa-eye':'fa-eye-slash'}"></i> ${(x.status||'approved')==='hidden'?'إظهار':'إخفاء'}</button>${(x.status||'')==='pending'?`<button class="btn btn-primary" data-bank-approve="${esc(x.id)}"><i class="fa-solid fa-check"></i> اعتماد</button>`:''}<button class="btn btn-soft danger" data-bank-delete="${esc(x.id)}"><i class="fa-solid fa-trash"></i></button></div></article>`;
 }).join('')+(list.length>250?`<div class="content-ops-note">يتم عرض أول 250 نتيجة فقط. استخدم البحث والفلترة للوصول إلى بقية الأسئلة.</div>`:''):'<div class="content-ops-empty"><span>🧠</span>لا توجد أسئلة مطابقة للفلترة الحالية.</div>';
 box.querySelectorAll('[data-bank-save]').forEach(b=>b.onclick=()=>saveMeta(b.dataset.bankSave));
 box.querySelectorAll('[data-bank-status]').forEach(b=>b.onclick=()=>setStatus(b.dataset.bankStatus,b.dataset.nextStatus));
 box.querySelectorAll('[data-bank-approve]').forEach(b=>b.onclick=()=>setStatus(b.dataset.bankApprove,'approved'));
 box.querySelectorAll('[data-bank-delete]').forEach(b=>b.onclick=()=>removeQuestion(b.dataset.bankDelete));
}
async function saveMeta(id){const skill=document.querySelector(`[data-bank-skill="${CSS.escape(id)}"]`)?.value.trim()||'',difficulty=Number(document.querySelector(`[data-bank-difficulty="${CSS.escape(id)}"]`)?.value||2);try{await db.ref('questionBankV4/'+id).update({skill,difficulty,updatedAt:Date.now(),reviewedBy:auth.currentUser?.uid||''});window.AcademyUI?.toast?.('تم تحديث تصنيف السؤال ✅')}catch(e){console.error(e);window.AcademyUI?.toast?.('تعذر حفظ السؤال.','error')}}
async function setStatus(id,status){try{await db.ref('questionBankV4/'+id).update({status,updatedAt:Date.now(),reviewedAt:Date.now(),reviewedBy:auth.currentUser?.uid||''});window.AcademyUI?.toast?.(status==='approved'?'تم اعتماد السؤال ✅':status==='hidden'?'تم إخفاء السؤال':'تم تحديث الحالة')}catch(e){console.error(e);window.AcademyUI?.toast?.('تعذر تحديث الحالة.','error')}}
async function removeQuestion(id){const ok=window.AcademyUI?.confirm?await AcademyUI.confirm({title:'حذف السؤال من البنك؟',message:'لن يحذف هذا السؤال من الاختبار الأصلي إن كان مرتبطًا به، لكنه سيُزال من بنك الأسئلة المركزي.',tone:'warning',acceptText:'حذف من البنك'}):confirm('حذف السؤال من بنك الأسئلة؟');if(!ok)return;try{await db.ref('questionBankV4/'+id).remove();window.AcademyUI?.toast?.('تم حذف السؤال من البنك')}catch(e){console.error(e);window.AcademyUI?.toast?.('تعذر الحذف.','error')}}
['v5BankSearch','v5BankStatus','v5BankDifficulty','v5BankSubject'].forEach(id=>$(id)?.addEventListener(id==='v5BankSearch'||id==='v5BankSubject'?'input':'change',render));
auth?.onAuthStateChanged(u=>{if(stop){stop();stop=null}if(!u||u.role!=='admin')return;const ref=db.ref('questionBankV4'),handler=s=>{bank=s.val()||{};render()};ref.on('value',handler);stop=()=>ref.off('value',handler)});
window.addEventListener('pagehide',()=>stop?.());
})();
