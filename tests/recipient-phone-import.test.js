import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipientName, parseRecipientPhoneCsv, previewRecipientPhoneImport } from '../client/lib/recipientPhoneImport.js';
const people=[
 {id:'1',name:'Maria dos Santos',whatsapp_phone:''},
 {id:'2',name:'João da Silva',whatsapp_phone:'5533999990002'},
];
test('normaliza acentos e lê CSV com BOM e ponto-e-vírgula',()=>{
 assert.equal(normalizeRecipientName('  MÁRIA   dos Sántos '),'maria dos santos');
 const rows=parseRecipientPhoneCsv('\uFEFFnome;telefone;circulo;status\nMaria dos Santos;(33) 99999-0001;Laranja;conferido\nJoao da Silva;33999990003;Amarelo;revisar');
 assert.equal(rows.length,2);
 assert.equal(rows[1].review,true);
 const preview=previewRecipientPhoneImport(rows,people);
 assert.equal(preview[0].phone,'5533999990001');
 assert.equal(preview[0].status,'ready');
 assert.equal(preview[1].status,'review');
 assert.equal(previewRecipientPhoneImport(rows,people,{includeReview:true})[1].status,'existing');
 assert.equal(previewRecipientPhoneImport(rows,people,{includeReview:true,overwrite:true})[1].status,'ready');
});
test('não altera nomes não encontrados sem mapeamento explícito',()=>{
 const rows=parseRecipientPhoneCsv('nome,telefone,status\nPessoa Desconhecida,33999990004,conferido');
 assert.equal(previewRecipientPhoneImport(rows,people)[0].status,'unmatched');
 assert.equal(previewRecipientPhoneImport(rows,people,{mappings:{0:'1'}})[0].person.id,'1');
});
test('evita sobrescrever repetição e rejeita telefones inválidos',()=>{
 const rows=parseRecipientPhoneCsv('nome;telefone\nMaria dos Santos;33999990001\nMaria dos Santos;33999990004\nJoao da Silva;1234');
 const preview=previewRecipientPhoneImport(rows,people);
 assert.deepEqual(preview.map(x=>x.status),['ready','duplicate','invalid']);
 assert.throws(()=>parseRecipientPhoneCsv('coluna;outra\na;b'),/Cabeçalho/);
 assert.throws(()=>parseRecipientPhoneCsv('nome;telefone\nMaria;"abc'),/aspas/);
});
