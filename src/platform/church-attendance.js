import {guardForm} from '../form-lifecycle.js';
import {uiIcon} from '../ui/icons.js';
import './church-attendance.css';

export function churchAttendanceUI({api,e}){
 const base='/workspace/church-attendance';
 const CHURCH_DEFAULT = {
  address: 'Rua José Otávio da Fonseca, 228, Vila Isa, Governador Valadares, Minas Gerais, 35044-170, Brasil',
  lat: -18.888042,
  lon: -41.947946,
  radius: 180
 };
 let uid=null,enabled=false,timer=null,busy=false,generation=0,host=null,data=null,lastMessage='',filter='';
 let userLocation=null; // { lat, lon, accuracy, region_label, neighborhood, city, timestamp }
 const fmt=x=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(x));

 function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const a = toRad(lat1), b = toRad(lat2);
  const h = Math.sin((b - a) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
 }

 function message(value,error=false){
  lastMessage=value;
  const el=host?.isConnected&&host.querySelector('[data-ca-status]');
  if(el){el.textContent=value;el.setAttribute('role',error?'alert':'status');}
 }

 function stop(){generation++;clearTimeout(timer);timer=null;uid=null;enabled=false;busy=false;host=null;lastMessage='';filter='';userLocation=null;}

 function locate(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error('Este aparelho não oferece localização GPS. Procure a recepção.'));return;}
  navigator.geolocation.getCurrentPosition(resolve,err=>reject(Error(err.code===1?'Localização não autorizada. Libere a permissão de GPS nas configurações do aparelho.':err.code===3?'O GPS demorou a responder. Tente em local aberto ou procure a recepção.':'Não foi possível obter sua localização GPS. Tente novamente.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 });}

 async function detectUserRegion(forcePrompt=false){
  try{
   const p=await locate();
   const rev=await api(base+'/reverse-geocode?lat='+p.coords.latitude+'&lon='+p.coords.longitude).catch(()=>null);
   userLocation={
    lat:p.coords.latitude,
    lon:p.coords.longitude,
    accuracy:p.coords.accuracy,
    region_label:rev?.region_label||rev?.formatted_address||(p.coords.latitude.toFixed(4)+', '+p.coords.longitude.toFixed(4)),
    neighborhood:rev?.neighborhood||'',
    city:rev?.city||'',
    timestamp:Date.now()
   };
   updateUserLocationUI();
   if(host?.isConnected)renderServicesList();
   return userLocation;
  }catch(err){
   if(forcePrompt)message(err.message,true);
   return null;
  }
 }

 function updateUserLocationUI(){
  if(!host?.isConnected)return;
  const card=host.querySelector('[data-ca-geo-panel]');
  if(!card)return;
  const title=card.querySelector('[data-ca-geo-title]');
  const desc=card.querySelector('[data-ca-geo-desc]');
  const btn=card.querySelector('[data-ca-detect-location]');
  if(userLocation){
   if(title)title.textContent='Sua Região: '+(userLocation.region_label||'Detectada');
   if(desc)desc.textContent=`GPS: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)} · Precisão: ±${Math.round(userLocation.accuracy)}m`;
   if(btn)btn.textContent='🔄 Atualizar localização';
  }else{
   if(title)title.textContent='Sua Localização & Região';
   if(desc)desc.textContent='Identifique sua região para validar sua distância até os cultos de hoje.';
   if(btn)btn.textContent='📍 Detectar minha região';
  }
 }

 function schedule(){clearTimeout(timer);if(uid&&enabled&&!document.hidden)timer=setTimeout(()=>void automatic(),30000);}

 async function automatic(){
  if(!uid||!enabled||document.hidden||busy)return;
  const gen=generation;busy=true;
  try{
   const info=await api(base);if(gen!==generation)return;
   enabled=info.auto_enabled;
   if(!info.linked_member)return;
   const open=info.items.filter(r=>r.can_checkin&&!r.my_presence&&!r.automatic_blocked);
   if(!enabled||!open.length)return;
   const position=await locate();if(gen!==generation||document.hidden||!enabled)return;
   if(!userLocation||Date.now()-userLocation.timestamp>120000){
    const rev=await api(base+'/reverse-geocode?lat='+position.coords.latitude+'&lon='+position.coords.longitude).catch(()=>null);
    userLocation={
     lat:position.coords.latitude,
     lon:position.coords.longitude,
     accuracy:position.coords.accuracy,
     region_label:rev?.region_label||rev?.formatted_address||'',
     neighborhood:rev?.neighborhood||'',
     city:rev?.city||'',
     timestamp:Date.now()
    };
    updateUserLocationUI();
   }
   let issue='';
   for(const row of open){
    if(gen!==generation||!enabled)break;
    try{
     const res=await api(base+'/'+row.id+'/check-in',{method:'POST',body:{automatic:true,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,captured_at:position.timestamp,region_label:userLocation?.region_label||''}});
     if(gen!==generation)return;
     message(`Presença confirmada em ${row.title}! Detectado em: ${res.region_label||userLocation?.region_label||'Local do culto'} (${res.distance_m||0}m).`);
    }catch(err){if(['location','window','withdrawn'].includes(err.code)){issue=err.message;continue;}throw err;}
   }
   if(issue)message(issue,true);
   if(host?.isConnected)await refresh();
  }catch(err){if(gen===generation){message(err.message,true);if(err.status===401){stop();return;}}}
  finally{if(gen===generation){busy=false;schedule();}}
 }

 async function setUser(id){
  if(uid===id)return;stop();if(!id)return;uid=id;const gen=generation;
  try{const info=await api(base);if(gen!==generation)return;enabled=info.auto_enabled;if(enabled)void automatic();}catch{}
 }

 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(enabled)void automatic();});
 window.addEventListener('pagehide',stop);

 function field(label,name,type='text',value='',extra=''){return `<label>${e(label)}<input name="${name}" type="${type}" value="${e(value)}" required ${extra}></label>`;}
 function localValue(x){const date=new Date(x);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date).replace(' ','T');}

 function modal(title,content,submit){
  const d=document.createElement('dialog');d.className='ca-dialog';d.innerHTML=`<form><h2>${e(title)}</h2>${content}<p data-error role="alert"></p><div class="ca-actions"><button type="button" data-close class="secondary">Voltar</button><button type="submit">Salvar</button></div></form>`;
  document.body.append(d);const form=d.querySelector('form');const guard=guardForm(form);
  d.querySelector('[data-close]').onclick=()=>d.close();
  d.addEventListener('close',()=>d.remove(),{once:true});
  form.onsubmit=async ev=>{
   ev.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;
   button.disabled=true;guard.setBusy(true);
   try{await submit(Object.fromEntries(new FormData(form)),form);guard.complete();d.close();await refresh();}
   catch(err){form.querySelector('[data-error]').textContent=err.message;}
   finally{guard.setBusy(false);button.disabled=false;}
  };
  d.showModal();return d;
 }

 function edit(row){
  const rid=row?.id||crypto.randomUUID();
  const initLat=Number(row?.latitude)||CHURCH_DEFAULT.lat;
  const initLon=Number(row?.longitude)||CHURCH_DEFAULT.lon;
  const initRad=Number(row?.radius_m)||CHURCH_DEFAULT.radius;

  const content=`
   <div class="ca-fields">
    <div class="full-width">${field('Nome do culto','title','text',row?.title||'','maxlength="120" placeholder="Ex.: Culto de Celebração, Culto da Família"')}</div>
    <div class="full-width ca-map-search-wrap">
     <label>Buscar endereço / local no Google Maps
      <div class="ca-map-search-bar">
       <input type="search" data-ca-search-input placeholder="Digite o endereço ou bairro (ex: Lagoinha Centro, Rua...)" autocomplete="off">
       <button type="button" class="secondary" data-ca-search-btn>Buscar no mapa</button>
      </div>
     </label>
     <ul class="ca-search-dropdown" data-ca-search-dropdown hidden></ul>
    </div>
    <div class="ca-map-box" id="ca-edit-map"></div>
    <div class="ca-map-toolbar">
     <button type="button" class="secondary" data-center>📍 Usar meu GPS atual</button>
     <div class="ca-map-toolbar-links">
      <a data-ca-gmap-external href="https://www.google.com/maps/search/?api=1&query=${initLat},${initLon}" target="_blank" rel="noopener noreferrer" class="ca-gmap-link">🗺️ Ver no Google Maps</a>
      <a data-ca-gmap-directions href="https://www.google.com/maps/dir/?api=1&destination=${initLat},${initLon}" target="_blank" rel="noopener noreferrer" class="ca-gmap-link">🚗 Rotas Google Maps</a>
     </div>
    </div>
    <div class="ca-map-detected-label" data-ca-geo-detected>Arraste o pin no mapa ou clique para ajustar o local exato do culto.</div>
    <div class="full-width">${field('Local / endereço','location','text',row?.location||CHURCH_DEFAULT.address,'maxlength="180" placeholder="Rua, número e bairro"')}</div>
    ${field('Início · horário de Brasília','starts_at','datetime-local',row?localValue(row.starts_at):'')}
    ${field('Fim · horário de Brasília','ends_at','datetime-local',row?localValue(row.ends_at):'')}
    ${field('Latitude do local','latitude','number',initLat.toFixed(6),'step="any" min="-90" max="90"')}
    ${field('Longitude do local','longitude','number',initLon.toFixed(6),'step="any" min="-180" max="180"')}
    ${field('Raio de tolerância (metros)','radius_m','number',initRad,'min="30" max="1000"')}
    ${field('Abrir antes do início · minutos','early_minutes','number',row?Math.round((new Date(row.starts_at)-new Date(row.opens_at))/60000):45,'min="0" max="180"')}
    ${field('Fechar após o início · minutos','late_minutes','number',row?Math.round((new Date(row.closes_at)-new Date(row.starts_at))/60000):150,'min="0" max="480"')}
   </div>
  `;

  const d=modal(row?'Editar culto':'Novo culto',content,async f=>{
   const body={...f,request_id:rid,version:row?.version||1};
   for(const key of ['latitude','longitude','radius_m','early_minutes','late_minutes'])body[key]=Number(body[key]);
   await api(base+(row?'/'+rid:''),{method:row?'PUT':'POST',body});
   message('Culto salvo com sucesso.');
  });

  const form=d.querySelector('form');

  // Initialize Leaflet Map
  setTimeout(async()=>{
   const mapContainer=d.querySelector('#ca-edit-map');
   if(!mapContainer)return;
   let L;try{({L}=await import('./map-library.js'));}catch{mapContainer.textContent='O mapa não carregou. Você ainda pode informar endereço, latitude e longitude nos campos abaixo.';return;}
   if(!d.isConnected||!d.open)return;

   const map=L.map(mapContainer,{center:[initLat,initLon],zoom:16,attributionControl:false});

   const googleRoads=L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',{maxZoom:20});
   const googleHybrid=L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{maxZoom:20});
   const osmStandard=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});

   googleRoads.addTo(map);

   L.control.layers({
    'Google Mapa':googleRoads,
    'Google Satélite':googleHybrid,
    'OpenStreetMap':osmStandard
   },null,{position:'topright'}).addTo(map);

   const churchPinIcon=L.divIcon({
    className:'ca-church-pin-icon',
    html:'<div class="ca-pin-badge"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20M7 21V9l5-5 5 5v12H7z"/></svg></div><div class="ca-pin-pointer"></div>',
    iconSize:[36,44],
    iconAnchor:[18,44]
   });

   const marker=L.marker([initLat,initLon],{draggable:true,icon:churchPinIcon}).addTo(map);
   const circle=L.circle([initLat,initLon],{radius:initRad,color:'#e11d48',fillColor:'#f43f5e',fillOpacity:0.18,weight:2}).addTo(map);

   let revTimer=null;
   d.addEventListener('close',()=>{clearTimeout(revTimer);map.remove();},{once:true});
   function updateCoords(lat,lon,shouldReverse=true){
    marker.setLatLng([lat,lon]);
    circle.setLatLng([lat,lon]);
    form.elements.latitude.value=lat.toFixed(6);
    form.elements.longitude.value=lon.toFixed(6);

    const linkMap=d.querySelector('[data-ca-gmap-external]');
    if(linkMap)linkMap.href=`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    const linkDir=d.querySelector('[data-ca-gmap-directions]');
    if(linkDir)linkDir.href=`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

    if(shouldReverse){
     clearTimeout(revTimer);
     revTimer=setTimeout(async()=>{
      if(!d.isConnected||!d.open)return;
      try{
       const rev=await api(base+'/reverse-geocode?lat='+lat+'&lon='+lon);
       if(rev){
        const labelEl=d.querySelector('[data-ca-geo-detected]');
        if(labelEl)labelEl.textContent='Região identificada: '+(rev.region_label||rev.neighborhood||rev.city||'');
        if(!form.elements.location.value||form.elements.location.dataset.autofilled==='1'){
         form.elements.location.value=rev.display_name||rev.formatted_address||rev.region_label||'';
         form.elements.location.dataset.autofilled='1';
        }
       }
      }catch{}
     },400);
    }
   }

   marker.on('drag',ev=>{
    const p=ev.target.getLatLng();
    circle.setLatLng(p);
    form.elements.latitude.value=p.lat.toFixed(6);
    form.elements.longitude.value=p.lng.toFixed(6);
   });
   marker.on('dragend',ev=>{
    const p=ev.target.getLatLng();
    updateCoords(p.lat,p.lng,true);
   });
   map.on('click',ev=>{
    updateCoords(ev.latlng.lat,ev.latlng.lng,true);
   });

   form.elements.radius_m.addEventListener('input',ev=>{
    const r=Number(ev.target.value)||150;
    circle.setRadius(r);
   });

   const updateFromInputs=()=>{
    const lat=Number(form.elements.latitude.value);
    const lon=Number(form.elements.longitude.value);
    if(!isNaN(lat)&&!isNaN(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180){
     map.setView([lat,lon]);
     updateCoords(lat,lon,false);
    }
   };
   form.elements.latitude.addEventListener('change',updateFromInputs);
   form.elements.longitude.addEventListener('change',updateFromInputs);

   // Google Maps / Address Search
   const searchInput=d.querySelector('[data-ca-search-input]');
   const searchBtn=d.querySelector('[data-ca-search-btn]');
   const dropdown=d.querySelector('[data-ca-search-dropdown]');

   async function doSearch(){
    const q=searchInput.value.trim();
    if(!q)return;
    searchBtn.disabled=true;
    try{
     const items=await api(base+'/geocode?q='+encodeURIComponent(q));
     if(!items||!items.length){
      dropdown.innerHTML='<li class="ca-dropdown-empty">Nenhum local encontrado no Google Maps. Tente outro endereço.</li>';
      dropdown.hidden=false;
      return;
     }
     dropdown.innerHTML=items.map((it,idx)=>`
      <li class="ca-dropdown-item" data-idx="${idx}">
       <strong>${e(it.location_name||it.neighborhood||'Local')}</strong>
       <small>${e(it.address||it.display_name)}</small>
      </li>
     `).join('');
     dropdown.hidden=false;
     dropdown.querySelectorAll('.ca-dropdown-item').forEach(el=>{
      el.onclick=()=>{
       const it=items[Number(el.dataset.idx)];
       if(it){
        form.elements.location.value=it.address||it.display_name;
        form.elements.location.dataset.autofilled='1';
        map.setView([it.latitude,it.longitude],17);
        updateCoords(it.latitude,it.longitude,false);
        dropdown.hidden=true;
        const labelEl=d.querySelector('[data-ca-geo-detected]');
        if(labelEl)labelEl.textContent='Região identificada: '+(it.region_label||it.neighborhood||it.city);
       }
      };
     });
    }catch(err){
     dropdown.innerHTML=`<li class="ca-dropdown-empty">${e(err.message)}</li>`;
     dropdown.hidden=false;
    }finally{searchBtn.disabled=false;}
   }

   if(searchBtn)searchBtn.onclick=doSearch;
   if(searchInput)searchInput.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();doSearch();}};

   // GPS Button
   const centerBtn=d.querySelector('[data-center]');
   if(centerBtn){
    centerBtn.onclick=async()=>{
     centerBtn.disabled=true;
     try{
      const p=await locate();
      if(!d.isConnected||!d.open)return;
      map.setView([p.coords.latitude,p.coords.longitude],17);
      updateCoords(p.coords.latitude,p.coords.longitude,true);
     }catch(err){
      d.querySelector('[data-error]').textContent=err.message;
     }finally{centerBtn.disabled=false;}
    };
   }

   map.invalidateSize();
  },100);
 }

 async function roster(row,page=1){
  const result=await api(base+'/'+row.id+'/presences?page='+page);
  const d=document.createElement('dialog');d.className='ca-dialog';
  d.innerHTML=`
   <h2>${e(row.title)}</h2>
   <p>${result.total} presença(s) confirmada(s)</p>
   <div class="ca-scroll">
    <table>
     <thead><tr><th>Membro</th><th>Validação & Região</th><th>Horário</th><th></th></tr></thead>
     <tbody>${result.items.map(r=>`
      <tr>
       <td><strong>${e(r.name)}</strong></td>
       <td>
        ${r.method==='location'
          ?`<span class="ca-roster-pill">📍 Localização ${r.reason?`<small>(${e(r.reason)})</small>`:''}</span>`
          :`<span class="ca-roster-pill manual">👤 Recepção ${r.reason?`<small>(${e(r.reason)})</small>`:''}</span>`
        }
       </td>
       <td>${e(fmt(r.checked_at))}</td>
       <td>${data.can_remove_others?`<button type="button" class="secondary" data-remove="${e(r.person_id)}">Remover</button>`:''}</td>
      </tr>
     `).join('')}</tbody>
    </table>
   </div>
   <p data-error role="alert"></p>
   <div class="ca-actions">
    ${page>1?'<button class="secondary" data-prev>Anterior</button>':''}
    ${result.total>page*50?'<button class="secondary" data-next>Próxima</button>':''}
    <button data-close>Fechar</button>
   </div>
  `;
  document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.querySelector('[data-close]').onclick=()=>d.close();
  for(const [key,next] of [['prev',page-1],['next',page+1]]){
   const b=d.querySelector('[data-'+key+']');
   if(b)b.onclick=()=>{d.close();void roster(row,next).catch(err=>message(err.message,true));};
  }
  d.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{
   if(!confirm('Remover esta presença? O histórico da alteração será preservado.'))return;
   b.disabled=true;
   try{
    await api(base+'/'+row.id+'/presences/'+encodeURIComponent(b.dataset.remove),{method:'DELETE'});
    d.close();await refresh();await roster(row,page);
   }catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}
  });
  d.showModal();
 }

 function manual(row){
  const d=modal('Confirmação pela recepção',`
   <label>Buscar membro<input data-search minlength="2" placeholder="Digite pelo menos 2 letras"></label>
   <button type="button" class="secondary" data-find>Buscar</button>
   <label>Membro<select aria-label="Membro" name="person_id" required><option value="">Selecione após buscar</option></select></label>
   <label>Motivo da confirmação manual<textarea name="reason" minlength="10" maxlength="300" required placeholder="Ex.: GPS indisponível, conferido na recepção"></textarea></label>
  `,async f=>{await api(base+'/'+row.id+'/manual',{method:'POST',body:f});message('Presença registrada pela recepção.');});

  d.querySelector('[data-find]').onclick=async ev=>{
   const b=ev.currentTarget,q=d.querySelector('[data-search]').value.trim();
   if(q.length<2){d.querySelector('[data-error]').textContent='Digite pelo menos 2 letras.';return;}
   b.disabled=true;
   try{
    const rows=await api(base+'/people/search?q='+encodeURIComponent(q));
    d.querySelector('select').innerHTML=rows.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('');
    d.querySelector('[data-error]').textContent=rows.length?'':'Nenhum membro encontrado.';
   }catch(err){d.querySelector('[data-error]').textContent=err.message;}finally{b.disabled=false;}
  };
 }

 function renderServicesList(){
  const target=host;if(!target?.isConnected||!data)return;
  const listEl=target.querySelector('[data-ca-list]');if(!listEl)return;

  if(!data.items.length){
   listEl.innerHTML='<p class="ca-empty">Nenhum culto cadastrado neste período. A liderança pode adicionar a programação.</p>';
   return;
  }

  listEl.innerHTML=data.items.map(r=>{
   let distBadge='';
   if(userLocation&&r.latitude&&r.longitude){
    const d=haversineMeters(userLocation.lat,userLocation.lon,r.latitude,r.longitude);
    const inside=d<=r.radius_m;
    const dStr=d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m';
    distBadge=`<div class="ca-distance-pill ${inside?'inside':'outside'}">${inside?`✅ Você está no local do culto (${dStr} de distância · raio de ${r.radius_m}m)`:`📍 Você está a ${dStr} do local (fora do raio permitido de ${r.radius_m}m)`}</div>`;
   }

   const gmapLinks=`
    <div class="ca-gmap-links">
     <a href="https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}" target="_blank" rel="noopener noreferrer" class="ca-gmap-link">🗺️ Google Maps</a>
     <a href="https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}" target="_blank" rel="noopener noreferrer" class="ca-gmap-link">🚗 Rotas</a>
    </div>
   `;

   return `
    <article class="ca-service">
     <div>
      <h3>${e(r.title)} ${!r.active?'<small>Cancelado</small>':''}</h3>
      <p>📅 ${e(fmt(r.starts_at))} · 📍 <strong>${e(r.location)}</strong></p>
      ${gmapLinks}
      <p>Check-in liberado: ${e(fmt(r.opens_at))} até ${e(fmt(r.closes_at))}</p>
      ${distBadge}
      <p><strong>${r.my_presence?'Sua presença está confirmada':r.can_checkin?'Check-in aberto':'Fora da janela de check-in'}</strong></p>
      ${data.manager?`<p>${r.present_count} presença(s) registrada(s) · Raio geofence: ${r.radius_m}m</p>`:''}
     </div>
     <div class="ca-actions">
      ${!r.my_presence&&r.can_checkin?`<button data-ca-in="${e(r.id)}">Confirmar minha presença</button>`:''}
      ${r.my_presence?`<button class="secondary" data-ca-own="${e(r.id)}">Remover minha presença</button>`:''}
      ${data.manager?`<button class="secondary" data-ca-roster="${e(r.id)}">Lista de presença</button>${r.active?`<button class="secondary" data-ca-edit="${e(r.id)}">Editar</button><button class="secondary" data-ca-manual="${e(r.id)}">Confirmar membro</button><button class="secondary" data-ca-cancel="${e(r.id)}">Cancelar culto</button>`:''}`:''}
     </div>
    </article>
   `;
  }).join('');
 }

 async function refresh(){
  const target=host;if(!target?.isConnected)return;
  const info=await api(base+filter);if(target!==host||!target.isConnected)return;
  data=info;enabled=info.auto_enabled;if(info?.my_user_id&&!uid)uid=info.my_user_id;

  target.querySelector('[data-ca-auto]').textContent=enabled?'Desativar check-in automático':'Ativar check-in automático';
  target.querySelector('[data-ca-auto]').disabled=!info.linked_member&&!enabled;
  target.querySelector('[data-ca-new]').hidden=!info.manager;
  target.querySelector('[data-ca-member]').hidden=info.linked_member;

  updateUserLocationUI();
  renderServicesList();
 }

 async function mount(target){
  host=target;
  target.innerHTML=`
   <section class="panel ca-panel">
    <h1>${uiIcon('schedules',28)} Presença nos cultos</h1>
    <p>Confirme sua participação no local e horário do culto através da geolocalização vinculada ao Google Maps.</p>

    <!-- Member Geolocation & Region Card -->
    <div class="ca-geo-card" data-ca-geo-panel>
     <div class="ca-geo-card-main">
      <span class="ca-geo-card-icon">📍</span>
      <div class="ca-geo-card-info">
       <strong data-ca-geo-title>Sua Localização & Região</strong>
       <p data-ca-geo-desc>Identifique sua região para validar a distância até os cultos de hoje.</p>
      </div>
     </div>
     <button type="button" class="secondary ca-geo-card-btn" data-ca-detect-location>📍 Detectar minha região</button>
    </div>

    <div class="ca-actions">
     <button data-ca-auto>Carregando…</button>
     <button class="secondary" data-ca-new hidden>Novo culto</button>
     <button class="secondary" data-ca-refresh>Atualizar</button>
    </div>

    <details class="ca-info">
     <summary>Como funciona o check-in por geolocalização e automático</summary>
     <p>O aplicativo utiliza o GPS do seu aparelho integrado aos mapas do Google Maps para certificar que você está presente no templo. A localização é consultada somente durante a janela do culto e não grava histórico de deslocamentos fora do horário de serviço.</p>
    </details>

    <p data-ca-member hidden>Complete e vincule seu cadastro de membro para registrar sua presença. A liderança pode ajudar.</p>

    <form data-ca-filter class="ca-filter">
     <label>De<input type="date" name="start"></label>
     <label>Até<input type="date" name="end"></label>
     <button type="submit" class="secondary">Filtrar</button>
    </form>

    <p data-ca-status role="status">${e(lastMessage)}</p>
    <div data-ca-list>Carregando cultos…</div>
   </section>
  `;

  target.querySelector('[data-ca-filter]').onsubmit=ev=>{
   ev.preventDefault();
   filter='?'+new URLSearchParams(new FormData(ev.currentTarget));
   void refresh().catch(err=>message(err.message,true));
  };

  target.querySelector('[data-ca-detect-location]').onclick=async ev=>{
   const btn=ev.currentTarget;
   btn.disabled=true;btn.textContent='Detectando GPS…';
   try{
    const res=await detectUserRegion(true);
    if(res)message(`Região identificada: ${res.region_label}`);
   }catch(err){message(err.message,true);}
   finally{btn.disabled=false;}
  };

  target.onclick=async ev=>{
   const b=ev.target.closest('button');if(!b||b.closest('[data-ca-filter]')||b.disabled||b.hasAttribute('data-ca-detect-location'))return;
   const gen=generation;
   try{
    if(b.hasAttribute('data-ca-new')){edit();return;}
    if(b.hasAttribute('data-ca-refresh')){await refresh();return;}
    if(b.hasAttribute('data-ca-auto')){
     b.disabled=true;
     if(!enabled&&!confirm('Autorizar check-in automático enquanto o app estiver aberto? Sua localização será consultada apenas durante o horário dos cultos para validar sua presença.'))return;
     const next=!enabled;
     if(next)await locate();if(gen!==generation)return;
     await api(base+'/preferences/automatic',{method:'PATCH',body:{enabled:next}});
     enabled=next;
     message(next?'Automático ativado. Mantenha o app aberto durante a chegada ao templo.':'Automático desativado.');
     await refresh();
     if(enabled)void automatic();else clearTimeout(timer);
     return;
    }

    const id=Object.entries(b.dataset).find(([k])=>k.startsWith('ca')&&b.dataset[k])?.[1];
    const row=data?.items.find(r=>r.id===id);if(!row)return;

    if(b.hasAttribute('data-ca-edit'))edit(row);
    if(b.hasAttribute('data-ca-roster'))await roster(row);
    if(b.hasAttribute('data-ca-manual'))manual(row);
    if(b.hasAttribute('data-ca-cancel')&&confirm('Cancelar este culto? As presenças já registradas serão preservadas.')){
     b.disabled=true;await api(base+'/'+id+'?version='+row.version,{method:'DELETE'});await refresh();
    }
    if(b.hasAttribute('data-ca-own')&&confirm('Remover sua presença deste culto?')){
     b.disabled=true;await api(base+'/'+id+'/presences/'+encodeURIComponent(data.my_person_id),{method:'DELETE'});await refresh();
    }
    if(b.hasAttribute('data-ca-in')){
     b.disabled=true;
     const p=await locate();if(gen!==generation)return;
     if(!userLocation||Date.now()-userLocation.timestamp>120000){
      const rev=await api(base+'/reverse-geocode?lat='+p.coords.latitude+'&lon='+p.coords.longitude).catch(()=>null);
      userLocation={
       lat:p.coords.latitude,
       lon:p.coords.longitude,
       accuracy:p.coords.accuracy,
       region_label:rev?.region_label||rev?.formatted_address||'',
       neighborhood:rev?.neighborhood||'',
       city:rev?.city||'',
       timestamp:Date.now()
      };
      updateUserLocationUI();
     }
     const res=await api(base+'/'+id+'/check-in',{
      method:'POST',
      body:{
       latitude:p.coords.latitude,
       longitude:p.coords.longitude,
       accuracy:p.coords.accuracy,
       captured_at:p.timestamp,
       region_label:userLocation?.region_label||''
      }
     });
     message(`🎉 Presença confirmada! Local detectado: ${res.region_label||userLocation?.region_label||'Igreja'} (${res.distance_m||0}m do culto).`);
     await refresh();
    }
   }catch(err){message(err.message,true);}finally{if(b.isConnected)b.disabled=false;}
  };

  try{
   await refresh();
   if(enabled)void automatic();
   // Pre-detect position silently if permission was already granted
   if(navigator.permissions){
    navigator.permissions.query({name:'geolocation'}).then(status=>{
     if(status.state==='granted')void detectUserRegion(false);
    }).catch(()=>{});
   }
  }catch(err){message(err.message,true);}
 }

 return {mount,setUser,stop};
}
