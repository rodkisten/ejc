import React from 'react';
import { Check, Feather, LockKeyhole, Palette } from 'lucide-react';
import { DEFAULT_COMPOSITION, FONTS, MAX_STICKERS, STICKERS, THEMES, normalizeComposition } from '../../../shared/letter.js';
import StickerPicker from './StickerPicker';

const places = [
  [27, 35, -8], [73, 66, 7], [72, 26, -3],
  [29, 70, 5], [50, 46, -6], [51, 78, 4],
];

export default function LetterControls({ composition = DEFAULT_COMPOSITION, onChange, senderName = '' }) {
  const value = normalizeComposition(composition);
  const save = (update) => onChange?.(normalizeComposition({ ...value, ...update }));
  const add = (presetId) => {
    if (value.stickers.length >= MAX_STICKERS) return;
    const index = value.stickers.length;
    const [x, y, rotate] = places[index];
    save({ stickers: [...value.stickers, {
      id: crypto.randomUUID(), presetId, x, y, rotate, scale: 1,
      color: STICKERS.find((sticker) => sticker.id === presetId).colors[0],
    }] });
  };
  function surprise() {
    const pool = value.theme === 'marian'
      ? ['nossa-senhora', 'coragem', 'joao-15-9']
      : value.theme === 'peach'
        ? ['ejc-parabens', 'floresca', 'filipenses-4-13']
        : ['ejc-parabens', 'jesus-ama', 'firme-na-fe'];
    const available = Math.min(2, MAX_STICKERS - value.stickers.length);
    if (!available) return;
    const next = pool.slice(0, available).map((presetId, offset) => {
      const [x, y, rotate] = places[value.stickers.length + offset];
      return { id: crypto.randomUUID(), presetId, x, y, rotate, scale: 1,
        color: STICKERS.find((item) => item.id === presetId).colors[0] };
    });
    save({ stickers: [...value.stickers, ...next] });
  }
  return (
    <section className="form-card letter-design-controls" aria-label="Decorar sua cartinha">
      <div className="row between">
        <div><h2>Deixe sua cartinha com a sua cara ♡</h2>
          <p className="muted small">Escolha o papel, a letra e os adesivos. Só alguns toques!</p></div>
        <Palette size={22} aria-hidden="true" />
      </div>
      <div className="letter-control-group">
        <strong>Papel</strong>
        <div className="letter-theme-choices" role="group" aria-label="Cor do papel">
          {Object.entries(THEMES).map(([id, theme]) => (
            <button key={id} type="button" className={value.theme === id ? 'chosen' : ''}
              aria-pressed={value.theme === id} onClick={() => save({ theme: id })}>
              <span className="letter-theme-swatch" style={{ background: theme.paper, borderColor: theme.edge }}>
                {value.theme === id && <Check size={17} color={theme.accent} />}
              </span>
              <span>{theme.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="letter-control-group">
        <strong><Feather size={15} /> Fonte da cartinha</strong>
        <div className="letter-font-choices" role="group" aria-label="Estilo da fonte">
          {Object.entries(FONTS).map(([id, font]) => (
            <button key={id} className={value.font === id ? 'chosen' : ''} aria-pressed={value.font === id}
              type="button" onClick={() => save({ font: id })}>
              {font.label}
            </button>
          ))}
        </div>
      </div>
      <div className="letter-control-group">
        <strong>Adesivos de carinho</strong>
        <StickerPicker count={value.stickers.length} onAdd={add} onSurprise={surprise} />
      </div>
      <div className="letter-control-group">
        <strong>Assinatura</strong>
        <label className="toggle-line">
          <input type="checkbox" checked={value.anonymous} onChange={(e) => save({ anonymous: e.target.checked })} />
          <span>Prefiro enviar sem mostrar meu nome</span>
        </label>
        {!value.anonymous && (
          <label className="letter-author-field">
            Nome para assinar (opcional)
            <input type="text" maxLength={100} placeholder={senderName || 'Com carinho, de quem te ama'}
              value={value.authorName} onChange={(e) => save({ authorName: e.target.value })} />
          </label>
        )}
      </div>
      <p className="letter-design-privacy"><LockKeyhole size={14} />
        Sua decoração e sua mensagem ficam fora do painel da coordenação.</p>
    </section>
  );
}
