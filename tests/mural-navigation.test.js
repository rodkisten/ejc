import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowOpenMuralButton } from '../client/lib/muralNavigation.js';

test('oculta Abrir meu mural na página de desbloqueio e no mural privado já aberto', () => {
  for (const path of ['/abrir', '/abrir/', '/mural/joao-pedro', '/mural/joao-pedro/']) {
    assert.equal(shouldShowOpenMuralButton(path), false, path);
  }
});

test('mantém acesso ao mural nas demais páginas', () => {
  for (const path of ['/', '/enviar/joao-pedro', '/carrinho', '/pedido/privado', '/checkout/privado', '/admin']) {
    assert.equal(shouldShowOpenMuralButton(path), true, path);
  }
});
