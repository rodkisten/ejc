// Admin list filters are intentionally shareable. Never persist contact phone,
// private editing links, message bodies, or access credentials in these params.
const PAID_STATUSES = new Set(['paid', 'preparing', 'delivered']);

export function readAdminListFilters(value, validStatuses = []) {
  const params = new URLSearchParams(value);
  const requested = params.get('situacao') || 'all';
  return {
    search: (params.get('busca') || '').slice(0, 120),
    filter: validStatuses.includes(requested) ? requested : 'all',
  };
}

export function updateAdminListFilter(value, key, nextValue) {
  const params = new URLSearchParams(value);
  if (key !== 'busca' && key !== 'situacao') return params;

  const next = String(nextValue ?? '').slice(0, 120);
  if (!next.trim() || (key === 'situacao' && next === 'all')) params.delete(key);
  else params.set(key, next);
  return params;
}

export function isReadyForSending(letter) {
  return Boolean(letter && !letter.gift && letter.submitted === true &&
    PAID_STATUSES.has(letter.status));
}

export function needsTextCompletion(letter) {
  return Boolean(letter && !letter.gift && letter.has_text === false &&
    PAID_STATUSES.has(letter.status));
}

export function matchesSupportOrder(letter, search = '', filter = 'all') {
  if (!letter || letter.gift) return false;
  if (filter === 'ready' && !isReadyForSending(letter)) return false;
  if (filter === 'paid-draft' && (!PAID_STATUSES.has(letter.status) || letter.submitted)) return false;
  if (filter === 'empty-paid-draft' &&
    (!PAID_STATUSES.has(letter.status) || letter.submitted || letter.has_text)) return false;
  if (filter === 'pending' && PAID_STATUSES.has(letter.status)) return false;
  if (filter === 'needs-completion' && !needsTextCompletion(letter)) return false;

  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  return !query || [letter.recipient_name, letter.sender_name, letter.id, letter.recipient_slug]
    .some(value => normalize(value).includes(query));
}
