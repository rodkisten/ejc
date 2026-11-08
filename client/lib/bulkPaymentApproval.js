// Batch selection is explicit, but the admin must enter a distinct bank
// reference for EVERY Pix. A common reference cannot confirm unrelated
// transfers, and the server rechecks status and reuse before updating.
export function prepareManualPixBatch(payments, selectedIds, references) {
  if (!Array.isArray(payments) || !Array.isArray(selectedIds) ||
    !references || typeof references !== 'object') throw new Error('Seleção inválida.');
  const ids = [...new Set(selectedIds)];
  if (!ids.length || ids.length > 100) throw new Error('Selecione de 1 a 100 pagamentos.');
  const byId = new Map(payments.map((payment) => [payment.id, payment]));
  const existing = new Set(payments.filter((payment) => !ids.includes(payment.id))
    .map((payment) => String(payment.bank_reference || '').trim().toUpperCase()).filter(Boolean));
  const used = new Set();
  return ids.map((id) => {
    const payment = byId.get(id);
    if (!payment || !['pending', 'claimed'].includes(payment.status))
      throw new Error('O pagamento ' + id + ' não está mais aguardando Pix.');
    const reference = String(references[id] || '').trim().toUpperCase();
    if (!/^[A-Z0-9:/._-]{8,128}$/.test(reference))
      throw new Error('Informe a referência bancária completa de ' + id + '.');
    if (used.has(reference) || existing.has(reference))
      throw new Error('A referência ' + reference + ' está duplicada.');
    used.add(reference);
    return { payment, reference };
  });
}
