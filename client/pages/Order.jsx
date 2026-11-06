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
import { draftGet, draftRemove, draftKey } from '../lib/drafts';
import RichEditor from '../components/RichEditor';
import Recorder from '../components/Recorder';
import VoicePlayer from '../components/VoicePlayer';
import QrCode from '../components/QrCode';
import { useApp } from '../main';
import { LetterCard } from '../components/LetterCard';
function sameDraft(a, b) {
  return a === b;
}
export default function Order() {
  const { recipients, config } = useApp();
  const { token } = useParams(),
    [order, setOrder] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [html, setHtml] = useState(''),
    [publicMessage, setPublicMessage] = useState(false),
    [assets, setAssets] = useState([]),
    [progress, setProgress] = useState('');
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
    setPublicMessage(!!order.public_message);
    setSaved(true);
  }, [order, saved]);
  useEffect(() => {
    if (!order || !['paid', 'preparing', 'delivered'].includes(order.status)) return;
    const slug = localStorage.getItem(`ejc-order-slug-${token}`);
    if (!slug) return;
    draftGet(draftKey(slug))
      .then((d) => {
        if (!d) return;
        setHtml((h) => h || d.html || '');
        setPublicMessage((v) => v || !!d.publicMessage);
        setAssets((current) =>
          current.length
            ? current
            : (d.assets || []).map((a) => ({ ...a, url: URL.createObjectURL(a.file) })),
        );
      })
      .catch(() => {});
  }, [order?.status, token]);
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
        data: { rich_html: html, public_message: publicMessage },
      });
      for (const a of assets) {
        setProgress(`Enviando ${a.file.name}...`);
        await uploadMedia(a.file, a.kind, token, (p) => setProgress(`${a.file.name} · ${p}%`));
      }
      assets.forEach((a) => URL.revokeObjectURL(a.url));
      setAssets([]);
      setProgress('Arquivos salvos!');
      const slug = localStorage.getItem(`ejc-order-slug-${token}`);
      if (slug) await draftRemove(draftKey(slug));
      if (withSubmit) {
        await api('/api/order/submit', { method: 'POST', token, data: {} });
        track('letter_submitted');
      }
      await reload();
      setProgress(withSubmit ? 'Enviada para moderação!' : 'Rascunho salvo com sucesso!');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
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
          {paid ? 'Pix confirmado' : 'Aguardando Pix'}
        </span>
      </div>
      {!paid ? (
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
              <span>CONTRIBUIÇÃO PARA UMA CARTINHA</span>
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
            <QrCode value={order.pix_code} size={248} variant="pix" logoUrl={config?.logo_url} />
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
          <button className="btn outline wide" disabled={busy} onClick={claim}>
            {busy ? 'Aguarde...' : 'Já paguei · solicitar conferência'}
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
            <div className="form-card">
              <label className="toggle-line">
                <input
                  type="checkbox"
                  disabled={ended}
                  checked={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.checked)}
                />
                <span>
                  Permitir que minha cartinha também seja pública após a aprovação{' '}
                  <strong>(desativado por padrão)</strong>
                </span>
              </label>
            </div>
            {error && <div className="notice error">{error}</div>}
            {progress && <div className="notice success">{progress}</div>}
            <div className="inline-actions spaced">
              <button className="btn outline" disabled={busy || ended} onClick={() => save(false)}>
                <Save size={17} /> Salvar rascunho
              </button>
              <button className="btn" disabled={busy || ended} onClick={() => save(true)}>
                <Send size={17} /> {busy ? 'Enviando...' : 'Enviar para moderação'}
              </button>
            </div>
            <div className="notice">
              Estado da moderação:{' '}
              <strong>
                {{
                  draft: 'Rascunho',
                  pending: 'Aguardando análise',
                  approved: 'Aprovada',
                  rejected: 'Revisão solicitada',
                }[order.moderation] || order.moderation}
              </strong>
              . Se editar após uma aprovação, a cartinha precisará de nova revisão.
            </div>
            <h2 className="spaced">Prévia da cartinha</h2>
            <LetterCard
              actions={false}
              recipient={order.recipient_name}
              letter={{
                ...order,
                rich_html: html,
                public_message: publicMessage,
                media: [...(order.media || []), ...assets],
              }}
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
