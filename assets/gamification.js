(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(window.ACADEMY_BACKEND_CONFIG);
const auth=AcademyBackend.auth(),db=AcademyBackend.database(),DAY=86400000;
const dateKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const startOfDay=(key=dateKey())=>new Date(key+'T00:00:00').getTime();
const endOfDay=(key=dateKey())=>new Date(key+'T23:59:59.999').getTime();
const weekStartKey=(d=new Date())=>{const x=new Date(d);x.setHours(12,0,0,0);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return dateKey(x)};
const inRange=(ts,a,b)=>Number(ts||0)>=a&&Number(ts||0)<=b;
const history=p=>Object.values(p?.quizHistory||{}).filter(Boolean);
const completed=p=>Object.values(p?.learningProgress||{}).filter(v=>v?.completed);
const reviewArchive=p=>{const out=[];Object.values(p?.reviewArchive||{}).forEach(g=>Object.values(g||{}).forEach(v=>v&&out.push(v)));return out};
const claims=p=>p?.gamificationV5?.claims||{};
const rewardHistory=p=>Object.values(p?.gamificationV5?.history||{}).filter(Boolean).sort((a,b)=>Number(b.claimedAt||0)-Number(a.claimedAt||0));
function dailyMissions(profile,key=dateKey()){
 const a=startOfDay(key),b=endOfDay(key),goals=profile?.dailyGoals?.[key]||{},dayMinutes=Number(profile?.activityDaily?.[key]?.minutes||0);
 const lessonCount=completed(profile).filter(x=>inRange(x.completedAt||x.updatedAt,a,b)).length;
 const quizCount=history(profile).filter(x=>inRange(x.createdAt,a,b)).length;
 const reviewDone=dayMinutes>=30||!!goals.review;
 return[
  {id:'lesson',icon:'fa-book-open',title:'أكمل درسًا',text:'أنهِ درسًا واحدًا من موادك اليوم.',current:goals.lesson?1:lessonCount,target:1,xp:25,href:'./index.html'},
  {id:'assignment',icon:'fa-file-pen',title:'سلّم واجبًا',text:'أنهِ واجبًا مطلوبًا قبل موعده.',current:goals.assignment?1:0,target:1,xp:25,href:'./assignments.html'},
  {id:'quiz',icon:'fa-bullseye',title:'حل اختبارًا',text:'اختبر نفسك بمحاولة واحدة على الأقل.',current:goals.quiz?1:quizCount,target:1,xp:25,href:'./exam-center.html'},
  {id:'review',icon:'fa-clock',title:'ذاكر 30 دقيقة',text:'اجمع 30 دقيقة مذاكرة فعلية داخل الأكاديمية.',current:Math.min(30,dayMinutes),target:30,xp:25,href:'./planner.html'}
 ].map(x=>({...x,done:Number(x.current)>=Number(x.target)}));
}
function weeklyMissions(profile,d=new Date()){
 const wk=weekStartKey(d),a=new Date(wk+'T00:00:00').getTime(),b=a+7*DAY-1;
 const lessons=completed(profile).filter(x=>inRange(x.completedAt||x.updatedAt,a,b)).length;
 const quizzes=history(profile).filter(x=>inRange(x.createdAt,a,b)).length;
 const minutes=Object.entries(profile?.activityDaily||{}).filter(([k])=>k>=wk&&new Date(k+'T00:00:00').getTime()<=b).reduce((n,[,v])=>n+Number(v?.minutes||0),0);
 const reviews=reviewArchive(profile).filter(x=>inRange(x.masteredAt,a,b)).length;
 return[
  {id:'lessons5',icon:'fa-layer-group',title:'5 دروس هذا الأسبوع',text:'حافظ على تقدم ثابت في المنهج.',current:lessons,target:5,xp:60,href:'./index.html'},
  {id:'quizzes5',icon:'fa-list-check',title:'5 اختبارات',text:'اختبر فهمك أكثر من مرة خلال الأسبوع.',current:quizzes,target:5,xp:60,href:'./exam-center.html'},
  {id:'minutes180',icon:'fa-hourglass-half',title:'180 دقيقة مذاكرة',text:'ثلاث ساعات موزعة على الأسبوع.',current:minutes,target:180,xp:80,href:'./planner.html'},
  {id:'reviews5',icon:'fa-brain',title:'أتقن 5 أخطاء',text:'حوّل أخطاءك القديمة إلى نقاط قوة.',current:reviews,target:5,xp:50,href:'./smart-review.html'}
 ].map(x=>({...x,current:Math.min(x.target,Number(x.current||0)),done:Number(x.current||0)>=Number(x.target)}));
}
function dailyReward(profile,key=dateKey()){
 const missions=dailyMissions(profile,key),id='daily-'+key;
 return{id,label:'مكافأة إنجاز اليوم',xp:100,ready:missions.every(x=>x.done),claimed:!!claims(profile)[id],missions};
}
function weeklyReward(profile,d=new Date()){
 const wk=weekStartKey(d),missions=weeklyMissions(profile,d),id='weekly-'+wk;
 return{id,label:'صندوق الأسبوع',xp:250,ready:missions.every(x=>x.done),claimed:!!claims(profile)[id],missions,week:wk};
}
const streakMilestones=[
 {days:3,xp:40,label:'بداية قوية',emoji:'🔥'},
 {days:7,xp:100,label:'أسبوع متواصل',emoji:'🏅'},
 {days:14,xp:220,label:'أسبوعان من الالتزام',emoji:'⚡'},
 {days:30,xp:500,label:'شهر أسطوري',emoji:'👑'}
];
function streakRewards(profile){
 const streak=Number(profile?.stats?.streak||0),c=claims(profile);
 return streakMilestones.map(x=>({...x,id:'streak-'+x.days,ready:streak>=x.days,claimed:!!c['streak-'+x.days]}));
}
const badgeDefs=[
 {id:'first_lesson',emoji:'🚀',name:'البداية',desc:'أكمل أول درس',check:p=>Number(p?.stats?.completedLessons||0)>=1},
 {id:'lessons_5',emoji:'📚',name:'خطوات ثابتة',desc:'أكمل 5 دروس',check:p=>Number(p?.stats?.completedLessons||0)>=5},
 {id:'lessons_25',emoji:'🧭',name:'رحّالة المعرفة',desc:'أكمل 25 درسًا',check:p=>Number(p?.stats?.completedLessons||0)>=25},
 {id:'quiz_1',emoji:'🎯',name:'أول اختبار',desc:'أنهِ أول اختبار',check:p=>Number(p?.stats?.completedQuizzes||0)>=1},
 {id:'quiz_10',emoji:'🧠',name:'متدرب محترف',desc:'أنهِ 10 اختبارات',check:p=>Number(p?.stats?.completedQuizzes||0)>=10},
 {id:'perfect',emoji:'💯',name:'العلامة الكاملة',desc:'احصل على 100% في اختبار',check:p=>history(p).some(x=>Number(x.score||0)===100)},
 {id:'xp_500',emoji:'⭐',name:'500 XP',desc:'اجمع 500 نقطة خبرة',check:p=>Number(p?.stats?.totalXP||0)>=500},
 {id:'xp_2000',emoji:'💎',name:'2000 XP',desc:'اجمع 2000 نقطة خبرة',check:p=>Number(p?.stats?.totalXP||0)>=2000},
 {id:'streak_3',emoji:'🔥',name:'3 أيام',desc:'حافظ على 3 أيام متتالية',check:p=>Number(p?.stats?.streak||0)>=3},
 {id:'streak_7',emoji:'🏆',name:'أسبوع كامل',desc:'حافظ على 7 أيام متتالية',check:p=>Number(p?.stats?.streak||0)>=7},
 {id:'review_5',emoji:'🛠️',name:'صياد الأخطاء',desc:'أتقن 5 أخطاء',check:p=>reviewArchive(p).length>=5},
 {id:'daily_3',emoji:'🎁',name:'بطل المهام',desc:'استلم مكافأة اليوم 3 مرات',check:p=>Object.keys(claims(p)).filter(k=>k.startsWith('daily-')).length>=3}
];
function badges(profile){return badgeDefs.map(x=>({...x,unlocked:!!x.check(profile)}))}
const leagues=[
 {id:'bronze',name:'الدوري البرونزي',emoji:'🥉',min:0,max:149},
 {id:'silver',name:'الدوري الفضي',emoji:'🥈',min:150,max:399},
 {id:'gold',name:'الدوري الذهبي',emoji:'🥇',min:400,max:799},
 {id:'platinum',name:'الدوري البلاتيني',emoji:'💠',min:800,max:1399},
 {id:'diamond',name:'الدوري الماسي',emoji:'💎',min:1400,max:Infinity}
];
function leagueForXP(xp=0){
 const n=Number(xp||0),league=leagues.find(x=>n>=x.min&&n<=x.max)||leagues[0],idx=leagues.indexOf(league),next=leagues[idx+1]||null;
 const span=Number.isFinite(league.max)?league.max-league.min+1:1,progress=next?Math.max(0,Math.min(100,Math.round((n-league.min)/span*100))):100;
 return{...league,xp:n,next,remaining:next?Math.max(0,next.min-n):0,progress};
}
async function getProfile(userId=auth.currentUser?.uid){
 if(!userId)return{};return (await db.ref('studentProfilesV3/'+userId).once('value')).val()||{};
}
async function getWeeklyXP(userId=auth.currentUser?.uid){
 if(!userId)return 0;const C=window.AcademyCore,key=C?.leaderboardKeys?.().weekly;
 if(!key)return 0;const s=await db.ref('leaderboardV3/'+key+'/'+userId).once('value');return Number(s.val()?.xp||0);
}
async function claimReward(reward,userId=auth.currentUser?.uid){
 if(!userId||!reward?.id||!reward.ready)throw new Error('المكافأة غير جاهزة بعد');
 let gained=0,profileName='طالب';
 const result=await db.ref('studentProfilesV3/'+userId).transaction(p=>{
   if(!p||p?.gamificationV5?.claims?.[reward.id])return;
   p.gamificationV5=p.gamificationV5||{};p.gamificationV5.claims=p.gamificationV5.claims||{};p.gamificationV5.history=p.gamificationV5.history||{};
   const at=Date.now(),xp=Number(reward.xp||0),historyId=reward.id.replace(/[^a-zA-Z0-9_-]/g,'_');
   p.gamificationV5.claims[reward.id]={id:reward.id,label:reward.label||'مكافأة',xp,claimedAt:at};
   p.gamificationV5.history[historyId]={id:reward.id,label:reward.label||'مكافأة',xp,claimedAt:at};
   p.stats=p.stats||{};p.stats.totalXP=Number(p.stats.totalXP||0)+xp;p.stats.level=Math.floor(Number(p.stats.totalXP||0)/1000)+1;
   profileName=p.name||'طالب';gained=xp;return p;
 });
 if(!result.committed)throw new Error('تم استلام هذه المكافأة من قبل');
 if(gained&&window.AcademyCore?.addLeaderboardXP)await window.AcademyCore.addLeaderboardXP(userId,profileName,gained,0).catch(()=>{});
 return{xp:gained,profile:result.snapshot.val()||{}};
}
async function syncDailyMissionRewards(userId=auth.currentUser?.uid,knownProfile=null){
 if(!userId)return{profile:knownProfile||{},gained:0};
 let profile=knownProfile||await getProfile(userId),gained=0;
 const key=dateKey(),missions=dailyMissions(profile,key);
 for(const m of missions.filter(x=>x.done)){
   const id='mission-'+key+'-'+m.id;if(profile?.gamificationV5?.claims?.[id])continue;
   try{
     const out=await claimReward({id,label:'مهمة اليوم — '+m.title,xp:Number(m.xp||25),ready:true},userId);
     gained+=Number(out.xp||0);profile=out.profile||profile;
   }catch{}
 }
 return{profile,gained};
}
async function syncWeeklyMissionRewards(userId=auth.currentUser?.uid,knownProfile=null){
 if(!userId)return{profile:knownProfile||{},gained:0};
 let profile=knownProfile||await getProfile(userId),gained=0;
 const wk=weekStartKey(),missions=weeklyMissions(profile);
 for(const m of missions.filter(x=>x.done)){
   const id='week-mission-'+wk+'-'+m.id;if(profile?.gamificationV5?.claims?.[id])continue;
   try{
     const out=await claimReward({id,label:'مهمة الأسبوع — '+m.title,xp:Number(m.xp||0),ready:true},userId);
     gained+=Number(out.xp||0);profile=out.profile||profile;
   }catch{}
 }
 return{profile,gained};
}
function actionForMission(id){
 return id==='assignment'?'./assignments.html':id==='quiz'?'./exam-center.html':id==='review'?'./planner.html':'./index.html';
}
window.AcademyGame={dateKey,weekStartKey,dailyMissions,weeklyMissions,dailyReward,weeklyReward,streakRewards,badges,leagueForXP,getProfile,getWeeklyXP,claimReward,syncDailyMissionRewards,syncWeeklyMissionRewards,rewardHistory,actionForMission,streakMilestones,leagues};
})();