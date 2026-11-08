import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shuffledPolaroidPhotos } from '../client/lib/polaroid-wall.js';

test('o mural mostra apenas fotos públicas de encontristas ativos, sem alterar a lista original', () => {
  const recipients = [
    { id: 'a', slug: 'ana', name: 'Ana', photo_url: '/ana.jpg', active: 1 },
    { id: 'b', slug: 'bia', name: 'Bia', photo_url: '/bia.jpg', active: 1 },
    { id: 'c', slug: 'caio', name: 'Caio', photo_url: '/caio.jpg', active: 1 },
    { id: 'd', slug: 'duda', name: 'Duda', photo_url: null, active: 1 },
    { id: 'e', slug: 'elias', name: 'Elias', photo_url: '/elias.jpg', active: 0 },
  ];
  const original = recipients.map((person) => person.id);
  const photos = shuffledPolaroidPhotos(recipients, () => 0);
  assert.deepEqual(recipients.map((person) => person.id), original);
  assert.deepEqual(new Set(photos.map(({ person }) => person.id)), new Set(['a', 'b', 'c']));
  assert.equal(photos.length, 3);
  assert.notDeepEqual(photos.map(({ person }) => person.id), ['a', 'b', 'c']);
  for (const photo of photos) {
    assert.match(photo.rotation, /^-?\d+\.\ddeg$/);
    assert.match(photo.shift, /^-?\d+px$/);
  }
});

test('a lista de busca original continua e cada Polaroid abre o envio existente', () => {
  const home = fs.readFileSync(new URL('../client/pages/Home.jsx', import.meta.url), 'utf8');
  const component = fs.readFileSync(
    new URL('../client/components/RecipientPolaroidWall.jsx', import.meta.url), 'utf8',
  );
  const css = fs.readFileSync(
    new URL('../client/styles/recipient-polaroids.css', import.meta.url), 'utf8',
  );
  assert.match(home, /<RecipientPolaroidWall recipients=\{recipients\}\s*\/>/);
  assert.match(home, /className="recipient-grid classic-recipient-grid"/);
  assert.match(home, /people\.map\(/);
  assert.match(component, /to=\{'\/enviar\/' \+ person\.slug\}/);
  assert.match(component, /useMemo\(/);
  assert.match(component, /loading=\{index < 4 \? 'eager' : 'lazy'\}/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /prefers-reduced-motion/);
});
