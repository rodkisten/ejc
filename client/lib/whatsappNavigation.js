// Use the current browser tab instead of creating a blank popup. Safari iOS
// cannot reliably close a cross-origin WhatsApp tab after opening the native app.
export function navigateToWhatsApp(url, destination = typeof window !== 'undefined' ? window.location : null) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' ||
      !['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(parsed.hostname)) {
    throw new Error('Link do WhatsApp inválido.');
  }
  if (!destination || typeof destination.assign !== 'function') {
    throw new Error('Não foi possível abrir o WhatsApp neste navegador.');
  }
  destination.assign(parsed.toString());
}

export function isWhatsAppConfirmationPending(key, storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  try { return storage?.getItem('ejc-whatsapp-pending:' + key) === '1'; }
  catch { return false; }
}

export function setWhatsAppConfirmationPending(key, pending, storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  try {
    const storageKey = 'ejc-whatsapp-pending:' + key;
    if (pending) storage?.setItem(storageKey, '1');
    else storage?.removeItem(storageKey);
  } catch { /* Private mode may disable session storage. Local state still works. */ }
}
