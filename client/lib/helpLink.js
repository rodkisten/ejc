// Only public operational identifiers are included. Never put a private link/token in query parameters.
export function completedLetterHelpLink({sender='',items=[],origin='https://ejc.migos.club',campaign='recuperacao_cartinhas'}={}){
  const url=new URL('/ajuda/terminei-a-cartinha',origin);
  url.searchParams.set('utm_source','whatsapp');
  url.searchParams.set('utm_medium','mensagem');
  url.searchParams.set('utm_campaign',campaign);
  if(sender.trim())url.searchParams.set('remetente',sender.trim().slice(0,100));
  for(const item of items.slice(0,15)){
    if(!/^EJC-[A-F0-9]{12}$/.test(item.id||''))continue;
    url.searchParams.append('id',item.id);
    url.searchParams.append('para',String(item.recipient_name||'').slice(0,100));
  }
  return url.toString();
}

export function readyLetterWhatsAppMessage({recipient_name,order_id,url,released=true}){
  const first=String(recipient_name||'encontrista').trim().split(/\s+/)[0];
  return [
    '💌✨ *'+first+', sua cartinha ficou prontinha!*',
    '',
    'Que alegria! A homenagem que estava sendo finalizada já foi preparada com muito carinho pela equipe do Mini Mercado do XX EJC Simonésia. 💖',
    released?'🔐 *Abra seu mural secreto para ver a surpresa:*':
      '🔐 *Guarde o acesso ao seu mural! Ele estará disponível no horário de liberação:*',
    url,'',
    '🌹 Que Deus abençoe sua caminhada e que você persevere sempre na fé! *Filipenses 1,6*',
    '',
    '_Com carinho, equipe do Mini Mercado · XX EJC Simonésia_',
    '_Referência para suporte: '+order_id+'_',
    '',
    '🔒 _Esse link é pessoal. Não o compartilhe._',
  ].join('\n');
}
