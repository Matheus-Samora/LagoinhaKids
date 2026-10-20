// Private API responses and photographs are never cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Lagoinha Kids</title><body style="font-family:system-ui;padding:32px"><h1>Você está sem conexão</h1><p>Conecte-se à internet para consultar ou salvar informações.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
          )
      )
    );
  }
});

// Only same-origin app routes are accepted from a push payload.
function noticeUrl(value){
 try{const url=new URL(value||'/membro',self.location.origin);if(url.origin===self.location.origin&&['/membro','/kids','/finance','/members','/ministries','/systems'].includes(url.pathname))return url.href;}catch{}
 return self.location.origin+'/membro';
}
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const urgent=Boolean(data.urgent);
 const category=['urgent','tasks','announcements','activity','system'].includes(data.category)?data.category:'system';
 const body=urgent?'A equipe da salinha precisa falar com você.':{tasks:'Você tem uma nova solicitação ou resposta.',announcements:'Há um novo comunicado para você.',activity:'Há uma atualização de presença ou aula.',system:'Há uma atualização da sua conta.'}[category]||'Você recebeu um novo aviso.';
 const id=Number(data.id)||null;
 const options={body,icon:'/logo.png',badge:'/logo.png',tag:id?`notice-${id}`:'lagoinha-update',renotify:false,requireInteraction:urgent,data:{url:noticeUrl(data.url),id,kind:data.kind||'general',urgent,category}};
 if(urgent)options.vibrate=[200,100,200];
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)client.postMessage({type:'NEW_NOTICE',payload:{id,category}});
  // Push API requires a visible notification; use a brief, generic preview.
  const existing=await self.registration.getNotifications({tag:options.tag});
  if(!existing.length)await self.registration.showNotification(urgent?'Lagoinha Kids — chamado da salinha':'Lagoinha Systems',options);
 })());
});
self.addEventListener('notificationclick',event=>{
 const data=event.notification.data||{};event.notification.close();
 event.waitUntil((async()=>{
  const target=noticeUrl(data.url);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
   if(new URL(client.url).origin===self.location.origin){await client.navigate(target);return client.focus();}
  }
  return self.clients.openWindow(target);
 })());
});
