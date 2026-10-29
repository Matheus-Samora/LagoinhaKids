import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/app-updates.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
const context=vm.createContext({});vm.runInContext(source+';globalThis.policy=canApplyUpdate;',context);
const ready={visible:true,online:true,pending:false,busy:false,editing:false,quietFor:10000};
test('updates apply only after a quiet safe moment',()=>assert.equal(context.policy(ready),true));
test('background, offline, drafts, saves and calls postpone updates',()=>{
 for(const patch of [{visible:false},{online:false},{pending:true},{busy:true},{editing:true},{quietFor:9999}])assert.equal(context.policy({...ready,...patch}),false);
});
test('release checker never writes data or treats HTTP errors as a release',()=>{
 assert.match(source,/cache:'no-store'/);assert.match(source,/if\(!response.ok\)return/);assert.match(source,/release.schema!==1/);assert.match(source,/location.reload\(\)/);
});
