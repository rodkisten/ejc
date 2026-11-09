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

test('crawler do WhatsApp recebe metadados OG sem redirecionamento',async()=>{
  const response=await worker.fetch(new Request(base+'/ajuda/terminei-a-cartinha',{
    headers:{'User-Agent':'facebookexternalhit/1.1'}
  }),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'),/text\/html/);
  const html=await response.text();
  assert.match(html,/og:image/);
  assert.match(html,/og-ajuda-cartinhas.png/);
  assert.match(html,/Enviei minha cartinha, e agora/);
  assert.match(html,/og:image:width/);
  assert.doesNotMatch(html,/wa.me/);
});

test('link de ajuda inclui remetente, nomes, IDs e links internos para o admin, sem tokens',async()=>{
  const params=new URLSearchParams({
    remetente:'Ana',utm_campaign:'recuperacao_cartinhas',
  });
  params.append('id','EJC-123456789ABC');
  params.append('para','Maria Eduarda');
  const res=await visit('/ajuda/terminei-a-cartinha?'+params.toString());
  assert.equal(res.status,302);
  const target=new URL(res.headers.get('Location'));
  const message=target.searchParams.get('text');
  assert.match(message,/Olá, eu sou Ana/);
  assert.match(message,/Para Maria Eduarda: EJC-123456789ABC/);
  assert.match(message,/https:\/\/ejc.test\/admin\/pedidos\/EJC-123456789ABC/);
  assert.doesNotMatch(message,/\/pedido\//);
  assert.doesNotMatch(message,/token=/);
});
