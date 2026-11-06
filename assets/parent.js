(()=>{'use strict';
const P=window.AcademyPro,$=id=>document.getElementById(id),DAY=86400000;
P?.auth?.setPersistence?.(AcademyBackend.auth.Auth.Persistence.LOCAL).catch(()=>{});
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function normalizePhone(raw=''){
 const digits=String(raw||'').replace(/[٠-٩۰-۹]/g,ch=>String(ch.charCodeAt(0)-(ch.charCodeAt(0)>=1776?1776:1632))).replace(/[\s()\-.]/g,'');
 let phone=digits;
 if(/^01[0125]\d{8}$/.test(phone))phone='+20'+phone.slice(1);
 else if(/^0020(1[0125]\d{8})$/.test(phone))phone='+20'+phone.slice(4);
 else if(/^20(1[0125]\d{8})$/.test(phone))phone='+'+phone;
 if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new Error('أدخل رقم هاتف صحيحًا مثل 01012345678');
 return phone;
}
function parentLoginEmail(phone){return 'g'+phone.replace(/\D/g,'')+'@parents.academy.invalid'}
function masteryFlat(o){const a=[];(function w(x){Object.values(x||{}).forEach(v=>v&&typeof v==='object'&&'lessonId'in v?a.push(v):w(v))})(o);return a}
function quizTrend(profile){const rows=Object.values(profile?.quizHistory||{}).filter(x=>x?.createdAt),now=Date.now(),week=rows.filter(x=>x.createdAt>=now-7*DAY),prev=rows.filter(x=>x.createdAt<now-7*DAY&&x.createdAt>=now-14*DAY),avg=a=>a.length?Math.round(a.reduce((n,x)=>n+Number(x.score||0),0)/a.length):0;return{current:avg(week),previous:avg(prev)}}
function alertsFor(r,avg,due){
 const a=[],last=Number(r.profile?.lastActiveAt||0),days=last?Math.floor((Date.now()-last)/DAY):null,trend=quizTrend(r.profile),as=r.assignmentSummary||{};
 if(days===null||days>=5)a.push({tone:'bad',icon:'⚠️',text:days===null?'لا يوجد نشاط مسجل للطالب حتى الآن.':'لم يدخل المنصة منذ '+days+' أيام.'});
 if(due>=5)a.push({tone:'warn',icon:'🧠',text:'لديه '+due+' أسئلة مستحقة في المراجعة الذكية.'});
 if(as.overdue>0)a.push({tone:'bad',icon:'📝',text:'لديه '+as.overdue+' واجب متأخر يحتاج التسليم.'});
 else if(as.dueSoon>0)a.push({tone:'warn',icon:'⏰',text:'لديه '+as.dueSoon+' واجب موعده خلال 48 ساعة.'});
 if(avg>0&&avg<60)a.push({tone:'bad',icon:'📉',text:'متوسط الإتقان الحالي '+avg+'% ويحتاج دعمًا ومراجعة.'});
 if(trend.current&&trend.previous&&trend.current-trend.previous>=10)a.push({tone:'ok',icon:'📈',text:'تحسن متوسط الاختبارات '+(trend.current-trend.previous)+' نقاط عن الأسبوع السابق.'});
 if(!a.length)a.push({tone:'ok',icon:'✅',text:'لا توجد تنبيهات مهمة حاليًا، استمر في المتابعة.'});
 return a;
}
function render(id,r){
 const m=masteryFlat(r.mastery),avg=m.length?Math.round(m.reduce((s,x)=>s+Number(x.score||0),0)/m.length):0,due=Object.values(r.reviews||{}).filter(x=>x.status!=='mastered'&&x.nextReviewAt<=Date.now()).length,attendance=Object.values(r.analytics?.attendance||{}),minutes=Math.round(attendance.reduce((n,x)=>n+Number(x.totalSeconds||0),0)/60),alerts=alertsFor(r,avg,due),last=r.profile?.lastActiveAt?new Date(r.profile.lastActiveAt).toLocaleString('ar-EG'):'لا يوجد نشاط';
 return '<article class="pro-card wide"><div class="pro-space"><div><span class="pro-badge">طالب مرتبط</span><h2>'+esc(r.profile?.name||'طالب')+'</h2><div class="pro-muted">'+esc(r.profile?.stage||'')+' • الصف '+esc(r.profile?.grade||'')+' • آخر نشاط: '+esc(last)+'</div></div><div><div class="pro-kpi">'+avg+'%</div><div class="pro-muted">متوسط الإتقان</div></div></div><div class="pro-list"><div class="pro-item"><div class="pro-space"><strong>XP والمستوى</strong><span>'+(r.xp.total||0)+' XP • مستوى '+(r.xp.level||1)+'</span></div></div><div class="pro-item"><div class="pro-space"><strong>مراجعات مستحقة</strong><span class="pro-badge '+(due?'bad':'ok')+'">'+due+'</span></div></div><div class="pro-item"><div class="pro-space"><strong>الدروس المتقنة</strong><span>'+m.filter(x=>x.status==='mastered').length+' من '+m.length+'</span></div></div><div class="pro-item"><div class="pro-space"><strong>حضور الحصص المباشرة</strong><span>'+minutes+' دقيقة</span></div></div><div class="pro-item"><div class="pro-space"><strong>الواجبات</strong><span>'+Number(r.assignmentSummary?.submitted||0)+' مسلّم • '+Number(r.assignmentSummary?.overdue||0)+' متأخر</span></div></div></div><h3 style="margin-top:18px">تنبيهات مهمة</h3><div class="pro-list">'+alerts.map(x=>'<div class="pro-item"><span class="pro-badge '+x.tone+'">'+x.icon+' '+esc(x.text)+'</span></div>').join('')+'</div></article>';
}
async function loadChildren(user){
 const ids=await P.getChildren(user.uid),box=$('children');
 if(!ids.length){box.innerHTML='<article class="pro-card full pro-empty">لا يوجد طالب مربوط بهذا الحساب بعد. استخدم رقم الطالب أو كود الربط بالأعلى.</article>';return}
 box.innerHTML='';
 for(const id of ids){
  try{box.insertAdjacentHTML('beforeend',render(id,await P.parentReport(id)))}
  catch(e){console.error(e);box.insertAdjacentHTML('beforeend','<article class="pro-card full pro-empty">تعذر تحميل تقرير طالب مرتبط.</article>')}
 }
}
function showAuth(signedIn){
 $('parentAuthCard').hidden=!!signedIn;$('parentDashboard').hidden=!signedIn;$('parentLogout').hidden=!signedIn;
}
function authMessage(msg){$('parentAuthStatus').textContent=msg||''}
function linkMessage(msg,ok=true){const el=$('parentLinkStatus');el.textContent=msg||'';el.style.color=ok?'#15803d':'#b91c1c'}
$('parentAuthForm').onsubmit=async e=>{
 e.preventDefault();authMessage('جاري تسجيل الدخول...');
 try{
  const phone=normalizePhone($('parentPhone').value);
  await P.auth.signInWithEmailAndPassword(parentLoginEmail(phone),$('parentPassword').value);
  authMessage('');
 }catch(err){console.error(err);authMessage(err?.code==='auth/user-not-found'||err?.code==='auth/invalid-login-credentials'?'رقم الهاتف أو الرقم السري غير صحيح.':err.message||'تعذر تسجيل الدخول.')}
};
$('parentRegisterBtn').onclick=async()=>{
 let phone;
 try{phone=normalizePhone($('parentPhone').value)}catch(err){authMessage(err.message);return}
 const name=$('parentName').value.trim(),password=$('parentPassword').value;
 if(!name||password.length<6){authMessage('اكتب الاسم ورقم الهاتف ورقمًا سريًا من 6 خانات أو أكثر.');return}
 authMessage('جاري إنشاء حساب ولي الأمر...');
 try{
  const cred=await P.auth.createUserWithEmailAndPassword(parentLoginEmail(phone),password);
  await cred.user.updateProfile?.({displayName:name});
  const ts=Date.now();
  await P.db.ref().update({
    ['parentProfilesV4/'+cred.user.uid]:{name,phone,loginMethod:'phone',createdAt:ts,updatedAt:ts},
    ['phoneDirectoryV4/parents/'+cred.user.uid]:{uid:cred.user.uid,name,phone,updatedAt:ts}
  });
  authMessage('');
 }catch(err){console.error(err);authMessage(err?.code==='auth/email-already-in-use'?'هذا الرقم مسجل بالفعل. اضغط دخول ولي الأمر.':err.message||'تعذر إنشاء الحساب.')}
};
$('parentLogout').onclick=()=>P.auth.signOut();
$('linkBtn').onclick=async()=>{
 const code=$('parentInvite').value.trim();
 if(!code)return linkMessage('اكتب كود الطالب أولًا.',false);
 try{linkMessage('جاري ربط الطالب...');await P.linkParent(code);$('parentInvite').value='';linkMessage('تم ربط الطالب بالكود بنجاح ✅');await loadChildren(P.auth.currentUser)}
 catch(e){console.error(e);linkMessage(e.message||'تعذر الربط بالكود.',false)}
};
$('linkByPhoneBtn').onclick=async()=>{
 const raw=$('studentPhoneLink').value.trim();
 if(!raw)return linkMessage('اكتب رقم هاتف الطالب أولًا.',false);
 try{linkMessage('جاري البحث عن الطالب وربطه...');await P.linkParentByPhone(raw);$('studentPhoneLink').value='';linkMessage('تم العثور على الطالب وربطه بحسابك ✅');await loadChildren(P.auth.currentUser)}
 catch(e){console.error(e);linkMessage(e.message||'تعذر العثور على الطالب.',false)}
};
P.auth.onAuthStateChanged(async u=>{
 if(!u){showAuth(false);return}
 try{
  const parentSnap=await P.db.ref('parentProfilesV4/'+u.uid).once('value');
  const parentProfile=parentSnap.val()||{};
  if(parentSnap.exists()&&parentProfile.phone){
   P.db.ref('phoneDirectoryV4/parents/'+u.uid).set({uid:u.uid,name:parentProfile.name||u.displayName||'',phone:parentProfile.phone,updatedAt:Date.now()}).catch(()=>{});
  }
  if(!parentSnap.exists()){
   await P.auth.signOut();
   showAuth(false);authMessage('هذا ليس حساب ولي أمر. سجّل الدخول برقم ولي الأمر أو أنشئ حسابًا جديدًا.');
   return;
  }
  showAuth(true);authMessage('');await loadChildren(u);
 }catch(err){console.error(err);showAuth(false);authMessage('تعذر تحميل حساب ولي الأمر الآن.')}
});
})();