// Shared defaults contain no participant data or private letters.
export const CAMPAIGN_KEY = 'pos-encontro';
export const CAMPAIGN_SENDER = 'Mini Mercado XX EJC Simonésia';
export const DEFAULT_CAMPAIGN = Object.freeze({
  key: CAMPAIGN_KEY,
  title: 'Uma nova família para continuar a caminhada 💌',
  markdown: [
    '## 🌻 O encontro terminou. A nossa história, não.',
    '',
    'Oi, coração querido do **XX EJC Simonésia**! 💛',
    '',
    'Imagine uma estrada no fim da tarde. Um grupo de jovens caminha sem saber direito o que vai encontrar. Alguns chegam cheios de perguntas; outros trazem medos escondidos, silêncios que ninguém percebe e sonhos que quase desistiram de sonhar. Até que, no meio do caminho, uma luz acende. Alguém oferece um abraço. Outro estende a mão. Uma oração vira coragem. E, sem alarde, Deus começa a fazer morada em cada coração. 🕊️',
    '',
    'Foi assim que uma história bonita começou. Não porque tudo tenha ficado perfeito de repente, mas porque vocês descobriram que **não precisam caminhar sozinhos**.',
    '',
    'Talvez o XX EJC tenha sido aquele abraço de que você precisava. Talvez tenha sido a resposta a uma oração antiga. Talvez você ainda nem consiga explicar o que sentiu. Algumas sementes de Deus florescem devagar. 🌱',
    '',
    'Mas há algo que queremos te pedir com todo o carinho do mundo:',
    '',
    '**Não suma. Não desapareça. Não deixe essa chama virar apenas uma lembrança bonita.** 🔥',
    '',
    'Volte para a comunidade. Participe da missa. Procure seus novos amigos. Reze mesmo quando faltar vontade. Faça perguntas. Sirva. Chore, ria, recomece. E, quando alguém do grupo também estiver distante, seja você a pessoa que manda a primeira mensagem: “Ei, estamos sentindo sua falta!” 🫂',
    '',
    'Porque o encontro não foi a linha de chegada. **Foi o primeiro capítulo.** Agora começa a aventura mais bonita: perseverar quando os dias forem comuns, quando a fé pedir coragem e quando a vida não tiver trilha sonora de retiro.',
    '',
    '**Você ganhou uma nova família.** Uma família que vai te reconhecer pelo nome, rezar por você, celebrar suas vitórias e te lembrar de Jesus nos dias difíceis. Há lugar para você aqui. Sempre. ⛪💗',
    '',
    'E quando o coração vacilar, guarde esta promessa:',
    '',
    '_“Aquele que começou em vós a boa obra há de levá-la à perfeição.”_',
    '**Filipenses 1,6**',
    '',
    'Que Nossa Senhora caminhe ao seu lado e que Jesus faça dessa amizade recém-nascida uma história de fé para muitos e muitos anos. 🌹✝️',
    '',
    '**Parabéns pelo seu encontro!** Que ele tenha sido lindo, cheio da presença de Deus, e que o amor vivido nele nunca se transforme em saudade de algo que acabou, mas em força para tudo o que ainda vem. ✨',
    '',
    '**A gente espera você. Não desapareça, combinado?** 💛',
    '',
    'Com carinho, oração e esperança,',
    '**Mini Mercado · XX EJC Simonésia** 💌',
    '_Rodolfo Costa, Evelyne Pimentel, Tia Mariana e Tio Saulinho, Tia Daisy e Tio Davidson_',
  ].join('\n'),
  whatsapp: [
    '💌✨ *{nome}, o XX EJC terminou... mas sua história está só começando!*',
    '',
    '🌻 O Mini Mercado preparou uma cartinha especial sobre fé, perseverança e essa *nova família* que você ganhou no encontro. 💛',
    '',
    '*Não suma. Não desapareça. Não deixe essa chama apagar!* 🔥',
    '',
    '🫂 A comunidade é sua casa. Seus novos amigos estão de braços abertos. Jesus continua caminhando com você!',
    '',
    '📖 _“Aquele que começou em vós a boa obra há de levá-la à perfeição.”_',
    '*Filipenses 1,6*',
    '',
    '🌹 Que Nossa Senhora te acompanhe. A gente espera você na caminhada!',
    '',
    '💝 *Sua carta especial e todas as mensagens de carinho estão neste mural pessoal:*',
    '{link}',
    '',
    '_Com carinho, Mini Mercado XX EJC Simonésia_ ✝️💛',
    '',
    '🔐 _Este link é pessoal. Não compartilhe. Se o mural ainda estiver fechado, aguarde o horário de liberação._',
  ].join('\n'),
  composition: {
    theme: 'peach', font: 'editorial', anonymous: false,
    authorName: 'Mini Mercado XX EJC Simonésia',
    stickers: [
      { id: 'mini-1', presetId: 'ejc-em-voce', x: 28, y: 18, rotate: -8, scale: .9, color: 'lilac' },
      { id: 'mini-2', presetId: 'firme-na-fe', x: 75, y: 38, rotate: 7, scale: .9, color: 'blue' },
      { id: 'mini-3', presetId: 'nossa-senhora', x: 24, y: 68, rotate: -5, scale: .85, color: 'blue' },
      { id: 'mini-4', presetId: 'filipenses-1-6', x: 73, y: 82, rotate: 4, scale: .9, color: 'sage' },
    ],
  },
});

export function letterMarkdownToHtml(markdown) {
  const encode=(value)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const inline=(line)=>encode(line).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g,'<em>$1</em>');
  return String(markdown||'').trim().split(/\n\s*\n/g).map(block=>{
    const lines=block.trim().split('\n').filter(Boolean);
    if(!lines.length)return '';
    if(lines.length===1&&lines[0].startsWith('## '))return '<h2>'+inline(lines[0].slice(3))+'</h2>';
    if(lines.length===1&&lines[0].startsWith('### '))return '<h3>'+inline(lines[0].slice(4))+'</h3>';
    return '<p>'+lines.map(inline).join('<br>')+'</p>';
  }).filter(Boolean).join('\n');
}

export function renderCampaignWhatsApp(template,{name,url,count=0}) {
  const first=String(name||'').trim().split(/\s+/)[0]||'encontrista';
  const replacements={nome:first,link:String(url||''),quantidade:String(Number(count)||0)};
  return String(template||'').replace(/\{(nome|link|quantidade)\}/g,(_,key)=>replacements[key]);
}
