import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STICKERS, STICKER_CATEGORIES, STICKERS_BY_ID, THEMES, FONTS,
  MAX_STICKERS, normalizeComposition, computeLetterLayout, plainLetter,
} from '../shared/letter.js';

test('catálogo possui 20 adesivos católicos originais em quatro categorias', () => {
  assert.equal(STICKERS.length, 20);
  assert.equal(STICKER_CATEGORIES.length, 4);
  assert.equal(new Set(STICKERS.map((item) => item.id)).size, 20);
  for (const sticker of STICKERS) {
    assert.ok(sticker.text.length > 3);
    assert.ok(STICKERS_BY_ID[sticker.id]);
    assert.ok(sticker.colors.length);
    assert.ok(STICKER_CATEGORIES.some((category) => category.id === sticker.category));
  }
  assert.equal(STICKERS_BY_ID['joao-15-9'].reference, 'João 15,9');
  assert.equal(STICKERS_BY_ID['filipenses-1-6'].reference, 'Filipenses 1,6');
});

test('temas e fontes são alternativas simples e acessíveis', () => {
  assert.deepEqual(Object.keys(THEMES).sort(), ['lilac', 'marian', 'peach', 'rose']);
  assert.deepEqual(Object.keys(FONTS).sort(), ['editorial', 'handwritten', 'modern']);
});

test('normalização não permite stickers arbitrários, HTML, quantidades ou tamanhos perigosos', () => {
  const input = {
    theme: 'unknown', font: 'invalid', anonymous: true,
    authorName: '<script>alert(1)</script>',
    stickers: [
      { id: 'a', presetId: 'ejc-parabens', x: 900, y: -30, scale: 90, rotate: 370 },
      { id: 'a', presetId: 'jesus-ama', x: 30, y: 40 },
      { id: 'evil', presetId: 'unknown', x: 30, y: 40 },
      ...Array.from({ length: 30 }, (_, i) => ({ id: 's' + i, presetId: 'firme-na-fe', x: 45, y: 60 })),
    ],
  };
  const result = normalizeComposition(input);
  assert.equal(result.theme, 'lilac');
  assert.equal(result.font, 'editorial');
  assert.equal(result.anonymous, true);
  assert.ok(!result.authorName.includes('<'));
  assert.ok(result.stickers.length <= MAX_STICKERS);
  assert.equal(result.stickers[0].x, 92);
  assert.equal(result.stickers[0].y, 12);
  assert.equal(result.stickers[0].scale, 1.25);
  assert.equal(result.stickers[0].rotate, 18);
  assert.equal(result.stickers.some((s) => s.presetId === 'unknown'), false);
  assert.equal(new Set(result.stickers.map((s) => s.id)).size, result.stickers.length);
});

test('layout adapta tamanho a textos curtos e longos e não apaga parágrafos', () => {
  const short = computeLetterLayout({ html: '<p>Você é especial!</p>' });
  const long = computeLetterLayout({ html: '<p>' + 'Quero te contar uma história. '.repeat(90) + '</p>' });
  assert.ok(short.fontSize > long.fontSize);
  assert.ok(short.maxFontSize >= short.fontSize);
  assert.ok(long.fontSize >= long.minFontSize);
  assert.equal(plainLetter('<h2>Oi</h2><p>Uma <strong>cartinha</strong> bonita.</p>'),
    'Oi\nUma cartinha bonita.');
  const story = computeLetterLayout({ html: 'Olá', mode: 'story' });
  const feed = computeLetterLayout({ html: 'Olá', mode: 'feed' });
  assert.ok(story.fontSize > feed.fontSize);
});

test('anônimo mantém identidade oculta na composição e suporta arquivos antigos sem decoração', () => {
  const old = normalizeComposition(undefined);
  assert.equal(old.stickers.length, 0);
  assert.equal(old.anonymous, false);
  const anonymous = normalizeComposition({ anonymous: true, theme: 'rose', stickers: [] });
  assert.equal(anonymous.anonymous, true);
  assert.equal(anonymous.theme, 'rose');
  assert.deepEqual(normalizeComposition(JSON.parse(JSON.stringify(anonymous))), anonymous);
});
