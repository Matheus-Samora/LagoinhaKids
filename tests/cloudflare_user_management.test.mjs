import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import worker from '../deploy/cloudflare/worker.mjs';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,role TEXT,staff_role TEXT,password TEXT,active INTEGER DEFAULT 1);
 CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,csrf TEXT,expires INTEGER);
 CREATE TABLE platform_admins(user_id INTEGER PRIMARY KEY);CREATE TABLE pastoral_users(user_id INTEGER PRIMARY KEY);
 CREATE TABLE module_access(user_id INTEGER,module TEXT,role TEXT,enabled INTEGER,PRIMARY KEY(user_id,module));
 CREATE TABLE module_scopes(user_id INTEGER,module TEXT,scope TEXT,PRIMARY KEY(user_id,module));
 CREATE TABLE audit(id INTEGER PRIMARY KEY,actor INTEGER,action TEXT,child_id INTEGER,created_at TEXT,prev_hash TEXT,ip TEXT);`);
 db.exec(fs.readFileSync(new URL('../deploy/cloudflare/migrations/0002_user_archives.sql',import.meta.url),'utf8'));
 for(let uid=1;uid<=6;uid++){
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1)').run(uid,'Synthetic '+uid,'qa'+uid+'@example.test','parent',uid===2?'pastor':'','not-used');
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update('test-'+uid).digest('hex'),uid,'csrf-'+uid,Math.floor(Date.now()/1000)+3600);
 }
 db.exec('INSERT INTO platform_admins VALUES(1),(5);INSERT INTO pastoral_users VALUES(2),(4)');
 function statement(sql,values=[]){return {bind(...args){return statement(sql,args);},first:async()=>db.prepare(sql).get(...values)||null,all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>{const row=db.prepare(sql).run(...values);return {meta:{changes:Number(row.changes),last_row_id:Number(row.lastInsertRowid)}};}};}
 const env={DB:{prepare:sql=>statement(sql)}};
 const request=(uid,path,method='GET',body,cookie=false)=>worker.fetch(new Request('https://qa.example.test/api/platform/users'+path,{method,headers:{...(cookie?{Cookie:'lagoinha_session=test-'+uid}:{Authorization:'Bearer test-'+uid}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {db,request};
}
test('only TI and Pastors may list accounts or change sector access',async()=>{
 const s=setup();assert.equal((await s.request(3,'')).status,403);
 assert.equal((await s.request(2,'')).status,200);
 assert.equal((await s.request(3,'/6/modules/members','PUT',{role:'leader',enabled:true})).status,403);
 assert.equal((await s.request(2,'/6/modules/ministries','PUT',{role:'leader',enabled:true,scopes:['Music','Kids']})).status,200);
 assert.equal(s.db.prepare('SELECT scope FROM module_scopes WHERE user_id=6').get().scope,'["Music","Kids"]');
 assert.equal((await s.request(2,'/6/modules/systems','PUT',{role:'admin',enabled:true})).status,400);
 assert.equal((await s.request(2,'/6/modules/members','PUT',{role:'unknown',enabled:true})).status,400);s.db.close();
});
test('pastor cannot grant TI or alter a TI account through any management route',async()=>{
 const s=setup();for(const body of [{platform_admin:true},{platform_admin:false}])assert.equal((await s.request(2,'/3','PATCH',body)).status,403);
 for(const [path,method,body] of [['/1','PATCH',{active:false}],['/5/modules/kids','PUT',{role:'parent',enabled:false}],['/1','DELETE'],['/5/restore','POST']])assert.equal((await s.request(2,path,method,body)).status,403);
 assert.equal(s.db.prepare('SELECT active FROM users WHERE id=1').get().active,1);s.db.close();
});
test('pastor can exclude and restore accounts while preserving data and revoking sessions',async()=>{
 const s=setup();assert.equal((await s.request(2,'/3','DELETE')).status,200);
 assert.equal(s.db.prepare('SELECT active FROM users WHERE id=3').get().active,0);
 assert.equal(s.db.prepare('SELECT count(*) n FROM sessions WHERE user_id=3').get().n,0);
 assert.ok(s.db.prepare('SELECT deleted_by FROM user_archives WHERE user_id=3').get());
 const rows=await(await s.request(2,'')).json();assert.equal(rows.find(u=>u.id===3).archived,true);
 assert.equal((await s.request(2,'/3','PATCH',{active:true})).status,400);
 assert.equal((await s.request(2,'/3/restore','POST')).status,200);
 assert.equal(s.db.prepare('SELECT active FROM users WHERE id=3').get().active,1);
 assert.equal(s.db.prepare('SELECT count(*) n FROM user_archives').get().n,0);
 assert.equal(s.db.prepare('SELECT count(*) n FROM audit').get().n,2);s.db.close();
});
test('self deletion and cookie mutations without CSRF are rejected',async()=>{
 const s=setup();assert.equal((await s.request(2,'/2','DELETE')).status,400);
 assert.equal((await s.request(1,'/1','PATCH',{platform_admin:false})).status,400);
 assert.equal((await s.request(2,'/3','DELETE',undefined,true)).status,403);
 assert.equal((await s.request(2,'/3','PATCH',{active:false})).status,200);
 assert.equal((await s.request(2,'/3','PATCH',{active:true})).status,200);s.db.close();
});
import vm from 'node:vm';
test('pastoral account screen exposes sector management without TI controls',()=>{
 const source=fs.readFileSync(new URL('../src/platform/main.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function permissions(){'),source.indexOf('\nfunction auditSection()'));
 const context=vm.createContext({users:[{id:1,name:'TI',email:'ti@example.test',platform_admin:true,active:true,grants:[]},{id:3,name:'Member',email:'m@example.test',active:true,grants:[]},{id:4,name:'Archive',email:'a@example.test',archived:true,grants:[]}],identity:{user:{id:2},pastor:true,platform_admin:false},userSearch:'',names:{kids:'Kids',members:'Members',ministries:'Ministries',finance:'Finance'},MINISTRY_CATALOG:['Music','Kids'],e:x=>String(x??''),initials:x=>x.slice(0,2)});
 vm.runInContext(code+';globalThis.html=permissions();',context);
 assert.ok(context.html.includes('data-grant="members"'));assert.ok(context.html.includes('data-user-patch="delete-user"'));
 assert.ok(context.html.includes('data-user-patch="restore-user"'));assert.ok(!context.html.includes('data-user-patch="toggle-admin"'));
 assert.ok(!context.html.includes('data-user="1"'));assert.ok(!context.html.includes('data-uid="1"'));
});
