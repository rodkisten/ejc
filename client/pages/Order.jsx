import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import { cartDraftKey } from '../lib/cart';
import RichEditor from '../components/RichEditor';
import Recorder from '../components/Recorder';
import VoicePlayer from '../components/VoicePlayer';
import QrCode from '../components/QrCode';
import { useApp } from '../main';
import { LetterCard } from '../components/LetterCard';
import LetterControls from '../components/letter/LetterControls';
import InstagramExportPanel from '../components/social/InstagramExportPanel';
import { useLetterComposer } from '../hooks/useLetterComposer';
function sameDraft(a, b) {
  return a === b;
}
const assetIdentity = (asset) => [asset.kind,asset.file?.name,asset.file?.size,
  asset.file?.lastModified,asset.file?.type].join(':');
const uploadedKey = (orderToken) => 'ejc-uploaded-assets-' + orderToken;
function uploadedAssets(orderToken) {
  try { return new Set(JSON.parse(localStorage.getItem(uploadedKey(orderToken)) || '[]')); }
  catch { return new Set(); }
}
export default function Order() {
  const { recipients, config } = useApp();
  const { composition, setComposition } = useLetterComposer();
  const { token } = useParams(),
    [order, setOrder] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [html, setHtml] = useState(''),
    [assets, setAssets] = useState([]),
    [progress, setProgress] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [receiptBusy,setReceiptBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const o = await api('/api/order', { token });
      setOrder(o);
      setError('');
      return o;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [token]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 15_000);
    return () => clearInterval(t);
  }, [reload]);
  useEffect(() => {
    if (!order || saved) return;
    setHtml(order.rich_html || '');
    setSenderName(order.sender_name || '');
    setComposition(order.composition);
    setSaved(true);
  }, [order, saved]);
  useEffect(() => {
    if (!order || !['paid', 'preparing', 'delivered'].includes(order.status)) return;
    const slug = localStorage.getItem(`ejc-order-slug-${token}`);
    const cartId = localStorage.getItem('ejc-cart-order-' + token);
    if (!slug && !cartId) { setDraftHydrated(true); return; }
    let active = true;
    draftGet(cartId ? cartDraftKey(cartId) : draftKey(slug))
      .then((d) => {
        if (!d || !active) return;
        // A draft edited after Pix creation takes precedence over the old server copy.
        if ('html' in d) setHtml(d.html);
        if ('sender' in d) setSenderName(d.sender);
        if (d.composition) setComposition(d.composition);
        const uploaded = uploadedAssets(token);
        setAssets((current) =>
          current.length
            ? current
            : (d.assets || []).filter((a) => !uploaded.has(assetIdentity(a)))
              .map((a) => ({ ...a, url: URL.createObjectURL(a.file) })),
        );
      })
      .catch(() => {})
      .finally(() => { if (active) setDraftHydrated(true); });
    return () => { active = false; };
  }, [order?.status, token]);

  useEffect(() => {
    if (!draftHydrated || !order || !['paid','preparing','delivered'].includes(order.status)) return;
    const slug = localStorage.getItem(`ejc-order-slug-${token}`);
    const cartId = localStorage.getItem('ejc-cart-order-' + token);
    if (!cartId && !slug) return;
    const key = cartId ? cartDraftKey(cartId) : draftKey(slug);
    const timeout = setTimeout(async () => {
      try {
        const previous = await draftGet(key) || {};
        // Keep the original assets even after upload. Track uploaded assets
        // separately so reopening the draft never uploads them twice.
        const originals = previous.assets || [];
        const ids = new Set(originals.map(assetIdentity));
        const additions = assets.filter((asset) => !ids.has(assetIdentity(asset)))
          .map(({ file, kind }) => ({ file, kind }));
        await draftSet(key, {
          ...previous, sender: senderName, html, composition,
          assets: originals.concat(additions),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // IndexedDB can be unavailable in private browsing; the server save
        // remains available after payment.
      }
    }, 700);
    return () => clearTimeout(timeout);
  }, [draftHydrated, order?.status, token, html, composition, senderName, assets]);
  const paid = order && ['paid', 'preparing', 'delivered'].includes(order.status),
    ended = order?.deadline && Date.now() >= new Date(`${order.deadline}:00-03:00`).getTime();
  const add = (file, kind) => setAssets((a) => [...a, { file, kind, url: URL.createObjectURL(file) }]);
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
    setBusy(true);
    setError('');
    try {
      await api('/api/order/message', {
        method: 'PUT',
        token,
        data: { rich_html: html, composition, sender_name: senderName.trim() },
      });
      const uploaded=uploadedAssets(token);
      for (const a of assets) {
        const key=assetIdentity(a);
        if(uploaded.has(key)) continue;
        setProgress(`Enviando ${a.file.name}...`);
        await uploadMedia(a.file, a.kind, token, (p) => setProgress(`${a.file.name} · ${p}%`));
        uploaded.add(key);
        localStorage.setItem(uploadedKey(token), JSON.stringify([...uploaded]));
      }
      assets.forEach((a) => URL.revokeObjectURL(a.url));
      setAssets([]);
      setProgress('Arquivos salvos!');
      // Do not delete any draft or attached file from browser storage after Pix.
      if (withSubmit) {
        await api('/api/order/submit', { method: 'POST', token, data: {} });
        track('letter_submitted');
      }
      await reload();
      setProgress(withSubmit ? 'Cartinha enviada! Ela ficará no mural privado após o horário de liberação.' : 'Rascunho salvo com sucesso!');
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
      {!paid && order.checkout_id ? (
        <section className="form-card">
          <h2>Esta cartinha faz parte de um Pix com várias homenagens.</h2>
          <p>O QR Code correto contém a soma de todas as cartinhas do carrinho. Por segurança, o pagamento não é gerado individualmente nesta página.</p>
          {localStorage.getItem('ejc-checkout-' + order.checkout_id) &&
            <Link className="btn" to={'/checkout/' + localStorage.getItem('ejc-checkout-' + order.checkout_id)}>Ver o Pix deste carrinho</Link>}
          <button className="btn ghost" type="button" onClick={reload}>Atualizar pagamento</button>
        </section>
      ) : !paid ? (
      <div className="payment-layout">
        <section className="form-card pix-checkout">
          <div className="pix-headline">
            <span className="eyebrow">✳ CARTINHAS · XX EJC SIMONÉSIA</span>
            <h2>Seu Pix está pronto!</h2>
            <p className="muted">
              Sua homenagem está reservada. Assim que o pagamento for confirmado pela
              coordenação, você poderá enviar texto, fotos e áudios.
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
          <div className="notice warning">
            <Clock3 size={17} />
            <span>O botão “Já paguei” não libera o envio automaticamente.
              A equipe precisa conferir a entrada do dinheiro no banco.</span>
          </div>
        </section>
        <aside className="form-card pix-access">
          <h3>Guarde o acesso à sua cartinha 🔐</h3>
          <p>Você pode voltar a qualquer momento pelo mesmo link, inclusive depois de pagar.</p>
          <button className="btn ghost wide" onClick={() => copy(privateOrder(token))}>
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

            ) : (
        <div className="compose-layout">
          <div className="compose-main">
            <div className="notice success">
              <CheckCircle2 size={18} /> Pix confirmado. Você pode criar e atualizar sua homenagem{' '}
              {ended ? 'até o horário de encerramento, que já passou.' : `até ${btime(order.deadline)}.`}
            </div>
            <div className="form-card">
              <label className="letter-signature-field">
                Assinatura que aparece na cartinha (opcional)
                <input type="text" maxLength={100} autoComplete="off"
                  value={senderName} disabled={ended}
                  placeholder="De alguém especial"
                  onChange={(event) => setSenderName(event.target.value)} />
              </label>
              <div className="row between">
                <h2>Escreva sua cartinha</h2>
                <span className="micro-label">formatação livre</span>
              </div>
              <RichEditor
                key={saved ? 'loaded' : 'initial'}
                value={html}
                onChange={setHtml}
                disabled={ended}
              />
            </div>
            <div className="form-card">
              <h2>Áudios</h2>
              {!ended && <Recorder onAdd={(f) => add(f, 'audio')} />}
              <div className="asset-list">
                {(order.media || [])
                  .filter((m) => m.kind === 'audio')
                  .map((m) => (
                    <div className="asset-row" key={m.id}>
                      <VoicePlayer src={m.url} title={m.filename} compact />
                      <button
                        className="icon-button danger"
                        type="button"
                        title="Excluir áudio"
                        disabled={ended}
                        onClick={async () => {
                          try {
                            await api(`/api/order/media/${m.id}/delete`, { method: 'DELETE', token });
                            await reload();
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                {assets
                  .filter((a) => a.kind === 'audio')
                  .map((a) => (
                    <div className="asset-row" key={a.url}>
                      <VoicePlayer src={a.url} title="Novo áudio" />
                      <button className="icon-button danger" onClick={() => discard(assets.indexOf(a))}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
            <div className="form-card">
              <h2>Fotos</h2>
              {!ended && (
                <label className="upload-label">
                  <ImagePlus size={20} /> Adicionar fotos
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    onChange={(e) => {
                      [...e.target.files].forEach((f) => add(f, 'image'));
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <div className="photos-grid">
                {(order.media || [])
                  .filter((m) => m.kind === 'image')
                  .map((m) => (
                    <div className="photo-item" key={m.id}>
                      <img src={m.url} alt="Foto enviada" />
                      {!ended && (
                        <button
                          onClick={async () => {
                            try {
                              await api(`/api/order/media/${m.id}/delete`, { method: 'DELETE', token });
                              await reload();
                            } catch (e) {
                              setError(e.message);
                            }
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  ))}
                {assets
                  .filter((a) => a.kind === 'image')
                  .map((a) => (
                    <div className="photo-item" key={a.url}>
                      <img src={a.url} alt="Foto selecionada" />
                      <button onClick={() => discard(assets.indexOf(a))}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
            {!ended && <LetterControls composition={composition} onChange={setComposition} senderName={senderName} />}
            <div className="notice">
              <LockKeyhole size={18} />
              Sua cartinha é privada: não aparece em uma galeria pública nem passa por leitura ou escuta da coordenação.
              O painel da equipe acompanha somente o pagamento e a situação do envio.
            </div>
            {error && <div className="notice error">{error}</div>}
            {progress && <div className="notice success">{progress}</div>}
            <div className="inline-actions spaced">
              <button className="btn outline" disabled={busy || ended} onClick={() => save(false)}>
                <Save size={17} /> Salvar rascunho
              </button>
              <button className="btn" disabled={busy || ended} onClick={() => save(true)}>
                <Send size={17} /> {busy ? 'Enviando...' : 'Enviar ao mural privado'}
              </button>
            </div>
            <div className="notice success">
              {order.submitted
                ? 'Cartinha enviada. Somente quem tiver acesso privado ao mural poderá vê-la, após a liberação.'
                : 'Sua cartinha ainda é um rascunho. Você pode revisar antes de enviar.'}
            </div>
            <h2 className="spaced">Prévia da cartinha</h2>
            <LetterCard
              actions={false}
              editable={!ended}
              onCompositionChange={setComposition}
              recipient={order.recipient_name}
              letter={{
                ...order,
                rich_html: html,
                composition,
                media: [...(order.media || []), ...assets],
              }}
            />
            <InstagramExportPanel
              letter={{ ...order, rich_html: html, composition, media: [...(order.media || []), ...assets] }}
              recipient={order.recipient_name}
            />
          </div>
          <aside className="compose-side">
            <div className="form-card">
              <h3>Seu link secreto 🔐</h3>
              <button className="btn ghost wide" onClick={() => copy(privateOrder(token))}>
                <Copy size={16} /> Copiar link
              </button>
              <p className="muted small">
                Não compartilhe este link publicamente. Qualquer pessoa com ele pode editar sua cartinha até o
                prazo.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
