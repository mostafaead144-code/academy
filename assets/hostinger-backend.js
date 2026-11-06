(()=>{
'use strict';
const cfg=window.ACADEMY_BACKEND_CONFIG||{apiBase:'./api'};
const apiBase=new URL(String(cfg.apiBase||'./api').replace(/\/?$/,'/'),document.baseURI).href.replace(/\/$/,'');
const apps=[];
const authStates=new Map();
const watchers=new Map();
const PERSIST={LOCAL:'local',NONE:'none'};
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const normalizePath=p=>String(p||'').replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/');
const keyOf=p=>{p=normalizePath(p);return p?p.split('/').pop():null};
const pushKey=()=>('h'+Date.now().toString(36)+crypto.getRandomValues(new Uint32Array(2)).join('').slice(0,12));
function error(code,message,status=0){const e=new Error(message||code);e.code=code;e.status=status;return e}
function mapError(payload,status){const code=payload?.error||'server_error';const map={invalid_credentials:'auth/invalid-login-credentials',invalid_email:'auth/invalid-email',email_exists:'auth/email-already-in-use',weak_password:'auth/weak-password',too_many_requests:'auth/too-many-requests',account_pending:'auth/account-pending',account_disabled:'auth/user-disabled',auth_required:'auth/user-token-expired',invalid_session:'auth/user-token-expired',forbidden:'auth/operation-not-allowed',wrong_password:'auth/wrong-password',email_failed:'auth/email-send-failed'};const e=error(map[code]||('backend/'+code),payload?.message||code,status);e.data=payload||{};return e}
function tokenStore(name,persistence='local'){const k='academy_hostinger_session:'+name;return{get(){return (persistence==='none'?sessionStorage:localStorage).getItem(k)||localStorage.getItem(k)||sessionStorage.getItem(k)||''},set(v){localStorage.removeItem(k);sessionStorage.removeItem(k);if(v)(persistence==='none'?sessionStorage:localStorage).setItem(k,v)},clear(){localStorage.removeItem(k);sessionStorage.removeItem(k)}}}
// V95: bounded memory for conditional /data reads; never an offline or auth cache.
const readCache=new Map(),readPending=new Map();
let readCacheBytes=0,readEpoch=0;
function clearReadCache(){readEpoch++;readCache.clear();readPending.clear();readCacheBytes=0;}
function rememberRead(key,etag,data){
 const bytes=JSON.stringify(data).length*2;
 const old=readCache.get(key);if(old){readCacheBytes-=old.bytes;readCache.delete(key);}
 if(bytes>4*1024*1024)return;
 while(readCache.size>=96||readCacheBytes+bytes>4*1024*1024){const first=readCache.keys().next().value;const item=readCache.get(first);if(!item)break;readCacheBytes-=item.bytes;readCache.delete(first);}
 readCache.set(key,{etag,data:clone(data),bytes});readCacheBytes+=bytes;
}
async function request(route,{method='GET',body,token,query,timeoutMs=0}={}){
 let url=apiBase+'/'+String(route||'').replace(/^\//,'');
 if(query){const qs=new URLSearchParams(query);url+=(url.includes('?')?'&':'?')+qs;}
 const conditional=method==='GET'&&String(route||'').replace(/^\/+|\/+$/g,'')==='data';
 if(method!=='GET'&&method!=='HEAD')clearReadCache();
 const epoch=readEpoch,key=String(token||'')+'\n'+url,pendingKey=epoch+'\n'+key;
 if(conditional&&readPending.has(pendingKey))return clone(await readPending.get(pendingKey));
 const task=(async()=>{
  const headers={'Accept':'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;
  const saved=conditional?readCache.get(key):null;
  if(saved){headers['If-None-Match']=saved.etag;readCache.delete(key);readCache.set(key,saved);}
  const limit=timeoutMs||(conditional?20000:0),controller=limit?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),limit):null;
  let res;
  try{
   const send=()=>fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store',...(controller?{signal:controller.signal}:{})});
   res=await send();
   if(conditional&&res.status===304){
    if(saved&&epoch===readEpoch)return saved.data;
    // A write/login may have invalidated memory while the read was in flight.
    // Ask for a full, freshly authorized response rather than reuse stale data.
    delete headers['If-None-Match'];res=await send();
   }
  }catch(e){throw error('auth/network-request-failed','تعذر الاتصال بخادم الأكاديمية');}
  finally{if(timer)clearTimeout(timer);}
  let data={};try{data=await res.json();}catch{}
  if(!res.ok||data?.ok===false){if(res.status===401||res.status===403)clearReadCache();throw mapError(data,res.status);}
  if(method!=='GET'&&method!=='HEAD')clearReadCache();
  if(conditional){
   if(data?.ok!==true||!Object.prototype.hasOwnProperty.call(data,'value'))throw error('backend/invalid-response','تعذر قراءة البيانات من الخادم');
   const etag=res.headers.get('ETag');
   if(etag&&epoch===readEpoch)rememberRead(key,etag,data);
  }
  return data;
 })();
 if(conditional)readPending.set(pendingKey,task);
 try{return conditional?clone(await task):await task;}
 finally{if(conditional&&readPending.get(pendingKey)===task)readPending.delete(pendingKey);}
}

class Snapshot{constructor(value,key){this._value=clone(value);this.key=key??null}val(){return clone(this._value)}exists(){return this._value!==null&&this._value!==undefined}}
function applyQuery(value,q){if(!value||typeof value!=='object'||Array.isArray(value))return value;let rows=Object.entries(value);if(q.orderByChild){const f=q.orderByChild;rows.sort((a,b)=>{const av=a[1]?.[f],bv=b[1]?.[f];return av===bv?0:av==null?-1:bv==null?1:av<bv?-1:1});if(q.equalTo!==undefined)rows=rows.filter(([,v])=>v?.[f]===q.equalTo)}if(q.limitToLast)rows=rows.slice(-q.limitToLast);return Object.fromEntries(rows)}
class Query{
 constructor(ref,q={}){this._ref=ref;this._q=q;this.key=ref?.key??null}
 orderByChild(name){return new Query(this._ref,{...this._q,orderByChild:name})}
 equalTo(value){return new Query(this._ref,{...this._q,equalTo:value})}
 limitToLast(n){return new Query(this._ref,{...this._q,limitToLast:Number(n)||0})}
 once(event){if(event!=='value')return Promise.reject(error('backend/unsupported-event','Only value events are supported'));return this._ref._read().then(v=>new Snapshot(applyQuery(v,this._q),this.key))}
 on(event,cb,errCb){
  if(event!=='value')return cb;
  const id=Symbol('watch');let firstPending=true,firstAttempts=0,stopped=false;
  const run=async()=>{
    if(stopped)return;
    try{
      const snap=await this.once('value');
      firstPending=false;firstAttempts=0;cb(snap);
    }catch(e){
      if(firstPending&&firstAttempts<2){
        firstAttempts++;setTimeout(run,450*firstAttempts);return;
      }
      errCb?.(e);
    }
  };
  run();
  const timer=setInterval(run,15000);
  watchers.set(id,{timer,cb,ref:this._ref.path,stop:()=>{stopped=true;clearInterval(timer)}});
  this._ref._listeners.set(cb,id);return cb
 }
 off(event,cb){if(cb){const id=this._ref._listeners.get(cb),w=id&&watchers.get(id);if(w){w.stop?.();if(!w.stop)clearInterval(w.timer);watchers.delete(id)}this._ref._listeners.delete(cb)}else{for(const [fn,id] of this._ref._listeners){const w=watchers.get(id);if(w){w.stop?.();if(!w.stop)clearInterval(w.timer)}watchers.delete(id);this._ref._listeners.delete(fn)}}}
 child(path){return this._ref.child(path)}
}
class Ref extends Query{
 constructor(db,path=''){super(null,{});this._ref=this;this.db=db;this.path=normalizePath(path);this.key=keyOf(this.path);this._listeners=new Map()}
 _token(){return this.db.app.auth()._token()}
 async _read(){const r=await request('data',{token:this._token(),query:{path:this.path}});return r.value??null}
 child(path){return new Ref(this.db,this.path?(this.path+'/'+normalizePath(path)):normalizePath(path))}
 async set(value){await request('data',{method:'PUT',token:this._token(),body:{path:this.path,value}});return value}
 async update(patch){if(!patch||typeof patch!=='object')throw error('backend/invalid-update','Update requires an object');await request('data/multi-update',{method:'POST',token:this._token(),body:{basePath:this.path,updates:patch}});return patch}
 async remove(){await request('data',{method:'DELETE',token:this._token(),body:{path:this.path}})}
 push(value){const ref=this.child(pushKey());if(arguments.length)return ref.set(value).then(()=>ref);return ref}
 async transaction(fn){for(let attempt=0;attempt<5;attempt++){const before=await this._read();const next=fn(clone(before));if(next===undefined)return{committed:false,snapshot:new Snapshot(before,this.key)};try{const r=await request('data/transaction',{method:'POST',token:this._token(),body:{path:this.path,expectedHash:await digest(before),value:next}});return{committed:true,snapshot:new Snapshot(r.value,this.key)}}catch(e){if(e.code!=='backend/conflict'||attempt===4)throw e}}return{committed:false,snapshot:new Snapshot(await this._read(),this.key)}}
}
async function digest(value){const data=new TextEncoder().encode(stable(value));const hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function stable(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'}
class Database{constructor(app){this.app=app}ref(path=''){return new Ref(this,path)}}
class User{
 constructor(auth,data){this._auth=auth;this.uid=data.uid;this.email=data.email||'';this.displayName=data.displayName||'';this.role=data.role||'';this.mustChangePassword=!!data.mustChangePassword;this._reauthPassword=''}
 async updateProfile(patch={}){if(patch.displayName!==undefined){const r=await request('auth/profile',{method:'PATCH',token:this._auth._token(),body:{displayName:patch.displayName}});this.displayName=r.user.displayName;this._auth._emit()}return this}
 async reauthenticateWithCredential(credential){await request('auth/reauth',{method:'POST',token:this._auth._token(),body:{password:credential?.password||''}});this._reauthPassword=credential?.password||'';return this}
 async updatePassword(next){await request('auth/password',{method:'PATCH',token:this._auth._token(),body:{oldPassword:this._reauthPassword,newPassword:next}});this._reauthPassword='';return this}
 async delete(){throw error('auth/requires-recent-login','حذف الحساب من المتصفح غير متاح. استخدم لوحة الإدارة.')}
}
class Auth{
 constructor(app){this.app=app;this.currentUser=null;this.persistence='local';this.listeners=new Set();this.ready=false;this._restoreTimer=null;this._restoreAttempts=0;this._restoring=false;this._restoreGeneration=0;this._restore()}
 _store(){return tokenStore(this.app.name,this.persistence)}_token(){return this._store().get()}
 _recovery(state){window.dispatchEvent(new CustomEvent('academy:session-recovery',{detail:{appName:this.app.name,state}}))}
 _cancelRestore(){clearReadCache();clearTimeout(this._restoreTimer);this._restoreTimer=null;this._restoreAttempts=0;this._restoreGeneration++}
 retrySessionRestore(){clearTimeout(this._restoreTimer);this._restoreTimer=null;return this._restore()}
 async _restore(){
  if(this._restoring)return;
  const token=this._token(),generation=this._restoreGeneration;
  if(!token){this.currentUser=null;this.ready=true;this._emit();return}
  this._restoring=true;
  try{
   const response=await request('auth/me',{token,timeoutMs:15000});
   if(generation!==this._restoreGeneration||token!==this._token())return;
   if(!response.user?.uid)throw error('backend/invalid-response','تعذر التحقق من جلسة الدخول');
   this.currentUser=new User(this,response.user);this.ready=true;this._restoreAttempts=0;this._recovery('restored');this._emit();
  }catch(err){
   if(generation!==this._restoreGeneration||token!==this._token())return;
   const expired=err.code==='auth/user-token-expired'||err.code==='auth/user-disabled'||err.status===401;
   if(expired){this._store().clear();this.currentUser=null;this.ready=true;this._recovery('expired');this._emit()}
   else{
    // Keep listeners pending until the server verifies the saved token. Never authenticate from a local user cache.
    this._recovery('waiting');
    this._restoreAttempts++;
    clearTimeout(this._restoreTimer);
    this._restoreTimer=setTimeout(()=>{this._restoreTimer=null;this._restore()},Math.min(30000,1500*2**Math.min(this._restoreAttempts-1,5)));
   }
  }finally{this._restoring=false}
 }
 _emit(){for(const cb of this.listeners)queueMicrotask(()=>cb(this.currentUser))}
 setPersistence(mode){this.persistence=mode===PERSIST.NONE?'none':'local';return Promise.resolve()}
 onAuthStateChanged(cb){this.listeners.add(cb);if(this.ready)queueMicrotask(()=>cb(this.currentUser));return()=>this.listeners.delete(cb)}
 async signInWithEmailAndPassword(email,password){const r=await request('auth/login',{method:'POST',body:{email,password,appName:this.app.name}});this._cancelRestore();this._store().set(r.token);this.currentUser=new User(this,r.user);this.ready=true;this._recovery('restored');this._emit();return{user:this.currentUser}}
 async createUserWithEmailAndPassword(email,password,extra={}){const r=await request('auth/register',{method:'POST',body:{email,password,appName:this.app.name,...(extra&&typeof extra==='object'?{displayName:String(extra.displayName||''),guardianPhone:String(extra.guardianPhone||'')}: {})}});if(r.pending)throw error('auth/account-pending','الحساب بانتظار المراجعة');this._cancelRestore();this._store().set(r.token);this.currentUser=new User(this,r.user);this.ready=true;this._recovery('restored');this._emit();return{user:this.currentUser}}
 async signOut(){this._cancelRestore();const t=this._token();try{if(t)await request('auth/logout',{method:'POST',token:t})}finally{this._store().clear();this.currentUser=null;this.ready=true;this._recovery('expired');this._emit()}}
 async sendPasswordResetEmail(email){await request('auth/password-reset-request',{method:'POST',body:{email}})}
}
class App{
 constructor(config={},name='[DEFAULT]'){this.options=config;this.name=name;this._auth=new Auth(this);this._db=new Database(this)}auth(){return this._auth}database(){return this._db}async delete(){const i=apps.indexOf(this);if(i>=0)apps.splice(i,1);await this._auth.signOut().catch(()=>{})}
}
function initializeApp(config={},name='[DEFAULT]'){const existing=apps.find(a=>a.name===name);if(existing)return existing;const app=new App(config,name);apps.push(app);return app}
function defaultApp(){return apps.find(a=>a.name==='[DEFAULT]')||initializeApp(cfg)}
function auth(){return defaultApp().auth()}
auth.Auth={Persistence:PERSIST};auth.EmailAuthProvider={credential:(email,password)=>({email,password})};
function database(){return defaultApp().database()}
database.ServerValue={};Object.defineProperty(database.ServerValue,'TIMESTAMP',{get:()=>Date.now()});
function functions(){return{httpsCallable:name=>async payload=>{if(name!=='adminSetUserPassword')throw error('backend/function-not-found','Unknown server action');const a=apps.find(x=>x.name==='admin-portal')?.auth()||defaultApp().auth();const r=await request('admin/users/password',{method:'POST',token:a._token(),body:payload});return{data:r}}}}
async function adminCreateUser({email,password,displayName,role='teacher'}){const a=apps.find(x=>x.name==='admin-portal')?.auth()||defaultApp().auth();return request('admin/users',{method:'POST',token:a._token(),body:{email,password,displayName,role}})}
async function adminUpdateUserAccess({uid,role,status}){const a=apps.find(x=>x.name==='admin-portal')?.auth()||defaultApp().auth();const body={uid};if(role!==undefined)body.role=role;if(status!==undefined)body.status=status;return request('admin/users/access',{method:'POST',token:a._token(),body})}
window.AcademyBackend={apps,initializeApp,auth,database,functions,adminCreateUser,adminUpdateUserAccess,request,apiBase,provider:'hostinger'};
window.addEventListener('online',()=>apps.forEach(app=>{if(!app.auth().ready&&app.auth()._token())app.auth().retrySessionRestore()}));
// V6 universal presentation layer: load once on every page that uses the Hostinger backend.
try{
 if(!document.body?.classList.contains('v22')&&!document.querySelector('link[data-academy-platform-v6],link[href*="platform-v6.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./assets/platform-v6.css?v=20261010.2';l.dataset.academyPlatformV6='1';document.head.appendChild(l)}
 if(!document.body?.classList.contains('v22')&&!document.querySelector('script[data-academy-social-v6]')&&!document.querySelector('script[src*="social-share-v6.js"]')){const s=document.createElement('script');s.src='./assets/social-share-v6.js?v=20261010.2';s.defer=true;s.dataset.academySocialV6='1';document.head.appendChild(s)}
}catch{}
})();
