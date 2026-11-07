// No letter content, sender identity, media or private tokens are sent to the relay.
const encoder=new TextEncoder();
const timestamp=()=>new Date().toISOString();
const b64=(bytes)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const un64=(s)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function addressKey(env){
  if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET inválido');
  const raw=await crypto.subtle.digest('SHA-256',encoder.encode('ejc-email-v1:'+env.SESSION_SECRET));
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
async function hash(s){const x=await crypto.subtle.digest('SHA-256',encoder.encode(s));return [...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function encryptEmail(env,email){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await addressKey(env),encoder.encode(email));
  return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(cipher));
}
async function decryptEmail(env,value){
  const [version,iv,data]=String(value||'').split('.');
  if(version!=='v1'||!iv||!data)throw Error('E-mail protegido inválido');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await addressKey(env),un64(data));
  return new TextDecoder().decode(plain);
}
export const emailsReady=(env)=>!!(env.RESEND_API_KEY&&env.RESEND_FROM);
export function validateEmail(input){
  if(typeof input!=='string')return null;
  const email=input.trim().toLowerCase();
  return email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)?email:null;
}
export async function enqueue(env,orderId,event,payload=''){
  const allowed=['order_created','payment_claimed','payment_confirmed','letter_sent','letter_released','letter_read','email_verify','email_read'];
  if(!allowed.includes(event))throw Error('Evento desconhecido');
  await env.DB.prepare('INSERT OR IGNORE INTO notification_outbox(id,order_id,event,payload,next_attempt_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),orderId,event,payload,timestamp()).run();
}
export async function enableReceipt(env,orderId,email){
  const address=validateEmail(email);
  if(!address)throw Error('Informe um e-mail válido.');
  if(!emailsReady(env))throw Error('Avisos de leitura ainda não configurados.');
  const verify=b64(crypto.getRandomValues(new Uint8Array(32)));
  const encrypted=await encryptEmail(env,address);
  const expires=new Date(Date.now()+48*3600000).toISOString();
  await env.DB.prepare('INSERT INTO order_read_receipts(order_id,email_encrypted,verify_hash,verify_expires_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET email_encrypted=excluded.email_encrypted,verify_hash=excluded.verify_hash,verify_expires_at=excluded.verify_expires_at,verified_at=NULL,notified_at=NULL,updated_at=excluded.updated_at')
    .bind(orderId,encrypted,await hash(verify),expires,timestamp()).run();
  await env.DB.prepare("DELETE FROM notification_outbox WHERE order_id=? AND event IN ('email_verify','email_read')")
    .bind(orderId).run();
  await enqueue(env,orderId,'email_verify',JSON.stringify({token:verify}));
  return {enabled:true,verificationRequired:true};
}
export async function disableReceipt(env,orderId){
  await env.DB.prepare('DELETE FROM order_read_receipts WHERE order_id=?').bind(orderId).run();
  await env.DB.prepare("DELETE FROM notification_outbox WHERE order_id=? AND event IN ('email_verify','email_read')").bind(orderId).run();
}
export async function confirmReceipt(env,verification){
  if(typeof verification!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(verification))return false;
  const value=await hash(verification);
  const row=await env.DB.prepare('SELECT order_id,verified_at,verify_expires_at,first_read_at FROM order_read_receipts WHERE verify_hash=?').bind(value).first();
  if(!row||Date.parse(row.verify_expires_at)<Date.now())return false;
  await env.DB.prepare('UPDATE order_read_receipts SET verified_at=COALESCE(verified_at,?),verify_hash=NULL,updated_at=? WHERE order_id=? AND verify_hash=?')
    .bind(timestamp(),timestamp(),row.order_id,value).run();
  if(row.first_read_at)await enqueue(env,row.order_id,'email_read');
  return true;
}
export async function markRead(env,orderId){
  const changed=await env.DB.prepare('UPDATE orders SET first_read_at=? WHERE id=? AND first_read_at IS NULL AND submitted_at IS NOT NULL')
    .bind(timestamp(),orderId).run();
  if(changed.meta.changes!==1)return false;
  await env.DB.prepare('UPDATE order_read_receipts SET first_read_at=? WHERE order_id=? AND first_read_at IS NULL')
    .bind(timestamp(),orderId).run();
  await enqueue(env,orderId,'letter_read');
  const confirmed=await env.DB.prepare('SELECT verified_at FROM order_read_receipts WHERE order_id=?').bind(orderId).first();
  if(confirmed?.verified_at)await enqueue(env,orderId,'email_read');
  return true;
}
const labels={
  order_created:'🆕 Novo pedido de cartinha',
  payment_claimed:'💳 Pix informado, aguardando conferência',
  payment_confirmed:'✅ Pix confirmado',
  letter_sent:'💌 Cartinha enviada ao mural privado',
  letter_released:'🎁 Cartinha liberada no horário do encontro',
  letter_read:'👀 Cartinha aberta pelo encontrista'
};
async function relay(env,job){
  if(!env.RELAY_URL||!env.RELAY_TOKEN)return false;
  const url=new URL(env.RELAY_URL);
  if(url.protocol!=='https:')throw Error('Relay deve usar HTTPS');
  const order=await env.DB.prepare('SELECT o.id,o.total_cents,r.name AS recipient_name FROM orders o JOIN recipients r ON r.id=o.recipient_id WHERE o.id=?')
    .bind(job.order_id).first();
  if(!order)return true;
  const text=[labels[job.event], 'Pedido: '+order.id,
    'Encontrista: '+String(order.recipient_name).replace(/[\r\n<>]/g,' ').slice(0,100),
    'Valor: R$ '+(order.total_cents/100).toFixed(2).replace('.',',')].join('\n');
  const r=await fetch(url.toString(),{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.RELAY_TOKEN,'Idempotency-Key':job.id},
    body:JSON.stringify({text,chat_id:env.RELAY_CHAT_ID||undefined,event:job.event,idempotency_key:job.id})});
  if(!r.ok)throw Error('Relay HTTP '+r.status);
  return true;
}
async function resend(env,to,subject,body,id){
  if(!emailsReady(env))return false;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},
    body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject,text:body})});
  if(!r.ok)throw Error('Resend HTTP '+r.status);
  return true;
}
async function sendEmail(env,job){
  if(!emailsReady(env))return false;
  const row=await env.DB.prepare('SELECT * FROM order_read_receipts WHERE order_id=?').bind(job.order_id).first();
  if(!row)return true;
  const to=await decryptEmail(env,row.email_encrypted);
  if(job.event==='email_verify'){
    if(row.verified_at||Date.parse(row.verify_expires_at)<Date.now())return true;
    const verification=JSON.parse(job.payload||'{}').token;
    const origin=new URL(env.PUBLIC_ORIGIN||'https://ejc.migos.club').origin;
    return resend(env,to,'Confirme seu aviso de leitura · XX EJC',
      'Confirme seu e-mail para receber um aviso quando sua cartinha for aberta:\n'+
      origin+'/confirmar-email#token='+encodeURIComponent(verification)+
      '\n\nSe você não solicitou este aviso, ignore a mensagem. Nenhuma carta ou mídia é enviada por e-mail.',job.id);
  }
  if(job.event==='email_read'){
    if(!row.verified_at||!row.first_read_at||row.notified_at)return true;
    const delivered=await resend(env,to,'Sua cartinha foi aberta 💌 · XX EJC',
      'Sua cartinha foi aberta no mural privado do encontrista.\n\n'+
      'Este aviso não revela o texto, fotos, áudios ou código do mural.\n\nXX EJC Simonésia',job.id);
    if(delivered)await env.DB.prepare('UPDATE order_read_receipts SET notified_at=? WHERE order_id=? AND notified_at IS NULL')
      .bind(timestamp(),job.order_id).run();
    return delivered;
  }
  return true;
}
export async function dispatch(env,limit=20){
  const jobs=(await env.DB.prepare('SELECT * FROM notification_outbox WHERE sent_at IS NULL AND next_attempt_at<=? AND attempts<8 ORDER BY created_at LIMIT ?')
    .bind(timestamp(),limit).all()).results;
  for(const job of jobs){
    const claimed=await env.DB.prepare('UPDATE notification_outbox SET attempts=attempts+1,next_attempt_at=? WHERE id=? AND sent_at IS NULL AND next_attempt_at<=?')
      .bind(new Date(Date.now()+90000).toISOString(),job.id,timestamp()).run();
    if(claimed.meta.changes!==1)continue;
    try{
      const ok=job.event.startsWith('email_')?await sendEmail(env,job):await relay(env,job);
      if(ok)await env.DB.prepare('UPDATE notification_outbox SET sent_at=?,last_error=NULL WHERE id=?')
        .bind(timestamp(),job.id).run();
      else await env.DB.prepare('UPDATE notification_outbox SET attempts=MAX(0,attempts-1),next_attempt_at=? WHERE id=?')
        .bind(new Date(Date.now()+300000).toISOString(),job.id).run();
    }catch(error){
      const retry=new Date(Date.now()+Math.min(6*3600000,2**Math.min(job.attempts,8)*60000)).toISOString();
      await env.DB.prepare('UPDATE notification_outbox SET next_attempt_at=?,last_error=? WHERE id=?')
        .bind(retry,String(error.message||'delivery_error').slice(0,150),job.id).run();
    }
  }
  return jobs.length;
}
export async function queueRelease(env,releaseDate){
  if(!releaseDate||Date.now()<Date.parse(releaseDate+':00-03:00'))return;
  const rows=(await env.DB.prepare("SELECT id FROM orders WHERE submitted_at IS NOT NULL AND status IN ('paid','preparing','delivered')").all()).results;
  for(const row of rows)await enqueue(env,row.id,'letter_released');
}
