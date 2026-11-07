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

  // Portrait-first editorial design. Keep name and face inside the WhatsApp safe crop.
  const gradient = ctx.createLinearGradient(0, 0, OG_WIDTH, OG_HEIGHT);
  gradient.addColorStop(0, '#1635CE');
  gradient.addColorStop(.48, '#EC4B83');
  gradient.addColorStop(1, '#FFB32C');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT);

  ctx.save();
  ctx.globalAlpha = .23;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  for (let x = -60; x < OG_WIDTH + 140; x += 58) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 180, OG_HEIGHT); ctx.stroke();
  }
  ctx.restore();

  // Big off-centre labels frame the collage without becoming necessary to read.
  ctx.save();
  ctx.translate(36, 108);
  ctx.rotate(-.16);
  ctx.font = '900 100px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#FAFF70';
  ctx.fillText('XX', 0, 0);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 73px "DM Sans", Arial, sans-serif';
  ctx.fillText('EJC!', 0, 79);
  ctx.restore();

  ctx.save();
  ctx.translate(945, 150); ctx.rotate(.14);
  ctx.fillStyle = '#191722';
  rounded(ctx, -30, -38, 226, 94, 10);
  ctx.fill();
  ctx.font = '900 42px "DM Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FAFC75';
  ctx.fillText('EJC • MG', 83, 7, 200);
  ctx.restore();

  // Central block must survive a square preview crop of 1200 x 630.
  ctx.save();
  ctx.fillStyle = '#151326';
  rounded(ctx, 317, 25, 566, 574, 23);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  rounded(ctx, 327, 35, 546, 554, 17);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#FFF03A';
  rounded(ctx, 342, 51, 516, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#17182C';
  ctx.font = '900 21px "DM Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CARTINHAS · XX EJC SIMONÉSIA  ✳', 600, 86, 478);

  const portrait = await loadPortrait(photoUrl);
  const photoX = 342, photoY = 114, photoW = 516, photoH = 284;
  ctx.fillStyle = '#89DBEB';
  rounded(ctx, photoX, photoY, photoW, photoH, 12);
  ctx.fill();
  if (portrait) {
    ctx.save();
    rounded(ctx, photoX, photoY, photoW, photoH, 12);
    ctx.clip();
    cover(ctx, portrait, photoX, photoY, photoW, photoH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#BE316C';
    ctx.font = '900 146px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('♡', 600, 320);
  }
  ctx.strokeStyle = '#151326';
  ctx.lineWidth = 3;
  rounded(ctx, photoX, photoY, photoW, photoH, 12);
  ctx.stroke();

  // Text stays below portrait rather than covering the face.
  ctx.fillStyle = '#F6DFF0';
  rounded(ctx, 342, 412, 516, 126, 11);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#25162A';
  ctx.font = '900 15px "DM Sans", Arial, sans-serif';
  ctx.fillText('PARA', 600, 437);
  const personName = String(name || 'Você').trim().replace(/\s+/g, ' ');
  const segments = personName.split(' ');
  let nameLines = [personName];
  let nameFont = 52;
  for (let size = 52; size >= 24; size -= 2) {
    ctx.font = '900 ' + size + 'px "DM Sans", Arial, sans-serif';
    let first = '', second = '';
    if (ctx.measureText(personName).width <= 485) {
      nameLines = [personName]; nameFont = size; break;
    }
    for (const part of segments) {
      const candidate = first ? first + ' ' + part : part;
      if (!second && ctx.measureText(candidate).width <= 480) first = candidate;
      else second = second ? second + ' ' + part : part;
    }
    if (first && second && ctx.measureText(first).width <= 480 &&
      ctx.measureText(second).width <= 480) {
      nameLines = [first,second]; nameFont = size; break;
    }
    if (size === 24) {
      const available = personName.slice(0, 42);
      nameLines = [available.length < personName.length ? available + '…' : available];
      nameFont = 24;
    }
  }
  ctx.font = '900 ' + nameFont + 'px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#25162A';
  const firstY = nameLines.length === 1 ? 501 : 472;
  nameLines.forEach((line,index) => ctx.fillText(line, 600, firstY + index * (nameFont + 3), 486));

  ctx.fillStyle = '#25162A';
  ctx.font = '800 16px "DM Sans", Arial, sans-serif';
  ctx.fillText('Sua voz, suas fotos e seus adesivos.', 600, 567, 480);

  // Details outside central safe zone only.
  ctx.save(); ctx.translate(960, 500); ctx.rotate(-.12);
  ctx.font = '900 61px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#FFFFFF'; ctx.fillText('ENVIE', 0, 0);
  ctx.fillStyle = '#FAFF70'; ctx.fillText('CARINHO.', -10, 62);
  ctx.restore();
  ctx.fillStyle = '#FAFF70';
  ctx.beginPath(); ctx.moveTo(116, 385); ctx.lineTo(147, 437); ctx.lineTo(208, 445);
  ctx.lineTo(157, 479); ctx.lineTo(143, 539); ctx.lineTo(109, 487);
  ctx.lineTo(54, 461); ctx.lineTo(110, 441); ctx.closePath(); ctx.fill();

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
