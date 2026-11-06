/* V57: supplementary interactive quiz controls. All answers are scored on the PHP server. */
(()=>{'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const demo=[
 {type:'true_false',question:'الشمس نجم.',correctAnswer:true,hint:'الشمس من النجوم'},
 {type:'fill_blank',question:'عاصمة مصر هي ....',acceptedAnswers:['القاهرة','قاهرة']},
 {type:'matching',question:'صل الكلمة بمعناها',pairs:[{left:'شجاع',right:'جريء'},{left:'سريع',right:'عاجل'}]},
 {type:'ordering',question:'رتّب الحروف لتكوين كلمة',items:['أ','ب','ج']},
 {type:'essay',question:'اشرح مفهوم الجملة الاسمية',rubric:'إجابة تذكر المبتدأ والخبر بوضوح'},
 {type:'multiple_choice',question:'أي الأعداد زوجي؟',options:['3','4','5'],correctAnswer:1}
];
const types={true_false:'صح أم خطأ',fill_blank:'أكمل',matching:'توصيل',ordering:'ترتيب',essay:'مقالي',multiple_choice:'اختيار من متعدد'};
let pending=[],pendingReady=false,pendingError='';
function normalizeClient(source){const items=Array.isArray(source?.questions)?source.questions:[];return items.map(q=>({type:q.type,question:q.question||'',options:q.options||[],lefts:q.lefts||[],rights:q.rights||[],items:q.items||[]})).filter(q=>types[q.type]&&q.question);}
function editor(role,lessons,existing=null){const editing=role==='admin'&&existing?.assessmentMode==='interactive';const allowed=role==='teacher'||role==='admin';if(!allowed)return '';
 return `<section class="v22-card v57-editor" style="margin-top:20px"><h3>اختبار V57 التفاعلي</h3>${editing?'<button type="button" class="v22-btn v22-secondary" data-action="cancel-quiz-edit">إلغاء تعديل الاختبار</button>':''}<p>أنواع إضافية: صح وخطأ، أكمل، توصيل، ترتيب ومقالي. يظهر المقال للإدارة أو المعلم للمراجعة قبل احتساب درجته.</p><form id="v57-create" class="v22-form">
 <label>الدرس<select name="lessonId" required ${editing?'disabled':''}><option value="">اختر الدرس</option>${lessons.map(l=>`<option value="${E(l.id)}" ${editing&&existing.lessonId===l.id?'selected':''}>${E(l.title||'درس')} — ${E(l.subject||'')}</option>`).join('')}</select></label>${editing?`<input type="hidden" name="lessonId" value="${E(existing.lessonId)}"><input type="hidden" name="quizId" value="${E(existing.id)}">`:''}
 <label>عنوان الاختبار<input name="title" required maxlength="150" value="${E(editing?(existing.title||existing.name||''):'')}" placeholder="اختبار تفاعلي على الدرس"></label>
 <details class="v57-simple-builder" open><summary><strong>إنشاء سؤال بالحقول مباشرة</strong></summary>
 <label>نوع السؤال<select id="v57-kind">${Object.entries(types).map(([id,label])=>`<option value="${id}">${E(label)}</option>`).join('')}</select></label>
 <label>نص السؤال<textarea id="v57-new-question" rows="2" placeholder="اكتب السؤال هنا"></textarea></label>
 <label class="v57-builder-extra" data-for="true_false">الإجابة الصحيحة<select id="v57-bool"><option value="true">صحيح</option><option value="false">خطأ</option></select></label>
 <label class="v57-builder-extra" data-for="fill_blank" hidden>الإجابات المقبولة (افصل بين الإجابات بعلامة |)<input id="v57-fill" placeholder="القاهرة | قاهرة"></label>
 <label class="v57-builder-extra" data-for="matching" hidden>أزواج التوصيل، كل زوج بسطر وبينه =<textarea id="v57-pairs" rows="3" placeholder="الصدق = الأمانة
الشجاعة = الجرأة"></textarea></label>
 <label class="v57-builder-extra" data-for="ordering" hidden>العناصر بالترتيب الصحيح (افصل بعلامة |)<input id="v57-order" placeholder="الأول | الثاني | الثالث"></label>
 <label class="v57-builder-extra" data-for="essay" hidden>معيار التصحيح الذي سيراه المعلم فقط<textarea id="v57-rubric" rows="2" placeholder="اشترط أن يذكر الطالب الفكرة الأساسية"></textarea></label>
 <label class="v57-builder-extra" data-for="multiple_choice" hidden>اختيارات السؤال (افصل بعلامة |)<input id="v57-options" placeholder="أ | ب | ج | د"></label>
 <label class="v57-builder-extra" data-for="multiple_choice" hidden>ترتيب الاختيار الصحيح<select id="v57-correct">${Array.from({length:6},(_,i)=>`<option value="${i}">${i+1}</option>`).join('')}</select></label>
 <button type="button" class="v22-btn v22-secondary" data-action="v57-add">＋ إضافة السؤال إلى الاختبار</button><span id="v57-added" class="v57-small" role="status"></span></details>
 <details><summary><strong>عرض الأسئلة والتعديل الجماعي (JSON)</strong></summary><p>يمكنك تعديل جميع الأسئلة مباشرة، أو استخدام نموذج تجريبي للتعرف على الصيغة.</p><button type="button" class="v22-btn v22-secondary" data-action="v57-sample">إدراج مثال لجميع الأنواع</button>
 <label>الأسئلة <textarea name="questions" required rows="13" dir="ltr" spellcheck="false" placeholder="أضف الأسئلة من النموذج أعلى الصفحة، أو الصق JSON هنا">${editing?E(JSON.stringify(existing.questions||[],null,2)): ''}</textarea></label></details>
 <p class="v57-small">للتوصيل استخدم pairs: left/right، وللترتيب items بالترتيب الصحيح، ولأكمل acceptedAnswers. المقال يستخدم rubric لا يراه الطالب قبل التصحيح. لا تُرسل الامتحانات المقاليّة بأسماء الطلاب.</p>
 <button type="submit" class="v22-btn v22-primary">${role==='teacher'?'إرسال الاختبار التفاعلي للموافقة':'إنشاء الاختبار التفاعلي'}</button></form>
 <hr><div class="v22-btnrow"><button type="button" class="v22-btn v22-secondary" data-action="v57-pending">عرض المقالات المطلوب تصحيحها</button></div><div id="v57-pending-panel">${renderPending()}</div></section>`;
}
function renderPending(){if(pendingError)return `<p role="alert">${E(pendingError)}</p>`;if(!pendingReady)return '<p>اضغط «عرض المقالات» لتحميل المراجعات.</p>';if(!pending.length)return '<p>لا توجد مقالات تنتظر التصحيح حاليًا.</p>';return pending.map(r=>`<form class="v22-card v57-mark" data-v57-grade><h4>${E(r.title)} — محاولة ${E(r.attemptId)}</h4><input type="hidden" name="attemptId" value="${E(r.attemptId)}"><input type="hidden" name="teacherId" value="${E(r.teacherId)}">${(r.essays||[]).map((q,i)=>`<div class="v57-mark-item"><strong>${E(q.question)}</strong><p>إجابة الطالب: ${E(q.answer)}</p><p>معيار التصحيح: ${E(q.rubric)}</p><label>تقييم الإجابة<select name="mark-${i}" required><option value="">اختر</option><option value="1">صحيحة (1)</option><option value="0">غير صحيحة (0)</option></select></label></div>`).join('')}<button class="v22-btn v22-primary" type="submit">اعتماد تصحيح المقالات</button></form>`).join('');}
function quizUI(state,title){const q=state.quiz;if(!q)return '';const questions=q.questions;const i=state.quizIndex;
 if(i>=questions.length)return reportUI(state,title);
 const x=questions[i],old=state.answers[i];
 const button=(txt,val)=>`<button type="button" class="v22-answer ${old===val?'selected':''}" data-action="v57-answer" data-answer="${E(JSON.stringify(val))}">${E(txt)}</button>`;
 let opts='';
 if(x.type==='true_false')opts=button('✓ صحيح',true)+button('✕ خطأ',false);
 if(x.type==='multiple_choice')opts=x.options.map((v,n)=>button(v,n)).join('');
 if(x.type==='fill_blank'||x.type==='essay')opts=`<label>${x.type==='essay'?'اكتب إجابتك المقالية':'اكتب الإجابة الناقصة'}${x.type==='essay'?`<textarea id="v57-text-answer" rows="6" maxlength="4000">${E(typeof old==='string'?old:'')}</textarea>`:`<input id="v57-text-answer" maxlength="180" value="${E(typeof old==='string'?old:'')}">`}</label>`;
 if(x.type==='matching'||x.type==='ordering'){
  const values=x.type==='matching'?x.rights:x.items;const labels=x.type==='matching'?x.lefts:Array.from({length:values.length},(_,j)=>`الموضع ${j+1}`);
  opts=`<p>اختر إجابة مختلفة لكل ${x.type==='matching'?'كلمة':'موضع'}.</p>${labels.map((l,j)=>`<label class="v57-order-line"><span>${E(l)}</span><select class="v57-choice" data-slot="${j}"><option value="">اختر</option>${values.map((v,k)=>`<option value="${k}" ${old?.[j]===k?'selected':''}>${E(v)}</option>`).join('')}</select></label>`).join('')}`;
 }
 return `${title(q.title,`سؤال ${i+1} من ${questions.length} — ${types[x.type]||''}`)}<section class="v22-card v57-question" style="max-width:840px;margin:auto"><div class="v22-progress"><b style="width:${Math.round((i+1)*100/questions.length)}%"></b></div><h2>${E(x.question)}</h2>${opts}<p class="v57-small">${x.type==='essay'?'سيُراجع المعلم أو الإدارة إجابتك لاحقًا.':'لا تظهر الإجابة الصحيحة قبل التسليم.'}</p><button type="button" class="v22-btn v22-primary" data-action="v57-next">${i===questions.length-1?'تسليم الاختبار':'السؤال التالي'}</button></section>`;
}
function reportUI(state,title){const result=state.quizSavedResult;if(!state.quizSaved||!result)return `<div class="v22-card">لا توجد نتيجة محفوظة بعد، حاول التسليم مجددًا.</div>`;const review=Array.isArray(state.quizReview)?state.quizReview:[];return `${title('نتيجة الاختبار التفاعلي',result.status==='pending_review'?'هناك أسئلة مقالية تنتظر التصحيح':'تم تصحيح الإجابات وحفظ النتيجة')}<section class="v22-card v57-result"><h2>${result.percentage===null?'التصحيح قيد المراجعة':E(result.percentage)+'%'}</h2><p>إجابات صحيحة مؤكدة: ${E(result.score)} من ${E(result.questions)}</p>${result.pendingEssays?`<p role="status">${E(result.pendingEssays)} سؤال مقالي ينتظر تصحيح المعلم أو الإدارة. الدرجة النهائية لم تُحتسب بعد.</p>`:''}${review.map((x,i)=>`<div class="v22-report"><strong>${i+1} — ${E(x.question)}</strong><p>${x.isCorrect===null?'بانتظار تصحيح المقال':x.isCorrect?'✓ إجابة صحيحة':'✕ إجابة غير صحيحة'}</p><p>إجابتك: ${E(Array.isArray(x.selected)?x.selected.join(' — '):typeof x.selected==='boolean'?(x.selected?'صحيح':'خطأ'):x.selected??'—')}</p>${x.correct!==null&&x.correct!==undefined?`<p>الإجابة الصحيحة: ${E(Array.isArray(x.correct)?x.correct.join(' — '):typeof x.correct==='boolean'?(x.correct?'صحيح':'خطأ'):x.correct)}</p>`:''}</div>`).join('')}</section>`;}
async function saveScore(state,post,read,notify){const q=state.quiz;if(!q||state.quizSaved) return;const response=await post('v57/submit',{lessonId:state.id,quizId:q.id,teacherId:q.teacherId||'',sourceType:q.sourceType,sourceVersion:q.sourceVersion,attemptId:state.quizAttemptId,answers:state.answers});if(!response?.result)throw Error('تعذر حفظ الاختبار على الخادم');state.quizSaved=true;state.quizSavedResult=response.result;state.quizReview=response.review||[];
 state.profile=state.profile||{};state.profile.quizResultsV22=state.profile.quizResultsV22||{};state.profile.quizResultsV22[q.id]=response.result;try{state.profile=await read('studentProfilesV3/'+state.user.uid)}catch{};notify();}
async function click(el,ctx){const action=el.dataset.action,s=ctx.state;
 if(action==='v57-sample'){const textarea=document.querySelector('#v57-create [name=questions]');if(!textarea)return;if(textarea.value.trim()&&!confirm('استبدال الأسئلة الموجودة بمثال تجريبي؟'))return;textarea.value=JSON.stringify(demo,null,2);document.getElementById('v57-added').textContent='تم إدراج 6 أسئلة تجريبية. غيّرها قبل النشر.';return;}
 if(action==='v57-add'){
  const value=id=>document.getElementById(id)?.value.trim()||'';
  const type=value('v57-kind'),question=value('v57-new-question');if(!question)throw Error('أدخل نص السؤال أولًا');
  const data={type,question};const parts=v=>v.split('|').map(s=>s.trim()).filter(Boolean);
  if(type==='true_false')data.correctAnswer=value('v57-bool')==='true';
  if(type==='fill_blank')data.acceptedAnswers=parts(value('v57-fill'));
  if(type==='matching')data.pairs=value('v57-pairs').split('\n').filter(s=>s.trim()).map(s=>{const ix=s.indexOf('=');if(ix<0)throw Error('أدخل أزواج التوصيل بصيغة: الكلمة = المعنى');return {left:s.slice(0,ix).trim(),right:s.slice(ix+1).trim()}});
  if(type==='ordering')data.items=parts(value('v57-order'));
  if(type==='essay')data.rubric=value('v57-rubric');
  if(type==='multiple_choice'){data.options=parts(value('v57-options'));data.correctAnswer=Number(value('v57-correct'));}
  if(type==='fill_blank'&&!data.acceptedAnswers.length||type==='matching'&&data.pairs.length<2||type==='ordering'&&data.items.length<2||type==='essay'&&!data.rubric||type==='multiple_choice'&&data.options.length<2)throw Error('أكمل بيانات نوع السؤال المختار');
  const area=document.querySelector('#v57-create [name=questions]');let items=[];if(area.value.trim()){try{items=JSON.parse(area.value)}catch{throw Error('صحح JSON قبل إضافة سؤال جديد')}}if(!Array.isArray(items))throw Error('الأسئلة يجب أن تكون مصفوفة JSON');if(items.length>=60)throw Error('الحد الأقصى 60 سؤالًا');items.push(data);area.value=JSON.stringify(items,null,2);document.getElementById('v57-added').textContent='أُضيف السؤال رقم '+items.length+'. يمكنك إضافة سؤال آخر أو النشر.';document.getElementById('v57-new-question').value='';return;
 }

 if(action==='v57-answer'){s.answers[s.quizIndex]=JSON.parse(el.dataset.answer);return ctx.render();}
 if(action==='v57-next'){
  const item=s.quiz?.questions[s.quizIndex];if(!item)return;let answer=s.answers[s.quizIndex];
  if(item.type==='essay'||item.type==='fill_blank')answer=document.getElementById('v57-text-answer')?.value.trim();
  if(item.type==='ordering'||item.type==='matching'){
   const values=[...document.querySelectorAll('.v57-choice')].map(x=>x.value);if(values.some(x=>x==='')||new Set(values).size!==values.length)throw Error('اختر قيمة مختلفة لكل خانة');answer=values.map(Number);
  }
  if(answer===undefined||answer===null||typeof answer==='string'&&answer.length<(item.type==='essay'?2:1))throw Error('أكمل الإجابة قبل المتابعة');
  s.answers[s.quizIndex]=answer;
  if(s.quizIndex===s.quiz.questions.length-1){await ctx.saveScore();s.quizIndex++;}else s.quizIndex++;
  return ctx.render();
 }
 if(action==='v57-pending'){
  try{const result=await ctx.request('v57/pending');pending=Array.isArray(result.items)?result.items:[];pendingReady=true;pendingError='';}catch(e){pendingError=e.message||'تعذر جلب المراجعات';}
  const panel=document.getElementById('v57-pending-panel');if(panel)panel.innerHTML=renderPending();return;
 }
}
async function submit(form,ctx){if(form.id==='v57-create'){
 const fd=new FormData(form),lessonId=String(fd.get('lessonId')||''),quizId=String(fd.get('quizId')||''),title=String(fd.get('title')||'').trim();let questions;
 try{questions=JSON.parse(fd.get('questions'));}catch{throw Error('صيغة JSON غير صحيحة');}
 if(!Array.isArray(questions)||questions.length<1||questions.length>60)throw Error('الأسئلة يجب أن تكون مصفوفة من 1 إلى 60 سؤالًا');
 const result=await ctx.post('v57/create',{lessonId,title,questions,...(quizId?{quizId}:{})});ctx.toast(result.pending?'تم إرسال الاختبار التفاعلي للموافقة':quizId?'تم حفظ تعديلات الاختبار التفاعلي':'تم نشر الاختبار التفاعلي');return ctx.refresh();
 }
 if(form.hasAttribute('data-v57-grade')){
 const fd=new FormData(form),item=pending.find(x=>x.attemptId===fd.get('attemptId'));if(!item)throw Error('المراجعة غير متاحة');const marks=(item.essays||[]).map((_,i)=>{const v=fd.get('mark-'+i);if(v!=='0'&&v!=='1')throw Error('اختر تقييم كل إجابة مقالية');return Number(v);});
 await ctx.post('v57/grade',{attemptId:item.attemptId,teacherId:item.teacherId,marks});pending=pending.filter(x=>x.attemptId!==item.attemptId);pendingReady=true;ctx.toast('تم اعتماد تصحيح المقالات');const panel=document.getElementById('v57-pending-panel');if(panel)panel.innerHTML=renderPending();
 }
}
document.addEventListener('change',e=>{if(e.target?.id!=='v57-kind')return;const current=e.target.value;document.querySelectorAll('.v57-builder-extra').forEach(el=>{el.hidden=el.dataset.for!==current;});});
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-action="v57-add"]'))document.querySelector('#v57-create details[open]')?.setAttribute('open','');});
window.EgtazV57={editor,quizUI,reportUI,normalizeClient,saveScore,click,submit};
})();
