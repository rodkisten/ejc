import React, { useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { dragSquareCrop, drawSquarePhoto, exportSquarePhoto } from '../lib/squarePhoto';

export default function SquarePhotoEditor({ person, file, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError('Escolha uma imagem de até 15 MB.');
      return;
    }
    let cancelled = false;
    const source = URL.createObjectURL(file);
    const portrait = new Image();
    portrait.onload = () => {
      if (!cancelled) {
        setImage(portrait);
        setZoom(1);
        setPosition({ x: 0.5, y: 0.5 });
      }
    };
    portrait.onerror = () => {
      if (!cancelled) setError('Não foi possível abrir essa foto. Escolha JPEG, PNG ou uma foto compatível com o iPhone.');
    };
    portrait.src = source;
    return () => {
      cancelled = true;
      portrait.onload = null;
      portrait.onerror = null;
      URL.revokeObjectURL(source);
    };
  }, [file]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    try {
      drawSquarePhoto(image, canvasRef.current, zoom, position);
    } catch (cause) {
      setError(cause.message);
    }
  }, [image, zoom, position]);

  useEffect(() => {
    const keydown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [busy, onCancel]);

  function onPointerDown(event) {
    if (!image || busy) return;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    const start = pointerRef.current;
    if (!start || start.id !== event.pointerId || !image || busy) return;
    const width = canvasRef.current?.getBoundingClientRect().width || 360;
    setPosition(dragSquareCrop(
      image.naturalWidth, image.naturalHeight,
      zoom, start.position,
      event.clientX - start.x, event.clientY - start.y,
      width,
    ));
    event.preventDefault();
  }

  function stopDrag(event) {
    if (pointerRef.current?.id === event.pointerId) pointerRef.current = null;
  }

  function moveWithKeyboard(event) {
    if (!image) return;
    const steps = {
      ArrowLeft: [12, 0], ArrowRight: [-12, 0],
      ArrowUp: [0, 12], ArrowDown: [0, -12],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    setPosition(dragSquareCrop(
      image.naturalWidth, image.naturalHeight, zoom, position,
      step[0], step[1], canvasRef.current?.getBoundingClientRect().width || 360,
    ));
  }

  async function save() {
    if (!image || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await exportSquarePhoto(image, zoom, position);
      const name = String(person.name || 'encontrista')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/gi, '-').slice(0, 60);
      const result = await onSave(
        new File([blob], name + '-quadrada.jpg', { type: 'image/jpeg' }),
      );
      if (result === false) return;
    } catch (cause) {
      setError(cause.message || 'Falha ao salvar a foto recortada.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="square-photo-backdrop">
      <section className="square-photo-dialog" role="dialog" aria-modal="true"
        aria-labelledby="square-photo-title">
        <div className="square-photo-heading">
          <div>
            <span className="eyebrow">FOTO DO ENCONTRISTA</span>
            <h2 id="square-photo-title"><Crop size={20} /> Ajustar foto quadrada</h2>
            <p className="muted small">{person.name}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar editor"
            disabled={busy} onClick={onCancel}><X size={21} /></button>
        </div>
        <p className="square-photo-instructions">
          Arraste para enquadrar o rosto. Use o zoom para aproximar.
          A imagem salva será quadrada em todo o site.
        </p>
        <div className="square-photo-stage">
          {image ? (
            <canvas ref={canvasRef} width={440} height={440}
              role="img" tabIndex={0}
              aria-label="Prévia quadrada. Arraste para escolher o enquadramento; setas também movem a foto."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
              onKeyDown={moveWithKeyboard} />
          ) : (
            <div className="square-photo-loading">
              {error ? 'Foto indisponível' : 'Preparando sua foto...'}
            </div>
          )}
          <div className="square-photo-grid" aria-hidden="true" />
        </div>
        <div className="square-photo-zoom">
          <ZoomOut size={19} aria-hidden="true" />
          <input type="range" aria-label="Aproximar ou afastar a foto"
            min="1" max="3" step=".05" value={zoom}
            disabled={!image || busy}
            onChange={(event) => setZoom(Number(event.target.value))} />
          <ZoomIn size={19} aria-hidden="true" />
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="square-photo-reset" disabled={!image || busy}
            onClick={() => { setZoom(1); setPosition({ x: 0.5, y: 0.5 }); }}>
            <RotateCcw size={16} /> Centralizar
          </button>
        </div>
        <p className="muted small square-photo-note">
          Saída: JPEG 768 × 768 px. O arquivo original não é enviado, somente o recorte escolhido.
        </p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="square-photo-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn" disabled={!image || busy} onClick={save}>
            <Check size={18} /> {busy ? 'Salvando...' : 'Salvar foto quadrada'}
          </button>
        </div>
      </section>
    </div>
  );
}
