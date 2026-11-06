/** Read the JSONC syntax that Wrangler and Prettier both support. */
export function parseJsonc(input) {
  let text = '';
  let quoted = false;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        text += '\n';
      } else text += ' ';
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        text += '  ';
        index += 1;
      } else text += char === '\n' ? '\n' : ' ';
      continue;
    }

    if (quoted) {
      text += char;
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') quoted = false;
      continue;
    }

    if (char === '"') {
      quoted = true;
      text += char;
    } else if (char === '/' && next === '/') {
      lineComment = true;
      text += '  ';
      index += 1;
    } else if (char === '/' && next === '*') {
      blockComment = true;
      text += '  ';
      index += 1;
    } else text += char;
  }

  if (quoted || blockComment) throw new SyntaxError('JSONC incompleto.');

  let cleaned = '';
  quoted = false;
  escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      cleaned += char;
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    if (char === ',') {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] === '}' || text[next] === ']') continue;
    }
    cleaned += char;
  }

  return JSON.parse(cleaned);
}
