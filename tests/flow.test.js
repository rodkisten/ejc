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
  sql.exec(fs.readFileSync(new URL('../migrations/0011_recipient_whatsapp.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0012_mini_mercado_campaign.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0013_draft_recovery_tracking.sql',import.meta.url),'utf8'));
  sql.exec(fs.readFileSync(new URL('../migrations/0014_short_links.sql',import.meta.url),'utf8'));

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
  return {status:response.status, data:options.binary ? new Uint8Array(await response.arrayBuffer()) : await response.json(), headers:response.headers};
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

test('mural mostra recado para cartinhas pagas não terminadas sem revelar o rascunho nem o remetente anônimo',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const recipient=list[0];
  const first=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Tia Maria',
  });
  const second=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Uma pessoa que pediu anonimato',
  });
  const alias=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Nome civil não público',
  });
  const unpaid=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Pix ainda pendente',
  });
  assert.equal(first.status,201);
  assert.equal(second.status,201);
  assert.equal(alias.status,201);
  assert.equal(unpaid.status,201);

  for(const entry of [first,second,alias]) {
    const confirmed=await call(env,'/api/admin/orders/'+entry.data.id+'/status','PATCH',{
      status:'paid',bank_reference:'E2ETEST'+entry.data.id,
      bank_checked:true,amount_checked:true,
    },admin);
    assert.equal(confirmed.status,200);
  }
  const draft=await call(env,'/api/order/message','PUT',{
    rich_html:'<p>SEGREDO QUE AINDA NÃO FOI ENVIADO.</p>',
    composition:{anonymous:true},
  },{token:second.data.token});
  assert.equal(draft.status,200);
  const aliasDraft=await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Outro rascunho que ainda não foi finalizado.</p>',
    composition:{authorName:'Sua dinda do coração',anonymous:false},
  },{token:alias.data.token});
  assert.equal(aliasDraft.status,200);

  await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  const code=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data
    .recipients.find(p=>p.slug===recipient.slug).mural_code;
  const grant=(await call(env,'/api/mural/redeem','POST',{code})).data.grant;
  const path='/api/mural/'+recipient.slug;

  const before=await call(env,path,'GET',undefined,{token:grant});
  assert.equal(before.status,200);
  assert.equal(before.data.locked,true);
  assert.equal(before.data.cards.length,0);

  await call(env,'/api/admin/settings','PUT',{release_at:'2020-11-08T16:00'},admin);
  assert.equal((await call(env,path,'GET')).status,403);
  const after=await call(env,path,'GET',undefined,{token:grant});
  assert.equal(after.status,200);
  assert.equal(after.data.cards.length,3);
  assert.ok(!JSON.stringify(after.data).includes('SEGREDO QUE AINDA'));
  assert.ok(!JSON.stringify(after.data).includes('Pix ainda pendente'));
  assert.ok(!JSON.stringify(after.data).includes('Nome civil não público'));
  const named=after.data.cards.find(item=>item.id===first.data.id);
  const anonymous=after.data.cards.find(item=>item.id===second.data.id);
  const aliasLetter=after.data.cards.find(item=>item.id===alias.data.id);
  assert.equal(named.draft_pending,true);
  assert.equal(named.sender_name,'Tia Maria');
  assert.equal(anonymous.draft_pending,true);
  assert.equal(anonymous.sender_name,'');
  assert.equal(aliasLetter.sender_name,'Sua dinda do coração');
  assert.equal('rich_html' in named,false);
  assert.equal('media' in named,false);
  assert.equal((await call(env,path+'/cards/'+first.data.id,'GET',undefined,{token:grant})).status,404);
  assert.equal((await env.DB.prepare('SELECT first_read_at FROM orders WHERE id=?')
    .bind(first.data.id).first()).first_read_at,null);

  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Agora a cartinha está pronta.</p>',
  },{token:first.data.token})).status,200);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token:first.data.token})).status,200);
  const refreshed=await call(env,path,'GET',undefined,{token:grant});
  const submitted=refreshed.data.cards.find(item=>item.id===first.data.id);
  assert.equal(submitted.draft_pending,undefined);
  assert.equal(submitted.sender_name,undefined);
  assert.equal(refreshed.data.cards.find(item=>item.id===second.data.id).draft_pending,true);
  const opened=await call(env,path+'/cards/'+first.data.id,'GET',undefined,{token:grant});
  assert.equal(opened.status,200);
  assert.match(opened.data.card.rich_html,/Agora a cartinha está pronta/);

  // Defensive handling of a legacy record manually finalized without content.
  await env.DB.prepare(
    "UPDATE orders SET rich_html='<p>&nbsp;</p>',submitted_at='2026-11-09 10:00:00' WHERE id=?"
  ).bind(second.data.id).run();
  const legacy=await call(env,path,'GET',undefined,{token:grant});
  const empty=legacy.data.cards.find(item=>item.id===second.data.id);
  assert.equal(empty.empty_content,true);
  assert.equal(empty.sender_name,''); // Anonymity survives a legacy blank letter.
  assert.equal((await call(env,path+'/cards/'+second.data.id,'GET',undefined,{token:grant})).status,409);
  assert.equal((await env.DB.prepare('SELECT first_read_at FROM orders WHERE id=?')
    .bind(second.data.id).first()).first_read_at,null);
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
  assert.ok(parent.data.items.every(item => item.submitted === false));

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
  assert.ok(parentAfter.data.items.every(i=>i.submitted === true));
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
  assert.equal((await search({sender:'Privada Dois'})).data.payments[0].id,payload.id);
  assert.equal((await search({sender:'Quem não enviou'})).data.payments.length,0);
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
  await env.MEDIA.put('og/v3/old-preview.png',new Uint8Array([1,2,3]));
  await env.DB.prepare('UPDATE recipients SET og_key=? WHERE id=?')
    .bind('og/v3/old-preview.png',first.id).run();
  const updated=await call(env,url,'PATCH',{name:'Maria Vitória'},admin);
  assert.equal(updated.status,200);
  assert.equal(updated.data.name,'Maria Vitória');
  assert.equal(updated.data.slug,first.slug);
  assert.equal(updated.data.og_needs_refresh,true);
  assert.equal(await env.MEDIA.head('og/v3/old-preview.png'),null);
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
  await env.MEDIA.put('recipients/orphan-photo',new Uint8Array([1,2,3]));
  await env.MEDIA.put('og/orphan-preview.png',new Uint8Array([4,5,6]));
  await env.DB.prepare('UPDATE recipients SET photo_key=?,og_key=? WHERE id=?')
    .bind('recipients/orphan-photo','og/orphan-preview.png',person.id).run();
  assert.equal((await call(env,endpoint,'DELETE')).status,401);
  const removed=await call(env,endpoint,'DELETE',undefined,admin);
  assert.equal(removed.status,200);
  assert.equal(removed.data.mode,'deleted');
  assert.equal(await env.MEDIA.head('recipients/orphan-photo'),null);
  assert.equal(await env.MEDIA.head('og/orphan-preview.png'),null);
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
test('admin oferece editar, excluir e restaurar encontristas com confirmação no mobile',()=>{
  const admin=fs.readFileSync(new URL('../client/pages/Admin.jsx',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../client/styles/people-admin.css',import.meta.url),'utf8');
  const main=fs.readFileSync(new URL('../client/main.jsx',import.meta.url),'utf8');
  assert.ok(admin.includes('Editar nome'));
  assert.ok(admin.includes('Excluir'));
  assert.ok(admin.includes('Restaurar'));
  assert.ok(admin.includes('window.confirm('));
  assert.ok(admin.includes('person-name-editor'));
  assert.ok(css.includes('font-size:16px'));
  assert.ok(css.includes('@media(max-width:640px)'));
  assert.ok(main.includes("import './styles/people-admin.css';"));
});


test('coordenação vê todas as cartinhas, inclusive Pix pendente, sem receber mensagens, mídia ou tokens', async () => {
  const env = fixture(), { admin, list } = await setup(env);
  const person = list[0];
  const unpaid = await call(env, '/api/orders', 'POST', {
    recipient_slug: person.slug, sender_name: 'Remetente identificável',
  });
  assert.equal(unpaid.status, 201);
  const secretText = 'TEXTO-ULTRASSECRETO-NAO-ENVIAR-AO-ADMIN';
  const secretAuthor = 'ASSINATURA-PRIVADA-NAO-ENVIAR';
  const token = unpaid.data.token;
  const saved = await call(env, '/api/order/message', 'PUT', {
    rich_html: '<p>' + secretText + '</p>',
    composition: {
      theme: 'rose', authorName: secretAuthor,
      stickers: [{ id: 'sticker-1', presetId: 'jesus-ama', x: 48, y: 52, scale: 1, rotate: -4, color: 'rose' }],
    },
  }, { token });
  assert.equal(saved.status, 200);

  const second = await call(env, '/api/orders', 'POST', {
    recipient_slug: list[1].slug, sender_name: 'Outra pessoa',
  });
  assert.equal(second.status, 201);
  assert.equal((await call(env, '/api/admin/orders/' + second.data.id + '/status', 'PATCH', {
    status: 'paid', bank_reference: 'E2EADMINPREVIEW123456789',
    bank_checked: true, amount_checked: true,
  }, admin)).status, 200);

  assert.equal((await call(env, '/api/admin/cartinhas')).status, 401);
  assert.equal((await call(env, '/api/admin/cartinhas', 'GET', undefined, {
    token: unpaid.data.token,
  })).status, 401);

  const preview = await call(env, '/api/admin/cartinhas', 'GET', undefined, admin);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('Cache-Control'), 'no-store');
  assert.equal(preview.data.letters.length, 2);
  const pending = preview.data.letters.find((letter) => letter.id === unpaid.data.id);
  const paid = preview.data.letters.find((letter) => letter.id === second.data.id);
  assert.equal(pending.sender_name, 'Remetente identificável');
  assert.equal(pending.recipient_slug, person.slug);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.submitted, false);
  assert.equal(pending.theme, 'rose');
  assert.equal(pending.stickers.length, 1);
  assert.equal(pending.stickers[0].presetId, 'jesus-ama');
  assert.equal(paid.status, 'paid');
  assert.equal(paid.sender_name, 'Outra pessoa');
  for (const field of ['rich_html', 'composition_json', 'media', 'authorName', 'token_hash', 'pix_payload']) {
    assert.equal(field in pending, false, 'Campo sigiloso não pode sair da API: ' + field);
  }
  const payload = JSON.stringify(preview.data);
  assert.ok(!payload.includes(secretText));
  assert.ok(!payload.includes(secretAuthor));
  assert.ok(!payload.includes(token));
  assert.equal((await call(env, '/api/mural/' + person.slug, 'GET', undefined, admin)).status, 403);
});


test('prévia técnica exige sessão admin e segredo independente, incluindo mídia',async()=>{
  const env=fixture();
  env.TECH_PREVIEW_SECRET='technical-test-only-32-character-secret';
  const {admin,list}=await setup(env);
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Remetente particular'
  });
  assert.equal(created.status,201);
  const id=created.data.id, token=created.data.token;
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Conteúdo privado só técnico</p>',sender_name:'Remetente particular',
  },{token})).status,200);
  const route='/api/admin/technical-preview/'+id;
  assert.equal((await call(env,route,'GET',undefined,admin)).status,404);
  assert.equal((await call(env,route,'POST',{password:env.TECH_PREVIEW_SECRET})).status,401);
  const masked=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data;
  assert.equal('rich_html' in masked.letters[0],false);
  assert.ok(!JSON.stringify(masked).includes('Conteúdo privado'));
  assert.equal((await call(env,route,'POST',{password:'another-invalid-password-with-32-characters'},admin)).status,403);
  const preview=await call(env,route,'POST',{password:env.TECH_PREVIEW_SECRET},admin);
  assert.equal(preview.status,200);
  assert.match(preview.data.rich_html,/Conteúdo privado só técnico/);
  assert.equal(preview.data.sender_name,'Remetente particular');
  assert.equal(preview.headers.get('Cache-Control'),'no-store');
  assert.equal('token_hash' in preview.data,false);

  const uploaded=await call(env,'/api/order/media/init','POST',
    {kind:'image',filename:'private.png',content_type:'image/png'},{token});
  assert.equal(uploaded.status,200);
  const mediaId=uploaded.data.id;
  assert.equal((await call(env,'/api/order/media/'+mediaId+'/part/1','PUT',
    new Uint8Array([137,80,78,71,1,2,3]),{token,raw:true})).status,200);
  assert.equal((await call(env,'/api/order/media/'+mediaId+'/complete','POST',{}, {token})).status,200);
  const mediaRoute=route+'/media/'+mediaId;
  assert.equal((await call(env,mediaRoute,'POST',{password:env.TECH_PREVIEW_SECRET})).status,401);
  assert.equal((await call(env,mediaRoute,'POST',{password:'another-invalid-password-with-32-characters'},admin)).status,403);
  const media=await call(env,mediaRoute,'POST',{password:env.TECH_PREVIEW_SECRET},{...admin,binary:true});
  assert.equal(media.status,200);
  assert.equal(media.headers.get('Cache-Control'),'no-store');
  assert.equal(media.headers.get('Content-Type'),'image/png');
  assert.deepEqual([...media.data],[137,80,78,71,1,2,3]);
  assert.ok(!JSON.stringify((await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data).includes('private.png'));
});

test('prévia técnica fica desativada sem segredo forte',async()=>{
  const env=fixture();
  const {admin,list}=await setup(env);
  const created=await call(env,'/api/orders','POST',{recipient_slug:list[0].slug});
  env.TECH_PREVIEW_SECRET='000000';
  const response=await call(env,'/api/admin/technical-preview/'+created.data.id,
    'POST',{password:'000000'},admin);
  assert.equal(response.status,503);
});


test('modo técnico abre visão completa de um encontrista pelo token pessoal sem registrar leitura',async()=>{
  const env=fixture();
  env.TECH_PREVIEW_SECRET='technical-test-only-32-character-secret';
  const {admin,list}=await setup(env);
  const recipient=list[0];
  const one=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Amigo primeiro'
  });
  const two=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Amiga segunda'
  });
  assert.equal(one.status,201);
  assert.equal(two.status,201);
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Primeira mensagem privada</p>'
  },{token:one.data.token})).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Segunda mensagem privada</p>'
  },{token:two.data.token})).status,200);

  await call(env,'/api/admin/mural-codes/generate','POST',{regenerate:false},admin);
  const bootstrap=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data;
  const accessCode=bootstrap.recipients.find(person=>person.id===recipient.id).mural_code;
  const redeem=await call(env,'/api/mural/redeem','POST',{code:accessCode});
  assert.equal(redeem.status,200);
  const grant=redeem.data.grant;
  const path='/api/admin/technical-mural';
  const valid={password:env.TECH_PREVIEW_SECRET,mural_token:grant};
  assert.equal((await call(env,path,'GET',undefined,admin)).status,404);
  assert.equal((await call(env,path,'POST',valid)).status,401);
  assert.equal((await call(env,path,'POST',{...valid,password:'incorrect-technical-secret-with-length'},admin)).status,403);
  assert.equal((await call(env,path,'POST',{...valid,mural_token:'m2.abc.def'},admin)).status,403);
  assert.equal((await call(env,path,'POST',{...valid,mural_token:grant+'broken'},admin)).status,403);

  const result=await call(env,path,'POST',valid,admin);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('Cache-Control'),'no-store');
  assert.equal(result.data.recipient.slug,recipient.slug);
  assert.equal(result.data.cards.length,2);
  assert.equal(result.data.locked,true);
  assert.ok(result.data.cards.every(card=>card.visible_to_recipient===false));
  assert.ok(result.data.cards.some(card=>card.rich_html.includes('Primeira mensagem privada')));
  assert.ok(result.data.cards.some(card=>card.rich_html.includes('Segunda mensagem privada')));
  assert.ok(!JSON.stringify(result.data).includes(one.data.token));
  assert.ok(!JSON.stringify(result.data).includes(two.data.token));

  const byRecipient=await call(env,path,'POST',{
    password:env.TECH_PREVIEW_SECRET,recipient_slug:recipient.slug
  },admin);
  assert.equal(byRecipient.status,200);
  assert.equal(byRecipient.data.cards.length,2);
  const byPrintedCode=await call(env,path,'POST',{
    password:env.TECH_PREVIEW_SECRET,mural_code:accessCode
  },admin);
  assert.equal(byPrintedCode.status,200);
  assert.equal(byPrintedCode.data.recipient.slug,recipient.slug);
  assert.equal(byPrintedCode.data.cards.length,2);
  assert.equal((await call(env,path,'POST',{
    password:env.TECH_PREVIEW_SECRET,mural_code:'ZZZZZZ'
  },admin)).status,403);
  const publicMural=await call(env,'/api/mural/'+recipient.slug,'GET',undefined,{token:grant});
  assert.equal(publicMural.status,200);
  assert.equal(publicMural.data.cards.length,0);

  const summary=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data;
  assert.equal(summary.letters.length,2);
  assert.ok(!JSON.stringify(summary).includes('Primeira mensagem privada'));
  assert.ok(!JSON.stringify(summary).includes('Segunda mensagem privada'));
});


test('WhatsApp privado: telefone não é público, convite só para cartinha paga, enviada e com OG',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const recipient=list[0],id=recipient.id;
  const url='/api/admin/recipients/'+id;
  const withPhone=await call(env,url,'PATCH',{whatsapp_phone:'(32) 99966-2604'},admin);
  assert.equal(withPhone.status,200);
  assert.equal(withPhone.data.whatsapp_phone,'5532999662604');
  assert.equal((await call(env,url,'PATCH',{whatsapp_phone:'ABC'},admin)).status,400);
  const adminList=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data.recipients;
  assert.equal(adminList.find(person=>person.id===id).whatsapp_phone,'5532999662604');
  const publicList=(await call(env,'/api/public')).data.recipients;
  assert.equal('whatsapp_phone' in publicList.find(person=>person.id===id),false);

  const linkPath=url+'/whatsapp-link';
  assert.equal((await call(env,linkPath,'POST',{})).status,401);
  assert.equal((await call(env,linkPath,'POST',{},admin)).status,409);

  const created=await call(env,'/api/orders','POST',{
    recipient_slug:recipient.slug,sender_name:'Uma pessoa especial'
  });
  assert.equal(created.status,201);
  const buyerToken=created.data.token;
  await call(env,'/api/order/message','PUT',{rich_html:'<p>Cartinha com amor</p>'},{token:buyerToken});
  await call(env,'/api/order/claim','POST',{}, {token:buyerToken});
  const paid=await call(env,'/api/admin/orders/'+created.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'WAPP98765432100001',bank_checked:true,amount_checked:true,
  },admin);
  assert.equal(paid.status,200);
  assert.equal((await call(env,linkPath,'POST',{},admin)).status,409);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token:buyerToken})).status,200);
  assert.equal((await call(env,linkPath,'POST',{},admin)).status,409);

  // A OG nunca inclui conteúdo privado, nem o token.
  const png=new Uint8Array(24);
  png.set([137,80,78,71,13,10,26,10],0);
  new DataView(png.buffer).setUint32(16,1200);
  new DataView(png.buffer).setUint32(20,630);
  const response=await worker.fetch(new Request('https://ejc.test'+url+'/mural-og',{
    method:'POST',headers:{Origin:'https://ejc.test',Cookie:admin.cookie,'Content-Type':'image/png'},
    body:png,
  }),env);
  assert.equal(response.status,200);
  const shared=await call(env,linkPath,'POST',{},admin);
  assert.equal(shared.status,200);
  assert.equal(shared.data.phone,'5532999662604');
  assert.equal(shared.data.count,1);
  assert.ok(shared.data.og_url.includes('/api/og/mural/'));
  const link=new URL(shared.data.url);
  assert.equal(link.pathname,'/mural/'+recipient.slug);
  assert.ok(link.searchParams.get('og'));
  assert.ok(link.hash.startsWith('#token=m2.'));
  assert.equal(shared.data.expires_in_days,14);
  assert.ok(!JSON.stringify(shared.data).includes('Cartinha com amor'));
  const mural=await call(env,'/api/mural/'+recipient.slug,'GET',undefined,{
    token:new URLSearchParams(link.hash.slice(1)).get('token'),
  });
  assert.equal(mural.status,200);
  assert.equal(mural.data.locked,true);

  const og=await worker.fetch(new Request('https://ejc.test/api/og/mural/'+recipient.slug+'.png'),env);
  assert.equal(og.status,200);
  assert.equal(og.headers.get('Content-Type'),'image/png');
  assert.deepEqual([...new Uint8Array(await og.arrayBuffer())], [...png]);
  const second=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data.recipients.find(person=>person.id===id);
  assert.equal(second.ready_letter_count,1);
  assert.equal(second.mural_og_ready,true);
});

test('convite WhatsApp mantém a chave de acesso existente, respeita alterações de telefone e arquivamento',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0],path='/api/admin/recipients/'+person.id;
  assert.equal((await call(env,path,'PATCH',{whatsapp_phone:'55 32 99966 2604'},admin)).data.whatsapp_phone,'5532999662604');
  assert.equal((await call(env,path,'PATCH',{whatsapp_phone:''},admin)).data.whatsapp_phone,'');
  assert.equal((await call(env,path,'PATCH',{active:false},admin)).status,200);
  const row=(await call(env,'/api/admin/bootstrap','GET',undefined,admin)).data.recipients.find(x=>x.id===person.id);
  assert.equal(row.active,0);
  assert.equal((await call(env,path+'/whatsapp-link','POST',{},admin)).status,404);
});


test('aprovação manual em lote aceita Pix sem referência apenas com conferência explícita', async () => {
  const env=fixture(),{admin,list}=await setup(env);
  const first=await call(env,'/api/orders','POST',{recipient_slug:list[0].slug,sender_name:'Primeira carta'});
  const second=await call(env,'/api/orders','POST',{recipient_slug:list[1].slug,sender_name:'Segunda carta'});
  assert.equal(first.status,201);
  assert.equal(second.status,201);
  const path=(id)=>'/api/admin/orders/'+id+'/status';
  const input={status:'paid',bank_reference:'',bank_checked:true,amount_checked:true};
  assert.equal((await call(env,path(first.data.id),'PATCH',input,admin)).status,400);
  assert.equal((await call(env,path(first.data.id),'PATCH',
    {...input,manual_batch:true,bank_checked:false},admin)).status,400);
  assert.equal((await call(env,path(first.data.id),'PATCH',
    {...input,manual_batch:true,amount_checked:false},admin)).status,400);
  assert.equal((await call(env,path(first.data.id),'PATCH',
    {...input,manual_batch:true},admin)).status,200);
  assert.equal((await call(env,path(second.data.id),'PATCH',
    {...input,manual_batch:true},admin)).status,200);
  const rows=(await env.DB.prepare('SELECT id,status,bank_reference FROM orders WHERE id IN (?,?)')
    .bind(first.data.id,second.data.id).all()).results;
  assert.equal(rows.length,2);
  assert.ok(rows.every(row=>row.status==='paid' && row.bank_reference===null));
  const events=(await env.DB.prepare(
    "SELECT detail FROM order_events WHERE order_id=? AND type='payment_confirmed'"
  ).bind(first.data.id).all()).results;
  assert.equal(events[0].detail,'manual_batch_no_reference');
});

test('aprovação em lote sem referência libera checkout agrupado sem gerar código falso',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const checkout=await call(env,'/api/checkouts','POST',{
    items:[
      {recipient_slug:list[0].slug,sender_name:'Carta A'},
      {recipient_slug:list[1].slug,sender_name:'Carta B'},
    ],
  });
  assert.equal(checkout.status,201);
  const url='/api/admin/checkouts/'+checkout.data.id+'/status';
  const input={status:'paid',bank_reference:'',bank_checked:true,amount_checked:true};
  assert.equal((await call(env,url,'PATCH',input,admin)).status,400);
  assert.equal((await call(env,url,'PATCH',
    {...input,manual_batch:true,bank_checked:false},admin)).status,400);
  const done=await call(env,url,'PATCH',{...input,manual_batch:true},admin);
  assert.equal(done.status,200);
  assert.equal(done.data.letters,2);
  const state=await env.DB.prepare('SELECT status,bank_reference FROM checkouts WHERE id=?')
    .bind(checkout.data.id).first();
  assert.equal(state.status,'paid');
  assert.equal(state.bank_reference,null);
  assert.equal((await call(env,url,'PATCH',{...input,manual_batch:true},admin)).status,409);
  const childEvents=(await env.DB.prepare(
    "SELECT detail FROM order_events WHERE type='payment_confirmed' AND order_id IN " +
    '(SELECT id FROM orders WHERE checkout_id=?)'
  ).bind(checkout.data.id).all()).results;
  assert.equal(childEvents.length,2);
  assert.ok(childEvents.every(row=>row.detail==='manual_batch_no_reference'));
});

test('busca administrativa pagina todos os Pix, inclusive além dos primeiros 100',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const expected=new Set();
  const pendingIds=new Set();
  for(let i=0;i<237;i++){
    const id='EJC-'+i.toString(16).padStart(12,'0').toUpperCase();
    const state=i%31===0?'paid':i%11===0?'claimed':'pending';
    expected.add(id);
    if(state!=='paid')pendingIds.add(id);
    // Equal created_at dates exercise stable secondary order by payment ID.
    await env.DB.prepare(
      'INSERT INTO orders(id,token_hash,recipient_id,status,total_cents,pix_payload,txid,created_at,updated_at) ' +
      'VALUES(?,?,?,?,?,?,?,?,?)'
    ).bind(id,'hash-'+id,list[0].id,state,1000,'PIX TESTE','TXID'+i,
      '2026-11-08 12:00:00','2026-11-08 12:00:00').run();
  }
  const find=(data)=>call(env,'/api/admin/payments/search','POST',data,admin);
  const first=await find({});
  assert.equal(first.status,200);
  assert.equal(first.data.payments.length,100);
  assert.equal(first.data.next_offset,100);
  const second=await find({offset:first.data.next_offset});
  assert.equal(second.data.payments.length,100);
  assert.equal(second.data.next_offset,200);
  const third=await find({offset:second.data.next_offset});
  assert.equal(third.data.payments.length,37);
  assert.equal(third.data.next_offset,null);
  const all=[...first.data.payments,...second.data.payments,...third.data.payments];
  assert.equal(new Set(all.map(item=>item.id)).size,237);
  assert.deepEqual(new Set(all.map(item=>item.id)),expected);
  for(let i=1;i<all.length;i++)assert.ok(all[i-1].id>all[i].id);

  const pending=[];
  let offset=0;
  for(;;){
    const response=await find({pending_only:true,offset});
    assert.equal(response.status,200);
    assert.ok(response.data.payments.every(item=>['pending','claimed'].includes(item.status)));
    pending.push(...response.data.payments);
    if(response.data.next_offset===null)break;
    offset=response.data.next_offset;
  }
  assert.deepEqual(new Set(pending.map(item=>item.id)),pendingIds);
  assert.equal(new Set(pending.map(item=>item.id)).size,pendingIds.size);
  assert.equal((await find({offset:-1})).status,400);
  assert.equal((await find({offset:1.5})).status,400);
});

test('admin finaliza somente rascunhos pagos com conteúdo, sem ler a mensagem',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const create=async slug=>call(env,'/api/orders','POST',{recipient_slug:slug,sender_name:'Remetente'},undefined);
  const a=await create(list[0].slug);
  const b=await create(list[0].slug);
  const c=await create(list[1].slug);
  const d=await create(list[1].slug);
  assert.ok([a,b,c,d].every(x=>x.status===201));
  const privateMessage='MENSAGEM-SIGILOSA-DE-TESTE';
  assert.equal((await call(env,'/api/order/message','PUT',
    {rich_html:'<p>'+privateMessage+'</p>'},{token:a.data.token})).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',
    {rich_html:'<p>Pix ainda pendente</p>'},{token:c.data.token})).status,200);
  await env.DB.prepare(
    'INSERT INTO media(id,order_id,kind,filename,content_type,object_key,status,bytes) VALUES(?,?,?,?,?,?,?,?)'
  ).bind(crypto.randomUUID(),d.data.id,'audio','audio.wav','audio/wav','tests/audio','ready',24).run();
  for(const [index,row] of [a,b,d].entries()){
    const paid=await call(env,'/api/admin/orders/'+row.data.id+'/status','PATCH',{
      status:'paid',bank_reference:'TESTEBANCO9876543210'+index,
      bank_checked:true,amount_checked:true
    },admin);
    assert.equal(paid.status,200);
  }

  const previewUrl='/api/admin/cartinhas/finalize-preview';
  const actionUrl='/api/admin/cartinhas/finalize-paid';
  assert.equal((await call(env,previewUrl)).status,401);
  assert.equal((await call(env,actionUrl,'POST',{cursor:''})).status,401);
  const preview=await call(env,previewUrl,'GET',undefined,admin);
  assert.equal(preview.status,200);
  assert.deepEqual(preview.data,{paid_drafts:3,eligible:2,empty:1});
  assert.ok(!JSON.stringify(preview.data).includes(privateMessage));

  const finished=await call(env,actionUrl,'POST',{cursor:''},admin);
  assert.equal(finished.status,200);
  assert.equal(finished.data.finalized,2);
  assert.equal(finished.data.empty,1);
  assert.equal(finished.data.failed,0);
  assert.equal(finished.data.next_cursor,null);
  assert.ok(!JSON.stringify(finished.data).includes(privateMessage));
  const rows=(await env.DB.prepare(
    'SELECT id,status,submitted_at,moderation FROM orders'
  ).all()).results;
  for(const item of [a,d]){
    const order=rows.find(row=>row.id===item.data.id);
    assert.equal(order.status,'paid');
    assert.ok(order.submitted_at);
    assert.equal(order.moderation,'approved');
  }
  assert.equal(rows.find(row=>row.id===b.data.id).submitted_at,null);
  assert.equal(rows.find(row=>row.id===c.data.id).submitted_at,null);
  const after=(await call(env,previewUrl,'GET',undefined,admin)).data;
  assert.deepEqual(after,{paid_drafts:1,eligible:0,empty:1});
  const again=await call(env,actionUrl,'POST',{cursor:''},admin);
  assert.equal(again.data.finalized,0);

  const summary=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  const find=name=>summary.data.recipients.find(person=>person.name===name);
  assert.equal(find(list[0].name).ready_letter_count,1);
  assert.equal(find(list[1].name).ready_letter_count,1);
});

test('finalização administrativa percorre todos os lotes sem perder cartas',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  for(let i=0;i<87;i++){
    const id='EJC-'+i.toString(16).padStart(12,'0').toUpperCase();
    await env.DB.prepare(
      'INSERT INTO orders(id,token_hash,recipient_id,status,total_cents,pix_payload,txid,rich_html) VALUES(?,?,?,?,?,?,?,?)'
    ).bind(id,'hash-'+id,list[0].id,'paid',1000,'PIX','TX'+i,'<p>Mensagem '+i+'</p>').run();
  }
  let cursor='',finalized=0,scanned=0;
  const seen=new Set();
  do {
    assert.ok(!seen.has(cursor)); seen.add(cursor);
    const result=await call(env,'/api/admin/cartinhas/finalize-paid','POST',{cursor},admin);
    assert.equal(result.status,200);
    finalized+=result.data.finalized;
    scanned+=result.data.scanned;
    cursor=result.data.next_cursor;
  } while(cursor);
  assert.equal(finalized,87);
  assert.equal(scanned,87);
  const ready=await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE submitted_at IS NOT NULL').first();
  assert.equal(ready.n,87);
  const notices=(await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM order_events WHERE type='letter_sent' AND detail='admin_bulk_finalize'"
  ).first()).n;
  assert.equal(notices,87);
});


test('campanha gratuita publica uma carta por encontrista sem criar Pix ou expor conteúdo no admin',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const uri='/api/admin/campaign/mini-mercado';
  assert.equal((await call(env,uri)).status,401);
  const original=(await call(env,uri,'GET',undefined,admin)).data;
  assert.equal(original.active_recipients,2);
  assert.equal(original.published_count,0);
  assert.match(original.campaign.markdown,/Não suma/);
  assert.match(original.campaign.whatsapp,/\{link\}/);

  const saved=await call(env,uri,'PUT',{
    ...original.campaign,title:'Para nossa nova família',
    markdown:original.campaign.markdown+'\\n\\n**Uma família que persevera.**',
  },admin);
  assert.equal(saved.status,200);
  const published=await call(env,uri+'/publish','POST',{cursor:''},admin);
  assert.equal(published.status,200);
  assert.equal(published.data.created,2);
  assert.equal(published.data.next_cursor,null);
  const rows=(await env.DB.prepare(
    'SELECT id,recipient_id,campaign_key,total_cents,pix_payload,txid,status,submitted_at,sender_name,rich_html '+
    'FROM orders ORDER BY id'
  ).all()).results;
  assert.equal(rows.length,2);
  assert.ok(rows.every(row=>row.status==='paid'&&row.submitted_at&&row.total_cents===0));
  assert.ok(rows.every(row=>row.campaign_key==='pos-encontro'&&row.pix_payload==='CORTESIA-SEM-PIX'));
  assert.ok(rows.every(row=>row.sender_name==='Mini Mercado XX EJC Simonésia'));
  assert.ok(rows.every(row=>row.rich_html.includes('<strong>Uma família que persevera.</strong>')));
  assert.equal((await call(env,uri,'GET',undefined,admin)).data.published_count,2);

  const republish=await call(env,uri+'/publish','POST',{cursor:''},admin);
  assert.equal(republish.status,200);
  assert.equal(republish.data.created,0);
  assert.equal((await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM orders WHERE campaign_key=?'
  ).bind('pos-encontro').first()).n,2);
  const paymentLookup=await call(env,'/api/admin/payments/search','POST',{},admin);
  assert.equal(paymentLookup.status,200);
  assert.equal(paymentLookup.data.payments.length,0);
  const recon=await call(env,'/api/admin/reconciliation/payments','GET',undefined,admin);
  assert.equal(recon.data.payments.length,0);
  const bootstrap=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  assert.equal(bootstrap.data.orders.length,0); // never count gifts as sales
  assert.ok(bootstrap.data.recipients.every(person=>
    person.ready_letter_count===1 && person.campaign_letter_count===1));
  assert.equal((await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data.letters.length,2);
});

test('campanha permite revisão do texto antes de ler, mas preserva cartas já lidas',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const url='/api/admin/campaign/mini-mercado';
  assert.equal((await call(env,url+'/publish','POST',{},admin)).status,200);
  const order=(await env.DB.prepare(
    'SELECT id,rich_html FROM orders WHERE campaign_key=? ORDER BY id'
  ).bind('pos-encontro').all()).results[0];
  await env.DB.prepare('UPDATE orders SET first_read_at=? WHERE id=?')
    .bind('2026-11-08T10:00:00.000Z',order.id).run();
  const current=(await call(env,url,'GET',undefined,admin)).data.campaign;
  const revised=await call(env,url,'PUT',{
    ...current,markdown:current.markdown+'\\n\\n**Novo pós-texto**',
  },admin);
  assert.equal(revised.status,200);
  const again=await call(env,url+'/publish','POST',{},admin);
  assert.equal(again.status,200);
  assert.equal(again.data.unchanged,1);
  const protectedOrder=await env.DB.prepare('SELECT rich_html FROM orders WHERE id=?')
    .bind(order.id).first();
  assert.equal(protectedOrder.rich_html,order.rich_html);
  assert.equal((await call(env,url,'PUT',{...current,whatsapp:'sem link'},admin)).status,400);
});

test('WhatsApp exige confirmação humana da imagem e permite reenviar mantendo contagem',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const target=list[0];
  const route='/api/admin/whatsapp/deliveries';
  assert.equal((await call(env,'/api/admin/recipients/'+target.id,'PATCH',{
    whatsapp_phone:'(33) 99999-9876'
  },admin)).status,200);
  const data={recipient_id:target.id,campaign_key:'pos-encontro',image_sent:true};
  assert.equal((await call(env,route,'POST',data)).status,401);
  assert.equal((await call(env,route,'POST',{...data,image_sent:false},admin)).status,400);
  assert.equal((await call(env,route,'POST',{...data,campaign_key:'fake'},admin)).status,400);
  const first=await call(env,route,'POST',data,admin);
  assert.equal(first.status,200);
  assert.equal(first.data.send_count,1);
  assert.equal(first.data.image_sent,1);
  const repeated=await call(env,route,'POST',data,admin);
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.send_count,2);
  const history=(await env.DB.prepare(
    'SELECT image_sent,message_template,sent_by FROM recipient_whatsapp_delivery_history '+
    'WHERE recipient_id=? AND campaign_key=?'
  ).bind(target.id,'pos-encontro').all()).results;
  assert.equal(history.length,2);
  assert.ok(history.every(item=>item.image_sent===1&&item.sent_by==='admin'));
  assert.ok(history.every(item=>!item.message_template.includes('m2.')));
  const bootstrap=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  const person=bootstrap.data.recipients.find(row=>row.id===target.id);
  assert.ok(person.campaign_wa_sent_at);
  assert.equal(person.campaign_wa_send_count,2);
  assert.equal(bootstrap.data.recipients.find(row=>row.id!==target.id).campaign_wa_sent_at,null);
});

test('apenas modo técnico com senha aprova rascunhos pagos após visualizar conteúdo salvo',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  env.TECH_PREVIEW_SECRET='conferencia-tecnica-ejc-2026-muito-segura';
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Remetente particular',
  });
  assert.equal(created.status,201);
  const url='/api/admin/technical-preview/'+created.data.id;
  const approvedUrl=url+'/finalize';
  const password=env.TECH_PREVIEW_SECRET;
  assert.equal((await call(env,approvedUrl,'POST',{password})).status,401);
  assert.equal((await call(env,approvedUrl,'POST',{password},admin)).status,409); // unpaid
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Uma mensagem de coragem e fé.</p>',
  },{token:created.data.token})).status,200);
  assert.equal((await call(env,'/api/admin/orders/'+created.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'RECEBIDOCONFERIDO2026',
    bank_checked:true,amount_checked:true
  },admin)).status,200);
  const missingPassword=await call(env,approvedUrl,'POST',{},admin);
  assert.equal(missingPassword.status,403);
  const technicalPreview=await call(env,url,'POST',{password},admin);
  assert.equal(technicalPreview.status,200);
  assert.match(technicalPreview.data.rich_html,/coragem e fé/);
  const standard=await call(env,'/api/admin/cartinhas','GET',undefined,admin);
  assert.ok(!JSON.stringify(standard.data).includes('Uma mensagem de coragem'));
  const done=await call(env,approvedUrl,'POST',{password},admin);
  assert.equal(done.status,200);
  const order=await env.DB.prepare(
    'SELECT submitted_at,moderation FROM orders WHERE id=?'
  ).bind(created.data.id).first();
  assert.ok(order.submitted_at);
  assert.equal(order.moderation,'approved');
  assert.equal((await call(env,approvedUrl,'POST',{password},admin)).status,409);

  const empty=await call(env,'/api/orders','POST',{recipient_slug:list[1].slug});
  assert.equal(empty.status,201);
  assert.equal((await call(env,'/api/admin/orders/'+empty.data.id+'/status','PATCH',{
    status:'paid',bank_reference:'RECEBIDOCONFERIDO2027',
    bank_checked:true,amount_checked:true
  },admin)).status,200);
  assert.equal((await call(env,'/api/admin/technical-preview/'+empty.data.id+'/finalize',
    'POST',{password},admin)).status,409);
});

test('publicação em massa percorre todos os encontristas sem duplicar em novas execuções',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const extra=Array.from({length:51},(_,i)=>'Encontrista extra '+i);
  const imported=await call(env,'/api/admin/recipients/import','POST',{names:extra},admin);
  assert.equal(imported.status,200);
  assert.equal(imported.data.inserted,51);
  const url='/api/admin/campaign/mini-mercado/publish';
  let cursor='',created=0,iterations=0;
  do{
    const response=await call(env,url,'POST',{cursor},admin);
    assert.equal(response.status,200);
    assert.ok(response.data.processed<=20);
    created+=response.data.created;
    cursor=response.data.next_cursor;
    iterations++;
  }while(cursor);
  assert.equal(iterations,3);
  assert.equal(created,53);
  const rows=(await env.DB.prepare(
    'SELECT recipient_id FROM orders WHERE campaign_key=?'
  ).bind('pos-encontro').all()).results;
  assert.equal(rows.length,53);
  assert.equal(new Set(rows.map(row=>row.recipient_id)).size,53);
  assert.equal((await call(env,url,'POST',{cursor:''},admin)).data.created,0);
});


test('admin autenticado confere texto, foto e áudio e aprova apenas rascunho pago com conteúdo', async () => {
  const env=fixture(),{admin,list}=await setup(env);
  const draft=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Amiga do encontro',
  });
  const id=draft.data.id, access=draft.data.token;
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Jesus caminha com você.</p>',
  },{token:access})).status,200);
  const mediaId=(await call(env,'/api/order/media/init','POST',{
    kind:'image',filename:'foto.png',content_type:'image/png',
  },{token:access})).data.id;
  assert.equal((await call(env,'/api/order/media/'+mediaId+'/part/1','PUT',
    new Uint8Array([137,80,78,71,5,6]),{token:access,raw:true})).status,200);
  assert.equal((await call(env,'/api/order/media/'+mediaId+'/complete','POST',{}, {token:access})).status,200);

  const previewUrl='/api/admin/cartinhas/'+id+'/preview';
  const mediaUrl=previewUrl+'/media/'+mediaId;
  assert.equal((await call(env,previewUrl)).status,401);
  assert.equal((await call(env,previewUrl,'GET',undefined,{token:access})).status,401);
  assert.equal((await call(env,mediaUrl)).status,401);
  assert.equal((await call(env,previewUrl,'POST',{},admin)).status,404);

  const preview=await call(env,previewUrl,'GET',undefined,admin);
  assert.equal(preview.status,200);
  assert.equal(preview.headers.get('Cache-Control'),'no-store');
  assert.match(preview.data.rich_html,/Jesus caminha com você/);
  assert.equal(preview.data.media.length,1);
  assert.equal(preview.data.media[0].filename,'foto.png');
  assert.equal('token_hash' in preview.data,false);
  const media=await call(env,mediaUrl,'GET',undefined,{...admin,binary:true});
  assert.equal(media.status,200);
  assert.equal(media.headers.get('Content-Type'),'image/png');
  assert.deepEqual([...media.data],[137,80,78,71,5,6]);

  const listing=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data;
  assert.equal(listing.letters.find(x=>x.id===id).has_content,true);
  assert.ok(!JSON.stringify(listing).includes('Jesus caminha com você'));
  assert.equal((await call(env,'/api/admin/cartinhas/'+id+'/finalize','POST',{})).status,401);
  assert.equal((await call(env,'/api/admin/cartinhas/'+id+'/finalize','POST',{},admin)).status,409);

  assert.equal((await call(env,'/api/admin/orders/'+id+'/status','PATCH',{
    status:'paid',bank_reference:'ADMINREVIEWMEDIA2026',
    bank_checked:true,amount_checked:true,
  },admin)).status,200);
  const finalized=await call(env,'/api/admin/cartinhas/'+id+'/finalize','POST',{},admin);
  assert.equal(finalized.status,200);
  assert.equal(finalized.data.submitted,true);
  assert.equal((await call(env,'/api/admin/cartinhas/'+id+'/finalize','POST',{},admin)).status,409);
  const order=await env.DB.prepare('SELECT moderation,submitted_at,rich_html FROM orders WHERE id=?').bind(id).first();
  assert.equal(order.moderation,'approved');
  assert.ok(order.submitted_at);
  assert.match(order.rich_html,/Jesus caminha com você/);
});

test('link temporário permite ao remetente concluir rascunho pago vazio sem invalidar token original',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Rafa',
  });
  const id=created.data.id,originalToken=created.data.token;
  assert.equal((await call(env,'/api/admin/orders/'+id+'/status','PATCH',{
    status:'paid',bank_reference:'ADMINRESUMELINK2026',
    bank_checked:true,amount_checked:true,
  },admin)).status,200);
  const route='/api/admin/cartinhas/'+id+'/resume-link';
  const approve='/api/admin/cartinhas/'+id+'/finalize';
  assert.equal((await call(env,approve,'POST',{},admin)).status,409);
  assert.equal((await call(env,route,'POST',{})).status,401);
  assert.equal((await call(env,route,'POST',{}, {token:originalToken})).status,401);

  const generated=await call(env,route,'POST',{},admin);
  assert.equal(generated.status,200);
  assert.equal(generated.data.sender_name,'Rafa');
  assert.ok(generated.data.resume_url.startsWith('https://ejc.test/pedido/r1_'));
  const resumeToken=new URL(generated.data.resume_url).pathname.split('/').pop();
  assert.match(resumeToken,/^r1_[A-F0-9]{12}_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);
  assert.equal((await call(env,'/api/order','GET',undefined,{token:resumeToken})).status,200);
  assert.equal((await call(env,'/api/order','GET',undefined,{token:originalToken})).status,200);
  const tampered=resumeToken.slice(0,-1)+(resumeToken.endsWith('X')?'Y':'X');
  assert.equal((await call(env,'/api/order','GET',undefined,{token:tampered})).status,404);
  const listing=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data;
  assert.equal(listing.letters.find(x=>x.id===id).has_content,false);
  assert.ok(!JSON.stringify(listing).includes(resumeToken));

  // After the deadline, the original bearer token may still complete an
  // already-paid unsubmitted draft. The signed recovery grant remains valid too.
  assert.equal((await call(env,'/api/admin/settings','PUT',{
    deadline:'2020-11-08T18:00',
  },admin)).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Original após o prazo</p>',
  },{token:originalToken})).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Persevere na fé! 💛</p>',sender_name:'Rafa',
  },{token:resumeToken})).status,200);
  assert.equal((await call(env,'/api/order/submit','POST',{}, {token:resumeToken})).status,200);
  assert.equal((await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Não deve editar novamente</p>',
  },{token:resumeToken})).status,403);
  assert.equal((await call(env,approve,'POST',{},admin)).status,409);
  const saved=await env.DB.prepare('SELECT submitted_at,rich_html FROM orders WHERE id=?').bind(id).first();
  assert.ok(saved.submitted_at);
  assert.match(saved.rich_html,/Persevere na fé/);
});

test('rascunho pago vazio é acompanhado até recuperação e aviso WhatsApp manual',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:person.slug,sender_name:'Remetente do teste'
  });
  assert.equal(created.status,201);
  const id=created.data.id;
  const token=created.data.token;
  const paid=await call(env,'/api/admin/orders/'+id+'/status','PATCH',{
    status:'paid',bank_reference:'E2ERECOVER12345678',bank_checked:true,amount_checked:true
  },admin);
  assert.equal(paid.status,200);

  let letters=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data.letters;
  let letter=letters.find(row=>row.id===id);
  assert.equal(letter.empty_paid_observed,true);
  assert.equal(letter.recovered_at,null);
  assert.equal(letter.has_content,false);

  const saved=await call(env,'/api/order/message','PUT',{
    rich_html:'<p>Mensagem de carinho recuperada.</p>',
    sender_name:'Remetente do teste'
  },{token});
  assert.equal(saved.status,200);
  assert.equal(saved.data.repaired,true);
  letters=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data.letters;
  letter=letters.find(row=>row.id===id);
  assert.ok(letter.recovered_at);
  assert.equal(letter.has_content,true);
  assert.equal(letter.submitted,false);
  assert.equal('rich_html' in letter,false);
  assert.equal('media' in letter,false);

  assert.equal((await call(env,'/api/order/submit','POST',{}, {token})).status,200);
  assert.equal((await call(env,'/api/admin/recipients/'+person.id,'PATCH',{
    whatsapp_phone:'33999546031'
  },admin)).status,200);
  const prepared=await call(env,'/api/admin/cartinhas/'+id+'/ready-whatsapp',
    'POST',{},admin);
  assert.equal(prepared.status,200);
  assert.equal(prepared.data.phone,'5533999546031');
  assert.equal(prepared.data.order_id,id);
  const url=new URL(prepared.data.url);
  assert.equal(url.searchParams.get('utm_campaign'),'cartinha_recuperada');
  assert.ok(url.hash.startsWith('#token=m2.'));
  assert.equal(url.searchParams.has('token'),false);
  const sent=await call(env,'/api/admin/cartinhas/'+id+'/ready-whatsapp/confirm',
    'POST',{},admin);
  assert.equal(sent.status,200);
  letters=(await call(env,'/api/admin/cartinhas','GET',undefined,admin)).data.letters;
  assert.ok(letters.find(row=>row.id===id).recipient_notified_at);
  const events=(await call(env,'/api/admin/orders/'+id,'GET',undefined,admin)).data.history;
  assert.ok(events.some(event=>event.type==='empty_draft_recovered'));
});

test('admin publica a arte OG de suporte do encontrista em PNG 1200x630 na R2',async()=>{
  const env=fixture(),{admin}=await setup(env);
  const initial=await call(env,'/api/admin/og/help-recipient','GET',undefined,admin);
  assert.equal(initial.status,200);
  assert.equal(initial.data.ready,false);
  const bytes=new Uint8Array(30);
  bytes.set([137,80,78,71,13,10,26,10],0);
  const view=new DataView(bytes.buffer);
  view.setUint32(16,1200);view.setUint32(20,630);
  const upload=await worker.fetch(new Request(
    'https://ejc.test/api/admin/og/help-recipient',{
      method:'POST',headers:{
        Origin:'https://ejc.test',Cookie:admin.cookie,'Content-Type':'image/png'
      },body:bytes
    }),env);
  assert.equal(upload.status,200);
  assert.equal((await upload.json()).ok,true);
  const status=await call(env,'/api/admin/og/help-recipient','GET',undefined,admin);
  assert.equal(status.status,200);
  assert.equal(status.data.ready,true);
  assert.match(status.data.url,/og-ajuda-minha-cartinha.png/);
  const image=await worker.fetch(new Request('https://ejc.test/og-ajuda-minha-cartinha.png'),env);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('Content-Type'),'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);
});

test('OG do rascunho usa nome do D1, PNG 1200x630 e não expõe token de edição',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  env.ASSETS.fetch=async()=>new Response(
    '<html><head><title>Original</title></head><body>SPA</body></html>',
    {headers:{'Content-Type':'text/html'}});
  const created=await call(env,'/api/orders','POST',{
    recipient_slug:list[0].slug,sender_name:'Pessoa que enviou'
  });
  assert.equal(created.status,201);
  const {id,token}=created.data;
  const paid=await call(env,'/api/admin/orders/'+id+'/status','PATCH',{
    status:'paid',bank_reference:'E2EDRAFTOG1234567',
    bank_checked:true,amount_checked:true
  },admin);
  assert.equal(paid.status,200);

  // A minimal valid PNG signature with IHDR dimensions suffices for upload
  // validation. Client-side Canvas tests verify that the real PNG is rendered.
  const png=new Uint8Array(24);
  png.set([137,80,78,71,13,10,26,10]);
  const header=new DataView(png.buffer);
  header.setUint32(16,1200);
  header.setUint32(20,630);
  const upload=await worker.fetch(new Request(
    'https://ejc.test/api/admin/og/draft?id='+id,{
      method:'POST',
      headers:{Origin:'https://ejc.test',Cookie:admin.cookie,'Content-Type':'image/png'},
      body:png,
    }
  ),env);
  assert.equal(upload.status,200);
  const uploaded=await upload.json();
  assert.equal(uploaded.ok,true);
  assert.equal(uploaded.recipients[0],list[0].name);
  assert.match(uploaded.og_url,/\/og-rascunho\/[a-f0-9]{64}\.png/);

  const crawler=await worker.fetch(new Request(
    'https://ejc.test/pedido/'+token+'?utm_source=whatsapp',{
      headers:{'User-Agent':'facebookexternalhit/1.1'}
    }
  ),env);
  assert.equal(crawler.status,200);
  const html=await crawler.text();
  assert.match(html,/Finalize sua cartinha/);
  assert.ok(html.includes(list[0].name));
  assert.match(html,/og:image/);
  assert.match(html,/og-rascunho\/[a-f0-9]{64}\.png/);
  assert.ok(!html.includes(token),'OG não deve conter credencial privada');

  const directImage=await worker.fetch(new Request('https://ejc.test'+
    uploaded.og_url),env);
  assert.equal(directImage.status,200);
  assert.match(directImage.headers.get('Content-Type'),/image\/png/);
  assert.equal((await directImage.arrayBuffer()).byteLength,24);

  const invalid=await worker.fetch(new Request(
    'https://ejc.test/pedido/credencial-invalida',{
      headers:{'User-Agent':'facebookexternalhit/1.1'}
    }
  ),env);
  assert.equal(invalid.status,200);
  const invalidHtml=await invalid.text();
  assert.ok(!invalidHtml.includes(list[0].name));
});

test('suporte criptografado recupera nome telefone IDs e UTMs só no admin',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  const order=await call(env,'/api/orders','POST',{
    recipient_slug:person.slug,sender_name:'Maria da Costa'
  });
  assert.equal(order.status,201);
  const id=order.data.id;
  const input={
    purpose:'support',name:'Maria da Costa',phone:'33999546031',
    ids:[id],recipientSlugs:[person.slug],
    source:'mural',medium:'botao',campaign:'suporte_encontrista',
    stage:'cartinha_aberta'
  };
  const forbidden=await call(env,'/api/support/context','POST',input);
  assert.equal(forbidden.status,403,'request without valid order access cannot claim IDs');

  const encrypted=await call(env,'/api/support/context','POST',input,admin);
  assert.equal(encrypted.status,201);
  assert.match(encrypted.data.link,/^https:\/\/ejc\.test\/s\/[A-Za-z0-9_-]{14}$/);
  assert.equal(encrypted.data.link.length,33);
  assert.match(encrypted.data.context_token,/^ec1_/);
  for(const value of ['33999546031','Maria','suporte_encontrista',id]){
    assert.equal(encrypted.data.link.includes(value),false);
    assert.equal(encrypted.data.admin_url.includes(value),false);
  }
  const parsed=new URL(encrypted.data.link);
  assert.equal(parsed.searchParams.size,0,'no PII or token in the short URL');
  const c=encrypted.data.context_token;

  const publicRead=await call(env,'/api/support/context?c='+encodeURIComponent(c));
  assert.equal(publicRead.status,403,'support context cannot be publicly decrypted');

  const loaded=await call(env,'/api/admin/support/context?c='+encodeURIComponent(c),'GET',
    undefined,admin);
  assert.equal(loaded.status,200);
  assert.equal(loaded.data.context.name,'Maria da Costa');
  assert.equal(loaded.data.context.phone,'5533999546031');
  assert.equal(loaded.data.context.campaign,'suporte_encontrista');
  assert.deepEqual(loaded.data.context.ids,[id]);
  assert.equal(loaded.data.orders[0].recipient_name,person.name);

  const redirected=await worker.fetch(new Request(encrypted.data.link,{
    headers:{'User-Agent':'Mozilla/5.0'}
  }),env);
  assert.equal(redirected.status,302);
  const destination=redirected.headers.get('Location');
  assert.match(destination,/\/ajuda\/minha-cartinha\?c=ec1_/);
  const whatsappRedirect=await worker.fetch(new Request(destination,{
    headers:{'User-Agent':'Mozilla/5.0'}
  }),env);
  assert.equal(whatsappRedirect.status,302);
  const wa=new URL(whatsappRedirect.headers.get('Location'));
  assert.equal(wa.origin,'https://api.whatsapp.com');
  assert.equal(wa.pathname,'/send');
  assert.equal(wa.searchParams.get('phone'),'5532999662604');
  const msg=wa.searchParams.get('text');
  assert.match(msg,/Maria da Costa/);
  const messageLinks=[...msg.matchAll(/https:\/\/ejc\.test\/s\/[A-Za-z0-9_-]{14}/g)].map(match=>match[0]);
  assert.equal(messageLinks.length,2,'both admin inspection and replies are short');
  const first=await worker.fetch(new Request(messageLinks[0]),env);
  assert.equal(first.status,302);
  assert.match(first.headers.get('Location'),/\/admin\/cartinhas\?c=ec1_/);
  const second=await worker.fetch(new Request(messageLinks[1]),env);
  assert.equal(second.status,302);
  assert.match(second.headers.get('Location'),/\/admin\/mensagens\?c=ec1_/);
  assert.ok(!msg.includes(id),'no raw order IDs in prefilled WhatsApp URL');
  assert.ok(!msg.includes('5533999546031'),'contact number remains inside encrypted context');
  assert.ok(!wa.searchParams.has('utm_campaign'));

  const preview=await worker.fetch(new Request(encrypted.data.link,{
    headers:{'User-Agent':'facebookexternalhit/1.1'}
  }),env);
  assert.equal(preview.status,200);
  const html=await preview.text();
  assert.match(html,/Preciso de ajuda com minha cartinha/);
  assert.match(html,/og-ajuda-minha-cartinha.png/);
  assert.ok(!html.includes('Maria da Costa'));

  const image=await worker.fetch(new Request('https://ejc.test/og-ajuda-minha-cartinha.png'),env);
  assert.equal(image.status,200);
  assert.equal(image.headers.get('Content-Type'),'image/png');
  const buffer=new DataView(await image.arrayBuffer());
  assert.equal(buffer.getUint32(16),1200);
  assert.equal(buffer.getUint32(20),630);
});

test('nome e telefone podem ser retomados por um link criptografado de envio',async()=>{
  const env=fixture(),{list}=await setup(env);
  const person=list[0];
  const created=await call(env,'/api/support/context','POST',{
    purpose:'send',name:'Ana Clara',phone:'33999546031',
    recipientSlugs:[person.slug],
    source:'whatsapp',medium:'mensagem',campaign:'enviar_cartinha'
  });
  assert.equal(created.status,201);
  assert.equal(created.data.send_urls.length,1);
  const sent=new URL(created.data.send_urls[0]);
  assert.match(sent.pathname,/^\/s\/[A-Za-z0-9_-]{14}$/);
  assert.equal(sent.searchParams.size,0);
  const c=created.data.context_token;
  assert.match(c,/^ec1_/);
  const expanded=await worker.fetch(new Request(sent.href),env);
  assert.equal(expanded.status,302);
  assert.equal(new URL(expanded.headers.get('Location')).pathname,'/enviar/'+person.slug);
  assert.ok(!sent.href.includes('33999546031'));
  const restored=await call(env,'/api/support/context?c='+encodeURIComponent(c));
  assert.equal(restored.status,200);
  assert.equal(restored.data.name,'Ana Clara');
  assert.equal(restored.data.phone,'5533999546031');
  assert.deepEqual(restored.data.recipientSlugs,[person.slug]);
  assert.equal('ids' in restored.data,false);
  assert.equal('campaign' in restored.data,false);
});

test('o código de mural válido recupera WhatsApp do encontrista só dentro do token cifrado',async()=>{
  const env=fixture(),{admin,list}=await setup(env);
  const person=list[0];
  const patched=await call(env,'/api/admin/recipients/'+person.id,'PATCH',{
    whatsapp_phone:'33999546031'
  },admin);
  assert.equal(patched.status,200);
  const codeResp=await call(env,'/api/admin/mural-codes/generate','POST',{
    regenerate:false
  },admin);
  assert.equal(codeResp.status,200);
  const details=await call(env,'/api/admin/bootstrap','GET',undefined,admin);
  const code=details.data.recipients.find(r=>r.id===person.id).mural_code;
  const redeemed=await call(env,'/api/mural/redeem','POST',{code});
  assert.equal(redeemed.status,200);
  const minted=await call(env,'/api/support/context','POST',{
    purpose:'support',name:'Nome inventado',phone:'',
    muralSlug:person.slug,recipientSlugs:[person.slug],
    campaign:'suporte_encontrista'
  },{token:redeemed.data.grant});
  assert.equal(minted.status,201);
  assert.ok(!minted.data.link.includes('33999546031'));
  const encrypted=minted.data.context_token;
  const inspected=await call(env,'/api/admin/support/context?c='+encrypted,
    'GET',undefined,admin);
  assert.equal(inspected.status,200);
  assert.equal(inspected.data.context.name,person.name);
  assert.equal(inspected.data.context.phone,'5533999546031');
});
