import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingLetterWhatsAppMessage,
  pendingLetterWhatsAppUrl,
} from '../client/lib/pendingLetterShare.js';

const short='https://ejc.migos.club/s/AbCdEf1234-_GH';

test('mensagem carinhosa preserva Unicode, pede conclusão e agradece',()=>{
  const text=pendingLetterWhatsAppMessage(short);
  assert.match(text,/Recebi a sua cartinha/);
  assert.match(text,/veio incompleta/);
  assert.match(text,/curiosidade para ler suas palavras/);
  assert.match(text,/terminar o envio/);
  assert.match(text,/Muito obrigado pelo carinho/);
  assert.ok(text.includes('💗'));
  assert.ok(text.includes(short));
});

test('WhatsApp deixa o destinatário em branco para a pessoa escolher',()=>{
  const url=new URL(pendingLetterWhatsAppUrl(short));
  assert.equal(url.origin,'https://api.whatsapp.com');
  assert.equal(url.pathname,'/send');
  assert.equal(url.searchParams.has('phone'),false);
  assert.ok(url.searchParams.get('text').includes(short));
  assert.ok(url.searchParams.get('text').includes('💖'));
  assert.ok(!url.searchParams.has('id'));
  assert.ok(!url.searchParams.has('token'));
});

test('rejeita links externos ou de edição privada no compartilhamento',()=>{
  assert.throws(()=>pendingLetterWhatsAppUrl('https://outro.site/s/AbCdEf1234-_GH'),/inválido/);
  assert.throws(()=>pendingLetterWhatsAppUrl('https://ejc.migos.club/pedido/segredo'),/inválido/);
});
