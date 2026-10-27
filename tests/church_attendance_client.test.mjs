import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=(await fs.readFile(new URL('../src/platform/church-attendance.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function churchAttendanceUI','function churchAttendanceUI')+'\nglobalThis.factory=churchAttendanceUI;';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function setup(info,{defer=false}={}){
 info={linked_member:true,...info};
 const calls=[],timers=[],listeners={};let gps=0,success;
 const document={hidden:false,addEventListener(name,fn){listeners[name]=fn;}};
 const context={console,Intl,Date,URLSearchParams,document,window:{addEventListener(){}},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){},navigator:{geolocation:{getCurrentPosition(ok){gps++;success=ok;if(!defer)ok({coords:{latitude:-18.85,longitude:-41.95,accuracy:10},timestamp:Date.now()});}}}};
 vm.createContext(context);vm.runInContext(source,context);
 const api=async(path,options)=>{calls.push({path,options});if(!options)return info;return {ok:true};};
 return {ui:context.factory({api,e:x=>x}),calls,timers,document,listeners,get gps(){return gps;},resolve(){success({coords:{latitude:-18.85,longitude:-41.95,accuracy:10},timestamp:Date.now()});}};
}
test('automatic location requires opt-in and an open service',async()=>{
 for(const info of [{auto_enabled:false,items:[{id:'one',can_checkin:true}]},{auto_enabled:true,items:[{id:'future',can_checkin:false}]}]){
  const s=setup(info);await s.ui.setUser(3);await flush();assert.equal(s.gps,0);assert.ok(s.calls.every(x=>!x.options));s.ui.stop();
 }
});
test('automatic check-in uses a fresh location only for an unconfirmed service',async()=>{
 const s=setup({auto_enabled:true,items:[{id:'now',title:'Culto',can_checkin:true},{id:'done',can_checkin:true,my_presence:{}}]});
 await s.ui.setUser(3);await flush();assert.equal(s.gps,1);
 const writes=s.calls.filter(x=>x.options);assert.equal(writes.length,1);assert.ok(writes[0].path.endsWith('/now/check-in'));
 assert.deepEqual(Object.keys(writes[0].options.body).sort(),['accuracy','captured_at','latitude','longitude']);s.ui.stop();
});
test('leaving the visible app prevents a pending GPS check-in',async()=>{
 const s=setup({auto_enabled:true,items:[{id:'now',can_checkin:true}]},{defer:true});
 await s.ui.setUser(3);await flush();s.document.hidden=true;s.resolve();await flush();assert.equal(s.calls.filter(x=>x.options).length,0);s.ui.stop();
});
test('logout discards a pending location instead of using a new session',async()=>{
 const s=setup({auto_enabled:true,items:[{id:'now',can_checkin:true}]},{defer:true});
 await s.ui.setUser(3);await flush();s.ui.stop();s.resolve();await flush();assert.equal(s.calls.filter(x=>x.options).length,0);
});
