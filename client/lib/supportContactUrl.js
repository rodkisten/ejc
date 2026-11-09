import { normalizeBrazilianWhatsApp } from './recipientWhatsApp.js';

// Admin-only operational context. Do not include private /pedido or /checkout tokens.
export function supportContactParams(value=''){
  const query=value instanceof URLSearchParams
    ? value
    : new URLSearchParams(String(value||'').replace(/^\?/,''));
  const name=String(query.get('nome')||query.get('contact_name')||'')
    .replace(/[\r\n<>]/g,' ').trim().slice(0,100);
  const phone=normalizeBrazilianWhatsApp(query.get('telefone')||query.get('contact_phone')||'');
  const recipients=query.getAll('encontrista')
    .filter(slug=>/^[a-z0-9-]{1,65}$/.test(slug)).slice(0,20);
  const orders=query.getAll('id')
    .filter(id=>/^EJC-[A-F0-9]{12}$/.test(id)).slice(0,20);
  const template=String(query.get('modelo')||'').replace(/[^a-z0-9_]/g,'').slice(0,50);
  return {name,phone,recipients,orders,template};
}

export function supportContactAdminUrl({
  name='',phone='',recipients=[],orders=[],template=''
}={}){
  const params=new URLSearchParams();
  const safeName=String(name||'').replace(/[\r\n<>]/g,' ').trim().slice(0,100);
  const normalizedPhone=normalizeBrazilianWhatsApp(phone);
  if(safeName)params.set('nome',safeName);
  if(normalizedPhone)params.set('telefone',normalizedPhone);
  [...new Set(recipients)].filter(x=>/^[a-z0-9-]{1,65}$/.test(x)).slice(0,20)
    .forEach(slug=>params.append('encontrista',slug));
  [...new Set(orders)].filter(x=>/^EJC-[A-F0-9]{12}$/.test(x)).slice(0,20)
    .forEach(id=>params.append('id',id));
  if(/^[a-z][a-z0-9_]{0,49}$/.test(template))params.set('modelo',template);
  const query=params.toString();
  return '/admin/mensagens'+(query?'?'+query:'');
}
