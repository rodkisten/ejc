// Accept the identifier printed beside the Pix QR, the raw TXID or a pasted
// BR Code. This never verifies payment, it only locates the matching order.
export function normalizePaymentLookup(value) {
  const original = String(value || '').trim();
  if (!original) return '';
  const upper=original.toUpperCase();
  // Works with the code embedded inside a full Pix Copia e Cola payload.
  const code=upper.match(/EJCB?-?[A-F0-9]{12}/);
  if(code) return code[0].replace(/-/g,'');
  // Allow partial entry of the visible code, with or without its hyphen.
  if(/^EJCB?-?[A-F0-9]{0,12}$/.test(upper)) return upper.replace(/-/g,'');
  return original.slice(0,120);
}
export function likeTerm(value) {
  return '%' + String(value || '').replace(/[\\%_]/g, '\\$&') + '%';
}
export function maskedStatus(value) {
  return ['pending','claimed','paid','preparing','delivered','cancelled'].includes(value)
    ? value : '';
}
