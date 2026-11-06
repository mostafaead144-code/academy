(() => {
'use strict';
const C=window.AcademyCore,N=window.AcademyNotifications,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,items=[],filter='all',refreshTimer=null,loading=false;

function relative(ts){
  const delta=Number(ts||0)-Date.now(),abs=Math.abs(delta),future=delta>60000;
  if(abs<60000)return'الآن';
  const value=abs<3600000?Math.max(1,Math.round(abs/60000))+' دقيقة':abs<86400000?Math.max(1,Math.round(abs/3600000))+' ساعة':abs<7*86400000?Math.max(1,Math.round(abs/86400000))+' يوم':new Date(ts).toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
  return future?'بعد '+value:'منذ '+value;
}
function labelForFilter(f){
  return{
    all:'كل الإشعارات',unread:'غير المقروء',assignments:'الواجبات',live:'البث والجلسات',
    content:'المحتوى الجديد',teacher:'رسائل المدرسين',system:'إشعارات الإدارة'
  }[f]||'الإشعارات';
}
function filterHint(f){
  return{
    all:'مرتبة حسب الأهمية ثم الأحدث.',
    unread:'الإشعارات التي لم تفتحها بعد.',
    assignments:'الواجبات الجديدة والمتأخرة ونتائج التصحيح.',
    live:'الجلسات المباشرة والمواعيد القريبة للبث.',
    content:'الدروس والاختبارات والملفات الجديدة.',
    teacher:'الرسائل التي اعتمدتها الإدارة من مدرسيك.',
    system:'إعلانات وإشعارات إدارة الأكاديمية.'
  }[f]||'';
}
function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d.getTime()}
function filtered(){
  const q=($('notificationSearch')?.value||'').trim().toLowerCase();
  let list=items;
  if(filter==='unread')list=list.filter(x=>!x.read);
  else if(filter!=='all')list=list.filter(x=>x.group===filter);
  if(q)list=list.filter(x=>[x.title,x.text,x.sourceName,x.kind,x.group].filter(Boolean).join(' ').toLowerCase().includes(q));
  return list;
}
function counts(group){return items.filter(x=>x.group===group).length}
function renderHero(){
  const unread=items.filter(x=>!x.read),urgent=unread.filter(x=>x.priority==='urgent'),today=items.filter(x=>Number(x.createdAt||0)>=todayStart());
  if($('notificationHeroUnread'))$('notificationHeroUnread').textContent=unread.length;
  if($('notificationHeroUrgent'))$('notificationHeroUrgent').textContent=urgent.length;
  if($('notificationHeroToday'))$('notificationHeroToday').textContent=today.length;
  const pick=urgent[0]||unread.find(x=>x.priority==='high')||unread[0]||items[0]||null;
  if($('notificationHeroPriority'))$('notificationHeroPriority').textContent=pick?(pick.priority==='urgent'?'عاجل':pick.priority==='high'?'مهم':'تحديث'):'كل شيء هادئ';
  if($('notificationHeroTitle'))$('notificationHeroTitle').textContent=pick?(pick.title||'إشعار'):'لا يوجد شيء عاجل';
  if($('notificationHeroMessage'))$('notificationHeroMessage').textContent=pick?(pick.text||'اضغط لعرض التفاصيل.'):'أنت متابع كل التحديثات المهمة حاليًا.';
  const btn=$('notificationHeroOpenBtn');
  if(btn){
    btn.disabled=!pick;
    btn.innerHTML=pick?'فتح الإشعار <i class="fa-solid fa-arrow-left"></i>':'لا يوجد تنبيه <i class="fa-solid fa-check"></i>';
    btn.onclick=()=>{if(pick)openNotification(pick.key,pick.href||'./notifications.html',btn)};
  }
}
function renderStats(){
  const unread=items.filter(x=>!x.read).length,urgent=items.filter(x=>!x.read&&x.priority==='urgent').length;
  $('notificationTotal').textContent=items.length;
  $('notificationUnread').textContent=unread;
  if($('notificationUrgent'))$('notificationUrgent').textContent=urgent;
  if($('notificationAssignments'))$('notificationAssignments').textContent=counts('assignments');
  if($('notificationLive'))$('notificationLive').textContent=counts('live');
  if($('notificationContent'))$('notificationContent').textContent=counts('content');
  $('filterCountAll').textContent=items.length;
  $('filterCountUnread').textContent=unread;
  if($('filterCountAssignments'))$('filterCountAssignments').textContent=counts('assignments');
  if($('filterCountLive'))$('filterCountLive').textContent=counts('live');
  if($('filterCountContent'))$('filterCountContent').textContent=counts('content');
  if($('filterCountTeacher'))$('filterCountTeacher').textContent=counts('teacher');
  if($('filterCountSystem'))$('filterCountSystem').textContent=counts('system');
  renderHero();
}
function groupLabel(n){
  return{
    assignments:'واجبات',live:'بث مباشر',content:'محتوى',teacher:'المدرس',system:'الإدارة',
    schedule:'موعد',study:'خطة ومراجعة'
  }[n.group]||'الأكاديمية';
}
function actionLabel(n){
  if(n.kind==='assignment')return n.title.includes('تصحيح')?'عرض النتيجة':'فتح الواجب';
  if(n.kind==='live')return'فتح الجلسة';
  if(n.kind==='file')return'فتح الملف';
  if(n.kind==='lesson')return'فتح الدرس';
  if(n.kind==='quiz')return'فتح الاختبار';
  return'فتح';
}
function cardHtml(n){
  const open=n.href?'<button class="notification-open-btn" data-open-notification="'+C.esc(n.key)+'" data-href="'+C.esc(n.href)+'">'+actionLabel(n)+' <i class="fa-solid fa-arrow-left"></i></button>':'';
  const fresh=n.read?'':'<span class="notification-new-dot">جديد</span>';
  const source=n.sourceName?'<span><i class="fa-solid fa-user"></i> '+C.esc(n.sourceName)+'</span>':'';
  const priority=n.priority==='urgent'?'<b class="notification-priority urgent">عاجل</b>':n.priority==='high'?'<b class="notification-priority high">مهم</b>':'';
  return '<article class="notification-center-item notification-center-item-v11 '+(n.read?'read':'unread')+' priority-'+C.esc(n.priority||'normal')+'" data-notification-key="'+C.esc(n.key)+'">'+
    '<span class="notification-center-icon tone-'+C.esc(n.tone||'blue')+'"><i class="fa-solid '+C.esc(n.icon||'fa-bell')+'"></i></span>'+
    '<div class="notification-center-copy">'+
      '<div class="notification-center-title-row"><h3>'+C.esc(n.title||'إشعار')+'</h3>'+fresh+priority+'</div>'+
      '<p>'+C.esc(n.text||'')+'</p>'+
      '<div class="notification-center-meta"><span><i class="fa-regular fa-clock"></i> '+relative(n.createdAt)+'</span><span><i class="fa-solid fa-tag"></i> '+groupLabel(n)+'</span>'+source+'</div>'+
    '</div>'+
    '<div class="notification-center-actions">'+open+
      '<button class="notification-read-btn" data-toggle-read="'+C.esc(n.key)+'"><i class="fa-solid '+(n.read?'fa-envelope':'fa-check')+'"></i> '+(n.read?'غير مقروء':'تمت القراءة')+'</button>'+
    '</div>'+
  '</article>';
}
function render(){
  renderStats();
  const list=filtered();
  $('notificationListTitle').textContent=labelForFilter(filter);
  if($('notificationListHint'))$('notificationListHint').textContent=filterHint(filter);
  $('notificationMeta').textContent=list.length+' إشعار';
  $('markAllNotifications').disabled=!items.some(x=>!x.read);
  $('notificationList').innerHTML=list.length?list.map(cardHtml).join(''):'<div class="feature-empty notification-empty-v11"><span>🔕</span><h3>مفيش إشعارات هنا</h3><p>لما يكون فيه تحديث مناسب للفئة دي هيظهر تلقائيًا.</p></div>';
  $$('[data-toggle-read]').forEach(b=>b.onclick=()=>toggleRead(b.dataset.toggleRead,b));
  $$('[data-open-notification]').forEach(b=>b.onclick=()=>openNotification(b.dataset.openNotification,b.dataset.href,b));
}
async function reload(silent=false){
  if(loading||!user||document.hidden||!navigator.onLine)return;
  loading=true;
  try{
    const result=await N.loadNotifications(user);
    profile=result.profile;items=result.items;render();
  }catch(err){
    console.error(err);
    if(!silent)C.toast('تعذر تحديث الإشعارات الآن.','error');
  }finally{loading=false}
}
async function toggleRead(key,btn){
  const item=items.find(x=>x.key===key);if(!item)return;
  btn.disabled=true;
  try{
    if(item.read)await N.markUnread(user.uid,key);else await N.markRead(user.uid,key);
    item.read=!item.read;render();
  }catch(err){
    console.error(err);btn.disabled=false;C.toast('تعذر تحديث حالة الإشعار الآن.','error');
  }
}
async function openNotification(key,href,btn){
  const item=items.find(x=>x.key===key);if(btn)btn.disabled=true;
  try{
    if(item&&!item.read){await N.markRead(user.uid,key);item.read=true}
    const safe=C.safeUrl(href||'./index.html'),target=safe&&safe!=='#'?safe:'./index.html';
    location.href=target;
  }catch(err){
    console.error(err);if(btn)btn.disabled=false;C.toast('تعذر فتح الإشعار الآن.','error');
  }
}
$('markAllNotifications').onclick=async()=>{
  const btn=$('markAllNotifications');
  window.AcademyUI?.setButtonLoading(btn,true,'تعليم');
  try{
    await N.markAllRead(user.uid,items);
    items.forEach(x=>x.read=true);render();C.toast('تم تعليم كل الإشعارات كمقروءة ✅');
  }catch(err){
    console.error(err);C.toast('تعذر تحديث كل الإشعارات الآن.','error');
  }finally{window.AcademyUI?.setButtonLoading(btn,false)}
};
function setFilter(next){
  filter=next||'all';
  $$('[data-notification-filter]').forEach(x=>{const active=x.dataset.notificationFilter===filter;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
  render();
}
$$('[data-notification-filter]').forEach(b=>b.onclick=()=>setFilter(b.dataset.notificationFilter));
if($('notificationSearch'))$('notificationSearch').oninput=render;
if($('notificationHeroUnreadBtn'))$('notificationHeroUnreadBtn').onclick=()=>setFilter('unread');
if($('notificationHeroAssignmentsBtn'))$('notificationHeroAssignmentsBtn').onclick=()=>setFilter('assignments');

(async()=>{
  window.AcademyUI?.showPageLoading('جاري جمع إشعاراتك وتحديثاتك...');
  try{
    ({user,profile}=await C.requireStudent());
    $('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
    if($('notificationStudentName'))$('notificationStudentName').textContent=profile.name||user.displayName||'طالبنا';
    if($('notificationHeroText'))$('notificationHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — كل ما يحتاج انتباهك في مكان واحد.';
    const requested=new URLSearchParams(location.search).get('filter');if(requested)setFilter(requested);
    await reload();
    refreshTimer=setInterval(()=>reload(true),60000);
  }catch(err){
    console.error(err);C.toast('تعذر تحميل الإشعارات الآن.','error');
    $('notificationList').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل الإشعارات','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
  }finally{window.AcademyUI?.hidePageLoading()}
})();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload(true)});
window.addEventListener('pagehide',()=>clearInterval(refreshTimer));
})();