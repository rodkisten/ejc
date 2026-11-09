import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutUnfinished, localPrivateOrders, rememberPrivateOrder } from '../client/lib/unfinishedLetters.js';

const token = 'A'.repeat(43);
const otherToken = 'B'.repeat(43);

test('apenas cartinhas não enviadas retornam do checkout com estado real do Pix', () => {
  const checkout = {
    status:'paid', created_at:'2026-11-09T10:00:00Z',
    items:[
      {id:'EJC-000000000001',token,sender_name:'Ana',recipient_slug:'maria',
        recipient_name:'Maria',status:'paid',submitted:false},
      {id:'EJC-000000000002',token:otherToken,recipient_slug:'joao',
        recipient_name:'João',status:'paid',submitted:true},
      {id:'EJC-000000000003',token:'invalid',recipient_slug:'julia',
        recipient_name:'Júlia',status:'paid',submitted:false},
    ],
  };
  const drafts=checkoutUnfinished(checkout);
  assert.equal(drafts.length,1);
  assert.equal(drafts[0].id,'EJC-000000000001');
  assert.equal(drafts[0].kind,'paid');
  assert.equal(drafts[0].url,'/pedido/'+token);
});

test('não anuncia pagamento quando o servidor ainda indica pending/claimed', () => {
  const checkout={
    status:'claimed',items:[{id:'EJC-000000000003',token,recipient_slug:'ana',
      recipient_name:'Ana',submitted:false,status:'claimed'}],
  };
  const drafts=checkoutUnfinished(checkout);
  assert.equal(drafts.length,1);
  assert.equal(drafts[0].kind,'pending');
  assert.deepEqual(checkoutUnfinished({
    status:'cancelled',items:[{...checkout.items[0],status:'cancelled'}],
  }),[]);
  assert.deepEqual(checkoutUnfinished({
    status:'paid',items:[{...checkout.items[0],status:'paid',submitted:true}],
  }),[]);
});

test('um link privado aberto pode ser lembrado sem expor conteúdo nem duplicar entradas', () => {
  const entries=new Map();
  const previousWindow=globalThis.window;
  globalThis.window={localStorage:{
    getItem:(key)=>entries.get(key)??null,
    setItem:(key,value)=>entries.set(key,value),
  }};
  try {
    const order={
      id:'EJC-ABCDEF123456',recipient_slug:'ana-clara',
      recipient_name:'Ana Clara',rich_html:'SEGREDO QUE NAO DEVE IR AO STORAGE',
    };
    rememberPrivateOrder(order,token);
    rememberPrivateOrder(order,token);
    assert.equal(localPrivateOrders().length,1);
    assert.equal(localPrivateOrders()[0].token,token);
    assert.ok(!JSON.stringify(localPrivateOrders()).includes('SEGREDO'));
    rememberPrivateOrder({...order,id:'INVALID'},otherToken);
    assert.equal(localPrivateOrders().length,1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});
