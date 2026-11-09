import test from 'node:test';
import assert from 'node:assert/strict';
import { adminStatistics } from '../src/statistics.js';

function mockDb() {
  const queries = [];
  const DB = {
    prepare(sql) {
      queries.push(sql);
      return {
        first: async () => ({}),
        all: async () => ({ results: [] })
      };
    }
  };
  return { DB, queries };
}

test('estatísticas administrativas consultam apenas agregados e não expõem cartinhas privadas', async () => {
  const env = mockDb();
  const stats = await adminStatistics(env);
  assert.equal(stats.period.timezone, 'America/Sao_Paulo');
  assert.equal(stats.daily.length, 0);
  assert.equal(stats.recipients.ranking.length, 0);
  assert.equal(env.queries.length, 13);
  for (const sql of env.queries) {
    assert.doesNotMatch(sql, /\b(sender_name|rich_html|message|composition_json|pix_payload|token_hash|email_encrypted|object_key|payer_name)\b/i);
  }
  assert.doesNotMatch(JSON.stringify(stats), /sender_name|rich_html|token_hash/);
});

test('compras com várias cartinhas entram somente uma vez na apuração do Pix', async () => {
  const env = mockDb();
  await adminStatistics(env);
  const query = env.queries.find(sql => sql.startsWith('WITH payments AS (') && sql.includes('AS revenue_cents'));
  assert.ok(query, 'a consulta de receita deve usar a origem consolidada de pagamentos');
  assert.match(query, /FROM checkouts c/);
  assert.match(query, /WHERE o\.checkout_id IS NULL/);
  assert.match(query, /o\.demo=0 AND o\.campaign_key IS NULL/);
  assert.match(query, /c\.status/);
  assert.match(query, /UNION ALL/);
});

test('filtros de datas são aplicados ao período e rankings usam apenas nomes de encontristas', async () => {
  const env = mockDb();
  const stats = await adminStatistics(env, { from: '2026-11-01', to: '2026-11-09' });
  assert.equal(stats.period.from, '2026-11-01');
  assert.equal(stats.period.to, '2026-11-09');
  const financial = env.queries.find(sql => sql.includes('AS revenue_cents'));
  const ranking = env.queries.find(sql => sql.includes('FROM recipients r LEFT JOIN orders o'));
  assert.match(financial, /2026-11-01/);
  assert.match(financial, /2026-11-09/);
  assert.match(ranking, /r\.name/);
  assert.doesNotMatch(ranking, /o\.sender_name/);
});