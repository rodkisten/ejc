import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAnalyticsLocation } from '../client/lib/api.js';
import { completedLetterHelpLink,readyLetterWhatsAppMessage,recipientSupportLink } from '../client/lib/helpLink.js';

test('analytics strips edit credentials and keeps allowlisted UTM attribution',()=>{
  const url=safeAnalyticsLocation(
    'https://ejc.migos.club/pedido/private-token-ABC?token=secret&remetente=Ana&utm_source=whatsapp&utm_medium=mensagem&utm_campaign=recuperacao_cartinhas#token=m2.secret'
  );
  assert.equal(url,'https://ejc.migos.club/pedido/:privado?utm_source=whatsapp&utm_medium=mensagem&utm_campaign=recuperacao_cartinhas');
  assert.equal(safeAnalyticsLocation('https://ejc.migos.club/mural/maria#token=grant'),
    'https://ejc.migos.club/mural/:privado');
  assert.equal(safeAnalyticsLocation('https://ejc.migos.club/admin/pedidos/EJC-123456789ABC'),
    'https://ejc.migos.club/admin/pedidos/:pedido');
});

test('help link contains only operational IDs and recipient names, never private tokens',()=>{
  const link=new URL(completedLetterHelpLink({
    sender:'Ana',items:[
      {id:'EJC-123456789ABC',recipient_name:'Maria'},
      {id:'EJC-123456789ABD',recipient_name:'João'},
      {id:'not-safe',recipient_name:'Ignoring'},
    ],
  }));
  assert.equal(link.pathname,'/ajuda/terminei-a-cartinha');
  assert.deepEqual(link.searchParams.getAll('id'),['EJC-123456789ABC','EJC-123456789ABD']);
  assert.deepEqual(link.searchParams.getAll('para'),['Maria','João']);
  assert.equal(link.searchParams.get('remetente'),'Ana');
  assert.equal(link.searchParams.get('utm_campaign'),'recuperacao_cartinhas');
  assert.ok(!link.href.includes('token'));
});

test('ready notification contains a mural access link and identifies the recovered letter',()=>{
  const text=readyLetterWhatsAppMessage({
    recipient_name:'Maria Eduarda',order_id:'EJC-123456789ABC',
    url:'https://ejc.migos.club/mural/maria?utm_campaign=cartinha_recuperada#token=private',
    released:true,
  });
  assert.match(text,/Maria, sua cartinha ficou prontinha/);
  assert.match(text,/EJC-123456789ABC/);
  assert.match(text,/utm_campaign=cartinha_recuperada/);
  assert.match(text,/🔒/);
});

test('support URL accepts valid order IDs and navigation diagnostics but never the secret mural token',()=>{
  const url=recipientSupportLink({
    name:'Maria Eduarda',
    ids:['EJC-123456789ABC','bogus','EJC-123456789ABD'],
    origin:'https://ejc.migos.club',
    source:'mural',medium:'link',campaign:'suporte_encontrista',
    content:'cartinha_aberta',stage:'cartinha_aberta',
    browser:'Safari iPhone',viewport:'390x844',language:'pt-BR',
    online:'online',openedAt:'2026-11-09T13:05:00.000Z'
  });
  const parsed=new URL(url);
  assert.equal(parsed.pathname,'/ajuda/minha-cartinha');
  assert.equal(parsed.searchParams.get('encontrista'),'Maria Eduarda');
  assert.deepEqual(parsed.searchParams.getAll('id'),[
    'EJC-123456789ABC','EJC-123456789ABD'
  ]);
  assert.equal(parsed.searchParams.get('utm_source'),'mural');
  assert.equal(parsed.searchParams.get('utm_medium'),'link');
  assert.equal(parsed.searchParams.get('utm_campaign'),'suporte_encontrista');
  assert.equal(parsed.searchParams.get('tela'),'390x844');
  assert.equal(parsed.searchParams.get('idioma'),'pt-BR');
  assert.equal(parsed.searchParams.get('navegador'),'Safari iPhone');
  assert.equal(parsed.searchParams.get('etapa'),'cartinha_aberta');
  assert.ok(!url.includes('token'));
  assert.ok(!parsed.hash);
});

test('recovered-letter WhatsApp notification also includes a traceable recipient help URL',()=>{
  const text=readyLetterWhatsAppMessage({
    recipient_name:'Maria Eduarda',order_id:'EJC-123456789ABC',
    url:'https://ejc.migos.club/mural/maria?utm_campaign=cartinha_recuperada#token=private',
    released:true
  });
  assert.match(text,/https:\/\/ejc\.migos\.club\/ajuda\/minha-cartinha\?/);
  assert.match(text,/utm_campaign=cartinha_recuperada/);
  assert.match(text,/encontrista=Maria/);
  assert.match(text,/id=EJC-123456789ABC/);
});

test('o aviso da cartinha recuperada mostra o status de leitura logo depois do link',()=>{
  const url='https://ejc.migos.club/mural/ana#token=private';
  const opened=readyLetterWhatsAppMessage({
    recipient_name:'Ana',order_id:'EJC-123456789ABC',url,already_opened:true,
  });
  const notOpened=readyLetterWhatsAppMessage({
    recipient_name:'Ana',order_id:'EJC-123456789ABC',url,already_opened:false,
  });
  assert.match(opened.slice(opened.indexOf(url)+url.length),
    /^\n📖 \*Leitura:\* esta cartinha já foi aberta!/);
  assert.match(notOpened.slice(notOpened.indexOf(url)+url.length),
    /^\n💌 \*Leitura:\* esta cartinha ainda não foi aberta/);
});
