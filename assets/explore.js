(() => {
'use strict';

const backendConfig=window.ACADEMY_BACKEND_CONFIG||JSON.parse(localStorage.getItem('academyBackendConfig')||'null');
if(!backendConfig){location.replace('./index.html');return}
if(!AcademyBackend.apps.length)AcademyBackend.initializeApp(backendConfig);
const auth=AcademyBackend.auth();
const $=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const params=new URLSearchParams(location.search);
const state={
  type:['public','azhar'].includes(params.get('type'))?params.get('type'):'public',
  stage:['primary','prep','sec'].includes(params.get('stage'))?params.get('stage'):'primary',
  grade:null,
  targetSubject:String(params.get('subject')||'').trim()
};
const grades={primary:[1,2,3,4,5,6],prep:[1,2,3],sec:[1,2,3]};
const gradeNames={
 primary:{1:'الأول الابتدائي',2:'الثاني الابتدائي',3:'الثالث الابتدائي',4:'الرابع الابتدائي',5:'الخامس الابتدائي',6:'السادس الابتدائي'},
 prep:{1:'الأول الإعدادي',2:'الثاني الإعدادي',3:'الثالث الإعدادي'},
 sec:{1:'الأول الثانوي',2:'الثاني الثانوي',3:'الثالث الثانوي'}
};
const stageNames={primary:'المرحلة الابتدائية',prep:'المرحلة الإعدادية',sec:'المرحلة الثانوية'};

function syncUrl(){
 const u=new URL(location.href);
 u.searchParams.set('type',state.type);
 u.searchParams.set('stage',state.stage);
 u.searchParams.delete('grade');
 if(state.targetSubject)u.searchParams.set('subject',state.targetSubject);else u.searchParams.delete('subject');
 history.replaceState({},'',u);
}
function gradeUrl(grade){
 const q=new URLSearchParams({type:state.type,stage:state.stage,grade:String(grade)});
 if(state.targetSubject)q.set('subject',state.targetSubject);
 return './grade.html?'+q.toString();
}
function updatePath(){
 $('explorePathType').textContent=state.type==='azhar'?'التعليم الأزهري':'التعليم العام';
 $('explorePathStage').textContent=stageNames[state.stage];
 $('explorePathGrade').textContent='اختر الصف';
 $('explorePathGrade').closest('span')?.classList.add('muted');
 $('activeTypeLabel').textContent=state.type==='azhar'?'التعليم الأزهري':'التعليم العام';
}
function renderGrades(){
 const stageIcon=state.stage==='primary'?'🎒':state.stage==='prep'?'📚':'🎓';
 $('exploreGradeGrid').innerHTML=grades[state.stage].map(g=>
   '<button class="explore-grade-card" data-grade="'+g+'" aria-label="فتح مواد '+esc(gradeNames[state.stage][g])+'">'+
     '<span class="explore-grade-number">'+g+'</span>'+ 
     '<div><small>'+stageIcon+' الصف</small><strong>'+esc(gradeNames[state.stage][g])+'</strong><p>اضغط لفتح صفحة مواد الصف</p></div>'+ 
     '<span class="explore-grade-arrow"><i class="fa-solid fa-arrow-left"></i></span>'+ 
   '</button>'
 ).join('');
 $$('[data-grade]').forEach(btn=>btn.addEventListener('click',()=>{
   state.grade=Number(btn.dataset.grade);
   location.href=gradeUrl(state.grade);
 }));
 $('gradeHint').textContent='اختر الصف للمتابعة';
 updatePath();
}
function selectType(type){
 state.type=type;state.grade=null;syncUrl();
 $$('[data-type]').forEach(b=>{const active=b.dataset.type===type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')});
 renderGrades();
}
function selectStage(stage){
 state.stage=stage;state.grade=null;syncUrl();
 $$('[data-stage]').forEach(b=>{const active=b.dataset.stage===stage;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false')});
 renderGrades();
}

$$('[data-type]').forEach(b=>b.addEventListener('click',()=>selectType(b.dataset.type)));
$$('[data-stage]').forEach(b=>b.addEventListener('click',()=>selectStage(b.dataset.stage)));

auth.onAuthStateChanged(user=>{
 const a=$('exploreAccountAction');if(!a)return;
 if(user){a.href='./index.html';a.innerHTML='<i class="fa-solid fa-house"></i> العودة لحسابي'}
 else {a.href='./index.html?auth=login&return='+encodeURIComponent(location.pathname+location.search);a.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول'}
});

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تجهيز الصفوف...');
 try{
   $$('[data-type]').forEach(b=>{const active=b.dataset.type===state.type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false')});
   $$('[data-stage]').forEach(b=>{const active=b.dataset.stage===state.stage;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false')});
   renderGrades();
   const requestedGrade=Number(params.get('grade')||0);
   if(grades[state.stage].includes(requestedGrade))location.replace(gradeUrl(requestedGrade));
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();
