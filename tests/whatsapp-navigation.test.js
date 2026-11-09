import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  navigateToWhatsApp,
  isWhatsAppConfirmationPending,
  setWhatsAppConfirmationPending,
} from '../client/lib/whatsappNavigation.js';

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

test('WhatsApp navigates in the current tab instead of creating orphan Safari windows', () => {
  const calls = [];
  const location = { assign(url) { calls.push(url); } };
  navigateToWhatsApp('https://wa.me/5532999662604?text=Ol%C3%A1', location);
  navigateToWhatsApp('https://api.whatsapp.com/send?text=Ajuda', location);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]).pathname, '/5532999662604');
  assert.equal(new URL(calls[1]).hostname, 'api.whatsapp.com');
});

test('WhatsApp navigation rejects unrelated or unsafe addresses', () => {
  const location = { assign() { throw Error('unexpected navigation'); } };
  for (const link of [
    'https://example.com/', 'https://wa.me.evil.example/chat',
    'http://wa.me/5532999662604', 'javascript:alert(1)'
  ]) assert.throws(() => navigateToWhatsApp(link, location), /WhatsApp inválido|Link do WhatsApp inválido/);
});

test('manual delivery confirmation survives same-tab navigation and can be cleared', () => {
  const items = new Map();
  const storage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  };
  const key = 'recipient:mural:5';
  assert.equal(isWhatsAppConfirmationPending(key, storage), false);
  setWhatsAppConfirmationPending(key, true, storage);
  assert.equal(isWhatsAppConfirmationPending(key, storage), true);
  setWhatsAppConfirmationPending(key, false, storage);
  assert.equal(isWhatsAppConfirmationPending(key, storage), false);
});

test('WhatsApp entrypoints no longer open a new browser tab', () => {
  for (const path of [
    'client/lib/secureSupport.js',
    'client/components/RecipientWhatsApp.jsx',
    'client/pages/AdminLetters.jsx',
    'client/pages/AdminSupportMessages.jsx',
  ]) {
    const code = source(path);
    assert.doesNotMatch(code, /window\.open\(/, path + ' must not spawn a WhatsApp popup');
    assert.doesNotMatch(code, /popup\.location|popup\?\.close/, path + ' must not rely on popup closing');
  }
  const secure = source('client/lib/secureSupport.js');
  assert.match(secure, /window\.location\.assign\(result\.link\)/);
  for (const path of ['client/components/RecipientWhatsApp.jsx', 'client/pages/AdminLetters.jsx']) {
    const code = source(path);
    assert.match(code, /setWhatsAppConfirmationPending/);
    assert.match(code, /navigateToWhatsApp/);
  }
});

test('direct WhatsApp and support redirect links stay in the current tab', () => {
  const recipient = source('client/components/RecipientWhatsApp.jsx');
  const letters = source('client/pages/AdminLetters.jsx');
  const unfinished = source('client/components/UnfinishedLetterNotice.jsx');
  assert.doesNotMatch(recipient, /href=\{fallbackLink\}[^>]*target="_blank"/);
  assert.doesNotMatch(letters, /href=\{whatsApp\}[^>]*target="_blank"/);
  assert.doesNotMatch(letters, /className="btn outline" target="_blank"\s+rel="noopener noreferrer"\s+href=\{whatsappShareUrl/);
  assert.doesNotMatch(unfinished, /href="\/ajuda\/minha-cartinha"[^>]*target="_blank"/);
});
