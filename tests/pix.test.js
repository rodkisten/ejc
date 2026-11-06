import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePix } from '../src/pix.js';
test('BR Code static Pix includes TXID amount and valid CRC', () => {
  const result = generatePix({
    key: 'chave@example.com',
    merchantName: 'MINI MERCADO EJC',
    merchantCity: 'SIMONESIA',
    amountCents: 1250,
    txid: 'EJC12345678',
  });
  assert.match(result, /540512\.50/);
  assert.match(result, /62150511EJC12345678/);
  assert.match(result, /6304[A-F0-9]{4}$/);
  assert.match(result, /br\.gov\.bcb\.pix/);
});
test('invalid amounts and txid refused', () => {
  assert.throws(() =>
    generatePix({ key: 'a', merchantName: 'ABC', merchantCity: 'ABC', amountCents: -100, txid: 'ABC' }),
  );
  assert.throws(() =>
    generatePix({ key: 'a', merchantName: 'ABC', merchantCity: 'ABC', amountCents: 100, txid: 'bad-id!' }),
  );
});
