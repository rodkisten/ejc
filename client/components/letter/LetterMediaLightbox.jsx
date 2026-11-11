import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Instagram, X } from 'lucide-react';
import './letter-media-lightbox.css';

// Gallery images can come from an authenticated order, the private mural or a
// local Blob URL. Never put these URLs in analytics or external share text.
function safeImageName(image, index, type) {
  const fallback = 'foto-cartinha-' + (index + 1);
  const raw = String(image?.filename || image?.file?.name || fallback)
    .split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
  const name = (raw || fallback).slice(0, 160);
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp'
    : type === 'image/heic' ? 'heic' : 'jpg';
  return name + '.' + extension;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export default function LetterMediaLightbox({ images = [], initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [entered, setEntered] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const dialog = useRef(null);
  const touch = useRef(null);
  const closeTimer = useRef(null);
  const closing = useRef(false);
  const image = images[index];

  useEffect(() => {
    setIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
  }, [initialIndex, images.length]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const focus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      setEntered(true);
      dialog.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      window.clearTimeout(closeTimer.current);
      focus?.focus?.({ preventScroll: true });
    };
  }, []);

  function close() {
    if (closing.current) return;
    closing.current = true;
    setEntered(false);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    closeTimer.current = window.setTimeout(() => onClose?.(), reduced ? 0 : 190);
  }

  function go(step) {
    if (images.length < 2 || busy) return;
    setIndex(value => (value + step + images.length) % images.length);
    setError('');
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'Tab') {
        const buttons = [...(dialog.current?.querySelectorAll('button:not(:disabled)') || [])];
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Preload before the user taps Share so navigator.share is called directly
  // in the user gesture, important for Safari/iOS.
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setPrepared(null);
    setError('');
    if (!image?.url && !image?.file) return undefined;
    const load = async () => {
      try {
        let blob = image.file instanceof Blob ? image.file : null;
        if (!blob) {
          const response = await fetch(image.url, {
            credentials: 'same-origin', signal: controller.signal,
          });
          if (!response.ok) throw new Error('Não foi possível carregar o arquivo original.');
          blob = await response.blob();
        }
        if (live) setPrepared({ url: image.url, blob });
      } catch (cause) {
        if (live && cause.name !== 'AbortError') {
          setError('Não foi possível preparar esta foto para baixar ou compartilhar.');
        }
      }
    };
    void load();
    return () => { live = false; controller.abort(); };
  }, [image?.url, image?.file]);

  function onTouchStart(event) {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  }
  function onTouchEnd(event) {
    if (!touch.current || !event.changedTouches[0]) return;
    const dx = event.changedTouches[0].clientX - touch.current.x;
    const dy = event.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      go(dx < 0 ? 1 : -1);
    }
  }

  function onDownload() {
    if (!prepared?.blob || prepared.url !== image?.url) return;
    setError('');
    try {
      downloadBlob(prepared.blob, safeImageName(image, index, prepared.blob.type));
    } catch {
      setError('Não foi possível baixar a foto neste navegador.');
    }
  }

  async function onShare() {
    if (!prepared?.blob || prepared.url !== image?.url || busy) return;
    setError('');
    const file = new File([prepared.blob],
      safeImageName(image, index, prepared.blob.type), {
        type: prepared.blob.type || image?.content_type || 'image/jpeg',
      });
    // Share only the image. Never expose private order/mural URLs to third parties.
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      downloadBlob(prepared.blob, file.name);
      setError('O navegador não oferece compartilhamento de arquivos. Baixamos a foto para você publicar no Instagram ou enviar pelo WhatsApp.');
      return;
    }
    setBusy('share');
    try {
      await navigator.share({ files: [file], title: 'Foto da cartinha' });
    } catch (cause) {
      if (cause?.name !== 'AbortError') {
        setError('Não foi possível compartilhar a foto. Use Baixar para salvá-la.');
      }
    } finally {
      setBusy('');
    }
  }

  if (!image) return null;
  const ready = prepared?.url === image.url && !!prepared.blob;
  return createPortal(
    <div className={'ejc-photo-lightbox' + (entered ? ' is-open' : '')}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="ejc-photo-lightbox__dialog" role="dialog" aria-modal="true"
        aria-label="Visualização ampliada da foto" ref={dialog} tabIndex={-1}>
        <header className="ejc-photo-lightbox__header">
          <div className="ejc-photo-lightbox__counter" aria-live="polite">
            <span>FOTOS DA CARTINHA</span>
            <strong>{index + 1} / {images.length}</strong>
          </div>
          <button className="ejc-photo-lightbox__icon" type="button"
            aria-label="Fechar foto" onClick={close}><X size={21} /></button>
        </header>
        <div className="ejc-photo-lightbox__stage"
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {images.length > 1 && (
            <button className="ejc-photo-lightbox__arrow is-previous" type="button"
              aria-label="Foto anterior" onClick={() => go(-1)}><ChevronLeft size={25} /></button>
          )}
          <img key={image.url} src={image.url}
            alt={image.alt || 'Foto ' + (index + 1) + ' da cartinha'}
            draggable="false" />
          {images.length > 1 && (
            <button className="ejc-photo-lightbox__arrow is-next" type="button"
              aria-label="Próxima foto" onClick={() => go(1)}><ChevronRight size={25} /></button>
          )}
        </div>
        <footer className="ejc-photo-lightbox__footer">
          <p className="ejc-photo-lightbox__filename">
            {image.filename || image.file?.name || 'Foto ' + (index + 1)}
          </p>
          <div className="ejc-photo-lightbox__actions">
            <button className="ejc-photo-lightbox__action is-download" type="button"
              disabled={!ready || !!busy} onClick={onDownload}>
              <Download size={18} /> {ready ? 'Baixar' : 'Preparando…'}
            </button>
            <button className="ejc-photo-lightbox__action is-share" type="button"
              disabled={!ready || !!busy} onClick={onShare}>
              <Instagram size={18} /> {busy ? 'Compartilhando…' : 'Instagram / Compartilhar'}
            </button>
          </div>
          <p className="ejc-photo-lightbox__hint">
            Escolha Instagram ou WhatsApp na folha de compartilhamento.
            Nada é publicado automaticamente.
          </p>
          {error && <p className="ejc-photo-lightbox__error" role="alert">{error}</p>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
