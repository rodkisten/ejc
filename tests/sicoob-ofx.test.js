import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSicoobOfx, candidatesForCredit, exactPixBatchCandidates, ofxBankReference } from '../client/lib/sicoobOfx.js';

const statement = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>12345</ACCTID></BANKACCTFROM>',
  '<BANKTRANLIST>',
  '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261107100000[-3:BRT]<TRNAMT>20.00<FITID>PIX123',
  '<NAME>PIX RECEBIDO<MEMO>Cartinhas EJCBABCDEF123456</STMTTRN>',
  '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-5.00<FITID>DEBIT1',
  '<NAME>COMPRA</STMTTRN>',
  '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261107<TRNAMT>10.00<FITID>PIX124',
  '<MEMO>PIX RECEBIDO</STMTTRN>',
  '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
].join('\n');

test('lê OFX SGML do Sicoob, apenas créditos, preservando TXID e FITID', () => {
  const out = parseSicoobOfx(statement);
  assert.equal(out.accountId, '12345');
  assert.equal(out.transactions.length, 2);
  assert.equal(out.transactions[0].amountCents, 2000);
  assert.equal(out.transactions[0].date, '2026-11-07');
  assert.equal(out.transactions[0].fitId, 'PIX123');
  assert.equal(out.transactions[0].txid, 'EJCBABCDEF123456');
  assert.equal(out.transactions[1].amountCents, 1000);
  assert.equal(out.transactions[1].txid, '');
});

test('TXID e valor exatos sugerem pedido, mas apenas valor não confirma nada', () => {
  const credits = parseSicoobOfx(statement).transactions;
  const payments = [
    { id: 'EJCB-ABCDEF123456', txid: 'EJCBABCDEF123456', total_cents: 2000, status: 'pending' },
    { id: 'EJC-111111111111', txid: 'EJC111111111111', total_cents: 1000, status: 'claimed' },
    { id: 'EJC-222222222222', txid: 'EJC222222222222', total_cents: 1000, status: 'pending' },
  ];
  const identified = candidatesForCredit(credits[0], payments);
  assert.equal(identified.reason, 'txid');
  assert.equal(identified.suggestedId, 'EJCB-ABCDEF123456');
  const ambiguous = candidatesForCredit(credits[1], payments);
  assert.equal(ambiguous.reason, 'amount');
  assert.equal(ambiguous.matches.length, 2);
  assert.equal(ambiguous.suggestedId, '');
  const wrong = candidatesForCredit({ ...credits[0], amountCents: 3000 }, payments);
  assert.equal(wrong.reason, 'divergent');
});

test('referência de importação é estável sem fingir ser EndToEndId', async () => {
  const credit = parseSicoobOfx(statement).transactions[0];
  const first = await ofxBankReference(credit, '12345');
  const second = await ofxBankReference(credit, '12345');
  assert.equal(first, second);
  assert.match(first, /^OFX[A-F0-9]{40}$/);
  assert.notEqual(first, await ofxBankReference(credit, 'outra-conta'));
  assert.equal(await ofxBankReference({ ...credit, fitId: '', e2eid: '' }, '12345'), '');
});

test('OFX inválido não é tratado como comprovante', () => {
  assert.throws(() => parseSicoobOfx('texto sem ofx'), /OFX/);
  assert.throws(() => parseSicoobOfx('<OFX></OFX>'), /movimentação/);
});

test('OFX XML também é aceito', () => {
  const xml = '<?xml version="1.0"?><OFX><STMTTRN>' +
    '<DTPOSTED>20261108</DTPOSTED><TRNAMT>12.50</TRNAMT><FITID>AB3</FITID>' +
    '<MEMO>PIX RECEBIDO</MEMO></STMTTRN></OFX>';
  assert.equal(parseSicoobOfx(xml).transactions[0].amountCents, 1250);
});


test('aprovação em massa sugere somente TXID exclusivo e valor idêntico', () => {
  const { transactions, accountId } = parseSicoobOfx(statement);
  const payments = [
    { id: 'EJCB-ABCDEF123456', type: 'checkout',
      txid: 'EJCBABCDEF123456', total_cents: 2000, status: 'claimed' },
    { id: 'EJC-111111111111', type: 'order',
      txid: 'EJC111111111111', total_cents: 1000, status: 'pending' },
  ];
  assert.equal(exactPixBatchCandidates({ transactions, accountId }, payments).length, 1);
  assert.equal(exactPixBatchCandidates({ transactions, accountId }, payments)[0].payment.id,
    'EJCB-ABCDEF123456');
  // The second entry has only a matching amount and must stay for manual review.
  assert.ok(!exactPixBatchCandidates({ transactions, accountId }, payments)
    .some(({ payment }) => payment.id === 'EJC-111111111111'));
});

test('batch excludes duplicates, completed payments, mismatched totals and missing trace IDs', () => {
  const accountId = 'sicoob-12345';
  const base = {
    id: 'credit-1', date: '2026-11-08', isPix: true,
    txid: 'EJCABCDEF123456', amountCents: 1000, fitId: 'PIX42', e2eid: '',
  };
  const payment = {
    id: 'EJC-ABCDEF123456', type: 'order',
    txid: 'EJCABCDEF123456', total_cents: 1000, status: 'claimed',
  };
  const stmt=(entries)=>({ accountId, transactions: entries });
  const plan=(entries, payments=[payment])=>exactPixBatchCandidates(stmt(entries),payments);
  assert.equal(plan([base]).length,1);
  assert.equal(plan([{ ...base, isPix:false }]).length,0);
  assert.equal(plan([{ ...base, fitId:'' }]).length,0);
  assert.equal(plan([{ ...base, amountCents:2000 }]).length,0);
  assert.equal(plan([base],[{...payment,status:'paid'}]).length,0);
  assert.equal(plan([base], [payment, { ...payment, id:'EJC-OTHER' }]).length,0);
  assert.equal(plan([base,{...base,id:'credit-2',fitId:'PIX43'}]).length,0);
  assert.equal(plan([base,{...base,id:'credit-2'}]).length,0);
  assert.equal(plan([{...base,e2eid:'E2026110812345678901234567890123'}],
    [{...payment,bank_reference:'E2026110812345678901234567890123'}]).length,0);
  assert.equal(plan([{...base,e2eid:'E2026110812345678901234567890123'}],
    [{...payment},{id:'PAID',status:'paid',bank_reference:'E2026110812345678901234567890123'}]).length,0);
});

test('batch only accepts traceable Pix for a unique checkout or individual order', () => {
  const accountId='123';
  const payments=[
    {id:'EJCB-111111111111',type:'checkout',txid:'EJCB111111111111',
      total_cents:2000,status:'claimed'},
    {id:'EJC-222222222222',type:'order',txid:'EJC222222222222',
      total_cents:1000,status:'pending'},
  ];
  const transactions=[
    {id:'a',date:'2026-11-08',isPix:true,txid:'EJCB111111111111',fitId:'I1',
      amountCents:2000,e2eid:''},
    {id:'b',date:'2026-11-08',isPix:true,txid:'EJC222222222222',fitId:'I2',
      amountCents:1000,e2eid:''}
  ];
  assert.deepEqual(exactPixBatchCandidates({accountId,transactions},payments)
    .map(({payment})=>payment.id),payments.map((p)=>p.id));
});
