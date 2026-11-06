/* EGTAZ V83: searchable, grouped student tools. Routes remain unchanged. */
(()=>{'use strict';
const CATEGORIES=[
 {id:'study',title:'مذاكرتي وتقدمي',icon:'book',subtitle:'المراجعة والنتائج وخطط التعلم',items:[
 ['v54-study','اختبار مستواي','اعرف نقطة البداية وخطة التدريب','target'],
 ['v55-review','مراجعاتي الذكية','راجع الأخطاء والموضوعات المهمة','spark'],
 ['v74-student','خطتي التعليمية','ما ينبغي دراسته بعد ذلك','route'],
 ['v69-student','رحلتي التعليمية','ملخص التقدم والواجبات والنتائج','chart'],
 ['student-progress','تقدمي الدراسي','الأنشطة والتقدم المسجل','chart'],
 ['my-results','نتائج الاختبارات','نتائج المحاولات المحفوظة','award'],
 ['v89-student','تقييم حصصي','قيّم الحصص التي نفذت بالفعل','award'],
 ['student-mistakes','دفتر الأخطاء','راجع الأسئلة التي تحتاج تدريبًا','list'],
 ['m6-hub','مركز المتابعة','ملخص المواعيد والمهام','calendar']
 ]},
 {id:'resources',title:'مكتبتي وأدواتي',icon:'library',subtitle:'المكتبة والبحث والمحتوى المفضل',items:[
 ['library','مكتبتي','الكتب والملفات التعليمية','library'],
 ['student-favorites','مفضلتي','المحتوى الذي حفظته','heart'],
 ['m6-search','البحث الشامل','ابحث في محتوى الأكاديمية','search'],
 ['stages','استكشف المراحل','تصفح محتوى المراحل المختلفة','grid']
 ]},
 {id:'activities',title:'المنافسات والإنجازات',icon:'trophy',subtitle:'تحديات وبطولات ونقاط وشهادات',items:[
 ['m1-challenges','التحديات','شارك في التحديات المتاحة','target'],
 ['m4-hub','البطولات والفرق','فعاليات المنافسات التعليمية','users'],
 ['m1-leaderboard','لوحة الشرف','ترتيب المشاركين والإنجازات','trophy'],
 ['m1-points','نقاط المنافسات','اطلع على نقاطك المسجلة','spark'],
 ['m7-certificates','شهاداتي','الشهادات المتاحة في حسابك','award'],
 ['v46-badges','شاراتي وإنجازاتي','الأوسمة المرتبطة بإنجازاتك','medal']
 ]},
 {id:'account',title:'حسابي والمساعدة',icon:'user',subtitle:'الإشعارات والاشتراكات وإعدادات الحساب',items:[
 ['v72-center','مركز الإشعارات','الواجبات والنتائج والتحديثات','bell'],
 ['student-notifications','الإشعارات السابقة','الوصول إلى نظام الإشعارات القديم','bell'],
 ['v90-student','رحلة حجوزاتي','تابع موافقات الحجز والحصص ورسائل الأكاديمية','route'],
 ['v84-student','اطلب معلمًا','أرسل طلبًا للأكاديمية وحدد احتياجك','users'],
 ['student-subscriptions','اشتراكاتي','حالة الاشتراكات والطلبات','wallet'],
 ['profile','ملفي الشخصي','بيانات الحساب والصف الدراسي','user'],
 ['invite','ربط ولي الأمر','دعوة ولي أمرك للمتابعة','users'],
 ['v51-guardians','صلاحيات أولياء الأمور','إدارة الجهات المرتبطة بحسابك','shield'],
 ['account-support','الدعم الفني','اطلب مساعدة من إدارة الأكاديمية','help']
 ]}
];
// V95: detailed/legacy screens remain searchable and pinnable under a secondary disclosure.
const SECONDARY=new Set(['student-progress','m6-hub','student-notifications']);
const secondaryTitle=g=>g.id==='account'?'أرشيف الإشعارات':'تفاصيل المتابعة';
const PRIMARY=[['home','الرئيسية','house'],['my-subjects','موادي ودروسي','book'],['m5-calendar','حصصي المباشرة','video'],['student-assignments','واجباتي','list'],['teachers','معلميني','users'],['v79-more','المزيد','grid']];
const ICONS={house:'<path d="m3 11 9-8 9 8v10H3zM9 21v-8h6v8"/>',book:'<path d="M12 7a8 8 0 0 0-9-2v14a8 8 0 0 1 9 2 8 8 0 0 1 9-2V5a8 8 0 0 0-9 2zM12 7v14"/>',video:'<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M18 8a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 4"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',trophy:'<path d="M7 4h10v6a5 5 0 0 1-10 0zM7 6H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v4m-4 2h8"/>',library:'<path d="M4 3h5v18H4zM11 3h5v18h-5zM18 7h3v14h-3"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',heart:'<path d="M20.8 4.8a5.5 5.5 0 0 0-7.7 0L12 6l-1.1-1.2a5.5 5.5 0 0 0-7.7 7.7L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.7z"/>',spark:'<path d="m12 2 2 7 7 3-7 2-2 8-2-8-7-2 7-3z"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',route:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 6h8"/>',chart:'<path d="M4 19V5m0 14h16M8 15l4-5 3 2 5-7"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',award:'<circle cx="12" cy="8" r="6"/><path d="m8 13-2 9 6-4 6 4-2-9"/>',medal:'<circle cx="12" cy="15" r="6"/><path d="M6 2h4l2 7 2-7h4"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',wallet:'<rect x="2" y="5" width="20" height="15" rx="3"/><path d="M17 11h5"/>',shield:'<path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v1"/>',pin:'<path d="m7 3 10 0-2 7 3 3v2H6v-2l3-3zM12 15v7"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',check:'<path d="m4 12 5 5L20 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.grid}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const all=CATEGORIES.flatMap(g=>g.items.map(a=>({id:a[0],title:a[1],desc:a[2],icon:a[3],category:g.id})));
const byId=new Map(all.map(x=>[x.id,x]));
const moreIds=new Set(all.map(x=>x.id));
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLocaleLowerCase('ar').trim();
const S={uid:'',pins:[],query:'',category:'overview',initialized:false};
function storageKey(){return 'egtaz-v83-pins-'+S.uid;}
function restore(uid){if(uid===S.uid&&S.initialized)return;S.uid=uid;S.initialized=true;S.pins=[];S.query='';S.category='overview';try{const saved=JSON.parse(localStorage.getItem(storageKey())||'[]');if(Array.isArray(saved))S.pins=[...new Set(saved.filter(id=>byId.has(id)))].slice(0,6);}catch(_){/* Private mode: pins work in memory. */}}
function save(){try{localStorage.setItem(storageKey(),JSON.stringify(S.pins));}catch(_){}}
function filtered(){const term=fold(S.query);return all.filter(x=>(S.category==='all'||S.category==='overview'||x.category===S.category)&&(!term||fold([x.title,x.desc].join(' ')).includes(term)));}
function card(x){const pinned=S.pins.includes(x.id);return `<div class="v83-tool"><button type="button" class="v83-tool-open" data-action="route" data-view="${esc(x.id)}"><span class="v83-tool-icon">${icon(x.icon)}</span><span class="v83-tool-copy"><strong>${esc(x.title)}</strong><small>${esc(x.desc)}</small></span><span class="v83-tool-arrow">${icon('arrow')}</span></button><button type="button" class="v83-pin ${pinned?'is-pinned':''}" data-v83-pin="${esc(x.id)}" aria-pressed="${pinned}" aria-label="${pinned?'إزالة تثبيت':'تثبيت'} ${esc(x.title)}" title="${pinned?'إزالة التثبيت':'ثبّت الأداة'}">${icon('pin')}</button></div>`;}
function contents(){
 const shown=filtered(),ids=new Set(shown.map(x=>x.id)),pins=S.pins.map(id=>byId.get(id)).filter(x=>x&&ids.has(x.id)),pinnedIds=new Set(pins.map(x=>x.id));
 const overview=S.category==='overview'&&!S.query;
 const favorites=pins.length?`<section class="v83-favorites"><header class="v83-group-head"><span class="v83-category-icon">${icon('pin')}</span><div><h2>أدواتي المثبتة</h2><p>اختصاراتك الشخصية للأدوات الأكثر استخدامًا</p></div></header><div class="v83-tool-grid">${pins.map(card).join('')}</div></section>`:(overview?'<p class="v83-pin-hint">يمكنك تثبيت حتى 6 أدوات تفضلها؛ افتح أي مجموعة واضغط رمز التثبيت بجوار الأداة.</p>':'');
 if(overview)return `<div class="v83-results-count" role="status">4 مجموعات تجمع ${all.length} أداة تعليمية، بدون عرضها كلها في الشاشة</div>${favorites}<div class="v83-overview-head"><h2>اختر مجموعة الأدوات</h2><p>اضغط على المجموعة لعرض أدواتها، أو ابحث عن اسم أداة بالأعلى.</p></div><div class="v83-overview-grid">${CATEGORIES.map(g=>`<button type="button" class="v83-overview-card" data-v83-category="${g.id}"><span class="v83-category-icon">${icon(g.icon)}</span><strong>${esc(g.title)}</strong><small>${esc(g.subtitle)}</small><span class="v83-overview-count">${g.items.length} أدوات ${icon('arrow')}</span></button>`).join('')}</div>`;
 const groups=CATEGORIES.filter(g=>S.category==='all'||S.category==='overview'||S.category===g.id).map(g=>{
  const list=g.items.map(x=>byId.get(x[0])).filter(x=>x&&ids.has(x.id)&&!pinnedIds.has(x.id));
  if(!list.length)return '';
  const secondary=S.query?[]:list.filter(x=>SECONDARY.has(x.id));
  const primary=S.query?list:list.filter(x=>!SECONDARY.has(x.id));
  return `<section class="v83-group" aria-label="${esc(g.title)}"><header class="v83-group-head"><span class="v83-category-icon">${icon(g.icon)}</span><div><h2>${esc(g.title)}</h2><p>${esc(g.subtitle)}</p></div><span class="v83-group-count">${list.length}</span></header>${primary.length?`<div class="v83-tool-grid">${primary.map(card).join('')}</div>`:''}${secondary.length?`<details class="v95-secondary"><summary>${esc(secondaryTitle(g))}<span>${secondary.length} أدوات</span></summary><div class="v83-tool-grid">${secondary.map(card).join('')}</div></details>`:''}</section>`;
 }).join('');
 return `<div class="v83-results-count" role="status">${shown.length?`${shown.length} أداة متاحة ضمن الاختيار الحالي`:'لا توجد أدوات مطابقة للبحث'}</div>${favorites}${groups||(!pins.length?'<div class="v83-empty">جرّب كلمة مختلفة أو اختر «كل الأدوات».</div>':'')}`;
}
function filters(){return [{id:'overview',title:'المجموعات',icon:'grid'},{id:'all',title:'كل الأدوات',icon:'list'},...CATEGORIES].map(g=>`<button type="button" class="v83-filter ${S.category===g.id?'active':''}" data-v83-category="${g.id}" aria-pressed="${S.category===g.id}">${icon(g.icon)} <span>${esc(g.title)}</span></button>`).join('');}
function screen(){return '<div id="v83-more-root" class="v83-more" dir="rtl"></div>';}
function render(){const root=document.getElementById('v83-more-root');if(!root)return;root.innerHTML=`<header class="v83-hero"><div><span class="v83-eyebrow">أكاديمية اجتاز · مساحة الطالب</span><h1>المزيد من أدواتك التعليمية</h1><p>كل المميزات موجودة، لكن مرتبة لتوصل للي تحتاجه أسرع.</p></div><span class="v83-hero-art" aria-hidden="true">${icon('grid')}</span></header><div class="v83-search-wrap"><label for="v83-search">ابحث عن أداة</label><div class="v83-search-input">${icon('search')}<input id="v83-search" type="search" autocomplete="off" placeholder="مثل: نتائج، مكتبة، شهادة..." value="${esc(S.query)}"><button type="button" data-v83-clear ${S.query?'':'hidden'} aria-label="مسح البحث">${icon('close')}</button></div></div><nav class="v83-filters" aria-label="تصفية أدوات الطالب">${filters()}</nav><div id="v83-more-results">${contents()}</div><div class="v83-bottom"><div><strong>عايز ترجع للمذاكرة؟</strong><p>المواد والحصص والواجبات في شريط التنقل الرئيسي دائمًا.</p></div><button class="v83-back" type="button" data-action="route" data-view="home">العودة للرئيسية ${icon('arrow')}</button></div>`;}
function nav(current){
 const button=x=>`<button type="button" class="v22-tab v40-drawer-item v83-nav-link ${current===x[0]?'active':''}" data-action="route" data-view="${x[0]}" ${current===x[0]?'aria-current="page"':''}>${icon(x[3])}<span>${esc(x[1])}</span></button>`;
 return `<div class="v83-nav" dir="rtl"><div class="v83-nav-label">المذاكرة اليومية</div>${PRIMARY.map(x=>`<button type="button" class="v22-tab v40-drawer-item v83-nav-link ${current===x[0]?'active':''}" data-action="route" data-view="${x[0]}" ${current===x[0]?'aria-current="page"':''}><span class="v83-nav-icon">${icon(x[2])}</span><span>${esc(x[1])}</span></button>`).join('')}<div class="v83-nav-label v83-nav-label-extra">أدوات إضافية</div>${CATEGORIES.map(g=>{
  const selected=g.items.some(x=>x[0]===current),secondary=g.items.filter(x=>SECONDARY.has(x[0]));
  return `<details class="v83-nav-group" ${selected?'open':''}><summary>${icon(g.icon)}<span>${esc(g.title)}</span><span class="v83-chevron">⌄</span></summary><div class="v83-nav-items">${g.items.filter(x=>!SECONDARY.has(x[0])).map(button).join('')}${secondary.length?`<details class="v95-nav-secondary" ${secondary.some(x=>x[0]===current)?'open':''}><summary>${esc(secondaryTitle(g))}</summary>${secondary.map(button).join('')}</details>`:''}</div></details>`;
 }).join('')}</div>`;
}
function mount(uid){if(!uid||!document.getElementById('v83-more-root'))return;restore(uid);render();}
function rerenderResults(){const root=document.getElementById('v83-more-results');if(root)root.innerHTML=contents();}
document.addEventListener('input',e=>{if(e.target.id!=='v83-search'||!e.target.closest('#v83-more-root'))return;S.query=e.target.value.slice(0,100);if(S.query&&S.category!=='all'){S.category='all';const bar=document.querySelector('#v83-more-root .v83-filters');if(bar)bar.innerHTML=filters();}rerenderResults();const b=document.querySelector('[data-v83-clear]');if(b)b.hidden=!S.query;});
document.addEventListener('click',e=>{const root=document.getElementById('v83-more-root');if(!root||!e.target.closest('#v83-more-root'))return;const p=e.target.closest('[data-v83-pin]');if(p){e.preventDefault();const id=p.dataset.v83Pin;if(!byId.has(id))return;if(S.pins.includes(id))S.pins=S.pins.filter(v=>v!==id);else if(S.pins.length<6)S.pins.push(id);else{const status=root.querySelector('#v83-more-results .v83-results-count');if(status)status.textContent='يمكن تثبيت 6 أدوات بحد أقصى. أزل تثبيت أداة أولًا.';return;}save();rerenderResults();return;}const f=e.target.closest('[data-v83-category]');if(f){e.preventDefault();S.category=f.dataset.v83Category;S.query='';const input=root.querySelector('#v83-search');if(input)input.value='';const clear=root.querySelector('[data-v83-clear]');if(clear)clear.hidden=true;const bar=root.querySelector('.v83-filters');if(bar)bar.innerHTML=filters();rerenderResults();return;}const c=e.target.closest('[data-v83-clear]');if(c){S.query='';const input=root.querySelector('#v83-search');if(input){input.value='';input.focus();}c.hidden=true;rerenderResults();}});
window.EgtazV83={screen,mount,nav,isMoreRoute:v=>moreIds.has(v),__test:{categories:CATEGORIES,primary:PRIMARY,all,fold,filter:(query,cat)=>{const q=fold(query);return all.filter(x=>(cat==='all'||cat==='overview'||cat===x.category)&&(!q||fold(x.title+' '+x.desc).includes(q)));}}};
})();
