export const SUPPORT_WHATSAPP = '5532999662604';

// Never send edit credentials, access tokens, hashes, or a full Pix BR Code
// to WhatsApp. Those would allow someone else to edit a private letter.
export function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(
      /\/(checkout|pedido)\/[^/]+(?=\/|$)/gi,
      '/$1/[acesso-privado]',
    );
    return url.toString();
  } catch {
    return 'URL indisponível';
  }
}

export function checkoutSupportMessage({
  step = 'Checkout',
  orderId = '',
  checkoutId = '',
  recipientNames = [],
  url = '',
  userAgent = '',
  language = '',
  viewport = '',
  online = '',
  timestamp = '',
}) {
  const lines = [
    'Olá! Preciso de ajuda com as cartinhas do XX EJC Simonésia.',
    '',
    '*Dados para suporte (sem código de acesso privado)*',
    'Etapa: ' + step,
    'Código do pedido/Pix: ' + (checkoutId || orderId || 'Ainda não gerado'),
    ...(orderId && checkoutId && orderId !== checkoutId ? ['Cartinha: ' + orderId] : []),
    'Destinatário(s): ' + (recipientNames.filter(Boolean).join(', ') || 'Ainda não selecionado'),
    'URL: ' + safeCheckoutUrl(url),
    'Navegador: ' + (userAgent || 'Não informado'),
    'Idioma: ' + (language || 'Não informado'),
    'Tela: ' + (viewport || 'Não informado'),
    'Conexão: ' + (online || 'Não informada'),
    'Horário: ' + (timestamp || 'Não informado'),
    '',
    '*O que aconteceu?*',
    '(Descreva o problema aqui.)',
  ];
  return lines.join('\n');
}

export function checkoutSupportHref(details) {
  return 'https://wa.me/' + SUPPORT_WHATSAPP +
    '?text=' + encodeURIComponent(checkoutSupportMessage(details));
}
