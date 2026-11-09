// Keep WhatsApp messages as real Unicode text until URLSearchParams encodes them
// exactly once. Legacy templates may contain literal escape sequences from
// earlier copy/paste or JSON imports, not real emoji characters.
const emoji = /[\p{Extended_Pictographic}\u20E3]/u;
const windows1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

function codePoint(hex) {
  const value = Number.parseInt(hex, 16);
  return value <= 0x10FFFF && !(value >= 0xD800 && value <= 0xDFFF)
    ? String.fromCodePoint(value) : null;
}

function restoreMojibakeEmoji(fragment) {
  const bytes = [];
  for (const character of fragment) {
    const point = character.codePointAt(0);
    const middle = windows1252.indexOf(character);
    if (middle !== -1) bytes.push(middle + 0x80);
    else if (point <= 255) bytes.push(point);
    else return fragment;
  }
  try {
    const restored = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    return emoji.test(restored) ? restored : fragment;
  } catch {
    return fragment;
  }
}

export function normalizeWhatsAppText(value) {
  return String(value ?? '')
    // JSON-style escaped emoji: \uD83D\uDC8C, \u{1F48C}, \U0001F48C.
    .replace(/\\u([dD][89aAbB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g,
      (sequence, high, low) => String.fromCodePoint(
        0x10000 + ((Number.parseInt(high, 16) - 0xD800) << 10) +
        (Number.parseInt(low, 16) - 0xDC00)
      ))
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\U([0-9a-fA-F]{8})/g,
      (sequence, short, long) => codePoint(short || long) ?? sequence)
    .replace(/\\u([0-9a-fA-F]{4})/g,
      (sequence, hex) => codePoint(hex) ?? sequence)
    // HTML numeric entities sometimes leak from rich-text editors.
    .replace(/&#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}));/gi,
      (sequence, hex, decimal) => {
        const point = hex ? codePoint(hex) : codePoint(Number(decimal).toString(16));
        return point && emoji.test(point) ? point : sequence;
      })
    // A previously percent-encoded emoji must not be percent-encoded twice.
    // Leave ordinary URL escapes and encrypted query strings unchanged.
    .replace(/(?:%[0-9a-fA-F]{2}){3,}/g, sequence => {
      try {
        const decoded = decodeURIComponent(sequence);
        return emoji.test(decoded) ? decoded : sequence;
      } catch {
        return sequence;
      }
    })
    // Common UTF-8 -> Windows-1252 mojibake, e.g. "ðŸ’Œ" instead of "💌".
    .replace(/ðŸ[\s\S]{2}/gu, restoreMojibakeEmoji)
    .normalize('NFC');
}

export function setWhatsAppText(url, message) {
  url.searchParams.set('text', normalizeWhatsAppText(message));
  return url;
}

export function whatsappMessageUrl({ phone = '', message = '' } = {}) {
  const url = phone
    ? new URL('https://wa.me/' + phone)
    : new URL('https://api.whatsapp.com/send');
  return setWhatsAppText(url, message).toString();
}
