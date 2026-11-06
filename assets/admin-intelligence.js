(() => {
'use strict';
const state={days:7,issueFilter:'all',lastCtx:null};
const DAY=86400000;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const vals=o=>Object.entries(o||{}).map(([id,v])=>({id,...(v||{})}));
const dateKey=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const subjectNames={arabic:'اللغة العربية',math:'الرياضيات',science:'العلوم',english:'اللغة الإنجليزية',social:'الدراسات الاجتماعية',studies:'الدراسات الاجتماعية',religion:'التربية الدينية',computer:'الحاسب الآلي',physics:'الفيزياء',chemistry:'الكيمياء',biology:'الأحياء',history:'التاريخ',geography:'الجغرافيا'};
const avg=a=>a.length?Math.round(a.reduce((n,x)=>n+Number(x||0),0)/a.length):0;
const pct=(a,b)=>b?Math.round(a/b*100):0;
const scoreClass=n=>Number(n)>=80?'good':Number(n)>=60?'mid':'bad';
const published=x=>x&&x.isHidden!==true&&(!Number(x.publishAt||0)||Number(x.publishAt)<=Date.now());
const contentText=x=>String(x?.content||x?.explanation||'').trim();
const videos=x=>Array.isArray(x?.videos)?x.videos.filter(v=>v?.url):[];
const questions=x=>Array.isArray(x?.questions)?x.questions:[];
const quizHistory=p=>Object.values(p?.quizHistory||{}).filter(Boolean);
const completedProgress=p=>Object.entries(p?.learningProgress||{}).filter(([,v])=>v?.completed);
const lastActive=p=>{
 let last=Number(p?.lastActiveAt||0);
 Object.values(p?.activityDaily||{}).forEach(d=>{last=Math.max(last,Number(d?.lastActiveAt||0))});
 return last;
};
const daysAgo=ts=>ts?Math.floor((Date.now()-Number(ts))/DAY):9999;
const dayLabel=key=>new Date(key+'T12:00:00').toLocaleDateString('ar-EG',{weekday:'short',day:'numeric'});
const validHttp=url=>{try{const u=new URL(url);return u.protocol==='http:'||u.protocol==='https:'}catch{return false}};
function subjectName(id,root){
 if(subjectNames[id])return subjectNames[id];
 let found='';
 Object.values(root.customSubjects||{}).some(stage=>Object.values(stage||{}).some(grade=>{
   const arr=Array.isArray(grade)?grade:Object.values(grade||{});
   const x=arr.find(s=>s?.id===id);if(x?.name){found=x.name;return true}return false;
 }));
 return found||id||'مادة';
}
function reportWindow(){
 const end=new Date();end.setHours(23,59,59,999);
 const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-(state.days-1));
 return{start:start.getTime(),end:end.getTime()};
}
function activitySeries(students){
 const {start}=reportWindow(),out=[];
 for(let i=0;i<state.days;i++){
   const d=new Date(start+i*DAY),key=dateKey(d);let minutes=0,studentsCount=0;
   students.forEach(s=>{const row=s.activityDaily?.[key];if(Number(row?.minutes||0)>0){minutes+=Number(row.minutes||0);studentsCount++}});
   out.push({key,minutes,students:studentsCount});
 }
 return out;
}
function studentRiskRows(students){
 return students.map(s=>{
   const history=quizHistory(s),recent=history.filter(x=>Number(x.createdAt||0)>=Date.now()-30*DAY),score=avg(recent.map(x=>x.score));
   const last=lastActive(s),inactivity=daysAgo(last),overdue=Object.values(s.studyPlanner||{}).filter(t=>!t?.done&&t?.date&&t.date<dateKey(new Date())).length;
   const reasons=[];let severity='low',weight=0;
   if(!last){reasons.push('لا يوجد نشاط مسجل للحساب');severity='high';weight+=4}
   else if(inactivity>=30){reasons.push('لم يدخل منذ '+inactivity+' يومًا');severity='high';weight+=4}
   else if(inactivity>=14){reasons.push('غير نشط منذ '+inactivity+' يومًا');severity='medium';weight+=3}
   if(recent.length>=3&&score<50){reasons.push('متوسط الاختبارات '+score+'%');severity='high';weight+=4}
   else if(recent.length>=2&&score<60){reasons.push('متوسط الاختبارات '+score+'%');if(severity!=='high')severity='medium';weight+=2}
   if(overdue>=3){reasons.push(overdue+' مهام مذاكرة متأخرة');if(severity==='low')severity='medium';weight+=2}
   return{id:s.id,name:s.name||s.phone||s.email||'طالب',phone:s.phone||'',stage:s.stage||'',grade:s.grade||'',score,recentAttempts:recent.length,inactivity,overdue,reasons,severity,weight};
 }).filter(x=>x.reasons.length).sort((a,b)=>b.weight-a.weight||b.inactivity-a.inactivity);
}
function subjectStats(root,students){
 const lessons=vals(root.lessons).filter(published),quizzes=vals(root.quizzes).filter(published),files=vals(root.files).filter(published),analytics=root.contentAnalytics||{};
 const ids=new Set([...lessons.map(x=>x.subject),...quizzes.map(x=>x.subject),...files.map(x=>x.subject)].filter(Boolean)),rows=[];
 ids.forEach(id=>{
   const ls=lessons.filter(x=>x.subject===id),qs=quizzes.filter(x=>x.subject===id),fs=files.filter(x=>x.subject===id),lessonIds=new Set(ls.map(x=>x.id));
   const attempts=[],studentSet=new Set();let completed=0,views=0,analyticsCompletions=0;
   students.forEach(s=>{
     quizHistory(s).forEach(a=>{if(a.subject===id){attempts.push(Number(a.score||0));studentSet.add(s.id)}});
     completedProgress(s).forEach(([lessonId])=>{if(lessonIds.has(lessonId)){completed++;studentSet.add(s.id)}});
   });
   ls.forEach(l=>{const a=analytics[l.id]||{};views+=Number(a.views||0);analyticsCompletions+=Number(a.completions||0)});
   rows.push({id,name:subjectName(id,root),lessons:ls.length,quizzes:qs.length,files:fs.length,attempts:attempts.length,avg:avg(attempts),students:studentSet.size,completed,views,analyticsCompletions,engagement:pct(analyticsCompletions,views)});
 });
 return rows.sort((a,b)=>b.students-a.students||b.attempts-a.attempts||a.name.localeCompare(b.name,'ar'));
}
function topContent(root){
 const analytics=root.contentAnalytics||{},lessons=vals(root.lessons).filter(published);
 return lessons.map(l=>{
   const a=analytics[l.id]||{},views=Number(a.views||0),completions=Number(a.completions||0);
   return{id:l.id,title:l.title||'درس',subject:l.subject||'',views,completions,completionRate:pct(completions,views),quizAttempts:Number(a.quizAttempts||0),quizAverage:Number(a.quizAverage||0)};
 }).sort((a,b)=>b.views-a.views);
}
function flattenTeacherSubmissions(root){
 const out=[];Object.entries(root.teacherSubmissions||{}).forEach(([uid,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({uid,id,...(v||{})})));return out;
}
function flattenAssignmentSubmissions(root){
 const out=[];Object.entries(root.assignmentSubmissions||{}).forEach(([assignmentId,items])=>Object.entries(items||{}).forEach(([uid,v])=>out.push({assignmentId,uid,...(v||{})})));return out;
}
function buildIssues(root,students,risks,subjects,content){
 const issues=[],push=(severity,title,text,tab,search='',kind='system')=>issues.push({severity,title,text,tab,search,kind});
 const lessons=vals(root.lessons),quizzes=vals(root.quizzes),files=vals(root.files),teachers=vals(root.teacherProfiles);
 const pubLessons=lessons.filter(published),pubQuizzes=quizzes.filter(published);
 if(!pubLessons.length)push('high','لا توجد دروس منشورة','ابدأ بإضافة محتوى تعليمي قبل دعوة الطلاب.','lessons','', 'content');
 pubLessons.forEach(l=>{
   const hasVideo=videos(l).length>0,hasText=contentText(l).length>15;
   if(!hasVideo&&!hasText)push('high','درس منشور بلا شرح',l.title||'درس بدون عنوان','lessons',l.title||'', 'content');
   const linked=pubQuizzes.some(q=>q.lessonId===l.id);
   if(!questions(l).length&&!linked)push('medium','درس بلا تدريب أو اختبار',l.title||'درس بدون عنوان','lessons',l.title||'', 'content');
   if(!l.teacherId&&!videos(l).some(v=>v?.teacherId))push('low','درس بلا مدرس مرتبط',l.title||'درس بدون عنوان','lessons',l.title||'', 'content');
 });
 const scopes=new Map();
 pubLessons.forEach(l=>{const k=[l.type||'public',l.stage||'',String(l.grade||''),l.subject||''].join('|');const x=scopes.get(k)||{lesson:l,count:0};x.count++;scopes.set(k,x)});
 scopes.forEach(({lesson,count},key)=>{if(!pubQuizzes.some(q=>[q.type||'public',q.stage||'',String(q.grade||''),q.subject||''].join('|')===key))push('medium','مادة بها '+count+' درس بلا اختبار','لا يوجد اختبار منشور لـ '+subjectName(lesson.subject,root)+' — '+String(lesson.stage||'')+' '+String(lesson.grade||''),'quizzes',subjectName(lesson.subject,root),'content')});
 pubQuizzes.forEach(q=>{if(questions(q).length<5)push('medium','اختبار قصير جدًا',(q.name||'اختبار')+' يحتوي '+questions(q).length+' أسئلة فقط','quizzes',q.name||'', 'content')});
 files.filter(published).forEach(f=>{if(!validHttp(f.url||''))push('medium','ملف برابط غير صالح',f.title||'ملف','files',f.title||'', 'content')});
 content.filter(x=>x.views>=10&&x.completionRate<25).slice(0,10).forEach(x=>push('medium','إكمال منخفض لدرس',x.title+' — '+x.completionRate+'% إكمال من '+x.views+' مشاهدة','lessons',x.title,'engagement'));
 content.filter(x=>x.quizAttempts>=5&&x.quizAverage<50).slice(0,10).forEach(x=>push('high','نتائج ضعيفة جدًا في درس',x.title+' — متوسط التدريب '+x.quizAverage+'%','lessons',x.title,'learning'));
 const pending=flattenTeacherSubmissions(root).filter(x=>(x.status||'pending')==='pending');
 const oldPending=pending.filter(x=>Date.now()-Number(x.createdAt||Date.now())>48*3600000);
 if(oldPending.length)push('high',oldPending.length+' مراجعة مدرس متأخرة','طلبات تنتظر أكثر من 48 ساعة.','teachers','', 'operations');
 else if(pending.length)push('low',pending.length+' مراجعة مدرس معلقة','طلبات جديدة تحتاج قرار الإدارة.','teachers','', 'operations');
 const grading=flattenAssignmentSubmissions(root).filter(x=>x.status==='submitted'&&Date.now()-Number(x.submittedAt||x.updatedAt||Date.now())>48*3600000);
 if(grading.length)push('high',grading.length+' واجب ينتظر التصحيح','تسليمات مر عليها أكثر من 48 ساعة دون تصحيح.','teachers','', 'operations');
 const inactiveTeachers=teachers.filter(t=>t.isActive===false);
 if(inactiveTeachers.length)push('low',inactiveTeachers.length+' مدرس موقوف','راجع الحسابات الموقوفة إذا كانت لا تزال ضمن فريق التدريس.','teachers','', 'operations');
 const inactiveStudents=risks.filter(x=>x.inactivity>=14).length,weakStudents=risks.filter(x=>x.recentAttempts>=2&&x.score<60).length;
 if(inactiveStudents)push(inactiveStudents>=10?'high':'medium',inactiveStudents+' طالبًا غير نشط منذ 14 يومًا أو أكثر','يحتاجون متابعة أو إعادة تفاعل.','students','', 'students');
 if(weakStudents)push('medium',weakStudents+' طالبًا متوسطهم أقل من 60%','لديهم محاولتان حديثتان على الأقل ويحتاجون دعمًا.','students','', 'students');
 if(!issues.length)push('good','لا توجد مشكلات بارزة','المؤشرات الحالية لا تعرض عناصر تحتاج تدخلًا عاجلًا.','overview','', 'system');
 const rank={high:0,medium:1,low:2,good:3};return issues.sort((a,b)=>rank[a.severity]-rank[b.severity]);
}
function renderTrend(students){
 const box=document.getElementById('adminIntelTrend');if(!box)return;
 const series=activitySeries(students),max=Math.max(1,...series.map(x=>x.minutes));
 box.innerHTML=series.map(x=>'<div class="admin-trend-day"><b>'+x.minutes+'د</b><div class="admin-trend-column" style="height:'+Math.max(4,Math.round(x.minutes/max*100))+'%"></div><small>'+esc(dayLabel(x.key))+'</small></div>').join('');
}
function renderSubjects(rows){
 const box=document.getElementById('adminIntelSubjects');if(!box)return;
 box.innerHTML=rows.length?'<table class="admin-intel-table"><thead><tr><th>المادة</th><th>الدروس</th><th>الاختبارات</th><th>الطلاب</th><th>المحاولات</th><th>متوسط النتائج</th><th>الإكمال</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong><small style="display:block;color:#94a3b8">'+r.files+' ملف</small></td><td>'+r.lessons+'</td><td>'+r.quizzes+'</td><td>'+r.students+'</td><td>'+r.attempts+'</td><td><span class="admin-intel-score '+scoreClass(r.avg)+'">'+(r.attempts?r.avg+'%':'—')+'</span></td><td><div class="admin-engagement-track"><span style="width:'+Math.min(100,r.engagement)+'%"></span></div><small>'+r.engagement+'%</small></td></tr>').join('')+'</tbody></table>':'<div class="admin-intel-empty"><span>📊</span>لا توجد بيانات مواد كافية حتى الآن.</div>';
}
function renderContent(rows,ctx){
 const box=document.getElementById('adminIntelContent');if(!box)return;
 const show=rows.slice(0,8);
 box.innerHTML=show.length?show.map((x,i)=>'<div class="admin-intel-row"><div class="admin-intel-row-main"><span class="admin-intel-row-icon">'+(i<3?'🏆':'📘')+'</span><div><strong>'+esc(x.title)+'</strong><small>'+esc(subjectName(x.subject,ctx.root))+' • '+x.views+' مشاهدة • '+x.completions+' إكمال • متوسط تدريب '+x.quizAverage+'%</small></div></div><span class="admin-severity '+(x.completionRate>=60?'good':x.completionRate>=30?'low':'medium')+'">'+x.completionRate+'%</span></div>').join(''):'<div class="admin-intel-empty"><span>🎬</span>ستظهر هنا الدروس الأكثر استخدامًا بعد بدء الطلاب بالتعلم.</div>';
}
function renderRisks(rows,ctx){
 const box=document.getElementById('adminIntelRisks');if(!box)return;
 const hi=rows.filter(x=>x.severity==='high').length,med=rows.filter(x=>x.severity==='medium').length;
 document.getElementById('adminIntelRiskHigh').textContent=hi;document.getElementById('adminIntelRiskMedium').textContent=med;document.getElementById('adminIntelRiskTotal').textContent=rows.length;
 box.innerHTML=rows.length?rows.slice(0,10).map(x=>'<div class="admin-intel-row"><div class="admin-intel-row-main"><span class="admin-intel-row-icon"><i class="fa-solid '+(x.severity==='high'?'fa-triangle-exclamation':'fa-user-clock')+'"></i></span><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.reasons.join(' • '))+'</small></div></div><button type="button" data-intel-student="'+esc(x.id)+'" data-intel-name="'+esc(x.name)+'">فتح الطالب</button></div>').join(''):'<div class="admin-intel-empty"><span>✅</span>لا توجد إشارات خطر واضحة في بيانات الطلاب الحالية.</div>';
 box.querySelectorAll('[data-intel-student]').forEach(b=>b.onclick=async()=>{await ctx.setTab('students');const input=document.getElementById('studentSearch');if(input){input.value=b.dataset.intelName;input.dispatchEvent(new Event('input',{bubbles:true}))}});
}
function renderIssues(rows,ctx){
 const box=document.getElementById('adminIntelIssues');if(!box)return;
 const filtered=state.issueFilter==='all'?rows:rows.filter(x=>x.severity===state.issueFilter);
 box.innerHTML=filtered.length?filtered.slice(0,30).map(x=>'<div class="admin-intel-row"><div class="admin-intel-row-main"><span class="admin-severity '+x.severity+'">'+(x.severity==='high'?'عاجل':x.severity==='medium'?'مهم':x.severity==='low'?'متابعة':'سليم')+'</span><div><strong>'+esc(x.title)+'</strong><small>'+esc(x.text)+'</small></div></div>'+(x.tab?'<button type="button" data-intel-tab="'+esc(x.tab)+'" data-intel-search="'+esc(x.search||'')+'">معالجة</button>':'')+'</div>').join(''):'<div class="admin-intel-empty"><span>✅</span>لا توجد عناصر في هذا الفلتر.</div>';
 box.querySelectorAll('[data-intel-tab]').forEach(b=>b.onclick=async()=>{const tab=b.dataset.intelTab,search=b.dataset.intelSearch||'';await ctx.setTab(tab);const map={lessons:'lessonSearch',quizzes:'quizSearch',students:'studentSearch'};const input=document.getElementById(map[tab]);if(input&&search){input.value=search;input.dispatchEvent(new Event('input',{bubbles:true}))}});
}
function exportCsv(data,ctx){
 const rows=[['القسم','العنصر','القيمة1','القيمة2','ملاحظات']];
 data.subjects.forEach(x=>rows.push(['أداء المواد',x.name,x.avg+'%',x.attempts+' محاولة',x.engagement+'% إكمال']));
 data.risks.forEach(x=>rows.push(['طلاب يحتاجون متابعة',x.name,x.score+'%',x.inactivity+' يوم',x.reasons.join(' | ')]));
 data.issues.forEach(x=>rows.push(['مركز المشكلات',x.title,x.severity,'',x.text]));
 const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='academy-admin-report-'+dateKey(new Date())+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);ctx.toast?.('تم تجهيز تقرير CSV');
}
function compute(ctx){
 const root=ctx.root,students=vals(root.studentProfilesV3),{start}=reportWindow(),histories=students.flatMap(s=>quizHistory(s).map(a=>({...a,studentId:s.id}))),periodAttempts=histories.filter(x=>Number(x.createdAt||0)>=start),series=activitySeries(students);
 const activeToday=students.filter(s=>daysAgo(lastActive(s))===0).length,active7=students.filter(s=>daysAgo(lastActive(s))<=6).length,inactive14=students.filter(s=>daysAgo(lastActive(s))>=14).length,studyMinutes=series.reduce((n,x)=>n+x.minutes,0),average=avg(periodAttempts.map(x=>x.score));
 const completions=students.reduce((n,s)=>n+completedProgress(s).filter(([,v])=>Number(v.completedAt||v.updatedAt||0)>=start).length,0);
 const risks=studentRiskRows(students),subjects=subjectStats(root,students),content=topContent(root),issues=buildIssues(root,students,risks,subjects,content);
 return{students,activeToday,active7,inactive14,studyMinutes,average,attempts:periodAttempts.length,completions,risks,subjects,content,issues};
}
function render(ctx){
 state.lastCtx=ctx;const data=compute(ctx),root=ctx.root;
 const high=data.issues.filter(x=>x.severity==='high').length,medium=data.issues.filter(x=>x.severity==='medium').length;
 const badge=document.getElementById('analyticsAlertBadge');if(badge){badge.textContent=high+medium;badge.classList.toggle('hidden',high+medium===0)}
 document.getElementById('adminIntelHeroIssues').textContent=high+medium;document.getElementById('adminIntelHeroActive').textContent=data.active7;
 document.getElementById('adminIntelPeriodText').textContent='آخر '+state.days+' أيام • تم التحديث '+new Date().toLocaleTimeString('ar-EG',{hour:'numeric',minute:'2-digit'});
 const kpis=[
  ['fa-bolt',data.activeToday,'نشط اليوم',data.active7+' خلال 7 أيام'],
  ['fa-clock-rotate-left',data.inactive14,'غير نشط 14+ يوم','من '+data.students.length+' طالب'],
  ['fa-chart-line',data.average+'%','متوسط الاختبارات',data.attempts+' محاولة'],
  ['fa-book-open-reader',Math.round(data.studyMinutes/60)+' س','وقت مذاكرة','إجمالي الفترة'],
  ['fa-circle-check',data.completions,'دروس مكتملة','خلال الفترة'],
  ['fa-triangle-exclamation',high,'مشكلات عاجلة',medium+' مهمة']
 ];
 document.getElementById('adminIntelKpis').innerHTML=kpis.map(x=>'<article><span><i class="fa-solid '+x[0]+'"></i></span><strong>'+x[1]+'</strong><small>'+x[2]+'</small><em>'+x[3]+'</em></article>').join('');
 renderTrend(data.students);renderSubjects(data.subjects);renderContent(data.content,ctx);renderRisks(data.risks,ctx);renderIssues(data.issues,ctx);
 document.querySelectorAll('[data-intel-period]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.intelPeriod)===state.days);b.onclick=()=>{state.days=Number(b.dataset.intelPeriod||7);render(ctx)}});
 document.querySelectorAll('[data-issue-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.issueFilter===state.issueFilter);b.onclick=()=>{state.issueFilter=b.dataset.issueFilter;renderIssues(data.issues,ctx);document.querySelectorAll('[data-issue-filter]').forEach(x=>x.classList.toggle('active',x===b))}});
 const exp=document.getElementById('adminIntelExport');if(exp)exp.onclick=()=>exportCsv(data,ctx);
 const refresh=document.getElementById('adminIntelRefresh');if(refresh)refresh.onclick=()=>render(ctx);
 const overview=document.getElementById('adminOverviewAttention');
 if(overview&&document.getElementById('admin-tab-overview')?.classList.contains('active')){
   const existing=overview.textContent||'';if(high)overview.title=high+' مشكلة عاجلة مكتشفة في مركز التحليلات • '+existing;
 }
}
window.AdminIntelligence={render};
})();