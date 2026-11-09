import { completedLetterHelpLink, recipientSupportLink } from './helpLink.js';

export const SUPPORT_MESSAGE_TEMPLATES = [
  { id: 'desculpas', title: '💌 Pedimos desculpas', group: 'Recuperação', summary: 'Mensagem carinhosa sobre o sistema feito em dois dias.' },
  { id: 'rascunho_vazio', title: '⚠️ Cartinha vazia / rascunho', group: 'Recuperação', summary: 'Identifica remetente, encontrista(s) e os pedidos afetados.' },
  { id: 'abrir_novamente', title: '🔐 Entre na sua cartinha novamente', group: 'Orientações', summary: 'Explica a diferença entre o mural do encontrista e o editor.' },
  { id: 'recebida', title: '✅ Sua cartinha foi recebida!', group: 'Confirmação', summary: 'Disponível apenas quando os pedidos selecionados estão pagos e enviados.', requiresSubmitted: true },
  { id: 'aguardando', title: '⏳ Estamos dando uma olhadinha', group: 'Acompanhamento', summary: 'Pedido gentil para aguardar a verificação.' },
  { id: 'passo_a_passo', title: '📝 Passo a passo para enviar', group: 'Orientações', summary: 'Da escolha do encontrista à finalização.' },
  { id: 'pedir_nome', title: '👋 Qual é seu nome?', group: 'Atendimento', summary: 'Use quando o nome não veio no link ou no rascunho.', allowsMissingName: true },
  { id: 'link_privado', title: '🔑 Reabrir edição por link privado', group: 'Recuperação', summary: 'Use somente com um link privado válido para o remetente.' },
  { id: 'fotos_audio', title: '📸 Fotos e áudio não apareceram', group: 'Orientações', summary: 'Orientações para conferir anexos sem pedir dados privados.' },
  { id: 'mais_informacoes', title: '🔎 Precisamos de mais informações', group: 'Acompanhamento', summary: 'Solicita a descrição do erro e o ID, sem solicitar tokens nem textos de cartas.' },
  { id: 'problema_resolvido', title: '🌷 Problema resolvido', group: 'Confirmação', summary: 'Avisa que a dificuldade foi corrigida e pede uma nova conferência.' },
];

export function validContactName(name) {
  const value=String(name||'').replace(/\s+/g,' ').trim();
  return value.length>=2 && value.length<=100 &&
    !/^(?:remetente(?: não informado)?|an[oô]nimo|sem nome|uma pessoa especial|desconhecido)$/i.test(value);
}

export function supportRecipientNames(values) {
  return [...new Set((values||[]).map(value=>String(value||'').trim()).filter(Boolean))];
}

function trackedUrl(origin,pathname,content,campaign='suporte_mensagens') {
  const url=new URL(pathname,origin);
  for(const [key,value] of Object.entries({
    utm_source:'whatsapp',utm_medium:'mensagem',utm_campaign:campaign,utm_content:content
  }))url.searchParams.set(key,value);
  return url.toString();
}

export function confirmedOrders(orders) {
  return Array.isArray(orders) && orders.length>0 &&
    orders.every(order=>order.submitted===true &&
      ['paid','preparing','delivered'].includes(order.status));
}

export function createSupportMessage(id,{
  contactName='',recipientNames=[],recipients=[],orders=[],
  origin='https://ejc.migos.club',resumeUrl='',secureLinks={},preview=false
}={}) {
  const name=validContactName(contactName)?String(contactName).trim():'';
  const first=name.split(/\s+/)[0]||'';
  const hello=first?'Oi, '+first+'! 🥰':'Oi! 🥰';
  const names=supportRecipientNames(recipientNames.length?
    recipientNames:(recipients||[]).map(recipient=>recipient.name));
  const people=names.length?names.join(', '):'seu(sua) encontrista';
  const forPeople=names.length?'para *'+people+'*':'para o(a) encontrista';
  const humanOrders=(orders||[]).filter(order=>/^EJC-[A-F0-9]{12}$/.test(order.id||''));
  const orderIds=humanOrders.map(order=>order.id);
  const orderLines=humanOrders.map(order=>
    '• '+order.id+' · '+(order.recipient_name||people)).join('\n');
  const generatedHelp=completedLetterHelpLink({
    sender:name,origin,campaign:'suporte_cartinhas',
    items:humanOrders.map(order=>({
      id:order.id,recipient_name:order.recipient_name||names[0]||''
    }))
  });
  const help=secureLinks.help||generatedHelp;
  const home=secureLinks.home||trackedUrl(origin,'/','inicio');
  const open=secureLinks.open||trackedUrl(origin,'/abrir','abrir_mural');
  const sendLinks=(recipients||[]).filter(recipient=>recipient.slug).map(recipient=>
    '• *'+recipient.name+':* '+(secureLinks.sendBySlug?.[recipient.slug]||trackedUrl(origin,
      '/enviar/'+encodeURIComponent(recipient.slug),'enviar_cartinha'))
  );
  const howToSend=(sendLinks.length?sendLinks.join('\n'):home);
  const generatedRecipientHelp=recipientSupportLink({
    name:names[0]||'',ids:orderIds,origin,
    source:'whatsapp',medium:'mensagem',campaign:'suporte_cartinhas',
    content:'ajuda_encontrista',stage:'orientacoes'
  });
  const recipientHelp=secureLinks.recipientHelp||generatedRecipientHelp;
  const sign='\n\n*Com carinho,*\n🌹 *Equipe do Mini Mercado*\n*XX EJC Simonésia* 💛';
  const refs=orderLines?'\n\n📋 *Referência das cartinhas:*\n'+orderLines:'';
  const noNewPix='\n\n💛 *Se você já pagou, não precisa fazer outro Pix.*';
  const template=SUPPORT_MESSAGE_TEMPLATES.find(item=>item.id===id);
  if(!template)throw new Error('Modelo de mensagem desconhecido.');
  if(!name&&!template.allowsMissingName&&!preview)
    throw new Error('Informe o nome de quem entrou em contato antes de preparar a mensagem.');
  if(id==='recebida'&&!preview&&!confirmedOrders(humanOrders))
    throw new Error('Selecione pelo menos uma cartinha paga e efetivamente enviada para confirmar o recebimento.');

  switch(id){
    case 'desculpas':
      return [
        '💌 *UM RECADINHO COM MUITO CARINHO DA EQUIPE DO MINI MERCADO DO XX EJC* 🌹❤️','',
        hello,'',
        'Antes de tudo, queremos te pedir *mil desculpas* por qualquer dificuldade que você tenha encontrado ao enviar sua cartinha '+forPeople+'. 🥹💛','',
        'Essa é a nossa primeira experiência com esse sistema, que nós mesmos criamos em apenas *dois dias, com muito amor, dedicação e carinho*, para que cada encontrista pudesse receber mensagens especiais de quem o ama. 💖','',
        'Como tudo foi feito em tão pouco tempo, alguns imprevistos podem ter acontecido. Estamos fazendo o possível para que *nenhuma mensagem de amor fique pelo caminho!* 💌✨','',
        '🙏 *Por isso, queremos te pedir um favorzinho:*','',
        'Acesse novamente nosso site:',
        home,'',
        '📝 *Se sua cartinha aparecer como rascunho*, abra-a, confira e finalize o envio. Se você tiver o link privado da cartinha, use esse mesmo link para continuar a edição.','',
        '💗 *Se estiver vazia ou o texto não aparecer*, pedimos com muito carinho que você escreva sua mensagem novamente.','',
        '✅ *Assim que terminar, por favor, nos avise pelo WhatsApp:*',help,'',
        'O link já identifica suas cartinhas para a equipe. Vamos te orientar sobre o próximo passo e confirmar que a mensagem foi recebida direitinho. 🥹❤️',
        noNewPix,refs,'',
        'Agradecemos de coração pela paciência, compreensão e confiança. Estamos aprendendo, mas uma coisa é certa: *tudo isso foi feito com muito amor!* 🌷','',
        'Que Deus abençoe você por dedicar um pedacinho do seu tempo para fazer alguém se sentir tão amado! 🙏✨',
        sign
      ].join('\n');
    case 'rascunho_vazio':
      return [
        '💌 *Precisamos de uma ajudinha com sua cartinha!*','',
        hello,'',
        'Estamos conferindo sua homenagem '+forPeople+' e notamos que *a mensagem ainda aparece vazia ou como rascunho no sistema.* 🥹',
        'Queremos muito que esse carinho chegue direitinho ao seu destino!','',
        resumeUrl?'🔐 *Acesse sua cartinha pelo link privado de continuação:*\n'+resumeUrl+'\n':'',
        '📝 *Pode nos ajudar?*','1️⃣ Entre novamente no *link privado de edição* usado durante a compra.','2️⃣ Confira se seu texto, fotos ou áudio ainda estão lá.','3️⃣ Se não aparecerem, escreva sua cartinha novamente com carinho.','4️⃣ Salve as alterações e toque em *Finalizar envio*.','5️⃣ Avise nossa equipe assim que terminar:',help,
        noNewPix,refs,'',
        'Se não souber onde está o link de edição, responda aqui. Vamos te orientar pessoalmente. 💛',
        sign
      ].join('\n');
    case 'abrir_novamente':
      return [
        '🔐 *Vamos abrir suas cartinhas novamente?*','',hello,'',
        'Para consultar o *mural secreto* de '+people+', acesse:',
        open,'',
        '1️⃣ Digite o *código pessoal de seis caracteres* entregue ao encontrista.','2️⃣ Abra o mural.','3️⃣ Toque nos envelopes para ler as mensagens que já estiverem disponíveis.','',
        '💡 *Atenção:* /abrir é para o *encontrista ler*. Para *editar ou finalizar uma cartinha que você escreveu*, use seu link privado de compra/edição, não o código do mural.','',
        'Se ainda aparecer algum erro, nos avise por aqui:',help,refs,sign
      ].join('\n');
    case 'recebida':
      return [
        '💌✅ *Prontinho, '+first+'!*','',
        'Sua cartinha '+forPeople+' *foi recebida direitinho pelo nosso sistema!* 🥹❤️','',
        'Agora vamos preparar e encaminhar o acesso ao encontrista. Quando o mural estiver liberado, ele poderá abrir a sua mensagem, junto de todo o carinho que recebeu. 🌹','',
        '✨ Você também pode contar para ele que existe uma surpresa esperando no *mural secreto* do XX EJC, mas *não compartilhe seu link privado de edição*.','',
        '🔐 O encontrista poderá usar o código pessoal dele em:',open,
        refs,'',
        'Muito obrigado pela paciência e por participar dessa corrente de amor e fé! 🙏💛',
        sign
      ].join('\n');
    case 'aguardando':
      return [
        '🌷 *Estamos cuidando da sua solicitação!*','',hello,'',
        'Recebemos seu contato sobre as cartinhas '+forPeople+' e *já estamos dando uma olhadinha com muito carinho.* 💌','',
        '🙏 Pedimos encarecidamente que aguarde só um pouquinho enquanto conferimos o que aconteceu.','',
        'Assim que tivermos uma orientação segura, vamos te responder por aqui. Não precisa escrever ou pagar novamente enquanto estamos verificando. 💛',
        refs,sign
      ].join('\n');
    case 'passo_a_passo':
      return [
        '💌 *PASSO A PASSO PARA ENVIAR SUA CARTINHA*','',hello,'',
        'Vamos fazer esse carinho chegar '+(names.length?'para *'+people+'*':'ao encontrista')+'! 🥰','',
        '1️⃣ *Acesse o site:*',home,'',
        '2️⃣ *Escolha o(s) encontrista(s)* para quem deseja escrever:',
        howToSend,'',
        '3️⃣ *Escreva com carinho.* Você pode escolher as cores, a fonte e os adesivos. Também é possível anexar fotos e áudio.','',
        '4️⃣ *Adicione ao carrinho.* Se forem várias cartas, você pode fazer uma para cada encontrista.','',
        '5️⃣ *Confira o Pix.* Guarde o link privado da compra. Se já tiver pago, não faça outro pagamento.','',
        '6️⃣ *Depois da confirmação do pagamento, volte ao link privado da cartinha, confira e toque em Finalizar envio.*','',
        '7️⃣ *Avise a equipe* para conferirmos o recebimento:',help,'',
        '✨ Se aparecer rascunho, você ainda pode terminar a edição. Estamos aqui para ajudar!',
        refs,sign
      ].join('\n');
    case 'pedir_nome':
      return [
        '💌 *Oi! Que bom receber sua mensagem!* 🥰','',
        'Para encontrarmos a sua cartinha e te ajudarmos do jeitinho certo, poderia nos dizer *seu nome* e *para qual encontrista ou encontristas você enviou a homenagem*?','',
        'Se você tiver um *código de pedido* começando com EJC-, pode nos informar também. *Não envie senhas, tokens, o link privado de edição nem o conteúdo da cartinha.*','',
        'Assim que você nos contar, seguimos juntinhos com a conferência. 💛',
        sign
      ].join('\n');
    case 'link_privado':
      return [
        '🔑 *Vamos continuar sua cartinha?*','',hello,'',
        'A homenagem '+forPeople+' pode ser retomada pelo *mesmo link privado de edição* que foi gerado na compra.',
        resumeUrl?'\n💌 *Seu link de continuação (pessoal):*\n'+resumeUrl:
          '\nSe você perdeu esse link, responda aqui para a equipe te ajudar a recuperá-lo. Não use o código pessoal do mural para editar.',
        '',
        'Confira seu texto, fotos e áudio, salve e toque em *Finalizar envio*.',
        noNewPix,refs,sign
      ].join('\n');
    case 'fotos_audio':
      return [
        '📸🎙️ *Vamos conferir suas fotos e áudios?*','',hello,'',
        'Recebemos sua dúvida sobre os anexos da cartinha '+forPeople+'.','',
        '1️⃣ Entre no seu link privado de edição.','2️⃣ Confira se as fotos e os áudios aparecem na prévia.','3️⃣ Se faltar algum anexo, tente adicioná-lo novamente e aguarde o upload terminar.','4️⃣ Salve e finalize o envio.','',
        'Se não conseguir, informe o que aparece na tela. Não precisa mandar os arquivos pessoais à coordenação. 💛',
        help,refs,sign
      ].join('\n');
    case 'mais_informacoes':
      return [
        '🔎 *Vamos descobrir juntos o que aconteceu?*','',hello,'',
        'Para conferirmos a sua cartinha '+forPeople+', pode nos contar:','',
        '• Em qual etapa o problema aconteceu?','• Qual foi a mensagem de erro que apareceu?','• Está usando celular ou computador?','• A cartinha aparece como rascunho, vazia ou enviada?','',
        '📋 Se tiver o *ID do pedido (EJC-...)*, pode informar. Não envie seu link privado, código de acesso, fotos, áudio ou texto da mensagem.',
        refs,sign
      ].join('\n');
    case 'problema_resolvido':
      return [
        '🌷✅ *Temos uma boa notícia, '+first+'!*','',
        'A dificuldade que você relatou com a cartinha '+forPeople+' foi corrigida. 💌','',
        'Pode abrir novamente e conferir se está tudo certinho? Para ler como encontrista, use:',open,'',
        'Para editar uma mensagem que você escreveu, use *o link privado de edição* da sua compra.','',
        'Se algo ainda não aparecer, é só responder por aqui. A gente continua com você até resolver! 💛',
        refs,sign
      ].join('\n');
    default:
      throw new Error('Modelo de mensagem desconhecido.');
  }
}
