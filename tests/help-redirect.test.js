import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const base='https://ejc.migos.club';
const env={
  ASSETS:{
    fetch:async()=>new Response('Página normal',{headers:{'Content-Type':'text/plain'}})
  }
};

async function visit(path,method='GET') {
  return worker.fetch(new Request(base+path,{method}),env);
}

test('link curto abre o WhatsApp com mensagem pronta e UTMs da divulgação',async()=>{
  const response=await visit('/ajuda/terminei-a-cartinha?utm_source=whatsapp&utm_medium=mensagem&utm_campaign=recuperacao_cartinhas');
  assert.equal(response.status,302);
  const target=new URL(response.headers.get('Location'));
  assert.equal(target.origin,'https://wa.me');
  assert.equal(target.pathname,'/5533999546031');
  assert.match(target.searchParams.get('text'),/cartinha do XX EJC Simonésia/);
  assert.match(target.searchParams.get('text'),/confirmar o recebimento/);
  assert.equal(target.searchParams.get('utm_source'),'whatsapp');
  assert.equal(target.searchParams.get('utm_medium'),'mensagem');
  assert.equal(target.searchParams.get('utm_campaign'),'recuperacao_cartinhas');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow, noarchive');
});

test('link sem parâmetros e com barra final também funciona',async()=>{
  for(const path of ['/ajuda/terminei-a-cartinha','/ajuda/terminei-a-cartinha/']){
    const response=await visit(path);
    assert.equal(response.status,302);
    const target=new URL(response.headers.get('Location'));
    assert.equal(target.searchParams.get('utm_source'),'whatsapp');
    assert.equal(target.searchParams.get('utm_medium'),'mensagem');
    assert.equal(target.searchParams.get('utm_campaign'),'recuperacao_cartinhas');
  }
});

test('link curto só permite GET/HEAD e não intercepta outras rotas',async()=>{
  const head=await visit('/ajuda/terminei-a-cartinha','HEAD');
  assert.equal(head.status,302);
  assert.equal(await head.text(),'');
  const post=await visit('/ajuda/terminei-a-cartinha','POST');
  assert.equal(post.status,405);
  assert.equal(post.headers.get('Allow'),'GET, HEAD');
  const other=await visit('/outra-pagina');
  assert.equal(other.status,200);
  assert.equal(await other.text(),'Página normal');
});
