import test from 'node:test';
import assert from 'node:assert/strict';
import { muralTokenFromUrl, normalizeMuralUrl } from '../client/lib/muralAccess.js';

const origin='https://ejc.migos.club';
const grant='m2.'+'A'.repeat(100)+'.'+'B'.repeat(43);
const context='ec1_'+'C'.repeat(90);
const full=origin+'/mural/ana-julia-oliveira?c='+context+'#token='+grant;

test('original mural invitation keeps working as a long link with ?c and #token',()=>{
  assert.equal(muralTokenFromUrl(full),grant);
  assert.equal(normalizeMuralUrl(full),full);
  assert.equal(muralTokenFromUrl(origin+'/mural/ana-julia-oliveira?c='+context),'',
    'encrypted support context alone cannot read private mural letters');
});
test('mural access survives WhatsApp escaping the hash inside the old query',()=>{
  const escaped=origin+'/mural/ana-julia-oliveira?c='+
    encodeURIComponent(context+'#token='+grant);
  assert.equal(muralTokenFromUrl(escaped),grant);
  assert.equal(normalizeMuralUrl(escaped),full);
});
test('legacy query token is moved to the fragment to avoid leaking on future requests',()=>{
  const pasted=origin+'/mural/ana-julia-oliveira?token='+encodeURIComponent(grant)+
    '&utm_source=whatsapp';
  const cleaned=normalizeMuralUrl(pasted);
  assert.equal(muralTokenFromUrl(cleaned),grant);
  assert.equal(new URL(cleaned).searchParams.has('token'),false);
  assert.equal(new URL(cleaned).searchParams.get('utm_source'),'whatsapp');
  assert.equal(new URL(cleaned).hash,'#token='+grant);
});
test('encoded fragment and short-link destinations both recover original mural grants',()=>{
  assert.equal(muralTokenFromUrl(origin+'/mural/ana-julia-oliveira#token%3D'+grant),grant);
  assert.equal(muralTokenFromUrl(origin+'/s/AbCdEfGhIjKlMn#token='+grant),grant);
  assert.equal(muralTokenFromUrl(origin+'/mural/ana-julia-oliveira#token=not-signed'),'');
});
