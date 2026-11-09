import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSupportMessage } from '../client/lib/supportMessages.js';
import {
  customSupportTemplateSeed, renderCustomSupportTemplate, validateCustomSupportTemplate,
  loadCustomSupportTemplates, saveCustomSupportTemplates, SUPPORT_TEMPLATES_STORAGE_KEY
} from '../client/lib/supportTemplateCustomization.js';

const source=readFileSync(new URL('../client/pages/AdminSupportMessages.jsx', import.meta.url),'utf8');

test('prévia de resposta não fica vazia quando nome e encontristas ainda não foram escolhidos',()=>{
  const preview=createSupportMessage('desculpas',{preview:true,contactName:'',recipientNames:[],orders:[]});
  assert.ok(preview.length>300);
  assert.match(preview,/mil desculpas/);
  assert.match(preview,/Oi! 🥰/);
  assert.throws(()=>createSupportMessage('desculpas',{}),/Informe o nome/);
});

test('botões de copiar e WhatsApp ficam fora de condicionais que ocultem o editor',()=>{
  assert.match(source,/<textarea id="support-editor"/);
  assert.match(source,/<ClipboardCopy size={17}\/> Copiar mensagem/);
  assert.match(source,/<MessageCircle size={17}\/> Abrir WhatsApp/);
  assert.doesNotMatch(source,/\{blocked \? <div className="notice warning"/);
  assert.match(source,/window\.open\(url, '_blank'\)/);
});

test('todos os modelos podem ser visualizados com dados faltando sem inventar confirmação',()=>{
  const received=createSupportMessage('recebida',{preview:true});
  assert.ok(received.length>80);
  assert.throws(()=>createSupportMessage('recebida',{contactName:'Ana'}),/Selecione pelo menos uma cartinha/);
});

test('modelo personalizado permite variáveis e preenchimento sem repetir identidade de outro atendimento',()=>{
  const source='Oi, {primeiro_nome}! 💌\nPara: {encontristas}\n{ids}\n{site}\n{link_suporte}\n{assinatura}';
  const output=renderCustomSupportTemplate(source,{
    contactName:'Ana Maria',recipientNames:['João','Maria'],
    orders:[{id:'EJC-123456789ABC',recipient_name:'João'}],
    origin:'https://ejc.migos.club',
    secureLinks:{
      home:'https://ejc.migos.club/?c=CRYPT',
      open:'https://ejc.migos.club/abrir?c=CRYPT',
      help:'https://ejc.migos.club/ajuda/terminei-a-cartinha?c=CRYPT'
    }
  });
  assert.match(output,/Oi, Ana!/);
  assert.match(output,/João, Maria/);
  assert.match(output,/EJC-123456789ABC/);
  assert.match(output,/\/ajuda\/terminei-a-cartinha\?c=CRYPT/);
  assert.doesNotMatch(output,/\{nome\}|\{ids\}|\{assinatura\}/);
  const next=renderCustomSupportTemplate(source,{contactName:'Beatriz',recipientNames:['Pedro']});
  assert.match(next,/Oi, Beatriz!/);
  assert.doesNotMatch(next,/Ana Maria|João/);
});

test('modelo inicial pode ser personalizado e não persiste tokens ou códigos pessoais',()=>{
  const seed=customSupportTemplateSeed('desculpas');
  assert.ok(seed.length>100);
  assert.match(seed,/\{nome\}/);
  assert.match(seed,/\{encontristas\}/);
  assert.match(seed,/\{link_suporte\}/);
  assert.doesNotMatch(seed,/https:\/\/ejc\.migos\.club\/ajuda\/terminei-a-cartinha\?/);
  assert.throws(()=>validateCustomSupportTemplate('https://ejc.migos.club/pedido/r1_123456'),/Não salve links privados/);
  assert.throws(()=>validateCustomSupportTemplate('EJC-123456789ABC'),/Não salve links privados/);
});

test('modelos personalizados podem ser salvos e carregados no navegador',()=>{
  const values=new Map();
  const storage={
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,value)
  };
  saveCustomSupportTemplates(storage,{desculpas:'Oi, {nome}!'});
  assert.ok(values.get(SUPPORT_TEMPLATES_STORAGE_KEY));
  assert.deepEqual(loadCustomSupportTemplates(storage),{desculpas:'Oi, {nome}!'});
});
