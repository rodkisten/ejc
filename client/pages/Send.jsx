import React,{useEffect,useMemo,useState} from 'react';
import { useNavigate,useParams,Link } from 'react-router-dom';
import { ArrowRight, ImagePlus, Trash2, LockKeyhole, Info, CreditCard, CheckCircle2, Share2 } from 'lucide-react';
import { useApp } from '../main';
import { api, money, track } from '../lib/api';
import { draftGet,draftSet,draftKey } from '../lib/drafts';
import RichEditor from '../components/RichEditor';
import Recorder from '../components/Recorder';
import VoicePlayer from '../components/VoicePlayer';
import { LetterCard } from '../components/LetterCard';
export default function Send(){
  const {slug}=useParams(),navigate=useNavigate(),{recipients,config}=useApp();
  const found=recipients.find(r=>r.slug===slug);
  const [sender,setSender]=useState(''),[html,setHtml]=useState(''),[assets,setAssets]=useState([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false);
  useEffect(()=>{let active=true;draftGet(draftKey(slug)).then(d=>{if(d&&active){setSender(d.sender||'');setHtml(d.html||'');setAssets((d.assets||[]).map(x=>({...x,url:URL.createObjectURL(x.file)})));}if(active)setReady(true);}).catch(()=>setReady(true));return()=>{active=false;};},[slug]);
  useEffect(()=>{if(!ready)return;const id=setTimeout(()=>{draftSet(draftKey(slug),{sender,html,assets:assets.map(({file,kind})=>({file,kind}))}).catch(()=>{});},500);return()=>clearTimeout(id);},[ready,sender,html,assets,slug]);
  useEffect(()=>()=>{assets.forEach(x=>{if(x.url)URL.revokeObjectURL(x.url);});},[]);
  const photos=assets.filter(x=>x.kind==='image'),audios=assets.filter(x=>x.kind==='audio');
  const letter={rich_html:html,sender_name:sender,media:assets.map((a,i)=>({...a,id:i,filename:a.file.name,content_type:a.file.type}))};
  const add=(file,kind)=>setAssets(a=>[...a,{file,kind,url:URL.createObjectURL(file)}]);
  const remove=index=>setAssets(a=>{const copy=[...a],item=copy.splice(index,1)[0];if(item?.url)URL.revokeObjectURL(item.url);return copy;});
  async function pay(){
    setBusy(true);setError('');try{
      await draftSet(draftKey(slug),{sender,html,assets:assets.map(({file,kind})=>({file,kind}))});
      const data=await api('/api/orders',{method:'POST',data:{recipient_slug:slug,sender_name:sender}});
      localStorage.setItem('ejc-last-order',data.token);localStorage.setItem(`ejc-order-slug-${data.token}`,slug);
      track('order_created');navigate(`/pedido/${data.token}`);
    }catch(e){setError(e.message);setBusy(false);}
  }
  if(!found)return <div className="empty"><h2>Encontrista não encontrado.</h2><Link to="/">Voltar à lista</Link></div>;
  return <div className="compose-layout"><div className="compose-main">
    <div className="step-label">ETAPA 02 / CRIE SUA HOMENAGEM</div>{found.photo_url&&<div className="send-recipient"><img src={found.photo_url} alt={`Foto de ${found.name}`}/><span>Para {found.name}</span></div>}<h1>Uma cartinha para <em>{found.name}.</em></h1>
    <button
      className="btn ghost"
      type="button"
      onClick={async () => {
        const url=location.origin+'/enviar/'+encodeURIComponent(found.slug);
        const title='Uma cartinha para '+found.name+' · XX EJC Simonésia';
        try{
          if(navigator.share){
            await navigator.share({title,text:'Envie uma mensagem, foto ou áudio para '+found.name+'.',url});
          }else{
            await navigator.clipboard.writeText(url);
            setError('');
            alert('Link de envio copiado!');
          }
        }catch(err){if(err?.name!=='AbortError')setError('Não foi possível compartilhar o link.');}
      }}
    >
      <Share2 size={16}/> Compartilhar link pelo WhatsApp ou redes sociais
    </button>
    <p className="muted">Você pode gravar quantas vezes quiser e ouvir antes de guardar. Tudo fica como rascunho neste aparelho até a confirmação do Pix.</p>
    <section className="form-card"><label htmlFor="sender">Como quer assinar? <span className="muted">(opcional)</span></label><input id="sender" value={sender} onChange={e=>setSender(e.target.value.slice(0,100))} placeholder="Seu nome ou uma pessoa especial"/></section>
    <section className="form-card"><div className="row between"><h2>01. Suas palavras ✍️</h2><span className="micro-label">editor de texto rico</span></div><RichEditor value={html} onChange={setHtml}/></section>
    <section className="form-card"><h2>02. Sua voz 🎙️</h2><p className="muted small">Regrave até gostar do resultado. Você também pode adicionar mais de um áudio.</p><Recorder onAdd={f=>add(f,'audio')}/>
      {!!audios.length && <div className="asset-list">{audios.map(a=><div key={a.url} className="asset-row"><VoicePlayer src={a.url} title={a.file.name} compact/><button type="button" className="icon-button danger" aria-label="Remover áudio" onClick={()=>remove(assets.indexOf(a))}><Trash2 size={17}/></button></div>)}</div>}
    </section>
    <section className="form-card"><h2>03. Suas fotos 📷</h2><p className="muted small">Adicione quantas imagens quiser para acompanhar a cartinha.</p><label className="upload-label"><ImagePlus size={20}/> Adicionar fotos<input type="file" accept="image/*,.heic,.heif" multiple onChange={e=>{[...e.target.files].forEach(f=>add(f,'image'));e.target.value='';track('photo_selected');}}/></label>
      {!!photos.length && <div className="photos-grid">{photos.map(a=><div key={a.url} className="photo-item"><img src={a.url} alt="Prévia de foto"/><button type="button" onClick={()=>remove(assets.indexOf(a))} aria-label="Excluir foto"><Trash2 size={17}/></button></div>)}</div>}
    </section>
    <section className="form-card">
      <div className="row between">
        <div>
          <h2>Uma cartinha só para quem vai receber 🔐</h2>
          <p className="muted small">
            Sua homenagem não é pública. A equipe do EJC não tem uma tela para ler
            mensagens, ver fotos ou ouvir áudios. A coordenação cuida apenas do Pix
            e da organização dos pedidos.
          </p>
          <p className="muted small">
            O conteúdo fica armazenado na nuvem e esta versão ainda não usa
            criptografia de ponta a ponta. O código do mural deve ser mantido privado.
          </p>
        </div>
        <LockKeyhole size={21}/>
      </div>
    </section>
    <div className="notice"><Info size={17}/><span>Áudios e fotos gravados antes do pagamento ficam guardados apenas neste navegador. Não limpe os dados do Safari e evite trocar de aparelho até pagar e enviar os arquivos.</span></div>
    {error && <div className="notice error">{error}</div>}
    <div className="inline-actions spaced"><button className="btn ghost" type="button" onClick={()=>setPreview(v=>!v)}>{preview?'Fechar prévia':'Ver minha cartinha'}</button><button className="btn" disabled={busy||!ready||!config?.payments_ready||!config?.open} onClick={pay}><CreditCard size={18}/> {busy?'Gerando Pix...':`Gerar Pix de ${money(config?.amount_cents)}`} <ArrowRight size={17}/></button></div>
    {!config?.payments_ready && <div className="notice warning">A coordenação ainda precisa configurar a chave Pix.</div>}
    {preview && <div className="preview-popup"><LetterCard letter={letter} recipient={found.name} actions={false}/></div>}
  </div><aside className="compose-side"><div className="side-paper"><div className="letter-stamp">ANTES DE ENVIAR ♡</div><h3>Você não precisa ter as palavras perfeitas.</h3><p>Às vezes um “eu te amo”, uma foto antiga ou um áudio espontâneo dizem tudo.</p><span>✳ &nbsp; XX EJC SIMONÉSIA</span></div><div className="sidebar-steps"><CheckCircle2 size={18}/> Criar agora ou depois de pagar<br/><CheckCircle2 size={18}/> Conferência do Pix<br/><CheckCircle2 size={18}/> Envio direto ao mural privado<br/><CheckCircle2 size={18}/> Mural secreto liberado na hora certa</div></aside></div>;
}
