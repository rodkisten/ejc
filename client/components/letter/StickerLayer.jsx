import React, { useRef, useState } from 'react';
import { Minus, Plus, RotateCw, Trash2 } from 'lucide-react';
import { Sticker } from './Sticker';

export default function StickerLayer({ composition, editable = false, onUpdate, onRemove }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const stickers = composition?.stickers || [];

  function onStart(event, sticker) {
    if (!editable || !stageRef.current) return;
    dragRef.current = { id: sticker.id };
    setSelected(sticker.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onMove(event) {
    if (!editable || !dragRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const padX = Math.max(22, (80 / Math.max(rect.width, 1)) * 100);
    const padY = 25;
    const x = Math.min(100 - padX, Math.max(padX, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100 - padY, Math.max(padY, ((event.clientY - rect.top) / rect.height) * 100));
    onUpdate?.(dragRef.current.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }

  function keyboard(event, sticker) {
    if (!editable) return;
    const steps = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] };
    if (!steps[event.key]) return;
    event.preventDefault();
    const [dx, dy] = steps[event.key];
    onUpdate?.(sticker.id, {
      x: Math.min(78, Math.max(22, sticker.x + dx)),
      y: Math.min(78, Math.max(22, sticker.y + dy)),
    });
  }

  const current = stickers.find((s) => s.id === selected);
  if (!stickers.length && !editable) return null;
  return (
    <div className="letter-sticker-area">
      <div className="letter-sticker-board" ref={stageRef} aria-label="Adesivos da cartinha">
        {stickers.map((sticker) => (
          <div
            key={sticker.id}
            role={editable ? 'button' : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={editable ? 'Mover adesivo. Use as setas do teclado ou arraste.' : undefined}
            aria-pressed={editable ? selected === sticker.id : undefined}
            className={`letter-placed-sticker ${editable ? 'is-editable' : ''} ${selected === sticker.id && editable ? 'is-selected' : ''}`}
            style={{
              left: `${sticker.x}%`, top: `${sticker.y}%`,
              transform: `translate(-50%, -50%) rotate(${sticker.rotate}deg) scale(${sticker.scale})`,
            }}
            onPointerDown={(event) => onStart(event, sticker)}
            onPointerMove={onMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={(event) => keyboard(event, sticker)}
            onClick={() => { if (editable) setSelected(sticker.id); }}
          >
            <Sticker presetId={sticker.presetId} color={sticker.color} small />
          </div>
        ))}
        {!stickers.length && editable && (
          <p className="letter-sticker-empty">Escolha um adesivo para decorar este cantinho ♡</p>
        )}
      </div>
      {editable && current && (
        <div className="letter-sticker-edit-controls" aria-label="Editar adesivo selecionado">
          <button type="button" aria-label="Diminuir adesivo" onClick={() => onUpdate?.(current.id, { scale: Math.max(.65, current.scale - .1) })}><Minus size={16} /></button>
          <button type="button" aria-label="Aumentar adesivo" onClick={() => onUpdate?.(current.id, { scale: Math.min(1.25, current.scale + .1) })}><Plus size={16} /></button>
          <button type="button" aria-label="Girar adesivo" onClick={() => onUpdate?.(current.id, { rotate: current.rotate >= 12 ? -12 : current.rotate + 6 })}><RotateCw size={16} /></button>
          <button type="button" aria-label="Remover adesivo" onClick={() => { onRemove?.(current.id); setSelected(null); }}><Trash2 size={16} /></button>
        </div>
      )}
    </div>
  );
}
