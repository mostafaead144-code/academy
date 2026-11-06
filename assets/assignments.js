(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,access=null,assignments=[],submissions={},data={customSubjects:{}},filter='all',activeAssignment=null,lastModalTrigger=null;

function assignmentAccessible(a){return !S||S.canAccess(a,access,a?.subject||'')}
function canOpenAssignment(a){return assignmentAccessible(a)||!!submissions[a?.id]}
function targetMatches(a){
  const mode=a.targetMode||'all';
  if(mode==='students'){
    const ids=Array.isArray(a.targetStudentIds)?a.targetStudentIds:Object.keys(a.targetStudentIds||{});
    return ids.includes(user?.uid);
  }
  if(mode==='group'){
    const groups=Array.isArray(profile?.groupIds)?profile.groupIds:Object.keys(profile?.groupIds||{});
    return !!a.targetGroupId&&(profile?.classGroupId===a.targetGroupId||groups.includes(a.targetGroupId));
  }
  return true;
}
function matching(){
  return assignments
    .filter(a=>!a.isHidden&&(!Number(a.publishAt||0)||Number(a.publishAt)<=Date.now())&&a.type===profile.educationType&&a.stage===profile.stage&&String(a.grade)===String(profile.grade)&&targetMatches(a))
    .sort((a,b)=>{
      const as=statusFor(a),bs=statusFor(b),rank={overdue:0,pending:1,submitted:2,graded:3};
      if(rank[as]!==rank[bs])return rank[as]-rank[bs];
      if(as==='graded'&&bs==='graded')return Number(submissions[b.id]?.gradedAt||0)-Number(submissions[a.id]?.gradedAt||0);
      return Number(a.dueAt||Infinity)-Number(b.dueAt||Infinity);
    });
}
function isOverdue(a){
  return !submissions[a.id]&&!!a.dueAt&&Date.now()>Number(a.dueAt);
}
function isDueSoon(a){
  if(!a.dueAt||submissions[a.id])return false;
  const diff=Number(a.dueAt)-Date.now();
  return diff>=0&&diff<=48*3600000;
}
function statusFor(a){
  const s=submissions[a.id];
  if(s?.status==='graded')return'graded';
  if(s)return'submitted';
  if(isOverdue(a))return'overdue';
  return'pending';
}
function statusLabel(s){
  return s==='graded'?'تم التصحيح':s==='submitted'?'تم التسليم':s==='overdue'?'متأخر':'مطلوب';
}
function dueText(ts){
  if(!ts)return'بدون موعد نهائي';
  const d=new Date(ts),diff=ts-Date.now();
  const absHours=Math.ceil(Math.abs(diff)/3600000);
  const days=Math.ceil(diff/86400000);
  if(diff<0){
    if(absHours<24)return'متأخر منذ '+absHours+' ساعة';
    return'متأخر منذ '+Math.ceil(absHours/24)+' يوم';
  }
  if(diff<=6*3600000)return'متبقي '+Math.max(1,Math.ceil(diff/3600000))+' ساعة';
  if(days===1)return'غدًا';
  if(days===0)return'اليوم';
  return d.toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
}
function fullDate(ts){
  return ts?new Date(ts).toLocaleString('ar-EG',{day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'}):'بدون موعد نهائي';
}
function supportHrefForAssignment(a){
 return './support.html?'+new URLSearchParams({source:'assignment',category:'assignment',sourceId:a.id||'',type:a.type||profile.educationType||'public',stage:a.stage||profile.stage||'',grade:String(a.grade||profile.grade||''),subject:a.subject||'',title:'مشكلة في واجب '+(a.title||''),href:'./assignments.html?assignment='+(a.id||'')}).toString();
}
function subjectName(id){
  return C.subjectName(data,id,profile.stage,String(profile.grade),profile.educationType)||id||'مادة';
}
function subjectMeta(id){
  return (C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType)||[]).find(s=>String(s.id)===String(id))||{id,name:subjectName(id),emoji:'📚'};
}
function isNewAssignment(a){
  return !submissions[a.id]&&Number(a.createdAt||0)>Date.now()-72*3600000;
}
function countdownText(ts){
  if(!ts)return'بدون موعد';
  const diff=Number(ts)-Date.now();
  if(diff<=0){
    const mins=Math.ceil(Math.abs(diff)/60000);
    if(mins<60)return'متأخر '+mins+' د';
    const hours=Math.ceil(mins/60);if(hours<24)return'متأخر '+hours+' س';
    return'متأخر '+Math.ceil(hours/24)+' يوم';
  }
  const mins=Math.ceil(diff/60000);
  if(mins<60)return'باقي '+mins+' د';
  const hours=Math.floor(mins/60),rem=mins%60;
  if(hours<24)return'باقي '+hours+' س'+(rem?' '+rem+' د':'');
  const days=Math.floor(hours/24),leftHours=hours%24;
  return'باقي '+days+' يوم'+(leftHours?' '+leftHours+' س':'');
}
function renderHero(){
  const all=matching(),pending=all.filter(a=>statusFor(a)==='pending'),overdue=all.filter(a=>statusFor(a)==='overdue'),graded=all.filter(a=>statusFor(a)==='graded');
  const candidate=[...overdue,...pending].find(canOpenAssignment)||null;
  if($('assignmentHeroPending'))$('assignmentHeroPending').textContent=pending.length;
  if($('assignmentHeroOverdue'))$('assignmentHeroOverdue').textContent=overdue.length;
  if($('assignmentHeroGraded'))$('assignmentHeroGraded').textContent=graded.length;
  if($('assignmentHeroCountdown'))$('assignmentHeroCountdown').textContent=candidate?countdownText(candidate.dueAt):'كل شيء منجز';
  if($('assignmentHeroNextTitle'))$('assignmentHeroNextTitle').textContent=candidate?(candidate.title||'واجب'):'لا يوجد واجب مطلوب 🎉';
  if($('assignmentHeroNextMeta'))$('assignmentHeroNextMeta').textContent=candidate?(subjectName(candidate.subject)+' • '+(candidate.teacherName||'المدرس')+' • '+fullDate(Number(candidate.dueAt||0))):'كل الواجبات المطلوبة تم تسليمها. راجع المصحح أو تابع موادك.';
  const btn=$('assignmentHeroOpenBtn');
  if(btn){
    btn.disabled=!candidate;
    btn.innerHTML=candidate?'فتح الواجب <i class="fa-solid fa-arrow-left"></i>':'لا يوجد مطلوب <i class="fa-solid fa-check"></i>';
    btn.onclick=()=>{if(candidate){lastModalTrigger=btn;openAssignment(candidate.id)}};
  }
}
function filtered(){
  const search=($('assignmentSearchInput')?.value||'').trim().toLowerCase();
  return matching().filter(a=>{
    const st=statusFor(a);
    const matchesFilter=filter==='all'||st===filter;
    const hay=((a.title||'')+' '+(a.instructions||'')+' '+subjectName(a.subject)+' '+(a.teacherName||'')).toLowerCase();
    return matchesFilter&&(!search||hay.includes(search));
  });
}
function renderStats(){
  const arr=matching(),pending=arr.filter(a=>statusFor(a)==='pending'),overdue=arr.filter(a=>statusFor(a)==='overdue'),submitted=arr.filter(a=>statusFor(a)==='submitted'),gradedAssignments=arr.filter(a=>statusFor(a)==='graded');
  const graded=gradedAssignments.map(a=>submissions[a.id]).filter(s=>Number.isFinite(Number(s.score)));
  $('assignmentTotal').textContent=arr.length;
  $('assignmentPending').textContent=pending.length;
  if($('assignmentOverdue'))$('assignmentOverdue').textContent=overdue.length;
  $('assignmentSubmitted').textContent=submitted.length;
  if($('assignmentGraded'))$('assignmentGraded').textContent=gradedAssignments.length;
  $('assignmentAverage').textContent=graded.length
    ?Math.round(graded.reduce((n,s)=>n+Number(s.percent ?? (Number(s.score||0)/Math.max(1,Number(s.maxScore||100))*100)),0)/graded.length)+'%'
    :'—';
  renderHero();
}
function render(){
  renderStats();
  const arr=filtered(),all=matching();
  if($('assignmentResultCount'))$('assignmentResultCount').textContent=arr.length+' واجب';
  if($('assignmentListHint')){
    const overdue=all.filter(isOverdue).length,dueSoon=all.filter(isDueSoon).length;
    $('assignmentListHint').textContent=overdue
      ?'عندك '+overdue+' واجب متأخر — ابدأ بالأقرب الآن.'
      :dueSoon?'عندك '+dueSoon+' واجب موعده قريب.'
      :'كل المطلوب منك مرتب حسب أقرب موعد.';
  }
  $('assignmentList').innerHTML=arr.length?arr.map(a=>{
    const s=submissions[a.id],st=statusFor(a),overdue=st==='overdue',soon=isDueSoon(a),fresh=isNewAssignment(a),sub=subjectMeta(a.subject),allowed=canOpenAssignment(a),paidLocked=!assignmentAccessible(a)&&!s;
    const submittedAt=Number(s?.submittedAt||0),lateSubmission=!!s&&(s.late===true||(!s.late&&a.dueAt&&submittedAt>Number(a.dueAt)));
    const statusClass=st==='graded'?'approved':st==='submitted'?'info':st==='overdue'?'danger':'pending';
    const icon=st==='graded'?'fa-star':st==='submitted'?'fa-paper-plane':st==='overdue'?'fa-triangle-exclamation':'fa-clipboard-list';
    const img=C.safeUrl(sub.imageUrl||''),hasImage=img&&img!=='#',percent=st==='graded'?Number(s.percent ?? Math.round(Number(s.score||0)/Math.max(1,Number(s.maxScore||a.maxScore||100))*100)):0;
    const stepSubmitted=st==='submitted'||st==='graded',stepGraded=st==='graded';
    return '<article class="assignment-card assignment-card-v8 '+st+' '+(overdue?'overdue ':'')+(soon?'due-soon ':'')+'">'+
      '<div class="assignment-cover-v8 '+(hasImage?'has-image':'')+'" '+(hasImage?'style="background-image:url(&quot;'+C.esc(img)+'&quot;)"':'')+'>'+
        (!hasImage?'<span>'+C.esc(sub.emoji||'📝')+'</span>':'')+
        '<em>'+C.esc(sub.name||subjectName(a.subject))+'</em>'+
        '<div class="assignment-cover-badges-v8">'+(fresh?'<b class="new">جديد</b>':'')+'<b class="'+statusClass+'">'+statusLabel(st)+'</b></div>'+
      '</div>'+
      '<div class="assignment-card-body-v8">'+
        '<div class="assignment-card-title-v8"><div><small>'+C.esc(a.teacherName||'المدرس')+'</small><h3>'+C.esc(a.title||'واجب')+' '+(a.isFree?'<span class="subscription-access-pill">مجاني</span>':paidLocked?'<span class="subscription-access-pill paid">اشتراك</span>':'')+'</h3></div>'+(st==='graded'?'<strong class="assignment-score-v8">'+percent+'%</strong>':'<span class="assignment-kind-icon-v8"><i class="fa-solid '+icon+'"></i></span>')+'</div>'+
        '<p>'+C.esc((a.instructions||'لا توجد تعليمات مختصرة.').slice(0,145))+'</p>'+
        '<div class="assignment-metrics-v8">'+
          '<span class="'+(overdue?'danger':soon?'warning':'')+'"><i class="fa-regular fa-clock"></i><b>'+C.esc(countdownText(Number(a.dueAt||0)))+'</b><small>'+C.esc(fullDate(Number(a.dueAt||0)))+'</small></span>'+
          '<span><i class="fa-solid fa-star"></i><b>'+Number(a.maxScore||100)+'</b><small>درجة</small></span>'+
        '</div>'+
        '<div class="assignment-steps-v8">'+
          '<span class="done"><i class="fa-solid fa-check"></i><small>تم التكليف</small></span><i></i>'+
          '<span class="'+(stepSubmitted?'done':'')+'"><i class="fa-solid '+(stepSubmitted?'fa-check':'fa-paper-plane')+'"></i><small>تم التسليم</small></span><i></i>'+
          '<span class="'+(stepGraded?'done':'')+'"><i class="fa-solid '+(stepGraded?'fa-check':'fa-star')+'"></i><small>تم التصحيح</small></span>'+
        '</div>'+
        (lateSubmission?'<div class="assignment-late-note-v8"><i class="fa-solid fa-clock"></i> تم التسليم بعد الموعد المحدد</div>':'')+
        '<div class="support-actions"><button class="btn '+(paidLocked?'btn-soft':(st==='pending'||st==='overdue')?'btn-primary':'btn-soft')+'" data-open-assignment="'+a.id+'">'+
          (paidLocked?'<i class="fa-solid fa-crown"></i> يتطلب اشتراك':st==='graded'?'عرض النتيجة والملاحظات':st==='submitted'?'عرض أو تحديث التسليم':st==='overdue'?'تسليم الآن':'فتح الواجب وتسليمه')+(paidLocked?'':' <i class="fa-solid fa-arrow-left"></i>')+
        '</button><a class="btn btn-soft support-report-link" href="'+supportHrefForAssignment(a)+'"><i class="fa-regular fa-flag"></i> إبلاغ</a></div>'+
      '</div>'+
    '</article>';
  }).join(''):'<div class="feature-empty"><span>📚</span><h3>لا توجد واجبات مطابقة</h3><p>جرّب فلترًا آخر أو غيّر عبارة البحث.</p></div>';
  $$('[data-open-assignment]').forEach(b=>b.onclick=()=>{lastModalTrigger=b;openAssignment(b.dataset.openAssignment)});
}
function submissionStateBlock(a,s){
  if(!s)return'';
  const submittedAt=Number(s.submittedAt||0),late=s.late===true||(!s.late&&a.dueAt&&submittedAt>Number(a.dueAt));
  return '<div class="assignment-submitted-state '+(late?'late':'')+'">'+
    '<i class="fa-solid '+(late?'fa-clock':'fa-circle-check')+'"></i><div><strong>'+(late?'تم التسليم بعد الموعد':'تم التسليم بنجاح')+'</strong>'+
    '<p>'+(submittedAt?'وقت التسليم: '+fullDate(submittedAt):'تم حفظ التسليم')+(s.updatedAt&&Number(s.updatedAt)!==submittedAt?' • آخر تحديث: '+fullDate(Number(s.updatedAt)):'')+'</p></div></div>';
}
function openAssignment(id){
  const a=assignments.find(x=>x.id===id);if(!a)return;
  if(!canOpenAssignment(a)){S?.lockOverlay({title:'هذا الواجب ضمن الاشتراك',text:'فعّل باقة تشمل مادة '+subjectName(a.subject)+' لفتح الواجب وتسليمه.'});return}
  activeAssignment=a;
  const s=submissions[id],st=statusFor(a),overdue=st==='overdue';
  const percent=s?.status==='graded'
    ?Number(s.percent ?? Math.round(Number(s.score||0)/Math.max(1,Number(s.maxScore||a.maxScore||100))*100))
    :0;
  const sub=subjectMeta(a.subject),fresh=isNewAssignment(a);
  $('assignmentModalBody').innerHTML=
    '<div class="assignment-modal-head assignment-modal-head-v8"><div><span class="section-kicker">'+C.esc(sub.name||subjectName(a.subject))+'</span><h2 id="assignmentModalTitle">'+C.esc(a.title||'واجب')+'</h2><p>'+C.esc(a.instructions||'لا توجد تعليمات إضافية.')+'</p></div><span class="assignment-modal-status-v8 '+st+'">'+(fresh?'جديد • ':'')+statusLabel(st)+'</span></div>'+
    '<div class="assignment-modal-progress-v8"><span class="done"><i class="fa-solid fa-check"></i><b>تم التكليف</b></span><i></i><span class="'+(s?'done':'')+'"><i class="fa-solid '+(s?'fa-check':'fa-paper-plane')+'"></i><b>تم التسليم</b></span><i></i><span class="'+(st==='graded'?'done':'')+'"><i class="fa-solid '+(st==='graded'?'fa-check':'fa-star')+'"></i><b>تم التصحيح</b></span></div>'+
    '<div class="assignment-detail-grid assignment-detail-grid-v8">'+
      '<div><span><i class="fa-solid fa-chalkboard-user"></i></span><small>المدرس</small><strong>'+C.esc(a.teacherName||'المدرس')+'</strong></div>'+
      '<div><span><i class="fa-regular fa-calendar"></i></span><small>آخر موعد</small><strong class="'+(overdue?'danger-text':'')+'">'+C.esc(fullDate(Number(a.dueAt||0)))+'</strong><em>'+C.esc(countdownText(Number(a.dueAt||0)))+'</em></div>'+
      '<div><span><i class="fa-solid fa-star"></i></span><small>الدرجة النهائية</small><strong>'+Number(a.maxScore||100)+' درجة</strong></div>'+
    '</div>'+
    (overdue?'<div class="assignment-deadline-warning"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>انتهى الموعد المحدد</strong><p>يمكنك إرسال الواجب الآن، وسيتم تسجيله كتسليم متأخر.</p></div></div>':'')+
    submissionStateBlock(a,s)+
    (st==='graded'
      ?'<div class="assignment-feedback assignment-feedback-v8"><span class="assignment-grade-ring" style="--grade:'+Math.max(0,Math.min(100,percent))+'"><strong>'+percent+'%</strong></span><div><span class="section-kicker">نتيجة التصحيح</span><strong>'+Number(s.score||0)+' / '+Number(s.maxScore||a.maxScore||100)+'</strong><p>'+C.esc(s.feedback||'لا توجد ملاحظات إضافية من المدرس.')+'</p></div></div>'+
       '<div class="assignment-submission-preview assignment-submission-preview-v8"><small><i class="fa-solid fa-file-lines"></i> إجابتك التي تم تصحيحها</small><p>'+C.esc(s.answer||'—')+'</p>'+((s.link&&C.safeUrl(s.link)!=='#')?'<a href="'+C.safeUrl(s.link)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح الرابط المرفق</a>':'')+'</div>'
      :'<form id="assignmentSubmitForm" class="assignment-submit-form">'+
         '<label><span>إجابتك أو ملاحظاتك</span><textarea id="assignmentAnswer" maxlength="5000" placeholder="اكتب إجابتك هنا...">'+C.esc(s?.answer||'')+'</textarea><small class="assignment-character-count"><span id="assignmentCharCount">'+String(s?.answer||'').length+'</span> / 5000</small></label>'+
         '<label><span>رابط ملف أو Google Drive — اختياري</span><input id="assignmentLink" type="url" dir="ltr" value="'+C.esc(s?.link||'')+'" placeholder="https://..."><small>تأكد أن الرابط متاح للمدرس قبل الإرسال.</small></label>'+
         '<button class="btn btn-primary btn-block" id="assignmentSubmitBtn" type="submit">'+(s?'<i class="fa-solid fa-rotate"></i> تحديث التسليم':'<i class="fa-solid fa-paper-plane"></i> تسليم الواجب')+'</button>'+
       '</form>');
  $('assignmentModal').classList.remove('hidden');
  $('assignmentModal').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  const panel=$('assignmentModal').querySelector('.assignment-modal');
  setTimeout(()=>panel?.focus(),30);
  const form=$('assignmentSubmitForm');
  if(form){
    form.onsubmit=submitAssignment;
    const textarea=$('assignmentAnswer');
    textarea?.addEventListener('input',()=>{if($('assignmentCharCount'))$('assignmentCharCount').textContent=textarea.value.length});
  }
}
async function submitAssignment(e){
  e.preventDefault();if(!activeAssignment)return;
  const answer=$('assignmentAnswer').value.trim(),link=$('assignmentLink').value.trim(),btn=$('assignmentSubmitBtn');
  if(!answer&&!link)return C.toast('اكتب إجابة أو أضف رابطًا للتسليم.','error');
  const current=submissions[activeAssignment.id];
  if(current?.status==='graded')return C.toast('تم تصحيح هذا الواجب بالفعل.','error');
  if(current){
    const ok=await window.AcademyUI.confirm({
      title:'تحديث التسليم؟',
      message:'سيتم استبدال الإجابة الحالية بالمحتوى الجديد مع الاحتفاظ بوقت أول تسليم.',
      tone:'warning',
      acceptText:'تحديث التسليم'
    });
    if(!ok)return;
  }
  const now=Date.now(),submittedAt=Number(current?.submittedAt||now);
  const late=current?.late===true||(!current&&activeAssignment.dueAt&&submittedAt>Number(activeAssignment.dueAt))||(!current?.late&&activeAssignment.dueAt&&submittedAt>Number(activeAssignment.dueAt));
  const payload={
    answer,link,status:'submitted',
    submittedAt,
    updatedAt:now,
    late:!!late,
    studentName:profile.name||user.displayName||'طالب',
    assignmentTitle:activeAssignment.title||'واجب',
    subject:activeAssignment.subject||''
  };
  window.AcademyUI?.setButtonLoading(btn,true,current?'تحديث':'تسليم');
  try{
    const saved=await AcademyBackend.request('student/assignments/submit',{method:'POST',token:C.auth._token(),body:{assignmentId:activeAssignment.id,answer,link}});
    submissions[activeAssignment.id]=saved.submission||payload;
    const nowDate=new Date(),goalDate=nowDate.getFullYear()+'-'+String(nowDate.getMonth()+1).padStart(2,'0')+'-'+String(nowDate.getDate()).padStart(2,'0');
    C.db.ref('studentProfilesV3/'+user.uid+'/dailyGoals/'+goalDate+'/assignment').set(true).catch(err=>console.warn('Daily assignment goal update failed',err));
    C.toast(current?'تم تحديث التسليم بنجاح ✅':'تم تسليم الواجب بنجاح ✅');
    closeModal();render();
  }catch(err){
    console.error(err);C.toast('تعذر حفظ التسليم الآن. حاول مرة أخرى.','error');
  }finally{
    window.AcademyUI?.setButtonLoading(btn,false);
  }
}
function closeModal(){
  $('assignmentModal').classList.add('hidden');
  $('assignmentModal').setAttribute('aria-hidden','true');
  document.body.style.overflow='';activeAssignment=null;
  const target=lastModalTrigger;lastModalTrigger=null;
  setTimeout(()=>target?.focus(),30);
}
$('closeAssignmentModal').onclick=closeModal;
$('assignmentModal').onclick=e=>{if(e.target===$('assignmentModal'))closeModal()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('assignmentModal').classList.contains('hidden'))closeModal()});

$$('[data-assignment-filter]').forEach(b=>b.onclick=()=>{
  filter=b.dataset.assignmentFilter;
  $$('[data-assignment-filter]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
  render();
});
$('assignmentSearchInput')?.addEventListener('input',render);

(async()=>{
  try{
    ({user,profile}=await C.requireStudent());
    $('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
    if($('assignmentStudentName'))$('assignmentStudentName').textContent=profile.name||user.displayName||'طالبنا';
    if($('assignmentHeroText'))$('assignmentHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — تابع المطلوب وسلّم قبل الموعد، وكل تصحيح هيوصل لك هنا.';
    if($('assignmentHeroPendingBtn'))$('assignmentHeroPendingBtn').onclick=()=>document.querySelector('[data-assignment-filter="pending"]')?.click();
    if($('assignmentHeroGradedBtn'))$('assignmentHeroGradedBtn').onclick=()=>document.querySelector('[data-assignment-filter="graded"]')?.click();
    window.AcademyUI?.showPageLoading('جاري تحميل واجباتك وتسليماتك...');
    const [a,subjectsSnap]=await Promise.all([
      C.db.ref('assignments').orderByChild('stage').equalTo(profile.stage).once('value'),
      C.db.ref('customSubjects').once('value')
    ]);
    assignments=Object.entries(a.val()||{}).map(([id,v])=>({id,...(v||{})}));
    data.customSubjects=subjectsSnap.val()||{};
    const mine=matching();
    const snaps=await Promise.all(mine.map(x=>C.db.ref('assignmentSubmissions/'+x.id+'/'+user.uid).once('value')));
    submissions={};mine.forEach((x,i)=>{if(snaps[i].exists())submissions[x.id]=snaps[i].val()});
    mine.forEach(x=>C.db.ref('assignmentSubmissions/'+x.id+'/'+user.uid).on('value',snap=>{
      if(snap.exists())submissions[x.id]=snap.val();else delete submissions[x.id];
      render();
    }));
    render();
    const requested=new URLSearchParams(location.search).get('id');
    if(requested&&matching().some(x=>x.id===requested))setTimeout(()=>openAssignment(requested),80);
  }catch(err){
    console.error(err);C.toast('تعذر تحميل الواجبات الآن.','error');
    $('assignmentList').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل الواجبات','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
  }finally{window.AcademyUI?.hidePageLoading()}
})()
})();