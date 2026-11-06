import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0002_homenagens.sql',import.meta.url),'utf8'));
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
test('checkout é somente uma cartinha com Pix individual; mídia bloqueada até aprovação bancária',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const recipient=list[0];
  const created=await call(env,'/api/orders','POST',{recipient_slug:recipient.slug,sender_name:'Rod Costa'});
  assert.equal(created.status,201);
  assert.equal(created.data.pix_code.includes('EJC'),true);
  const token=created.data.token;
  assert.equal((await call(env,'/api/order/message','PUT',{rich_html:'<p>Oi</p>'},{token})).status,403);
  assert.equal((await call(env,'/api/order/media/init','POST',{kind:'audio',filename:'oi.wav',content_type:'audio/wav'},{token})).status,403);
  assert.equal((await call(env,'/api/order/claim','POST',{}, {token})).status,200);
  assert.equal((await call(env,`/api/admin/orders/${created.data.id}/status`,'PATCH',{status:'paid',bank_reference:'E2EEXEMPLO12345678',bank_checked:true,amount_checked:true},admin)).status,200);
  const rich='<h2>Olá!</h2><p><strong>Estamos juntos.</strong></p><script>alert(1)</script>';
  assert.equal((await call(env,'/api/order/message','PUT',{rich_html:rich,public_message:false},{token})).status,200);
  const viewed=(await call(env,'/api/order','GET',undefined,{token})).data;
  assert.equal(viewed.rich_html.includes('<script>'),false);
  assert.equal(viewed.public_message,false);
  const init=await call(env,'/api/order/media/init','POST',{kind:'audio',filename:'oi.wav',content_type:'audio/wav'},{token});
  assert.equal(init.status,200);
  assert.equal((await call(env,`/api/order/media/${init.data.id}/part/1`,'PUT',new Uint8Array([1,2,3,4]),{token,raw:true})).status,200);
  assert.equal((await call(env,`/api/order/media/${init.data.id}/complete`,'POST',{}, {token})).status,200);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token})).data.moderation,'pending');
  const detail=await call(env,`/api/admin/orders/${created.data.id}`,'GET',undefined,admin);
  assert.equal(detail.data.media.length,1);
  assert.equal(detail.data.moderation,'pending');
  const invite=await call(env,`/api/admin/recipients/${recipient.id}/invite`,'POST',{},admin);
  const privateToken=invite.data.url.split('#token=')[1];
  assert.equal((await call(env,`/api/mural/${recipient.slug}`,'GET',undefined,{token:privateToken})).data.cards.length,0);
  assert.equal((await call(env,`/api/admin/orders/${created.data.id}/moderation`,'PATCH',{moderation:'approved',release_now:true},admin)).status,200);
  assert.equal((await call(env,`/api/mural/${recipient.slug}`,'GET',undefined,{token:privateToken})).data.cards.length,1);
  assert.equal((await call(env,'/api/publicas')).data.cards.length,0);
  // Editing an approved letter invalidates approval, public stays opt-in.
  await call(env,'/api/order/message','PUT',{rich_html:'<p>Outra mensagem</p>',public_message:true},{token});
  assert.equal((await call(env,`/api/mural/${recipient.slug}`,'GET',undefined,{token:privateToken})).data.cards.length,0);
  await call(env,'/api/order/submit','POST',{}, {token});
  await call(env,`/api/admin/orders/${created.data.id}/moderation`,'PATCH',{moderation:'approved',release_now:true},admin);
  assert.equal((await call(env,'/api/publicas')).data.cards.length,1);
  // Closing the writing window is enforced on the server.
  await call(env,'/api/admin/settings','PUT',{deadline:'2020-11-08T16:00'},admin);
  assert.equal((await call(env,'/api/order/message','PUT',{rich_html:'<p>tarde</p>'},{token})).status,403);
});
test('convites de mural são individuais, revogáveis e não bastam slugs públicos',async()=>{
  const env=fixture(),{admin,list}=await setup(env),person=list[0];
  assert.equal((await call(env,`/api/mural/${person.slug}`)).status,401);
  const first=await call(env,`/api/admin/recipients/${person.id}/invite`,'POST',{},admin);
  const token1=first.data.url.split('#token=')[1];
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:token1})).status,200);
  const second=await call(env,`/api/admin/recipients/${person.id}/invite`,'POST',{},admin);
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:token1})).status,403);
  const token2=second.data.url.split('#token=')[1];
  assert.equal((await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:token2})).status,200);
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
