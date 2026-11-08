import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Heart, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useApp } from '../main';
import { useCart, cartDraftKey, localCheckouts, rememberCheckout } from '../lib/cart';
import { draftGet, draftSet } from '../lib/drafts';
import CheckoutSupport from '../components/CheckoutSupport';
import { api, money, track } from '../lib/api';

export default function Cart() {
  const { recipients, config } = useApp();
  const cart = useCart();
  const navigate = useNavigate();
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);
  const [payerName, setPayerName] = useState(() => localStorage.getItem('ejc-payer-name') || '');
  const historical = localCheckouts();
  const alreadyLinked = cart.items.some(item => historical.some(session => session.itemIds?.includes(item.id)));
  const linked = alreadyLinked
    ? historical.find(session => cart.items.some(item => session.itemIds?.includes(item.id)))
    : null;
  const checkoutLock = useRef(false);
  const [error, setError] = useState('');
  const getPerson = (slug) => recipients.find((person) => person.slug === slug);
  const total = cart.items.length * Number(config?.amount_cents || 0);

  async function duplicate(item) {
    setError('');
    const target = targets[item.id] || item.recipient_slug;
    try {
      const id = await cart.duplicate(item.id, target);
      track('letter_duplicated');
      navigate('/enviar/' + encodeURIComponent(target) + '?edit=' + encodeURIComponent(id));
    } catch (cause) { setError(cause.message); }
  }

  async function checkout() {
    if(checkoutLock.current) return;
    checkoutLock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!cart.items.length) throw new Error('Seu carrinho está vazio.');
      if (alreadyLinked) throw new Error('Uma cartinha deste carrinho já tem Pix. Abra o pagamento existente para editar.');
      if (payerName.trim().length < 2) throw new Error('Informe seu nome para conferência do Pix.');
      const drafts = await Promise.all(cart.items.map((item) => draftGet(cartDraftKey(item.id))));
      if (drafts.some((draft) => !draft)) throw new Error('Uma cartinha perdeu seu rascunho local. Edite-a antes de pagar.');
      const checkout = await api('/api/checkouts', {
        method: 'POST',
        data: { payer_name: payerName.trim(), items: cart.items.map((item, index) => ({
          recipient_slug: item.recipient_slug,
          sender_name: item.sender_name,
          rich_html: drafts[index].html || '',
          composition: drafts[index].composition || {},
          notify_on_read: !!drafts[index].notifyOnRead,
          read_receipt_email: drafts[index].notifyOnRead ? drafts[index].receiptEmail : '',
        })) },
      });
      checkout.items.forEach((order, index) => {
        localStorage.setItem('ejc-cart-order-' + order.token, cart.items[index].id);
        localStorage.setItem('ejc-order-slug-' + order.token, cart.items[index].recipient_slug);
      });
      localStorage.setItem('ejc-last-checkout', checkout.token);
      localStorage.setItem('ejc-checkout-' + checkout.id, checkout.token);
      localStorage.setItem('ejc-payer-name', payerName.trim());
      rememberCheckout({
        id: checkout.id, token: checkout.token, payerName: payerName.trim(),
        itemIds: cart.items.map(item => item.id), created_at: new Date().toISOString(),
      });
      // Preserve the full checkout snapshot and every IndexedDB letter/attachment.
      await draftSet('ejc-checkout-cart-' + checkout.id, cart.items);
      // Only the active shopping index is reset, so new purchases remain possible.
      await cart.clear();
      track('checkout_created', { letters: checkout.items.length });
      navigate('/checkout/' + checkout.token);
    } catch (cause) {
      setError(cause.message || 'Não foi possível gerar o Pix.');
    } finally { checkoutLock.current = false; setBusy(false); }
  }

  return (
    <div className="cart-page">
      <div className="step-label">SEU CARRINHO / XX EJC SIMONÉSIA</div>
      <h1>Todo carinho <em>num só lugar.</em></h1>
      <p className="muted">Uma carta para cada encontrista, com remetente e decoração independentes. Duplique uma para presentear outras pessoas.</p>
      <CheckoutSupport step="Carrinho · antes do Pix" recipientNames={cart.items.map(item => getPerson(item.recipient_slug)?.name || item.recipient_slug)} checkoutId={linked?.id} />
      {!cart.ready ? <p className="notice">Carregando suas cartinhas...</p> :
        cart.items.length === 0 ? (
          <section className="cart-empty">
            <ShoppingBag size={40} /><h2>Seu carrinho está esperando carinho 💌</h2>
            <p>Escolha um encontrista e comece a primeira cartinha.</p>
            <Link className="btn" to="/#encontristas">Escolher encontrista <ArrowRight size={17} /></Link>
            {localStorage.getItem('ejc-last-checkout') && <Link className="btn ghost" to={'/checkout/' + localStorage.getItem('ejc-last-checkout')}>Ver meu último Pix</Link>}
          </section>
        ) : (
          <>
            <div className="cart-items">
              {cart.items.map((item, index) => {
                const person = getPerson(item.recipient_slug);
                return (
                  <section className="cart-item" key={item.id}>
                    <span className="cart-item-number">{String(index + 1).padStart(2, '0')}</span>
                    <div className="cart-item-avatar">
                      {person?.photo_url ? <img src={person.photo_url} alt="" /> :
                        <span>{person?.name?.[0] || '?'}</span>}
                    </div>
                    <div className="cart-item-info">
                      <strong>{person?.name || 'Encontrista'}</strong>
                      <span>De: {item.sender_name || 'Uma pessoa especial'}</span>
                      <div className="cart-item-actions">
                        <Link to={'/enviar/' + item.recipient_slug + '?edit=' + encodeURIComponent(item.id)} className="text-button">Editar cartinha</Link>
                        <button className="text-button" type="button" onClick={() => cart.remove(item.id).catch((cause) => setError(cause.message))}>
                          <Trash2 size={15} /> Remover
                        </button>
                      </div>
                      <div className="cart-duplicate">
                        <label htmlFor={'duplicate-' + item.id}>Usar esta mesma cartinha para:</label>
                        <select id={'duplicate-' + item.id} value={targets[item.id] || item.recipient_slug}
                          onChange={(event) => setTargets((old) => ({ ...old, [item.id]: event.target.value }))}>
                          {recipients.map((recipient) => <option key={recipient.id} value={recipient.slug}>{recipient.name}</option>)}
                        </select>
                        <button className="btn ghost" type="button" onClick={() => duplicate(item)}>
                          <Copy size={16} /> Duplicar
                        </button>
                      </div>
                    </div>
                    <strong className="cart-item-price">{money(config?.amount_cents)}</strong>
                  </section>
                );
              })}
            </div>
            <div className="cart-bottom">
              <Link className="btn outline" to="/#encontristas"><Plus size={17} /> Nova cartinha</Link>
              <div className="cart-receipt">
                <div className="row between"><span>{cart.items.length} cartinha(s)</span><strong>{money(total)}</strong></div>
                <p>Um único Pix para todas. Cada encontrista recebe apenas sua própria homenagem.</p>
                <label className="cart-payer-label" htmlFor="payer-name">
                  Nome para conferência do Pix
                  <input id="payer-name" type="text" autoComplete="name" maxLength={100}
                    value={payerName} placeholder="Seu nome completo"
                    onChange={(event) => setPayerName(event.target.value)} />
                  <small>Usado somente para localizar seu pagamento. Não aparece na cartinha nem no mural.</small>
                </label>
                {alreadyLinked && linked && <div className="notice">
                  Esta cartinha já possui Pix gerado.
                  <Link className="btn ghost" to={'/checkout/' + linked.token}>Ver Pix {linked.id}</Link>
                </div>}
                {error && <div className="notice error" role="alert">{error}</div>}
                <button className="btn wide" type="button"
                  disabled={busy || alreadyLinked || payerName.trim().length < 2 || !config?.payments_ready || !config?.open} onClick={checkout}>
                  <ShoppingBag size={18} /> {busy ? 'Criando seu Pix...' : alreadyLinked ? 'Pix já gerado' : 'Gerar Pix de ' + money(total)}
                  <ArrowRight size={18} />
                </button>
                <p className="muted small">O pagamento será confirmado manualmente pela coordenação no extrato. Guarde o código da compra para facilitar a conferência; não solicitamos comprovantes bancários pelo site.</p>
                {!config?.payments_ready && <p className="notice warning">A coordenação ainda precisa configurar a chave Pix.</p>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
