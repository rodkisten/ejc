import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Copy, LockKeyhole, Pencil, RefreshCw } from 'lucide-react';
import { api, money, track, uploadMedia } from '../lib/api';
import { draftGet } from '../lib/drafts';
import { cartDraftKey } from '../lib/cart';
import { useApp } from '../main';
import QrCode from '../components/QrCode';

export default function Checkout() {
  const { token } = useParams();
  const location = useLocation();
  const { config } = useApp();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(location.state?.notice || '');
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await api('/api/checkout', { token });
      setOrder(data);
      localStorage.setItem('ejc-checkout-' + data.id, token);
      setError('');
    } catch (cause) { setError(cause.message); }
  }, [token]);

  useEffect(() => {
    reload();
    const poll = setInterval(reload, 15000);
    return () => clearInterval(poll);
  }, [reload]);

  // Finish moving local attachments to the private server order so the checkout link
  // can be edited from another device. The texts are already saved transactionally.
  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    async function syncLocalMedia() {
      for (const item of order.items) {
        const draftId = localStorage.getItem('ejc-cart-order-' + item.token);
        const syncedKey = 'ejc-checkout-media-synced-' + item.id;
        if (!draftId || localStorage.getItem(syncedKey) === '1') continue;
        try {
          const draft = await draftGet(cartDraftKey(draftId));
          const assets = (draft?.assets || []).filter((asset) => asset.file);
          if (!assets.length) {
            localStorage.setItem(syncedKey, '1');
            continue;
          }
          if (!cancelled) setSyncMessage('Salvando fotos e áudios de ' + item.recipient_name + '...');
          const current = await api('/api/order', { token: item.token });
          const existing = [...(current.media || [])];
          for (const asset of assets) {
            const index = existing.findIndex((file) =>
              file.kind === asset.kind && file.filename === asset.file.name && file.bytes === asset.file.size);
            if (index >= 0) {
              existing.splice(index, 1);
              continue;
            }
            await uploadMedia(asset.file, asset.kind, item.token);
          }
          localStorage.setItem(syncedKey, '1');
        } catch (cause) {
          if (!cancelled) setSyncError('Alguns anexos ainda estão neste aparelho: ' + cause.message +
            '. Abra esta página novamente para tentar sincronizar.');
        }
      }
      if (!cancelled) {
        setSyncMessage('');
        await reload();
      }
    }
    syncLocalMedia();
    return () => { cancelled = true; };
  }, [order?.id, reload]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(order.pix_code);
      setMessage('Pix Copia e Cola copiado!');
      track('cart_pix_copied');
    } catch {
      setError('Não foi possível copiar. Use o código abaixo.');
    }
  }

  async function claim() {
    setBusy(true);
    setError('');
    try {
      await api('/api/checkout/claim', { method: 'POST', token, data: {} });
      await reload();
      setMessage('Pagamento informado. A coordenação vai conferir o valor total no extrato.');
      track('cart_pix_claimed');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const paid = order?.status === 'paid';
  return (
    <div className="checkout-page">
      <div className="step-label">SEU PIX / TODAS AS CARTINHAS</div>
      <h1>{paid ? 'Pagamento confirmado!' : 'Falta só um Pix.'} <em>💌</em></h1>
      <p className="muted">{paid
        ? 'Agora você pode concluir cada cartinha e enviá-la para o mural secreto do encontrista.'
        : 'Você já pode editar e confirmar cada cartinha enquanto aguarda a conferência do Pix. O envio ao mural será liberado após a aprovação.'}</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!order && <button className="btn ghost" type="button" onClick={reload}>Tentar carregar <RefreshCw size={17} /></button>}
      {order && (
        <div className="checkout-columns">
          <div className="form-card checkout-summary">
            <h2>Suas {order.items.length} cartinhas</h2>
            {!paid && <p className="notice"><Pencil size={17} />
              O Pix já está pronto, mas suas cartinhas continuam editáveis. Toque em Editar,
              faça as alterações e confirme. O código Pix e o valor permanecem iguais.
            </p>}
            {syncMessage && <p className="notice" role="status">{syncMessage} Não feche esta página até terminar.</p>}
            {syncError && <p className="notice warning" role="alert">{syncError}</p>}
            <div className="checkout-recipients">
              {order.items.map((item, index) => (
                <div className="checkout-recipient" key={item.id}>
                  <span className="checkout-recipient-index">{index + 1}</span>
                  <strong>{item.recipient_name}</strong>
                  <Link className="btn ghost" to={'/pedido/' + item.token}>
                    {paid ? 'Escrever e enviar' : 'Editar cartinha'} {paid ? <ArrowRight size={16} /> : <Pencil size={16} />}
                  </Link>
                </div>
              ))}
            </div>
            <div className="checkout-total"><span>Total</span><strong>{money(order.amount_cents)}</strong></div>
            <div className="notice checkout-code">
              <strong>Código para conferência: {order.id}</strong>
              <small>Informe este código à coordenação para localizar suas cartinhas e o valor total.</small>
              <button className="btn ghost" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(order.id); setMessage('Código para conferência copiado!'); }
                catch { setError('Não foi possível copiar o código.'); }
              }}><Copy size={16} /> Copiar código</button>
            </div>
            <p className="muted small">TXID do Pix: {order.txid}</p>
            <button className="btn ghost" type="button" onClick={async()=>{
              try{
                await navigator.clipboard.writeText(window.location.href);
                setMessage('Link privado do carrinho copiado. Guarde-o para continuar depois.');
              }catch{setError('Não foi possível copiar o link. Salve esta página no navegador.');}
            }}><Copy size={16}/> Copiar link privado desta compra</button>
            <div className="notice"><LockKeyhole size={17} />
              <span>Não compartilhe esta página: ela dá acesso às cartinhas. A coordenação vê remetente e stickers, mas não pode ler mensagens nem abrir fotos ou áudios.</span>
            </div>
            {paid && <p className="notice"><CheckCircle2 size={19} /> Pix confirmado. Você pode abrir cada cartinha acima.</p>}
          </div>

          {!paid && <section className="form-card pix-checkout checkout-pix">
            <div className="pix-headline"><h2>Escaneie e pague</h2><Clock3 size={22} /></div>
            <div className="checkout-amount">{money(order.amount_cents)}</div>
            <div className="pix-qr-frame">
              <span className="pix-scanner-label">UM PIX PARA TODAS AS CARTINHAS</span>
              <QrCode value={order.pix_code} size={320} variant="pix" logoUrl={config?.logo_url} />
            </div>
            <button className="btn wide pix-copy" type="button" onClick={copyCode}>
              <Copy size={19} /> Copiar código Pix
            </button>
            <details className="pix-raw">
              <summary>Mostrar Pix Copia e Cola</summary><code>{order.pix_code}</code>
            </details>
            <button className="btn outline wide" type="button" disabled={busy || order.status === 'claimed'} onClick={claim}>
              {order.status === 'claimed' ? 'Aguardando conferência' : busy ? 'Informando pagamento...' : 'Já paguei · avisar coordenação'}
            </button>
            <p className="muted small">O QR já contém o valor exato. O comprovante é conferido com o extrato, nunca só pelo botão.</p>
          </section>}
        </div>
      )}
    </div>
  );
}
