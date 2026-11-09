import { generatePix } from './pix.js';
import { normalizePaymentLookup, likeTerm, maskedStatus } from './paymentSearch.js';
import { isSquareRecipientJpeg } from './photo.js';
import { normalizeComposition, STICKERS_BY_ID, plainLetter } from '../shared/letter.js';
import { CAMPAIGN_KEY, CAMPAIGN_SENDER, DEFAULT_CAMPAIGN, letterMarkdownToHtml } from '../shared/ejcCampaign.js';
import { enqueue, enableReceipt, disableReceipt, confirmReceipt, markRead, queueRelease, dispatch, validateEmail, emailsReady } from './notify.js';

const PART_SIZE = 8 * 1024 * 1024;
const MIN_PART = 5 * 1024 * 1024;
const WRITE_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const BASE_HEADERS = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()'
};
class HttpError extends Error { constructor(status, message) { super(message); this.status=status; } }
const bad = (message, status=400) => { throw new HttpError(status, message); };
const result = (data, status=200, extra={}) => Response.json(data,{status,headers:{...BASE_HEADERS,...extra}});
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const hex = (array) => [...array].map(x=>x.toString(16).padStart(2,'0')).join('');
const randomCode = () => hex(crypto.getRandomValues(new Uint8Array(6))).toUpperCase();
const token = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const encode = new TextEncoder();
function b64url(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
function unb64url(s) { return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/') + '='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0)); }
async function digest(s) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(s)))); }
async function jsonBody(request, max=80_000) {
  const input = await request.text();
  if (input.length > max) bad('Requisição muito grande.',413);
  try { return JSON.parse(input); } catch { bad('JSON inválido.'); }
}
function normaliseWhatsAppPhone(raw) {
  const supplied=String(raw||'').trim();
  // An empty field intentionally removes a saved phone. Non-empty garbage
  // must not silently clear it (e.g. "ABC" used to return HTTP 200).
  if(!supplied)return '';
  const digits=supplied.replace(/\D/g,'');
  if(!digits)bad('Informe um WhatsApp brasileiro válido com DDD (ex.: 32 99966-2604).',400);
  const canonical=(digits.length===10||digits.length===11)?'55'+digits:digits;
  if(!/^55[1-9][0-9][0-9]{8,9}$/.test(canonical))
    bad('Informe um WhatsApp brasileiro válido com DDD (ex.: 32 99966-2604).',400);
  return canonical;
}
function assertText(value, max, label, required=true) {
  if (typeof value !== 'string') bad(`${label} inválido.`);
  const s=value.trim();
  if ((required && !s) || s.length>max) bad(`${label} deve conter até ${max} caracteres.`);
  return s;
}
function brazilTimeEnd(s) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || !Number.isFinite(Date.parse(s+':00-03:00'))) bad('Data e horário inválidos.');
  return Date.parse(s+':00-03:00');
}
async function settings(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM settings').all();
  return Object.fromEntries(rows.results.map(({key,value})=>[key,value]));
}
function editable(config, order=null) {
  // A temporary, signed recovery link can finish an existing paid draft
  // even when the general deadline for new messages has passed.
  if (order?.recovery_access) {
    if (!activeOrder(order) || order.submitted_at)
      bad('Este link de continuação não pode mais editar a cartinha.',403);
    return;
  }
  if (Date.now() >= brazilTimeEnd(config.deadline))
    bad('O prazo para editar as homenagens terminou.',403);
}
function activeOrder(order) { return ['paid','preparing','delivered'].includes(order.status); }
// Private checkout links grant edit access even after the Pix code is displayed.
function writableLetter(order) {
  return activeOrder(order) || ['pending','claimed'].includes(order.status);
}
async function event(env, id, type, detail='') {
  await env.DB.prepare('INSERT INTO order_events(id,order_id,type,detail) VALUES(?,?,?,?)').bind(newId(),id,type,detail).run();
}
// Operational markers never contain letter text, photos, audio or editing tokens.
async function markEmptyPaidDraft(env,id){
  const o=await env.DB.prepare("SELECT status,submitted_at,campaign_key,rich_html FROM orders WHERE id=?").bind(id).first();
  if(!o||!activeOrder(o)||o.submitted_at||o.campaign_key||visibleDraftText(o.rich_html))return;
  const m=await env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE order_id=? AND status='ready'").bind(id).first();
  if(Number(m?.n||0))return;
  await env.DB.prepare("INSERT OR IGNORE INTO draft_recovery(order_id,empty_seen_at) VALUES(?,?)").bind(id,now()).run();
}
async function markRecoveredDraft(env,id){
  const observed=await env.DB.prepare("SELECT recovered_at FROM draft_recovery WHERE order_id=?").bind(id).first();
  if(!observed||observed.recovered_at)return false;
  const o=await env.DB.prepare("SELECT status,rich_html FROM orders WHERE id=?").bind(id).first();
  if(!o||!activeOrder(o))return false;
  let valid=visibleDraftText(o.rich_html);
  if(!valid){
    const m=await env.DB.prepare("SELECT COUNT(*) AS n FROM media WHERE order_id=? AND status='ready'").bind(id).first();
    valid=Number(m?.n||0)>0;
  }
  if(!valid)return false;
  const updated=await env.DB.prepare(
    "UPDATE draft_recovery SET recovered_at=? WHERE order_id=? AND recovered_at IS NULL"
  ).bind(now(),id).run();
  if(updated.meta.changes)await event(env,id,'empty_draft_recovered');
  return !!updated.meta.changes;
}
function allowOrigin(request) {
  if (!WRITE_METHODS.has(request.method)) return;
  const origin=request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) bad('Origem da requisição não autorizada.',403);
}
async function hmacKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) bad('SESSION_SECRET ausente ou fraco.',503);
  return crypto.subtle.importKey('raw',encode.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function checkPassword(actual, expected) {
  const a=new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(actual)));
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(expected)));
  return a.length===b.length && crypto.subtle.timingSafeEqual ? crypto.subtle.timingSafeEqual(a,b) : a.every((v,i)=>v===b[i]);
}

const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65) || 'encontrista';
const excerpt = (s) => String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
// Treat editor placeholders such as <p>&nbsp;</p> as truly empty.
const visibleDraftText = (html) => !!plainLetter(html)
  .replace(/&(?:nbsp|#0*160|#x0*a0);|[\u200b\ufeff]/gi,'').trim();
function safeRich(input) {
  const html=assertText(input||'',30000,'Cartinha',false);
  // Restrict the stored document itself; no script, attributes, inline SVG or embeds.
  const stripped=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|svg|math|template)[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,tag=>{
    const m=tag.match(/^<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>$/i);
    if(!m)return '';
    const name=m[2].toLowerCase();
    return ['p','br','b','strong','em','i','u','s','h2','h3','blockquote','ul','ol','li'].includes(name)?`<${m[1]}${name}>`:'';
  });
  // Escaping malformed constructs is handled before dangerouslySetInnerHTML on the client with DOMPurify.
  return stripped;
}
// A coordenação não modera nem acessa o conteúdo das homenagens.
function released(config) { return Date.now()>=brazilTimeEnd(config.release_at); }
async function cardInfo(env,o) {
  const assets=(await env.DB.prepare("SELECT id,kind,filename,content_type,bytes FROM media WHERE order_id=? AND status='ready' ORDER BY created_at").bind(o.id).all()).results;
  return {id:o.id,recipient_name:o.recipient_name,sender_name:o.sender_name||'Uma pessoa especial',rich_html:o.rich_html,
    composition:normalizeComposition(JSON.parse(o.composition_json||'{}')),
    media:await Promise.all(assets.map(async m=>({...m,url:await mediaUrl(env,m.id,o.id)}))),created_at:o.created_at};
}
async function orderWithRecipient(env,id) { return env.DB.prepare('SELECT o.*,r.name AS recipient_name,r.slug AS recipient_slug FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.id=?').bind(id).first(); }

async function login(req, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<14) bad('Configure ADMIN_PASSWORD com pelo menos 14 caracteres.',503);
  const fingerprint=await digest((req.headers.get('CF-Connecting-IP')||'local')+':'+env.SESSION_SECRET);
  const since=Math.floor(Date.now()/1000), row=await env.DB.prepare('SELECT * FROM login_attempts WHERE fingerprint=?').bind(fingerprint).first();
  if (row && row.window_start>since-900 && row.attempts>=5) bad('Muitas tentativas. Aguarde 15 minutos.',429);
  const payload=await jsonBody(req);
  if (typeof payload.password !== 'string' || !(await checkPassword(payload.password,env.ADMIN_PASSWORD))) {
    const start=row && row.window_start>since-900 ? row.window_start : since;
    const attempts=row && row.window_start>since-900 ? row.attempts+1 : 1;
    await env.DB.prepare('INSERT INTO login_attempts(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start').bind(fingerprint,attempts,start).run();
    bad('Senha incorreta.',401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE fingerprint=?').bind(fingerprint).run();
  const content=b64url(encode.encode(JSON.stringify({exp:since+8*3600,role:'admin'})));
  const signed=b64url(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),encode.encode(content))));
  const secure=new URL(req.url).protocol==='https:' ? '; Secure' : '';
  return result({ok:true},200,{'Set-Cookie':`ejc_admin=${content}.${signed}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=28800`});
}
async function isAdmin(req,env) {
  try {
    const cookie=req.headers.get('Cookie')||'';
    const raw=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('ejc_admin='))?.slice(10);
    if (!raw) return false;
    const [body,sig]=raw.split('.');
    if (!body || !sig) return false;
    const good=await crypto.subtle.verify('HMAC',await hmacKey(env),unb64url(sig),encode.encode(body));
    if (!good) return false;
    const payload=JSON.parse(new TextDecoder().decode(unb64url(body)));
    return payload.role==='admin' && Number.isFinite(payload.exp) && payload.exp>Date.now()/1000;
  } catch { return false; }
}
async function requireAdmin(req, env) { if (!await isAdmin(req,env)) bad('Sessão administrativa não autenticada.',401); }
function bearer(req) {
  const t=req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];
  if (!t) bad('Link privado inválido.',401);
  return t;
}
async function buyer(req,env) {
  const access=bearer(req);
  const hash=await digest(access);
  let row=await env.DB.prepare(
    'SELECT o.*,r.name AS recipient_name,r.slug AS recipient_slug FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE token_hash=?'
  ).bind(hash).first();
  if (!row) {
    // The original access token is stored as a hash and cannot be recovered.
    // Admin-issued recovery links are short-lived, purpose-bound HMAC grants;
    // they never replace or revoke the original private checkout link.
    const match=access.match(/^r1_([A-F0-9]{12})_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/);
    if (match && Number.parseInt(match[2],16)>Date.now()/1000) {
      const verified=await crypto.subtle.verify(
        'HMAC',await hmacKey(env),unb64url(match[3]),
        encode.encode('ejc:draft-resume:v1:'+match[1]+':'+match[2])
      );
      if (verified) {
        row=await orderWithRecipient(env,'EJC-'+match[1]);
        if (!row || !activeOrder(row) || row.campaign_key) row=null;
        else row.recovery_access=true;
      }
    }
  }
  if (!row) bad('Pedido não encontrado ou link de continuação expirado.',404);
  return row;
}
async function mediaUrl(env, mediaId, orderId) {
  const blob=b64url(encode.encode(JSON.stringify({mediaId,orderId,v:2,exp:Math.floor(Date.now()/1000)+14400})));
  const sig=b64url(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),encode.encode(blob))));
  return `/api/media/${mediaId}?access=${blob}.${sig}`;
}
async function signedMedia(req,env,id,url) {
  const raw=url.searchParams.get('access')||'', [blob,sig]=raw.split('.');
  if (!blob||!sig) bad('Acesso a arquivo não autorizado.',403);
  let payload;
  try {
    if (!await crypto.subtle.verify('HMAC',await hmacKey(env),unb64url(sig),encode.encode(blob))) bad('Assinatura inválida.',403);
    payload=JSON.parse(new TextDecoder().decode(unb64url(blob)));
  } catch { bad('Link de arquivo inválido.',403); }
  if (payload.v!==2 || payload.mediaId!==id || payload.exp<=Date.now()/1000) bad('Link de arquivo expirado ou revogado.',403);
  const media=await getMedia(env,id);
  if (media.order_id!==payload.orderId) bad('Acesso negado.',403);
  const order=await env.DB.prepare('SELECT status,checkout_id FROM orders WHERE id=?').bind(media.order_id).first();
  if (!order || !writableLetter(order)) bad('Arquivo ainda bloqueado.',403);
  return fetchMedia(req,env,media);
}
async function orderInfo(env,o) {
  const config=await settings(env);
  const rows=(await env.DB.prepare("SELECT id,kind,filename,content_type,bytes,created_at FROM media WHERE order_id=? AND status='ready' ORDER BY created_at").bind(o.id).all()).results;
  const visible=writableLetter(o)?await Promise.all(rows.map(async m=>({...m,url:await mediaUrl(env,m.id,o.id)}))):[];
  const receipt=await env.DB.prepare('SELECT verified_at,notified_at FROM order_read_receipts WHERE order_id=?').bind(o.id).first();
  return {id:o.id,recipient_name:o.recipient_name,recipient_slug:o.recipient_slug,sender_name:o.sender_name,status:o.status,checkout_id:o.checkout_id,
    amount_cents:o.total_cents,pix_code:o.checkout_id?null:o.pix_payload,txid:o.checkout_id?null:o.txid,
    pix_receiver:config.pix_name||'',pix_city:config.pix_city||'',
    rich_html:writableLetter(o)?o.rich_html:'',
    composition:writableLetter(o)?normalizeComposition(JSON.parse(o.composition_json||'{}')):null,
    submitted:!!o.submitted_at,resume_access:!!o.recovery_access && !o.submitted_at,
    read_notification:{enabled:!!receipt,verified:!!receipt?.verified_at,notified:!!receipt?.notified_at},
    payment_claimed_at:o.payment_claimed_at,created_at:o.created_at,media:visible};
}
async function getMedia(env,id) {
  const row=await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  if (!row) bad('Arquivo não encontrado.',404);
  return row;
}
async function fetchMedia(req,env,media) {
  if (media.status!=='ready') bad('Arquivo ainda não finalizado.',409);
  const r=req.headers.get('Range');
  const object=await env.MEDIA.get(media.object_key,r?{range:req.headers}:undefined);
  if (!object) bad('Arquivo indisponível.',404);
  const h=new Headers(BASE_HEADERS);
  h.set('Content-Type',media.content_type);
  h.set('Accept-Ranges','bytes');
  h.set('Content-Disposition',`inline; filename="${media.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`);
  const range=object.range;
  if (range && r) {
    h.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${object.size}`);
    h.set('Content-Length',String(range.length));
    return new Response(object.body,{status:206,headers:h});
  }
  h.set('Content-Length',String(object.size));
  return new Response(object.body,{headers:h});
}
async function mediaWrite(req,env,o,params,path) {
  if (!writableLetter(o)) bad('Este pedido não pode mais receber arquivos.',403);
  editable(await settings(env),o);
  if (path==='/api/order/media/init' && req.method==='POST') {
    const data=await jsonBody(req);
    const kind=data.kind;
    if (!['audio','image'].includes(kind)) bad('Tipo de arquivo inválido.');
    const mime=assertText(data.content_type,100,'Tipo MIME').toLowerCase();
    if (kind==='audio' && !/^audio\/(mp4|webm|ogg|mpeg|aac|x-m4a|wav)(;[\w=, .-]+)?$/.test(mime)) bad('Formato de áudio não suportado.');
    if (kind==='image' && !/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/.test(mime)) bad('Formato de foto não suportado.');
    const filename=assertText(data.filename||`arquivo-${Date.now()}`,160,'Nome do arquivo');
    if (!activeOrder(o)) {
      // Before bank approval, prevent arbitrary storage consumption by unpaid checkouts.
      const usage=await env.DB.prepare(
        "SELECT COUNT(*) AS files FROM media WHERE order_id=? AND status IN ('uploading','ready')"
      ).bind(o.id).first();
      if (usage.files>=12) bad('Até 12 anexos por cartinha antes da confirmação do Pix.',413);
    }
    const id=newId(), objectKey=`orders/${o.id}/${id}`;
    const upload=await env.MEDIA.createMultipartUpload(objectKey,{httpMetadata:{contentType:mime}});
    await env.DB.prepare('INSERT INTO media(id,order_id,kind,filename,content_type,object_key,upload_id) VALUES(?,?,?,?,?,?,?)').bind(id,o.id,kind,filename,mime,objectKey,upload.uploadId).run();
    return result({id,part_size:PART_SIZE});
  }
  const match=path.match(/^\/api\/order\/media\/([a-f0-9-]{36})(?:\/part\/(\d+)|\/(complete|delete))?$/);
  if (!match) bad('Rota inválida.',404);
  const media=await getMedia(env,match[1]);
  if (media.order_id!==o.id) bad('Arquivo não pertence a este pedido.',403);
  if (match[2] && req.method==='PUT') {
    if (media.status!=='uploading') bad('Upload concluído.',409);
    const part=Number(match[2]);
    const declared=Number(req.headers.get('Content-Length')||0);
    if (!Number.isSafeInteger(part) || part<1 || part>10000 || declared>PART_SIZE) bad('Parte inválida.',413);
    if (!activeOrder(o) && part>6) bad('Cada anexo pode ter até 48 MB antes do pagamento.',413);
    // Don't depend on Content-Length: some browsers/proxies stream uploads without it.
    // Read incrementally and reject oversized parts before holding them in memory.
    if (!req.body) bad('Parte vazia.',400);
    const reader=req.body.getReader(), chunks=[];
    let size=0;
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      size+=value.byteLength;
      if (size>PART_SIZE) { await reader.cancel(); bad('Parte excede 8 MiB.',413); }
      chunks.push(value);
    }
    if (size<=0 || (declared && declared!==size)) bad('Tamanho não corresponde ao enviado.');
    const payload=new Uint8Array(size);let cursor=0;
    for (const chunk of chunks) { payload.set(chunk,cursor);cursor+=chunk.byteLength; }
    const upload=env.MEDIA.resumeMultipartUpload(media.object_key,media.upload_id);
    const uploaded=await upload.uploadPart(part,payload);
    await env.DB.prepare('INSERT INTO media_parts(media_id,part_number,etag,bytes) VALUES(?,?,?,?) ON CONFLICT(media_id,part_number) DO UPDATE SET etag=excluded.etag,bytes=excluded.bytes')
      .bind(media.id,part,uploaded.etag,size).run();
    return result({ok:true,part});
  }
  if (match[3]==='complete' && req.method==='POST') {
    if (media.status==='ready') return result({ok:true,id:media.id});
    const rows=(await env.DB.prepare('SELECT part_number,etag,bytes FROM media_parts WHERE media_id=? ORDER BY part_number').bind(media.id).all()).results;
    if (!rows.length || rows.length>10000) bad('Nenhuma parte enviada.');
    for (let i=0;i<rows.length;i++) {
      if (rows[i].part_number!==i+1 || (i<rows.length-1 && rows[i].bytes<MIN_PART) || (i<rows.length-1 && rows[i].bytes!==PART_SIZE)) bad('Partes incompletas ou incorretas.',409);
    }
    if (!activeOrder(o)) {
      const incoming=rows.reduce((size,row)=>size+row.bytes,0);
      const individual=await env.DB.prepare(
        "SELECT COALESCE(SUM(bytes),0) AS bytes FROM media WHERE order_id=? AND status='ready'"
      ).bind(o.id).first();
      if (incoming+individual.bytes>48*1024*1024)
        bad('O limite de 48 MB de anexos desta cartinha foi atingido antes do pagamento.',413);
      if (o.checkout_id) {
        const grouped=await env.DB.prepare(
          "SELECT COALESCE(SUM(m.bytes),0) AS bytes FROM media m JOIN orders o ON m.order_id=o.id WHERE o.checkout_id=? AND m.status='ready'"
        ).bind(o.checkout_id).first();
        if (incoming+grouped.bytes>160*1024*1024)
          bad('O carrinho atingiu o limite de 160 MB de anexos antes do pagamento.',413);
      }
    }
    let object=await env.MEDIA.head(media.object_key);
    if (!object) object=await env.MEDIA.resumeMultipartUpload(media.object_key,media.upload_id).complete(rows.map(r=>({partNumber:r.part_number,etag:r.etag})));
    await env.DB.prepare('UPDATE media SET status=?,bytes=? WHERE id=?').bind('ready',object.size,media.id).run();
    await event(env,o.id,'media_uploaded',media.kind);
    const repaired=await markRecoveredDraft(env,o.id);
    return result({ok:true,id:media.id,bytes:object.size,repaired});
  }
  if (match[3]==='delete' && req.method==='DELETE') {
    if (media.status==='ready') await env.MEDIA.delete(media.object_key);
    else await env.MEDIA.resumeMultipartUpload(media.object_key,media.upload_id).abort().catch(()=>{});
    await env.DB.batch([
      env.DB.prepare('DELETE FROM media_parts WHERE media_id=?').bind(media.id),
      env.DB.prepare('DELETE FROM media WHERE id=?').bind(media.id)
    ]);
    await event(env,o.id,'media_deleted',media.kind);
    return result({ok:true});
  }
  bad('Ação de arquivo inválida.',404);
}

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
function recipientPhotoUrl(r) {
  return r.photo_key && r.photo_consent
    ? `/api/recipients/${r.id}/photo?v=${encodeURIComponent(r.photo_key.split('/').pop())}`
    : null;
}
async function receiveSafeImage(request, maxBytes) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_MIME.has(type)) bad('Envie uma imagem PNG, JPEG ou WebP.', 415);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxBytes) bad('Imagem muito grande.', 413);
  if (!request.body) bad('Arquivo de imagem ausente.');
  const reader = request.body.getReader(), chunks = [];
  let bytesLength = 0;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    bytesLength += value.byteLength;
    if (bytesLength > maxBytes) { await reader.cancel(); bad('Imagem excede o tamanho permitido.', 413); }
    chunks.push(value);
  }
  if (!bytesLength) bad('Imagem vazia.');
  const bytes = new Uint8Array(bytesLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  const jpeg = bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (!(type==='image/png'&&png || type==='image/jpeg'&&jpeg || type==='image/webp'&&webp))
    bad('A assinatura do arquivo não corresponde ao tipo de imagem.',415);
  return {bytes,type};
}
function serveBrandImage(blob) {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type',blob.httpMetadata?.contentType||'image/png');
  headers.set('Cache-Control','public, max-age=300');
  return new Response(blob.body,{headers});
}


const MURAL_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newMuralCode() {
  const bytes=crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes,b=>MURAL_ALPHABET[b&31]).join('');
}
async function nextUniqueMuralCode(env) {
  for(let i=0;i<16;i++){
    const code=newMuralCode();
    if(!await env.DB.prepare('SELECT id FROM recipients WHERE mural_code=?').bind(code).first())return code;
  }
  bad('Não foi possível gerar um código exclusivo. Tente novamente.',503);
}
async function muralGrant(env,recipient) {
  const claims={id:recipient.id,version:await digest(recipient.mural_code),exp:Math.floor(Date.now()/1000)+14*86400};
  const tokenBody='m2.'+b64url(encode.encode(JSON.stringify(claims)));
  const signature=b64url(new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),encode.encode(tokenBody))));
  return tokenBody+'.'+signature;
}
async function validMuralGrant(env,grant,recipient) {
  if(!grant||!grant.startsWith('m2.')||!recipient.mural_code)return false;
  const parts=grant.split('.');
  if(parts.length!==3||parts[1].length>500||parts[2].length>200)return false;
  try {
    const data=parts[0]+'.'+parts[1];
    const valid=await crypto.subtle.verify('HMAC',await hmacKey(env),unb64url(parts[2]),encode.encode(data));
    if(!valid)return false;
    const payload=JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
    return payload.id===recipient.id && payload.version===await digest(recipient.mural_code) &&
      Number.isFinite(payload.exp) && payload.exp>=Math.floor(Date.now()/1000);
  }catch{return false;}
}

function escapeMeta(value){
  return String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}
// Social crawlers do not execute React. Always publish complete OG metadata
// in Worker-rendered HTML, even when the admin has not generated a portrait PNG.
const DEFAULT_OG_PATH = '/og-ejc-default.png';
const DEFAULT_OG_VERSION = '20261107c';
function socialImage(recipient, defaultOg=null, kind='enviar') {
  const withPhotoConsent=!recipient?.photo_key || !!recipient.photo_consent;
  if(kind==='mural' && recipient?.mural_og_key && withPhotoConsent) {
    const version=recipient.mural_og_key.split('/').pop();
    return {
      path:'/api/og/mural/'+encodeURIComponent(recipient.slug)+'.png?v='+encodeURIComponent(version),
      version,width:1200,height:630,
    };
  }
  const personalized = recipient?.og_key && withPhotoConsent;
  if (personalized) {
    const version = recipient.og_key.split('/').pop();
    return {
      path: '/api/og/' + encodeURIComponent(recipient.slug) + '.png?v=' + encodeURIComponent(version),
      version, width: 1200, height: 630,
    };
  }
  const fallbackVersion=defaultOg?.version||DEFAULT_OG_VERSION;
  return {
    path: DEFAULT_OG_PATH + '?v=' + encodeURIComponent(fallbackVersion),
    version: fallbackVersion, width: defaultOg?.ready?1200:600, height:defaultOg?.ready?630:315,
  };
}
function buildSocialMeta(origin, recipient, kind = 'enviar', defaultOg=null) {
  const person = recipient?.name;
  const title = person
    ? (kind === 'mural' ? 'Mural secreto de ' : 'Envie uma cartinha para ') + person + ' · XX EJC Simonésia'
    : 'Cartinhas do XX EJC Simonésia';
  const description = person
    ? kind === 'mural'
      ? 'Tem um carinho especial esperando por você! Abra seu mural privado do XX EJC Simonésia. Deus te ama, persevere na fé.'
      : 'Envie fotos, áudios e palavras especiais para ' + person + ' no XX EJC de Simonésia.'
    : 'Uma homenagem especial para guardar no coração. Cartinhas do XX EJC Simonésia.';
  const image = socialImage(recipient,defaultOg,kind);
  const imageUrl = origin + image.path;
  const canonicalPath = person
    ? '/' + kind + '/' + encodeURIComponent(recipient.slug)
    : '/';
  // Version both the shared page and the image URL to bypass stale WhatsApp previews.
  const canonical = origin + canonicalPath +
    (person ? '?og=' + encodeURIComponent(image.version) : '');
  const fields = [
    ['property', 'og:type', 'website'],
    ['property', 'og:locale', 'pt_BR'],
    ['property', 'og:site_name', 'Cartinhas · XX EJC Simonésia'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', canonical],
    ['property', 'og:image', imageUrl],
    ['property', 'og:image:secure_url', imageUrl],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', String(image.width)],
    ['property', 'og:image:height', String(image.height)],
    ['property', 'og:image:alt', person
      ? (kind==='mural' ? 'Convite colorido para o mural secreto de ' : 'Arte da cartinha dedicada a ') + person + ', XX EJC Simonésia'
      : 'Cartinhas do XX EJC Simonésia'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', imageUrl],
    ['name', 'twitter:image:alt', 'Cartinhas do XX EJC Simonésia'],
  ];
  return {
    title, description,
    tags: fields.map(([attr,key,value]) =>
      '<meta '+attr+'="'+escapeMeta(key)+'" content="'+escapeMeta(value)+'" />').join('\n'),
  };
}


async function checkoutBuyer(req, env) {
  const access=bearer(req);
  const checkout=await env.DB.prepare('SELECT * FROM checkouts WHERE token_hash=?').bind(await digest(access)).first();
  if (!checkout) bad('Compra não encontrada.',404);
  return {checkout,access};
}
async function checkoutInfo(env,checkout,access) {
  const rows=(await env.DB.prepare(
    'SELECT o.id,o.status,o.sender_name,o.rich_html,o.submitted_at,o.checkout_item_index,r.name AS recipient_name,r.slug AS recipient_slug FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.checkout_id=? ORDER BY o.checkout_item_index'
  ).bind(checkout.id).all()).results;
  return {
    id:checkout.id,status:checkout.status,amount_cents:checkout.total_cents,
    txid:checkout.txid,pix_code:checkout.pix_payload,created_at:checkout.created_at,
    claimed_at:checkout.claimed_at,confirmed_at:checkout.confirmed_at,
    items:await Promise.all(rows.map(async row=>({
      id:row.id,status:row.status,submitted:!!row.submitted_at,recipient_name:row.recipient_name,
       sender_name:row.sender_name,has_draft:!!excerpt(row.rich_html),
      recipient_slug:row.recipient_slug,token:await digest(access+':item:'+row.checkout_item_index)
    })))
  };
}
async function createCheckout(req,env,config) {
  if (config.open!=='true') bad('As cartinhas estão temporariamente fechadas.',403);
  editable(config);
  if(!config.pix_key||!config.pix_name||!config.pix_city) bad('A chave Pix ainda não foi configurada.',503);
  // Up to twenty letter texts and compositions saved atomically along with the Pix.
  const input=await jsonBody(req,800000);
  const payerName=assertText(input.payer_name||'',100,'Nome para conferência',false);
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20)
    bad('Adicione entre 1 e 20 cartinhas ao carrinho.');
  const unit=Number(config.message_price_cents||1000);
  if(!Number.isSafeInteger(unit)||unit<100||unit>5000000)bad('Valor unitário inválido.',503);
  const amount=unit*input.items.length;
  if(!Number.isSafeInteger(amount)||amount>5000000)bad('O total Pix excede o limite permitido.',400);
  const slugs=input.items.map(item=>assertText(item?.recipient_slug||'',65,'Encontrista'));
  if(input.items.some(item=>!item||typeof item!=='object'||Array.isArray(item)))bad('Item inválido no carrinho.',400);
  const found=(await env.DB.prepare('SELECT id,name,slug FROM recipients WHERE active=1').all()).results;
  const bySlug=new Map(found.map(r=>[r.slug,r]));
  const recipients=slugs.map(slug=>bySlug.get(slug));
  if(recipients.some(r=>!r))bad('Um dos encontristas não está disponível.',400);
  const prepared=input.items.map((item,index)=>({
    recipient:recipients[index],
    sender:assertText(item.sender_name||'',100,'Remetente',false),
    email:item.notify_on_read===true?validateEmail(item.read_receipt_email):null,
    notify:item.notify_on_read===true,
    html:safeRich(item.rich_html||''),
    composition:JSON.stringify(normalizeComposition(item.composition))
  }));
  if(prepared.some(p=>p.composition.length>7000))bad('Decoração excede o limite permitido.',413);
  if(prepared.some(p=>p.notify&&(!emailsReady(env)||!p.email)))
    bad('Confira o e-mail de aviso de leitura.',400);
  const fingerprint=await digest((req.headers.get('CF-Connecting-IP')||'local')+':orders:'+env.SESSION_SECRET);
  const seconds=Math.floor(Date.now()/1000);
  const rate=await env.DB.prepare('SELECT attempts,window_start FROM order_rate WHERE fingerprint=?').bind(fingerprint).first();
  if(rate&&rate.window_start>seconds-3600&&rate.attempts>=15)bad('Muitas compras neste período.',429);
  const code=randomCode(),checkoutId='EJCB-'+code,txid='EJCB'+code,access=token();
  const pix=generatePix({key:config.pix_key,merchantName:config.pix_name,
    merchantCity:config.pix_city,amountCents:amount,txid});
  const records=await Promise.all(prepared.map(async(item,index)=>{
    const orderCode=randomCode(),id='EJC-'+orderCode;
    const itemToken=await digest(access+':item:'+index);
    return {id,token:itemToken,tokenHash:await digest(itemToken),...item,index};
  }));
  const statements=[
    env.DB.prepare('INSERT INTO checkouts(id,token_hash,txid,total_cents,pix_payload,payer_name) VALUES(?,?,?,?,?,?)')
      .bind(checkoutId,await digest(access),txid,amount,pix,payerName),
    ...records.map(row=>env.DB.prepare(
      'INSERT INTO orders(id,token_hash,recipient_id,sender_name,total_cents,pix_payload,txid,public_message,checkout_id,checkout_item_index,rich_html,composition_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(row.id,row.tokenHash,row.recipient.id,row.sender,unit,pix,'ITEM'+row.id.slice(4),0,checkoutId,row.index,row.html,row.composition)),
    env.DB.prepare('INSERT INTO order_rate(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start')
      .bind(fingerprint,rate&&rate.window_start>seconds-3600?rate.attempts+1:1,rate&&rate.window_start>seconds-3600?rate.window_start:seconds)
  ];
  await env.DB.batch(statements);
  for(const row of records){
    await event(env,row.id,'created');
    await enqueue(env,row.id,'order_created');
    if(row.notify)await enableReceipt(env,row.id,row.email);
  }
  return result({id:checkoutId,token:access,txid,pix_code:pix,amount_cents:amount,
    items:records.map(row=>({id:row.id,token:row.token,recipient_slug:row.recipient.slug,recipient_name:row.recipient.name}))
  },201);
}

async function publicRoute(req,env,path) {
  const muralOg=path.match(/^\/api\/og\/mural\/([a-z0-9-]+)\.png$/);
  if(muralOg&&(req.method==='GET'||req.method==='HEAD')){
    const r=await env.DB.prepare(
      'SELECT mural_og_key,photo_key,photo_consent FROM recipients WHERE slug=? AND active=1'
    ).bind(muralOg[1]).first();
    if(!r||!r.mural_og_key||(r.photo_key&&!r.photo_consent))
      bad('Imagem do mural não disponível.',404);
    const image=await env.MEDIA.get(r.mural_og_key);
    if(!image)bad('Imagem do mural não disponível.',404);
    return new Response(req.method==='HEAD'?null:image.body,{headers:{
      ...BASE_HEADERS,'Content-Type':'image/png','Content-Length':String(image.size),
      'Cache-Control':'public, max-age=300'
    }});
  }
  const ogImage=path.match(/^\/api\/og\/([a-z0-9-]+)\.png$/);
  if(ogImage&&(req.method==='GET'||req.method==='HEAD')){
    const r=await env.DB.prepare(
      'SELECT og_key,photo_key,photo_consent FROM recipients WHERE slug=? AND active=1'
    ).bind(ogImage[1]).first();
    if(!r||!r.og_key||(r.photo_key&&!r.photo_consent))bad('Imagem não disponível.',404);
    const object=await env.MEDIA.get(r.og_key);
    if(!object)bad('Imagem não disponível.',404);
    return new Response(req.method==='HEAD'?null:object.body,{headers:{
      ...BASE_HEADERS,'Content-Type':'image/png',
      'Content-Length':String(object.size),
      'Cache-Control':'public, max-age=300'
    }});
  }
  if(path==='/api/health' && req.method==='GET') {
    await env.DB.prepare('SELECT 1 AS ok').first();
    await env.MEDIA.head('healthcheck/does-not-exist');
    return result({ok:true,service:'ejc-cartinhas'});
  }
  if(path==='/api/branding/logo' && req.method==='GET') {
    const logo=await env.MEDIA.get('branding/ejc-market-logo');
    if(!logo)bad('Logo ainda não cadastrada.',404);
    return serveBrandImage(logo);
  }
  const stickerImage=path.match(/^\/api\/stickers\/([a-z0-9-]+)\.png$/);
  if(stickerImage&&(req.method==='GET'||req.method==='HEAD')){
    if(!STICKERS_BY_ID[stickerImage[1]])bad('Adesivo desconhecido.',404);
    const object=await env.MEDIA.get('stickers/v1/'+stickerImage[1]+'.png');
    if(!object)bad('Adesivo PNG ainda não cadastrado.',404);
    return new Response(req.method==='HEAD'?null:object.body,{headers:{
      'Content-Type':'image/png','Cache-Control':'public, max-age=300',
      'X-Content-Type-Options':'nosniff','Content-Length':String(object.size)
    }});
  }
  const photo=path.match(/^\/api\/recipients\/([a-f0-9-]{36})\/photo$/);
  if(photo && req.method==='GET') {
    const r=await env.DB.prepare('SELECT photo_key,photo_consent FROM recipients WHERE id=? AND active=1').bind(photo[1]).first();
    if(!r || !r.photo_consent || !r.photo_key)bad('Foto não disponível.',404);
    const blob=await env.MEDIA.get(r.photo_key);
    if(!blob)bad('Foto não disponível.',404);
    return serveBrandImage(blob);
  }
  if(path==='/api/stickers'&&req.method==='GET'){
    const entries=await Promise.all(Object.keys(STICKERS_BY_ID).map(async id=>({
      id,exists:!!(await env.MEDIA.head('stickers/v1/'+id+'.png'))
    })));
    return result({stickers:entries.filter(item=>item.exists).map(item=>item.id)},200,{'Cache-Control':'public, max-age=45'});
  }
  const config=await settings(env);
  if (path==='/api/public' && req.method==='GET') {
    const recipients=(await env.DB.prepare('SELECT id,name,slug,photo_key,photo_consent,og_key FROM recipients WHERE active=1 ORDER BY name COLLATE NOCASE').all()).results.map(r=>({id:r.id,name:r.name,slug:r.slug,photo_url:recipientPhotoUrl(r),og_url:socialImage(r).path}));
    const logo=await env.MEDIA.head('branding/ejc-market-logo');
    return result({recipients,config:{deadline:config.deadline,release_at:config.release_at,
      open:config.open==='true',store_title:config.store_title,store_subtitle:config.store_subtitle,
      amount_cents:Number(config.message_price_cents||1000),analytics_id:config.analytics_id||'',
      logo_url:logo?`/api/branding/logo?v=${logo.uploaded?.getTime()||0}`:null,
      payments_ready:!!(config.pix_key && config.pix_name && config.pix_city),read_emails_enabled:emailsReady(env)}});
  }
  if(path==='/api/publicas')bad('Todas as cartinhas são privadas.',410);
  if(path==='/api/mural/redeem'&&req.method==='POST') {
    const body=await jsonBody(req,300);
    const code=typeof body.code==='string'?body.code.toUpperCase().replace(/[\s-]/g,''):'';
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))bad('Digite os seis caracteres do seu cartão.',400);
    const fingerprint=await digest((req.headers.get('CF-Connecting-IP')||'local')+':mural:'+env.SESSION_SECRET);
    const seconds=Math.floor(Date.now()/1000);
    const attempts=await env.DB.prepare('SELECT attempts,window_start FROM mural_code_attempts WHERE fingerprint=?').bind(fingerprint).first();
    if(attempts && attempts.window_start>seconds-900 && attempts.attempts>=100)
      bad('Muitas tentativas. Aguarde 15 minutos.',429);
    const person=await env.DB.prepare('SELECT id,slug,mural_code FROM recipients WHERE mural_code=?').bind(code).first();
    if(!person) {
      const active=attempts&&attempts.window_start>seconds-900;
      await env.DB.prepare('INSERT INTO mural_code_attempts(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start')
        .bind(fingerprint,active?attempts.attempts+1:1,active?attempts.window_start:seconds).run();
      bad('Código não encontrado. Confira os caracteres e tente novamente.',404);
    }
    await env.DB.prepare('DELETE FROM mural_code_attempts WHERE fingerprint=?').bind(fingerprint).run();
    return result({slug:person.slug,grant:await muralGrant(env,person)});
  }
  // Loading a mural listing is not a read receipt; opening an envelope is.
  const cardPath=path.match(/^\/api\/mural\/([a-z0-9-]+)\/cards\/(EJC-[A-F0-9]{12})$/);
  const mural=path.match(/^\/api\/mural\/([a-z0-9-]+)$/);
  if((mural||cardPath)&&req.method==='GET'){
    const slug=mural?mural[1]:cardPath[1];
    const person=await env.DB.prepare('SELECT id,name,slug,mural_code,photo_key,photo_consent,active FROM recipients WHERE slug=?')
      .bind(slug).first();
    if(!person)bad('Encontrista não encontrado.',404);
    const grant=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
    if(!await validMuralGrant(env,grant,person))bad('Código de acesso inválido.',403);
    if(!released(config))return result({
      recipient:{name:person.name,slug:person.slug,photo_url:person.active?recipientPhotoUrl(person):null},
      cards:[],release_at:config.release_at,locked:true
    });
    if(cardPath){
      const order=await env.DB.prepare(
        "SELECT o.*,r.name AS recipient_name FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.id=? AND o.recipient_id=? AND o.submitted_at IS NOT NULL AND o.status IN ('paid','preparing','delivered')"
      ).bind(cardPath[2],person.id).first();
      if(!order)bad('Cartinha não encontrada.',404);
      // Never count an accidental empty legacy letter as read.
      const mediaCount=await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM media WHERE order_id=? AND status='ready'"
      ).bind(order.id).first();
      if(!visibleDraftText(order.rich_html) && !mediaCount.n)
        bad('Esta cartinha ainda não tem conteúdo. Volte mais tarde.',409);
      const card=await cardInfo(env,order);
      await markRead(env,order.id);
      return result({card});
    }
    // Paid, unfinished letters appear as a kind note, never as the sender's
    // unsent content. The released mural still requires its private grant.
    const rows=(await env.DB.prepare(
      "SELECT o.id,o.submitted_at,o.sender_name,o.rich_html,o.composition_json,"+
      "EXISTS(SELECT 1 FROM media m WHERE m.order_id=o.id AND m.status='ready') AS has_ready_media "+
      "FROM orders o WHERE o.recipient_id=? AND o.status IN ('paid','preparing','delivered') "+
      "ORDER BY COALESCE(o.submitted_at,o.created_at) DESC,o.id"
    ).bind(person.id).all()).results;
    const cards=rows.map(o=>{
      const unfinished=!o.submitted_at;
      const empty=unfinished || (!visibleDraftText(o.rich_html) && !o.has_ready_media);
      if(!empty)return {id:o.id,submitted_at:o.submitted_at};
      // Use only the publicly chosen signature, never override an alias with
      // the real sender name. Anonymous letters expose no sender identity.
      let signature='';
      try {
        const design=normalizeComposition(JSON.parse(o.composition_json||'{}'));
        if(!design.anonymous)signature=(design.authorName||o.sender_name||'').trim();
      } catch { /* Invalid legacy composition: keep the sender anonymous. */ }
      return {
        id:o.id,submitted_at:o.submitted_at,
        ...(unfinished?{draft_pending:true}:{empty_content:true}),
        sender_name:signature,
      };
    });
    return result({recipient:{name:person.name,slug:person.slug,photo_url:person.active?recipientPhotoUrl(person):null},
      cards,release_at:config.release_at,locked:false});
  }
  if(path==='/api/receipt/confirm'&&req.method==='POST'){
    const body=await jsonBody(req,400);
    if(!await confirmReceipt(env,body.token))bad('Link de confirmação inválido ou expirado.',400);
    return result({ok:true});
  }
  if (path==='/api/checkouts'&&req.method==='POST') return createCheckout(req,env,config);
  if (path==='/api/checkout'&&req.method==='GET'){
    const {checkout,access}=await checkoutBuyer(req,env);
    return result(await checkoutInfo(env,checkout,access));
  }
  if (path==='/api/checkout/claim'&&req.method==='POST'){
    const {checkout}=await checkoutBuyer(req,env);
    if(checkout.status==='paid')return result({ok:true,status:'paid'});
    if(checkout.status==='claimed')return result({ok:true,status:'claimed'});
    if(checkout.status==='cancelled')bad('Compra cancelada.',409);
    const changed=await env.DB.prepare(
      "UPDATE checkouts SET status='claimed',claimed_at=COALESCE(claimed_at,?) WHERE id=? AND status='pending'"
    ).bind(now(),checkout.id).run();
    if(changed.meta.changes){
      await env.DB.prepare("UPDATE orders SET status='claimed',payment_claimed_at=COALESCE(payment_claimed_at,?),updated_at=? WHERE checkout_id=? AND status IN ('pending','claimed')")
        .bind(now(),now(),checkout.id).run();
      const children=(await env.DB.prepare('SELECT id FROM orders WHERE checkout_id=?').bind(checkout.id).all()).results;
      for(const row of children){await event(env,row.id,'payment_claimed');await enqueue(env,row.id,'payment_claimed');}
    }
    return result({ok:true,status:'claimed'});
  }
  if (path==='/api/orders' && req.method==='POST') {
    if(config.open!=='true')bad('As homenagens estão temporariamente fechadas.',403);
    editable(config);
    if(!config.pix_key||!config.pix_name||!config.pix_city)bad('A coordenação ainda precisa configurar a chave Pix.',503);
    const input=await jsonBody(req);
    const recipient=await env.DB.prepare('SELECT id,name,slug FROM recipients WHERE (id=? OR slug=?) AND active=1').bind(String(input.recipient_id||''),String(input.recipient_slug||'')).first();
    if(!recipient)bad('Encontrista inválido.');
    const sender=assertText(input.sender_name||'',100,'Nome de quem envia',false);
    const payerName=assertText(input.payer_name||'',100,'Nome para conferência',false);
    if(input.notify_on_read===true && (!emailsReady(env)||!validateEmail(input.read_receipt_email)))
      bad('O aviso de leitura exige um e-mail válido e o serviço de e-mail configurado.');
    const total=Number(config.message_price_cents||1000);
    if(!Number.isSafeInteger(total)||total<100||total>5000000)bad('Configure o valor da mensagem (mínimo R$ 1).',503);
    const ip=await digest((req.headers.get('CF-Connecting-IP')||'local')+':orders:'+env.SESSION_SECRET);
    const t=Math.floor(Date.now()/1000), rate=await env.DB.prepare('SELECT attempts,window_start FROM order_rate WHERE fingerprint=?').bind(ip).first();
    if(rate&&rate.window_start>t-3600&&rate.attempts>=15)bad('Muitos pedidos neste período.',429);
    const code=randomCode(),id=`EJC-${code}`,txid=`EJC${code}`,access=token();
    const pix=generatePix({key:config.pix_key,merchantName:config.pix_name,merchantCity:config.pix_city,amountCents:total,txid});
    await env.DB.batch([
      env.DB.prepare('INSERT INTO orders(id,token_hash,recipient_id,sender_name,total_cents,pix_payload,txid,public_message,payer_name) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,await digest(access),recipient.id,sender,total,pix,txid,0,payerName),
      env.DB.prepare('INSERT INTO order_rate(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start').bind(ip,rate&&rate.window_start>t-3600?rate.attempts+1:1,rate&&rate.window_start>t-3600?rate.window_start:t)
    ]);
    await event(env,id,'created');
    await enqueue(env,id,'order_created');
    if(input.notify_on_read===true)await enableReceipt(env,id,input.read_receipt_email);
    return result({id,token:access,txid,pix_code:pix},201);
  }
  if(path.startsWith('/api/order')&&path!=='/api/orders') {
    const o=await buyer(req,env);
    if(path==='/api/order'&&req.method==='GET')return result({...await orderInfo(env,o),deadline:config.deadline,release_at:config.release_at});
    if(path==='/api/order/read-notification'&&req.method==='POST'){
      const data=await jsonBody(req,600);
      if(data.enabled===false){
        await disableReceipt(env,o.id);
        return result({enabled:false});
      }
      if(data.enabled!==true||!validateEmail(data.email))
        bad('Informe um e-mail válido para solicitar aviso de leitura.');
      return result(await enableReceipt(env,o.id,data.email));
    }
    if(path==='/api/order/claim'&&req.method==='POST') {
      if(o.checkout_id)bad('Confirme o Pix da compra agrupada, não da cartinha individual.',409);
      if(activeOrder(o))return result({ok:true,status:o.status});
      if(o.status==='cancelled')bad('Pedido cancelado.',409);
      await env.DB.prepare("UPDATE orders SET status='claimed',payment_claimed_at=?,updated_at=? WHERE id=? AND status IN ('pending','claimed')").bind(now(),now(),o.id).run();
      await event(env,o.id,'payment_claimed');await enqueue(env,o.id,'payment_claimed');return result({ok:true,status:'claimed'});
    }
    if(path==='/api/order/message'&&req.method==='PUT') {
      if(!writableLetter(o))bad('Cartinha indisponível para edição.',403);
      editable(config,o);
      const data=await jsonBody(req,40000),html=safeRich(data.rich_html||'');
      const sender=data.sender_name===undefined?o.sender_name:assertText(data.sender_name,100,'Remetente',false);
      const composition=JSON.stringify(normalizeComposition(data.composition===undefined
        ? JSON.parse(o.composition_json||'{}') : data.composition));
      if(composition.length>7000)bad('Decoração excede o limite permitido.',413);
      const saved=await env.DB.prepare("UPDATE orders SET sender_name=?,rich_html=?,composition_json=?,public_message=0,updated_at=? WHERE id=? AND status IN ('pending','claimed','paid','preparing','delivered')")
        .bind(sender,html,composition,now(),o.id).run();
      if(!saved.meta.changes)bad('Pedido alterado ou cancelado. Atualize a página.',409);
      await event(env,o.id,'message_saved');
      const repaired=await markRecoveredDraft(env,o.id);
      return result({ok:true,repaired});
    }
    if(path==='/api/order/submit'&&req.method==='POST') {
      if(!activeOrder(o))bad('Pagamento não confirmado.',403);
      editable(config,o);
      const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM media WHERE order_id=? AND status='ready'").bind(o.id).first();
      if(!excerpt(o.rich_html)&&!count.count)bad('Escreva uma mensagem ou adicione uma foto ou áudio antes de enviar.');
      await env.DB.prepare("UPDATE orders SET moderation='approved',public_message=0,moderation_note='',submitted_at=?,approved_at=?,release_override=0,updated_at=? WHERE id=?").bind(now(),now(),now(),o.id).run();
      await event(env,o.id,'letter_sent');await enqueue(env,o.id,'letter_sent');return result({ok:true,submitted:true});
    }
    if(path.startsWith('/api/order/media/')){
      const file=path.match(/^\/api\/order\/media\/([a-f0-9-]{36})\/file$/);
      if(file&&req.method==='GET'){
        if(!writableLetter(o))bad('Pedido indisponível.',403);
        const media=await getMedia(env,file[1]);if(media.order_id!==o.id)bad('Arquivo de outro pedido.',403);return fetchMedia(req,env,media);
      }
    }
    if(path.startsWith('/api/order/media'))return mediaWrite(req,env,o,{},path);
  }
  bad('Rota não encontrada.',404);
}

async function requireTechnicalPreview(req, env, password) {
  // The ?secret=000000 query string only reveals a *locked* technical UI.
  // Authorization is the existing admin session PLUS a strong, independently
  // configured Worker secret. Nothing sensitive is ever trusted from the URL.
  if (!env.TECH_PREVIEW_SECRET || env.TECH_PREVIEW_SECRET.length < 20) {
    bad('A prévia técnica está desativada. Configure TECH_PREVIEW_SECRET com pelo menos 20 caracteres.', 503);
  }
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const fingerprint = await digest(ip + ':technical-preview:' + env.SESSION_SECRET);
  const seconds = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT attempts,window_start FROM login_attempts WHERE fingerprint=?'
  ).bind(fingerprint).first();
  if (row && row.window_start > seconds - 900 && row.attempts >= 5) {
    bad('Muitas tentativas técnicas. Tente novamente em 15 minutos.', 429);
  }
  const valid = typeof password === 'string' &&
    password.length >= 20 && password.length <= 256 &&
    await checkPassword(password, env.TECH_PREVIEW_SECRET);
  if (!valid) {
    const start = row && row.window_start > seconds - 900 ? row.window_start : seconds;
    const attempts = row && row.window_start > seconds - 900 ? row.attempts + 1 : 1;
    await env.DB.prepare(
      'INSERT INTO login_attempts(fingerprint,attempts,window_start) VALUES(?,?,?) ' +
      'ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start'
    ).bind(fingerprint, attempts, start).run();
    bad('Credencial técnica inválida.', 403);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE fingerprint=?').bind(fingerprint).run();
}

// Paginated, private-only eligibility scan. Never return saved letter HTML to the admin.
async function paidDraftRows(env,cursor='',limit=60) {
  const sql=`
    SELECT o.id,o.rich_html,EXISTS(
      SELECT 1 FROM media m WHERE m.order_id=o.id AND m.status='ready'
    ) AS has_ready_media
    FROM orders o WHERE o.submitted_at IS NULL
      AND o.status IN ('paid','preparing','delivered')
      AND o.id > ?
    ORDER BY o.id LIMIT ?
  `;
  return (await env.DB.prepare(sql).bind(cursor,limit).all()).results;
}
function paidDraftHasContent(row) {
  return Boolean(excerpt(row.rich_html) || row.has_ready_media);
}

// A paid draft is only approved after the server checks persisted content.
async function finalizeReviewedPaidDraft(env,id,auditDetail) {
  const order=await env.DB.prepare(
    'SELECT id,status,submitted_at,rich_html FROM orders WHERE id=? AND campaign_key IS NULL'
  ).bind(id).first();
  if(!order)bad('Cartinha não encontrada.',404);
  if(!activeOrder(order))bad('A cartinha ainda não tem pagamento confirmado.',409);
  if(order.submitted_at)bad('A cartinha já foi enviada.',409);
  const media=await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM media WHERE order_id=? AND status='ready'"
  ).bind(order.id).first();
  if(!excerpt(order.rich_html) && !media.n)
    bad('O rascunho está vazio no servidor. Peça ao remetente para salvar a mensagem ou os anexos.',409);
  const timestamp=now();
  const changed=await env.DB.prepare(
    "UPDATE orders SET moderation='approved',public_message=0,moderation_note='',"+
    "submitted_at=?,approved_at=?,release_override=0,updated_at=? "+
    "WHERE id=? AND submitted_at IS NULL AND status IN ('paid','preparing','delivered')"
  ).bind(timestamp,timestamp,timestamp,order.id).run();
  if(changed.meta.changes!==1)bad('Esta cartinha foi alterada. Atualize a página.',409);
  let notification_warning=false;
  try {
    await event(env,order.id,'letter_sent',auditDetail);
    await enqueue(env,order.id,'letter_sent');
  } catch {
    notification_warning=true;
  }
  return result({ok:true,submitted:true,status:order.status,notification_warning});
}

async function adminRoute(req,env,path) {
  if(path==='/api/admin/login'&&req.method==='POST')return login(req,env);
  if(path==='/api/admin/logout'&&req.method==='POST')return result({ok:true},200,{'Set-Cookie':'ejc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  await requireAdmin(req,env);
  if(path==='/api/admin/me')return result({authenticated:true});
  // The campaign is an official, complimentary letter, NOT a Pix sale.
  if(path==='/api/admin/campaign/mini-mercado' && req.method==='GET') {
    const saved=await env.DB.prepare(
      'SELECT key,title,markdown,whatsapp,composition_json FROM ejc_campaigns WHERE key=?'
    ).bind(CAMPAIGN_KEY).first();
    const published=await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM orders WHERE campaign_key=?'
    ).bind(CAMPAIGN_KEY).first();
    const active=await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM recipients WHERE active=1'
    ).first();
    return result({
      campaign:saved?{
        key:CAMPAIGN_KEY,title:saved.title,markdown:saved.markdown,whatsapp:saved.whatsapp,
        composition:normalizeComposition(JSON.parse(saved.composition_json||'{}'))
      }:DEFAULT_CAMPAIGN,
      published_count:published.n,active_recipients:active.n
    });
  }
  if(path==='/api/admin/campaign/mini-mercado' && req.method==='PUT') {
    const data=await jsonBody(req,25000);
    if(!data || typeof data!=='object' || Array.isArray(data))bad('Campanha inválida.');
    const title=assertText(data.title,140,'Título da campanha');
    const markdown=assertText(data.markdown,14000,'Texto da cartinha');
    if(!excerpt(letterMarkdownToHtml(markdown)))bad('A cartinha não pode estar vazia.');
    const whatsapp=assertText(data.whatsapp,7000,'Mensagem do WhatsApp');
    if(!whatsapp.includes('{link}'))bad('A mensagem do WhatsApp precisa incluir {link}.');
    const composition=normalizeComposition({
      ...data.composition,anonymous:false,authorName:CAMPAIGN_SENDER
    });
    const json=JSON.stringify(composition);
    await env.DB.prepare(
      'INSERT INTO ejc_campaigns(key,title,markdown,whatsapp,composition_json,updated_at) '+
      'VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET '+
      'title=excluded.title,markdown=excluded.markdown,whatsapp=excluded.whatsapp,'+
      'composition_json=excluded.composition_json,updated_at=excluded.updated_at'
    ).bind(CAMPAIGN_KEY,title,markdown,whatsapp,json,now()).run();
    return result({ok:true,campaign:{key:CAMPAIGN_KEY,title,markdown,whatsapp,composition}});
  }
  if(path==='/api/admin/campaign/mini-mercado/publish' && req.method==='POST') {
    const input=await jsonBody(req,256);
    const cursor=input && typeof input==='object' ? (input.cursor??'') : '';
    if(typeof cursor!=='string'||(cursor&&!/^[a-f0-9-]{36}$/i.test(cursor)))
      bad('Cursor da campanha inválido.');
    let campaign=await env.DB.prepare('SELECT * FROM ejc_campaigns WHERE key=?')
      .bind(CAMPAIGN_KEY).first();
    if(!campaign){
      await env.DB.prepare(
        'INSERT OR IGNORE INTO ejc_campaigns(key,title,markdown,whatsapp,composition_json,updated_at) '+
        'VALUES(?,?,?,?,?,?)'
      ).bind(CAMPAIGN_KEY,DEFAULT_CAMPAIGN.title,DEFAULT_CAMPAIGN.markdown,
        DEFAULT_CAMPAIGN.whatsapp,JSON.stringify(DEFAULT_CAMPAIGN.composition),now()).run();
      campaign=await env.DB.prepare('SELECT * FROM ejc_campaigns WHERE key=?')
        .bind(CAMPAIGN_KEY).first();
    }
    const rich=safeRich(letterMarkdownToHtml(campaign.markdown));
    if(!excerpt(rich))bad('A campanha não contém texto para publicar.');
    const composition=JSON.stringify(normalizeComposition({
      ...JSON.parse(campaign.composition_json||'{}'),anonymous:false,
      authorName:CAMPAIGN_SENDER
    }));
    const recipients=(await env.DB.prepare(
      'SELECT id FROM recipients WHERE active=1 AND id>? ORDER BY id LIMIT 21'
    ).bind(cursor).all()).results;
    const page=recipients.slice(0,20);
    let created=0,updated=0,unchanged=0;
    for(const person of page) {
      const current=await env.DB.prepare(
        'SELECT id,first_read_at FROM orders WHERE campaign_key=? AND recipient_id=?'
      ).bind(CAMPAIGN_KEY,person.id).first();
      if(current) {
        if(current.first_read_at){unchanged++;continue;}
        const edited=await env.DB.prepare(
          "UPDATE orders SET rich_html=?,composition_json=?,sender_name=?,updated_at=? "+
          "WHERE id=? AND first_read_at IS NULL AND campaign_key=?"
        ).bind(rich,composition,CAMPAIGN_SENDER,now(),current.id,CAMPAIGN_KEY).run();
        if(edited.meta.changes)updated++;
        continue;
      }
      const id='EJC-'+randomCode();
      const stamp=now();
      const inserted=await env.DB.prepare(
        'INSERT OR IGNORE INTO orders('+
        'id,token_hash,recipient_id,sender_name,status,total_cents,pix_payload,txid,'+
        'rich_html,composition_json,moderation,submitted_at,approved_at,public_message,'+
        'release_override,campaign_key,created_at,updated_at) '+
        "VALUES(?,?,?,?,'paid',0,?,?,?,?,'approved',?,?,0,0,?,?,?)"
      ).bind(id,await digest(token()),person.id,CAMPAIGN_SENDER,
        'CORTESIA-SEM-PIX','GIFT'+randomCode(),rich,composition,
        stamp,stamp,CAMPAIGN_KEY,stamp,stamp).run();
      if(inserted.meta.changes){
        created++;
        await event(env,id,'letter_sent','official_complimentary_campaign');
        await enqueue(env,id,'letter_sent');
      } else unchanged++;
    }
    return result({
      created,updated,unchanged,processed:page.length,
      next_cursor:recipients.length>20?page[page.length-1].id:null
    });
  }
  if(path==='/api/admin/whatsapp/deliveries' && req.method==='POST') {
    const data=await jsonBody(req,400);
    if(!data || typeof data!=='object'||Array.isArray(data))bad('Confirmação inválida.');
    if(!['mural',CAMPAIGN_KEY].includes(data.campaign_key))bad('Tipo de convite inválido.');
    if(typeof data.recipient_id!=='string'|| !/^[a-f0-9-]{36}$/i.test(data.recipient_id))
      bad('Encontrista inválido.');
    if(data.image_sent!==true)bad('Confirme se a imagem foi enviada no WhatsApp.');
    const person=await env.DB.prepare('SELECT id,active,whatsapp_phone FROM recipients WHERE id=?')
      .bind(data.recipient_id).first();
    if(!person||!person.active||!person.whatsapp_phone)
      bad('Encontrista sem WhatsApp ativo.',409);
    const sent=now();
    const authored=data.campaign_key===CAMPAIGN_KEY
      ? await env.DB.prepare('SELECT whatsapp FROM ejc_campaigns WHERE key=?').bind(CAMPAIGN_KEY).first()
      : null;
    // Store the reusable message template, NOT an expanded token-bearing personal URL.
    const template=authored?.whatsapp || (data.campaign_key==='mural'?'mural_invitation_v1':'campaign_default_v1');
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO recipient_whatsapp_deliveries(recipient_id,campaign_key,sent_at,send_count,image_sent) '+
        'VALUES(?,?,?,1,1) ON CONFLICT(recipient_id,campaign_key) DO UPDATE SET '+
        'sent_at=excluded.sent_at,send_count=send_count+1,image_sent=1'
      ).bind(person.id,data.campaign_key,sent),
      env.DB.prepare(
        'INSERT INTO recipient_whatsapp_delivery_history('+
        'id,recipient_id,campaign_key,sent_at,sent_by,image_sent,message_template) '+
        'VALUES(?,?,?,?,?,?,?)'
      ).bind(newId(),person.id,data.campaign_key,sent,'admin',1,template),
    ]);
    const record=await env.DB.prepare(
      'SELECT sent_at,send_count,image_sent FROM recipient_whatsapp_deliveries '+
      'WHERE recipient_id=? AND campaign_key=?'
    ).bind(person.id,data.campaign_key).first();
    return result({ok:true,...record});
  }
  // Complete recipient-point-of-view diagnostics. A user's mural grant is only
  // a recipient selector here: it NEVER replaces the logged-in admin session
  // and separate technical credential. No first-read tracking or notifications.
  if (path==='/api/admin/technical-mural' && req.method==='POST') {
    const input=await jsonBody(req,3000);
    await requireTechnicalPreview(req,env,input && typeof input==='object' ? input.password : null);
    const rawToken=typeof input.mural_token==='string' ? input.mural_token.trim() : '';
    const rawCode=typeof input.mural_code==='string' ? input.mural_code.trim().toUpperCase() : '';
    const slug=typeof input.recipient_slug==='string' ? input.recipient_slug.trim() : '';
    let recipient=null;
    if (rawCode) {
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(rawCode))bad('Código pessoal do mural inválido.',403);
      recipient=await env.DB.prepare(
        'SELECT id,name,slug,active,photo_key,photo_consent,mural_code FROM recipients WHERE mural_code=?'
      ).bind(rawCode).first();
      if(!recipient)bad('Código pessoal do mural não encontrado.',403);
    } else if (rawToken) {
      const parts=rawToken.split('.');
      if(parts.length!==3 || parts[0]!=='m2' ||
        parts[1].length>500 || parts[2].length>200 ||
        !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
        !/^[A-Za-z0-9_-]+$/.test(parts[2])) {
        bad('Token de acesso do encontrista inválido.',403);
      }
      let recipientId='';
      try {
        const payload=JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
        recipientId=typeof payload.id==='string' && /^[a-f0-9-]{36}$/i.test(payload.id) ? payload.id : '';
      } catch { /* Never trust decoded claims until verified. */ }
      if(!recipientId)bad('Token de acesso do encontrista inválido.',403);
      recipient=await env.DB.prepare(
        'SELECT id,name,slug,active,photo_key,photo_consent,mural_code FROM recipients WHERE id=?'
      ).bind(recipientId).first();
      if(!recipient || !await validMuralGrant(env,rawToken,recipient))
        bad('Token pessoal inválido, expirado ou revogado.',403);
    } else {
      if(!/^[a-z0-9-]{1,65}$/.test(slug))bad('Selecione um encontrista ou informe seu token pessoal.',400);
      recipient=await env.DB.prepare(
        'SELECT id,name,slug,active,photo_key,photo_consent,mural_code FROM recipients WHERE slug=?'
      ).bind(slug).first();
      if(!recipient)bad('Encontrista não encontrado.',404);
    }

    const rows=(await env.DB.prepare(
      "SELECT o.id,o.status,o.submitted_at,o.created_at,o.sender_name,o.rich_html,o.composition_json "+
      "FROM orders o WHERE o.recipient_id=? ORDER BY o.created_at DESC,o.id"
    ).bind(recipient.id).all()).results;
    const mediaRows=(await env.DB.prepare(
      "SELECT m.id,m.order_id,m.kind,m.filename,m.content_type,m.bytes "+
      "FROM media m JOIN orders o ON o.id=m.order_id "+
      "WHERE o.recipient_id=? AND m.status='ready' ORDER BY m.created_at"
    ).bind(recipient.id).all()).results;
    const byOrder=new Map();
    for(const m of mediaRows) {
      if(!byOrder.has(m.order_id))byOrder.set(m.order_id,[]);
      byOrder.get(m.order_id).push({
        id:m.id,kind:m.kind,filename:m.filename,
        content_type:m.content_type,bytes:m.bytes
      });
    }
    const config=await settings(env);
    const recipientVisible=released(config);
    return result({
      recipient:{name:recipient.name,slug:recipient.slug,
        photo_url:recipient.active ? recipientPhotoUrl(recipient) : null},
      locked:!recipientVisible,
      release_at:config.release_at,
      technical:true,
      cards:rows.map(row=>({
        id:row.id,status:row.status,submitted:!!row.submitted_at,
        created_at:row.created_at,submitted_at:row.submitted_at,
        visible_to_recipient:recipientVisible && activeOrder(row),
        draft_pending:activeOrder(row) && !row.submitted_at,
        empty_content:!!row.submitted_at && !excerpt(row.rich_html) && !(byOrder.get(row.id)||[]).length,
        sender_name:row.sender_name || 'Uma pessoa especial',
        recipient_name:recipient.name,
        rich_html:row.rich_html || '',
        composition:normalizeComposition(JSON.parse(row.composition_json||'{}')),
        media:byOrder.get(row.id)||[]
      }))
    });
  }

  // Existing technical review stays available with its separate credential.
  const reviewFinalize=path.match(/^\/api\/admin\/technical-preview\/(EJC-[A-F0-9]{12})\/finalize$/);
  if(reviewFinalize && req.method==='POST') {
    const input=await jsonBody(req,600);
    await requireTechnicalPreview(req,env,input?.password);
    return finalizeReviewedPaidDraft(env,reviewFinalize[1],'technical_review_approved');
  }

  // Isolated, opt-in diagnostic access. The ordinary coordinator route below
  // continues to omit text, photos and audio. Never cache this response.
  const technicalLetter=path.match(/^\/api\/admin\/technical-preview\/(EJC-[A-F0-9]{12})$/);
  const technicalMedia=path.match(/^\/api\/admin\/technical-preview\/(EJC-[A-F0-9]{12})\/media\/([a-f0-9-]{36})$/);
  if ((technicalLetter || technicalMedia) && req.method==='POST') {
    const input=await jsonBody(req,600);
    await requireTechnicalPreview(req,env,input && typeof input==='object' ? input.password : null);
    const orderId=(technicalLetter||technicalMedia)[1];
    if (technicalMedia) {
      const media=await env.DB.prepare(
        "SELECT * FROM media WHERE id=? AND order_id=? AND status='ready'"
      ).bind(technicalMedia[2],orderId).first();
      if (!media)bad('Anexo não encontrado.',404);
      const object=await env.MEDIA.get(media.object_key);
      if (!object)bad('Anexo indisponível.',404);
      return new Response(object.body,{headers:{
        ...BASE_HEADERS,
        'Content-Type':media.content_type || 'application/octet-stream',
        'Content-Disposition':'attachment; filename="anexo-tecnico"',
      }});
    }
    const order=await orderWithRecipient(env,orderId);
    if(!order)bad('Cartinha não encontrada.',404);
    const attachments=(await env.DB.prepare(
      "SELECT id,kind,filename,content_type,bytes FROM media WHERE order_id=? AND status='ready' ORDER BY created_at"
    ).bind(orderId).all()).results;
    return result({
      id:order.id,recipient_name:order.recipient_name,
      sender_name:order.sender_name||'Uma pessoa especial',
      rich_html:order.rich_html||'',
      composition:normalizeComposition(JSON.parse(order.composition_json||'{}')),
      media:attachments,
      status:order.status,submitted:!!order.submitted_at,
    });
  }

  // Content review is available to the authenticated administrator only.
  // The ordinary list remains metadata-only. Neither preview nor media is public.
  const adminPreview=path.match(/^\/api\/admin\/cartinhas\/(EJC-[A-F0-9]{12})\/preview$/);
  const adminPreviewMedia=path.match(
    /^\/api\/admin\/cartinhas\/(EJC-[A-F0-9]{12})\/preview\/media\/([a-f0-9-]{36})$/
  );
  if ((adminPreview || adminPreviewMedia) && req.method==='GET') {
    const id=(adminPreview||adminPreviewMedia)[1];
    if(adminPreviewMedia) {
      const media=await env.DB.prepare(
        "SELECT * FROM media WHERE id=? AND order_id=? AND status='ready'"
      ).bind(adminPreviewMedia[2],id).first();
      if(!media)bad('Anexo não encontrado.',404);
      const order=await env.DB.prepare('SELECT id FROM orders WHERE id=?').bind(id).first();
      if(!order)bad('Cartinha não encontrada.',404);
      return fetchMedia(req,env,media);
    }
    const order=await orderWithRecipient(env,id);
    if(!order)bad('Cartinha não encontrada.',404);
    const attachments=(await env.DB.prepare(
      "SELECT id,kind,filename,content_type,bytes FROM media WHERE order_id=? AND status='ready' ORDER BY created_at"
    ).bind(id).all()).results;
    return result({
      id:order.id,recipient_name:order.recipient_name,
      sender_name:order.sender_name||'Uma pessoa especial',
      rich_html:order.rich_html||'',
      composition:normalizeComposition(JSON.parse(order.composition_json||'{}')),
      media:attachments,status:order.status,submitted:!!order.submitted_at,
    });
  }

  const adminFinalize=path.match(/^\/api\/admin\/cartinhas\/(EJC-[A-F0-9]{12})\/finalize$/);
  if(adminFinalize && req.method==='POST') {
    await jsonBody(req,256);
    return finalizeReviewedPaidDraft(env,adminFinalize[1],'admin_review_approved');
  }

  // A shareable resume link is a short-lived bearer credential, not a public
  // admin preview. It works for an existing paid draft without exposing the
  // original hashed token or altering the order's payment or content.
  const adminResume=path.match(/^\/api\/admin\/cartinhas\/(EJC-[A-F0-9]{12})\/resume-link$/);
  if(adminResume && req.method==='POST') {
    await jsonBody(req,256);
    const order=await env.DB.prepare(
      "SELECT id,sender_name,status,submitted_at,campaign_key FROM orders WHERE id=?"
    ).bind(adminResume[1]).first();
    if(!order)bad('Cartinha não encontrada.',404);
    if(!activeOrder(order) || order.submitted_at || order.campaign_key)
      bad('Somente rascunhos pagos podem receber um link de continuação.',409);
    const expiry=Math.floor(Date.now()/1000)+14*24*60*60;
    const code=order.id.slice(4),hexExpiry=expiry.toString(16).padStart(8,'0');
    const signed=b64url(new Uint8Array(await crypto.subtle.sign(
      'HMAC',await hmacKey(env),
      encode.encode('ejc:draft-resume:v1:'+code+':'+hexExpiry)
    )));
    const access='r1_'+code+'_'+hexExpiry+'_'+signed;
    return result({
      sender_name:order.sender_name||'Remetente não informado',
      resume_url:new URL('/pedido/'+access,req.url).toString(),
      expires_at:new Date(expiry*1000).toISOString(),
    });
  }

  // Prévia operacional segura: a coordenação vê remetente, status e stickers.
  // Corpo, HTML, fotos, áudios, nome de assinatura e tokens NUNCA são serializados.
  // Inclui cartinhas com Pix pendente e rascunhos, sem desbloquear murais.
  // Operational-only counts: the coordinator never receives the letter body.
  if(path==='/api/admin/cartinhas/finalize-preview' && req.method==='GET') {
    const summary={paid_drafts:0,eligible:0,empty:0};
    let cursor='';
    for (;;) {
      const rows=await paidDraftRows(env,cursor,200);
      for(const row of rows) {
        summary.paid_drafts++;
        if(paidDraftHasContent(row))summary.eligible++;
        else summary.empty++;
      }
      if(rows.length<200)break;
      cursor=rows[rows.length-1].id;
    }
    return result(summary);
  }
  if(path==='/api/admin/cartinhas/finalize-paid' && req.method==='POST') {
    const input=await jsonBody(req,256);
    const cursor=input && typeof input==='object' ? (input.cursor??'') : '';
    if(typeof cursor!=='string' || (cursor&&!/^EJC-[A-F0-9]{12}$/.test(cursor)))
      bad('Cursor de finalização inválido.');
    // Each request processes one bounded batch, to remain responsive on mobile.
    const rows=await paidDraftRows(env,cursor,40);
    let finalized=0,empty=0;
    const failures=[],notificationFailures=[];
    for(const row of rows) {
      if(!paidDraftHasContent(row)){empty++;continue;}
      try {
        const timestamp=now();
        const changed=await env.DB.prepare(
          "UPDATE orders SET moderation='approved',public_message=0,moderation_note='',"+
          "submitted_at=?,approved_at=?,release_override=0,updated_at=? "+
          "WHERE id=? AND submitted_at IS NULL AND status IN ('paid','preparing','delivered')"
        ).bind(timestamp,timestamp,timestamp,row.id).run();
        if(changed.meta.changes!==1)continue; // Already sent or payment changed.
        finalized++;
        try {
          await event(env,row.id,'letter_sent','admin_bulk_finalize');
          await enqueue(env,row.id,'letter_sent');
        } catch {
          // The letter stays finalized even if an auxiliary notification fails.
          notificationFailures.push(row.id);
        }
      } catch {
        failures.push(row.id);
      }
    }
    return result({
      scanned:rows.length,finalized,empty,
      failed:failures.length,failed_ids:failures,
      notification_failed:notificationFailures.length,
      next_cursor:rows.length===40?rows[rows.length-1].id:null
    });
  }

  if(path==='/api/admin/cartinhas' && req.method==='GET') {
    const rows=(await env.DB.prepare(
      `SELECT o.id,o.sender_name,o.status,o.submitted_at,o.created_at,o.composition_json,o.campaign_key,o.rich_html,
        EXISTS(SELECT 1 FROM media m WHERE m.order_id=o.id AND m.status='ready') AS has_ready_media,
        r.id AS recipient_id,r.name AS recipient_name,r.slug AS recipient_slug
        FROM orders o JOIN recipients r ON r.id=o.recipient_id
        ORDER BY o.created_at DESC`
    ).all()).results;
    const letters=rows.map(row=>{
      let design;
      try { design=normalizeComposition(JSON.parse(row.composition_json||'{}')); }
      catch { design=normalizeComposition({}); }
      return {
        id:row.id,
        sender_name:row.sender_name||'Remetente não informado',
        recipient_id:row.recipient_id,recipient_name:row.recipient_name,
        recipient_slug:row.recipient_slug,status:row.status,gift:!!row.campaign_key,
        submitted:!!row.submitted_at,created_at:row.created_at,
        has_content:!!excerpt(row.rich_html)||!!row.has_ready_media,
        theme:design.theme,stickers:design.stickers
      };
    });
    return result({letters});
  }

  if(path==='/api/admin/branding/logo' && req.method==='POST') {
    const image=await receiveSafeImage(req,2*1024*1024);
    await env.MEDIA.put('branding/ejc-market-logo',image.bytes,{httpMetadata:{contentType:image.type}});
    return result({ok:true,logo_url:`/api/branding/logo?v=${Date.now()}`});
  }
  if(path==='/api/admin/branding/logo' && req.method==='DELETE') {
    await env.MEDIA.delete('branding/ejc-market-logo');
    return result({ok:true});
  }
  const stickerUpload=path.match(/^\/api\/admin\/stickers\/([a-z0-9-]+)\.png$/);
  if(stickerUpload&&(req.method==='POST'||req.method==='DELETE')){
    const id=stickerUpload[1];
    if(!STICKERS_BY_ID[id])bad('Adesivo desconhecido.',404);
    const key='stickers/v1/'+id+'.png';
    if(req.method==='DELETE'){
      await env.MEDIA.delete(key);
      return result({ok:true});
    }
    const asset=await receiveSafeImage(req,16*1024*1024);
    if(asset.type!=='image/png')bad('Envie a arte original em PNG.',415);
    if(asset.bytes.length<24||!asset.bytes.slice(0,8).every((b,index)=>b===[137,80,78,71,13,10,26,10][index]))
      bad('O arquivo não é um PNG válido.',415);
    await env.MEDIA.put(key,asset.bytes,{httpMetadata:{contentType:'image/png'}});
    return result({ok:true,url:'/api/stickers/'+id+'.png?v='+Date.now()});
  }
  if(path==='/api/admin/stickers'&&req.method==='GET'){
    const entries=await Promise.all(Object.keys(STICKERS_BY_ID).map(async id=>({
      id,exists:!!(await env.MEDIA.head('stickers/v1/'+id+'.png'))
    })));
    return result({stickers:entries});
  }
  if(path==='/api/admin/og/default'&&req.method==='POST'){
    const image=await receiveSafeImage(req,5*1024*1024);
    if(image.type!=='image/png')bad('Prévia social deve ser PNG.',415);
    const view=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength);
    if(image.bytes.byteLength<24||view.getUint32(16)!==1200||view.getUint32(20)!==630)
      bad('A imagem social da home deve medir 1200 x 630 pixels.',400);
    await env.MEDIA.put('og/default-v3.png',image.bytes,{httpMetadata:{contentType:'image/png'}});
    return result({ok:true,url:'/og-ejc-default.png?v='+Date.now()});
  }
  const ogUpload=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/og$/);
  if(ogUpload&&req.method==='POST'){
    const r=await env.DB.prepare('SELECT id,slug,og_key,photo_key,photo_consent FROM recipients WHERE id=? AND active=1').bind(ogUpload[1]).first();
    if(!r)bad('Encontrista não encontrado.',404);
    if(r.photo_key&&!r.photo_consent)bad('Foto sem autorização de publicação.',403);
    const image=await receiveSafeImage(req,5*1024*1024);
    if(image.type!=='image/png')bad('A prévia deve ser PNG.',415);
    const dimensions=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength);
    if(image.bytes.byteLength<24||dimensions.getUint32(16)!==1200||dimensions.getUint32(20)!==630)
      bad('A imagem deve ter 1200 x 630 pixels.',400);
    const key='og/v3/'+r.id+'/'+newId()+'.png';
    await env.MEDIA.put(key,image.bytes,{httpMetadata:{contentType:'image/png'}});
    await env.DB.prepare('UPDATE recipients SET og_key=? WHERE id=?').bind(key,r.id).run();
    if(r.og_key)await env.MEDIA.delete(r.og_key);
    return result({ok:true,url:'/api/og/'+r.slug+'.png'});
  }

  const muralOgUpload=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/mural-og$/);
  if(muralOgUpload && req.method==='POST'){
    const r=await env.DB.prepare(
      'SELECT id,slug,mural_og_key,photo_key,photo_consent FROM recipients WHERE id=? AND active=1'
    ).bind(muralOgUpload[1]).first();
    if(!r)bad('Encontrista não encontrado.',404);
    if(r.photo_key&&!r.photo_consent)bad('Foto sem autorização de publicação.',403);
    const image=await receiveSafeImage(req,5*1024*1024);
    if(image.type!=='image/png')bad('A prévia do mural deve ser PNG.',415);
    const dimensions=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength);
    if(image.bytes.byteLength<24||dimensions.getUint32(16)!==1200||dimensions.getUint32(20)!==630)
      bad('A OG do mural deve medir 1200 × 630 pixels.',400);
    const key='og/mural/v1/'+r.id+'/'+newId()+'.png';
    await env.MEDIA.put(key,image.bytes,{httpMetadata:{contentType:'image/png'}});
    await env.DB.prepare('UPDATE recipients SET mural_og_key=? WHERE id=?').bind(key,r.id).run();
    if(r.mural_og_key)await env.MEDIA.delete(r.mural_og_key).catch(()=>{});
    return result({ok:true,url:'/api/og/mural/'+r.slug+'.png?v='+key.split('/').pop()});
  }

  const inviteLink=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/whatsapp-link$/);
  if(inviteLink && req.method==='POST'){
    const person=await env.DB.prepare(
      'SELECT id,name,slug,active,mural_code,whatsapp_phone,og_key,mural_og_key,photo_key,photo_consent FROM recipients WHERE id=?'
    ).bind(inviteLink[1]).first();
    if(!person || !person.active)bad('Encontrista indisponível.',404);
    const phone=normaliseWhatsAppPhone(person.whatsapp_phone);
    if(!phone)bad('Cadastre primeiro o WhatsApp do encontrista.',409);
    const ready=await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM orders WHERE recipient_id=? AND submitted_at IS NOT NULL AND status IN ('paid','preparing','delivered')"
    ).bind(person.id).first();
    if(!ready?.count)bad('O encontrista ainda não tem cartinhas pagas e enviadas.',409);
    if(!person.mural_og_key)bad('Gere a imagem do convite antes de compartilhar o mural.',409);
    if(!person.mural_code){
      const code=await nextUniqueMuralCode(env);
      await env.DB.prepare('UPDATE recipients SET mural_code=? WHERE id=? AND mural_code IS NULL').bind(code,person.id).run();
      const latest=await env.DB.prepare('SELECT mural_code FROM recipients WHERE id=?').bind(person.id).first();
      person.mural_code=latest.mural_code;
    }
    const grant=await muralGrant(env,person);
    const origin=new URL(env.PUBLIC_ORIGIN||req.url).origin;
    const image=socialImage(person,null,'mural');
    const address=new URL('/mural/'+encodeURIComponent(person.slug),origin);
    address.searchParams.set('og',image.version);
    // Fragment keeps the access token out of HTTP logs and OG preview crawlers.
    address.hash='token='+encodeURIComponent(grant);
    return result({
      name:person.name,phone,url:address.toString(),count:ready.count,
      og_url:origin+image.path,expires_in_days:14
    });
  }

  const photoUpload=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/photo$/);
  if(photoUpload && (req.method==='POST'||req.method==='DELETE')) {
    const r=await env.DB.prepare('SELECT id,photo_key,og_key,mural_og_key FROM recipients WHERE id=?').bind(photoUpload[1]).first();
    if(!r)bad('Encontrista não encontrado.',404);
    if(req.method==='DELETE') {
      await env.DB.prepare('UPDATE recipients SET photo_key=NULL,photo_consent=0,og_key=NULL,mural_og_key=NULL WHERE id=?').bind(r.id).run();
      if(r.photo_key)await env.MEDIA.delete(r.photo_key);
      if(r.og_key)await env.MEDIA.delete(r.og_key);
      if(r.mural_og_key)await env.MEDIA.delete(r.mural_og_key).catch(()=>{});
      return result({ok:true});
    }
    if(req.headers.get('X-Photo-Consent')!=='confirmed')bad('Confirme a autorização para divulgação da foto.',403);
    const image=await receiveSafeImage(req,5*1024*1024);
    if(image.type!=='image/jpeg')bad('Abra o editor de fotos para salvar o recorte quadrado em JPEG.',415);
    if(!isSquareRecipientJpeg(image.bytes))bad('A foto precisa estar recortada em quadrado (1:1). Use o editor de fotos.',422);
    const key=`recipients/${r.id}/${newId()}`;
    await env.MEDIA.put(key,image.bytes,{httpMetadata:{contentType:image.type}});
    await env.DB.prepare('UPDATE recipients SET photo_key=?,photo_consent=1,og_key=NULL,mural_og_key=NULL WHERE id=?').bind(key,r.id).run();
    if(r.photo_key)await env.MEDIA.delete(r.photo_key);
    if(r.og_key)await env.MEDIA.delete(r.og_key);
    if(r.mural_og_key)await env.MEDIA.delete(r.mural_og_key).catch(()=>{});
    return result({ok:true,photo_url:`/api/recipients/${r.id}/photo?v=${key.split('/').pop()}`});
  }
  // One Pix may pay many private letters. Match payment IDs and then
  // include all recipient names linked to the payment, never message content.
  if(path==='/api/admin/payments/search'&&req.method==='POST'){
    const input=await jsonBody(req,1800);
    const query=normalizePaymentLookup(input.query||'');
    const recipient=String(input.recipient||'').trim().slice(0,100);
    const payer=String(input.payer||'').trim().slice(0,100);
    const sender=String(input.sender||'').trim().slice(0,100);
    const status=maskedStatus(input.status||'');
    const where=['o.campaign_key IS NULL'],args=[];
    if(query){
      const term=likeTerm(query);
      where.push(`(
        UPPER(REPLACE(COALESCE(c.id,o.id),'-','')) LIKE ? ESCAPE char(92)
        OR UPPER(REPLACE(COALESCE(c.txid,o.txid),'-','')) LIKE ? ESCAPE char(92)
        OR UPPER(COALESCE(c.bank_reference,o.bank_reference,'')) LIKE ? ESCAPE char(92)
        OR UPPER(COALESCE(c.payer_name,o.payer_name,'')) LIKE ? ESCAPE char(92)
        OR r.name LIKE ? ESCAPE char(92) COLLATE NOCASE
        OR o.sender_name LIKE ? ESCAPE char(92) COLLATE NOCASE
      )`);
      args.push(term,term,term,term,term,term);
    }
    if(recipient){
      where.push('r.name LIKE ? ESCAPE char(92) COLLATE NOCASE');
      args.push(likeTerm(recipient));
    }
    if(payer){
      where.push('COALESCE(c.payer_name,o.payer_name) LIKE ? ESCAPE char(92) COLLATE NOCASE');
      args.push(likeTerm(payer));
    }
    if(sender){
      where.push('o.sender_name LIKE ? ESCAPE char(92) COLLATE NOCASE');
      args.push(likeTerm(sender));
    }
    if(status){
      where.push('COALESCE(c.status,o.status)=?');
      args.push(status);
    }
    if(input.only_sent===true)where.push('o.submitted_at IS NOT NULL');
    // Paginate distinct payments, not letters: a checkout with many letters
    // must never be split across pages. Stable ordering handles equal dates.
    const offset=input.offset===undefined?0:input.offset;
    if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)bad('Página de pagamentos inválida.');
    const pageSize=100;
    if(input.pending_only===true)where.push("COALESCE(c.status,o.status) IN ('pending','claimed')");
    const condition=where.length?'WHERE '+where.join(' AND '):'';
    const sql=`
      WITH matched AS (
        SELECT COALESCE(o.checkout_id,o.id) AS payment_id,
          MAX(COALESCE(c.created_at,o.created_at)) AS payment_created
        FROM orders o
        JOIN recipients r ON r.id=o.recipient_id
        LEFT JOIN checkouts c ON c.id=o.checkout_id
        ${condition}
        GROUP BY COALESCE(o.checkout_id,o.id)
        ORDER BY payment_created DESC,payment_id DESC LIMIT ? OFFSET ?
      )
      SELECT m.payment_id,
        COALESCE(c.status,o.status) AS payment_status,
        COALESCE(c.total_cents,o.total_cents) AS payment_cents,
        COALESCE(c.txid,o.txid) AS payment_txid,
        COALESCE(c.bank_reference,o.bank_reference) AS bank_reference,
        COALESCE(c.payer_name,o.payer_name) AS payer_name,
        m.payment_created, o.checkout_id,o.id AS order_id,o.status AS order_status,
        r.name AS recipient_name,
        CASE WHEN o.submitted_at IS NULL THEN 0 ELSE 1 END AS submitted
      FROM matched m JOIN orders o ON COALESCE(o.checkout_id,o.id)=m.payment_id
      JOIN recipients r ON r.id=o.recipient_id
      LEFT JOIN checkouts c ON c.id=o.checkout_id
      ORDER BY m.payment_created DESC,m.payment_id DESC,o.checkout_item_index,o.created_at DESC
    `;
    // One extra payment determines whether another page exists.
    const rows=(await env.DB.prepare(sql).bind(...args,pageSize+1,offset).all()).results;
    const payments=[];
    for(const row of rows){
      let payment=payments[payments.length-1];
      if(!payment || payment.id!==row.payment_id){
        payment={
          id:row.payment_id,checkout_id:row.checkout_id,
          status:row.payment_status,total_cents:row.payment_cents,
          txid:row.payment_txid,bank_reference:row.bank_reference,
          payer_name:row.payer_name||'',created_at:row.payment_created,items:[]
        };
        payments.push(payment);
      }
      payment.items.push({
        id:row.order_id,recipient_name:row.recipient_name,
        status:row.order_status,submitted:!!row.submitted
      });
    }
    return result({
      payments:payments.slice(0,pageSize),
      limit:pageSize,
      next_offset:payments.length>pageSize?offset+pageSize:null
    });
  }
  // Only operational payment metadata is returned; letter content remains private.
  if(path==='/api/admin/reconciliation/payments'&&req.method==='GET'){
    const payments=(await env.DB.prepare(
      "SELECT id,txid,total_cents,status,created_at,payer_name,bank_reference,'checkout' AS type FROM checkouts " +
      "UNION ALL " +
      "SELECT id,txid,total_cents,status,created_at,payer_name,bank_reference,'order' AS type " +
      "FROM orders WHERE checkout_id IS NULL AND COALESCE(demo,0)=0 AND campaign_key IS NULL " +
      "ORDER BY created_at DESC LIMIT 1500"
    ).all()).results;
    return result({payments});
  }
  if(path==='/api/admin/checkouts'&&req.method==='GET'){
    const checkouts=(await env.DB.prepare(
      "SELECT c.id,c.status,c.total_cents,c.txid,c.payer_name,c.created_at,c.claimed_at,c.confirmed_at,c.bank_reference,COUNT(o.id) AS item_count FROM checkouts c JOIN orders o ON o.checkout_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500"
    ).all()).results;
    return result({checkouts});
  }
  const checkoutStatus=path.match(/^\/api\/admin\/checkouts\/(EJCB-[A-F0-9]{12})\/status$/);
  if(checkoutStatus&&req.method==='PATCH'){
    const input=await jsonBody(req,700);
    if(input.status!=='paid')bad('A coordenação só pode confirmar o Pix.',409);
    const order=await env.DB.prepare('SELECT id,status,total_cents FROM checkouts WHERE id=?').bind(checkoutStatus[1]).first();
    if(!order)bad('Compra não encontrada.',404);
    if(!['pending','claimed'].includes(order.status))bad('A compra já foi processada.',409);
    if(input.bank_checked!==true||input.amount_checked!==true)bad('Confira recebimento e total no extrato.',400);
    const reference=assertText(input.bank_reference||'',128,'Identificador bancário',false).toUpperCase();
    // The admin can approve a verified batch without an E2E/FITID. Keep single
    // approvals strict, and store SQL NULL rather than inventing a bank code.
    if(!reference && input.manual_batch!==true)bad('Identificador bancário inválido.');
    if(reference && !/^[A-Z0-9:/._-]{8,128}$/.test(reference))bad('Identificador bancário inválido.');
    if(reference){
      const priorCheckout=await env.DB.prepare('SELECT id FROM checkouts WHERE bank_reference=?').bind(reference).first();
      const priorOrder=await env.DB.prepare('SELECT id FROM orders WHERE bank_reference=?').bind(reference).first();
      if(priorCheckout||priorOrder)bad('Esta transferência já foi confirmada.',409);
    }
    const confirmed=now();
    const results=await env.DB.batch([
      env.DB.prepare(
        "UPDATE checkouts SET status='paid',bank_reference=?,confirmed_at=? WHERE id=? AND status IN ('pending','claimed')"
      ).bind(reference||null,confirmed,order.id),
      env.DB.prepare(
        "UPDATE orders SET status='paid',confirmed_at=?,updated_at=? WHERE checkout_id=? AND status IN ('pending','claimed')"
      ).bind(confirmed,confirmed,order.id),
    ]);
    if(results[0].meta.changes!==1)bad('Compra alterada por outro administrador.',409);
    const children=(await env.DB.prepare('SELECT id FROM orders WHERE checkout_id=?').bind(order.id).all()).results;
    for(const row of children){
      await markEmptyPaidDraft(env,row.id);
      await event(env,row.id,'payment_confirmed',reference||'manual_batch_no_reference');
      await enqueue(env,row.id,'payment_confirmed');
    }
    return result({ok:true,status:'paid',letters:children.length});
  }
  if(path==='/api/admin/bootstrap'&&req.method==='GET'){
    const [config,recipients,orders]=await Promise.all([
      settings(env),
      env.DB.prepare(`SELECT r.id,r.name,r.slug,r.active,r.created_at,r.photo_key,r.photo_consent,r.og_key,r.mural_og_key,r.mural_code,r.whatsapp_phone,
        (SELECT COUNT(*) FROM orders o WHERE o.recipient_id=r.id) AS order_count,
        (SELECT COUNT(*) FROM orders o WHERE o.recipient_id=r.id AND o.submitted_at IS NOT NULL
          AND o.status IN ('paid','preparing','delivered')) AS ready_letter_count,
        (SELECT COUNT(*) FROM orders gift WHERE gift.recipient_id=r.id
          AND gift.campaign_key='pos-encontro' AND gift.submitted_at IS NOT NULL) AS campaign_letter_count,
        (SELECT d.sent_at FROM recipient_whatsapp_deliveries d WHERE d.recipient_id=r.id
          AND d.campaign_key='pos-encontro') AS campaign_wa_sent_at,
        (SELECT d.send_count FROM recipient_whatsapp_deliveries d WHERE d.recipient_id=r.id
          AND d.campaign_key='pos-encontro') AS campaign_wa_send_count,
        (SELECT d.sent_at FROM recipient_whatsapp_deliveries d WHERE d.recipient_id=r.id
          AND d.campaign_key='mural') AS mural_wa_sent_at
        FROM recipients r ORDER BY r.name COLLATE NOCASE`).all(),
      env.DB.prepare(`SELECT o.id,o.status,o.total_cents,o.created_at,o.payment_claimed_at,o.confirmed_at,o.bank_reference,
        CASE WHEN o.submitted_at IS NULL THEN 0 ELSE 1 END AS submitted,o.demo,
        r.name AS recipient_name,r.slug AS recipient_slug,
        COALESCE(NULLIF(c.payer_name,''),o.payer_name) AS payer_name,
        o.checkout_id,o.txid,COALESCE(c.txid,o.txid) AS payment_txid
        FROM orders o JOIN recipients r ON o.recipient_id=r.id
        LEFT JOIN checkouts c ON c.id=o.checkout_id WHERE o.campaign_key IS NULL
        ORDER BY o.created_at DESC LIMIT 500`).all()
    ]);
    const logo=await env.MEDIA.head('branding/ejc-market-logo');
    return result({config:{...config,logo_url:logo?`/api/branding/logo?v=${logo.uploaded?.getTime()||0}`:null},
      recipients:recipients.results.map(r=>({
        ...r,
        photo_url:recipientPhotoUrl(r),
        og_url:socialImage(r).path,
        mural_og_url:socialImage(r,null,'mural').path,
        mural_og_ready:!!r.mural_og_key,
        og_safe:typeof r.og_key==='string'&&r.og_key.startsWith('og/v3/')
      })),orders:orders.results});
  }

  if(path==='/api/admin/mural-codes/generate'&&req.method==='POST'){
    const input=await jsonBody(req,500);
    const overwrite=input.regenerate===true;
    const people=(await env.DB.prepare('SELECT id,mural_code FROM recipients WHERE active=1').all()).results;
    let generated=0;
    for(const person of people){
      if(person.mural_code&&!overwrite)continue;
      const code=await nextUniqueMuralCode(env);
      await env.DB.prepare('UPDATE recipients SET mural_code=? WHERE id=?').bind(code,person.id).run();
      generated++;
    }
    return result({ok:true,generated});
  }
  const replaceMuralCode=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/mural-code$/);
  if(replaceMuralCode&&req.method==='POST'){
    const person=await env.DB.prepare('SELECT id FROM recipients WHERE id=?').bind(replaceMuralCode[1]).first();
    if(!person)bad('Encontrista não encontrado.',404);
    const code=await nextUniqueMuralCode(env);
    await env.DB.prepare('UPDATE recipients SET mural_code=? WHERE id=?').bind(code,person.id).run();
    return result({ok:true,code});
  }
  if(path==='/api/admin/settings'&&req.method==='PUT'){
    const data=await jsonBody(req),keys=['pix_key','pix_name','pix_city','deadline','release_at','open','store_title','store_subtitle','message_price_cents','analytics_id'];
    const updates=[];
    for(const key of keys){
      if(!(key in data))continue;
      let value;
      if(key==='open')value=data.open===true?'true':'false';
      else if(key==='message_price_cents'){
        const val=Number(data[key]);if(!Number.isSafeInteger(val)||val<100||val>5000000)bad('Preço inválido (mínimo R$ 1).');value=String(val);
      } else {
        value=assertText(data[key],key==='store_subtitle'?250:key==='pix_key'?77:120,key,key!=='pix_key'&&key!=='analytics_id');
        if(key==='deadline'||key==='release_at')brazilTimeEnd(value);
        if(key==='analytics_id'&&value&&!/^G-[A-Z0-9]{6,20}$/.test(value))bad('Measurement ID do GA4 inválido.');
      }
      updates.push(env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value));
    }
    if(updates.length)await env.DB.batch(updates);
    return result({ok:true,config:await settings(env)});
  }
  if(path==='/api/admin/recipients/import'&&req.method==='POST'){
    const data=await jsonBody(req,180000);
    if(!Array.isArray(data.names)||data.names.length>2500)bad('Envie até 2500 nomes.');
    const known=(await env.DB.prepare('SELECT name,slug FROM recipients').all()).results;
    const names=new Set(known.map(x=>x.name.toLocaleLowerCase('pt-BR'))),slugs=new Set(known.map(x=>x.slug).filter(Boolean));
    let inserted=0;
    for(const part of data.names){
      const name=assertText(part,100,'Nome'),key=name.toLocaleLowerCase('pt-BR');if(names.has(key))continue;
      names.add(key);
      let slug=slugify(name);while(slugs.has(slug))slug=`${slugify(name)}-${randomCode().slice(0,4).toLowerCase()}`;
      slugs.add(slug);await env.DB.prepare('INSERT INTO recipients(id,name,slug) VALUES(?,?,?)').bind(newId(),name,slug).run();inserted++;
    }
    return result({ok:true,inserted});
  }
  const recipient=path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})$/);
  if(recipient&&['PATCH','DELETE'].includes(req.method)){
    const existing=await env.DB.prepare(
      'SELECT id,name,slug,active,photo_key,og_key,mural_og_key,whatsapp_phone FROM recipients WHERE id=?'
    ).bind(recipient[1]).first();
    if(!existing)bad('Encontrista não encontrado.',404);
    const linked=await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM orders WHERE recipient_id=?'
    ).bind(existing.id).first();
    if(req.method==='DELETE'){
      if(linked.count>0){
        // Keep bank records and private letters intact; hide from new purchases.
        await env.DB.prepare('UPDATE recipients SET active=0 WHERE id=?').bind(existing.id).run();
        return result({ok:true,mode:'archived',linked_orders:linked.count});
      }
      const deleted=await env.DB.prepare(
        'DELETE FROM recipients WHERE id=? AND NOT EXISTS (SELECT 1 FROM orders WHERE recipient_id=?)'
      ).bind(existing.id,existing.id).run();
      if(deleted.meta.changes!==1)bad('Encontrista recebeu uma cartinha durante a exclusão. Atualize a página.',409);
      if(existing.photo_key)await env.MEDIA.delete(existing.photo_key).catch(()=>{});
      if(existing.og_key)await env.MEDIA.delete(existing.og_key).catch(()=>{});
      if(existing.mural_og_key)await env.MEDIA.delete(existing.mural_og_key).catch(()=>{});
      return result({ok:true,mode:'deleted',linked_orders:0});
    }
    const data=await jsonBody(req,700);
    if(!data || typeof data!=='object'||Array.isArray(data))bad('Dados inválidos.');
    if(!Object.hasOwn(data,'name')&&!Object.hasOwn(data,'active')&&!Object.hasOwn(data,'whatsapp_phone'))bad('Informe nome, WhatsApp ou situação do encontrista.');
    const name=Object.hasOwn(data,'name')?assertText(data.name,100,'Nome'):existing.name;
    const active=Object.hasOwn(data,'active')
      ? (typeof data.active==='boolean'?Number(data.active):bad('A situação deve ser verdadeira ou falsa.'))
      : existing.active;
    if(name!==existing.name){
      const people=(await env.DB.prepare('SELECT id,name FROM recipients WHERE id<>?').bind(existing.id).all()).results;
      if(people.some(person=>person.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))
        bad('Já existe um encontrista com esse nome.',409);
    }
    const renamed=name!==existing.name;
    const phone=Object.hasOwn(data,'whatsapp_phone')?normaliseWhatsAppPhone(data.whatsapp_phone):existing.whatsapp_phone;
    await env.DB.prepare('UPDATE recipients SET name=?,active=?,whatsapp_phone=?,og_key=?,mural_og_key=? WHERE id=?')
      .bind(name,active,phone,renamed?null:existing.og_key,renamed?null:existing.mural_og_key,existing.id).run();
    if(renamed&&existing.og_key)await env.MEDIA.delete(existing.og_key).catch(()=>{});
    if(renamed&&existing.mural_og_key)await env.MEDIA.delete(existing.mural_og_key).catch(()=>{});
    // Keep slug and mural code so existing printed QRs, tokens and links continue working.
    return result({ok:true,name,whatsapp_phone:phone,slug:existing.slug,active:!!active,linked_orders:linked.count,
      og_needs_refresh:renamed});
  }
  const detail=path.match(/^\/api\/admin\/orders\/(EJC-[A-F0-9]{12})$/);
  if(detail&&req.method==='GET'){
    const o=await env.DB.prepare(
      "SELECT o.id,o.status,o.total_cents,o.created_at,o.payment_claimed_at,o.confirmed_at,COALESCE(c.bank_reference,o.bank_reference) AS bank_reference,COALESCE(c.payer_name,o.payer_name) AS payer_name,COALESCE(c.txid,o.txid) AS txid,o.checkout_id,CASE WHEN o.submitted_at IS NULL THEN 0 ELSE 1 END AS submitted,r.name AS recipient_name FROM orders o JOIN recipients r ON o.recipient_id=r.id LEFT JOIN checkouts c ON c.id=o.checkout_id WHERE o.id=?"
    ).bind(detail[1]).first();
    if(!o)bad('Pedido inexistente.',404);
    // Sem texto, identidade do remetente, lista de anexos ou links de mídia.
    const events=(await env.DB.prepare(
      "SELECT type,created_at FROM order_events WHERE order_id=? ORDER BY created_at"
    ).bind(o.id).all()).results;
    return result({...o,history:events});
  }
  const status=path.match(/^\/api\/admin\/orders\/(EJC-[A-F0-9]{12})\/status$/);
  if(status&&req.method==='PATCH'){
    const data=await jsonBody(req),order=await env.DB.prepare('SELECT id,status,checkout_id FROM orders WHERE id=?').bind(status[1]).first();
    if(!order)bad('Pedido inexistente.',404);
    if(order.checkout_id)bad('Confirme o Pix pelo checkout agrupado.',409);
    if(data.status!=='paid')bad('A coordenação só pode confirmar o pagamento Pix.',409);
    if(!['pending','claimed'].includes(order.status))bad('Pedido não está aguardando Pix.',409);
    const ref=assertText(data.bank_reference||'',128,'Identificador bancário',false).toUpperCase();
    if(!ref && data.manual_batch!==true)bad('Informe o identificador bancário completo.');
    if(ref && !/^[A-Z0-9:/._-]{8,128}$/.test(ref))bad('Informe o identificador bancário completo.');
    if(data.bank_checked!==true||data.amount_checked!==true)bad('Confira recebimento e valor no extrato.');
    if(ref){
      const already=await env.DB.prepare('SELECT id FROM orders WHERE bank_reference=?').bind(ref).first();
      const alreadyCheckout=await env.DB.prepare('SELECT id FROM checkouts WHERE bank_reference=?').bind(ref).first();
      if(already||alreadyCheckout)bad('Transação já associada a outro pagamento.',409);
    }
    try {
      const changed=await env.DB.prepare("UPDATE orders SET status='paid',bank_reference=?,confirmed_at=?,updated_at=? WHERE id=? AND status IN ('pending','claimed')").bind(ref||null,now(),now(),order.id).run();
      if(changed.meta.changes!==1)bad('Pedido alterado por outro administrador.',409);
    }catch(e){if(String(e).includes('UNIQUE constraint'))bad('Transação já utilizada.',409);throw e;}
    await markEmptyPaidDraft(env,order.id);
    await event(env,order.id,'payment_confirmed',ref||'manual_batch_no_reference');await enqueue(env,order.id,'payment_confirmed');return result({ok:true,status:'paid'});
  }
  if(path==='/api/admin/demo/seed'&&req.method==='POST')return seedDemo(env);
  if(path==='/api/admin/demo/clear'&&req.method==='DELETE')return clearDemo(env);
  bad('Rota administrativa não encontrada.',404);
}
function wavTone(freq=440,duration=2){
  const samples=22050,frames=Math.floor(samples*duration),buf=new ArrayBuffer(44+frames*2),view=new DataView(buf);let at=0;
  const t=(str)=>{for(const c of str)view.setUint8(at++,c.charCodeAt(0));};
  const u32=(v)=>{view.setUint32(at,v,true);at+=4;},u16=(v)=>{view.setUint16(at,v,true);at+=2;};
  t('RIFF');u32(36+frames*2);t('WAVEfmt ');u32(16);u16(1);u16(1);u32(samples);u32(samples*2);u16(2);u16(16);t('data');u32(frames*2);
  for(let i=0;i<frames;i++)view.setInt16(at+i*2,Math.round(Math.sin(2*Math.PI*freq*i/samples)*Math.min(1,i/2000,(frames-i)/7000)*7000),true);
  return new Uint8Array(buf);
}
async function demoImage(index) {
  // Generated color illustrations, not photos of real people.
  const width=96,height=72,raw=new Uint8Array(height*(1+width*4));
  const palette=[[244,183,202],[179,207,243],[249,213,153],[163,225,197],[207,184,239]];
  const c=palette[index%palette.length];let offset=0;
  for(let y=0;y<height;y++){
    raw[offset++]=0;
    for(let x=0;x<width;x++){
      const v=Math.sin((x+y)/11+index)*12;
      const heart=y>15&&y<58&&Math.abs(x-width/2)<21+8*Math.sin(y/12);
      raw[offset++]=Math.max(0,Math.min(255,Math.round(c[0]+v-(heart?50:0))));
      raw[offset++]=Math.max(0,Math.min(255,Math.round(c[1]+v-(heart?67:0))));
      raw[offset++]=Math.max(0,Math.min(255,Math.round(c[2]+v-(heart?50:0))));
      raw[offset++]=255;
    }
  }
  const pack=(...parts)=>{const b=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let pos=0;for(const p of parts){b.set(p,pos);pos+=p.length;}return b;};
  const be=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
  const crc=buffer=>{let value=0xffffffff;for(const n of buffer){value^=n;for(let i=0;i<8;i++)value=value&1?(value>>>1)^0xedb88320:value>>>1;}return (value^0xffffffff)>>>0;};
  const chunk=(name,content)=>{const data=pack(encode.encode(name),content);return pack(be(content.length),data,be(crc(data)));};
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return pack(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',pack(be(width),be(height),new Uint8Array([8,6,0,0,0]))),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}
async function seedDemo(env){
  const existing=await env.DB.prepare('SELECT COUNT(*) AS count FROM orders WHERE demo=1').first();
  if(existing.count) return result({ok:true,inserted:0,note:'Já existem exemplos. Remova-os antes de recriar.'});
  const people=['Maria Eduarda (demo)','João Pedro (demo)','Ana Clara (demo)','Gabriel Henrique (demo)','Luiza Vitória (demo)'];
  const letters=[
    'Você é luz mesmo nos dias em que não consegue perceber. Que esse encontro seja uma lembrança de que nunca caminha só.',
    'Quando tudo parecer difícil, lembre das pessoas que torcem por você. Continue! Sua história está só começando.',
    'Que Deus te abrace nos pequenos detalhes e transforme este fim de semana em uma memória bonita.',
    'Uma amizade especial é feita de risadas, silêncios e coragem. Obrigado por ser você.',
    'Nunca perca esse jeito único de descobrir beleza nas coisas simples. O mundo precisa do seu brilho.'
  ];
  let inserted=0;
  for(let i=0;i<people.length;i++){
    const r=await env.DB.prepare('SELECT id,slug FROM recipients WHERE name=?').bind(people[i]).first();
    let id=r?.id; if(!id){id=newId();const slug=`${slugify(people[i])}-demo`;await env.DB.prepare('INSERT INTO recipients(id,name,slug) VALUES(?,?,?)').bind(id,people[i],slug).run();}
    const orderId=`EJC-${randomCode()}`;
    const state='approved';
    await env.DB.prepare(`INSERT INTO orders(id,token_hash,recipient_id,sender_name,status,total_cents,pix_payload,txid,rich_html,moderation,moderation_note,public_message,release_override,demo,submitted_at,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(orderId,await digest(token()),id,['Sua mãe','Um amigo','Tia Clara','Seus colegas','Sua família'][i],'paid',1000,'DEMO_NAO_PAGAR',`DEMO${randomCode()}`,`<p><strong>${letters[i]}</strong></p><p>Com carinho 💜</p>`,state,'',0,0,1,now(),now()).run();
    const mediaId=newId(),key=`demo/${orderId}/som.wav`;
    const wav=wavTone(250+i*83,2.5);
    await env.MEDIA.put(key,wav,{httpMetadata:{contentType:'audio/wav'}});
    await env.DB.prepare('INSERT INTO media(id,order_id,kind,filename,content_type,object_key,status,bytes) VALUES(?,?,?,?,?,?,?,?)').bind(mediaId,orderId,'audio',`audio-demonstracao-${i+1}.wav`,'audio/wav',key,'ready',wav.byteLength).run();
    const imageId=newId(),imageKey=`demo/${orderId}/ilustracao.png`;
    const image=await demoImage(i);
    await env.MEDIA.put(imageKey,image,{httpMetadata:{contentType:'image/png'}});
    await env.DB.prepare('INSERT INTO media(id,order_id,kind,filename,content_type,object_key,status,bytes) VALUES(?,?,?,?,?,?,?,?)').bind(imageId,orderId,'image',`ilustracao-ficticia-${i+1}.png`,'image/png',imageKey,'ready',image.byteLength).run();
    await event(env,orderId,'demo_created');inserted++;
  }
  return result({ok:true,inserted});
}
async function clearDemo(env){
  const demos=(await env.DB.prepare('SELECT id FROM orders WHERE demo=1').all()).results;
  for(const d of demos){
    const assets=(await env.DB.prepare('SELECT object_key FROM media WHERE order_id=?').bind(d.id).all()).results;
    for(const a of assets)await env.MEDIA.delete(a.object_key);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM media_parts WHERE media_id IN (SELECT id FROM media WHERE order_id=?)').bind(d.id),
      env.DB.prepare('DELETE FROM media WHERE order_id=?').bind(d.id),
      env.DB.prepare('DELETE FROM order_events WHERE order_id=?').bind(d.id),
      env.DB.prepare('DELETE FROM orders WHERE id=?').bind(d.id)
    ]);
  }
  await env.DB.prepare("DELETE FROM recipients WHERE slug LIKE '%-demo' AND id NOT IN (SELECT recipient_id FROM orders)").run();
  return result({ok:true,deleted:demos.length});
}
export default {
  async scheduled(_event,env,ctx) {
    await queueRelease(env,(await settings(env)).release_at);
    const pending=dispatch(env);
    if(ctx?.waitUntil)ctx.waitUntil(pending);
    else await pending;
  },
  async fetch(request,env,ctx) {
    try {
      const url=new URL(request.url), path=url.pathname;
      // Short help link to confirm a completed letter with the Mini Mercado team.
      if (path==='/ajuda/terminei-a-cartinha'||path==='/ajuda/terminei-a-cartinha/') {
        if(request.method!=='GET'&&request.method!=='HEAD')
          return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
        const whatsapp=new URL('https://wa.me/5533999546031');
        whatsapp.searchParams.set('text',
          'Olá! 💌 Estou entrando em contato sobre minha cartinha do XX EJC Simonésia. Já finalizei o envio e gostaria de confirmar o recebimento e saber qual é o próximo passo.');
        const campaign={
          utm_source:'whatsapp',
          utm_medium:'mensagem',
          utm_campaign:'recuperacao_cartinhas'
        };
        for(const [key,fallback] of Object.entries(campaign))
          whatsapp.searchParams.set(key,(url.searchParams.get(key)||fallback).slice(0,100));
        return new Response(null,{status:302,headers:{
          Location:whatsapp.toString(),
          'Cache-Control':'no-store',
          'Referrer-Policy':'no-referrer',
          'X-Robots-Tag':'noindex, nofollow, noarchive'
        }});
      }
      if (path.startsWith('/api/')) {
        allowOrigin(request);
        if (path.startsWith('/api/admin/')) {
          const response=await adminRoute(request,env,path);
          if(WRITE_METHODS.has(request.method) && !path.startsWith('/api/admin/technical-preview/') && ctx?.waitUntil)
            ctx.waitUntil(dispatch(env));
          return response;
        }
        const stream=path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
        if (stream && request.method==='GET') return await signedMedia(request,env,stream[1],url);
        const response=await publicRoute(request,env,path);
        if((WRITE_METHODS.has(request.method)||(/^\/api\/mural\/.+\/cards\//.test(path)&&request.method==='GET'))
          &&ctx?.waitUntil)ctx.waitUntil(dispatch(env));
        return response;
      }
      // Fetch the SPA shell from / explicitly: crawlers often request deep links
      // without the Accept/Sec-Fetch headers that Cloudflare SPA fallback expects.
      const social=path.match(/^\/(enviar|mural)\/([a-z0-9-]+)$/);
      const socialRecipient=social?await env.DB.prepare(
        'SELECT name,slug,og_key,mural_og_key,photo_key,photo_consent FROM recipients WHERE slug=? AND active=1'
      ).bind(social[2]).first():null;
      if(path==='/og-ejc-default.png'&&(request.method==='GET'||request.method==='HEAD')){
        const image=await env.MEDIA.get('og/default-v3.png');
        if(image)return new Response(request.method==='HEAD'?null:image.body,{headers:{
          'Content-Type':'image/png','Content-Length':String(image.size),
          'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'
        }});
      }
      const sharePage=!!social || path==='/' || path==='/abrir';
      const assetRequest=sharePage && path!=='/'
        ?new Request(new URL('/',url.origin),request)
        :request;
      // Static files are always fetched through the Assets binding.
      const response=await env.ASSETS.fetch(assetRequest);
      const headers=new Headers(response.headers);
      headers.set('Referrer-Policy','no-referrer');
      headers.set('X-Content-Type-Options','nosniff');
      headers.set('X-Frame-Options','DENY');
      headers.set('Permissions-Policy','microphone=(self), camera=(self), geolocation=()');
      if ((headers.get('Content-Type')||'').includes('text/html')) {
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
      }
      if(path==='/abrir'||path.startsWith('/mural/')||path.startsWith('/pedido/')||path.startsWith('/checkout/')||path.startsWith('/admin')){
        headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
      }
      if(sharePage && response.ok && (headers.get('Content-Type')||'').includes('text/html')){
        const publicOrigin=new URL(env.PUBLIC_ORIGIN||url.origin).origin;
        const ogDefault=await env.MEDIA.head('og/default-v3.png');
        const meta=buildSocialMeta(publicOrigin,socialRecipient,social?.[1]||'enviar',
          ogDefault?{ready:true,version:String(ogDefault.uploaded?.getTime()||'v3')} : null);
        const html=(await response.text())
          .replace(/<!-- EJC-OG-START:[\s\S]*?<!-- EJC-OG-END -->/i,'')
          .replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escapeMeta(meta.title)+'</title>')
          .replace(/<meta\s+name="description"[^>]*>/i,'')
          .replace('</head>','<meta name="description" content="'+escapeMeta(meta.description)+'" />'+meta.tags+'</head>');
        // These headers describe the old index.html bytes and can truncate/misdecode
        // the injected OG tags in link-preview crawlers.
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        headers.delete('ETag');
        headers.set('Content-Type','text/html; charset=utf-8');
        headers.set('Cache-Control','public, max-age=60, must-revalidate');
        return new Response(html,{status:response.status,headers});
      }
      return new Response(response.body,{status:response.status,headers});
    } catch(e) {
      if (!(e instanceof HttpError)) console.error('Internal Worker error',e?.message || e);
      return result({error:e instanceof HttpError?e.message:'Erro interno. Tente novamente ou avise a coordenação.'},e instanceof HttpError?e.status:500);
    }
  }
};
