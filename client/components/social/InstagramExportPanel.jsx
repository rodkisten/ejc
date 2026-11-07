import React, { useState } from 'react';
import { Download, Image as ImageIcon, Smartphone, Share2 } from 'lucide-react';
import { renderLetterImages, letterFileName } from '../../lib/letterExport.js';
import { download } from '../../lib/api.js';

export default function InstagramExportPanel({ letter, recipient }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function exportImage(format, shareFile = false) {
    setBusy(format);
    setError('');
    try {
      const [blob] = await renderLetterImages(letter, recipient, format);
      const file = new File([blob], letterFileName(recipient || letter.recipient_name, format), {
        type: 'image/png',
      });
      if (shareFile && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Cartinha para ${recipient || letter.recipient_name}`,
          text: 'Uma lembrança especial do XX EJC 💜',
        });
      } else {
        download(blob, file.name, 'image/png');
      }
    } catch (cause) {
      if (cause.name !== 'AbortError') setError(cause.message || 'Não foi possível gerar a imagem.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="instagram-export" aria-label="Exportar cartinha para Instagram">
      <span className="eyebrow">COMPARTILHE UMA LEMBRANÇA ♡</span>
      <p className="muted small">
        A imagem é criada neste aparelho. Mensagens longas aparecem como trecho
        no feed ou story; a cartinha completa continua no mural privado.
      </p>
      <div className="instagram-export-actions">
        <button type="button" className="btn outline" disabled={!!busy} onClick={() => exportImage('feed', true)}>
          <ImageIcon size={16} /> {busy === 'feed' ? 'Gerando...' : 'Feed · 1080 × 1350'}
        </button>
        <button type="button" className="btn outline" disabled={!!busy} onClick={() => exportImage('story', true)}>
          <Smartphone size={16} /> {busy === 'story' ? 'Gerando...' : 'Story · 1080 × 1920'}
        </button>
      </div>
      <p className="muted small">O compartilhamento abre os aplicativos disponíveis no seu iPhone. Não publicamos nada automaticamente.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}
