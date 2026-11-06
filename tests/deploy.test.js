import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseJsonc } from '../scripts/parse-jsonc.mjs';

test('deploy script parses and uses device authorization instead of localhost callback', () => {
  const script = fs.readFileSync('scripts/deploy.sh', 'utf8');
  const check = spawnSync('bash', ['-n', 'scripts/deploy.sh'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(script, /login --device --browser=false/);
  assert.match(script, /npm run check/);
  assert.match(script, /npm run build/);
  assert.match(script, /d1 migrations apply/);
  assert.match(script, /secret put ADMIN_PASSWORD/);
});

test('deploy keeps account database IDs outside tracked wrangler.jsonc', () => {
  const config = parseJsonc(fs.readFileSync('wrangler.jsonc', 'utf8'));
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  const script = fs.readFileSync('scripts/deploy.sh', 'utf8');
  assert.match(
    config.d1_databases[0].database_id,
    /^(?:SUBSTITUIR_PELO_ID_D1|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  assert.match(gitignore, /^\.wrangler\.deploy\.jsonc$/m);
  assert.match(script, /CONFIG=\.wrangler\.deploy\.jsonc/);
  assert.match(script, /EJC_PUBLIC_URL/);
});

test('JSONC parser handles comments, trailing commas and URL strings', () => {
  const parsed = parseJsonc(`{
    // Cloudflare configuration
    "vars": {"PUBLIC_ORIGIN": "https://ejc.migos.club",},
    "assets": ["dist",],
    /* Safe inline comment */
  }`);
  assert.equal(parsed.vars.PUBLIC_ORIGIN, 'https://ejc.migos.club');
  assert.deepEqual(parsed.assets, ['dist']);
});
