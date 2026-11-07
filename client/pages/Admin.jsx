import React,{useCallback,useEffect,useRef,useState} from 'react';
import {NavLink,Routes,Route,useNavigate,useParams} from 'react-router-dom';
import {ShieldCheck,ClipboardList,UsersRound,Settings2,QrCode as QrIcon,Eye,Check,Copy,Trash2,Sparkles,Printer,Download,LogOut,ExternalLink,RefreshCw,Heart,ImagePlus} from 'lucide-react';
import { api, money, btime, track,download } from '../lib/api';
import QrCode from '../components/QrCode';
import Labels from './Labels';
import { publishOgImage } from '../lib/og';
function useAdmin(){const [info,setInfo]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const reload=useCallback(async()=>{try{setInfo(await api('/api/admin/bootstrap'));setError('');}catch(e){setError(e.message);setInfo(null);}finally{setLoading(false);}},[]);
  useEffect(()=>{reload();},[reload]);return {info,loading,error,reload};}
const copy=t=>navigator.clipboard.writeText(t);
// O painel não renderiza nem solicita texto, áudio, fotos ou nome do remetente.
function AdminDashboard({ info, reload }) {
  const navigate = useNavigate();
  const pending = info.orders.filter((order) => ['pending', 'claimed'].includes(order.status));
  const paid = info.orders.filter((order) => ['paid', 'preparing', 'delivered'].includes(order.status));
  const sent = info.orders.filter((order) => order.submitted);
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">COORDENAÇÃO / AO VIVO</span>
          <h1>Painel de pagamentos</h1>
          <p>Confira o Pix e acompanhe os pedidos. As cartinhas são privadas e não podem ser lidas ou ouvidas neste painel.</p>
        </div>
        <button className="btn ghost" onClick={reload}><RefreshCw size={17} /> Atualizar</button>
      </div>
      <div className="stats-grid">
        <div><span>Pix a conferir</span><strong>{pending.length}</strong></div>
        <div><span>Pagamentos confirmados</span><strong>{paid.length}</strong></div>
        <div><span>Cartinhas enviadas</span><strong>{sent.length}</strong></div>
        <div><span>Total de pedidos</span><strong>{info.orders.length}</strong></div>
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        A coordenação acessa apenas dados operacionais de pagamento e envio. Mensagens, fotos e áudios não são exibidos.
      </div>
      <CheckoutList reloadOrders={reload} />
      <OrderList orders={info.orders} navigate={navigate} />
    </>
  );
}

function CheckoutList({ reloadOrders }) {
  const [checkouts,setCheckouts]=useState([]);
  const [selected,setSelected]=useState(null);
  const [reference,setReference]=useState('');
  const [bankChecked,setBankChecked]=useState(false);
  const [amountChecked,setAmountChecked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    try{
      const result=await api('/api/admin/checkouts');
      setCheckouts(result.checkouts||[]);
    }catch(cause){setError(cause.message);}
  },[]);
  useEffect(()=>{refresh();},[refresh]);
  async function confirm(){
    if(!selected)return;
    setBusy(true);setError('');
    try{
      await api('/api/admin/checkouts/'+selected.id+'/status',{
        method:'PATCH',
        data:{status:'paid',bank_reference:reference,
          bank_checked:bankChecked,amount_checked:amountChecked}
      });
      setSelected(null);setReference('');setBankChecked(false);setAmountChecked(false);
      await Promise.all([refresh(),reloadOrders()]);
    }catch(cause){setError(cause.message);}
    finally{setBusy(false);}
  }
  return <section className="form-card admin-checkouts">
    <div className="row between">
      <div><h2>Pix com várias cartinhas</h2><p className="muted small">Uma compra, um Pix, várias cartas privadas.</p></div>
      <button type="button" className="btn ghost" onClick={refresh}><RefreshCw size={16}/> Atualizar</button>
    </div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {!checkouts.length?<p className="muted small">Ainda não há compras agrupadas.</p>:
      <div className="admin-order-list">
        {checkouts.map((checkout)=><button key={checkout.id} type="button" className="admin-order"
          onClick={()=>{setSelected(checkout);setReference('');setBankChecked(false);setAmountChecked(false);}}>
          <span><strong>{checkout.item_count} cartinha(s)</strong><small>{checkout.id}</small></span>
          <span className="order-tags"><b>{money(checkout.total_cents)}</b>
            <small>{checkout.status==='paid'?'Pix confirmado':checkout.status==='claimed'?'Conferir Pix':'Aguardando Pix'}</small></span>
        </button>)}
      </div>}
    {selected&&<div className="form-card admin-checkout-confirm">
      <h3>{selected.id} · {money(selected.total_cents)}</h3>
      <p className="muted">Confirme um único crédito do valor total para liberar {selected.item_count} cartinha(s). Não compartilhe comprovantes ou conteúdo das mensagens.</p>
      {selected.status==='paid'?<p className="notice">Este Pix já foi confirmado.</p>:<>
        <label htmlFor="checkout-reference">Identificador bancário (E2E)</label>
        <input id="checkout-reference" value={reference} onChange={e=>setReference(e.target.value)}
          placeholder="Identificador completo da transferência"/>
        <label className="toggle-line"><input type="checkbox" checked={bankChecked}
          onChange={e=>setBankChecked(e.target.checked)}/> Confirmei a entrada no extrato real</label>
        <label className="toggle-line"><input type="checkbox" checked={amountChecked}
          onChange={e=>setAmountChecked(e.target.checked)}/> Confirmei o valor total de {money(selected.total_cents)}</label>
        <button type="button" className="btn" disabled={busy||!bankChecked||!amountChecked||reference.trim().length<8}
          onClick={confirm}><Check size={17}/> Confirmar Pix de todas as cartinhas</button>
      </>}
      <button type="button" className="btn ghost" onClick={()=>setSelected(null)}>Fechar</button>
    </div>}
  </section>;
}

function OrderList({ orders, navigate }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const rows = orders.filter((order) => {
    const matches = `${order.id} ${order.recipient_name}`.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR'));
    if (filter === 'pix') return matches && ['pending', 'claimed'].includes(order.status);
    if (filter === 'paid') return matches && ['paid', 'preparing', 'delivered'].includes(order.status);
    if (filter === 'sent') return matches && Boolean(order.submitted);
    return matches;
  });
  return (
    <section className="form-card">
      <div className="row between"><h2>Pedidos e pagamentos</h2><span className="muted">{rows.length} registros</span></div>
      <div className="row filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido ou encontrista" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Todos os pedidos</option>
          <option value="pix">Conferir Pix</option>
          <option value="paid">Pagamentos confirmados</option>
          <option value="sent">Cartinhas enviadas</option>
        </select>
      </div>
      <div className="admin-order-list">
        {rows.map((order) => (
          <button key={order.id} className="admin-order" onClick={() => navigate(order.checkout_id ? '/admin' : `/admin/pedidos/${order.id}`)}>
            <span><strong>{order.recipient_name}</strong><small>{order.id}</small></span>
            <span className="order-tags">
              <b>{money(order.total_cents)}</b>
              <small>{order.status === 'claimed' ? 'Conferir Pix' :
                order.status === 'pending' ? 'Aguardando Pix' :
                'Pagamento confirmado'} · {order.submitted ? 'Cartinha enviada' : 'Ainda não enviada'}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
function OrderDetail({ reload }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState('');
  const [bankChecked, setBankChecked] = useState(false);
  const [amountChecked, setAmountChecked] = useState(false);
  const load = useCallback(async () => {
    try {
      setOrder(await api(`/api/admin/orders/${id}`));
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  async function confirmPayment() {
    setBusy(true);
    try {
      await api(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        data: {
          status: 'paid', bank_reference: bank,
          bank_checked: bankChecked, amount_checked: amountChecked,
        },
      });
      await load();
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  if (!order) return <div className="loading">{error || 'Carregando pedido...'}</div>;
  const paid = ['paid', 'preparing', 'delivered'].includes(order.status);
  return (
    <div className="admin-detail">
      <button className="text-button" onClick={() => navigate('/admin')}>← Voltar aos pedidos</button>
      <div className="section-head">
        <div><span className="eyebrow">{order.id}</span><h1>{order.recipient_name}</h1><p>{money(order.total_cents)}</p></div>
        <span className={`status-pill ${paid ? 'success' : 'pending'}`}>
          {paid ? 'Pagamento confirmado' : 'Aguardando Pix'}
        </span>
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        Conteúdo privado. A coordenação não visualiza o texto, as imagens ou os áudios da cartinha.
      </div>
      {error && <div className="notice error">{error}</div>}
      {!paid && (
        <section className="form-card">
          <h2>Conferir Pix no extrato</h2>
          <p className="muted">Confira a entrada do dinheiro no banco. Não libere apenas com um comprovante enviado pelo comprador.</p>
          <label htmlFor="bank-id">Identificador bancário completo</label>
          <input id="bank-id" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="E2E ID ou identificador da transferência" />
          <label className="toggle-line"><input type="checkbox" checked={bankChecked} onChange={(e) => setBankChecked(e.target.checked)} /> Confirmei a entrada do dinheiro no banco</label>
          <label className="toggle-line"><input type="checkbox" checked={amountChecked} onChange={(e) => setAmountChecked(e.target.checked)} /> Confirmei o valor de {money(order.total_cents)}</label>
          <button className="btn" disabled={busy || !bankChecked || !amountChecked || bank.length < 8} onClick={confirmPayment}>
            <Check size={18} /> Confirmar pagamento Pix
          </button>
        </section>
      )}
      <section className="form-card">
        <h2>Situação do envio</h2>
        <p>{order.submitted ? 'A cartinha foi enviada e aguarda somente o horário de liberação do mural.' :
          'O comprador ainda não concluiu o envio da cartinha.'}</p>
      </section>
      <section className="form-card">
        <h2>Histórico operacional</h2>
        <div className="timeline">
          {(order.history || []).map((record, i) => (
            <div key={i}><strong>{({
              created: 'Pedido criado',
              payment_claimed: 'Pagamento informado',
              payment_confirmed: 'Pagamento confirmado',
              letter_sent: 'Cartinha enviada',
            })[record.type] || 'Atividade do pedido'}</strong>
              <span className="muted"> {new Date(record.created_at).toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function People({info,reload}){const [names,setNames]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[uploading,setUploading]=useState(''),[ogProgress,setOgProgress]=useState('');
  async function photoUpload(r,file) {
    if(!file)return;
    if(!window.confirm(`Confirmo que tenho autorização para divulgar a foto de ${r.name}, inclusive dos responsáveis se menor de idade.`))return;
    setUploading(r.id);setError('');
    try {
      const response=await fetch(`/api/admin/recipients/${r.id}/photo`,{
        method:'POST',body:file,credentials:'same-origin',
        headers:{'Content-Type':file.type,'X-Photo-Consent':'confirmed'}
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||'Falha ao enviar foto.');
      await publishOgImage({...r,photo_url:data.photo_url});
      setNotice(`Foto de ${r.name} atualizada, com imagem de compartilhamento pronta.`);
      await reload();
    }catch(cause){setError(cause.message);}finally{setUploading('');}
  }
  async function photoRemove(r) {
    if(!window.confirm(`Remover a foto de ${r.name}?`))return;
    try{
      await api(`/api/admin/recipients/${r.id}/photo`,{method:'DELETE'});
      await publishOgImage({...r,photo_url:null});
      await reload();
    }
    catch(cause){setError(cause.message);}
  }
  async function makeOg(person) {
    setOgProgress('Gerando imagem para '+person.name+'...');
    try {
      await publishOgImage(person);
      await reload();
      setNotice('Imagem de compartilhamento de '+person.name+' atualizada.');
    } catch (cause) { setError(cause.message); }
    finally { setOgProgress(''); }
  }
  async function makeAllOg(){
    setOgProgress('Preparando imagens...');
    setError('');
    let complete=0;
    let failed=0;
    try{
      for(const person of info.recipients.filter(p=>p.active!==0)){
        setOgProgress('Gerando '+(complete+failed+1)+' de '+info.recipients.length+' · '+person.name);
        try { await publishOgImage(person); complete++; }
        catch (cause) { failed++; setError('Não foi possível gerar uma ou mais imagens: '+cause.message); }
      }
      await reload();
      setNotice(complete+' imagens prontas para WhatsApp e redes sociais.'+(failed?' '+failed+' falharam.':''));
    } finally { setOgProgress(''); }
  }
  const add=async()=>{try{const r=await api('/api/admin/recipients/import',{method:'POST',data:{names:names.split(/\r?\n/).filter(Boolean)}});setNotice(`${r.inserted} nomes importados.`);setNames('');await reload();}catch(e){setError(e.message);}};
  return <><div className="section-head"><div><span className="eyebrow">ENCONTRISTAS</span><h1>Nomes, fotos e links exclusivos</h1><p>A coordenação gerencia os nomes, fotos e QR Codes, mas não lê nem escuta as cartinhas. Entregue os códigos dos murais individualmente.</p></div></div><section className="form-card"><label>Importar nomes (um por linha)</label><textarea rows={4} value={names} onChange={e=>setNames(e.target.value)} placeholder={'Maria Eduarda\nJoão Pedro\nAna Clara'}/><button className="btn" onClick={add}>Adicionar encontristas</button></section>
    <section className="form-card">
      <h2>Imagens para redes sociais</h2>
      <p className="muted small">Os nomes e as fotos devem ficar dentro da área central visível mesmo quando o WhatsApp recortar a miniatura.</p>
      {info.recipients.filter(p=>p.active!==0&&!p.og_safe).length>0&&
        <div className="notice warning">
          {info.recipients.filter(p=>p.active!==0&&!p.og_safe).length} imagens ainda precisam ser
          geradas ou atualizadas para o novo enquadramento. Use o botão abaixo
          depois do deploy para renovar as prévias antigas.
        </div>}
      <button className="btn outline" disabled={!!ogProgress} onClick={makeAllOg}>
        <ImagePlus size={16}/> Gerar/atualizar prévias para WhatsApp
      </button>
      {ogProgress&&<p className="notice">{ogProgress}</p>}
    </section>
    {error&&<div className="notice error">{error}</div>}{notice&&<div className="notice success">{notice}</div>}
    <div className="people-list">{info.recipients.map(r=><div className="form-card person-row" key={r.id}>
      <div className="person-with-photo">
        <div className="recipient-avatar lavender">
          {r.photo_url?<img src={r.photo_url} alt={`Foto de ${r.name}`}/>:r.name.slice(0,2).toUpperCase()}
        </div>
        <div><strong>{r.name}</strong><small>/enviar/{r.slug}</small></div>
      </div>
      <div className="inline-actions">
        <label className="btn ghost person-photo-upload"><ImagePlus size={15}/>{uploading===r.id?'Enviando...':'Foto'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading}
            onChange={event=>{photoUpload(r,event.target.files?.[0]);event.target.value='';}}/>
        </label>
        {r.photo_url&&<button className="btn outline" onClick={()=>photoRemove(r)}><Trash2 size={15}/> Remover foto</button>}
        <button className="btn outline" disabled={!!ogProgress} onClick={()=>makeOg(r)}>
          <ImagePlus size={15}/> Atualizar imagem
        </button>
        {r.og_url&&<a className="btn ghost" href={r.og_url} target="_blank" rel="noreferrer">Ver PNG</a>}
        {r.og_url&&<span title="Simulação do recorte quadrado do WhatsApp"
          style={{display:'block',width:72,height:72,borderRadius:12,overflow:'hidden',
            border:'2px solid #d9c5e5',flexShrink:0}}>
          <img src={r.og_url} alt={`Miniatura WhatsApp de ${r.name}`}
            style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
        </span>}
        <button className="btn ghost" onClick={()=>copy(`${location.origin}/enviar/${r.slug}?og=${encodeURIComponent(new URL(r.og_url,location.origin).searchParams.get('v')||'20261107b')}`)}><Copy size={15}/> Link de envio</button></div></div>)}</div></>;
}
function BrandLogo({ info, reload }) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function upload(file) {
    if(!file)return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/admin/branding/logo',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||'Não foi possível salvar a logo.');
      setMessage('Logo oficial atualizada nos QR Codes.');await reload();
    }catch(cause){setMessage(cause.message);}finally{setBusy(false);}
  }
  return <section className="form-card brand-settings">
    <h2>Logo do Mini Mercado</h2>
    <p>Envie a logo oficial (PNG, JPEG ou WebP, até 2 MB). Até então, será usada uma marca provisória “XX EJC”.</p>
    {info.config.logo_url&&<img className="brand-logo-preview" src={info.config.logo_url} alt="Logo cadastrada"/>}
    <label className="btn person-photo-upload"><ImagePlus size={17}/>{busy?'Enviando...':'Cadastrar logo'}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={event=>{upload(event.target.files?.[0]);event.target.value='';}}/>
    </label>
    {message&&<div className="notice">{message}</div>}
  </section>;
}
function Config({info,reload}){
  const [form,setForm]=useState({...info.config,open:info.config.open==='true'}),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const fields=[['store_title','Título do projeto','text'],['store_subtitle','Subtítulo','text'],['message_price_cents','Contribuição em centavos (R$ 10,00 = 1000)','number'],['pix_key','Chave Pix','text'],['pix_name','Titular do Pix','text'],['pix_city','Cidade do Pix (sem acentos)','text'],['deadline','Encerrar edição das cartinhas','datetime-local'],['release_at','Liberar murais dos encontristas','datetime-local'],['analytics_id','Google Analytics 4 (G-...)','text']];
  const save=async()=>{setBusy(true);try{await api('/api/admin/settings',{method:'PUT',data:{...form,message_price_cents:Number(form.message_price_cents)}});setNotice('Configurações salvas.');await reload();}catch(e){setNotice(e.message);}finally{setBusy(false);}};
  return <><div className="section-head"><div><span className="eyebrow">CONFIGURAÇÕES</span><h1>Controle do evento</h1><p>O prazo de edição e a abertura do mural são horários independentes.</p></div></div><section className="form-card settings-form"><label className="toggle-line"><input type="checkbox" checked={!!form.open} onChange={e=>setForm(f=>({...f,open:e.target.checked}))}/> Aceitar novas cartinhas</label>{fields.map(([key,label,type])=><div className="field" key={key}><label htmlFor={key}>{label}</label><input id={key} type={type} value={form[key]||''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></div>)}<button className="btn" disabled={busy} onClick={save}><Check size={17}/> Salvar configurações</button>{notice&&<div className="notice">{notice}</div>}</section><BrandLogo info={info} reload={reload}/></>;
}
function DecorQr({value,title,subtitle,color='rose',logoUrl,photoUrl}){
  const el=useRef(null);
  const savePng = () => {
    const canvas = el.current?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) download(blob, `qr-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, 'image/png');
    }, 'image/png');
  };
  return <div className={`decorated-qr ${color}`} ref={el}><div className="qr-kicker">✳ XX EJC SIMONÉSIA ✳</div>{photoUrl&&<img className="poster-recipient-photo" src={photoUrl} alt="Encontrista"/>}<h3>{title}</h3><p>{subtitle}</p><QrCode value={value} size={212} variant="decorated" logoUrl={logoUrl}/><div className="qr-under">ESCANEIE &amp; ENVIE UM CARINHO ♡</div><div className="qr-tools no-print"><button className="btn ghost" onClick={savePng}><Download size={15}/> Baixar QR PNG</button></div></div>;
}
function QrPrint({info}){const [person,setPerson]=useState(''),[color,setColor]=useState('rose');const selected=info.recipients.find(r=>r.id===person);
  const version=selected?.og_url?new URL(selected.og_url,location.origin).searchParams.get('v')||'20261107b':'20261107b';
  const url=selected?`${location.origin}/enviar/${selected.slug}?og=${encodeURIComponent(version)}`:`${location.origin}/?og=20261107b`;
  return <><div className="section-head no-print"><div><span className="eyebrow">MATERIAL IMPRESSO</span><h1>QR Codes decorados</h1><p>Para plaquinhas, cartazes e distribuição nas ruas.</p></div><button className="btn" onClick={()=>window.print()}><Printer size={16}/> Imprimir A4</button></div><div className="form-card no-print"><div className="row filters"><select value={person} onChange={e=>setPerson(e.target.value)}><option value="">QR geral: lista de encontristas</option>{info.recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={color} onChange={e=>setColor(e.target.value)}><option value="rose">Rosa</option><option value="blue">Azul</option><option value="mint">Verde</option><option value="orange">Laranja</option></select></div><p className="muted small">Os QR Codes são links para o formulário, não para o Pix bancário nem para o mural secreto.</p></div><div className="qr-print-grid"><DecorQr value={url} title={selected?`Para ${selected.name}`:'Cartinhas do XX EJC'} subtitle="Suas palavras. Sua voz. Um encontro especial." color={color} logoUrl={info.config.logo_url} photoUrl={selected?.photo_url}/><DecorQr value={url} title={selected?`Um carinho para ${selected.name}`:'Uma mensagem de coração'} subtitle="Grave sua voz, adicione fotos, mande uma cartinha." color={color} logoUrl={info.config.logo_url} photoUrl={selected?.photo_url}/></div></>;
}
function Demo({reload}){const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);async function run(action){if(action==='clear'&&!confirm('Apagar todos os pedidos de DEMONSTRAÇÃO?'))return;setBusy(true);try{const data=await api(`/api/admin/demo/${action}`,{method:action==='seed'?'POST':'DELETE',data:action==='seed'?{}:undefined});setMessage(`Concluído: ${data.inserted??data.deleted} demonstrações.`);await reload();}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <><div className="section-head"><div><span className="eyebrow">AMBIENTE DE TESTE</span><h1>Demonstração</h1><p>Dados fictícios para explorar os estados do sistema. Nunca são cobrados por Pix.</p></div></div><section className="form-card"><h2>Exemplos de pedidos e situações de pagamento</h2><div className="inline-actions"><button className="btn" disabled={busy} onClick={()=>run('seed')}><Sparkles size={16}/> Criar exemplos</button><button className="btn danger-btn" disabled={busy} onClick={()=>run('clear')}><Trash2 size={16}/> Apagar exemplos</button></div>{message&&<div className="notice">{message}</div>}</section></>;
}
export default function Admin(){const [authenticated,setAuthenticated]=useState(null),[password,setPassword]=useState(''),[loginError,setLoginError]=useState(''),[busy,setBusy]=useState(false),{info,loading,error,reload}=useAdmin();
  useEffect(()=>{if(!loading)setAuthenticated(!!info);},[loading,info]);
  const login=async e=>{e.preventDefault();setBusy(true);try{await api('/api/admin/login',{method:'POST',data:{password}});setAuthenticated(true);setLoginError('');await reload();}catch(e){setLoginError(e.message);}finally{setBusy(false);}};
  if(loading||authenticated===null)return <div className="loading">Carregando administração...</div>;
  if(!authenticated)return <div className="admin-login"><div className="form-card"><ShieldCheck size={40}/><h1>Coordenação do EJC</h1><p>Área reservada aos administradores das homenagens.</p><form onSubmit={login}><label htmlFor="admin-password">Senha da administração</label><input type="password" id="admin-password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy} className="btn wide">Entrar no painel</button></form>{loginError&&<div className="notice error">{loginError}</div>}</div></div>;
  return <div className="admin-layout"><nav className="admin-nav no-print" aria-label="Navegação administrativa"><NavLink end to="/admin"><ClipboardList size={17}/> Pedidos</NavLink><NavLink to="/admin/encontristas"><UsersRound size={17}/> Encontristas</NavLink><NavLink to="/admin/configuracoes"><Settings2 size={17}/> Configurações</NavLink><NavLink to="/admin/qrcodes"><QrIcon size={17}/> QR e impressão</NavLink><NavLink to="/admin/etiquetas"><Printer size={17}/> Etiquetas do mural</NavLink><NavLink to="/admin/demo"><Sparkles size={17}/> Demonstração</NavLink><button onClick={async()=>{await api('/api/admin/logout',{method:'POST',data:{}});setAuthenticated(false);}}><LogOut size={17}/> Sair</button></nav><div className="admin-content">{error&&<div className="notice error">{error}</div>}<Routes><Route index element={<AdminDashboard info={info} reload={reload}/>}/><Route path="pedidos/:id" element={<OrderDetail reload={reload}/>}/><Route path="encontristas" element={<People info={info} reload={reload}/>}/><Route path="configuracoes" element={<Config info={info} reload={reload}/>}/><Route path="qrcodes" element={<QrPrint info={info}/>}/><Route path="etiquetas" element={<Labels info={info} reload={reload}/>}/><Route path="demo" element={<Demo reload={reload}/>}/></Routes></div></div>;
}
