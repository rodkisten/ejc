import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLetterImages } from '../client/lib/letterExport.js';

function mockCanvas() {
  const sizes = [];
  const context = () => {
    const ctx = { font: '30px serif', textAlign: 'left' };
    for (const method of [
      'fillRect', 'stroke', 'roundRect', 'beginPath', 'moveTo',
      'lineTo', 'fillText', 'save', 'restore', 'translate', 'rotate', 'fill',
      'ellipse', 'bezierCurveTo', 'closePath', 'drawImage',
    ]) ctx[method] = () => {};
    ctx.measureText = (value) => {
      const size = Number(ctx.font.match(/(\d+)px/)?.[1] || 30);
      return { width: String(value).length * size * .55 };
    };
    ctx.createLinearGradient = () => ({ addColorStop: () => {} });
    return ctx;
  };
  return {
    sizes,
    document: {
      fonts: { ready: Promise.resolve() },
      createElement: (tag) => {
        assert.equal(tag, 'canvas');
        const canvas = {
          width: 0, height: 0,
          getContext: () => context(),
          toBlob: (callback) => {
            sizes.push([canvas.width, canvas.height]);
            callback(new Blob(['PNG-teste'], { type: 'image/png' }));
          },
        };
        return canvas;
      },
    },
  };
}

const letter = {
  recipient_name: 'Ana Clara',
  sender_name: 'Quem te admira',
  rich_html: '<p>Deus te ama muito.</p>',
  media: [],
  composition: {
    theme: 'marian', font: 'editorial', authorName: 'Seu amigo',
    stickers: [{ id: 'a', presetId: 'nossa-senhora', x: 24, y: 50, rotate: 0, scale: 1 }],
  },
};

test('geração de PNG respeita resoluções e uma página para textos curtos', async () => {
  const original = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  const mock = mockCanvas();
  globalThis.document = mock.document;
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['sticker-png'], { type: 'image/png' }) });
  globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
  try {
    const pages = await renderLetterImages(letter, 'Ana Clara', 'letter');
    const feed = await renderLetterImages(letter, 'Ana Clara', 'feed');
    const story = await renderLetterImages(letter, 'Ana Clara', 'story');
    assert.equal(pages.length, 1);
    assert.equal(feed.length, 1);
    assert.equal(story.length, 1);
    assert.deepEqual(mock.sizes, [[1080, 1350], [1080, 1350], [1080, 1920]]);
  } finally {
    globalThis.document = original;
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
  }
});

test('cartas longas geram várias páginas ao invés de perder conteúdo', async () => {
  const original = globalThis.document;
  const mock = mockCanvas();
  globalThis.document = mock.document;
  try {
    const long = {
      ...letter,
      rich_html: '<p>' + 'Que o amor de Deus ilumine seus dias. '.repeat(190) + '</p>',
    };
    const pages = await renderLetterImages(long, 'Ana Clara', 'letter');
    assert.ok(pages.length > 1);
    assert.equal(mock.sizes.length, pages.length);
    for (const blob of pages) assert.equal(blob.type, 'image/png');
    const feed = await renderLetterImages(long, 'Ana Clara', 'feed');
    const story = await renderLetterImages(long, 'Ana Clara', 'story');
    assert.equal(feed.length, 1);
    assert.equal(story.length, 1);
  } finally {
    globalThis.document = original;
  }
});

test('exportação completa distribui todas as fotos em páginas adicionais', async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  const mock = mockCanvas();
  globalThis.document = mock.document;
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['imagem'], { type: 'image/png' }) });
  globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
  try {
    const media = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), kind: 'image', url: 'https://ejc.test/media/' + i,
    }));
    const pages = await renderLetterImages({ ...letter, media }, 'Ana Clara', 'letter');
    assert.equal(pages.length, 3); // Uma carta e dois conjuntos de fotos extras.
    assert.ok(mock.sizes.every(([width, height]) => width === 1080 && height === 1350));
  } finally {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
  }
});
