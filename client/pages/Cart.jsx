import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Heart, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useApp } from '../main';
import { useCart, cartDraftKey } from '../lib/cart';
import { draftGet } from '../lib/drafts';
import { api, money, track } from '../lib/api';

export default function Cart() {
  const { recipients, config } = useApp();
  const cart = useCart();
  const navigate = useNavigate();
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);
  const checkoutLock = useRef(false);
  const [error, setError] = useState('');
  const [payerName, setPayerName] = useState(() => localStorage.getItem('ejc-payer-name') || '');
  const [activeCheckout, setActiveCheckout] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ejc-cart-active-checkout') || 'null'); }
    catch { return null; }
  });
  const boundIds = new Set(activeCheckout?.itemIds || []);
  const alreadyLinked = cart.items.some(item => boundIds.has(item.id));
  const sameCheckout = alreadyLinked &&
    cart.items.length === boundIds.size &&
    cart.items.every(item => boundIds.has(item.id));
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
      if (alreadyLinked) throw new Error('Essas cartinhas já possuem Pix gerado. Abra o Pix existente para continuar.');
      const nameForCheckout=payerName.trim();
      if (nameForCheckout.length < 2) throw new Error('Informe o nome para conferência do Pix. Ele não aparecerá na carta.');
      const drafts = await Promise.all(cart.items.map((item) => draftGet(cartDraftKey(item.id))));
      if (drafts.some((draft) => !draft)) throw new Error('Uma cartinha perdeu seu rascunho local. Edite-a antes de pagar.');
      const checkout = await api('/api/checkouts', {
        method: 'POST',
        data: { payer_name: nameForCheckout, items: cart.items.map((item, index) => ({
          recipient_slug: item.recipient_slug,
          sender_name: item.sender_name,
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
      localStorage.setItem('ejc-payer-name', nameForCheckout);
      // DO NOT clear the IndexedDB index or drafts: the sender can edit every
      // letter, photo, audio and sticker before and after generating the Pix.
      const session = {
        id: checkout.id, token: checkout.token, itemIds: cart.items.map(item => item.id),
      };
      localStorage.setItem('ejc-cart-active-checkout', JSON.stringify(session));
      setActiveCheckout(session);
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
                        <button className="text-button" type="button"
                          disabled={boundIds.has(item.id)}
                          title={boundIds.has(item.id) ? 'Esta cartinha já faz parte de um Pix e continua salva para edição.' : 'Remover do carrinho'}
                          onClick={() => cart.remove(item.id).catch((cause) => setError(cause.message))}>
                          <Trash2 size={15} /> Remover
                        </button>
                      </div>
                      <div className="cart-duplicate">
                        <label htmlFor={'duplicate-' + item.id}>Usar esta mesma cartinha para:</label>
                        <select id={'duplicate-' + item.id} value={targets[item.id] || item.recipient_slug}
                          onChange={(event) => setTargets((old) => ({ ...old, [item.id]: event.target.value }))}>
                          {recipients.map((recipient) => <option key={recipient.id} value={recipient.slug}>{recipient.name}</option>)}
                        </select>
                        <button className="btn ghost" type="button" disabled={alreadyLinked}
                          title={alreadyLinked ? 'Conclua o Pix atual antes de criar outra compra.' : 'Duplicar cartinha'}
                          onClick={() => duplicate(item)}>
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
                  <input id="payer-name" type="text" autoComplete="name"
                    maxLength={100} value={payerName} placeholder="Seu nome completo"
                    onChange={(event) => {
                      setPayerName(event.target.value);
                      localStorage.setItem('ejc-payer-name', event.target.value);
                    }} />
                  <small>Usado somente pela coordenação para localizar o pagamento.
                    Não aparece na cartinha, na assinatura nem no mural.</small>
                </label>
                {alreadyLinked && (
                  <div className="notice">
                    <strong>Seu Pix já está gerado.</strong>
                    {sameCheckout
                      ? ' Você ainda pode editar todas as cartinhas acima. Nada foi apagado do armazenamento deste aparelho.'
                      : ' Algumas cartinhas já pertencem a um Pix anterior. Não gere outro Pix para elas.'}
                    <Link className="btn ghost" to={'/checkout/' + activeCheckout.token}>
                      Voltar ao Pix de {activeCheckout.id}
                    </Link>
                  </div>
                )}
                {error && <div className="notice error" role="alert">{error}</div>}
                <button className="btn wide" type="button"
                  disabled={busy || alreadyLinked || !payerName.trim() || !config?.payments_ready || !config?.open} onClick={checkout}>
                  <ShoppingBag size={18} /> {busy ? 'Criando seu Pix...' : alreadyLinked ? 'Pix já gerado' : 'Gerar Pix de ' + money(total)}
                  <ArrowRight size={18} />
                </button>
                {!config?.payments_ready && <p className="notice warning">A coordenação ainda precisa configurar a chave Pix.</p>}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
