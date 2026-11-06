(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription;if(!C||!S)return;
const $=id=>document.getElementById(id);
function fmt(n){const x=Number(n||0);return x?new Date(x).toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}):'—'}
function summary(access){
 if(access?.enforced!==true)return{title:'الوصول مفتوح حاليًا',text:'نظام الاشتراكات قيد التجهيز ولم يتم فرض القفل بعد.',tone:'active',cta:'عرض الباقات'};
 const plan=access.plan,status=access.status,sub=access.subscription;
 if(access.active)return{title:plan?.name||'اشتراك نشط',text:'متبقي '+access.daysLeft+' يوم • ينتهي '+fmt(sub?.endsAt),tone:access.daysLeft<=7?'expiring':'active',cta:'إدارة الاشتراك'};
 if(status==='pending')return{title:plan?.name||'اشتراك قيد الانتظار',text:'الاشتراك لم يبدأ بعد.',tone:'inactive',cta:'عرض التفاصيل'};
 if(status==='suspended')return{title:'اشتراك موقوف',text:'الوصول للمحتوى المدفوع متوقف حاليًا.',tone:'inactive',cta:'عرض التفاصيل'};
 if(status==='expired')return{title:'انتهى الاشتراك',text:'يمكنك الاستمرار في المحتوى المجاني أو طلب تجديد.',tone:'inactive',cta:'تجديد الاشتراك'};
 return{title:'لا يوجد اشتراك نشط',text:'المحتوى المجاني متاح ويمكنك طلب باقة في أي وقت.',tone:'inactive',cta:'عرض الباقات'};
}
function renderDashboard(access){
 const box=$('dashboardSubscriptionStrip');if(!box)return;const x=summary(access);
 box.classList.remove('hidden','active','expiring','inactive');box.classList.add(x.tone);
 $('dashboardSubscriptionTitle').textContent=x.title;$('dashboardSubscriptionText').textContent=x.text;$('dashboardSubscriptionCta').textContent=x.cta;
}
function renderProfile(access){
 const box=$('profileSubscriptionCard');if(!box)return;const x=summary(access);
 box.classList.remove('hidden');$('profileSubscriptionTitle').textContent=x.title;$('profileSubscriptionText').textContent=x.text;$('profileSubscriptionStatus').textContent=S.statusLabel(access.status);
 $('profileSubscriptionEnd').textContent=access.subscription?.endsAt?'ينتهي '+fmt(access.subscription.endsAt):'بدون تاريخ انتهاء';
}
C.auth.onAuthStateChanged(async user=>{
 if(!user)return;
 try{
   const profile=await C.getProfile(user.uid),access=await S.load(user.uid,profile,true);renderDashboard(access);renderProfile(access);
 }catch(err){console.warn('Subscription summary unavailable',err)}
});
})();