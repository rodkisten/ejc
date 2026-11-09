import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {defaultHelpOgPng} from '../src/defaultHelpOg.js';

test('fallback Preciso de ajuda OG is valid indexed 1200x630 PNG',async()=>{
  const png=await defaultHelpOgPng();
  const view=new DataView(png.buffer,png.byteOffset,png.byteLength);
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(view.getUint32(16),1200);
  assert.equal(view.getUint32(20),630);
  assert.equal(png[24],8);
  assert.equal(png[25],3,'PNG palette color mode');
  let offset=8,compressed=[];
  while(offset<png.length){
    const size=view.getUint32(offset);offset+=4;
    const type=String.fromCharCode(...png.subarray(offset,offset+4));offset+=4;
    const body=png.subarray(offset,offset+size);offset+=size+4;
    if(type==='IDAT')compressed.push(body);
    if(type==='IEND')break;
  }
  const raw=inflateSync(Buffer.concat(compressed));
  assert.equal(raw.length,630*(1200+1));
  assert.equal(raw[0],0,'first scanline uses PNG filter 0');
  assert.notEqual(raw[1],raw[300],'artwork includes distinguishable graphics');
  assert.ok(png.byteLength<200_000,'optimized for WhatsApp image fetch');
});
