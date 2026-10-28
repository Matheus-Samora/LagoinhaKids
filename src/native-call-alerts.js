import './native-call-alerts.css';
function bridge(){try{const b=window.AndroidNativeApp;return b?.callAlertsVersion?.()>=2?b:null;}catch{return null;}}
export function presentNativeCall(call){
 const b=bridge();if(!b)return false;
 try{
  const status=JSON.parse(b.getCallAlertStatus());
  if(!status.notifications_allowed||!status.channel_enabled)return document.hidden;
  const expires=Date.parse(call.created_at)+600000;
  if(!Number.isFinite(expires)||expires<=Date.now())return true;
  b.presentCall(String(call.id||call.paging_id),String(expires));return true;
 }catch{return document.hidden;}
}
export function updateNativeCallReadiness(){
 const host=document.querySelector('main')||document.querySelector('.workspace');if(!host)return;
 const b=bridge();if(!b){
  if(window.AndroidNativeApp&&!document.getElementById('native-call-readiness')){
   const warning=document.createElement('aside');warning.id='native-call-readiness';warning.innerHTML='<strong>Atualização do APK necessária</strong><p>Instale a versão 3.3.1 para usar os novos avisos com o aplicativo fechado e configurar a tela de chamado.</p><a href="https://lagoinha-kids.lagoinha-systems.workers.dev/download/lagoinha-kids.apk" target="_blank" rel="noopener">Baixar APK atualizado</a>';host.prepend(warning);
  }return;
 }
 let box=document.getElementById('native-call-readiness');
 if(!box){
  box=document.createElement('details');box.id='native-call-readiness';box.innerHTML='<summary></summary><p data-native-state></p><p>Com o APK atualizado, os avisos usam push do Android. Som, tela bloqueada e tela cheia dependem das permissões deste aparelho. Não funciona com aparelho desligado, sem conexão ou parada forçada.</p><button type="button" data-native-notifications>Configurar notificações</button> <button type="button" data-native-fullscreen>Permitir tela de chamado</button>';
  host.prepend(box);box.querySelector('[data-native-notifications]').onclick=()=>b.requestCallPermissions();box.querySelector('[data-native-fullscreen]').onclick=()=>b.openFullScreenSettings();
 }
 try{
  const status=JSON.parse(b.getCallAlertStatus());const issues=[];
  if(!status.notifications_allowed)issues.push('Permita notificações');
  if(!status.channel_enabled)issues.push('Ative som e aviso destacado no canal Kids');
  if(!status.sound_enabled)issues.push('Confira o modo silencioso, o volume e o som do canal Kids');
  if(!status.full_screen_allowed)issues.push('Autorize a tela de chamado nas configurações Android');
  if(!status.registered)issues.push('O aparelho ainda não confirmou o registro push; mantenha a conta conectada');
  box.querySelector('summary').textContent=issues.length?'Avisos neste celular: configuração pendente':'Avisos neste celular: configurados';
  box.querySelector('[data-native-state]').textContent=issues.length?issues.join('. ')+'.':'Notificações, canal Kids, tela de chamado e registro push disponíveis. O Android controla a exibição final.';
 }catch{}
}
