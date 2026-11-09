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
export const money = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
export const btime = (iso) =>
  iso
    ? new Date(`${iso}:00-03:00`).toLocaleString('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      })
    : 'não definido';
export const privateOrder = (token) => `${location.origin}/pedido/${encodeURIComponent(token)}`;
export const share = async (file, name, text) => {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name, text });
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
  return 'download';
};
export const download = (data, name, type = 'application/octet-stream') => {
  const file = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(file),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};
export async function uploadMedia(file, kind, token, onProgress) {
  const init = await api('/api/order/media/init', {
    method: 'POST',
    token,
    data: { filename: file.name, content_type: file.type, kind },
  });
  const partSize = init.part_size || 8 * 1024 * 1024;
  for (let offset = 0, part = 1; offset < file.size; offset += partSize, part++) {
    const response = await fetch(`/api/order/media/${init.id}/part/${part}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      body: file.slice(offset, offset + partSize),
    });
    if (!response.ok)
      throw new Error((await response.json().catch(() => ({}))).error || 'Falha ao enviar arquivo');
    onProgress?.(Math.round(Math.min(1, (offset + partSize) / file.size) * 100));
  }
  await api(`/api/order/media/${init.id}/complete`, { method: 'POST', token, data: {} });
  return init.id;
}
// Never emit access tokens, private routes, names, message bodies or media URLs.
export function safeAnalyticsLocation(href) {
  const parsed=new URL(href);
  let path=parsed.pathname;
  path=path.replace(/^\\/(pedido|checkout)\\/[^/]+/, '/$1/:privado')
    .replace(/^\\/mural\\/[^/]+/, '/mural/:privado')
    .replace(/^\\/enviar\\/[^/]+/, '/enviar/:encontrista')
    .replace(/^\\/admin\\/pedidos\\/[^/]+/, '/admin/pedidos/:pedido');
  const safe=new URL(path,parsed.origin);
  for(const key of ['utm_source','utm_medium','utm_campaign','utm_content']){
    const value=parsed.searchParams.get(key);
    if(value&&/^[a-z0-9_-]{1,70}$/i.test(value))safe.searchParams.set(key,value);
  }
  return safe.toString();
}
export const track = (name, params = {}) => {
  if (!window.gtag || localStorage.getItem('ejc-consent') !== 'yes' ||
      !/^[a-z][a-z0-9_]{1,39}$/.test(name))return;
  const allowed=new Set(['page_path','letters','kind','stage','method','source','status',
    'is_recovered','count','success','format','locked','has_content']);
  const safe={};
  for(const [key,value] of Object.entries(params)){
    if(!allowed.has(key))continue;
    if(key==='page_path'){safe.page_path=new URL(safeAnalyticsLocation(location.href)).pathname;continue;}
    if(typeof value==='number'&&Number.isFinite(value))safe[key]=value;
    else if(typeof value==='boolean')safe[key]=value;
    else if(typeof value==='string'&&/^[a-z0-9_:-]{1,40}$/i.test(value))safe[key]=value;
  }
  window.gtag('event',name,{
    ...safe,page_location:safeAnalyticsLocation(location.href),
    page_referrer:location.origin+'/'
  });
};
export function enableAnalytics(id) {
  if (
    !/^G-[A-Z0-9]{6,20}$/.test(id) ||
    localStorage.getItem('ejc-consent') !== 'yes' ||
    window.__ejcAnalytics
  )
    return;
  window.__ejcAnalytics = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false, anonymize_ip: true,
    page_location: safeAnalyticsLocation(location.href), page_referrer:location.origin+'/' });
  const script = document.createElement('script');
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.async = true;
  document.head.appendChild(script);
}
