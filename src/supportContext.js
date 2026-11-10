// Confidential, expiring URL context. AES-256-GCM provides both encryption
// and authentication. Tokens never grant letter-reading or editing privileges.
const textEncoder=new TextEncoder();
const textDecoder=new TextDecoder();
const PURPOSE='ejc:support-context:v1';
const ALLOWED_PURPOSES=new Set(['support','finished','send','draft','invite']);
const MAX_AGE=14*24*3600;
const idPattern=/^EJC-[A-F0-9]{12}$/;
const slugPattern=/^[a-z0-9-]{1,65}$/;
function base64url(bytes){
  let text='';
  for(const byte of bytes)text+=String.fromCharCode(byte);
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromBase64url(string){
  if(!/^[A-Za-z0-9_-]+$/.test(string)||string.length>16000)
    throw new Error('Contexto inválido.');
  return Uint8Array.from(atob(string.replace(/-/g,'+').replace(/_/g,'/')+
    '='.repeat((4-string.length%4)%4)),character=>character.charCodeAt(0));
}
export function cleanSupportContext(value={}){
  const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const clean=(x,n=100)=>String(x??'').replace(/[\r\n<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
  const tag=x=>clean(x,64).replace(/[^a-z0-9_-]/gi,'').toLowerCase();
  const arrays=(x,re,max=20)=>[...new Set((Array.isArray(x)?x:[]).filter(y=>
    typeof y==='string'&&re.test(y)))].slice(0,max);
  const digits=clean(v.phone,25).replace(/\D/g,'');
  const phone=(digits.length===10||digits.length===11?'55'+digits:digits);
  const fields={
    version:1,
    purpose:ALLOWED_PURPOSES.has(v.purpose)?v.purpose:'support',
    name:clean(v.name),
    phone:/^55[1-9][0-9][0-9]{8,9}$/.test(phone)?phone:'',
    ids:arrays(v.ids,idPattern),
    recipientSlugs:arrays(v.recipientSlugs,slugPattern),
    checkoutId:/^EJCB-[A-F0-9]{12}$/.test(v.checkoutId||'')?v.checkoutId:'',
    stage:tag(v.stage),
    source:tag(v.source)||'whatsapp',
    medium:tag(v.medium)||'link',
    campaign:tag(v.campaign)||'suporte_cartinhas',
    content:tag(v.content)||'suporte',
  };
  return fields;
}
async function aesKey(secret){
  if(typeof secret!=='string'||secret.length<32)throw new Error('SESSION_SECRET inválido.');
  const digest=await crypto.subtle.digest('SHA-256',
    textEncoder.encode(PURPOSE+':'+secret));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,
    ['encrypt','decrypt']);
}
export async function encryptSupportContext(secret,input,now=Date.now()){
  const payload={...cleanSupportContext(input),iat:Math.floor(now/1000),
    exp:Math.floor(now/1000)+MAX_AGE};
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({
    name:'AES-GCM',iv,additionalData:textEncoder.encode(PURPOSE)
  },await aesKey(secret),textEncoder.encode(JSON.stringify(payload))));
  const bytes=new Uint8Array(iv.length+ciphertext.length);
  bytes.set(iv);bytes.set(ciphertext,iv.length);
  return 'ec1_'+base64url(bytes);
}
export async function decryptSupportContext(secret,opaque,now=Date.now()){
  if(typeof opaque!=='string'||!/^ec1_[A-Za-z0-9_-]{35,16000}$/.test(opaque))
    throw new Error('Contexto inválido.');
  const bytes=fromBase64url(opaque.slice(4));
  if(bytes.length<29)throw new Error('Contexto inválido.');
  try{
    const text=await crypto.subtle.decrypt({
      name:'AES-GCM',iv:bytes.slice(0,12),
      additionalData:textEncoder.encode(PURPOSE)
    },await aesKey(secret),bytes.slice(12));
    const payload=JSON.parse(textDecoder.decode(text));
    const current=Math.floor(now/1000);
    if(payload.version!==1||!Number.isSafeInteger(payload.exp)||
      !Number.isSafeInteger(payload.iat)||payload.exp<current||
      payload.iat>current+300||payload.exp-payload.iat>MAX_AGE)
      throw new Error('Contexto expirado ou inválido.');
    return cleanSupportContext(payload);
  }catch{
    throw new Error('Contexto expirado, adulterado ou inválido.');
  }
}
// Optional key rollover: old encrypted links remain readable until their own
// signed expiration, without ever treating support context as mural access.
export async function decryptSupportContextWithLegacy(env,opaque,now=Date.now()){
  try{
    return await decryptSupportContext(env.SESSION_SECRET,opaque,now);
  }catch(error){
    const previous=env.LEGACY_SESSION_SECRET;
    if(typeof previous==='string'&&previous.length>=32&&
        previous!==env.SESSION_SECRET)
      return decryptSupportContext(previous,opaque,now);
    throw error;
  }
}
export function supportSharePath(opaque,purpose='support'){
  const base=purpose==='finished'
    ?'/ajuda/terminei-a-cartinha'
    :purpose==='send'?'/enviar'
    :'/ajuda/minha-cartinha';
  return base+'?c='+encodeURIComponent(opaque);
}
