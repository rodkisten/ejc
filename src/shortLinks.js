// Short links use 80-bit random IDs and AES-256-GCM encrypted destinations.
// This keeps WhatsApp URLs compact without trusting an external URL shortener.
// A short URL is not a substitute for the underlying access permissions.
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const DOMAIN='ejc:short-destination:v1';
const CODE_PATTERN=/^[A-Za-z0-9_-]{14}$/;
const KIND_PATTERN=/^(support|finished|admin|letters|send|draft|invite|mural|checkout|order|home|open)$/;
const MAX_TTL=60*60*24*365;
const DEFAULT_TTL=60*60*24*14;

function b64url(input){
  let chars='';
  for(const b of input)chars+=String.fromCharCode(b);
  return btoa(chars).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64url(str){
  if(!/^[A-Za-z0-9_-]{40,16384}$/.test(str))throw new Error('Destino cifrado inválido.');
  return Uint8Array.from(
    atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),
    char=>char.charCodeAt(0)
  );
}
async function encryptionKey(secret){
  if(typeof secret!=='string'||secret.length<32)
    throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres.');
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(DOMAIN+':'+secret));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptDestination(secret,plain){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:encoder.encode(DOMAIN)
  },await encryptionKey(secret),encoder.encode(plain)));
  const merged=new Uint8Array(iv.length+encrypted.length);
  merged.set(iv);merged.set(encrypted,iv.length);
  return b64url(merged);
}
async function decryptDestination(secret,stored){
  const bytes=fromB64url(stored);
  if(bytes.length<29)throw new Error('Destino cifrado inválido.');
  const result=await crypto.subtle.decrypt({
    name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode(DOMAIN)
  },await encryptionKey(secret),bytes.slice(12));
  return decoder.decode(result);
}
export function validateShortDestination(destination,origin){
  if(typeof destination!=='string'||destination.length>14000)
    throw new Error('URL de destino inválida ou muito grande.');
  const base=new URL(origin);
  const target=new URL(destination,base);
  if(base.protocol!=='https:'||target.protocol!=='https:'||
    target.origin!==base.origin||target.username||target.password||
    /^\/(?:s|api)\//.test(target.pathname))
    throw new Error('O destino deve ser uma página segura no próprio EJC.');
  const normalized=target.toString();
  // Avoid issuing short links whose encrypted payload cannot be decoded due
  // to the bounded ciphertext size (also guards D1 write amplification).
  if(encoder.encode(normalized).byteLength>10000)
    throw new Error('URL de destino excede o limite seguro.');
  return normalized;
}
export async function createShortLink(env,destination,{
  origin,kind='support',ttlSeconds=DEFAULT_TTL
}={}){
  if(!KIND_PATTERN.test(kind))throw new Error('Tipo de link inválido.');
  const site=new URL(origin||env.PUBLIC_ORIGIN).origin;
  const finalDestination=validateShortDestination(destination,site);
  if(!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>MAX_TTL)
    throw new Error('Prazo de validade inválido.');
  const encrypted=await encryptDestination(env.SESSION_SECRET,finalDestination);
  const now=Math.floor(Date.now()/1000);
  const expires=now+ttlSeconds;
  for(let tries=0;tries<4;tries++){
    const code=b64url(crypto.getRandomValues(new Uint8Array(10)));
    const saved=await env.DB.prepare(
      'INSERT OR IGNORE INTO short_links(code,destination_ciphertext,kind,created_at,expires_at) '+
      'VALUES(?,?,?,?,?)'
    ).bind(code,encrypted,kind,now,expires).run();
    if(Number(saved.meta?.changes||0)===1)
      return {url:site+'/s/'+code,code,kind,expires_at:expires};
  }
  throw new Error('Não foi possível gerar um código curto exclusivo.');
}
export async function resolveShortLink(env,code,{origin}={}){
  if(!CODE_PATTERN.test(code))return {status:404};
  const row=await env.DB.prepare(
    'SELECT destination_ciphertext,kind,expires_at FROM short_links WHERE code=?'
  ).bind(code).first();
  if(!row)return {status:404};
  if(Number(row.expires_at)<=Math.floor(Date.now()/1000))return {status:410};
  try{
    const site=new URL(origin||env.PUBLIC_ORIGIN).origin;
    const destination=validateShortDestination(
      await decryptDestination(env.SESSION_SECRET,row.destination_ciphertext),site);
    if(!KIND_PATTERN.test(row.kind))return {status:404};
    return {status:200,kind:row.kind,destination,expires_at:row.expires_at};
  }catch{return {status:410};}
}
export const SHORT_LINK_CODE_PATTERN=CODE_PATTERN;
