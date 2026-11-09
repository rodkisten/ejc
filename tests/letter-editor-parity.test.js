import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedLetterWhatsAppHref } from '../client/lib/helpLink.js';

test('nova cartinha e edição de rascunho usam o mesmo formulário e os mesmos controles', () => {
  const create = readFileSync(new URL('../client/pages/Send.jsx', import.meta.url), 'utf8');
  const edit = readFileSync(new URL('../client/pages/Order.jsx', import.meta.url), 'utf8');
  const fields = readFileSync(new URL('../client/components/LetterComposerFields.jsx', import.meta.url), 'utf8');
  for (const source of [create, edit]) assert.match(source, /<LetterComposerFields\b/);
  for (const label of ['01. Suas palavras', '02. Sua voz', '03. Suas fotos', 'LetterControls']) {
    assert.ok(fields.includes(label), 'campo compartilhado ausente: ' + label);
  }
  assert.match(edit, /Sua cartinha foi enviada com sucesso!/);
  assert.match(edit, /Seu rascunho foi salvo com sucesso!/);
  assert.match(edit, /role="status" aria-live="polite"/);
});

test('aviso opcional ao WhatsApp usa somente o telefone correto com nome e ID', () => {
  const href = completedLetterWhatsAppHref({
    sender: 'Ana', submitted: true, items: [
      { id: 'EJC-123456789ABC', recipient_name: 'Maria Eduarda' },
      { id: 'EJC-AABBCCDDEEFF', recipient_name: 'João Pedro' },
    ]
  });
  const url = new URL(href);
  assert.equal(url.origin, 'https://api.whatsapp.com');
  assert.equal(url.pathname, '/send');
  assert.equal(url.searchParams.get('phone'), '5532999662604');
  const message = url.searchParams.get('text');
  assert.match(message, /Ana/);
  assert.match(message, /Maria Eduarda.*EJC-123456789ABC/);
  assert.match(message, /João Pedro.*EJC-AABBCCDDEEFF/);
  assert.match(message, /Finalizei e enviei/);
  assert.doesNotMatch(message, /\/pedido\/|checkout\/|token=/);
});

test('rascunho salvo não é confundido com cartinha enviada', () => {
  const href = completedLetterWhatsAppHref({
    submitted: false,items:[{ id: 'EJC-123456789ABC', recipient_name:'Maria' }]
  });
  const message = new URL(href).searchParams.get('text');
  assert.match(message, /Salvei as alterações do meu rascunho/);
  assert.match(message, /envio final ainda não foi feito/);
  assert.doesNotMatch(message, /Finalizei e enviei/);
});

test('mensagens não encaminham identificadores não operacionais nem credenciais', () => {
  const url = new URL(completedLetterWhatsAppHref({
    sender: 'Nome\nPrivado',
    items: [{ id: 'r1_TOKEN_PRIVADO', recipient_name: 'Maria' },
      { id: 'EJC-123456789ABC', recipient_name: 'João' }],
  }));
  const message = url.searchParams.get('text');
  assert.doesNotMatch(message, /r1_TOKEN_PRIVADO|Nome\nPrivado/);
  assert.match(message, /João.*EJC-123456789ABC/);
});
