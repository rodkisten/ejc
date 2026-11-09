import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsAppText, whatsappMessageUrl } from '../shared/whatsappText.js';
import { whatsappShareUrl } from '../client/lib/recipientWhatsApp.js';
import { completedLetterWhatsAppHref } from '../client/lib/helpLink.js';
import { checkoutSupportHref } from '../client/lib/checkoutSupport.js';

test('emojis, accents, formatting and multi-line messages survive exactly one URL encoding', () => {
  const original = '💌✨ Oi, João! 🥹❤️\n🌹🕊️ Fé e perseverança: Filipenses 1,6\n1️⃣ 2️⃣ *negrito* _itálico_';
  const url = whatsappMessageUrl({ phone: '5532999662604', message: original });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('text'), original);
  assert.equal(parsed.origin, 'https://api.whatsapp.com');
  assert.equal(parsed.pathname, '/send');
  assert.equal(parsed.searchParams.get('phone'), '5532999662604');
  assert.match(parsed.search, /%F0%9F%92%8C/);
  assert.doesNotMatch(parsed.search, /%25F0%259F/);
  assert.equal(whatsappShareUrl({ phone: '(32) 99966-2604', message: original }), url);
});

test('legacy Unicode escapes, HTML emoji entities, mojibake and percent escapes become real emoji', () => {
  const input = '\\uD83D\\uDC8C \\u{1F339} \\U0001F49B &#x1F48C; &#129395; %F0%9F%92%8C ðŸ’Œ';
  const message = normalizeWhatsAppText(input);
  assert.equal(message, '💌 🌹 💛 💌 🥳 💌 💌');
  const href = whatsappMessageUrl({ message });
  assert.equal(new URL(href).searchParams.get('text'), message);
  assert.doesNotMatch(href, /%25F0%259F/);
});

test('normalization preserves encrypted links, non-emoji percent escape sequences and literal formatting', () => {
  const message = '💌 *Olá!* https://ejc.migos.club/ajuda/minha-cartinha?c=ec1_ABC_123&url=%2Fadmin%2Fcartinhas';
  assert.equal(normalizeWhatsAppText(message), message);
  assert.equal(normalizeWhatsAppText('%2Fpedido%2Fabc'), '%2Fpedido%2Fabc');
});

test('completed-letter and checkout links decode into readable Unicode', () => {
  const completed = completedLetterWhatsAppHref({
    sender:'João 🥰',items:[{id:'EJC-123456789ABC',recipient_name:'Maria 🌹'}],submitted:true
  });
  const message = new URL(completed).searchParams.get('text');
  assert.match(message, /João 🥰/);
  assert.match(message, /Maria 🌹/);
  assert.match(message, /💌/);
  assert.doesNotMatch(message, /\\uD83D|%F0%9F/);
  const checkout = new URL(checkoutSupportHref({
    recipientNames: ['Maria 💖'],step:'Confirmação ✅',
  }));
  const checkoutText = checkout.searchParams.get('text');
  assert.match(checkoutText, /Maria 💖/);
  assert.match(checkoutText, /Confirmação ✅/);
});

test('malformed or solitary emoji escape sequences do not crash message building', () => {
  assert.equal(normalizeWhatsAppText('\\uD83D'), '\\uD83D');
  assert.equal(normalizeWhatsAppText('%F0%9F'), '%F0%9F');
  assert.equal(normalizeWhatsAppText('texto normal'), 'texto normal');
});

test('double-encoded and legacy percent-u emoji are repaired without changing other URL data', () => {
  const fixed = normalizeWhatsAppText('%25F0%259F%2592%258C %uD83D%uDC8C');
  assert.equal(fixed, '💌 💌');
  const output = whatsappMessageUrl({ phone: '5532999662604', message: fixed });
  assert.equal(new URL(output).searchParams.get('text'), fixed);
  assert.doesNotMatch(output, /%25F0%259F/);
});
