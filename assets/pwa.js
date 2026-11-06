(() => {
'use strict';
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update().catch(()=>{})).catch(()=>{}))}
let deferred=null,button=null;
window.addEventListener('beforeinstallprompt',e=>{
 e.preventDefault();deferred=e;
 button=document.createElement('button');button.className='pwa-install-button';button.innerHTML='<i class="fa-solid fa-mobile-screen-button"></i><span>تثبيت الأكاديمية</span>';
 document.body.appendChild(button);
 button.onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;button?.remove()};
});
window.addEventListener('appinstalled',()=>{deferred=null;button?.remove()});
})();