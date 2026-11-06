(() => {
'use strict';
const cfg=window.ACADEMY_BACKEND_CONFIG||JSON.parse(localStorage.getItem('academyBackendConfig')||'null');
if(!cfg){location.replace('./index.html');return}
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(cfg);
const auth=AcademyBackend.auth(),db=AcademyBackend.database();
const $=id=>document.getElementById(id);
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const params=new URLSearchParams(location.search);
const type=['public','azhar'].includes(params.get('type'))?params.get('type'):'public';
const stage=['primary','prep','sec'].includes(params.get('stage'))?params.get('stage'):'primary';
const grade=String(params.get('grade')||'');
const requestedSubject=String(params.get('subject')||'').trim();
const validGrades={primary:['1','2','3','4','5','6'],prep:['1','2','3'],sec:['1','2','3']};
if(!validGrades[stage].includes(grade)){location.replace('./explore.html?'+new URLSearchParams({type,stage}));return}
const gradeNames={primary:{1:'الصف الأول الابتدائي',2:'الصف الثاني الابتدائي',3:'الصف الثالث الابتدائي',4:'الصف الرابع الابتدائي',5:'الصف الخامس الابتدائي',6:'الصف السادس الابتدائي'},prep:{1:'الصف الأول الإعدادي',2:'الصف الثاني الإعدادي',3:'الصف الثالث الإعدادي'},sec:{1:'الصف الأول الثانوي',2:'الصف الثاني الثانوي',3:'الصف الثالث الثانوي'}};
const stageNames={primary:'المرحلة الابتدائية',prep:'المرحلة الإعدادية',sec:'المرحلة الثانوية'};
const defaults={
 primary:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'religion',name:'التربية الدينية',emoji:'🕌'}],
 prep:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'computer',name:'الحاسب الآلي',emoji:'💻'}],
 sec:[{id:'arabic',name:'اللغة العربية',emoji:'📖'},{id:'english',name:'اللغة الإنجليزية',emoji:'🇬🇧'},{id:'math',name:'الرياضيات',emoji:'🧮'},{id:'physics',name:'الفيزياء',emoji:'⚛️'},{id:'chemistry',name:'الكيمياء',emoji:'🧪'},{id:'biology',name:'الأحياء',emoji:'🧬'},{id:'history',name:'التاريخ',emoji:'🏛️'},{id:'geography',name:'الجغرافيا',emoji:'🌍'}]
};
let customSubjects={},lessons={},quizzes={},profile=null,user=null,dataReady=false;
function safeImage(value=''){try{if(!value)return'';const u=new URL(value,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}}
function customList(){const raw=customSubjects?.[stage]?.[grade];return Array.isArray(raw)?raw:Object.values(raw||{})}
function subjects(){const list=[...(defaults[stage]||[])];customList().forEach(s=>{if(!s?.id||!s?.name||(s.type&&s.type!==type))return;const item={id:s.id,name:s.name,emoji:s.emoji||'⭐',imageUrl:s.imageUrl||''},i=list.findIndex(x=>x.id===s.id);if(i>=0)list[i]={...list[i],...item};else list.push(item)});return list}
function visible(item){if(!item||item.isHidden||item.workflowStatus==='draft')return false;const at=Number(item.publishAt||0);return !at||at<=Date.now()}
function counts(subject){const ls=Object.values(lessons||{}).filter(x=>visible(x)&&x.type===type&&x.stage===stage&&String(x.grade)===grade&&x.subject===subject),qs=Object.values(quizzes||{}).filter(x=>visible(x)&&x.type===type&&x.stage===stage&&String(x.grade)===grade&&x.subject===subject),teachers=new Set(),units=new Set();ls.forEach(l=>{units.add(Number(l.unit||1));if(l.teacherId)teachers.add(String(l.teacherId));if(Array.isArray(l.teacherIds))l.teacherIds.forEach(id=>id&&teachers.add(String(id)));else if(l.teacherIds&&typeof l.teacherIds==='object')Object.entries(l.teacherIds).forEach(([id,on])=>{if(on!==false)teachers.add(String(id))});(Array.isArray(l.videos)?l.videos:[]).forEach(v=>{if(v?.teacherId)teachers.add(String(v.teacherId))})});return {lessons:ls.length,quizzes:qs.length,units:units.size,teachers:teachers.size}}
function progressFor(subject){if(!user||!profile)return null;const contextual=profile?.subjectProgressV3?.[type]?.[stage]?.[grade]?.[subject];return contextual===undefined||contextual===null?Number(profile?.subjectProgress?.[subject]||0):Number(contextual||0)}
function subjectUrl(id){return './subject.html?'+new URLSearchParams({type,stage,grade,subject:id}).toString()}
function render(){
 const list=subjects(),palettes=['subject-pink','subject-blue','subject-green','subject-gold','subject-purple','subject-teal'];
 $('gradeSubjectCount').textContent=list.length;
 $('gradeSubjects').innerHTML=list.map((s,index)=>{const c=counts(s.id),img=safeImage(s.imageUrl||''),p=progressFor(s.id),hasProgress=p!==null,progress=Math.max(0,Math.min(100,Number(p||0))),stateLabel=!hasProgress?'استكشف المادة':progress<=0?'ابدأ المادة':progress>=100?'مكتملة 🎉':progress>=70?'اقتربت من الإكمال':progress>=25?'استمر من حيث توقفت':'بداية موفقة';return '<a class="ref-subject-card mix-subject-card student-subject-card-v2 '+palettes[index%palettes.length]+' '+(img?'has-image ':'')+(requestedSubject===s.id?'requested-subject':'')+'" data-subject="'+esc(s.id)+'" href="'+subjectUrl(s.id)+'" aria-label="فتح مادة '+esc(s.name)+'">'+
 '<div class="student-subject-cover"><div class="student-subject-cover-media">'+(img?'<img data-subject-image data-fallback="'+esc(s.emoji||'📚')+'" src="'+esc(img)+'" alt="" loading="lazy">':(window.AcademyStudentDesign?.subjectArt(s.id,s.emoji)||'<span>'+esc(s.emoji||'📚')+'</span>'))+'</div><span class="student-subject-progress-pill '+(!hasProgress?'guest-subject-progress':'')+'"><i class="fa-solid '+(hasProgress?'fa-chart-simple':'fa-eye')+'"></i> '+(hasProgress?progress+'%':'استكشاف')+'</span><span class="student-subject-state">'+stateLabel+'</span></div>'+ 
 '<div class="student-subject-body"><div class="student-subject-title-row"><div><small>'+esc(gradeNames[stage][grade])+'</small><h3>'+esc(s.name)+'</h3></div><span class="student-subject-arrow"><i class="fa-solid fa-arrow-left"></i></span></div>'+ 
 '<div class="student-subject-metrics"><span><i class="fa-solid fa-circle-play"></i><b>'+c.lessons+'</b><small>درس</small></span><span><i class="fa-solid fa-brain"></i><b>'+c.quizzes+'</b><small>اختبار</small></span><span><i class="fa-solid fa-layer-group"></i><b>'+(c.units||'—')+'</b><small>وحدة</small></span><span><i class="fa-solid fa-chalkboard-user"></i><b>'+(c.teachers||'—')+'</b><small>مدرس</small></span></div>'+ 
 (hasProgress?'<div class="student-subject-progress-row"><div class="ref-subject-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress+'"><span style="width:'+progress+'%"></span></div><small>'+progress+'%</small></div>':'')+ 
 '<div class="student-subject-footer"><span>'+(hasProgress&&progress>0&&progress<100?'كمّل رحلتك في المادة':'شاهد الوحدات والدروس المتاحة')+'</span><strong>'+(hasProgress&&progress>0&&progress<100?'متابعة':'فتح المادة')+' <i class="fa-solid fa-arrow-left"></i></strong></div></div></a>'}).join('');
}
function setupLabels(){
 const edu=type==='azhar'?'التعليم الأزهري':'التعليم العام',label=gradeNames[stage][grade];
 document.title=label+' | الأكاديمية';$('gradeEducationLabel').textContent=edu;$('gradePageTitle').textContent='مواد '+label;$('gradeContextLabel').textContent=label+' • '+stageNames[stage]+' • '+edu;$('gradeBreadcrumbLabel').textContent=label;
 const explore='./explore.html?'+new URLSearchParams({type,stage}).toString();$('changeGradeBtn').href=explore;$('gradeContextChange').href=explore;$('gradeExploreLink').href=explore;
}
function setupAccount(){const a=$('gradeAccountAction');if(user){a.href='./index.html';a.innerHTML='<i class="fa-solid fa-house"></i> العودة لحسابي';$('guestGradeNote').innerHTML='<i class="fa-solid fa-circle-check"></i> أنت مسجل الدخول؛ سيتم حفظ تقدمك داخل المواد والدروس تلقائيًا.'}else{const ret=location.pathname+location.search;a.href='./index.html?auth=login&return='+encodeURIComponent(ret);a.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول'}}
setupLabels();
window.AcademyUI?.showPageLoading('جاري تجهيز مواد الصف...');
Promise.all([
 db.ref('customSubjects').once('value'),
 db.ref('lessons').orderByChild('stage').equalTo(stage).once('value'),
 db.ref('quizzes').orderByChild('stage').equalTo(stage).once('value')
]).then(([s,l,q])=>{customSubjects=s.val()||{};lessons=l.val()||{};quizzes=q.val()||{};dataReady=true;render()}).catch(err=>{console.error(err);$('gradeSubjects').innerHTML='<div class="empty-state" style="grid-column:1/-1"><span>⚠️</span><h3>تعذر تحميل مواد الصف</h3><p>تحقق من الاتصال ثم أعد المحاولة.</p><button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button></div>'}).finally(()=>window.AcademyUI?.hidePageLoading());
auth.onAuthStateChanged(async u=>{user=u;profile=null;if(user){try{profile=(await db.ref('studentProfilesV3/'+user.uid).once('value')).val()||null}catch(err){console.warn(err)}}setupAccount();if(dataReady)render()});
})();
