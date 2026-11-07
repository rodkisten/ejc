import {
  computeLetterLayout, FONTS, normalizeComposition, plainLetter,
  STICKERS_BY_ID, STICKER_COLORS, THEMES,
} from '../../shared/letter.js';

export const IMAGE_FORMATS = Object.freeze({
  letter: { width: 1080, height: 1350, name: 'cartinha' },
  feed: { width: 1080, height: 1350, name: 'instagram-feed' },
  story: { width: 1080, height: 1920, name: 'instagram-story' },
});

const safeName = (text) => String(text || 'cartinha').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50);
const toBlob = (canvas) => new Promise((resolve, reject) =>
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao salvar o PNG.')), 'image/png'));

function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
function fontCss(size, style) {
  return `${style === 'handwritten' ? '500' : '400'} ${size}px ${FONTS[style].body}`;
}
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      line = '';
      // Very long URLs and unbroken words should not overflow the paper.
      for (const character of word) {
        if (ctx.measureText(line + character).width > maxWidth && line) {
          lines.push(line);
          line = character;
        } else line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

function drawPaper(ctx, width, height, theme, page, total) {
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, theme.tint + '66');
  wash.addColorStop(.57, '#ffffff00');
  wash.addColorStop(1, theme.tint + '77');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.edge;
  rounded(ctx, 35, 35, width - 70, height - 70, 20);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  rounded(ctx, 50, 50, width - 100, height - 100, 16);
  ctx.stroke();
  ctx.fillStyle = theme.accent;
  ctx.font = '800 22px "DM Sans",Arial,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✳  CARTINHAS · XX EJC SIMONÉSIA  ✳', width / 2, 106);
  if (total > 1) {
    ctx.font = '700 17px "DM Sans",Arial,sans-serif';
    ctx.fillText(`PÁGINA ${page + 1} DE ${total}`, width / 2, height - 76);
  }
}
function drawHeading(ctx, recipient, theme, width, y) {
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.ink;
  let name = 'Para ' + String(recipient || 'você');
  let size = 59;
  ctx.font = `700 ${size}px "Fraunces",Georgia,serif`;
  while (ctx.measureText(name).width > width - 185 && size > 30) {
    size -= 2;
    ctx.font = `700 ${size}px "Fraunces",Georgia,serif`;
  }
  ctx.fillText(name, width / 2, y, width - 185);
  ctx.fillStyle = theme.accent;
  ctx.font = '30px Georgia,serif';
  ctx.fillText('♡', width / 2, y + 45);
  ctx.strokeStyle = theme.edge;
  ctx.beginPath();
  ctx.moveTo(165, y + 65);
  ctx.lineTo(width - 165, y + 65);
  ctx.stroke();
}
function drawSignature(ctx, author, theme, width, y) {
  if (!author) return;
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.accent;
  ctx.font = 'italic 25px Georgia,serif';
  ctx.fillText('Com carinho,', width - 105, y);
  const text = String(author);
  let size = 43;
  ctx.font = `italic 700 ${size}px "Fraunces",Georgia,serif`;
  while (ctx.measureText(text).width > width - 215 && size > 24) {
    size -= 2; ctx.font = `italic 700 ${size}px "Fraunces",Georgia,serif`;
  }
  ctx.fillText(text + '  ♥', width - 105, y + 53, width - 200);
}

function stickerShape(ctx, shape, width, height) {
  const w = width / 2, h = height / 2;
  ctx.beginPath();
  if (['seal', 'medal', 'oval'].includes(shape)) {
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  } else if (shape === 'burst') {
    for (let index = 0; index < 32; index++) {
      const angle = index / 32 * Math.PI * 2 - Math.PI / 2;
      const radius = index % 2 ? .83 : 1;
      const x = Math.cos(angle) * w * radius;
      const y = Math.sin(angle) * h * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (shape === 'ribbon') {
    const points = [[-w,-h],[w,-h],[w*.82,0],[w,h],[-w,h],[-w*.82,0]];
    points.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();
  } else if (shape === 'heart') {
    ctx.moveTo(0,h);
    ctx.bezierCurveTo(-w*1.65,h*.15,-w*1.25,-h,0,-h*.44);
    ctx.bezierCurveTo(w*1.25,-h,w*1.65,h*.15,0,h);
    ctx.closePath();
  } else if (shape === 'cloud') {
    ctx.ellipse(0,0,w,h,0,0,Math.PI*2);
  } else {
    ctx.roundRect(-w,-h,width,height,shape === 'tape' ? 4 : 18);
  }
}
async function drawStickers(ctx, stickers, limit, width, height, mode) {
  const chosen = stickers.slice(0, limit);
  for (const sticker of chosen) {
    const preset = STICKERS_BY_ID[sticker.presetId];
    if (!preset) return;
    const colors = STICKER_COLORS[sticker.color] || STICKER_COLORS[preset.colors[0]];
    const scale = Math.min(1.25,Math.max(.65,sticker.scale || 1)) * .88;
    const sw = (preset.reference ? 240 : 205) * scale;
    const sh = (preset.reference ? 132 : 114) * scale;
    // The sticker band mirrors its normalized coordinates in the React preview.
    // Long letters reserve another page if photos + stickers need more room.
    const x = Math.max(135,Math.min(width - 135,95 + sticker.x / 100 * (width - 190)));
    const bandTop = mode === 'story' ? height - 510 : height - 480;
    const y = bandTop + sticker.y / 100 * 180;
    const angle = (sticker.rotate || 0) * Math.PI / 180;
    const artwork=await imageBitmap('/api/stickers/'+encodeURIComponent(preset.id)+'.png');
    if(!artwork)throw new Error('O adesivo PNG original "'+preset.text+'" ainda não foi instalado.');
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    if(artwork){
      const side=Math.max(sw,sh)*1.38;
      ctx.drawImage(artwork,-side/2,-side/2,side,side);
      artwork.close?.();
      ctx.restore();
      continue;
    }
    ctx.shadowColor = '#33224240'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fffdfa';
    stickerShape(ctx, preset.shape, sw + 15, sh + 15);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = colors.bg; ctx.strokeStyle = colors.edge; ctx.lineWidth = 2;
    stickerShape(ctx, preset.shape, sw, sh);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = colors.ink;
    ctx.textAlign = 'center';
    ctx.font = '800 20px "DM Sans",Arial,sans-serif';
    const icons = {cross:'✝',heart:'♡',marian:'M',sparkle:'✦',stars:'✧',star:'✦',flower:'✿',branch:'❧','sacred-heart':'♥',halo:'✧',arrow:'➜',sun:'☼'};
    ctx.fillText(icons[preset.icon] || '✦', 0, -sh / 2 + 29);
    ctx.font = '700 15px "Fraunces",Georgia,serif';
    const rows = wrapLines(ctx, preset.text, sw - 22).slice(0, 4);
    let ty = -((rows.length - 1) * 17) / 2 + 10;
    for (const row of rows) { ctx.fillText(row, 0, ty); ty += 17; }
    if (preset.reference) {
      ctx.font = '700 11px "DM Sans",Arial,sans-serif';
      ctx.fillText(preset.reference, 0, sh / 2 - 10);
    }
    ctx.restore();
  }
}

async function imageBitmap(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch { /* SVG Safari fallback */ } }
    return await new Promise((resolve) => {
      const image = new Image();
      const src = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(src); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(src); resolve(null); };
      image.src = src;
    });
  } catch { return null; }
}

function drawPhoto(ctx, bitmap, x, y, width, height) {
  const iw = bitmap.width || bitmap.naturalWidth;
  const ih = bitmap.height || bitmap.naturalHeight;
  if (!iw || !ih) return;
  const ratio = Math.max(width / iw, height / ih);
  const sw = width / ratio, sh = height / ratio;
  const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  ctx.save();
  ctx.shadowColor = '#34203844'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 11, y - 11, width + 22, height + 28);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(bitmap, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

export async function renderLetterImages(letter, recipient, mode = 'letter') {
  const options = IMAGE_FORMATS[mode] || IMAGE_FORMATS.letter;
  const { width, height } = options;
  const composition = normalizeComposition(letter?.composition);
  const theme = THEMES[composition.theme];
  const layout = computeLetterLayout({
    html: letter?.rich_html, photos: letter?.media?.filter((m) => m.kind === 'image').length || 0,
    audios: letter?.media?.filter((m) => m.kind === 'audio').length || 0,
    stickers: composition.stickers.length, mode,
  });
  const text = plainLetter(letter?.rich_html || '') || 'Uma mensagem especial para você.';
  const social = mode !== 'letter';
  const photos = (letter?.media || []).filter((m) => m.kind === 'image');
  const author = composition.anonymous ? '' :
    (composition.authorName || (letter?.sender_name === 'Uma pessoa especial' ? '' : letter?.sender_name) || '');
  try { await document.fonts.ready; } catch {}

  const probe = document.createElement('canvas').getContext('2d');
  let fontSize = social ? (mode === 'story' ? 47 : 38) : Math.max(26, Math.min(44, layout.fontSize + 13));
  // Reserve a bottom band for stickers, pictures and the signature.
  // Text on full letters flows onto additional pages rather than being clipped.
  const decorated = photos.length > 0 || composition.stickers.length > 0 || (letter?.media || []).some((m) => m.kind === 'audio');
  const maxLines = social
    ? mode === 'story' ? composition.stickers.length ? 17 : 23
      : composition.stickers.length ? 9 : 13
    : decorated ? 10 : 17;
  const maxWidth = social && photos.length ? 590 : width - 210;
  let lines = [];
  if (social) {
    for (; fontSize >= 27; fontSize -= 2) {
      probe.font = fontCss(fontSize, composition.font);
      lines = wrapLines(probe, text, maxWidth);
      if (lines.length <= maxLines) break;
    }
  } else {
    probe.font = fontCss(fontSize, composition.font);
    lines = wrapLines(probe, text, maxWidth);
  }
  if (!lines.length) lines = [''];
  const truncated = social && lines.length > maxLines;
  if (truncated) {
    lines = lines.slice(0, maxLines - 1);
    lines.push('…');
  }
  const groups = social ? [lines] : Array.from({ length: Math.ceil(lines.length / maxLines) || 1 },
    (_, i) => lines.slice(i * maxLines, (i + 1) * maxLines));
  if (!social && photos.length && composition.stickers.length && lines.length > 4) {
    // A decorated photograph deserves a separate art page if body text would overlap it.
    groups.push([]);
  }
  const contentPages = groups.length;
  // Every photo is retained in the full-letter PNG export, not only in the ZIP.
  if (!social) {
    for (let index = 1; index < photos.length; index += 4) {
      groups.push({ gallery: photos.slice(index, index + 4) });
    }
  }
  const outputs = [];
  for (let page = 0; page < groups.length; page++) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Não foi possível criar a imagem neste navegador.');
    drawPaper(ctx, width, height, theme, page, groups.length);
    drawHeading(ctx, recipient || letter?.recipient_name, theme, width, social ? 193 : 188);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = 'left';
    const gallery = !Array.isArray(groups[page]) ? groups[page].gallery : null;
    if (gallery) {
      ctx.textAlign = 'center';
      ctx.fillStyle = theme.accent;
      ctx.font = '700 35px "Fraunces",Georgia,serif';
      ctx.fillText('Outras lembranças ♡', width / 2, 265);
      for (const [index, photo] of gallery.entries()) {
        const bitmap = await imageBitmap(photo.url);
        if (!bitmap) continue;
        const x = index % 2 === 0 ? 135 : 555;
        const y = index < 2 ? 330 : 760;
        drawPhoto(ctx, bitmap, x, y, 360, 345);
        bitmap.close?.();
      }
      outputs.push(await toBlob(canvas));
      continue;
    }
    const group = groups[page];
    const maxBodyHeight = social ? (mode === 'story' ? 1110 : composition.stickers.length ? 500 : 650)
      : (decorated ? 520 : 805);
    let size = fontSize;
    const fitLines = group;
    const availableLines = Math.max(1, fitLines.length);
    size = Math.min(size, Math.floor(maxBodyHeight / (availableLines * 1.42)));
    size = Math.max(23, size);
    ctx.font = fontCss(size, composition.font);
    const lineHeight = size * 1.42;
    const textHeight = lineHeight * group.length;
    const firstY = social ? 355 : 330;
    const textY = firstY + Math.max(0, Math.min(130, (maxBodyHeight - textHeight) / 4));
    for (let index = 0; index < group.length; index++) ctx.fillText(group[index], 108, textY + index * lineHeight);
    const isLast = page === contentPages - 1;
    if (isLast) {
      const hasMedia = photos.length > 0;
      if (hasMedia) {
        const bitmap = await imageBitmap(photos[0].url);
        if (bitmap) {
          const px = width - 355;
          const py = social
            ? mode === 'story' ? height - 660 : 490
            : composition.stickers.length ? height - 645 : height - 405;
          drawPhoto(ctx, bitmap, px, py, 220, 170);
          bitmap.close?.();
        }
      }
      await drawStickers(ctx, composition.stickers, social ? 3 : 6, width, height, mode);
      if ((letter?.media || []).some((m) => m.kind === 'audio')) {
        ctx.fillStyle = theme.accent; ctx.textAlign = 'left';
        ctx.font = '700 20px "DM Sans",Arial,sans-serif';
        ctx.fillText('♫ Mensagem de voz incluída', 115, height - 146);
      }
      drawSignature(ctx, author, theme, width, height - 155);
      if (truncated) {
        ctx.textAlign = 'center'; ctx.fillStyle = theme.accent;
        ctx.font = '700 20px "DM Sans",Arial,sans-serif';
        ctx.fillText('Prévia da cartinha · texto completo no mural privado', width / 2, height - 94);
      }
    }
    outputs.push(await toBlob(canvas));
  }
  return outputs;
}
export const letterFileName = (recipient, format, page = 0) =>
  `${IMAGE_FORMATS[format]?.name || 'cartinha'}-${safeName(recipient)}${page ? '-pagina-' + (page + 1) : ''}.png`;
