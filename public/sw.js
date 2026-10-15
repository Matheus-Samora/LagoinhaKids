// Private API responses and photographs are never cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Lagoinha Kids</title><body style="font-family:system-ui;padding:32px"><h1>Você está sem conexão</h1><p>Conecte-se à internet para consultar ou salvar informações.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification('Lagoinha Kids',{
  body:'Você recebeu um novo aviso. Abra o aplicativo para conferir.',icon:'/logo.png',badge:'/logo.png',
  tag:data.tag||`notice-${data.id||Date.now()}`,data:{url:'/#notifications',id:data.id||null}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){client.postMessage({type:'NAVIGATE_PAGE',page:'notifications'});return client.focus();}}
  return self.clients.openWindow('/#notifications');
 })());
});
