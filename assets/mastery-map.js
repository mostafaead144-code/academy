(()=>{'use strict';
const C=window.AcademyCore,P=window.AcademyPro,$=id=>document.getElementById(id);if(!C||!P)return;
let user=null,profile={},lessons=[],mastery={},subjects={};
function flatMastery(o){const out={};(function walk(x){Object.values(x||{}).forEach(v=>{if(v&&typeof v==='object'&&v.lessonId)out[v.lessonId]=v;else if(v&&typeof v==='object')walk(v)})})(o);return out}
function statusOf(id){const m=mastery[id];return m?.status||'not_started'}
function labelStatus(s){return s==='mastered'?'متقن':s==='learning'?'قيد التعلم':s==='review'?'يحتاج مراجعة':'لم يبدأ'}
function subjectName(id){return subjects[id]?.name||id||'المادة'}
function render(){
 const sf=$('masterySubject').value,st=$('masteryStatus').value,rows=lessons.filter(l=>(!sf||l.subject===sf)&&(!st||statusOf(l.id)===st));
 const grouped=new Map();rows.forEach(l=>{const k=l.subject+'|'+Number(l.unit||1);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(l)});
 $('masteryMapGrid').innerHTML=grouped.size?[...grouped.entries()].map(([k,list])=>{const [subject,unit]=k.split('|');return '<article class="mastery-unit"><span class="section-kicker">'+C.esc(subjectName(subject))+'</span><h2>الوحدة '+unit+'</h2>'+list.map(l=>{const m=mastery[l.id]||{},s=statusOf(l.id),score=Number(m.score||0),q=new URLSearchParams({id:l.id,type:l.type||profile.educationType||'public',stage:l.stage||profile.stage||'',grade:String(l.grade||profile.grade||1),subject:l.subject||''});return '<a class="mastery-lesson" href="./lesson.html?'+q.toString()+'"><span class="mastery-dot '+s+'">'+(s==='mastered'?'<i class="fa-solid fa-check"></i>':score||'•')+'</span><span><strong>'+C.esc(l.title||'درس')+'</strong><small>'+labelStatus(s)+(m.quiz?' • تدريب '+Number(m.quiz)+'%':'')+(m.video?' • فيديو '+Number(m.video)+'%':'')+'</small></span><span class="mastery-score">'+score+'%</span></a>'}).join('')+'</article>'}).join(''):'<div class="mastery-empty">لا توجد دروس مطابقة لهذا الفلتر.</div>';
 const all=lessons.map(l=>statusOf(l.id));$('masteryTotal').textContent=lessons.length;$('masteryMastered').textContent=all.filter(x=>x==='mastered').length;$('masteryLearning').textContent=all.filter(x=>x==='learning').length;$('masteryReview').textContent=all.filter(x=>x==='review').length;
}
async function load(){
 ({user,profile}=await C.requireStudent());$('masteryAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
 const [ls,ms,cs]=await Promise.all([P.db.ref('lessons').once('value'),P.db.ref(P.paths.mastery+'/'+user.uid).once('value'),P.db.ref('customSubjects').once('value')]);
 mastery=flatMastery(ms.val()||{});const custom=cs.val()||{};subjects={};Object.values(custom?.[profile.stage]?.[String(profile.grade)]||{}).forEach(s=>{if(s?.id)subjects[s.id]=s});
 lessons=Object.entries(ls.val()||{}).map(([id,v])=>({id,...(v||{})})).filter(l=>!l.isHidden&&l.workflowStatus!=='draft'&&(!l.stage||l.stage===profile.stage)&&(!l.grade||String(l.grade)===String(profile.grade))&&(!l.type||l.type===(profile.educationType||'public'))).sort((a,b)=>String(a.subject).localeCompare(String(b.subject))||Number(a.unit||1)-Number(b.unit||1)||Number(a.sortOrder||a.createdAt||0)-Number(b.sortOrder||b.createdAt||0));
 const ids=[...new Set(lessons.map(l=>l.subject).filter(Boolean))];$('masterySubject').innerHTML='<option value="">كل المواد</option>'+ids.map(id=>'<option value="'+C.esc(id)+'">'+C.esc(subjectName(id))+'</option>').join('');render();
}
$('masterySubject').onchange=render;$('masteryStatus').onchange=render;$('masteryRefresh').onclick=()=>load().catch(console.error);load().catch(err=>{console.error(err);$('masteryMapGrid').innerHTML='<div class="mastery-empty">تعذر تحميل خريطة الإتقان الآن.</div>'});
})();
