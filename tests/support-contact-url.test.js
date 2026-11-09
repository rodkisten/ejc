import test from 'node:test';
import assert from 'node:assert/strict';
import { supportContactAdminUrl, supportContactParams } from '../client/lib/supportContactUrl.js';
import { normalizeBrazilianWhatsApp } from '../client/lib/recipientWhatsApp.js';

test('link interno preenche nome, telefone, encontristas e IDs da aba de suporte', () => {
  const path=supportContactAdminUrl({
    name:'Mariana Pimentel',phone:'(33) 99954-6031',
    recipients:['maria-eduarda','joao-pedro'],
    orders:['EJC-123456789ABC','EJC-123456789ABD'],
    template:'rascunho_vazio'
  });
  assert.equal(new URL(path,'https://ejc.migos.club').pathname,'/admin/mensagens');
  const params=supportContactParams(new URL(path,'https://ejc.migos.club').search);
  assert.equal(params.name,'Mariana Pimentel');
  assert.equal(params.phone,'5533999546031');
  assert.deepEqual(params.recipients,['maria-eduarda','joao-pedro']);
  assert.deepEqual(params.orders,['EJC-123456789ABC','EJC-123456789ABD']);
  assert.equal(params.template,'rascunho_vazio');
  assert.equal(normalizeBrazilianWhatsApp(params.phone),'5533999546031');
});

test('não inclui tokens privados ou telefones inválidos em links de atendimento', () => {
  const url=supportContactAdminUrl({
    name:'Ana \n Maria <script>',phone:'123',
    recipients:['maria','../pedido/token-privado'],
    orders:['EJC-123456789ABC','token-privado'],
    template:'rascunho_vazio'
  });
  const parsed=new URL(url,'https://ejc.migos.club');
  assert.equal(parsed.searchParams.has('telefone'),false);
  assert.equal(parsed.searchParams.get('nome'),'Ana Maria script');
  assert.deepEqual(parsed.searchParams.getAll('encontrista'),['maria']);
  assert.deepEqual(parsed.searchParams.getAll('id'),['EJC-123456789ABC']);
  assert.ok(!url.includes('token-privado'));
  assert.ok(!url.includes('script%3E'));
});

test('aceita URL direta simples nome e telefone sem estado de navegação', () => {
  const params=supportContactParams('?nome=Joaquim+Silva&telefone=33999546031');
  assert.equal(params.name,'Joaquim Silva');
  assert.equal(params.phone,'5533999546031');
});
