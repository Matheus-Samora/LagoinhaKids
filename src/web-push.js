export async function subscribeWebPush(api){
 if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('Instale o app na Tela de Início e use um navegador compatível com notificações.');
 const config=await api('/web-push/config');
 if(!config.enabled)throw new Error('O servidor ainda não está configurado para notificações externas.');
 await navigator.serviceWorker.register('/sw.js');
 const registration=await navigator.serviceWorker.ready;
 const key=Uint8Array.from(atob(config.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 let subscription=await registration.pushManager.getSubscription();
 if(subscription&&btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')!==config.public_key){await subscription.unsubscribe();subscription=null;}
 subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await api('/web-push/subscribe',{method:'POST',body:subscription.toJSON()});
 localStorage.setItem('lagoinha_web_push_registered','true');
 return true;
}
