(() => {
'use strict';
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function enhanceAccessibility(){
  document.querySelectorAll('button[title],a[title]').forEach(el=>{
    if(!el.hasAttribute('aria-label'))el.setAttribute('aria-label',el.getAttribute('title'));
  });
  document.querySelectorAll('.modal-panel,.admin-modal,.teacher-grade-modal,.live-viewer-panel').forEach(el=>{
    el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
  });
  document.querySelectorAll('.feature-tabs,.lesson-tabs').forEach(list=>{
    list.setAttribute('role','tablist');
    [...list.querySelectorAll('button')].forEach(btn=>{
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected',btn.classList.contains('active')?'true':'false');
      btn.addEventListener('click',()=>{
        [...list.querySelectorAll('button')].forEach(x=>x.setAttribute('aria-selected',x.classList.contains('active')?'true':'false'));
      });
    });
  });
  const groups=[
    ['[data-profile-tab]','profile'],
    ['[data-admin-tab]','admin'],
    ['[data-teacher-tab]','teacher']
  ];
  groups.forEach(([selector])=>{
    const items=[...document.querySelectorAll(selector)];
    items.forEach(btn=>{
      if(btn.classList.contains('active'))btn.setAttribute('aria-current','page');
      btn.addEventListener('click',()=>requestAnimationFrame(()=>{
        items.forEach(x=>{
          if(x.classList.contains('active'))x.setAttribute('aria-current','page');
          else x.removeAttribute('aria-current');
        });
      }));
    });
  });
}
function enhanceStudentShell(){
  if(document.body.classList.contains('admin-v3-body')||document.body.classList.contains('teacher-v3-body'))return;
  const header=document.querySelector('.learning-header .learning-nav');
  if(!header)return;

  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();

  if(!header.querySelector('.student-back-button')){
    const back=document.createElement('button');
    back.type='button';back.className='student-back-button';back.setAttribute('aria-label','رجوع');back.title='رجوع';
    back.innerHTML='<i class="fa-solid fa-arrow-right"></i>';
    back.onclick=()=>{if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1)history.back();else location.href='./index.html'};
    header.prepend(back);
  }

  let avatar=header.querySelector('#pageAvatar,.avatar');
  if(avatar&&!window.AcademyStudentShell){
    avatar.classList.add('student-profile-shortcut');
    avatar.setAttribute('role','link');avatar.setAttribute('tabindex','0');avatar.setAttribute('aria-label','فتح حسابي');avatar.title='حسابي';
    const openProfile=()=>location.href='./profile.html';
    avatar.addEventListener('click',openProfile);
    avatar.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile()}});
  }

  let userWrap=header.querySelector('.learning-user');
  if(!userWrap && avatar){
    userWrap=document.createElement('div');userWrap.className='learning-user';
    avatar.parentNode.insertBefore(userWrap,avatar);userWrap.appendChild(avatar);
  }
  if(userWrap && !window.AcademyStudentShell && !userWrap.querySelector('.student-notification-shortcut,.student-notification-trigger')){
    const bell=document.createElement('a');bell.className='icon-btn student-notification-shortcut';bell.href='./notifications.html';bell.title='الإشعارات';bell.setAttribute('aria-label','الإشعارات');
    bell.innerHTML='<i class="fa-regular fa-bell"></i>';
    userWrap.insertBefore(bell,userWrap.firstChild);
  }

  if(!window.AcademyStudentShell&&!document.querySelector('.student-mobile-nav')){
    const nav=document.createElement('nav');nav.className='student-mobile-nav';nav.setAttribute('aria-label','التنقل الرئيسي للطالب');
    const items=[
      {key:'home',href:'./index.html',icon:'fa-house',label:'الرئيسية'},
      {key:'subjects',href:'./explore.html',icon:'fa-book-open',label:'المواد'},
      {key:'assignments',href:'./assignments.html',icon:'fa-clipboard-check',label:'الواجبات'},
      {key:'tests',href:'./exam-center.html',icon:'fa-circle-check',label:'الاختبارات'},
      {key:'profile',href:'./profile.html',icon:'fa-user',label:'حسابي'}
    ];
    let active='home';
    if(['subject.html','lesson.html','explore.html','library.html'].includes(page))active='subjects';
    else if(page==='assignments.html')active='assignments';
    else if(['exam-center.html','simulations.html'].includes(page))active='tests';
    else if(page==='profile.html')active='profile';
    nav.innerHTML=items.map(x=>'<a href="'+x.href+'" class="'+(x.key===active?'active':'')+'" aria-label="'+x.label+'"><i class="fa-solid '+x.icon+'"></i><span>'+x.label+'</span></a>').join('');
    document.body.appendChild(nav);
  }
}

function ensureRouteProgress(){
  let bar=document.querySelector('.ui-route-progress');
  if(!bar){bar=document.createElement('div');bar.className='ui-route-progress';document.body.appendChild(bar)}
  return bar;
}
function startRouteProgress(){
  const bar=ensureRouteProgress();bar.classList.add('show');bar.style.width='18%';
  requestAnimationFrame(()=>bar.style.width='72%');
}
function finishRouteProgress(){
  const bar=document.querySelector('.ui-route-progress');if(!bar)return;
  bar.style.width='100%';setTimeout(()=>{bar.classList.remove('show');bar.style.width='0'},180);
}
let closeActiveConfirm=null;
function confirmDialog(options={}){
  const opts=typeof options==='string'?{message:options}:options;
  closeActiveConfirm?.(false);
  return new Promise(resolve=>{
    const trigger=document.activeElement,previousOverflow=document.body.style.overflow;
    const wrap=document.createElement('div');wrap.className='ui-confirm-backdrop';
    wrap.innerHTML='<div class="ui-confirm-card" role="dialog" aria-modal="true" aria-labelledby="uiConfirmTitle" aria-describedby="uiConfirmMessage">'+
      '<div class="ui-confirm-icon"><i class="fa-solid fa-circle-question"></i></div>'+
      '<h3 id="uiConfirmTitle">'+esc(opts.title||'هل أنت متأكد؟')+'</h3><p id="uiConfirmMessage">'+esc(opts.message||'')+'</p>'+
      '<div class="ui-confirm-actions"><button class="ui-confirm-cancel">'+esc(opts.cancelText||'إلغاء')+'</button><button class="ui-confirm-accept">'+esc(opts.acceptText||'تأكيد')+'</button></div></div>';
    wrap.querySelector('.ui-confirm-card').classList.add(['danger','warning','success'].includes(opts.tone)?opts.tone:'danger');
    document.body.appendChild(wrap);document.body.style.overflow='hidden';
    let finished=false;
    const finish=value=>{
      if(finished)return;finished=true;document.removeEventListener('keydown',key);
      wrap.remove();document.body.style.overflow=previousOverflow;closeActiveConfirm=null;
      if(trigger?.isConnected)trigger.focus();resolve(value);
    };
    const cancel=wrap.querySelector('.ui-confirm-cancel'),accept=wrap.querySelector('.ui-confirm-accept');
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}
      if(e.key==='Tab'){e.preventDefault();(document.activeElement===cancel?accept:cancel).focus()}
    };
    closeActiveConfirm=finish;cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);
    wrap.onclick=e=>{if(e.target===wrap)finish(false)};
    document.addEventListener('keydown',key);
    requestAnimationFrame(()=>{if(!finished){wrap.classList.add('show');cancel.focus()}});
  });
}
function showNetworkBanner(online){
  let banner=document.querySelector('.ui-network-banner');
  if(!banner){banner=document.createElement('div');banner.className='ui-network-banner';document.body.appendChild(banner)}
  banner.className='ui-network-banner '+(online?'online':'offline');
  banner.innerHTML=online?'<i class="fa-solid fa-wifi"></i><span>رجع الاتصال بالإنترنت</span>':'<i class="fa-solid fa-wifi-slash"></i><span>أنت غير متصل بالإنترنت. بعض البيانات قد لا تتحدث.</span>';
  requestAnimationFrame(()=>banner.classList.add('show'));
  clearTimeout(showNetworkBanner.t);
  showNetworkBanner.t=setTimeout(()=>banner.classList.remove('show'),online?2200:5200);
}
function emptyStateHtml(title='لا توجد بيانات',text='',icon='fa-inbox',actionHtml=''){
  return '<div class="ui-empty-state"><span class="ui-empty-icon"><i class="fa-solid '+esc(icon)+'"></i></span><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+actionHtml+'</div>';
}
function errorStateHtml(title='تعذر تحميل البيانات',text='حاول مرة أخرى بعد قليل.',actionHtml=''){
  return '<div class="ui-error-state"><span class="ui-error-icon"><i class="fa-solid fa-triangle-exclamation"></i></span><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+actionHtml+'</div>';
}
function showPageLoading(message='جاري تجهيز الصفحة...'){
  clearTimeout(hidePageLoading.timer);
  let wrap=document.querySelector('.ui-page-loader');
  if(!wrap){
    wrap=document.createElement('div');wrap.className='ui-page-loader';
    wrap.innerHTML='<div class="ui-page-loader-card"><span class="ui-page-loader-mark"><i class="fa-solid fa-book-open"></i></span><strong>الأكاديمية</strong><p class="ui-page-loader-text"></p><span class="ui-loader-line"><i></i></span></div>';
    document.body.appendChild(wrap);
  }
  wrap.querySelector('.ui-page-loader-text').textContent=message;
  requestAnimationFrame(()=>wrap.classList.add('show'));
}
function hidePageLoading(){
  const wrap=document.querySelector('.ui-page-loader');if(!wrap)return;
  wrap.classList.remove('show');clearTimeout(hidePageLoading.timer);hidePageLoading.timer=setTimeout(()=>wrap.remove(),220);
}
function setButtonLoading(button,on,label='جاري التنفيذ...'){
  if(!button)return;
  if(on){
    if(!button.dataset.uiOriginalHtml)button.dataset.uiOriginalHtml=button.innerHTML;
    button.disabled=true;button.innerHTML='<span class="ui-loading-dots"><i></i><i></i><i></i></span> '+esc(label);
  }else{
    button.disabled=false;if(button.dataset.uiOriginalHtml){button.innerHTML=button.dataset.uiOriginalHtml;delete button.dataset.uiOriginalHtml}
  }
}
document.addEventListener('pointerdown',e=>{
  const btn=e.target.closest('.btn,button,.icon-btn');
  if(!btn||btn.disabled||btn.classList.contains('no-ripple')||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  btn.classList.add('ui-ripple-host');
  const r=btn.getBoundingClientRect(),size=Math.max(r.width,r.height)*.65,span=document.createElement('span');
  span.className='ui-ripple';span.style.width=span.style.height=size+'px';span.style.left=(e.clientX-r.left-size/2)+'px';span.style.top=(e.clientY-r.top-size/2)+'px';
  btn.appendChild(span);setTimeout(()=>span.remove(),520);
},{passive:true});
document.addEventListener('DOMContentLoaded',()=>{document.body?.classList.add('ui-page-enter');finishRouteProgress();enhanceAccessibility();enhanceStudentShell();if(!navigator.onLine)showNetworkBanner(false)});
window.addEventListener('offline',()=>showNetworkBanner(false));
window.addEventListener('online',()=>showNetworkBanner(true));
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a)return;
  const href=a.getAttribute('href')||'';
  if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0||a.target==='_blank'||a.hasAttribute('download')||href.startsWith('#')||href.startsWith('javascript:')||href.startsWith('mailto:')||href.startsWith('tel:'))return;
  try{
    const url=new URL(href,location.href);
    if(url.origin===location.origin)startRouteProgress();
  }catch{}
},true);
window.addEventListener('pageshow',finishRouteProgress);

function imageFallback(img){
  if(!(img instanceof HTMLImageElement)||!img.matches('[data-subject-image]'))return;
  const fallback=document.createElement('span');fallback.textContent=img.dataset.fallback||'📚';
  img.closest('.has-image')?.classList.remove('has-image');img.replaceWith(fallback);
}
document.addEventListener('error',e=>imageFallback(e.target),true);
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('img[data-subject-image]').forEach(img=>{if(img.complete&&!img.naturalWidth)imageFallback(img)});
  const target=document.querySelector('main');
  if(target){
    if(!target.id)target.id='mainContent';target.setAttribute('tabindex','-1');
    let skip=document.querySelector('.ui-skip-link,.suite-skip-link');
    if(!skip){skip=document.createElement('a');skip.textContent='تخطي إلى المحتوى';document.body.prepend(skip)}
    skip.classList.add('ui-skip-link');skip.href='#'+target.id;
  }
});
// Trap keyboard focus inside the topmost open dialog, including dynamically inserted dialogs.
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(d=>d.getClientRects().length&&!d.closest('.hidden'));
  const dialog=dialogs[dialogs.length-1];if(!dialog)return;
  const nodes=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&x.getClientRects().length);
  if(!nodes.length){e.preventDefault();dialog.setAttribute('tabindex','-1');dialog.focus();return}
  const first=nodes[0],last=nodes[nodes.length-1];
  if(!dialog.contains(document.activeElement)){e.preventDefault();first.focus()}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});

window.AcademyUI={confirm:confirmDialog,setButtonLoading,showPageLoading,hidePageLoading,emptyStateHtml,errorStateHtml,showNetworkBanner,esc,startRouteProgress,finishRouteProgress};
})();
