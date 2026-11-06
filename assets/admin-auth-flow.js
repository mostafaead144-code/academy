(() => {
'use strict';
if(!window.AcademyBackend || !AcademyBackend.auth || !AcademyBackend.database)return;
const session=window.AcademyRoleSession?.get('admin');
if(!session)return;
const auth=session.auth,db=session.db;
const form=document.getElementById('adminLoginForm');
const email=document.getElementById('adminEmail');
const password=document.getElementById('adminPassword');
const button=document.getElementById('adminLoginBtn');
const login=document.getElementById('adminLogin');
const app=document.getElementById('adminApp');
const toastEl=document.getElementById('toast');

function notify(msg,type='success'){
  if(!toastEl){console.error(msg);return}
  toastEl.textContent=msg;toastEl.className='toast show '+type;
  clearTimeout(notify.t);notify.t=setTimeout(()=>toastEl.className='toast',3500);
}
function messageFor(error){
  const code=error?.code||'';
  const map={
    'auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة.',
    'auth/user-not-found':'البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم حساب المدير.',
    'auth/wrong-password':'البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم حساب المدير.',
    'auth/invalid-credential':'البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم حساب المدير.',
    'auth/invalid-login-credentials':'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'auth/too-many-requests':'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    'auth/network-request-failed':'تعذر الاتصال بالإنترنت.'
  };
  if(map[code])return map[code];
  // Some Hostinger SDK versions return raw REST JSON under auth/internal-error.
  if(/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/i.test(String(error?.message||'')))
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة. استخدم حساب المدير الأصلي، أو اضغط «نسيت كلمة المرور؟».';
  return 'تعذر تسجيل الدخول. حاول مرة أخرى، وإذا استمر الخطأ تحقق من إعدادات Hostinger Authentication.';
}
async function isAdmin(user){
  return user?.role==='admin';
}

async function showForUser(user){
  if(!user){app?.classList.add('hidden');login?.classList.remove('hidden');return false}
  try{
    const ok=await isAdmin(user);
    if(!ok){
      app?.classList.add('hidden');login?.classList.remove('hidden');
      notify('هذا الحساب ليس له صلاحية مدير. سجّل الدخول بحساب الإدارة إذا أردت فتح اللوحة.','error');
      if(auth.currentUser?.uid===user.uid)await auth.signOut().catch(()=>{});
      return false;
    }
    login?.classList.add('hidden');app?.classList.remove('hidden');
    return true;
  }catch(err){
    console.error('Admin permission check failed',err);
    app?.classList.add('hidden');login?.classList.remove('hidden');
    notify('تعذر التحقق من صلاحية الإدارة. راجع اتصال Hostinger وقواعد قاعدة البيانات.','error');
    return false;
  }
}
if(form && form.dataset.adminAuthBound!=='true'){
  form.dataset.adminAuthBound='true';
  form.setAttribute('novalidate','novalidate');
  form.addEventListener('submit',async e=>{
    e.preventDefault();e.stopPropagation();
    const mail=(email?.value||'').trim(),pass=password?.value||'';
    if(!mail){notify('اكتب البريد الإلكتروني.','error');email?.focus();return}
    if(!pass){notify('اكتب كلمة المرور.','error');password?.focus();return}
    if(button){button.disabled=true;button.textContent='جاري التحقق...'}
    try{
      await auth.setPersistence(AcademyBackend.auth.Auth.Persistence.LOCAL);
      const cred=await auth.signInWithEmailAndPassword(mail,pass);
      const ok=await showForUser(cred.user);
      if(ok)notify('تم تسجيل دخول الإدارة بنجاح ✅');
    }catch(err){
      console.error('Admin login failed',err);
      notify(messageFor(err),'error');
    }finally{
      if(button){button.disabled=false;button.textContent='دخول لوحة الإدارة'}
    }
  },true);
}
auth.onAuthStateChanged(user=>{showForUser(user)});
})();
