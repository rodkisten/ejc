import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import MuralGallery from './MuralGallery';

// The user-issued m2 grant (or full user link) is a selector, not authorization.
// Both the admin cookie and TECH_PREVIEW_SECRET are checked by the Worker.
export function extractMuralGrant(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^m2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const token = new URLSearchParams(parsed.hash.replace(/^#/, '')).get('token');
    return /^m2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token || '') ? token : '';
  } catch {
    return '';
  }
}

export default function TechnicalMuralPreview({ password, recipientSlug, userToken, onClose }) {
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openBusy, setOpenBusy] = useState('');
  const [allBusy, setAllBusy] = useState(false);
  const files = useRef(new Set());
  const active = useRef(true);
  const generation = useRef(0);

  const post = useCallback(async (url, signal) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Não foi possível abrir o mural técnico.');
    }
    return response;
  }, [password]);

  useEffect(() => {
    active.current = true;
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    setOpened({});
    async function load() {
      try {
        const response = await fetch('/api/admin/technical-mural', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            ...(userToken ? { mural_token: userToken } : { recipient_slug: recipientSlug }),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Acesso técnico recusado.');
        }
        const payload = await response.json();
        if (!controller.signal.aborted && generation.current === currentGeneration) setData(payload);
      } catch (cause) {
        if (!controller.signal.aborted && generation.current === currentGeneration) setError(cause.message || 'Não foi possível abrir o mural.');
      } finally {
        if (!controller.signal.aborted && generation.current === currentGeneration) setLoading(false);
      }
    }
    load();
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
      for (const url of files.current) URL.revokeObjectURL(url);
      files.current.clear();
    };
  }, [password, recipientSlug, userToken]);

  const openLetter = async (id) => {
    if (!data || opened[id] || openBusy) return;
    const card = data.cards.find((item) => item.id === id);
    if (!card) return;
    const currentGeneration = generation.current;
    setOpenBusy(id);
    setError('');
    const urls = [];
    try {
      const media = [];
      for (const attachment of card.media || []) {
        const response = await post('/api/admin/technical-preview/' +
          encodeURIComponent(id) + '/media/' + encodeURIComponent(attachment.id));
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        urls.push(url);
        media.push({ ...attachment, url });
      }
      if (active.current && generation.current === currentGeneration) {
        urls.forEach((url) => files.current.add(url));
        setOpened((current) => ({ ...current, [id]: { ...card, media } }));
      } else urls.forEach((url) => URL.revokeObjectURL(url));
    } catch (cause) {
      urls.forEach((url) => URL.revokeObjectURL(url));
      if (active.current && generation.current === currentGeneration) setError(cause.message || 'Não foi possível abrir a cartinha.');
    } finally {
      if (active.current && generation.current === currentGeneration) setOpenBusy('');
    }
  };

  const openAll = async () => {
    if (!data || allBusy) return;
    const currentGeneration = generation.current;
    setAllBusy(true);
    try {
      // Respect the mobile browser: handle one letter at a time.
      for (const card of data.cards) {
        if (generation.current !== currentGeneration || !active.current) break;
        // The next render will update opened; repeated opens are harmless.
        if (!opened[card.id]) await openLetter(card.id);
      }
    } finally {
      if (active.current && generation.current === currentGeneration) setAllBusy(false);
    }
  };

  return (
    <section className="technical-mural-preview" aria-label="Mural completo em visualização técnica">
      <div className="technical-mural-toolbar">
        <div>
          <strong><LockKeyhole size={17} /> Conferindo como encontrista</strong>
          <p>Mesmo mural do usuário, sem modificar leitura, pagamentos ou avisos.</p>
        </div>
        <div className="inline-actions">
          <button className="btn outline" type="button" disabled={loading || allBusy || !!openBusy}
            onClick={openAll}>{allBusy ? <LoaderCircle size={16} /> : <Eye size={16} />}
            {allBusy ? 'Abrindo...' : 'Abrir todas'}
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>
            <X size={16} /> Fechar mural
          </button>
        </div>
      </div>
      {loading && <p className="loading" role="status"><LoaderCircle size={18} /> Carregando mural técnico…</p>}
      {data && <MuralGallery data={data} opened={opened} openBusy={openBusy} error={error}
        onOpenLetter={openLetter} technical />}
      {!data && error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}
