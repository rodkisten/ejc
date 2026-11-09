import { completedLetterHelpLink } from './helpLink.js';
import { createSupportMessage, SUPPORT_MESSAGE_TEMPLATES, supportRecipientNames, validContactName } from './supportMessages.js';

export const SUPPORT_TEMPLATES_STORAGE_KEY = 'ejc-admin-support-custom-templates-v1';
export const SUPPORT_TEMPLATE_FIELDS = [
  '{nome}', '{primeiro_nome}', '{encontristas}', '{ids}',
  '{site}', '{mural}', '{link_suporte}', '{link_continuacao}', '{assinatura}'
];
const KNOWN = new Set(SUPPORT_MESSAGE_TEMPLATES.map(item => item.id));
const DEFAULT_ORIGIN = 'https://ejc.migos.club';

export function loadCustomSupportTemplates(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(SUPPORT_TEMPLATES_STORAGE_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([id, source]) =>
      KNOWN.has(id) && typeof source === 'string' && source.length <= 12000
    ));
  } catch {
    return {};
  }
}

export function saveCustomSupportTemplates(storage, templates) {
  if (!storage) throw new Error('Este navegador não permite salvar os modelos.');
  storage.setItem(SUPPORT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

// Never store an actual private continuation link, ID, or buyer details in a reusable model.
// Those belong to the one-off composed message, not in a persistent template.
export function validateCustomSupportTemplate(source) {
  const text = String(source || '').trim();
  if (!text) throw new Error('Escreva o texto do modelo antes de salvá-lo.');
  if (text.length > 12000) throw new Error('O modelo pode ter até 12 mil caracteres.');
  if (/\/(?:pedido|checkout)\/|#token|r1_[A-F0-9]{12}_|EJC-[A-F0-9]{12}/i.test(text))
    throw new Error('Não salve links privados ou IDs reais no modelo. Use {link_continuacao} ou {ids}.');
  return text;
}

export function customSupportTemplateSeed(id) {
  if (!KNOWN.has(id)) throw new Error('Modelo desconhecido.');
  const sample = createSupportMessage(id, {
    contactName: '{nome}',
    recipientNames: ['{encontristas}'],
    recipients: [],
    orders: id === 'recebida'
      ? [{ id: 'EJC-AAAAAAAAAAAA', recipient_name: '{encontristas}', status: 'paid', submitted: true }]
      : [],
    origin: DEFAULT_ORIGIN,
    resumeUrl: '{link_continuacao}',
    preview: true
  });
  const generic = sample
    .replace(/https:\/\/ejc\.migos\.club\/ajuda\/terminei-a-cartinha[^\s]+/g, '{link_suporte}')
    .replace(/https:\/\/ejc\.migos\.club\/abrir[^\s]*/g, '{mural}')
    .replace(/https:\/\/ejc\.migos\.club\/enviar\/[^\s]+/g, '{site}')
    .replace(/https:\/\/ejc\.migos\.club\/\?[^\s]+/g, '{site}')
    .replace(/EJC-AAAAAAAAAAAA/g, '{ids}');
  return generic.includes('{ids}') ? generic : generic + '\n\n📋 *Referências:*\n{ids}';
}

export function renderCustomSupportTemplate(source, {
  contactName = '', recipientNames = [], orders = [], origin = DEFAULT_ORIGIN, resumeUrl = ''
} = {}) {
  const names = supportRecipientNames(recipientNames);
  const name = validContactName(contactName) ? String(contactName).trim() : '';
  const references = orders.filter(order => /^EJC-[A-F0-9]{12}$/.test(order.id || '')).slice(0, 20);
  const site = new URL('/', origin);
  site.searchParams.set('utm_source', 'whatsapp');
  site.searchParams.set('utm_medium', 'mensagem');
  site.searchParams.set('utm_campaign', 'suporte_cartinhas');
  const mural = new URL('/abrir', origin);
  mural.searchParams.set('utm_source', 'whatsapp');
  mural.searchParams.set('utm_medium', 'mensagem');
  mural.searchParams.set('utm_campaign', 'suporte_cartinhas');
  const fields = {
    nome: name || 'pessoa querida',
    primeiro_nome: name ? name.split(/\s+/)[0] : 'pessoa querida',
    encontristas: names.join(', ') || 'encontristas',
    ids: references.map(order => '• ' + order.id + ' · ' + String(order.recipient_name || '').trim()).join('\n') || 'Não informados',
    site: site.toString(),
    mural: mural.toString(),
    link_suporte: completedLetterHelpLink({
      sender: name, origin, campaign: 'suporte_cartinhas',
      items: references.map(order => ({ id: order.id, recipient_name: order.recipient_name || '' }))
    }),
    link_continuacao: String(resumeUrl || '').trim() || '(solicite seu link privado à equipe)',
    assinatura: '*Com carinho,*\n🌹 *Equipe do Mini Mercado*\n*XX EJC Simonésia* 💛'
  };
  return String(source || '').replace(/\{(nome|primeiro_nome|encontristas|ids|site|mural|link_suporte|link_continuacao|assinatura)\}/g,
    (_, field) => fields[field]);
}
