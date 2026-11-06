/* V63: Admin-only curriculum importer with explicit destination scope. */
(() => {
'use strict';
if (document.body.dataset.portal !== 'admin') return;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const example = {schemaVersion:'egtaz-curriculum-v1',educationType:'public',stage:'primary',grade:4,subject:{id:'arabic',name:'اللغة العربية'},units:[{number:1,name:'الوحدة الأولى — عنوان الوحدة هنا',lessons:[{key:'u1-l1',title:'عنوان الدرس الأول (نموذج فقط)',summary:'ملخص مختصر للدرس',content:'<h3>أهداف الدرس</h3><p>هنا الشرح الكامل الذي ستستلمه مع ملف المنهج، ويمكن تعديله لاحقًا من الإدارة.</p><h3>تدريب</h3><p>أمثلة وتدريبات متنوعة.</p>',questions:[{question:'سؤال تجريبي: أي الخيارات صحيحة؟',options:['الخيار الأول','الخيار الثاني','الخيار الثالث','الخيار الرابع'],correctAnswer:0,hint:'تفسير سبب صحة الإجابة.'}]}]}]};
const base = {
 public: {
  primary:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['religion','التربية الدينية']],
  prep:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['computer','الحاسب الآلي']],
  sec:[['arabic','اللغة العربية'],['english','اللغة الإنجليزية'],['math','الرياضيات'],['physics','الفيزياء'],['chemistry','الكيمياء'],['biology','الأحياء'],['history','التاريخ'],['geography','الجغرافيا']]
 },
 azhar: {
  primary:[['arabic','اللغة العربية'],['math','الرياضيات'],['english','اللغة الإنجليزية'],['science','العلوم'],['quran','القرآن الكريم'],['religion','التربية الإسلامية']],
  prep:[['arabic','اللغة العربية'],['math','الرياضيات'],['english','اللغة الإنجليزية'],['science','العلوم'],['quran','القرآن الكريم'],['fiqh','الفقه'],['tawhid','التوحيد'],['hadith','الحديث الشريف'],['tafsir','التفسير']],
  sec:[['arabic','اللغة العربية'],['math','الرياضيات'],['english','اللغة الإنجليزية'],['quran','القرآن الكريم'],['fiqh','الفقه'],['tawhid','التوحيد'],['hadith','الحديث الشريف'],['tafsir','التفسير'],['nahw','النحو'],['sarf','الصرف'],['balagha','البلاغة']]
 }
};
const stageNames = {primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};
const ordinal = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس'];
const scope = {type:'',stage:'',grade:'',subject:''};
let subjects = [], input = '', publish = true, preview = null, previewSignature = '', busy = false, warning = '', success = '', subjectsRequest = 0, subjectsError = '';
const el = () => document.getElementById('v61-quick-import');
function parse() { const p = JSON.parse(input); if (!p || typeof p !== 'object' || Array.isArray(p)) throw Error('المحتوى يجب أن يكون كائن JSON'); return p; }
function fileScope(p) {return {type:p?.educationType||'',stage:p?.stage||'',grade:String(p?.grade||''),subject:p?.subject?.id||''};}
function selectedSubject() {return subjects.find(s => s.id === scope.subject);}
function selectedTarget() {
 const sub = selectedSubject();
 return {educationType:scope.type,stage:scope.stage,grade:Number(scope.grade),subject:{id:scope.subject,name:sub?.name||''}};
}
function validScope() {return ['public','azhar'].includes(scope.type) && ['primary','prep','sec'].includes(scope.stage) && Number.isInteger(Number(scope.grade)) && Number(scope.grade)>=1 && Number(scope.grade)<=(scope.stage==='primary'?6:3) && !!scope.subject && !!selectedSubject();}
function signature() {return JSON.stringify([input,publish,selectedTarget()]);}
function localCounts(p){const units=Array.isArray(p.units)?p.units:[];return {units:units.length,lessons:units.reduce((n,u)=>n+(Array.isArray(u.lessons)?u.lessons.length:0),0),questions:units.reduce((n,u)=>n+(Array.isArray(u.lessons)?u.lessons.reduce((a,l)=>a+(Array.isArray(l.questions)?l.questions.length:0),0):0),0)};}
function scopeName(s, subjectName) {const type=s.type==='azhar'?'أزهر':s.type==='public'?'تربية وتعليم':'غير محدد';const grade=Number(s.grade);const grd=ordinal[grade-1] || s.grade || '—';const stage=stageNames[s.stage] || '—';return `${type} ← ${stage} ← الصف ${grd} ← ${subjectName||'اختر المادة'}`;}
function makeSubjects(extra={}) {
 const out=new Map((base[scope.type]?.[scope.stage]||[]).map(([id,name])=>[id,{id,name,isHidden:false}]));
 Object.entries(extra||{}).filter(([,row])=>row&&typeof row==='object'&&!Array.isArray(row)).sort(([a],[b])=>Number(a.startsWith(scope.type+'__'))-Number(b.startsWith(scope.type+'__'))).forEach(([key,row])=>{
   if (row.type && row.type !== scope.type) return;
   const id=String(row.id||key);if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$/.test(id))return;
   const old=out.get(id);out.set(id,{id,name:String(row.name||old?.name||id),isHidden:row.isHidden===true});
 });
 try {const p=parse();const f=fileScope(p);if(p.subject?.id && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,89}$/.test(f.subject) && !out.has(f.subject)) {
   out.set(f.subject,{id:f.subject,name:String(p.subject.name||f.subject).slice(0,90),isFromFile:true});
 }} catch{}
 return [...out.values()];
}
async function loadSubjects(){
 const sequence=++subjectsRequest;subjectsError='';
 if(!scope.type||!scope.stage||!scope.grade){subjects=[];render();return;}
 subjects=makeSubjects();if(scope.subject&&!subjects.some(s=>s.id===scope.subject))scope.subject='';render();
 try {
   const app=window.AcademyBackend?.apps?.find(a=>a.name==='admin-portal');
   if(!app?.auth()?._token())return;
   const snap=await app.database().ref(`customSubjects/${scope.stage}/${scope.grade}`).once('value');
   if(sequence!==subjectsRequest)return;
   const existing=scope.subject;
   subjects=makeSubjects(snap.val()||{});
   if(existing && !subjects.some(s=>s.id===existing))scope.subject='';
   render();
 } catch(e){
   if(sequence!==subjectsRequest)return;
   subjectsError='تعذر تحميل المواد الإضافية. تظهر المواد الافتراضية ومادة الملف إن وُجدت.';
   render();
 }
}
function suggestFileTarget(){
 try {const f=fileScope(parse());
   if(!scope.type && ['public','azhar'].includes(f.type))scope.type=f.type;
   if(!scope.stage && stageNames[f.stage])scope.stage=f.stage;
   if(!scope.grade && Number(f.grade)>0 && Number(f.grade)<=(scope.stage==='primary'?6:3))scope.grade=String(f.grade);
   if(!scope.subject && f.subject)scope.subject=f.subject;
 } catch{}
 loadSubjects();
}
function scopeMismatch(p){const f=fileScope(p);return validScope() && (f.type!==scope.type||f.stage!==scope.stage||f.grade!==String(scope.grade)||f.subject!==scope.subject);}
function render(){
 const root=el();if(!root)return;
 let parsed=null,error='';try{if(input.trim())parsed=parse();}catch(e){error=e.message;}
 const count=parsed?localCounts(parsed):null;
 const gradeOptions=scope.stage?Array.from({length:scope.stage==='primary'?6:3},(_,i)=>`<option value="${i+1}" ${scope.grade===String(i+1)?'selected':''}>الصف ${ordinal[i]} ${stageNames[scope.stage]}</option>`).join(''):'';
 const mismatch=parsed&&scopeMismatch(parsed);
 const selected=selectedSubject();
 root.innerHTML=`<div class="v61-hero"><span class="v61-hero-icon">📦</span><div><small>لوحة الإدارة فقط • رفع منهج كامل</small><h1>الرفع السريع للمناهج</h1><p>حدد مكان الإضافة أولًا، ثم ارفع ملف الوحدات والدروس والشروح والاختبارات دفعة واحدة.</p></div></div>
 <section class="v22-card v63-target-panel"><div class="v63-heading"><span class="v63-round">1</span><div><h2>أين تريد إضافة المحتوى؟</h2><p>هذه الاختيارات هي التي تحدد مكان حفظ الدروس والاختبارات، حتى لو اختلفت البيانات المكتوبة داخل ملف المنهج.</p></div></div>
 <div class="v63-fields"><label>نوع التعليم <select id="v63-type" ${busy?'disabled':''} required><option value="">اختر نوع التعليم</option><option value="public" ${scope.type==='public'?'selected':''}>🏫 تربية وتعليم (عام)</option><option value="azhar" ${scope.type==='azhar'?'selected':''}>🕌 أزهر</option></select></label>
 <label>المرحلة الدراسية <select id="v63-stage" ${!scope.type||busy?'disabled':''} required><option value="">اختر المرحلة</option>${Object.entries(stageNames).map(([id,label])=>`<option value="${id}" ${scope.stage===id?'selected':''}>${label}</option>`).join('')}</select></label>
 <label>الصف الدراسي <select id="v63-grade" ${!scope.stage||busy?'disabled':''} required><option value="">اختر الصف</option>${gradeOptions}</select></label>
 <label>المادة الدراسية <select id="v63-subject" ${!scope.grade||busy?'disabled':''} required><option value="">اختر المادة</option>${subjects.map(s=>`<option value="${esc(s.id)}" ${scope.subject===s.id?'selected':''}>${esc(s.name)}${s.isHidden?' (مخفية)':''}${s.isFromFile?' (من الملف)':''}</option>`).join('')}</select></label></div>
 ${subjectsError?`<p class="v63-muted" role="status">${esc(subjectsError)}</p>`:''}
 <div class="v63-destination" aria-live="polite"><b>وجهة الرفع:</b> ${validScope()?`<strong>${esc(scopeName(scope,selected?.name))}</strong>`:'<span>أكمل الخيارات الأربعة لتحديد وجهة الرفع</span>'}</div>
 </section>
 <div class="v61-grid"><section class="v22-card v61-import-panel"><div class="v63-heading"><span class="v63-round">2</span><div><h2>اختر ملف المنهج</h2><p>ارفع ملف JSON أجهزه لك أو الصقه مباشرة هنا.</p></div></div>
 <label class="v61-file">📂 اختيار ملف من جهازك<input type="file" accept=".json,application/json" id="v61-file"></label>
 <label class="v61-editor-label">أو الصق محتوى JSON<textarea dir="ltr" id="v61-text" spellcheck="false" rows="10" placeholder="الصق الملف هنا أو اختر ملف JSON">${esc(input)}</textarea></label>
 <div class="v61-buttons"><button type="button" class="v22-btn v22-secondary" data-v61="template">تنزيل نموذج JSON</button><button type="button" class="v22-btn v22-secondary" data-v61="paste-template">عرض النموذج</button><button type="button" class="v22-btn v22-secondary" data-v61="clear">مسح المحتوى</button></div>
 <div class="v61-publish"><label><input id="v61-publish" type="checkbox" ${publish?'checked':''}> نشر الدروس والاختبارات مباشرة</label><small>يمكنك إلغاء العلامة لحفظ المحتوى كمسودات، ثم مراجعته قبل النشر.</small></div>
 <button type="button" class="v22-btn v22-primary v61-main-button" data-v61="preview" ${busy||!input.trim()||!!error||!validScope()?'disabled':''}>${busy?'جارٍ الفحص...':'🔍 فحص الملف ومعاينة الإضافة'}</button>
 ${error?`<p class="v61-error" role="alert">${esc(error)}</p>`:''}</section>
 <section class="v22-card v61-review"><div class="v63-heading"><span class="v63-round">3</span><div><h2>المعاينة والنتيجة</h2><p>راجع الوجهة والأعداد قبل تأكيد إضافة المنهج.</p></div></div>
 ${parsed?`<div class="v61-scope"><strong>المحتوى الموجود في الملف:</strong><span dir="rtl">${esc(scopeName(fileScope(parsed),parsed.subject?.name||parsed.subject?.id))}</span></div><div class="v61-kpis"><div><strong>${count.units}</strong><span>وحدة</span></div><div><strong>${count.lessons}</strong><span>درس</span></div><div><strong>${count.questions}</strong><span>سؤال</span></div></div>`:'<div class="v61-placeholder">ارفع ملف المنهج لتظهر أعداد الوحدات والدروس والأسئلة.</div>'}
 ${mismatch?`<div class="v63-mismatch" role="alert"><b>⚠️ بيانات الملف مختلفة عن وجهة الرفع!</b><span>سيتم إضافة جميع الدروس والاختبارات إلى <strong>${esc(scopeName(scope,selected?.name))}</strong> بناءً على اختيارك، وليس إلى الصف أو المادة المكتوبة داخل الملف.</span></div>`:''}
 ${preview?`<div class="v61-result"><h3>نتيجة فحص الخادم</h3><p>الوجهة: <b>${esc(scopeName(scope,selected?.name))}</b></p><p>ستُضاف <b>${Number(preview.lessons||0)}</b> دروس و<b>${Number(preview.quizzes||0)}</b> اختبارات و<b>${Number(preview.units||0)}</b> وحدات جديدة.</p><p>موجود سابقًا: <b>${Number(preview.existingLessons||0)}</b> دروس و<b>${Number(preview.existingUnits||0)}</b> وحدات — لن تُستبدل أو تُمسح.</p></div><button type="button" class="v22-btn v22-primary v61-main-button" data-v61="import" ${busy?'disabled':''}>${busy?'جارٍ الحفظ...':'✅ تأكيد رفع المنهج إلى الوجهة المحددة'}</button>`:'<div class="v61-hint">فحص الملف لا يحفظ شيئًا. بعد المراجعة يمكنك تأكيد الرفع بضغطة واحدة.</div>'}
 ${warning?`<div class="v61-error" role="alert">${esc(warning)}</div>`:''}${success?`<div class="v61-success" role="status">${esc(success)}</div>`:''}</section></div>
 <section class="v22-card v61-steps"><h3>ماذا يحدث بعد الرفع؟</h3><div><span>① تُضاف الوحدات في نوع التعليم والمرحلة والصف والمادة التي اخترتها</span><span>② تُحفظ الدروس مع الشرح الموجود في الملف</span><span>③ ترتبط اختبارات كل درس به تلقائيًا</span><span>④ يمكنك تعديل الدرس وإضافة رابط الفيديو من إدارة المحتوى كما اعتدت</span></div><p>لا تتغير أدوات الإضافة اليدوية ولا تظهر ميزة الرفع السريع في لوحة المعلم. رفع الملف مرة أخرى يتخطى الدروس الموجودة ويحافظ على فيديوهاتها وشروحها.</p><a class="v22-btn v22-secondary" href="./admin.html?view=content">فتح إدارة المحتوى للتعديل</a></section>`;
}
async function api(mode){
 const b=window.AcademyBackend;const app=b?.apps?.find(a=>a.name==='admin-portal');const token=app?.auth()?._token();
 if(!token||app?.auth()?.currentUser?.role!=='admin')throw Error('يرجى تسجيل الدخول بحساب المدير أولًا');
 if(!validScope())throw Error('اختر نوع التعليم والمرحلة والصف والمادة أولًا');
 return b.request('v61/admin/curriculum/import',{method:'POST',token,body:{mode,publish,curriculum:parse(),target:selectedTarget()},timeoutMs:70000});
}
function sample(){if(!validScope())return example;const t=selectedTarget();return {...example,educationType:t.educationType,stage:t.stage,grade:t.grade,subject:t.subject};}
function downloadSample(){const blob=new Blob([JSON.stringify(sample(),null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='egtaz-curriculum-template-v1.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function act(name){
 if(busy)return;warning='';success='';
 if(name==='template'){downloadSample();return;}
 if(name==='paste-template'){input=JSON.stringify(sample(),null,2);preview=null;previewSignature='';suggestFileTarget();return;}
 if(name==='clear'){input='';preview=null;previewSignature='';scope.subject='';loadSubjects();return;}
 if(!input.trim()){warning='اختر ملفًا أو الصق محتواه أولًا';render();return;}
 if(!validScope()){warning='اختر نوع التعليم والمرحلة والصف والمادة أولًا';render();return;}
 try {
  if(name==='import'&&(!preview||previewSignature!==signature()))throw Error('تم تغيير الملف أو وجهة الرفع أو إعداد النشر. أعد الفحص قبل الرفع.');
  if(name==='import'){
   const p=parse(),difference=scopeMismatch(p),target=scopeName(scope,selectedSubject()?.name);
   const msg=`تأكيد الاستيراد إلى:\n${target}\n\n${difference?'⚠️ وجهة الرفع مختلفة عن بيانات الملف!\n\n':''}سيتم ${publish?'نشر':'حفظ مسودات'} المحتوى الجديد دون حذف بيانات سابقة.`;
   if(!confirm(msg))return;
  }
  busy=true;
  if(name==='preview'){const submittedSignature=signature();preview=null;previewSignature='';render();const result=await api('preview');if(signature()!==submittedSignature)throw Error('تغيرت بيانات الملف أو وجهة الرفع أثناء الفحص. أعد الفحص من جديد.');preview=result.summary;previewSignature=submittedSignature;}
  else if(name==='import'){
    render();const result=await api('import');preview=null;previewSignature='';success=`تم الحفظ في ${scopeName(scope,selectedSubject()?.name)}: ${result.summary.lessons} درس و${result.summary.quizzes} اختبار و${result.summary.units} وحدة جديدة. تم تخطي ${result.summary.existingLessons} درس موجود.`;
  }
 }catch(e){warning=e?.data?.message||e?.message||'حدث خطأ أثناء الفحص';preview=null;previewSignature='';}
 finally{busy=false;render();}
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-v61]');if(!button||!el()?.contains(button))return;e.preventDefault();act(button.dataset.v61);});
document.addEventListener('input',e=>{if(e.target.id!=='v61-text')return;input=e.target.value;preview=null;previewSignature='';warning='';success='';const root=el();const btn=root?.querySelector('[data-v61="preview"]');if(btn)btn.disabled=!input.trim()||!validScope();const importBtn=root?.querySelector('[data-v61="import"]');if(importBtn)importBtn.disabled=true;});
document.addEventListener('change',async e=>{
 const id=e.target.id;
 if(id==='v61-publish'){publish=e.target.checked;preview=null;previewSignature='';render();return;}
 if(['v63-type','v63-stage','v63-grade','v63-subject'].includes(id)){
   if(busy){render();return;}
   if(id==='v63-type'){scope.type=e.target.value;scope.subject='';}
   if(id==='v63-stage'){scope.stage=e.target.value;scope.grade='';scope.subject='';}
   if(id==='v63-grade'){scope.grade=e.target.value;scope.subject='';}
   if(id==='v63-subject'){scope.subject=e.target.value;}
   preview=null;previewSignature='';warning='';success='';
   if(id==='v63-subject')render();else loadSubjects();
   return;
 }
 if(id!=='v61-file')return;
 const file=e.target.files?.[0];if(!file)return;
 if(file.size>2900000){warning='الملف أكبر من الحد الآمن (2.9 ميجابايت). قسم المنهج إلى ملفين.';render();return;}
 try{input=await file.text();preview=null;previewSignature='';warning='';success='';suggestFileTarget();}
 catch{warning='تعذر قراءة الملف';render();}
});
window.EgtazV61={render};
})();
