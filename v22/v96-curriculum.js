/* V96: shared, read-only curriculum presentation for both subject entry points. */
(()=>{'use strict';
const models=new Map(),LIMIT=8,FALLBACK='./assets/curriculum-v96/lesson-cover.webp';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=v=>String(v??'').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLocaleLowerCase('ar').trim();
const num=n=>Number(n||0).toLocaleString('ar-EG');
const count=(n,single,dual,plural)=>n===1?single:n===2?dual:num(n)+' '+(n>=3&&n<=10?plural:single);
const icons={back:'<path d="M5 12h14m-6-6 6 6-6 6"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',chevron:'<path d="m7 10 5 5 5-5"/>',check:'<path d="m5 12 4 4 10-10"/>',book:'<path d="M12 6v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',play:'<path d="m9 5 10 7-10 7z"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',filter:'<path d="M3 5h18M6 12h12M9 19h6"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n]||icons.book}</svg>`;
function imageURL(value,fallback=FALLBACK){try{const s=String(value||'').trim();if(!s)return fallback;const u=new URL(s,document.baseURI);return /^https?:$/.test(u.protocol)?u.href:fallback;}catch{return fallback;}}
function teacherIds(value){if(Array.isArray(value))return value.filter(x=>typeof x==='string');if(value&&typeof value==='object')return Object.entries(value).filter(([,v])=>v===true).map(([k])=>k);return [];}
function normalize(input){
 const seen=new Set(),lessons=[],hiddenUnits=new Set((Array.isArray(input.units)?input.units:[]).filter(x=>x?.isHidden===true).map(x=>String(Number(x.number||x.id)||1)));
 for(const x of Array.isArray(input.lessons)?input.lessons:[]){
  if(!x||!x.id||seen.has(String(x.id))||x.isHidden===true||!['','published','approved'].includes(String(x.workflowStatus||''))||x.reviewStatus==='rejected'||hiddenUnits.has(String(Number(x.unit)||1)))continue;
  seen.add(String(x.id));lessons.push({...x,id:String(x.id),title:String(x.title||'درس تعليمي'),unit:String(Number(x.unit)||1),completed:x.completed===true,teacherIds:teacherIds(x.teacherIds)});
 }
 const unitMap=new Map((Array.isArray(input.units)?input.units:[]).filter(x=>x&&x.isHidden!==true).map(x=>[String(Number(x.number||x.id)||1),x]));
 const grouped=new Map();
 for(const l of lessons){if(!grouped.has(l.unit)){const meta=unitMap.get(l.unit)||{};grouped.set(l.unit,{id:l.unit,name:String(meta.name||l.unitLabel||'الوحدة '+num(l.unit)),imageUrl:meta.imageUrl||l.unitImageUrl||'',lessons:[]});}grouped.get(l.unit).lessons.push(l);}
 const units=[...grouped.values()];
 const next=lessons.find(l=>!l.completed&&!l.accessLocked)||null;
 return {...input,subjectName:String(input.subjectName||'المادة الدراسية'),scopeLabel:String(input.scopeLabel||''),lessons,units,next,completed:lessons.filter(x=>x.completed).length,loggedIn:input.loggedIn===true};
}
function stateFor(input){
 const data=normalize(input),key=String(input.key||'curriculum');let state=models.get(key);
 if(!state){if(models.size>=24)models.delete(models.keys().next().value);state={key,data,query:'',teacher:'all',open:new Set(),limits:new Map(),initialized:false};models.set(key,state);}
 state.data=data;
 if(!state.initialized&&data.units.length){const first=data.units.find(u=>u.lessons.some(l=>l.id===data.next?.id))||data.units[0];state.open.add(first.id);state.initialized=true;}
 return state;
}
function matches(state,l,unit){return(state.teacher==='all'||l.teacherIds.includes(state.teacher))&&(!fold(state.query)||fold(l.title+' '+unit.name+' '+(l.teacherName||'')).includes(fold(state.query)));}
function row(state,l,index){
 const next=l.id===state.data.next?.id,completed=state.data.loggedIn&&l.completed;
 const kind=[l.hasVideo?'شرح مرئي':l.hasContent?'شرح':'',l.hasQuestions?'تدريب':'',l.hasQuiz?'اختبار':'',l.hasFiles?'ملفات':''].filter(Boolean).join(' · ')||'محتوى الدرس';
 const label=completed?'مراجعة':next?'ابدأ الدرس':'عرض الدرس';
 const image=imageURL(l.imageUrl||l.unitImageUrl,[FALLBACK,'./assets/curriculum-v96/practice-cover.webp','./assets/curriculum-v96/notes-cover.webp'][index%3]);
 return `<article class="v96-lesson${next&&state.data.loggedIn?' is-next':''}${completed?' is-complete':''}" data-v96-lesson="${esc(l.id)}"><div class="v96-cover"><img src="${esc(image)}" data-v96-image loading="lazy" decoding="async" width="160" height="128" alt="">${l.hasVideo?`<span class="v96-play">${icon('play')}</span>`:''}</div><div class="v96-lesson-copy"><span class="v96-lesson-number">الدرس ${num(index+1)}</span><h3>${esc(l.title)}</h3><p>${esc(kind)}</p></div><div class="v96-lesson-actions">${completed?`<span class="v96-done">${icon('check')} مكتمل</span>`:next&&state.data.loggedIn?'<span class="v96-next-label">الدرس التالي</span>':''}<button type="button" class="v96-lesson-button${next&&!completed?' is-primary':''}" data-action="direct-lesson" data-id="${esc(l.id)}" aria-label="${esc(label+': '+l.title)}">${label}${next&&!completed?icon('arrow'):''}</button></div></article>`;
}
function lessonBody(state,unit){
 const filtered=unit.lessons.filter(l=>matches(state,l,unit)),limit=state.limits.get(unit.id)||LIMIT;
 const list=filtered.slice(0,limit);
 return list.map(l=>row(state,l,unit.lessons.indexOf(l))).join('')+(filtered.length>limit?`<button type="button" class="v96-more" data-v96="more" data-unit="${esc(unit.id)}">عرض المزيد من الدروس <span>(${num(filtered.length-limit)})</span>${icon('chevron')}</button>`:'');
}
function contents(state){
 const d=state.data,percent=d.lessons.length?Math.round(d.completed/d.lessons.length*100):0;
 const searching=!!fold(state.query)||state.teacher!=='all';
 const units=d.units.filter(u=>u.lessons.some(l=>matches(state,l,u))),resultCount=units.reduce((n,u)=>n+u.lessons.filter(l=>matches(state,l,u)).length,0);
 const teachers=(d.teachers||[]).filter(t=>t&&t.id&&t.name&&d.lessons.some(l=>l.teacherIds.includes(t.id)));
 const stats=d.loggedIn?`<div class="v96-progress-label"><span>تقدّمك في المادة</span><strong>${num(d.completed)} من ${num(d.lessons.length)} دروس</strong></div><div class="v96-progress" role="progressbar" aria-label="الدروس المكتملة في المادة" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></div>`:`<div class="v96-guest-note">${icon('book')} تصفّح الوحدات واختر درسك</div>`;
 return `<header class="v96-heading"><div><span class="v96-eyebrow">منهجك، خطوة بخطوة</span><h1>${esc(d.subjectName)}</h1><p>${esc(d.scopeLabel)}</p></div><button type="button" class="v96-back" ${d.backMode==='catalog'?'data-v80="back"':'data-action="v96-back"'} aria-label="العودة إلى موادي">${icon('back')}</button></header><section class="v96-hero" aria-label="ملخص المادة"><div class="v96-hero-copy"><h2>${d.lessons.length&&d.loggedIn&&d.completed===d.lessons.length?'أحسنت، أكملت دروس المادة':'خطوة جديدة نحو التفوق'}</h2><p>${count(d.units.length,'وحدة','وحدتان','وحدات')} <span>·</span> ${count(d.lessons.length,'درس','درسان','دروس')}</p>${stats}</div><img class="v96-hero-art" src="${esc(imageURL(d.heroImageUrl,'./assets/curriculum-v96/subject-art.webp'))}" data-v96-image width="360" height="240" alt="" decoding="async"></section><div class="v96-toolbar"><label class="v96-search">${icon('search')}<input type="search" data-v96-search maxlength="120" autocomplete="off" value="${esc(state.query)}" placeholder="ابحث عن درس داخل المادة" aria-label="البحث في الدروس والوحدات"><button type="button" data-v96="clear" aria-label="مسح البحث" ${state.query?'':'hidden'}>${icon('close')}</button></label>${teachers.length?`<label class="v96-teacher-filter">${icon('filter')}<span class="v96-sr">تصفية الدروس حسب المعلم</span><select data-v96-teacher aria-label="تصفية حسب المعلم"><option value="all">كل المعلمين</option>${teachers.map(t=>`<option value="${esc(t.id)}"${state.teacher===t.id?' selected':''}>${esc(t.name)}</option>`).join('')}</select></label>`:''}</div><div class="v96-list-label"><h2>وحدات المادة</h2><span role="status" aria-live="polite">${searching?num(resultCount)+' نتيجة':count(d.units.length,'وحدة','وحدتان','وحدات')+' للتعلّم'}</span></div><div class="v96-units">${units.map((u,index)=>{
  const done=d.loggedIn?u.lessons.filter(l=>l.completed).length:0,pct=u.lessons.length?Math.round(done/u.lessons.length*100):0,open=searching||state.open.has(u.id);
  const configuredImage=u.imageUrl?imageURL(u.imageUrl,''):'';
  return `<details class="v96-unit" data-v96-unit="${esc(u.id)}"${open?' open':''}><summary><span class="v96-unit-number">${configuredImage?`<img src="${esc(configuredImage)}" data-v96-image alt="" loading="lazy" width="48" height="48">`:num(d.units.indexOf(u)+1)}</span><span class="v96-unit-title"><strong>${esc(u.name)}</strong><small>${count(u.lessons.length,'درس','درسان','دروس')}${d.loggedIn&&done?' · '+num(done)+' مكتمل':''}</small></span>${d.loggedIn?`<span class="v96-unit-progress" role="img" aria-label="${num(done)} من ${num(u.lessons.length)} دروس مكتملة"><i style="width:${pct}%"></i></span>`:''}<span class="v96-unit-chevron">${icon('chevron')}</span></summary><div class="v96-unit-body">${open?lessonBody(state,u):''}</div></details>`;
 }).join('')||`<div class="v96-empty">${icon('book')}<h3>${d.lessons.length?'لا توجد دروس مطابقة':'دروس جديدة في الطريق'}</h3><p>${d.lessons.length?'جرّب كلمة أخرى أو غيّر فلتر المعلم.':'ستظهر وحدات المادة هنا بمجرد نشر دروسها.'}</p>${searching?'<button type="button" data-v96="reset">عرض كل الدروس</button>':''}</div>`}</div>`;
}
function repaint(root,state){root.innerHTML=contents(state);}
function render(input){const state=stateFor(input);return `<section class="v96-curriculum" data-v96-root="${esc(state.key)}" dir="rtl" aria-label="وحدات المادة ودروسها">${contents(state)}</section>`;}
function getState(node){const root=node.closest?.('[data-v96-root]');return root?{root,state:models.get(root.dataset.v96Root)}:null;}
document.addEventListener('input',e=>{
 if(!e.target.matches?.('[data-v96-search]'))return;const ctx=getState(e.target);if(!ctx?.state)return;
 const start=e.target.selectionStart,end=e.target.selectionEnd;ctx.state.query=String(e.target.value).slice(0,120);repaint(ctx.root,ctx.state);
 const input=ctx.root.querySelector('[data-v96-search]');input.focus({preventScroll:true});try{input.setSelectionRange(start,end);}catch{}
});
document.addEventListener('change',e=>{if(!e.target.matches?.('[data-v96-teacher]'))return;const ctx=getState(e.target);if(!ctx?.state)return;ctx.state.teacher=e.target.value;repaint(ctx.root,ctx.state);});
document.addEventListener('click',e=>{
 const button=e.target.closest?.('[data-v96]');if(!button)return;const ctx=getState(button);if(!ctx?.state)return;e.preventDefault();const action=button.dataset.v96;
 if(action==='clear'){ctx.state.query='';repaint(ctx.root,ctx.state);ctx.root.querySelector('[data-v96-search]')?.focus({preventScroll:true});}
 else if(action==='reset'){ctx.state.query='';ctx.state.teacher='all';repaint(ctx.root,ctx.state);}
 else if(action==='more'){const id=button.dataset.unit;ctx.state.limits.set(id,(ctx.state.limits.get(id)||LIMIT)+LIMIT);const unit=ctx.state.data.units.find(u=>u.id===id);if(unit){const body=button.closest('.v96-unit-body');body.innerHTML=lessonBody(ctx.state,unit);const more=body.querySelector('[data-v96="more"]');if(more)more.focus({preventScroll:true});}}
});
document.addEventListener('toggle',e=>{
 const details=e.target;if(!details.matches?.('[data-v96-unit]'))return;const ctx=getState(details);if(!ctx?.state)return;const id=details.dataset.v96Unit;
 if(fold(ctx.state.query)||ctx.state.teacher!=='all')return;
 if(details.open){ctx.state.open.add(id);const body=details.querySelector('.v96-unit-body'),unit=ctx.state.data.units.find(u=>u.id===id);if(unit&&!body.childElementCount)body.innerHTML=lessonBody(ctx.state,unit);}
 else ctx.state.open.delete(id);
},true);
document.addEventListener('error',e=>{const img=e.target;if(img.matches?.('img[data-v96-image]')&&!img.dataset.v96Fallback){img.dataset.v96Fallback='1';img.src=FALLBACK;}},true);
window.EgtazCurriculumV96={render,__test:{normalize,fold,imageURL,teacherIds}};
})();
