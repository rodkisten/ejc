// WhatsApp formatting uses *bold*, _italics_ and a plain URL.
export function normalizeBrazilianWhatsApp(value) {
  const digits=String(value||'').replace(/\D/g,'');
  if(!digits)return '';
  const canonical=(digits.length===10||digits.length===11)?'55'+digits:digits;
  return /^55[1-9][0-9][0-9]{8,9}$/.test(canonical)?canonical:'';
}

export function muralInvitationMessage({ name, url, count=1 }) {
  const first=String(name||'').trim().split(/\s+/)[0]||'encontrista';
  const amount=Number(count)||1;
  return [
    '💌✨ *'+first+', seu coração tem correspondência!*',
    '',
    'O XX EJC Simonésia guardou uma surpresa para você! 💖',
    'Seu *mural secreto* tem '+amount+' '+(amount===1?'cartinha especial':'cartinhas especiais')+
      ', cheinhas de fé, palavras de carinho e lembranças de quem torce pela sua caminhada. 🕊️',
    '',
    '📖 _“Eu te amei com amor eterno.”_',
    '*Jeremias 31,3*',
    '',
    '🌱 Que a alegria deste Encontro continue florescendo em você. '+
      'Permaneça firme na fé: Deus não abandona a boa obra que começou no seu coração. *Filipenses 1,6*',
    '',
    '🔐 *Seu acesso pessoal ao mural:*',
    url,
    '',
    '_Este link é só seu, válido por 14 dias. Guarde com carinho e não compartilhe._',
    '_Se ainda aparecer fechado, ele abrirá no horário de liberação do Encontro._',
    '',
    '💗 *Com muito amor, equipe do Mini Mercado do XX EJC Simonésia:*',
    'Rodolfo Costa, Evelyne Pimentel, Tia Mariana e Tio Saulinho, Tia Daisy e Tio Davidson.',
    '',
    '✨ _Feito com carinho para celebrar sua caminhada com Jesus!_',
  ].join('\n');
}

export function whatsappShareUrl({phone,message}) {
  const normalized=normalizeBrazilianWhatsApp(phone);
  if(!normalized)throw new Error('WhatsApp inválido. Cadastre o número com DDD.');
  return 'https://wa.me/'+normalized+'?text='+encodeURIComponent(message);
}
