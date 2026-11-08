import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, ClipboardCheck, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { api, money } from '../lib/api';
import { prepareManualPixBatch } from '../lib/bulkPaymentApproval';

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
  const [bulkIds, setBulkIds] = useState([]);
  const [bulkReferences, setBulkReferences] = useState({});
  const [bulkBankChecked, setBulkBankChecked] = useState(false);
  const [bulkAmountChecked, setBulkAmountChecked] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const eligible = payments.filter((payment) => ['pending', 'claimed'].includes(payment.status));
  const chosen = eligible.filter((payment) => bulkIds.includes(payment.id));
  const bulkTotalCents = chosen.reduce((sum, payment) => sum + Number(payment.total_cents), 0);
  const bulkLetters = chosen.reduce((sum, payment) => sum + payment.items.length, 0);

  const search = useCallback(async (filters) => {
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/admin/payments/search', {
        method: 'POST', data: filters,
      });
      setPayments(data.payments || []);
      setBulkIds((current) => current.filter((id) => (data.payments || []).some(
        (payment) => payment.id === id && ['pending', 'claimed'].includes(payment.status))));
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

  async function confirmBulk() {
    if (busy || !bulkBankChecked || !bulkAmountChecked) return;
    setError('');
    setNotice('');
    let batch;
    try {
      batch = prepareManualPixBatch(payments, bulkIds, bulkReferences);
    } catch (cause) {
      setError(cause.message);
      return;
    }
    const accepted = window.confirm(
      'Confirmar em massa ' + batch.length + ' Pix?\n\n' +
      'Valor total: ' + money(bulkTotalCents) +
      '\nCartinhas vinculadas: ' + bulkLetters +
      '\n\nConfirme somente se conferiu cada crédito no extrato bancário e informou ' +
      'a referência individual de cada transferência. Essa ação libera as cartinhas.'
    );
    if (!accepted) return;
    setBusy(true);
    setBulkProgress({ done: 0, total: batch.length });
    const completed = [];
    const failed = [];
    try {
      for (let index = 0; index < batch.length; index++) {
        const { payment, reference } = batch[index];
        try {
          const url = payment.checkout_id
            ? '/api/admin/checkouts/' + encodeURIComponent(payment.id) + '/status'
            : '/api/admin/orders/' + encodeURIComponent(payment.id) + '/status';
          await api(url, {
            method: 'PATCH',
            data: {
              status: 'paid', bank_reference: reference,
              bank_checked: true, amount_checked: true,
            },
          });
          completed.push(payment.id);
        } catch (cause) {
          failed.push(payment.id + ': ' + (cause.message || 'Falha ao confirmar.'));
        }
        setBulkProgress({ done: index + 1, total: batch.length });
      }
      setBulkIds((current) => current.filter((id) => !completed.includes(id)));
      setBulkReferences((current) => Object.fromEntries(
        Object.entries(current).filter(([id]) => !completed.includes(id))));
      setBulkBankChecked(false);
      setBulkAmountChecked(false);
      await Promise.all([search(currentFilters()), onConfirmed?.()]);
      setNotice(completed.length + ' pagamento(s) confirmado(s) em massa. ' +
        (failed.length ? failed.length + ' requer(em) revisão.' : 'Tudo concluído!'));
      if (failed.length) setError(failed.join(' | '));
    } catch (cause) {
      setError(cause.message || 'Não foi possível concluir o lote.');
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
      <div className="admin-payment-batch">
        <div className="admin-payment-batch-heading">
          <div>
            <h3><CheckCheck size={19} /> Confirmar pagamentos em massa</h3>
            <p className="muted small">Selecione os Pix já conferidos no extrato.
              Cada transferência exige uma referência bancária diferente;
              o sistema rejeita identificadores duplicados.</p>
          </div>
          <strong>{chosen.length} Pix · {money(bulkTotalCents)} · {bulkLetters} cartinha(s)</strong>
        </div>
        <div className="admin-payment-batch-controls">
          <button type="button" className="btn ghost" disabled={busy || !eligible.length}
            onClick={() => setBulkIds(eligible.map((payment) => payment.id))}>
            Selecionar {eligible.length} pendentes desta busca
          </button>
          <button type="button" className="btn ghost" disabled={busy || !bulkIds.length}
            onClick={() => setBulkIds([])}>Limpar seleção</button>
        </div>
        {!!chosen.length && (
          <>
            <div className="admin-payment-batch-items">
              {chosen.map((payment) => (
                <label key={payment.id} className="admin-payment-batch-item">
                  <span>
                    <strong>{payment.id} · {money(payment.total_cents)}</strong>
                    <small>Referência bancária E2E/FITID deste Pix</small>
                  </span>
                  <input type="text" maxLength={128} autoComplete="off" spellCheck={false}
                    aria-label={'Referência bancária de ' + payment.id}
                    placeholder="Referência única do extrato"
                    value={bulkReferences[payment.id] || ''}
                    disabled={busy}
                    onChange={(event) => setBulkReferences((current) => ({
                      ...current, [payment.id]: event.target.value,
                    }))} />
                </label>
              ))}
            </div>
            <label className="toggle-line">
              <input type="checkbox" checked={bulkBankChecked} disabled={busy}
                onChange={(event) => setBulkBankChecked(event.target.checked)} />
              Conferi todos esses recebimentos no extrato bancário
            </label>
            <label className="toggle-line">
              <input type="checkbox" checked={bulkAmountChecked} disabled={busy}
                onChange={(event) => setBulkAmountChecked(event.target.checked)} />
              Conferi os valores individuais, totalizando {money(bulkTotalCents)}
            </label>
            <button className="btn admin-payment-batch-submit" type="button"
              disabled={busy || !bulkBankChecked || !bulkAmountChecked}
              onClick={confirmBulk}>
              <CheckCheck size={18} /> Confirmar {chosen.length} Pix de uma vez
            </button>
          </>
        )}
        {bulkProgress && <p className="muted small" role="status">
          Processados {bulkProgress.done} de {bulkProgress.total} pagamentos.
        </p>}
      </div>
      <div className="admin-payment-results">
        {payments.map((payment) => {
          const expanded = selected === payment.id;
          const paid = ['paid','preparing','delivered'].includes(payment.status);
          return (
            <article className="admin-payment-result" key={payment.id}>
              {!paid && ['pending', 'claimed'].includes(payment.status) && (
                <label className="admin-payment-select">
                  <input type="checkbox" disabled={busy}
                    checked={bulkIds.includes(payment.id)}
                    onChange={(event) => setBulkIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, payment.id])]
                        : current.filter((id) => id !== payment.id))} />
                  Selecionar para aprovação em massa
                </label>
              )}
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
                        <span>{item.submitted ? 'Cartinha enviada' : 'Ainda não enviada'}</span>
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
