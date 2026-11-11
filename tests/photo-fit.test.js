import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fitPhotoBox } from '../shared/photoFit.js';

function assertUncropped(imageWidth, imageHeight, width, height) {
  const fit = fitPhotoBox(imageWidth, imageHeight, 10, 15, width, height);
  assert.ok(fit);
  assert.ok(fit.width <= width + 1e-8);
  assert.ok(fit.height <= height + 1e-8);
  assert.ok(fit.x >= 10 - 1e-8);
  assert.ok(fit.y >= 15 - 1e-8);
  assert.ok(Math.abs(fit.width / fit.height - imageWidth / imageHeight) < 1e-8);
  return fit;
}

test('a foto vertical, horizontal, quadrada e panorâmica conserva a proporção', () => {
  const portrait = assertUncropped(1000, 2000, 360, 345);
  assert.equal(portrait.height, 345);
  assert.equal(portrait.width, 172.5);
  const landscape = assertUncropped(2000, 1000, 360, 345);
  assert.equal(landscape.width, 360);
  assert.equal(landscape.height, 180);
  const square = assertUncropped(500, 500, 220, 170);
  assert.equal(square.width, 170);
  assert.equal(square.height, 170);
  assertUncropped(5000, 350, 220, 170);
  assertUncropped(350, 5000, 220, 170);
});

test('entrada de imagem inválida não é enviada ao canvas', () => {
  assert.equal(fitPhotoBox(0, 100, 0, 0, 200, 100), null);
  assert.equal(fitPhotoBox(100, NaN, 0, 0, 200, 100), null);
  assert.equal(fitPhotoBox(100, 100, 0, 0, -5, 100), null);
});

test('fotos do editor e mural usam lightbox, não crop, e compartilhar é WhatsApp', () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const editor = read('../client/components/LetterComposerFields.jsx');
  const mural = read('../client/components/letter/LetterCanvas.jsx');
  const styles = read('../client/styles/letter-canvas.css');
  const galleryStyles = read('../client/styles.css');
  const sharing = read('../client/components/LetterCard.jsx');
  const lightbox = read('../client/components/letter/LetterMediaLightbox.jsx');

  assert.match(editor, /<LetterMediaLightbox /);
  assert.match(mural, /<LetterMediaLightbox /);
  assert.match(styles, /object-fit:contain!important/);
  assert.match(galleryStyles, /\.photo-item__open img\s*\{[\s\S]*?object-fit: contain/);
  assert.match(sharing, /WhatsApp \/ Compartilhar/);
  assert.doesNotMatch(sharing, /Telegram/);
  assert.match(lightbox, /navigator\.share\(\{ files: \[file\]/);
  assert.match(lightbox, /credentials: 'same-origin'/);
});
