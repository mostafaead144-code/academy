(() => {
'use strict';
const C=window.AcademyCore,$=id=>document.getElementById(id),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let user,profile,community={forums:{},studyGroups:{}},tab='forums';

function visiblePost(p){return p&&p.isHidden!==true&&!['removed','pending','rejected','changes_requested'].includes(p.status)}
function visibleGroup(g){
 return g&&g.isActive!==false&&
   (!g.type||g.type===profile.educationType)&&
   (!g.stage||g.stage===profile.stage)&&
   (!g.grade||String(g.grade)===String(profile.grade));
}
function posts(){return Object.entries(community.forums||{}).map(([id,v])=>({id,...(v||{})})).filter(visiblePost).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function groups(){return Object.entries(community.studyGroups||{}).map(([id,v])=>({id,...(v||{})})).filter(visibleGroup).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))}
function likeCount(p){return Object.keys(p.likesBy||{}).length}
function memberCount(g){return Object.keys(g.members||{}).length}
function isMember(g){return !!g.members?.[user.uid]}

function render(){
 const ps=posts(),gs=groups();
 $('postCount').textContent=ps.length;$('groupCount').textContent=gs.length;$('myGroupCount').textContent=gs.filter(isMember).length;
 $('forumFeed').classList.toggle('hidden',tab!=='forums');
 $('groupsFeed').classList.toggle('hidden',tab!=='groups');
 $('togglePostForm').classList.toggle('hidden',tab!=='forums');

 if(tab==='forums'){
  $('forumFeed').innerHTML=ps.length?ps.map(p=>{
   const liked=!!p.likesBy?.[user.uid],reported=!!p.reports?.[user.uid];
   return '<article class="community-post">'+
     '<div class="community-author"><span class="community-avatar">'+C.esc(C.initials(p.author||'طالب'))+'</span><div><strong>'+C.esc(p.author||'طالب')+'</strong><small>'+(p.createdAt?new Date(p.createdAt).toLocaleString('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'')+'</small></div></div>'+
     '<h3>'+C.esc(p.title||'')+'</h3><p>'+C.esc(p.content||'')+'</p>'+
     '<div class="community-actions">'+
       '<button class="'+(liked?'liked':'')+'" data-like-post="'+p.id+'" aria-pressed="'+(liked?'true':'false')+'" aria-label="'+(liked?'إلغاء الإعجاب':'الإعجاب')+' بالمنشور"><i class="'+(liked?'fa-solid':'fa-regular')+' fa-heart"></i> '+likeCount(p)+'</button>'+
       '<button data-report-post="'+p.id+'" '+(reported?'disabled':'')+'><i class="fa-regular fa-flag"></i> '+(reported?'تم الإبلاغ':'إبلاغ')+'</button>'+
     '</div></article>';
  }).join(''):'<div class="feature-empty"><span>💬</span><h3>لسه مفيش منشورات</h3><p>ابدأ بسؤال تعليمي أو فكرة مفيدة.</p></div>';
  $$('[data-like-post]').forEach(b=>b.onclick=()=>toggleLike(b.dataset.likePost,b));
  $$('[data-report-post]').forEach(b=>b.onclick=()=>reportPost(b.dataset.reportPost,b));
 }else{
  $('groupsFeed').innerHTML=gs.length?gs.map(g=>
    '<article class="community-post study-group-post"><div class="feature-card-head"><div><span class="section-kicker">مجموعة دراسة</span><h3>'+C.esc(g.name||'مجموعة')+'</h3><p>'+memberCount(g)+' عضو</p></div><span class="feature-card-icon violet"><i class="fa-solid fa-users"></i></span></div>'+
    '<div class="feature-meta"><span>'+C.esc(g.subjectName||'كل المواد')+'</span><span>'+C.esc(g.stage?C.stageLabel(g.stage):'كل المراحل')+'</span></div>'+
    '<button class="btn '+(isMember(g)?'btn-soft':'btn-primary')+'" data-group-action="'+g.id+'">'+(isMember(g)?'مغادرة المجموعة':'انضم للمجموعة')+'</button></article>'
  ).join(''):'<div class="feature-empty"><span>👥</span><h3>لا توجد مجموعات مناسبة لمرحلتك بعد</h3><p>عندما تنشئ الإدارة مجموعة مناسبة ستظهر هنا.</p></div>';
  $$('[data-group-action]').forEach(b=>b.onclick=()=>toggleGroup(b.dataset.groupAction,b));
 }
}

async function toggleLike(id,btn){
 if(!community.forums?.[id])return;
 btn.disabled=true;
 try{
   await C.db.ref('community/forums/'+id+'/likesBy/'+user.uid).transaction(current=>current?null:true);
 }catch(err){console.error(err);C.toast('تعذر تحديث الإعجاب الآن.','error')}
 finally{btn.disabled=false}
}
async function reportPost(id,btn){
 const approved=await window.AcademyUI.confirm({title:'إرسال بلاغ؟',message:'سيصل البلاغ إلى إدارة المنصة لمراجعة هذا المنشور.',tone:'warning',acceptText:'إرسال البلاغ'});
 if(!approved)return;
 btn.disabled=true;
 try{
   await C.db.ref('community/forums/'+id+'/reports/'+user.uid).set({createdAt:Date.now()});
   C.toast('تم إرسال البلاغ للإدارة.');
 }catch(err){console.error(err);btn.disabled=false;C.toast('تعذر إرسال البلاغ الآن.','error')}
}
async function toggleGroup(id,btn){
 const g=community.studyGroups?.[id]||{},ref=C.db.ref('community/studyGroups/'+id+'/members/'+user.uid);
 btn.disabled=true;
 try{
   if(g.members?.[user.uid])await ref.remove();
   else await ref.set({name:profile.name||user.displayName||'طالب',joinedAt:Date.now()});
 }catch(err){console.error(err);btn.disabled=false;C.toast('تعذر تحديث عضوية المجموعة الآن.','error')}
}

function setPostForm(open){
 $('newPostForm').classList.toggle('hidden',!open);
 $('togglePostForm').setAttribute('aria-expanded',open?'true':'false');
 if(open)setTimeout(()=>$('postTitle')?.focus(),30);
}
$('togglePostForm').onclick=()=>setPostForm($('newPostForm').classList.contains('hidden'));
$('cancelPost').onclick=()=>setPostForm(false);
$('postContent').addEventListener('input',()=>{$('postCharCount').textContent=$('postContent').value.length});

$('newPostForm').onsubmit=async e=>{
 e.preventDefault();
 const title=$('postTitle').value.trim(),content=$('postContent').value.trim(),btn=$('communityPostSubmitBtn')||e.submitter;
 if(title.length<3)return C.toast('اكتب عنوانًا أوضح للمنشور.','error');
 if(content.length<5)return C.toast('اكتب محتوى مفيدًا قبل النشر.','error');
 window.AcademyUI?.setButtonLoading(btn,true,'إرسال');
 try{
   await C.db.ref('community/forums').push({title,content,author:profile.name||user.displayName||'طالب',authorId:user.uid,createdAt:Date.now(),likesBy:{}});
   e.target.reset();$('postCharCount').textContent='0';setPostForm(false);C.toast('تم نشر منشورك ✨');
 }catch(err){console.error(err);C.toast('تعذر إرسال المنشور للمراجعة الآن.','error')}
 finally{window.AcademyUI?.setButtonLoading(btn,false)}
};

$$('[data-community-tab]').forEach(b=>b.onclick=()=>{
 tab=b.dataset.communityTab;
 $$('[data-community-tab]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',active?'true':'false')});
 if(tab!=='forums')setPostForm(false);
 render();
});

(async()=>{
 window.AcademyUI?.showPageLoading('جاري تحميل مجتمع الأكاديمية...');
 try{
   ({user,profile}=await C.requireStudent());$('pageAvatar').textContent=C.initials(profile.name||user.displayName||'طالب');
   const refs={
     forums:C.db.ref('community/forums'),
     groups:C.db.ref('community/studyGroups')
   };
   const first=await Promise.all([refs.forums.once('value'),refs.groups.once('value')]);
   community={forums:first[0].val()||{},studyGroups:first[1].val()||{}};render();
   refs.forums.on('value',s=>{community.forums=s.val()||{};render()},err=>{console.error(err);C.toast('تعذر مزامنة المنتدى.','error')});
   refs.groups.on('value',s=>{community.studyGroups=s.val()||{};render()},err=>{console.error(err);C.toast('تعذر مزامنة مجموعات الدراسة.','error')});
 }catch(err){
   console.error(err);C.toast('تعذر تحميل المجتمع الآن.','error');
   $('forumFeed').innerHTML=window.AcademyUI?.errorStateHtml('تعذر تحميل المجتمع','تحقق من الاتصال ثم حاول مرة أخرى.','<button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>')||'';
 }finally{window.AcademyUI?.hidePageLoading()}
})();
})();