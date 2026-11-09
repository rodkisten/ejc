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
    help:'https://ejc.migos.club/s/AAAAAAAAAAAAAA',
    home:'https://ejc.migos.club/s/BBBBBBBBBBBBBB',
    open:'https://ejc.migos.club/s/CCCCCCCCCCCCCC',
    sendBySlug:{
      'maria-eduarda':'https://ejc.migos.club/s/DDDDDDDDDDDDDD',
      'joao-pedro':'https://ejc.migos.club/s/EEEEEEEEEEEEEE'
    },
    admin:'https://ejc.migos.club/s/FFFFFFFFFFFFFF',
    recipientHelp:'https://ejc.migos.club/s/GGGGGGGGGGGGGG'
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
  assert.match(msg,/https:\/\/ejc\.migos\.club\/s\/AAAAAAAAAAAAAA/);
  assert.doesNotMatch(msg,/utm_source=|id=EJC-|telefone=/);
});

test('rascunho vazio inclui nomes, link privado, mas referencias somente no contexto cifrado',()=>{
  const msg=createSupportMessage('rascunho_vazio',{
    ...ctx,resumeUrl:'https://ejc.migos.club/s/HHHHHHHHHHHHHH'
  });
  assert.match(msg,/Oi, Ana!/);
  assert.match(msg,/Maria Eduarda, João Pedro/);
  assert.match(msg,/link privado de continuação/);
  assert.match(msg,/\/s\/HHHHHHHHHHHHHH/);
  assert.match(msg,/\/s\/FFFFFFFFFFFFFF/);
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
  assert.match(steps,/\/s\/DDDDDDDDDDDDDD/);
  assert.match(steps,/\/s\/EEEEEEEEEEEEEE/);
  assert.doesNotMatch(steps,/utm_content=/);
  assert.match(steps,/Finalizar envio/);
  const open=createSupportMessage('abrir_novamente',ctx);
  assert.match(open,/\/s\/CCCCCCCCCCCCCC/);
  assert.match(open,/para o \*encontrista ler\*/);
  assert.match(open,/link privado de compra\/edição/);
});

test('mensagem de aguarde mantém o cuidado e não promete conclusão antecipada',()=>{
  const msg=createSupportMessage('aguardando',ctx);
  assert.match(msg,/aguarde só um pouquinho/);
  assert.match(msg,/Não precisa escrever ou pagar novamente/);
  assert.doesNotMatch(msg,/já foi recebida direitinho/);
});
