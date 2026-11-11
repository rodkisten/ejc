import React, { useState } from 'react';
import { Download, Instagram, MessageCircle, Smartphone } from 'lucide-react';
import { IMAGE_FORMATS, renderLetterImages, letterFileName } from '../../lib/letterExport.js';
import { download } from '../../lib/api.js';

// Instagram has no browser API to select Feed or Stories automatically.
// The chosen canvas dimensions are exact; iOS will present the native
// share sheet, where the recipient chooses Instagram or WhatsApp.
const OPTIONS = Object.freeze({
  feed: { label: 'Instagram Feed', dimensions: '1080 × 1350 · 4:5' },
  story: { label: 'Instagram Story', dimensions: '1080 × 1920 · 9:16' },
  whatsapp: { label: 'WhatsApp', dimensions: '1080 × 1350 · 4:5', format: 'feed' },
});

export default function InstagramExportPanel({ letter, recipient }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function exportImage(target, saveOnly = false) {
    const option = OPTIONS[target];
    if (!option || busy) return;
    const format = option.format || target;
    setBusy(target);
    setError('');
    setNotice('');
    try {
      const [blob] = await renderLetterImages(letter, recipient, format);
      if (!blob) throw new Error('Não foi possível renderizar a cartinha.');
      const name = letterFileName(recipient || letter.recipient_name, format);
      const file = new File([blob], name, { type: 'image/png' });
      if (!saveOnly && navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Cartinha para ' + (recipient || letter.recipient_name),
            text: 'Uma lembrança especial do XX EJC Simonésia 💙🌹',
          });
          return;
        } catch (cause) {
          if (cause?.name === 'AbortError') return; // User dismissed the share sheet.
          // iOS can expire the user gesture while the PNG is rendered.
          // Keep the photo usable instead of ending with a blocked share dialog.
          if (cause?.name !== 'NotAllowedError' && cause?.name !== 'TypeError')
            throw cause;
        }
      }
      download(blob, name, 'image/png');
      if (!saveOnly) setNotice(
        'Imagem salva no tamanho certo! Abra o ' +
        (target === 'whatsapp' ? 'WhatsApp' : 'Instagram') +
        ' e selecione essa imagem para publicar ou enviar.'
      );
      else setNotice('Imagem salva em PNG, pronta para compartilhar.');
    } catch (cause) {
      if (cause?.name !== 'AbortError')
        setError(cause?.message || 'Não foi possível preparar a imagem.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="instagram-export" aria-label="Compartilhar cartinha no Instagram e WhatsApp">
      <span className="eyebrow">LEVE ESSE CARINHO COM VOCÊ ♡</span>
      <p className="muted small">
        Escolha a rede e o formato. O Feed usa <strong>4:5</strong> e o Story usa
        <strong> 9:16</strong>. O WhatsApp recebe uma imagem em formato retrato.
        Todas são geradas no seu aparelho, sem compartilhar o link privado.
      </p>
      <div className="instagram-export-actions">
        <button type="button" className="btn outline" disabled={!!busy}
          onClick={() => exportImage('feed')}>
          <Instagram size={18} />
          <span>{busy === 'feed' ? 'Preparando Feed…' : 'Enviar para Instagram Feed'}
            <small>{OPTIONS.feed.dimensions}</small></span>
        </button>
        <button type="button" className="btn outline" disabled={!!busy}
          onClick={() => exportImage('story')}>
          <Smartphone size={18} />
          <span>{busy === 'story' ? 'Preparando Story…' : 'Enviar para Instagram Story'}
            <small>{OPTIONS.story.dimensions}</small></span>
        </button>
        <button type="button" className="btn outline" disabled={!!busy}
          onClick={() => exportImage('whatsapp')}>
          <MessageCircle size={18} />
          <span>{busy === 'whatsapp' ? 'Preparando WhatsApp…' : 'Enviar pelo WhatsApp'}
            <small>{OPTIONS.whatsapp.dimensions}</small></span>
        </button>
      </div>
      <div className="instagram-export-actions instagram-export-downloads">
        <button type="button" className="btn ghost" disabled={!!busy}
          onClick={() => exportImage('feed', true)}>
          <Download size={16} /> Baixar Feed
        </button>
        <button type="button" className="btn ghost" disabled={!!busy}
          onClick={() => exportImage('story', true)}>
          <Download size={16} /> Baixar Story
        </button>
      </div>
      <p className="muted small">
        No iPhone, escolha Instagram ou WhatsApp na folha de compartilhamento.
        A seleção de Feed ou Story dentro do Instagram é manual. Textos muito longos
        aparecem resumidos na imagem, mas continuam completos no mural privado.
      </p>
      {notice && <p className="notice success" role="status">{notice}</p>}
      {busy && <p className="muted small" role="status">Preparando imagem {IMAGE_FORMATS[OPTIONS[busy].format || busy]?.width} px…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}
