(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,period='daily',rows=[],mine=null,loading=false,loadVersion=0,weeklyXp=0;

function keyForPeriod(){
 const keys=C.leaderboardKeys();
 return period==='daily'?keys.daily:period==='weekly'?keys.weekly:period==='monthly'?keys.monthly:keys.allTime;
}
function periodLabel(){return period==='daily'?'اليوم':period==='weekly'?'هذا الأسبوع':period==='monthly'?'هذا الشهر':'كل الوقت'}
function renderLeague(){
 const G=window.AcademyGame;if(!G||!$('leaderLeagueCard'))return;
 const league=G.leagueForXP(weeklyXp);
 $('leaderLeagueEmoji').textContent=league.emoji;$('leaderLeagueName').textContent=league.name;$('leaderLeagueProgress').style.width=league.progress+'%';$('leaderWeeklyXp').textContent=weeklyXp+' XP';
 $('leaderLeagueNext').textContent=league.next?'التالي: '+league.next.name:'أعلى دوري';
 $('leaderLeagueText').textContent=league.next?'باقي '+league.remaining+' XP للوصول إلى '+league.next.name+'.':'أنت في أعلى دوري هذا الأسبوع 👑';
}
function render(){
 const limit=Number($('leaderLimit').value||20);
 const list=[...rows].sort((a,b)=>Number(b.xp||0)-Number(a.xp||0)||Number(b.quizzes||0)-Number(a.quizzes||0)).slice(0,limit);
 const meIndex=list.findIndex(x=>x.id===user.uid),me=mine||list.find(x=>x.id===user.uid)||{};
 $('myRank').textContent=meIndex>=0?'#'+(meIndex+1):('خارج '+limit);
 $('myXp').textContent=Number(me.xp||0);
 $('myQuizCount').textContent=Number(me.quizzes||0);
 $('myLevel').textContent=Number(me.level||profile.stats?.level||1);renderLeague();

 const top=list.slice(0,3),medals=['🥇','🥈','🥉'];
 $('podium').innerHTML=top.length?top.map((r,i)=>
   '<article class="podium-card '+(i===0?'first':'')+' '+(r.id===user.uid?'is-me':'')+'">'+
   '<span class="podium-medal">'+medals[i]+'</span><span class="podium-avatar">'+C.esc(C.initials(r.name||'طالب'))+'</span>'+
   '<h3>'+C.esc(r.name||'طالب')+(r.id===user.uid?' <small>أنت</small>':'')+'</h3><strong>'+Number(r.xp||0)+' XP</strong>'+
   '<p>'+Number(r.quizzes||0)+' اختبار</p></article>'
 ).join(''):'<div class="feature-empty"><span>🏁</span><h3>الترتيب لسه بيبدأ</h3><p>أكمل درسًا أو اختبارًا ليظهر ترتيبك.</p></div>';

 $('rankList').innerHTML=list.length?list.map((r,i)=>
   '<div class="rank-row '+(r.id===user.uid?'is-me':'')+'"><span class="rank-position">'+(i+1)+'</span>'+
   '<div class="rank-user"><span class="rank-avatar">'+C.esc(C.initials(r.name||'طالب'))+'</span><div><strong>'+C.esc(r.name||'طالب')+(r.id===user.uid?' • أنت':'')+'</strong><small>'+periodLabel()+'</small></div></div>'+
   '<span class="rank-xp">'+Number(r.xp||0)+' XP</span><span class="rank-level">'+Number(r.quizzes||0)+' اختبار</span></div>'
 ).join(''):'<div class="feature-empty"><span>🏁</span><h3>لا يوجد ترتيب بعد</h3><p>ابدأ التعلم ليظهر الترتيب.</p></div>';
}
async function load(){
 const request=++loadVersion;
 loading=true;
 window.AcademyUI?.showPageLoading('جاري تحديث لوحة الترتيب...');
 try{
   const key=keyForPeriod(),limit=Number($('leaderLimit').value||20),ref=C.db.ref('leaderboardV3/'+key);
   const [topSnap,mySnap]=await Promise.all([
     ref.orderByChild('xp').limitToLast(limit).once('value'),
     ref.child(user.uid).once('value')
   ]);
   if(request!==loadVersion)return;
   rows=Object.entries(topSnap.val()||{}).map(([id,v])=>({id,...(v||{})}));
   mine=mySnap.exists()?{id:user.uid,...(mySnap.val()||{})}:null;
   render();
 }catch(err){
   if(request!==loadVersion)return;
   console.error(err);C.toast('تعذر تحميل لوحة الترتيب الآن.','error');
   $('rankList').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل الترتيب','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{
   if(request===loadVersion){loading=false;window.AcademyUI?.hidePageLoading();}
 }
}
$$('[data-period]').forEach(b=>b.onclick=async()=>{
 period=b.dataset.period;
 $$('[data-period]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
 await load();
});
$('leaderLimit').onchange=load;

(async()=>{
 try{
   ({user,profile}=await C.requireStudent());$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   await C.syncAllTimeLeaderboard(user.uid,profile);
   weeklyXp=window.AcademyGame?await window.AcademyGame.getWeeklyXP(user.uid):0;
   await load();
 }catch(err){
   console.error(err);C.toast('تعذر تجهيز لوحة الترتيب الآن.','error');
   window.AcademyUI?.hidePageLoading();
 }
})();
})();
