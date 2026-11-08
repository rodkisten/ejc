import React, { useEffect, useState } from 'react';
import { Eye, LockKeyhole, RefreshCw } from 'lucide-react';
import LetterCard from './LetterCard';

// No media URL or letter body is available via the standard admin list.
// Each technical preview requires a valid admin cookie plus the *separate*
// strong technical password, submitted only in POST bodies.
export default function TechnicalLetterPreview({ orderId, password }) {
  const [letter, setLetter] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const created = [];
    async function load() {
      setBusy(true);
      setError('');
      setLetter(null);
      try {
        const base = '/api/admin/technical-preview/' + encodeURIComponent(orderId);
        async function post(url) {
          const response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'Acesso técnico recusado.');
          }
          return response;
        }
        const details = await (await post(base)).json();
        const media = [];
        for (const file of details.media || []) {
          const response = await post(base + '/media/' + encodeURIComponent(file.id));
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          created.push(url);
          media.push({ ...file, url });
        }
        if (!cancelled) setLetter({ ...details, media });
      } catch (cause) {
        if (!cancelled) setError(cause.message || 'Não foi possível conferir a cartinha.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [orderId, password]);

  return (
    <section className="technical-letter-preview" aria-label="Visualização técnica privativa">
      <div className="notice warning">
        <LockKeyhole size={18} />
        <span><strong>Prévia exclusivamente técnica.</strong> Conteúdo completo apenas nesta sessão,
          sem modificar pagamento, privacidade, publicação ou mensagens.</span>
      </div>
      {busy && <p className="muted" role="status"><RefreshCw size={16} /> Carregando cartinha completa…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {letter && (
        <>
          <p className="muted small"><Eye size={15} /> Prévia fiel ao componente real da cartinha, sem edição.</p>
          <LetterCard letter={letter} recipient={letter.recipient_name} actions={false} editable={false} />
        </>
      )}
    </section>
  );
}
