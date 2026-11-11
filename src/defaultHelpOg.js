// Default WhatsApp OG for support when no custom R2 artwork exists.
// Generates a real 1200x630 indexed PNG directly in the Worker. Pixel-cut
// collage style follows the Mini Mercado palette; no external font/service.
const W=1200,H=630;
const COLORS=[
  [8,82,190],[20,35,91],[239,23,111],[255,209,39],
  [255,248,229],[255,255,255],[118,32,123],[12,23,57]
];
const FONT={
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01111','10000','10000','10000','10000','10000','01111'],
  'D':['11110','10001','10001','10001','10001','10001','11110'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01111','10000','10000','10111','10001','10001','01110'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['11111','00100','00100','00100','00100','00100','11111'],
  'J':['00111','00010','00010','00010','10010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','10101','01010'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '?':['01110','10001','00001','00010','00100','00000','00100'],
  '!':['00100','00100','00100','00100','00100','00000','00100']
};
async function draw(mode='help'){
  const raster=new Uint8Array(H*(W+1));
  function rect(x,y,w,h,color){
    for(let py=Math.max(0,y);py<Math.min(H,y+h);py++){
      const start=py*(W+1)+1;
      raster.fill(color,start+Math.max(0,x),start+Math.min(W,x+w));
    }
  }
  function letters(value,y,scale,color){
    const message=value.toUpperCase();
    const width=message.length*6*scale-scale;
    let x=Math.floor((W-width)/2);
    for(const glyph of message){
      const rows=FONT[glyph]||FONT[' '];
      for(let row=0;row<7;row++)
        for(let col=0;col<5;col++)
          if(rows[row][col]==='1')rect(x+col*scale,y+row*scale,scale,scale,color);
      x+=6*scale;
    }
  }
  // Blue background, torn-paper layers and colorful cutout stickers.
  for(let y=0;y<H;y++)raster.fill(0,y*(W+1)+1,y*(W+1)+W+1);
  rect(0,0,275,85,2);rect(910,0,290,89,3);
  rect(0,513,265,117,3);rect(940,527,260,103,2);
  rect(284,21,632,590,1);
  rect(298,33,604,564,4);
  rect(318,52,564,66,3);
  letters('CARTINHAS VIRTUAIS',72,3,1);
  if(mode==='completion'){
    // The central 520px region remains readable in WhatsApp's square crop.
    // Exact full wording appears both in this image and its OpenGraph title.
    rect(326,144,548,372,2);
    rect(338,156,524,347,4);
    rect(351,172,498,47,3);
    letters('PRECISO DE AJUDA',181,5,1);
    letters('COM A SUA',240,8,1);
    letters('CARTINHA',325,10,6);
    letters('PRA MIM',430,8,1);
    rect(334,522,532,57,3);
    rect(341,529,518,43,4);
    letters('XX EJC SIMONESIA',538,4,1);
  }else{
    rect(326,145,548,266,2);
    rect(338,156,524,238,2);
    rect(355,177,490,83,3);
    letters('PRECISO DE',191,9,1);
    letters('AJUDA?',288,12,4);
    rect(334,444,532,118,3);
    rect(340,450,520,106,4);
    letters('MINI MERCADO',465,5,1);
    letters('XX EJC SIMONESIA',522,3,2);
  }
  // Hearts, small rays, confetti: intentionally in the outer gutters.
  const heart=(x,y,scale)=>{
    const bits=['01100110','11111111','11111111','01111110','00111100','00011000'];
    bits.forEach((row,yy)=>[...row].forEach((v,xx)=>{
      if(v==='1')rect(x+xx*scale,y+yy*scale,scale,scale,3);
    }));
  };
  heart(130,220,12);heart(969,355,12);
  for(const [x,y] of [[90,152],[1080,174],[174,464],[1010,132]]){
    rect(x-4,y-32,8,64,3);rect(x-32,y-4,64,8,3);
  }
  // PNG with indexed palette. CompressionStream is available in Workers.
  const bytes=(...chunks)=>{
    const result=new Uint8Array(chunks.reduce((total,part)=>total+part.length,0));
    let pos=0;
    for(const chunk of chunks){result.set(chunk,pos);pos+=chunk.length;}
    return result;
  };
  const uint=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
  const crc=data=>{
    let c=0xffffffff;
    for(const n of data){
      c^=n;
      for(let j=0;j<8;j++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;
    }
    return (c^0xffffffff)>>>0;
  };
  const chunk=(name,data)=>{
    const type=new TextEncoder().encode(name);
    const body=bytes(type,data);
    return bytes(uint(data.length),body,uint(crc(body)));
  };
  const compressed=new Uint8Array(await new Response(
    new Blob([raster]).stream().pipeThrough(new CompressionStream('deflate'))
  ).arrayBuffer());
  const palette=new Uint8Array(COLORS.flat());
  return bytes(
    new Uint8Array([137,80,78,71,13,10,26,10]),
    chunk('IHDR',bytes(uint(W),uint(H),new Uint8Array([8,3,0,0,0]))),
    chunk('PLTE',palette),
    chunk('IDAT',compressed),
    chunk('IEND',new Uint8Array())
  );
}
let cached;
export async function defaultHelpOgPng(){
  if(!cached)cached=draw().catch(error=>{cached=null;throw error;});
  return cached;
}
// A distinct, static PNG per Worker instance. No R2 upload, third-party
// image service, message content or additional infrastructure is required.
let completionCached;
export async function completionHelpOgPng(){
  if(!completionCached)completionCached=draw('completion').catch(error=>{
    completionCached=null;
    throw error;
  });
  return completionCached;
}
