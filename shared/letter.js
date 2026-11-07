// Shared by React and Cloudflare Worker. No confidential message content belongs here.
export const STICKER_CATEGORIES = Object.freeze([
  { id: 'encontro', label: 'Parabéns' },
  { id: 'coragem', label: 'Coragem' },
  { id: 'fe', label: 'Fé' },
  { id: 'palavra', label: 'Versículos' },
]);
const make = (id, category, text, shape, icon, colors, reference = '') => Object.freeze({
  id, category, text, label: text, shape, icon, colors, reference,
});
export const STICKERS = Object.freeze([
  make('ejc-parabens','encontro','Parabéns pelo XX EJC!','seal','sparkle',['lilac','peach']),
  make('encontro-abencoado','encontro','Que encontro abençoado!','ticket','cross',['cream','lilac']),
  make('lindo-com-deus','encontro','Você viveu algo lindo com Deus ✨','cloud','sparkle',['rose','cream']),
  make('ejc-em-voce','encontro','O EJC continua em você','tape','flower',['lilac','sage']),
  make('floresca','encontro','Que a fé floresça no seu coração','burst','branch',['peach','rose']),
  make('firme-na-fe','coragem','Continue firme na fé','ribbon','cross',['blue','cream']),
  make('amado-por-deus','coragem','Você é muito amado por Deus','heart','heart',['rose','lilac']),
  make('coragem','coragem','Coragem! Deus está com você','ticket','star',['sage','cream']),
  make('nao-desista','coragem','Não desista da caminhada','tape','arrow',['cream','lilac']),
  make('graca-caminho','coragem','Há graça no seu caminho','oval','sparkle',['peach','sage']),
  make('coracao-precioso','coragem','Seu coração é precioso','seal','heart',['lilac','rose']),
  make('alegria','coragem','Permaneça com alegria','burst','sun',['cream','peach']),
  make('jesus-ama','fe','Jesus te ama infinitamente','seal','sacred-heart',['rose','cream']),
  make('nossa-senhora','fe','Nossa Senhora cuide de você','medal','marian',['blue','cream']),
  make('carlo-acutis','fe','São Carlo Acutis, rogai por nós','ticket','halo',['blue','sage']),
  make('jesus-maria','fe','Tudo por Jesus, nada sem Maria','ribbon','cross',['lilac','cream']),
  make('ceu-torce','fe','O céu torce por você','burst','stars',['blue','lilac']),
  make('joao-15-9','palavra','Permanecei no meu amor.','quote','heart',['cream','rose'],'João 15,9'),
  make('filipenses-1-6','palavra','Aquele que começou em vós a boa obra há de completá-la.','quote','branch',['sage','cream'],'Filipenses 1,6'),
  make('filipenses-4-13','palavra','Tudo posso naquele que me fortalece.','burst','sparkle',['peach','lilac'],'Filipenses 4,13'),
]);
export const STICKERS_BY_ID = Object.freeze(Object.fromEntries(STICKERS.map((sticker) => [sticker.id, sticker])));
export const MAX_STICKERS = 6;
export const THEMES = Object.freeze({
  lilac: { label:'Lavanda', paper:'#fffaf4', ink:'#2d2339', accent:'#6e3d93', tint:'#f0e3f9', edge:'#ceb6e4' },
  rose: { label:'Rosa Chá', paper:'#fff8f3', ink:'#422c36', accent:'#96576d', tint:'#f7dce5', edge:'#e5c0cd' },
  marian: { label:'Azul Mariano', paper:'#f8fbff', ink:'#263951', accent:'#3f648f', tint:'#e0eaf8', edge:'#afc6e2' },
  peach: { label:'Pêssego', paper:'#fff8ed', ink:'#493027', accent:'#a66a49', tint:'#fbe3d0', edge:'#e9c5a8' },
});
export const FONTS = Object.freeze({
  editorial: { label:'Clássica', body:'Georgia, "Times New Roman", serif', display:'"Fraunces", Georgia, serif' },
  handwritten: { label:'Manuscrita', body:'"Caveat", cursive', display:'"Fraunces", Georgia, serif' },
  modern: { label:'Moderna', body:'"DM Sans", system-ui, sans-serif', display:'"Fraunces", Georgia, serif' },
});
export const STICKER_COLORS = Object.freeze({
  lilac:{bg:'#ead9fa',ink:'#502a70',edge:'#b68bd2'},
  rose:{bg:'#f9d5e4',ink:'#8c4365',edge:'#dc9aba'},
  cream:{bg:'#fff5d7',ink:'#72513c',edge:'#d8bc85'},
  peach:{bg:'#ffe0c6',ink:'#855237',edge:'#e6a77d'},
  sage:{bg:'#e1efdc',ink:'#42654a',edge:'#a3c5a2'},
  blue:{bg:'#dfeafb',ink:'#365f8b',edge:'#99b7df'},
});
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;
export const DEFAULT_COMPOSITION = Object.freeze({
  theme: 'lilac', font: 'editorial', anonymous: false, authorName: '', stickers: [],
});
export function normalizeComposition(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const used = new Set();
  const stickers = (Array.isArray(value.stickers) ? value.stickers : [])
    .slice(0, MAX_STICKERS * 3)
    .filter((s) => s && typeof s === 'object' && STICKERS_BY_ID[s.presetId])
    .map((s, index) => ({
      id: String(s.id || index).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || String(index),
      presetId: s.presetId,
      x: clamp(s.x, 8, 92, 24 + index * 10),
      y: clamp(s.y, 12, 88, 50),
      scale: clamp(s.scale, .65, 1.25, 1),
      rotate: clamp(s.rotate, -18, 18, 0),
      color: STICKER_COLORS[s.color] && STICKERS_BY_ID[s.presetId].colors.includes(s.color)
        ? s.color : STICKERS_BY_ID[s.presetId].colors[0],
    }))
    .filter((s) => !used.has(s.id) && used.add(s.id))
    .slice(0, MAX_STICKERS);
  return {
    theme: THEMES[value.theme] ? value.theme : DEFAULT_COMPOSITION.theme,
    font: FONTS[value.font] ? value.font : DEFAULT_COMPOSITION.font,
    anonymous: value.anonymous === true,
    authorName: typeof value.authorName === 'string'
      ? value.authorName.trim().slice(0, 100).replace(/[<>]/g, '') : '',
    stickers,
  };
}
export function plainLetter(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|blockquote|li|h2|h3)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}
// Pure composition rules used by the preview and image export.
export function computeLetterLayout({ html = '', photos = 0, audios = 0, stickers = 0, mode = 'letter' } = {}) {
  const characters = plainLetter(html).length;
  const media = Math.min(photos, 3) * 70 + Math.min(audios, 2) * 42 + Math.min(stickers, 6) * 18;
  const density = characters + media;
  let fontSize = density < 150 ? 29 : density < 330 ? 25 : density < 650 ? 21 : density < 1100 ? 19 : 17;
  if (mode === 'feed') fontSize = density < 220 ? 37 : density < 550 ? 30 : 25;
  if (mode === 'story') fontSize = density < 220 ? 46 : density < 550 ? 38 : 31;
  return {
    characters, density,
    fontSize, minFontSize: mode === 'letter' ? 16 : 22,
    maxFontSize: mode === 'letter' ? 34 : 56,
    lineHeight: characters > 900 ? 1.35 : 1.52,
    align: characters < 125 ? 'center' : 'left',
    photoLayout: photos > 2 ? 'grid' : photos === 1 ? 'polaroid' : 'pair',
    stickerScale: stickers > 4 ? .85 : 1,
  };
}
