(() => {
'use strict';
if(!window.AcademyBackend||!window.ACADEMY_BACKEND_CONFIG)return;
const session=window.AcademyRoleSession?.get('admin');if(!session)return;
const auth=session.auth,db=session.db,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ask=opts=>window.AcademyUI?.confirm?window.AcademyUI.confirm(opts):Promise.resolve(confirm(opts?.message||opts?.title||'تأكيد؟'));
let user=null,data={lessons:{},quizzes:{},customSubjects:{},archive:{},audit:{}},archiveFilter='all',transferKind='',transferIds=[],stops=[];
const stageNames={primary:'ابتدائي',prep:'إعدادي',sec:'ثانوي'};
const defaults={
 primary:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['religion','التربية الدينية']],
 prep:[['arabic','اللغة العربية'],['math','الرياضيات'],['science','العلوم'],['english','اللغة الإنجليزية'],['social','الدراسات الاجتماعية'],['computer','الحاسب الآلي']],
 sec:[['arabic','اللغة العربية'],['english','اللغة الإنجليزية'],['math','الرياضيات'],['physics','الفيزياء'],['chemistry','الكيمياء'],['biology','الأحياء'],['history','التاريخ'],['geography','الجغرافيا']]
};
const vals=o=>Object.entries(o||{}).map(([id,v])=>({id,...(v||{})}));
const gradeCount=s=>s==='primary'?6:3;
const typeName=t=>t==='azhar'?'أزهر':'عام';
const gradeName=(s,g)=>'الصف '+g+' '+(stageNames[s]||s||'');
const now=()=>Date.now();
function toast(m,t='success'){window.AcademyUI?.toast?.(m,t)}
function clone(v){return JSON.parse(JSON.stringify(v??null))}
function subjectRows(stage,grade,type){
 const map=new Map((defaults[stage]||[]).map(([id,name])=>[id,{id,name}]));
 const custom=data.customSubjects?.[stage]?.[String(grade)],arr=Array.isArray(custom)?custom:Object.values(custom||{});
 arr.forEach(x=>{if(x?.id&&x?.name&&(!x.type||x.type===type))map.set(String(x.id),{id:String(x.id),name:x.name})});
 [...vals(data.lessons),...vals(data.quizzes)].forEach(x=>{if(x.stage===stage&&String(x.grade)===String(grade)&&x.type===type&&x.subject&&!map.has(String(x.subject)))map.set(String(x.subject),{id:String(x.subject),name:String(x.subject)})});
 return [...map.values()];
}
function fillGrades(select,stage,keep){
 if(!select)return;const rows=Array.from({length:gradeCount(stage)},(_,i)=>String(i+1));select.innerHTML=rows.map(g=>'<option value="'+g+'">الصف '+g+'</option>').join('');if(keep&&rows.includes(String(keep)))select.value=String(keep);
}
function fillSubjects(select,stage,grade,type,keep){
 if(!select)return;const rows=subjectRows(stage,grade,type);select.innerHTML=rows.length?rows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join(''):'<option value="">لا توجد مواد</option>';if(keep&&rows.some(x=>x.id===keep))select.value=keep;
}
function bindScope(prefix){
 const type=$(prefix+'Type'),stage=$(prefix+'Stage'),grade=$(prefix+'Grade'),subject=$(prefix+'Subject');if(!type||!stage||!grade||!subject)return;if(type.dataset.contentOpsBound==='1'){fillGrades(grade,stage.value,grade.value||'1');fillSubjects(subject,stage.value,grade.value,type.value,subject.value);return}type.dataset.contentOpsBound='1';
 const syncGrade=()=>{const old=grade.value;fillGrades(grade,stage.value,old);fillSubjects(subject,stage.value,grade.value,type.value,subject.value);refreshPreview()};
 const syncSubject=()=>{fillSubjects(subject,stage.value,grade.value,type.value,subject.value);refreshPreview()};
 type.addEventListener('change',syncSubject);stage.addEventListener('change',syncGrade);grade.addEventListener('change',syncSubject);
 fillGrades(grade,stage.value,grade.value||'1');fillSubjects(subject,stage.value,grade.value,type.value,subject.value);
}
async function audit(action,entity,entityId,meta={}){
 if(!user?.uid)return;const ts=now(),key=ts+'-'+Math.random().toString(36).slice(2,9);
 await db.ref('auditLogV4/'+key).set({uid:user.uid,action,entity,entityId:entityId||'',meta,at:ts,createdAt:ts}).catch(()=>{});
}
function quizBankStatus(q,ts=Date.now()){if(q?.workflowStatus==='draft')return'draft';if(q?.isHidden)return'hidden';if(Number(q?.publishAt||0)>ts)return'scheduled';return'approved'}
function quizBank(quizId,q,updates,ts){
 (Array.isArray(q.questions)?q.questions:[]).forEach((item,i)=>{
  const bankId='quiz-'+quizId+'-'+i;
  updates['questionBankV4/'+bankId]={id:bankId,question:item.text||item.question||'',options:item.opts||item.options||[],correctAnswer:Number(item.correctAnswer||0),explanation:item.explanation||'',skill:item.skill||'',difficulty:Number(item.difficulty||2),type:q.type,stage:q.stage,grade:String(q.grade),subject:q.subject,unit:Number(q.unit||0),lessonId:q.lessonId||'',sourceQuizId:quizId,authorUid:user?.uid||'',authorRole:'admin',status:quizBankStatus(q,ts),createdAt:ts,updatedAt:ts};
 });
}
function scope(prefix){
 return{type:$(prefix+'Type')?.value||'public',stage:$(prefix+'Stage')?.value||'primary',grade:String($(prefix+'Grade')?.value||'1'),subject:$(prefix+'Subject')?.value||''};
}
function packageFor(sc,unitRaw=''){
 const unit=Number(unitRaw||0),useUnit=!!String(unitRaw||'').trim();
 const lessons=vals(data.lessons).filter(x=>x.type===sc.type&&x.stage===sc.stage&&String(x.grade)===sc.grade&&x.subject===sc.subject&&(!useUnit||Number(x.unit||1)===unit));
 const lessonIds=new Set(lessons.map(x=>x.id));
 const quizzes=vals(data.quizzes).filter(x=>x.type===sc.type&&x.stage===sc.stage&&String(x.grade)===sc.grade&&x.subject===sc.subject&&(!useUnit||(x.lessonId?lessonIds.has(String(x.lessonId)):Number(x.unit||0)===unit)));
 const subjectMeta=subjectRows(sc.stage,sc.grade,sc.type).find(x=>x.id===sc.subject)||{id:sc.subject,name:sc.subject};
 return{version:1,kind:'academy-content-package',exportedAt:now(),scope:{...sc,unit:useUnit?unit:null},subject:subjectMeta,lessons:lessons.map(x=>{const y=clone(x);y.sourceId=y.id;delete y.id;return y}),quizzes:quizzes.map(x=>{const y=clone(x);y.sourceId=y.id;delete y.id;return y})};
}
function exportJson(){
 const pkg=packageFor(scope('export'),$('exportUnit')?.value||'');const text=JSON.stringify(pkg,null,2);$('contentExportPreview').textContent=JSON.stringify({version:pkg.version,scope:pkg.scope,subject:pkg.subject,lessons:pkg.lessons.length,quizzes:pkg.quizzes.length,exportedAt:new Date(pkg.exportedAt).toLocaleString('ar-EG')},null,2);return{text,pkg};
}
function refreshPreview(){if($('contentExportPreview'))exportJson()}
function downloadText(name,text){
 const blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importPackage(e){
 e.preventDefault();const raw=$('contentImportJson').value.trim(),btn=e.submitter;if(!raw)return toast('اختر ملف JSON أو الصق الحزمة أولًا.','error');
 let pkg;try{pkg=JSON.parse(raw)}catch{return toast('ملف JSON غير صالح.','error')}
 if(!pkg||!Array.isArray(pkg.lessons)||!Array.isArray(pkg.quizzes))return toast('هذه ليست حزمة محتوى صالحة.','error');
 try{if(window.AcademyUtils?.validateQuestions){pkg.lessons=pkg.lessons.map(x=>({...x,questions:Array.isArray(x.questions)&&x.questions.length?window.AcademyUtils.validateQuestions(x.questions):[]}));pkg.quizzes=pkg.quizzes.map(x=>({...x,questions:window.AcademyUtils.validateQuestions(x.questions||[])}));if(pkg.quizzes.some(x=>!x.questions.length))throw Error('يوجد اختبار بلا أسئلة')}}catch(err){return toast(err.message||'الحزمة تحتوي أسئلة غير صالحة.','error')}
 const sc=scope('import'),updates={},map=new Map(),ts=now();window.AcademyUI?.setButtonLoading(btn,true,'استيراد');
 try{
  for(const src of pkg.lessons){
   const id=db.ref('lessons').push().key,mapKey=String(src.sourceId||src.id||'');if(mapKey)map.set(mapKey,id);
   const item={...clone(src),type:sc.type,stage:sc.stage,grade:sc.grade,subject:sc.subject,isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts,importSourceId:mapKey};delete item.id;delete item.sourceId;delete item.publishedAt;delete item.reviewedAt;delete item.reviewedBy;updates['lessons/'+id]=item;
  }
  for(const src of pkg.quizzes){
   const id=db.ref('quizzes').push().key,oldLesson=String(src.lessonId||''),item={...clone(src),type:sc.type,stage:sc.stage,grade:sc.grade,subject:sc.subject,isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts,importSourceId:String(src.sourceId||src.id||'')};delete item.id;delete item.sourceId;delete item.publishedAt;delete item.reviewedAt;delete item.reviewedBy;if(oldLesson)item.lessonId=map.get(oldLesson)||'';updates['quizzes/'+id]=item;quizBank(id,item,updates,ts);
  }
  await db.ref().update(updates);await audit('content.import','content','bulk',{lessons:pkg.lessons.length,quizzes:pkg.quizzes.length,target:sc});$('contentImportForm').reset();initScopes();toast('تم استيراد '+pkg.lessons.length+' درس و'+pkg.quizzes.length+' اختبار كمسودات ✅');
 }catch(err){console.error(err);toast('تعذر استيراد الحزمة.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
async function readImportFile(file){
 if(!file)return;if(file.size>2*1024*1024)return toast('ملف JSON أكبر من 2MB.','error');
 try{$('contentImportJson').value=await file.text();toast('تم تحميل ملف JSON إلى المحرر.')}catch{toast('تعذر قراءة الملف.','error')}
}
async function unitOperation(e){
 e.preventDefault();const src=scope('unitSource'),dst=scope('unitTarget'),sourceUnit=Math.max(1,Number($('unitSourceNumber').value||1)),targetUnit=Math.max(1,Number($('unitTargetNumber').value||1)),mode=$('unitOperationMode').value,includeQuizzes=$('unitIncludeQuizzes').checked,btn=e.submitter;
 const lessons=vals(data.lessons).filter(x=>x.type===src.type&&x.stage===src.stage&&String(x.grade)===src.grade&&x.subject===src.subject&&Number(x.unit||1)===sourceUnit);if(!lessons.length)return toast('لا توجد دروس في الوحدة المصدر.','error');
 const ids=new Set(lessons.map(x=>x.id)),effectiveInclude=includeQuizzes||mode==='move',quizzes=effectiveInclude?vals(data.quizzes).filter(q=>q.type===src.type&&q.stage===src.stage&&String(q.grade)===src.grade&&q.subject===src.subject&&(q.lessonId?ids.has(String(q.lessonId)):Number(q.unit||0)===sourceUnit)):[];
 const ok=await ask({title:(mode==='copy'?'نسخ':'نقل')+' الوحدة؟',message:'سيتم '+(mode==='copy'?'نسخ':'نقل')+' '+lessons.length+' درس'+(quizzes.length?' و'+quizzes.length+' اختبار':'')+' إلى '+typeName(dst.type)+' — '+gradeName(dst.stage,dst.grade)+'.',acceptText:mode==='copy'?'إنشاء النسخة':'نقل المحتوى'});if(!ok)return;
 window.AcademyUI?.setButtonLoading(btn,true,'تنفيذ');try{
  const updates={},map=new Map(),ts=now();
  if(mode==='copy'){
   for(const l of lessons){const id=db.ref('lessons').push().key;map.set(l.id,id);const item={...clone(l),type:dst.type,stage:dst.stage,grade:dst.grade,subject:dst.subject,unit:targetUnit,title:(l.title||'درس')+' — نسخة',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts};delete item.id;delete item.publishedAt;delete item.reviewedAt;delete item.reviewedBy;updates['lessons/'+id]=item}
   for(const q of quizzes){const id=db.ref('quizzes').push().key,item={...clone(q),type:dst.type,stage:dst.stage,grade:dst.grade,subject:dst.subject,unit:targetUnit,name:(q.name||'اختبار')+' — نسخة',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts};delete item.id;delete item.publishedAt;delete item.reviewedAt;delete item.reviewedBy;if(q.lessonId)item.lessonId=map.get(String(q.lessonId))||'';updates['quizzes/'+id]=item;quizBank(id,item,updates,ts)}
  }else{
   lessons.forEach(l=>{updates['lessons/'+l.id+'/type']=dst.type;updates['lessons/'+l.id+'/stage']=dst.stage;updates['lessons/'+l.id+'/grade']=dst.grade;updates['lessons/'+l.id+'/subject']=dst.subject;updates['lessons/'+l.id+'/unit']=targetUnit;updates['lessons/'+l.id+'/updatedAt']=ts});
   quizzes.forEach(q=>{updates['quizzes/'+q.id+'/type']=dst.type;updates['quizzes/'+q.id+'/stage']=dst.stage;updates['quizzes/'+q.id+'/grade']=dst.grade;updates['quizzes/'+q.id+'/subject']=dst.subject;updates['quizzes/'+q.id+'/unit']=targetUnit;updates['quizzes/'+q.id+'/updatedAt']=ts;(Array.isArray(q.questions)?q.questions:[]).forEach((_,i)=>{updates['questionBankV4/quiz-'+q.id+'-'+i+'/type']=dst.type;updates['questionBankV4/quiz-'+q.id+'-'+i+'/stage']=dst.stage;updates['questionBankV4/quiz-'+q.id+'-'+i+'/grade']=dst.grade;updates['questionBankV4/quiz-'+q.id+'-'+i+'/subject']=dst.subject;updates['questionBankV4/quiz-'+q.id+'-'+i+'/unit']=targetUnit;updates['questionBankV4/quiz-'+q.id+'-'+i+'/updatedAt']=ts})});
  }
  await db.ref().update(updates);await audit('unit.'+mode,'unit',src.subject+'-'+sourceUnit,{source:src,target:dst,sourceUnit,targetUnit,lessonCount:lessons.length,quizCount:quizzes.length});toast('تم '+(mode==='copy'?'نسخ':'نقل')+' الوحدة بنجاح ✅');
 }catch(err){console.error(err);toast('تعذر تنفيذ عملية الوحدة.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function selectedIds(kind){const selector=kind==='lessons'?'[data-select-lesson]:checked':'[data-select-quiz]:checked';return [...document.querySelectorAll(selector)].map(x=>kind==='lessons'?x.dataset.selectLesson:x.dataset.selectQuiz).filter(Boolean)}
function openTransfer(kind){
 transferKind=kind;transferIds=selectedIds(kind);if(!transferIds.length)return toast('حدد محتوى أولًا.','error');
 $('contentTransferKind').value=kind==='lessons'?'دروس':'اختبارات';$('contentTransferTitle').textContent=(kind==='lessons'?'نقل/نسخ الدروس المحددة':'نقل/نسخ الاختبارات المحددة');$('contentTransferSummary').innerHTML='<span>'+transferIds.length+' عنصر محدد</span><span>النسخ = مسودة آمنة</span>';$('contentTransferLinkedWrap').classList.toggle('hidden',kind!=='lessons');
 initTransferScope();const modal=$('contentTransferModal');modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function closeTransfer(){const modal=$('contentTransferModal');if(!modal)return;modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';transferIds=[]}
function initTransferScope(){
 fillGrades($('contentTransferGrade'),$('contentTransferStage').value,$('contentTransferGrade').value||'1');fillSubjects($('contentTransferSubject'),$('contentTransferStage').value,$('contentTransferGrade').value,$('contentTransferType').value,$('contentTransferSubject').value);
}
async function transferSelected(e){
 e.preventDefault();if(!transferIds.length)return;const mode=$('contentTransferMode').value,dst=scope('contentTransfer'),unit=Math.max(0,Number($('contentTransferUnit').value||1)),includeLinked=transferKind==='lessons'&&(mode==='move'||$('contentTransferLinked').checked),btn=e.submitter;
 const ok=await ask({title:(mode==='copy'?'نسخ':'نقل')+' المحتوى المحدد؟',message:'سيتم تنفيذ العملية على '+transferIds.length+' عنصر إلى '+typeName(dst.type)+' — '+gradeName(dst.stage,dst.grade)+'.',acceptText:'تنفيذ'});if(!ok)return;
 window.AcademyUI?.setButtonLoading(btn,true,'تنفيذ');try{
  const updates={},ts=now(),map=new Map();
  if(transferKind==='lessons'){
   const lessons=transferIds.map(id=>({id,...(data.lessons[id]||{})})).filter(x=>x.title);
   const linked=includeLinked?vals(data.quizzes).filter(q=>q.lessonId&&transferIds.includes(String(q.lessonId))):[];
   if(mode==='copy'){
    lessons.forEach(l=>{const id=db.ref('lessons').push().key;map.set(l.id,id);const item={...clone(l),type:dst.type,stage:dst.stage,grade:dst.grade,subject:dst.subject,unit:Math.max(1,unit),title:(l.title||'درس')+' — نسخة',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts};delete item.id;delete item.publishedAt;updates['lessons/'+id]=item});
    linked.forEach(q=>{const id=db.ref('quizzes').push().key,item={...clone(q),type:dst.type,stage:dst.stage,grade:dst.grade,subject:dst.subject,unit:Math.max(1,unit),name:(q.name||'اختبار')+' — نسخة',lessonId:map.get(String(q.lessonId))||'',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts};delete item.id;delete item.publishedAt;updates['quizzes/'+id]=item;quizBank(id,item,updates,ts)});
   }else{
    lessons.forEach(l=>{updates['lessons/'+l.id+'/type']=dst.type;updates['lessons/'+l.id+'/stage']=dst.stage;updates['lessons/'+l.id+'/grade']=dst.grade;updates['lessons/'+l.id+'/subject']=dst.subject;updates['lessons/'+l.id+'/unit']=Math.max(1,unit);updates['lessons/'+l.id+'/updatedAt']=ts});
    linked.forEach(q=>{updates['quizzes/'+q.id+'/type']=dst.type;updates['quizzes/'+q.id+'/stage']=dst.stage;updates['quizzes/'+q.id+'/grade']=dst.grade;updates['quizzes/'+q.id+'/subject']=dst.subject;updates['quizzes/'+q.id+'/unit']=Math.max(1,unit);updates['quizzes/'+q.id+'/updatedAt']=ts;(Array.isArray(q.questions)?q.questions:[]).forEach((_,i)=>{updates['questionBankV4/quiz-'+q.id+'-'+i+'/type']=dst.type;updates['questionBankV4/quiz-'+q.id+'-'+i+'/stage']=dst.stage;updates['questionBankV4/quiz-'+q.id+'-'+i+'/grade']=dst.grade;updates['questionBankV4/quiz-'+q.id+'-'+i+'/subject']=dst.subject;updates['questionBankV4/quiz-'+q.id+'-'+i+'/unit']=Math.max(1,unit)})});
   }
  }else{
   const quizzes=transferIds.map(id=>({id,...(data.quizzes[id]||{})})).filter(x=>x.name);
   if(mode==='copy'){
    quizzes.forEach(q=>{const id=db.ref('quizzes').push().key,item={...clone(q),type:dst.type,stage:dst.stage,grade:dst.grade,subject:dst.subject,unit,name:(q.name||'اختبار')+' — نسخة',lessonId:'',isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,createdAt:ts,updatedAt:ts};delete item.id;delete item.publishedAt;updates['quizzes/'+id]=item;quizBank(id,item,updates,ts)});
   }else{
    quizzes.forEach(q=>{updates['quizzes/'+q.id+'/type']=dst.type;updates['quizzes/'+q.id+'/stage']=dst.stage;updates['quizzes/'+q.id+'/grade']=dst.grade;updates['quizzes/'+q.id+'/subject']=dst.subject;updates['quizzes/'+q.id+'/unit']=unit;updates['quizzes/'+q.id+'/lessonId']='';updates['quizzes/'+q.id+'/updatedAt']=ts;(Array.isArray(q.questions)?q.questions:[]).forEach((_,i)=>{updates['questionBankV4/quiz-'+q.id+'-'+i+'/type']=dst.type;updates['questionBankV4/quiz-'+q.id+'-'+i+'/stage']=dst.stage;updates['questionBankV4/quiz-'+q.id+'-'+i+'/grade']=dst.grade;updates['questionBankV4/quiz-'+q.id+'-'+i+'/subject']=dst.subject;updates['questionBankV4/quiz-'+q.id+'-'+i+'/unit']=unit;updates['questionBankV4/quiz-'+q.id+'-'+i+'/lessonId']=''})});
   }
  }
  await db.ref().update(updates);await audit('content.transfer_'+mode,transferKind,'bulk',{count:transferIds.length,target:dst,unit,includeLinked});toast('تم '+(mode==='copy'?'نسخ':'نقل')+' المحتوى المحدد ✅');closeTransfer();
 }catch(err){console.error(err);toast('تعذر تنفيذ النقل/النسخ.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
function archiveRows(){
 const out=[];Object.entries(data.archive||{}).forEach(([kind,items])=>Object.entries(items||{}).forEach(([id,v])=>out.push({archiveKind:kind,id,...(v||{})})));
 return out.sort((a,b)=>Number(b.archivedAt||0)-Number(a.archivedAt||0));
}
function renderArchive(){
 const box=$('contentArchiveList');if(!box)return;const rows=archiveRows().filter(x=>archiveFilter==='all'||x.archiveKind===archiveFilter);
 box.innerHTML=rows.length?rows.slice(0,80).map(x=>'<article class="content-ops-item"><div class="content-ops-item-top"><div><strong>'+esc(x.title||x.data?.title||x.data?.name||'محتوى')+'</strong><small>'+(x.archiveKind==='lesson'?'درس':'اختبار')+' • '+new Date(Number(x.archivedAt||0)).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})+'</small></div><span class="workflow-badge archived"><i class="fa-solid fa-box-archive"></i> مؤرشف</span></div><div class="content-ops-meta"><span>'+esc(typeName(x.data?.type))+'</span><span>'+esc(gradeName(x.data?.stage,x.data?.grade))+'</span><span>'+esc(String(x.data?.subject||''))+'</span>'+(x.relatedQuizzes?'<span>'+Object.keys(x.relatedQuizzes).length+' اختبار مرتبط</span>':'')+'</div><div class="content-ops-item-actions"><button class="content-restore" type="button" data-restore-content="'+x.archiveKind+'|'+x.id+'"><i class="fa-solid fa-rotate-left"></i> استرجاع كمسودة</button><button class="content-delete-forever" type="button" data-delete-archive="'+x.archiveKind+'|'+x.id+'"><i class="fa-solid fa-trash"></i> حذف نهائي</button></div></article>').join(''):'<div class="content-ops-empty"><span>🗄️</span>الأرشيف فارغ في هذا القسم.</div>';
 box.querySelectorAll('[data-restore-content]').forEach(b=>b.onclick=()=>restoreArchive(b.dataset.restoreContent));
 box.querySelectorAll('[data-delete-archive]').forEach(b=>b.onclick=()=>deleteArchive(b.dataset.deleteArchive));
 document.querySelectorAll('[data-archive-filter]').forEach(b=>b.classList.toggle('active',b.dataset.archiveFilter===archiveFilter));
}
async function restoreArchive(key){
 const [kind,id]=String(key).split('|'),rec=data.archive?.[kind]?.[id];if(!rec?.data)return;
 const ok=await ask({title:'استرجاع المحتوى؟',message:'سيعود المحتوى كمسودة مخفية حتى تراجعه وتنشره يدويًا.',acceptText:'استرجاع'});if(!ok)return;
 try{
  const updates={},ts=now();if(kind==='lesson'){
   const targetId=data.lessons[id]?db.ref('lessons').push().key:id,item={...clone(rec.data),isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,updatedAt:ts};updates['lessons/'+targetId]=item;
   Object.entries(rec.relatedQuizzes||{}).forEach(([qid,q])=>{const targetQ=data.quizzes[qid]?db.ref('quizzes').push().key:qid,quiz={...clone(q),lessonId:targetId,isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,updatedAt:ts};updates['quizzes/'+targetQ]=quiz;quizBank(targetQ,quiz,updates,ts)});
  }else{
   const targetId=data.quizzes[id]?db.ref('quizzes').push().key:id,item={...clone(rec.data),isHidden:true,workflowStatus:'draft',reviewStatus:'draft',publishAt:null,updatedAt:ts};updates['quizzes/'+targetId]=item;quizBank(targetId,item,updates,ts);
  }
  updates['contentArchiveV1/'+kind+'/'+id]=null;await db.ref().update(updates);await audit('content.restore',kind,id,{restoredAsDraft:true});toast('تم استرجاع المحتوى كمسودة ✅');
 }catch(err){console.error(err);toast('تعذر استرجاع المحتوى.','error')}
}
async function deleteArchive(key){
 const [kind,id]=String(key).split('|'),rec=data.archive?.[kind]?.[id];if(!rec)return;
 const ok=await ask({title:'حذف نهائي من الأرشيف؟',message:'هذه الخطوة لا يمكن التراجع عنها.',tone:'danger',acceptText:'حذف نهائي'});if(!ok)return;
 await db.ref('contentArchiveV1/'+kind+'/'+id).remove();await audit('content.delete_forever',kind,id,{title:rec.title||''});toast('تم الحذف النهائي من الأرشيف');
}
function actionLabel(a=''){
 const map={'lesson.create':'إنشاء درس','lesson.update':'تعديل درس','lesson.archive':'أرشفة درس','quiz.create':'إنشاء اختبار','quiz.update':'تعديل اختبار','quiz.archive':'أرشفة اختبار','content.restore':'استرجاع من الأرشيف','content.delete_forever':'حذف نهائي','content.import':'استيراد محتوى','content.transfer_copy':'نسخ متقدم','content.transfer_move':'نقل متقدم','unit.copy':'نسخ وحدة','unit.move':'نقل وحدة','lesson.bulk_duplicate':'نسخ دروس','quiz.bulk_duplicate':'نسخ اختبارات','content.schedule_publish':'جدولة نشر','content.publish_now':'نشر محتوى'};return map[a]||a||'عملية محتوى';
}
function renderAudit(){
 const box=$('contentAuditList');if(!box)return;const rows=vals(data.audit).filter(x=>/(lesson|quiz|content|unit)/.test(String(x.action||'')+' '+String(x.entity||''))).sort((a,b)=>Number(b.at||b.createdAt||0)-Number(a.at||a.createdAt||0)).slice(0,60);
 box.innerHTML=rows.length?rows.map(x=>'<article class="content-ops-item"><div class="content-ops-item-top"><div><strong>'+esc(actionLabel(x.action))+'</strong><small>'+new Date(Number(x.at||x.createdAt||0)).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})+'</small></div><span class="workflow-badge draft">'+esc(x.entity||'content')+'</span></div><div class="content-ops-meta"><span>ID: '+esc(x.entityId||'—')+'</span>'+(x.meta?.count?'<span>'+Number(x.meta.count)+' عنصر</span>':'')+(x.meta?.subject?'<span>'+esc(x.meta.subject)+'</span>':'')+'</div></article>').join(''):'<div class="content-ops-empty"><span>🧾</span>لا توجد عمليات محتوى مسجلة بعد.</div>';
}
function renderStats(){
 const lessons=vals(data.lessons),quizzes=vals(data.quizzes),drafts=[...lessons,...quizzes].filter(x=>x.workflowStatus==='draft').length,scheduled=[...lessons,...quizzes].filter(x=>!x.isHidden&&Number(x.publishAt||0)>now()).length,arch=archiveRows().length,aud=vals(data.audit).filter(x=>/(lesson|quiz|content|unit)/.test(String(x.action||'')+' '+String(x.entity||''))).length;
 if($('contentOpsDraftCount'))$('contentOpsDraftCount').textContent=drafts;if($('contentOpsScheduledCount'))$('contentOpsScheduledCount').textContent=scheduled;if($('contentOpsArchiveCount'))$('contentOpsArchiveCount').textContent=arch;if($('contentOpsAuditCount'))$('contentOpsAuditCount').textContent=aud;if($('contentOpsHeroDrafts'))$('contentOpsHeroDrafts').textContent=drafts;if($('contentOpsHeroArchive'))$('contentOpsHeroArchive').textContent=arch;
 const badge=$('contentOpsBadge');if(badge){badge.textContent=drafts+scheduled;badge.classList.toggle('hidden',drafts+scheduled===0)}
}
function render(){renderStats();renderArchive();renderAudit();refreshPreview()}
function initScopes(){
 ['unitSource','unitTarget','export','import'].forEach(bindScope);initTransferScope();
}
function bind(){
 initScopes();
 $('contentExportForm')?.addEventListener('submit',e=>{e.preventDefault();const {text,pkg}=exportJson(),unit=pkg.scope.unit?'unit-'+pkg.scope.unit:'all';downloadText('academy-'+pkg.scope.subject+'-'+unit+'-'+new Date().toISOString().slice(0,10)+'.json',text);audit('content.export','content',pkg.scope.subject,{lessons:pkg.lessons.length,quizzes:pkg.quizzes.length,scope:pkg.scope});toast('تم تجهيز ملف التصدير ✅')});
 $('copyExportJson')?.addEventListener('click',async()=>{const {text}=exportJson();try{await navigator.clipboard.writeText(text);toast('تم نسخ JSON ✅')}catch{const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('تم نسخ JSON ✅')}});
 $('contentImportFile')?.addEventListener('change',e=>readImportFile(e.target.files?.[0]));
 $('contentImportForm')?.addEventListener('submit',importPackage);
 $('unitOperationForm')?.addEventListener('submit',unitOperation);
 document.querySelectorAll('[data-archive-filter]').forEach(b=>b.onclick=()=>{archiveFilter=b.dataset.archiveFilter;renderArchive()});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-content-transfer]');if(b){e.preventDefault();openTransfer(b.dataset.contentTransfer)}});
 $('closeContentTransferModal')?.addEventListener('click',closeTransfer);$('contentTransferModal')?.addEventListener('click',e=>{if(e.target===$('contentTransferModal'))closeTransfer()});$('contentTransferForm')?.addEventListener('submit',transferSelected);
 $('contentTransferType')?.addEventListener('change',initTransferScope);$('contentTransferStage')?.addEventListener('change',initTransferScope);$('contentTransferGrade')?.addEventListener('change',initTransferScope);
 ['exportUnit','unitSourceNumber','unitTargetNumber'].forEach(id=>$(id)?.addEventListener('input',refreshPreview));
}
function listen(path,key){
 const ref=db.ref(path),handler=s=>{data[key]=s.val()||{};if(['lessons','quizzes','customSubjects'].includes(key))initScopes();render()};ref.on('value',handler);stops.push(()=>ref.off('value',handler));
}
auth.onAuthStateChanged(async u=>{
 stops.splice(0).forEach(fn=>fn());user=u;if(!u)return;
 try{
  if(u.role!=='admin')return;bind();
  listen('lessons','lessons');listen('quizzes','quizzes');listen('customSubjects','customSubjects');listen('contentArchiveV1','archive');listen('auditLogV4','audit');
 }catch(err){console.warn('Content operations unavailable',err)}
});
window.addEventListener('pagehide',()=>stops.splice(0).forEach(fn=>fn()));
})();