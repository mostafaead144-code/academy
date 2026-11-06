(() => {
'use strict';

const cfg=window.ACADEMY_BACKEND_CONFIG;
if(!cfg)throw new Error('Hostinger config missing');
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(cfg);
const db=AcademyBackend.database(),auth=AcademyBackend.auth(),S=window.AcademySubscription;
const $=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];

let root={customSubjects:{}},allResults=[],activeType='all',activeScope=null,loadToken=0,user=null,profile=null,access=null,autocompleteTimer=null;
const indexCache=new Map(),stageNames={primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};
const gradeCounts={primary:6,prep:3,sec:3};
const defaultSubjects={
 primary:[
  {id:'arabic',name:'اللغة العربية',emoji:'📚'},{id:'math',name:'الرياضيات',emoji:'➗'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🔤'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'religion',name:'التربية الدينية',emoji:'🕌'},{id:'computer',name:'الحاسب الآلي',emoji:'💻'}
 ],
 prep:[
  {id:'arabic',name:'اللغة العربية',emoji:'📚'},{id:'math',name:'الرياضيات',emoji:'➗'},{id:'science',name:'العلوم',emoji:'🔬'},{id:'english',name:'اللغة الإنجليزية',emoji:'🔤'},{id:'social',name:'الدراسات الاجتماعية',emoji:'🌍'},{id:'religion',name:'التربية الدينية',emoji:'🕌'},{id:'computer',name:'الحاسب الآلي',emoji:'💻'}
 ],
 sec:[
  {id:'arabic',name:'اللغة العربية',emoji:'📚'},{id:'math',name:'الرياضيات',emoji:'➗'},{id:'english',name:'اللغة الإنجليزية',emoji:'🔤'},{id:'physics',name:'الفيزياء',emoji:'⚛️'},{id:'chemistry',name:'الكيمياء',emoji:'🧪'},{id:'biology',name:'الأحياء',emoji:'🧬'},{id:'history',name:'التاريخ',emoji:'🏺'},{id:'geography',name:'الجغرافيا',emoji:'🗺️'},{id:'religion',name:'التربية الدينية',emoji:'🕌'}
 ]
};

const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const normalize=(v='')=>String(v).toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^p{L}p{N}s]/gu,' ').replace(/\s+/g,' ').trim();
const safeUrl=(u='')=>window.AcademyUtils.safeUrl(u);
const published=(x)=>x&&x.workflowStatus!=='draft'&&x.isHidden!==true&&x.isActive!==false&&(!Number(x.publishAt||0)||Number(x.publishAt)<=Date.now());
const historyKey=()=> 'academy-search-history-v2-'+(user?.uid||'guest');
const clickKey=()=> 'academy-search-clicks-v2-'+(user?.uid||'guest');

function getLocal(key,fallback){
 try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}
}
function setLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function searchHistory(){return getLocal(historyKey(),[]).filter(Boolean).slice(0,8)}
function saveSearch(q){
 q=String(q||'').trim();if(q.length<2)return;
 const rows=[q,...searchHistory().filter(x=>normalize(x)!==normalize(q))].slice(0,8);setLocal(historyKey(),rows);renderRecent();
}
function clickMap(){return getLocal(clickKey(),{})}
function recordClick(item){
 const map=clickMap(),key=item.kind+':'+item.id;map[key]=Number(map[key]||0)+1;setLocal(clickKey(),map);
}
function subjectList(stage,grade,type){
 const list=(defaultSubjects[stage]||[]).map(x=>({...x})),node=root.customSubjects?.[stage]?.[String(grade)],arr=Array.isArray(node)?node:Object.values(node||{});
 arr.forEach(s=>{
  if(!s?.id||!s?.name||(s.type&&type&&s.type!==type))return;
  const i=list.findIndex(x=>x.id===s.id),item={id:s.id,name:s.name,emoji:s.emoji||'📚',imageUrl:s.imageUrl||'',type:s.type||type||''};
  if(i>=0)list[i]={...list[i],...item};else list.push(item);
 });
 return list;
}
function subjectMeta(id,stage,grade,type){
 return subjectList(stage,String(grade),type).find(s=>String(s.id)===String(id))||{id,name:id||'مادة',emoji:'📚',imageUrl:''};
}
function subjectName(id,stage,grade,type){return subjectMeta(id,stage,grade,type).name}
function lessonLink(x){
 const q=new URLSearchParams({type:x.type||'public',stage:x.stage||'prep',grade:String(x.grade||1),subject:x.subject||'',id:x.id});
 return './lesson.html?'+q.toString();
}
function quizLink(x){
 const q=new URLSearchParams({type:x.type||'public',stage:x.stage||'prep',grade:String(x.grade||1),subject:x.subject||'',quiz:x.id});
 return './lesson.html?'+q.toString();
}
function subjectLink(x){
 const q=new URLSearchParams({type:x.type||'public',stage:x.stage||'prep',grade:String(x.grade||1),subject:x.id||x.subject||''});
 return './subject.html?'+q.toString();
}
function assignmentLink(id){return './assignments.html?id='+encodeURIComponent(id)}
function liveLink(id){return './live.html?id='+encodeURIComponent(id)}
function fileLink(id){return './library.html?file='+encodeURIComponent(id)}
function teacherLink(id){return './teacher-profile.html?id='+encodeURIComponent(id)}
function teacherIdsFromLesson(l){
 const ids=new Set();if(l?.teacherId)ids.add(String(l.teacherId));
 (Array.isArray(l?.videos)?l.videos:[]).forEach(v=>{if(v?.teacherId)ids.add(String(v.teacherId))});
 return [...ids];
}
function targetMatches(item){
 if(!profile||!user)return false;
 const mode=item?.targetMode||'all';
 if(mode==='students'){
  const ids=Array.isArray(item.targetStudentIds)?item.targetStudentIds:Object.keys(item.targetStudentIds||{});
  return ids.includes(user.uid);
 }
 if(mode==='group'){
  const groups=Array.isArray(profile.groupIds)?profile.groupIds:Object.keys(profile.groupIds||{});
  return !!item.targetGroupId&&(profile.classGroupId===item.targetGroupId||groups.includes(item.targetGroupId));
 }
 return true;
}
function studentMatches(item){
 if(!profile)return false;
 return published(item)&&(!item.type||item.type===profile.educationType)&&(!item.stage||item.stage===profile.stage)&&(!item.grade||String(item.grade)===String(profile.grade));
}
function liveStatus(s){
 if(s.status==='ended')return'ended';
 if(s.status==='live')return'live';
 const at=Number(s.scheduledTime||0),duration=Math.max(10,Number(s.duration||60))*60000;
 if(at&&Date.now()>=at&&Date.now()<at+duration)return'live';
 if(at&&Date.now()>=at+duration)return'ended';
 return'upcoming';
}
function plainText(value=''){return String(value).replace(/<[^>]*>/g,' ').replace(/[#*:_-]/g,' ').replace(/\s+/g,' ').trim()}
function itemPersonalBoost(x){
 if(!profile)return 0;
 let b=0;
 if(!x.type||x.type===profile.educationType)b+=6;
 if(!x.stage||x.stage===profile.stage)b+=18;
 if(!x.grade||String(x.grade)===String(profile.grade))b+=16;
 if(x.kind==='teacher'&&Array.isArray(x.scopes)&&x.scopes.some(s=>s.stage===profile.stage&&String(s.grade)===String(profile.grade)&&(!s.type||s.type===profile.educationType)))b+=18;
 return b;
}
function isPersonal(x){
 if(!profile)return false;
 if(x.kind==='teacher')return (x.scopes||[]).some(s=>s.stage===profile.stage&&String(s.grade)===String(profile.grade)&&(!s.type||s.type===profile.educationType));
 return (!x.type||x.type===profile.educationType)&&(!x.stage||x.stage===profile.stage)&&(!x.grade||String(x.grade)===String(profile.grade));
}

function makeIndex(data){
 const items=[],teachers=data.teachers||{},teacherScopes=new Map(),contexts=new Map();
 const addScope=(teacherId,item)=>{
  if(!teacherId)return;
  const id=String(teacherId),key=[item.type||'',item.stage||'',String(item.grade||''),item.subject||''].join('|');
  if(!teacherScopes.has(id))teacherScopes.set(id,new Map());
  teacherScopes.get(id).set(key,{type:item.type||'',stage:item.stage||'',grade:String(item.grade||''),subject:item.subject||''});
 };
 const addContext=item=>{
  if(!item?.subject||!item.stage||!item.grade)return;
  const key=[item.type||'public',item.stage,String(item.grade),item.subject].join('|');
  if(!contexts.has(key))contexts.set(key,{type:item.type||'public',stage:item.stage,grade:String(item.grade),subject:item.subject});
 };

 Object.entries(data.lessons||{}).forEach(([id,l])=>{
  if(!published(l))return;
  const sub=subjectMeta(l.subject,l.stage,String(l.grade),l.type),teacherIds=teacherIdsFromLesson(l),teacherNames=teacherIds.map(tid=>teachers[tid]?.name).filter(Boolean);
  teacherIds.forEach(tid=>addScope(tid,l));addContext(l);
  const text=plainText(l.content||'').slice(0,700),createdAt=Number(l.createdAt||l.updatedAt||0);
  items.push({kind:'lesson',id,title:l.title||'درس',description:text.slice(0,175)||'شرح ودرس داخل الأكاديمية.',subject:l.subject,subjectName:sub.name,image:sub.imageUrl||'',emoji:sub.emoji||'📚',type:l.type,stage:l.stage,grade:String(l.grade||''),isFree:!!l.isFree,teacherIds,teacherName:teacherNames.join(' • ')||l.teacherName||'',createdAt,search:[l.title,text,sub.name,teacherNames.join(' '),l.teacherName,'درس شرح فيديو'].join(' '),href:lessonLink({id,...l})});
 });
 Object.entries(data.quizzes||{}).forEach(([id,q])=>{
  if(!published(q))return;
  if(profile&&user&&q.targetMode&&q.targetMode!=='all'&&!targetMatches(q))return;
  const sub=subjectMeta(q.subject,q.stage,String(q.grade),q.type),teacherIds=[...new Set([q.teacherId].filter(Boolean).map(String))],teacherNames=teacherIds.map(tid=>teachers[tid]?.name).filter(Boolean);
  teacherIds.forEach(tid=>addScope(tid,q));addContext(q);
  items.push({kind:'quiz',id,title:q.name||'اختبار',description:'اختبار يحتوي على '+(q.questions?.length||0)+' سؤال'+(Number(q.durationMinutes||0)?' • '+Number(q.durationMinutes)+' دقيقة':''),subject:q.subject,subjectName:sub.name,image:sub.imageUrl||'',emoji:sub.emoji||'🧠',type:q.type,stage:q.stage,grade:String(q.grade||''),isFree:!!q.isFree,teacherIds,teacherName:teacherNames.join(' • ')||q.teacherName||'',createdAt:Number(q.createdAt||q.updatedAt||0),search:[q.name,sub.name,teacherNames.join(' '),q.teacherName,'اختبار امتحان تدريب اسئلة'].join(' '),href:quizLink({id,...q})});
 });
 Object.entries(data.files||{}).forEach(([id,f])=>{
  if(!published(f))return;
  const sub=subjectMeta(f.subject,f.stage,String(f.grade),f.type);addContext(f);
  items.push({kind:'file',id,title:f.title||'ملف',description:f.description||('ملف '+(f.fileType||'PDF')+' للمراجعة والتعلم.'),subject:f.subject,subjectName:sub.name,image:sub.imageUrl||'',emoji:sub.emoji||'📄',type:f.type,stage:f.stage,grade:String(f.grade||''),isFree:!!f.isFree,teacherIds:f.teacherId?[String(f.teacherId)]:[],teacherName:f.teacherName||'',createdAt:Number(f.createdAt||f.updatedAt||0),important:!!f.isFeatured,search:[f.title,f.description,sub.name,f.fileType,f.lessonTitle,'ملف pdf مذكرة مراجعة مرجع'].join(' '),href:fileLink(id)});
 });

 contexts.forEach(ctx=>{
  const sub=subjectMeta(ctx.subject,ctx.stage,ctx.grade,ctx.type);
  const teacherIds=[...teacherScopes.entries()].filter(([,scopes])=>[...scopes.values()].some(s=>s.type===ctx.type&&s.stage===ctx.stage&&s.grade===ctx.grade&&s.subject===ctx.subject)).map(([id])=>id);
  const teacherNames=teacherIds.map(id=>teachers[id]?.name).filter(Boolean);
  items.push({kind:'subject',id:ctx.subject,title:sub.name,description:'مادة '+sub.name+' • '+stageNames[ctx.stage]+' • الصف '+ctx.grade,subject:ctx.subject,subjectName:sub.name,image:sub.imageUrl||'',emoji:sub.emoji||'📚',type:ctx.type,stage:ctx.stage,grade:ctx.grade,teacherIds,teacherName:teacherNames.join(' • '),createdAt:0,search:[sub.name,'مادة منهج',teacherNames.join(' ')].join(' '),href:subjectLink({id:ctx.subject,...ctx})});
 });

 teacherScopes.forEach((scopeMap,id)=>{
  const p=teachers[id];if(!p||p.active===false||!p.name)return;
  const scopes=[...scopeMap.values()],subs=[...new Set(scopes.map(s=>subjectName(s.subject,s.stage,s.grade,s.type)).filter(Boolean))];
  items.push({kind:'teacher',id,title:p.name,description:p.title||p.bio||'مدرس في الأكاديمية',subject:'',subjectName:subs.slice(0,3).join(' • '),image:safeUrl(p.photoUrl||''),emoji:'👨‍🏫',type:'',stage:'',grade:'',teacherIds:[id],teacherName:p.name,scopes,createdAt:Number(p.updatedAt||p.createdAt||0),search:[p.name,p.title,p.bio,p.qualifications,p.experience,subs.join(' '),'مدرس معلم شرح'].join(' '),href:teacherLink(id)});
 });

 if(profile&&user){
  Object.entries(data.assignments||{}).forEach(([id,a])=>{
   if(!studentMatches(a)||!targetMatches(a))return;
   const sub=subjectMeta(a.subject,a.stage,String(a.grade),a.type),submission=data.submissions?.[id],status=submission?.status==='graded'?'تم التصحيح':submission?'تم التسليم':Number(a.dueAt||0)<Date.now()?'متأخر':'مطلوب';
   items.push({kind:'assignment',id,title:a.title||'واجب',description:(a.instructions||'واجب دراسي').slice(0,180),subject:a.subject,subjectName:sub.name,image:sub.imageUrl||'',emoji:sub.emoji||'📝',type:a.type,stage:a.stage,grade:String(a.grade||''),teacherIds:a.teacherId?[String(a.teacherId)]:[],teacherName:a.teacherName||'',createdAt:Number(a.createdAt||0),status,search:[a.title,a.instructions,sub.name,a.teacherName,'واجب تكليف حل'].join(' '),href:assignmentLink(id)});
  });
  Object.entries(data.live||{}).forEach(([id,s])=>{
   if(!studentMatches(s))return;
   const sub=subjectMeta(s.subject,profile.stage,String(profile.grade),profile.educationType),status=liveStatus(s);
   items.push({kind:'live',id,title:s.title||'جلسة مباشرة',description:(status==='live'?'مباشر الآن':status==='upcoming'?'جلسة قادمة':'جلسة منتهية')+(s.teacher?' • '+s.teacher:''),subject:s.subject||'',subjectName:s.subject?sub.name:'جلسة عامة',image:sub.imageUrl||'',emoji:sub.emoji||'🔴',type:s.type||profile.educationType,stage:s.stage||profile.stage,grade:String(s.grade||profile.grade),isFree:!!s.isFree,teacherIds:s.teacherId?[String(s.teacherId)]:[],teacherName:s.teacher||'',createdAt:Number(s.createdAt||s.scheduledTime||0),status,search:[s.title,s.teacher,sub.name,'بث مباشر جلسة حصة zoom youtube'].join(' '),href:liveLink(id)});
  });
 }
 return items;
}

async function fetchIndex(stage=''){
 const key=stage||'all';
 if(indexCache.has(key))return indexCache.get(key);
 const promise=(async()=>{
  const get=path=>stage?db.ref(path).orderByChild('stage').equalTo(stage).once('value'):db.ref(path).once('value');
  const jobs=[get('lessons'),get('quizzes'),get('files'),db.ref('settings/publicTeachers').once('value')];
  if(profile&&user)jobs.push(db.ref('assignments').orderByChild('stage').equalTo(profile.stage).once('value'),db.ref('liveSessions').once('value'));
  const snaps=await Promise.all(jobs),data={lessons:snaps[0].val()||{},quizzes:snaps[1].val()||{},files:snaps[2].val()||{},teachers:snaps[3].val()||{}};
  if(profile&&user){
   const rawAssignments=snaps[4]?.val()||{};data.live=snaps[5]?.val()||{};
   data.assignments=Object.fromEntries(Object.entries(rawAssignments).filter(([,a])=>studentMatches(a)&&targetMatches(a)));
   const assignmentIds=Object.keys(data.assignments),subSnaps=await Promise.all(assignmentIds.map(id=>db.ref('assignmentSubmissions/'+id+'/'+user.uid).once('value')));
   data.submissions={};assignmentIds.forEach((id,i)=>{if(subSnaps[i].exists())data.submissions[id]=subSnaps[i].val()});
  }
  return makeIndex(data);
 })();
 indexCache.set(key,promise);
 try{return await promise}catch(err){indexCache.delete(key);throw err}
}

function scoreItem(item,q){
 const nq=normalize(q),title=normalize(item.title),subject=normalize(item.subjectName),teacher=normalize(item.teacherName),full=normalize(item.search);
 if(!nq)return 0;
 let score=itemPersonalBoost(item);
 if(title===nq)score+=120;
 if(title.startsWith(nq))score+=80;
 if(title.includes(nq))score+=58;
 if(subject===nq)score+=52;else if(subject.includes(nq))score+=34;
 if(teacher===nq)score+=50;else if(teacher.includes(nq))score+=28;
 const words=nq.split(' ').filter(Boolean);
 words.forEach(w=>{if(title.includes(w))score+=18;if(subject.includes(w))score+=11;if(teacher.includes(w))score+=10;if(full.includes(w))score+=5});
 if(item.important)score+=7;
 return score;
}
function teacherFilterMatches(x,id){return !id||x.id===id&&x.kind==='teacher'||(x.teacherIds||[]).includes(id)}
function contextFilterMatches(x,edu,stage,grade,subject){
 if(x.kind==='teacher'){
  const scopes=x.scopes||[];
  return scopes.some(s=>(!edu||s.type===edu)&&(!stage||s.stage===stage)&&(!grade||String(s.grade)===String(grade))&&(!subject||s.subject===subject));
 }
 return (!edu||!x.type||x.type===edu)&&(!stage||!x.stage||x.stage===stage)&&(!grade||!x.grade||String(x.grade)===String(grade))&&(!subject||x.subject===subject);
}
function baseForQuery(){
 const q=$('searchInput').value.trim(),edu=$('filterEducation').value,stage=$('filterStage').value,grade=$('filterGrade').value,subject=$('filterSubject').value,teacher=$('filterTeacher').value;
 return allResults.map(x=>({...x,score:scoreItem(x,q)})).filter(x=>x.score>0&&contextFilterMatches(x,edu,stage,grade,subject)&&teacherFilterMatches(x,teacher)).sort((a,b)=>b.score-a.score||Number(b.createdAt||0)-Number(a.createdAt||0));
}
function filtered(){const base=baseForQuery();return activeType==='all'?base:base.filter(x=>x.kind===activeType)}
function countsForQuery(){
 const base=baseForQuery(),out={all:base.length};
 ['subject','lesson','teacher','quiz','file','assignment','live'].forEach(k=>out[k]=base.filter(x=>x.kind===k).length);
 return out;
}
function kindLabel(k){return{subject:'مادة',lesson:'درس',teacher:'مدرس',quiz:'اختبار',file:'ملف',assignment:'واجب',live:'بث مباشر'}[k]||'محتوى'}
function icon(k){return{subject:'fa-book-open',lesson:'fa-circle-play',teacher:'fa-chalkboard-user',quiz:'fa-file-circle-question',file:'fa-file-pdf',assignment:'fa-clipboard-check',live:'fa-tower-broadcast'}[k]||'fa-link'}
function educationLabel(t){return t==='azhar'?'أزهر':t==='public'?'تعليم عام':'الأكاديمية'}
function paidKind(x){return ['lesson','quiz','file','live'].includes(x?.kind)}
function resultAccessible(x){return !paidKind(x)||!S||S.canAccess(x,access,x?.subject||'')}
function openSearchItem(e,item){
 if(!item)return false;
 recordClick(item);
 if(resultAccessible(item))return true;
 e?.preventDefault?.();
 S?.lockOverlay({title:'هذا المحتوى ضمن الاشتراك',text:'المحتوى ظاهر في البحث للاستكشاف، لكن فتحه يحتاج باقة نشطة تشمل '+(item.subjectName||'هذه المادة')+'.'});
 return false;
}
function resultHtml(x){
 const visual=x.image?'<img src="'+esc(x.image)+'" alt="" loading="lazy">':'<span>'+esc(x.emoji||'📚')+'</span>';
 const context=x.kind==='teacher'
  ?(x.subjectName||'معلم في الأكاديمية')
  :[x.subjectName,x.stage?stageNames[x.stage]:'',x.grade?'صف '+x.grade:''].filter(Boolean).join(' • ');
 const tags=[
  '<span>'+kindLabel(x.kind)+'</span>',
  x.type?'<span>'+educationLabel(x.type)+'</span>':'',
  x.teacherName&&x.kind!=='teacher'?'<span><i class="fa-solid fa-chalkboard-user"></i> '+esc(x.teacherName)+'</span>':'',
  isPersonal(x)?'<span class="personal"><i class="fa-solid fa-sparkles"></i> مناسب لك</span>':'',
  x.status?'<span class="status-'+esc(x.status)+'">'+esc(x.status)+'</span>':'',x.isFree&&paidKind(x)?'<span class="subscription-access-pill">مجاني</span>':(!resultAccessible(x)&&paidKind(x)?'<span class="subscription-access-pill paid">اشتراك</span>':'')
 ].filter(Boolean).join('');
 return '<a class="search-result-card search-result-card-v12 '+x.kind+'" href="'+esc(x.href||'#')+'" data-search-result="'+esc(x.kind+':'+x.id)+'">'+
  '<div class="search-result-visual-v12 '+(x.image?'has-image':'')+'">'+visual+'<em>'+kindLabel(x.kind)+'</em></div>'+
  '<div class="search-result-copy-v12"><small>'+esc(context)+'</small><h3>'+esc(x.title)+'</h3><p>'+esc(x.description||'')+'</p><div class="search-result-tags">'+tags+'</div></div>'+
  '<span class="search-result-open"><i class="fa-solid '+(resultAccessible(x)?'fa-arrow-left':'fa-lock')+'"></i></span>'+
 '</a>';
}
function countId(kind){return{subject:'countSubjects',lesson:'countLessons',teacher:'countTeachers',quiz:'countQuizzes',file:'countFiles',assignment:'countAssignments',live:'countLive'}[kind]}
function resetCounts(){
 $('countAll').textContent='0';
 ['subject','lesson','teacher','quiz','file','assignment','live'].forEach(k=>{const id=countId(k);if($(id))$(id).textContent='0'});
}
function render(){
 const q=$('searchInput').value.trim();
 $('searchDiscovery')?.classList.toggle('hidden',!!q);
 if(!q){
  $('searchResults').classList.add('hidden');$('searchEmpty').classList.remove('hidden');$('resultsTitle').textContent='ابدأ بالبحث';$('resultsHint').textContent='اكتب ما تبحث عنه وسنرتب الأنسب لك أولًا.';$('resultsMeta').textContent='0 نتيجة';resetCounts();renderDiscovery();return;
 }
 const c=countsForQuery();$('countAll').textContent=c.all;
 ['subject','lesson','teacher','quiz','file','assignment','live'].forEach(k=>{const id=countId(k);if($(id))$(id).textContent=c[k]||0});
 const items=filtered();$('resultsTitle').textContent='نتائج البحث عن «'+q+'»';$('resultsHint').textContent=activeType==='all'?'نرتب نتائج صفك أولًا ثم باقي النتائج المطابقة.':'فلتر: '+kindLabel(activeType);$('resultsMeta').textContent=items.length+' نتيجة';
 if(!items.length){
  $('searchResults').classList.add('hidden');$('searchEmpty').classList.remove('hidden');$('searchEmpty').innerHTML='<span>🤔</span><h3>ملقيناش نتيجة مطابقة</h3><p>جرّب كلمة أقصر، اسم المادة، أو أعد ضبط الفلاتر.</p>';return;
 }
 $('searchEmpty').classList.add('hidden');$('searchResults').classList.remove('hidden');
 $('searchResults').innerHTML=items.slice(0,120).map(resultHtml).join('');
 $$('[data-search-result]').forEach(a=>a.onclick=e=>{const [kind,id]=a.dataset.searchResult.split(':');const item=allResults.find(x=>x.kind===kind&&String(x.id)===String(id));return openSearchItem(e,item)});
}

function recentHtml(q){return '<button type="button" data-recent-search="'+esc(q)+'"><i class="fa-solid fa-clock-rotate-left"></i> '+esc(q)+'</button>'}
function renderRecent(){
 const rows=searchHistory(),wrap=$('recentSearchWrap');
 if(!wrap)return;
 wrap.classList.toggle('hidden',!rows.length);$('clearSearchHistory')?.classList.toggle('hidden',!rows.length);
 $('recentSearches').innerHTML=rows.map(recentHtml).join('');
 $$('[data-recent-search]').forEach(b=>b.onclick=()=>{$('searchInput').value=b.dataset.recentSearch;doSearch(true)});
}
function discoveryCard(x,label){
 return '<a href="'+esc(x.href||'#')+'" class="search-discovery-card-v12" data-search-result="'+esc(x.kind+':'+x.id)+'">'+
  '<span class="search-discovery-icon-v12 '+x.kind+'"><i class="fa-solid '+icon(x.kind)+'"></i></span>'+
  '<div><small>'+esc(label||kindLabel(x.kind))+'</small><strong>'+esc(x.title)+'</strong><p>'+esc(x.subjectName||x.teacherName||x.description||'')+'</p></div><i class="fa-solid fa-arrow-left"></i></a>';
}
function renderDiscovery(){
 if(!allResults.length)return;
 const clicks=clickMap(),personal=allResults.filter(isPersonal),latest=[...personal].filter(x=>['lesson','quiz','file','live'].includes(x.kind)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,5);
 const frequent=[...allResults].map(x=>({x,n:Number(clicks[x.kind+':'+x.id]||0)})).filter(r=>r.n>0).sort((a,b)=>b.n-a.n).slice(0,5).map(r=>r.x);
 const teachers=allResults.filter(x=>x.kind==='teacher'&&isPersonal(x)).slice(0,4),subjects=allResults.filter(x=>x.kind==='subject'&&isPersonal(x)).slice(0,5);
 const groups=[];
 if(frequent.length)groups.push('<article class="search-discovery-panel-v12"><div><span class="section-kicker">أنت تفتحه كثيرًا</span><h3>الأكثر استخدامًا عندك</h3></div><div>'+frequent.map(x=>discoveryCard(x,'مفتوح سابقًا')).join('')+'</div></article>');
 if(latest.length)groups.push('<article class="search-discovery-panel-v12"><div><span class="section-kicker">وصل حديثًا</span><h3>جديد يناسب صفك</h3></div><div>'+latest.map(x=>discoveryCard(x,'جديد')).join('')+'</div></article>');
 if(subjects.length)groups.push('<article class="search-discovery-panel-v12"><div><span class="section-kicker">موادك</span><h3>ابدأ من مادة</h3></div><div>'+subjects.map(x=>discoveryCard(x,'مادة صفك')).join('')+'</div></article>');
 if(teachers.length)groups.push('<article class="search-discovery-panel-v12"><div><span class="section-kicker">فريق التدريس</span><h3>مدرسون في صفك</h3></div><div>'+teachers.map(x=>discoveryCard(x,'مدرس')).join('')+'</div></article>');
 $('searchDiscoveryGrid').innerHTML=groups.join('')||'<div class="feature-empty"><span>✨</span><h3>ابدأ بالبحث</h3><p>ستظهر لك هنا اقتراحات تناسب مرحلتك.</p></div>';
 $$('#searchDiscoveryGrid [data-search-result]').forEach(a=>a.onclick=e=>{const [kind,id]=a.dataset.searchResult.split(':');const item=allResults.find(x=>x.kind===kind&&String(x.id)===String(id));return openSearchItem(e,item)});
 renderRecent();
}
function renderAutocomplete(){
 const box=$('searchAutocomplete'),q=$('searchInput').value.trim();
 if(!q||q.length<2){box.classList.add('hidden');box.innerHTML='';return}
 const rows=allResults.map(x=>({...x,score:scoreItem(x,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,7);
 if(!rows.length){box.classList.add('hidden');box.innerHTML='';return}
 box.innerHTML=rows.map(x=>'<button type="button" data-autocomplete-kind="'+esc(x.kind)+'" data-autocomplete-id="'+esc(x.id)+'"><span class="'+x.kind+'"><i class="fa-solid '+icon(x.kind)+'"></i></span><div><strong>'+esc(x.title)+'</strong><small>'+kindLabel(x.kind)+(x.subjectName?' • '+esc(x.subjectName):'')+'</small></div><i class="fa-solid fa-arrow-left"></i></button>').join('');
 box.classList.remove('hidden');
 $$('[data-autocomplete-id]',box).forEach(b=>b.onclick=()=>{
  const item=allResults.find(x=>x.kind===b.dataset.autocompleteKind&&String(x.id)===String(b.dataset.autocompleteId));
  if(!item)return;$('searchInput').value=item.title;box.classList.add('hidden');saveSearch(item.title);if(!resultAccessible(item)){openSearchItem(null,item);return}recordClick(item);location.href=item.href;
 });
}
function updateGradeOptions(){
 const stage=$('filterStage').value,current=$('filterGrade').value,max=gradeCounts[stage]||0;
 $('filterGrade').innerHTML='<option value="">كل الصفوف</option>'+(max?Array.from({length:max},(_,i)=>'<option value="'+(i+1)+'">الصف '+(i+1)+'</option>').join(''):'');
 if(current&&Number(current)<=max)$('filterGrade').value=current;
}
function updateDynamicFilters(){
 const edu=$('filterEducation').value,stage=$('filterStage').value,grade=$('filterGrade').value,currentSubject=$('filterSubject').value,currentTeacher=$('filterTeacher').value;
 const subs=new Map(),teachers=new Map();
 allResults.forEach(x=>{
  if(!contextFilterMatches(x,edu,stage,grade,''))return;
  if(x.subject)subs.set(x.subject,x.subjectName||x.subject);
  (x.teacherIds||[]).forEach(id=>{const t=allResults.find(y=>y.kind==='teacher'&&String(y.id)===String(id));if(t)teachers.set(String(id),t.title)});
 });
 $('filterSubject').innerHTML='<option value="">كل المواد</option>'+[...subs.entries()].sort((a,b)=>a[1].localeCompare(b[1],'ar')).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 if(subs.has(currentSubject))$('filterSubject').value=currentSubject;
 $('filterTeacher').innerHTML='<option value="">كل المدرسين</option>'+[...teachers.entries()].sort((a,b)=>a[1].localeCompare(b[1],'ar')).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
 if(teachers.has(currentTeacher))$('filterTeacher').value=currentTeacher;
}
async function ensureCurrentIndex(){
 const stage=$('filterStage').value||'',token=++loadToken;
 if(activeScope===stage&&indexCache.has(stage||'all'))return true;
 $('searchLoading').classList.remove('hidden');$('searchEmpty').classList.add('hidden');
 try{
  const items=await fetchIndex(stage);
  if(token!==loadToken)return false;
  allResults=items;activeScope=stage;updateDynamicFilters();$('searchIndexCount').textContent=items.length;renderDiscovery();return true;
 }catch(err){
  console.error(err);
  if(token===loadToken){$('searchResults').classList.add('hidden');$('searchEmpty').classList.remove('hidden');$('searchEmpty').innerHTML='<span>⚠️</span><h3>تعذر تحميل البحث</h3><p>تحقق من الاتصال ثم حاول مرة أخرى.</p>'}
  return false;
 }finally{if(token===loadToken)$('searchLoading').classList.add('hidden')}
}
function syncUrl(q){
 const u=new URL(location.href);
 if(q)u.searchParams.set('q',q);else u.searchParams.delete('q');
 const stage=$('filterStage').value,grade=$('filterGrade').value;
 if(stage)u.searchParams.set('stage',stage);else u.searchParams.delete('stage');
 if(grade)u.searchParams.set('grade',grade);else u.searchParams.delete('grade');
 history.replaceState({},'',u);
}
async function doSearch(push=true){
 const q=$('searchInput').value.trim();$('searchAutocomplete').classList.add('hidden');
 if(push)syncUrl(q);
 if(!q){render();return}
 saveSearch(q);
 const ok=await ensureCurrentIndex();if(ok)render();
}

$('searchForm').onsubmit=e=>{e.preventDefault();doSearch()};
$('searchInput').addEventListener('input',()=>{
 clearTimeout(autocompleteTimer);
 autocompleteTimer=setTimeout(async()=>{if(!allResults.length)await ensureCurrentIndex();renderAutocomplete()},130);
});
$('searchInput').addEventListener('keydown',e=>{if(e.key==='Escape')$('searchAutocomplete').classList.add('hidden')});
document.addEventListener('click',e=>{if(!e.target.closest('.search-main-wrap-v12'))$('searchAutocomplete')?.classList.add('hidden')});
$$('[data-suggest]').forEach(b=>b.onclick=()=>{$('searchInput').value=b.dataset.suggest;doSearch()});
$$('[data-search-type]').forEach(b=>b.onclick=()=>{
 activeType=b.dataset.searchType;
 $$('[data-search-type]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-pressed',active?'true':'false')});
 render();
});
$('filterEducation').onchange=()=>{updateDynamicFilters();render()};
$('filterStage').onchange=async()=>{updateGradeOptions();await ensureCurrentIndex();updateDynamicFilters();render()};
$('filterGrade').onchange=()=>{updateDynamicFilters();render()};
$('filterSubject').onchange=render;$('filterTeacher').onchange=render;
$('resetSearchFilters').onclick=async()=>{
 activeType='all';$$('[data-search-type]').forEach(x=>{const active=x.dataset.searchType==='all';x.classList.toggle('active',active);x.setAttribute('aria-pressed',active?'true':'false')});
 $('filterEducation').value=profile?.educationType||'';$('filterStage').value=profile?.stage||'';updateGradeOptions();$('filterGrade').value=profile?.grade||'';$('filterSubject').value='';$('filterTeacher').value='';
 await ensureCurrentIndex();updateDynamicFilters();render();
};
$('toggleAllStages').onclick=async()=>{
 const all=!$('filterStage').value;
 if(all&&profile){
  $('filterEducation').value=profile.educationType||'';$('filterStage').value=profile.stage||'';updateGradeOptions();$('filterGrade').value=String(profile.grade||'');
 }else{
  $('filterStage').value='';updateGradeOptions();$('filterGrade').value='';
 }
 $('toggleAllStages').innerHTML=$('filterStage').value?'<i class="fa-solid fa-globe"></i> البحث في كل المراحل':'<i class="fa-solid fa-user-graduate"></i> مرحلتي فقط';
 await ensureCurrentIndex();updateDynamicFilters();render();
};
$('clearSearchHistory').onclick=()=>{setLocal(historyKey(),[]);renderRecent()};

(async function init(){
 window.AcademyUI?.showPageLoading('جاري تجهيز البحث الشامل...');
 try{
  const authReady=new Promise(resolve=>auth.onAuthStateChanged(resolve));
  const [subjectsSnap,currentUser]=await Promise.all([db.ref('customSubjects').once('value'),authReady]);
  root.customSubjects=subjectsSnap.val()||{};user=currentUser||null;
  if(user){
   try{profile=(await db.ref('studentProfilesV3/'+user.uid).once('value')).val()||null;if(profile&&S)access=await S.load(user.uid,profile,true)}catch(e){console.warn('Search profile personalization unavailable',e)}
  }
  const params=new URLSearchParams(location.search),q=params.get('q')||'',stage=params.get('stage'),grade=params.get('grade');
  $('searchInput').value=q;
  if(profile){
   $('filterEducation').value=profile.educationType||'';
   $('filterStage').value=['primary','prep','sec'].includes(stage)?stage:profile.stage||'';
   updateGradeOptions();$('filterGrade').value=grade||String(profile.grade||'');
   $('searchStudentScope').textContent=(stageNames[profile.stage]||'مرحلتك')+' • صف '+profile.grade;
   $('searchHeroText').textContent='هنرتب محتوى '+(stageNames[profile.stage]||'مرحلتك')+' والصف '+profile.grade+' أولًا، ويمكنك توسيع البحث لكل الأكاديمية.';
  }else{
   if(['primary','prep','sec'].includes(stage))$('filterStage').value=stage;
   updateGradeOptions();if(grade)$('filterGrade').value=grade;
   $('searchStudentScope').textContent='كل المراحل';
  }
  $('toggleAllStages').innerHTML=$('filterStage').value?'<i class="fa-solid fa-globe"></i> البحث في كل المراحل':'<i class="fa-solid fa-user-graduate"></i> مرحلتي فقط';
  await ensureCurrentIndex();renderRecent();
  if(q)await doSearch(false);else render();
 }catch(err){
  console.error(err);$('searchEmpty').classList.remove('hidden');$('searchEmpty').innerHTML='<span>⚠️</span><h3>تعذر تجهيز البحث</h3><p>جرّب تحديث الصفحة بعد لحظات.</p>';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();