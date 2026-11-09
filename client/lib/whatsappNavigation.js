// Chrome on iOS uses its own UI when opening an external app. Open a blank
// window synchronously during the tap so async API requests cannot be blocked.
// We cannot close a cross-origin browser tab after WhatsApp takes over.
export function prepareWhatsAppPopup(label = 'Preparando WhatsApp…', browser = typeof window !== 'undefined' ? window : null) {
  if (!browser?.open) return null;
  const popup = browser.open('about:blank', '_blank');
  if (!popup) return null;
  try {
    popup.opener = null;
    popup.document.title = 'XX EJC · WhatsApp';
    popup.document.body.textContent = label;
  } catch { /* The browser can isolate a popup immediately. */ }
  return popup;
}

export function closeWhatsAppPopup(popup) {
  try { if (popup && !popup.closed) popup.close(); }
  catch { /* A browser can forbid closing a window it did not open. */ }
}

export function navigateToWhatsApp(
  url,
  popup = null,
  destination = typeof window !== 'undefined' ? window.location : null
) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' ||
      !['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(parsed.hostname)) {
    throw new Error('Link do WhatsApp inválido.');
  }
  if (popup && !popup.closed) {
    try {
      popup.location.replace(parsed.toString());
      return;
    } catch {
      closeWhatsAppPopup(popup);
    }
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
