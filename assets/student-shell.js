(() => {
'use strict';
window.AcademyStudentShell=true;
let moreCleanup=null;

const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
const groups={
  home:['index.html',''],
  learn:['subject.html','lesson.html','explore.html','search.html'],
  plan:['planner.html','schedule.html','assignments.html','weekly-report.html','progress.html'],
  profile:['profile.html'],
  more:['library.html','exam-center.html','simulations.html','community.html','leaderboard.html','challenges.html','notifications.html','support.html','subscription.html','live.html','news.html']
};
function activeFor(key){return groups[key]?.includes(path)}

function closeMore(){
  moreCleanup?.();moreCleanup=null;
  const backdrop=document.querySelector('.student-more-backdrop');
  const sheet=document.querySelector('.student-more-sheet');
  if(!backdrop||!sheet)return;
  backdrop.classList.remove('show');sheet.classList.remove('show');
  document.body.classList.remove('student-more-open');
  setTimeout(()=>{backdrop.remove();sheet.remove()},180);
}
function openMore(trigger){
  closeMore();
  const backdrop=document.createElement('div');
  backdrop.className='student-more-backdrop';
  const sheet=document.createElement('section');
  sheet.className='student-more-sheet';
  sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','المزيد من خدمات المنصة');
  sheet.innerHTML=`
    <div class="student-more-head">
      <div><span>كل الأدوات في مكان واحد</span><strong>المزيد</strong></div>
      <button type="button" class="student-more-close" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="student-more-grid">
      <a href="./exam-center.html"><i class="fa-regular fa-circle-check"></i><span><strong>الاختبارات</strong><small>اختبر نفسك</small></span></a>
      <a href="./assignments.html"><i class="fa-solid fa-clipboard-check"></i><span><strong>الواجبات</strong><small>المطلوب والتسليم</small></span></a>
      <a href="./schedule.html"><i class="fa-regular fa-calendar-days"></i><span><strong>الجدول</strong><small>الحصص والمواعيد</small></span></a>
      <a href="./progress.html"><i class="fa-solid fa-chart-line"></i><span><strong>التقدم</strong><small>نتائجك ونشاطك</small></span></a>
      <a href="./library.html"><i class="fa-solid fa-folder-open"></i><span><strong>المكتبة</strong><small>ملفات ومراجع</small></span></a>
      <a href="./live.html"><i class="fa-solid fa-tower-broadcast"></i><span><strong>البث</strong><small>الجلسات المباشرة</small></span></a>
      <a href="./notifications.html"><i class="fa-regular fa-bell"></i><span><strong>الإشعارات والرسائل</strong><small>الردود والإعلانات والتحديثات</small></span></a>\n      <a href="./support.html"><i class="fa-solid fa-headset"></i><span><strong>الدعم والشكاوى</strong><small>تذكرة أو بلاغ عن المحتوى</small></span></a>
      <a href="./subscription.html"><i class="fa-solid fa-crown"></i><span><strong>الاشتراك والباقات</strong><small>باقتك وصلاحية الوصول</small></span></a>
      <a href="./community.html"><i class="fa-solid fa-users"></i><span><strong>المجتمع</strong><small>المنتدى والمجموعات</small></span></a>
      <a href="./leaderboard.html"><i class="fa-solid fa-ranking-star"></i><span><strong>المتصدرون</strong><small>الترتيب والدوريات</small></span></a>\n      <a href="./challenges.html"><i class="fa-solid fa-trophy"></i><span><strong>التحديات</strong><small>مهام ومكافآت وشارات</small></span></a>
      <a href="./weekly-report.html"><i class="fa-solid fa-chart-column"></i><span><strong>تقريري</strong><small>ملخص الأسبوع</small></span></a>
      <a href="./explore.html"><i class="fa-regular fa-compass"></i><span><strong>استكشف</strong><small>مراحل ومواد أخرى</small></span></a>
    </div>`;
  document.body.append(backdrop,sheet);
  document.body.classList.add('student-more-open');
  requestAnimationFrame(()=>{backdrop.classList.add('show');sheet.classList.add('show');sheet.querySelector('.student-more-close')?.focus()});
  backdrop.onclick=closeMore;
  sheet.querySelector('.student-more-close')?.addEventListener('click',closeMore);
  sheet.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMore));
  const onKey=e=>{
    if(e.key==='Escape'){closeMore();document.removeEventListener('keydown',onKey);setTimeout(()=>trigger?.focus(),0)}
  };
  document.addEventListener('keydown',onKey);
  moreCleanup=()=>{document.removeEventListener('keydown',onKey);if(trigger?.isConnected)trigger.focus()};
}

function injectMobileNav(){
  if(document.querySelector('.student-mobile-nav'))return;
  if(document.body.classList.contains('admin-v3-body')||document.body.classList.contains('teacher-v3-body'))return;
  const nav=document.createElement('nav');
  nav.className='student-mobile-nav simplified-student-nav';
  nav.setAttribute('aria-label','التنقل الرئيسي');
  const item=(href,key,icon,label)=>'<a href="'+href+'" class="'+(activeFor(key)?'active':'')+'" '+(activeFor(key)?'aria-current="page"':'')+'><i class="'+icon+'"></i><span>'+label+'</span></a>';
  nav.innerHTML=
    item('./index.html','home','fa-solid fa-house','الرئيسية')+
    item('./index.html#studentSubjects','learn','fa-solid fa-book-open','موادي')+
    item('./planner.html','plan','fa-regular fa-calendar-check','خطتي')+
    item('./profile.html','profile','fa-regular fa-user','حسابي')+
    '<button type="button" class="'+(activeFor('more')?'active':'')+'" id="studentMoreNavBtn"><i class="fa-solid fa-ellipsis"></i><span>المزيد</span></button>';
  document.body.appendChild(nav);
  const more=nav.querySelector('#studentMoreNavBtn');
  more?.addEventListener('click',()=>openMore(more));
}
function injectIndexNavWhenReady(){
  const dash=document.getElementById('studentDashboard');
  if(!dash){injectMobileNav();return}
  const sync=()=>{
    if(!dash.classList.contains('hidden'))injectMobileNav();
    else{document.querySelector('.student-mobile-nav')?.remove();closeMore()}
  };
  sync();new MutationObserver(sync).observe(dash,{attributes:true,attributeFilter:['class']});
}
function enhancePageAvatar(){
  const avatar=document.getElementById('pageAvatar');if(!avatar||avatar.dataset.profileShortcut==='1')return;
  avatar.dataset.profileShortcut='1';avatar.classList.add('student-profile-shortcut');
  avatar.setAttribute('role','link');avatar.setAttribute('tabindex','0');avatar.setAttribute('title','فتح حسابي');avatar.setAttribute('aria-label','فتح حسابي');
  const go=()=>location.href='./profile.html';
  avatar.addEventListener('click',go);
  avatar.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
}
function addBackButton(){
  const nav=document.querySelector('.learning-nav');
  if(!nav||nav.querySelector('.student-back-button')||path==='index.html'||path==='')return;
  const btn=document.createElement('button');
  btn.className='student-back-button';btn.type='button';btn.setAttribute('aria-label','رجوع');
  btn.innerHTML='<i class="fa-solid fa-arrow-right"></i>';
  btn.onclick=()=>{
    let sameOrigin=false;
    try{sameOrigin=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch{}
    if(sameOrigin&&history.length>1)history.back();else location.href='./index.html';
  };
  nav.prepend(btn);
}
function loadStudentScript(src,flag){
  if(flag&&window[flag])return Promise.resolve();
  const existing=[...document.scripts].find(s=>s.src&&s.src.includes(src.replace('./','')));
  if(existing)return new Promise(resolve=>{if(flag&&window[flag])return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',resolve,{once:true});setTimeout(resolve,1200)});
  return new Promise(resolve=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=resolve;document.body.appendChild(s)});
}
function injectNotificationButton(){
  if(path==='notifications.html'||path==='index.html'||path==='')return;
  const wrap=document.querySelector('.learning-user');if(!wrap||wrap.querySelector('.student-notification-trigger'))return;
  const btn=document.createElement('button');btn.type='button';btn.className='icon-btn student-notification-trigger';btn.setAttribute('aria-label','الإشعارات');btn.innerHTML='<i class="fa-regular fa-bell"></i>';
  const avatar=wrap.querySelector('#pageAvatar,.avatar');if(avatar)wrap.insertBefore(btn,avatar);else wrap.prepend(btn);
}
async function initGlobalNotifications(){
  injectNotificationButton();
  if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
  if(!window.AcademyNotifications)await loadStudentScript('./assets/notification-engine.js?v=2','AcademyNotifications');
  if(!window.AcademyNotificationWidget)await loadStudentScript('./assets/notification-widget.js?v=2','AcademyNotificationWidget');
}

document.addEventListener('click',e=>{
  const link=e.target.closest?.('a[href*="subject.html"]');if(!link)return;
  try{
    const u=new URL(link.href,location.href),subject=u.searchParams.get('subject');if(!subject)return;
    sessionStorage.setItem('academy:lastSubjectContext',JSON.stringify({type:u.searchParams.get('type')||'public',stage:u.searchParams.get('stage')||'',grade:u.searchParams.get('grade')||'',subject,at:Date.now()}));
  }catch{}
},true);

document.addEventListener('DOMContentLoaded',()=>{
  if(path==='index.html'||path==='')injectIndexNavWhenReady();else injectMobileNav();
  addBackButton();enhancePageAvatar();initGlobalNotifications();
});
})();
