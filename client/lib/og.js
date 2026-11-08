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

  // Wooden crucifix and little paper-sticker details.
  ctx.save();
  ctx.translate(125, 300);
  ctx.rotate(-.08);
  ctx.fillStyle = '#fff8e9';
  rounded(ctx, -33, -116, 72, 275, 8); ctx.fill();
  rounded(ctx, -105, -55, 220, 65, 7); ctx.fill();
  ctx.fillStyle = '#73310f';
  rounded(ctx, -26, -108, 58, 258, 4); ctx.fill();
  rounded(ctx, -97, -48, 204, 51, 4); ctx.fill();
  ctx.fillStyle = '#fff1df';
  strip([[-80, -37], [-43, -30], [-2, 24], [40, 39], [83, -34], [64, -12],
    [33, 60], [-3, 73], [-48, 6], [-80, -14]], '#fff1df');
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '900 93px Arial,sans-serif';
  ctx.fillStyle = '#fff7eb';
  ctx.fillText('♡', 1004, 170);
  ctx.fillText('✝', 1045, 380);
  ctx.fillText('✦', 260, 148);
  ctx.fillText('♡', 225, 560);
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

  // Same bright scrapbook identity as the A4 poster, with a central safe area.
  collageBackdrop(ctx);

  // Big off-centre labels frame the collage without becoming necessary to read.
  ctx.save();
  ctx.translate(36, 108);
  ctx.rotate(-.16);
  ctx.font = '900 100px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#552c80';
  ctx.fillText('XX', 0, 0);
  ctx.fillStyle = '#8f548f';
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
  ctx.fillStyle = '#fff2ce';
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

  ctx.fillStyle = '#e5dcfb';
  rounded(ctx, 342, 51, 516, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#17182C';
  ctx.font = '900 21px "DM Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CARTINHAS · XX EJC SIMONÉSIA  ✳', 600, 86, 478);

  const portrait = await loadPortrait(photoUrl);
  // The portrait is a true 1:1 crop everywhere, including OG and WhatsApp.
  const photoX = 464, photoY = 112, photoW = 272, photoH = 272;
  ctx.fillStyle = '#e7d9ef';
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
  ctx.fillStyle = '#f7e0ec';
  rounded(ctx, 342, 404, 516, 134, 11);
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
  ctx.fillStyle = '#552c80'; ctx.fillText('ENVIE', 0, 0);
  ctx.fillStyle = '#9d4d83'; ctx.fillText('CARINHO.', -10, 62);
  ctx.restore();
  ctx.fillStyle = '#d09ad7';
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


// Brand-wide OG card when the link points to the home rather than one encontrista.
// Rendered in the authenticated admin browser and served as PNG from R2.
export async function createDefaultOgImage() {
  try { await document.fonts.ready; } catch { /* Local font fallback. */ }
  const canvas = document.createElement('canvas');
  canvas.width = OG_WIDTH;
  canvas.height = OG_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas indisponível para prévia social.');

  collageBackdrop(ctx);
  // Content essential to WhatsApp stays wholly within x=320..880,
  // even when the wide OG is cropped to its central square.
  ctx.fillStyle = '#411b64';
  rounded(ctx, 314, 22, 572, 586, 24); ctx.fill();
  ctx.fillStyle = '#fff4de';
  rounded(ctx, 322, 30, 556, 570, 19); ctx.fill();

  ctx.fillStyle = '#ffcb21';
  rounded(ctx, 345, 52, 510, 62, 8); ctx.fill();
  ctx.fillStyle = '#1748a4';
  ctx.font = '900 26px Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('XX EJC  ·  SIMONÉSIA', 600, 93, 478);

  ctx.save();
  ctx.translate(600, 304);
  ctx.rotate(-.035);
  ctx.fillStyle = '#ec2275';
  rounded(ctx, -249, -165, 498, 291, 16); ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.font = 'italic 900 76px Arial,sans-serif';
  ctx.fillText('ENVIE SUA', 0, -69, 468);
  ctx.fillStyle = '#ffd52a';
  ctx.font = 'italic 900 91px Arial,sans-serif';
  ctx.fillText('CARTINHA!', 0, 41, 470);
  ctx.fillStyle = '#fff5e2';
  ctx.font = '900 23px Arial,sans-serif';
  ctx.fillText('CARTINHAS DE AMOR.', 0, 95, 465);
  ctx.restore();

  ctx.fillStyle = '#fff0c6';
  rounded(ctx, 345, 454, 510, 98, 12); ctx.fill();
  ctx.fillStyle = '#552a62';
  ctx.font = '900 22px Arial,sans-serif';
  ctx.fillText('Crie. Decore. Envie. Guarde.', 600, 491, 472);
  ctx.font = '700 17px Arial,sans-serif';
  ctx.fillText('Cartas com fotos, voz e adesivos de fé.', 600, 522, 475);
  ctx.font = '900 16px Arial,sans-serif';
  ctx.fillStyle = '#d71e72';
  ctx.fillText('UMA SURPRESA PARA CADA ENCONTRISTA', 600, 582, 490);

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
