export async function api(path, { method = 'GET', data, token, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Erro HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}
export const money = cents => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(cents || 0) / 100);
export const btime = iso => iso ? new Date(`${iso}:00-03:00`).toLocaleString('pt-BR', { dateStyle:'long', timeStyle:'short', timeZone:'America/Sao_Paulo' }) : 'não definido';
export const privateOrder = token => `${location.origin}/pedido/${encodeURIComponent(token)}`;
export const share = async (file, name, text) => {
  if (navigator.share && navigator.canShare?.({ files:[file] })) {
    await navigator.share({ files:[file], title:name, text });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href=url; a.download=file.name;a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
  return 'download';
};
export const download = (data,name,type='application/octet-stream') => {
  const file = data instanceof Blob ? data : new Blob([data], { type });
  const url=URL.createObjectURL(file), a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
};
export async function uploadMedia(file,kind,token,onProgress) {
  const init=await api('/api/order/media/init',{method:'POST',token,data:{filename:file.name,content_type:file.type,kind}});
  const partSize=init.part_size || 8*1024*1024;
  for(let offset=0,part=1;offset<file.size;offset+=partSize,part++) {
    const response=await fetch(`/api/order/media/${init.id}/part/${part}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream'},body:file.slice(offset,offset+partSize)});
    if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'Falha ao enviar arquivo');
    onProgress?.(Math.round(Math.min(1,(offset+partSize)/file.size)*100));
  }
  await api(`/api/order/media/${init.id}/complete`,{method:'POST',token,data:{}});
  return init.id;
}
export const track = (name, params={}) => { if (window.gtag && localStorage.getItem('ejc-consent') === 'yes') window.gtag('event',name,params); };
export function enableAnalytics(id) {
  if (!/^G-[A-Z0-9]{6,20}$/.test(id) || localStorage.getItem('ejc-consent') !== 'yes' || window.__ejcAnalytics) return;
  window.__ejcAnalytics = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  window.gtag('js',new Date());window.gtag('config',id,{send_page_view:false,anonymize_ip:true});
  const script=document.createElement('script');script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;script.async=true;document.head.appendChild(script);
}
