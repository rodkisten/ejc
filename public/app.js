import { drawQR } from './qr.js';

const $ = (selector,base=document) => base.querySelector(selector);
const $$ = (selector,base=document) => [...base.querySelectorAll(selector)];
const app=$('#app');
const currency=(n)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(n)||0)/100);
const escapeHtml=(x)=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const escAttr=escapeHtml;
const statusName={pending:'Aguardando Pix',claimed:'Conferir Pix',paid:'Pago',preparing:'Preparando',delivered:'Entregue',cancelled:'Cancelado'};
const localKey='ejc-last-order-token';
const state={public:null,recipientId:'',cart:{},sender:'',orderToken:'',order:null,poll:null,admin:null,section:'orders',selectedOrder:'',recording:null,recordTimer:null,messageTimer:null};
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('visible'),4300);}
function loading(text='Carregando...'){app.innerHTML=`<div class="loading-screen"><span class="spinner"></span>${escapeHtml(text)}</div>`;}
async function api(url,{method='GET',body,auth,headers,...opts}={}){
  const options={method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{'Authorization':`Bearer ${auth}`} :{}),...(headers||{})},...opts};
  if(body!==undefined) options.body=JSON.stringify(body);
  const res=await fetch(url,options);
  if(!res.ok){let message=`Erro HTTP ${res.status}`;try{message=(await res.json()).error||message;}catch{}throw new Error(message);}
  if(res.status===204)return null;
  return res.json();
}
const safely=async(fn)=>{try{await fn();}catch(e){notify(e.message||'Não foi possível concluir.');console.error(e);}};
const deadlineText=(value)=>value ? new Date(value+':00-03:00').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'full',timeStyle:'short'}):'Não configurado';
const startHtml=(admin=false)=>`<main class="container ${admin?'admin-container':''}"><header class="top"><div class="brand"><a href="/">Mini Mercado <em>✳</em></a></div><span class="chip">XX EJC · SIMONÉSIA</span></header><div id="main"></div><footer class="footer">Feito com carinho para o XX EJC de Simonésia · 💌</footer></main>`;
const wrap=(html,admin=false)=>{app.innerHTML=startHtml(admin);$('#main').innerHTML=html;};
function clearTimers(){clearInterval(state.poll);clearInterval(state.recordTimer);clearTimeout(state.messageTimer);state.poll=null;state.recordTimer=null;state.messageTimer=null;}
function attachQR(el,value,size=220){try{drawQR(value,$(el),size);}catch(e){console.error(e);$(el).textContent='Não foi possível gerar o QR Code. Use o código Pix Copia e Cola.';}}
function copy(text){return navigator.clipboard.writeText(text).then(()=>notify('Copiado!')).catch(()=>{const el=document.createElement('textarea');el.value=text;document.body.append(el);el.select();document.execCommand('copy');el.remove();notify('Copiado!');});}
const lastOrder=()=>{try{return localStorage.getItem(localKey)}catch{return null}};
const rememberOrder=(t)=>{try{localStorage.setItem(localKey,t)}catch{}};
async function home(){
  clearTimers();loading();
  state.public=await api('/api/public');
  const {config,recipients,products}=state.public;
  wrap(`<section class="hero"><p class="eyebrow">XX EJC SIMONÉSIA · 2026</p><div class="heart">💌</div><h1>Um carinho que<br>chega até você.</h1><p>${escapeHtml(config.store_subtitle)}</p><span class="chip">✦ Surpreenda um encontrista</span></section>
    ${lastOrder()?`<div class="callout spaced"><div class="row between wrap"><span>💜 Você já iniciou uma homenagem?</span><button id="resume" class="btn secondary small-btn">Continuar pedido</button></div></div>`:''}
    <section class="admin-section"><div class="step"><b>1</b> Escolha quem vai receber</div><input id="search" type="search" placeholder="Pesquisar encontrista pelo nome" autocomplete="off" aria-label="Buscar encontrista"><div id="recipients" class="persons spaced"></div></section>
    <section class="admin-section"><div class="step"><b>2</b> Escolha um presente</div><div class="grid" id="products"></div></section>
    <section class="admin-section"><div class="step"><b>3</b> Identifique a homenagem</div><div class="card"><label for="sender">Seu nome (opcional)</label><input id="sender" placeholder="Como deseja assinar o presente?" maxlength="100" value="${escAttr(state.sender)}"><p class="muted small" style="margin-top:9px;margin-bottom:0">Você poderá escrever, enviar fotos e gravar áudios depois da confirmação do pagamento.</p></div></section>
    <div id="checkout-bar" class="selectbar"><div><strong id="cart-total">${currency(0)}</strong><div class="small" id="chosen-person">Escolha um destinatário e um presente</div></div><button id="checkout" class="btn" disabled>Gerar Pix ↗</button></div>
    <p class="muted small center spaced">As homenagens serão encerradas em <strong>${escapeHtml(deadlineText(config.deadline))}</strong>, com horário configurável pela coordenação. Horário de Brasília.</p>`);
  if(lastOrder()) $('#resume').addEventListener('click',()=>location.hash=`pedido=${lastOrder()}`);
  const drawPeople=()=>{
    const q=$('#search').value.trim().toLocaleLowerCase('pt-BR');
    const matches=recipients.filter(r=>r.name.toLocaleLowerCase('pt-BR').includes(q)).slice(0,70);
    $('#recipients').innerHTML=matches.length?matches.map(r=>`<button type="button" class="person" data-recipient="${escAttr(r.id)}" aria-pressed="${r.id===state.recipientId}"><span>${escapeHtml(r.name)}</span><span>${r.id===state.recipientId?'✓':'♡'}</span></button>`).join(''):'<p class="muted">Nenhum encontrista encontrado.</p>';
    $$('[data-recipient]').forEach(b=>b.onclick=()=>{state.recipientId=b.dataset.recipient;drawPeople();updateCheckout();});
  };
  const drawProducts=()=>{
    $('#products').innerHTML=products.map(p=>`<article class="card product"><div class="emoji">${escapeHtml(p.emoji||'🎁')}</div><h3>${escapeHtml(p.name)}</h3><p class="muted" style="margin:0;min-height:18px">${escapeHtml(p.description)}</p><div class="row between"><span class="price">${currency(p.price_cents)}</span><div class="qty"><button aria-label="Remover ${escAttr(p.name)}" data-dec="${p.id}">−</button><b>${state.cart[p.id]||0}</b><button aria-label="Adicionar ${escAttr(p.name)}" data-inc="${p.id}">+</button></div></div></article>`).join('')||'<div class="callout warning">A coordenação ainda não cadastrou os produtos.</div>';
    $$('[data-inc]').forEach(b=>b.onclick=()=>{state.cart[b.dataset.inc]=Math.min(20,(state.cart[b.dataset.inc]||0)+1);drawProducts();updateCheckout();});
    $$('[data-dec]').forEach(b=>b.onclick=()=>{state.cart[b.dataset.dec]=Math.max(0,(state.cart[b.dataset.dec]||0)-1);drawProducts();updateCheckout();});
  };
  function updateCheckout(){const person=recipients.find(r=>r.id===state.recipientId),total=products.reduce((s,p)=>s+p.price_cents*(state.cart[p.id]||0),0);
    $('#cart-total').textContent=currency(total);$('#chosen-person').textContent=person?`Para ${person.name}`:'Escolha o encontrista';
    $('#checkout').disabled=!person||total<=0||!config.payments_ready||!config.open||Date.now()>=new Date(config.deadline+':00-03:00').getTime();
    $('#checkout').textContent=!config.payments_ready?'Pix ainda não configurado':'Gerar Pix ↗';
  }
  $('#search').addEventListener('input',drawPeople);
  $('#sender').addEventListener('input',e=>state.sender=e.target.value);
  $('#checkout').addEventListener('click',()=>safely(async()=>{
    const b=$('#checkout');b.disabled=true;b.textContent='Gerando pedido...';
    try{
      const items=Object.entries(state.cart).filter(([,q])=>q>0).map(([product_id,quantity])=>({product_id,quantity}));
      const data=await api('/api/orders',{method:'POST',body:{recipient_id:state.recipientId,sender_name:state.sender,items}});
      rememberOrder(data.token);location.hash=`pedido=${data.token}`;
    } finally{b.disabled=false;}
  }));
  drawPeople();drawProducts();updateCheckout();
}
async function loadOrder(){
  clearTimers();const t=location.hash.match(/^#pedido=([A-Za-z0-9_-]{40,100})$/)?.[1];
  if(!t){location.hash='';return;}
  state.orderToken=t;rememberOrder(t);loading('Abrindo sua homenagem...');
  const data=await api('/api/order',{auth:t});state.order=data;
  renderOrder();
  state.poll=setInterval(async()=>{
    if(location.hash!==`#pedido=${t}` || state.recording) return;
    try{const fresh=await api('/api/order',{auth:t});
      if(fresh.status!==state.order.status){state.order=fresh;renderOrder();}
    }catch(e){console.warn('Falha na atualização',e.message);}
  },12000);
}
function orderQrUrl(){return new URL(`/admin?order=${encodeURIComponent(state.order.id)}`,location.origin).toString();}
function renderOrder(){
  const o=state.order;const paid=['paid','preparing','delivered'].includes(o.status);
  const finished=Date.now()>=new Date(o.deadline+':00-03:00').getTime();
  const link=`${location.origin}/#pedido=${state.orderToken}`;
  wrap(`<div class="row between wrap"><span class="chip ${paid?'ok':'warn'}">${paid?'✓ PAGAMENTO CONFIRMADO':'⏳ AGUARDANDO PAGAMENTO'}</span><span class="muted small mono">${escapeHtml(o.id)}</span></div>
    <section class="admin-section"><p class="eyebrow">Sua homenagem é para</p><h1>${escapeHtml(o.recipient_name)} 💜</h1><p class="muted">${o.items.map(i=>`${i.quantity}× ${escapeHtml(i.product_name)}`).join(' · ')}</p><div class="row between"><strong>Valor do pedido</strong><strong style="font-size:22px">${currency(o.amount_cents)}</strong></div></section>
    ${paid?editorHtml(o,finished):paymentHtml(o)}
    <section class="card spaced"><h3>Guarde seu link privado 🔐</h3><p class="muted small">Você pode voltar para acompanhar o pedido e, depois do pagamento, continuar sua homenagem em outro momento. Qualquer pessoa que receber este link poderá acessar suas mensagens.</p><button class="btn secondary full" id="share-link">Copiar link privado</button></section>
    <section class="card spaced"><h3>Identificação do pedido</h3><p class="muted small">Mostre este QR Code para a coordenação localizar seu pedido. Ele não comprova pagamento.</p><div class="qr" id="admin-order-qr"></div><p class="small mono center">${escapeHtml(o.id)}</p></section>`);
  attachQR('#admin-order-qr',orderQrUrl(),176);
  $('#share-link').onclick=()=>copy(link);
  if(!paid){attachQR('#pix-qr',o.pix_code,238);$('#copy-pix').onclick=()=>copy(o.pix_code);$('#claimed').onclick=()=>safely(async()=>{await api('/api/order/claim',{method:'POST',auth:state.orderToken,body:{}});state.order=await api('/api/order',{auth:state.orderToken});renderOrder();notify('Solicitação recebida. A coordenação verificará o extrato.');});$('#refresh').onclick=()=>safely(async()=>{state.order=await api('/api/order',{auth:state.orderToken});renderOrder();});}
  else if(!finished) bindEditor();
}
function paymentHtml(o){return `<div class="card"><h2>Pague com Pix</h2><p class="muted">Use o Pix Copia e Cola ou escaneie o QR Code com outro celular.</p><div class="qr" id="pix-qr"></div><div class="code mono" style="max-height:75px;overflow:auto">${escapeHtml(o.pix_code)}</div><div class="stack spaced"><button id="copy-pix" class="btn full">📋 Copiar Pix Copia e Cola</button><button id="claimed" class="btn secondary full">Já paguei, solicitar conferência</button><button id="refresh" class="btn outline full">↻ Atualizar situação</button></div><div class="callout warning spaced"><strong>${o.status==='claimed'?'Sua solicitação está na fila de conferência.':'O conteúdo será liberado após a conferência.'}</strong><br>O QR Code contém o valor e a referência do pedido, mas não confirma o recebimento. Apenas a coordenação pode liberar a homenagem depois de consultar o extrato bancário.</div></div>`;}
function editorHtml(o,finished){return `<div class="callout ${finished?'warning':'success'}">${finished?'🔒 O prazo de edição terminou. Suas mensagens estão preservadas.':`✓ Seu presente foi pago. Você pode editar até ${escapeHtml(deadlineText(o.deadline))}.`}</div>
    <section class="card spaced"><h2>Sua mensagem 💌</h2><label for="message">Escreva para ${escapeHtml(o.recipient_name)}</label><textarea id="message" maxlength="20000" placeholder="O que você gostaria de dizer?" ${finished?'disabled':''}>${escapeHtml(o.message)}</textarea><p class="small muted" id="save-status">${finished?'Somente leitura':'Suas alterações serão salvas automaticamente.'}</p></section>
    <section class="card spaced"><h2>Sua voz 🎙️</h2><p class="muted">Grave quantos áudios quiser. Não há um limite de minutos definido pela loja. Para gravações longas, mantenha esta página aberta e a tela ativa.</p>
      ${finished?'':`<div class="record-actions"><button class="btn" id="record">● Começar gravação</button><button class="btn secondary hidden" id="pause-record">Pausar</button><button class="btn danger hidden" id="stop-record">Parar e salvar</button></div><p class="small recording hidden" id="record-status"><span class="record-dot"></span> <span id="record-time">00:00</span> gravando...</p>`}
      <div id="audio-gallery" class="stack spaced">${mediaHtml(o.media.filter(m=>m.kind==='audio'),finished)}</div></section>
    <section class="card spaced"><h2>Fotos 📸</h2><p class="muted">Adicione fotos quantas vezes quiser, sem limite de quantidade predefinido.</p>
      ${finished?'':`<label class="file-input"><strong>＋ Escolher fotos</strong><input type="file" id="photos" accept="image/*,.heic,.heif" multiple aria-label="Selecionar fotos" style="margin-top:8px"></label><div id="photo-upload"></div>`}
      <div id="photo-gallery" class="media-grid spaced">${mediaHtml(o.media.filter(m=>m.kind==='image'),finished)}</div></section>`;}
function mediaHtml(items,finished){return items.length?items.map(m=>`<div class="media-item" data-media="${m.id}"><div class="muted small" style="margin-bottom:7px">${escapeHtml(m.filename)}</div>${m.kind==='audio'?`<audio controls preload="none" src="${escAttr(m.url)}" style="width:100%"></audio>`:`<img loading="lazy" src="${escAttr(m.url)}" alt="Foto da homenagem" class="preview">`}${!finished?`<button class="btn danger small-btn" data-remove="${m.id}" style="margin-top:9px">Excluir</button>`:''}</div>`).join(''):'<p class="muted small">Nenhum arquivo enviado ainda.</p>';}
function bindEditor(){
  const text=$('#message');text.addEventListener('input',()=>{
    const value=text.value;$('#save-status').textContent='Salvando...';clearTimeout(state.messageTimer);
    state.messageTimer=setTimeout(()=>safely(async()=>{
      await api('/api/order/message',{method:'PUT',auth:state.orderToken,body:{message:value}});
      state.order.message=value;if($('#save-status'))$('#save-status').textContent='✓ Mensagem salva';
    }),650);
  });
  $('#photos')?.addEventListener('change',e=>safely(async()=>{
    const files=[...e.target.files];if(!files.length)return;
    for(let i=0;i<files.length;i++){
      const target=$('#photo-upload');target.textContent=`Enviando foto ${i+1} de ${files.length}: ${files[i].name}`;
      await uploadFile(files[i],'image',target);
    }
    await reloadMedia();notify('Fotos salvas!');
  }));
  $$('[data-remove]').forEach(b=>b.onclick=()=>safely(async()=>{
    if(!confirm('Excluir este arquivo da homenagem?'))return;
    await api(`/api/order/media/${b.dataset.remove}/delete`,{method:'DELETE',auth:state.orderToken});
    await reloadMedia();notify('Arquivo excluído.');
  }));
  $('#record')?.addEventListener('click',()=>safely(startRecording));
  $('#stop-record')?.addEventListener('click',()=>{if(state.recording){state.recording.recorder.stop();$('#stop-record').disabled=true;$('#stop-record').textContent='Salvando áudio...';}});
  $('#pause-record')?.addEventListener('click',()=>{const rec=state.recording?.recorder;if(!rec)return;if(rec.state==='recording'){rec.pause();$('#pause-record').textContent='Continuar';}else if(rec.state==='paused'){rec.resume();$('#pause-record').textContent='Pausar';}});
}
async function reloadMedia(){const data=await api('/api/order',{auth:state.orderToken});state.order=data;renderOrder();}
async function initMedia(kind,filename,mime){return api('/api/order/media/init',{method:'POST',auth:state.orderToken,body:{kind,filename,content_type:mime}});}
async function uploadPart(id,num,blob){
  const res=await fetch(`/api/order/media/${id}/part/${num}`,{method:'PUT',credentials:'same-origin',headers:{'Authorization':`Bearer ${state.orderToken}`,'Content-Type':'application/octet-stream'},body:blob});
  if(!res.ok){let error='Falha ao enviar uma parte do arquivo.';try{error=(await res.json()).error||error}catch{}throw new Error(error);}
}
async function finalizeMedia(id){return api(`/api/order/media/${id}/complete`,{method:'POST',auth:state.orderToken,body:{}});}
async function uploadFile(file,kind,progress){
  const m=await initMedia(kind,file.name,file.type||'image/jpeg'),chunk=8*1024*1024;
  let part=1;
  for(let offset=0;offset<file.size;offset+=chunk){
    await uploadPart(m.id,part++,file.slice(offset,offset+chunk));
    if(progress)progress.textContent=`Enviando ${file.name}: ${Math.round(100*Math.min(offset+chunk,file.size)/file.size)}%`;
  }
  if(!file.size)throw new Error('Arquivo vazio.');
  await finalizeMedia(m.id);
}
async function startRecording(){
  if(state.recording)return;
  if(!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia)throw new Error('Gravação indisponível neste navegador.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  let type=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));
  let rec;
  try{rec=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  const mime=(rec.mimeType||type||'audio/mp4').split(';')[0].toLowerCase();
  const media=await initMedia('audio',`Mensagem-${new Date().toISOString().slice(0,16)}.${mime.includes('webm')?'webm':mime.includes('ogg')?'ogg':'m4a'}`,mime);
  const object={recorder:rec,stream,media,parts:[],size:0,nextPart:1,queue:Promise.resolve(),error:null,begin:Date.now(),pausedAt:0};
  state.recording=object;
  const CHUNK=8*1024*1024;
  function enqueue(blob){object.queue=object.queue.then(()=>{if(!object.error)return uploadPart(media.id,object.nextPart++,blob);}).catch(e=>{object.error=e;});}
  rec.addEventListener('dataavailable',e=>{
    if(!e.data?.size)return;
    object.parts.push(e.data);object.size+=e.data.size;
    while(object.size>=CHUNK){
      const combined=new Blob(object.parts,{type:mime});
      enqueue(combined.slice(0,CHUNK));
      const rest=combined.slice(CHUNK);object.parts=rest.size?[rest]:[];object.size=rest.size;
    }
  });
  rec.addEventListener('stop',()=>safely(async()=>{
    clearInterval(state.recordTimer);
    try{
      if(object.size){enqueue(new Blob(object.parts,{type:mime}));}
      await object.queue;
      if(object.error)throw object.error;
      if(object.nextPart===1)throw new Error('Gravação vazia. Tente novamente.');
      await finalizeMedia(media.id);
      notify('Seu áudio foi salvo!');
    }catch(e){notify(`Erro ao salvar: ${e.message}. Partes enviadas permanecem no servidor temporariamente.`);}
    finally{object.stream.getTracks().forEach(t=>t.stop());state.recording=null;await reloadMedia();}
  }));
  rec.addEventListener('error',e=>notify('Falha na gravação: '+(e.error?.message||'erro de mídia')));
  rec.start(1200);
  $('#record').classList.add('hidden');$('#pause-record').classList.remove('hidden');$('#stop-record').classList.remove('hidden');$('#record-status').classList.remove('hidden');
  state.recordTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-object.begin)/1000);const m=String(Math.floor(seconds/60)).padStart(2,'0');const s=String(seconds%60).padStart(2,'0');const timer=$('#record-time');if(timer)timer.textContent=`${m}:${s}`;},1000);
}
window.addEventListener('beforeunload',e=>{if(state.recording){e.preventDefault();e.returnValue='';}});

async function adminEntry(){
  clearTimers();loading('Abrindo painel da coordenação...');
  try{await api('/api/admin/me');await loadAdmin();}
  catch{adminLogin();}
}
function adminLogin(){
  wrap(`<section class="hero"><p class="eyebrow">Área restrita à coordenação</p><h1>Organizar também é cuidar. 🤍</h1><p>Entre para conferir os Pix, liberar homenagens e organizar as entregas.</p></section><section class="card"><h2>Entrar no painel</h2><form id="login-form"><label for="pass">Senha de administração</label><input type="password" autocomplete="current-password" id="pass" required minlength="14" placeholder="Sua senha de acesso"><button class="btn full spaced">Entrar no painel</button></form></section>`,true);
  $('#login-form').addEventListener('submit',e=>{e.preventDefault();safely(async()=>{const b=$('#login-form button');b.disabled=true;try{await api('/api/admin/login',{method:'POST',body:{password:$('#pass').value}});await loadAdmin();}finally{b.disabled=false;}});});
}
async function loadAdmin(){
  state.admin=await api('/api/admin/bootstrap');
  const requested=new URLSearchParams(location.search).get('order');
  if(requested)state.selectedOrder=requested;
  renderAdmin();
}
function renderAdmin(){
  const db=state.admin, waiting=db.orders.filter(o=>['pending','claimed'].includes(o.status)).length,
    paid=db.orders.filter(o=>o.status==='paid').length, done=db.orders.filter(o=>o.status==='delivered').length;
  wrap(`<div class="row between wrap"><div><p class="eyebrow">Painel da coordenação</p><h1>Pedidos & carinho.</h1></div><button class="btn outline small-btn" id="logout">Sair</button></div>
    <div class="stats"><div class="stat"><div class="small muted">Conferir</div><div class="num">${waiting}</div></div><div class="stat"><div class="small muted">Liberados</div><div class="num">${paid}</div></div><div class="stat"><div class="small muted">Entregues</div><div class="num">${done}</div></div></div>
    <div class="pillnav spaced" id="tabs"><button data-tab="orders" class="${state.section==='orders'?'active':''}">Pedidos</button><button data-tab="people" class="${state.section==='people'?'active':''}">Encontristas</button><button data-tab="products" class="${state.section==='products'?'active':''}">Produtos</button><button data-tab="settings" class="${state.section==='settings'?'active':''}">Configurações</button><button data-tab="qr" class="${state.section==='qr'?'active':''}">QR da rua</button></div>
    <div id="admin-content" class="admin-section"></div>`,true);
  $('#logout').onclick=()=>safely(async()=>{await api('/api/admin/logout',{method:'POST',body:{}});state.admin=null;adminLogin();});
  $$('[data-tab]').forEach(b=>b.onclick=()=>{state.section=b.dataset.tab;state.selectedOrder='';history.replaceState(null,'','/admin');renderAdmin();});
  renderAdminContent();
}
function renderAdminContent(){
  const db=state.admin, view=$('#admin-content');
  if(state.section==='orders'){
    const search=new URLSearchParams(location.search).get('order');
    if(state.selectedOrder || search){
      view.innerHTML='<div class="loading-screen"><span class="spinner"></span> Abrindo pedido...</div>';
      safely(async()=>{const id=state.selectedOrder||search;const order=await api(`/api/admin/orders/${encodeURIComponent(id)}`);renderAdminOrder(order);});
      return;
    }
    view.innerHTML=`<div class="subheading"><h2>Pedidos</h2><button class="btn secondary small-btn" id="refresh-admin">↻ Atualizar</button></div>
      <input type="search" id="filter-orders" placeholder="Buscar por encontrista, número, remetente..." autocomplete="off"><div id="orders-list" class="stack spaced"></div>`;
    const draw=()=>{
      const query=$('#filter-orders').value.trim().toLowerCase();
      const filtered=db.orders.filter(o=>[o.id,o.recipient_name,o.sender_name,o.bank_reference].some(x=>String(x||'').toLowerCase().includes(query)));
      $('#orders-list').innerHTML=filtered.map(o=>`<button class="order-card" data-order="${o.id}"><div><strong>${escapeHtml(o.recipient_name)} <span class="small muted mono">${escapeHtml(o.id)}</span></strong><small>${escapeHtml(o.sender_name||'Remetente anônimo')} · ${currency(o.total_cents)} · ${o.files} arquivo(s)</small></div><span class="status ${o.status}">${escapeHtml(statusName[o.status])}</span></button>`).join('')||'<p class="muted">Nenhum pedido encontrado.</p>';
      $$('[data-order]').forEach(b=>b.onclick=()=>{state.selectedOrder=b.dataset.order;renderAdminContent();});
    };
    $('#filter-orders').oninput=draw;$('#refresh-admin').onclick=()=>safely(loadAdmin);draw();
  }
  if(state.section==='people'){
    view.innerHTML=`<h2>Lista de encontristas</h2><p class="muted">Cole um nome por linha. Nomes já cadastrados não serão duplicados. Confira a autorização da organização para disponibilizar os nomes no site.</p><div class="card"><label for="people-names">Importar encontristas</label><textarea id="people-names" rows="7" placeholder="Maria Eduarda\nJoão Pedro\nAna Clara"></textarea><button class="btn full" id="import-people">Importar nomes</button></div><div class="card spaced"><h3>${db.recipients.length} encontristas cadastrados</h3><div class="admin-table"><table><tbody>${db.recipients.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td><span class="chip ${x.active?'ok':'warn'}">${x.active?'Ativo':'Oculto'}</span></td><td><button class="btn small-btn secondary" data-toggle-person="${x.id}">${x.active?'Ocultar':'Reativar'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#import-people').onclick=()=>safely(async()=>{const names=$('#people-names').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!names.length)throw Error('Cole ao menos um nome.');const data=await api('/api/admin/recipients/import',{method:'POST',body:{names}});notify(`${data.inserted} encontrista(s) adicionado(s).`);await loadAdmin();});
    $$('[data-toggle-person]').forEach(b=>b.onclick=()=>safely(async()=>{const p=db.recipients.find(x=>x.id===b.dataset.togglePerson);await api(`/api/admin/recipients/${p.id}`,{method:'PATCH',body:{name:p.name,active:!p.active}});await loadAdmin();}));
  }
  if(state.section==='products'){
    view.innerHTML=`<h2>Presentes e preços</h2><div class="card"><form id="product-form"><div class="split"><div><label>Nome do produto</label><input required name="name" placeholder="Ex.: Cartão com chocolate" maxlength="100"></div><div><label>Preço em reais</label><input required name="price" inputmode="decimal" placeholder="Ex.: 12,50"></div></div><div class="split spaced"><div><label>Ícone (emoji)</label><input name="emoji" maxlength="12" value="🎁"></div><div><label>Descrição curta</label><input name="description" maxlength="400"></div></div><button class="btn full spaced">Adicionar produto</button></form></div><div class="card spaced"><h3>${db.products.length} produtos</h3><div class="admin-table"><table><tbody>${db.products.map(p=>`<tr><td>${escapeHtml(p.emoji)} ${escapeHtml(p.name)}</td><td>${currency(p.price_cents)}</td><td><span class="chip ${p.active?'ok':'warn'}">${p.active?'Ativo':'Oculto'}</span></td><td><button class="btn secondary small-btn" data-edit-product="${p.id}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#product-form').onsubmit=e=>{e.preventDefault();safely(async()=>{const f=new FormData(e.currentTarget),price=parseReais(f.get('price'));await api('/api/admin/products',{method:'POST',body:{name:f.get('name'),price_cents:price,emoji:f.get('emoji'),description:f.get('description')}});notify('Produto cadastrado.');await loadAdmin();});};
    $$('[data-edit-product]').forEach(b=>b.onclick=()=>safely(async()=>{
      const p=db.products.find(x=>x.id===b.dataset.editProduct);
      const name=prompt('Nome do produto',p.name);if(name===null)return;
      const price=prompt('Preço em reais',String(p.price_cents/100).replace('.',','));if(price===null)return;
      const active=confirm(p.active?'Manter produto ATIVO? (Cancelar = ocultar)':'Reativar produto? (Cancelar = manter oculto)');
      await api(`/api/admin/products/${p.id}`,{method:'PATCH',body:{name,price_cents:parseReais(price),emoji:p.emoji,description:p.description,active}});await loadAdmin();
    }));
  }
  if(state.section==='settings'){
    const c=db.config;
    view.innerHTML=`<h2>Configurações</h2><div class="card"><form id="settings-form">
      <label>Chave Pix da coordenação</label><input name="pix_key" value="${escAttr(c.pix_key)}" placeholder="CPF, celular, e-mail ou chave aleatória" maxlength="77" autocomplete="off">
      <p class="small muted">A chave será exibida no código Pix gerado. Acesse o aplicativo do banco e confirme o nome do titular antes de abrir a loja.</p>
      <div class="split"><div><label>Nome do recebedor (até 25 caracteres)</label><input name="pix_name" required maxlength="25" value="${escAttr(c.pix_name)}" placeholder="MINI MERCADO EJC"></div><div><label>Cidade do recebedor</label><input name="pix_city" required maxlength="15" value="${escAttr(c.pix_city)}"></div></div>
      <div class="field"><label>Encerramento das homenagens (horário de Brasília)</label><input required type="datetime-local" name="deadline" value="${escAttr(c.deadline)}"><p class="small muted">A alteração passa a valer imediatamente em todos os pedidos. Após esse horário, apenas leitura.</p></div>
      <div class="field"><label>Título da loja</label><input name="store_title" maxlength="100" value="${escAttr(c.store_title)}"></div>
      <div class="field"><label>Texto de boas-vindas</label><textarea name="store_subtitle" maxlength="200" rows="2">${escapeHtml(c.store_subtitle)}</textarea></div>
      <div class="checkrow"><input type="checkbox" name="open" id="open" ${c.open==='true'?'checked':''}><label for="open">Permitir novos pedidos</label></div>
      <button class="btn full">Salvar configurações</button>
    </form></div><div class="callout warning spaced"><strong>Antes de abrir:</strong> confira a chave no banco, faça um pagamento real de baixo valor, confirme pelo extrato e verifique o envio de áudio e foto. Não libere pedidos com base em comprovantes.</div>`;
    $('#settings-form').onsubmit=e=>{e.preventDefault();safely(async()=>{const f=new FormData(e.currentTarget);await api('/api/admin/settings',{method:'PUT',body:{pix_key:f.get('pix_key'),pix_name:f.get('pix_name'),pix_city:f.get('pix_city'),deadline:f.get('deadline'),store_title:f.get('store_title'),store_subtitle:f.get('store_subtitle'),open:f.has('open')}});notify('Configurações salvas.');await loadAdmin();});};
  }
  if(state.section==='qr'){
    view.innerHTML=`<section class="card center" id="poster"><p class="eyebrow">XX EJC SIMONÉSIA</p><h1>Espalhe carinho 💌</h1><p>Escolha um encontrista, envie uma lembrança e compartilhe uma mensagem especial.</p><div id="street-qr" class="qr"></div><strong>APONTE A CÂMERA AQUI</strong><p class="small muted mono">${escapeHtml(location.origin)}</p></section><button class="btn full spaced" id="print-qr">🖨️ Imprimir plaquinha</button>`;
    attachQR('#street-qr',location.origin+'/',260);
    $('#print-qr').onclick=()=>window.print();
  }
}
function parseReais(value){
  const s=String(value).trim().replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw new Error('Preço inválido: use, por exemplo, 12,50.');
  const cents=Math.round(Number(s)*100);if(cents<=0 || cents>5000000)throw new Error('Valor fora do intervalo permitido.');return cents;
}
function renderAdminOrder(o){
  const view=$('#admin-content');
  const canConfirm=['pending','claimed'].includes(o.status),canPrep=o.status==='paid',canDeliver=o.status==='preparing';
  const actions=canConfirm?`<form id="confirm-payment"><label for="bank-ref">Identificador único da transação no extrato (E2E / ID bancário)</label><input id="bank-ref" required minlength="8" maxlength="128" placeholder="Copie o ID da transação recebida no banco"><div class="checkrow"><input type="checkbox" id="checked-bank" required><label for="checked-bank">Conferi no aplicativo do banco que o dinheiro realmente entrou.</label></div><div class="checkrow"><input type="checkbox" id="checked-amount" required><label for="checked-amount">Conferi que o valor recebido corresponde a <strong>${currency(o.amount_cents)}</strong>.</label></div><button class="btn full">✓ Confirmar Pix e liberar homenagem</button></form>`:
    canPrep?`<button id="prepare" class="btn full">📦 Marcar como preparando</button>`:
    canDeliver?`<button id="deliver" class="btn full">🎁 Marcar como entregue</button>`:
    o.status==='delivered'?'<button id="reopen" class="btn secondary full">↶ Retornar para preparação</button>':'';
  view.innerHTML=`<button class="btn secondary small-btn" id="back-orders">← Voltar aos pedidos</button>
    <div class="card spaced"><div class="row between wrap"><span class="chip">${escapeHtml(o.id)}</span><span class="status ${o.status}">${escapeHtml(statusName[o.status])}</span></div><h2 style="margin-top:12px">${escapeHtml(o.recipient_name)}</h2><p>De: <strong>${escapeHtml(o.sender_name||'Remetente anônimo')}</strong></p><p>${o.items.map(i=>`${i.quantity}× ${escapeHtml(i.product_name)} (${currency(i.unit_price_cents)})`).join('<br>')}</p><div class="row between"><strong>Total</strong><strong style="font-size:22px">${currency(o.amount_cents)}</strong></div><p class="small muted mono">TXID: ${escapeHtml(o.txid)}</p>${o.bank_reference?`<p class="small mono">Transação: ${escapeHtml(o.bank_reference)}</p>`:''}</div>
    <div class="card spaced"><h3>Pagamento e entrega</h3><div class="callout warning">O QR Code e o clique em “Já paguei” não demonstram pagamento. Confira a transação real no extrato antes de confirmar.</div><div class="spaced">${actions}</div></div>
    <div class="card spaced"><h3>Homenagem</h3><p class="muted small">Mensagem de texto</p><div class="callout">${o.message?escapeHtml(o.message).replace(/\n/g,'<br>'):'Nenhuma mensagem escrita.'}</div><div class="media-grid spaced">${o.media.filter(m=>m.status==='ready').map(m=>`<div class="media-item"><p class="small muted">${escapeHtml(m.filename)}</p>${m.kind==='image'?`<img class="preview" loading="lazy" alt="Foto privada" src="/api/admin/media/${m.id}/file">`:`<audio controls preload="none" src="/api/admin/media/${m.id}/file"></audio>`}</div>`).join('')||'<p class="muted">Nenhuma foto ou áudio recebido.</p>'}</div></div>
    <div class="card spaced"><h3>Histórico</h3><div class="stack">${o.history.map(h=>`<p class="small" style="margin:0"><strong>${escapeHtml(h.type)}</strong> · ${escapeHtml(h.created_at)}${h.detail?`<div class="muted mono">${escapeHtml(h.detail)}</div>`:''}</p>`).join('')||'<p class="small muted">Sem eventos.</p>'}</div></div>`;
  $('#back-orders').onclick=()=>{state.selectedOrder='';history.replaceState(null,'','/admin');renderAdminContent();};
  $('#confirm-payment')?.addEventListener('submit',e=>{e.preventDefault();safely(async()=>{
    if(!confirm('Você conferiu o recebimento diretamente no banco e quer liberar esta homenagem?'))return;
    await api(`/api/admin/orders/${o.id}/status`,{method:'PATCH',body:{status:'paid',bank_reference:$('#bank-ref').value.trim(),bank_checked:$('#checked-bank').checked,amount_checked:$('#checked-amount').checked}});
    notify('Pix confirmado. Homenagem liberada.');state.selectedOrder=o.id;await loadAdmin();
  });});
  for(const [id,status] of [['prepare','preparing'],['deliver','delivered'],['reopen','preparing']]){
    const button=$(`#${id}`);if(button)button.onclick=()=>safely(async()=>{
      await api(`/api/admin/orders/${o.id}/status`,{method:'PATCH',body:{status}});
      state.selectedOrder=o.id;await loadAdmin();notify('Status atualizado.');
    });
  }
}
async function route(){
  clearTimers();
  try{
    if(location.pathname.startsWith('/admin'))await adminEntry();
    else if(location.hash.startsWith('#pedido='))await loadOrder();
    else await home();
  }catch(e){console.error(e);wrap(`<div class="card"><h2>Não foi possível carregar</h2><p>${escapeHtml(e.message||'Erro desconhecido')}</p><a class="btn" href="/">Voltar ao início</a></div>`);}
}
window.addEventListener('hashchange',route);
window.addEventListener('DOMContentLoaded',route);