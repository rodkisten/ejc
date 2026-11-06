import React,{useCallback,useEffect,useState} from 'react';
import {useParams,Link} from 'react-router-dom';
import { Copy, RefreshCw, CheckCircle2, Clock3, ArrowRight, LockKeyhole, ImagePlus, Trash2, Save, Send, Share2, Image as ImageIcon } from 'lucide-react';
import { api, btime, money, privateOrder, uploadMedia, track } from '../lib/api';
import { draftGet,draftRemove,draftKey } from '../lib/drafts';
import RichEditor from '../components/RichEditor';
import Recorder from '../components/Recorder';
import VoicePlayer from '../components/VoicePlayer';
import QrCode from '../components/QrCode';
import { LetterCard } from '../components/LetterCard';
function sameDraft(a,b){return a===b;}
export default function Order(){
  const {token}=useParams(),[order,setOrder]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
  const [html,setHtml]=useState(''),[publicMessage,setPublicMessage]=useState(false),[assets,setAssets]=useState([]),[progress,setProgress]=useState('');
  const reload=useCallback(async()=>{try{const o=await api('/api/order',{token});setOrder(o);setError('');return o;}catch(e){setError(e.message);return null;}},[token]);
  useEffect(()=>{reload();const t=setInterval(reload,15_000);return()=>clearInterval(t);},[reload]);
  useEffect(()=>{if(!order||saved)return;setHtml(order.rich_html||'');setPublicMessage(!!order.public_message);setSaved(true);},[order,saved]);
  useEffect(()=>{if(!order||!['paid','preparing','delivered'].includes(order.status))return;const slug=localStorage.getItem(`ejc-order-slug-${token}`);if(!slug)return;draftGet(draftKey(slug)).then(d=>{if(!d)return;setHtml(h=>h || d.html || '');setPublicMessage(v=>v||!!d.publicMessage);setAssets(current=>current.length?current:(d.assets||[]).map(a=>({...a,url:URL.createObjectURL(a.file)})));}).catch(()=>{});},[order?.status,token]);
  const paid=order&&['paid','preparing','delivered'].includes(order.status),ended=order?.deadline && Date.now()>=new Date(`${order.deadline}:00-03:00`).getTime();
  const add=(file,kind)=>setAssets(a=>[...a,{file,kind,url:URL.createObjectURL(file)}]);
  const discard=index=>setAssets(a=>{const list=[...a];URL.revokeObjectURL(list[index].url);list.splice(index,1);return list;});
  const copy=text=>navigator.clipboard.writeText(text).then(()=>setProgress('Copiado!')).catch(()=>setError('Não foi possível copiar. Selecione o texto manualmente.'));
  async function claim(){setBusy(true);try{await api('/api/order/claim',{method:'POST',token,data:{}});await reload();track('pix_claimed');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function save(withSubmit=false){setBusy(true);setError('');try{
    await api('/api/order/message',{method:'PUT',token,data:{rich_html:html,public_message:publicMessage}});
    for(const a of assets){setProgress(`Enviando ${a.file.name}...`);await uploadMedia(a.file,a.kind,token,p=>setProgress(`${a.file.name} · ${p}%`));}
    assets.forEach(a=>URL.revokeObjectURL(a.url));setAssets([]);setProgress('Arquivos salvos!');
    const slug=localStorage.getItem(`ejc-order-slug-${token}`);if(slug)await draftRemove(draftKey(slug));
    if(withSubmit){await api('/api/order/submit',{method:'POST',token,data:{}});track('letter_submitted');}
    await reload();setProgress(withSubmit?'Enviada para moderação!':'Rascunho salvo com sucesso!');
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  if(error&&!order)return <div className="empty"><h2>Não foi possível abrir a sua cartinha.</h2><p>{error}</p><Link to="/" className="btn">Voltar</Link></div>;
  if(!order)return <div className="loading">Carregando sua cartinha... ♡</div>;
  return <div className="order-wrap"><div className="section-head"><div><span className="eyebrow">PEDIDO {order.id}</span><h1>Para {order.recipient_name} <em>♡</em></h1><p>Este link é privado. Guarde-o para continuar depois.</p></div><span className={`status-pill ${paid?'success':'pending'}`}>{paid?'Pix confirmado':'Aguardando Pix'}</span></div>
    {!paid ? <div className="payment-layout"><div className="form-card"><h2>Seu Pix está pronto!</h2><p className="muted">Pague pelo aplicativo do seu banco. A cartinha será liberada quando a coordenação conferir o extrato.</p><div className="pix-amount">{money(order.amount_cents)}</div><QrCode value={order.pix_code} size={225} variant="pix"/><div className="pix-code">{order.pix_code}</div><button className="btn wide" onClick={()=>{copy(order.pix_code);track('pix_copy');}}><Copy size={17}/> Copiar Pix Copia e Cola</button><button className="btn outline wide" disabled={busy} onClick={claim}>{busy?'Aguarde...':'Já paguei · solicitar conferência'}</button><button className="btn ghost wide" onClick={reload}><RefreshCw size={16}/> Verificar situação</button><div className="notice warning">O QR Code Pix e comprovantes não confirmam pagamento automaticamente. A coordenação conferirá no banco.</div></div>
    <aside className="form-card"><h3>Guarde seu acesso</h3><p>Você poderá criar ou terminar a mensagem depois da confirmação do pagamento.</p><button className="btn ghost wide" onClick={()=>copy(privateOrder(token))}><LockKeyhole size={17}/> Copiar link secreto</button><h3>QR para a coordenação</h3><QrCode value={`${location.origin}/admin/pedidos/${order.id}`} size={140}/><p className="micro-label">{order.id}</p></aside></div>:
    <div className="compose-layout"><div className="compose-main">
      <div className="notice success"><CheckCircle2 size={18}/> Pix confirmado. Você pode criar e atualizar sua homenagem {ended?'até o horário de encerramento, que já passou.':`até ${btime(order.deadline)}.`}</div>
      <div className="form-card"><div className="row between"><h2>Escreva sua cartinha</h2><span className="micro-label">formatação livre</span></div><RichEditor key={saved?'loaded':'initial'} value={html} onChange={setHtml} disabled={ended}/></div>
      <div className="form-card"><h2>Áudios</h2>{!ended&&<Recorder onAdd={f=>add(f,'audio')}/>}<div className="asset-list">{(order.media||[]).filter(m=>m.kind==='audio').map(m=><div className="asset-row" key={m.id}><VoicePlayer src={m.url} title={m.filename} compact/><button className="icon-button danger" type="button" title="Excluir áudio" disabled={ended} onClick={async()=>{try{await api(`/api/order/media/${m.id}/delete`,{method:'DELETE',token});await reload();}catch(e){setError(e.message);}}}><Trash2 size={17}/></button></div>)}{assets.filter(a=>a.kind==='audio').map(a=><div className="asset-row" key={a.url}><VoicePlayer src={a.url} title="Novo áudio"/><button className="icon-button danger" onClick={()=>discard(assets.indexOf(a))}><Trash2 size={17}/></button></div>)}</div></div>
      <div className="form-card"><h2>Fotos</h2>{!ended&&<label className="upload-label"><ImagePlus size={20}/> Adicionar fotos<input type="file" accept="image/*,.heic,.heif" multiple onChange={e=>{[...e.target.files].forEach(f=>add(f,'image'));e.target.value='';}}/></label>}<div className="photos-grid">{(order.media||[]).filter(m=>m.kind==='image').map(m=><div className="photo-item" key={m.id}><img src={m.url} alt="Foto enviada"/>{!ended&&<button onClick={async()=>{try{await api(`/api/order/media/${m.id}/delete`,{method:'DELETE',token});await reload();}catch(e){setError(e.message);}}}><Trash2 size={17}/></button>}</div>)}{assets.filter(a=>a.kind==='image').map(a=><div className="photo-item" key={a.url}><img src={a.url} alt="Foto selecionada"/><button onClick={()=>discard(assets.indexOf(a))}><Trash2 size={17}/></button></div>)}</div></div>
      <div className="form-card"><label className="toggle-line"><input type="checkbox" disabled={ended} checked={publicMessage} onChange={e=>setPublicMessage(e.target.checked)}/><span>Permitir que minha cartinha também seja pública após a aprovação <strong>(desativado por padrão)</strong></span></label></div>
      {error&&<div className="notice error">{error}</div>}{progress&&<div className="notice success">{progress}</div>}
      <div className="inline-actions spaced"><button className="btn outline" disabled={busy||ended} onClick={()=>save(false)}><Save size={17}/> Salvar rascunho</button><button className="btn" disabled={busy||ended} onClick={()=>save(true)}><Send size={17}/> {busy?'Enviando...':'Enviar para moderação'}</button></div>
      <div className="notice">Estado da moderação: <strong>{({draft:'Rascunho',pending:'Aguardando análise',approved:'Aprovada',rejected:'Revisão solicitada'})[order.moderation]||order.moderation}</strong>. Se editar após uma aprovação, a cartinha precisará de nova revisão.</div>
      <h2 className="spaced">Prévia da cartinha</h2><LetterCard actions={false} recipient={order.recipient_name} letter={{...order,rich_html:html,public_message:publicMessage,media:[...(order.media||[]),...assets]}}/>
    </div><aside className="compose-side"><div className="form-card"><h3>Seu link secreto 🔐</h3><button className="btn ghost wide" onClick={()=>copy(privateOrder(token))}><Copy size={16}/> Copiar link</button><p className="muted small">Não compartilhe este link publicamente. Qualquer pessoa com ele pode editar sua cartinha até o prazo.</p></div></aside></div>}
  </div>;
}
