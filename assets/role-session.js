(()=>{
'use strict';
const names={admin:'admin-portal',teacher:'teacher-portal',parent:'parent-portal'};
function get(role){
 if(!window.AcademyBackend||!AcademyBackend.auth||!AcademyBackend.database)throw new Error('Hostinger SDK unavailable');
 const cfg=window.ACADEMY_BACKEND_CONFIG;if(!cfg)throw new Error('Hostinger config missing');
 const name=names[role];if(!name)throw new Error('Unknown role session: '+role);
 const app=AcademyBackend.apps.find(x=>x.name===name)||AcademyBackend.initializeApp(cfg,name);
 return{role,name,app,auth:app.auth(),db:app.database()};
}
function portal(role){return role==='admin'?'./admin.html':role==='teacher'?'./teacher.html':role==='parent'?'./parent.html':'./index.html'}
window.AcademyRoleSession={get,portal,names};
})();