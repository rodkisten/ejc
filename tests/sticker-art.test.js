import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STICKERS } from '../shared/letter.js';

test('catálogo contém vinte adesivos autorais e IDs únicos', () => {
  assert.equal(STICKERS.length, 20);
  assert.equal(new Set(STICKERS.map(s => s.id)).size, STICKERS.length);
  for (const sticker of STICKERS) {
    assert.match(sticker.id, /^[a-z0-9-]+$/);
    assert.ok(sticker.text.length > 3);
  }
});

test('preview e imagem exportada usam o mesmo PNG, sem SVG gerado', () => {
  const sticker = fs.readFileSync(new URL('../client/components/letter/Sticker.jsx', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../client/lib/letterExport.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(sticker, /\/api\/stickers\//);
  assert.match(exportSource, /\/api\/stickers\//);
  assert.doesNotMatch(sticker, /\.webp/);
  assert.doesNotMatch(exportSource, /\.webp/);
  assert.match(worker, /stickers\/v1\//);
  assert.match(worker, /image\/png/);
});
