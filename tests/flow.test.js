import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { dispatch } from '../src/notify.js';
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0002_homenagens.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0003_recipient_photos.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0004_mural_codes.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0005_og_images.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0006_private_letters.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0007_letter_compositions.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0008_read_receipts_notifications.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0009_checkout_cart.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0010_private_payer_name.sql',import.meta.url),'utf8'));

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

  // The private single-letter link already edits safely while the Pix is pending.
  assert.equal((await call(env,'/api/order/message','PUT',{rich_html:'<p>Segredo</p>'},{token})).status,200);
  assert.match((await call(env,'/api/order','GET',undefined,{token})).data.rich_html,/Segredo/);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token})).status,403);
  const draftMedia=await call(env,'/api/order/media/init','POST',
    {kind:'audio',filename:'privado-rascunho.wav',content_type:'audio/wav'},{token});
  assert.equal(draftMedia.status,200);
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
  assert.equal('rich_html' in released.data.cards[0],false);
  const actuallyOpened=await call(env,`/api/mural/${person.slug}/cards/${id}`,'GET',undefined,{token:muralToken});
  assert.equal(actuallyOpened.status,200);
  assert.equal(actuallyOpened.data.card.rich_html.includes('Mensagem privada'),true);

  // Edits after sending remain private and no longer need administrative approval.
  await call(env,'/api/order/message','PUT',
    {rich_html:'<p>Nova versão privada</p>',public_message:true},{token});
  const edited=await call(env,`/api/mural/${person.slug}`,'GET',undefined,{token:muralToken});
  assert.equal(edited.data.cards.length,1);
  const reopened=await call(env,`/api/mural/${person.slug}/cards/${id}`,'GET',undefined,{token:muralToken});
  assert.match(reopened.data.card.rich_html,/Nova versão privada/);
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

test('metatags OG de WhatsApp aparecem mesmo antes de gerar imagem personalizada',async()=>{
  const env=fixture(),{list}=await setup(env);
  const requested=[];
  env.ASSETS.fetch=async(request)=>{
    requested.push(new URL(request.url).pathname);
    return new Response('<!doctype html><html><head><title>Cartinhas</title></head><body></body></html>',{
      headers:{
        'Content-Type':'text/html',
        'Content-Length':'7',
        'ETag':'"etag-do-html-original"',
        'Content-Encoding':'gzip'
      }
    });
  };
  const page=await worker.fetch(new Request('https://ejc.test/enviar/'+list[0].slug),env);
  const html=await page.text();
  assert.equal(page.status,200);
  assert.deepEqual(requested,['/']); // Don't rely on SPA fallback for WhatsApp bot requests.
  assert.match(html,/property="og:image" content="https:\/\/ejc\.test\/og-ejc-default\.png\?v=/);
  assert.match(html,/property="og:image:width" content="600"/);
  assert.match(html,/property="og:image:height" content="315"/);
  assert.match(html,/property="og:url" content="https:\/\/ejc\.test\/enviar\//);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.equal(page.headers.get('content-length'),null);
  assert.equal(page.headers.get('content-encoding'),null);
  assert.equal(page.headers.get('etag'),null);
  assert.match(page.headers.get('content-type'),/text\/html; charset=utf-8/);
  const home=await worker.fetch(new Request('https://ejc.test/'),env);
  assert.match(await home.text(),/property="og:image"/);
  const mural=await worker.fetch(new Request('https://ejc.test/mural/'+list[0].slug),env);
  assert.match(await mural.text(),/property="og:image"/);
  assert.match(mural.headers.get('X-Robots-Tag'),/noindex/);
});

test('metadados personalizados substituem o fallback estático sem duplicar og:image',async()=>{
  const env=fixture(),{list}=await setup(env);
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  env.ASSETS.fetch=async(req)=>{
    if(new URL(req.url).pathname==='/og-ejc-default.png') {
      const png=fs.readFileSync(new URL('../public/og-ejc-default.png',import.meta.url));
      return new Response(png,{headers:{'Content-Type':'image/png'}});
    }
    return new Response(index,{headers:{'Content-Type':'text/html'}});
  };
  const page=await worker.fetch(new Request('https://ejc.test/enviar/'+list[0].slug+'?og=20261107b'),env);
  const html=await page.text();
  assert.equal(page.status,200);
  assert.equal((html.match(/property="og:image"/g)||[]).length,1);
  assert.equal((html.match(/property="og:title"/g)||[]).length,1);
  assert.ok(!html.includes('EJC-OG-START'));
  assert.match(html,/property="og:image" content="https:\/\/ejc\.test\/og-ejc-default\.png/);
  const image=await worker.fetch(new Request('https://ejc.test/og-ejc-default.png'),env);
  assert.equal(image.status,200);
  assert.match(image.headers.get('content-type'),/image\/png/);
  assert.equal((await image.arrayBuffer()).byteLength,1958);
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
  assert.equal(image.headers.get('cache-control'),'public, max-age=300');
  const imageHead=await worker.fetch(new Request('https://ejc.test/api/og/'+person.slug+'.png',{method:'HEAD'}),env);
  assert.equal(imageHead.status,200);
  assert.equal(imageHead.headers.get('Content-Type'),'image/png');
  assert.equal((await imageHead.text()).length,0);
  env.ASSETS.fetch=async()=>new Response(
    '<!doctype html><html><head><title>Cartinhas</title><meta name="description" content="geral"/></head><body></body></html>',
    {headers:{'Content-Type':'text/html'}}
  );
  const page=await worker.fetch(new Request('https://ejc.test/enviar/'+person.slug),env);
  const html=await page.text();
  assert.equal(page.status,200);
  assert.match(html,/property="og:title"/);
  assert.match(html,/property="og:image"/);
  assert.match(html,/property="og:image" content="https:\/\/ejc\.test\/api\/og\//);
  assert.match(html,/property="og:image:width" content="1200"/);
  assert.match(html,/property="og:image:height" content="630"/);
  assert.match(html,/property="og:image:alt"/);
  assert.match(html,/name="twitter:image"/);
  assert.match(html,/property="og:url" content="https:\/\/ejc\.test\/enviar\/[^"]+\?og=/);
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(html,/Ana Clara|João Pedro/);
  assert.ok(!html.includes('content="geral"'));
  const hidden=await worker.fetch(new Request('https://ejc.test/mural/'+person.slug),env);
  assert.match(hidden.headers.get('X-Robots-Tag'),/noindex/);
});

test('composição visual é privada, normalizada e entregue somente ao destinatário',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/orders','POST',{recipient_slug:list[0].slug,sender_name:'Quem te admira'});
  assert.equal(created.status,201);
  const token=created.data.token;
  await call(env,'/api/order/claim','POST',{}, {token});
  assert.equal((await call(env,`/api/admin/orders/${created.data.id}/status`,'PATCH',
    {status:'paid',bank_reference:'E2EDESIGN123456789',bank_checked:true,amount_checked:true},admin)).status,200);
  const draft={
    theme:'marian',font:'handwritten',authorName:'Com amor de casa',anonymous:false,
    stickers:[{id:'st-1',presetId:'nossa-senhora',x:20,y:65,scale:1,rotate:-6}],
  };
  const saved=await call(env,'/api/order/message','PUT',
    {rich_html:'<p>Uma bênção para você.</p>',composition:draft},{token});
  assert.equal(saved.status,200);
  const buyer=(await call(env,'/api/order','GET',undefined,{token})).data;
  assert.equal(buyer.composition.theme,'marian');
  assert.equal(buyer.composition.stickers.length,1);
  assert.equal(buyer.composition.authorName,'Com amor de casa');
  const detail=(await call(env,`/api/admin/orders/${created.data.id}`,'GET',undefined,admin)).data;
  assert.equal('composition' in detail,false);
  assert.equal('composition_json' in detail,false);
  const bootstrap=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  assert.ok(!JSON.stringify(bootstrap).includes('Com amor de casa'));
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token})).status,200);
  await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  const code=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data
    .recipients.find(p=>p.slug===list[0].slug).mural_code;
  const access=await call(env,'/api/mural/redeem','POST',{code});
  await call(env,'/api/admin/settings','PUT',{release_at:'2020-11-08T16:00'},admin);
  const mural=await call(env,`/api/mural/${list[0].slug}`,'GET',undefined,{token:access.data.grant});
  assert.equal(mural.status,200);
  const openedCard=await call(env,`/api/mural/${list[0].slug}/cards/${created.data.id}`,'GET',undefined,{token:access.data.grant});
  assert.equal(openedCard.data.card.composition.stickers[0].presetId,'nossa-senhora');
  assert.equal(openedCard.data.card.composition.theme,'marian');
});

test('aviso consentido fica criptografado e sai somente na primeira abertura',async()=>{
  const env=fixture();
  env.RESEND_API_KEY='resend-test';
  env.RESEND_FROM='XX EJC <avisos@ejc.migos.club>';
  env.RELAY_URL='https://relay.test/send';
  env.RELAY_TOKEN='relay-secret-test';
  const {admin,list}=await setup(env);
  assert.equal((await call(env,'/api/public')).data.config.read_emails_enabled,true);
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Remetente privado',
    notify_on_read:true,read_receipt_email:'exemplo@dominio.com'
  });
  assert.equal(created.status,201);
  const id=created.data.id,token=created.data.token;
  const stored=await env.DB.prepare('SELECT email_encrypted FROM order_read_receipts WHERE order_id=?').bind(id).first();
  assert.ok(stored.email_encrypted.startsWith('v1.'));
  assert.ok(!stored.email_encrypted.includes('exemplo@'));
  assert.ok(!JSON.stringify((await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data).includes('exemplo@'));
  const job=await env.DB.prepare("SELECT payload FROM notification_outbox WHERE order_id=? AND event='email_verify'").bind(id).first();
  const verification=JSON.parse(job.payload).token;
  const calls=[],oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});
    return Response.json({id:'sent'},{status:200});
  };
  try {
    await dispatch(env);
    assert.ok(calls.some(c=>c.url.includes('api.resend.com/emails')&&c.body.to[0]==='exemplo@dominio.com'));
    assert.equal((await call(env,'/api/receipt/confirm','POST',{token:verification})).status,200);
    assert.equal((await call(env,'/api/receipt/confirm','POST',{token:verification})).status,400);
    await call(env,'/api/order/claim','POST',{}, {token});
    await call(env,'/api/admin/orders/'+id+'/status','PATCH',
      {status:'paid',bank_reference:'E2EREAD12345678',bank_checked:true,amount_checked:true},admin);
    await call(env,'/api/order/message','PUT',{rich_html:'<p>Segredo de uma carta privada!</p>'},{token});
    await call(env,'/api/order/submit','POST',{}, {token});
    await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
    await call(env,'/api/admin/settings','PUT',{release_at:'2020-11-08T16:00'},admin);
    const adminData=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
    const code=adminData.recipients.find(r=>r.slug===list[0].slug).mural_code;
    const grant=(await call(env,'/api/mural/redeem','POST',{code})).data.grant;
    const path='/api/mural/'+list[0].slug;
    const listMural=await call(env,path,'GET',undefined,{token:grant});
    assert.equal(listMural.data.cards.length,1);
    assert.equal('rich_html' in listMural.data.cards[0],false);
    assert.equal((await env.DB.prepare('SELECT first_read_at FROM orders WHERE id=?').bind(id).first()).first_read_at,null);
    const opened=await call(env,path+'/cards/'+id,'GET',undefined,{token:grant});
    assert.match(opened.data.card.rich_html,/Segredo de uma carta privada!/);
    await call(env,path+'/cards/'+id,'GET',undefined,{token:grant});
    assert.equal((await env.DB.prepare("SELECT COUNT(*) AS c FROM notification_outbox WHERE order_id=? AND event='email_read'").bind(id).first()).c,1);
    await dispatch(env);
    assert.equal(calls.filter(c=>c.url.includes('api.resend.com/emails')&&c.body.subject.includes('aberta')).length,1);
    assert.ok(calls.every(c=>!JSON.stringify(c).includes('Segredo de uma carta privada!')));
    assert.ok(calls.filter(c=>c.url.includes('relay.test')).every(c=>!JSON.stringify(c).includes('exemplo@dominio.com')));
    await dispatch(env);
    assert.equal(calls.filter(c=>c.url.includes('api.resend.com/emails')&&c.body.subject.includes('aberta')).length,1);
  } finally {globalThis.fetch=oldFetch;}
});

test('pedido com e-mail inválido e opt-in não é criado',async()=>{
  const env=fixture(),{list}=await setup(env);
  const result=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,notify_on_read:true,read_receipt_email:'invalido'
  });
  assert.equal(result.status,400);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS c FROM orders').first()).c,0);
});


test('carrinho: um único Pix com preço verificado no servidor para três cartinhas, inclusive destinatários repetidos', async () => {
  const env = fixture(), {admin,list} = await setup(env);
  const created = await call(env,'/api/checkouts','POST',{
    items:[
      {recipient_slug:list[0].slug,sender_name:'Mãe'},
      {recipient_slug:list[1].slug,sender_name:'Seus amigos'},
      {recipient_slug:list[0].slug,sender_name:'Anônimo'},
    ],
  });
  assert.equal(created.status,201);
  assert.equal(created.data.items.length,3);
  assert.equal(created.data.amount_cents,3000);
  assert.match(created.data.pix_code,/540530\.00/);
  assert.equal(new Set(created.data.items.map(i=>i.id)).size,3);
  const parent = await call(env,'/api/checkout','GET',undefined,{token:created.data.token});
  assert.equal(parent.status,200);
  assert.equal(parent.data.amount_cents,3000);
  assert.equal(parent.data.items.length,3);
  assert.equal(parent.data.items[0].recipient_slug,list[0].slug);
  assert.equal(parent.data.items[2].recipient_slug,list[0].slug);

  for(const item of parent.data.items){
    const before = await call(env,'/api/order','GET',undefined,{token:item.token});
    assert.equal(before.data.status,'pending');
    assert.equal(before.data.amount_cents,1000);
    assert.equal(before.data.checkout_id,created.data.id);
  }
  assert.equal((await call(env,'/api/order','GET',undefined,{token:created.data.token})).status,404);

  const adminOrders=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  assert.equal(adminOrders.status,200);
  for(const secret of ['Mãe','Seus amigos','Anônimo',created.data.token]){
    assert.ok(!JSON.stringify(adminOrders.data.orders).includes(secret));
  }
  const pending=await call(env,'/api/admin/checkouts','GET',undefined,admin);
  assert.equal(pending.data.checkouts.length,1);
  assert.equal(pending.data.checkouts[0].item_count,3);
  assert.equal(pending.data.checkouts[0].total_cents,3000);

  const claimed=await call(env,'/api/checkout/claim','POST',{}, {token:created.data.token});
  assert.equal(claimed.status,200);
  const confirmed=await call(env,'/api/admin/checkouts/'+created.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'E2EGROUPPAYMENT98765',bank_checked:true,amount_checked:true,
  },admin);
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.data.letters,3);
  assert.equal((await call(env,'/api/admin/checkouts/'+created.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'E2EGROUPPAYMENT98765',bank_checked:true,amount_checked:true
  },admin)).status,409);

  for(const item of parent.data.items){
    const order=await call(env,'/api/order','GET',undefined,{token:item.token});
    assert.equal(order.data.status,'paid');
    const saved=await call(env,'/api/order/message','PUT',{
      rich_html:'<p>Cartinha para '+item.recipient_name+'</p>',
      composition:{theme:'marian',stickers:[]},
    },{token:item.token});
    assert.equal(saved.status,200);
    assert.equal((await call(env,'/api/order/submit','POST',{}, {token:item.token})).status,200);
  }
  const parentAfter=await call(env,'/api/checkout','GET',undefined,{token:created.data.token});
  assert.ok(parentAfter.data.items.every(i=>i.status==='paid'));
});

test('link do Pix permite editar, confirmar e sincronizar anexos antes do pagamento, sem liberar o mural',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/checkouts','POST',{
    items:[
      {recipient_slug:list[0].slug,sender_name:'Remetente A',
       rich_html:'<p>Primeira versão.</p>',
       composition:{theme:'marian',stickers:[{id:'s1',presetId:'jesus-ama',x:40,y:50}]}},
      {recipient_slug:list[1].slug,sender_name:'Remetente B',
       rich_html:'<p>Outra cartinha.</p>',composition:{theme:'rose',stickers:[]}},
    ]
  });
  assert.equal(created.status,201);
  const access=created.data.token;
  const privateCheckout=await call(env,'/api/checkout','GET',undefined,{token:access});
  assert.equal(privateCheckout.status,200);
  assert.equal(privateCheckout.data.amount_cents,2000);
  assert.equal(privateCheckout.data.items.length,2);
  assert.equal(privateCheckout.data.items[0].has_draft,true);
  const pix=privateCheckout.data.pix_code;
  const first=privateCheckout.data.items[0];
  const second=privateCheckout.data.items[1];
  const before=(await call(env,'/api/order','GET',undefined,{token:first.token})).data;
  assert.equal(before.status,'pending');
  assert.equal(before.sender_name,'Remetente A');
  assert.equal(before.rich_html,'<p>Primeira versão.</p>');
  assert.equal(before.composition.theme,'marian');
  assert.equal(before.composition.stickers[0].presetId,'jesus-ama');
  assert.equal((await call(env,'/api/order','GET')).status,401);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token:first.token})).status,403);

  const changed=await call(env,'/api/order/message','PUT',{
    sender_name:'Outra pessoa',rich_html:'<p>Alteração confirmada pelo link.</p>',
    composition:{theme:'peach',stickers:[{id:'s2',presetId:'nossa-senhora',x:25,y:55}]}
  },{token:first.token});
  assert.equal(changed.status,200);
  const updated=(await call(env,'/api/order','GET',undefined,{token:first.token})).data;
  assert.equal(updated.status,'pending');
  assert.equal(updated.sender_name,'Outra pessoa');
  assert.equal(updated.rich_html,'<p>Alteração confirmada pelo link.</p>');
  assert.equal(updated.composition.theme,'peach');
  assert.equal((await call(env,'/api/order','GET',undefined,{token:second.token})).data.rich_html,
    '<p>Outra cartinha.</p>');

  // The same private link uploads attachments without granting delivery.
  const file=await call(env,'/api/order/media/init','POST',{
    kind:'image',filename:'lembranca.png',content_type:'image/png'
  },{token:first.token});
  assert.equal(file.status,200);
  assert.equal((await call(env,'/api/order/media/'+file.data.id+'/part/1','PUT',
    new Uint8Array([137,80,78,71,13,10,26,10]),{token:first.token,raw:true})).status,200);
  assert.equal((await call(env,'/api/order/media/'+file.data.id+'/complete','POST',
    {},{token:first.token})).status,200);
  const extra=await call(env,'/api/order/media/init','POST',{
    kind:'image',filename:'exagero.png',content_type:'image/png'
  },{token:first.token});
  assert.equal(extra.status,200);
  assert.equal((await call(env,'/api/order/media/'+extra.data.id+'/part/7','PUT',
    new Uint8Array([1]),{token:first.token,raw:true})).status,413);
  const media=(await call(env,'/api/order','GET',undefined,{token:first.token})).data.media;
  assert.equal(media.length,1);
  const preview=await worker.fetch(new Request('https://ejc.test'+media[0].url),env);
  assert.equal(preview.status,200);
  assert.equal((await preview.arrayBuffer()).byteLength,8);

  const parentAgain=(await call(env,'/api/checkout','GET',undefined,{token:access})).data;
  assert.equal(parentAgain.pix_code,pix);
  assert.equal(parentAgain.amount_cents,2000);
  assert.equal(parentAgain.items[0].sender_name,'Outra pessoa');
  assert.equal((await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data.orders
    .some(o=>JSON.stringify(o).includes('Alteração confirmada')),false);

  await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  await call(env,'/api/admin/settings','PUT',{release_at:'2020-11-08T16:00'},admin);
  const accessCode=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data.recipients
    .find(p=>p.slug===list[0].slug).mural_code;
  const grant=(await call(env,'/api/mural/redeem','POST',{code:accessCode})).data.grant;
  assert.equal((await call(env,'/api/mural/'+list[0].slug,'GET',undefined,{token:grant}))
    .data.cards.length,0);

  assert.equal((await call(env,'/api/checkout/claim','POST',{}, {token:access})).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',{
    sender_name:'Última revisão',rich_html:'<p>Último ajuste.</p>'
  },{token:first.token})).status,200);
  assert.equal((await call(env,'/api/checkout','GET',undefined,{token:access})).data.pix_code,pix);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token:first.token})).status,403);
});

test('carrinho: valida itens e recusa associação manual de pagamento individual', async () => {
  const env=fixture(), {admin,list}=await setup(env);
  assert.equal((await call(env,'/api/checkouts','POST',{items:[]})).status,400);
  assert.equal((await call(env,'/api/checkouts','POST',{items:[{recipient_slug:'nao-existe'}]})).status,400);
  const created=await call(env,'/api/checkouts','POST',{
    items:[{recipient_slug:list[0].slug,sender_name:'Pessoa'}],
  });
  const item=created.data.items[0];
  assert.equal((await call(env,'/api/admin/orders/'+item.id+'/status','PATCH',{
    status:'paid',bank_reference:'E2EUNICO777777',bank_checked:true,amount_checked:true,
  },admin)).status,409);
  assert.equal((await call(env,'/api/admin/checkouts/'+created.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'E2EUNICO777777',bank_checked:false,amount_checked:true,
  },admin)).status,400);
});


test('PNG originais: coordenação publica, público só vê IDs instalados',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const before=await call(env,'/api/stickers');
  assert.equal(before.status,200);
  assert.deepEqual(before.data.stickers,[]);
  const png=new Uint8Array(128);
  png.set([137,80,78,71,13,10,26,10]);
  const uploaded=await worker.fetch(new Request('https://ejc.test/api/admin/stickers/nossa-senhora.png',{
    method:'POST',headers:{Origin:'https://ejc.test',Cookie:admin.cookie,'Content-Type':'image/png'},body:png,
  }),env);
  assert.equal(uploaded.status,200);
  assert.deepEqual((await call(env,'/api/stickers')).data.stickers,['nossa-senhora']);
  const publicImage=await worker.fetch(new Request('https://ejc.test/api/stickers/nossa-senhora.png'),env);
  assert.equal(publicImage.status,200);
  assert.equal(publicImage.headers.get('Content-Type'),'image/png');
  assert.deepEqual([...new Uint8Array(await publicImage.arrayBuffer())].slice(0,8),
    [137,80,78,71,13,10,26,10]);
  const unknown=await call(env,'/api/admin/stickers/desconhecido.png','DELETE',undefined,admin);
  assert.equal(unknown.status,404);
});

test('prévia social da home usa PNG 1200x630 gerado e publicado no R2',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const png=new Uint8Array(128);
  png.set([137,80,78,71,13,10,26,10]);
  new DataView(png.buffer).setUint32(16,1200);
  new DataView(png.buffer).setUint32(20,630);
  const uploaded=await worker.fetch(new Request('https://ejc.test/api/admin/og/default',{
    method:'POST',headers:{Origin:'https://ejc.test',Cookie:admin.cookie,'Content-Type':'image/png'},body:png
  }),env);
  assert.equal(uploaded.status,200);
  env.ASSETS.fetch=async()=>new Response('<!doctype html><html><head><title>XX EJC</title></head><body></body></html>',{
    headers:{'Content-Type':'text/html'},
  });
  const page=await worker.fetch(new Request('https://ejc.test/'),env);
  const html=await page.text();
  assert.match(html,/property="og:image:width" content="1200"/);
  assert.match(html,/property="og:image:height" content="630"/);
  const image=await worker.fetch(new Request('https://ejc.test/og-ejc-default.png'),env);
  assert.equal(image.status,200);
  assert.match(image.headers.get('Content-Type'),/image\/png/);
  assert.equal((await image.arrayBuffer()).byteLength,128);
});

test('fotos de encontristas exigem recorte quadrado antes de serem salvas',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const endpoint='https://ejc.test/api/admin/recipients/'+list[0].id+'/photo';
  const jpeg=(width,height)=>new Uint8Array([
    255,216,255,225,0,4,0,0,255,192,0,17,8,
    height>>8,height&255,width>>8,width&255,
    3,1,17,0,2,17,0,3,17,0,255,217,
  ]);
  const upload=(bytes,type='image/jpeg',authorized=true)=>worker.fetch(new Request(endpoint,{
    method:'POST',
    headers:{
      Origin:'https://ejc.test',
      Cookie:admin.cookie,
      'Content-Type':type,
      ...(authorized?{'X-Photo-Consent':'confirmed'}:{}),
    },
    body:bytes,
  }),env);
  assert.equal((await upload(jpeg(1200,700))).status,422);
  assert.equal((await upload(jpeg(768,768), 'image/png')).status,415);
  assert.equal((await upload(jpeg(768,768),'image/jpeg',false)).status,403);
  const square=await upload(jpeg(768,768));
  assert.equal(square.status,200);
  const data=await square.json();
  assert.match(data.photo_url,/^\/api\/recipients\//);
  const photo=await worker.fetch(new Request('https://ejc.test'+data.photo_url),env);
  assert.equal(photo.status,200);
  assert.equal((await photo.arrayBuffer()).byteLength,jpeg(768,768).byteLength);
});

test('admin pesquisa pelo código Pix e mostra todas as cartinhas sem ler conteúdo',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/checkouts','POST',{
    payer_name:'Maria para Conferência',
    items:[
      {recipient_slug:list[0].slug,sender_name:'Assinatura Privada Um'},
      {recipient_slug:list[1].slug,sender_name:'Assinatura Privada Dois'},
    ]
  });
  assert.equal(created.status,201);
  assert.match(created.data.id,/^EJCB-[A-F0-9]{12}$/);
  const payload=created.data;
  const search=(data,options=admin)=>call(env,'/api/admin/payments/search','POST',data,options);
  assert.equal((await search({query:payload.id},{})).status,401);
  const byCode=await search({query:payload.id});
  assert.equal(byCode.status,200);
  assert.equal(byCode.data.payments.length,1);
  const match=byCode.data.payments[0];
  assert.equal(match.id,payload.id);
  assert.equal(match.items.length,2);
  assert.deepEqual(match.items.map(item=>item.recipient_name).sort(),
    list.map(item=>item.name).sort());
  assert.equal(match.payer_name,'Maria para Conferência');
  const serialized=JSON.stringify(byCode.data);
  assert.ok(!serialized.includes('Assinatura Privada'));
  assert.ok(!serialized.includes('rich_html'));
  assert.ok(!serialized.includes('pix_payload'));
  assert.ok(!serialized.includes('token'));
  assert.equal((await search({query:payload.txid})).data.payments[0].id,payload.id);
  assert.equal((await search({query:payload.pix_code})).data.payments[0].id,payload.id);
  assert.equal((await search({payer:'Conferência'})).data.payments[0].id,payload.id);
  const byRecipient=await search({recipient:list[0].name});
  assert.equal(byRecipient.data.payments.length,1);
  assert.equal(byRecipient.data.payments[0].items.length,2);
  assert.equal((await search({payer:'Nome não cadastrado'})).data.payments.length,0);
  const confirmed=await call(env,'/api/admin/checkouts/'+payload.id+'/status','PATCH',{
    status:'paid',bank_reference:'E9876543210ABCDEF123456789012345',
    bank_checked:true,amount_checked:true
  },admin);
  assert.equal(confirmed.status,200);
  const byBank=await search({query:'E9876543210ABCDEF123456789012345'});
  assert.equal(byBank.data.payments[0].id,payload.id);
  assert.equal(byBank.data.payments[0].status,'paid');
  assert.equal((await search({status:'pending',query:payload.id})).data.payments.length,0);
  assert.equal((await search({status:'paid',query:payload.id})).data.payments.length,1);
  const itemToken=payload.items[0].token;
  const update=await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Texto reservado</p>',sender_name:'Assinatura Nova',composition:{}
  },{token:itemToken});
  assert.equal(update.status,200);
  const updated=await call(env,'/api/order','GET',undefined,{token:itemToken});
  assert.equal(updated.data.sender_name,'Assinatura Nova');
  const adminResults=JSON.stringify((await search({query:payload.id})).data);
  assert.ok(!adminResults.includes('Assinatura Nova'));
  assert.ok(!adminResults.includes('Texto reservado'));
});

test('nome para conferência é separado da assinatura na compra individual',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,
    payer_name:'Nome particular do comprador',
    sender_name:'Assinatura pública da carta'
  });
  assert.equal(created.status,201);
  const search=await call(env,'/api/admin/payments/search','POST',{
    query:created.data.id
  },admin);
  assert.equal(search.status,200);
  assert.equal(search.data.payments.length,1);
  assert.equal(search.data.payments[0].payer_name,'Nome particular do comprador');
  assert.equal(search.data.payments[0].items.length,1);
  assert.ok(!JSON.stringify(search.data).includes('Assinatura pública da carta'));
  const publicOrder=await call(env,'/api/order','GET',undefined,{token:created.data.token});
  assert.equal(publicOrder.data.sender_name,'Assinatura pública da carta');
  assert.equal(publicOrder.data.payer_name,undefined);
});

test('geração do Pix preserva rascunhos individuais e permite edição no link privado',()=>{
  const cart=fs.readFileSync(new URL('../client/pages/Cart.jsx',import.meta.url),'utf8');
  const checkout=fs.readFileSync(new URL('../client/pages/Checkout.jsx',import.meta.url),'utf8');
  const order=fs.readFileSync(new URL('../client/pages/Order.jsx',import.meta.url),'utf8');
  const cartStorage=fs.readFileSync(new URL('../client/lib/cart.jsx',import.meta.url),'utf8');
  assert.ok(cart.includes('rich_html: drafts[index].html'));
  assert.ok(cart.includes('composition: drafts[index].composition'));
  assert.ok(cart.includes('payer_name: payerName.trim()'));
  assert.ok(cart.includes('rememberCheckout('));
  assert.ok(cart.includes('await cart.clear();')); // clears only the cart index, not the drafts
  assert.ok(cartStorage.includes('// Keep source drafts'));
  assert.ok(cartStorage.includes('checkoutForDraft('));
  assert.ok(checkout.includes('Editar cartinha'));
  assert.ok(checkout.includes('Código para conferência'));
  assert.ok(order.includes('await draftSet(')); // local offline copy
  assert.ok(!order.includes('draftRemove('));
  assert.ok(order.includes('uploadMedia(')); // server is the canonical copy
});

test('admin renomeia encontristas sem quebrar links e recusa nomes duplicados',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const first=list[0],second=list[1];
  const url='/api/admin/recipients/'+first.id;
  const updated=await call(env,url,'PATCH',{name:'Maria Vitória'},admin);
  assert.equal(updated.status,200);
  assert.equal(updated.data.name,'Maria Vitória');
  assert.equal(updated.data.slug,first.slug);
  assert.equal(updated.data.og_needs_refresh,true);
  const publicData=(await call(env,'/api/public')).data;
  assert.equal(publicData.recipients.find(person=>person.id===first.id).name,'Maria Vitória');
  assert.equal(publicData.recipients.find(person=>person.id===first.id).slug,first.slug);
  const duplicated=await call(env,url,'PATCH',{name:second.name.toLocaleUpperCase('pt-BR')},admin);
  assert.equal(duplicated.status,409);
  assert.equal((await call(env,url,'PATCH',{active:'false'},admin)).status,400);
  assert.equal((await call(env,url,'PATCH',{name:'Outra pessoa'})).status,401);
  assert.equal((await call(env,url,'PATCH',{name:''},admin)).status,400);
  const adminData=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  assert.equal(adminData.recipients.find(p=>p.id===first.id).order_count,0);
});

test('exclusão permanente só ocorre sem cartinhas; exclusão com pedidos arquiva e permite restaurar',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0],other=list[1];
  const endpoint='/api/admin/recipients/'+person.id;
  assert.equal((await call(env,endpoint,'DELETE')).status,401);
  const removed=await call(env,endpoint,'DELETE',undefined,admin);
  assert.equal(removed.status,200);
  assert.equal(removed.data.mode,'deleted');
  assert.equal((await env.DB.prepare('SELECT id FROM recipients WHERE id=?').bind(person.id).first()),null);
  assert.equal((await call(env,endpoint,'PATCH',{name:'Inexistente'},admin)).status,404);
  assert.equal((await call(env,'/api/public')).data.recipients.some(p=>p.id===person.id),false);

  const created=await call(env,'/api/orders','POST',{recipient_slug:other.slug,sender_name:'Privado'});
  assert.equal(created.status,201);
  assert.equal((await call(env,'/api/admin/mural-codes/generate','POST',{},admin)).status,200);
  const before=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  const code=before.recipients.find(p=>p.id===other.id).mural_code;
  const otherUrl='/api/admin/recipients/'+other.id;
  const archived=await call(env,otherUrl,'DELETE',undefined,admin);
  assert.equal(archived.status,200);
  assert.equal(archived.data.mode,'archived');
  assert.equal(archived.data.linked_orders,1);
  assert.equal((await call(env,'/api/public')).data.recipients.some(p=>p.id===other.id),false);
  const adminAfter=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  assert.equal(adminAfter.recipients.find(p=>p.id===other.id).active,0);
  assert.equal(adminAfter.recipients.find(p=>p.id===other.id).order_count,1);
  assert.equal((await call(env,'/api/order','GET',undefined,{token:created.data.token})).status,200);
  const grant=await call(env,'/api/mural/redeem','POST',{code});
  assert.equal(grant.status,200);
  assert.equal((await call(env,'/api/mural/'+other.slug,'GET',undefined,{token:grant.data.grant})).status,200);
  const restored=await call(env,otherUrl,'PATCH',{active:true},admin);
  assert.equal(restored.status,200);
  assert.equal(restored.data.slug,other.slug);
  assert.equal((await call(env,'/api/public')).data.recipients.some(p=>p.id===other.id),true);
});

test('filtro de pagamento encontra nomes acentuados sem perder sigilo',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/checkouts','POST',{
    payer_name:'João da Conceição',items:[{recipient_slug:list[0].slug,sender_name:'Texto Secreto'}]
  });
  assert.equal(created.status,201);
  const find=async data=>call(env,'/api/admin/payments/search','POST',data,admin);
  const byName=await find({payer:'Conceição'});
  assert.equal(byName.status,200);
  assert.equal(byName.data.payments[0]?.id,created.data.id);
  assert.equal((await find({payer:'conceição'})).data.payments[0]?.id,created.data.id);
  assert.equal((await find({recipient:list[0].name})).data.payments[0]?.id,created.data.id);
  assert.ok(!JSON.stringify(byName.data).includes('Texto Secreto'));
});

