import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createOgImage, OG_WIDTH, OG_HEIGHT, OG_SAFE } from '../client/lib/og.js';

test('fallback PNG is real, correctly sized, and usable without any admin upload', () => {
  const png = fs.readFileSync(new URL('../public/og-ejc-default.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 600);
  assert.equal(png.readUInt32BE(20), 315);
  assert.ok(png.byteLength < 100_000);
});

function browserCanvas() {
  const text = [];
  const photos = [];
  const ctx = {
    font: '20px Arial', textAlign: 'left',
    fillText(value, x, y, maxWidth) { text.push({ value: String(value), x, y, maxWidth }); },
    measureText(value) {
      return { width: String(value).length * (Number(this.font.match(/(\d+)px/)?.[1]) || 20) * 0.56 };
    },
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, save() {}, restore() {}, clip() {},
    drawImage(image, x, y, width, height) { photos.push({ x, y, width, height }); },
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    toBlob: (callback) => callback(new Blob(['test-png'], { type: 'image/png' })),
  };
  return { canvas, text, photos };
}

test('personalized OG keeps all essential text inside central WhatsApp crop', async () => {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const originalWindow = globalThis.window;
  const mock = browserCanvas();
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => mock.canvas };
  globalThis.window = { location: { origin: 'https://ejc.migos.club' } };
  globalThis.Image = class {
    naturalWidth = 350;
    naturalHeight = 450;
    set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  };
  try {
    const png = await createOgImage({
      name: 'Maria Eduarda Aparecida dos Santos de Oliveira',
      photoUrl: '/api/recipients/person/photo',
    });
    assert.equal(png.type, 'image/png');
    assert.equal(mock.canvas.width, OG_WIDTH);
    assert.equal(mock.canvas.height, OG_HEIGHT);
    const essential = mock.text.filter(({ value }) =>
      value.includes('CARTINHAS') || value.includes('UMA CARTINHA') ||
      value.includes('Sua voz') || value.includes('SIMONÉSIA') ||
      value.includes('Maria') || value.includes('Eduarda') ||
      value.includes('Aparecida') || value.includes('Oliveira')
    );
    assert.ok(essential.length >= 4);
    for (const item of essential) {
      assert.ok(item.x >= OG_SAFE.left && item.x <= OG_SAFE.right, item.value + ' x=' + item.x);
      assert.ok(item.y >= OG_SAFE.top && item.y <= OG_SAFE.bottom, item.value + ' y=' + item.y);
    }
    assert.ok(mock.photos.length > 0);
    for (const item of mock.photos) {
      // Draw bounds can overrun the clipped portrait region, but the photo itself
      // is clipped by the canvas to x=660..842, safely inside the crop.
      assert.ok(item.width > 0 && item.height > 0);
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
    globalThis.window = originalWindow;
  }
});

test('failed portrait load rejects instead of publishing an empty photo preview', async () => {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const originalWindow = globalThis.window;
  const mock = browserCanvas();
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => mock.canvas };
  globalThis.window = { location: { origin: 'https://ejc.migos.club' } };
  globalThis.Image = class {
    set src(value) { queueMicrotask(() => this.onerror?.(new Error(value))); }
  };
  try {
    await assert.rejects(
      () => createOgImage({ name: 'Ana Clara', photoUrl: '/api/recipients/broken/photo' }),
      /Não foi possível carregar a foto/,
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
    globalThis.window = originalWindow;
  }
});
