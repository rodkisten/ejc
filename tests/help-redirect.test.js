import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const base='https://ejc.migos.club';
const env={
  MEDIA:{head:async()=>null,get:async()=>null},
  ASSETS:{
    fetch:async()=>new Response('Página normal',{headers:{'Content-Type':'text/plain'}})
  }
};

async function visit(path,method='GET') {
  return worker.fetch(new Request(base+path,{method}),env);
}

test('link curto abre o WhatsApp com mensagem pronta e UTMs da divulgação',async()=>{
  const response=await visit('/ajuda/terminei-a-cartinha?remetente=Ana&utm_source=whatsapp&utm_medium=mensagem&utm_campaign=recuperacao_cartinhas');
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

test('link sem remetente pede o nome e preserva UTMs e IDs sem vazar token',async()=>{
  const response=await visit('/ajuda/terminei-a-cartinha?utm_campaign=suporte_cartinhas&id=EJC-123456789ABC&para=Maria&token=segredo');
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Qual é seu nome|Como podemos te chamar/);
  assert.match(html,/name="remetente"/);
  assert.match(html,/name="id" value="EJC-123456789ABC"/);
  assert.match(html,/name="para" value="Maria"/);
  assert.match(html,/name="utm_campaign" value="suporte_cartinhas"/);
  assert.doesNotMatch(html,/segredo|name="token"/);
  for(const path of ['/ajuda/terminei-a-cartinha?remetente=Ana',
    '/ajuda/terminei-a-cartinha/?remetente=Ana']){
    const sent=await visit(path);
    assert.equal(sent.status,302);
    const target=new URL(sent.headers.get('Location'));
    assert.match(target.searchParams.get('text'),/Olá, eu sou Ana/);
    assert.equal(target.searchParams.get('utm_source'),'whatsapp');
    assert.equal(target.searchParams.get('utm_medium'),'mensagem');
    assert.equal(target.searchParams.get('utm_campaign'),'recuperacao_cartinhas');
  }
});

test('link curto só permite GET/HEAD e não intercepta outras rotas',async()=>{
  const head=await visit('/ajuda/terminei-a-cartinha','HEAD');
  assert.equal(head.status,200);
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
  assert.match(message,/https:\/\/ejc.migos.club\/admin\/pedidos\/EJC-123456789ABC/);
  assert.doesNotMatch(message,/\/pedido\//);
  assert.doesNotMatch(message,/token=/);
});

test('link /ajuda/minha-cartinha abre WhatsApp personalizado com identificadores e diagnóstico',async()=>{
  const params=new URLSearchParams({
    encontrista:'Maria Eduarda',etapa:'cartinha_aberta',
    navegador:'Mobile Safari iOS',tela:'390x844',idioma:'pt-BR',
    conexao:'online',horario:'2026-11-09T13:05:00.000Z',
    utm_source:'mural',utm_medium:'link',utm_campaign:'suporte_encontrista',
    utm_content:'cartinha_aberta'
  });
  params.append('id','EJC-123456789ABC');
  params.append('id','EJC-123456789ABD');
  params.append('id','invalid');
  const response=await visit('/ajuda/minha-cartinha?'+params.toString());
  assert.equal(response.status,302);
  const redirect=new URL(response.headers.get('Location'));
  assert.equal(redirect.origin,'https://wa.me');
  assert.equal(redirect.pathname,'/5533999546031');
  assert.equal(redirect.searchParams.get('utm_source'),'mural');
  assert.equal(redirect.searchParams.get('utm_campaign'),'suporte_encontrista');
  const msg=redirect.searchParams.get('text');
  assert.match(msg,/encontrista \*Maria Eduarda\*/);
  assert.match(msg,/EJC-123456789ABC, EJC-123456789ABD/);
  assert.match(msg,/https:\/\/ejc\.migos\.club\/admin\/pedidos\/EJC-123456789ABC/);
  assert.match(msg,/Mobile Safari iOS/);
  assert.match(msg,/390x844/);
  assert.match(msg,/pt-BR/);
  assert.match(msg,/2026-11-09T13:05/);
  assert.match(msg,/O que está acontecendo/);
  assert.match(msg,/━━━━━━━━━━━━/);
  assert.doesNotMatch(msg,/token=|#token|r1_/);
  assert.doesNotMatch(msg,/invalid/);
});

test('link de suporte do encontrista oferece metadados OG ao WhatsApp, sem expor nome ou IDs',async()=>{
  const response=await worker.fetch(new Request(base+
    '/ajuda/minha-cartinha?encontrista=Maria&amigo=EJC-123456789ABC',{
    headers:{'User-Agent':'facebookexternalhit/1.1'}
  }),env);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Preciso de ajuda com minha cartinha/);
  assert.match(html,/og:image:width.*1200/);
  assert.match(html,/og:image:height.*630/);
  assert.match(html,/og-ajuda-minha-cartinha.png/);
  assert.doesNotMatch(html,/Maria|EJC-123456789ABC|wa\.me/);
});

test('suporte do encontrista pede identificação ausente antes de abrir o WhatsApp',async()=>{
  const response=await visit('/ajuda/minha-cartinha?utm_campaign=suporte_encontrista');
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/name="encontrista"/);
  assert.match(html,/name="utm_campaign" value="suporte_encontrista"/);
  const head=await visit('/ajuda/minha-cartinha','HEAD');
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  const withName=await visit('/ajuda/minha-cartinha?encontrista=Maria');
  assert.equal(withName.status,302);
  assert.match(new URL(withName.headers.get('Location')).searchParams.get('text'),/encontrista \*Maria\*/);
  const post=await visit('/ajuda/minha-cartinha','POST');
  assert.equal(post.status,405);
  assert.equal(post.headers.get('Allow'),'GET, HEAD');
});
