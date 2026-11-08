// Parse a human-reviewed contact sheet entirely in the authenticated browser.
// Never publish phone numbers in the public recipients API or bundle.
export function normalizeRecipientName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeImportPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const canonical = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
  return /^55[1-9][0-9][0-9]{8,9}$/.test(canonical) ? canonical : '';
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV com aspas sem fechamento.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseRecipientPhoneCsv(text) {
  if (typeof text !== 'string' || text.length > 200_000) {
    throw new Error('Cole um CSV com no máximo 200 KB.');
  }
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const delimiter = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = parseDelimited(text, delimiter);
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeRecipientName);
  const nameIndex = headers.findIndex(h => ['nome', 'encontrista', 'name'].includes(h));
  const phoneIndex = headers.findIndex(h => ['telefone', 'whatsapp', 'celular', 'phone'].includes(h));
  if (nameIndex < 0 || phoneIndex < 0) {
    throw new Error('Cabeçalho obrigatório: nome;telefone;circulo;status.');
  }
  const groupIndex = headers.findIndex(h => ['circulo', 'grupo'].includes(h));
  const statusIndex = headers.findIndex(h => ['status', 'confianca', 'conferencia'].includes(h));
  if (rows.length > 501) throw new Error('O máximo permitido são 500 contatos por vez.');
  return rows.slice(1).map((fields, index) => ({
    line: index + 2,
    name: String(fields[nameIndex] || '').trim(),
    phone: String(fields[phoneIndex] || '').trim(),
    group: groupIndex < 0 ? '' : String(fields[groupIndex] || '').trim(),
    review: statusIndex >= 0 && /revisar|pendente|incerto|duvid|conferir/i.test(fields[statusIndex] || ''),
  })).filter(item => item.name || item.phone);
}

export function previewRecipientPhoneImport(rows, recipients, { includeReview = false, overwrite = false, mappings = {} } = {}) {
  const byName = new Map();
  for (const person of recipients || []) {
    const key = normalizeRecipientName(person.name);
    byName.set(key, [...(byName.get(key) || []), person]);
  }
  const candidates = rows.map((item, index) => {
    const matching = byName.get(normalizeRecipientName(item.name)) || [];
    const manuallyMapped = mappings[index] != null && mappings[index] !== '';
    const picked = manuallyMapped ? (recipients || []).find(p => String(p.id) === String(mappings[index])) : null;
    const person = manuallyMapped ? picked : matching.length === 1 ? matching[0] : null;
    const phone = normalizeImportPhone(item.phone);
    let status;
    if (!item.name || !phone) status = 'invalid';
    else if (!person) status = matching.length > 1 ? 'ambiguous' : 'unmatched';
    else if (item.review && !includeReview) status = 'review';
    else if (normalizeImportPhone(person.whatsapp_phone) === phone) status = 'same';
    else if (person.whatsapp_phone && !overwrite) status = 'existing';
    else status = 'ready';
    return { ...item, index, person, phone, status };
  });
  const seen = new Set();
  return candidates.map(item => {
    if (!item.person || item.status !== 'ready') return item;
    if (seen.has(item.person.id)) return { ...item, status: 'duplicate' };
    seen.add(item.person.id);
    return item;
  });
}
