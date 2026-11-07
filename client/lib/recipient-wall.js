// Stable, varied avatar colors: searching, filtering and reloading must not
// reshuffle a person's appearance. No random values during React rendering.
export const AVATAR_COLORS = Object.freeze([
  { background: '#f9d6e9', foreground: '#81325e', border: '#e7a9ca' },
  { background: '#d8eafb', foreground: '#285c8b', border: '#a2cbea' },
  { background: '#e9defb', foreground: '#603d92', border: '#c9b0ea' },
  { background: '#ffe6b7', foreground: '#82520d', border: '#ecc66e' },
  { background: '#d8f0e1', foreground: '#246a4a', border: '#a7d9bd' },
  { background: '#ffd9cb', foreground: '#8a4734', border: '#eeae99' },
  { background: '#d8e9f2', foreground: '#36587d', border: '#a9cddf' },
  { background: '#f6dcf5', foreground: '#843d83', border: '#e4b7e2' },
  { background: '#f0e4be', foreground: '#71571c', border: '#dac786' },
  { background: '#d8eee9', foreground: '#2e7465', border: '#a3d7cd' },
  { background: '#ede0d5', foreground: '#75513c', border: '#dac1ad' },
  { background: '#dfe0fa', foreground: '#45478d', border: '#b6b8e7' },
]);
export function avatarColor(person) {
  const key = String(person?.id || person?.slug || person?.name || '');
  let hash = 2166136261;
  for (const letter of key) {
    hash ^= letter.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];
}
export function avatarInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || '?')
    .toLocaleUpperCase('pt-BR');
}
function normalize(text) {
  return String(text || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').trim();
}
export function visibleRecipients(recipients, search = '') {
  const query = normalize(search);
  return [...(recipients || [])]
    .filter(person => person && person.active !== 0 && normalize(person.name).includes(query))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' }));
}
