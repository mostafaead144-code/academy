(() => {
'use strict';

const DAY=86400000,HOUR=3600000,MAX_ITEMS=80;

function ensureHostinger(){
  const cfg=window.ACADEMY_BACKEND_CONFIG;
  if(!cfg)throw new Error('Hostinger config missing');
  if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(cfg);
  return{auth:AcademyBackend.auth(),db:AcademyBackend.database()};
}
function cleanKey(v=''){return String(v).replace(/[.#$\[\]\/]/g,'-').slice(0,180)}
function dateKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function published(item,now=Date.now()){return item?.isActive!==false&&item?.isHidden!==true&&(!Number(item?.publishAt||0)||Number(item.publishAt)<=now)}
function matchesStudent(item,profile,now=Date.now()){
  return published(item,now)&&
    (!item.type||item.type===profile.educationType)&&
    (!item.stage||item.stage===profile.stage)&&
    (!item.grade||String(item.grade)===String(profile.grade));
}
function targeted(item,profile,userId){
  const mode=item?.targetMode||'all';
  if(mode==='students'){
    const ids=Array.isArray(item.targetStudentIds)?item.targetStudentIds:Object.keys(item.targetStudentIds||{});
    return ids.includes(userId);
  }
  if(mode==='group'){
    const groups=Array.isArray(profile?.groupIds)?profile.groupIds:Object.keys(profile?.groupIds||{});
    return !!item.targetGroupId&&(profile?.classGroupId===item.targetGroupId||groups.includes(item.targetGroupId));
  }
  return true;
}
function nextRecurringTime(dayOfWeek,time='18:00'){
  const now=new Date(),target=new Date(now);target.setSeconds(0,0);
  const diff=(Number(dayOfWeek)-now.getDay()+7)%7;target.setDate(now.getDate()+diff);
  const parts=String(time||'18:00').split(':').map(Number);target.setHours(parts[0]||0,parts[1]||0,0,0);
  if(target.getTime()<now.getTime()-60000)target.setDate(target.getDate()+7);
  return target.getTime();
}
function priorityWeight(p){return p==='urgent'?3:p==='high'?2:1}
function contextQuery(item,profile){
  const q=new URLSearchParams({
    type:item.type||profile.educationType||'public',
    stage:item.stage||profile.stage||'prep',
    grade:String(item.grade||profile.grade||1),
    subject:item.subject||''
  });
  return q;
}
function assignmentHref(id){return'./assignments.html?id='+encodeURIComponent(id)}
function liveHref(id){return'./live.html?id='+encodeURIComponent(id)}
function fileHref(id){return'./library.html?file='+encodeURIComponent(id)}
function lessonHref(item,id,profile){const q=contextQuery(item,profile);q.set('id',id);return'./lesson.html?'+q.toString()}
function quizHref(item,id,profile){const q=contextQuery(item,profile);q.set('quiz',id);return'./lesson.html?'+q.toString()}
function subjectHref(item,profile){return'./subject.html?'+contextQuery(item,profile).toString()}
function readState(reads,key){return !!reads[cleanKey(key)]}
function push(items,reads,item){
  if(!item?.key||!item.title)return;
  const key=cleanKey(item.key);
  items.push({...item,key,read:readState(reads,key),createdAt:Number(item.createdAt||Date.now())});
}
function liveStatus(s,now){
  if(s.status==='ended')return'ended';
  if(s.status==='live')return'live';
  const at=Number(s.scheduledTime||0),duration=Math.max(10,Number(s.duration||60))*60000;
  if(at&&now>=at&&now<at+duration)return'live';
  if(at&&now>=at+duration)return'ended';
  return'upcoming';
}
function studentQuizAttempted(profile,id){
  return Object.values(profile.quizHistory||{}).some(x=>x?.sourceId===id);
}
function broadcastMatches(n,profile){
  if(!n||n.isActive===false)return false;
  if(n.type&&n.type!==profile.educationType)return false;
  if(n.stage&&n.stage!==profile.stage)return false;
  if(n.grade&&String(n.grade)!==String(profile.grade))return false;
  return true;
}

async function loadNotifications(user,profileInput){
  const {db}=ensureHostinger(),now=Date.now();
  const profile=profileInput||((await db.ref('studentProfilesV3/'+user.uid).once('value')).val()||{});
  const reads=profile.notificationReads||{};
  const subscriptionAccess=window.AcademySubscription?await window.AcademySubscription.load(user.uid,profile,true).catch(()=>null):null;
  const subscriptionCan=item=>!window.AcademySubscription||window.AcademySubscription.canAccess(item,subscriptionAccess,item?.subject||'');

  const stage=profile.stage||'';
  const stageQuery=path=>stage?db.ref(path).orderByChild('stage').equalTo(stage):db.ref(path);
  const [assignSnap,liveSnap,scheduleSnap,annSnap,broadcastSnap,reviewSnap,fileSnap,lessonSnap,quizSnap,subscriptionRequestSnap]=await Promise.all([
    stageQuery('assignments').once('value'),
    db.ref('liveSessions').once('value'),
    db.ref('scheduleEvents').once('value'),
    db.ref('announcements').once('value'),
    db.ref('notificationBroadcasts').once('value'),
    db.ref('learningV4/reviews/'+user.uid).once('value'),
    stageQuery('files').once('value'),
    stageQuery('lessons').once('value'),
    stageQuery('quizzes').once('value'),
    db.ref('subscriptionRequestsV1/'+user.uid).once('value')
  ]);

  const items=[];

  /* Assignments: one useful state per assignment */
  const assignments=Object.entries(assignSnap.val()||{}).map(([id,v])=>({id,...(v||{})}))
    .filter(a=>matchesStudent(a,profile,now)&&targeted(a,profile,user.uid));
  const submissionSnaps=await Promise.all(assignments.map(a=>db.ref('assignmentSubmissions/'+a.id+'/'+user.uid).once('value')));
  const submissions={};assignments.forEach((a,i)=>{if(submissionSnaps[i].exists())submissions[a.id]=submissionSnaps[i].val()});
  assignments.forEach(a=>{
    const s=submissions[a.id],due=Number(a.dueAt||0),href=assignmentHref(a.id);
    if(s?.status==='graded'){
      const stamp=Number(s.gradedAt||s.submittedAt||a.createdAt||now),pct=Math.round(Number(s.percent??(Number(s.score||0)/Math.max(1,Number(s.maxScore||a.maxScore||100))*100)));
      push(items,reads,{key:'assignment-graded-'+a.id+'-'+stamp,kind:'assignment',group:'assignments',category:'academic',icon:'fa-star',tone:'green',title:'تم تصحيح واجبك',text:(a.title||'واجب')+' • نتيجتك '+pct+'%'+(s.feedback?' • '+s.feedback:''),createdAt:stamp,href,priority:'high',sourceName:a.teacherName||'المدرس'});
      return;
    }
    if(s)return;
    const diff=due?due-now:Infinity,created=Number(a.createdAt||0);
    if(due&&diff<0&&diff>-10*DAY){
      push(items,reads,{key:'assignment-overdue-'+a.id+'-'+due,kind:'assignment',group:'assignments',category:'academic',icon:'fa-triangle-exclamation',tone:'red',title:'واجب متأخر يحتاج تسليم',text:(a.title||'واجب')+(a.teacherName?' • '+a.teacherName:''),createdAt:Math.max(due,now-6*HOUR),href,priority:'urgent',sourceName:a.teacherName||'المدرس'});
    }else if(due&&diff>=0&&diff<=48*HOUR){
      push(items,reads,{key:'assignment-due-'+a.id+'-'+due,kind:'assignment',group:'assignments',category:'academic',icon:'fa-clock',tone:'amber',title:'موعد الواجب اقترب',text:(a.title||'واجب')+' • متبقي '+Math.max(1,Math.ceil(diff/HOUR))+' ساعة تقريبًا',createdAt:Math.max(created,due-48*HOUR),href,priority:diff<=12*HOUR?'urgent':'high',sourceName:a.teacherName||'المدرس'});
    }else if(created&&now-created<=72*HOUR){
      push(items,reads,{key:'assignment-new-'+a.id+'-'+created,kind:'assignment',group:'assignments',category:'academic',icon:'fa-clipboard-check',tone:'blue',title:'واجب جديد',text:(a.title||'واجب')+(a.teacherName?' • '+a.teacherName:''),createdAt:created,href,priority:'high',sourceName:a.teacherName||'المدرس'});
    }
  });

  /* Live sessions */
  Object.entries(liveSnap.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(s=>matchesStudent(s,profile,now)&&subscriptionCan(s)).forEach(s=>{
    const status=liveStatus(s,now),at=Number(s.scheduledTime||0),diff=at-now;
    if(status==='live'){
      push(items,reads,{key:'live-now-'+s.id+'-'+(at||s.createdAt||0),kind:'live',group:'live',category:'schedule',icon:'fa-tower-broadcast',tone:'red',title:'🔴 الجلسة مباشرة الآن',text:(s.title||'جلسة مباشرة')+(s.teacher?' • '+s.teacher:''),createdAt:now,href:liveHref(s.id),priority:'urgent',sourceName:s.teacher||'المدرس'});
    }else if(status==='upcoming'&&at&&diff>=0&&diff<=24*HOUR){
      push(items,reads,{key:'live-soon-'+s.id+'-'+at,kind:'live',group:'live',category:'schedule',icon:'fa-video',tone:'violet',title:'جلسة مباشرة قريبة',text:(s.title||'جلسة')+' • '+new Date(at).toLocaleString('ar-EG',{weekday:'long',hour:'numeric',minute:'2-digit'}),createdAt:Math.max(Number(s.createdAt||0),at-24*HOUR),href:liveHref(s.id),priority:diff<=2*HOUR?'urgent':'high',sourceName:s.teacher||'المدرس'});
    }
  });

  /* Weekly schedule */
  Object.entries(scheduleSnap.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>matchesStudent(x,profile,now)).forEach(e=>{
    const at=nextRecurringTime(e.dayOfWeek,e.time||'18:00'),diff=at-now;
    if(diff>=0&&diff<=18*HOUR){
      push(items,reads,{key:'schedule-'+e.id+'-'+dateKey(at),kind:'schedule',group:'schedule',category:'schedule',icon:'fa-calendar-day',tone:'blue',title:'عندك حصة قريبة',text:(e.title||'حصة')+' • '+new Date(at).toLocaleString('ar-EG',{weekday:'long',hour:'numeric',minute:'2-digit'}),createdAt:at-18*HOUR,href:'./schedule.html',priority:diff<=2*HOUR?'urgent':'normal'});
    }
  });

  /* Personal planner */
  Object.entries(profile.studyPlanner||{}).forEach(([id,t])=>{
    if(t?.done||!t?.date)return;
    const taskDay=new Date(t.date+'T00:00:00'),today=new Date();today.setHours(0,0,0,0);
    if(taskDay.getTime()===today.getTime()){
      push(items,reads,{key:'planner-'+id+'-'+t.date,kind:'planner',group:'study',category:'academic',icon:'fa-list-check',tone:'orange',title:'مهمة مذاكرة اليوم',text:t.title||'مهمة مذاكرة',createdAt:taskDay.getTime()+8*HOUR,href:'./planner.html',priority:t.priority==='urgent'?'urgent':t.priority==='high'?'high':'normal'});
    }
  });

  /* Spaced review */
  const dueReviews=Object.values(reviewSnap.val()||{}).filter(x=>x&&x.status!=='mastered'&&Number(x.nextReviewAt||0)<=now);
  if(dueReviews.length){
    const oldest=Math.min(...dueReviews.map(x=>Number(x.nextReviewAt||now)));
    push(items,reads,{key:'spaced-review-'+dateKey(now)+'-'+dueReviews.length,kind:'review',group:'study',category:'academic',icon:'fa-brain',tone:'violet',title:'حان وقت مراجعة أخطائك',text:'لديك '+dueReviews.length+' سؤالًا حان موعد مراجعتها لتثبيت المعلومة.',createdAt:oldest,href:'./pro-center.html',priority:dueReviews.length>=8?'urgent':'high'});
  }

  /* Important/new library files */
  Object.entries(fileSnap.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(f=>matchesStudent(f,profile,now)&&subscriptionCan(f)).forEach(f=>{
    const created=Number(f.createdAt||f.updatedAt||0),age=now-created,opened=Number(profile.libraryHistory?.[f.id]?.openedAt||0)>0;
    if(opened||!created)return;
    if(f.isFeatured&&age<=7*DAY){
      push(items,reads,{key:'file-featured-'+f.id+'-'+created,kind:'file',group:'content',category:'academic',icon:'fa-file-pdf',tone:'amber',title:'ملف مهم جديد',text:f.title||'ملف تعليمي مهم',createdAt:created,href:fileHref(f.id),priority:'high'});
    }else if(age<=48*HOUR){
      push(items,reads,{key:'file-new-'+f.id+'-'+created,kind:'file',group:'content',category:'academic',icon:'fa-folder-open',tone:'blue',title:'ملف جديد في المكتبة',text:f.title||'ملف تعليمي جديد',createdAt:created,href:fileHref(f.id),priority:'normal'});
    }
  });

  /* New lessons */
  Object.entries(lessonSnap.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(l=>matchesStudent(l,profile,now)&&subscriptionCan(l)).forEach(l=>{
    const created=Number(l.createdAt||0);
    if(!created||now-created>72*HOUR||profile.learningProgress?.[l.id]?.completed)return;
    push(items,reads,{key:'lesson-new-'+l.id+'-'+created,kind:'lesson',group:'content',category:'academic',icon:'fa-circle-play',tone:'blue',title:'درس جديد متاح',text:l.title||'درس جديد',createdAt:created,href:lessonHref(l,l.id,profile),priority:'normal',sourceName:l.teacherName||''});
  });

  /* New quizzes */
  Object.entries(quizSnap.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(q=>matchesStudent(q,profile,now)&&targeted(q,profile,user.uid)&&subscriptionCan(q)).forEach(q=>{
    const created=Number(q.createdAt||0);
    if(!created||now-created>72*HOUR||studentQuizAttempted(profile,q.id))return;
    push(items,reads,{key:'quiz-new-'+q.id+'-'+created,kind:'quiz',group:'content',category:'academic',icon:'fa-file-circle-question',tone:'violet',title:'اختبار جديد متاح',text:q.name||'اختبار جديد',createdAt:created,href:quizHref(q,q.id,profile),priority:'normal'});
  });

  /* Subscription request decisions */
  Object.entries(subscriptionRequestSnap.val()||{}).forEach(([id,r])=>{
    if(!r||!['approved','rejected'].includes(r.status))return;
    const stamp=Number(r.reviewedAt||r.updatedAt||r.createdAt||0);if(!stamp||now-stamp>14*DAY)return;
    push(items,reads,{
      key:'subscription-request-'+id+'-'+r.status+'-'+stamp,
      kind:'subscription',group:'system',category:'system',icon:r.status==='approved'?'fa-circle-check':'fa-circle-xmark',
      tone:r.status==='approved'?'green':'red',
      title:r.status==='approved'?'تم اعتماد طلب الاشتراك':'تمت مراجعة طلب الاشتراك',
      text:r.status==='approved'?('تم تفعيل '+(r.planName||'الباقة')+' على حسابك.'):('طلب '+(r.planName||'الباقة')+' لم يتم اعتماده. يمكنك مراجعة التفاصيل أو التواصل مع الدعم.'),
      createdAt:stamp,href:'./subscription.html',priority:r.status==='approved'?'high':'normal',sourceName:'إدارة الأكاديمية'
    });
  });

  /* Subscription access */
  if(subscriptionAccess?.enforced===true){
    const sub=subscriptionAccess.subscription,plan=subscriptionAccess.plan,status=subscriptionAccess.status,days=Number(subscriptionAccess.daysLeft||0);
    if(status==='active'&&days<=7){
      push(items,reads,{key:'subscription-expiring-'+dateKey(Number(sub?.endsAt||now)),kind:'subscription',group:'system',category:'system',icon:'fa-crown',tone:days<=2?'red':'amber',title:days<=2?'اشتراكك ينتهي قريبًا جدًا':'اشتراكك يقترب من الانتهاء',text:(plan?.name||'باقتك')+' • متبقي '+days+' يوم'+(days===1?' فقط':''),createdAt:Math.max(now-DAY,Number(sub?.endsAt||now)-7*DAY),href:'./subscription.html',priority:days<=2?'urgent':'high',sourceName:'إدارة الأكاديمية'});
    }else if(status==='expired'){
      push(items,reads,{key:'subscription-expired-'+dateKey(Number(sub?.endsAt||now)),kind:'subscription',group:'system',category:'system',icon:'fa-crown',tone:'red',title:'انتهى اشتراكك',text:'يمكنك متابعة المحتوى المجاني أو طلب تجديد/باقة جديدة من صفحة الاشتراك.',createdAt:Number(sub?.endsAt||now),href:'./subscription.html',priority:'high',sourceName:'إدارة الأكاديمية'});
    }else if(status==='suspended'){
      push(items,reads,{key:'subscription-suspended-'+String(sub?.updatedAt||sub?.startsAt||0),kind:'subscription',group:'system',category:'system',icon:'fa-lock',tone:'amber',title:'اشتراكك موقوف حاليًا',text:'راجع صفحة الاشتراك أو تواصل مع الدعم لمعرفة التفاصيل.',createdAt:Number(sub?.updatedAt||now),href:'./subscription.html',priority:'high',sourceName:'إدارة الأكاديمية'});
    }
  }

  /* Academy announcement */
  const ann=annSnap.val()||{};
  if(ann.isActive&&ann.text&&(!ann.expiry||now<Number(ann.expiry))){
    const stamp=Number(ann.updatedAt||ann.expiry||0);
    push(items,reads,{key:'announcement-'+stamp,kind:'announcement',group:'system',category:'system',icon:'fa-bullhorn',tone:'blue',title:'إعلان من الأكاديمية',text:ann.text,createdAt:stamp||now,href:'./index.html',priority:'normal',sourceName:'إدارة الأكاديمية'});
  }

  /* Directed broadcasts: admin or approved teacher notifications */
  Object.entries(broadcastSnap.val()||{}).forEach(([id,n])=>{
    if(!broadcastMatches(n,profile)||n.expiresAt&&now>Number(n.expiresAt))return;
    const stamp=Number(n.createdAt||0),source=n.source==='teacher'?'teacher':'admin';
    let href='./notifications.html';
    if(n.href){
      const raw=String(n.href).trim();
      if(raw.startsWith('./')||raw.startsWith('/')||/^https?:\/\//i.test(raw))href=raw;
    }else if(n.subject){
      href=subjectHref(n,profile);
    }
    push(items,reads,{
      key:'broadcast-'+id+'-'+stamp,kind:source==='teacher'?'teacher':'broadcast',group:source==='teacher'?'teacher':'system',category:source==='teacher'?'academic':'system',
      icon:source==='teacher'?'fa-chalkboard-user':n.priority==='urgent'?'fa-circle-exclamation':'fa-bell',
      tone:source==='teacher'?'violet':n.priority==='urgent'?'red':n.priority==='high'?'amber':'blue',
      title:n.title||(source==='teacher'?'رسالة من المدرس':'إشعار من الأكاديمية'),
      text:n.text||'',createdAt:stamp||now,href,priority:n.priority||'normal',sourceName:source==='teacher'?(n.teacherName||'المدرس'):'إدارة الأكاديمية'
    });
  });

  /* De-duplicate then sort */
  const unique=new Map();
  items.forEach(item=>{if(!unique.has(item.key))unique.set(item.key,item)});
  const sorted=[...unique.values()].sort((a,b)=>{
    const unread=(a.read?1:0)-(b.read?1:0);if(unread!==0)return unread;
    const pri=priorityWeight(b.priority)-priorityWeight(a.priority);if(pri!==0)return pri;
    return Number(b.createdAt||0)-Number(a.createdAt||0);
  }).slice(0,MAX_ITEMS);

  return{profile,items:sorted,unread:sorted.filter(x=>!x.read).length,urgent:sorted.filter(x=>!x.read&&x.priority==='urgent').length};
}

async function markRead(uid,key){
  const {db}=ensureHostinger();await db.ref('studentProfilesV3/'+uid+'/notificationReads/'+cleanKey(key)).set(Date.now());
}
async function markUnread(uid,key){
  const {db}=ensureHostinger();await db.ref('studentProfilesV3/'+uid+'/notificationReads/'+cleanKey(key)).remove();
}
async function markAllRead(uid,items){
  const {db}=ensureHostinger(),patch={};items.forEach(x=>{if(!x.read)patch[cleanKey(x.key)]=Date.now()});
  if(Object.keys(patch).length)await db.ref('studentProfilesV3/'+uid+'/notificationReads').update(patch);
}
window.AcademyNotifications={loadNotifications,markRead,markUnread,markAllRead};
})();