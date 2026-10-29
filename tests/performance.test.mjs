import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
test('targeted indexes preserve records and remove redundant notification index',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE module_access(user_id INTEGER,module TEXT,role TEXT,enabled INTEGER);CREATE TABLE sessions(token TEXT,user_id INTEGER);CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,read_at TEXT);CREATE INDEX notice_user_id ON notifications(user_id,id);INSERT INTO module_access VALUES(1,'members','member',1),(2,'kids','pastor',1);INSERT INTO sessions VALUES('synthetic',1);INSERT INTO notifications VALUES(1,1,NULL)`);
 db.exec(fs.readFileSync(new URL('../deploy/cloudflare/migrations/0003_query_performance.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT count(*) n FROM notifications').get().n,1);
 assert.ok(db.prepare("EXPLAIN QUERY PLAN SELECT user_id FROM module_access WHERE role='pastor' AND enabled=1").all().some(r=>r.detail.includes('module_pastors_active')));
 assert.ok(db.prepare('EXPLAIN QUERY PLAN SELECT * FROM sessions WHERE user_id=1').all().some(r=>r.detail.includes('sessions_by_user')));
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='notice_user_id'").get().n,0);db.close();
});
test('foreground paging checks do not overlap or poll a hidden app',async()=>{
 const source=fs.readFileSync(new URL('../src/platform/main.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function checkActiveEmergencyPaging()'),source.indexOf('\nfunction startPagingWatcher()'));
 let calls=0,resolve;const document={hidden:true,getElementById:()=>null};
 const context=vm.createContext({identity:{user:{id:1,role:'parent'}},document,navigator:{onLine:true},pagingCheckBusy:false,window:{},isMobileClientDevice:()=>true,api:()=>{calls++;return new Promise(done=>resolve=done);}});
 vm.runInContext(code+';globalThis.check=checkActiveEmergencyPaging;',context);
 await context.check();assert.equal(calls,0);document.hidden=false;
 const pending=context.check();await context.check();assert.equal(calls,1);
 resolve([]);await pending;assert.equal(context.pagingCheckBusy,false);
});
test('combined sync query detects notices, read receipts, calls and audit changes',()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE audit(id INTEGER PRIMARY KEY);CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,read_at TEXT);CREATE TABLE paging_requests(id INTEGER PRIMARY KEY,status TEXT)`);
 const source=fs.readFileSync(new URL('../deploy/cloudflare/worker.mjs',import.meta.url),'utf8');
 const sql=source.match(/const state=await db.first\(`([\s\S]*?)`,\[user.id,user.id\]\)/)[1];
 const state=()=>db.prepare(sql).get(1,1);
 assert.equal(state().notice_id,0);db.exec("INSERT INTO notifications VALUES(1,2,NULL),(2,1,NULL)");assert.equal(state().notice_id,2);
 db.exec("UPDATE notifications SET read_at='2026-10-29' WHERE id=2");assert.equal(state().read_stamp,'2026-10-29');
 db.exec("INSERT INTO paging_requests VALUES(1,'active'),(2,'resolved')");assert.equal(state().paging_count,1);assert.equal(state().paging_max,1);
 db.exec("UPDATE paging_requests SET status='resolved' WHERE id=1;INSERT INTO audit VALUES(9)");assert.equal(state().paging_count,0);assert.equal(state().max_audit,9);db.close();
});
