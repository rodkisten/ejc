import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0002_homenagens.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0003_recipient_photos.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0004_mural_codes.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0005_og_images.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0006_private_letters.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0007_letter_compositions.sql',import.meta.url),'utf8'));

  const DB={
    prepare(query){const stmt=(...values)=>({first:async()=>sql.prepare(query).get(...values)||null,all:async()=>({results:sql.prepare(query).all(...values)}),run:async()=>({meta:sql.prepare(query).run(...values)})});return {...stmt(),bind:stmt};},
    async batch(queries){sql.exec('BEGIN');try{const results=[];for(const q of queries)results.push(await q.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}
  };
  const objects=new Map(),uploads=new Map();
  const MEDIA={
    async createMultipartUpload(key){const id=crypto.randomUUID();uploads.set(id,{key,parts:new Map()});return {uploadId:id};},
    resumeMultipartUpload(key,id){const u=uploads.get(id);if(!u||u.key!==key)throw Error('upload não existe');return {
      async uploadPart(n,p){u.parts.set(n,new Uint8Array(p));return {etag:`etag-${n}`};},
      async complete(rows){const data=new Uint8Array(rows.reduce((n,p)=>n+u.parts.get(p.partNumber).byteLength,0));let pos=0;for(const p of rows){const chunk=u.parts.get(p.partNumber);data.set(chunk,pos);pos+=chunk.byteLength;}objects.set(key,data);uploads.delete(id);return {size:data.byteLength};},
      async abort(){uploads.delete(id);}
    };},
    async put(key,value){objects.set(key,new Uint8Array(value));},
    async head(key){const data=objects.get(key);return data?{size:data.byteLength}:null;},
    async delete(key){objects.delete(key);},
    async get(key){const bytes=objects.get(key);return bytes?{size:bytes.byteLength,body:new Blob([bytes]).stream()}:null;}
  };
  return {DB,MEDIA,SESSION_SECRET:'abcd'.repeat(24),ADMIN_PASSWORD:'senha-forte-de-teste-com-14-caracteres',ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}};
}
async function call(env,path,method='GET',data,options={}){
  const url='https://ejc.test'+path;
  const headers={...(method!=='GET'?{Origin:'https://ejc.test'}:{}),...(options.cookie?{Cookie:options.cookie}:{}),...(options.token?{Authorization:`Bearer ${options.token}`}:{})};
  let body;
  if(options.raw){body=data;headers['Content-Type']='application/octet-stream';}
  else if(data!==undefined){body=JSON.stringify(data);headers['Content-Type']='application/json';}
  const response=await worker.fetch(new Request(url,{method,headers,body}),env);
  return {status:response.status, data:await response.json(), headers:response.headers};
}
async function setup(env){
  const login=await call(env,'/api/admin/login','POST',{password:env.ADMIN_PASSWORD});
  assert.equal(login.status,200);
  const admin={cookie:login.headers.get('Set-Cookie').split(';')[0]};
  assert.equal((await call(env,'/api/admin/settings','PUT',{pix_key:'teste@pix.com.br',pix_name:'COORDENACAO XX EJC',pix_city:'SIMONESIA',deadline:'2030-11-08T18:00',release_at:'2030-11-08T18:00',message_price_cents:1000,open:true},admin)).status,200);
  const imported=await call(env,'/api/admin/recipients/import','POST',{names:['Ana Clara','João Pedro']},admin);
  assert.equal(imported.data.inserted,2);
  const list=(await call(env,'/api/public')).data.recipients;
  return {admin,list};
}
test('cartinhas são privadas: a coordenação confirma Pix sem ler, ouvir nem moderar',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  const created=await call(env,'/api/orders','POST',{recipient_slug:person.slug,sender_name:'Remetente privado'});
  assert.equal(created.status,201);
  const token=created.data.token,id=created.data.id;

  assert.equal((await call(env,'/api/order/message','PUT',{rich_html:'<p>Segredo</p>'},{token})).status,403);
  assert.equal((await call(env,'/api/order/media/init','POST',{kind:'audio',filename:'privado.wav',content_type:'audio/wav'},{token})).status,403);
  assert.equal((await call(env,'/api/order/claim','POST',{}, {token})).status,200);
  const paid=await call(env,`/api/admin/orders/${id}/status`,'PATCH',
    {status:'paid',bank_reference:'E2EPRIVADO123456789',bank_checked:true,amount_checked:true},admin);
  assert.equal(paid.status,200);

  const rich='<h2>Olá!</h2><p><strong>Mensagem privada.</strong></p><script>alert(1)</script>';
  assert.equal((await call(env,'/api/order/message','PUT',
    {rich_html:rich,public_message:true},{token})).status,200);
  const viewed=(await call(env,'/api/order','GET',undefined,{token})).data;
  assert.equal(viewed.rich_html.includes('Mensagem privada'),true);
  assert.equal(viewed.rich_html.includes('<script>'),false);
  assert.equal('public_message' in viewed,false);
  assert.equal('moderation' in viewed,false);

  const init=await call(env,'/api/order/media/init','POST',
    {kind:'audio',filename:'privado.wav',content_type:'audio/wav'},{token});
  assert.equal(init.status,200);
  assert.equal((await call(env,`/api/order/media/${init.data.id}/part/1`,'PUT',
    new Uint8Array([1,2,3,4]),{token,raw:true})).status,200);
  assert.equal((await call(env,`/api/order/media/${init.data.id}/complete`,'POST',{}, {token})).status,200);
  const submitted=await call(env,'/api/order/submit','POST',{}, {token});
  assert.equal(submitted.status,200);
  assert.equal(submitted.data.submitted,true);

  const detail=await call(env,`/api/admin/orders/${id}`,'GET',undefined,admin);
  assert.equal(detail.status,200);
  for(const key of ['rich_html','media','sender_name','moderation','public_message','moderation_note']){
    assert.equal(key in detail.data,false,'O admin não pode receber '+key);
  }
  assert.ok(!JSON.stringify(detail.data).includes('Mensagem privada'));
  assert.ok(!JSON.stringify(detail.data).includes('privado.wav'));
  const summary=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  assert.equal(summary.data.orders.find(o=>o.id===id).submitted,1);
  assert.ok(!JSON.stringify(summary.data.orders).includes('Mensagem privada'));
  assert.ok(!JSON.stringify(summary.data.orders).includes('Remetente privado'));

  assert.equal((await call(env,`/api/admin/orders/${id}/moderation`,'PATCH',
    {moderation:'approved'},admin)).status,404);
  assert.equal((await call(env,`/api/admin/media/${init.data.id}/file`,'GET',undefined,admin)).status,404);
  assert.equal((await call(env,'/api/publicas')).status,410);
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,admin)).status,403);

  assert.equal((await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin)).status,200);
  const config=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  const muralCode=config.recipients.find(p=>p.id===person.id).mural_code;
  const redeemed=await call(env,'/api/mural/redeem','POST',{code:muralCode});
  assert.equal(redeemed.status,200);
  const muralToken=redeemed.data.grant;
  const before=await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:muralToken});
  assert.equal(before.status,200);
  assert.equal(before.data.cards.length,0);
  assert.equal(before.data.locked,true);

  await call(env,'/api/admin/settings','PUT',{release_at:'2020-11-08T16:00'},admin);
  const released=await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:muralToken});
  assert.equal(released.data.cards.length,1);
  assert.equal(released.data.cards[0].rich_html.includes('Mensagem privada'),true);

  // Edits after sending remain private and no longer need administrative approval.
  await call(env,'/api/order/message','PUT',
    {rich_html:'<p>Nova versão privada</p>',public_message:true},{token});
  const edited=await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:muralToken});
  assert.equal(edited.data.cards.length,1);
  assert.match(edited.data.cards[0].rich_html,/Nova versão privada/);
  assert.equal((await call(env,'/api/publicas')).status,410);

  await call(env,'/api/admin/settings','PUT',{deadline:'2020-11-08T16:00'},admin);
  assert.equal((await call(env,'/api/order/message','PUT',
    {rich_html:'<p>Tarde</p>'},{token})).status,403);
});

test('mural não aceita acesso administrativo nem criação de convites legados',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  assert.equal((await call(env,`/api/mural/${person.slug}`)).status,403);
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,admin)).status,403);
  const legacy=await call(env,`/api/admin/recipients/${person.id}/invite`,'POST',{},admin);
  assert.equal(legacy.status,404);
  const valid=await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  assert.equal(valid.status,200);
  const adminView=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  const code=adminView.recipients.find(p=>p.id===person.id).mural_code;
  const redemption=await call(env,'/api/mural/redeem','POST',{code});
  assert.equal(redemption.status,200);
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:redemption.data.grant})).status,200);
});

test('demo é idempotente e pode ser removida sem remover encontristas reais',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const seeded=await call(env,'/api/admin/demo/seed','POST',{},admin);
  assert.equal(seeded.status,200);
  assert.equal(seeded.data.inserted,5);
  assert.equal((await call(env,'/api/admin/demo/seed','POST',{},admin)).data.inserted,0);
  const all=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  assert.equal(all.orders.filter(x=>x.demo).length,5);
  assert.equal((await call(env,'/api/admin/demo/clear','DELETE',undefined,admin)).data.deleted,5);
  const final=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  assert.equal(final.orders.length,0);
  assert.ok(final.recipients.find(x=>x.name==='Ana Clara'));
});

test('health verifica D1 e R2 sem exigir login',async()=>{
  const env=fixture();
  const check=await call(env,'/api/health');
  assert.equal(check.status,200);
  assert.equal(check.data.ok,true);
});

test('código curto libera o acesso privado, mas não ignora o horário de publicação',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const generation=await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  assert.equal(generation.status,200);
  assert.equal(generation.data.generated,2);
  const bootstrap=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  const person=bootstrap.recipients.find(r=>r.slug===list[0].slug);
  assert.match(person.mural_code,/^[A-HJ-NP-Z2-9]{6}$/);
  const other=bootstrap.recipients.find(r=>r.slug===list[1].slug);
  assert.notEqual(person.mural_code,other.mural_code);
  const publicList=(await call(env,'/api/public')).data.recipients;
  assert.equal('mural_code' in publicList[0],false);
  const redeemed=await call(env,'/api/mural/redeem','POST',{code:person.mural_code});
  assert.equal(redeemed.status,200);
  assert.equal(redeemed.data.slug,person.slug);
  assert.equal((await call(env,'/api/mural/'+person.slug,'GET',undefined,{token:redeemed.data.grant})).status,200);
  assert.equal((await call(env,'/api/mural/'+other.slug,'GET',undefined,{token:redeemed.data.grant})).status,403);
  const replace=await call(env,'/api/admin/recipients/'+person.id+'/mural-code','POST',{},admin);
  assert.equal(replace.status,200);
  assert.notEqual(replace.data.code,person.mural_code);
  assert.equal((await call(env,'/api/mural/'+person.slug,'GET',undefined,{token:redeemed.data.grant})).status,403);
  assert.equal((await call(env,'/api/mural/redeem','POST',{code:person.mural_code})).status,404);
});

test('tentativas incorretas de código curto são limitadas no servidor',async()=>{
  const env=fixture();
  for(let i=0;i<100;i++){
    const r=await call(env,'/api/mural/redeem','POST',{code:'ZZZZZZ'});
    assert.equal(r.status,404);
  }
  const blocked=await call(env,'/api/mural/redeem','POST',{code:'AAAAAA'});
  assert.equal(blocked.status,429);
});

test('imagens OG são PNG servidos para robôs sociais e metadados chegam no HTML',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  const png=new Uint8Array(64);
  png.set([137,80,78,71,13,10,26,10],0);
  new DataView(png.buffer).setUint32(16,1200);
  new DataView(png.buffer).setUint32(20,630);
  const request=new Request('https://ejc.test/api/admin/recipients/'+person.id+'/og',{
    method:'POST',
    headers:{
      Origin:'https://ejc.test',
      Cookie:admin.cookie,
      'Content-Type':'image/png'
    },
    body:png
  });
  const upload=await worker.fetch(request,env);
  assert.equal(upload.status,200);
  const image=await worker.fetch(new Request('https://ejc.test/api/og/'+person.slug+'.png'),env);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('Content-Type'),'image/png');
  env.ASSETS.fetch=async()=>new Response(
    '<!doctype html><html><head><title>Cartinhas</title><meta name="description" content="geral"/></head><body></body></html>',
    {headers:{'Content-Type':'text/html'}}
  );
  const page=await worker.fetch(new Request('https://ejc.test/enviar/'+person.slug),env);
  const html=await page.text();
  assert.equal(page.status,200);
  assert.match(html,/property="og:title"/);
  assert.match(html,/property="og:image"/);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(html,/Ana Clara|João Pedro/);
  assert.ok(!html.includes('content="geral"'));
  const hidden=await worker.fetch(new Request('https://ejc.test/mural/'+person.slug),env);
  assert.match(hidden.headers.get('X-Robots-Tag'),/noindex/);
});
