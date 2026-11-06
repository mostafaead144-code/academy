(() => {
'use strict';
const C=window.AcademyCore,S=window.AcademySubscription,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,access=null,sessions=[],attendance={},data={customSubjects:{}},filter='all',viewerTrigger=null,activeSessionId=null,attendanceActive=false,attendanceTimer=null,heroTimer=null,statusTimer=null;

function embed(url=''){return window.AcademyUtils.youtubeEmbed(url)}
function matchesStudent(s){
 return s&&s.isHidden!==true&&(!Number(s.publishAt||0)||Number(s.publishAt)<=Date.now())&&
   (!s.type||s.type===profile.educationType)&&
   (!s.stage||s.stage===profile.stage)&&
   (!s.grade||String(s.grade)===String(profile.grade));
}
function statusOf(s){
 if(s.status==='ended')return'ended';
 if(s.status==='live')return'live';
 const at=Number(s.scheduledTime||0),duration=Math.max(10,Number(s.duration||60))*60000;
 if(at&&Date.now()>=at&&Date.now()<at+duration)return'live';
 if(at&&Date.now()>=at+duration)return'ended';
 return'upcoming';
}
function eligible(){return sessions.filter(matchesStudent).map(s=>({...s,status:statusOf(s)}))}
function statusLabel(s){return s==='live'?'مباشر الآن':s==='upcoming'?'جلسة قادمة':'جلسة منتهية'}
function sessionAccessible(s){return !S||S.canAccess(s,access,s?.subject||'')}
function subjectMeta(id){
 const list=C.subjectsFor(data,profile.stage,String(profile.grade),profile.educationType)||[];
 return list.find(s=>String(s.id)===String(id))||{id,name:id?C.subjectName(data,id,profile.stage,String(profile.grade),profile.educationType):'جلسة عامة',emoji:'🎥'};
}
function attended(s){const a=attendance[s.id];return !!a&&(Number(a.visits||0)>0||Number(a.totalSeconds||0)>0)}
function attendanceMinutes(s){return Math.max(0,Math.round(Number(attendance[s.id]?.totalSeconds||0)/60))}
function replayUrl(s){
 const explicit=C.safeUrl(s.recordingUrl||'');
 if(explicit&&explicit!=='#')return explicit;
 if(statusOf(s)==='ended'){
   const old=C.safeUrl(s.youtubeLiveUrl||'');
   if(old&&old!=='#')return old;
 }
 return'';
}
function countdownText(ts){
 const diff=Number(ts||0)-Date.now();
 if(!ts)return'الموعد غير محدد';
 if(diff<=0)return'الآن';
 const sec=Math.ceil(diff/1000);
 if(sec<60)return'بعد '+sec+' ث';
 const min=Math.ceil(sec/60);
 if(min<60)return'بعد '+min+' د';
 const h=Math.floor(min/60),m=min%60;
 if(h<24)return'بعد '+h+' س'+(m?' '+m+' د':'');
 const d=Math.floor(h/24),rh=h%24;
 return'بعد '+d+' يوم'+(rh?' '+rh+' س':'');
}
function dateText(ts){
 return ts?new Date(Number(ts)).toLocaleString('ar-EG',{weekday:'long',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'الموعد غير محدد';
}
function renderHero(){
 const list=eligible(),live=list.filter(s=>s.status==='live').sort((a,b)=>Number(a.scheduledTime||0)-Number(b.scheduledTime||0)),up=list.filter(s=>s.status==='upcoming').sort((a,b)=>Number(a.scheduledTime||Infinity)-Number(b.scheduledTime||Infinity));
 const pick=live[0]||up[0]||null;
 if($('liveHeroNow'))$('liveHeroNow').textContent=live.length;
 if($('liveHeroUpcoming'))$('liveHeroUpcoming').textContent=up.length;
 if($('liveHeroAttended'))$('liveHeroAttended').textContent=list.filter(attended).length;
 if($('liveHeroCountdown'))$('liveHeroCountdown').textContent=pick?(pick.status==='live'?'مباشر الآن':countdownText(pick.scheduledTime)):'لا يوجد موعد';
 if($('liveHeroState'))$('liveHeroState').innerHTML=pick?.status==='live'?'<i class="fa-solid fa-tower-broadcast"></i> مباشر الآن':'<i class="fa-solid fa-calendar"></i> الجلسة القادمة';
 if($('liveHeroNextTitle'))$('liveHeroNextTitle').textContent=pick?(pick.title||'جلسة'):'لا توجد جلسة قريبة';
 if($('liveHeroNextMeta')){
   const sub=pick?subjectMeta(pick.subject):null;
   $('liveHeroNextMeta').textContent=pick?[(sub?.name||'جلسة عامة'),pick.teacher||'المدرس',dateText(pick.scheduledTime)].join(' • '):'عند إضافة جلسة مناسبة لصفك ستظهر هنا تلقائيًا.';
 }
 const btn=$('liveHeroOpenBtn');
 if(btn){
   btn.disabled=!pick;
   btn.innerHTML=pick?(pick.status==='live'?'ادخل الجلسة الآن <i class="fa-solid fa-arrow-left"></i>':'عرض الجلسة <i class="fa-solid fa-arrow-left"></i>'):'لا توجد جلسة <i class="fa-solid fa-check"></i>';
   btn.innerHTML=pick?(sessionAccessible(pick)?(pick.status==='live'?'ادخل الجلسة الآن <i class="fa-solid fa-arrow-left"></i>':'عرض الجلسة <i class="fa-solid fa-arrow-left"></i>'):'<i class="fa-solid fa-crown"></i> يتطلب اشتراك'):'لا توجد جلسة <i class="fa-solid fa-check"></i>';btn.onclick=()=>{if(pick)openSession(pick.id,btn)};
 }
}
function renderStats(){
 const list=eligible(),live=list.filter(s=>s.status==='live').length,up=list.filter(s=>s.status==='upcoming').length,en=list.filter(s=>s.status==='ended').length,replays=list.filter(s=>!!replayUrl(s)).length,att=list.filter(attended).length;
 $('liveNowCount').textContent=live;$('upcomingCount').textContent=up;$('endedCount').textContent=en;
 if($('replayCount'))$('replayCount').textContent=replays;
 if($('attendedCount'))$('attendedCount').textContent=att;
 const next=list.filter(s=>s.status==='upcoming'&&s.scheduledTime).sort((a,b)=>Number(a.scheduledTime)-Number(b.scheduledTime))[0];
 $('nextSessionText').textContent=next?countdownText(next.scheduledTime):live?'الآن':'—';
 renderHero();
}
function cardButtonLabel(s){
 if(s.status==='live')return'ادخل البث الآن';
 if(replayUrl(s))return'شاهد الإعادة';
 return'عرض التفاصيل';
}
function render(){
 const q=($('liveSearch')?.value||'').trim().toLowerCase();
 const list=eligible().filter(s=>{
   const replay=!!replayUrl(s),matchesFilter=filter==='all'||s.status===filter||(filter==='replay'&&replay);
   const sub=subjectMeta(s.subject);
   const hay=((s.title||'')+' '+(s.teacher||'')+' '+(sub.name||'')).toLowerCase();
   return matchesFilter&&(!q||hay.includes(q));
 }).sort((a,b)=>{
   const rank={live:0,upcoming:1,ended:2};
   if(rank[a.status]!==rank[b.status])return rank[a.status]-rank[b.status];
   if(a.status==='ended')return Number(b.scheduledTime||0)-Number(a.scheduledTime||0);
   return Number(a.scheduledTime||Infinity)-Number(b.scheduledTime||Infinity);
 });
 $('liveGrid').innerHTML=list.length?list.map(s=>{
   const sub=subjectMeta(s.subject),img=C.safeUrl(sub.imageUrl||''),hasImage=img&&img!=='#',wasAttended=attended(s),replay=!!replayUrl(s);
   const allowed=sessionAccessible(s),duration=Number(s.duration||60),timeState=s.status==='live'?'جارية الآن':s.status==='upcoming'?countdownText(s.scheduledTime):'انتهت';
   return '<article class="live-card live-card-v9 '+s.status+'">'+
     '<div class="live-cover live-cover-v9 '+(hasImage?'has-image':'')+'" '+(hasImage?'style="background-image:url(&quot;'+C.esc(img)+'&quot;)"':'')+'>'+
       (!hasImage?'<span class="live-cover-emoji-v9">'+C.esc(sub.emoji||'🎥')+'</span>':'')+
       '<div class="live-cover-top-v9"><span class="live-status '+C.esc(s.status)+'">'+statusLabel(s.status)+'</span>'+(replay?'<span class="live-replay-badge-v9"><i class="fa-solid fa-rotate-left"></i> إعادة</span>':'')+'</div>'+
       '<em>'+C.esc(sub.name||'جلسة عامة')+'</em>'+
     '</div>'+
     '<div class="live-card-body live-card-body-v9">'+
       '<div class="live-card-title-v9"><div><small>'+C.esc(s.teacher||'المدرس')+'</small><h3>'+C.esc(s.title||'جلسة مباشرة')+' '+(s.isFree?'<span class="subscription-access-pill">مجاني</span>':!allowed?'<span class="subscription-access-pill paid">اشتراك</span>':'')+'</h3></div>'+(wasAttended?'<span class="live-attended-badge-v9"><i class="fa-solid fa-user-check"></i> حضرت</span>':'')+'</div>'+
       '<div class="live-card-metrics-v9">'+
         '<span><i class="fa-regular fa-clock"></i><b>'+duration+' د</b><small>مدة الجلسة</small></span>'+
         '<span class="'+(s.status==='live'?'live':'')+'"><i class="fa-solid fa-calendar-day"></i><b>'+C.esc(timeState)+'</b><small>'+C.esc(dateText(s.scheduledTime))+'</small></span>'+
       '</div>'+
       (wasAttended?'<div class="live-attendance-note-v9"><i class="fa-solid fa-circle-check"></i> تم تسجيل حضورك'+(attendanceMinutes(s)?' • '+attendanceMinutes(s)+' دقيقة مسجلة':'')+'</div>':'')+
       '<button class="btn '+(allowed&&s.status==='live'?'btn-primary':'btn-soft')+'" data-open-session="'+s.id+'">'+(allowed?cardButtonLabel(s)+' <i class="fa-solid fa-arrow-left"></i>':'<i class="fa-solid fa-crown"></i> يتطلب اشتراك')+'</button>'+
     '</div>'+
   '</article>';
 }).join(''):'<div class="feature-empty"><span>📡</span><h3>لا توجد جلسات في هذا القسم</h3><p>جرّب قسمًا آخر، أو انتظر إضافة جلسة مناسبة لمرحلتك.</p></div>';
 $$('[data-open-session]').forEach(b=>b.onclick=()=>openSession(b.dataset.openSession,b));
}
function viewerAttendanceText(s){
 const a=attendance[s.id],minutes=attendanceMinutes(s);
 if(s.status==='live')return attended(s)?'أنت حاضر الآن — يتم تحديث مدة حضورك تلقائيًا.':'سيتم تسجيل حضورك تلقائيًا أثناء المشاهدة.';
 if(attended(s))return'تم تسجيل حضورك لهذه الجلسة'+(minutes?' لمدة '+minutes+' دقيقة تقريبًا.':'.');
 if(s.status==='upcoming')return'يبدأ تسجيل الحضور تلقائيًا عندما تصبح الجلسة مباشرة.';
 return'لم يتم تسجيل حضور لهذه الجلسة على حسابك.';
}
function openSession(id,trigger){
 const raw=sessions.find(x=>x.id===id);if(!raw)return;
 const s={...raw,status:statusOf(raw)},sub=subjectMeta(s.subject);if(!sessionAccessible(s)){S?.lockOverlay({title:'هذه الجلسة ضمن الاشتراك',text:'فعّل باقة تشمل '+(sub.name||'هذه المادة')+' لفتح البث أو إعادة المشاهدة.'});return}viewerTrigger=trigger||document.activeElement;
 $('liveViewerTitle').textContent=s.title||'الجلسة';
 if($('liveViewerMeta'))$('liveViewerMeta').textContent=[sub.name||'جلسة عامة',s.teacher||'المدرس',dateText(s.scheduledTime),Number(s.duration||60)+' دقيقة'].join(' • ');
 if($('liveViewerAttendance')){
   $('liveViewerAttendance').className='live-viewer-attendance-v9 '+(attended(s)?'attended':s.status==='live'?'live':'');
   $('liveViewerAttendance').innerHTML='<i class="fa-solid '+(attended(s)?'fa-user-check':s.status==='live'?'fa-tower-broadcast':'fa-circle-info')+'"></i><span>'+C.esc(viewerAttendanceText(s))+'</span>';
 }
 const replay=replayUrl(s),sourceUrl=s.status==='ended'&&replay?replay:(s.youtubeLiveUrl||''),src=embed(sourceUrl);
 $('liveVideo').innerHTML=src
  ?'<iframe src="'+C.esc(src)+'" title="'+C.esc(s.title||'الجلسة')+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>'
  :'<div class="live-video-empty"><div><span>'+(s.status==='upcoming'?'⏳':'📡')+'</span><strong>'+(s.status==='upcoming'?'الجلسة لم تبدأ بعد':'لا يوجد فيديو مضمّن')+'</strong><p>'+(s.status==='upcoming'?countdownText(s.scheduledTime)+' • '+dateText(s.scheduledTime):replay?'استخدم زر فتح الإعادة بالأسفل.':'استخدم رابط الجلسة الخارجي لو كان متاحًا.')+'</p></div></div>';
 const acts=[],zoom=C.safeUrl(s.zoomLink||''),yt=C.safeUrl(s.youtubeLiveUrl||''),record=C.safeUrl(s.recordingUrl||'');
 if(s.status==='live'&&zoom&&zoom!=='#')acts.push('<a class="btn btn-primary" href="'+C.esc(zoom)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-video"></i> الانضمام عبر Zoom</a>');
 if(s.status==='live'&&yt&&yt!=='#')acts.push('<a class="btn btn-soft" href="'+C.esc(yt)+'" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i> فتح على YouTube</a>');
 if(s.status==='ended'&&record&&record!=='#')acts.push('<a class="btn btn-primary" href="'+C.esc(record)+'" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-rotate-left"></i> فتح إعادة المشاهدة</a>');
 else if(s.status==='ended'&&yt&&yt!=='#')acts.push('<a class="btn btn-primary" href="'+C.esc(yt)+'" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i> مشاهدة التسجيل على YouTube</a>');
 if(s.status==='upcoming')acts.push('<span class="live-upcoming-note-v9"><i class="fa-regular fa-clock"></i> '+C.esc(countdownText(s.scheduledTime))+'</span>');
 $('liveViewerActions').innerHTML=acts.join('')||'<span class="live-no-actions">لا توجد روابط جلسة متاحة حاليًا.</span>';
 $('liveViewer').classList.remove('hidden');$('liveViewer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
 activeSessionId=id;
 if(s.status==='live'&&window.AcademyPro&&user){
   attendanceActive=true;
   window.AcademyPro.recordAttendance(id,true,user.uid).catch(()=>{});
   clearInterval(attendanceTimer);
   attendanceTimer=setInterval(()=>window.AcademyPro.recordAttendance(id,true,user.uid).catch(()=>{}),30000);
 }
 setTimeout(()=>$('liveViewer').querySelector('.live-viewer-panel')?.focus(),30);
}
function closeViewer(){
 if(activeSessionId&&attendanceActive&&window.AcademyPro&&user){
   window.AcademyPro.recordAttendance(activeSessionId,false,user.uid).catch(()=>{});
 }
 activeSessionId=null;attendanceActive=false;clearInterval(attendanceTimer);attendanceTimer=null;
 $('liveVideo').replaceChildren();
 $('liveViewer').classList.add('hidden');$('liveViewer').setAttribute('aria-hidden','true');document.body.style.overflow='';
 const target=viewerTrigger;viewerTrigger=null;setTimeout(()=>target?.focus(),30);
}
$('closeLiveViewer').onclick=closeViewer;
$('liveViewer').onclick=e=>{if(e.target===$('liveViewer'))closeViewer()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('liveViewer').classList.contains('hidden'))closeViewer()});
$$('[data-live-filter]').forEach(b=>b.onclick=()=>{
 filter=b.dataset.liveFilter;
 $$('[data-live-filter]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
 render();
});
$('liveSearch').oninput=render;
if($('liveHeroAllBtn'))$('liveHeroAllBtn').onclick=()=>document.querySelector('[data-live-filter="all"]')?.click();
if($('liveHeroReplayBtn'))$('liveHeroReplayBtn').onclick=()=>document.querySelector('[data-live-filter="replay"]')?.click();

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تحميل الجلسات والبث...');
 try{
   ({user,profile}=await C.requireStudent());access=S?await S.load(user.uid,profile,true):null;$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   if($('liveStudentName'))$('liveStudentName').textContent=profile.name||user.displayName||'طالبنا';
   if($('liveHeroText'))$('liveHeroText').textContent=C.gradeLabel(profile.stage,profile.grade)+' • '+C.typeLabel(profile.educationType)+' — تابع الجلسات المباشرة وإعاداتها وحضورك من مكان واحد.';
   const ref=C.db.ref('liveSessions'),attendanceRef=C.db.ref('analyticsV4/students/'+user.uid+'/attendance');
   const [first,subjectsSnap,attendanceSnap]=await Promise.all([ref.once('value'),C.db.ref('customSubjects').once('value'),attendanceRef.once('value')]);
   sessions=Object.entries(first.val()||{}).map(([id,v])=>({id,...(v||{})}));
   data.customSubjects=subjectsSnap.val()||{};attendance=attendanceSnap.val()||{};
   renderStats();render();
   ref.on('value',s=>{sessions=Object.entries(s.val()||{}).map(([id,v])=>({id,...(v||{})}));renderStats();render()},err=>{console.error(err);C.toast('تعذر مزامنة الجلسات الآن.','error')});
   attendanceRef.on('value',s=>{attendance=s.val()||{};renderStats();render()},err=>console.warn('Attendance sync unavailable',err));
   clearInterval(heroTimer);heroTimer=setInterval(renderHero,1000);
   clearInterval(statusTimer);statusTimer=setInterval(()=>{renderStats();render()},30000);
   const requested=new URLSearchParams(location.search).get('id');
   if(requested&&sessions.some(s=>s.id===requested&&matchesStudent(s)))setTimeout(()=>openSession(requested),80);
 }catch(err){
   console.error(err);C.toast('تعذر تحميل الجلسات الآن.','error');
   $('liveGrid').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل البث والجلسات','تحقق من الاتصال وحاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
 window.addEventListener('beforeunload',()=>{
   clearInterval(heroTimer);clearInterval(statusTimer);clearInterval(attendanceTimer);
   if(activeSessionId&&attendanceActive&&window.AcademyPro&&user){
     window.AcademyPro.recordAttendance(activeSessionId,false,user.uid).catch(()=>{});
   }
 });
})();
})();