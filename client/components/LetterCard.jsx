import React from 'react';
import { cleanHtml } from './RichEditor';
import VoicePlayer from './VoicePlayer';
import { download, share } from '../lib/api';
import { zipSync, strToU8 } from 'fflate';
import { Download, Share2, Music2, Images, FileArchive } from 'lucide-react';
export const safeFilename=s=>String(s||'cartinha').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,50);
export function LetterCard({letter,recipient,actions=true}) {
  const images=(letter.media||[]).filter(m=>m.kind==='image'),audios=(letter.media||[]).filter(m=>m.kind==='audio');
  return <article className="letter-card">
    <div className="letter-paper"><div className="letter-stamp">✳ XX EJC ✳</div><div className="letter-salutation">Para {recipient || letter.recipient_name} ♡</div>
      <div className="letter-content" dangerouslySetInnerHTML={{__html:cleanHtml(letter.rich_html)}}/>
      {!!images.length && <div className="letter-photos">{images.map((m,i)=><img key={m.id||i} src={m.url} alt={`Foto ${i+1} da cartinha`} loading="lazy"/>)}</div>}
      <p className="letter-signature">Com carinho, {letter.sender_name || 'uma pessoa especial'} <span>♥</span></p>
      <div className="letter-footer-stamp">SIMONÉSIA · NOVEMBRO 2026</div>
    </div>
    {!!audios.length && <div className="letter-voice"><span className="eyebrow">Guarde esta voz</span>{audios.map((m,i)=><VoicePlayer key={m.id||i} src={m.url} title={`Áudio ${i+1}`} compact/>)}</div>}
    {actions && <div className="letter-actions"><button type="button" onClick={()=>exportLetter(letter,recipient,'png')} className="btn ghost"><Download size={16}/> Cartinha</button><button type="button" className="btn ghost" onClick={()=>exportLetter(letter,recipient,'share')}><Share2 size={16}/> Instagram / Compartilhar</button><button type="button" onClick={()=>exportLetter(letter,recipient,'zip')} className="btn"><FileArchive size={16}/> ZIP completo</button></div>}
  </article>;
}
async function toBytes(url){const r=await fetch(url);if(!r.ok)throw new Error('Não foi possível baixar um anexo.');return new Uint8Array(await r.arrayBuffer());}
function wrap(ctx,text,x,y,maxWidth,lineHeight){
  const words=text.replace(/\s+/g,' ').split(' ');let line='';
  for(const w of words){if(ctx.measureText(`${line} ${w}`).width>maxWidth&&line){ctx.fillText(line,x,y);y+=lineHeight;line=w;}else line=line?`${line} ${w}`:w;}
  if(line){ctx.fillText(line,x,y);y+=lineHeight;}return y;
}
async function cardPng(letter,recipient){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#faf1e4';ctx.fillRect(0,0,1080,1350);ctx.strokeStyle='#c9a8a0';ctx.lineWidth=3;ctx.strokeRect(46,46,988,1258);
  ctx.fillStyle='#8d4f67';ctx.textAlign='center';ctx.font='bold 26px serif';ctx.fillText('✳ XX EJC SIMONÉSIA ✳',540,120);
  ctx.font='italic 60px "Caveat", cursive';ctx.fillText(`Para ${recipient||letter.recipient_name} ♡`,540,213);
  ctx.textAlign='left';ctx.fillStyle='#30272e';ctx.font='36px "Caveat", cursive';
  const plain=document.createElement('div');plain.innerHTML=cleanHtml(letter.rich_html);const text=plain.textContent||'Uma mensagem especial para você.';
  let y=wrap(ctx,text,115,320,850,52);y=Math.min(y+25,1050);
  const images=(letter.media||[]).filter(m=>m.kind==='image').slice(0,3);
  for(const m of images){
    try{const bytes=await toBytes(m.url);const blob=new Blob([bytes],{type:m.content_type||'image/jpeg'});const bitmap=await createImageBitmap(blob);const h=Math.min(180,1160-y);
      if(h>40){const w=260;ctx.drawImage(bitmap,0,0,bitmap.width,bitmap.height,115+(images.indexOf(m)%3)*280,y,w,h);}
      bitmap.close();
    }catch{} 
  }
  ctx.fillStyle='#8d4f67';ctx.font='italic 42px "Caveat", cursive';ctx.fillText(`Com carinho, ${letter.sender_name||'uma pessoa especial'} ♥`,115,1225);
  return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob),'image/png'));
}
export async function exportLetter(letter,recipient,mode='png'){
  const name=safeFilename(recipient||letter.recipient_name),png=await cardPng(letter,recipient);
  if(!png)throw new Error('Não foi possível montar a cartinha.');
  if(mode==='png'){download(png,`cartinha-${name}.png`,'image/png');return;}
  if(mode==='share'){await share(new File([png],`cartinha-${name}.png`,{type:'image/png'}),`Cartinha para ${recipient||letter.recipient_name}`,'Uma cartinha do XX EJC 💌');return;}
  const parts={[`cartinha-${name}.png`]:new Uint8Array(await png.arrayBuffer()),'mensagem.txt':strToU8(letter.rich_html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())};
  let sum=0;
  for(const [i,m] of (letter.media||[]).entries()){
    const data=await toBytes(m.url);sum+=data.byteLength;
    if(sum>200*1024*1024)throw new Error('O ZIP excede 200 MB neste navegador. Baixe os áudios e fotos separadamente.');
    parts[`${m.kind==='audio'?'audios':'fotos'}/${i+1}-${safeFilename(m.filename)}`]=data;
  }
  download(zipSync(parts,{level:0}),`homenagem-${name}.zip`,'application/zip');
}
export function saveAllCards(letters,recipient){return Promise.all(letters.map(x=>exportLetter(x,recipient,'zip')));}
export function MediaDownload({media}){return <div className="media-download"><a href={media.url} download={media.filename} target="_blank" rel="noreferrer"><Music2 size={16}/> {media.filename}</a><button type="button" onClick={async()=>share(new File([await toBytes(media.url)],media.filename,{type:media.content_type}),media.filename,'Uma mensagem de voz 💜')} className="text-button"><Share2 size={15}/> WhatsApp / Compartilhar</button></div>}
