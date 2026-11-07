import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Copy, LockKeyhole, RefreshCw, Send } from 'lucide-react';
import { api, money, track } from '../lib/api';
import { useApp } from '../main';
import QrCode from '../components/QrCode';

export default function Checkout() {
  const { token } = useParams();
  const { config } = useApp();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const data = await api('/api/checkout', { token });
      setOrder(data);
      setError('');
    } catch (cause) { setError(cause.message); }
  }, [token]);

  useEffect(() => {
    reload();
    const poll = setInterval(reload, 15000);
    return () => clearInterval(poll);
  }, [reload]);

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
        : 'Um único pagamento cobre todas as cartinhas do pedido. Depois da conferência, cada uma poderá ser enviada separadamente.'}</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice" role="status">{message}</div>}
      {!order && <button className="btn ghost" type="button" onClick={reload}>Tentar carregar <RefreshCw size={17} /></button>}
      {order && (
        <div className="checkout-columns">
          <div className="form-card checkout-summary">
            <h2>Suas {order.items.length} cartinhas</h2>
            <div className="checkout-recipients">
              {order.items.map((item, index) => (
                <div className="checkout-recipient" key={item.id}>
                  <span className="checkout-recipient-index">{index + 1}</span>
                  <strong>{item.recipient_name}</strong>
                  {paid ? <Link className="btn ghost" to={'/pedido/' + item.token}>
                    {item.status === 'paid' ? 'Escrever e enviar' : 'Abrir cartinha'} <ArrowRight size={16} />
                  </Link> : <span className="muted small">Aguardando Pix</span>}
                </div>
              ))}
            </div>
            <div className="checkout-total"><span>Total</span><strong>{money(order.amount_cents)}</strong></div>
            <p className="muted small">Identificador da compra: {order.id}</p>
            <button className="btn ghost" type="button" onClick={async()=>{
              try{
                await navigator.clipboard.writeText(window.location.href);
                setMessage('Link privado do carrinho copiado. Guarde-o para continuar depois.');
              }catch{setError('Não foi possível copiar o link. Salve esta página no navegador.');}
            }}><Copy size={16}/> Copiar link privado desta compra</button>
            <div className="notice"><LockKeyhole size={17} />
              <span>Não compartilhe esta página: ela contém o acesso às cartinhas. A coordenação não vê o conteúdo de nenhuma delas.</span>
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
