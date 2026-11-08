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


// Painted-paper collage shared by the general card and recipient cards.
// Decorative details stay outside the 320..880 central WhatsApp crop.
function collageBackdrop(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, '#ffbd1e');
  bg.addColorStop(.29, '#f32272');
  bg.addColorStop(.64, '#ad218c');
  bg.addColorStop(1, '#1259cb');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);
  function strip(points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  strip([[-30, 175], [220, 132], [350, 260], [285, 480], [-20, 560]], '#ffce27');
  strip([[810, 30], [1170, -30], [1230, 195], [1090, 285], [850, 160]], '#ee2182');
  strip([[870, 455], [1230, 360], [1230, 660], [830, 660]], '#0c54bc');
  strip([[-40, 505], [160, 432], [325, 552], [320, 660], [-40, 660]], '#e81983');
  ctx.save();
  ctx.globalAlpha = .32;
  ctx.strokeStyle = '#fff9e4';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath(); ctx.moveTo(i * 28 - 20, 0); ctx.lineTo(i * 28 + 40, 190); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(925 + i * 21, 400); ctx.lineTo(955 + i * 21, 640); ctx.stroke();
  }
  ctx.restore();

  // Only abstract decoration is allowed in the wide gutters. No half-cross
  // and no lettering outside the central WhatsApp crop.
  ctx.textAlign = 'center';
  ctx.font = '900 85px Arial,sans-serif';
  ctx.fillStyle = '#fff6e8';
  ctx.fillText('♡', 1015, 180);
  ctx.fillText('✦', 240, 148);
  ctx.fillText('♡', 210, 546);
  ctx.fillText('✳', 1030, 510);
}

function crossSticker(ctx, x, y) {
  // Everything fits inside x=340..451 and y=142..360. The cross and its
  // draped cloth never touch the canvas edges or the face.
  ctx.save();
  ctx.fillStyle = '#ffd638';
  rounded(ctx, x - 9, y - 6, 113, 195, 53);
  ctx.fill();
  ctx.fillStyle = '#fffaf0';
  rounded(ctx, x + 31, y + 6, 40, 172, 8); ctx.fill();
  rounded(ctx, x + 1, y + 46, 100, 43, 8); ctx.fill();
  ctx.fillStyle = '#713212';
  rounded(ctx, x + 36, y + 11, 30, 162, 3); ctx.fill();
  rounded(ctx, x + 6, y + 51, 90, 33, 3); ctx.fill();
  ctx.fillStyle = '#fff1df';
  ctx.strokeStyle = '#e6cbb0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 60);
  ctx.lineTo(x + 22, y + 67);
  ctx.lineTo(x + 38, y + 105);
  ctx.lineTo(x + 52, y + 119);
  ctx.lineTo(x + 67, y + 109);
  ctx.lineTo(x + 89, y + 60);
  ctx.lineTo(x + 80, y + 60);
  ctx.lineTo(x + 60, y + 92);
  ctx.lineTo(x + 52, y + 98);
  ctx.lineTo(x + 43, y + 89);
  ctx.lineTo(x + 26, y + 58);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
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
  canvas.width = OG_WIDTH; canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Seu navegador não conseguiu criar a prévia social.');

  collageBackdrop(ctx);
  // A central scrapbook card: every essential element is wholly inside the
  // WhatsApp safe x=320..880, y=48..582 region, even when cropped square.
  ctx.fillStyle = '#251335';
  rounded(ctx, 317, 24, 566, 578, 23); ctx.fill();
  ctx.fillStyle = '#fff9ea';
  rounded(ctx, 326, 34, 548, 558, 17); ctx.fill();

  ctx.fillStyle = '#ffe13c';
  rounded(ctx, 342, 52, 516, 52, 10); ctx.fill();
  ctx.fillStyle = '#183a99';
  ctx.font = '900 23px "DM Sans",Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CARTINHAS · XX EJC SIMONÉSIA', 600, 86, 489);

  // The wooden cross is a complete sticker inside the actual preview crop.
  crossSticker(ctx, 347, 157);
  ctx.fillStyle = '#c61569';
  ctx.font = '900 44px Arial,sans-serif';
  ctx.fillText('♡', 799, 170);
  ctx.fillStyle = '#1c4ca5';
  ctx.fillText('✦', 801, 239);

  const portrait = await loadPortrait(photoUrl);
  const photoX = 464, photoY = 112, photoW = 272, photoH = 272;
  ctx.fillStyle = '#f1dbe8';
  rounded(ctx, photoX, photoY, photoW, photoH, 12); ctx.fill();
  if (portrait) {
    ctx.save(); rounded(ctx, photoX, photoY, photoW, photoH, 12); ctx.clip();
    cover(ctx, portrait, photoX, photoY, photoW, photoH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#bd195c';
    ctx.font = '900 142px Georgia,serif';
    ctx.fillText('♡', 600, 315);
  }
  ctx.strokeStyle = '#251335'; ctx.lineWidth = 3;
  rounded(ctx, photoX, photoY, photoW, photoH, 12); ctx.stroke();

  ctx.fillStyle = '#ffdeea';
  rounded(ctx, 342, 402, 516, 137, 12); ctx.fill();
  ctx.fillStyle = '#2c143d';
  ctx.font = '900 17px "DM Sans",Arial,sans-serif';
  ctx.fillText('PARA', 600, 430);

  const fitted = splitName(ctx, name, 475, 2);
  ctx.font = '900 ' + fitted.size + 'px "DM Sans",Arial,sans-serif';
  const firstY = fitted.lines.length === 1 ? 497 : 472;
  fitted.lines.forEach((line, index) =>
    ctx.fillText(line, 600, firstY + index * (fitted.size + 4), 476));

  // A dark-on-light footer still reads in a 1:1 iPhone link thumbnail.
  ctx.fillStyle = '#2c143d';
  ctx.font = '900 17px "DM Sans",Arial,sans-serif';
  ctx.fillText('Sua voz, suas fotos e seus adesivos.', 600, 568, 494);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) :
      reject(new Error('Não foi possível exportar a imagem PNG.')), 'image/png');
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


// Brand-wide OG card when the link points to the home rather than one encontrista.
// Rendered in the authenticated admin browser and served as PNG from R2.
export async function createDefaultOgImage() {
  try { await document.fonts.ready; } catch { /* Use bundled font fallback. */ }
  const canvas = document.createElement('canvas');
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas indisponível para prévia social.');

  collageBackdrop(ctx);
  // Paper and text entirely in the crop x=320..880.
  ctx.fillStyle = '#241532';
  rounded(ctx, 317, 24, 566, 578, 22); ctx.fill();
  ctx.fillStyle = '#fff7e8';
  rounded(ctx, 325, 33, 550, 560, 16); ctx.fill();

  ctx.fillStyle = '#ffdb31';
  rounded(ctx, 343, 52, 514, 61, 11); ctx.fill();
  ctx.fillStyle = '#163993';
  ctx.textAlign = 'center';
  ctx.font = '900 25px "DM Sans",Arial,sans-serif';
  ctx.fillText('XX EJC  ·  SIMONÉSIA', 600, 93, 486);

  // Cross is fully visible in the left half of the center card.
  crossSticker(ctx, 344, 171);

  // Distinct high-contrast headline on solid paper stickers, not pink-on-pink.
  ctx.fillStyle = '#ef287b';
  rounded(ctx, 469, 145, 388, 270, 12); ctx.fill();
  ctx.fillStyle = '#fff9e7';
  rounded(ctx, 486, 162, 355, 86, 6); ctx.fill();
  ctx.fillStyle = '#1b3990';
  ctx.font = '900 51px "DM Sans",Arial,sans-serif';
  ctx.fillText('ENVIE SUA', 664, 223, 329);

  ctx.fillStyle = '#ffe139';
  rounded(ctx, 487, 260, 354, 100, 7); ctx.fill();
  ctx.fillStyle = '#96134a';
  ctx.font = '900 63px "DM Sans",Arial,sans-serif';
  ctx.fillText('CARTINHA!', 664, 332, 333);

  ctx.fillStyle = '#fff8e5';
  ctx.font = '900 17px Arial,sans-serif';
  ctx.fillText('CARTINHAS DE AMOR.', 663, 389, 345);

  ctx.fillStyle = '#ffe1eb';
  rounded(ctx, 343, 444, 514, 105, 11); ctx.fill();
  ctx.fillStyle = '#26163b';
  ctx.font = '900 22px "DM Sans",Arial,sans-serif';
  ctx.fillText('Crie. Decore. Envie. Guarde.', 600, 485, 475);
  ctx.font = '700 17px "DM Sans",Arial,sans-serif';
  ctx.fillText('Cartas com fotos, voz e adesivos de fé.', 600, 520, 480);
  ctx.font = '900 16px "DM Sans",Arial,sans-serif';
  ctx.fillText('UMA SURPRESA PARA CADA ENCONTRISTA', 600, 579, 500);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) :
      reject(new Error('Não foi possível gerar o PNG principal.')), 'image/png');
  });
}

export async function publishDefaultOgImage() {
  const blob=await createDefaultOgImage();
  const response=await fetch('/api/admin/og/default',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'image/png'},body:blob
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Não foi possível publicar a imagem da home.');
  return data.url;
}
