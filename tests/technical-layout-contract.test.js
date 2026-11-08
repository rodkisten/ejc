import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('painel imprime 10 QRs reais por folha e CSS encaixa exatamente no A4', () => {
  const admin = read('../client/pages/Admin.jsx');
  const mini = read('../client/components/MiniQrCard.jsx');
  const css = read('../client/styles/mini-qr-cards.css');
  const qr = read('../client/components/QrCode.jsx');
  assert.match(admin, /Array\.from\(\{ length: 10 \}/);
  assert.match(admin, /MiniQrCard key=\{index\}/);
  assert.match(mini, /<QrCode value=\{value\} size=\{160\} variant="print"/);
  assert.match(qr, /print: \{ fgColor: '#111111'/);
  assert.match(qr, /logoImage=\{isPrint \? undefined/);
  assert.match(css, /grid-template-columns:repeat\(2,95mm\)/);
  assert.match(css, /grid-template-rows:repeat\(5,53mm\)/);
  assert.match(css, /gap:4mm/);
  assert.match(css, /width:194mm/);
  assert.match(css, /height:281mm/);
  assert.match(css, /@page \{ size:A4 portrait; margin:8mm; \}/);
});

test('prévia técnica só aparece com chave de ativação e solicita senha de servidor', () => {
  const admin = read('../client/pages/AdminLetters.jsx');
  const preview = read('../client/components/TechnicalLetterPreview.jsx');
  const worker = read('../src/worker.js');
  assert.match(admin, /get\('secret'\) === '000000'/);
  assert.match(admin, /type="password"/);
  assert.match(admin, /technicalMode && technicalPassword/);
  assert.match(preview, /method: 'POST'/);
  assert.match(preview, /password/);
  assert.match(preview, /URL\.revokeObjectURL/);
  assert.match(worker, /await requireAdmin\(req,env\)/);
  assert.match(worker, /env\.TECH_PREVIEW_SECRET\.length < 20/);
  assert.match(worker, /await requireTechnicalPreview\(req,env,/);
  assert.match(worker, /'Cache-Control': 'no-store'/);
  assert.match(worker, /if\(path==='\/api\/admin\/cartinhas'/);
});
