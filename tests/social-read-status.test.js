import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { IMAGE_FORMATS } from '../client/lib/letterExport.js';

test('exportações de feed, story e WhatsApp usam formatos apropriados',()=>{
  assert.deepEqual(
    {width:IMAGE_FORMATS.feed.width,height:IMAGE_FORMATS.feed.height},
    {width:1080,height:1350},
  );
  assert.deepEqual(
    {width:IMAGE_FORMATS.story.width,height:IMAGE_FORMATS.story.height},
    {width:1080,height:1920},
  );
  const source=fs.readFileSync(
    new URL('../client/components/social/InstagramExportPanel.jsx',import.meta.url),'utf8'
  );
  assert.match(source,/Enviar para Instagram Feed/);
  assert.match(source,/Enviar para Instagram Story/);
  assert.match(source,/Enviar pelo WhatsApp/);
  assert.match(source,/navigator\.canShare/);
  assert.match(source,/navigator\.share/);
  assert.match(source,/download\(blob, name, 'image\/png'\)/);
});

test('mural recupera apenas cartas com primeira leitura registrada',()=>{
  const source=fs.readFileSync(new URL('../client/pages/Mural.jsx',import.meta.url),'utf8');
  assert.match(source,/card\.already_opened && !card\.draft_pending/);
  assert.match(source,/setOpened\(previous =>/);
  assert.match(source,/restoringRef\.current/);
});
