/* V97 — Owner-managed student UI visibility. Deliberately isolated from hashed build bundles. */
(()=>{'use strict';
const portal=document.body.dataset.portal;
if(!['admin','student'].includes(portal))return;
// Each item represents one control; some apply to multiple existing routes.
const groups=[
 {title:'الأقسام الأساسية',icon:'📚',items:[
  ['my-subjects','موادي ودروسي','المواد والوحدات والدروس'],
  ['m5-calendar','الحصص المباشرة','المواعيد وروابط الحصص'],
  ['student-assignments','الواجبات','التكليفات ومتابعة تسليمها'],
  ['teachers','معلميني','قائمة المعلمين'],
  ['my-results','النتائج والاختبارات','نتائج الاختبارات'],
  ['v79-more','قائمة المزيد','صفحة الأدوات الإضافية']
 ]},
 {title:'التقدم والمذاكرة',icon:'📈',items:[
  ['student-progress','تقدمي الدراسي','التقدم خلال الدراسة'],
  ['v74-student','خطتي التعليمية','التخطيط للمذاكرة'],
  ['v69-student','رحلتي التعليمية','ملخص الأنشطة والمتابعة'],
  ['v55-review','مراجعاتي الذكية','المراجعة الذكية'],
  ['v54-study','اختبار مستواي','قياس المستوى'],
  ['student-mistakes','دفتر الأخطاء','الأخطاء التي تحتاج تدريبًا'],
  ['m6-hub','مركز المتابعة','الجدول والمهام']
 ]},
 {title:'المنافسات والإنجازات',icon:'🏆',items:[
  ['m1-challenges','التحديات','التحديات التعليمية'],
  ['m4-hub','البطولات والفرق','المنافسات الجماعية والفردية'],
  ['m1-leaderboard','لوحة الشرف','ترتيب الطلاب'],
  ['m1-points','نقاط المنافسات','رصيد النقاط'],
  ['m7-certificates','الشهادات','الشهادات الإلكترونية'],
  ['v46-badges','الشارات والإنجازات','الأوسمة والمكافآت']
 ]},
 {title:'المكتبة والأدوات',icon:'📖',items:[
  ['library','المكتبة','الكتب والملفات'],
  ['student-favorites','المفضلة','المواد المحفوظة'],
  ['m6-search','البحث الشامل','البحث داخل المحتوى'],
  ['stages','استكشف المراحل','تصفح المراحل الدراسية']
 ]},
 {title:'الحساب والتواصل',icon:'🔔',items:[
  ['notifications','الإشعارات كلها','مركز الإشعارات والإشعارات القديمة معًا'],
  ['student-subscriptions','الاشتراكات','اشتراكات الطالب'],
  ['profile','الملف الشخصي','رابط ملف الطالب؛ تسجيل الخروج يظل ظاهرًا'],
  ['invite','دعوة ولي الأمر','ربط حساب ولي الأمر'],
  ['v51-guardians','صلاحيات أولياء الأمور','ضبط متابعة ولي الأمر'],
  ['account-support','الدعم الفني','طلبات المساعدة'],
  ['v84-student','اطلب معلمًا','طلبات المعلمين'],
  ['v90-student','رحلة الحجوزات','متابعة الحجز والمراسلات'],
  ['v87-directory','دليل المعلمين','التصفح والحجز'],
  ['v89-student','تقييم الحصص','تقييم المعلمين والحصص']
 ]},
 {title:'مكونات الصفحة الرئيسية',icon:'✨',items:[
  ['home-hero','البانر الترحيبي','الترحيب وأزرار البدء الرئيسية'],
  ['home-resume','تابع من حيث توقفت','آخر درس تمت زيارته'],
  ['home-quick','البطاقات الأساسية','اختصارات الأقسام'],
  ['home-today','المتابعة السريعة','الحصص والواجبات والنتائج'],
  ['home-teacher','بطاقة طلب معلم','دعوة إرسال طلب معلم'],
  ['home-footer','بطاقة استكشف المزيد','الوصول للأدوات الإضافية']
 ]}
];
const itemList=groups.flatMap(group=>group.items.map(([id,title,description])=>({id,title,description,group:group.title})));
const valid=new Set(itemList.map(x=>x.id));
const routes={notifications:['v72-center','student-notifications']};
const homeSelectors={
 'home-hero':'.v79-home .v79-hero',
 'home-resume':'.v79-home .v79-resume',
 'home-quick':'.v79-home .v79-section:has(.v79-tiles)',
 'home-today':'.v79-home .v79-today',
 'home-teacher':'.v79-home .v79-footer:has([data-view="v84-student"])',
 'home-footer':'.v79-home .v79-footer:has([data-view="v79-more"])'
};
let hidden=new Set(),ready=false,panel=null,working=new Set(),busy=false,loadedAdmin=false,query='';
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=(path,options={})=>window.AcademyBackend.request(path,options);
function token(){const app=window.AcademyBackend.apps.find(x=>x.name==='admin-portal');return app?.auth()?._token()||'';}
function isHiddenRoute(view){return hidden.has(view)||Object.entries(routes).some(([item,values])=>hidden.has(item)&&values.includes(view));}
function css(){
 if(portal!=='student')return;
 const ids=new Set([...hidden].flatMap(id=>routes[id]||[id]));
 let styles=[...ids].filter(id=>!id.startsWith('home-')).map(id=>{
  const selector=`[data-view="${id}"]`;
  return `body[data-portal="student"] ${selector},body[data-portal="student"] .v83-tool:has(> .v83-tool-open${selector}),body[data-portal="student"] .v79-today-card:has(> ${selector}){display:none!important}`;
 });
 for(const id of hidden){if(homeSelectors[id])styles.push(`body[data-portal="student"] ${homeSelectors[id]}{display:none!important}`);}
 let tag=document.getElementById('v97-visibility-rules');
 if(!tag){tag=document.createElement('style');tag.id='v97-visibility-rules';document.head.append(tag);}
 tag.textContent=styles.join('\n');
}
function navigateSafety(){
 if(portal!=='student'||!ready)return;
 const view=new URLSearchParams(location.search).get('view')||'';
 if(!view||!isHiddenRoute(view))return;
 // The interface setting does not revoke underlying API permissions; it blocks student dashboard navigation.
 const url=new URL(location.href);url.searchParams.set('view','home');
 location.replace(url.href);
}
function notify(message){let box=document.getElementById('v97-toast');if(!box){box=document.createElement('div');box.id='v97-toast';box.setAttribute('role','status');document.body.append(box);}box.textContent=message;box.classList.add('v97-toast-visible');setTimeout(()=>box.classList.remove('v97-toast-visible'),3500);}
function installStudent(){
 document.addEventListener('click',e=>{
  if(!ready)return;
  const target=e.target.closest('[data-view],a[href]');if(!target)return;
  const view=target.dataset.view||(target.getAttribute('href')?new URL(target.href,location.href).searchParams.get('view'):'');
  if(!view||!isHiddenRoute(view))return;
  e.preventDefault();e.stopImmediatePropagation();notify('القسم غير ظاهر حاليًا بقرار من إدارة الأكاديمية.');
 },true);
 window.addEventListener('popstate',navigateSafety);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void reload();});
 window.addEventListener('focus',()=>void reload());
 setInterval(()=>{if(!document.hidden)void reload();},60000);
}
async function reload(){
 try{const result=await api('v97/student-ui');if(result?.ok!==true||!Array.isArray(result.hidden))return;
  hidden=new Set(result.hidden.filter(id=>valid.has(id)));ready=true;css();navigateSafety();
 }catch(e){console.warn('تعذر جلب إعدادات عرض لوحة الطالب',e?.message||e);}
}
function controlsMarkup(){
 const filter=query.trim().toLocaleLowerCase('ar');
 const blocks=groups.map(group=>{
  const list=group.items.filter(item=>!filter||`${item[1]} ${item[2]} ${group.title}`.toLocaleLowerCase('ar').includes(filter));
  if(!list.length)return '';
  return `<section class="v97-group"><div class="v97-group-heading"><h3>${group.icon} ${escapeHTML(group.title)}</h3><span>${list.length} عناصر</span></div><div class="v97-grid">${list.map(([id,title,description])=>{
   const visible=!working.has(id);
   return `<label class="v97-card ${visible?'':'v97-card-off'}"><input type="checkbox" data-v97-item="${id}" ${visible?'checked':''} aria-label="إظهار ${escapeHTML(title)}"><span class="v97-card-text"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></span><span class="v97-switch" aria-hidden="true"></span></label>`;
  }).join('')}</div></section>`;
 }).join('');
 return blocks||'<p class="v97-empty">لا توجد نتائج مطابقة للبحث.</p>';
}
function renderControls(){if(!panel)return;
 const area=panel.querySelector('#v97-groups');if(area)area.innerHTML=controlsMarkup();
 const count=panel.querySelector('#v97-count');if(count)count.textContent=`${itemList.length-working.size} ظاهر · ${working.size} مخفي`;
 const save=panel.querySelector('#v97-save');if(save)save.disabled=busy||!loadedAdmin;
 const status=panel.querySelector('#v97-status');if(status)status.textContent=busy?'جارٍ حفظ التغييرات...':'';
}
function close(){panel?.remove();panel=null;document.body.classList.remove('v97-modal-open');}
async function open(){
 if(panel)return;
 loadedAdmin=false;query='';
 if(!token()){notify('يجب تسجيل الدخول بحساب المدير أولًا.');return;}
 panel=document.createElement('div');panel.id='v97-overlay';panel.setAttribute('role','presentation');
 panel.innerHTML=`<div class="v97-mask" data-v97-close></div><div class="v97-dialog" role="dialog" aria-modal="true" aria-labelledby="v97-title" dir="rtl">
  <header class="v97-header"><div><span class="v97-kicker">أكاديمية اجتاز / إعدادات العرض</span><h2 id="v97-title">التحكم في لوحة الطالب</h2><p>اختر ما يظهر للطلاب من غير حذف أي بيانات أو تغيير صلاحيات المعلمين.</p></div><button class="v97-close" type="button" aria-label="إغلاق" data-v97-close>×</button></header>
  <div class="v97-toolbar"><label class="v97-search">🔎 <input id="v97-search" type="search" placeholder="ابحث عن قسم أو ميزة..."></label><span id="v97-count" class="v97-count"></span></div>
  <div class="v97-scroller"><div id="v97-groups"><p class="v97-empty">جارٍ جلب الإعدادات...</p></div></div>
  <footer class="v97-footer"><div class="v97-actions"><button type="button" id="v97-show-all" class="v97-secondary">إظهار الجميع</button><button type="button" id="v97-hide-all" class="v97-secondary">إخفاء العناصر الاختيارية</button></div><div class="v97-save-wrap"><span id="v97-status" role="status"></span><button type="button" id="v97-save" class="v97-save">حفظ التغييرات</button></div></footer>
  <p class="v97-note">الرئيسية وتسجيل الخروج يظلان متاحين دائمًا. إخفاء الأقسام يخص الواجهة فقط ولا يلغي صلاحيات الوصول للخدمات الخلفية.</p>
 </div>`;
 document.body.append(panel);document.body.classList.add('v97-modal-open');panel.querySelector('[data-v97-close]')?.focus();
 try{const result=await api('v97/admin/student-ui',{token:token()});if(!panel)return;
  if(!result?.ok)throw Error('تعذر استلام الإعدادات');
  working=new Set((result.hidden||[]).filter(x=>valid.has(x)));loadedAdmin=true;renderControls();panel.querySelector('#v97-search')?.focus();
 }catch(e){if(panel)panel.querySelector('#v97-groups').innerHTML=`<p class="v97-error">${escapeHTML(e.message||'تعذر تحميل الإعدادات. تحقق من الاتصال والصلاحيات.')}</p>`;}
}
async function save(){if(busy||!panel||!loadedAdmin)return;busy=true;renderControls();
 try{const resp=await api('v97/admin/student-ui',{method:'PUT',token:token(),body:{hidden:[...working]}});
  if(!resp?.ok)throw Error('لم تُحفظ الإعدادات');
  hidden=new Set(resp.hidden||[]);notify('تم حفظ إعدادات ظهور لوحة الطالب بنجاح.');close();
 }catch(e){if(panel){const status=panel.querySelector('#v97-status');if(status)status.textContent=e.message||'فشل الحفظ؛ لم يتم تغيير الإعدادات.';}}
 finally{busy=false;renderControls();}
}
function injectAdminButton(){
 const nav=document.querySelector('body[data-portal="admin"] #v39-all-links');
 if(!nav||nav.querySelector('.v97-nav-trigger'))return;
 const anchor=nav.querySelector('[data-view="settings"]');
 if(!anchor)return;
 const button=document.createElement('button');button.type='button';button.className='v22-side-link v97-nav-trigger';button.innerHTML='<span class="v22-side-glyph">◉</span><span class="v40-item-label">التحكم في ظهور لوحة الطالب</span><span class="v40-item-arrow">‹</span>';
 button.setAttribute('aria-haspopup','dialog');
 anchor.before(button);
}
function installAdmin(){
 document.addEventListener('click',e=>{
  if(e.target.closest('.v97-nav-trigger')){e.preventDefault();e.stopImmediatePropagation();void open();return;}
  if(!panel)return;
  if(e.target.closest('[data-v97-close]')){if(!busy)close();return;}
  if(loadedAdmin&&e.target.closest('#v97-show-all')){working.clear();renderControls();return;}
  if(loadedAdmin&&e.target.closest('#v97-hide-all')){working=new Set(valid);renderControls();return;}
  if(e.target.closest('#v97-save')){void save();}
 },true);
 document.addEventListener('change',e=>{if(!panel||!loadedAdmin||!e.target.matches('[data-v97-item]'))return;
  const id=e.target.dataset.v97Item;if(!valid.has(id))return;
  if(e.target.checked)working.delete(id);else working.add(id);renderControls();
 });
 document.addEventListener('input',e=>{if(e.target.id==='v97-search'){query=e.target.value.slice(0,100);renderControls();}},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel&&!busy){close();}});
 const observer=new MutationObserver(()=>injectAdminButton());
 observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
 injectAdminButton();
}
window.AcademyVisibilityV97={items:itemList,isHiddenRoute};
if(portal==='student'){installStudent();void reload();}else{installAdmin();}
})();
