import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeBrazilianWhatsApp, muralInvitationMessage, whatsappShareUrl
} from '../client/lib/recipientWhatsApp.js';

test('WhatsApp accepts mobile numbers with +55, DDD and formatting',()=>{
  assert.equal(normalizeBrazilianWhatsApp('(32) 99966-2604'),'5532999662604');
  assert.equal(normalizeBrazilianWhatsApp('+55 32 99966-2604'),'5532999662604');
  assert.equal(normalizeBrazilianWhatsApp('32 99966 2604'),'5532999662604');
  assert.equal(normalizeBrazilianWhatsApp('100'),'');
  assert.equal(normalizeBrazilianWhatsApp(''),'');
});

test('message preserves exact recipient link and Catholic format with full Mini Mercado credits',()=>{
  const url='https://ejc.migos.club/mural/maria?og=v123#token=m2.ABC.XYZ';
  const message=muralInvitationMessage({name:'Maria Eduarda',url,count:3});
  assert.match(message,/Maria, seu coração tem correspondência!/);
  assert.match(message,/3 cartinhas especiais/);
  assert.match(message,/Jeremias 31,3/);
  assert.match(message,/Filipenses 1,6/);
  assert.match(message,/Rodolfo Costa, Evelyne Pimentel/);
  assert.match(message,/Tia Mariana e Tio Saulinho/);
  assert.match(message,/Tia Daisy e Tio Davidson/);
  assert.equal(message.split(url).length,2);
  const wa=whatsappShareUrl({phone:'(32) 99966-2604',message});
  const parsed=new URL(wa);
  assert.equal(parsed.hostname,'api.whatsapp.com');
  assert.equal(parsed.pathname,'/send');
  assert.equal(parsed.searchParams.get('phone'),'5532999662604');
  assert.equal(parsed.searchParams.get('text'),message);
});

test('no contact numbers or signed mural tokens are baked into public pages',()=>{
  const admin=fs.readFileSync(new URL('../client/components/RecipientWhatsApp.jsx',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(admin,/RecipientPhoneEditor/);
  assert.match(admin,/WhatsAppAdmin/);
  assert.match(admin,/prepareWhatsAppPopup\(/);
  assert.match(worker,/await muralGrant\(env,person\)/);
  assert.match(worker,/address\.hash='token='/);
  assert.match(worker,/ready_letter_count/);
});

test('o convite informa leituras imediatamente depois do link, sem expor conteúdo',()=>{
  const url='https://ejc.migos.club/s/AbCdEf1234-_GH';
  const partiallyOpened=muralInvitationMessage({
    name:'Ana Julia',url,count:3,openedCount:2,
  });
  const start=partiallyOpened.indexOf(url)+url.length;
  assert.ok(start>=url.length);
  assert.match(partiallyOpened.slice(start,start+100),/^\n📖 \*Leitura:\* 2 de 3 cartinhas já foram abertas/);
  assert.match(muralInvitationMessage({name:'Ana',url,count:1,openedCount:1}),
    /📖 \*Leitura:\* a cartinha já foi aberta!/);
  assert.match(muralInvitationMessage({name:'Ana',url,count:4,openedCount:4}),
    /📖 \*Leitura:\* todas as 4 cartinhas já foram abertas!/);
  assert.match(muralInvitationMessage({name:'Ana',url,count:1,openedCount:0}),
    /💌 \*Leitura:\* nenhuma cartinha aberta/);
  assert.doesNotMatch(partiallyOpened,/first_read_at|EJC-[A-F0-9]{12}/);
});
