import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileUp, PhoneCall, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { parseRecipientPhoneCsv, previewRecipientPhoneImport } from '../lib/recipientPhoneImport';
import '../styles/recipient-phone-import.css';

const LABELS = {
  ready: 'Pronto para salvar',
  same: 'Já cadastrado',
  review: 'Número a conferir',
  unmatched: 'Nome não encontrado',
  ambiguous: 'Nome duplicado no sistema',
  existing: 'Já tem outro telefone',
  duplicate: 'Repetido nesta importação',
  invalid: 'Telefone inválido',
};

export default function RecipientPhoneBulkImport({ recipients = [], onRefresh }) {
  const [csv, setCsv] = useState('');
  const [includeReview, setIncludeReview] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [mappings, setMappings] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [outcome, setOutcome] = useState('');
  const parsed = useMemo(() => {
    try { return { rows: parseRecipientPhoneCsv(csv), error: '' }; }
    catch (error) { return { rows: [], error: error.message }; }
  }, [csv]);
  const preview = useMemo(() => previewRecipientPhoneImport(parsed.rows, recipients, {
    includeReview, overwrite, mappings,
  }), [parsed.rows, recipients, includeReview, overwrite, mappings]);
  const ready = preview.filter(item => item.status === 'ready');
  const reviewed = preview.filter(item => item.review).length;

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) { setOutcome('Arquivo muito grande (máximo 200 KB).'); return; }
    try {
      setCsv(await file.text());
      setMappings({}); setIncludeReview(false); setOverwrite(false); setOutcome('');
    } catch { setOutcome('Não foi possível ler o arquivo CSV.'); }
    event.target.value = '';
  }

  async function submit() {
    if (!ready.length || busy) return;
    setBusy(true); setOutcome('');
    let saved = 0;
    const failures = [];
    try {
      for (const [index, item] of ready.entries()) {
        setProgress('Salvando ' + (index + 1) + ' de ' + ready.length + ': ' + item.person.name);
        try {
          await api('/api/admin/recipients/' + item.person.id, {
            method: 'PATCH', data: { whatsapp_phone: item.phone },
          });
          saved++;
        } catch (error) { failures.push(item.person.name + ': ' + error.message); }
      }
      await onRefresh?.();
      setOutcome(saved + ' telefone(s) salvo(s). ' + failures.length + ' falha(s).' +
        (failures.length ? ' Confira: ' + failures.join(' | ') : ' Os demais cadastros foram preservados.'));
    } catch (error) {
      setOutcome('Salvamentos parciais: ' + saved + '. Não foi possível atualizar a lista: ' + error.message);
    } finally { setBusy(false); setProgress(''); }
  }

  return (
    <section className="form-card recipient-bulk-import">
      <div className="recipient-bulk-header">
        <div>
          <span className="eyebrow">WHATSAPP · IMPORTAÇÃO EM LOTE</span>
          <h2><PhoneCall size={22} /> Importar telefones por CSV</h2>
          <p className="muted small">Os nomes são comparados sem diferenciar maiúsculas ou acentos. Nenhum encontrista novo será criado. Confira a prévia antes de salvar.</p>
        </div>
        <label className="btn outline recipient-bulk-file">
          <FileUp size={17} /> Selecionar CSV
          <input type="file" accept=".csv,text/csv,text/plain" onChange={readFile} disabled={busy} />
        </label>
      </div>
      <label htmlFor="recipient-phone-csv">Ou cole o conteúdo do CSV</label>
      <textarea id="recipient-phone-csv" rows={4} spellCheck={false} value={csv}
        onChange={event => { setCsv(event.target.value); setMappings({}); setOutcome(''); }}
        disabled={busy} placeholder={'nome;telefone;circulo;status\nMaria Eduarda;(33) 99999-9999;Amarelo;conferido'} />
      {parsed.error && <p className="notice error" role="alert">{parsed.error}</p>}
      {!!preview.length && <>
        <div className="recipient-bulk-summary" role="status">
          <strong>{preview.length} linhas</strong>
          <span><CheckCircle2 size={15} /> {ready.length} prontas</span>
          <span>{preview.filter(item => item.status === 'same').length} já cadastradas</span>
          <span>{reviewed} sinalizadas para conferência</span>
        </div>
        <div className="recipient-bulk-scroll">
          <table className="recipient-bulk-table">
            <thead><tr><th>Encontrista no CSV</th><th>Telefone</th><th>Correspondência / situação</th></tr></thead>
            <tbody>{preview.map(item => <tr key={item.line + '-' + item.index}>
              <td><strong>{item.name || '(sem nome)'}</strong><small>{item.group || 'Linha ' + item.line}</small></td>
              <td>{item.phone}</td>
              <td>
                <span className={'recipient-bulk-status status-' + item.status}>{LABELS[item.status]}</span>
                {item.person && <small>{item.person.name}</small>}
                {['unmatched', 'ambiguous'].includes(item.status) && <select
                  aria-label={'Selecionar encontrista para ' + item.name}
                  value={mappings[item.index] || ''}
                  onChange={event => setMappings(current => ({ ...current, [item.index]: event.target.value }))}
                  disabled={busy}>
                  <option value="">Escolher manualmente...</option>
                  {recipients.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="recipient-bulk-options">
          {reviewed > 0 && <label><input type="checkbox" checked={includeReview}
            onChange={event => setIncludeReview(event.target.checked)} disabled={busy} />
            Conferi na foto os números sinalizados e autorizo incluí-los</label>}
          {preview.some(item => item.status === 'existing') || overwrite ? <label>
            <input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} disabled={busy} />
            Substituir números já cadastrados quando forem diferentes
          </label> : null}
        </div>
        <button className="btn" type="button" disabled={!ready.length || busy || !!parsed.error} onClick={submit}>
          <ShieldCheck size={17} /> {busy ? 'Importando...' : 'Salvar ' + ready.length + ' telefone(s) em lote'}
        </button>
        {progress && <p className="notice" role="status"><RefreshCw size={15} /> {progress}</p>}
      </>}
      {outcome && <p className="notice" role="status">{outcome}</p>}
      <p className="muted small">Os números são enviados apenas à API administrativa autenticada, um cadastro por vez. Nenhum contato é exposto na página pública.</p>
    </section>
  );
}
