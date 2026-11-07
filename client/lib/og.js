// Render the preview in an authenticated browser. Workers do not expose Canvas2D,
// so we upload an actual 1200x630 PNG to private R2 for social-media crawlers.
function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function loadPortrait(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = new URL(url, location.origin).toString();
  });
}

function cover(ctx, image, x, y, width, height) {
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const dw = image.naturalWidth * ratio;
  const dh = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
}

export async function createOgImage({ name, photoUrl }) {
  try {
    await document.fonts.ready;
  } catch {
    // The fallback fonts still produce a valid image.
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Não foi possível criar a imagem de compartilhamento.');

  const background = ctx.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, '#ffefdc');
  background.addColorStop(0.54, '#f9d3e5');
  background.addColorStop(1, '#e2d6fa');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.strokeStyle = 'rgba(102,58,133,.2)';
  ctx.lineWidth = 3;
  roundRect(ctx, 32, 32, 1136, 566, 32);
  ctx.stroke();

  // Decorative elements stay away from the actual information.
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath();
  ctx.arc(1140, 58, 180, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = '#693a88';
  ctx.font = '800 29px "DM Sans", Arial, sans-serif';
  ctx.fillText('✳  CARTINHAS · XX EJC SIMONÉSIA', 78, 106);

  ctx.font = '700 24px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#6c497b';
  ctx.fillText('UMA CARTINHA ESPECIAL PARA', 80, 216);

  const fullName = String(name || 'Você').trim();
  const words = fullName.split(/\s+/);
  const lines = [];
  let size = 82;
  ctx.font = `700 ${size}px "Playfair Display", Georgia, serif`;
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width > 650 && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  while (lines.length > 2 && size > 48) {
    size -= 4;
    ctx.font = `700 ${size}px "Playfair Display", Georgia, serif`;
    lines.length = 0;
    line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width > 650 && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  if (lines.length > 2) lines.splice(1, lines.length, lines.slice(1).join(' '));
  ctx.fillStyle = '#251833';
  ctx.font = `700 ${size}px "Playfair Display", Georgia, serif`;
  for (let index = 0; index < lines.length; index++) {
    let text = lines[index];
    while (ctx.measureText(text).width > 660 && text.length > 3) {
      text = text.slice(0, -2) + '…';
    }
    ctx.fillText(text, 78, 315 + index * (size + 12));
  }

  ctx.font = '500 27px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#553b65';
  ctx.fillText('Sua voz. Suas fotos. Suas palavras.', 80, 488);

  // The portrait is used only when the administration confirmed image consent.
  const portrait = await loadPortrait(photoUrl);
  ctx.save();
  roundRect(ctx, 805, 155, 312, 334, 32);
  ctx.clip();
  ctx.fillStyle = '#e8ddf7';
  ctx.fillRect(805, 155, 312, 334);
  if (portrait) {
    cover(ctx, portrait, 805, 155, 312, 334);
  } else {
    ctx.fillStyle = '#663a85';
    ctx.font = '800 120px "DM Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fullName.slice(0, 2).toUpperCase(), 961, 366);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  ctx.fillStyle = '#593576';
  ctx.font = '700 18px "DM Sans", Arial, sans-serif';
  ctx.fillText('FEITO COM AMOR POR ROD COSTA  ♡', 78, 563);
  ctx.fillText('ejc.migos.club', 918, 561);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao exportar imagem PNG.'));
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
  if (!response.ok) throw new Error(data.error || 'Falha ao publicar a imagem de compartilhamento.');
  return data.url;
}
