import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Copy,
  RefreshCw,
  CheckCircle2,
  Clock3,
  ArrowRight,
  LockKeyhole,
  ImagePlus,
  Trash2,
  Save,
  Send,
  Share2,
  Image as ImageIcon,
} from 'lucide-react';
import { api, btime, money, privateOrder, uploadMedia, track } from '../lib/api';
import { draftGet, draftSet, draftKey } from '../lib/drafts';
import { backupOrderLetter, findLocalLetterVersions, letterPlainText } from '../lib/draftRecovery.js';
import { cartDraftKey } from '../lib/cart';
import { rememberPrivateOrder } from '../lib/unfinishedLetters.js';
import QrCode from '../components/QrCode';
import CheckoutSupport from '../components/CheckoutSupport';
import { useApp } from '../main';
import { LetterCard } from '../components/LetterCard';
import InstagramExportPanel from '../components/social/InstagramExportPanel';
import { useLetterComposer } from '../hooks/useLetterComposer';
import LetterComposerFields from '../components/LetterComposerFields';
import { openSecureSupport } from '../lib/secureSupport.js';
function sameDraft(a, b) {
  return a === b;
}
export default function Order() {
  const { recipients, config } = useApp();
  const navigate = useNavigate();
  const { composition, setComposition } = useLetterComposer();
  const { token } = useParams(),
    [order, setOrder] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [sender, setSender] = useState('');
  const [localVersions, setLocalVersions] = useState([]);
  const [localScanDone, setLocalScanDone] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [backupWarning, setBackupWarning] = useState('');
  const [html, setHtml] = useState(''),
    [assets, setAssets] = useState([]),
    [progress, setProgress] = useState('');
  const activeToken = useRef(token);
  activeToken.current = token;
  const startedTracking=useRef(false);
  const [supportPhone,setSupportPhone] = useState('');
  useEffect(()=>{
    const c=new URLSearchParams(window.location.search).get('c')||
      sessionStorage.getItem('ejc-support-context');
    if(!c)return;
    api('/api/support/context?c='+encodeURIComponent(c))
      .then(data=>{if(data.phone)setSupportPhone(data.phone);})
      .catch(()=>{});
  },[token]);
  const confirmSupport=async ({sender:author='',items=[],submitted=true}={})=>{
    setError('');
    try{
      await openSecureSupport({
        purpose:submitted?'finished':'support',
        name:author||sender||order?.sender_name||'',phone:supportPhone,
        ids:items.map(item=>item.id).slice(0,20),
        recipientSlugs:order?.recipient_slug?[order.recipient_slug]:[],
        stage:submitted?'cartinha_finalizada':'rascunho_salvo',
        source:'editor',medium:'botao',campaign:'confirmacao_envio',
        content:'suporte_remetente',token
      });
      track('help_link_clicked',{stage:submitted?'letter_submitted':'draft_saved'});
    }catch(cause){setError(cause.message);}
  };
  const copyPrivateShortLink=async()=>{
    if(!order?.id)return;
    try{
      const destination=privateOrder(token);
      const short=await api('/api/links/shorten',{
        method:'POST',token,data:{url:destination}
      });
      try{await navigator.clipboard.writeText(short.url);}
      catch{window.prompt('Copie seu link curto e secreto:',short.url);}
      track('private_short_link_copied',{stage:'order'});
    }catch(cause){setError(cause.message||'Não foi possível gerar um link curto.');}
  };
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptBusy,setReceiptBusy] = useState(false);
  const [completion,setCompletion] = useState(null);
  const [preview,setPreview] = useState(true);
  const reload = useCallback(async () => {
    try {
      const o = await api('/api/order', { token });
      if (activeToken.current === token) {
        setOrder(o);
        rememberPrivateOrder(o, token);
        setError('');
      }
      return o;
    } catch (e) {
      if (activeToken.current === token) setError(e.message);
      return null;
    }
  }, [token]);
  useEffect(() => {
    setOrder(null);
    setSaved(false);
    setError('');
    setProgress('');
    setCompletion(null);
    setLocalVersions([]);
    setLocalScanDone(false);
    setRecoveryNotice('');
    setBackupWarning('');
    setHtml('');
    setSender('');
    setAssets((previous) => {
      previous.forEach(asset => URL.revokeObjectURL(asset.url));
      return [];
    });
    reload();
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if(order?.id)track('letter_editor_view',{stage:order.submitted?'submitted':'draft'});
  },[order?.id]);
  useEffect(() => {
    if (!order || saved) return;
    setHtml(order.rich_html || '');
    setSender(order.sender_name || '');
    setComposition(order.composition);
    setSaved(true);
  }, [order, saved]);
  // Look for every matching local text version, including copies from before
  // checkout. Never silently replace the D1 text with an older browser draft.
  useEffect(() => {
    if (!order?.id || !saved) return;
    let active = true;
    setLocalScanDone(false);
    findLocalLetterVersions(order)
      .then((versions) => {
        if (active) setLocalVersions(versions.filter((version) =>
          letterPlainText(version.html) !== letterPlainText(order.rich_html)));
      })
      .catch(() => { if (active) setLocalVersions([]); })
      .finally(() => { if (active) setLocalScanDone(true); });
    return () => { active = false; };
  }, [order?.id, saved, token]);

  // A durable same-device backup follows each edit, without writing an empty
  // initialization state over recovered text.
  useEffect(() => {
    if (!order?.id || !saved || !letterPlainText(html)) return;
    const timer = setTimeout(() => {
      backupOrderLetter(order, { html, sender, composition })
        .catch(() => setBackupWarning('O navegador não conseguiu guardar uma cópia offline. Salve no servidor antes de fechar.'));
    }, 500);
    return () => clearTimeout(timer);
  }, [order?.id, saved, html, sender, composition]);

  useEffect(() => {
    if (!order?.id || !saved || !letterPlainText(html)) return;
    const flush = () => {
      backupOrderLetter(order, { html, sender, composition }).catch(() => {});
    };
    window.addEventListener('pagehide', flush);
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [order?.id, saved, html, sender, composition]);

  // A local attachment can still be uploaded if the server has no media.
  // Otherwise it would duplicate photos already moved during checkout.
  useEffect(() => {
    if (!order?.id || !saved || order.media?.length) return;
    const slug = localStorage.getItem(`ejc-order-slug-${token}`);
    const cartId = localStorage.getItem('ejc-cart-order-' + token);
    if (!slug && !cartId) return;
    let active = true;
    draftGet(cartId ? cartDraftKey(cartId) : draftKey(slug)).then((draft) => {
      if (!active || !draft || draft.recipient_slug !== order.recipient_slug) return;
      const author = String(draft.sender || '').trim().toLowerCase();
      const expected = String(order.sender_name || '').trim().toLowerCase();
      if (author && expected && author !== expected) return;
      setAssets((current) => current.length ? current :
        (draft.assets || []).filter((asset) => asset.file)
          .map((asset) => ({ ...asset, url: URL.createObjectURL(asset.file) })));
    }).catch(() => {});
    return () => { active = false; };
  }, [order?.id, saved, token]);
  const paid = order && ['paid', 'preparing', 'delivered'].includes(order.status),
    ended = !order?.resume_access && !(paid && !order?.submitted) && order?.deadline &&
      Date.now() >= new Date(`${order.deadline}:00-03:00`).getTime();
  const add = (file, kind) => {
    if(!file)return;
    track('letter_attachment_added',{kind});
    setAssets((a) => [...a, { file, kind, url: URL.createObjectURL(file) }]);
  };
  const discard = (index) =>
    setAssets((a) => {
      const list = [...a];
      URL.revokeObjectURL(list[index].url);
      list.splice(index, 1);
      return list;
    });
  const copy = (text) =>
    navigator.clipboard
      .writeText(text)
      .then(() => setProgress('Copiado!'))
      .catch(() => setError('Não foi possível copiar. Selecione o texto manualmente.'));
  async function claim() {
    setBusy(true);
    try {
      await api('/api/order/claim', { method: 'POST', token, data: {} });
      await reload();
      track('pix_claimed');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(withSubmit = false) {
    if (withSubmit && !letterPlainText(html) &&
        (assets.length || order?.media?.length) &&
        !window.confirm('Esta cartinha tem fotos ou áudios, mas nenhum texto. ' +
          'Quer mesmo finalizar e enviar sem uma mensagem escrita?')) return;
    const confirmClear = letterPlainText(order?.rich_html) && !letterPlainText(html);
    if (confirmClear && !window.confirm(
      'O texto salvo no servidor será apagado. Quer realmente deixar a cartinha sem texto?')) return;
    setBusy(true);
    setError('');
    setCompletion(null);
    try {
      try {
        await backupOrderLetter(order, { html, sender, composition });
      } catch {
        setBackupWarning('Não foi possível atualizar a cópia offline neste navegador.');
      }
      await api('/api/order/message', {
        method: 'PUT',
        token,
        data: { rich_html: html, sender_name: sender, composition,
          confirm_clear: !!confirmClear },
      });
      const verified = await api('/api/order', { token });
      if (letterPlainText(verified.rich_html) !== letterPlainText(html)) {
        throw new Error('O texto recebido pelo servidor não confere com o editor. Sua cópia local foi mantida; tente salvar novamente.');
      }
      track('letter_saved',{stage:paid?'paid':'pending'});
      for (const a of assets) {
        setProgress(`Enviando ${a.file.name}...`);
        await uploadMedia(a.file, a.kind, token, (p) => setProgress(`${a.file.name} · ${p}%`));
        track('letter_attachment_uploaded',{kind:a.kind});
      }
      assets.forEach((a) => URL.revokeObjectURL(a.url));
      setAssets([]);
      setProgress('Arquivos salvos!');
      // Keep the original local drafts and attachments as an offline recovery copy,
      // even after a Pix is generated or a letter is submitted.
      const cartId = localStorage.getItem('ejc-cart-order-' + token);
      const slug = localStorage.getItem(`ejc-order-slug-${token}`);
      const backupKey = cartId ? cartDraftKey(cartId) : slug ? draftKey(slug) : null;
      if (backupKey) {
        try {
          const previous = await draftGet(backupKey) || {};
          await draftSet(backupKey, {
            ...previous, sender, html, composition, updatedAt: new Date().toISOString(),
            assets: previous.assets || [],
          });
        } catch { /* Server data is authoritative; local backup is best-effort. */ }
      }
      if (withSubmit) {
        await api('/api/order/submit', { method: 'POST', token, data: {} });
        track('letter_submitted',{stage:paid?'paid':'pending'});
      }
      await reload();
      setProgress('');
      setLocalVersions([]);
      setRecoveryNotice('');
      setCompletion({
        type: withSubmit ? 'submitted' : 'saved',
        sender: sender || order.sender_name || '',
        items: [{ id: order.id, recipient_name: order.recipient_name }],
      });
      // Do not navigate automatically: the sender should see the explicit confirmation.
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function requestReadEmail() {
    setReceiptBusy(true);
    setError('');
    try {
      await api('/api/order/read-notification', {
        method: 'POST', token, data: { enabled: true, email: receiptEmail },
      });
      setProgress('Verifique sua caixa de entrada e confirme o e-mail de leitura.');
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReceiptBusy(false);
    }
  }
  async function cancelReadEmail() {
    setReceiptBusy(true);
    try {
      await api('/api/order/read-notification', {
        method: 'POST', token, data: { enabled: false },
      });
      setProgress('Avisos de leitura desativados.');
      await reload();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setReceiptBusy(false);
    }
  }
  if (error && !order)
    return (
      <div className="empty">
        <h2>Não foi possível abrir a sua cartinha.</h2>
        <p>{error}</p>
        <Link to="/" className="btn">
          Voltar
        </Link>
      </div>
    );
  if (!order) return <div className="loading">Carregando sua cartinha... ♡</div>;
  const recipient = recipients.find((r) => r.slug === order.recipient_slug);
  return (
    <div className="order-wrap">
      <div className="section-head">
        <div>
          <span className="eyebrow">PEDIDO {order.id}</span>
          <h1>
            Para {order.recipient_name} <em>♡</em>
          </h1>
          <p>Este link é privado. Guarde-o para continuar depois.</p>
        </div>
        <span className={`status-pill ${paid ? 'success' : 'pending'}`}>
          {({
          pending:'Aguardando pagamento',
          claimed:'Pagamento informado · em conferência',
          paid:'Pagamento confirmado',
          preparing:'Homenagem em preparação',
          delivered:'Homenagem entregue',
          cancelled:'Pedido cancelado'
        })[order.status] || 'Aguardando conferência'}
        </span>
      </div>
      {config?.read_emails_enabled && (
        <section className="email-read-field" aria-label="Aviso opcional de leitura">
          <strong>💌 Quer saber quando sua cartinha for aberta?</strong>
          {order.read_notification?.enabled ? (
            <>
              <p>{order.read_notification?.notified ? 'O aviso já foi enviado.' :
                order.read_notification?.verified ? 'E-mail confirmado. Avisaremos após a primeira abertura.' :
                  'Confirme o endereço pelo e-mail enviado para ativar o aviso.'}</p>
              {!order.read_notification?.notified && (
                <button className="btn ghost" type="button" disabled={receiptBusy}
                  onClick={cancelReadEmail}>Desativar aviso</button>
              )}
            </>
          ) : (
            <>
              <p>É opcional. Enviaremos um aviso somente quando o encontrista abrir esta cartinha, sem mostrar o conteúdo.</p>
              <input type="email" inputMode="email" autoComplete="email" placeholder="seuemail@exemplo.com"
                value={receiptEmail} onChange={e=>setReceiptEmail(e.target.value.slice(0,254))} />
              <button className="btn outline" type="button" disabled={receiptBusy || !receiptEmail.includes('@')}
                onClick={requestReadEmail}>Receber aviso por e-mail</button>
            </>
          )}
        </section>
      )}
      {!paid && !order.checkout_id && (
      <div className="payment-layout">
        <section className="form-card pix-checkout">
          <div className="pix-headline">
            <span className="eyebrow">✳ CARTINHAS · XX EJC SIMONÉSIA</span>
            <h2>Seu Pix está pronto!</h2>
            <p className="muted">
              Sua homenagem está reservada e já pode ser editada. Mesmo com o Pix exibido,
              você pode confirmar alterações abaixo. O envio ao mural exige a conferência bancária.
            </p>
          </div>

          <div className="pix-ticket">
            <div className="pix-ticket-top">
              <span>VALOR DA HOMENAGEM</span>
              <span className="pix-ticket-heart" aria-hidden="true">♡</span>
            </div>
            <strong className="pix-amount">{money(order.amount_cents)}</strong>
            <div className="pix-gift-target">
              <div className="recipient-avatar lavender">
                {recipient?.photo_url ? (
                  <img src={recipient.photo_url} alt={`Foto de ${order.recipient_name}`} loading="lazy" />
                ) : (
                  order.recipient_name.slice(0, 2).toUpperCase()
                )}
              </div>
              <span><small>Cartinha dedicada a</small><strong>{order.recipient_name}</strong></span>
            </div>
          </div>

          <div className="pix-qr-frame">
            <span className="pix-scanner-label">ESCANEIE COM SEU APP BANCÁRIO</span>
            <QrCode value={order.pix_code} size={350} variant="pix" logoUrl={config?.logo_url} />
            <p>Ou use o botão Pix Copia e Cola abaixo</p>
          </div>

          <div className="pix-details" aria-label="Detalhes do Pix">
            <div><span>Recebedor</span><strong>{order.pix_receiver || 'Titular informado no banco'}</strong></div>
            {order.pix_city && <div><span>Cidade</span><strong>{order.pix_city}</strong></div>}
            <div><span>Valor</span><strong>{money(order.amount_cents)}</strong></div>
            <div><span>Número do pedido</span><strong className="mono">{order.id}</strong></div>
            <div><span>Identificador Pix</span><strong className="mono">{order.txid}</strong></div>
          </div>

          <button className="btn wide pix-copy" onClick={() => {copy(order.pix_code);track('pix_copy');}}>
            <Copy size={18} /> Copiar Pix Copia e Cola
          </button>
          <details className="pix-raw">
            <summary>Visualizar o código Pix completo</summary>
            <code>{order.pix_code}</code>
          </details>
          <button className="btn outline wide" disabled={busy || order.status === "claimed"} onClick={claim}>
            {busy ? 'Aguarde...' : order.status === 'claimed' ? 'Pagamento informado · aguardando conferência' : 'Já paguei · solicitar conferência'}
          </button>
          <button className="btn ghost wide" onClick={reload}>
            <RefreshCw size={16} /> Atualizar situação do pagamento
          </button>
          <div className="notice warning" role="status"><Clock3 size={17} /><span><strong>Confirmação manual pelo extrato bancário.</strong> Como usamos uma conta de pessoa física, não temos integração para validar Pix automaticamente. Mesmo após “Já paguei”, a coordenação confere o crédito e o valor no extrato antes de liberar o envio. Guarde somente o código <strong>{order.id}</strong>; não é necessário enviar comprovantes.</span></div>
        </section>
        <aside className="form-card pix-access">
          <h3>Guarde o acesso à sua cartinha 🔐</h3>
          <p>Você pode voltar a qualquer momento pelo mesmo link, inclusive depois de pagar.</p>
          <button className="btn ghost wide" onClick={copyPrivateShortLink}>
            <LockKeyhole size={17} /> Copiar link secreto
          </button>
          <div className="pix-admin-identification">
            <h3>Identificação para a coordenação</h3>
            <QrCode
              value={`${location.origin}/admin/pedidos/${order.id}`}
              size={155}
              variant="standard"
              logoUrl={config?.logo_url}
            />
            <p className="micro-label mono">{order.id}</p>
          </div>
        </aside>
      </div>

            )}
        <CheckoutSupport step={paid ? 'Editor de cartinha paga' : order.status === 'claimed' ? 'Pix informado · em conferência' : 'Editor / Pix individual'} orderId={order.id} checkoutId={order.checkout_id} recipientNames={[order.recipient_name]} recipientSlugs={[order.recipient_slug]} senderName={sender || order.sender_name} senderPhone={supportPhone} orderToken={token} />
        <div className="compose-layout">
          <div className="compose-main">
            <div className="notice success">
              <CheckCircle2 size={18} />
              {paid ? 'Pix confirmado. Você pode criar e atualizar sua homenagem' :
                'Seu Pix já foi gerado. Edite, salve e confirme suas alterações agora, mesmo antes de pagar'}
              {' '}{order.resume_access
                ? 'Este link privado de recuperação permite conferir e terminar a cartinha paga.'
                : paid && !order.submitted
                  ? 'Seu rascunho pago pode ser finalizado com este link privado, mesmo após o prazo geral.'
                  : ended ? 'O prazo de edição terminou.' : `até ${btime(order.deadline)}.`}
              {!paid && <span> O envio ao mural será liberado após a conferência bancária.</span>}
            </div>
            {order.checkout_id && localStorage.getItem('ejc-checkout-' + order.checkout_id) && (
              <Link className="btn ghost" to={'/checkout/' + localStorage.getItem('ejc-checkout-' + order.checkout_id)}>
                <ArrowRight size={16} /> Voltar para o Pix deste pedido
              </Link>
            )}
            <div className="step-label">SUA CARTINHA / {order.submitted ? 'HOMENAGEM ENVIADA' : 'EDITANDO RASCUNHO'}</div>
            {localScanDone && localVersions.length > 0 && (
              <section className="form-card notice warning" role="region" aria-label="Recuperar texto da cartinha">
                <h3>💌 Encontramos texto salvo neste aparelho!</h3>
                <p>Compare as versões e escolha a correta. <strong>Não alteramos o texto do servidor automaticamente.</strong>
                  Fotos, áudios e pagamento continuam preservados.</p>
                {localVersions.slice(0, 8).map((version, index) => (
                  <div key={version.key + index} className="admin-draft-recovery-link">
                    <strong>{version.source}</strong>
                    {version.updatedAt && <small> · {new Date(version.updatedAt).toLocaleString('pt-BR')}</small>}
                    <p>{version.text.slice(0, 180)}{version.text.length > 180 ? '…' : ''}</p>
                    <button className="btn outline" type="button" disabled={busy || ended}
                      onClick={() => {
                        setHtml(version.html);
                        setRecoveryNotice('Texto restaurado no editor! Confira tudo, toque em Salvar rascunho e depois em Finalizar e enviar cartinha.');
                        track('letter_local_text_restored', { stage: 'recovery' });
                      }}>
                      Restaurar esta versão no editor
                    </button>
                  </div>
                ))}
              </section>
            )}
            {localScanDone && !localVersions.length && order.resume_access && !letterPlainText(order.rich_html) && (
              <p className="notice">Não encontramos texto neste navegador. Se você escreveu em outro celular ou navegador,
                abra este link por lá. Se não encontrar, poderá escrever o texto novamente sem pagar outro Pix.</p>
            )}
            {recoveryNotice && <div className="notice success" role="status">{recoveryNotice}</div>}
            {backupWarning && <div className="notice warning" role="alert">{backupWarning}</div>}
            <div className="send-recipient">
              {recipient?.photo_url ? <img src={recipient.photo_url} alt={'Foto de ' + order.recipient_name} /> :
                <span className="recipient-initial">{order.recipient_name?.[0]}</span>}
              <span>Para <strong>{order.recipient_name}</strong></span>
            </div>
            <h1>Uma cartinha para <em>{order.recipient_name}.</em></h1>
            {!letterPlainText(html) &&
              ((order.media || []).some(asset => asset.kind === 'image') ||
                assets.some(asset => asset.kind === 'image')) && (
                <div className="notice success" role="status">
                  <span style={{ minWidth: 0 }}>
                    <strong>📸 Suas fotos continuam aqui!</strong>
                    {' '}Elas aparecem na seção de fotos, prontas para acompanhar sua mensagem.
                    Não precisa enviá-las novamente.
                    {assets.some(asset => asset.kind === 'image') && (
                      <> Se alguma foto ainda estiver apenas neste aparelho,
                        toque em <strong>Salvar rascunho</strong> para enviá-la.</>
                    )}
                  </span>
                </div>
              )}
            <p className="muted">Escreva, decore e escolha suas fotos ou áudios, do mesmo jeitinho de quando criou a cartinha.</p>
            <LetterComposerFields
              sender={sender}
              onSenderChange={value => { setSender(value); setCompletion(null); }}
              html={html}
              onHtmlChange={value => {
                setHtml(value);
                setCompletion(null);
                if (!startedTracking.current && value?.trim()) {
                  startedTracking.current = true;
                  track('letter_first_edit', { stage: paid ? 'paid' : 'pending' });
                }
              }}
              composition={composition}
              onCompositionChange={setComposition}
              assets={assets}
              onAddAsset={add}
              onRemoveAsset={asset => discard(assets.indexOf(asset))}
              existingMedia={order.media || []}
              onRemoveExistingMedia={async asset => {
                try {
                  await api('/api/order/media/' + asset.id + '/delete', { method: 'DELETE', token });
                  setCompletion(null);
                  await reload();
                } catch (cause) {
                  setError(cause.message);
                }
              }}
              disabled={ended}
              showPrivacyNotice={false}
            />
            <div className="notice">
              <LockKeyhole size={18} />
              Sua cartinha é privada: não aparece em uma galeria pública nem passa por leitura ou escuta da coordenação.
              O painel da equipe acompanha o pagamento e a situação do envio, além do nome do remetente e dos stickers escolhidos.
            </div>
            {error && <div className="notice error" role="alert">{error}</div>}
            {progress && <div className="notice success" role="status">{progress}</div>}
            {completion && <div className="ejc-letter-completion" role="status" aria-live="polite">
              <div className="ejc-letter-completion-icon"><CheckCircle2 size={31} /></div>
              <span className="eyebrow">TUDO CERTO! 💌</span>
              <h2>{completion.type === 'submitted' ? 'Sua cartinha foi enviada com sucesso!' : 'Seu rascunho foi salvo com sucesso!'}</h2>
              <p>{completion.type === 'submitted'
                ? 'Prontinho! A cartinha de ' + order.recipient_name + ' foi recebida pelo sistema e está pronta para o mural privado.'
                : 'As alterações da cartinha para ' + order.recipient_name + ' foram registradas. Você poderá finalizar o envio quando estiver liberado.'}</p>
              <p className="ejc-letter-completion-reference">
                <strong>{order.recipient_name}</strong> · referência <code>{order.id}</code>
              </p>
              <p>Se desejar, avise a equipe do Mini Mercado pelo WhatsApp. A mensagem já traz o nome e o ID do encontrista. <strong>É opcional.</strong></p>
              <button type="button" className="btn ejc-letter-completion-whatsapp"
                onClick={()=>confirmSupport({
                  sender:completion.sender,items:completion.items,
                  submitted:completion.type==='submitted'
                })}>
                <Share2 size={18}/> Avisar a equipe pelo WhatsApp (opcional)
              </button>
            </div>}
            <div className="inline-actions spaced cart-composer-actions">
              <button className="btn ghost" type="button" onClick={() => setPreview(value => !value)}>
                {preview ? 'Ocultar prévia' : 'Ver minha cartinha'}
              </button>
              <button className="btn outline" type="button" disabled={busy || ended} onClick={() => save(false)}>
                <Save size={17} /> {busy ? 'Salvando...' : paid ? 'Salvar rascunho' : 'Confirmar alterações'}
              </button>
              {paid && <button className="btn" type="button" disabled={busy || ended} onClick={() => save(true)}>
                <Send size={17} /> {busy ? 'Enviando...' : order.submitted ? 'Atualizar envio' : 'Finalizar e enviar cartinha'}
              </button>}
            </div>
            {!completion && <div className="notice success">
              {order.submitted
                ? 'Cartinha enviada. Somente quem tiver acesso privado ao mural poderá vê-la, após a liberação.'
                : paid ? 'Sua cartinha ainda é um rascunho. Você pode revisar antes de enviar.' :
                  'As alterações salvas ficarão disponíveis para qualquer pessoa com este link privado, inclusive em outro aparelho.'}
            </div>}
            {order.submitted && !completion && <div className="notice success">
              <strong>💌 Sua cartinha já foi enviada!</strong>
              <p>Se desejar, avise a equipe usando apenas o ID e o nome do encontrista.</p>
              <button type="button" className="btn outline"
                onClick={()=>confirmSupport({sender:sender||order.sender_name,
                  items:[{id:order.id,recipient_name:order.recipient_name}],submitted:true})}>
                <Share2 size={17}/> Avisar a equipe (opcional)
              </button>
            </div>}
            {preview && <div className="preview-popup letter-reveal">
              <h2 className="spaced">Prévia da cartinha</h2>
            <LetterCard
              actions={false}
              editable={!ended}
              onCompositionChange={setComposition}
              recipient={order.recipient_name}
              letter={{
                ...order,
                sender_name: sender,
                rich_html: html,
                composition,
                media: [...(order.media || []), ...assets],
              }}
            />
            <InstagramExportPanel
              letter={{ ...order, sender_name: sender, rich_html: html, composition, media: [...(order.media || []), ...assets] }}
              recipient={order.recipient_name}
            />
            </div>}
          </div>
          <aside className="compose-side">
            <div className="form-card">
              <h3>Seu link secreto 🔐</h3>
              <button className="btn ghost wide" onClick={copyPrivateShortLink}>
                <Copy size={16} /> Copiar link
              </button>
              <p className="muted small">
                Não compartilhe este link publicamente. Qualquer pessoa com ele pode editar sua cartinha até o
                prazo.
              </p>
            </div>
          </aside>
        </div>
    </div>
  );
}
