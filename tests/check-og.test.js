import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractOg, readPngDimensions, checkOg } from '../scripts/check-og.mjs';

test('extrai as tags renderizadas e detecta imagens OG duplicadas', () => {
  const html = `<head>
    <meta property="og:image" content="https://ejc.migos.club/og-ejc-default.png">
    <meta property="og:image" content="https://ejc.migos.club/extra.png">
    <meta property="og:title" content="Cartinhas">
  </head>`;
  const meta = extractOg(html);
  assert.equal(meta.duplicates, 2);
  assert.equal(meta.title, 'Cartinhas');
});

test('verifica dimensões reais do PNG padrão', () => {
  const buffer = fs.readFileSync(new URL('../public/og-ejc-default.png', import.meta.url));
  assert.deepEqual(readPngDimensions(buffer), { width: 600, height: 315 });
});

test('verifica HTML + PNG com respostas locais simulando o WhatsApp', async () => {
  const bytes = fs.readFileSync(new URL('../public/og-ejc-default.png', import.meta.url));
  let requests = 0;
  const fakeFetch = async (url) => {
    requests += 1;
    if (requests === 1) {
      return new Response(`<html><head>
        <meta property="og:title" content="Para Ana Clara">
        <meta property="og:description" content="Envie uma cartinha">
        <meta property="og:url" content="https://ejc.migos.club/enviar/ana-clara?og=v2">
        <meta property="og:image" content="https://ejc.migos.club/og-ejc-default.png">
        <meta property="og:image:width" content="600">
        <meta property="og:image:height" content="315">
      </head></html>`, {
        status: 200, headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(bytes, {
      status: 200, headers: { 'Content-Type': 'image/png' },
    });
  };
  const checked = await checkOg('https://ejc.migos.club/enviar/ana-clara', fakeFetch);
  assert.equal(requests, 2);
  assert.equal(checked.dimensions.width, 600);
  assert.equal(checked.dimensions.height, 315);
});

test('bloqueia imagem que devolve HTML em vez de PNG', async () => {
  let requests = 0;
  const fakeFetch = async () => {
    requests += 1;
    if (requests === 1) return new Response(`<html><head>
      <meta property="og:title" content="Para Ana">
      <meta property="og:description" content="Carta">
      <meta property="og:url" content="https://ejc.migos.club">
      <meta property="og:image" content="https://ejc.migos.club/og.png">
    </head></html>`, { headers: { 'Content-Type': 'text/html' } });
    return new Response('<html>Cloudflare Access</html>', { headers: { 'Content-Type': 'text/html' } });
  };
  await assert.rejects(() => checkOg('https://ejc.migos.club', fakeFetch), /image\/png/);
});
