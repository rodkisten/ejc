import React, { useCallback, useState } from 'react';
import { CheckCircle2, FileUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, money } from '../lib/api';
import { candidatesForCredit, ofxBankReference, parseSicoobOfx } from '../lib/sicoobOfx';

const isWaiting = (status) => ['pending', 'claimed'].includes(status);
const displayStatus = {
  txid: 'Identificador da cartinha encontrado',
  amount: 'Somente valor correspondente: escolha manualmente',
  'unknown-txid': 'Código no extrato não localizado: conferir',
  divergent: 'Código encontrado, mas valor divergente',
  confirmed: 'Pagamento já confirmado no sistema',
};

export default function SicoobReconciliation({ onConfirmed }) {
  const [statement, setStatement] = useState(null);
  const [payments, setPayments] = useState([]);
  const [choice, setChoice] = useState({});
  const [referenceOverride, setReferenceOverride] = useState({});
  const [checkedBank, setCheckedBank] = useState(false);
  const [checkedValue, setCheckedValue] = useState(false);
  const [working, setWorking] = useState('');
  const [completed, setCompleted] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const data = await api('/api/admin/reconciliation/payments');
    setPayments(data.payments || []);
  }, []);

  async function load(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setStatement(null);
    setChoice({});
    setCompleted({});
    setReferenceOverride({});
    setCheckedBank(false);
    setCheckedValue(false);
    setError('');
    setMessage('');
    if (file.size > 3 * 1024 * 1024) {
      setError('O arquivo excede 3 MB. Exporte um período menor.');
      return;
    }
    setWorking('file');
    try {
      const parsed = parseSicoobOfx(await file.text());
      const ledger = await api('/api/admin/reconciliation/payments');
      setPayments(ledger.payments || []);
      setStatement({ ...parsed, filename: file.name });
      setMessage('Extrato carregado apenas neste navegador. Nenhum dado bancário foi enviado ao servidor.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setWorking('');
    }
  }

  async function approve(credit, payment) {
    const chosen = payment || {};
    if (!chosen.id || !isWaiting(chosen.status) || !checkedBank || !checkedValue) return;
    const bankRefInput = String(referenceOverride[credit.id] || '').trim().toUpperCase();
    if (bankRefInput && !/^E\d{8}[A-Z0-9]{23}$/.test(bankRefInput)) {
      setError('O E2E informado deve conter 32 caracteres, iniciando por E e oito dígitos.');
      return;
    }
    if (!credit.isPix) {
      setError('A movimentação não foi identificada como Pix. Consulte o comprovante antes de confirmar.');
      return;
    }
    const exact = candidatesForCredit(credit, payments).reason === 'txid';
    const accepted = window.confirm(
      'Você conferiu no Sicoob um Pix realmente RECEBIDO de ' + money(credit.amountCents) +
      ' e quer vinculá-lo ao pagamento ' + chosen.id + '?\n\n' +
      (exact ? 'TXID e valor coincidem.' : 'ATENÇÃO: o vínculo foi escolhido manualmente; o valor isolado não comprova o pagamento.') +
      '\n\nEssa confirmação libera a(s) cartinha(s).'
    );
    if (!accepted) return;

    setWorking(credit.id);
    setError('');
    try {
      const reference = bankRefInput || await ofxBankReference(credit, statement.accountId);
      if (!reference) throw new Error('Este lançamento não tem identificador bancário. Informe o E2E do comprovante.');
      await api(
        chosen.type === 'checkout'
          ? '/api/admin/checkouts/' + encodeURIComponent(chosen.id) + '/status'
          : '/api/admin/orders/' + encodeURIComponent(chosen.id) + '/status',
        { method: 'PATCH', data: { status: 'paid', bank_reference: reference,
          bank_checked: true, amount_checked: true } }
      );
      setCompleted((current) => ({ ...current, [credit.id]: chosen.id }));
      await refresh();
      await onConfirmed?.();
      setMessage('Pagamento ' + chosen.id + ' confirmado. O mesmo lançamento não pode ser confirmado novamente.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setWorking('');
    }
  }

  return (
    <section className="form-card sicoob-reconciliation">
      <div className="row between">
        <div>
          <span className="eyebrow">BANCO SICOOB</span>
          <h2>Conciliar extrato Pix</h2>
          <p className="muted small">
            Importe o extrato OFX para localizar pagamentos e liberar cartinhas sem copiar transações uma a uma.
          </p>
        </div>
        {statement && (
          <button type="button" className="btn ghost" onClick={async () => {
            try { await refresh(); setMessage('Pagamentos atualizados.'); }
            catch (cause) { setError(cause.message); }
          }}><RefreshCw size={16} /> Atualizar</button>
        )}
      </div>

      <label className="sicoob-upload">
        <FileUp size={22} />
        <span><strong>{working === 'file' ? 'Lendo extrato…' : 'Selecionar extrato OFX do Sicoob'}</strong>
          <small>Escolha o arquivo .ofx exportado pelo Internet Banking · até 3 MB</small></span>
        <input aria-label="Selecionar extrato bancário OFX" type="file"
          accept=".ofx,application/x-ofx,text/plain" onChange={load} disabled={Boolean(working)} />
      </label>

      <p className="muted small">
        No Sicoob Internet Banking: Conta → Consultas → Conta Corrente → Consultar → Salvar → OFX.
        A opção pode variar conforme a cooperativa. O arquivo permanece no aparelho.
      </p>
      {error && <p role="alert" className="notice error">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}
      {statement && (
        <>
          <div className="sicoob-summary">
            <span><strong>{statement.transactions.length}</strong> créditos no extrato</span>
            <span><strong>{payments.filter((p) => isWaiting(p.status)).length}</strong> pagamentos pendentes</span>
            <span><strong>{Object.keys(completed).length}</strong> confirmados nesta importação</span>
          </div>
          <p className="muted small">
            Arquivo: {statement.filename}. Um TXID com valor exato sugere correspondência.
            Sem TXID, selecione o pedido manualmente. O arquivo OFX não é comprovante de vínculo
            com uma cartinha por si só.
          </p>
          <label className="toggle-line">
            <input type="checkbox" checked={checkedBank}
              onChange={(event) => setCheckedBank(event.target.checked)} />
            Conferi que o arquivo corresponde ao extrato real da conta Sicoob recebedora.
          </label>
          <label className="toggle-line">
            <input type="checkbox" checked={checkedValue}
              onChange={(event) => setCheckedValue(event.target.checked)} />
            Vou confirmar somente os créditos recebidos e os valores correspondentes.
          </label>
          <div className="sicoob-transactions">
            {statement.transactions.map((credit) => {
              const matched = candidatesForCredit(credit, payments);
              const targetId = choice[credit.id] ?? matched.suggestedId;
              const target = payments.find((p) => p.id === targetId);
              const complete = completed[credit.id];
              const displayOptions = matched.reason === 'txid'
                ? matched.matches
                : payments.filter((p) => isWaiting(p.status)
                  && Number(p.total_cents) === credit.amountCents);
              return (
                <article className="sicoob-transaction" key={credit.id}>
                  <div className="row between">
                    <strong>{money(credit.amountCents)}</strong>
                    <span className="muted small">{credit.date.split('-').reverse().join('/')}</span>
                  </div>
                  <div className="sicoob-note">{credit.memo || 'Crédito sem descrição'}</div>
                  {credit.txid && <div className="muted small">TXID: {credit.txid}</div>}
                  {complete ? <p className="sicoob-confirmed"><CheckCircle2 size={17} />
                    Confirmado: {complete}</p> : (
                    <>
                      <p className={'small ' + (matched.reason === 'txid' ? 'sicoob-exact' : 'muted')}>
                        {displayStatus[matched.reason] || 'Nenhum pagamento correspondente encontrado'}
                      </p>
                      {matched.reason !== 'confirmed' && matched.reason !== 'divergent' && (
                        <>
                          <select aria-label={'Vincular crédito de ' + money(credit.amountCents)}
                            value={targetId || ''}
                            onChange={(event) => setChoice((current) => ({
                              ...current, [credit.id]: event.target.value,
                            }))}>
                            <option value="">Selecione o pagamento correspondente</option>
                            {displayOptions.map((payment) => <option key={payment.id} value={payment.id}>
                              {payment.id} · {payment.payer_name || 'Pagador não informado'}
                              {' · '}{money(payment.total_cents)}
                            </option>)}
                          </select>
                          {!credit.e2eid && (
                            <input aria-label="E2E do comprovante, quando disponível"
                              placeholder="E2E do comprovante (opcional se houver FITID)"
                              inputMode="text"
                              value={referenceOverride[credit.id] || ''}
                              onChange={(event) => setReferenceOverride((current) => ({
                                ...current, [credit.id]: event.target.value,
                              }))} />
                          )}
                          <button type="button" className="btn" disabled={
                            !target || Boolean(working) || !checkedBank || !checkedValue ||
                            !credit.isPix || !isWaiting(target.status)
                          } onClick={() => approve(credit, target)}>
                            <ShieldCheck size={17} />
                            {working === credit.id ? 'Confirmando…' : 'Confirmar este Pix'}
                          </button>
                        </>
                      )}
                      {!credit.isPix && <p className="muted small">
                        Crédito não identificado como Pix neste OFX. Verifique diretamente no banco.
                      </p>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
