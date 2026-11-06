/* Progressive enhancement ONLY. Does not simulate accounts, mutate data, or replace backend logic. */
(()=>{'use strict';
function init(){
 const body=document.body;
 if(body?.dataset.academyPage!=='index')return;
 const home=document.querySelector('#publicExperience > #home');
 const teachers=document.querySelector('#publicExperience > #teachers');
 // Same parent: move the existing, database-powered teacher list below the hero.
 if(home&&teachers&&home.nextElementSibling!==teachers)home.insertAdjacentElement('afterend',teachers);
 const track=document.getElementById('publicTeacherCards');
 if(!track||document.querySelector('.eg-teachers-actions'))return;
 const toolbar=document.createElement('div');toolbar.className='eg-teachers-actions';toolbar.setAttribute('aria-label','التمرير بين المدرسين');
 const prev=document.createElement('button'),next=document.createElement('button');
 prev.type=next.type='button';prev.setAttribute('aria-label','المدرسون السابقون');next.setAttribute('aria-label','المدرسون التاليون');
 prev.innerHTML='<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
 next.innerHTML='<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>';
 toolbar.append(prev,next);track.before(toolbar);
 track.setAttribute('tabindex','0');track.setAttribute('aria-label','بطاقات المعلمين، استخدم الأسهم أو السحب للتنقل');
 const distance=()=>Math.max(200,Math.round(track.clientWidth*.75));
 prev.addEventListener('click',()=>track.scrollBy({left:distance(),behavior:'smooth'}));
 next.addEventListener('click',()=>track.scrollBy({left:-distance(),behavior:'smooth'}));
 const update=()=>{const hasOverflow=track.scrollWidth>track.clientWidth+8;toolbar.hidden=!hasOverflow;prev.disabled=!hasOverflow||track.scrollLeft>=-2;next.disabled=!hasOverflow||Math.abs(track.scrollLeft)>=track.scrollWidth-track.clientWidth-3};
 track.addEventListener('scroll',update,{passive:true});
 if('ResizeObserver' in window){const obs=new ResizeObserver(update);obs.observe(track)}
 if('MutationObserver' in window){new MutationObserver(update).observe(track,{childList:true})}
 update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
