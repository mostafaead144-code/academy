(() => {
'use strict';
if(!window.AcademyNotifications||!window.AcademyBackend)return;
window.AcademyNotificationWidget=true;
const auth=AcademyBackend.auth(),N=window.AcademyNotifications;
let currentUser=null,timer=null,refreshing=false,result={items:[],unread:0},popover=null;

function triggers(){return [...document.querySelectorAll('#notificationBtn,#dashNotificationBtn,.student-notification-trigger')]}
function setBadge(button,count){
  if(!button)return;
  button.classList.toggle('has-notification-badge',count>0);
  let badge=button.querySelector('.notification-badge');
  if(count<=0){badge?.remove();return}
  if(!badge){badge=document.createElement('span');badge.className='notification-badge';button.appendChild(badge)}
  badge.textContent=count>99?'99+':String(count);
  button.setAttribute('aria-label','الإشعارات — '+count+' غير مقروء');
}
function syncBadges(){triggers().forEach(btn=>setBadge(btn,result.unread||0))}
function addCenterLink(){
  const cards=[...document.querySelectorAll('.dashboard-smart-card')];
  const card=cards.find(x=>x.querySelector('h3')?.textContent.trim()==='الإشعارات');
  if(card&&!card.querySelector('.notification-center-link')){
    const a=document.createElement('a');a.href='./notifications.html';a.className='text-btn notification-center-link';a.style.marginTop='12px';a.innerHTML='عرض مركز الإشعارات <i class="fa-solid fa-arrow-left"></i>';card.appendChild(a);
  }
}
function relative(ts){
  const diff=Date.now()-Number(ts||0),abs=Math.abs(diff);
  if(abs<60000)return'الآن';
  if(abs<3600000)return Math.max(1,Math.round(abs/60000))+' د';
  if(abs<86400000)return Math.max(1,Math.round(abs/3600000))+' س';
  return Math.max(1,Math.round(abs/86400000))+' يوم';
}
function closePopover(){
  popover?.remove();popover=null;
  document.removeEventListener('keydown',escapePopover);
}
function escapePopover(e){if(e.key==='Escape')closePopover()}
async function openItem(item){
  if(!currentUser||!item)return;
  try{
    if(!item.read){await N.markRead(currentUser.uid,item.key);item.read=true;result.unread=Math.max(0,Number(result.unread||0)-1);syncBadges()}
  }catch(e){console.warn('Notification read update failed',e)}
  const href=item.href||'./notifications.html';
  location.href=href;
}
function showPopover(trigger){
  closePopover();
  const items=(result.items||[]).slice(0,5);
  const box=document.createElement('section');box.className='notification-widget-popover-v11';box.setAttribute('role','dialog');box.setAttribute('aria-label','أحدث الإشعارات');
  box.innerHTML='<div class="notification-widget-head-v11"><div><small>آخر التحديثات</small><strong>إشعاراتك</strong></div><span>'+(result.unread||0)+' غير مقروء</span></div>'+
    '<div class="notification-widget-list-v11">'+(items.length?items.map((n,i)=>
      '<button type="button" data-widget-notification="'+i+'" class="'+(n.read?'read':'unread')+'">'+
        '<span class="tone-'+(n.tone||'blue')+'"><i class="fa-solid '+(n.icon||'fa-bell')+'"></i></span>'+
        '<div><strong>'+escapeHtml(n.title||'إشعار')+'</strong><p>'+escapeHtml((n.text||'').slice(0,100))+'</p><small>'+relative(n.createdAt)+(n.sourceName?' • '+escapeHtml(n.sourceName):'')+'</small></div>'+
        (!n.read?'<i class="notification-widget-dot-v11"></i>':'')+
      '</button>'
    ).join(''):'<div class="notification-widget-empty-v11"><span>🔕</span><strong>لا توجد إشعارات الآن</strong><small>أنت متابع كل شيء.</small></div>')+'</div>'+
    '<a class="notification-widget-all-v11" href="./notifications.html">عرض كل الإشعارات <i class="fa-solid fa-arrow-left"></i></a>';
  document.body.appendChild(box);popover=box;
  const rect=trigger.getBoundingClientRect(),width=Math.min(390,innerWidth-20);
  box.style.width=width+'px';
  const left=Math.max(10,Math.min(innerWidth-width-10,rect.right-width));
  box.style.left=left+'px';box.style.top=Math.max(10,Math.min(innerHeight-box.offsetHeight-10,rect.bottom+9))+'px';
  box.querySelectorAll('[data-widget-notification]').forEach(b=>b.onclick=()=>openItem(items[Number(b.dataset.widgetNotification)]));
  setTimeout(()=>{
    document.addEventListener('click',function outside(e){
      if(!popover){document.removeEventListener('click',outside);return}
      if(!popover.contains(e.target)&&!e.target.closest('#notificationBtn,#dashNotificationBtn,.student-notification-trigger')){closePopover();document.removeEventListener('click',outside)}
    });
  },0);
  document.addEventListener('keydown',escapePopover);
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function refresh(){
  if(!currentUser||refreshing||document.hidden||!navigator.onLine)return;
  const uid=currentUser.uid;refreshing=true;
  try{
    const next=await N.loadNotifications(currentUser);
    if(currentUser?.uid!==uid)return;
    result=next;syncBadges();addCenterLink();
  }catch(e){console.warn('Notification badge update failed',e)}finally{refreshing=false}
}
document.addEventListener('click',e=>{
  const btn=e.target.closest('#notificationBtn,#dashNotificationBtn,.student-notification-trigger');
  if(!btn)return;
  e.preventDefault();e.stopPropagation();
  if(popover){closePopover();return}
  showPopover(btn);
},true);
auth.onAuthStateChanged(user=>{
  currentUser=user;closePopover();
  if(timer){clearInterval(timer);timer=null}
  if(!user){result={items:[],unread:0};syncBadges();return}
  setTimeout(refresh,500);timer=setInterval(refresh,60000);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('resize',closePopover,{passive:true});
})();