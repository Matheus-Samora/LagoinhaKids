import {hasPendingForms} from './form-lifecycle.js';
import './app-updates.css';

export const canApplyUpdate=({visible,online,pending,busy,editing,quietFor})=>visible&&online&&!pending&&!busy&&!editing&&quietFor>=10000;

// Every web build has its own ID, even when the marketing version is unchanged.
export function startAppUpdates(){
 if(window.__lagoinhaUpdatesStarted)return;
 window.__lagoinhaUpdatesStarted=true;
 const current=__APP_RELEASE_ID__;
 let latest=null,lastActivity=Date.now(),mutations=0,checking=false,reloading=false;
 const edited=new Set();
 const originalFetch=window.fetch.bind(window);
 window.fetch=async(...args)=>{
  const method=String(args[1]?.method||args[0]?.method||'GET').toUpperCase();
  const write=!['GET','HEAD','OPTIONS'].includes(method);
  if(write)mutations++;
  try{return await originalFetch(...args);}finally{if(write){mutations--;lastActivity=Date.now();}}
 };
 for(const name of ['pointerdown','keydown','input'])document.addEventListener(name,event=>{
  lastActivity=Date.now();
  if(name==='input'&&event.target.matches?.('input:not([type=search]),textarea,select,[contenteditable=true]'))edited.add(event.target);
 },{capture:true,passive:true});
 document.addEventListener('change',event=>{lastActivity=Date.now();if(event.target.matches?.('input[type=file],select'))edited.add(event.target);},true);
 document.addEventListener('reset',event=>{for(const el of edited)if(event.target.contains(el))edited.delete(el);},true);
 function safe(){
  for(const el of edited)if(!el.isConnected)edited.delete(el);
  const editing=edited.size>0||Boolean(document.querySelector('dialog[open],#emergency-call-overlay,video[src]'))||[...document.querySelectorAll('video')].some(v=>v.srcObject)||Boolean(document.activeElement?.matches('input,textarea,select,[contenteditable=true]'));
  return canApplyUpdate({visible:document.visibilityState==='visible',online:navigator.onLine!==false,pending:hasPendingForms(),busy:mutations>0,editing,quietFor:Date.now()-lastActivity});
 }
 function apply(){if(!latest||reloading||!safe())return;reloading=true;location.reload();}
 function announce(){
  let notice=document.getElementById('app-update-notice');
  if(!notice){notice=document.createElement('aside');notice.id='app-update-notice';notice.setAttribute('role','status');notice.innerHTML='<span>Atualização disponível. Será aplicada quando você terminar o que está fazendo.</span><button type="button">Atualizar agora</button>';notice.querySelector('button').onclick=()=>{lastActivity=0;if(safe())apply();else notice.querySelector('span').textContent='Salve e feche o formulário ou chamado para aplicar a atualização.';};document.body.append(notice);}
 }
 async function check(){
  if(checking||document.visibilityState!=='visible'||navigator.onLine===false)return;
  checking=true;
  try{
   const response=await originalFetch('/app-release.json',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return;
   const release=await response.json();
   if(release.schema!==1||typeof release.id!=='string'||!/^[a-f0-9-]{36}$/.test(release.id))return;
   latest=release.id!==current?release.id:null;
   if(latest){announce();apply();}else document.getElementById('app-update-notice')?.remove();
  }catch{/* Offline or failed checks must never interrupt the app. */}finally{checking=false;}
 }
 setInterval(check,60000);setInterval(apply,5000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastActivity=Date.now();check();}});
 window.addEventListener('online',check);
 // Capacitor's foreground event also covers Android WebView resume.
 document.addEventListener('resume',()=>{lastActivity=Date.now();check();});
 setTimeout(check,15000);
}
