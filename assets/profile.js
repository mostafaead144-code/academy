(() => {
'use strict';

let backendConfig=null;
try{
  backendConfig=window.ACADEMY_BACKEND_CONFIG||JSON.parse(localStorage.getItem('academyBackendConfig')||'null');
}catch(err){console.warn('Invalid Hostinger config',err)}
if(!backendConfig){location.replace('./index.html');return}
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(backendConfig);
const auth=AcademyBackend.auth(),db=AcademyBackend.database();
const $=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,profile={},baseline={account:{},study:{}};

const gradeLabels={
  primary:{1:'الصف الأول الابتدائي',2:'الصف الثاني الابتدائي',3:'الصف الثالث الابتدائي',4:'الصف الرابع الابتدائي',5:'الصف الخامس الابتدائي',6:'الصف السادس الابتدائي'},
  prep:{1:'الصف الأول الإعدادي',2:'الصف الثاني الإعدادي',3:'الصف الثالث الإعدادي'},
  sec:{1:'الصف الأول الثانوي',2:'الصف الثاني الثانوي',3:'الصف الثالث الثانوي'}
};
const badges=[
  {id:'first_lesson',emoji:'🚀',name:'البداية',desc:'أكمل أول درس',check:p=>(p.stats?.completedLessons||0)>=1},
  {id:'five_lessons',emoji:'📚',name:'مستمر',desc:'أكمل 5 دروس',check:p=>(p.stats?.completedLessons||0)>=5},
  {id:'first_quiz',emoji:'🎯',name:'أول اختبار',desc:'أنهِ أول اختبار',check:p=>(p.stats?.completedQuizzes||0)>=1},
  {id:'xp_500',emoji:'⭐',name:'500 XP',desc:'اجمع 500 نقطة',check:p=>(p.stats?.totalXP||0)>=500},
  {id:'streak_3',emoji:'🔥',name:'3 أيام',desc:'حافظ على 3 أيام متتالية',check:p=>(p.stats?.streak||0)>=3},
  {id:'level_3',emoji:'🏅',name:'المستوى 3',desc:'وصل للمستوى الثالث',check:p=>(p.stats?.level||1)>=3}
];

function toast(msg,type='success'){
  const el=$('toast');
  if(!el)return;
  el.textContent=msg;el.className='toast show '+type;
  clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3000);
}
function initials(n='طالب'){return(n.trim()[0]||'ط').toUpperCase()}
function educationLabel(t){return t==='azhar'?'التعليم الأزهري':'التعليم العام'}
function localDateKey(d=new Date()){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}
function profileQuizHistory(){
  return Object.values(profile.quizHistory||{}).filter(Boolean).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function profileMistakeTotal(){
  return Object.values(profile.mistakeNotebook||{}).reduce((n,items)=>n+Object.values(items||{}).filter(Boolean).length,0);
}
function renderProfileAnalytics(){
  const s=profile.stats||{},history=profileQuizHistory(),mistakes=profileMistakeTotal();
  const avg=history.length?Math.round(history.reduce((n,x)=>n+Number(x.score||0),0)/history.length):0;
  const best=history.length?Math.max(...history.map(x=>Number(x.score||0))):null;
  if($('profileAverageScore'))$('profileAverageScore').textContent=history.length?avg+'%':'—';
  if($('profileBestScore'))$('profileBestScore').textContent=best===null?'—':best+'%';
  if($('profileStudyMinutes'))$('profileStudyMinutes').textContent=Number(s.studyMinutes||0);
  if($('profileMistakesTotal'))$('profileMistakesTotal').textContent=mistakes;

  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);
    const key=localDateKey(d),minutes=Number(profile.activityDaily?.[key]?.minutes||0),active=!!profile.activity?.days?.[key]||minutes>0;
    days.push({key,label:d.toLocaleDateString('ar-EG',{weekday:'short'}),minutes,active});
  }
  const weekMinutes=days.reduce((n,d)=>n+d.minutes,0),max=Math.max(1,...days.map(d=>d.minutes));
  if($('profileWeekMinutes'))$('profileWeekMinutes').textContent=weekMinutes;
  if($('profileWeekBars'))$('profileWeekBars').innerHTML=days.map(d=>{
    const height=d.minutes?Math.max(12,Math.round(d.minutes/max*72)):(d.active?10:5);
    return '<div class="'+(d.active?'active':'')+'" title="'+d.minutes+' دقيقة"><span style="height:'+height+'px"></span><small>'+esc(d.label)+'</small></div>';
  }).join('');

  let icon='🌱',title='ابدأ أول اختبار',text='سنلخص مستواك هنا مع كل محاولة جديدة.';
  if(history.length){
    if(avg>=85){icon='🏆';title='أداء ممتاز';text='متوسطك '+avg+'% — حافظ على المستوى وراجع الأخطاء القليلة المتبقية.'}
    else if(avg>=70){icon='💪';title='أداء قوي';text='متوسطك '+avg+'% — مراجعة الأخطاء ستدفعك للمستوى التالي.'}
    else if(avg>=50){icon='📈';title='أنت تتحسن';text='متوسطك '+avg+'% — ركز على الأسئلة التي تتكرر فيها الأخطاء.'}
    else{icon='🎯';title='ركز على الأساسيات';text='متوسطك '+avg+'% — ارجع للشرح ثم أعد الاختبارات الصعبة.'}
    if(mistakes>0)text+=' عندك '+mistakes+' سؤال في دفتر الأخطاء.';
  }
  if($('profilePerformanceIcon'))$('profilePerformanceIcon').textContent=icon;
  if($('profilePerformanceTitle'))$('profilePerformanceTitle').textContent=title;
  if($('profilePerformanceText'))$('profilePerformanceText').textContent=text;
}
async function syncPhoneDirectory(){
  if(!user?.uid||!profile?.phone)return;
  try{
    await AcademyBackend.request('student/profile/phone-index',{method:'POST',token:C.auth._token(),body:{phone:profile.phone,name:profile.name||user.displayName||''}});
  }catch(err){console.warn('Phone directory sync skipped',err)}
}
function accountSnapshot(){return{name:$('profileNameInput')?.value.trim()||''}}
function studySnapshot(){return{educationType:$('studyType')?.value||'public',stage:$('studyStage')?.value||'prep',grade:Number($('studyGrade')?.value||1)}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function setBaselines(){
  baseline.account=accountSnapshot();
  baseline.study=studySnapshot();
  updateDirtyStates();
}
function updateDirtyStates(){
  const accountDirty=!same(accountSnapshot(),baseline.account);
  const studyDirty=!same(studySnapshot(),baseline.study);
  if($('accountSaveStatus'))$('accountSaveStatus').textContent=accountDirty?'لديك تغييرات غير محفوظة.':'كل التغييرات محفوظة.';
  if($('studySaveStatus'))$('studySaveStatus').textContent=studyDirty?'سيتم تغيير المواد الظاهرة بعد الحفظ.':'المواد المعروضة تعتمد على المرحلة والصف.';
  if($('accountSaveBtn'))$('accountSaveBtn').disabled=!accountDirty;
  if($('studySaveBtn'))$('studySaveBtn').disabled=!studyDirty;
}
function updateGradeOptions(preserve=true){
  const stage=$('studyStage').value,max=stage==='primary'?6:3;
  const desired=preserve?Number($('studyGrade').value||profile.grade||1):Number(profile.grade||1);
  $('studyGrade').innerHTML=Array.from({length:max},(_,i)=>i+1).map(g=>'<option value="'+g+'">'+gradeLabels[stage][g]+'</option>').join('');
  $('studyGrade').value=String(Math.min(Math.max(1,desired),max));
  updateDirtyStates();
}
function savedLessonHref(b){
  const q=new URLSearchParams({
    type:b.type||profile.educationType||'public',
    stage:b.stage||profile.stage||'prep',
    grade:String(b.grade||profile.grade||1),
    subject:b.subject||'',
    id:b.lessonId||b.id
  });
  return './lesson.html?'+q.toString();
}
function lastActivityHref(){
  if(profile.lastLessonId){
    const q=new URLSearchParams({
      type:profile.educationType||'public',
      stage:profile.stage||'prep',
      grade:String(profile.grade||1),
      subject:profile.lastSubjectId||'',
      id:profile.lastLessonId
    });
    return './lesson.html?'+q.toString();
  }
  if(profile.lastSubjectId){
    const q=new URLSearchParams({
      type:profile.educationType||'public',
      stage:profile.stage||'prep',
      grade:String(profile.grade||1),
      subject:profile.lastSubjectId
    });
    return './subject.html?'+q.toString();
  }
  return './index.html';
}
function renderMistakeNotebook(){
 const groups=[];
 Object.entries(profile.mistakeNotebook||{}).forEach(([sourceId,items])=>{
   const teachers=new Map();Object.values(items||{}).filter(item=>item&&Array.isArray(item.opts)).forEach(item=>{const teacherId=item.teacherId||'';if(!teachers.has(teacherId))teachers.set(teacherId,[]);teachers.get(teacherId).push(item)});
   teachers.forEach((items,teacherId)=>groups.push({sourceId,teacherId,items}));
 });
 const count=groups.reduce((total,group)=>total+group.items.length,0);
 $('profileMistakeCount').textContent=count;
 $('mistakeNotebookList').innerHTML=groups.length?groups.map(group=>{
   const recent=group.items[0],query=new URLSearchParams({type:recent.type||profile.educationType||'public',stage:recent.stage||profile.stage||'prep',grade:String(recent.grade||profile.grade||1),subject:recent.subject||'arabic',reviewMistakes:'1'});
   query.set(recent.sourceType==='quiz'?'quiz':'id',group.sourceId);if(group.teacherId)query.set('teacher',group.teacherId);
   return '<section class="mistake-group"><div class="mistake-group-head"><div><small>'+(recent.sourceType==='quiz'?'اختبار':'درس')+' • '+group.items.length+' سؤال</small><h3>'+esc(recent.title||'مراجعة')+(recent.teacherName?' — '+esc(recent.teacherName):'')+'</h3></div><a class="btn btn-primary" href="./lesson.html?'+query.toString()+'">تدرّب على أخطائك</a></div>'+
     group.items.map(item=>'<article class="mistake-entry"><strong>'+esc(item.text||'سؤال')+'</strong><p>إجابتك: <span class="mistake-chosen">'+esc(item.opts[item.chosen]||'—')+'</span></p><p>الصحيح: <span class="mistake-correct">'+esc(item.opts[item.correctAnswer]||'—')+'</span></p></article>').join('')+'</section>';
 }).join(''):'<div class="profile-empty-activity"><span>🎉</span><h3>دفتر أخطائك خالٍ</h3><p>عندما تخطئ في تدريب، ستجد السؤال هنا لتراجعه وتعيد المحاولة.</p><a class="btn btn-primary" href="./index.html">استكشف الدروس</a></div>';
}
function render(){
  window.AcademySuite?.setStudentProfile(profile);
  const s=profile.stats||{},name=profile.name||user.displayName||(user.email||'طالب').split('@')[0];
  const totalXP=Number(s.totalXP||0),level=Number(s.level||Math.floor(totalXP/1000)+1),levelXp=totalXP%1000,remaining=1000-levelXp;

  $('profileAvatar').textContent=initials(name);
  $('profileNameTitle').textContent=name;
  $('profileStageTitle').textContent=(gradeLabels[profile.stage]?.[profile.grade]||'لم تحدد صفك بعد')+' • '+educationLabel(profile.educationType);
  $('profileLevel').textContent=level;
  $('profileXp').textContent=totalXP;
  $('profileLevelProgress').style.width=(levelXp/10)+'%';
  $('profileLevelProgressTrack').setAttribute('aria-valuenow',String(levelXp));
  $('profileNextLevelText').textContent=remaining+' XP للمستوى التالي';

  $('profileLessons').textContent=s.completedLessons||0;
  $('profileQuizzes').textContent=s.completedQuizzes||0;
  $('profileStreak').textContent=s.streak||0;
  $('profileTotalXp').textContent=totalXP;
  renderProfileAnalytics();
  renderMistakeNotebook();
  $('profileNameInput').value=name;
  const phoneAccount=profile.loginMethod==='phone'||Boolean(profile.phone);
  $('profileContactLabel').textContent=phoneAccount?'رقم الهاتف':'البريد الإلكتروني';
  $('profileContactHint').textContent=phoneAccount?'لتغيير رقم الدخول تواصل مع إدارة المنصة.':'تغيير البريد يتطلب التواصل مع إدارة المنصة.';
  $('profileEmailInput').value=phoneAccount?(profile.phone||''):(user.email||'');
  $('emailResetControls').classList.toggle('hidden',phoneAccount);
  $('phonePasswordForm').classList.toggle('hidden',!phoneAccount);
  if($('securityEmail'))$('securityEmail').textContent=phoneAccount?'—':(user.email||'لا يوجد بريد');

  $('studyType').value=profile.educationType||'public';
  $('studyStage').value=profile.stage||'prep';
  updateGradeOptions(false);
  $('studyGrade').value=String(profile.grade||1);

  const badgeRows=window.AcademyGame?.badges?window.AcademyGame.badges(profile):badges.map(b=>({...b,unlocked:b.check(profile)}));
  $('profileBadges').innerHTML=badgeRows.map(b=>{
    const unlocked=!!b.unlocked;
    return '<article class="badge-item '+(unlocked?'unlocked':'locked')+'" aria-label="'+esc(b.name)+'، '+(unlocked?'مفتوحة':'مقفولة')+'"><span>'+b.emoji+'</span><strong>'+esc(b.name)+'</strong><small>'+esc(b.desc)+'</small>'+(unlocked?'<i class="fa-solid fa-circle-check badge-check"></i>':'<i class="fa-solid fa-lock badge-lock"></i>')+'</article>';
  }).join('');

  const bookmarks=Object.entries(profile.bookmarks||{}).map(([id,b])=>({id,...(b||{})})).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  if($('profileSavedCount'))$('profileSavedCount').textContent=bookmarks.length;
  const savedGrid=$('savedLessonsGrid');
  if(savedGrid){
    savedGrid.innerHTML=bookmarks.length?bookmarks.map(b=>
      '<article class="saved-lesson-card">'+
        '<a class="saved-lesson-main" href="'+savedLessonHref(b)+'"><span class="saved-lesson-icon"><i class="fa-solid fa-bookmark"></i></span><div><strong>'+esc(b.title||'درس محفوظ')+'</strong><small>العودة إلى الدرس</small></div><i class="fa-solid fa-arrow-left saved-open-arrow"></i></a>'+
        '<button class="saved-remove-btn" data-remove-bookmark="'+esc(b.id)+'" title="إزالة من المحفوظات" aria-label="إزالة '+esc(b.title||'الدرس')+' من المحفوظات"><i class="fa-solid fa-trash"></i></button>'+
      '</article>'
    ).join(''):'<div class="profile-empty-saved"><span>🔖</span><h3>لسه مفيش دروس محفوظة</h3><p>احفظ أي درس من علامة الحفظ داخل صفحة الدرس.</p><a class="btn btn-primary" href="./index.html">استكشف موادك</a></div>';

    $$('[data-remove-bookmark]').forEach(btn=>btn.onclick=async()=>{
      const ok=await window.AcademyUI.confirm({
        title:'إزالة الدرس من المحفوظات؟',
        message:'سيظل تقدمك في الدرس محفوظًا، وسيتم فقط إزالته من قائمة المراجعة.',
        tone:'warning',
        acceptText:'إزالة'
      });
      if(!ok)return;
      btn.disabled=true;
      try{
        await db.ref('studentProfilesV3/'+user.uid+'/bookmarks/'+btn.dataset.removeBookmark).remove();
        if(profile.bookmarks)delete profile.bookmarks[btn.dataset.removeBookmark];
        render();toast('تمت إزالة الدرس من المحفوظات.');
      }catch(err){
        console.error(err);btn.disabled=false;toast('تعذر إزالة الدرس الآن.','error');
      }
    });
  }

  if(profile.lastLessonTitle||profile.lastSubjectId){
    $('lastActivity').innerHTML=
      '<article class="last-activity-card">'+
        '<div class="last-activity-icon"><i class="fa-solid fa-play"></i></div>'+
        '<div><span class="section-kicker">آخر نشاط</span><h3>'+esc(profile.lastLessonTitle||'متابعة المادة')+'</h3><p>'+esc(gradeLabels[profile.stage]?.[profile.grade]||'')+'</p></div>'+
        '<a class="btn btn-primary" href="'+lastActivityHref()+'">متابعة <i class="fa-solid fa-arrow-left"></i></a>'+
      '</article>';
  }else{
    $('lastActivity').innerHTML='<div class="profile-empty-activity"><span>▶️</span><h3>ابدأ أول درس</h3><p>أول ما تبدأ التعلم هنحفظ مكانك هنا تلقائيًا.</p><a class="btn btn-primary" href="./index.html">ابدأ الآن</a></div>';
  }

  setBaselines();
}
function switchTab(tab,updateUrl=true){
  const allowed=['overview','account','study','saved','mistakes','security'];
  if(!allowed.includes(tab))tab='overview';
  $$('[data-profile-tab]').forEach(b=>{
    const active=b.dataset.profileTab===tab;
    b.classList.toggle('active',active);
    b.setAttribute('aria-selected',active?'true':'false');
    b.tabIndex=active?0:-1;
  });
  $$('.profile-tab').forEach(s=>s.classList.add('hidden'));
  $('tab-'+tab)?.classList.remove('hidden');
  if(updateUrl){
    const url=new URL(location.href);
    if(tab==='overview')url.searchParams.delete('tab');else url.searchParams.set('tab',tab);
    history.replaceState({},'',url);
  }
}
const profileTabs=$$('[data-profile-tab]');
profileTabs.forEach((b,i)=>{
  b.onclick=()=>switchTab(b.dataset.profileTab);
  b.onkeydown=e=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
    e.preventDefault();
    let next=i;
    if(e.key==='ArrowRight')next=(i-1+profileTabs.length)%profileTabs.length;
    if(e.key==='ArrowLeft')next=(i+1)%profileTabs.length;
    if(e.key==='Home')next=0;
    if(e.key==='End')next=profileTabs.length-1;
    profileTabs[next].focus();
    switchTab(profileTabs[next].dataset.profileTab);
  };
});
if($('profileMistakesShortcut'))$('profileMistakesShortcut').onclick=()=>{switchTab('mistakes');document.querySelector('.profile-content')?.scrollIntoView({behavior:'smooth',block:'start'})};

$('profileNameInput').addEventListener('input',updateDirtyStates);
$('studyType').addEventListener('change',updateDirtyStates);
$('studyStage').addEventListener('change',()=>updateGradeOptions(false));
$('studyGrade').addEventListener('change',updateDirtyStates);

$('accountForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('profileNameInput').value.trim(),btn=$('accountSaveBtn');
  if(name.length<2)return toast('اكتب اسمًا صحيحًا من حرفين على الأقل.','error');
  if(same(accountSnapshot(),baseline.account))return toast('لا توجد تغييرات جديدة للحفظ.','info');
  window.AcademyUI?.setButtonLoading(btn,true,'حفظ');
  try{
    await Promise.all([
      user.updateProfile({displayName:name}),
      db.ref('studentProfilesV3/'+user.uid).update({name,updatedAt:Date.now()}),
      profile.phone?AcademyBackend.request('student/profile/phone-index',{method:'POST',token:C.auth._token(),body:{phone:profile.phone,name}}):Promise.resolve()
    ]);
    profile.name=name;
    render();
    toast('تم تحديث اسمك بنجاح.');
  }catch(err){
    console.error(err);toast('تعذر حفظ بيانات الحساب الآن.','error');
  }finally{
    window.AcademyUI?.setButtonLoading(btn,false);
    updateDirtyStates();
  }
});

$('studyForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('studySaveBtn'),next=studySnapshot();
  if(same(next,baseline.study))return toast('لم تغيّر المرحلة أو الصف.','info');
  const label=(gradeLabels[next.stage]?.[next.grade]||'الصف المحدد')+' • '+educationLabel(next.educationType);
  const ok=await window.AcademyUI.confirm({
    title:'تغيير المرحلة الدراسية؟',
    message:'سيتم عرض مواد '+label+' في لوحة الطالب. تقدمك القديم سيظل محفوظًا ولن يتم حذفه.',
    tone:'warning',
    acceptText:'تحديث المرحلة'
  });
  if(!ok)return;
  window.AcademyUI?.setButtonLoading(btn,true,'تحديث');
  try{
    const patch={...next,updatedAt:Date.now()};
    await db.ref('studentProfilesV3/'+user.uid).update(patch);
    Object.assign(profile,patch);
    render();
    toast('تم تحديث مرحلتك الدراسية.');
  }catch(err){
    console.error(err);toast('تعذر تحديث المرحلة الآن.','error');
  }finally{
    window.AcademyUI?.setButtonLoading(btn,false);
    updateDirtyStates();
  }
});

$('sendResetBtn').onclick=async()=>{
  const btn=$('sendResetBtn');
  if(profile.loginMethod==='phone'||profile.phone)return;
  if(!user?.email)return toast('لا يوجد بريد إلكتروني مرتبط بهذا الحساب.','error');
  const ok=await window.AcademyUI.confirm({
    title:'إرسال رابط إعادة التعيين؟',
    message:'سنرسل رابطًا آمنًا إلى '+user.email+' لتغيير كلمة المرور.',
    tone:'warning',
    acceptText:'إرسال الرابط'
  });
  if(!ok)return;
  window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
  try{
    await auth.sendPasswordResetEmail(user.email);
    toast('تم إرسال رابط إعادة تعيين كلمة المرور.');
  }catch(err){
    console.error(err);toast('تعذر إرسال الرابط الآن. تأكد من البريد وحاول مرة أخرى.','error');
  }finally{
    window.AcademyUI?.setButtonLoading(btn,false);
  }
};

$('phonePasswordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!user||!(profile.loginMethod==='phone'||profile.phone))return;
  const current=$('currentPassword').value, next=$('newPassword').value, btn=$('changePhonePasswordBtn');
  if(next.length<6)return toast('كلمة المرور الجديدة يجب أن تتكون من 6 أحرف على الأقل.','error');
  window.AcademyUI?.setButtonLoading(btn,true,'جاري التغيير');
  try{
    const credential=AcademyBackend.auth.EmailAuthProvider.credential(user.email,current);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(next);
    $('phonePasswordForm').reset();
    toast('تم تغيير كلمة المرور بنجاح.');
  }catch(err){
    console.error(err);
    toast(err.code==='auth/wrong-password'||err.code==='auth/invalid-credential'?'كلمة المرور الحالية غير صحيحة.':'تعذر تغيير كلمة المرور الآن.','error');
  }finally{
    window.AcademyUI?.setButtonLoading(btn,false);
  }
});

async function logout(){
  const ok=await window.AcademyUI.confirm({
    title:'تسجيل الخروج؟',
    message:'سيظل تقدمك محفوظًا في حسابك ويمكنك العودة في أي وقت.',
    tone:'warning',
    acceptText:'تسجيل الخروج'
  });
  if(!ok)return;
  try{
    await auth.signOut();
    location.replace('./index.html');
  }catch(err){
    console.error(err);toast('تعذر تسجيل الخروج الآن.','error');
  }
}
$('profileLogout').onclick=logout;
$('securityLogout').onclick=logout;

window.AcademyUI?.showPageLoading('جاري تحميل ملفك الشخصي...');
auth.onAuthStateChanged(async u=>{
  if(!u){window.AcademyUI?.hidePageLoading();location.replace('./index.html');return}
  user=u;
  try{
    const snap=await db.ref('studentProfilesV3/'+u.uid).once('value');
    profile=snap.val()||{};
    await syncPhoneDirectory();
    render();
    const requested=new URLSearchParams(location.search).get('tab')||'overview';
    switchTab(requested,false);
  }catch(err){
    console.error(err);
    toast('تعذر تحميل بيانات حسابك الآن.','error');
  }finally{
    window.AcademyUI?.hidePageLoading();
  }
});
})();
