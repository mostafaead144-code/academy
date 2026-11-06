(() => {
'use strict';
if(!window.AcademyBackend || !AcademyBackend.apps.length)return;
const auth=AcademyBackend.auth(),db=AcademyBackend.database();
let uid=null,pending=0,flushing=false;
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};

async function flush(){
 if(!uid||pending<=0||flushing)return;
 const amount=pending;pending=0;flushing=true;
 try{
   const key=today();
   const [,dayResult]=await Promise.all([
     db.ref('studentProfilesV3/'+uid+'/stats/studyMinutes').transaction(v=>Number(v||0)+amount),
     db.ref('studentProfilesV3/'+uid+'/activityDaily/'+key+'/minutes').transaction(v=>Number(v||0)+amount),
     db.ref('studentProfilesV3/'+uid+'/activityDaily/'+key+'/lastActiveAt').set(Date.now())
   ]);
   const total=Number(dayResult?.snapshot?.val?.()||0);
   if(total>=30)await db.ref('studentProfilesV3/'+uid+'/dailyGoals/'+key+'/review').set(true);
 }catch(e){pending+=amount}
 finally{flushing=false}
}
auth.onAuthStateChanged(user=>{uid=user?.uid||null});
setInterval(()=>{
 if(!uid||document.hidden||!document.hasFocus())return;
 pending+=1;if(pending>=5)flush();
},60000);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&pending>=2)flush()});
window.addEventListener('pagehide',()=>{if(pending>0)flush()});
})();