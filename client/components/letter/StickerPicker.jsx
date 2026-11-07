import React, { useEffect, useState } from 'react';
import { Heart, Sparkles, X } from 'lucide-react';
import { MAX_STICKERS, STICKERS, STICKER_CATEGORIES } from '../../../shared/letter.js';
import { Sticker } from './Sticker';

export default function StickerPicker({ count = 0, onAdd, onSurprise }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('encontro');
  const [available, setAvailable] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAvailable(null); setLoadError('');
    fetch('/api/stickers').then(async response => {
      if(!response.ok) throw new Error('Não foi possível carregar as artes PNG.');
      return response.json();
    }).then(data => {
      if(!cancelled) setAvailable(new Set(data.stickers||[]));
    }).catch(error => {
      if(!cancelled){ setAvailable(new Set()); setLoadError(error.message); }
    });
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', escape);
    return () => { cancelled = true; document.removeEventListener('keydown', escape); };
  }, [open]);
  const full = count >= MAX_STICKERS;
  return (
    <>
      <div className="sticker-picker-actions">
        <button className="btn outline" type="button" onClick={() => setOpen(true)}>
          <Heart size={16} /> Adesivos ({count}/{MAX_STICKERS})
        </button>
        <button className="btn ghost" type="button" onClick={() => onSurprise?.([...(available || [])])}
          disabled={full || !available?.size}>
          <Sparkles size={16} /> Surpreenda-me
        </button>
      </div>
      {open && (
        <div className="sticker-picker-scrim" role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="sticker-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="sticker-picker-title">
            <div className="sticker-picker-heading">
              <div>
                <span className="eyebrow">FEITOS COM CARINHO ♡</span>
                <h3 id="sticker-picker-title">Escolha seu adesivo</h3>
                <p className="muted small">Um toque para colar. Depois, arraste na cartinha.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar adesivos"><X /></button>
            </div>
            <div className="sticker-picker-tabs" role="tablist" aria-label="Categorias de adesivos">
              {STICKER_CATEGORIES.map((item) => (
                <button
                  type="button" role="tab" key={item.id} aria-selected={item.id === category}
                  onClick={() => setCategory(item.id)} className={item.id === category ? 'active' : ''}
                >{item.label}</button>
              ))}
            </div>
            {loadError&&<p role="alert" className="notice error">{loadError}</p>}
            {available===null&&<p className="muted small">Carregando adesivos originais...</p>}
            {available?.size===0&&<p className="notice">As artes PNG originais ainda não foram instaladas pela coordenação. Volte em breve.</p>}
            <div className="sticker-picker-grid">
              {STICKERS.filter((sticker) => sticker.category === category && available?.has(sticker.id)).map((preset) => (
                <button
                  key={preset.id} type="button" className="ejc-sticker-preview"
                  disabled={full} aria-label={`Colar adesivo: ${preset.text}`}
                  onClick={() => { onAdd(preset.id); setOpen(false); }}
                >
                  <Sticker presetId={preset.id} />
                </button>
              ))}
            </div>
            {available?.size>0&&!STICKERS.some(sticker=>sticker.category===category&&available.has(sticker.id))&&
              <p className="muted small">Nenhum PNG desta categoria foi instalado ainda.</p>}
            <p className="sticker-picker-limit">
              {full ? 'Sua cartinha já tem seis adesivos. Remova um para trocar.' :
                `Você pode adicionar mais ${MAX_STICKERS - count} adesivo(s).`}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
