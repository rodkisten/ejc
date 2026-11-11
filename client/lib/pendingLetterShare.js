import { whatsappMessageUrl } from '../../shared/whatsappText.js';

// This is a recipient-to-sender invitation. It deliberately carries no mural
// grants, sender names, order IDs, phone numbers or private editing links.
export function pendingLetterWhatsAppMessage(shortUrl) {
  const url = new URL(shortUrl);
  if (url.protocol !== 'https:' ||
      url.hostname !== 'ejc.migos.club' ||
      !/^\/s\/[A-Za-z0-9_-]{14}$/.test(url.pathname)) {
    throw new Error('Link de ajuda inválido.');
  }

  return [
    '💌 *Oi! Posso te pedir um carinho?* 💗',
    '',
    'Recebi a sua cartinha no mural do *XX EJC Simonésia*, mas parece que ela veio incompleta.',
    'Fiquei muito feliz em saber que você preparou algo para mim e estou com o coração cheio de curiosidade para ler suas palavras! 🥹💜',
    '',
    'Você poderia dar uma conferidinha e terminar o envio, por gentileza? Eu vou adorar conhecer o que você preparou com tanto carinho. 🥰',
    '',
    '🔗 *Aqui tem uma ajudinha para concluir:*',
    url.toString(),
    '',
    'Muito obrigado pelo carinho, pela lembrança e por dedicar um pedacinho do seu tempo a mim! 💖✨',
  ].join('\n');
}

export function pendingLetterWhatsAppUrl(shortUrl) {
  // No phone= parameter: WhatsApp lets the recipient choose who should get it.
  return whatsappMessageUrl({ message: pendingLetterWhatsAppMessage(shortUrl) });
}
