import { generatePix } from './pix.js';

const PART_SIZE = 8 * 1024 * 1024;
const MIN_PART = 5 * 1024 * 1024;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
};
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message, status = 400) => {
  throw new HttpError(status, message);
};
const result = (data, status = 200, extra = {}) =>
  Response.json(data, { status, headers: { ...BASE_HEADERS, ...extra } });
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const hex = (array) => [...array].map((x) => x.toString(16).padStart(2, '0')).join('');
const randomCode = () => hex(crypto.getRandomValues(new Uint8Array(6))).toUpperCase();
const token = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const encode = new TextEncoder();
function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function unb64url(s) {
  return Uint8Array.from(
    atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
}
async function digest(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(s))));
}
async function jsonBody(request, max = 80_000) {
  const input = await request.text();
  if (input.length > max) bad('Requisição muito grande.', 413);
  try {
    return JSON.parse(input);
  } catch {
    bad('JSON inválido.');
  }
}
function assertText(value, max, label, required = true) {
  if (typeof value !== 'string') bad(`${label} inválido.`);
  const s = value.trim();
  if ((required && !s) || s.length > max) bad(`${label} deve conter até ${max} caracteres.`);
  return s;
}
function brazilTimeEnd(s) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || !Number.isFinite(Date.parse(s + ':00-03:00')))
    bad('Data e horário inválidos.');
  return Date.parse(s + ':00-03:00');
}
async function settings(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM settings').all();
  return Object.fromEntries(rows.results.map(({ key, value }) => [key, value]));
}
function editable(config) {
  if (Date.now() >= brazilTimeEnd(config.deadline)) bad('O prazo para editar as homenagens terminou.', 403);
}
function activeOrder(order) {
  return ['paid', 'preparing', 'delivered'].includes(order.status);
}
async function event(env, id, type, detail = '') {
  await env.DB.prepare('INSERT INTO order_events(id,order_id,type,detail) VALUES(?,?,?,?)')
    .bind(newId(), id, type, detail)
    .run();
}
function allowOrigin(request) {
  if (!WRITE_METHODS.has(request.method)) return;
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) bad('Origem da requisição não autorizada.', 403);
}
async function hmacKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) bad('SESSION_SECRET ausente ou fraco.', 503);
  return crypto.subtle.importKey(
    'raw',
    encode.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
async function checkPassword(actual, expected) {
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(actual)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(expected)));
  return a.length === b.length && crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(a, b)
    : a.every((v, i) => v === b[i]);
}

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 65) || 'encontrista';
const excerpt = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function safeRich(input) {
  const html = assertText(input || '', 30000, 'Cartinha', false);
  // Restrict the stored document itself; no script, attributes, inline SVG or embeds.
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|svg|math|template)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, (tag) => {
      const m = tag.match(/^<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>$/i);
      if (!m) return '';
      const name = m[2].toLowerCase();
      return [
        'p',
        'br',
        'b',
        'strong',
        'em',
        'i',
        'u',
        's',
        'h2',
        'h3',
        'blockquote',
        'ul',
        'ol',
        'li',
      ].includes(name)
        ? `<${m[1]}${name}>`
        : '';
    });
  // Escaping malformed constructs is handled before dangerouslySetInnerHTML on the client with DOMPurify.
  return stripped;
}
function released(o, config) {
  return Number(o.release_override) === 1 || Date.now() >= brazilTimeEnd(config.release_at);
}
function moderated(o, config) {
  return o.moderation === 'approved' && released(o, config);
}
async function resetModeration(env, id) {
  await env.DB.prepare(
    "UPDATE orders SET moderation='draft',approved_at=NULL,release_override=0,updated_at=? WHERE id=? AND moderation!='draft'",
  )
    .bind(now(), id)
    .run();
}
async function cardInfo(env, o) {
  const assets = (
    await env.DB.prepare(
      "SELECT id,kind,filename,content_type,bytes FROM media WHERE order_id=? AND status='ready' ORDER BY created_at",
    )
      .bind(o.id)
      .all()
  ).results;
  return {
    id: o.id,
    recipient_name: o.recipient_name,
    sender_name: o.sender_name || 'Uma pessoa especial',
    rich_html: o.rich_html,
    public_message: !!o.public_message,
    media: await Promise.all(assets.map(async (m) => ({ ...m, url: await mediaUrl(env, m.id, o.id) }))),
    created_at: o.created_at,
    approved_at: o.approved_at,
  };
}
async function orderWithRecipient(env, id) {
  return env.DB.prepare(
    'SELECT o.*,r.name AS recipient_name,r.slug AS recipient_slug FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.id=?',
  )
    .bind(id)
    .first();
}

async function login(req, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 14)
    bad('Configure ADMIN_PASSWORD com pelo menos 14 caracteres.', 503);
  const fingerprint = await digest(
    (req.headers.get('CF-Connecting-IP') || 'local') + ':' + env.SESSION_SECRET,
  );
  const since = Math.floor(Date.now() / 1000),
    row = await env.DB.prepare('SELECT * FROM login_attempts WHERE fingerprint=?').bind(fingerprint).first();
  if (row && row.window_start > since - 900 && row.attempts >= 5)
    bad('Muitas tentativas. Aguarde 15 minutos.', 429);
  const payload = await jsonBody(req);
  if (typeof payload.password !== 'string' || !(await checkPassword(payload.password, env.ADMIN_PASSWORD))) {
    const start = row && row.window_start > since - 900 ? row.window_start : since;
    const attempts = row && row.window_start > since - 900 ? row.attempts + 1 : 1;
    await env.DB.prepare(
      'INSERT INTO login_attempts(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start',
    )
      .bind(fingerprint, attempts, start)
      .run();
    bad('Senha incorreta.', 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE fingerprint=?').bind(fingerprint).run();
  const content = b64url(encode.encode(JSON.stringify({ exp: since + 8 * 3600, role: 'admin' })));
  const signed = b64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), encode.encode(content))),
  );
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return result({ ok: true }, 200, {
    'Set-Cookie': `ejc_admin=${content}.${signed}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=28800`,
  });
}
async function isAdmin(req, env) {
  try {
    const cookie = req.headers.get('Cookie') || '';
    const raw = cookie
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('ejc_admin='))
      ?.slice(10);
    if (!raw) return false;
    const [body, sig] = raw.split('.');
    if (!body || !sig) return false;
    const good = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(sig), encode.encode(body));
    if (!good) return false;
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return payload.role === 'admin' && Number.isFinite(payload.exp) && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
async function requireAdmin(req, env) {
  if (!(await isAdmin(req, env))) bad('Sessão administrativa não autenticada.', 401);
}
function bearer(req) {
  const t = req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,100})$/)?.[1];
  if (!t) bad('Link privado inválido.', 401);
  return t;
}
async function buyer(req, env) {
  const hash = await digest(bearer(req));
  const row = await env.DB.prepare(
    'SELECT o.*,r.name AS recipient_name FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE token_hash=?',
  )
    .bind(hash)
    .first();
  if (!row) bad('Pedido não encontrado.', 404);
  return row;
}
async function mediaUrl(env, mediaId, orderId) {
  const blob = b64url(
    encode.encode(JSON.stringify({ mediaId, orderId, exp: Math.floor(Date.now() / 1000) + 14400 })),
  );
  const sig = b64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), encode.encode(blob))),
  );
  return `/api/media/${mediaId}?access=${blob}.${sig}`;
}
async function signedMedia(req, env, id, url) {
  const raw = url.searchParams.get('access') || '',
    [blob, sig] = raw.split('.');
  if (!blob || !sig) bad('Acesso a arquivo não autorizado.', 403);
  let payload;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(sig), encode.encode(blob))))
      bad('Assinatura inválida.', 403);
    payload = JSON.parse(new TextDecoder().decode(unb64url(blob)));
  } catch {
    bad('Link de arquivo inválido.', 403);
  }
  if (payload.mediaId !== id || payload.exp <= Date.now() / 1000) bad('Link de arquivo expirado.', 403);
  const media = await getMedia(env, id);
  if (media.order_id !== payload.orderId) bad('Acesso negado.', 403);
  const order = await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(media.order_id).first();
  if (!order || !activeOrder(order)) bad('Arquivo ainda bloqueado.', 403);
  return fetchMedia(req, env, media);
}
async function orderInfo(env, o) {
  const rows = (
    await env.DB.prepare(
      "SELECT id,kind,filename,content_type,bytes,created_at FROM media WHERE order_id=? AND status='ready' ORDER BY created_at",
    )
      .bind(o.id)
      .all()
  ).results;
  const visible = activeOrder(o)
    ? await Promise.all(rows.map(async (m) => ({ ...m, url: await mediaUrl(env, m.id, o.id) })))
    : [];
  return {
    id: o.id,
    recipient_name: o.recipient_name,
    recipient_slug: o.recipient_slug,
    sender_name: o.sender_name,
    status: o.status,
    amount_cents: o.total_cents,
    pix_code: o.pix_payload,
    txid: o.txid,
    rich_html: activeOrder(o) ? o.rich_html : '',
    public_message: !!o.public_message,
    moderation: o.moderation,
    moderation_note: o.moderation_note,
    payment_claimed_at: o.payment_claimed_at,
    created_at: o.created_at,
    media: visible,
  };
}
async function getMedia(env, id) {
  const row = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
  if (!row) bad('Arquivo não encontrado.', 404);
  return row;
}
async function fetchMedia(req, env, media) {
  if (media.status !== 'ready') bad('Arquivo ainda não finalizado.', 409);
  const r = req.headers.get('Range');
  const object = await env.MEDIA.get(media.object_key, r ? { range: req.headers } : undefined);
  if (!object) bad('Arquivo indisponível.', 404);
  const h = new Headers(BASE_HEADERS);
  h.set('Content-Type', media.content_type);
  h.set('Accept-Ranges', 'bytes');
  h.set('Content-Disposition', `inline; filename="${media.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
  const range = object.range;
  if (range && r) {
    h.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    h.set('Content-Length', String(range.length));
    return new Response(object.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(object.size));
  return new Response(object.body, { headers: h });
}
async function mediaWrite(req, env, o, params, path) {
  if (!activeOrder(o)) bad('O pagamento ainda não foi confirmado.', 403);
  editable(await settings(env));
  if (path === '/api/order/media/init' && req.method === 'POST') {
    const data = await jsonBody(req);
    const kind = data.kind;
    if (!['audio', 'image'].includes(kind)) bad('Tipo de arquivo inválido.');
    const mime = assertText(data.content_type, 100, 'Tipo MIME').toLowerCase();
    if (kind === 'audio' && !/^audio\/(mp4|webm|ogg|mpeg|aac|x-m4a|wav)(;[\w=, .-]+)?$/.test(mime))
      bad('Formato de áudio não suportado.');
    if (kind === 'image' && !/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/.test(mime))
      bad('Formato de foto não suportado.');
    const filename = assertText(data.filename || `arquivo-${Date.now()}`, 160, 'Nome do arquivo');
    const id = newId(),
      objectKey = `orders/${o.id}/${id}`;
    const upload = await env.MEDIA.createMultipartUpload(objectKey, { httpMetadata: { contentType: mime } });
    await env.DB.prepare(
      'INSERT INTO media(id,order_id,kind,filename,content_type,object_key,upload_id) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(id, o.id, kind, filename, mime, objectKey, upload.uploadId)
      .run();
    return result({ id, part_size: PART_SIZE });
  }
  const match = path.match(/^\/api\/order\/media\/([a-f0-9-]{36})(?:\/part\/(\d+)|\/(complete|delete))?$/);
  if (!match) bad('Rota inválida.', 404);
  const media = await getMedia(env, match[1]);
  if (media.order_id !== o.id) bad('Arquivo não pertence a este pedido.', 403);
  if (match[2] && req.method === 'PUT') {
    if (media.status !== 'uploading') bad('Upload concluído.', 409);
    const part = Number(match[2]);
    const declared = Number(req.headers.get('Content-Length') || 0);
    if (!Number.isSafeInteger(part) || part < 1 || part > 10000 || declared > PART_SIZE)
      bad('Parte inválida.', 413);
    // Don't depend on Content-Length: some browsers/proxies stream uploads without it.
    // Read incrementally and reject oversized parts before holding them in memory.
    if (!req.body) bad('Parte vazia.', 400);
    const reader = req.body.getReader(),
      chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PART_SIZE) {
        await reader.cancel();
        bad('Parte excede 8 MiB.', 413);
      }
      chunks.push(value);
    }
    if (size <= 0 || (declared && declared !== size)) bad('Tamanho não corresponde ao enviado.');
    const payload = new Uint8Array(size);
    let cursor = 0;
    for (const chunk of chunks) {
      payload.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    const upload = env.MEDIA.resumeMultipartUpload(media.object_key, media.upload_id);
    const uploaded = await upload.uploadPart(part, payload);
    await env.DB.prepare(
      'INSERT INTO media_parts(media_id,part_number,etag,bytes) VALUES(?,?,?,?) ON CONFLICT(media_id,part_number) DO UPDATE SET etag=excluded.etag,bytes=excluded.bytes',
    )
      .bind(media.id, part, uploaded.etag, size)
      .run();
    return result({ ok: true, part });
  }
  if (match[3] === 'complete' && req.method === 'POST') {
    if (media.status === 'ready') return result({ ok: true, id: media.id });
    const rows = (
      await env.DB.prepare(
        'SELECT part_number,etag,bytes FROM media_parts WHERE media_id=? ORDER BY part_number',
      )
        .bind(media.id)
        .all()
    ).results;
    if (!rows.length || rows.length > 10000) bad('Nenhuma parte enviada.');
    for (let i = 0; i < rows.length; i++) {
      if (
        rows[i].part_number !== i + 1 ||
        (i < rows.length - 1 && rows[i].bytes < MIN_PART) ||
        (i < rows.length - 1 && rows[i].bytes !== PART_SIZE)
      )
        bad('Partes incompletas ou incorretas.', 409);
    }
    let object = await env.MEDIA.head(media.object_key);
    if (!object)
      object = await env.MEDIA.resumeMultipartUpload(media.object_key, media.upload_id).complete(
        rows.map((r) => ({ partNumber: r.part_number, etag: r.etag })),
      );
    await env.DB.prepare('UPDATE media SET status=?,bytes=? WHERE id=?')
      .bind('ready', object.size, media.id)
      .run();
    await resetModeration(env, o.id);
    await event(env, o.id, 'media_uploaded', media.kind);
    return result({ ok: true, id: media.id, bytes: object.size });
  }
  if (match[3] === 'delete' && req.method === 'DELETE') {
    if (media.status === 'ready') await env.MEDIA.delete(media.object_key);
    else
      await env.MEDIA.resumeMultipartUpload(media.object_key, media.upload_id)
        .abort()
        .catch(() => {});
    await env.DB.batch([
      env.DB.prepare('DELETE FROM media_parts WHERE media_id=?').bind(media.id),
      env.DB.prepare('DELETE FROM media WHERE id=?').bind(media.id),
    ]);
    await resetModeration(env, o.id);
    await event(env, o.id, 'media_deleted', media.kind);
    return result({ ok: true });
  }
  bad('Ação de arquivo inválida.', 404);
}
async function publicRoute(req, env, path) {
  const config = await settings(env);
  if (path === '/api/public' && req.method === 'GET') {
    const recipients = (
      await env.DB.prepare(
        'SELECT id,name,slug FROM recipients WHERE active=1 ORDER BY name COLLATE NOCASE',
      ).all()
    ).results;
    return result({
      recipients,
      config: {
        deadline: config.deadline,
        release_at: config.release_at,
        open: config.open === 'true',
        store_title: config.store_title,
        store_subtitle: config.store_subtitle,
        amount_cents: Number(config.message_price_cents || 1000),
        analytics_id: config.analytics_id || '',
        payments_ready: !!(config.pix_key && config.pix_name && config.pix_city),
      },
    });
  }
  if (path === '/api/publicas' && req.method === 'GET') {
    if (Date.now() < brazilTimeEnd(config.release_at)) {
      const current = (
        await env.DB.prepare(
          "SELECT o.*,r.name AS recipient_name FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.public_message=1 AND o.moderation='approved' AND o.release_override=1 ORDER BY o.approved_at DESC LIMIT 30",
        ).all()
      ).results;
      return result({ cards: await Promise.all(current.map((o) => cardInfo(env, o))) });
    }
    const cards = (
      await env.DB.prepare(
        "SELECT o.*,r.name AS recipient_name FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.public_message=1 AND o.moderation='approved' ORDER BY o.approved_at DESC LIMIT 40",
      ).all()
    ).results;
    return result({ cards: await Promise.all(cards.map((o) => cardInfo(env, o))) });
  }
  const mural = path.match(/^\/api\/mural\/([a-z0-9-]+)$/);
  if (mural && req.method === 'GET') {
    const r = await env.DB.prepare(
      'SELECT id,name,slug,mural_token_hash FROM recipients WHERE slug=? AND active=1',
    )
      .bind(mural[1])
      .first();
    if (!r) bad('Encontrista não encontrado.', 404);
    const admin = await isAdmin(req, env);
    if (!admin) {
      const digestToken = await digest(bearer(req));
      if (!r.mural_token_hash || r.mural_token_hash !== digestToken) bad('Convite privado inválido.', 403);
    }
    const rows = (
      await env.DB.prepare(
        "SELECT o.*,r.name AS recipient_name FROM orders o JOIN recipients r ON o.recipient_id=r.id WHERE o.recipient_id=? AND o.moderation='approved' ORDER BY o.approved_at DESC",
      )
        .bind(r.id)
        .all()
    ).results;
    const cards = await Promise.all(
      rows.filter((o) => admin || moderated(o, config)).map((o) => cardInfo(env, o)),
    );
    return result({
      recipient: { name: r.name, slug: r.slug },
      cards,
      release_at: config.release_at,
      is_admin: admin,
      locked: !admin && Date.now() < brazilTimeEnd(config.release_at),
    });
  }
  if (path === '/api/orders' && req.method === 'POST') {
    if (config.open !== 'true') bad('As homenagens estão temporariamente fechadas.', 403);
    editable(config);
    if (!config.pix_key || !config.pix_name || !config.pix_city)
      bad('A coordenação ainda precisa configurar a chave Pix.', 503);
    const input = await jsonBody(req);
    const recipient = await env.DB.prepare(
      'SELECT id,name,slug FROM recipients WHERE (id=? OR slug=?) AND active=1',
    )
      .bind(String(input.recipient_id || ''), String(input.recipient_slug || ''))
      .first();
    if (!recipient) bad('Encontrista inválido.');
    const sender = assertText(input.sender_name || '', 100, 'Nome de quem envia', false);
    const total = Number(config.message_price_cents || 1000);
    if (!Number.isSafeInteger(total) || total < 100 || total > 5000000)
      bad('Configure o valor da mensagem (mínimo R$ 1).', 503);
    const ip = await digest(
      (req.headers.get('CF-Connecting-IP') || 'local') + ':orders:' + env.SESSION_SECRET,
    );
    const t = Math.floor(Date.now() / 1000),
      rate = await env.DB.prepare('SELECT attempts,window_start FROM order_rate WHERE fingerprint=?')
        .bind(ip)
        .first();
    if (rate && rate.window_start > t - 3600 && rate.attempts >= 15)
      bad('Muitos pedidos neste período.', 429);
    const code = randomCode(),
      id = `EJC-${code}`,
      txid = `EJC${code}`,
      access = token();
    const pix = generatePix({
      key: config.pix_key,
      merchantName: config.pix_name,
      merchantCity: config.pix_city,
      amountCents: total,
      txid,
    });
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO orders(id,token_hash,recipient_id,sender_name,total_cents,pix_payload,txid,public_message) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(id, await digest(access), recipient.id, sender, total, pix, txid, 0),
      env.DB.prepare(
        'INSERT INTO order_rate(fingerprint,attempts,window_start) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET attempts=excluded.attempts,window_start=excluded.window_start',
      ).bind(
        ip,
        rate && rate.window_start > t - 3600 ? rate.attempts + 1 : 1,
        rate && rate.window_start > t - 3600 ? rate.window_start : t,
      ),
    ]);
    await event(env, id, 'created');
    return result({ id, token: access, txid, pix_code: pix }, 201);
  }
  if (path.startsWith('/api/order') && path !== '/api/orders') {
    const o = await buyer(req, env);
    if (path === '/api/order' && req.method === 'GET')
      return result({
        ...(await orderInfo(env, o)),
        deadline: config.deadline,
        release_at: config.release_at,
      });
    if (path === '/api/order/claim' && req.method === 'POST') {
      if (activeOrder(o)) return result({ ok: true, status: o.status });
      if (o.status === 'cancelled') bad('Pedido cancelado.', 409);
      await env.DB.prepare(
        "UPDATE orders SET status='claimed',payment_claimed_at=?,updated_at=? WHERE id=? AND status IN ('pending','claimed')",
      )
        .bind(now(), now(), o.id)
        .run();
      await event(env, o.id, 'payment_claimed');
      return result({ ok: true, status: 'claimed' });
    }
    if (path === '/api/order/message' && req.method === 'PUT') {
      if (!activeOrder(o)) bad('Pagamento não confirmado.', 403);
      editable(config);
      const data = await jsonBody(req, 40000),
        html = safeRich(data.rich_html || '');
      await env.DB.prepare(
        "UPDATE orders SET rich_html=?,public_message=?,moderation='draft',approved_at=NULL,release_override=0,updated_at=? WHERE id=?",
      )
        .bind(html, data.public_message === true ? 1 : 0, now(), o.id)
        .run();
      await event(env, o.id, 'message_saved');
      return result({ ok: true });
    }
    if (path === '/api/order/submit' && req.method === 'POST') {
      if (!activeOrder(o)) bad('Pagamento não confirmado.', 403);
      editable(config);
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM media WHERE order_id=? AND status='ready'",
      )
        .bind(o.id)
        .first();
      if (!excerpt(o.rich_html) && !count.count)
        bad('Escreva uma mensagem ou adicione uma foto ou áudio antes de enviar.');
      await env.DB.prepare(
        "UPDATE orders SET moderation='pending',moderation_note='',submitted_at=?,updated_at=? WHERE id=?",
      )
        .bind(now(), now(), o.id)
        .run();
      await event(env, o.id, 'submitted');
      return result({ ok: true, moderation: 'pending' });
    }
    if (path.startsWith('/api/order/media/')) {
      const file = path.match(/^\/api\/order\/media\/([a-f0-9-]{36})\/file$/);
      if (file && req.method === 'GET') {
        if (!activeOrder(o)) bad('Pagamento não confirmado.', 403);
        const media = await getMedia(env, file[1]);
        if (media.order_id !== o.id) bad('Arquivo de outro pedido.', 403);
        return fetchMedia(req, env, media);
      }
    }
    if (path.startsWith('/api/order/media')) return mediaWrite(req, env, o, {}, path);
  }
  bad('Rota não encontrada.', 404);
}
async function adminRoute(req, env, path) {
  if (path === '/api/admin/login' && req.method === 'POST') return login(req, env);
  if (path === '/api/admin/logout' && req.method === 'POST')
    return result({ ok: true }, 200, {
      'Set-Cookie': 'ejc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    });
  await requireAdmin(req, env);
  if (path === '/api/admin/me') return result({ authenticated: true });
  if (path === '/api/admin/bootstrap' && req.method === 'GET') {
    const [config, recipients, orders] = await Promise.all([
      settings(env),
      env.DB.prepare(
        'SELECT id,name,slug,active,created_at FROM recipients ORDER BY name COLLATE NOCASE',
      ).all(),
      env.DB.prepare(
        `SELECT o.id,o.sender_name,o.status,o.total_cents,o.created_at,o.payment_claimed_at,o.confirmed_at,o.bank_reference,o.moderation,o.moderation_note,o.public_message,o.release_override,o.demo,
        r.name AS recipient_name,r.slug AS recipient_slug,(SELECT COUNT(*) FROM media m WHERE m.order_id=o.id AND m.status='ready') AS files
        FROM orders o JOIN recipients r ON o.recipient_id=r.id ORDER BY o.created_at DESC LIMIT 500`,
      ).all(),
    ]);
    return result({ config, recipients: recipients.results, orders: orders.results });
  }
  if (path === '/api/admin/settings' && req.method === 'PUT') {
    const data = await jsonBody(req),
      keys = [
        'pix_key',
        'pix_name',
        'pix_city',
        'deadline',
        'release_at',
        'open',
        'store_title',
        'store_subtitle',
        'message_price_cents',
        'analytics_id',
      ];
    const updates = [];
    for (const key of keys) {
      if (!(key in data)) continue;
      let value;
      if (key === 'open') value = data.open === true ? 'true' : 'false';
      else if (key === 'message_price_cents') {
        const val = Number(data[key]);
        if (!Number.isSafeInteger(val) || val < 100 || val > 5000000) bad('Preço inválido (mínimo R$ 1).');
        value = String(val);
      } else {
        value = assertText(
          data[key],
          key === 'store_subtitle' ? 250 : key === 'pix_key' ? 77 : 120,
          key,
          key !== 'pix_key' && key !== 'analytics_id',
        );
        if (key === 'deadline' || key === 'release_at') brazilTimeEnd(value);
        if (key === 'analytics_id' && value && !/^G-[A-Z0-9]{6,20}$/.test(value))
          bad('Measurement ID do GA4 inválido.');
      }
      updates.push(
        env.DB.prepare(
          'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        ).bind(key, value),
      );
    }
    if (updates.length) await env.DB.batch(updates);
    return result({ ok: true, config: await settings(env) });
  }
  if (path === '/api/admin/recipients/import' && req.method === 'POST') {
    const data = await jsonBody(req, 180000);
    if (!Array.isArray(data.names) || data.names.length > 2500) bad('Envie até 2500 nomes.');
    const known = (await env.DB.prepare('SELECT name,slug FROM recipients').all()).results;
    const names = new Set(known.map((x) => x.name.toLocaleLowerCase('pt-BR'))),
      slugs = new Set(known.map((x) => x.slug).filter(Boolean));
    let inserted = 0;
    for (const part of data.names) {
      const name = assertText(part, 100, 'Nome'),
        key = name.toLocaleLowerCase('pt-BR');
      if (names.has(key)) continue;
      names.add(key);
      let slug = slugify(name);
      while (slugs.has(slug)) slug = `${slugify(name)}-${randomCode().slice(0, 4).toLowerCase()}`;
      slugs.add(slug);
      await env.DB.prepare('INSERT INTO recipients(id,name,slug) VALUES(?,?,?)')
        .bind(newId(), name, slug)
        .run();
      inserted++;
    }
    return result({ ok: true, inserted });
  }
  const recipient = path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})$/);
  if (recipient && req.method === 'PATCH') {
    const data = await jsonBody(req),
      name = assertText(data.name, 100, 'Nome');
    await env.DB.prepare('UPDATE recipients SET name=?,active=? WHERE id=?')
      .bind(name, data.active !== false ? 1 : 0, recipient[1])
      .run();
    return result({ ok: true });
  }
  const invite = path.match(/^\/api\/admin\/recipients\/([a-f0-9-]{36})\/invite$/);
  if (invite && req.method === 'POST') {
    const recipient = await env.DB.prepare('SELECT slug FROM recipients WHERE id=?').bind(invite[1]).first();
    if (!recipient) bad('Encontrista não encontrado.', 404);
    const secret = token();
    await env.DB.prepare('UPDATE recipients SET mural_token_hash=? WHERE id=?')
      .bind(await digest(secret), invite[1])
      .run();
    return result({ url: `${new URL(req.url).origin}/mural/${recipient.slug}#token=${secret}` });
  }
  const detail = path.match(/^\/api\/admin\/orders\/(EJC-[A-F0-9]{12})$/);
  if (detail && req.method === 'GET') {
    const o = await orderWithRecipient(env, detail[1]);
    if (!o) bad('Pedido inexistente.', 404);
    const info = await orderInfo(env, o);
    const media = (
      await env.DB.prepare(
        'SELECT id,kind,filename,content_type,bytes,status FROM media WHERE order_id=? ORDER BY created_at',
      )
        .bind(o.id)
        .all()
    ).results;
    const history = (
      await env.DB.prepare(
        'SELECT type,detail,created_at FROM order_events WHERE order_id=? ORDER BY created_at',
      )
        .bind(o.id)
        .all()
    ).results;
    return result({
      ...info,
      media: await Promise.all(
        media.map(async (m) => ({
          ...m,
          url: m.status === 'ready' ? await mediaUrl(env, m.id, o.id) : null,
        })),
      ),
      history,
      bank_reference: o.bank_reference,
      confirmed_at: o.confirmed_at,
    });
  }
  const status = path.match(/^\/api\/admin\/orders\/(EJC-[A-F0-9]{12})\/status$/);
  if (status && req.method === 'PATCH') {
    const data = await jsonBody(req),
      order = await env.DB.prepare('SELECT id,status FROM orders WHERE id=?').bind(status[1]).first();
    if (!order) bad('Pedido inexistente.', 404);
    if (data.status !== 'paid') bad('Use o fluxo de moderação para gerenciar cartinhas.', 409);
    if (!['pending', 'claimed'].includes(order.status)) bad('Pedido não está aguardando Pix.', 409);
    const ref = assertText(data.bank_reference || '', 128, 'Identificador bancário').toUpperCase();
    if (!/^[A-Z0-9:/._-]{8,128}$/.test(ref)) bad('Informe o identificador bancário completo.');
    if (data.bank_checked !== true || data.amount_checked !== true)
      bad('Confira recebimento e valor no extrato.');
    const already = await env.DB.prepare('SELECT id FROM orders WHERE bank_reference=?').bind(ref).first();
    if (already) bad('Transação já associada a outro pedido.', 409);
    try {
      const changed = await env.DB.prepare(
        "UPDATE orders SET status='paid',bank_reference=?,confirmed_at=?,updated_at=? WHERE id=? AND status IN ('pending','claimed')",
      )
        .bind(ref, now(), now(), order.id)
        .run();
      if (changed.meta.changes !== 1) bad('Pedido alterado por outro administrador.', 409);
    } catch (e) {
      if (String(e).includes('UNIQUE constraint')) bad('Transação já utilizada.', 409);
      throw e;
    }
    await event(env, order.id, 'payment_confirmed', ref);
    return result({ ok: true, status: 'paid' });
  }
  const moderation = path.match(/^\/api\/admin\/orders\/(EJC-[A-F0-9]{12})\/moderation$/);
  if (moderation && req.method === 'PATCH') {
    const data = await jsonBody(req),
      o = await orderWithRecipient(env, moderation[1]);
    if (!o || !activeOrder(o)) bad('Pedido não pago.', 409);
    if (!['approved', 'rejected'].includes(data.moderation)) bad('Moderação inválida.');
    if (data.moderation === 'approved' && o.moderation !== 'pending')
      bad('Somente cartinhas enviadas podem ser aprovadas.', 409);
    const note = assertText(data.note || '', 500, 'Observação', false);
    await env.DB.prepare(
      'UPDATE orders SET moderation=?,moderation_note=?,approved_at=?,release_override=?,updated_at=? WHERE id=?',
    )
      .bind(
        data.moderation,
        note,
        data.moderation === 'approved' ? now() : null,
        data.moderation === 'approved' && data.release_now === true ? 1 : 0,
        now(),
        o.id,
      )
      .run();
    await event(env, o.id, `moderation_${data.moderation}`, note);
    return result({ ok: true });
  }
  if (path === '/api/admin/demo/seed' && req.method === 'POST') return seedDemo(env);
  if (path === '/api/admin/demo/clear' && req.method === 'DELETE') return clearDemo(env);
  const media = path.match(/^\/api\/admin\/media\/([a-f0-9-]{36})\/file$/);
  if (media && req.method === 'GET') return fetchMedia(req, env, await getMedia(env, media[1]));
  bad('Rota administrativa não encontrada.', 404);
}
function wavTone(freq = 440, duration = 2) {
  const samples = 22050,
    frames = Math.floor(samples * duration),
    buf = new ArrayBuffer(44 + frames * 2),
    view = new DataView(buf);
  let at = 0;
  const t = (str) => {
    for (const c of str) view.setUint8(at++, c.charCodeAt(0));
  };
  const u32 = (v) => {
      view.setUint32(at, v, true);
      at += 4;
    },
    u16 = (v) => {
      view.setUint16(at, v, true);
      at += 2;
    };
  t('RIFF');
  u32(36 + frames * 2);
  t('WAVEfmt ');
  u32(16);
  u16(1);
  u16(1);
  u32(samples);
  u32(samples * 2);
  u16(2);
  u16(16);
  t('data');
  u32(frames * 2);
  for (let i = 0; i < frames; i++)
    view.setInt16(
      at + i * 2,
      Math.round(
        Math.sin((2 * Math.PI * freq * i) / samples) * Math.min(1, i / 2000, (frames - i) / 7000) * 7000,
      ),
      true,
    );
  return new Uint8Array(buf);
}
async function demoImage(index) {
  // Generated color illustrations, not photos of real people.
  const width = 96,
    height = 72,
    raw = new Uint8Array(height * (1 + width * 4));
  const palette = [
    [244, 183, 202],
    [179, 207, 243],
    [249, 213, 153],
    [163, 225, 197],
    [207, 184, 239],
  ];
  const c = palette[index % palette.length];
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const v = Math.sin((x + y) / 11 + index) * 12;
      const heart = y > 15 && y < 58 && Math.abs(x - width / 2) < 21 + 8 * Math.sin(y / 12);
      raw[offset++] = Math.max(0, Math.min(255, Math.round(c[0] + v - (heart ? 50 : 0))));
      raw[offset++] = Math.max(0, Math.min(255, Math.round(c[1] + v - (heart ? 67 : 0))));
      raw[offset++] = Math.max(0, Math.min(255, Math.round(c[2] + v - (heart ? 50 : 0))));
      raw[offset++] = 255;
    }
  }
  const pack = (...parts) => {
    const b = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let pos = 0;
    for (const p of parts) {
      b.set(p, pos);
      pos += p.length;
    }
    return b;
  };
  const be = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const crc = (buffer) => {
    let value = 0xffffffff;
    for (const n of buffer) {
      value ^= n;
      for (let i = 0; i < 8; i++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, content) => {
    const data = pack(encode.encode(name), content);
    return pack(be(content.length), data, be(crc(data)));
  };
  const compressed = new Uint8Array(
    await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer(),
  );
  return pack(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', pack(be(width), be(height), new Uint8Array([8, 6, 0, 0, 0]))),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array()),
  );
}
async function seedDemo(env) {
  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM orders WHERE demo=1').first();
  if (existing.count)
    return result({ ok: true, inserted: 0, note: 'Já existem exemplos. Remova-os antes de recriar.' });
  const people = [
    'Maria Eduarda (demo)',
    'João Pedro (demo)',
    'Ana Clara (demo)',
    'Gabriel Henrique (demo)',
    'Luiza Vitória (demo)',
  ];
  const letters = [
    'Você é luz mesmo nos dias em que não consegue perceber. Que esse encontro seja uma lembrança de que nunca caminha só.',
    'Quando tudo parecer difícil, lembre das pessoas que torcem por você. Continue! Sua história está só começando.',
    'Que Deus te abrace nos pequenos detalhes e transforme este fim de semana em uma memória bonita.',
    'Uma amizade especial é feita de risadas, silêncios e coragem. Obrigado por ser você.',
    'Nunca perca esse jeito único de descobrir beleza nas coisas simples. O mundo precisa do seu brilho.',
  ];
  let inserted = 0;
  for (let i = 0; i < people.length; i++) {
    const r = await env.DB.prepare('SELECT id,slug FROM recipients WHERE name=?').bind(people[i]).first();
    let id = r?.id;
    if (!id) {
      id = newId();
      const slug = `${slugify(people[i])}-demo`;
      await env.DB.prepare('INSERT INTO recipients(id,name,slug) VALUES(?,?,?)')
        .bind(id, people[i], slug)
        .run();
    }
    const orderId = `EJC-${randomCode()}`;
    const state =
      i === 0 ? 'approved' : i === 1 ? 'pending' : i === 2 ? 'approved' : i === 3 ? 'rejected' : 'draft';
    await env.DB.prepare(
      `INSERT INTO orders(id,token_hash,recipient_id,sender_name,status,total_cents,pix_payload,txid,rich_html,moderation,moderation_note,public_message,release_override,demo,submitted_at,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        orderId,
        await digest(token()),
        id,
        ['Sua mãe', 'Um amigo', 'Tia Clara', 'Seus colegas', 'Sua família'][i],
        'paid',
        1000,
        'DEMO_NAO_PAGAR',
        `DEMO${randomCode()}`,
        `<p><strong>${letters[i]}</strong></p><p>Com carinho 💜</p>`,
        state,
        state === 'rejected' ? 'Revisar conteúdo antes de publicar.' : '',
        i === 2 ? 1 : 0,
        i === 0 ? 1 : 0,
        1,
        now(),
        state === 'approved' ? now() : null,
      )
      .run();
    const mediaId = newId(),
      key = `demo/${orderId}/som.wav`;
    const wav = wavTone(250 + i * 83, 2.5);
    await env.MEDIA.put(key, wav, { httpMetadata: { contentType: 'audio/wav' } });
    await env.DB.prepare(
      'INSERT INTO media(id,order_id,kind,filename,content_type,object_key,status,bytes) VALUES(?,?,?,?,?,?,?,?)',
    )
      .bind(
        mediaId,
        orderId,
        'audio',
        `audio-demonstracao-${i + 1}.wav`,
        'audio/wav',
        key,
        'ready',
        wav.byteLength,
      )
      .run();
    const imageId = newId(),
      imageKey = `demo/${orderId}/ilustracao.png`;
    const image = await demoImage(i);
    await env.MEDIA.put(imageKey, image, { httpMetadata: { contentType: 'image/png' } });
    await env.DB.prepare(
      'INSERT INTO media(id,order_id,kind,filename,content_type,object_key,status,bytes) VALUES(?,?,?,?,?,?,?,?)',
    )
      .bind(
        imageId,
        orderId,
        'image',
        `ilustracao-ficticia-${i + 1}.png`,
        'image/png',
        imageKey,
        'ready',
        image.byteLength,
      )
      .run();
    await event(env, orderId, 'demo_created');
    inserted++;
  }
  return result({ ok: true, inserted });
}
async function clearDemo(env) {
  const demos = (await env.DB.prepare('SELECT id FROM orders WHERE demo=1').all()).results;
  for (const d of demos) {
    const assets = (await env.DB.prepare('SELECT object_key FROM media WHERE order_id=?').bind(d.id).all())
      .results;
    for (const a of assets) await env.MEDIA.delete(a.object_key);
    await env.DB.batch([
      env.DB.prepare(
        'DELETE FROM media_parts WHERE media_id IN (SELECT id FROM media WHERE order_id=?)',
      ).bind(d.id),
      env.DB.prepare('DELETE FROM media WHERE order_id=?').bind(d.id),
      env.DB.prepare('DELETE FROM order_events WHERE order_id=?').bind(d.id),
      env.DB.prepare('DELETE FROM orders WHERE id=?').bind(d.id),
    ]);
  }
  await env.DB.prepare(
    "DELETE FROM recipients WHERE slug LIKE '%-demo' AND id NOT IN (SELECT recipient_id FROM orders)",
  ).run();
  return result({ ok: true, deleted: demos.length });
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url),
        path = url.pathname;
      if (path.startsWith('/api/')) {
        allowOrigin(request);
        if (path.startsWith('/api/admin/')) return await adminRoute(request, env, path);
        const stream = path.match(/^\/api\/media\/([a-f0-9-]{36})$/);
        if (stream && request.method === 'GET') return await signedMedia(request, env, stream[1], url);
        return await publicRoute(request, env, path);
      }
      // Static files, hosted in the same Worker.
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Permissions-Policy', 'microphone=(self), camera=(self), geolocation=()');
      if ((headers.get('Content-Type') || '').includes('text/html')) {
        headers.set(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        );
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('Internal Worker error', e?.message || e);
      return result(
        {
          error: e instanceof HttpError ? e.message : 'Erro interno. Tente novamente ou avise a coordenação.',
        },
        e instanceof HttpError ? e.status : 500,
      );
    }
  },
};
