import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installHelp} from '../src/install-help.js';
for(const manifest of ['manifest.json','systems.webmanifest']){
 test(`${manifest}: icon dimensions match PNG files and orientation is not locked`,()=>{
  const data=JSON.parse(readFileSync(new URL('../public/'+manifest,import.meta.url)));
  assert.equal(data.orientation,'any');
  for(const icon of data.icons){const png=readFileSync(new URL('../public'+icon.src,import.meta.url));assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(icon.sizes,`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);}
  assert.ok(data.icons.some(i=>i.purpose==='maskable'));
 });
}
test('install guidance distinguishes APK, iPhone, desktop iPad, Android and desktop',()=>{
 assert.match(installHelp({native:true}),/já está no APK/);
 assert.match(installHelp({userAgent:'iPhone'}),/Safari/);
 assert.match(installHelp({platform:'MacIntel',touchPoints:5}),/Safari/);
 assert.match(installHelp({userAgent:'Android'}),/Chrome do Android/);
 assert.match(installHelp({userAgent:'Windows'}),/computador/);
});
import vm from 'node:vm';
const runtimeSource=readFileSync(new URL('../src/device-runtime.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
for(const native of [true,false])test(`runtime uses ${native?'native push without web registration':'browser service worker'} once`,async()=>{
 const calls=[],styles={};
 const context=vm.createContext({Capacitor:{isNativePlatform:()=>native},location:{origin:'https://qa.example.test'},URL,window:{visualViewport:{height:400,scale:1,addEventListener(){}},addEventListener(){}},navigator:{onLine:true,serviceWorker:{register:async(...args)=>calls.push(['register',...args]),getRegistrations:async()=>[{scope:'https://qa.example.test/',unregister:async()=>calls.push(['unregister'])}]}},document:{documentElement:{style:{setProperty:(k,v)=>styles[k]=v}},getElementById:()=>null}});
 vm.runInContext(runtimeSource+';initializeDeviceRuntime();initializeDeviceRuntime();',context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(styles['--app-visible-height'],'400px');
 assert.equal(calls.length,1);assert.equal(calls[0][0],native?'unregister':'register');
 if(!native)assert.equal(calls[0][2].updateViaCache,'none');
});
