// Real PNG rendered in the authenticated admin browser, then stored in private R2.
// Keep ALL essential content within x=320..880: WhatsApp may centre-crop 1200x630
// link previews to a square thumbnail (the visible crop is approximately x=285..915).
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_SAFE = Object.freeze({ left: 320, top: 48, right: 880, bottom: 582 });

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function cover(ctx, image, x, y, width, height) {
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const dw = image.naturalWidth * ratio;
  const dh = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
}

async function loadPortrait(url) {
  if (!url) return null;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(
      'Não foi possível carregar a foto do encontrista. Tente atualizar a imagem.',
    ));
    image.src = new URL(url, window.location.origin).toString();
  });
}

function splitName(ctx, name, availableWidth, maxLines) {
  const words = String(name || 'Você').trim().replace(/\s+/g, ' ').split(' ');
  for (let size = 46; size >= 24; size -= 2) {
    ctx.font = `700 ${size}px "Playfair Display", Georgia, serif`;
    const lines = [];
    let current = '';
    for (const word of words) {
      const next = current ? current + ' ' + word : word;
      if (ctx.measureText(next).width > availableWidth && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= availableWidth)) {
      return { size, lines };
    }
  }
  ctx.font = '700 24px "Playfair Display", Georgia, serif';
  const lines = [];
  let current = '';
  for (const word of words) {
    let safeWord = word;
    while (ctx.measureText(safeWord).width > availableWidth && safeWord.length > 2) {
      safeWord = safeWord.slice(0, -2) + '…';
    }
    const next = current ? current + ' ' + safeWord : safeWord;
    if (ctx.measureText(next).width > availableWidth && current) {
      lines.push(current);
      current = safeWord;
    } else current = next;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const rest = lines.splice(maxLines - 1).join(' ');
    let trimmed = rest;
    while (ctx.measureText(trimmed + '…').width > availableWidth && trimmed.length > 1) {
      trimmed = trimmed.slice(0, -1);
    }
    lines.push(trimmed + '…');
  }
  return { size: 24, lines };
}

export async function createOgImage({ name, photoUrl }) {
  try { await document.fonts.ready; } catch { /* Native font fallback is acceptable. */ }

  const canvas = document.createElement('canvas');
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Seu navegador não conseguiu criar a prévia social.');

  const gradient = ctx.createLinearGradient(0, 0, OG_WIDTH, OG_HEIGHT);
  gradient.addColorStop(0, '#fff0de');
  gradient.addColorStop(.58, '#f9dbe8');
  gradient.addColorStop(1, '#e9ddfb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  // Anything beyond this central card is decorative only.
  const { left, top, right, bottom } = OG_SAFE;
  ctx.fillStyle = '#fffaf5';
  rounded(ctx, left, top, right - left, bottom - top, 30);
  ctx.fill();
  ctx.strokeStyle = '#d7b8df';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#eddfec';
  ctx.lineWidth = 1.5;
  rounded(ctx, left + 14, top + 14, right - left - 28, bottom - top - 28, 22);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6d4089';
  ctx.font = '800 19px "DM Sans",Arial,sans-serif';
  ctx.fillText('✳  CARTINHAS  ·  XX EJC SIMONÉSIA  ✳', 600, 106, 490);

  ctx.fillStyle = '#6a5972';
  ctx.font = '700 15px "DM Sans",Arial,sans-serif';
  ctx.fillText('UMA CARTINHA ESPECIAL PARA', 600, 156, 480);

  const portrait = await loadPortrait(photoUrl);
  const hasPortrait = !!portrait;
  const x = hasPortrait ? 355 : 370;
  const maxWidth = hasPortrait ? 265 : 460;
  const { size, lines } = splitName(ctx, name, maxWidth, hasPortrait ? 3 : 3);
  ctx.fillStyle = '#302037';
  ctx.textAlign = hasPortrait ? 'left' : 'center';
  ctx.font = `700 ${size}px "Playfair Display",Georgia,serif`;
  const lineHeight = size * 1.18;
  const firstLineY = Math.max(255, 313 - (lines.length - 1) * lineHeight / 2);
  lines.forEach((line, index) => {
    ctx.fillText(line, hasPortrait ? x : 600, firstLineY + index * lineHeight, maxWidth);
  });

  if (hasPortrait) {
    const photoX = 660, photoY = 195, photoW = 182, photoH = 232;
    ctx.save();
    rounded(ctx, photoX, photoY, photoW, photoH, 17);
    ctx.clip();
    ctx.fillStyle = '#e8d9f4';
    ctx.fillRect(photoX, photoY, photoW, photoH);
    cover(ctx, portrait, photoX, photoY, photoW, photoH);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    rounded(ctx, photoX, photoY, photoW, photoH, 17);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#74478e';
    ctx.font = '38px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('♡', 600, 404);
  }

  ctx.strokeStyle = '#ddcae2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(385, 460);
  ctx.lineTo(815, 460);
  ctx.stroke();

  ctx.fillStyle = '#624e69';
  ctx.textAlign = 'center';
  ctx.font = '600 21px "DM Sans",Arial,sans-serif';
  ctx.fillText('Sua voz, suas fotos, suas palavras.', 600, 501, 445);
  ctx.fillStyle = '#81518f';
  ctx.font = '800 14px "DM Sans",Arial,sans-serif';
  ctx.fillText('EJC · SIMONÉSIA · MG', 600, 547, 440);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível exportar a imagem PNG.'));
    }, 'image/png');
  });
}

export async function publishOgImage(person) {
  const blob = await createOgImage({ name: person.name, photoUrl: person.photo_url });
  const response = await fetch(`/api/admin/recipients/${person.id}/og`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível publicar a imagem social.');
  return data.url;
}
