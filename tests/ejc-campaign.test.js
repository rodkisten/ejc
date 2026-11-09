import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CAMPAIGN, letterMarkdownToHtml, renderCampaignWhatsApp } from '../shared/ejcCampaign.js';
import { normalizeComposition } from '../shared/letter.js';

test('texto da campanha conta uma história de perseverança católica e nova família',()=>{
  assert.match(DEFAULT_CAMPAIGN.markdown,/nova família/i);
  assert.match(DEFAULT_CAMPAIGN.markdown,/Não suma/);
  assert.match(DEFAULT_CAMPAIGN.markdown,/Não desapareça/);
  assert.match(DEFAULT_CAMPAIGN.markdown,/Filipenses 1,6/);
  assert.match(DEFAULT_CAMPAIGN.markdown,/Nossa Senhora/);
  assert.match(DEFAULT_CAMPAIGN.markdown,/Mini Mercado/);
  assert.equal(normalizeComposition(DEFAULT_CAMPAIGN.composition).stickers.length,4);
});

test('editor formata em HTML seguro e escapa tags arbitrárias',()=>{
  const html=letterMarkdownToHtml('## Fé & família\n\n**Permaneça** _firme_ <script>alert(1)</script> 💛');
  assert.match(html,/<h2>Fé &amp; família<\/h2>/);
  assert.match(html,/<strong>Permaneça<\/strong>/);
  assert.match(html,/<em>firme<\/em>/);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('modelo de WhatsApp substitui somente variáveis conhecidas e conserva a URL privada',()=>{
  const link='https://ejc.migos.club/mural/ana#token=m2.EXEMPLO';
  const message=renderCampaignWhatsApp(DEFAULT_CAMPAIGN.whatsapp,{
    name:'Ana Clara',url:link,count:3,
  });
  assert.match(message,/\*Ana,/);
  assert.match(renderCampaignWhatsApp('Mais {quantidade} homenagens',{name:'Ana',url:link,count:3}),/3 homenagens/);
  assert.ok(message.includes(link));
  assert.equal(message.split(link).length,2);
  assert.equal(message.includes('{link}'),false);
});
