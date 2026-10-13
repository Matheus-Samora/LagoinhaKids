with open('src/main.js', 'r', encoding='utf-8') as f:
    main_code = f.read()

live_update_code = """
let currentBuild=null, isUpdating=false;
async function checkLiveUpdate(){
 if(isUpdating||S.busy)return;
 try{
  const v=await api('/version');
  if(!v||!v.build)return;
  if(currentBuild===null){
   currentBuild=v.build;
   return;
  }
  if(v.build!==currentBuild){
   isUpdating=true;
   currentBuild=v.build;
   toast('Atualizando aplicativo com a versão mais recente...');
   if('caches' in window){
    try{
     const keys=await caches.keys();
     await Promise.all(keys.map(k=>caches.delete(k)));
    }catch{}
   }
   setTimeout(()=>{
    window.location.replace(window.location.href);
   },800);
  }
 }catch{}
}
"""

if "async function checkLiveUpdate()" not in main_code:
    main_code = main_code.replace("let syncing=false;", live_update_code + "\nlet syncing=false;")

# Add checkLiveUpdate to syncLive()
old_sync_live = "syncing=true;const uid=S.user.id;"
new_sync_live = "syncing=true;const uid=S.user.id;\n  void checkLiveUpdate();"
main_code = main_code.replace(old_sync_live, new_sync_live)

# Add listener for appStateChange if native
old_start = "async function start(){"
new_start = """if(Capacitor.isNativePlatform()){
 App.addListener('appStateChange',({isActive})=>{
  if(isActive){
   void checkLiveUpdate();
   void syncLive();
  }
 });
}
async function start(){
 void checkLiveUpdate();"""
main_code = main_code.replace(old_start, new_start)

# Add checkLiveUpdate to setInterval and events
old_intervals = """setInterval(syncLive,3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncLive();});
window.addEventListener('focus',()=>void syncLive());
window.addEventListener('online',()=>void syncLive());"""

new_intervals = """setInterval(()=>{void syncLive();void checkLiveUpdate();},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void syncLive();void checkLiveUpdate();}});
window.addEventListener('focus',()=>{void syncLive();void checkLiveUpdate();});
window.addEventListener('online',()=>{void syncLive();void checkLiveUpdate();});"""
main_code = main_code.replace(old_intervals, new_intervals)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(main_code)

print("Updated src/main.js with Live OTA update engine.")
