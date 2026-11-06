(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const api=window.AcademyBackend;
if(!api)return;
const app=()=>api.apps.find(x=>x.name==='teacher-portal');
const auth=()=>app()?.auth();
const token=()=>auth()?._token?.()||'';
const user=()=>auth()?.currentUser||null;
let groups=[];
function assignmentRows(profile){
 const raw=profile?.assignments;
 const arr=Array.isArray(raw)?raw:Object.values(raw||{});
 return arr.filter(Boolean).map((a,i)=>({id:a.id||String(i),type:a.type||'public',stage:a.stage||'',grade:String(a.grade||''),subject:a.subject||'',subjectName:a.subjectName||a.subject||'مادة'}));
}
async function loadAssignmentOptions(){
 const u=user(); if(!u||!$('teacherGroupAssignment'))return;
 try{
  const r=await api.request('data',{token:token(),query:{path:'teacherProfiles/'+u.uid}}), profile=r.value||{};
  const rows=assignmentRows(profile);
  $('teacherGroupAssignment').innerHTML=rows.length?rows.map(a=>`<option value="${esc([a.type,a.stage,a.grade,a.subject].join('|'))}">${esc(a.subjectName)} • ${esc(a.stage)} • الصف ${esc(a.grade)}</option>`).join(''):'<option value="">لا توجد مادة مسندة</option>';
 }catch(e){console.error(e)}
}
function renderGroups(){
 const box=$('teacherGroupsList');if(!box)return;
 if(!groups.length){box.innerHTML='<p class="profile-muted">لم تنشئ أي فصل بعد.</p>';return}
 box.innerHTML=groups.map(g=>`<article class="teacher-v5-group-card">
   <div><strong>${esc(g.name||'فصل')}</strong><small>${esc(g.subjectName||g.subject||'')} • الصف ${esc(g.grade||'')}</small></div>
   <div class="teacher-v5-group-code"><span>كود الانضمام</span><button type="button" data-copy-group="${esc(g.code||'')}">${esc(g.code||'—')} <i class="fa-regular fa-copy"></i></button></div>
   <div class="teacher-v5-group-meta"><span><i class="fa-solid fa-users"></i> ${Number(g.membersCount||0)} طالب</span><span>${g.active===false?'موقوف':'نشط'}</span></div>
   <div class="teacher-v5-group-actions"><button type="button" class="btn btn-soft" data-group-toggle="${esc(g.id)}">${g.active===false?'تفعيل':'إيقاف'}</button><button type="button" class="btn btn-danger" data-group-delete="${esc(g.id)}"><i class="fa-solid fa-trash"></i></button></div>
  </article>`).join('');
 box.querySelectorAll('[data-copy-group]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyGroup);b.textContent='تم النسخ ✓'}catch{}});
 box.querySelectorAll('[data-group-delete]').forEach(b=>b.onclick=()=>removeGroup(b.dataset.groupDelete));
 box.querySelectorAll('[data-group-toggle]').forEach(b=>b.onclick=()=>toggleGroup(b.dataset.groupToggle));
}
async function loadGroups(){
 if(!user()||!$('teacherGroupsList'))return;
 $('teacherGroupsList').innerHTML='<p class="profile-muted">جاري تحميل الفصول…</p>';
 try{const r=await api.request('teacher/groups',{token:token()});groups=r.groups||[];renderGroups()}catch(e){console.error(e);$('teacherGroupsList').innerHTML='<p class="profile-muted">تعذر تحميل الفصول الآن.</p>'}
}
async function createGroup(e){
 e.preventDefault();const name=$('teacherGroupName')?.value.trim(),packed=$('teacherGroupAssignment')?.value||'';if(!name||!packed)return;
 const [type,stage,grade,subject]=packed.split('|');const btn=$('teacherGroupCreate');btn.disabled=true;
 try{await api.request('teacher/groups/create',{method:'POST',token:token(),body:{name,description:$('teacherGroupDescription')?.value.trim()||'',type,stage,grade,subject}});e.target.reset();await Promise.all([loadAssignmentOptions(),loadGroups()])}catch(err){console.error(err);alert(err.message||'تعذر إنشاء الفصل') }finally{btn.disabled=false}
}
async function removeGroup(id){
 if(!confirm('حذف الفصل؟ سيتم إلغاء كود الانضمام ولن تُحذف حسابات الطلاب.'))return;
 try{await api.request('teacher/groups/delete',{method:'POST',token:token(),body:{id}});await loadGroups()}catch(e){alert(e.message||'تعذر حذف الفصل')}
}
async function toggleGroup(id){
 const g=groups.find(x=>x.id===id);if(!g)return;
 try{await api.request('teacher/groups/status',{method:'POST',token:token(),body:{id,active:g.active===false}});await loadGroups()}catch(e){alert(e.message||'تعذر تحديث الفصل')}
}
function riskReason(r){return (r.reasons||[]).map(x=>`<span>${esc(x)}</span>`).join('')}
async function loadRisk(){
 const box=$('teacherAtRiskList');if(!user()||!box)return;box.innerHTML='<p class="profile-muted">جاري تحليل نشاط الطلاب…</p>';
 try{
  const r=await api.request('teacher/at-risk',{token:token()});const rows=r.students||[];
  if($('teacherRiskSummary'))$('teacherRiskSummary').innerHTML=`<span><b>${rows.length}</b> يحتاجون متابعة</span><span><b>${Number(r.totalScopedStudents||0)}</b> طالبًا ضمن موادك</span>`;
  box.innerHTML=rows.length?rows.map(s=>`<article class="teacher-v5-risk-row"><div class="teacher-v5-risk-avatar">${esc((s.name||'ط').trim().charAt(0)||'ط')}</div><div><strong>${esc(s.name||'طالب')}</strong><small>${esc(s.subjectName||'')} • الصف ${esc(s.grade||'')}</small><div class="teacher-v5-risk-reasons">${riskReason(s)}</div></div><div class="teacher-v5-risk-score">${s.averageScore==null?'—':Math.round(s.averageScore)+'%'}<small>متوسط</small></div></article>`).join(''):'<div class="teacher-v5-empty-good"><i class="fa-solid fa-circle-check"></i><strong>لا توجد حالات حرجة الآن</strong><span>استمر في متابعة تقدم طلابك.</span></div>';
 }catch(e){console.error(e);box.innerHTML='<p class="profile-muted">تعذر تحليل الطلاب الآن.</p>'}
}
function bind(){
 $('teacherGroupForm')?.addEventListener('submit',createGroup);$('teacherRiskRefresh')?.addEventListener('click',loadRisk);
 document.querySelectorAll('[data-teacher-tab="classes"]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{loadAssignmentOptions();loadGroups();loadRisk()},0)));
}
function waitAuth(){const a=auth();if(!a)return setTimeout(waitAuth,100);a.onAuthStateChanged(u=>{if(u){loadAssignmentOptions();loadGroups();loadRisk()}});bind()}
waitAuth();
})();
