import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Info, ShoppingBag, Share2, CheckCircle2 } from 'lucide-react';
import { useApp } from '../main';
import { money, track } from '../lib/api';
import { draftGet, draftSet, draftRemove, draftKey } from '../lib/drafts';
import { useCart, cartDraftKey, checkoutForDraft } from '../lib/cart';
import { LetterCard } from '../components/LetterCard';
import { useLetterComposer } from '../hooks/useLetterComposer';
import LetterComposerFields from '../components/LetterComposerFields';

export default function Send() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const editId = new URLSearchParams(location.search).get('edit');
  const alreadyPurchased = editId ? checkoutForDraft(editId) : null;
  const { recipients, config } = useApp();
  const cart = useCart();
  const found = recipients.find((r) => r.slug === slug);
  const { composition, setComposition } = useLetterComposer();
  const [sender, setSender] = useState('');
  const [html, setHtml] = useState('');
  const [assets, setAssets] = useState([]);
  const [notifyOnRead, setNotifyOnRead] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(true);
  const [error, setError] = useState('');
  const firstEdit=useRef(false);
  const assetRef = useRef([]);
  assetRef.current = assets;

  const key = editId ? cartDraftKey(editId) : draftKey(slug);
  useEffect(()=>{firstEdit.current=false;track('letter_composer_view',{stage:editId?'editing':'new'});},[slug,editId]);
  useEffect(() => {
    let active = true;
    setReady(false);
    draftGet(key).then((draft) => {
      if (!active) return;
      setSender(draft?.sender || '');
      setHtml(draft?.html || '');
      setComposition(draft?.composition);
      setNotifyOnRead(!!draft?.notifyOnRead);
      setReceiptEmail(draft?.receiptEmail || '');
      setAssets((draft?.assets || []).map((asset) => ({
        ...asset, url: URL.createObjectURL(asset.file),
      })));
    }).catch(() => {
      if (active) setError('Não foi possível recuperar o rascunho anterior.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key, setComposition]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => draftSet(key, {
      sender, html, composition, notifyOnRead, receiptEmail,
      assets: assets.map(({ file, kind }) => ({ file, kind })),
      recipient_slug: slug,
    }).catch(() => {}), 600);
    return () => clearTimeout(timer);
  }, [key, ready, sender, html, composition, assets, notifyOnRead, receiptEmail, slug]);

  useEffect(() => () => assetRef.current.forEach((a) => {
    if (a.url) URL.revokeObjectURL(a.url);
  }), []);

  const letter = useMemo(() => ({
    rich_html: html, sender_name: sender, composition,
    media: assets.map((asset, index) => ({
      ...asset, id: index, filename: asset.file.name, content_type: asset.file.type,
    })),
  }), [html, sender, composition, assets]);

  function add(file, kind) {
    if(file){
      track('letter_attachment_added',{kind});
      setAssets((previous) => [...previous,{file,kind,url:URL.createObjectURL(file)}]);
    }
  }
  function remove(index) {
    setAssets((previous) => {
      const next = [...previous], removed = next.splice(index, 1)[0];
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return next;
    });
  }

  async function putInCart() {
    if (!ready || !cart.ready || !found) return;
    setBusy(true);
    setError('');
    try {
      await cart.save({
        id: editId || undefined,
        recipient_slug: slug,
        sender_name: sender.trim(),
        html, composition, notifyOnRead, receiptEmail: notifyOnRead ? receiptEmail : '',
        assets: assets.map(({ file, kind }) => ({ file, kind })),
      });
      if (!editId) await draftRemove(draftKey(slug));
      track('letter_added_to_cart',{stage:editId?'updated':'new',letters:cart.items.length+1});
      navigate('/carrinho');
    } catch (cause) {
      setError(cause.message || 'Não foi possível salvar a cartinha.');
    } finally {
      setBusy(false);
    }
  }

  async function sharePage() {
    if (!found) return;
    const url = new URL('/enviar/' + encodeURIComponent(slug), window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({
        title: 'Uma cartinha para ' + found.name + ' · XX EJC Simonésia',
        text: 'Envie uma homenagem especial para ' + found.name + '.',
        url,
      });
      else { await navigator.clipboard.writeText(url); setError('Link de envio copiado!'); }
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError('Não foi possível compartilhar o link.');
    }
  }

  if (!found) return <div className="empty">
    <h2>Encontrista não encontrado.</h2><Link to="/">Voltar à lista</Link>
  </div>;
  if (alreadyPurchased) return <div className="empty">
    <h2>Esta cartinha já está vinculada a um Pix 💌</h2>
    <p>Você pode continuar editando e confirmar alterações pelo mesmo link privado,
      sem gerar outro pagamento. Seu rascunho original continua salvo neste aparelho.</p>
    <Link className="btn" to={'/checkout/' + alreadyPurchased.token}>
      Abrir Pix {alreadyPurchased.id}
    </Link>
  </div>;

  return (
    <div className="compose-layout">
      <div className="compose-main">
        <div className="step-label">SUA CARTINHA / {editId ? 'EDITANDO NO CARRINHO' : 'NOVA HOMENAGEM'}</div>
        <div className="send-recipient">
          {found.photo_url ? <img src={found.photo_url} alt={'Foto de ' + found.name} /> :
            <span className="recipient-initial">{found.name[0]}</span>}
          <span>Para <strong>{found.name}</strong></span>
        </div>
        <h1>Uma cartinha para <em>{found.name}.</em></h1>
        <div className="inline-actions">
          <button className="btn ghost" type="button" onClick={sharePage}>
            <Share2 size={17} /> Compartilhar link
          </button>
          <Link className="btn outline" to="/carrinho">
            <ShoppingBag size={17} /> Carrinho ({cart.items.length})
          </Link>
        </div>
        <p className="muted">Escreva, decore e escolha suas fotos ou áudios. Você pode fazer uma cartinha diferente para cada pessoa ou duplicar a mesma no carrinho.</p>

        <LetterComposerFields
          sender={sender}
          onSenderChange={setSender}
          html={html}
          onHtmlChange={value => {
            setHtml(value);
            if (!firstEdit.current && value?.trim()) {
              firstEdit.current = true;
              track('letter_first_edit', { stage: 'composer' });
            }
          }}
          composition={composition}
          onCompositionChange={setComposition}
          assets={assets}
          onAddAsset={add}
          onRemoveAsset={asset => remove(assets.indexOf(asset))}
          readReceiptSlot={config?.read_emails_enabled && <section className="form-card email-read-field">
            <label><input type="checkbox" checked={notifyOnRead}
              onChange={event => setNotifyOnRead(event.target.checked)} />
              Quero receber um e-mail quando esta cartinha for aberta (opcional)
            </label>
            {notifyOnRead && <input type="email" inputMode="email" autoComplete="email"
              value={receiptEmail} placeholder="seuemail@exemplo.com"
              onChange={event => setReceiptEmail(event.target.value.slice(0, 254))} />}
          </section>}
        />

        <div className="notice"><Info size={17} />
          <span>Os rascunhos com fotos e áudios ficam neste navegador até serem enviados após o pagamento. Não limpe os dados do Safari ou troque de aparelho.</span>
        </div>

        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="inline-actions spaced cart-composer-actions">
          <button className="btn ghost" type="button" onClick={() => {track('letter_preview_toggled',{stage:preview?'hide':'show'});setPreview((value) => !value);}}>
            {preview ? 'Ocultar prévia' : 'Ver minha cartinha'}
          </button>
          <button className="btn" type="button" onClick={putInCart}
            disabled={busy || !ready || !cart.ready || !config?.open ||
              (notifyOnRead && !receiptEmail.includes('@'))}>
            <ShoppingBag size={18} /> {busy ? 'Salvando...' : 'Adicionar ao carrinho'}
            <ArrowRight size={17} />
          </button>
        </div>
        {!config?.open && <p className="notice warning">A criação de cartinhas está temporariamente pausada.</p>}
        <p className="muted small">Cada cartinha custa {money(config?.amount_cents)}. Você paga todas juntas num único Pix.</p>
        {preview && <div className="preview-popup letter-reveal">
          <LetterCard letter={letter} recipient={found.name}
            editable onCompositionChange={setComposition} actions={false} />
        </div>}
      </div>

      <aside className="compose-side">
        <div className="side-paper">
          <div className="letter-stamp">DO SEU JEITO ♡</div>
          <h3>Uma carta, mil jeitos de dizer carinho.</h3>
          <p>Palavras, fotos, voz e os adesivos de fé que você escolheu.</p>
          <span>✳ &nbsp; XX EJC SIMONÉSIA</span>
        </div>
        <div className="sidebar-steps">
          <CheckCircle2 size={18} /> Crie quantas cartinhas quiser
          <p><CheckCircle2 size={18} /> Duplique para outros encontristas</p>
          <p><CheckCircle2 size={18} /> Um único Pix no carrinho</p>
          <p><CheckCircle2 size={18} /> Envio privado após a confirmação</p>
        </div>
      </aside>
    </div>
  );
}
