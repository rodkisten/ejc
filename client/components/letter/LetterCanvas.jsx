import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { cleanHtml } from '../RichEditor';
import { computeLetterLayout, FONTS, normalizeComposition, THEMES } from '../../../shared/letter.js';
import StickerLayer from './StickerLayer';

function AdaptiveBody({ html, layout, font }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let disposed = false;
    const fit = () => {
      if (disposed || !node.isConnected) return;
      const max = layout.maxFontSize;
      const min = layout.minFontSize;
      let px = layout.fontSize;
      const available = Math.max(148, Math.min(380, window.innerHeight * .38));
      // Adjust to reduce awkward empty space, without ever truncating long letters.
      for (let iteration = 0; iteration < 13; iteration++) {
        node.style.fontSize = px + 'px';
        const height = node.scrollHeight;
        if (height > available && px > min) px = Math.max(min, px - 1);
        else if (height < available * .62 && px < max) px = Math.min(max, px + 1);
        else break;
      }
      node.style.fontSize = px + 'px';
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(node.parentElement);
    document.fonts?.ready?.then(fit).catch(() => {});
    fit();
    return () => { disposed = true; observer?.disconnect(); };
  }, [html, layout.fontSize, layout.minFontSize, layout.maxFontSize, font]);
  return (
    <div ref={ref} className="letter-content letter-adaptive-body"
      style={{ fontFamily: font, textAlign: layout.align, lineHeight: layout.lineHeight }}
      dangerouslySetInnerHTML={{ __html: cleanHtml(html) }}
    />
  );
}

export default function LetterCanvas({ letter, recipient, editable = false, onCompositionChange }) {
  const composition = normalizeComposition(letter?.composition);
  const theme = THEMES[composition.theme], font = FONTS[composition.font];
  const media = letter?.media || [];
  const images = media.filter((m) => m.kind === 'image');
  const audios = media.filter((m) => m.kind === 'audio');
  const layout = useMemo(() => computeLetterLayout({
    html: letter?.rich_html, photos: images.length, audios: audios.length,
    stickers: composition.stickers.length,
  }), [letter?.rich_html, images.length, audios.length, composition.stickers.length]);
  const author = composition.anonymous ? '' :
    (composition.authorName || (letter?.sender_name === 'Uma pessoa especial' ? '' : letter?.sender_name) || '');
  const update = (id, patch) => onCompositionChange?.({
    ...composition, stickers: composition.stickers.map((sticker) =>
      sticker.id === id ? { ...sticker, ...patch } : sticker),
  });
  const remove = (id) => onCompositionChange?.({
    ...composition, stickers: composition.stickers.filter((sticker) => sticker.id !== id),
  });
  return (
    <article className={`letter-paper letter-paper--designed letter-paper--${composition.theme}`}
      style={{
        '--letter-paper': theme.paper, '--letter-ink': theme.ink,
        '--letter-accent': theme.accent, '--letter-tint': theme.tint,
        '--letter-edge': theme.edge, '--letter-display-font': font.display,
      }}
    >
      <div className="letter-paper-stamp">✳ XX EJC SIMONÉSIA ✳</div>
      <h2 className="letter-paper-heading">Para {recipient || letter?.recipient_name} <span>♡</span></h2>
      <div className="letter-paper-rule" />
      <AdaptiveBody html={letter?.rich_html || ''} layout={layout} font={font.body} />
      {!!images.length && (
        <div className={`letter-photos letter-photos--${images.length === 1 ? 'single' : 'grid'}`}>
          {images.map((image, i) => (
            <div className="letter-photo-frame" key={image.id || i}>
              <img src={image.url} alt={`Foto ${i + 1} enviada junto da cartinha`} loading="lazy" />
            </div>
          ))}
        </div>
      )}
      {!!audios.length && (
        <div className="letter-audio-mark">
          <span>♫</span> {audios.length === 1 ? 'Uma mensagem de voz para guardar' : `${audios.length} mensagens de voz para guardar`}
        </div>
      )}
      <StickerLayer composition={composition} editable={editable} onUpdate={update} onRemove={remove} />
      {author && (
        <div className="letter-paper-author">
          <span>Com carinho,</span>
          <strong>{author}</strong><span aria-hidden="true">♥</span>
        </div>
      )}
      <div className="letter-paper-bottom">Feito com carinho · XX EJC Simonésia</div>
    </article>
  );
}
