// Batch selection requires explicit bank/amount verification. Bank references
// are optional, but supplied references must be valid and unique. Never
// generate a fake transaction identifier for payments without one.
export function prepareManualPixBatch(payments, selectedIds, references) {
  if (!Array.isArray(payments) || !Array.isArray(selectedIds) ||
    !references || typeof references !== 'object') throw new Error('Seleção inválida.');
  const ids = [...new Set(selectedIds)];
  if (!ids.length) throw new Error('Selecione ao menos um pagamento.');
  const byId = new Map(payments.map((payment) => [payment.id, payment]));
  const existing = new Set(payments.filter((payment) => !ids.includes(payment.id))
    .map((payment) => String(payment.bank_reference || '').trim().toUpperCase()).filter(Boolean));
  const used = new Set();
  return ids.map((id) => {
    const payment = byId.get(id);
    if (!payment || !['pending', 'claimed'].includes(payment.status))
      throw new Error('O pagamento ' + id + ' não está mais aguardando Pix.');
    const reference = String(references[id] || '').trim().toUpperCase();
    if (reference && !/^[A-Z0-9:/._-]{8,128}$/.test(reference))
      throw new Error('Informe uma referência bancária válida para ' + id + ', ou deixe o campo vazio.');
    if (reference && (used.has(reference) || existing.has(reference)))
      throw new Error('A referência ' + reference + ' está duplicada.');
    if (reference) used.add(reference);
    return { payment, reference };
  });
}
