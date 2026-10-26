import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('dependency versions match the exact npm tarballs and root manifest',()=>{
 const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 let checked=0;
 for(const [key,item] of Object.entries(lock.packages)){
  if(!key||!item.resolved?.startsWith('https://registry.npmjs.org/'))continue;
  const name=key.split('/').at(-1);
  const file=decodeURIComponent(new URL(item.resolved).pathname.split('/').at(-1));
  assert.equal(file,`${name}-${item.version}.tgz`,key+' has an inconsistent locked version');checked++;
 }
 assert(checked>0);
});
