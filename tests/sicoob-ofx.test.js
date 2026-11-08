import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSicoobOfx, candidatesForCredit, ofxBankReference } from '../client/lib/sicoobOfx.js';

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
