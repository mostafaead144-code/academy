(() => {
'use strict';
if(!window.AcademyBackend||!AcademyBackend.apps.length)return;
const auth=AcademyBackend.auth(),db=AcademyBackend.database(),C=window.AcademyCore,$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let user=null,subs={},editing='';
function label(s){return s==='approved'?'معتمد':s==='rejected'?'مرفوض':s==='changes_requested'?'يحتاج تعديل':'قيد المراجعة'}
function cls(s){return ['approved','rejected','changes_requested'].includes(s)?s:'pending'}
function rows(){return Object.entries(subs||{}).map(([id,v])=>({id,...(v||{})})).filter(x=>['student_question','student_forum_post'].includes(x.kind)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))}
function hrefFor(x){
 if(x.kind==='student_question')return './lesson.html?'+new URLSearchParams({type:x.type||'public',stage:x.stage||'',grade:String(x.grade||''),subject:x.subject||'',id:x.lessonId||''}).toString()+'#lessonCommunication';
 return './community.html';
}
function mount(){
 if($('studentModerationRequests'))return;
 const anchor=document.querySelector('.notification-center-layout');if(!anchor)return;
 const card=document.createElement('section');card.id='studentModerationRequests';card.className='feature-card comm-card';card.style.marginBottom='18px';
 card.innerHTML='<div class="comm-head"><div><span class="section-kicker">تحت مراجعة الإدارة</span><h3>طلبات التواصل التي أرسلتها</h3><p>هنا تعرف هل تم اعتماد سؤالك أو منشورك، وهل الإدارة طلبت منك تعديلًا.</p></div><span>🛡️</span></div><div id="studentModerationList" class="comm-list"></div>';
 anchor.insertAdjacentElement('beforebegin',card);
}
function render(){
 mount();const box=$('studentModerationList');if(!box)return;const list=rows();
 box.innerHTML=list.length?list.slice(0,12).map(x=>'<article class="comm-item"><div class="comm-item-top"><div><strong>'+esc(x.kind==='student_question'?'سؤال في '+(x.lessonTitle||'درس'):'منشور: '+(x.title||''))+'</strong><small>'+new Date(Number(x.createdAt||Date.now())).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+'</small></div><span class="comm-status '+cls(x.status)+'">'+label(x.status)+'</span></div><p>'+esc(x.text||'')+'</p>'+(x.reviewNote?'<div class="comm-review-note"><b>ملاحظة الإدارة:</b> '+esc(x.reviewNote)+'</div>':'')+'<div class="comm-teacher-question-actions"><a class="btn btn-soft" href="'+esc(hrefFor(x))+'">فتح '+(x.kind==='student_question'?'الدرس':'المجتمع')+'</a>'+(x.status==='changes_requested'&&x.kind==='student_forum_post'?'<button class="comm-reply-btn" type="button" data-edit-forum="'+x.id+'"><i class="fa-solid fa-pen"></i> تعديل المنشور</button>':'')+'</div>'+(editing===x.id?'<form class="comm-teacher-reply-form" data-forum-edit="'+x.id+'"><input name="title" maxlength="120" required value="'+esc(x.title||'')+'" placeholder="العنوان"><textarea name="text" maxlength="1200" required>'+esc(x.text||'')+'</textarea><div style="display:flex;gap:8px"><button class="btn btn-primary" type="submit">إعادة الإرسال للإدارة</button><button class="btn btn-soft" type="button" data-cancel-forum-edit>إلغاء</button></div></form>':'')+'</article>').join(''):'<div class="comm-empty"><span>✅</span>ليس لديك طلبات تواصل مرسلة حاليًا.</div>';
 box.querySelectorAll('[data-edit-forum]').forEach(b=>b.onclick=()=>{editing=b.dataset.editForum;render()});
 box.querySelectorAll('[data-cancel-forum-edit]').forEach(b=>b.onclick=()=>{editing='';render()});
 box.querySelectorAll('[data-forum-edit]').forEach(f=>f.addEventListener('submit',resubmitForum));
}
async function resubmitForum(e){
 e.preventDefault();const id=e.currentTarget.dataset.forumEdit,row=subs[id];if(!row||row.status!=='changes_requested')return;
 const title=e.currentTarget.elements.title.value.trim(),text=e.currentTarget.elements.text.value.trim(),btn=e.submitter;if(title.length<3||text.length<5)return C?.toast?.('اكتب عنوانًا ومحتوى أوضح.','error');
 window.AcademyUI?.setButtonLoading(btn,true,'إعادة الإرسال');
 try{await db.ref('communicationSubmissionsV1/'+user.uid+'/'+id).update({title,text,status:'pending',reviewNote:'',resubmittedAt:Date.now(),updatedAt:Date.now()});editing='';C?.toast?.('تمت إعادة إرسال المنشور للإدارة ✅')}
 catch(err){console.error(err);C?.toast?.('تعذر إعادة الإرسال الآن.','error')}finally{window.AcademyUI?.setButtonLoading(btn,false)}
}
auth.onAuthStateChanged(u=>{
 user=u;if(!u)return;
 const ref=db.ref('communicationSubmissionsV1/'+u.uid),handler=s=>{subs=s.val()||{};render()};ref.on('value',handler);window.addEventListener('pagehide',()=>ref.off('value',handler),{once:true});
});
})();