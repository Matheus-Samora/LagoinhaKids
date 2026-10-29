import {Capacitor} from '@capacitor/core';

let initialized=false;
export function initializeDeviceRuntime(){
 if(initialized)return;initialized=true;
 const viewport=window.visualViewport;
 function resize(){
  if(viewport&&viewport.scale===1)document.documentElement.style.setProperty('--app-visible-height',Math.round(viewport.height)+'px');
 }
 resize();viewport?.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);
 function connection(){
  let banner=document.getElementById('device-offline-banner');
  if(navigator.onLine!==false){banner?.remove();return;}
  if(!banner){banner=document.createElement('div');banner.id='device-offline-banner';banner.setAttribute('role','status');banner.textContent='Sem conexão. Reconecte-se para consultar ou salvar informações.';document.body.append(banner);}
 }
 window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
 if('serviceWorker' in navigator){
  // Native calls use FCM. Register the web worker only in browsers/PWAs.
  if(Capacitor.isNativePlatform())navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.filter(r=>new URL(r.scope).origin===location.origin).map(r=>r.unregister()))).catch(()=>{});
  else navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
 }
}
