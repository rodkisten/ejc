// Sicoob Internet Banking exports OFX 1.x (SGML) and some OFX 2.x (XML).
// Parsing stays in the administrator's browser: bank statements are not uploaded.
function entityText(value) {
  return String(value || '').replace(/&(?:amp|lt|gt|quot|apos|#39);/gi, (part) => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
  })[part.toLowerCase()] || part).trim();
}

function ofxField(source, tag) {
  const pattern = new RegExp('<' + tag + '\\s*>\\s*([^<\\r\\n]*)', 'i');
  return entityText(pattern.exec(source)?.[1] || '');
}

function pixIdentifier(text) {
  const found = String(text || '').toUpperCase()
    .match(/\b(EJCB?-?[A-F0-9]{12})\b/);
  return found ? found[1].replace(/-/g, '') : '';
}

function endToEndId(text) {
  const found = String(text || '').toUpperCase().match(/\bE\d{8}[A-Z0-9]{23}\b/);
  return found ? found[0] : '';
}

function valueToCents(value) {
  let raw = String(value || '').trim().replace(/\s/g, '');
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.lastIndexOf('.') > raw.lastIndexOf(',')
      ? raw.replace(/,/g, '') : raw.replace(/\./g, '').replace(',', '.');
  }
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export async function decodeSicoobOfxFile(file) {
  const buffer = await file.arrayBuffer();
  const header = new TextDecoder('ascii').decode(buffer.slice(0, 500));
  const legacy = /CHARSET:\s*(1252|8859-1|ISO-8859-1)/i.test(header)
    || /ENCODING:\s*USASCII/i.test(header);
  return new TextDecoder(legacy ? 'windows-1252' : 'utf-8').decode(buffer);
}

export function parseSicoobOfx(text) {
  if (typeof text !== 'string' || !/<OFX\b/i.test(text))
    throw new Error('Arquivo não parece ser um extrato OFX válido.');
  const blocks = text.split(/<STMTTRN(?:\s[^>]*)?>/i).slice(1);
  if (!blocks.length) throw new Error('Nenhuma movimentação encontrada no OFX.');
  if (blocks.length > 10000) throw new Error('Extrato muito grande: escolha um período menor.');
  const accountId = ofxField(text, 'ACCTID') || 'SEM-CONTA';
  const seen = new Set();
  const transactions = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index].split(/<\/STMTTRN>/i)[0];
    const amountCents = valueToCents(ofxField(block, 'TRNAMT'));
    if (amountCents <= 0) continue; // Only incoming credits, never debits.
    const rawDate = ofxField(block, 'DTPOSTED').match(/^\d{8}/)?.[0] || '';
    if (!rawDate) continue;
    const date = rawDate.slice(0, 4) + '-' + rawDate.slice(4, 6) + '-' + rawDate.slice(6, 8);
    const fitId = ofxField(block, 'FITID');
    const memo = [ofxField(block, 'MEMO'), ofxField(block, 'NAME'), ofxField(block, 'CHECKNUM')]
      .filter(Boolean).join(' · ').slice(0, 500);
    const txid = pixIdentifier([memo, ofxField(block, 'TXID')].join(' '));
    const e2eid = endToEndId([memo, ofxField(block, 'REFNUM')].join(' '));
    const identity = fitId
      ? accountId + '|' + fitId + '|' + amountCents + '|' + rawDate
      : accountId + '|' + index + '|' + amountCents + '|' + rawDate;
    if (seen.has(identity)) continue;
    seen.add(identity);
    transactions.push({ id: String(index), date, amountCents, fitId, memo,
      txid, e2eid, isPix: /\bPIX\b/i.test(memo) || Boolean(txid || e2eid) });
  }
  if (!transactions.length) throw new Error('Não foram encontrados créditos neste extrato.');
  return { accountId, transactions };
}

export function candidatesForCredit(credit, payments) {
  const normalizedTxid = String(credit.txid || '').replace(/-/g, '').toUpperCase();
  const byTxid = normalizedTxid
    ? payments.filter((p) => String(p.txid || '').replace(/-/g, '').toUpperCase() === normalizedTxid)
    : [];
  if (byTxid.length) {
    const matches = byTxid.filter((p) => Number(p.total_cents) === credit.amountCents);
    if (!matches.length) return { reason: 'divergent', matches: [], suggestedId: '' };
    if (matches.every((p) => !['pending', 'claimed'].includes(p.status)))
      return { reason: 'confirmed', matches, suggestedId: '' };
    const pending = matches.filter((p) => ['pending', 'claimed'].includes(p.status));
    return { reason: 'txid', matches: pending, suggestedId: pending.length === 1 ? pending[0].id : '' };
  }
  const matches = payments.filter((p) => ['pending', 'claimed'].includes(p.status)
    && Number(p.total_cents) === credit.amountCents);
  return { reason: normalizedTxid ? 'unknown-txid' : 'amount', matches,
    suggestedId: '' }; // Same amount is NEVER proof of payment.
}

export async function ofxBankReference(credit, accountId) {
  if (credit.e2eid) return credit.e2eid;
  if (!credit.fitId) return ''; // No traceable bank entry, require the receipt's E2E.
  const identity = ['SICOOB', accountId, credit.fitId, credit.date, credit.amountCents].join('|');
  const bytes = new TextEncoder().encode(identity);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'OFX' + [...new Uint8Array(digest)].slice(0, 20)
    .map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
