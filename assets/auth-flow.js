(() => {
'use strict';
if(!window.AcademyBackend || !AcademyBackend.auth)return;
const cfg=window.ACADEMY_BACKEND_CONFIG;
if(cfg && !AcademyBackend.apps.length) AcademyBackend.initializeApp(cfg);

const form=document.getElementById('loginForm');
if(!form || form.dataset.authBound==='true')return;
form.dataset.authBound='true';

const email=document.getElementById('loginEmail');
const password=document.getElementById('loginPassword');
const button=document.getElementById('loginSubmitBtn');
const modal=document.getElementById('authModal');
const toastEl=document.getElementById('toast');

function notify(msg,type='success'){
  if(!toastEl)return alert(msg);
  toastEl.textContent=msg;
  toastEl.className='toast show '+type;
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>toastEl.className='toast',3500);
}
function messageFor(error){
  const code=error?.code||'';
  const map={
    'auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة.',
    'auth/user-not-found':'لا يوجد حساب بهذا البريد الإلكتروني.',
    'auth/wrong-password':'كلمة المرور غير صحيحة.',
    'auth/invalid-login-credentials':'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/too-many-requests':'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    'auth/network-request-failed':'تعذر الاتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.'
  };
  return map[code]||error?.message||'تعذر تسجيل الدخول.';
}

form.setAttribute('novalidate','novalidate');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  e.stopPropagation();

  const mail=(email?.value||'').trim();
  const pass=password?.value||'';
  if(!mail){notify('اكتب البريد الإلكتروني.','error');email?.focus();return}
  if(!pass){notify('اكتب كلمة المرور.','error');password?.focus();return}

  if(button){button.disabled=true;button.textContent='جاري تسجيل الدخول...'}
  try{
    await AcademyBackend.auth().setPersistence(AcademyBackend.auth.Auth.Persistence.LOCAL);
    await AcademyBackend.auth().signInWithEmailAndPassword(mail,pass);
    if(modal)modal.classList.add('hidden');
    document.body.style.overflow='';
    notify('تم تسجيل الدخول بنجاح 👋');
  }catch(err){
    console.error('Login failed',err);
    notify(messageFor(err),'error');
  }finally{
    if(button){button.disabled=false;button.textContent='تسجيل الدخول'}
  }
},true);
})();