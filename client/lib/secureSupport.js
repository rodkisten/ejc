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

// On iPhone Safari the blank window must open synchronously with the click.
// Never reveal a user's private token or the names/phone/UTMs in the URL.
export async function openSecureSupport(options={}){
  const popup=window.open('about:blank','_blank');
  if(popup){
    try{popup.opener=null;popup.document.body.textContent='Abrindo suporte do Mini Mercado…';}
    catch{/* Cross-origin windows do not allow document updates. */}
  }
  try{
    const result=await createSecureSupportContext(options);
    if(popup&&!popup.closed)popup.location.replace(result.link);
    else window.location.assign(result.link);
    return result;
  }catch(error){
    try{popup?.close();}catch{}
    throw error;
  }
}

export function secureContextToken(url){
  try{return new URL(url,window.location.origin).searchParams.get('c')||'';}
  catch{return '';}
}
