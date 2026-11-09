import test from 'node:test';
import assert from 'node:assert/strict';
import { supportContactAdminUrl, supportContactParams } from '../client/lib/supportContactUrl.js';

const opaque='ec1_'+('A'.repeat(70));

test('only opaque authenticated context is present in admin URLs',()=>{
  const href=supportContactAdminUrl({
    opaque,name:'Mariana Pimentel',phone:'33999546031',
    orders:['EJC-123456789ABC'],recipients:['maria-eduarda']
  });
  assert.equal(href,'/admin/mensagens?c='+opaque);
  const parsed=supportContactParams(new URL(href,'https://ejc.migos.club').search);
  assert.deepEqual(parsed,{opaque});
  for(const secret of ['Mariana','33999546031','EJC-123456789ABC','maria-eduarda'])
    assert.equal(href.includes(secret),false);
});

test('invalid/legacy cleartext parameters are deliberately ignored',()=>{
  const unsafe='?nome=Mariana&telefone=33999546031&id=EJC-123456789ABC'+
    '&utm_campaign=recuperacao_cartinhas&c=bad';
  assert.deepEqual(supportContactParams(unsafe),{opaque:''});
  assert.equal(supportContactAdminUrl({name:'Mariana',phone:'33999546031'}),'/admin/mensagens');
});

test('refuses arbitrary strings as encrypted context',()=>{
  assert.deepEqual(supportContactParams('?c=ec1_X'),{opaque:''});
  assert.deepEqual(supportContactParams('?c=../../pedido/privado'),{opaque:''});
});
