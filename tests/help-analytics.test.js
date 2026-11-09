import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAnalyticsLocation } from '../client/lib/api.js';
import { completedLetterHelpLink,readyLetterWhatsAppMessage } from '../client/lib/helpLink.js';

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
