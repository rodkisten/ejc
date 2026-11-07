import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  ImagePlus,
  Trash2,
  LockKeyhole,
  Info,
  CreditCard,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { useApp } from "../main";
import { api, money, track } from "../lib/api";
import { draftGet, draftSet, draftKey } from "../lib/drafts";
import RichEditor from "../components/RichEditor";
import Recorder from "../components/Recorder";
import VoicePlayer from "../components/VoicePlayer";
import { LetterCard } from "../components/LetterCard";
import LetterControls from "../components/letter/LetterControls";
import { useLetterComposer } from "../hooks/useLetterComposer";
export default function Send() {
  const { slug } = useParams(),
    navigate = useNavigate(),
    { recipients, config } = useApp();
  const found = recipients.find((r) => r.slug === slug);
  const previewVersion = found?.og_url
    ? new URL(found.og_url, location.origin).searchParams.get("v") ||
      "20261107b"
    : "20261107b";
  const shareUrl = new URL(
    `/enviar/${encodeURIComponent(slug || "")}`,
    location.origin,
  );
  shareUrl.searchParams.set("og", previewVersion);
  useEffect(() => {
    if (!found) return;
    // Shareable page links must be versioned, otherwise WhatsApp can keep an
    // old link card for days after the portrait PNG has been updated.
    const current = new URL(window.location.href);
    if (current.searchParams.get("og") === previewVersion) return;
    current.searchParams.set("og", previewVersion);
    window.history.replaceState(
      window.history.state,
      "",
      current.pathname + current.search + current.hash,
    );
  }, [found?.og_url, slug, previewVersion]);
  const { composition, setComposition } = useLetterComposer();
  const [sender,setSender]=useState(''),[html,setHtml]=useState(''),[assets,setAssets]=useState([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false);
  const [notifyOnRead,setNotifyOnRead]=useState(false),[receiptEmail,setReceiptEmail]=useState('');
  useEffect(()=>{let active=true;draftGet(draftKey(slug)).then(d=>{if(d&&active){setSender(d.sender||'');setHtml(d.html||'');setNotifyOnRead(!!d.notifyOnRead);setReceiptEmail(d.receiptEmail||'');setComposition(d.composition);setAssets((d.assets||[]).map(x=>({...x,url:URL.createObjectURL(x.file)})));}if(active)setReady(true);}).catch(()=>setReady(true));return()=>{active=false;};},[slug]);
  useEffect(()=>{if(!ready)return;const id=setTimeout(()=>{draftSet(draftKey(slug),{sender,html,composition,notifyOnRead,receiptEmail,assets:assets.map(({file,kind})=>({file,kind}))}).catch(()=>{});},500);return()=>clearTimeout(id);},[ready,sender,html,composition,assets,notifyOnRead,receiptEmail,slug]);
  useEffect(()=>()=>{assets.forEach(x=>{if(x.url)URL.revokeObjectURL(x.url);});},[]);
  const photos=assets.filter(x=>x.kind==='image'),audios=assets.filter(x=>x.kind==='audio');
  const letter={rich_html:html,sender_name:sender,composition,media:assets.map((a,i)=>({...a,id:i,filename:a.file.name,content_type:a.file.type}))};
  const add=(file,kind)=>setAssets(a=>[...a,{file,kind,url:URL.createObjectURL(file)}]);
  const remove=index=>setAssets(a=>{const copy=[...a],item=copy.splice(index,1)[0];if(item?.url)URL.revokeObjectURL(item.url);return copy;});
  async function pay(){
    setBusy(true);setError('');try{
      await draftSet(draftKey(slug),{sender,html,composition,notifyOnRead,receiptEmail,assets:assets.map(({file,kind})=>({file,kind}))});
      const data=await api('/api/orders',{method:'POST',data:{recipient_slug:slug,sender_name:sender,notify_on_read:notifyOnRead,read_receipt_email:notifyOnRead?receiptEmail:''}});
      localStorage.setItem('ejc-last-order',data.token);localStorage.setItem(`ejc-order-slug-${data.token}`,slug);
      track('order_created');navigate(`/pedido/${data.token}`);
    }catch(e){setError(e.message);setBusy(false);}
  }
  if (!found)
    return (
      <div className="empty">
        <h2>Encontrista não encontrado.</h2>
        <Link to="/">Voltar à lista</Link>
      </div>
    );
  return (
    <div className="compose-layout">
      <div className="compose-main">
        <div className="step-label">ETAPA 02 / CRIE SUA HOMENAGEM</div>
        {found.photo_url && (
          <div className="send-recipient">
            <img src={found.photo_url} alt={`Foto de ${found.name}`} />
            <span>Para {found.name}</span>
          </div>
        )}
        <h1>
          Uma cartinha para <br/> <em>{found.name}.</em>
        </h1>
        <button
          className="btn ghost"
          type="button"
          onClick={async () => {
            const url = shareUrl.toString();
            const title =
              "Uma cartinha para " + found.name + " · XX EJC Simonésia";
            try {
              if (navigator.share) {
                await navigator.share({
                  title,
                  text:
                    "Envie uma mensagem, foto ou áudio para " +
                    found.name +
                    ".",
                  url,
                });
              } else {
                await navigator.clipboard.writeText(url);
                setError("");
                alert("Link de envio copiado!");
              }
            } catch (err) {
              if (err?.name !== "AbortError")
                setError("Não foi possível compartilhar o link.");
            }
          }}
        >
          <Share2 size={16} /> Compartilhar link
        </button>
        <p className="muted">
          Você pode gravar quantas vezes quiser e ouvir antes de guardar. Tudo
          fica como rascunho neste aparelho até a confirmação do Pix.
        </p>
        <section className="form-card">
          <label htmlFor="sender">
            Como quer assinar? <span className="muted">(opcional)</span>
          </label>
          <input
            id="sender"
            value={sender}
            onChange={(e) => setSender(e.target.value.slice(0, 100))}
            placeholder="Seu nome ou uma pessoa especial"
          />
        </section>
        <section className="form-card">
          <div className="row between">
            <h2>01. Suas palavras ✍️</h2>
            <span className="micro-label">pode escrever à vontade 💕</span>
          </div>
          <RichEditor value={html} onChange={setHtml} />
        </section>
        <section className="form-card">
          <h2>02. Sua voz 🎙️</h2>
          <p className="muted small">
            Regrave até gostar do resultado. Você também pode adicionar mais de
            um áudio.
          </p>
          <Recorder onAdd={(f) => add(f, "audio")} />
          {!!audios.length && (
            <div className="asset-list">
              {audios.map((a) => (
                <div key={a.url} className="asset-row">
                  <VoicePlayer src={a.url} title={a.file.name} compact />
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="Remover áudio"
                    onClick={() => remove(assets.indexOf(a))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="form-card">
          <h2>03. Suas fotos 📷</h2>
          <p className="muted small">
            Adicione quantas imagens quiser para acompanhar a cartinha.
          </p>
          <label className="upload-label">
            <ImagePlus size={20} /> Adicionar fotos
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              onChange={(e) => {
                [...e.target.files].forEach((f) => add(f, "image"));
                e.target.value = "";
                track("photo_selected");
              }}
            />
          </label>
          {!!photos.length && (
            <div className="photos-grid">
              {photos.map((a) => (
                <div key={a.url} className="photo-item">
                  <img src={a.url} alt="Prévia de foto" />
                  <button
                    type="button"
                    onClick={() => remove(assets.indexOf(a))}
                    aria-label="Excluir foto"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <LetterControls
          composition={composition}
          onChange={setComposition}
          senderName={sender}
        />
        <section className="form-card">
          <div className="row between">
            <div>
              <h2>Uma cartinha só para quem vai receber 🔐</h2>
              <p className="muted small">
                Sua homenagem não é pública. A equipe do EJC não tem uma tela
                para ler mensagens, ver fotos ou ouvir áudios. A coordenação
                cuida apenas do Pix e da organização dos pedidos.
              </p>
              <p className="muted small">
                O conteúdo fica armazenado na nuvem até o dia 31/12/2026. Depois
                dessa data, todos os arquivos serão permanentemente apagados.
              </p>
            </div>
            <LockKeyhole size={21} />
          </div>
        </section>
        <div className="notice">
          <Info size={17} />
          <span>
            Áudios e fotos gravados antes do pagamento ficam guardados apenas
            neste navegador. Não limpe os dados do Chrome ou Safari e evite
            trocar de aparelho até pagar e enviar os arquivos.
          </span>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="inline-actions spaced">
          <button
            className="btn ghost"
            type="button"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "Fechar prévia" : "Ver minha cartinha"}
          </button>
          <button
            className="btn"
            disabled={
              busy || !ready || !config?.payments_ready || !config?.open
            }
            onClick={pay}
          >
            <CreditCard size={18} />{" "}
            {busy
              ? "Gerando Pix..."
              : `Gerar Pix de ${money(config?.amount_cents)}`}{" "}
            <ArrowRight size={17} />
          </button>
        </div>
        {!config?.payments_ready && (
          <div className="notice warning">
            A coordenação ainda precisa configurar a chave Pix.
          </div>
        )}
        {preview && (
          <div className="preview-popup">
            <LetterCard
              letter={letter}
              recipient={found.name}
              editable
              onCompositionChange={setComposition}
              actions={false}
            />
          </div>
        )}
      </div>
    </section>
    {config?.read_emails_enabled&&
      <section className="email-read-field">
        <label>
          <input type="checkbox" checked={notifyOnRead} onChange={e=>setNotifyOnRead(e.target.checked)}/>
          💌 Quero receber um e-mail quando minha cartinha for aberta (opcional)
        </label>
        {notifyOnRead&&<>
          <input type="email" inputMode="email" autoComplete="email" value={receiptEmail}
            onChange={e=>setReceiptEmail(e.target.value.slice(0,254))}
            placeholder="seuemail@exemplo.com" aria-label="Seu e-mail para receber aviso de leitura"/>
          <p>Enviaremos uma confirmação para seu e-mail. Depois, apenas um aviso quando
            o encontrista abrir esta cartinha. A coordenação não vê seu endereço.</p>
        </>}
      </section>}
    <div className="notice"><Info size={17}/><span>Áudios e fotos gravados antes do pagamento ficam guardados apenas neste navegador. Não limpe os dados do Chrome ou Safari e evite trocar de aparelho até pagar e enviar os arquivos.</span></div>
    {error && <div className="notice error">{error}</div>}
    <div className="inline-actions spaced"><button className="btn ghost" type="button" onClick={()=>setPreview(v=>!v)}>{preview?'Fechar prévia':'Ver minha cartinha'}</button><button className="btn" disabled={busy||!ready||!config?.payments_ready||!config?.open||(notifyOnRead&&!receiptEmail.includes('@'))} onClick={pay}><CreditCard size={18}/> {busy?'Gerando Pix...':`Gerar Pix de ${money(config?.amount_cents)}`} <ArrowRight size={17}/></button></div>
    {!config?.payments_ready && <div className="notice warning">A coordenação ainda precisa configurar a chave Pix.</div>}
    {preview && <div className="preview-popup"><LetterCard letter={letter} recipient={found.name} editable onCompositionChange={setComposition} actions={false}/></div>}
  </div><aside className="compose-side"><div className="side-paper"><div className="letter-stamp">ANTES DE ENVIAR ♡</div><h3>Você não precisa ter as palavras perfeitas.</h3><p>Às vezes um “eu te amo”, uma foto antiga ou um áudio espontâneo dizem tudo.</p><span>✳ &nbsp; XX EJC SIMONÉSIA</span></div><div className="sidebar-steps"><CheckCircle2 size={18}/> Criar agora ou depois de pagar<br/><CheckCircle2 size={18}/> Conferência do Pix<br/><CheckCircle2 size={18}/> Envio direto ao mural privado<br/><CheckCircle2 size={18}/> Mural secreto liberado na hora certa</div></aside></div>;
}
