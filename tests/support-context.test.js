import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanSupportContext,encryptSupportContext,decryptSupportContext
} from '../src/supportContext.js';

const secret='strong-secret-at-least-32-chars-safely-configured-for-tests';
const input={
  purpose:'send',name:'Maria Eduarda',phone:'(33) 99954-6031',
  ids:['EJC-123456789ABC'],recipientSlugs:['joao-pedro'],
  checkoutId:'EJCB-ABCDEF123456',
  source:'whatsapp',medium:'mensagem',
  campaign:'recuperacao_cartinha',content:'rascunho_pago',
  stage:'retomar_edicao'
};

test('AES-256-GCM protects name, phone, IDs and UTM campaign with random IV',async()=>{
  const one=await encryptSupportContext(secret,input);
  const two=await encryptSupportContext(secret,input);
  assert.notEqual(one,two,'random IV prevents repeating encrypted ciphertext');
  assert.match(one,/^ec1_[A-Za-z0-9_-]+$/);
  for(const plaintext of ['Maria','5533999546031','123456789ABC',
    'recuperacao_cartinha','joao-pedro']){
    assert.ok(!one.includes(plaintext),'token cannot reveal '+plaintext);
  }
  const restored=await decryptSupportContext(secret,one);
  assert.equal(restored.name,'Maria Eduarda');
  assert.equal(restored.phone,'5533999546031');
  assert.deepEqual(restored.ids,['EJC-123456789ABC']);
  assert.deepEqual(restored.recipientSlugs,['joao-pedro']);
  assert.equal(restored.checkoutId,'EJCB-ABCDEF123456');
  assert.equal(restored.campaign,'recuperacao_cartinha');
  assert.equal(restored.stage,'retomar_edicao');
});

test('rejects tampered tokens, different secrets and expired tokens',async()=>{
  const token=await encryptSupportContext(secret,input);
  const changed=token.slice(0,-1)+(token.endsWith('A')?'B':'A');
  await assert.rejects(()=>decryptSupportContext(secret,changed),/inválido|adulterado/);
  await assert.rejects(()=>decryptSupportContext('a different 50-character-secret-configured-for-tests',token),
    /inválido|adulterado/);
  const before=Date.now()-15*24*3600*1000;
  const expired=await encryptSupportContext(secret,input,before);
  await assert.rejects(()=>decryptSupportContext(secret,expired),/expirado/);
});

test('strict validation omits invalid IDs, URL injection and invalid phones',()=>{
  const cleaned=cleanSupportContext({
    purpose:'send',name:'Ana\n\n<script>',
    phone:'1',ids:['EJC-123456789ABC','/pedido/secret'],
    recipientSlugs:['maria','../cartinhas'],
    campaign:'campanha & segredo'
  });
  assert.equal(cleaned.name,'Ana script');
  assert.equal(cleaned.phone,'');
  assert.deepEqual(cleaned.ids,['EJC-123456789ABC']);
  assert.deepEqual(cleaned.recipientSlugs,['maria']);
  assert.equal(cleaned.campaign,'campanhasegredo');
});
