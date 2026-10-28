import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,generateKeyPairSync} from 'node:crypto';
import fs from 'node:fs';
import worker from '../deploy/cloudflare/worker.mjs';
import {enqueuePagingPush,deliverPagingPush,pagingMessage} from '../deploy/cloudflare/paging-push.mjs';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT,role TEXT,staff_role TEXT,active INTEGER DEFAULT 1);
 CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,csrf TEXT,expires INTEGER);
 CREATE TABLE platform_admins(user_id INTEGER);CREATE TABLE pastoral_users(user_id INTEGER);
 CREATE TABLE module_access(user_id INTEGER,module TEXT,role TEXT,enabled INTEGER);
 CREATE TABLE teacher_rooms(user_id INTEGER,room_id INTEGER);
 CREATE TABLE rooms(id INTEGER PRIMARY KEY,name TEXT,teacher_id INTEGER,monitor_id INTEGER);
 CREATE TABLE children(id INTEGER PRIMARY KEY,name TEXT,parent_id INTEGER,room_id INTEGER,avatar_url TEXT);
 CREATE TABLE family_links(child_id INTEGER,user_id INTEGER,active INTEGER);
 CREATE TABLE paging_requests(id INTEGER PRIMARY KEY,child_id INTEGER,room_id INTEGER,claim_code TEXT,reason TEXT,status TEXT,created_at TEXT,actor INTEGER,acknowledged_by INTEGER,acknowledged_at TEXT,resolved_at TEXT);
 CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,child_id INTEGER,kind TEXT,title TEXT,message TEXT,sender INTEGER,created_at TEXT,sector TEXT,context_id TEXT,read_at TEXT);
 CREATE TABLE audit(id INTEGER PRIMARY KEY,actor INTEGER,action TEXT,child_id INTEGER,created_at TEXT);
 CREATE TABLE device_tokens(token TEXT PRIMARY KEY,user_id INTEGER,platform TEXT,updated_at TEXT,session_token TEXT);`);
 sqlite.exec(fs.readFileSync(new URL('../deploy/cloudflare/migrations/0001_native_paging.sql',import.meta.url),'utf8'));
 for(const [id,role] of [[1,'admin'],[2,'teacher'],[3,'parent'],[4,'parent']]){
  sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run(id,'Synthetic '+id,'u'+id+'@example.test',role,role);
  sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(createHash('sha256').update('token-'+id).digest('hex'),id,'csrf-'+id,Math.floor(Date.now()/1000)+3600);
  sqlite.prepare('INSERT INTO module_access VALUES(?,?,?,1)').run(id,'kids',role);
 }
 sqlite.exec("INSERT INTO platform_admins VALUES(1);INSERT INTO rooms VALUES(1,'Room',2,NULL);INSERT INTO teacher_rooms VALUES(2,1);INSERT INTO children VALUES(1,'Synthetic child',3,1,'');");
 const prepare=sql=>({bind(...values){return statement(sql,values);},...statement(sql,[])});
 function statement(sql,values){return {first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>{const r=sqlite.prepare(sql).run(...values);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:Number(r.changes)}};}};}
 const env={DB:{prepare}};
 const db={all:async(sql,values=[])=>sqlite.prepare(sql).all(...values),first:async(sql,values=[])=>sqlite.prepare(sql).get(...values)||null,
 run:async(sql,values=[])=>{const r=sqlite.prepare(sql).run(...values);return {rowcount:Number(r.changes),lastrowid:Number(r.lastInsertRowid)};}};
 const tasks=[];
 async function request(uid,path,method='GET',body,extra={}){return worker.fetch(new Request('https://test.example/api'+path,{method,headers:{Authorization:'Bearer token-'+uid,...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined}),env,{waitUntil(task){tasks.push(task);}});}
 return {sqlite,env,db,request,tasks};
}
test('Cloudflare paging scopes callers, recipients and acknowledgements',async()=>{
 const s=fixture();
 assert.equal((await s.request(3,'/paging','POST',{child_id:1})).status,403);
 const created=await s.request(2,'/paging','POST',{child_id:1});assert.equal(created.status,200);const call=await created.json();
 assert.equal((await (await s.request(3,'/paging/active')).json())[0].recipient_for_me,true);
 assert.equal((await (await s.request(2,'/paging/active')).json())[0].recipient_for_me,false);
 assert.deepEqual(await (await s.request(4,'/paging/active')).json(),[]);
 assert.equal((await s.request(4,'/paging/on-my-way','POST',{paging_id:call.id})).status,403);
 assert.equal((await s.request(3,'/paging/'+call.id+'/resolve','POST',{})).status,403);
 assert.equal((await s.request(3,'/paging/on-my-way','POST',{paging_id:call.id})).status,200);
 assert.equal(s.sqlite.prepare('SELECT status FROM paging_requests').get().status,'on_my_way');
 await Promise.all(s.tasks);s.sqlite.close();
});
test('Cloudflare rejects foreign origins and cookie mutations without CSRF',async()=>{
 const s=fixture();
 const cors=await worker.fetch(new Request('https://test.example/api/me',{method:'OPTIONS',headers:{Origin:'https://other.workers.dev'}}),s.env);
 assert.equal(cors.headers.get('access-control-allow-origin'),null);
 const forged=await s.request(2,'/paging','POST',{child_id:1},{Origin:'https://other.workers.dev'});assert.equal(forged.status,403);
 const request=new Request('https://test.example/api/paging',{method:'POST',headers:{Cookie:'lagoinha_session=token-2','Content-Type':'application/json'},body:'{"child_id":1}'});
 assert.equal((await worker.fetch(request,s.env)).status,403);s.sqlite.close();
});
test('Cloudflare queues only the new APK devices belonging to the child family',async()=>{
 const s=fixture();const call=await(await s.request(2,'/paging','POST',{child_id:1})).json();
 for(const uid of [3,4])await s.request(uid,'/devices/token','POST',{platform:'android',token:'fake-token-'+uid,call_alerts_version:2});
 await enqueuePagingPush(s.db,call.id);await enqueuePagingPush(s.db,call.id);
 assert.equal(s.sqlite.prepare('SELECT count(*) n FROM paging_push_deliveries').get().n,1);
 assert.equal(s.sqlite.prepare('SELECT user_id FROM paging_push_deliveries').get().user_id,3);
 // Removing the session revokes delivery even while the FCM token still exists.
 s.sqlite.prepare('DELETE FROM sessions WHERE user_id=3').run();
 const result=await deliverPagingPush({...s.env,FCM_SERVICE_ACCOUNT:'unused'},s.db,{fetcher:()=>{throw Error('Must not contact provider');}});
 assert.equal(result.accepted,0);assert.equal(s.sqlite.prepare('SELECT status FROM paging_push_deliveries').get().status,'suppressed');
 await Promise.all(s.tasks);s.sqlite.close();
});
test('FCM payload is generic, high priority and expires instead of ringing stale calls',()=>{
 const now=Date.now(),row={paging_id:9,user_id:3,token:'fake',kind:'call',call_status:'active',created_at:new Date(now).toISOString(),child_name:'private',claim_code:'secret'};
 const payload=pagingMessage(row,now);assert.equal(payload.message.android.priority,'HIGH');
 assert.deepEqual(Object.keys(payload.message.data).sort(),['expires_at','paging_id','type','user_id']);
 assert.equal(pagingMessage({...row,created_at:new Date(now-700000).toISOString()},now),null);
 assert.equal(pagingMessage({...row,call_status:'resolved'},now),null);
 assert.equal(pagingMessage({...row,kind:'cancel',call_status:'resolved'},now).message.data.type,'kids_paging_cancel');
});
test('FCM acceptance is deduplicated and retry failures remain pending',async()=>{
 const s=fixture();const call=await(await s.request(2,'/paging','POST',{child_id:1})).json();
 await s.request(3,'/devices/token','POST',{platform:'android',token:'synthetic-device',call_alerts_version:2});await enqueuePagingPush(s.db,call.id);
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={...s.env,FCM_SERVICE_ACCOUNT:JSON.stringify({project_id:'lagoinha-kids-20261014',client_email:'synthetic@example.test',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};
 let sends=0;
 const fetcher=async(url,options)=>{
  if(url.includes('oauth2'))return Response.json({access_token:'synthetic-oauth',expires_in:3600});
  sends++;assert.equal(JSON.parse(options.body).message.token,'synthetic-device');
  return sends===1?Response.json({error:{status:'UNAVAILABLE'}},{status:503}):Response.json({name:'accepted-by-provider'});
 };
 assert.equal((await deliverPagingPush(env,s.db,{fetcher})).failed,1);
 assert.equal(s.sqlite.prepare('SELECT status FROM paging_push_deliveries').get().status,'pending');
 s.sqlite.prepare('UPDATE paging_push_deliveries SET next_attempt=0').run();
 assert.equal((await deliverPagingPush(env,s.db,{fetcher})).accepted,1);
 assert.equal((await deliverPagingPush(env,s.db,{fetcher})).accepted,0);assert.equal(sends,2);
 await Promise.all(s.tasks);s.sqlite.close();
});
