import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prepareWhatsAppPopup, closeWhatsAppPopup, navigateToWhatsApp,
  isWhatsAppConfirmationPending, setWhatsAppConfirmationPending
} from '../client/lib/whatsappNavigation.js';

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('Chrome iOS gets a popup synchronously before asynchronous WhatsApp preparation', () => {
  const visited = [];
  const popup = {
    closed: false, opener: { sensitive: true },
    document: { title: '', body: { textContent: '' } },
    location: { replace(url) { visited.push(url); } },
    close() { this.closed = true; }
  };
  const browser = { open(url, target) {
    assert.equal(url, 'about:blank');
    assert.equal(target, '_blank');
    return popup;
  } };
  const prepared = prepareWhatsAppPopup('Preparando convite…', browser);
  assert.equal(prepared, popup);
  assert.equal(popup.opener, null);
  assert.equal(popup.document.body.textContent, 'Preparando convite…');
  navigateToWhatsApp('https://api.whatsapp.com/send?phone=5532999662604&text=%F0%9F%92%8C',
    popup, { assign() { throw new Error('should keep source page open'); } });
  assert.equal(visited.length, 1);
  assert.equal(new URL(visited[0]).searchParams.get('text'), '💌');
  closeWhatsAppPopup(popup);
  assert.equal(popup.closed, true);
});

test('when popup is blocked, WhatsApp falls back to same-tab navigation', () => {
  const called = [];
  assert.equal(prepareWhatsAppPopup('Preparando…', {open:()=>null}), null);
  navigateToWhatsApp('https://api.whatsapp.com/send?text=Ajuda', null,
    {assign(url){ called.push(url); }});
  assert.equal(new URL(called[0]).hostname,'api.whatsapp.com');
});

test('WhatsApp navigation refuses unrelated or unsafe addresses', () => {
  const location = { assign() { throw new Error('unexpected navigation'); } };
  for (const link of [
    'https://example.com/', 'https://wa.me.evil.example/chat',
    'http://wa.me/5532999662604', 'javascript:alert(1)'
  ]) assert.throws(() => navigateToWhatsApp(link, null, location), /Link do WhatsApp inválido/);
});

test('manual delivery confirmation survives popup navigation and can be cleared', () => {
  const items = new Map();
  const storage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key)
  };
  const key = 'recipient:mural:5';
  assert.equal(isWhatsAppConfirmationPending(key, storage), false);
  setWhatsAppConfirmationPending(key, true, storage);
  assert.equal(isWhatsAppConfirmationPending(key, storage), true);
  setWhatsAppConfirmationPending(key, false, storage);
  assert.equal(isWhatsAppConfirmationPending(key, storage), false);
});

test('support, mural invites, recovered letters and admin replies use popup', () => {
  for (const path of [
    'client/lib/secureSupport.js',
    'client/components/RecipientWhatsApp.jsx',
    'client/pages/AdminLetters.jsx',
    'client/pages/AdminSupportMessages.jsx'
  ]) {
    const code = source(path);
    assert.match(code, /prepareWhatsAppPopup\(/, path);
  }
  for (const path of [
    'client/components/RecipientWhatsApp.jsx',
    'client/pages/AdminLetters.jsx'
  ]) {
    const code = source(path);
    assert.match(code, /setWhatsAppConfirmationPending/);
    assert.match(code, /navigateToWhatsApp/);
    assert.match(code, /closeWhatsAppPopup/);
  }
  assert.match(source('client/lib/secureSupport.js'), /popup\.location\.replace\(link\.toString\(\)\)/);
});

test('retry and direct-help links open new tab instead of replacing EJC tab', () => {
  assert.match(source('client/components/RecipientWhatsApp.jsx'),
    /href=\{fallbackLink\} target="_blank"/);
  assert.match(source('client/pages/AdminLetters.jsx'),
    /href=\{whatsApp\} target="_blank"/);
  assert.match(source('client/components/UnfinishedLetterNotice.jsx'),
    /href="\/ajuda\/minha-cartinha" target="_blank"/);
});
