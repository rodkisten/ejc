import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentLookup, likeTerm, maskedStatus } from '../src/paymentSearch.js';

test('consulta identifica código mostrado no Pix e TXID no BR Code inteiro', () => {
  assert.equal(normalizePaymentLookup('EJCB-ABCDEF123456'), 'EJCBABCDEF123456');
  assert.equal(normalizePaymentLookup('EJCBABCDEF123456'), 'EJCBABCDEF123456');
  assert.equal(normalizePaymentLookup('EJCB-ABCD'), 'EJCBABCD');
  assert.equal(normalizePaymentLookup('000201...62EJCBABCDEF1234566304FFFF'),
    'EJCBABCDEF123456');
  assert.equal(normalizePaymentLookup('EJC-112233AABBCC'), 'EJC112233AABBCC');
});
test('filtros usam parâmetros SQL e escapam wildcard literais', () => {
  assert.equal(likeTerm('Ana%_'), '%Ana\\%\\_%');
  assert.equal(maskedStatus('paid'), 'paid');
  assert.equal(maskedStatus('qualquer'), '');
});
