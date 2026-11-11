import { whatsappMessageUrl } from '../../shared/whatsappText.js';

// WhatsApp formatting uses *bold*, _italics_ and a plain URL.
export function normalizeBrazilianWhatsApp(value) {
  const digits=String(value||'').replace(/\D/g,'');
  if(!digits)return '';
  const canonical=(digits.length===10||digits.length===11)?'55'+digits:digits;
  return /^55[1-9][0-9][0-9]{8,9}$/.test(canonical)?canonical:'';
}

export function muralInvitationMessage({ name, url, count=1, openedCount=0, ids=[], supportUrl='' }) {
  const first=String(name||'').trim().split(/\s+/)[0]||'encontrista';
  const amount=Number(count)||1;
  const opened=Math.max(0,Math.min(amount,Number(openedCount)||0));
  const openedStatus=opened===0
    ? '💌 *Leitura:* nenhuma cartinha aberta até agora.'
    : opened===amount
      ? amount===1 ? '📖 *Leitura:* a cartinha já foi aberta! 💙'
        : '📖 *Leitura:* todas as '+amount+' cartinhas já foram abertas! 💙'
      : '📖 *Leitura:* '+opened+' de '+amount+' cartinhas já foram abertas. 💙';
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
    openedStatus,
    '',
    '_Este link é só seu, válido por 14 dias. Guarde com carinho e não compartilhe._',
    '_Se ainda aparecer fechado, ele abrirá no horário de liberação do Encontro._',
    '',
    '🆘 *Precisa de ajuda com suas cartinhas?*',
    supportUrl || new URL('/ajuda/minha-cartinha',new URL(url).origin).toString(),
    '_O link abre o WhatsApp da equipe com uma mensagem pronta._',
    '',
    '💗 *Este cantinho digital foi criado com muito amor pela equipe do Mini Mercado do XX EJC Simonésia:*',
    'Rodolfo Costa, Evelyne Pimentel, Tia Mariana e Tio Saulinho, Tia Daisy e Tio Davidson.',
    '',
    '✨ _Com carinho, de quem acredita na sua fé e na sua caminhada com Jesus!_',
  ].join('\n');
}

export function whatsappShareUrl({phone,message}) {
  const normalized=normalizeBrazilianWhatsApp(phone);
  if(!normalized)throw new Error('WhatsApp inválido. Cadastre o número com DDD.');
  return whatsappMessageUrl({ phone: normalized, message });
}
