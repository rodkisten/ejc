import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STICKERS } from '../shared/letter.js';

test('os vinte adesivos são arquivos gráficos completos, sem depender de widgets de texto',()=>{
  assert.equal(STICKERS.length,20);
  for(const sticker of STICKERS){
    const path=new URL('../public/stickers/'+sticker.id+'.svg',import.meta.url);
    const content=fs.readFileSync(path,'utf8');
    assert.match(content,/<svg\s/);
    assert.match(content,/viewBox="0 0 420 420"/);
    assert.match(content,/<path\s/);
    assert.ok(content.includes('XX EJC'));
    assert.ok(content.length>600);
  }
});
