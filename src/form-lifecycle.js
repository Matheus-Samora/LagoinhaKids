// Keep drafts in the form, and never close a form while its request is pending.
const guards=new Set();
const dialogGuards=new WeakMap();
const snapshot=form=>JSON.stringify([...new FormData(form)].map(([k,v])=>[k,v instanceof File?(v.name?`${v.name}:${v.size}:${v.lastModified}`:''):v]));
export function guardForm(form,dialog=form.closest('dialog')){
 if(dialog)dialogGuards.get(dialog)?.dispose();
 let saved=snapshot(form),busy=false,disposed=false;
 const originalClose=dialog?.close.bind(dialog);
 const guard={
  get dirty(){return !disposed&&form.isConnected&&snapshot(form)!==saved;},
  get busy(){return !disposed&&form.isConnected&&busy;},
  setBusy(value){busy=value;form.inert=value;form.setAttribute('aria-busy',String(value));},
  markSaved(){saved=snapshot(form);},
  complete(){this.setBusy(false);this.markSaved();},
  dispose(){disposed=true;guards.delete(guard);if(dialog&&originalClose){dialog.close=originalClose;dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',close);dialogGuards.delete(dialog);}}
 };
 guards.add(guard);
 const cancel=ev=>{ev.preventDefault();dialog.close();},close=()=>guard.dispose();
 if(dialog){
  dialogGuards.set(dialog,guard);
  const requestClose=()=>!guard.busy&&(!guard.dirty||confirm('Descartar as alterações que ainda não foram salvas?'));
  dialog.close=(...args)=>{if(requestClose())originalClose(...args);};
  dialog.addEventListener('cancel',cancel);
  dialog.addEventListener('close',close,{once:true});
 }
 return guard;
}
window.addEventListener('beforeunload',ev=>{if([...guards].some(g=>g.busy||g.dirty)){ev.preventDefault();ev.returnValue='';}});
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('a[href],button[data-page],[data-switch-tab],#sidebar-logout,#logout,[data-action="logout"]');
 if(!nav||nav.closest('dialog')||nav.target==='_blank'||nav.hasAttribute('download'))return;
 const active=[...guards].filter(g=>g.busy||g.dirty);
 if(!active.length)return;
 if(active.some(g=>g.busy)||!confirm('Descartar as alterações que ainda não foram salvas?')){ev.preventDefault();ev.stopImmediatePropagation();}
 else active.forEach(g=>g.dispose());
},true);
