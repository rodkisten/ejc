import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowOpenMuralButton,
  shouldShowCartButton,
  shouldShowBackButton,
} from '../client/lib/muralNavigation.js';

test('oculta os botões do mural, carrinho e voltar ao desbloquear ou visualizar o mural', () => {
  for (const path of ['/abrir', '/abrir/', '/mural/joao-pedro', '/mural/joao-pedro/']) {
    assert.equal(shouldShowOpenMuralButton(path), false, path);
    assert.equal(shouldShowCartButton(path), false, path);
    assert.equal(shouldShowBackButton(path), false, path);
  }
});

test('mantém os botões fora do mural, com voltar somente nas páginas internas', () => {
  for (const path of ['/enviar/joao-pedro', '/carrinho', '/pedido/privado', '/checkout/privado', '/admin']) {
    assert.equal(shouldShowOpenMuralButton(path), true, path);
    assert.equal(shouldShowCartButton(path), true, path);
    assert.equal(shouldShowBackButton(path), true, path);
  }
  assert.equal(shouldShowOpenMuralButton('/'), true);
  assert.equal(shouldShowCartButton('/'), true);
  assert.equal(shouldShowBackButton('/'), false);
});
