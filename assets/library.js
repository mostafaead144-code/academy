(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,access=null,data={customSubjects:{},files:{}},scope='mine',allLoaded=false;
let favorites={},history={};

function allFiles(){return Object.entries(data.files||{}).map(([id,v])=>({id,...(v||{})}))}
function publishedFile(f){return f&&f.isHidden!==true&&(!Number(f.publishAt||0)||Number(f.publishAt)<=Date.now())}
function mineFile(f){return f.type===profile.educationType&&f.stage===profile.stage&&String(f.grade)===String(profile.grade)}
function fileAccessible(f){return !S||S.canAccess(f,access,f?.subject||'')}
function isFavorite(id){return !!favorites[id]}
function historyRow(id){return history[id]||{}}
function openedAt(id){return Number(historyRow(id).openedAt||0)}
function fileKind(f){return f.kind||'pdf'}
function kindLabel(k){return k==='note'?'مذكرة':k==='review'?'مراجعة':k==='reference'?'مرجع':'PDF'}
function kindIcon(k){return k==='note'?'fa-note-sticky':k==='review'?'fa-list-check':k==='reference'?'fa-book':'fa-file-pdf'}
function kindEmoji(k){return k==='note'?'📝':k==='review'?'✅':k==='reference'?'📘':'📕'}
function subjectMeta(f){
 const list=C.subjectsFor(data,f.stage,String(f.grade),f.type)||[];
 return list.find(s=>String(s.id)===String(f.subject))||{id:f.subject||'',name:C.subjectName(data,f.subject,f.stage,String(f.grade),f.type)||f.subject||'مادة',emoji:'📚',imageUrl:''};
}
function scopeBase(){
 const visible=allFiles().filter(publishedFile);
 if(scope==='mine')return visible.filter(mineFile);
 if(scope==='favorites')return visible.filter(f=>isFavorite(f.id));
 if(scope==='recent')return visible.filter(f=>openedAt(f.id)>0);
 return visible;
}
function gradeKey(f){return [f.type||'',f.stage||'',String(f.grade||'')].join('|')}
function gradeOptionLabel(f){return C.typeLabel(f.type)+' • '+C.gradeLabel(f.stage,f.grade)}
function files(){
 const q=($('librarySearch')?.value||'').trim().toLowerCase(),subject=$('librarySubjectFilter')?.value||'',kind=$('libraryKindFilter')?.value||'',grade=$('libraryGradeFilter')?.value||'';
 const rows=scopeBase().filter(f=>{
   if(subject&&String(f.subject)!==subject)return false;
   if(kind&&fileKind(f)!==kind)return false;
   if(grade&&gradeKey(f)!==grade)return false;
   const sub=subjectMeta(f),hay=[f.title,sub.name,f.description,f.lessonTitle,kindLabel(fileKind(f)),C.gradeLabel(f.stage,f.grade),C.typeLabel(f.type)].filter(Boolean).join(' ').toLowerCase();
   return !q||hay.includes(q);
 });
 return rows.sort((a,b)=>{
   if(scope==='recent')return openedAt(b.id)-openedAt(a.id);
   if(!!a.isFeatured!==!!b.isFeatured)return a.isFeatured?-1:1;
   return Number(b.createdAt||0)-Number(a.createdAt||0);
 });
}
function renderFilters(){
 const base=scopeBase(),subjectCurrent=$('librarySubjectFilter')?.value||'',gradeCurrent=$('libraryGradeFilter')?.value||'';
 const subjectMap=new Map();
 base.forEach(f=>{
   if(!f.subject)return;
   const sub=subjectMeta(f);if(!subjectMap.has(f.subject))subjectMap.set(f.subject,sub.name||f.subject);
 });
 const subjectOptions=[...subjectMap].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
 $('librarySubjectFilter').innerHTML='<option value="">كل المواد</option>'+subjectOptions.map(s=>'<option value="'+C.esc(s.id)+'">'+C.esc(s.name)+'</option>').join('');
 if(subjectOptions.some(s=>String(s.id)===subjectCurrent))$('librarySubjectFilter').value=subjectCurrent;

 const gradeMap=new Map();
 base.forEach(f=>{const k=gradeKey(f);if(k&&!gradeMap.has(k))gradeMap.set(k,gradeOptionLabel(f))});
 const gradeOptions=[...gradeMap].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
 $('libraryGradeFilter').innerHTML='<option value="">كل الصفوف</option>'+gradeOptions.map(g=>'<option value="'+C.esc(g.id)+'">'+C.esc(g.name)+'</option>').join('');
 if(gradeOptions.some(g=>g.id===gradeCurrent))$('libraryGradeFilter').value=gradeCurrent;
}
function resultsCopy(list){
 const map={
   mine:['ملفات مرحلتك','كل الملفات المناسبة لصفك في مكان واحد.'],
   favorites:['ملفاتك المفضلة','الملفات التي حفظتها للرجوع إليها بسرعة.'],
   recent:['آخر ما فتحته','سجل الملفات التي فتحتها مؤخرًا مرتبًا من الأحدث.'],
   all:['كل مكتبة الأكاديمية','استكشف الملفات المتاحة في مختلف المراحل والصفوف.']
 };
 const [title,meta]=map[scope]||map.mine;
 $('libraryResultsTitle').textContent=title;
 $('libraryResultsMeta').textContent=list.length+' ملف ظاهر • '+meta;
}
function supportHrefForFile(f){
 return './support.html?'+new URLSearchParams({source:'library',category:'file',sourceId:f.id||'',type:f.type||profile.educationType||'public',stage:f.stage||profile.stage||'',grade:String(f.grade||profile.grade||''),subject:f.subject||'',lessonId:f.lessonId||'',lessonTitle:f.lessonTitle||'',title:'مشكلة في ملف '+(f.title||'تعليمي'),href:'./library.html'}).toString();
}
function linkedLessonHref(f){
 if(!f.lessonId)return'';
 const q=new URLSearchParams({type:f.type||profile.educationType,stage:f.stage||profile.stage,grade:String(f.grade||profile.grade),subject:f.subject||'',id:f.lessonId});
 return './lesson.html?'+q.toString();
}
function renderFeatured(){
 const mine=allFiles().filter(f=>publishedFile(f)&&mineFile(f)).sort((a,b)=>{
   if(!!a.isFeatured!==!!b.isFeatured)return a.isFeatured?-1:1;
   const ao=openedAt(a.id)>0?1:0,bo=openedAt(b.id)>0?1:0;if(ao!==bo)return ao-bo;
   return Number(b.createdAt||0)-Number(a.createdAt||0);
 });
 const pick=mine[0]||null,btn=$('libraryFeaturedOpen');
 if(!pick){
   $('libraryFeaturedIcon').innerHTML='<span class="academy-art art-world"></span>';$('libraryFeaturedTitle').textContent='لا يوجد ملف مقترح بعد';$('libraryFeaturedMeta').textContent='سيظهر هنا أحدث ملف مناسب لمرحلتك.';$('libraryFeaturedBadge').textContent='الأحدث';btn.disabled=true;btn.onclick=null;return;
 }
 const sub=subjectMeta(pick),kind=fileKind(pick),safe=C.safeUrl(pick.url);
 $('libraryFeaturedIcon').innerHTML=window.AcademyStudentDesign?.subjectArt(pick.subject,kindEmoji(kind))||C.esc(kindEmoji(kind));
 $('libraryFeaturedTitle').textContent=pick.title||'ملف تعليمي';
 $('libraryFeaturedMeta').textContent=[sub.name,kindLabel(kind),pick.lessonTitle?'مرتبط بـ '+pick.lessonTitle:''].filter(Boolean).join(' • ');
 $('libraryFeaturedBadge').textContent=pick.isFeatured?'مهم':'الأحدث';
 const allowed=fileAccessible(pick);btn.disabled=!(safe&&safe!=='#');btn.innerHTML=allowed?'فتح الملف <i class="fa-solid fa-arrow-up-right-from-square"></i>':'<i class="fa-solid fa-crown"></i> يتطلب اشتراك';
 btn.onclick=()=>allowed?openFile(pick.id,btn):S?.lockOverlay({title:'هذا الملف ضمن الاشتراك',text:'فعّل باقة تشمل مادة '+(sub.name||'المادة')+' لفتح الملف.'});
}
function renderStats(list){
 const mine=allFiles().filter(f=>publishedFile(f)&&mineFile(f));
 $('libraryTotal').textContent=mine.length;
 $('librarySubjects').textContent=new Set(mine.map(f=>f.subject).filter(Boolean)).size;
 $('libraryFeaturedCount').textContent=mine.filter(f=>f.isFeatured).length;
 $('libraryFavoriteCount').textContent=Object.keys(favorites).filter(id=>favorites[id]).length;
 $('libraryOpenedCount').textContent=Object.keys(history).filter(id=>Number(history[id]?.openedAt||0)>0).length;
 $('libraryVisible').textContent=list.length;
}
function cardHtml(f){
 const sub=subjectMeta(f),kind=fileKind(f),safe=C.safeUrl(f.url),allowed=fileAccessible(f),img=C.safeUrl(sub.imageUrl||''),hasImage=img&&img!=='#',fav=isFavorite(f.id),recent=Number(f.createdAt||0)>Date.now()-7*86400000,historyItem=historyRow(f.id),lessonHref=linkedLessonHref(f);
 const opened=Number(historyItem.openedAt||0)>0;
 return '<article class="library-card library-card-v10 '+(f.isFeatured?'featured ':'')+(fav?'favorite':'')+'">'+
   '<div class="library-cover-v10 '+(hasImage?'has-image':'')+'" data-file-kind="'+C.esc(kind)+'">'+
     (window.AcademyStudentDesign?.subjectArt(f.subject,sub.emoji||kindEmoji(kind))||'<span class="academy-emoji">'+C.esc(kindEmoji(kind))+'</span>')+
     (hasImage?'<img class="tools-cover-image" data-tools-image src="'+C.esc(img)+'" alt="" loading="lazy">':'')+
     '<div class="library-cover-badges-v10">'+(f.isFeatured?'<b class="important"><i class="fa-solid fa-star"></i> مهم</b>':'')+(recent?'<b class="new">جديد</b>':'')+'<b>'+C.esc(kindLabel(kind))+'</b></div>'+
     '<em>'+C.esc(sub.name||'مادة')+'</em>'+
     '<button type="button" class="library-fav-v10 '+(fav?'active':'')+'" data-favorite-file="'+C.esc(f.id)+'" aria-pressed="'+(fav?'true':'false')+'" aria-label="'+(fav?'إزالة من المفضلة':'إضافة إلى المفضلة')+'"><i class="'+(fav?'fa-solid':'fa-regular')+' fa-heart"></i></button>'+
   '</div>'+
   '<div class="library-card-body-v10">'+
     '<small>'+C.esc(C.typeLabel(f.type))+' • '+C.esc(C.gradeLabel(f.stage,f.grade))+'</small>'+
     '<h3>'+C.esc(f.title||'ملف تعليمي')+' '+(f.isFree?'<span class="subscription-access-pill">مجاني</span>':!allowed?'<span class="subscription-access-pill paid">اشتراك</span>':'')+'</h3>'+
     '<p>'+C.esc(f.description||('ملف '+kindLabel(kind)+' لمادة '+(sub.name||'المادة')+'.'))+'</p>'+
     (f.lessonId?'<a class="library-linked-lesson-v10" href="'+C.esc(lessonHref)+'"><i class="fa-solid fa-link"></i><span><small>مرتبط بالدرس</small><strong>'+C.esc(f.lessonTitle||'فتح الدرس المرتبط')+'</strong></span><i class="fa-solid fa-arrow-left"></i></a>':'')+
     '<div class="library-card-meta-v10">'+
       '<span><i class="fa-solid '+kindIcon(kind)+'"></i>'+C.esc(kindLabel(kind))+'</span>'+
       (opened?'<span><i class="fa-solid fa-clock-rotate-left"></i> فُتح '+new Date(Number(historyItem.openedAt)).toLocaleDateString('ar-EG')+'</span>':'<span><i class="fa-regular fa-folder-open"></i> لم تفتحه بعد</span>')+
     '</div>'+
     (safe&&safe!=='#'?(allowed?'<a class="btn btn-primary library-open-v10" data-open-file="'+C.esc(f.id)+'" href="'+C.esc(safe)+'" target="_blank" rel="noopener noreferrer">فتح الملف <i class="fa-solid fa-arrow-up-right-from-square"></i></a>':'<button class="btn btn-soft library-open-v10" type="button" data-subscription-file="'+C.esc(f.id)+'"><i class="fa-solid fa-crown"></i> يتطلب اشتراك</button>'):'<span class="btn btn-soft library-open-v10 disabled"><i class="fa-solid fa-ban"></i> الرابط غير متاح</span>')+'<a class="btn btn-soft support-report-link" href="'+C.esc(supportHrefForFile(f))+'"><i class="fa-regular fa-flag"></i> إبلاغ</a>'+
   '</div>'+
 '</article>';
}
function bindCards(){
 $$('[data-favorite-file]').forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();await toggleFavorite(b.dataset.favoriteFile)});
 $$('[data-open-file]').forEach(a=>a.onclick=()=>{recordOpen(a.dataset.openFile).catch(()=>{})});
 $$('[data-subscription-file]').forEach(b=>b.onclick=()=>{const f=data.files?.[b.dataset.subscriptionFile],sub=f?subjectMeta(f):null;S?.lockOverlay({title:'هذا الملف ضمن الاشتراك',text:'فعّل باقة تشمل مادة '+(sub?.name||'المادة')+' لفتح الملف.'})});
}
function render(){
 const list=files();renderStats(list);renderFeatured();resultsCopy(list);
 $('libraryGrid').innerHTML=list.length?list.map(cardHtml).join(''):'<div class="feature-empty library-empty-v10"><span>📂</span><h3>لا توجد ملفات مطابقة</h3><p>'+(scope==='favorites'?'أضف ملفات إلى المفضلة من علامة القلب.':scope==='recent'?'افتح أي ملف وسيظهر هنا تلقائيًا.':'جرّب إزالة الفلاتر أو اختر نطاقًا آخر.')+'</p></div>';
 bindCards();
}
async function toggleFavorite(id){
 const before=!!favorites[id],ref=C.db.ref('studentProfilesV3/'+user.uid+'/libraryFavorites/'+id);
 if(before)delete favorites[id];else favorites[id]=true;
 render();
 try{if(before)await ref.remove();else await ref.set(true)}
 catch(err){console.error(err);if(before)favorites[id]=true;else delete favorites[id];render();C.toast('تعذر تحديث المفضلة الآن.','error')}
}
async function recordOpen(id){
 const f=data.files?.[id];if(!f)return;
 const ts=Date.now(),local=history[id]||{};
 history[id]={...local,openedAt:ts,openCount:Number(local.openCount||0)+1};
 renderStats(files());
 try{
   await C.db.ref('studentProfilesV3/'+user.uid+'/libraryHistory/'+id).transaction(row=>{
     row=row||{};return{openedAt:ts,openCount:Number(row.openCount||0)+1};
   });
 }catch(err){console.warn('Library history write skipped',err)}
}
function openFile(id,trigger){
 const f=data.files?.[id],safe=C.safeUrl(f?.url||'');if(!f||!safe||safe==='#')return C.toast('رابط الملف غير متاح.','error');if(!fileAccessible(f)){S?.lockOverlay({title:'هذا الملف ضمن الاشتراك',text:'تحتاج اشتراكًا نشطًا يشمل هذه المادة.'});return}
 recordOpen(id).catch(()=>{});
 window.open(safe,'_blank','noopener,noreferrer');
 trigger?.blur?.();
}
async function loadAllFiles(){
 if(allLoaded)return true;
 window.AcademyUI?.showPageLoading('جاري تحميل ملفات المكتبة...');
 try{
   const snap=await C.db.ref('files').once('value');data.files=snap.val()||{};allLoaded=true;return true;
 }catch(err){console.error(err);C.toast('تعذر تحميل كل المراحل الآن.','error');return false}
 finally{window.AcademyUI?.hidePageLoading()}
}
async function switchScope(next,button){
 if(['all','favorites','recent'].includes(next)&&!allLoaded){const ok=await loadAllFiles();if(!ok)return}
 scope=next;
 $$('[data-library-scope]').forEach(x=>{const active=x.dataset.libraryScope===scope;x.classList.toggle('active',active);x.setAttribute('aria-pressed',active?'true':'false')});
 renderFilters();render();
 button?.focus?.();
}
$$('[data-library-scope]').forEach(b=>b.onclick=()=>switchScope(b.dataset.libraryScope,b));
$('librarySubjectFilter').onchange=render;$('libraryGradeFilter').onchange=render;$('libraryKindFilter').onchange=render;$('librarySearch').oninput=render;
$('libraryClearFilters').onclick=()=>{$('librarySearch').value='';$('librarySubjectFilter').value='';$('libraryGradeFilter').value='';$('libraryKindFilter').value='';render()};
$('libraryHeroMineBtn').onclick=()=>switchScope('mine',document.querySelector('[data-library-scope="mine"]'));
$('libraryHeroFavBtn').onclick=()=>switchScope('favorites',document.querySelector('[data-library-scope="favorites"]'));
$('libraryHeroRecentBtn').onclick=()=>switchScope('recent',document.querySelector('[data-library-scope="recent"]'));

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تحميل مكتبتك التعليمية...');
 try{
   ({user,profile}=await C.requireStudent());access=S?await S.load(user.uid,profile,true):null;$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   favorites={...(profile.libraryFavorites||{})};history={...(profile.libraryHistory||{})};
   if($('libraryStudentName'))$('libraryStudentName').textContent=profile.name||user.displayName||'طالبنا';
   if($('libraryHeroText'))$('libraryHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — مذكرات ومراجعات وملفات مرتبطة بموادك ودروسك.';
   const [s,f]=await Promise.all([C.db.ref('customSubjects').once('value'),C.db.ref('files').orderByChild('stage').equalTo(profile.stage).once('value')]);
   data={customSubjects:s.val()||{},files:f.val()||{}};renderFilters();render();
   const requested=new URLSearchParams(location.search).get('file');
   if(requested){
     const file=data.files?.[requested],safe=C.safeUrl(file?.url||'');
     if(file&&publishedFile(file)&&mineFile(file)&&safe&&safe!=='#'){
       if(!fileAccessible(file)){S?.lockOverlay({title:'هذا الملف ضمن الاشتراك',text:'تحتاج اشتراكًا نشطًا يشمل هذه المادة.'});return}
       await recordOpen(requested);location.replace(safe);return;
     }
   }
 }catch(err){
   console.error(err);C.toast('تعذر تحميل المكتبة الآن.','error');
   $('libraryGrid').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل المكتبة','تحقق من الإنترنت ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();