import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  createShortLink,resolveShortLink,validateShortDestination
} from '../src/shortLinks.js';

const origin='https://ejc.migos.club';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../migrations/0014_short_links.sql',import.meta.url),'utf8'));
  const DB={
    prepare(sql){
      return {bind(...values){
        const query=sqlite.prepare(sql);
        return {
          run:async()=>({meta:query.run(...values)}),
          first:async()=>query.get(...values)||null,
          all:async()=>({results:query.all(...values)})
        };
      }};
    }
  };
  return {
    sqlite,
    env:{DB,SESSION_SECRET:'private-key-32-bytes-minimum-for-all-tests',PUBLIC_ORIGIN:origin}
  };
}
test('shortens a sensitive full URL into only fourteen opaque characters',async()=>{
  const {env,sqlite}=fixture();
  const target=origin+'/pedido/r1_abcdef0123456789abcdef0123456789abcdef0123456789'+
    '?c=ec1_encryptedAndVeryLongPrivateContext&stage=draft&phone=5533999546031';
  const first=await createShortLink(env,target,{kind:'draft'});
  const second=await createShortLink(env,target,{kind:'draft'});
  assert.match(first.url,/^https:\/\/ejc\.migos\.club\/s\/[A-Za-z0-9_-]{14}$/);
  assert.equal(new URL(first.url).search,'');
  assert.notEqual(first.code,second.code,'every generated short link is unpredictable');
  assert.equal(first.url.length,origin.length+'/s/'.length+14);
  assert.equal((await resolveShortLink(env,first.code)).destination,target);
  const row=sqlite.prepare('SELECT * FROM short_links WHERE code=?').get(first.code);
  assert.equal(row.kind,'draft');
  assert.ok(!row.destination_ciphertext.includes('5533999546031'));
  assert.ok(!row.destination_ciphertext.includes('ec1_'));
  assert.ok(!row.destination_ciphertext.includes('/pedido/'));
});
test('blocks external destinations, loops and bad codes',async()=>{
  const {env}=fixture();
  for(const target of [
    'https://example.org/other','http://ejc.migos.club/mural/user',
    '//evil.example.org/',origin+'/s/ZZZZZZZZZZZZZZ',
    origin+'/api/admin/orders'
  ]){
    await assert.rejects(()=>createShortLink(env,target,{kind:'support'}));
  }
  assert.equal((await resolveShortLink(env,'../../admin')).status,404);
  assert.equal((await resolveShortLink(env,'AAAAAAAAAAAAAA')).status,404);
  assert.throws(()=>validateShortDestination('javascript:alert(1)',origin));
});
test('expired short links return 410 and cannot be decrypted with another key',async()=>{
  const {env,sqlite}=fixture();
  const short=await createShortLink(env,origin+'/ajuda/minha-cartinha?c=ec1_hello',
    {kind:'support',ttlSeconds:60});
  sqlite.prepare('UPDATE short_links SET expires_at=0 WHERE code=?').run(short.code);
  assert.equal((await resolveShortLink(env,short.code)).status,410);
  const newer=await createShortLink(env,origin+'/abrir',{kind:'open'});
  assert.equal((await resolveShortLink({...env,SESSION_SECRET:'a-different-key-that-is-at-least-32-characters'},newer.code)).status,410);
});
