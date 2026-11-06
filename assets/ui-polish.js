(() => {
'use strict';
const body=document.body;
if(!body||body.classList.contains('ui-polish-ready'))return;
body.classList.add('ui-polish-ready');
body.dataset.uiPolish='1';

const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const finePointer=window.matchMedia?.('(hover:hover) and (pointer:fine)').matches;

function updateScrolled(){body.classList.toggle('ui-scrolled',window.scrollY>16)}
updateScrolled();
window.addEventListener('scroll',updateScrolled,{passive:true});

const revealSelector=[
  '#publicExperience .stage-card',
  '#publicExperience .public-subject-card-v2',
  '#publicExperience .feature-card',
  '.ref-stat-card',
  '.ref-card',
  '.ref-side-card',
  '.ref-subject-card',
  '.explore-grade-grid button',
  '.explore-subject-card',
  '.unit-card',
  '.learning-sidebar>article',
  '.exam-list>article',
  '.game-mission',
  '.game-card',
  '.profile-card',
  '.teacher-card',
  '.admin-card',
  '.pro-card'
].join(',');

const revealEls=[...document.querySelectorAll(revealSelector)].filter(el=>!el.closest('[hidden]'));
revealEls.forEach((el,i)=>{
  el.classList.add('ui-reveal');
  el.style.transitionDelay=Math.min(i%8,5)*28+'ms';
});
if(reduced||!('IntersectionObserver'in window)){
  revealEls.forEach(el=>el.classList.add('ui-visible'));
}else{
  const io=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('ui-visible');
        io.unobserve(entry.target);
      }
    });
  },{rootMargin:'0px 0px -5% 0px',threshold:.06});
  revealEls.forEach(el=>io.observe(el));
}

if(finePointer&&!reduced){
  const tiltEls=[...document.querySelectorAll('#publicExperience .stage-card,.ref-subject-card,.explore-subject-card')];
  tiltEls.forEach(el=>{
    el.classList.add('ui-tilt');
    el.addEventListener('pointermove',e=>{
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height)return;
      const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      const rx=Math.max(-3,Math.min(3,-y*5.5)),ry=Math.max(-3,Math.min(3,x*5.5));
      el.style.transform='perspective(900px) rotateX('+rx+'deg) rotateY('+ry+'deg) translateY(-4px)';
    },{passive:true});
    el.addEventListener('pointerleave',()=>{el.style.transform=''});
  });
}

document.querySelectorAll('img').forEach(img=>{
  const host=img.closest('.ref-subject-art,.public-subject-art,.stage-art,.explore-subject-emoji,.teacher-avatar,.teacher-public-card,.admin-cover-preview');
  if(!host)return;
  const fallback=()=>host.classList.add('ui-image-fallback');
  if(img.complete&&img.naturalWidth===0)fallback();
  img.addEventListener('error',fallback,{once:true});
  img.addEventListener('load',()=>host.classList.remove('ui-image-fallback'),{once:true});
});

const tables=[...document.querySelectorAll('table')];
tables.forEach(table=>{
  if(table.parentElement?.classList.contains('ui-table-scroll'))return;
  const p=table.parentElement;
  if(!p)return;
  if(p.scrollWidth>p.clientWidth||table.scrollWidth>p.clientWidth){
    p.classList.add('ui-table-scroll');
    p.style.overflowX='auto';
    p.style.webkitOverflowScrolling='touch';
  }
});

document.addEventListener('click',e=>{
  const trigger=e.target.closest('a[href^="#"]');
  if(!trigger)return;
  const href=trigger.getAttribute('href');
  if(!href||href==='#')return;
  const target=document.querySelector(href);
  if(!target)return;
  e.preventDefault();
  target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
},{passive:false});
})();