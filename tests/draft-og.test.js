import test from 'node:test';
import assert from 'node:assert/strict';
import {draftOgNames,draftOgIds,draftOgCaption,draftOgTitle} from '../shared/draftOg.js';
import {createDraftOgImage,publishDraftOg,DRAFT_OG_WIDTH,DRAFT_OG_HEIGHT} from '../client/lib/draftOg.js';

test('texto da OG usa nomes reais no singular e plural, sem Fulano',()=>{
  assert.equal(draftOgCaption([]),'Vamos finalizar e fazer alguém feliz?');
  assert.equal(draftOgCaption(['Maria Eduarda']),'Vamos finalizar e deixar Maria Eduarda feliz?');
  assert.equal(draftOgCaption(['Maria Eduarda','João Pedro']),
    'Vamos finalizar e deixar Maria Eduarda e João Pedro felizes?');
  assert.equal(draftOgCaption(['Maria','João','Ana']),
    'Vamos finalizar e deixar Maria, João e mais 1 encontrista felizes?');
  assert.deepEqual(draftOgNames(['  Maria  Eduarda ','Maria Eduarda','João']),['Maria Eduarda','João']);
  assert.deepEqual(draftOgIds(['EJC-123456789ABC','EJC-123456789ABC','invalid']),
    ['EJC-123456789ABC']);
  assert.match(draftOgTitle(['Maria']),/^Finalize sua cartinha 💌/);
  assert.match(draftOgTitle(['Maria']),/Maria/);
});

function canvasFixture(){
  const drawn=[];
  const ctx={
    createLinearGradient:()=>({addColorStop:()=>{}}),
    fillRect:()=>{},beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},closePath:()=>{},
    fill:()=>{},stroke:()=>{},roundRect:()=>{},save:()=>{},restore:()=>{},
    translate:()=>{},rotate:()=>{},arc:()=>{},
    measureText:value=>({width:String(value).length*13}),
    fillText:text=>drawn.push(String(text)),
  };
  const canvas={width:0,height:0,getContext:()=>ctx,
    toBlob:(cb,type)=>cb(new Blob(['test-png'],{type}))};
  return {canvas,drawn};
}

test('Canvas renderiza PNG de WhatsApp com os nomes selecionados',async()=>{
  const before=globalThis.document;
  const mock=canvasFixture();
  globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>mock.canvas};
  try{
    const blob=await createDraftOgImage(['Maria Eduarda','João Pedro']);
    assert.equal(blob.type,'image/png');
    assert.equal(mock.canvas.width,DRAFT_OG_WIDTH);
    assert.equal(mock.canvas.height,DRAFT_OG_HEIGHT);
    assert.ok(mock.drawn.some(text=>text.includes('FINALIZE SUA')));
    assert.ok(mock.drawn.some(text=>text.includes('CARTINHA')));
    assert.ok(mock.drawn.some(text=>text.includes('Maria Eduarda')));
    assert.ok(mock.drawn.some(text=>text.includes('João Pedro')));
    assert.ok(!mock.drawn.some(text=>/Fulano/i.test(text)));
  }finally{globalThis.document=before;}
});

test('Publicação automática envia PNG com IDs válidos, nunca tokens',async()=>{
  const beforeDocument=globalThis.document,beforeFetch=globalThis.fetch;
  const mock=canvasFixture();
  const requests=[];
  globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>mock.canvas};
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>({ok:true,recipients:['Maria Eduarda','João Pedro']})};
  };
  try{
    const result=await publishDraftOg([
      {id:'EJC-123456789ABC',recipient_name:'Maria Eduarda'},
      {id:'EJC-123456789ABD',recipient_name:'João Pedro'}
    ]);
    assert.equal(result.ok,true);
    assert.equal(requests.length,1);
    const url=new URL(requests[0].url,'https://ejc.migos.club');
    assert.equal(url.pathname,'/api/admin/og/draft');
    assert.deepEqual(url.searchParams.getAll('id'),
      ['EJC-123456789ABC','EJC-123456789ABD']);
    assert.equal(requests[0].options.headers['Content-Type'],'image/png');
    assert.equal(requests[0].options.body.type,'image/png');
    assert.ok(!url.href.includes('token'));
  }finally{globalThis.fetch=beforeFetch;globalThis.document=beforeDocument;}
});
