import { draftOgNames, draftOgCaption, draftOgIds } from '../../shared/draftOg.js';

export const DRAFT_OG_WIDTH=1200;
export const DRAFT_OG_HEIGHT=630;

function round(ctx,x,y,width,height,radius,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.roundRect(x,y,width,height,radius);
  ctx.fill();
}
function paper(ctx,points,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fill();
}
function fitText(ctx,value,maxWidth,maxSize=53,minSize=24,maxLines=3){
  const words=String(value).split(/\s+/).filter(Boolean);
  for(let size=maxSize;size>=minSize;size-=2){
    ctx.font='900 '+size+'px "DM Sans",system-ui,Arial,sans-serif';
    const lines=[];
    let line='';
    for(const word of words){
      const test=line?line+' '+word:word;
      if(line&&ctx.measureText(test).width>maxWidth){
        lines.push(line);
        line=word;
      }else line=test;
    }
    if(line)lines.push(line);
    if(lines.length<=maxLines&&lines.every(l=>ctx.measureText(l).width<=maxWidth))
      return {lines,size};
  }
  // Extremely long names are shortened, but never turned into a generic placeholder.
  const size=minSize;
  ctx.font='900 '+size+'px "DM Sans",system-ui,Arial,sans-serif';
  const lines=[];
  let line='';
  for(const word of words){
    const test=line?line+' '+word:word;
    if(line&&ctx.measureText(test).width>maxWidth){
      lines.push(line);
      line=word;
    }else line=test;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){
    const rest=lines.splice(maxLines-1).join(' ');
    let tail=rest;
    while(ctx.measureText(tail+'…').width>maxWidth&&tail.length>1)
      tail=tail.slice(0,-1);
    lines.push(tail+'…');
  }
  return {size,lines};
}
function centerText(ctx,text,y,font,color,maxWidth=500){
  ctx.font=font;
  ctx.fillStyle=color;
  ctx.textAlign='center';
  ctx.fillText(text,600,y,maxWidth);
}
function envelope(ctx){
  ctx.save();
  ctx.translate(160,315);
  ctx.rotate(-.1);
  round(ctx,-88,-70,172,142,24,'#ffffff');
  round(ctx,-78,-62,152,122,17,'#ffd52c');
  ctx.strokeStyle='#10194b';ctx.lineWidth=7;
  ctx.beginPath();
  ctx.moveTo(-72,-40);ctx.lineTo(-1,14);ctx.lineTo(69,-40);
  ctx.moveTo(-70,50);ctx.lineTo(-22,10);
  ctx.moveTo(65,50);ctx.lineTo(18,10);
  ctx.stroke();
  centerText(ctx,'',0,'12px Arial','#14245b');
  ctx.fillStyle='#e50072';
  ctx.beginPath();ctx.arc(-14,0,19,0,Math.PI*2);ctx.arc(14,0,19,0,Math.PI*2);
  ctx.lineTo(0,39);ctx.closePath();ctx.fill();
  ctx.restore();
}
function stars(ctx){
  ctx.save();
  ctx.strokeStyle='#fff8d9';ctx.lineWidth=6;ctx.lineCap='round';
  for(const [x,y,r] of [[1018,145,22],[1060,468,24],[226,130,13]]){
    ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);
    ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();
  }
  ctx.fillStyle='#ffc917';
  ctx.font='900 74px Arial';ctx.fillText('♡',1015,375);
  ctx.font='900 68px Arial';ctx.fillText('✦',204,520);
  ctx.restore();
}
export async function createDraftOgImage(recipientNames=[]){
  try{await document.fonts.ready;}catch{}
  const names=draftOgNames(recipientNames);
  const canvas=document.createElement('canvas');
  canvas.width=DRAFT_OG_WIDTH;canvas.height=DRAFT_OG_HEIGHT;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Não foi possível gerar a imagem das cartinhas.');
  const bg=ctx.createLinearGradient(0,0,1200,630);
  bg.addColorStop(0,'#0452b5');bg.addColorStop(.55,'#1269c8');bg.addColorStop(1,'#053a99');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1200,630);
  paper(ctx,[[0,0],[345,0],[265,68],[60,114],[0,84]],'#ffce2b');
  paper(ctx,[[950,-2],[1200,0],[1200,111],[1091,68]],'#eb136f');
  paper(ctx,[[0,508],[218,542],[346,630],[0,630]],'#eb116f');
  paper(ctx,[[1112,548],[1200,490],[1200,630],[1008,630]],'#ffca22');
  stars(ctx);envelope(ctx);
  // All copy is inside the safe central square crop used in WhatsApp previews.
  round(ctx,306,32,588,570,26,'#142251');
  round(ctx,314,40,572,554,23,'#fff9e8');
  round(ctx,338,62,524,45,13,'#ffd027');
  centerText(ctx,'CARTINHAS VIRTUAIS · XX EJC',91,'900 23px "DM Sans",Arial,sans-serif','#16295d',505);

  round(ctx,339,129,522,151,23,'#ed1372');
  centerText(ctx,'TERMINE SUA',195,'900 56px "DM Sans",Arial,sans-serif','#fff8e6',489);
  centerText(ctx,'CARTINHA',257,'900 70px "DM Sans",Arial,sans-serif','#ffdd35',485);

  centerText(ctx,'CARTINHA EM RASCUNHO…',322,'900 28px "DM Sans",Arial,sans-serif','#13367a',496);
  const personalized=draftOgCaption(names);
  const fitted=fitText(ctx,personalized,485,50,26,3);
  const lineHeight=fitted.size*1.18;
  const firstY=382-(fitted.lines.length-1)*(lineHeight*.20);
  fitted.lines.forEach((line,index)=>{
    centerText(ctx,line,firstY+index*lineHeight,
      '900 '+fitted.size+'px "DM Sans",Arial,sans-serif',
      index===fitted.lines.length-1?'#e61473':'#10275e',485);
  });

  round(ctx,338,510,524,59,13,'#ffe044');
  centerText(ctx,'💌 MINI MERCADO · SIMONÉSIA',550,
    '900 23px "DM Sans",Arial,sans-serif','#16265a',498);
  return new Promise((resolve,reject)=>canvas.toBlob(
    blob=>blob?resolve(blob):reject(new Error('Falha ao exportar a imagem OG em PNG.')),
    'image/png'
  ));
}

export async function publishDraftOg(orders=[]){
  const ids=draftOgIds(orders.map(o=>o.id));
  if(!ids.length)throw new Error('Selecione pelo menos uma cartinha.');
  const names=orders.filter(o=>ids.includes(o.id)).map(o=>o.recipient_name);
  const png=await createDraftOgImage(names);
  const params=new URLSearchParams();
  ids.forEach(id=>params.append('id',id));
  const response=await fetch('/api/admin/og/draft?'+params.toString(),{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/png'},body:png
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Não foi possível publicar a prévia do rascunho.');
  return data;
}
