import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutSupportHref, checkoutSupportMessage, safeCheckoutUrl } from '../client/lib/checkoutSupport.js';

test('support URL never discloses an edit token or query/hash parameters', () => {
  assert.equal(
    safeCheckoutUrl('https://ejc.migos.club/checkout/SUPERSECRET?foo=bar#access=PRIVATE'),
    'https://ejc.migos.club/checkout/[acesso-privado]',
  );
  assert.equal(
    safeCheckoutUrl('https://ejc.migos.club/pedido/SECRET'),
    'https://ejc.migos.club/pedido/[acesso-privado]',
  );
});

test('support message keeps non-sensitive diagnostics and order code', () => {
  const data = { step: 'Pix', checkoutId: 'EJCB-AABBCCDDEEFF',
    recipientNames: ['Maria', 'João'],
    url: 'https://ejc.migos.club/checkout/HIDDEN?token=HIDDEN',
    userAgent: 'Safari iPhone', viewport: '390×844' };
  const message = checkoutSupportMessage(data);
  assert.match(message, /EJCB-AABBCCDDEEFF/);
  assert.match(message, /Maria, João/);
  assert.match(message, /Safari iPhone/);
  assert.doesNotMatch(message, /HIDDEN/);
  assert.match(checkoutSupportHref(data), /^https:\/\/wa\.me\/5533999546031\?text=/);
});
