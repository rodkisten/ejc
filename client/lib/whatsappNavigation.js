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
    const doc = popup.document;
    const safeLabel = String(label).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    if (typeof doc.write === 'function') {
      doc.open();
      doc.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f9ff">
  <title>XX EJC · WhatsApp</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: max(24px, env(safe-area-inset-top)) 22px max(24px, env(safe-area-inset-bottom));
      background: radial-gradient(circle at 15% 12%, #dbeafe, transparent 45%),
                  radial-gradient(circle at 90% 90%, #fce7f3, transparent 48%), #f5f9ff;
      color: #274166;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }
    main {
      width: min(100%, 420px);
      padding: 38px 26px;
      border: 1px solid #fff;
      border-radius: 28px;
      background: rgba(255,255,255,.9);
      box-shadow: 0 18px 60px rgba(62,94,151,.12);
    }
    .heart { font-size: 52px; margin-bottom: 12px; }
    h1 { font-size: clamp(23px, 6vw, 30px); line-height: 1.2; margin: 0 0 16px; }
    p { font-size: 16px; line-height: 1.65; margin: 0 0 12px; }
    .status { color: #577399; font-size: 14px; }
    .footer { margin-top: 28px; font-size: 13px; color: #7185a5; }
    .dots { display: inline-block; animation: pulse 1.3s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
    @media (prefers-reduced-motion: reduce) { .dots { animation: none; } }
  </style>
</head>
<body>
  <main role="status" aria-live="polite">
    <div class="heart" aria-hidden="true">💌</div>
    <h1>Estamos te levando para o WhatsApp! 💙</h1>
    <p>Sua mensagem está sendo preparada com carinho.</p>
    <p>Você pode fechar esta janela quando terminar.</p>
    <p class="status"><span class="dots">💙 💙 💙</span> ${safeLabel}</p>
    <div class="footer">🌹 Com carinho, equipe Mini Mercado<br>XX EJC Simonésia</div>
  </main>
</body>
</html>`);
      doc.close();
    } else {
      doc.body.textContent = label;
    }
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
