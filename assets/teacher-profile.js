(() => {
'use strict';

const view=document.getElementById('teacherProfileView');
const breadcrumb=document.getElementById('teacherBreadcrumbName');
const teacherId=new URLSearchParams(location.search).get('id');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=value=>{const raw=String(value||'').trim();if(!raw)return'';try{const u=new URL(raw,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};
const stageLabels={primary:'المرحلة الابتدائية',prep:'المرحلة الإعدادية',sec:'المرحلة الثانوية'};
const typeLabels={public:'التعليم العام',azhar:'التعليم الأزهري'};
const defaultSubjects={
  arabic:{name:'اللغة العربية',emoji:'📚'},math:{name:'الرياضيات',emoji:'➗'},science:{name:'العلوم',emoji:'🔬'},
  english:{name:'اللغة الإنجليزية',emoji:'🔤'},social:{name:'الدراسات الاجتماعية',emoji:'🌍'},religion:{name:'التربية الدينية',emoji:'🕌'},
  computer:{name:'الحاسب الآلي',emoji:'💻'},physics:{name:'الفيزياء',emoji:'⚛️'},chemistry:{name:'الكيمياء',emoji:'🧪'},
  biology:{name:'الأحياء',emoji:'🧬'},history:{name:'التاريخ',emoji:'🏺'},geography:{name:'الجغرافيا',emoji:'🗺️'}
};

function unavailable(){
  view.innerHTML='<div class="teacher-profile-empty"><span>👨‍🏫</span><h1>هذا الملف غير متاح حاليًا</h1><p>قد يكون ملف المدرس غير منشور أو تم إيقاف عرضه.</p><a class="btn btn-primary" href="./index.html#teachers">استكشف باقي المدرسين</a></div>';
}
function flattenSubjects(node,out={}){
  if(!node||typeof node!=='object')return out;
  if(node.id&&node.name){out[node.id]={name:node.name,emoji:node.emoji||'📚',imageUrl:node.imageUrl||''};return out}
  Object.values(node).forEach(value=>{
    if(Array.isArray(value))value.forEach(item=>{if(item?.id&&item?.name)out[item.id]={name:item.name,emoji:item.emoji||'📚',imageUrl:item.imageUrl||''};else flattenSubjects(item,out)});
    else flattenSubjects(value,out);
  });
  return out;
}
function subjectInfo(id,custom){
  return custom[id]||defaultSubjects[id]||{name:id||'مادة دراسية',emoji:'📚',imageUrl:''};
}
function gradeText(stage,grade){
  const n=Number(grade||1),ord=['الأول','الثاني','الثالث','الرابع','الخامس','السادس'][n-1]||n;
  return 'الصف '+ord+' '+(stage==='primary'?'الابتدائي':stage==='prep'?'الإعدادي':stage==='sec'?'الثانوي':'');
}
function lessonBelongs(lesson){
  if(!lesson||lesson.isHidden)return false;
  if(String(lesson.teacherId||'')===String(teacherId))return true;
  return (Array.isArray(lesson.videos)?lesson.videos:[]).some(v=>String(v?.teacherId||'')===String(teacherId));
}
function teacherVideoCount(lesson){
  const videos=Array.isArray(lesson?.videos)?lesson.videos:[];
  const own=videos.filter(v=>String(v?.teacherId||'')===String(teacherId)).length;
  return own||((String(lesson?.teacherId||'')===String(teacherId))?videos.length:0);
}
function contentQuery(item){
  const q=new URLSearchParams({
    type:item.type||'public',
    stage:item.stage||'prep',
    grade:String(item.grade||1),
    subject:item.subject||'',
    id:item.id,
    teacher:teacherId
  });
  return q.toString();
}
function subjectQuery(scope){
  const q=new URLSearchParams({
    type:scope.type||'public',
    stage:scope.stage||'prep',
    grade:String(scope.grade||1),
    subject:scope.subject||'',
    teacher:teacherId
  });
  return q.toString();
}
function profileSection(title,value,icon){
  if(!value)return'';
  return '<article class="teacher-about-card"><span class="teacher-about-icon"><i class="fa-solid '+icon+'"></i></span><div><h3>'+esc(title)+'</h3><p>'+esc(value)+'</p></div></article>';
}

if(!teacherId||!window.ACADEMY_BACKEND_CONFIG||!window.AcademyBackend){unavailable();return}

try{
  if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(window.ACADEMY_BACKEND_CONFIG);
  const db=AcademyBackend.database();

  Promise.all([
    db.ref('settings/publicTeachers/'+teacherId).once('value'),
    db.ref('lessons').once('value'),
    db.ref('quizzes').once('value'),
    db.ref('customSubjects').once('value')
  ]).then(([profileSnap,lessonsSnap,quizzesSnap,subjectsSnap])=>{
    const p=profileSnap.val();
    if(!p||p.active===false||!p.name){unavailable();return}

    const customSubjects=flattenSubjects(subjectsSnap.val()||{});
    const lessons=Object.entries(lessonsSnap.val()||{}).map(([id,value])=>({id,...(value||{})})).filter(lessonBelongs);
    const lessonIds=new Set(lessons.map(l=>l.id));
    const quizzes=Object.entries(quizzesSnap.val()||{}).map(([id,value])=>({id,...(value||{})})).filter(q=>!q.isHidden&&(String(q.teacherId||'')===String(teacherId)||(q.lessonId&&lessonIds.has(q.lessonId))));
    const sortedLessons=[...lessons].sort((a,b)=>Number(b.createdAt||b.updatedAt||0)-Number(a.createdAt||a.updatedAt||0));
    const sortedQuizzes=[...quizzes].sort((a,b)=>Number(b.createdAt||b.updatedAt||0)-Number(a.createdAt||a.updatedAt||0));

    const scopeMap=new Map();
    lessons.forEach(l=>{
      const key=[l.type||'public',l.stage||'prep',String(l.grade||1),l.subject||''].join('|');
      if(!scopeMap.has(key))scopeMap.set(key,{type:l.type||'public',stage:l.stage||'prep',grade:String(l.grade||1),subject:l.subject||'',lessons:0,quizzes:0});
      scopeMap.get(key).lessons++;
    });
    quizzes.forEach(q=>{
      const key=[q.type||'public',q.stage||'prep',String(q.grade||1),q.subject||''].join('|');
      if(!scopeMap.has(key))scopeMap.set(key,{type:q.type||'public',stage:q.stage||'prep',grade:String(q.grade||1),subject:q.subject||'',lessons:0,quizzes:0});
      scopeMap.get(key).quizzes++;
    });
    const scopes=[...scopeMap.values()];
    const uniqueSubjects=new Set(scopes.map(s=>s.subject).filter(Boolean));
    const uniqueGrades=new Set(scopes.map(s=>s.stage+'|'+s.grade));
    const totalVideos=lessons.reduce((sum,l)=>sum+teacherVideoCount(l),0);

    document.title=p.name+' | معلمو الأكاديمية';
    if(breadcrumb)breadcrumb.textContent=p.name;
    const photo=safeUrl(p.photoUrl||'');
    const cover=safeUrl(p.coverUrl||'');
    const initials=String(p.name||'م').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('');

    const subjectCards=scopes.length?scopes.slice(0,8).map(scope=>{
      const s=subjectInfo(scope.subject,customSubjects),image=safeUrl(s.imageUrl||'');
      return '<a class="teacher-subject-card" href="./subject.html?'+subjectQuery(scope)+'">'+
        '<div class="teacher-subject-art '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+(image?'':'<span>'+esc(s.emoji)+'</span>')+'</div>'+
        '<div><small>'+esc(typeLabels[scope.type]||'الأكاديمية')+' • '+esc(gradeText(scope.stage,scope.grade))+'</small><h3>'+esc(s.name)+'</h3><p>'+scope.lessons+' درس • '+scope.quizzes+' اختبار</p><strong>فتح المادة <i class="fa-solid fa-arrow-left"></i></strong></div>'+
      '</a>';
    }).join(''):'<div class="teacher-content-empty">لا توجد مواد منشورة لهذا المدرس حتى الآن.</div>';

    const lessonCards=sortedLessons.slice(0,6).map(l=>{
      const s=subjectInfo(l.subject,customSubjects),image=safeUrl(s.imageUrl||''),videos=teacherVideoCount(l);
      return '<a class="teacher-lesson-card" href="./lesson.html?'+contentQuery(l)+'">'+
        '<div class="teacher-lesson-art '+(image?'has-image':'')+'" '+(image?'style="background-image:url(&quot;'+esc(image)+'&quot;)"':'')+'>'+
          (image?'':'<span>'+esc(s.emoji)+'</span>')+'<em>'+esc(s.name)+'</em>'+
        '</div>'+
        '<div class="teacher-lesson-copy"><small>'+esc(gradeText(l.stage,l.grade))+'</small><h3>'+esc(l.title||'درس')+'</h3><p><i class="fa-solid fa-circle-play"></i> '+videos+' '+(videos===1?'شرح':'شروحات')+' • الوحدة '+Number(l.unit||1)+'</p><strong>ابدأ الدرس <i class="fa-solid fa-arrow-left"></i></strong></div>'+
      '</a>';
    }).join('');

    const quizCards=sortedQuizzes.slice(0,4).map(q=>{
      const s=subjectInfo(q.subject,customSubjects),count=Array.isArray(q.questions)?q.questions.length:0;
      const href=q.lessonId&&lessonIds.has(q.lessonId)?'./lesson.html?'+contentQuery(lessons.find(l=>l.id===q.lessonId)):'./exam-center.html';
      return '<a class="teacher-quiz-card" href="'+href+'"><span class="teacher-quiz-icon"><i class="fa-solid fa-brain"></i></span><div><small>'+esc(s.name)+'</small><h3>'+esc(q.name||'اختبار')+'</h3><p>'+count+' سؤال • '+esc(gradeText(q.stage,q.grade))+'</p></div><i class="fa-solid fa-chevron-left"></i></a>';
    }).join('');

    view.innerHTML=
      '<section class="teacher-showcase-hero">'+
        '<div class="teacher-showcase-cover '+(cover?'has-cover':'')+'" '+(cover?'style="--teacher-cover-image:url(&quot;'+esc(cover)+'&quot;)"':'')+'><span class="teacher-showcase-orb one"></span><span class="teacher-showcase-orb two"></span></div>'+
        '<div class="teacher-showcase-content">'+
          '<div class="teacher-showcase-photo">'+(photo?'<img src="'+esc(photo)+'" alt="صورة '+esc(p.name)+'" loading="eager">':'<span>'+esc(initials)+'</span>')+'<i class="fa-solid fa-circle-check" title="ملف منشور من الأكاديمية"></i></div>'+
          '<div class="teacher-showcase-identity"><span class="teacher-profile-eyebrow"><i class="fa-solid fa-shield-halved"></i> من فريق الأكاديمية</span><h1>'+esc(p.name)+'</h1><p>'+esc(p.title||'معلم في الأكاديمية')+'</p>'+
            '<div class="teacher-showcase-tags">'+
              (uniqueSubjects.size?'<span><i class="fa-solid fa-book-open"></i> '+uniqueSubjects.size+' '+(uniqueSubjects.size===1?'مادة':'مواد')+'</span>':'')+
              (uniqueGrades.size?'<span><i class="fa-solid fa-layer-group"></i> '+uniqueGrades.size+' '+(uniqueGrades.size===1?'صف':'صفوف')+'</span>':'')+
            '</div>'+
          '</div>'+
          '<div class="teacher-showcase-actions"><a class="btn btn-primary" href="#teacherLatestLessons"><i class="fa-solid fa-circle-play"></i> ابدأ مع المدرس</a><a class="btn btn-soft" href="#teacherSubjects"><i class="fa-solid fa-book"></i> مواده</a></div>'+
        '</div>'+
      '</section>'+

      '<section class="teacher-profile-stats">'+
        '<article><span class="blue"><i class="fa-solid fa-circle-play"></i></span><div><strong>'+lessons.length+'</strong><small>درس منشور</small></div></article>'+
        '<article><span class="purple"><i class="fa-solid fa-video"></i></span><div><strong>'+totalVideos+'</strong><small>شرح فيديو</small></div></article>'+
        '<article><span class="green"><i class="fa-solid fa-brain"></i></span><div><strong>'+quizzes.length+'</strong><small>اختبار</small></div></article>'+
        '<article><span class="orange"><i class="fa-solid fa-book-open"></i></span><div><strong>'+uniqueSubjects.size+'</strong><small>مادة دراسية</small></div></article>'+
      '</section>'+

      '<div class="teacher-profile-layout">'+
        '<div class="teacher-profile-primary">'+
          '<section class="teacher-profile-block" id="teacherSubjects"><div class="teacher-profile-block-head"><div><span class="section-kicker">المحتوى التعليمي</span><h2>مواد وصفوف المدرس</h2><p>اختر المادة والصف لعرض المسار الكامل لهذا المدرس داخل الأكاديمية.</p></div></div><div class="teacher-subject-grid">'+subjectCards+'</div></section>'+
          '<section class="teacher-profile-block" id="teacherLatestLessons"><div class="teacher-profile-block-head"><div><span class="section-kicker">ابدأ التعلم</span><h2>أحدث دروس المدرس</h2><p>الدروس المنشورة والمعتمدة فقط.</p></div>'+(lessons.length>6?'<a class="btn btn-soft" href="./explore.html">عرض المزيد</a>':'')+'</div><div class="teacher-lesson-grid">'+(lessonCards||'<div class="teacher-content-empty">لم ينشر المدرس دروسًا بعد.</div>')+'</div></section>'+
          (quizzes.length?'<section class="teacher-profile-block"><div class="teacher-profile-block-head"><div><span class="section-kicker">ثبّت فهمك</span><h2>اختبارات المدرس</h2></div></div><div class="teacher-quiz-list">'+quizCards+'</div></section>':'')+
        '</div>'+
        '<aside class="teacher-profile-aside">'+
          '<section class="teacher-profile-about"><span class="section-kicker">تعرف على مدرسك</span><h2>عن المدرس</h2>'+
            profileSection('نبذة عني',p.bio,'fa-user')+
            profileSection('المؤهلات',p.qualifications,'fa-graduation-cap')+
            profileSection('الخبرة',p.experience,'fa-chalkboard-user')+
            profileSection('طريقتي في الشرح',p.teachingStyle,'fa-lightbulb')+
            (!p.bio&&!p.qualifications&&!p.experience&&!p.teachingStyle?'<p class="teacher-about-placeholder">سيضيف المدرس تفاصيله المهنية هنا بعد اعتمادها من الإدارة.</p>':'')+
          '</section>'+
          '<section class="teacher-profile-trust"><span><i class="fa-solid fa-shield-halved"></i></span><div><strong>محتوى تحت إشراف الأكاديمية</strong><p>الدروس والاختبارات المنشورة هنا تمر عبر نظام إدارة الأكاديمية.</p></div></section>'+
        '</aside>'+
      '</div>'+

      '<section class="teacher-profile-cta"><div><span class="section-kicker">جاهز تبدأ؟</span><h2>اختر مادة وابدأ رحلة التعلم مع '+esc(p.name)+'</h2><p>ويمكنك في أي وقت مقارنة الشرح بمدرسين آخرين داخل نفس الأكاديمية.</p></div><a class="btn btn-primary" href="./explore.html">استكشف كل المواد <i class="fa-solid fa-arrow-left"></i></a></section>';

    view.querySelector('.teacher-showcase-photo img')?.addEventListener('error',e=>{e.target.parentElement.innerHTML='<span>'+esc(initials)+'</span><i class="fa-solid fa-circle-check"></i>'},{once:true});
  }).catch(error=>{console.error(error);unavailable()});
}catch(error){
  console.error(error);unavailable();
}
})();
