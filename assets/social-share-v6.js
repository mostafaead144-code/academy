(()=>{
'use strict';
if(window.__ACADEMY_SOCIAL_SHARE_V6__)return;window.__ACADEMY_SOCIAL_SHARE_V6__=true;
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const defs={
 whatsapp:{label:'واتساب',icon:'fa-brands fa-whatsapp'},
 facebook:{label:'فيسبوك',icon:'fa-brands fa-facebook-f'},
 telegram:{label:'تليجرام',icon:'fa-brands fa-telegram'},
 youtube:{label:'يوتيوب',icon:'fa-brands fa-youtube'},
 tiktok:{label:'تيك توك',icon:'fa-brands fa-tiktok'}
};
let socialCfg=null,observer=null,scanQueued=false,contentShareAllowed=true;
function ensureIcons(){if(document.querySelector('link[href*="font-awesome"],link[href*="fontawesome"]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';l.crossOrigin='anonymous';l.referrerPolicy='no-referrer';document.head.appendChild(l)}
ensureIcons();
const isAdmin=/\badmin(?:-pro)?\.html$/i.test(location.pathname);
const isTeacher=/\bteacher\.html$/i.test(location.pathname);
function currentTitle(){return (document.querySelector('h1')?.textContent||document.title||'منصة الأكاديمية').trim()}
function memberSession(){return ['[DEFAULT]','teacher-portal','admin-portal'].some(n=>localStorage.getItem('academy_hostinger_session:'+n)||sessionStorage.getItem('academy_hostinger_session:'+n))}
async function resolveSharePermission(){const t=localStorage.getItem('academy_hostinger_session:teacher-portal')||sessionStorage.getItem('academy_hostinger_session:teacher-portal')||'';if(!t||!window.AcademyBackend)return true;try{const me=await AcademyBackend.request('auth/me',{token:t}),uid=me?.user?.uid;if(!uid)return true;const r=await AcademyBackend.request('data',{token:t,query:{path:'teacherProfiles/'+uid+'/permissions/shareContent'}});contentShareAllowed=r.value!==false;return contentShareAllowed}catch{return true}}
function normalizeOfficial(id,url){let u=String(url||'').trim();if(!u)return'';if(id==='whatsapp'&&/^\+?\d[\d\s-]{7,}$/.test(u)){u='https://wa.me/'+u.replace(/\D/g,'')}if(!/^https?:\/\//i.test(u))u='https://'+u.replace(/^\/+/, '');try{return new URL(u).href}catch{return''}}
function renderOfficial(){document.getElementById('academySocialDockV6')?.remove();const c=socialCfg||{},logged=memberSession();if((logged&&c.showMembers===false)||(!logged&&c.showGuests===false))return;const active=Object.entries(defs).filter(([id])=>c[id]?.enabled===true&&normalizeOfficial(id,c[id]?.url)).sort((a,b)=>Number(c[a[0]]?.order||99)-Number(c[b[0]]?.order||99));if(!active.length)return;const dock=document.createElement('aside');dock.id='academySocialDockV6';dock.className='academy-social-dock-v6 '+(c.side==='right'?'is-right':'is-left')+' '+(c.style==='compact'?'is-compact':'is-floating');dock.setAttribute('aria-label','روابط التواصل الرسمية');dock.innerHTML=`<button type="button" class="academy-social-toggle-v6" aria-expanded="false" aria-label="تابع الأكاديمية"><i class="fa-solid fa-headset"></i><span>تابعنا</span></button><div class="academy-social-links-v6">${active.map(([id,d])=>`<a class="social-${id}" href="${esc(normalizeOfficial(id,c[id].url))}" target="_blank" rel="noopener noreferrer" aria-label="${d.label}" title="${d.label}"><i class="${d.icon}"></i><span>${d.label}</span></a>`).join('')}</div>`;document.body.appendChild(dock);const t=dock.querySelector('.academy-social-toggle-v6');t.onclick=()=>{const open=dock.classList.toggle('is-open');t.setAttribute('aria-expanded',String(open))};document.addEventListener('click',e=>{if(innerWidth<=720&&!dock.contains(e.target))dock.classList.remove('is-open')},{passive:true});
}
async function loadOfficial(){try{if(!window.AcademyBackend)return;const r=await AcademyBackend.request('data',{query:{path:'settings/socialLinksV6'}});socialCfg=r.value||{};renderOfficial()}catch(err){console.warn('social settings',err)}}
function cleanUrl(raw){try{return new URL(raw||location.href,location.href).href}catch{return location.href}}
function shareText(title,url){return `${title||'محتوى تعليمي'}\n${url}`}
async function copyText(txt){try{await navigator.clipboard.writeText(txt);return true}catch{const a=document.createElement('textarea');a.value=txt;a.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch{}a.remove();return ok}}
function openShare(channel,url,title){url=cleanUrl(url);title=String(title||currentTitle()).trim();const eu=encodeURIComponent(url),et=encodeURIComponent(title);if(channel==='whatsapp')window.open(`https://wa.me/?text=${encodeURIComponent(shareText(title,url))}`,'_blank','noopener');else if(channel==='telegram')window.open(`https://t.me/share/url?url=${eu}&text=${et}`,'_blank','noopener');else if(channel==='facebook')window.open(`https://www.facebook.com/sharer/sharer.php?u=${eu}`,'_blank','noopener');else if(channel==='copy')copyText(url).then(ok=>toast(ok?'تم نسخ الرابط':'تعذر نسخ الرابط',ok?'success':'error'));else if(channel==='native'&&navigator.share)navigator.share({title,text:title,url}).catch(()=>{});
}
function toast(msg,type='success'){let el=document.getElementById('academyShareToastV6');if(!el){el=document.createElement('div');el.id='academyShareToastV6';el.className='academy-share-toast-v6';document.body.appendChild(el)}el.textContent=msg;el.dataset.type=type;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2200)}
let shareTrigger=null;
function closeModal(){document.getElementById('academyShareModalV6')?.remove();document.body.classList.remove('academy-share-open-v6');if(shareTrigger?.isConnected)shareTrigger.focus();shareTrigger=null}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('academyShareModalV6'))closeModal()});
function showShare(url,title){closeModal();url=cleanUrl(url);title=String(title||currentTitle()).trim();const overlay=document.createElement('div');overlay.id='academyShareModalV6';overlay.className='academy-share-overlay-v6';overlay.innerHTML=`<section class="academy-share-modal-v6" role="dialog" aria-modal="true" aria-label="مشاركة المحتوى"><button class="academy-share-close-v6" type="button" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button><div class="academy-share-icon-v6"><i class="fa-solid fa-share-nodes"></i></div><span class="section-kicker">مشاركة مباشرة</span><h3>${esc(title)}</h3><p>شارك المحتوى مع زملائك أو انسخ الرابط.</p><div class="academy-share-channels-v6"><button data-channel="whatsapp"><i class="fa-brands fa-whatsapp"></i><span>واتساب</span></button><button data-channel="facebook"><i class="fa-brands fa-facebook-f"></i><span>فيسبوك</span></button><button data-channel="telegram"><i class="fa-brands fa-telegram"></i><span>تليجرام</span></button>${navigator.share?'<button data-channel="native"><i class="fa-solid fa-arrow-up-from-bracket"></i><span>المشاركة</span></button>':''}<button data-channel="copy"><i class="fa-solid fa-link"></i><span>نسخ الرابط</span></button></div><div class="academy-share-url-v6" dir="ltr">${esc(url)}</div></section>`;shareTrigger=document.activeElement;document.body.appendChild(overlay);document.body.classList.add('academy-share-open-v6');overlay.querySelector('.academy-share-close-v6').focus();overlay.querySelector('.academy-share-close-v6').onclick=closeModal;overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal()});overlay.querySelectorAll('[data-channel]').forEach(b=>b.onclick=()=>openShare(b.dataset.channel,url,title));
}
window.AcademyShareV6={share:showShare,open:showShare,copy:url=>copyText(cleanUrl(url))};
const cardLinks='.student-subject-card-v2,.ref-subject-card,.mix-recommended-card,.smart-plan-card-v13,.teacher-public-card,.explorer-subject-item';
const contentCards='article,.library-card,.exam-card,.news-card,.teacher-card,.file-card,.quiz-card,.lesson-card,.subject-card,.content-card,.card';
const excludedAreas='header,nav,footer,.bottom-nav,.side-nav,.student-nav,.portal-nav,.student-more-sheet,.academy-more-menu,.learning-breadcrumb,.breadcrumb,.growth-surface,.learning-sidebar,.lesson-sidebar,.subject-path-track,.subject-unit-strip,.subject-hero-actions-v4,.academy-social-dock-v6,.academy-share-modal-v6';
function titleForAnchor(a){return (a.dataset.shareTitle||a.querySelector('h2,h3,h4,strong,.title,.subject-name,.lesson-title')?.textContent||a.getAttribute('aria-label')||a.textContent||document.title).replace(/\s+/g,' ').trim().slice(0,160)}
function eligibleAnchor(a){
 if(!a?.href||a.dataset.v6ShareBound==='1'||a.closest(excludedAreas)||a.matches('.support-report-link,.library-linked-lesson-v10,[data-open-file]'))return false;
 let u;try{u=new URL(a.href,location.href)}catch{return false}
 return u.origin===location.origin&&/\/(?:grade|subject|lesson|exam-center|simulations|library|live|community|leaderboard|challenges|certificate|smart-review|teacher-profile|assignments|news|support|subscription)\.html$/i.test(u.pathname);
}
function shareHost(el){
 const row=el.matches('.curriculum-item,.linked-quiz-item');
 const leaf=el.matches(cardLinks+',.explore-grade-card,.grade-card');
 if((row||leaf)&&el.matches('a,button')){
   const parent=el.parentElement;
   if(parent?.classList.contains('v6-share-wrap'))return parent;
   const wrap=document.createElement('div');
   wrap.className='v6-share-wrap v6-share-host '+(row?'v6-share-row':'v6-share-card');
   el.replaceWith(wrap);wrap.appendChild(el);return wrap;
 }
 return el.matches('.stage-card')?el:el.closest(contentCards);
}
function createShareButton(label,action){
 const b=document.createElement('button');b.type='button';b.className='v6-inline-share-btn v6-share-icon';
 b.innerHTML='<i class="fa-solid fa-share-nodes" aria-hidden="true"></i>';b.title=label;b.setAttribute('aria-label',label);
 b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();action()});return b;
}
function attachShare(host,button){
 if(!host||host.dataset.v6ShareHost==='1'||host.querySelector('.v6-inline-share-btn,.v6-unit-share'))return false;
 host.dataset.v6ShareHost='1';host.classList.add('v6-share-host');
 const actions=host.querySelector('.library-card-meta-v10,.exam-card-actions,.news-card-actions,.file-actions,.card-actions');
 if(actions){button.classList.add('is-inline');actions.appendChild(button)}else host.appendChild(button);
 return true;
}
function bindAnchor(a){
 if(!eligibleAnchor(a))return;
 const host=shareHost(a);if(!host)return;
 a.dataset.v6ShareBound='1';
 const title=()=>titleForAnchor(host.matches('.v6-share-wrap')?a:host);
 attachShare(host,createShareButton('مشاركة '+title(),()=>showShare(a.href,title())));
}
function controlTarget(el){
 const u=new URL(location.href);
 if(el.matches('[data-open-file],[data-subscription-file]')){
   const x=new URL('./library.html',location.href);x.searchParams.set('file',el.dataset.openFile||el.dataset.subscriptionFile);
   return{x:x.href,title:titleForAnchor(el.closest('.library-card')||el)};
 }
 if(el.matches('[data-grade]')){
   const grade=el.dataset.grade,type=u.searchParams.get('type')||'public',stage=u.searchParams.get('stage')||document.querySelector('[data-stage].active')?.dataset.stage||'primary';
   const x=new URL('./grade.html',location.href);x.search=new URLSearchParams({type,stage,grade:String(grade)}).toString();return{x:x.href,title:el.getAttribute('aria-label')||el.textContent.trim()};
 }
 if(el.matches('[data-explore-type][data-explore-stage]')){
   const x=new URL('./explore.html',location.href);x.search=new URLSearchParams({type:el.dataset.exploreType,stage:el.dataset.exploreStage}).toString();return{x:x.href,title:el.querySelector('h3')?.textContent||el.textContent.trim()};
 }
 if(el.matches('[data-subscription-lock]')){
   const [kind,id]=String(el.dataset.subscriptionLock||'').split('|'),q=new URLSearchParams();['type','stage','grade','subject'].forEach(k=>{const v=u.searchParams.get(k);if(v)q.set(k,v)});
   const x=new URL('./lesson.html',location.href);if(kind==='lesson')q.set('id',id);else if(kind==='quiz')q.set('quiz',id);else return null;x.search=q.toString();return{x:x.href,title:titleForAnchor(el)};
 }
 return null;
}
function bindControl(el){
 if(el.dataset.v6ShareControl==='1'||el.closest(excludedAreas))return;
 const target=controlTarget(el);if(!target)return;
 const host=shareHost(el);if(!host)return;
 el.dataset.v6ShareControl='1';
 attachShare(host,createShareButton('مشاركة '+(target.title||'المحتوى'),()=>{const current=controlTarget(el);if(current)showShare(current.x,current.title)}));
}
function normalizeManualButtons(){
 document.querySelectorAll('.v6-unit-share,.v6-linked-share-btn,.v6-video-share-mini').forEach(b=>{
   if(b.dataset.v6ShareCompact==='1')return;b.dataset.v6ShareCompact='1';
   const label=b.getAttribute('aria-label')||b.title||b.textContent.trim()||'مشاركة هذا المحتوى';
   b.setAttribute('aria-label',label);b.title=label;b.classList.add('v6-share-icon');
   b.innerHTML='<i class="fa-solid fa-share-nodes" aria-hidden="true"></i>';
 });
}
function pageShareToolbar(){
 for(const selector of ['.dashboard-topbar .ref-top-user','.learning-header .learning-user','.site-header .nav-user','.site-header .nav-actions']){
   if(selector.startsWith('.site-header')&&innerWidth<=600)continue;
   const host=document.querySelector(selector);if(host?.getClientRects().length)return host;
 }
 return null;
}
function addPageShare(){
 if(isAdmin||isTeacher||!contentShareAllowed)return;
 let b=document.getElementById('academyPageShareV6');
 if(!b){b=document.createElement('button');b.id='academyPageShareV6';b.type='button';b.className='academy-page-share-v6';b.title='مشاركة الصفحة';b.setAttribute('aria-label','مشاركة الصفحة');b.innerHTML='<i class="fa-solid fa-share-nodes" aria-hidden="true"></i>';b.onclick=()=>showShare(location.href,currentTitle())}
 const toolbar=pageShareToolbar(),host=toolbar||document.body;
 b.classList.toggle('is-header',!!toolbar);
 if(b.parentElement!==host)host.appendChild(b);
}
function scan(){
 scanQueued=false;normalizeManualButtons();if(isAdmin||isTeacher||!contentShareAllowed)return;
 document.querySelectorAll('a[href]').forEach(bindAnchor);
 document.querySelectorAll('[data-grade],[data-explore-type][data-explore-stage],[data-subscription-lock],[data-open-file],[data-subscription-file]').forEach(bindControl);
 addPageShare();
}
function queueScan(){if(scanQueued)return;scanQueued=true;requestAnimationFrame(scan)}
function initObserver(){scan();observer=new MutationObserver(queueScan);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})}
async function init(){if(!document.body){addEventListener('DOMContentLoaded',init,{once:true});return}loadOfficial();await resolveSharePermission();initObserver();addEventListener('popstate',()=>{setTimeout(()=>{scan();},0)});}
init();
})();
