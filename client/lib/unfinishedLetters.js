import { api } from './api.js';
import { draftGet, draftKeys } from './drafts.js';

const ORDER_HISTORY = 'ejc-private-orders-v1';
const PAID = new Set(['paid', 'preparing', 'delivered']);
const ORDER_TOKEN = /^(?:[A-Za-z0-9_-]{40,100}|r1_[A-F0-9]{12}_[0-9a-f]{8}_[A-Za-z0-9_-]{43})$/;
const CHECKOUT_TOKEN = /^[A-Za-z0-9_-]{40,100}$/;

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function localPrivateOrders() {
  try {
    const entries = JSON.parse(storage()?.getItem(ORDER_HISTORY) || '[]');
    return Array.isArray(entries) ? entries.filter((entry) =>
      entry && /^EJC-[A-F0-9]{12}$/.test(entry.id) && ORDER_TOKEN.test(entry.token)) : [];
  } catch { return []; }
}

// The server stores the token only as a hash. Remember the private link on
// this device when the owner opens it, so they can resume via the home page.
export function rememberPrivateOrder(order, token) {
  if (!/^EJC-[A-F0-9]{12}$/.test(order?.id || '') || !ORDER_TOKEN.test(token || '')) return;
  const saved = storage();
  if (!saved) return;
  try {
    const previous = localPrivateOrders();
    if (previous.some((item) => item.id === order.id && item.token === token)) return;
    const next = {
      id: order.id,
      token,
      recipient_slug: order.recipient_slug || '',
      recipient_name: order.recipient_name || '',
      updated_at: new Date().toISOString(),
    };
    saved.setItem(ORDER_HISTORY,
      JSON.stringify([next, ...previous.filter((item) => item.id !== order.id)].slice(0, 80)));
  } catch { /* Private storage may be disabled or full. Never block the editor. */ }
}

export function checkoutUnfinished(checkout) {
  if (!checkout || !Array.isArray(checkout.items)) return [];
  return checkout.items.filter((item) =>
    item && item.submitted === false &&
    ['pending', 'claimed', ...PAID].includes(item.status || checkout.status) &&
    ORDER_TOKEN.test(item.token || '')).map((item) => ({
      id: item.id,
      recipient_slug: item.recipient_slug || '',
      recipient_name: item.recipient_name || 'Encontrista',
      sender_name: item.sender_name || '',
      kind: PAID.has(item.status || checkout.status) ? 'paid' : 'pending',
      url: '/pedido/' + encodeURIComponent(item.token),
      source: 'checkout',
      created_at: checkout.created_at || '',
    }));
}

function fromOrder(order, token) {
  if (!order || order.submitted || !ORDER_TOKEN.test(token || '') ||
      !['pending', 'claimed', ...PAID].includes(order.status)) return null;
  return {
    id: order.id,
    recipient_slug: order.recipient_slug || '',
    recipient_name: order.recipient_name || 'Encontrista',
    sender_name: order.sender_name || '',
    kind: PAID.has(order.status) ? 'paid' : 'pending',
    url: '/pedido/' + encodeURIComponent(token),
    source: 'order',
    created_at: order.created_at || '',
  };
}

function containsLocalDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  const text = String(draft.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  return Boolean(text || draft.sender?.trim() ||
    draft.assets?.some((asset) => asset?.file) || draft.composition?.stickers?.length);
}

function localSources(saved) {
  const checkouts = new Set();
  const orders = new Set(localPrivateOrders().map((item) => item.token));
  try {
    for (let index = 0; index < saved.length; index++) {
      const key = saved.key(index) || '';
      const value = saved.getItem(key);
      if (/^ejc-checkout-EJCB-[A-F0-9]{12}$/.test(key) && CHECKOUT_TOKEN.test(value || ''))
        checkouts.add(value);
      if (key.startsWith('ejc-cart-order-')) {
        const token = key.slice('ejc-cart-order-'.length);
        if (ORDER_TOKEN.test(token)) orders.add(token);
      }
    }
    const last = saved.getItem('ejc-last-checkout');
    if (CHECKOUT_TOKEN.test(last || '')) checkouts.add(last);
  } catch { /* An unavailable storage is not evidence that a payment is unpaid. */ }
  return { checkouts, orders };
}

// Cross-check every recoverable private access link with the server. Never
// announce "Pix confirmado" based on stale localStorage or IndexedDB alone.
// A different browser cannot discover a private order without its private link.
export async function findUnfinishedLetters({ cartItems = [], checkouts = [] } = {}) {
  const saved = storage();
  const local = saved ? localSources(saved) : { checkouts: new Set(), orders: new Set() };
  const checkoutTokens = new Set([
    ...checkouts.map((entry) => entry?.token).filter((value) => CHECKOUT_TOKEN.test(value || '')),
    ...local.checkouts,
  ]);
  const found = new Map();
  const paidDraftIds = new Set();
  const serverSlugs = new Set();

  await Promise.all([...checkoutTokens].slice(0, 80).map(async (token) => {
    try {
      const checkout = await api('/api/checkout', { token });
      for (const item of checkoutUnfinished(checkout)) {
        found.set(item.id, item);
        serverSlugs.add(item.recipient_slug);
        if (item.kind === 'paid') paidDraftIds.add(item.id);
      }
      // Include the private links of checkout items, even if older history
      // lacks the original local cart index.
      for (const item of checkout.items || []) {
        if (ORDER_TOKEN.test(item.token || '')) local.orders.add(item.token);
      }
    } catch { /* Invalid or inaccessible checkout: don't claim it's paid. */ }
  }));

  await Promise.all([...local.orders].slice(0, 120).map(async (token) => {
    try {
      const order = await api('/api/order', { token });
      if (found.has(order.id)) return;
      const item = fromOrder(order, token);
      if (item) {
        found.set(item.id, item);
        serverSlugs.add(item.recipient_slug);
        if (item.kind === 'paid') paidDraftIds.add(item.id);
      }
    } catch { /* No valid private link. Do not expose server records. */ }
  }));

  const linkedDraftIds = new Set(checkouts.flatMap((entry) => entry?.itemIds || []));
  for (const entry of cartItems) {
    if (!entry?.id || linkedDraftIds.has(entry.id)) continue;
    if (found.has(entry.id)) continue;
    found.set('cart:' + entry.id, {
      id: 'cart:' + entry.id,
      recipient_name: entry.recipient_name || entry.recipient_slug,
      recipient_slug: entry.recipient_slug,
      sender_name: entry.sender_name || '',
      kind: 'local',
      url: '/enviar/' + encodeURIComponent(entry.recipient_slug) +
        '?edit=' + encodeURIComponent(entry.id),
      source: 'cart',
      created_at: entry.updated_at || '',
    });
  }

  try {
    const keys = (await draftKeys()).filter((key) => key.startsWith('ejc-draft-')).slice(0, 100);
    const drafts = await Promise.all(keys.map((key) => draftGet(key).catch(() => null)));
    keys.forEach((key, index) => {
      const slug = key.slice('ejc-draft-'.length);
      // An older offline copy must not pretend a purchased draft is unpaid.
      if (!slug || serverSlugs.has(slug) || !containsLocalDraft(drafts[index])) return;
      found.set('local:' + slug, {
        id: 'local:' + slug, kind: 'local', source: 'indexeddb',
        recipient_slug: slug, recipient_name: slug.replaceAll('-', ' '),
        sender_name: drafts[index].sender || '',
        url: '/enviar/' + encodeURIComponent(slug), created_at: drafts[index].updatedAt || '',
      });
    });
  } catch { /* IndexedDB can be unavailable in private browsing. */ }

  return [...found.values()].sort((a, b) => {
    const rank = { paid: 0, pending: 1, local: 2 };
    return rank[a.kind] - rank[b.kind] ||
      String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}
