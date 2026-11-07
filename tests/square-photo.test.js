import test from 'node:test';
import assert from 'node:assert/strict';
import {
  squareCrop, dragSquareCrop, drawSquarePhoto, exportSquarePhoto, PHOTO_OUTPUT_SIZE,
} from '../client/lib/squarePhoto.js';
import { jpegDimensions, isSquareRecipientJpeg } from '../src/photo.js';

function syntheticJpeg(width, height) {
  const payload = [
    0xff,0xd8,
    0xff,0xe1,0,4,0,0,
    0xff,0xc0,0,17,8,
    height >> 8,height & 255, width >> 8,width & 255,
    3,1,0x11,0,2,0x11,0,3,0x11,0,
    0xff,0xd9,
  ];
  return new Uint8Array(payload);
}

test('recorte 1:1 centraliza imagens verticais, horizontais e quadradas', () => {
  assert.deepEqual(squareCrop(1200, 800), { x: 200, y: 0, side: 800 });
  assert.deepEqual(squareCrop(400, 900), { x: 0, y: 250, side: 400 });
  assert.deepEqual(squareCrop(768, 768), { x: 0, y: 0, side: 768 });
  assert.deepEqual(squareCrop(1200, 800, 2), { x: 400, y: 200, side: 400 });
});

test('arrastar altera o recorte sem revelar espaço fora da foto', () => {
  const moved = dragSquareCrop(1200, 800, 1.5, { x: .5, y: .5 }, 70, -55, 350);
  assert.ok(moved.x < .5);
  assert.ok(moved.y > .5);
  const crop = squareCrop(1200, 800, 1.5, moved);
  assert.ok(crop.x >= 0);
  assert.ok(crop.y >= 0);
  assert.ok(crop.x + crop.side <= 1200);
  assert.ok(crop.y + crop.side <= 800);
  const clamped = squareCrop(1200, 800, 5, { x: -500, y: 1000 });
  assert.equal(clamped.side, 800 / 3);
  assert.equal(clamped.x, 0);
});

test('prévia e exportação utilizam o mesmo recorte e entregam JPEG quadrado', async () => {
  const before = globalThis.document;
  const drawn = [];
  const makeCanvas = () => ({
    width: 440, height: 440,
    getContext: () => ({
      drawImage(...args) { drawn.push(args); },
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    }),
    toBlob(fn) { fn(new Blob(['jpeg-de-teste'], { type: 'image/jpeg' })); },
  });
  globalThis.document = { createElement: makeCanvas };
  try {
    const image = { naturalWidth: 1600, naturalHeight: 1200 };
    const canvas = makeCanvas();
    drawSquarePhoto(image, canvas, 1.4, { x: .4, y: .6 });
    const output = await exportSquarePhoto(image, 1.4, { x: .4, y: .6 });
    assert.equal(output.type, 'image/jpeg');
    assert.equal(drawn.length, 2);
    assert.deepEqual(drawn[0].slice(1, 5), drawn[1].slice(1, 5));
    assert.deepEqual(drawn[1].slice(-2), [PHOTO_OUTPUT_SIZE, PHOTO_OUTPUT_SIZE]);
  } finally {
    globalThis.document = before;
  }
});

test('servidor aceita apenas dimensões JPEG realmente quadradas', () => {
  assert.deepEqual(jpegDimensions(syntheticJpeg(768, 768)), { width: 768, height: 768 });
  assert.equal(isSquareRecipientJpeg(syntheticJpeg(768, 768)), true);
  assert.equal(isSquareRecipientJpeg(syntheticJpeg(1200, 768)), false);
  assert.equal(isSquareRecipientJpeg(syntheticJpeg(200, 200)), false);
  assert.equal(isSquareRecipientJpeg(syntheticJpeg(3000, 3000)), false);
  assert.equal(isSquareRecipientJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), false);
});
