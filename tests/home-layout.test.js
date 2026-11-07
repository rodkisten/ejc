import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AVATAR_COLORS, avatarColor, avatarInitials, visibleRecipients,
} from '../client/lib/recipient-wall.js';

test('o mural mostra todos os encontristas, sem paginação ou limite de 18', () => {
  const people = Array.from({ length: 157 }, (_, i) => ({
    id: String(i), slug: 'pessoa-' + i, name: 'Encontrista ' + String(i).padStart(3, '0'),
  }));
  const all = visibleRecipients(people);
  assert.equal(all.length, 157);
  assert.equal(new Set(all.map(person => person.id)).size, 157);
  const home = fs.readFileSync(new URL('../client/pages/Home.jsx', import.meta.url), 'utf8');
  assert.match(home, /people\.map\(/);
  assert.doesNotMatch(home, /visibleCount|setVisibleCount|slice\(0,\s*18\)|Mostrar mais encontristas/);
  assert.doesNotMatch(home, /recipient-grid/); // One wall, not two duplicate lists.
});

test('cores dos avatares parecem aleatórias, mas são estáveis ao pesquisar', () => {
  assert.equal(AVATAR_COLORS.length, 12);
  const people = Array.from({ length: 80 }, (_, index) => ({
    id: 'enc-' + index, name: 'Encontrista ' + index,
  }));
  const tones = new Set(people.map(person => avatarColor(person).background));
  assert.ok(tones.size >= 8);
  const color = avatarColor(people[17]);
  assert.deepEqual(avatarColor({ ...people[17] }), color);
  assert.deepEqual(avatarColor(visibleRecipients(people, '17')[0]), color);
  assert.ok(/^#[0-9a-f]{6}$/i.test(color.background));
  assert.ok(/^#[0-9a-f]{6}$/i.test(color.foreground));
});

test('nomes longos e acentuados são encontrados sem cortar resultados', () => {
  const people = [
    { id: 'a', name: 'Isabelle Vitória de Oliveira Alves' },
    { id: 'b', name: 'Iasmín Maria das Graças de Cristo Ribeiro' },
    { id: 'c', name: 'Hellen Cristina da Silva' },
  ];
  assert.deepEqual(visibleRecipients(people, 'VITORIA').map(p => p.id), ['a']);
  assert.deepEqual(visibleRecipients(people, 'gracas').map(p => p.id), ['b']);
  assert.deepEqual(visibleRecipients(people, 'cristina').map(p => p.id), ['c']);
  assert.deepEqual(visibleRecipients(people, '').map(p => p.id), ['c', 'b', 'a']);
  assert.equal(avatarInitials('Hellen Cristina da Silva'), 'HS');
  assert.equal(avatarInitials('Maria'), 'MA');
});

test('CSS da home tem contenção da arte, bordas e breakpoints para Safari móvel', () => {
  const css = fs.readFileSync(new URL('../client/styles/home.css', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../client/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /import '\.\/styles\/home\.css'/);
  for (const selector of [
    '.ejc-new-hero', '.ejc-hero-letters', '.ejc-hero-paper-main',
    '.ejc-portrait-wall', '.ejc-polaroid', '.ejc-polaroid-photo',
    '.ejc-mural-search', '.ejc-recipient-mural',
  ]) assert.ok(css.includes(selector), selector + ' não tem estilo');
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /border:\s*2px solid var\(--avatar-edge/);
});
