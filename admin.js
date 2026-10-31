let items=[],selectedId=null,requests=[];
const fields=['title','number_count','ticket_price','status','description','prize1','prize2','prize3','draw_at','bank_name','beneficiary','clabe','payment_note'];
const prizeImageKeys=['prize1_image','prize2_image','prize3_image'];
let prizeImages={};
function refreshPrizePreview(i){
 const key=`prize${i}_image`,target=$(`prize${i}Preview`),url=prizeImages[key];
 target.replaceChildren();target.classList.toggle('empty',!url);
 if(url){const img=make('img');img.src=url;img.alt=`Imagen del premio ${i}`;img.loading='lazy';target.append(img);}
 else target.textContent='Sin imagen';
}
function resetPrizeImages(r){
 prizeImages={};for(let i=1;i<=3;i++){
  const key=`prize${i}_image`;prizeImages[key]=r?.[key]||null;
  $(`prize${i}File`).value='';refreshPrizePreview(i);
 }
}
async function uploadPrizeImage(i,file){
 const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 if(!allowed[file.type])throw Error(`Premio ${i}: usa una imagen JPG, PNG o WebP.`);
 if(file.size>5*1024*1024)throw Error(`Premio ${i}: la imagen debe pesar menos de 5 MB.`);
 const extension=allowed[file.type];
 const path=`${crypto.randomUUID()}.${extension}`;
 const {error}=await db.storage.from('raffle-prizes').upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw Error(`No se pudo subir la imagen ${i}: ${error.message}`);
 const {data}=db.storage.from('raffle-prizes').getPublicUrl(path);
 return data.publicUrl;
}
for(let i=1;i<=3;i++){
 $(`prize${i}File`).addEventListener('change',()=>{
  const f=$(`prize${i}File`).files[0];if(!f)return;
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(f.type)||f.size>5*1024*1024){notify('Imagen inválida. Selecciona JPG, PNG o WebP de máximo 5 MB.','error');$(`prize${i}File`).value='';return;}
  const target=$(`prize${i}Preview`);target.replaceChildren();target.classList.remove('empty');
  const img=make('img');img.src=URL.createObjectURL(f);img.alt=`Vista previa premio ${i}`;
  img.onload=()=>URL.revokeObjectURL(img.src);target.append(img);
 });
 $(`prize${i}Remove`).onclick=()=>{prizeImages[`prize${i}_image`]=null;$(`prize${i}File`).value='';refreshPrizePreview(i);};
}
function fill(r){const form=$('raffleForm');for(const name of fields){const el=form.elements.namedItem(name);el.value=(r?.[name]??(name==='number_count'?50:name==='status'?'draft':''));if(name==='draw_at'&&r?.draw_at)el.value=new Date(new Date(r.draw_at).getTime()-new Date(r.draw_at).getTimezoneOffset()*60000).toISOString().slice(0,16);}$('editorTitle').textContent=r?'Editar rifa: '+r.title:'Crear nueva rifa';resetPrizeImages(r);}
async function checkSession(){if(!db){notify('Configura config.js con los datos de Supabase.','error');return;}const {data:{session}}=await db.auth.getSession();if(!session){$('loginPanel').classList.remove('hidden');$('adminContent').classList.add('hidden');$('logout').classList.add('hidden');return;}try{const ok=await call('is_admin');if(!ok)throw Error('Tu cuenta no está autorizada como administradora.');$('loginPanel').classList.add('hidden');$('adminContent').classList.remove('hidden');$('logout').classList.remove('hidden');await loadAdmin();}catch(e){notify(errorMessage(e),'error');$('loginPanel').classList.remove('hidden');$('adminContent').classList.add('hidden');}}
function showList(){selectedId=null;$('raffleEditView').classList.add('hidden');$('raffleListView').classList.remove('hidden');renderRaffleCards();clearNotice();}
function showEditor(id=null){selectedId=id;const r=items.find(x=>x.id===id)||null;$('raffleListView').classList.add('hidden');$('raffleEditView').classList.remove('hidden');$('deleteRaffle').classList.toggle('hidden',!r);$('bookingsPanel').classList.toggle('hidden',!r);fill(r);if(r)loadRequests().catch(e=>notify(errorMessage(e),'error'));else{requests=[];renderRequests();}clearNotice();}
function renderRaffleCards(){const target=$('raffleCards');target.replaceChildren();if(!items.length){target.append(make('p','Todavía no tienes rifas. Haz clic en «Crear rifa» para empezar.','muted'));return;}
for(const r of items){const card=make('div',undefined,'raffle-card');const info=make('div');info.append(make('h3',r.title));const labels={active:'Activa',draft:'Oculta / borrador',closed:'Cerrada'};info.append(make('p',`${r.number_count} números · ${money(r.ticket_price)} por boleto`,'muted'));info.append(make('span',labels[r.status]||r.status,'raffle-tag '+r.status));const action=make('button','Editar / Administrar →','btn subtle');action.type='button';action.onclick=()=>showEditor(r.id);card.append(info,action);target.append(card);}}
async function loadAdmin(){items=await call('admin_list_raffles');showList();}
async function loadRequests(){requests=selectedId?await call('admin_list_bookings',{p_raffle:selectedId}):[];renderRequests();}
function renderRequests(){const tbody=$('bookings');tbody.replaceChildren();let paid=0,pending=0;for(const r of requests){if(r.status==='paid')paid++;else pending++;const tr=make('tr');for(const val of [String(r.number),r.customer_name,r.phone])tr.append(make('td',val));const stateTd=make('td');stateTd.append(make('span',r.status==='paid'?'Pagado':'Pendiente','status '+r.status));tr.append(stateTd,make('td',dateLabel(r.created_at)));const actions=make('td');const b=make('button',r.status==='paid'?'Revertir pago':'Confirmar pago','btn');b.onclick=()=>updateBooking(r,r.status==='paid'?'pending':'paid');actions.append(b);const x=make('button','Liberar','btn subtle');x.onclick=()=>removeBooking(r);actions.append(x);tr.append(actions);tbody.append(tr);}if(!requests.length){const tr=make('tr');const td=make('td','No hay registros.');td.colSpan=6;tr.append(td);tbody.append(tr);}$('paidCount').textContent=String(paid);$('pendingCount').textContent=String(pending);const raffle=items.find(r=>r.id===selectedId);$('revenue').textContent=money(paid*Number(raffle?.ticket_price||0));}
async function updateBooking(r,status){if(!await dialogBox({title:status==='paid'?'Confirmar pago':'Revertir pago',message:status==='paid'?`¿Verificaste en tu banco el pago del número ${r.number}?`:`El número ${r.number} volverá a pendiente y podrá ser reemplazado.`,confirmText:'Sí, continuar'}))return;try{await call('admin_set_booking_status',{p_booking:r.id,p_status:status});await loadRequests();notify('Estado actualizado.','success');}catch(e){notify(errorMessage(e),'error');}}
async function removeBooking(r){if(!await dialogBox({title:'Liberar número',message:`¿Liberar el número ${r.number}? Se eliminarán los datos de esta solicitud.`,confirmText:'Liberar',danger:true}))return;try{await call('admin_delete_booking',{p_booking:r.id});await loadRequests();notify('Número liberado.','success');}catch(e){notify(errorMessage(e),'error');}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const {error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)throw error;$('password').value='';clearNotice();await checkSession();}catch(e){notify(errorMessage(e),'error');}};
$('logout').onclick=async()=>{await db.auth.signOut();selectedId=null;await checkSession();};
$('backToList').onclick=showList;
$('newRaffle').onclick=()=>showEditor();
$('reloadBookings').onclick=async()=>{try{await loadRequests();notify('Participantes actualizados.','success');}catch(e){notify(errorMessage(e),'error');}};
$('deleteRaffle').onclick=async()=>{const r=items.find(x=>x.id===selectedId);if(!r)return;const count=requests.length;const accepted=await dialogBox({title:'Eliminar rifa definitivamente',message:`Eliminarás «${r.title}» y sus ${count} solicitudes, incluidos los pagos confirmados. Esta acción no se puede deshacer.`,confirmText:'Eliminar rifa',danger:true,requireText:'ELIMINAR'});if(!accepted)return;const btn=$('deleteRaffle');btn.disabled=true;try{await call('admin_delete_raffle',{p_raffle:r.id});items=await call('admin_list_raffles');showList();notify('La rifa y sus solicitudes se eliminaron correctamente.','success');}catch(e){notify(errorMessage(e),'error');}finally{btn.disabled=false;}};
$('raffleForm').onsubmit=async e=>{e.preventDefault();const btn=$('saveRaffle');btn.disabled=true;try{const form=$('raffleForm');const v={};for(const name of fields)v[name]=form.elements.namedItem(name).value.trim();v.number_count=Number(v.number_count);v.ticket_price=Number(v.ticket_price);v.draw_at=v.draw_at?new Date(v.draw_at).toISOString():null;
for(let i=1;i<=3;i++){
 const file=$(`prize${i}File`).files[0],key=`prize${i}_image`;
 v[key]=file?await uploadPrizeImage(i,file):prizeImages[key];
}
const id=await call('admin_save_raffle',{p_id:selectedId,p_data:v});items=await call('admin_list_raffles');showEditor(id);notify('Rifa guardada correctamente.','success');}catch(e){notify(errorMessage(e),'error');}finally{btn.disabled=false;}};
checkSession();
