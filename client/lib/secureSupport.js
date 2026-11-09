import { api } from './api.js';

export async function createSecureSupportContext({
  purpose='support',name='',phone='',ids=[],recipientSlugs=[],checkoutId='',
  stage='',source='whatsapp',medium='link',campaign='suporte_cartinhas',
  content='suporte',muralSlug='',token
}={}){
  return api('/api/support/context',{
    method:'POST',token,
    data:{purpose,name,phone,ids,recipientSlugs,checkoutId,stage,
      source,medium,campaign,content,muralSlug}
  });
}

// Navigate through the encrypted support link in the same tab. The Worker
// redirects to WhatsApp; no about:blank window remains in Safari afterwards.
// A failed API request leaves the current page open so its error is visible.
export async function openSecureSupport(options={}) {
  const result = await createSecureSupportContext(options);
  window.location.assign(result.link);
  return result;
}

export function secureContextToken(url){
  try{return new URL(url,window.location.origin).searchParams.get('c')||'';}
  catch{return '';}
}
