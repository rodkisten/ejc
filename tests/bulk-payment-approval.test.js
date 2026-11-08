import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareManualPixBatch } from '../client/lib/bulkPaymentApproval.js';

const payments = [
  {id:'EJCB-123456789ABC',checkout_id:'EJCB-123456789ABC',
    total_cents:2000,status:'claimed',bank_reference:''},
  {id:'EJC-AABBCCDDEEFF',total_cents:1000,status:'pending',bank_reference:''},
  {id:'EJC-PAIDPAIDPAID',status:'paid',bank_reference:'E2026110812345678901234567890123'},
];

test('aprovação manual em lote valida referência única para cada Pix',()=>{
  const entries=prepareManualPixBatch(payments,
    [payments[0].id,payments[1].id],{
      [payments[0].id]:' e2026110812345678901234567890145 ',
      [payments[1].id]:' E2026110812345678901234567890146 ',
    });
  assert.equal(entries.length,2);
  assert.equal(entries[0].reference,'E2026110812345678901234567890145');
  assert.equal(entries[1].reference,'E2026110812345678901234567890146');
  assert.equal(entries[0].payment.checkout_id,payments[0].checkout_id);
});

test('bloqueia reuso da mesma referência bancária ou de confirmação anterior',()=>{
  const first='E2026110812345678901234567890145';
  assert.throws(()=>prepareManualPixBatch(payments,
    [payments[0].id,payments[1].id],{
      [payments[0].id]:first,[payments[1].id]:first,
    }),/duplicada/);
  assert.throws(()=>prepareManualPixBatch(payments,[payments[0].id],{
    [payments[0].id]:payments[2].bank_reference,
  }),/duplicada/);
});

test('não aprova itens inexistentes, pagos ou referências inválidas',()=>{
  assert.throws(()=>prepareManualPixBatch(payments,[],{}),/Selecione/);
  assert.throws(()=>prepareManualPixBatch(payments,['EJC-NAO-EXISTE'],{}),/não está mais aguardando/);
  assert.throws(()=>prepareManualPixBatch(payments,[payments[2].id],
    {[payments[2].id]:'E2026110812345678901234567890145'}),/não está mais aguardando/);
  assert.throws(()=>prepareManualPixBatch(payments,[payments[0].id],
    {[payments[0].id]:'ref'}),/referência bancária completa/);
  assert.throws(()=>prepareManualPixBatch(payments,[payments[0].id],
    {[payments[0].id]:'ABC12345678?'}),/referência bancária completa/);
});

test('a seleção deduplica ids repetidos para não liberar duas vezes',()=>{
  const entries=prepareManualPixBatch(payments,[payments[0].id,payments[0].id],
    {[payments[0].id]:'E2026110812345678901234567890145'});
  assert.equal(entries.length,1);
});
