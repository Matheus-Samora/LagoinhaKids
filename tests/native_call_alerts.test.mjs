import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=(await fs.readFile(new URL('../src/native-call-alerts.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export function ','function ')+'\nglobalThis.show=presentNativeCall;';
function environment(status,hidden=false){
 const calls=[];const context={window:{AndroidNativeApp:{callAlertsVersion:()=>2,getCallAlertStatus:()=>JSON.stringify(status),presentCall:(...args)=>calls.push(args)}},document:{hidden},Date,Number,String,JSON};vm.createContext(context);vm.runInContext(source,context);return {calls,show:context.show};
}
test('new APK uses native delivery and does not start a second web ringtone',()=>{
 const s=environment({notifications_allowed:true,channel_enabled:true});assert.equal(s.show({id:12,created_at:new Date().toISOString()}),true);assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'12');
});
test('missing permissions use a visible web fallback only while the app is visible',()=>{
 const s=environment({notifications_allowed:false,channel_enabled:false});assert.equal(s.show({id:1}),false);assert.equal(s.calls.length,0);
 const background=environment({notifications_allowed:false},true);assert.equal(background.show({id:1}),true);assert.equal(background.calls.length,0);
});
test('expired or malformed call does not ring',()=>{
 const s=environment({notifications_allowed:true,channel_enabled:true});assert.equal(s.show({id:12,created_at:'invalid'}),true);assert.equal(s.show({id:12,created_at:new Date(Date.now()-700000).toISOString()}),true);assert.equal(s.calls.length,0);
});
