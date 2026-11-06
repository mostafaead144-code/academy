(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
const session=window.AcademyRoleSession?.get('admin');if(!session)return;
const auth=session.auth,db=session.db,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ask=opts=>window.AcademyUI?.confirm?window.AcademyUI.confirm(opts):Promise.resolve(confirm(opts?.message||opts?.title||'تأكيد؟'));
let user=null,plans={},students={},subscriptions={},requests={},customSubjects={},settings={},selectedStudentId='',editPlanId='',stops=[],bound=false;

const defaults={
 primary:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['religion','التربية الدينية']],
 prep:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['computer','الحاسب الآلي']],
 sec:[['arabic','اللغة العربية'],['english','اللغة الإنجليزية'],['math','الرياضيات'],['physics','الفيزياء'],['chemistry','الكيمياء'],['biology','الأحياء'],['history','التاريخ'],['geography','الجغرافيا']]
};
const vals=o=>Object.entries(o||{}).map(([id,v])=>({id,...(v||{})}));
const fmt=n=>{const x=Number(n||0);return x?new Date(x).toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}):'—'};
const localInput=n=>{const d=new Date(Number(n||Date.now())),p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())};
const statusLabel=s=>({active:'نشط',pending:'قيد الانتظار',suspended:'موقوف',expired:'منتهي',cancelled:'ملغي'}[s]||s||'بدون اشتراك');
const paymentLabel=v=>({instapay:'InstaPay',vodafone_cash:'Vodafone Cash',orange_cash:'Orange Cash',etisalat_cash:'e& Cash',bank_transfer:'تحويل بنكي',cash:'دفع نقدي',other:'أخرى'}[v]||v||'لم يسجل دفعًا');

async function audit(action,entityId,meta={}){
 if(!user?.uid)return;
 const ts=Date.now(),key=ts+'-'+Math.random().toString(36).slice(2,9);
 await db.ref('auditLogV4/'+key).set({uid:user.uid,action,entity:'subscription',entityId:entityId||'',meta,at:ts,createdAt:ts}).catch(()=>{});
}
function subState(s){
 if(!s)return'none';
 if(['suspended','cancelled','pending'].includes(s.status))return s.status;
 if(Number(s.endsAt||0)&&Number(s.endsAt)<=Date.now())return'expired';
 return s.status==='active'?'active':'expired';
}
function subjectRows(){
 const map=new Map();
 Object.values(defaults).flat().forEach(([id,name])=>map.set(id,name));
 Object.values(customSubjects||{}).forEach(grades=>Object.values(grades||{}).forEach(list=>{
   const arr=Array.isArray(list)?list:Object.values(list||{});
   arr.forEach(x=>{if(x?.id&&x?.name)map.set(String(x.id),x.name)});
 }));
 return [...map.entries()].map(([id,name])=>({id,name}));
}
function planRows(){return vals(plans).sort((a,b)=>Number(a.sortOrder||999)-Number(b.sortOrder||999)||Number(a.price||0)-Number(b.price||0))}
function subscriptionRows(){return vals(subscriptions)}
function requestRows(){
 const out=[];
 Object.entries(requests||{}).forEach(([uid,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({uid,id,...(v||{})})));
 return out.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function renderSettings(){
 const enabled=settings.enforceAccess===true,input=$('subscriptionEnforceAccess'),label=$('subscriptionEnforceLabel');
 if(input)input.checked=enabled;
 if(label)label.textContent=enabled?'مفعلة الآن':'غير مفعلة';
}
function renderStats(){
 const rows=subscriptionRows(),active=rows.filter(x=>subState(x)==='active'),soon=active.filter(x=>Number(x.endsAt||0)-Date.now()<=7*86400000),expired=rows.filter(x=>subState(x)==='expired'),pending=requestRows().filter(x=>x.status==='pending');
 if($('subscriptionAdminActive'))$('subscriptionAdminActive').textContent=active.length;
 if($('subscriptionAdminSoon'))$('subscriptionAdminSoon').textContent=soon.length;
 if($('subscriptionAdminExpired'))$('subscriptionAdminExpired').textContent=expired.length;
 if($('subscriptionAdminRequests'))$('subscriptionAdminRequests').textContent=pending.length;
 if($('subscriptionAdminHeroActive'))$('subscriptionAdminHeroActive').textContent=active.length;
 if($('subscriptionAdminHeroRequests'))$('subscriptionAdminHeroRequests').textContent=pending.length;
 const badge=$('subscriptionAdminBadge');if(badge){badge.textContent=pending.length;badge.classList.toggle('hidden',!pending.length)}
}
function renderSubjectChecks(selected={}){
 const box=$('planSubjects');if(!box)return;
 box.innerHTML=subjectRows().map(x=>'<label><input type="checkbox" value="'+esc(x.id)+'" '+(selected?.[x.id]?'checked':'')+'><span>'+esc(x.name)+'</span></label>').join('');
 box.closest('.full')?.classList.toggle('hidden',$('planAccessMode')?.value!=='subjects');
}
function selectedSubjects(){return Object.fromEntries([...document.querySelectorAll('#planSubjects input:checked')].map(x=>[x.value,true]))}
function refreshPlanTargetGrades(keep=''){
 const stage=$('planTargetStage')?.value||'',sel=$('planTargetGrade');if(!sel)return;
 const max=stage==='primary'?6:stage?3:6,current=String(keep||sel.value||'');
 sel.innerHTML='<option value="">كل الصفوف</option>'+Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join('');
 if(current&&Number(current)<=max)sel.value=current;
}

function resetPlan(){
 editPlanId='';
 $('subscriptionPlanForm')?.reset();
 if($('planDurationDays'))$('planDurationDays').value=30;
 if($('planAccessMode'))$('planAccessMode').value='all';
 if($('planActive'))$('planActive').checked=true;
 if($('planSortOrder'))$('planSortOrder').value=100;
 if($('planIcon'))$('planIcon').value='👑';
 refreshPlanTargetGrades('');
 if($('planSaveBtn'))$('planSaveBtn').innerHTML='<i class="fa-solid fa-plus"></i> إنشاء الباقة';
 $('planCancelEdit')?.classList.add('hidden');
 renderSubjectChecks({});
}
function editPlan(id){
 const p=plans[id];if(!p)return;editPlanId=id;
 $('planName').value=p.name||'';$('planPrice').value=Number(p.price||0);$('planDurationDays').value=Number(p.durationDays||30);$('planBadge').value=p.badge||'';$('planIcon').value=p.icon||'👑';$('planDescription').value=p.description||'';$('planAccessMode').value=p.accessMode||'all';$('planTargetType').value=p.targetType||'';$('planTargetStage').value=p.targetStage||'';refreshPlanTargetGrades(p.targetGrade||'');$('planActive').checked=p.isActive!==false;$('planSortOrder').value=Number(p.sortOrder||100);
 renderSubjectChecks(p.subjects||{});
 $('planSaveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> حفظ التعديل';$('planCancelEdit').classList.remove('hidden');
}
async function savePlan(e){
 e.preventDefault();
 const name=$('planName').value.trim(),price=Math.max(0,Number($('planPrice').value||0)),durationDays=Math.max(1,Number($('planDurationDays').value||30)),accessMode=$('planAccessMode').value;
 if(!name)return;
 const payload={name,price,durationDays,badge:$('planBadge').value.trim(),icon:$('planIcon').value.trim()||'👑',description:$('planDescription').value.trim(),accessMode,targetType:$('planTargetType').value,targetStage:$('planTargetStage').value,targetGrade:$('planTargetGrade').value,subjects:accessMode==='subjects'?selectedSubjects():{},isActive:$('planActive').checked,sortOrder:Number($('planSortOrder').value||100),updatedAt:Date.now()};
 if(accessMode==='subjects'&&!Object.keys(payload.subjects).length)return window.AcademyUI?.toast?.('حدد مادة واحدة على الأقل للباقة.','error');
 const id=editPlanId||db.ref('subscriptionPlansV1').push().key;if(!editPlanId)payload.createdAt=Date.now();
 await db.ref('subscriptionPlansV1/'+id).update(payload);
 await audit(editPlanId?'subscription.plan_update':'subscription.plan_create',id,{name:payload.name,price:payload.price,durationDays:payload.durationDays,accessMode});
 window.AcademyUI?.toast?.(editPlanId?'تم تحديث الباقة ✅':'تم إنشاء الباقة ✅');resetPlan();
}
function renderPlans(){
 const box=$('subscriptionAdminPlans');if(!box)return;const rows=planRows();
 box.innerHTML=rows.length?rows.map(p=>'<article class="subscription-admin-item"><div class="subscription-admin-item-top"><div><strong>'+esc(p.icon||'👑')+' '+esc(p.name||'باقة')+'</strong><small>'+Number(p.price||0).toLocaleString('ar-EG')+' ج.م • '+Number(p.durationDays||30)+' يوم</small></div><span class="subscription-status '+(p.isActive===false?'cancelled':'active')+'">'+(p.isActive===false?'متوقفة':'متاحة')+'</span></div><div class="subscription-admin-meta"><span>'+(p.accessMode==='subjects'?Object.values(p.subjects||{}).filter(Boolean).length+' مواد':'كل المواد')+'</span>'+(p.targetStage?'<span>'+esc(p.targetStage)+' / '+esc(p.targetGrade||'كل الصفوف')+'</span>':'<span>كل المراحل</span>')+'</div><div class="subscription-admin-actions"><button class="sub-action-main" data-edit-plan="'+p.id+'"><i class="fa-solid fa-pen"></i> تعديل</button><button class="'+(p.isActive===false?'sub-action-good':'sub-action-warn')+'" data-toggle-plan="'+p.id+'">'+(p.isActive===false?'تفعيل':'إيقاف')+'</button><button class="sub-action-danger" data-delete-plan="'+p.id+'"><i class="fa-solid fa-trash"></i> حذف</button></div></article>').join(''):'<div class="content-ops-empty"><span>👑</span>لا توجد باقات بعد.</div>';
 box.querySelectorAll('[data-edit-plan]').forEach(b=>b.onclick=()=>editPlan(b.dataset.editPlan));
 box.querySelectorAll('[data-toggle-plan]').forEach(b=>b.onclick=async()=>{const id=b.dataset.togglePlan,next=plans[id]?.isActive===false;await db.ref('subscriptionPlansV1/'+id).update({isActive:next,updatedAt:Date.now()});await audit('subscription.plan_toggle',id,{isActive:next})});
 box.querySelectorAll('[data-delete-plan]').forEach(b=>b.onclick=async()=>{const id=b.dataset.deletePlan,inUse=subscriptionRows().some(s=>s.planId===id)||requestRows().some(r=>r.planId===id&&r.status==='pending');if(inUse)return window.AcademyUI?.toast?.('لا يمكن حذف باقة مرتبطة باشتراك أو طلب معلق. أوقفها بدلًا من الحذف.','error');if(await ask({title:'حذف الباقة؟',message:'سيتم حذف تعريف الباقة نهائيًا.',tone:'danger',acceptText:'حذف'})){await db.ref('subscriptionPlansV1/'+id).remove();await audit('subscription.plan_delete',id,{name:plans[id]?.name||''})}});
 fillPlanSelect();
}
function studentRows(){
 const q=($('subscriptionStudentSearch')?.value||'').trim().toLowerCase();
 return vals(students).filter(s=>!q||[s.name,s.phone,s.email].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).slice(0,80);
}
function renderStudents(){
 const box=$('subscriptionStudentList');if(!box)return;const rows=studentRows();
 box.innerHTML=rows.length?rows.map(s=>{const sub=subscriptions[s.id],state=subState(sub),plan=plans[sub?.planId];return '<article class="subscription-admin-item '+(selectedStudentId===s.id?'selected':'')+'"><div class="subscription-admin-item-top"><div><strong>'+esc(s.name||'طالب')+'</strong><small>'+esc(s.phone||s.email||'بدون وسيلة تواصل')+' • '+esc(s.stage||'')+' '+esc(s.grade||'')+'</small></div><span class="subscription-status '+esc(state==='none'?'cancelled':state)+'">'+esc(state==='none'?'بدون اشتراك':statusLabel(state))+'</span></div><div class="subscription-admin-meta">'+(plan?'<span>'+esc(plan.name||'باقة')+'</span>':'')+(sub?.endsAt?'<span>حتى '+fmt(sub.endsAt)+'</span>':'')+'</div><div class="subscription-admin-actions"><button class="sub-action-main" data-manage-student="'+s.id+'"><i class="fa-solid fa-crown"></i> إدارة الاشتراك</button></div></article>'}).join(''):'<div class="content-ops-empty"><span>🎓</span>لا يوجد طلاب مطابقون.</div>';
 box.querySelectorAll('[data-manage-student]').forEach(b=>b.onclick=()=>selectStudent(b.dataset.manageStudent));
}
function fillPlanSelect(){
 const sel=$('studentPlanId');if(!sel)return;const current=sel.value;
 sel.innerHTML='<option value="">اختر الباقة</option>'+planRows().map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' — '+Number(p.durationDays||30)+' يوم</option>').join('');
 if(plans[current])sel.value=current;
}
function updateEndFromPlan(){
 const p=plans[$('studentPlanId')?.value],start=new Date($('studentSubStart')?.value||Date.now()).getTime();if(!p||!Number.isFinite(start))return;
 $('studentSubEnd').value=localInput(start+Number(p.durationDays||30)*86400000);
}
function selectStudent(id){
 selectedStudentId=id;const s=students[id]||{},sub=subscriptions[id]||{};
 $('selectedSubscriptionStudent').textContent=s.name||'طالب';$('selectedSubscriptionContact').textContent=s.phone||s.email||'—';fillPlanSelect();$('studentPlanId').value=sub.planId||'';$('studentSubStatus').value=subState(sub)==='none'?'active':subState(sub);$('studentSubStart').value=localInput(sub.startsAt||Date.now());$('studentSubEnd').value=localInput(sub.endsAt||Date.now()+30*86400000);$('studentSubNotes').value=sub.notes||'';$('studentSubscriptionForm').classList.remove('hidden');renderStudents();
}
async function saveStudentSubscription(e){
 e.preventDefault();if(!selectedStudentId)return;
 const planId=$('studentPlanId').value,plan=plans[planId];if(!plan)return window.AcademyUI?.toast?.('اختر باقة صحيحة.','error');
 const startsAt=new Date($('studentSubStart').value).getTime(),endsAt=new Date($('studentSubEnd').value).getTime();if(!Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt)return window.AcademyUI?.toast?.('راجع بداية ونهاية الاشتراك.','error');
 const old=subscriptions[selectedStudentId]||{},payload={planId,status:$('studentSubStatus').value,startsAt,endsAt,notes:$('studentSubNotes').value.trim(),updatedAt:Date.now(),updatedBy:user.uid};
 if(!old.createdAt)payload.createdAt=Date.now();if(payload.status==='active')payload.activatedAt=old.activatedAt||Date.now();
 await db.ref('studentSubscriptionsV1/'+selectedStudentId).update(payload);await audit('subscription.student_save',selectedStudentId,{planId,status:payload.status,startsAt,endsAt});window.AcademyUI?.toast?.('تم حفظ اشتراك الطالب ✅');
}
async function quickAction(action){
 if(!selectedStudentId)return;const ref=db.ref('studentSubscriptionsV1/'+selectedStudentId),sub=subscriptions[selectedStudentId];if(!sub)return;
 if(action==='extend30'){const base=Math.max(Date.now(),Number(sub.endsAt||0)),endsAt=base+30*86400000;await ref.update({endsAt,status:'active',updatedAt:Date.now(),updatedBy:user.uid});await audit('subscription.extend',selectedStudentId,{days:30,endsAt});window.AcademyUI?.toast?.('تم تمديد الاشتراك 30 يومًا ✅')}
 if(action==='suspend'){await ref.update({status:'suspended',updatedAt:Date.now(),updatedBy:user.uid});await audit('subscription.suspend',selectedStudentId,{})}
 if(action==='activate'){await ref.update({status:'active',updatedAt:Date.now(),updatedBy:user.uid});await audit('subscription.activate',selectedStudentId,{})}
 if(action==='cancel'&&await ask({title:'إلغاء الاشتراك؟',message:'سيتم منع الوصول للمحتوى المدفوع فورًا.',tone:'warning',acceptText:'إلغاء الاشتراك'})){await ref.update({status:'cancelled',updatedAt:Date.now(),updatedBy:user.uid});await audit('subscription.cancel',selectedStudentId,{})}
}
function renderRequests(){
 const box=$('subscriptionRequestList');if(!box)return;const rows=requestRows().filter(x=>x.status==='pending');
 box.innerHTML=rows.length?rows.map(r=>'<article class="subscription-admin-item"><div class="subscription-admin-item-top"><div><strong>'+esc(r.studentName||students[r.uid]?.name||'طالب')+' — '+esc(r.planName||plans[r.planId]?.name||'باقة')+'</strong><small>'+esc(r.studentPhone||students[r.uid]?.phone||'')+' • '+fmt(r.createdAt)+'</small></div><span class="subscription-status pending">قيد المراجعة</span></div><div class="subscription-admin-meta"><span>'+Number(r.price||plans[r.planId]?.price||0).toLocaleString('ar-EG')+' ج.م'+(r.discountAmount?' (خصم '+Number(r.discountAmount).toLocaleString('ar-EG')+')':'')+'</span><span>'+Number(r.durationDays||plans[r.planId]?.durationDays||30)+' يوم</span><span>'+esc(paymentLabel(r.paymentMethod))+(r.paymentReference?' • '+esc(r.paymentReference):'')+'</span></div><div class="subscription-admin-actions"><button class="sub-action-good" data-approve-request="'+r.uid+'|'+r.id+'"><i class="fa-solid fa-check"></i> اعتماد وتفعيل</button><button class="sub-action-danger" data-reject-request="'+r.uid+'|'+r.id+'"><i class="fa-solid fa-xmark"></i> رفض</button></div></article>').join(''):'<div class="content-ops-empty"><span>✅</span>لا توجد طلبات اشتراك معلقة.</div>';
 box.querySelectorAll('[data-approve-request]').forEach(b=>b.onclick=()=>reviewRequest(b.dataset.approveRequest,true));
 box.querySelectorAll('[data-reject-request]').forEach(b=>b.onclick=()=>reviewRequest(b.dataset.rejectRequest,false));
}
async function reviewRequest(key,approved){
 const [uid,id]=key.split('|'),r=requests?.[uid]?.[id],plan=plans[r?.planId];if(!r)return;
 if(approved&&!plan)return window.AcademyUI?.toast?.('الباقة لم تعد موجودة.','error');
 const ts=Date.now(),updates={},current=subscriptions[uid]||{};
 updates['subscriptionRequestsV1/'+uid+'/'+id+'/status']=approved?'approved':'rejected';updates['subscriptionRequestsV1/'+uid+'/'+id+'/reviewedAt']=ts;updates['subscriptionRequestsV1/'+uid+'/'+id+'/reviewedBy']=user.uid;
 if(approved){
   const renewing=current.planId===r.planId&&subState(current)==='active'&&Number(current.endsAt||0)>ts,base=renewing?Number(current.endsAt):ts;
   updates['studentSubscriptionsV1/'+uid]={planId:r.planId,status:'active',startsAt:renewing?Number(current.startsAt||ts):ts,endsAt:base+Number(plan.durationDays||30)*86400000,notes:renewing?'تم التجديد من طلب اشتراك':'تم التفعيل من طلب الاشتراك',createdAt:current.createdAt||ts,updatedAt:ts,updatedBy:user.uid,activatedAt:current.activatedAt||ts,lastRenewedAt:renewing?ts:null};
 }
 await db.ref().update(updates);
 if(approved&&r.couponCode){await db.ref('subscriptionCouponsV1/'+String(r.couponCode).toUpperCase()+'/uses').transaction(v=>Number(v||0)+1).catch(()=>{})}
 await audit(approved?'subscription.request_approve':'subscription.request_reject',uid,{requestId:id,planId:r.planId||'',planName:r.planName||'',approved,couponCode:r.couponCode||'',discountAmount:Number(r.discountAmount||0)});
 window.AcademyUI?.toast?.(approved?'تم اعتماد الطلب وتفعيل/تجديد الاشتراك ✅':'تم رفض الطلب');
}
function render(){
 renderSettings();renderStats();renderPlans();renderStudents();renderRequests();
 if(selectedStudentId&&students[selectedStudentId])selectStudent(selectedStudentId);
}
async function toggleEnforcement(e){
 const enabled=!!e.target.checked;
 if(enabled){
   const activePlans=planRows().filter(p=>p.isActive!==false);
   if(!activePlans.length){e.target.checked=false;return window.AcademyUI?.toast?.('أنشئ باقة نشطة واحدة على الأقل قبل تفعيل الحماية.','error')}
   const ok=await ask({title:'تفعيل حماية الاشتراكات؟',message:'بعد التفعيل، أي محتوى غير محدد كمجاني سيحتاج اشتراكًا مناسبًا. المحتوى المجاني سيظل مفتوحًا.',acceptText:'تفعيل الحماية'});
   if(!ok){e.target.checked=false;return}
 }
 await db.ref('subscriptionSettingsV1').update({enforceAccess:enabled,updatedAt:Date.now(),updatedBy:user.uid});
 await audit(enabled?'subscription.enforcement_enable':'subscription.enforcement_disable','settings',{enabled});
 window.AcademyUI?.toast?.(enabled?'تم تفعيل حماية المحتوى بالاشتراكات ✅':'تم إيقاف حماية الاشتراكات مؤقتًا');
}
function bind(){
 if(bound)return;bound=true;
 $('subscriptionPlanForm')?.addEventListener('submit',savePlan);
 $('planAccessMode')?.addEventListener('change',()=>renderSubjectChecks(selectedSubjects()));
 $('planTargetStage')?.addEventListener('change',()=>refreshPlanTargetGrades(''));
 $('planCancelEdit')?.addEventListener('click',resetPlan);
 $('subscriptionStudentSearch')?.addEventListener('input',renderStudents);
 $('studentSubscriptionForm')?.addEventListener('submit',saveStudentSubscription);
 $('studentPlanId')?.addEventListener('change',updateEndFromPlan);
 $('studentSubStart')?.addEventListener('change',updateEndFromPlan);
 $('subscriptionEnforceAccess')?.addEventListener('change',toggleEnforcement);
 document.querySelectorAll('[data-sub-quick]').forEach(b=>b.onclick=()=>quickAction(b.dataset.subQuick));
 resetPlan();fillPlanSelect();
}
function listen(path,key){
 const ref=db.ref(path),handler=s=>{const value=s.val()||{};if(key==='plans')plans=value;if(key==='students')students=value;if(key==='subscriptions')subscriptions=value;if(key==='requests')requests=value;if(key==='customSubjects')customSubjects=value;if(key==='settings')settings=value;render()};
 ref.on('value',handler);stops.push(()=>ref.off('value',handler));
}
auth.onAuthStateChanged(async u=>{
 stops.splice(0).forEach(fn=>fn());user=u;if(!u)return;
 try{
   if(u.role!=='admin')return;
   bind();
   listen('subscriptionPlansV1','plans');listen('studentProfilesV3','students');listen('studentSubscriptionsV1','subscriptions');listen('subscriptionRequestsV1','requests');listen('subscriptionSettingsV1','settings');listen('customSubjects','customSubjects');
 }catch(err){console.warn('Subscription admin unavailable',err)}
});
window.addEventListener('pagehide',()=>stops.splice(0).forEach(fn=>fn()));
})();