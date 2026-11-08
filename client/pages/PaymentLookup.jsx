import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ClipboardCheck, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api, money } from '../lib/api';

const stateLabel = {
  pending: 'Aguardando pagamento',
  claimed: 'Conferir Pix',
  paid: 'Pix confirmado',
  preparing: 'Em preparação',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export default function PaymentLookup({ recipients, onConfirmed }) {
  const [query, setQuery] = useState('');
  const [recipient, setRecipient] = useState('');
  const [payer, setPayer] = useState('');
  const [sender, setSender] = useState('');
  const [status, setStatus] = useState('');
  const [onlySent, setOnlySent] = useState(false);
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState('');
  const [reference, setReference] = useState('');
  const [bankChecked, setBankChecked] = useState(false);
  const [amountChecked, setAmountChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const search = useCallback(async (filters) => {
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/admin/payments/search', {
        method: 'POST', data: filters,
      });
      setPayments(data.payments || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const currentFilters = () => ({ query, recipient, payer, sender, status, only_sent: onlySent });
  useEffect(() => {
    search({ query: '', recipient: '', payer: '', sender: '', status: '', only_sent: false });
  }, [search]);

  function select(payment) {
    setSelected((previous) => previous === payment.id ? '' : payment.id);
    setReference('');
    setBankChecked(false);
    setAmountChecked(false);
    setError('');
    setNotice('');
  }

  async function confirm(payment) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const url = payment.checkout_id
        ? '/api/admin/checkouts/' + encodeURIComponent(payment.id) + '/status'
        : '/api/admin/orders/' + encodeURIComponent(payment.id) + '/status';
      await api(url, {
        method: 'PATCH',
        data: {
          status: 'paid',
          bank_reference: reference.trim(),
          bank_checked: bankChecked,
          amount_checked: amountChecked,
        },
      });
      setNotice('Pix confirmado para ' + payment.items.length +
        (payment.items.length === 1 ? ' cartinha.' : ' cartinhas.'));
      setSelected('');
      setReference('');
      setBankChecked(false);
      setAmountChecked(false);
      await Promise.all([search(currentFilters()), onConfirmed?.()]);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card admin-payment-finder">
      <div className="section-head">
        <div>
          <span className="eyebrow">CONFERÊNCIA DO MINI MERCADO</span>
          <h2>Localizar um Pix e suas cartinhas</h2>
          <p>Digite o código impresso no Pix, TXID ou identificador do comprovante.
            Filtre por encontrista ou pelo nome informado para conferência.</p>
        </div>
        <button className="btn ghost" type="button" disabled={busy}
          onClick={() => search(currentFilters())}>
          <RefreshCw size={17} /> Atualizar
        </button>
      </div>
      <form className="admin-payment-filters" onSubmit={(event) => {
        event.preventDefault();
        search(currentFilters());
      }}>
        <label className="admin-payment-field admin-payment-query">
          Código do Pix ou comprovante
          <input type="search" value={query} autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="EJCB-… / TXID / referência E2E" />
        </label>
        <label className="admin-payment-field">
          Encontrista
          <select value={recipient} onChange={(event) => setRecipient(event.target.value)}>
            <option value="">Todos os encontristas</option>
            {(recipients || []).filter((person) => person.active !== 0).map((person) =>
              <option key={person.id} value={person.name}>{person.name}</option>)}
          </select>
        </label>
        <label className="admin-payment-field">
          Nome de quem enviou
          <input type="search" value={sender} autoComplete="off"
            onChange={(event) => setSender(event.target.value)} placeholder="Assinatura da cartinha" />
        </label>
        <label className="admin-payment-field">
          Nome para conferência
          <input type="search" value={payer} autoComplete="off"
            onChange={(event) => setPayer(event.target.value)} placeholder="Quem fez o pedido" />
        </label>
        <label className="admin-payment-field">
          Situação do Pix
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todas</option>
            <option value="pending">Aguardando Pix</option>
            <option value="claimed">Em conferência</option>
            <option value="paid">Confirmado</option>
          </select>
        </label>
        <label className="toggle-line admin-payment-sent">
          <input type="checkbox" checked={onlySent}
            onChange={(event) => setOnlySent(event.target.checked)} />
          Apenas cartinhas enviadas
        </label>
        <button className="btn admin-payment-search" type="submit" disabled={busy}>
          <Search size={18} /> {busy ? 'Buscando...' : 'Buscar pedidos'}
        </button>
      </form>
      <p className="muted small admin-payment-found" aria-live="polite">
        {payments.length} {payments.length === 1 ? 'Pix encontrado' : 'Pix encontrados'}.
        A consulta mostra até 100 pagamentos por vez.
      </p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}
      {!busy && payments.length === 0 && (
        <p className="notice">Nenhum Pix encontrado. Verifique o código ou tente outro nome.</p>
      )}
      <div className="admin-payment-results">
        {payments.map((payment) => {
          const expanded = selected === payment.id;
          const paid = ['paid','preparing','delivered'].includes(payment.status);
          return (
            <article className="admin-payment-result" key={payment.id}>
              <button type="button" className="admin-payment-summary"
                aria-expanded={expanded}
                onClick={() => select(payment)}>
                <span className="admin-payment-title">
                  <strong>{payment.id}</strong>
                  <small>TXID {payment.txid}</small>
                  <small>Nome para conferência: {payment.payer_name || 'Não informado'}</small>
                </span>
                <span className="admin-payment-value">
                  <strong>{money(payment.total_cents)}</strong>
                  <small>{stateLabel[payment.status] || payment.status}</small>
                  <small>{payment.items.length} cartinha(s)</small>
                </span>
              </button>
              {expanded && (
                <div className="admin-payment-expanded">
                  <h3>Cartinhas vinculadas a este Pix</h3>
                  <div className="admin-payment-letters">
                    {payment.items.map((item) => (
                      <div className="admin-payment-letter" key={item.id}>
                        <span>
                          <strong>{item.recipient_name}</strong>
                          <Link className="text-button" to={'/admin/pedidos/' + item.id}>
                            Ver registro {item.id}
                          </Link>
                        </span>
                        <span><small>De: {item.sender_name || 'Não informado'}</small>{' · '}{item.submitted ? 'Cartinha enviada' : 'Ainda não enviada'}</span>
                      </div>
                    ))}
                  </div>
                  {payment.bank_reference && (
                    <p className="muted small">Referência bancária registrada: {payment.bank_reference}</p>
                  )}
                  <div className="notice">
                    <ShieldCheck size={17} />
                    A coordenação confere somente dados de pagamento e entrega.
                    Não acessa textos, fotos, áudios ou links privados das cartas.
                  </div>
                  {!paid && ['pending','claimed'].includes(payment.status) && (
                    <div className="admin-payment-confirm">
                      <h3><ClipboardCheck size={18} /> Confirmar recebimento do Pix</h3>
                      <p className="muted small">
                        Confira a entrada real no banco e o total de {money(payment.total_cents)}.
                        Um comprovante isolado não confirma pagamento.
                      </p>
                      <label>
                        Referência bancária E2E
                        <input type="text" value={reference} autoComplete="off"
                          placeholder="Identificador completo da transação"
                          onChange={(event) => setReference(event.target.value)} />
                      </label>
                      <label className="toggle-line">
                        <input type="checkbox" checked={bankChecked}
                          onChange={(event) => setBankChecked(event.target.checked)} />
                        Conferi a entrada no extrato bancário
                      </label>
                      <label className="toggle-line">
                        <input type="checkbox" checked={amountChecked}
                          onChange={(event) => setAmountChecked(event.target.checked)} />
                        Conferi o valor total de {money(payment.total_cents)}
                      </label>
                      <button type="button" className="btn"
                        disabled={busy || !bankChecked || !amountChecked || reference.trim().length < 8}
                        onClick={() => confirm(payment)}>
                        <Check size={17} /> Confirmar Pix e liberar {payment.items.length} cartinha(s)
                      </button>
                    </div>
                  )}
                  {paid && <p className="notice success"><Check size={17} /> Pagamento confirmado.</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
