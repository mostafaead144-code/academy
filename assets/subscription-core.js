(() => {
'use strict';
const C=window.AcademyCore;if(!C)return;
const {db}=C;
const cache=new Map();
const ACTIVE='active';
function normalizeSubjects(v){
 if(Array.isArray(v))return Object.fromEntries(v.map(x=>[String(x),true]));
 if(v&&typeof v==='object')return v;
 return{};
}
function planAccess(plan,subject){
 if(!plan)return false;if(plan.accessMode!=='subjects')return true;
 if(!String(subject||'').trim())return true;
 const map=normalizeSubjects(plan.subjects);return !!map[String(subject||'')];
}
function matchesPlanScope(plan,profile){
 if(!plan)return false;
 if(plan.targetType&&plan.targetType!==profile?.educationType)return false;
 if(plan.targetStage&&plan.targetStage!==profile?.stage)return false;
 if(plan.targetGrade&&String(plan.targetGrade)!==String(profile?.grade||''))return false;
 return true;
}
function statusOf(subscription,plan,profile,at=Date.now()){
 if(!subscription||!plan)return'none';
 if(plan.isActive===false)return'unavailable';
 if(!matchesPlanScope(plan,profile))return'out_of_scope';
 if(subscription.status==='suspended')return'suspended';
 if(subscription.status==='cancelled')return'cancelled';
 if(subscription.status==='pending')return'pending';
 const start=Number(subscription.startsAt||0),end=Number(subscription.endsAt||0);
 if(start&&start>at)return'pending';
 if(end&&end<=at)return'expired';
 return subscription.status===ACTIVE?'active':'inactive';
}
function daysLeft(subscription,at=Date.now()){
 const end=Number(subscription?.endsAt||0);if(!end)return 0;return Math.max(0,Math.ceil((end-at)/86400000));
}
async function load(uid,profile={},force=false){
 if(!uid)return{subscription:null,plan:null,status:'none',active:false,daysLeft:0,plans:{}};
 if(!force&&cache.has(uid))return cache.get(uid);
 const [subSnap,plansSnap,settingsSnap]=await Promise.all([db.ref('studentSubscriptionsV1/'+uid).once('value'),db.ref('subscriptionPlansV1').once('value'),db.ref('subscriptionSettingsV1').once('value')]);
 const subscription=subSnap.val()||null,plans=plansSnap.val()||{},settings=settingsSnap.val()||{},plan=subscription?.planId?plans[subscription.planId]||null:null,status=statusOf(subscription,plan,profile),result={subscription,plan,status,active:status==='active',daysLeft:daysLeft(subscription),plans,settings,enforced:settings.enforceAccess===true};
 cache.set(uid,result);return result;
}
function invalidate(uid){if(uid)cache.delete(uid);else cache.clear()}
function canAccess(item={},access={},subject=''){
 if(access?.enforced!==true)return true;
 if(item?.isFree===true)return true;
 if(!access?.active||!access?.plan)return false;
 return planAccess(access.plan,subject||item?.subject||'');
}
function subjectAccess(subject,access={}){return canAccess({subject},access,subject)}
function statusLabel(status){
 return{disabled:'النظام غير مفعل',active:'نشط',pending:'قيد الانتظار',expired:'منتهي',suspended:'موقوف',cancelled:'ملغي',inactive:'غير نشط',none:'بدون اشتراك',unavailable:'الباقة متوقفة',out_of_scope:'الباقة غير متوافقة'}[status]||status;
}
function planPrice(plan){
 const price=Number(plan?.price||0);return price?price.toLocaleString('ar-EG')+' ج.م':'مجاني';
}
function isFreeItem(item){return item?.isFree===true}
function lockOverlay(opts={}){
 if(document.getElementById('subscriptionAccessLock'))return;
 const wrap=document.createElement('div');wrap.id='subscriptionAccessLock';wrap.className='subscription-lock';
 wrap.innerHTML='<article class="subscription-lock-card" role="dialog" aria-modal="true" aria-labelledby="subscriptionLockTitle"><button type="button" class="modal-close static" data-subscription-close aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button><span>🔒</span><h2 id="subscriptionLockTitle">'+C.esc(opts.title||'هذا المحتوى ضمن الاشتراك')+'</h2><p>'+C.esc(opts.text||'يمكنك مشاهدة المحتوى المجاني الآن، وللوصول إلى هذا المحتوى تحتاج اشتراكًا نشطًا يشمل هذه المادة.')+'</p><div class="subscription-lock-actions"><a class="btn btn-primary" href="./subscription.html"><i class="fa-solid fa-crown"></i> عرض الباقات</a><button class="btn btn-soft" type="button" data-subscription-close><i class="fa-solid fa-arrow-right"></i> رجوع</button><a class="btn btn-soft" href="./support.html?category=general&title='+encodeURIComponent('استفسار عن الاشتراك')+'"><i class="fa-solid fa-headset"></i> الدعم</a></div></article>';
 document.body.appendChild(wrap);const close=()=>wrap.remove();wrap.querySelectorAll('[data-subscription-close]').forEach(b=>b.addEventListener('click',close));wrap.addEventListener('click',e=>{if(e.target===wrap)close()});const onKey=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',onKey)}};document.addEventListener('keydown',onKey);
}
window.AcademySubscription={load,invalidate,canAccess,subjectAccess,statusOf,statusLabel,daysLeft,planPrice,isFreeItem,lockOverlay,matchesPlanScope,planAccess};
})();