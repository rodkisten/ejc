import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function makeEnv() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  const DB={
    prepare(sql){return {bind(...values){return {sql,values,
      first:async()=>sqlite.prepare(sql).get(...values)||null,
      all:async()=>({results:sqlite.prepare(sql).all(...values)}),
      run:async()=>({meta:sqlite.prepare(sql).run(...values)})};},
      first:async()=>sqlite.prepare(sql).get()||null,
      all:async()=>({results:sqlite.prepare(sql).all()}),
      run:async()=>({meta:sqlite.prepare(sql).run()})};},
    async batch(items){
      sqlite.exec('BEGIN');
      try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec('COMMIT');return results;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    }
  };
  const store=new Map(), uploads=new Map();
  const MEDIA={
    async createMultipartUpload(key){
      const uploadId=crypto.randomUUID();uploads.set(uploadId,{key,parts:new Map()});
      return {uploadId};
    },
    resumeMultipartUpload(key,uploadId){
      const upload=uploads.get(uploadId);
      if(!upload || upload.key!==key)throw Error('unknown multipart');
      return {
        async uploadPart(number,body){upload.parts.set(number,new Uint8Array(body));return {partNumber:number,etag:`etag-${number}`};},
        async complete(parts){
          const bytes=new Uint8Array(parts.reduce((n,p)=>n+upload.parts.get(p.partNumber).length,0));let cursor=0;
          for(const part of parts){const data=upload.parts.get(part.partNumber);bytes.set(data,cursor);cursor+=data.length;}
          store.set(key,bytes);uploads.delete(uploadId);return {size:bytes.length,key};
        },
        async abort(){uploads.delete(uploadId);}
      };
    },
    async head(key){const body=store.get(key);return body?{size:body.length,key}:null;},
    async delete(key){store.delete(key);},
    async get(key){const bytes=store.get(key);if(!bytes)return null;
      return {size:bytes.length,body:new Blob([bytes]).stream()};
    }
  };
  return {DB,MEDIA,SESSION_SECRET:'abcd'.repeat(24),ADMIN_PASSWORD:'senha-segura-com-mais-de-catorze-caracteres',
    ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})}};
}
async function request(env,path,method='GET',data,options={}) {
  const url='https://ejc.test'+path;
  const headers={...(method!=='GET'?{Origin:'https://ejc.test'}:{}),...(options.cookie?{Cookie:options.cookie}:{}),...(options.token?{Authorization:`Bearer ${options.token}`}:{})};
  let body;
  if (options.raw) {body=data;headers['Content-Type']='application/octet-stream';}
  else if (data!==undefined){body=JSON.stringify(data);headers['Content-Type']='application/json';}
  const result=await worker.fetch(new Request(url,{method,headers,body}),env);
  let response;
  if (options.stream) response=await result.text();
  else response=await result.json();
  return {status:result.status,data:response,headers:result.headers};
}

test('MVP: checkout Pix → aprovação manual → arquivo → bloqueio na data limite',async()=>{
  const env=makeEnv();
  const login=await request(env,'/api/admin/login','POST',{password:env.ADMIN_PASSWORD});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0], auth={cookie};
  const settings=await request(env,'/api/admin/settings','PUT',{
    pix_key:'pix@example.com',pix_name:'MINI MERCADO EJC',pix_city:'SIMONESIA',deadline:'2026-11-08T16:00',open:true
  },auth);
  assert.equal(settings.status,200);
  const imported=await request(env,'/api/admin/recipients/import','POST',{names:['Maria Eduarda','João Pedro']},auth);
  assert.equal(imported.data.inserted,2);
  assert.equal((await request(env,'/api/admin/recipients/import','POST',{names:['Maria Eduarda']},auth)).data.inserted,0);
  assert.equal((await request(env,'/api/admin/products','POST',{name:'Chocolate',price_cents:800,emoji:'🍫',description:'Presente'},auth)).status,200);
  const home=(await request(env,'/api/public')).data;
  const recipientId=home.recipients[0].id, productId=home.products[0].id;
  const checkout=await request(env,'/api/orders','POST',{recipient_id:recipientId,sender_name:'Pessoa do bairro',items:[{product_id:productId,quantity:2}]});
  assert.equal(checkout.status,201);
  assert.match(checkout.data.pix_code,/540516\.00/); // amount R$ 16.00
  const {token,id}=checkout.data;
  let order=await request(env,'/api/order','GET',undefined,{token});
  assert.equal(order.data.status,'pending');
  assert.equal(order.data.amount_cents,1600);
  assert.equal((await request(env,'/api/order/message','PUT',{message:'Teste antes do pagamento'},{token})).status,403);
  assert.equal((await request(env,'/api/order/media/init','POST',{kind:'image',filename:'a.png',content_type:'image/png'},{token})).status,403);
  assert.equal((await request(env,'/api/order/claim','POST',{}, {token})).data.status,'claimed');
  assert.equal((await request(env,'/api/order/message','PUT',{message:'Ainda não'},{token})).status,403);
  // Admin MUST validate two explicit checks and a reference bank ID before approving.
  assert.equal((await request(env,`/api/admin/orders/${id}/status`,'PATCH',{
    status:'paid',bank_reference:'E123456789',bank_checked:false,amount_checked:true
  },auth)).status,400);
  assert.equal((await request(env,`/api/admin/orders/${id}/status`,'PATCH',{
    status:'paid',bank_reference:'E123456789',bank_checked:true,amount_checked:true
  },auth)).data.status,'paid');
  // A second order must not reuse the same bank transfer reference.
  const second=await request(env,'/api/orders','POST',{recipient_id:recipientId,items:[{product_id:productId,quantity:1}]});
  assert.equal(second.status,201);
  assert.equal((await request(env,`/api/admin/orders/${second.data.id}/status`,'PATCH',{
    status:'paid',bank_reference:'e123456789',bank_checked:true,amount_checked:true
  },auth)).status,409); // case-insensitive normalization + unique reference
  assert.equal((await request(env,'/api/order/message','PUT',{message:'Que encontro especial!'}, {token})).status,200);
  const media=await request(env,'/api/order/media/init','POST',{kind:'image',filename:'foto.png',content_type:'image/png'},{token});
  assert.equal(media.status,200);
  const small=new Uint8Array([137,80,78,71,13,10,26,10]);
  const part=await request(env,`/api/order/media/${media.data.id}/part/1`,'PUT',small,{token,raw:true});
  assert.equal(part.status,200);
  assert.equal((await request(env,`/api/order/media/${media.data.id}/complete`,'POST',{}, {token})).status,200);
  order=await request(env,'/api/order','GET',undefined,{token});
  assert.equal(order.data.message,'Que encontro especial!');
  assert.equal(order.data.media.length,1);
  assert.match(order.data.media[0].url,/^\/api\/media\//);
  // The media URL is signed and tied to this specific uploaded object.
  assert.equal((await request(env,order.data.media[0].url,'GET',undefined,{stream:true})).status,200);
  assert.equal((await request(env,`/api/media/${media.data.id}`,'GET')).status,403);
  const ended='2026-11-06T00:01';
  assert.equal((await request(env,'/api/admin/settings','PUT',{deadline:ended},auth)).status,200);
  assert.equal((await request(env,'/api/order/message','PUT',{message:'Tarde demais'},{token})).status,403);
  assert.equal((await request(env,'/api/order/media/init','POST',{kind:'image',filename:'new.png',content_type:'image/png'},{token})).status,403);
  assert.equal((await request(env,'/api/order','GET',undefined,{token})).data.message,'Que encontro especial!');
  const unrelated=await request(env,'/api/orders','POST',{recipient_id:recipientId,items:[{product_id:productId,quantity:1}]});
  assert.equal(unrelated.status,403); // cannot create a new order after deadline
});