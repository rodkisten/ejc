import { api } from './api.js';
import { prepareWhatsAppPopup, closeWhatsAppPopup } from './whatsappNavigation.js';

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

// Open a blank popup synchronously with the user's tap (Chrome iOS). The
// encrypted link is generated asynchronously; the Worker then redirects
// directly to api.whatsapp.com without touching wa.me.
export async function openSecureSupport(options={}) {
  const popup = prepareWhatsAppPopup('Preparando atendimento do Mini Mercado…');
  try {
    const result = await createSecureSupportContext(options);
    const link = new URL(result.link, window.location.origin);
    if (link.origin !== window.location.origin ||
        !(/^\/s\/[A-Za-z0-9_-]{14}$/.test(link.pathname) ||
          (/^\/ajuda\/(?:terminei-a-cartinha|minha-cartinha)\/?$/.test(link.pathname) &&
           link.searchParams.has('c'))))
      throw new Error('Link seguro de suporte inválido.');
    if (popup && !popup.closed) popup.location.replace(link.toString());
    else window.location.assign(link.toString());
    return result;
  } catch (error) {
    closeWhatsAppPopup(popup);
    throw error;
  }
}

export function secureContextToken(url){
  try{return new URL(url,window.location.origin).searchParams.get('c')||'';}
  catch{return '';}
}
