import re

# 1. Update src/main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    main_code = f.read()

# Add App import from @capacitor/app
if "import {App} from '@capacitor/app';" not in main_code:
    main_code = main_code.replace(
        "import {Camera,CameraResultType,CameraSource,CameraDirection} from '@capacitor/camera';",
        "import {Camera,CameraResultType,CameraSource,CameraDirection} from '@capacitor/camera';\nimport {App} from '@capacitor/app';"
    )

# Add back icon to icon function
if "back:'<path d=\"M19 12H5m7 7-7-7 7-7\"/>'" not in main_code:
    main_code = main_code.replace(
        "arrow:'<path d=\"M4 12h15m-6-6 6 6-6 6\"/>',",
        "arrow:'<path d=\"M4 12h15m-6-6 6 6-6 6\"/>',back:'<path d=\"M19 12H5m7 7-7-7 7-7\"/>',"
    )

# Add navHistory, initialPage, canGoBack, navigateTo, handleBackButton before render()
nav_logic = """const navHistory=[];
let lastBackTime=0;

function initialPage(){
 if(!S.user)return 'overview';
 return S.user.role==='teacher'?'rooms':'overview';
}

function canGoBack(){
 return (navHistory.length>0)||(S.user&&S.page!==initialPage());
}

function navigateTo(page,replace=false){
 if(!replace&&S.page&&S.page!==page){
  navHistory.push(S.page);
  if(navHistory.length>30)navHistory.shift();
 }
 S.page=page;
 S.search='';
 S.room='all';
 try{history.pushState({page},'','#'+page);}catch{}
 render();
 void syncLive();
}

function handleBackButton(){
 if(modal&&modal.open){
  modal.close();
  return;
 }
 if(navHistory.length>0){
  const prev=navHistory.pop();
  S.page=prev;
  S.search='';
  S.room='all';
  render();
  void syncLive();
  return;
 }
 const home=initialPage();
 if(S.user&&S.page!==home){
  S.page=home;
  S.search='';
  S.room='all';
  render();
  void syncLive();
  return;
 }
 const now=Date.now();
 if(now-lastBackTime<2500){
  if(Capacitor.isNativePlatform()){
   App.exitApp();
  }else{
   toast('Saindo do aplicativo...');
   history.back();
  }
 }else{
  lastBackTime=now;
  try{history.pushState({page:home,exitNotice:true},'','#'+home);}catch{}
  toast('Pressione voltar novamente para sair do aplicativo');
 }
}

if(Capacitor.isNativePlatform()){
 App.addListener('backButton',()=>{
  handleBackButton();
 });
}
window.addEventListener('popstate',()=>{
 handleBackButton();
});
"""

if "function handleBackButton()" not in main_code:
    main_code = main_code.replace("function render(){\n", nav_logic + "\nfunction render(){\n")

# Update topbar in render() to show back-nav-btn
old_breadcrumbs = """<div class="breadcrumbs">Nosso espaço <span>/</span> <strong>${S.user.role==='parent'&&S.page==='overview'?'Meus filhos':(paths[S.page]||'Aulinhas')}</strong></div>"""
new_breadcrumbs = """<div class="breadcrumbs">${canGoBack()?`<button type="button" class="back-nav-btn" data-action="go-back" title="Voltar para a tela anterior" aria-label="Voltar para a tela anterior">${icon('back',16)}<span>Voltar</span></button>`:''}<div class="crumb-trail">Nosso espaço <span>/</span> <strong>${S.user.role==='parent'&&S.page==='overview'?'Meus filhos':(paths[S.page]||'Aulinhas')}</strong></div></div>"""
main_code = main_code.replace(old_breadcrumbs, new_breadcrumbs)

# Update pass navigateTo to school UI
old_school_init = "const school=createSchoolUI({S,api,escape,icon,title,showModal,toast,refresh:load,render,age,statusName,time});"
new_school_init = "const school=createSchoolUI({S,api,escape,icon,title,showModal,toast,refresh:load,render,age,statusName,time,navigateTo});"
main_code = main_code.replace(old_school_init, new_school_init)

# Update click handler for data-page
old_data_page = "if(el.dataset.page){S.page=el.dataset.page;S.search='';S.room='all';render();void syncLive();return;}"
new_data_page = "if(el.dataset.page){navigateTo(el.dataset.page);return;}"
main_code = main_code.replace(old_data_page, new_data_page)

# Update click handler for go-back action
old_click_action = "if(action==='set-server'){"
new_click_action = "if(action==='go-back'){handleBackButton();return;}\n if(action==='set-server'){"
main_code = main_code.replace(old_click_action, new_click_action)

# Update filter-room in main.js
old_filter_room = "if(action==='filter-room'){S.page='attendance';S.room=String(el.dataset.id);S.search='';render();}"
new_filter_room = "if(action==='filter-room'){S.room=String(el.dataset.id);navigateTo('attendance');return;}"
main_code = main_code.replace(old_filter_room, new_filter_room)

# Update logout to clear history
old_logout = "S.user=null;S.csrf='';S.token='';renderLogin();toast('Sessão encerrada com sucesso.');"
new_logout = "S.user=null;S.csrf='';S.token='';navHistory.length=0;renderLogin();toast('Sessão encerrada com sucesso.');"
main_code = main_code.replace(old_logout, new_logout)

# Update login to clear history
old_login_history = "saveAccount(result.user);S.page=S.user.role==='teacher'?'rooms':'overview';await load();return;"
new_login_history = "saveAccount(result.user);navHistory.length=0;S.page=S.user.role==='teacher'?'rooms':'overview';await load();return;"
main_code = main_code.replace(old_login_history, new_login_history)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(main_code)

print("Updated src/main.js successfully.")
