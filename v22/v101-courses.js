/* EGTAZ V101 — Courses: catalog, course page, featured courses, teacher courses and admin management.
 * All access decisions are made by the server (api/v101-courses.php). This file only renders what the API returns. */
(()=>{'use strict';
const S={role:'',uid:'',view:'',cfg:{},nonce:0,pending:false,error:'',notice:'',
  catalog:null,catalogFor:'',scope:'mine',tab:'all',query:'',subject:'',
  course:null,courseId:'',loadingCourse:false,openItem:'',
  featured:null,featuredFor:'',featuredLoading:false,
  teacher:{list:null,perms:null,assignments:[]},
  admin:{tab:'courses',list:null,settings:null,teachers:[],filter:'all',codes:null,codesCourse:'',issued:[],enroll:null,enrollCourse:'',featured:null},
  ed:null,content:null,contentFor:''};

/* ---------- helpers ---------- */
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=(v,rel=false)=>{const s=String(v||'').trim();if(rel&&/^\.\/assets\/[\w./-]+$/.test(s)&&!s.includes('..'))return s;try{const u=new URL(s);return u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const TYPES={public:'التربية والتعليم',azhar:'الأزهر الشريف'};
const STAGES={primary:'الابتدائي',prep:'الإعدادي',sec:'الثانوي'};
const ORD=['','الأول','الثاني','الثالث','الرابع','الخامس','السادس'];
const BASE_SUBJECTS={arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',social:'الدراسات الاجتماعية',religion:'التربية الدينية',computer:'الحاسب الآلي',physics:'الفيزياء',chemistry:'الكيمياء',biology:'الأحياء',history:'التاريخ',geography:'الجغرافيا'};
const LEVELS={beginner:'تأسيس',intermediate:'متوسط',advanced:'متقدم',revision:'مراجعة نهائية'};
const KINDS={lesson:'درس من المنهج',quiz:'اختبار من المنهج',file:'ملف من المكتبة',video:'فيديو',pdf:'ملف PDF',link:'رابط خارجي',note:'ملاحظة مكتوبة'};
const gradeLabel=(stage,grade)=>grade?`الصف ${ORD[Number(grade)]||grade} ${STAGES[stage]||''}`:`كل صفوف ${STAGES[stage]||'المرحلة'}`;
function subjectName(c){try{const list=S.cfg.subjects?.(c.stage,String(c.grade||1),c.type)||[];const hit=list.find(x=>x.id===c.subject);if(hit?.name)return hit.name;}catch{}return BASE_SUBJECTS[c.subject]||c.subject||'';}
const money=n=>Number(n)>0?`${Number(n).toLocaleString('ar-EG')} ج.م`:'مجاني';
const dateAr=ms=>ms?new Date(Number(ms)).toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'}):'';
const P={book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',play:'<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',note:'<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>',quiz:'<path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="m9 13 2 2 4-4"/>',lock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12 4.5 4.5L19 7"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',arrow:'<path d="M19 12H5m6-6-6 6 6 6"/>',back:'<path d="M5 12h14m-6-6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',edit:'<path d="m15 4 5 5L9 20H4v-5z"/>',trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',ticket:'<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',chev:'<path d="m9 6 6 6-6 6" transform="rotate(180 12 12)"/>',sparkle:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',refresh:'<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
  whatsapp:'<path d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.2z"/><path d="M9 8.5c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.3 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .6a6.6 6.6 0 0 0 3 2.7c.2.1.4.1.6-.1l.6-.8c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5 0 .5-.3 1.3-1.1 1.7-.8.4-1.9.4-3.8-.5a10 10 0 0 1-3.8-3.6c-.7-1.3-.7-2.3-.3-3.3z"/>',
  facebook:'<path d="M14.5 8.5h2.5V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>',
  telegram:'<path d="m21 4-18 7 5.5 2 2 6 3-4 5 4z"/><path d="m8.5 13 8-5.5-6 7"/>',
  youtube:'<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  tiktok:'<path d="M14 3v11.5A3.5 3.5 0 1 1 10.5 11"/><path d="M14 3c.5 2.6 2.3 4.4 5 4.6"/>'};
const ic=(k,cls='')=>`<svg class="v101-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]||P.book}</svg>`;
const KIND_ICON={lesson:'book',quiz:'quiz',file:'file',video:'play',pdf:'file',link:'link',note:'note'};
const ERR={code_invalid:'صيغة الكود غير صحيحة. مثال: CRS-1A2B-3C4D-5E6F-7A8B',code_unavailable:'الكود غير صحيح أو تم إيقافه.',code_expired:'انتهت صلاحية هذا الكود.',code_exhausted:'تم استخدام هذا الكود بالكامل.',code_already_used:'استخدمت هذا الكود من قبل.',already_enrolled:'أنت مشترك بالفعل في هذا الكورس مدى الحياة.',course_unavailable:'الكورس غير متاح حاليًا.',course_not_found:'الكورس غير موجود أو لم يعد متاحًا.',too_many_requests:'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',forbidden:'ليست لديك صلاحية لهذا الإجراء.',permission_denied:'لا تملك صلاحية إنشاء الكورسات. تواصل مع الإدارة.',scope_not_assigned:'هذا الصف أو المادة خارج تكليفك الدراسي.',course_item_out_of_scope:'أحد عناصر الكورس خارج تكليفك الدراسي.',course_title_required:'اكتب عنوانًا للكورس (3 أحرف على الأقل).',course_subject_invalid:'اختر المادة.',course_price_invalid:'السعر غير صحيح.',course_cover_invalid:'رابط صورة الغلاف يجب أن يبدأ بـ https://',course_intro_invalid:'رابط فيديو المقدمة يجب أن يبدأ بـ https://',course_item_url_invalid:'أحد الروابط داخل المحتوى غير صحيح؛ يجب أن يبدأ بـ https://',course_item_missing:'أحد الدروس أو الملفات المختارة لم يعد موجودًا.',whatsapp_invalid:'رقم واتساب غير صحيح.',featured_course_invalid:'لا يمكن تمييز كورس غير منشور.',featured_limit:'الحد الأقصى 12 كورسًا مميزًا.',student_not_found:'لم نجد طالبًا بهذا البريد أو المعرف.',teacher_inactive:'حساب المعلم غير نشط.',action_not_allowed:'لا يمكن تنفيذ هذا الإجراء على حالة الكورس الحالية.',nothing_to_review:'لا يوجد ما يحتاج مراجعة.',max_uses_invalid:'عدد مرات الاستخدام من 1 إلى 500.',code_count_invalid:'عدد الأكواد من 1 إلى 50.',access_days_invalid:'مدة الوصول من 0 إلى 3650 يومًا.',expiration_invalid:'تاريخ انتهاء الكود غير صحيح.',course_grade_invalid:'الصف غير صحيح.',course_type_invalid:'اختر نوع التعليم.',course_stage_invalid:'اختر المرحلة.'};
const errText=e=>ERR[e?.data?.error]||(e?.code==='auth/network-request-failed'?'تعذر الاتصال بالخادم. تحقق من الإنترنت.':ERR[String(e?.message||'')]||'حدث خطأ غير متوقع. حاول مرة أخرى.');

function token(){const name={admin:'admin-portal',teacher:'teacher-portal',student:'[DEFAULT]'}[S.role];const a=window.AcademyBackend?.apps?.find(x=>x.name===name)?.auth();return a?._token?.()||'';}
const api=(route,opts={})=>window.AcademyBackend.request(route,{...opts,token:token()||undefined});
const root=()=>document.getElementById('v101-root');
const go=(view,more={})=>{if(S.cfg.navigate)S.cfg.navigate(view,more);else{const q=new URLSearchParams({view,...more});location.href=(S.role==='student'?'index.html':S.role+'.html')+'?'+q;}};
const flash=(msg,kind='ok')=>{S.notice=msg?{msg,kind}:'';};
const noticeHTML=()=>`${S.error?`<div class="v101-alert v101-alert-error" role="alert">${ic('close')}<span>${esc(S.error)}</span></div>`:''}${S.notice?`<div class="v101-alert v101-alert-${S.notice.kind}" role="status">${ic(S.notice.kind==='ok'?'check':'sparkle')}<span>${esc(S.notice.msg)}</span></div>`:''}`;
const skeleton=(n=3)=>`<div class="v101-grid" aria-busy="true">${Array.from({length:n},()=>`<div class="v101-card v101-skel"><div class="v101-cover"></div><div class="v101-card-body"><i></i><i></i><i class="short"></i></div></div>`).join('')}</div>`;
const emptyState=(title,text,action='')=>`<div class="v101-empty">${ic('book','v101-empty-ic')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
function ytId(u){try{const x=new URL(u);if(x.hostname.endsWith('youtu.be'))return x.pathname.slice(1,12);if(x.hostname.includes('youtube.com')){if(x.pathname.startsWith('/embed/')||x.pathname.startsWith('/shorts/'))return x.pathname.split('/')[2]?.slice(0,11);return x.searchParams.get('v')?.slice(0,11)||'';}}catch{}return '';}
function vimeoId(u){try{const x=new URL(u);if(x.hostname.endsWith('vimeo.com')){const m=x.pathname.match(/(\d{6,})/);return m?m[1]:'';}}catch{}return '';}
function embedUrl(u){const y=ytId(u);if(/^[\w-]{11}$/.test(y))return `https://www.youtube-nocookie.com/embed/${y}?rel=0`;const v=vimeoId(u);if(v)return `https://player.vimeo.com/video/${v}`;return '';}

/* ---------- shared course pieces ---------- */
function cover(c,big=false){const url=safeUrl(c.coverUrl,true);const hue=[...String(c.subject||'x')].reduce((a,ch)=>a+ch.charCodeAt(0),0)%360;
  return `<div class="v101-cover${big?' v101-cover-big':''}" style="--v101-hue:${hue}">${url?`<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="v101-cover-mark" aria-hidden="true">${ic('book')}<b>${esc(subjectName(c))}</b></span>`}</div>`;}
function accessBadge(c){const a=c.access;if(a==='enrolled')return `<span class="v101-badge v101-badge-ok">${ic('check')} مشترك</span>`;if(a==='plan')return `<span class="v101-badge v101-badge-ok">${ic('check')} ضمن اشتراكك</span>`;if(a==='free'||Number(c.price)<=0)return `<span class="v101-badge v101-badge-free">مجاني</span>`;return '';}
function counts(c){const k=c.counts||{};const parts=[];if(k.lessons)parts.push(`${ic('book')} ${k.lessons} درس`);if(k.videos)parts.push(`${ic('play')} ${k.videos} فيديو`);if(k.quizzes)parts.push(`${ic('quiz')} ${k.quizzes} اختبار`);if(k.files)parts.push(`${ic('file')} ${k.files} ملف`);return parts.length?`<div class="v101-meta">${parts.map(p=>`<span>${p}</span>`).join('')}</div>`:'';}
function priceTag(c){return `<div class="v101-price"><strong>${esc(money(c.price))}</strong>${c.oldPrice&&Number(c.oldPrice)>Number(c.price)?`<s>${esc(money(c.oldPrice))}</s>`:''}</div>`;}
function teacherLine(t){if(!t)return '<p class="v101-teacher">أكاديمية اجتاز</p>';const pic=safeUrl(t.photoUrl,true);return `<p class="v101-teacher">${pic?`<img src="${esc(pic)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="v101-avatar">${ic('user')}</span>`}<span>${esc(t.name)}</span></p>`;}
function card(c){return `<a class="v101-card" href="index.html?view=v101-course&id=${encodeURIComponent(c.id)}" data-v101-open="${esc(c.id)}">
  ${cover(c)}${accessBadge(c)}
  <div class="v101-card-body"><div class="v101-chips"><span>${esc(subjectName(c))}</span><span>${esc(gradeLabel(c.stage,c.grade))}</span>${c.level?`<span>${esc(LEVELS[c.level]||'')}</span>`:''}</div>
  <h3 class="v101-title">${esc(c.title)}</h3>${c.subtitle?`<p class="v101-sub">${esc(c.subtitle)}</p>`:''}${teacherLine(c.teacher)}${counts(c)}
  <div class="v101-card-foot">${priceTag(c)}<span class="v101-more">التفاصيل ${ic('arrow')}</span></div></div></a>`;}

/* ---------- featured (student home) ---------- */
async function loadFeatured(){if(S.featuredLoading)return;S.featuredLoading=true;const uid=S.uid;try{const r=await api('v101/courses/featured');if(uid===S.uid)S.featured=r.courses||[];}catch{if(uid===S.uid)S.featured=[];}finally{S.featuredLoading=false;if(uid===S.uid){S.featuredFor=uid;paintFeatured();}}}
function featuredHTML(){if(!S.featured?.length)return '';return `<section class="v101-featured" aria-label="كورسات مختارة"><div class="v101-head"><div><span class="v101-kicker">${ic('sparkle')} مختارة لك</span><h2>كورسات مميزة لصفك</h2></div><a class="v101-link" href="index.html?view=v101-courses" data-v101-go="v101-courses">كل الكورسات ${ic('arrow')}</a></div><div class="v101-rail">${S.featured.map(card).join('')}</div></section>`;}
function paintFeatured(){document.querySelectorAll('[data-v101-featured]').forEach(el=>{el.innerHTML=featuredHTML();});}
function featured(el){if(!el)return;el.setAttribute('data-v101-featured','');if(S.featured&&S.featuredFor===S.uid){el.innerHTML=featuredHTML();return;}el.innerHTML='';void loadFeatured();}

/* ---------- teacher public page (student portal) ---------- */
const tCache={};
async function teacherCourses(el,teacherId){if(!el||!teacherId)return;const paint=()=>{const list=tCache[teacherId];el.innerHTML=list&&list.length?`<section class="v101-featured v101-teacher-courses" aria-label="كورسات المعلم"><div class="v101-head"><div><span class="v101-kicker">${ic('book')} كورسات المعلم</span><h2>كورسات منشورة</h2></div></div><div class="v101-rail">${list.map(card).join('')}</div></section>`:'';};
  if(tCache[teacherId]!==undefined)return paint();tCache[teacherId]=null;try{const r=await api('v101/courses',{query:{teacher:teacherId}});tCache[teacherId]=r.courses||[];}catch{tCache[teacherId]=[];}
  document.querySelectorAll(`[data-v101-teacher-courses="${CSS.escape(teacherId)}"]`).forEach(x=>{el=x;paint();});}

/* ---------- student: catalog ---------- */
async function loadCatalog(force=false){const key=S.uid+'|'+S.scope;if(!force&&S.catalog&&S.catalogFor===key)return;S.pending=true;S.error='';draw();
  try{const query={};if(S.role==='student'&&S.uid&&S.scope==='mine')query.scope='mine';const r=await api('v101/courses',{query});S.catalog=r.courses||[];S.catalogFor=key;S.profile=r.profile;}catch(e){S.error=errText(e);S.catalog=S.catalog||[];}finally{S.pending=false;draw();}}
function catalogUI(){
  const list=S.catalog;const q=S.query.trim().toLocaleLowerCase('ar');
  let items=(list||[]).filter(c=>S.tab!=='mine'||['enrolled','plan','free'].includes(c.access));
  const subjects=[...new Map(items.map(c=>[c.subject,subjectName(c)])).entries()];
  if(S.subject)items=items.filter(c=>c.subject===S.subject);
  if(q)items=items.filter(c=>[c.title,c.subtitle,subjectName(c),c.teacher?.name].join(' ').toLocaleLowerCase('ar').includes(q));
  const loggedStudent=S.role==='student'&&S.uid;
  return `<div class="v101-page">
  <header class="v101-hero"><div><span class="v101-kicker">${ic('sparkle')} كورسات اجتاز</span><h1>تعلّم بخطة واضحة مع أفضل المعلمين</h1><p>كورسات منظمة لكل مادة: شروحات وفيديوهات وملفات واختبارات في مكان واحد.</p></div>
  ${loggedStudent?redeemBox():`<div class="v101-hero-cta"><a class="v101-btn v101-btn-light" href="index.html?view=login" data-action="login">سجّل الدخول لتفعيل كورساتك</a></div>`}</header>
  ${noticeHTML()}
  <div class="v101-toolbar">
   <label class="v101-search">${ic('search')}<input id="v101-q" type="search" value="${esc(S.query)}" placeholder="ابحث باسم الكورس أو المعلم أو المادة" aria-label="بحث في الكورسات" maxlength="80"></label>
   ${loggedStudent?`<div class="v101-seg" role="tablist" aria-label="عرض"><button type="button" role="tab" aria-selected="${S.tab==='all'}" data-v101-tab="all">كل الكورسات</button><button type="button" role="tab" aria-selected="${S.tab==='mine'}" data-v101-tab="mine">كورساتي</button></div>`:''}
  </div>
  <div class="v101-filters" role="group" aria-label="تصفية حسب المادة"><button type="button" class="v101-pill" aria-pressed="${!S.subject}" data-v101-subject="">كل المواد</button>${subjects.map(([id,name])=>`<button type="button" class="v101-pill" aria-pressed="${S.subject===id}" data-v101-subject="${esc(id)}">${esc(name)}</button>`).join('')}
   ${loggedStudent?`<label class="v101-switch"><input type="checkbox" id="v101-scope" ${S.scope==='mine'?'checked':''}><span>كورسات صفي فقط${S.profile?` (${esc(gradeLabel(S.profile.stage,S.profile.grade))})`:''}</span></label>`:''}</div>
  ${list===null||S.pending&&!list.length?skeleton(6):items.length?`<div class="v101-grid">${items.map(card).join('')}</div>`:emptyState(S.tab==='mine'?'لم تشترك في كورسات بعد':'لا توجد كورسات مطابقة',S.tab==='mine'?'تصفح الكورسات المتاحة، واشترك عبر واتساب ثم فعّل الكود هنا.':(q||S.subject?'جرّب كلمة بحث أخرى أو اختر مادة مختلفة.':'ستظهر الكورسات هنا فور نشرها من الإدارة.'),(q||S.subject)?`<button type="button" class="v101-btn v101-btn-ghost" data-v101-clear>مسح البحث</button>`:'')}
  </div>`;}
function redeemBox(){return `<form class="v101-redeem" id="v101-redeem-form" autocomplete="off"><label for="v101-code">${ic('ticket')} عندك كود تفعيل؟</label><div class="v101-redeem-row"><input id="v101-code" name="code" dir="ltr" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="CRS-XXXX-XXXX-XXXX-XXXX" maxlength="30" required><button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>تفعيل</button></div></form>`;}

/* ---------- student: course page ---------- */
async function loadCourse(id,force=false){if(!id){S.course=null;S.error='الكورس غير محدد.';draw();return;}if(!force&&S.course?.id===id&&S.courseFor===S.uid)return;S.loadingCourse=true;S.error='';S.courseId=id;draw();
  try{const r=await api('v101/course',{query:{id}});S.course=r.course;S.courseFor=S.uid;}catch(e){S.course=null;S.error=errText(e);}finally{S.loadingCourse=false;draw();}}
function waLink(c){const phone=String(c.contact?.whatsapp||'').replace(/\D/g,'');if(!phone)return '';const me=S.cfg.user?.()||{};
  const text=String(c.contact?.messageTemplate||'').replace(/\{course\}/g,c.title).replace(/\{subject\}/g,subjectName(c)).replace(/\{grade\}/g,gradeLabel(c.stage,c.grade)).replace(/\{price\}/g,money(c.price)).replace(/\{student\}/g,me.displayName||'').replace(/\{account\}/g,me.email||'').replace(/\{link\}/g,location.origin+location.pathname+'?view=v101-course&id='+encodeURIComponent(c.id));
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;}
function purchaseCard(c){const enrolled=c.access==='enrolled';const until=c.accessEndsAt?`حتى ${dateAr(c.accessEndsAt)}`:'مدى الحياة';
  let body='';
  if(['enrolled','plan','free','admin','owner'].includes(c.access)){body=`<div class="v101-state v101-state-ok">${ic('check')}<div><strong>${c.access==='enrolled'?'اشتراكك فعّال':c.access==='plan'?'متاح ضمن خطة اشتراكك':c.access==='free'?'كورس مجاني ومتاح لك':'عرض كامل للمحتوى'}</strong>${enrolled?`<small>${esc(until)}</small>`:''}</div></div><button type="button" class="v101-btn v101-btn-primary v101-btn-block" data-v101-start>${ic('play')} ابدأ التعلم</button>`;}
  else if(!S.uid){body=`<p class="v101-muted">سجّل الدخول بحساب الطالب لتتمكن من الاشتراك وتفعيل الكورس.</p><a class="v101-btn v101-btn-primary v101-btn-block" href="index.html?view=login" data-action="login">تسجيل الدخول</a>`;}
  else if(S.role==='student'){const wa=waLink(c);body=`${wa?`<a class="v101-btn v101-btn-wa v101-btn-block" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${ic('whatsapp')} اشترك عبر واتساب</a><p class="v101-muted v101-small">سيفتح واتساب برسالة جاهزة باسم الكورس. بعد إتمام الدفع ستصلك كود التفعيل.</p>`:`<p class="v101-muted">للاشتراك تواصل مع إدارة الأكاديمية.</p>`}<div class="v101-divider"><span>أو</span></div>${redeemBox()}`;}
  else body=`<p class="v101-muted">معاينة بصلاحية ${S.role==='admin'?'الإدارة':'المعلم'}.</p>`;
  return `<aside class="v101-buy" aria-label="الاشتراك في الكورس">${cover(c,true)}<div class="v101-buy-body">${priceTag(c)}${c.planUnlocks&&c.access==='locked'?'<p class="v101-small v101-muted">يُفتح أيضًا لمشتركي الخطط العامة المناسبة.</p>':''}${body}
  <ul class="v101-facts"><li>${ic('book')} ${esc(subjectName(c))} · ${esc(gradeLabel(c.stage,c.grade))}</li><li>${ic('grid')} ${(c.counts?.items||0)} عنصر تعليمي</li>${c.level?`<li>${ic('star')} المستوى: ${esc(LEVELS[c.level]||'')}</li>`:''}<li>${ic('clock')} آخر تحديث ${esc(dateAr(c.updatedAt))}</li></ul></div></aside>`;}
function itemRow(it,c){const kind=it.kind;const lock=it.locked;const open=S.openItem===it.id;let meta=KINDS[kind]||'';
  if(it.missing)meta='غير متاح حاليًا';else if(kind==='lesson'&&it.videos)meta+=` · ${it.videos} فيديو`;else if(kind==='quiz'&&it.questions)meta+=` · ${it.questions} سؤال`;
  const action=lock?`<span class="v101-lock" title="يُفتح بعد الاشتراك">${ic('lock')}</span>`:it.preview&&!['enrolled','plan','free','admin','owner'].includes(c.access)?'<span class="v101-tag">معاينة مجانية</span>':`<span class="v101-go">${ic('arrow')}</span>`;
  const expanded=open&&kind==='note'&&it.text?`<div class="v101-note">${esc(it.text).replace(/\n/g,'<br>')}</div>`:'';
  return `<li class="v101-item ${lock?'is-locked':''}"><button type="button" class="v101-item-btn" data-v101-item="${esc(it.id)}" ${lock||it.missing?'aria-disabled="true"':''} ${kind==='note'?`aria-expanded="${open}"`:''}><span class="v101-item-ic">${ic(KIND_ICON[kind])}</span><span class="v101-item-text"><strong>${esc(it.title||KINDS[kind])}</strong><small>${esc(meta)}</small></span>${action}</button>${expanded}</li>`;}
function socialBar(){const s=S.cfg.settings?.()||{};const links=Object.assign({},s.socialLinks||{});if(!links.whatsapp&&s.whatsapp){const d=String(s.whatsapp).replace(/\D/g,'');if(d)links.whatsapp='https://wa.me/'+d;}
  if((s.appearanceBrand||{}).hideSocialLinks)return '';const names={whatsapp:'واتساب',facebook:'فيسبوك',telegram:'تليجرام',youtube:'يوتيوب',tiktok:'تيك توك'};
  const out=Object.keys(names).map(k=>[k,safeUrl(links[k])]).filter(x=>x[1]);if(!out.length)return '';
  return `<section class="v101-social" aria-label="تواصل معنا"><h3>تابع أكاديمية اجتاز</h3><div class="v101-social-row">${out.map(([k,u])=>`<a class="v101-soc v101-soc-${k}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${names[k]}">${ic(k)}<span>${names[k]}</span></a>`).join('')}</div></section>`;}
function courseUI(){const c=S.course;
  if(S.loadingCourse&&!c)return `<div class="v101-page"><div class="v101-detail-skel" aria-busy="true"><i></i><i></i><i></i></div></div>`;
  if(!c)return `<div class="v101-page">${noticeHTML()}${emptyState('الكورس غير متاح',S.error||'ربما أُخفي الكورس أو تغير رابطه.',`<button type="button" class="v101-btn v101-btn-primary" data-v101-go="v101-courses">تصفح الكورسات</button>`)}</div>`;
  const intro=c.introUrl&&embedUrl(c.introUrl);const totalLocked=(c.sections||[]).reduce((n,s)=>n+s.items.filter(i=>i.locked).length,0);
  return `<div class="v101-page v101-detail">
  <button type="button" class="v101-back" data-v101-go="v101-courses">${ic('back')} كل الكورسات</button>
  ${noticeHTML()}
  <div class="v101-detail-grid"><main class="v101-detail-main">
   <header class="v101-detail-head"><div class="v101-chips"><span>${esc(subjectName(c))}</span><span>${esc(gradeLabel(c.stage,c.grade))}</span><span>${esc(TYPES[c.type]||'')}</span>${c.level?`<span>${esc(LEVELS[c.level])}</span>`:''}</div>
    <h1>${esc(c.title)}</h1>${c.subtitle?`<p class="v101-lead">${esc(c.subtitle)}</p>`:''}${teacherLine(c.teacher)}${counts(c)}</header>
   ${intro?`<div class="v101-player"><iframe src="${esc(intro)}" title="فيديو تعريفي بالكورس" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`:''}
   ${c.description?`<section class="v101-block"><h2>عن الكورس</h2><p class="v101-desc">${esc(c.description).replace(/\n/g,'<br>')}</p></section>`:''}
   ${(c.outcomes||[]).length?`<section class="v101-block"><h2>ماذا ستتعلم؟</h2><ul class="v101-outcomes">${c.outcomes.map(o=>`<li>${ic('check')}<span>${esc(o)}</span></li>`).join('')}</ul></section>`:''}
   <section class="v101-block" id="v101-curriculum"><div class="v101-block-head"><h2>محتوى الكورس</h2>${totalLocked?`<small>${ic('lock')} ${totalLocked} عنصر يُفتح بعد الاشتراك</small>`:''}</div>
    ${(c.sections||[]).length?(c.sections||[]).map((s,i)=>`<details class="v101-section" ${i===0?'open':''}><summary><span class="v101-sec-no">${i+1}</span><span class="v101-sec-title">${esc(s.title)}</span><small>${s.items.length} عنصر</small>${ic('down','v101-sec-chev')}</summary><ul class="v101-items">${s.items.map(it=>itemRow(it,c)).join('')||'<li class="v101-muted v101-small">لا توجد عناصر بعد.</li>'}</ul></details>`).join(''):emptyState('المحتوى قيد الإعداد','سيضيف المعلم الدروس قريبًا.')}
   </section>
   ${socialBar()}
  </main>${purchaseCard(c)}</div>
  ${!['enrolled','plan','free','admin','owner'].includes(c.access)&&S.role==='student'?`<div class="v101-mobile-bar">${priceTag(c)}${S.uid&&waLink(c)?`<a class="v101-btn v101-btn-wa" href="${esc(waLink(c))}" target="_blank" rel="noopener noreferrer">${ic('whatsapp')} اشترك الآن</a>`:`<button type="button" class="v101-btn v101-btn-primary" data-v101-scrollbuy>اشترك الآن</button>`}</div>`:''}
  <dialog class="v101-modal" id="v101-modal" aria-label="مشغل الفيديو"><div class="v101-modal-box"><button type="button" class="v101-modal-x" data-v101-close aria-label="إغلاق">${ic('close')}</button><div class="v101-player" id="v101-modal-player"></div></div></dialog>
  </div>`;}
function openItem(id){const c=S.course;if(!c)return;const it=(c.sections||[]).flatMap(s=>s.items).find(x=>x.id===id);if(!it||it.locked||it.missing){if(it?.locked){document.querySelector('.v101-buy')?.scrollIntoView({behavior:'smooth',block:'center'});}return;}
  if(it.kind==='note'){S.openItem=S.openItem===id?'':id;draw();return;}
  if(it.kind==='lesson'&&it.refId)return go('lesson',{id:it.refId,type:c.type,stage:c.stage,grade:String(c.grade||1),subject:c.subject});
  if(it.kind==='quiz'&&it.lessonId)return go('lesson',{id:it.lessonId,type:c.type,stage:c.stage,grade:String(c.grade||1),subject:c.subject});
  const url=safeUrl(it.url);if(!url)return;
  const emb=it.kind==='video'&&embedUrl(url);
  if(emb){const d=document.getElementById('v101-modal'),p=document.getElementById('v101-modal-player');if(d&&p&&d.showModal){p.innerHTML=`<iframe src="${esc(emb)}&autoplay=1" title="${esc(it.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;d.showModal();return;}}
  window.open(url,'_blank','noopener,noreferrer');}

/* ---------- editor (teacher + admin) ---------- */
const blankCourse=()=>({id:'',title:'',subtitle:'',description:'',outcomes:[],coverUrl:'',introUrl:'',type:'public',stage:'sec',grade:'',subject:'',price:0,oldPrice:'',level:'',planUnlocks:false,status:'draft',teacherId:'',sections:[{id:'',title:'الوحدة الأولى',items:[]}]});
async function loadContent(){const key=S.role;if(S.content&&S.contentFor===key)return;try{const r=await api(S.role==='admin'?'v101/admin/content':'v101/teacher/content');S.content={lessons:r.lessons||[],quizzes:r.quizzes||[],files:r.files||[]};S.contentFor=key;}catch(e){S.content={lessons:[],quizzes:[],files:[]};}draw();}
function inScope(n,e){return (!e.type||n.type===e.type)&&(!e.stage||n.stage===e.stage)&&(!e.grade||String(n.grade)===String(e.grade))&&(!e.subject||n.subject===e.subject);}
function scopeFields(e){
  if(S.role==='teacher'){const a=S.teacher.assignments||[];const val=a.findIndex(x=>(x.type||'')===e.type&&(x.stage||'')===e.stage&&String(x.grade||'')===String(e.grade||'')&&(x.subject||'')===e.subject);
    return `<label class="v101-field v101-span2">الصف والمادة (من تكليفك)<select data-v101-scope-pick required><option value="">اختر</option>${a.map((x,i)=>`<option value="${i}" ${i===val?'selected':''}>${esc((x.subjectName||BASE_SUBJECTS[x.subject]||x.subject||'كل المواد'))} — ${esc(gradeLabel(x.stage,x.grade))} · ${esc(TYPES[x.type]||'')}</option>`).join('')}</select></label>`;}
  const subs=(()=>{try{return S.cfg.subjects?.(e.stage,String(e.grade||1),e.type)||[];}catch{return [];}})();const list=subs.length?subs.map(s=>[s.id,s.name]):Object.entries(BASE_SUBJECTS);
  return `<label class="v101-field">نوع التعليم<select data-v101-f="type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${e.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="v101-field">المرحلة<select data-v101-f="stage">${Object.entries(STAGES).map(([k,v])=>`<option value="${k}" ${e.stage===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="v101-field">الصف<select data-v101-f="grade"><option value="">كل صفوف المرحلة</option>${Array.from({length:e.stage==='primary'?6:3},(_,i)=>`<option value="${i+1}" ${String(e.grade)===String(i+1)?'selected':''}>${ORD[i+1]}</option>`).join('')}</select></label>
  <label class="v101-field">المادة<select data-v101-f="subject" required><option value="">اختر المادة</option>${list.map(([k,v])=>`<option value="${esc(k)}" ${e.subject===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;}
function itemEditor(it,si,ii,e){const kind=it.kind;let main='';
  if(['lesson','quiz','file'].includes(kind)){const pool=(S.content?.[{lesson:'lessons',quiz:'quizzes',file:'files'}[kind]]||[]).filter(n=>inScope(n,e));
    main=S.content?`<select data-v101-i="refId" aria-label="اختر العنصر"><option value="">— اختر ${esc(KINDS[kind])} —</option>${pool.map(n=>`<option value="${esc(n.id)}" ${n.id===it.refId?'selected':''}>${n.unit?`الوحدة ${esc(n.unit)} · `:''}${esc(n.title)}</option>`).join('')}${it.refId&&!pool.some(n=>n.id===it.refId)?`<option value="${esc(it.refId)}" selected>${esc(it.refId)} (خارج النطاق الحالي)</option>`:''}</select>${!pool.length?'<small class="v101-muted">لا يوجد محتوى منشور مطابق لصف الكورس ومادته.</small>':''}`:'<small class="v101-muted">جارٍ تحميل محتوى المنهج...</small>';}
  else if(kind==='note')main=`<textarea data-v101-i="text" rows="3" maxlength="5000" placeholder="نص الملاحظة">${esc(it.text||'')}</textarea>`;
  else main=`<input data-v101-i="url" dir="ltr" type="url" placeholder="https://..." value="${esc(it.url||'')}">`;
  return `<li class="v101-ed-item" data-si="${si}" data-ii="${ii}"><span class="v101-item-ic">${ic(KIND_ICON[kind])}</span><div class="v101-ed-item-main"><div class="v101-ed-row"><input data-v101-i="title" placeholder="${['lesson','quiz','file'].includes(kind)?'العنوان (اختياري، يُستخدم عنوان العنصر تلقائيًا)':'عنوان العنصر'}" maxlength="150" value="${esc(it.title||'')}"><span class="v101-kind">${esc(KINDS[kind])}</span></div>${main}<label class="v101-check"><input type="checkbox" data-v101-i="preview" ${it.preview?'checked':''}> معاينة مجانية لغير المشتركين</label></div>
  <div class="v101-ed-tools"><button type="button" data-v101-ed="item-up" aria-label="لأعلى">${ic('up')}</button><button type="button" data-v101-ed="item-down" aria-label="لأسفل">${ic('down')}</button><button type="button" data-v101-ed="item-del" aria-label="حذف العنصر" class="danger">${ic('trash')}</button></div></li>`;}
function editorUI(){const e=S.ed;if(!e)return '';const admin=S.role==='admin';
  return `<form class="v101-editor" id="v101-editor" novalidate>
  <div class="v101-ed-head"><button type="button" class="v101-back" data-v101-ed="close">${ic('back')} رجوع</button><h2>${e.id?'تعديل الكورس':'كورس جديد'}</h2>${e.hasPendingRevision?'<span class="v101-badge v101-badge-wait">تعديل بانتظار المراجعة</span>':''}</div>
  ${noticeHTML()}
  <fieldset class="v101-panel"><legend>البيانات الأساسية</legend><div class="v101-form-grid">
   <label class="v101-field v101-span2">عنوان الكورس<input data-v101-f="title" required maxlength="150" value="${esc(e.title)}" placeholder="مثال: المراجعة النهائية في الكيمياء"></label>
   <label class="v101-field v101-span2">وصف مختصر يظهر على البطاقة<input data-v101-f="subtitle" maxlength="220" value="${esc(e.subtitle)}"></label>
   <label class="v101-field v101-span2">تفاصيل الكورس<textarea data-v101-f="description" rows="5" maxlength="4000">${esc(e.description)}</textarea></label>
   <label class="v101-field v101-span2">ماذا سيتعلم الطالب؟ (نقطة في كل سطر)<textarea data-v101-f="outcomes" rows="4" maxlength="1600">${esc((e.outcomes||[]).join('\n'))}</textarea></label>
   ${scopeFields(e)}
   <label class="v101-field">المستوى<select data-v101-f="level"><option value="">بدون</option>${Object.entries(LEVELS).map(([k,v])=>`<option value="${k}" ${e.level===k?'selected':''}>${v}</option>`).join('')}</select></label>
   ${admin?`<label class="v101-field">المعلم<select data-v101-f="teacherId"><option value="">أكاديمية اجتاز</option>${S.admin.teachers.map(t=>`<option value="${esc(t.id)}" ${e.teacherId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>`:''}
  </div></fieldset>
  <fieldset class="v101-panel"><legend>السعر والوصول</legend><div class="v101-form-grid">
   <label class="v101-field">السعر بالجنيه (0 = مجاني)<input data-v101-f="price" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${esc(e.price)}"></label>
   <label class="v101-field">السعر قبل الخصم (اختياري)<input data-v101-f="oldPrice" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${esc(e.oldPrice??'')}"></label>
   ${admin?`<label class="v101-check v101-span2"><input type="checkbox" data-v101-f="planUnlocks" ${e.planUnlocks?'checked':''}> يُفتح تلقائيًا لمشتركي الخطط العامة التي تشمل المادة والصف</label>`:'<p class="v101-small v101-muted v101-span2">الإدارة تحدد إن كان الكورس يُفتح لمشتركي الخطط العامة.</p>'}
  </div></fieldset>
  <fieldset class="v101-panel"><legend>الوسائط</legend><div class="v101-form-grid">
   <label class="v101-field v101-span2">رابط صورة الغلاف (https)<input data-v101-f="coverUrl" dir="ltr" type="url" value="${esc(e.coverUrl)}" placeholder="https://..."></label>
   <label class="v101-field v101-span2">فيديو تعريفي (يوتيوب أو Vimeo)<input data-v101-f="introUrl" dir="ltr" type="url" value="${esc(e.introUrl)}" placeholder="https://www.youtube.com/watch?v=..."></label>
  </div></fieldset>
  <fieldset class="v101-panel"><legend>محتوى الكورس</legend><p class="v101-small v101-muted">اجمع دروسًا واختبارات وملفات من المنهج، وأضف فيديوهات وملفات PDF وملاحظات خاصة بالكورس. العناصر الخاصة لا تظهر إلا للمشتركين، إلا إذا فعّلت المعاينة المجانية.</p>
   ${(e.sections||[]).map((s,si)=>`<div class="v101-ed-section" data-si="${si}"><div class="v101-ed-row"><span class="v101-sec-no">${si+1}</span><input data-v101-s="title" value="${esc(s.title)}" maxlength="150" placeholder="عنوان القسم" aria-label="عنوان القسم"><div class="v101-ed-tools"><button type="button" data-v101-ed="sec-up" aria-label="القسم لأعلى">${ic('up')}</button><button type="button" data-v101-ed="sec-down" aria-label="القسم لأسفل">${ic('down')}</button><button type="button" class="danger" data-v101-ed="sec-del" aria-label="حذف القسم">${ic('trash')}</button></div></div>
    <ul class="v101-ed-items">${(s.items||[]).map((it,ii)=>itemEditor(it,si,ii,e)).join('')}</ul>
    <div class="v101-add-row"><label>إضافة<select data-v101-add="${si}"><option value="">+ عنصر جديد</option>${Object.entries(KINDS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label></div></div>`).join('')}
   <button type="button" class="v101-btn v101-btn-ghost" data-v101-ed="sec-add">${ic('plus')} إضافة قسم</button>
  </fieldset>
  <div class="v101-ed-actions">
   ${admin?`<label class="v101-field v101-inline">الحالة<select data-v101-f="status"><option value="draft" ${e.status==='draft'?'selected':''}>مسودة</option><option value="published" ${e.status==='published'?'selected':''}>منشور</option><option value="hidden" ${e.status==='hidden'?'selected':''}>مخفي</option></select></label><button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>حفظ الكورس</button>`
   :`<button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>${S.teacher.perms?.publish?'حفظ ونشر':'إرسال للمراجعة'}</button><button type="button" class="v101-btn v101-btn-ghost" data-v101-ed="draft" ${S.pending?'disabled':''}>حفظ كمسودة</button>`}
  </div></form>`;}
function edPayload(){const e=S.ed;return {id:e.id||undefined,title:e.title,subtitle:e.subtitle,description:e.description,outcomes:(e.outcomes||[]).filter(Boolean),coverUrl:e.coverUrl,introUrl:e.introUrl,type:e.type,stage:e.stage,grade:String(e.grade||''),subject:e.subject,price:Number(e.price)||0,oldPrice:e.oldPrice===''||e.oldPrice==null?null:Number(e.oldPrice),level:e.level,planUnlocks:!!e.planUnlocks,teacherId:e.teacherId,status:e.status,
  sections:(e.sections||[]).map(s=>({id:s.id||undefined,title:s.title,items:(s.items||[]).map(it=>({id:it.id||undefined,kind:it.kind,title:it.title||'',refId:it.refId||undefined,url:it.url||undefined,text:it.text||undefined,preview:!!it.preview}))}))};}
async function saveEditor(draft=false){if(S.pending)return;const e=S.ed;
  if((e.title||'').trim().length<3){S.error=ERR.course_title_required;return draw();}if(!e.subject){S.error=ERR.course_subject_invalid;return draw();}
  const badRef=(e.sections||[]).flatMap(s=>s.items).find(it=>['lesson','quiz','file'].includes(it.kind)&&!it.refId);if(badRef){S.error='اختر الدرس أو الاختبار أو الملف لكل عنصر من عناصر المنهج، أو احذف العنصر الفارغ.';return draw();}
  S.pending=true;S.error='';draw();
  try{const body=edPayload();if(draft)body.draft=true;const r=await api(S.role==='admin'?'v101/admin/course/save':'v101/teacher/course/save',{method:'POST',body});
    S.ed=null;flash(S.role==='admin'?'تم حفظ الكورس.':({published:'تم نشر الكورس.',pending:'أُرسل الكورس للإدارة للمراجعة.',draft:'تم حفظ المسودة.',revision_pending:'أُرسل التعديل للمراجعة. يبقى الكورس المنشور كما هو حتى الموافقة.'}[r.state]||'تم الحفظ.'));
    S.pending=false;S.teacher.list=null;S.admin.list=null;S.catalog=null;S.featured=null;await (S.role==='admin'?loadAdmin(true):loadTeacher(true));}
  catch(err){S.pending=false;S.error=errText(err);draw();}}
async function openEditor(id){S.error='';S.notice='';if(!id){S.ed=blankCourse();if(S.role==='teacher'&&S.teacher.assignments?.length===1){const a=S.teacher.assignments[0];Object.assign(S.ed,{type:a.type||'public',stage:a.stage||'sec',grade:String(a.grade||''),subject:a.subject||''});}draw();void loadContent();window.scrollTo(0,0);return;}
  S.pending=true;draw();try{const r=await api(S.role==='admin'?'v101/admin/course':'v101/teacher/course',{query:{id}});const c=r.course;S.ed=Object.assign(blankCourse(),c,{id,grade:String(c.grade||''),oldPrice:c.oldPrice??'',sections:(c.sections||[]).map(s=>({...s,items:[...(s.items||[])]}))});}
  catch(e){S.error=errText(e);}finally{S.pending=false;draw();void loadContent();window.scrollTo(0,0);}}

/* ---------- teacher ---------- */
async function loadTeacher(force=false){if(!force&&S.teacher.list)return;S.pending=true;draw();try{const r=await api('v101/teacher/courses');S.teacher={list:r.courses||[],perms:r.permissions,assignments:r.assignments||[]};}catch(e){S.error=errText(e);S.teacher.list=S.teacher.list||[];}finally{S.pending=false;draw();}}
const STATUS={draft:['مسودة','muted'],pending:['بانتظار المراجعة','wait'],published:['منشور','ok'],hidden:['مخفي','muted'],rejected:['يحتاج تعديل','bad'],archived:['مؤرشف','muted']};
const codeBadge=s=>{const [t,k]={active:['فعّال','ok'],exhausted:['مستنفد','muted'],disabled:['موقوف','bad']}[s]||[s,'muted'];return `<span class="v101-badge v101-badge-${k}">${esc(t)}</span>`;};
const statusBadge=s=>{const [t,k]=STATUS[s]||[s,'muted'];return `<span class="v101-badge v101-badge-${k}">${esc(t)}</span>`;};
function teacherUI(){if(S.ed)return `<div class="v101-page">${editorUI()}</div>`;const t=S.teacher;const list=t.list;
  return `<div class="v101-page"><header class="v101-hero v101-hero-compact"><div><span class="v101-kicker">${ic('book')} مساحة المعلم</span><h1>كورساتي</h1><p>${t.perms?.publish?'لديك صلاحية النشر المباشر.':'تُراجع الإدارة الكورسات الجديدة والتعديلات قبل ظهورها للطلاب.'}</p></div>${t.perms?.create!==false?`<button type="button" class="v101-btn v101-btn-light" data-v101-new>${ic('plus')} كورس جديد</button>`:''}</header>
  ${noticeHTML()}
  ${list===null?skeleton(3):list.length?`<div class="v101-list">${list.map(c=>`<article class="v101-row">${cover(c)}<div class="v101-row-main"><div class="v101-row-top">${statusBadge(c.status)}${c.hasPendingRevision?'<span class="v101-badge v101-badge-wait">تعديل بانتظار المراجعة</span>':''}</div><h3>${esc(c.title)}</h3><p class="v101-small v101-muted">${esc(subjectName(c))} · ${esc(gradeLabel(c.stage,c.grade))} · ${esc(money(c.price))} · <span class="v101-nowrap">${ic('users')} ${c.enrolled||0} مشترك</span></p>${c.reviewNote?`<p class="v101-review-note">${ic('note')} ملاحظة الإدارة: ${esc(c.reviewNote)}</p>`:''}</div>
   <div class="v101-row-actions"><button type="button" class="v101-btn v101-btn-ghost" data-v101-edit="${esc(c.id)}">${ic('edit')} تعديل</button>${c.status==='published'?`<a class="v101-btn v101-btn-ghost" href="index.html?view=v101-course&id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">${ic('eye')} عرض</a>`:''}${c.status==='draft'?`<button type="button" class="v101-btn v101-btn-primary" data-v101-tact="submit" data-id="${esc(c.id)}">${t.perms?.publish?'نشر':'إرسال للمراجعة'}</button>`:''}${['pending','rejected'].includes(c.status)?`<button type="button" class="v101-btn v101-btn-ghost" data-v101-tact="withdraw" data-id="${esc(c.id)}">سحب للمسودة</button>`:''}${c.hasPendingRevision?`<button type="button" class="v101-btn v101-btn-ghost" data-v101-tact="discard-revision" data-id="${esc(c.id)}">إلغاء التعديل</button>`:''}${['draft','rejected','pending'].includes(c.status)?`<button type="button" class="v101-btn v101-btn-danger" data-v101-tact="delete" data-id="${esc(c.id)}">${ic('trash')} حذف</button>`:''}</div></article>`).join('')}</div>`
  :emptyState('لم تنشئ كورسات بعد','أنشئ أول كورس من دروسك واختباراتك، وأضف فيديوهات وملفات خاصة به.',t.perms?.create!==false?`<button type="button" class="v101-btn v101-btn-primary" data-v101-new>${ic('plus')} إنشاء كورس</button>`:'')}</div>`;}

/* ---------- admin ---------- */
async function loadAdmin(force=false){if(!force&&S.admin.list)return;S.pending=true;draw();try{const r=await api('v101/admin/courses');Object.assign(S.admin,{list:r.courses||[],settings:r.settings||{},teachers:r.teachers||[]});S.admin.featured=[...(r.settings?.featured||[])];}catch(e){S.error=errText(e);S.admin.list=S.admin.list||[];}finally{S.pending=false;draw();}}
async function loadCodes(){const id=S.admin.codesCourse;if(!id){S.admin.codes=null;return draw();}try{const r=await api('v101/admin/codes',{query:{courseId:id}});S.admin.codes=r.codes||[];}catch(e){S.error=errText(e);}draw();}
async function loadEnroll(){const id=S.admin.enrollCourse;if(!id){S.admin.enroll=null;return draw();}try{const r=await api('v101/admin/enrollments',{query:{courseId:id}});S.admin.enroll=r.enrollments||[];}catch(e){S.error=errText(e);}draw();}
const courseOptions=(sel,onlyPublished=false)=>(S.admin.list||[]).filter(c=>c.status!=='archived'&&(!onlyPublished||c.status==='published')).map(c=>`<option value="${esc(c.id)}" ${sel===c.id?'selected':''}>${esc(c.title)}</option>`).join('');
function adminUI(){if(S.ed)return `<div class="v101-page">${editorUI()}</div>`;const A=S.admin;const list=A.list||[];const pending=list.filter(c=>c.status==='pending'||c.hasPendingRevision);
  const tabs=[['courses','الكورسات',list.filter(c=>c.status!=='archived').length],['reviews','المراجعات',pending.length],['featured','المميزة في الرئيسية',(A.featured||[]).length],['codes','أكواد التفعيل',''],['enroll','المشتركون',''],['settings','واتساب والرسالة','']];
  let body='';
  if(A.list===null)body=skeleton(3);
  else if(A.tab==='courses'){const f=A.filter;const rows=list.filter(c=>f==='all'?c.status!=='archived':c.status===f);
    body=`<div class="v101-toolbar"><div class="v101-seg">${[['all','الكل'],['published','منشور'],['pending','بانتظار المراجعة'],['draft','مسودة'],['hidden','مخفي'],['archived','مؤرشف']].map(([k,v])=>`<button type="button" aria-selected="${f===k}" data-v101-afilter="${k}">${v}</button>`).join('')}</div><button type="button" class="v101-btn v101-btn-primary" data-v101-new>${ic('plus')} كورس جديد</button></div>
    ${rows.length?`<div class="v101-list">${rows.map(c=>`<article class="v101-row">${cover(c)}<div class="v101-row-main"><div class="v101-row-top">${statusBadge(c.status)}${c.hasPendingRevision?'<span class="v101-badge v101-badge-wait">تعديل معلم بانتظار المراجعة</span>':''}${(A.featured||[]).includes(c.id)?`<span class="v101-badge v101-badge-ok">${ic('star')} مميز</span>`:''}</div><h3>${esc(c.title)}</h3><p class="v101-small v101-muted">${esc(subjectName(c))} · ${esc(gradeLabel(c.stage,c.grade))} · ${esc(c.teacher?.name||'الأكاديمية')} · ${esc(money(c.price))}${c.planUnlocks?' · يُفتح بالخطة':''} · <span class="v101-nowrap">${ic('users')} ${c.enrolled||0} مشترك</span></p></div>
     <div class="v101-row-actions"><button type="button" class="v101-btn v101-btn-ghost" data-v101-edit="${esc(c.id)}">${ic('edit')} تعديل</button><a class="v101-btn v101-btn-ghost" href="index.html?view=v101-course&id=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">${ic('eye')} عرض</a>${c.status==='published'?`<button type="button" class="v101-btn v101-btn-ghost" data-v101-status="hidden" data-id="${esc(c.id)}">إخفاء</button>`:`<button type="button" class="v101-btn v101-btn-ghost" data-v101-status="published" data-id="${esc(c.id)}">نشر</button>`}<button type="button" class="v101-btn v101-btn-ghost" data-v101-codes="${esc(c.id)}">${ic('ticket')} أكواد</button><button type="button" class="v101-btn v101-btn-ghost" data-v101-enroll="${esc(c.id)}">${ic('users')} المشتركون</button>${c.status!=='archived'?`<button type="button" class="v101-btn v101-btn-danger" data-v101-status="archived" data-id="${esc(c.id)}">أرشفة</button>`:''}</div></article>`).join('')}</div>`:emptyState('لا توجد كورسات هنا','أنشئ كورسًا جديدًا أو غيّر التصفية.')}`;}
  else if(A.tab==='reviews'){body=pending.length?`<div class="v101-list">${pending.map(c=>`<article class="v101-row">${cover(c)}<div class="v101-row-main"><div class="v101-row-top">${c.hasPendingRevision?'<span class="v101-badge v101-badge-wait">تعديل على كورس منشور</span>':'<span class="v101-badge v101-badge-wait">كورس جديد</span>'}</div><h3>${esc(c.title)}</h3><p class="v101-small v101-muted">${esc(c.teacher?.name||'')} · ${esc(subjectName(c))} · ${esc(gradeLabel(c.stage,c.grade))}</p><label class="v101-field">ملاحظة للمعلم (عند الرفض)<input data-v101-note="${esc(c.id)}" maxlength="500" placeholder="مثال: أضف وصفًا أوضح وعدّل السعر"></label></div>
    <div class="v101-row-actions"><button type="button" class="v101-btn v101-btn-ghost" data-v101-edit="${esc(c.id)}">${ic('eye')} فحص المحتوى</button><button type="button" class="v101-btn v101-btn-primary" data-v101-review="approve" data-id="${esc(c.id)}">${ic('check')} موافقة ونشر</button><button type="button" class="v101-btn v101-btn-danger" data-v101-review="reject" data-id="${esc(c.id)}">رفض</button></div></article>`).join('')}</div>`:emptyState('لا توجد مراجعات معلقة','ستظهر هنا الكورسات الجديدة وتعديلات المعلمين التي تحتاج موافقتك.');}
  else if(A.tab==='featured'){const pub=list.filter(c=>c.status==='published');const sel=A.featured||[];
    body=`<p class="v101-muted">اختر حتى 12 كورسًا تظهر في رئيسية الطالب بعد تسجيل الدخول. يرى كل طالب المميز المناسب لصفه فقط، وبالترتيب الذي تحدده هنا.</p>
    <div class="v101-two"><section class="v101-panel"><h3>الكورسات المنشورة</h3>${pub.length?pub.map(c=>`<label class="v101-check v101-pick"><input type="checkbox" data-v101-feat="${esc(c.id)}" ${sel.includes(c.id)?'checked':''}><span>${esc(c.title)}<small>${esc(subjectName(c))} · ${esc(gradeLabel(c.stage,c.grade))}</small></span></label>`).join(''):'<p class="v101-muted">لا توجد كورسات منشورة.</p>'}</section>
    <section class="v101-panel"><h3>ترتيب العرض</h3>${sel.length?`<ol class="v101-order">${sel.map((id,i)=>{const c=list.find(x=>x.id===id);return `<li><span>${i+1}</span><strong>${esc(c?.title||id)}</strong><div class="v101-ed-tools"><button type="button" data-v101-fmove="-1" data-i="${i}" aria-label="لأعلى">${ic('up')}</button><button type="button" data-v101-fmove="1" data-i="${i}" aria-label="لأسفل">${ic('down')}</button></div></li>`;}).join('')}</ol>`:'<p class="v101-muted">لم تختر كورسات بعد.</p>'}<button type="button" class="v101-btn v101-btn-primary" data-v101-savefeat ${S.pending?'disabled':''}>حفظ الكورسات المميزة</button></section></div>`;}
  else if(A.tab==='codes'){const issued=A.issued||[];
    body=`<div class="v101-two"><form class="v101-panel" id="v101-codes-form"><h3>${ic('ticket')} إصدار أكواد جديدة</h3>
    <label class="v101-field">الكورس<select name="courseId" required><option value="">اختر الكورس</option>${courseOptions(A.codesCourse,true)}</select></label>
    <div class="v101-form-grid"><label class="v101-field">عدد الأكواد<input name="count" type="number" min="1" max="50" value="1" required></label><label class="v101-field">مرات استخدام كل كود<input name="maxUses" type="number" min="1" max="500" value="1" required></label>
    <label class="v101-field">مدة الوصول بالأيام<input name="accessDays" type="number" min="0" max="3650" value="0" required><small>0 = مدى الحياة</small></label><label class="v101-field">صالح للتفعيل حتى (اختياري)<input name="validUntil" type="date"></label></div>
    <label class="v101-field">ملاحظة داخلية (مثل اسم الطالب أو رقم العملية)<input name="note" maxlength="120"></label>
    <button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>إصدار الأكواد</button>
    ${issued.length?`<div class="v101-issued"><p><strong>انسخ الأكواد الآن.</strong> لا يحتفظ النظام بنصها، ولا يمكن عرضها مرة أخرى.</p><textarea readonly rows="${Math.min(8,issued.length+1)}" dir="ltr" id="v101-issued">${esc(issued.join('\n'))}</textarea><button type="button" class="v101-btn v101-btn-ghost" data-v101-copy>${ic('copy')} نسخ الكل</button></div>`:''}</form>
    <section class="v101-panel"><h3>سجل الأكواد</h3><label class="v101-field">الكورس<select id="v101-codes-course"><option value="">اختر الكورس</option>${courseOptions(A.codesCourse)}</select></label>
    ${A.codes===null?'<p class="v101-muted">اختر كورسًا لعرض أكواده.</p>':A.codes.length?`<div class="v101-table-wrap"><table class="v101-table"><thead><tr><th>الكود</th><th>الاستخدام</th><th>المدة</th><th>الحالة</th><th></th></tr></thead><tbody>${A.codes.map(k=>`<tr><td dir="ltr">…${esc(k.suffix)}${k.note?`<small>${esc(k.note)}</small>`:''}</td><td>${k.uses}/${k.maxUses}${k.redemptions.length?`<small>${k.redemptions.map(r=>esc(r.name||'طالب')).join('، ')}</small>`:''}</td><td>${k.accessDays?k.accessDays+' يوم':'مدى الحياة'}</td><td>${codeBadge(k.status)}</td><td>${k.status==='active'?`<button type="button" class="v101-btn v101-btn-danger v101-btn-sm" data-v101-disable="${esc(k.key)}">إيقاف</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="v101-muted">لا توجد أكواد لهذا الكورس.</p>'}</section></div>`;}
  else if(A.tab==='enroll'){body=`<div class="v101-two"><form class="v101-panel" id="v101-enroll-form"><h3>${ic('users')} منح وصول يدوي</h3><p class="v101-small v101-muted">لفتح الكورس لطالب مباشرة دون كود (مثل الدفع في المقر).</p>
    <label class="v101-field">الكورس<select name="courseId" required><option value="">اختر الكورس</option>${courseOptions(A.enrollCourse)}</select></label>
    <label class="v101-field">بريد الطالب أو معرّفه<input name="studentId" dir="ltr" required maxlength="190"></label><label class="v101-field">مدة الوصول بالأيام (0 = مدى الحياة)<input name="accessDays" type="number" min="0" max="3650" value="0"></label>
    <button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>منح الوصول</button></form>
    <section class="v101-panel"><h3>المشتركون</h3><label class="v101-field">الكورس<select id="v101-enroll-course"><option value="">اختر الكورس</option>${courseOptions(A.enrollCourse)}</select></label>
    ${A.enroll===null?'<p class="v101-muted">اختر كورسًا لعرض المشتركين.</p>':A.enroll.length?`<div class="v101-table-wrap"><table class="v101-table"><thead><tr><th>الطالب</th><th>المصدر</th><th>ينتهي</th><th></th></tr></thead><tbody>${A.enroll.map(r=>`<tr><td>${esc(r.name||'طالب')}<small dir="ltr">${esc(r.email||'')}</small></td><td>${r.source==='code'?'كود':r.source==='admin'?'الإدارة':esc(r.source)}</td><td>${r.active?(r.endsAt?esc(dateAr(r.endsAt)):'مدى الحياة'):'<span class="v101-badge v101-badge-muted">غير فعّال</span>'}</td><td>${r.active?`<button type="button" class="v101-btn v101-btn-danger v101-btn-sm" data-v101-revoke="${esc(r.studentId)}">إلغاء</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="v101-muted">لا يوجد مشتركون بعد.</p>'}</section></div>`;}
  else if(A.tab==='settings'){const s=A.settings||{};body=`<form class="v101-panel v101-narrow" id="v101-settings-form"><h3>${ic('whatsapp')} زر الاشتراك عبر واتساب</h3><p class="v101-small v101-muted">يفتح الطالب واتساب على هذا الرقم برسالة جاهزة. إذا تُرك فارغًا يُستخدم رقم واتساب العام للأكاديمية.</p>
    <label class="v101-field">رقم واتساب الإدارة<input name="whatsapp" dir="ltr" inputmode="tel" value="${esc(s.whatsapp||'')}" placeholder="01012345678"></label>
    <label class="v101-field">نص الرسالة الجاهزة<textarea name="messageTemplate" rows="7" maxlength="800">${esc(s.messageTemplate||'')}</textarea></label>
    <p class="v101-small v101-muted">متغيرات متاحة: <code>{course}</code> اسم الكورس، <code>{subject}</code> المادة، <code>{grade}</code> الصف، <code>{price}</code> السعر، <code>{student}</code> اسم الطالب، <code>{account}</code> بريد الحساب، <code>{link}</code> رابط الكورس.</p>
    <button type="submit" class="v101-btn v101-btn-primary" ${S.pending?'disabled':''}>حفظ الإعدادات</button></form>`;}
  return `<div class="v101-page"><header class="v101-hero v101-hero-compact"><div><span class="v101-kicker">${ic('grid')} الإدارة</span><h1>إدارة الكورسات</h1><p>الكورسات والمراجعات والأكواد والمشتركون وزر واتساب من مكان واحد.</p></div><button type="button" class="v101-btn v101-btn-light" data-v101-refresh>${ic('refresh')} تحديث</button></header>
  ${noticeHTML()}<nav class="v101-tabs" role="tablist" aria-label="أقسام إدارة الكورسات">${tabs.map(([k,v,n])=>`<button type="button" role="tab" aria-selected="${A.tab===k}" data-v101-atab="${k}">${v}${n!==''&&n?`<span class="v101-count">${n}</span>`:''}</button>`).join('')}</nav>${body}</div>`;}

/* ---------- draw & mount ---------- */
function draw(){const r=root();if(!r)return;const active=document.activeElement;const keep=active&&r.contains(active)&&active.id?{id:active.id,pos:active.selectionStart}:null;
  r.innerHTML=S.view==='v101-course'?courseUI():S.view==='v101-teacher-courses'?teacherUI():S.view==='v101-admin-courses'?adminUI():catalogUI();
  if(keep){const el=document.getElementById(keep.id);if(el){el.focus();try{if(keep.pos!=null)el.setSelectionRange(keep.pos,keep.pos);}catch{}}}}
function mount(role,uid,view){if(!root())return;uid=String(uid||'');if(S.uid!==uid||S.role!==role){Object.assign(S,{uid,role,catalog:null,course:null,featured:null,featuredFor:'',error:'',notice:'',ed:null,content:null});S.teacher={list:null,perms:null,assignments:[]};S.admin.list=null;}
  const changed=S.view!==view;S.view=view;if(changed){S.error='';if(view!=='v101-course')S.openItem='';}
  draw();
  if(view==='v101-courses')void loadCatalog();
  else if(view==='v101-course'){const id=new URLSearchParams(location.search).get('id')||'';if(id!==S.courseId||!S.course||S.courseFor!==S.uid)void loadCourse(id,true);}
  else if(view==='v101-teacher-courses')void loadTeacher();
  else if(view==='v101-admin-courses')void loadAdmin();}

/* ---------- events ---------- */
async function run(fn,okMsg){if(S.pending)return;S.pending=true;S.error='';S.notice='';draw();try{await fn();if(okMsg)flash(okMsg);}catch(e){S.error=errText(e);}finally{S.pending=false;draw();}}
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-v101-open]');if(open&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){e.preventDefault();S.course=null;S.courseId='';go('v101-course',{id:open.dataset.v101Open});return;}
  const g=e.target.closest('[data-v101-go]');if(g){e.preventDefault();go(g.dataset.v101Go);return;}
  if(!root())return;const t=e.target;
  const q=s=>t.closest(s);let b;
  if((b=q('[data-v101-tab]'))){S.tab=b.dataset.v101Tab;draw();return;}
  if((b=q('[data-v101-subject]'))){S.subject=b.dataset.v101Subject;draw();return;}
  if(q('[data-v101-clear]')){S.query='';S.subject='';draw();return;}
  if((b=q('[data-v101-item]'))){openItem(b.dataset.v101Item);return;}
  if(q('[data-v101-close]')){const d=document.getElementById('v101-modal');document.getElementById('v101-modal-player').innerHTML='';d?.close();return;}
  if(q('[data-v101-start]')){document.getElementById('v101-curriculum')?.scrollIntoView({behavior:'smooth'});return;}
  if(q('[data-v101-scrollbuy]')){document.querySelector('.v101-buy')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(q('[data-v101-new]')){void openEditor('');return;}
  if((b=q('[data-v101-edit]'))){void openEditor(b.dataset.v101Edit);return;}
  if(q('[data-v101-refresh]')){S.admin.list=null;void loadAdmin(true);return;}
  if((b=q('[data-v101-tact]'))){const a=b.dataset.v101Tact;if(a==='delete'&&!confirm('حذف هذا الكورس نهائيًا؟'))return;void run(async()=>{await api('v101/teacher/course/action',{method:'POST',body:{id:b.dataset.id,action:a}});await loadTeacher(true);},{submit:'تم الإرسال.',withdraw:'أُعيد الكورس إلى المسودات.','discard-revision':'أُلغي التعديل المقترح.',delete:'حُذف الكورس.'}[a]);return;}
  if((b=q('[data-v101-atab]'))){S.admin.tab=b.dataset.v101Atab;S.error='';S.notice='';if(S.admin.tab!=='codes')S.admin.issued=[];draw();return;}
  if((b=q('[data-v101-afilter]'))){S.admin.filter=b.dataset.v101Afilter;draw();return;}
  if((b=q('[data-v101-status]'))){const s=b.dataset.v101Status;if(s==='archived'&&!confirm('أرشفة الكورس تخفيه من الطلاب والمعلم. يبقى المشتركون وسجلاتهم محفوظة. متابعة؟'))return;void run(async()=>{await api('v101/admin/course/status',{method:'POST',body:{id:b.dataset.id,status:s}});await loadAdmin(true);},'تم تحديث حالة الكورس.');return;}
  if((b=q('[data-v101-review]'))){const d=b.dataset.v101Review,id=b.dataset.id;const note=document.querySelector(`[data-v101-note="${CSS.escape(id)}"]`)?.value||'';void run(async()=>{await api('v101/admin/course/review',{method:'POST',body:{id,decision:d,note}});await loadAdmin(true);},d==='approve'?'تم النشر.':'تم الرفض وإبلاغ المعلم بالملاحظة.');return;}
  if((b=q('[data-v101-codes]'))){S.admin.tab='codes';S.admin.codesCourse=b.dataset.v101Codes;S.admin.issued=[];void loadCodes();return;}
  if((b=q('[data-v101-enroll]'))){S.admin.tab='enroll';S.admin.enrollCourse=b.dataset.v101Enroll;void loadEnroll();return;}
  if((b=q('[data-v101-fmove]'))){const i=Number(b.dataset.i),d=Number(b.dataset.v101Fmove),f=S.admin.featured;const j=i+d;if(j<0||j>=f.length)return;[f[i],f[j]]=[f[j],f[i]];draw();return;}
  if(q('[data-v101-savefeat]')){void run(async()=>{const r=await api('v101/admin/settings',{method:'POST',body:{featured:S.admin.featured}});S.admin.settings=r.settings;},'تم حفظ الكورسات المميزة.');return;}
  if((b=q('[data-v101-disable]'))){if(!confirm('إيقاف هذا الكود؟ لن يمكن تفعيله بعد ذلك. من فعّله سابقًا يحتفظ بالوصول.'))return;void run(async()=>{await api('v101/admin/codes/disable',{method:'POST',body:{key:b.dataset.v101Disable}});await loadCodes();},'تم إيقاف الكود.');return;}
  if((b=q('[data-v101-revoke]'))){if(!confirm('إلغاء وصول هذا الطالب للكورس؟'))return;void run(async()=>{await api('v101/admin/enrollment',{method:'POST',body:{courseId:S.admin.enrollCourse,studentId:b.dataset.v101Revoke,action:'revoke'}});await loadEnroll();},'أُلغي الوصول.');return;}
  if(q('[data-v101-copy]')){const ta=document.getElementById('v101-issued');if(ta){ta.select();(navigator.clipboard?.writeText(ta.value)||Promise.reject()).then(()=>{flash('تم نسخ الأكواد.');draw();},()=>document.execCommand?.('copy'));}return;}
  if((b=q('[data-v101-ed]'))&&S.ed){const a=b.dataset.v101Ed,e2=S.ed;const it=b.closest('[data-ii]'),sec=b.closest('[data-si]');const si=Number(sec?.dataset.si),ii=Number(it?.dataset.ii);
    const mv=(arr,i,d)=>{const j=i+d;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];};
    if(a==='close'){if(confirm('الخروج بدون حفظ التعديلات؟')){S.ed=null;S.error='';draw();}return;}
    if(a==='draft'){void saveEditor(true);return;}
    if(a==='sec-add')e2.sections.push({id:'',title:`القسم ${e2.sections.length+1}`,items:[]});
    if(a==='sec-del'){if(e2.sections[si].items.length&&!confirm('حذف القسم وكل عناصره؟'))return;e2.sections.splice(si,1);}
    if(a==='sec-up')mv(e2.sections,si,-1);if(a==='sec-down')mv(e2.sections,si,1);
    if(a==='item-del')e2.sections[si].items.splice(ii,1);if(a==='item-up')mv(e2.sections[si].items,ii,-1);if(a==='item-down')mv(e2.sections[si].items,ii,1);
    draw();return;}
},true);
document.addEventListener('input',e=>{if(!root())return;const t=e.target;
  if(t.id==='v101-q'){S.query=String(t.value||'').slice(0,80);draw();return;}
  if(!S.ed)return;
  if(t.dataset.v101F&&!['type','stage','grade','subject','level','teacherId','status','planUnlocks'].includes(t.dataset.v101F)){const k=t.dataset.v101F;S.ed[k]=k==='outcomes'?String(t.value).split('\n').map(x=>x.trim()).filter(Boolean).slice(0,10):t.value;return;}
  if(t.dataset.v101S==='title'){const si=Number(t.closest('[data-si]').dataset.si);S.ed.sections[si].title=t.value;return;}
  if(t.dataset.v101I&&t.type!=='checkbox'&&t.tagName!=='SELECT'){const li=t.closest('[data-ii]');const it=S.ed.sections[Number(li.dataset.si)].items[Number(li.dataset.ii)];it[t.dataset.v101I]=t.value;}
},true);
document.addEventListener('change',e=>{if(!root())return;const t=e.target;
  if(t.id==='v101-scope'){S.scope=t.checked?'mine':'all';void loadCatalog(true);return;}
  if(t.id==='v101-codes-course'){S.admin.codesCourse=t.value;void loadCodes();return;}
  if(t.id==='v101-enroll-course'){S.admin.enrollCourse=t.value;void loadEnroll();return;}
  if(t.dataset.v101Feat){const f=S.admin.featured||(S.admin.featured=[]);const id=t.dataset.v101Feat;if(t.checked){if(f.length>=12){t.checked=false;S.error=ERR.featured_limit;draw();return;}if(!f.includes(id))f.push(id);}else S.admin.featured=f.filter(x=>x!==id);draw();return;}
  if(!S.ed)return;
  if(t.dataset.v101F){const k=t.dataset.v101F;S.ed[k]=t.type==='checkbox'?t.checked:t.value;if(k==='stage'){const max=t.value==='primary'?6:3;if(Number(S.ed.grade)>max)S.ed.grade='';}if(['type','stage','grade','subject'].includes(k))draw();return;}
  if(t.dataset.v101ScopePick!==undefined){const a=S.teacher.assignments[Number(t.value)];if(a)Object.assign(S.ed,{type:a.type||'public',stage:a.stage||'sec',grade:String(a.grade||''),subject:a.subject||''});draw();return;}
  if(t.dataset.v101Add!==undefined&&t.value){S.ed.sections[Number(t.dataset.v101Add)].items.push({id:'',kind:t.value,title:'',preview:false});draw();return;}
  if(t.dataset.v101I){const li=t.closest('[data-ii]');const it=S.ed.sections[Number(li.dataset.si)].items[Number(li.dataset.ii)];it[t.dataset.v101I]=t.type==='checkbox'?t.checked:t.value;if(t.dataset.v101I==='refId'&&!it.title){const pool=S.content?.[{lesson:'lessons',quiz:'quizzes',file:'files'}[it.kind]]||[];const n=pool.find(x=>x.id===t.value);if(n){/* keep title empty: server shows the live curriculum title */}}return;}
},true);
document.addEventListener('submit',e=>{const f=e.target;if(!f.id?.startsWith('v101-'))return;e.preventDefault();e.stopImmediatePropagation();const d=new FormData(f);
  if(f.id==='v101-redeem-form'){const code=String(d.get('code')||'').trim().toUpperCase();void run(async()=>{const r=await api('v101/redeem',{method:'POST',body:{code}});S.catalog=null;S.featured=null;flash(`تم تفعيل «${r.title}» ${r.endsAt?'حتى '+dateAr(r.endsAt):'مدى الحياة'}. بالتوفيق!`);if(S.view==='v101-course'){await loadCourse(S.courseId,true);}else{S.tab='mine';await loadCatalog(true);}});return;}
  if(f.id==='v101-editor'){void saveEditor(false);return;}
  if(f.id==='v101-codes-form'){const until=d.get('validUntil');const body={courseId:d.get('courseId'),count:Number(d.get('count')),maxUses:Number(d.get('maxUses')),accessDays:Number(d.get('accessDays')),note:d.get('note'),validUntil:until?new Date(until+'T23:59:59').getTime():0};
    void run(async()=>{const r=await api('v101/admin/codes/create',{method:'POST',body});S.admin.issued=r.codes||[];S.admin.codesCourse=body.courseId;await loadCodes();},'تم إصدار الأكواد. انسخها الآن.');return;}
  if(f.id==='v101-enroll-form'){const body={courseId:d.get('courseId'),studentId:String(d.get('studentId')||'').trim(),accessDays:Number(d.get('accessDays')||0),action:'grant'};void run(async()=>{await api('v101/admin/enrollment',{method:'POST',body});S.admin.enrollCourse=body.courseId;f.reset();await loadEnroll();},'تم منح الوصول للطالب.');return;}
  if(f.id==='v101-settings-form'){void run(async()=>{const r=await api('v101/admin/settings',{method:'POST',body:{whatsapp:d.get('whatsapp'),messageTemplate:d.get('messageTemplate')}});S.admin.settings=r.settings;},'تم حفظ إعدادات واتساب.');return;}
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const d=document.getElementById('v101-modal');if(d?.open){document.getElementById('v101-modal-player').innerHTML='';}}});
document.addEventListener('close',e=>{if(e.target?.id==='v101-modal'){const p=document.getElementById('v101-modal-player');if(p)p.innerHTML='';}},true);

window.EgtazV101={screen:()=>'<div id="v101-root" class="v101-root" dir="rtl"></div>',mount,featured,teacherCourses,configure:cfg=>{Object.assign(S.cfg,cfg||{});},
  reset:()=>{Object.assign(S,{uid:'',catalog:null,course:null,featured:null,featuredFor:''});},__test:{state:S,esc,safeUrl,embedUrl,ytId,money,gradeLabel}};
})();
