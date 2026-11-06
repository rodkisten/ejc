/** Pix static BR Code (EMV) generator. Uses UTF-8 byte lengths for fields. */
const enc = new TextEncoder();
const size = (s) => enc.encode(s).length;
function tlv(id, value) {
  const length = size(String(value));
  if (length > 99) throw new Error(`Campo Pix ${id} excede 99 bytes`);
  return id + String(length).padStart(2, '0') + value;
}
function normalize(s, max) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,&-]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, max);
}
function crc16(payload) {
  let crc = 0xffff;
  for (const byte of enc.encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).padStart(4, '0').toUpperCase();
}
export function generatePix({ key, merchantName, merchantCity, amountCents, txid }) {
  if (!key || size(key) > 77) throw new Error('Configure uma chave Pix válida (máximo 77 bytes).');
  const name = normalize(merchantName, 25),
    city = normalize(merchantCity, 15);
  if (!name || !city) throw new Error('Configure nome e cidade do recebedor Pix.');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Valor inválido.');
  if (!/^[A-Za-z0-9]{1,25}$/.test(txid)) throw new Error('TXID inválido.');
  const merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const base =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', (amountCents / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', txid)) +
    '6304';
  return base + crc16(base);
}
