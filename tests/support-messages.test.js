import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_MESSAGE_TEMPLATES, validContactName, createSupportMessage, confirmedOrders,
} from '../client/lib/supportMessages.js';

const ctx={
  contactName:'Ana Carolina',
  recipientNames:['Maria Eduarda','João Pedro'],
  recipients:[
    {name:'Maria Eduarda',slug:'maria-eduarda'},
    {name:'João Pedro',slug:'joao-pedro'},
  ],
  orders:[
    {id:'EJC-123456789ABC',recipient_name:'Maria Eduarda',status:'paid',submitted:false},
    {id:'EJC-123456789ABD',recipient_name:'João Pedro',status:'paid',submitted:false},
  ],
  origin:'https://ejc.migos.club',
  secureLinks:{
    help:'https://ejc.migos.club/ajuda/terminei-a-cartinha?c=ec1_'+('A'.repeat(70)),
    home:'https://ejc.migos.club/?c=ec1_'+('A'.repeat(70)),
    open:'https://ejc.migos.club/abrir?c=ec1_'+('A'.repeat(70)),
    sendBySlug:{
      'maria-eduarda':'https://ejc.migos.club/enviar/maria-eduarda?c=ec1_'+('A'.repeat(70)),
      'joao-pedro':'https://ejc.migos.club/enviar/joao-pedro?c=ec1_'+('A'.repeat(70)),
    },
    admin:'https://ejc.migos.club/admin/mensagens?c=ec1_'+('A'.repeat(70)),
    recipientHelp:'https://ejc.migos.club/ajuda/minha-cartinha?c=ec1_'+('A'.repeat(70))
  }
};

test('todos os modelos de atendimento são renderizáveis com nomes e links',()=>{
  const ready={...ctx,orders:ctx.orders.map(item=>({...item,submitted:true}))};
  for(const model of SUPPORT_MESSAGE_TEMPLATES){
    const message=createSupportMessage(model.id,model.requiresSubmitted?ready:ctx);
    assert.ok(message.length>90,'Modelo vazio: '+model.id);
    assert.match(message,/Mini Mercado/);
    assert.match(message,/XX EJC Simonésia/);
    assert.doesNotMatch(message,/#token=|r1_[A-F0-9]+_|pix_payload|rich_html/);
  }
});

test('apology includes the exact two-day explanation, all recipients and names',()=>{
  const msg=createSupportMessage('desculpas',ctx);
  assert.match(msg,/Oi, Ana!/);
  assert.match(msg,/Maria Eduarda, João Pedro/);
  assert.match(msg,/apenas \*dois dias, com muito amor/);
  assert.match(msg,/mil desculpas/);
  assert.match(msg,/\/ajuda\/terminei-a-cartinha\?c=ec1_/);
  assert.doesNotMatch(msg,/utm_source=|id=EJC-|telefone=/);
});

test('rascunho vazio inclui nomes, link privado, mas referencias somente no contexto cifrado',()=>{
  const msg=createSupportMessage('rascunho_vazio',{
    ...ctx,resumeUrl:'https://ejc.migos.club/pedido/PRIVATE-RESUME-TOKEN'
  });
  assert.match(msg,/Oi, Ana!/);
  assert.match(msg,/Maria Eduarda, João Pedro/);
  assert.match(msg,/link privado de continuação/);
  assert.match(msg,/PRIVATE-RESUME-TOKEN/);
  assert.match(msg,/admin\/mensagens\?c=ec1_/);
  assert.doesNotMatch(msg,/id=EJC-|utm_source=|telefone=/);
});


test('modelo de confirmação não permite afirmar recebimento sem pedido pago e enviado',()=>{
  const waiting={...ctx,orders:ctx.orders};
  assert.equal(confirmedOrders(waiting.orders),false);
  assert.throws(()=>createSupportMessage('recebida',waiting),/paga e efetivamente enviada/);
  const ready={...ctx,orders:ctx.orders.map(item=>({...item,submitted:true}))};
  assert.equal(confirmedOrders(ready.orders),true);
  assert.match(createSupportMessage('recebida',ready),/foi recebida direitinho/);
  assert.match(createSupportMessage('recebida',ready),/encontrista/);
});

test('sem nome, exige identificação antes de gerar mensagens personalizadas',()=>{
  assert.equal(validContactName(''),false);
  assert.equal(validContactName('Remetente não informado'),false);
  assert.equal(validContactName('Uma pessoa especial'),false);
  assert.equal(validContactName('Ana Carolina'),true);
  assert.throws(()=>createSupportMessage('rascunho_vazio',{...ctx,contactName:''}),/Informe o nome/);
  assert.match(createSupportMessage('pedir_nome',{...ctx,contactName:''}),/poderia nos dizer \*seu nome\*/);
});

test('o passo a passo separa o link de leitura do link de edição',()=>{
  const steps=createSupportMessage('passo_a_passo',ctx);
  assert.match(steps,/\/enviar\/maria-eduarda\?c=ec1_/);
  assert.match(steps,/\/enviar\/joao-pedro\?c=ec1_/);
  assert.doesNotMatch(steps,/utm_content=/);
  assert.match(steps,/Finalizar envio/);
  const open=createSupportMessage('abrir_novamente',ctx);
  assert.match(open,/\/abrir\?c=ec1_/);
  assert.match(open,/para o \*encontrista ler\*/);
  assert.match(open,/link privado de compra\/edição/);
});

test('mensagem de aguarde mantém o cuidado e não promete conclusão antecipada',()=>{
  const msg=createSupportMessage('aguardando',ctx);
  assert.match(msg,/aguarde só um pouquinho/);
  assert.match(msg,/Não precisa escrever ou pagar novamente/);
  assert.doesNotMatch(msg,/já foi recebida direitinho/);
});
