(() => {
'use strict';
const C=window.AcademyCore,G=window.AcademyGame,$=id=>document.getElementById(id);if(!C||!G)return;
let user,profile,weeklyXp=0;
const pct=(a,b)=>Math.max(0,Math.min(100,Math.round(Number(a||0)/Math.max(1,Number(b||1))*100)));
function missionCard(m){
 return '<article class="game-mission '+(m.done?'done':'')+'"><span class="game-mission-icon"><i class="fa-solid '+m.icon+'"></i></span><h3>'+C.esc(m.title)+'</h3><p>'+C.esc(m.text)+'</p><div class="game-mission-progress"><span style="width:'+pct(m.current,m.target)+'%"></span></div><div class="game-mission-foot"><small>'+(m.done?'تم ✅':Number(m.current||0)+' / '+m.target)+'</small><a href="'+C.esc(m.href||'#')+'">'+(m.done?'راجع':'ابدأ')+' <i class="fa-solid fa-arrow-left"></i></a></div></article>';
}
function renderReward(cardId,buttonId,textId,reward){
 const card=$(cardId),btn=$(buttonId),text=$(textId);if(!card||!btn)return;
 card.classList.toggle('ready',reward.ready&&!reward.claimed);
 btn.disabled=!reward.ready||reward.claimed;
 btn.textContent=reward.claimed?'تم الاستلام ✓':'استلم +'+reward.xp+' XP';
 if(text)text.textContent=reward.claimed?'تمت إضافة المكافأة إلى رصيدك.':reward.ready?'أحسنت! المكافأة جاهزة للاستلام.':'أكمل كل المهام لفتح هذه المكافأة.';
 btn.onclick=()=>claim(reward);
}
function renderStreak(){
 const rows=G.streakRewards(profile),box=$('streakRewardList');
 box.innerHTML=rows.map(r=>'<article class="game-streak-reward '+(r.claimed?'claimed':r.ready?'unlocked':'')+'"><span>'+r.emoji+'</span><strong>'+r.days+' أيام</strong><small>+'+r.xp+' XP</small><button type="button" data-streak-claim="'+r.id+'" '+(!r.ready||r.claimed?'disabled':'')+'>'+(r.claimed?'تم الاستلام':'استلم')+'</button></article>').join('');
 box.querySelectorAll('[data-streak-claim]').forEach(b=>b.onclick=()=>{const reward=rows.find(x=>x.id===b.dataset.streakClaim);if(reward)claim({...reward,label:'مكافأة السلسلة — '+reward.label})});
}
function renderLeague(){
 const league=G.leagueForXP(weeklyXp),level=Number(profile.stats?.level||Math.floor(Number(profile.stats?.totalXP||0)/1000)+1),total=Number(profile.stats?.totalXP||0),inLevel=total%1000,remain=inLevel===0&&total>0?1000:1000-inLevel;
 $('gameLeagueEmoji').textContent=league.emoji;$('gameLeagueName').textContent=league.name;$('gameLeagueProgress').style.width=league.progress+'%';$('gameLeagueHint').textContent=league.next?'باقي '+league.remaining+' XP للوصول إلى '+league.next.name:'وصلت لأعلى دوري هذا الأسبوع 👑';
 $('gameLevel').textContent=level;$('gameNextLevel').textContent=remain+' XP للمستوى التالي';
 $('leagueCardEmoji').textContent=league.emoji;$('leagueCardName').textContent=league.name;$('leagueCardProgress').style.width=league.progress+'%';$('leagueCardXp').textContent=weeklyXp+' XP';
 $('leagueCardNext').textContent=league.next?'التالي: '+league.next.name:'أعلى دوري';$('leagueCardText').textContent=league.next?'اجمع '+league.remaining+' XP إضافية هذا الأسبوع للترقية.':'أنت في قمة الدوريات هذا الأسبوع.';
}
function renderBadges(){
 const rows=G.badges(profile),unlocked=rows.filter(x=>x.unlocked).length;$('gameBadgeCount').textContent=unlocked;
 $('gameBadgeGrid').innerHTML=rows.map(b=>'<article class="game-badge '+(b.unlocked?'unlocked':'')+'"><i class="fa-solid '+(b.unlocked?'fa-circle-check':'fa-lock')+'"></i><span>'+b.emoji+'</span><strong>'+C.esc(b.name)+'</strong><small>'+C.esc(b.desc)+'</small></article>').join('');
}
function renderHistory(){
 const rows=G.rewardHistory(profile).slice(0,8);$('gameRewardHistory').innerHTML=rows.length?rows.map(r=>'<div class="game-history-row"><div><strong>'+C.esc(r.label||'مكافأة')+'</strong><small>'+new Date(Number(r.claimedAt||0)).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><b>+'+Number(r.xp||0)+' XP</b></div>').join(''):'<div class="game-empty">أول مكافأة تستلمها ستظهر هنا 🎁</div>';
}
function render(){
 const daily=G.dailyReward(profile),weekly=G.weeklyReward(profile),badges=G.badges(profile);
 $('dailyMissionGrid').innerHTML=daily.missions.map(missionCard).join('');$('weeklyMissionGrid').innerHTML=weekly.missions.map(missionCard).join('');
 renderReward('dailyRewardCard','claimDailyReward','dailyRewardText',daily);renderReward('weeklyRewardCard','claimWeeklyReward','weeklyRewardText',weekly);
 $('gameWeekLabel').textContent='أسبوع '+new Date(weekly.week+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'short'});
 $('gameTotalXp').textContent=Number(profile.stats?.totalXP||0);$('gameStreak').textContent=Number(profile.stats?.streak||0);$('gameWeeklyXp').textContent=weeklyXp;
 renderLeague();renderStreak();renderBadges();renderHistory();
}
async function claim(reward){
 try{
   const out=await G.claimReward(reward,user.uid);profile=out.profile||profile;weeklyXp+=Number(out.xp||0);C.toast('تمت إضافة +'+Number(out.xp||0)+' XP إلى رصيدك 🎉');render();
 }catch(err){console.error(err);C.toast(err?.message||'تعذر استلام المكافأة الآن.','error')}
}
(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز تحدياتك...');
 try{({user,profile}=await C.requireStudent());$('gameAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');const synced=await G.syncDailyMissionRewards(user.uid,profile);profile=synced.profile||profile;const weeklySync=await G.syncWeeklyMissionRewards(user.uid,profile);profile=weeklySync.profile||profile;weeklyXp=await G.getWeeklyXP(user.uid);const gained=Number(synced.gained||0)+Number(weeklySync.gained||0);if(gained)C.toast('أضفنا +'+gained+' XP من المهام المكتملة 🎉');render()}
 catch(err){console.error(err);C.toast('تعذر تحميل مركز التحديات.','error')}
 finally{window.AcademyUI?.hidePageLoading()}
})();
})();