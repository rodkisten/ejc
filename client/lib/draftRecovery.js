import { draftGet, draftKeys, draftRemove, draftSet } from './drafts.js';
import { localCheckouts } from './cart.jsx';

const ORDER_PREFIX = 'ejc-order-backup-';
const TEXT_KEYS = /^(ejc-draft-|ejc-cart-letter-|ejc-order-backup-|ejc-order-version-)/;

export function letterPlainText(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function readLegacyStorage(storage) {
  const entries = [];
  if (!storage) return entries;
  try {
    for (let i = 0; i < Math.min(storage.length, 500); i++) {
      const key = storage.key(i);
      if (!key || !TEXT_KEYS.test(key)) continue;
      try {
        const value = JSON.parse(storage.getItem(key) || 'null');
        if (value && typeof value === 'object' && !Array.isArray(value))
          entries.push({ key, value });
      } catch { /* A stored string or outdated format is not a letter. */ }
    }
  } catch { /* Private browsing may block storage access. */ }
  return entries;
}

export async function findLocalLetterVersions(order) {
  if (!order?.id || !order.recipient_slug) return [];
  const checkoutItemIds = new Set(localCheckouts()
    .filter((session) => session.id === order.checkout_id)
    .flatMap((session) => session.itemIds || []));
  const stored = [];
  try {
    const keys = (await draftKeys()).filter((key) => TEXT_KEYS.test(key)).slice(0, 500);
    for (const key of keys) {
      try {
        const value = await draftGet(key);
        if (value) stored.push({ key, value });
      } catch { /* One broken record must not block the remaining drafts. */ }
    }
  } catch { /* IndexedDB unavailable: attempt localStorage and sessionStorage. */ }
  for (const type of ['localStorage', 'sessionStorage']) {
    try { stored.push(...readLegacyStorage(window[type])); }
    catch { /* Storage not available in this browser. */ }
  }
  const versions = new Map();
  for (const { key, value } of stored) {
    if (typeof value !== 'object' || Array.isArray(value)) continue;
    const html = typeof value.html === 'string' ? value.html :
      typeof value.rich_html === 'string' ? value.rich_html : '';
    const text = letterPlainText(html);
    if (!text) continue;
    const fromKey = key.startsWith('ejc-draft-') ? key.slice('ejc-draft-'.length) : '';
    const slug = value.recipient_slug || fromKey;
    const exactOrder = value.order_id === order.id ||
      key === ORDER_PREFIX + order.id ||
      key.startsWith('ejc-order-version-' + order.id + '-');
    const exactCheckout = key.startsWith('ejc-cart-letter-') &&
      checkoutItemIds.has(key.slice('ejc-cart-letter-'.length));
    if (!exactOrder && !exactCheckout && slug !== order.recipient_slug) continue;
    // Matching the recipient alone is not enough to associate two people's
    // private messages. Ambiguous local copies are not displayed as matches.
    const savedName = normalizeName(value.sender || value.sender_name);
    const serverName = normalizeName(order.sender_name);
    if (!exactOrder && savedName && serverName && savedName !== serverName) continue;
    if (!exactOrder && !exactCheckout && !savedName && serverName) continue;
    const previous = versions.get(html);
    const candidate = {
      key, html, text, updatedAt: value.updatedAt || value.updated_at || '',
      source: exactOrder ? 'cópia deste pedido' :
        exactCheckout ? 'rascunho do Pix' : 'rascunho do navegador',
    };
    if (!previous || (candidate.updatedAt || '') > (previous.updatedAt || ''))
      versions.set(html, candidate);
  }
  return [...versions.values()].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '') ||
    b.text.length - a.text.length);
}

// Preserve the last twelve nonempty local versions as well as the newest
// draft. Serialize requests so an older Safari autosave cannot win a race.
const writeQueue = new Map();
export function backupOrderLetter(order, { html, sender, composition }) {
  if (!order?.id || !letterPlainText(html)) return Promise.resolve(false);
  const key = ORDER_PREFIX + order.id;
  const previousWrite = writeQueue.get(key) || Promise.resolve();
  const write = previousWrite.catch(() => {}).then(async () => {
    const previous = await draftGet(key).catch(() => null);
    if (previous?.html === html && previous?.sender === sender) return true;
    if (letterPlainText(previous?.html) && previous.html !== html) {
      const prefix = 'ejc-order-version-' + order.id + '-';
      await draftSet(prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 6), previous);
      const keys = (await draftKeys()).filter((value) => value.startsWith(prefix)).sort();
      await Promise.all(keys.slice(0, -12).map((value) => draftRemove(value)));
    }
    await draftSet(key, {
      order_id: order.id,
      recipient_slug: order.recipient_slug,
      sender: sender || order.sender_name || '',
      html,
      composition,
      updatedAt: new Date().toISOString(),
    });
    return true;
  });
  writeQueue.set(key, write);
  void write.finally(() => { if (writeQueue.get(key) === write) writeQueue.delete(key); })
    .catch(() => {});
  return write;
}
