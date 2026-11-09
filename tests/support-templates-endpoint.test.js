import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      const stmt = (...args) => ({
        first: async () => sql.prepare(query).get(...args) || null,
        all: async () => ({ results: sql.prepare(query).all(...args) }),
        run: async () => ({ meta: sql.prepare(query).run(...args) }),
      });
      return { ...stmt(), bind: stmt };
    },
  };
  return {
    DB,
    SESSION_SECRET: 'abcd'.repeat(24),
    ADMIN_PASSWORD: 'senha-forte-de-teste-com-14-caracteres',
    ASSETS: { fetch: async () => new Response('OK') },
  };
}

async function call(env, path, method = 'GET', data, cookie = '') {
  const headers = { ...(cookie ? { Cookie: cookie } : {}) };
  if (method !== 'GET') headers.Origin = 'https://ejc.test';
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await worker.fetch(new Request('https://ejc.test' + path, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data)
  }), env);
  return { status: response.status, data: await response.json(), headers: response.headers };
}

test('modelos de suporte são privados e persistem entre sessões administrativas', async () => {
  const env = fixture();
  const route = '/api/admin/support-templates';
  assert.equal((await call(env, route)).status, 401);
  const login = await call(env, '/api/admin/login', 'POST', { password: env.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.deepEqual((await call(env, route, 'GET', undefined, cookie)).data.templates, {});
  const source = 'Olá, {nome}! 💌\n{encontristas}\n{ids}';
  assert.equal((await call(env, route, 'PUT',
    { templates: { desculpas: source } }, cookie)).status, 200);
  const retrieved = await call(env, route, 'GET', undefined, cookie);
  assert.equal(retrieved.data.templates.desculpas, source);
  assert.doesNotMatch(JSON.stringify(retrieved.data), /pedido\/|r1_[A-F0-9]+_/);
});

test('banco rejeita links secretos e IDs reais em modelos reutilizáveis', async () => {
  const env = fixture();
  const login = await call(env, '/api/admin/login', 'POST', { password: env.ADMIN_PASSWORD });
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const route = '/api/admin/support-templates';
  const forbidden = [
    'https://ejc.migos.club/pedido/r1_123',
    'https://ejc.migos.club/checkout/SUPERSECRET',
    'Cartinha EJC-123456789ABC',
    '#token=private',
  ];
  for (const source of forbidden) {
    const response = await call(env, route, 'PUT', { templates: { desculpas: source } }, cookie);
    assert.equal(response.status, 400, source);
  }
  assert.equal((await call(env, route, 'PUT', { templates: { unknown: 'Oi' } }, cookie)).status, 400);
  assert.equal((await call(env, route, 'PUT', { templates: {} }, cookie)).status, 200);
});
