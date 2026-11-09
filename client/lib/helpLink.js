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
    '🆘 *Precisa de ajuda para abrir ou visualizar sua cartinha?*',
    recipientSupportLink({
      origin:new URL(url).origin,name:recipient_name,ids:[order_id],
      source:'whatsapp',medium:'mensagem',campaign:'cartinha_recuperada',
      content:'suporte_encontrista',stage:'convite_recuperada'
    }),
    '_O link de ajuda abre nosso WhatsApp com uma mensagem pronta. É só explicar o que aconteceu!_',
    '',
    '🔒 _O acesso ao mural é pessoal. Não o compartilhe._',
  ].join('\n');
}

// The short support URL carries operational context, never the mural grant.
// Navigation diagnostics are added only to links opened from the recipient's own screen.
export function recipientSupportLink({
  name='',ids=[],origin='https://ejc.migos.club',source='whatsapp',
  medium='mensagem',campaign='suporte_encontrista',content='convite',
  stage='',browser=null,viewport=null,language=null,online=null,openedAt=null
}={}){
  const link=new URL('/ajuda/minha-cartinha',origin);
  const normalizedName=String(name||'').replace(/[\r\n<>]/g,' ').trim().slice(0,100);
  if(normalizedName)link.searchParams.set('encontrista',normalizedName);
  for(const id of ids.slice(0,20)){
    if(/^EJC-[A-F0-9]{12}$/.test(String(id)))link.searchParams.append('id',id);
  }
  for(const [key,value] of Object.entries({
    utm_source:source,utm_medium:medium,utm_campaign:campaign,utm_content:content
  })){
    const safe=String(value||'').replace(/[^a-z0-9_-]/gi,'').slice(0,70);
    if(safe)link.searchParams.set(key,safe);
  }
  const safeStage=String(stage||'').replace(/[^a-z0-9_-]/gi,'').slice(0,50);
  if(safeStage)link.searchParams.set('etapa',safeStage);
  const diagnostics=[
    ['navegador',browser,260],['tela',viewport,30],
    ['idioma',language,40],['conexao',online,20],['horario',openedAt,45]
  ];
  for(const [key,value,max] of diagnostics){
    if(value!=null&&String(value).trim())link.searchParams.set(
      key,String(value).replace(/[\r\n<>]/g,' ').trim().slice(0,max)
    );
  }
  return link.toString();
}

// Build only on explicit user interaction; do not persist browser diagnostics.
export function recipientSupportFromBrowser({name='',ids=[],stage='mural'}={}){
  return recipientSupportLink({
    name,ids,origin:window.location.origin,
    source:'mural',medium:'link',campaign:'suporte_encontrista',
    content:stage==='cartinha_aberta'?'cartinha_aberta':'mural',
    stage,
    browser:navigator.userAgent,
    viewport:window.innerWidth+'x'+window.innerHeight,
    language:navigator.language,
    online:navigator.onLine?'online':'offline',
    openedAt:new Date().toISOString(),
  });
}
