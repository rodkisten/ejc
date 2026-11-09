import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, LockKeyhole, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import { plainLetter } from '../../shared/letter.js';
import { LetterCard } from './LetterCard';

// No media URL or letter body is available via the standard admin list.
// Each technical preview requires a valid admin cookie plus the *separate*
// strong technical password, submitted only in POST bodies.
export default function TechnicalLetterPreview({ orderId, password, adminSession = false, allowFinalize = false, onFinalized }) {
  const [letter, setLetter] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setSuccess('');
    let cancelled = false;
    const created = [];
    async function load() {
      setBusy(true);
      setError('');
      setLetter(null);
      try {
        const base = adminSession
          ? '/api/admin/cartinhas/' + encodeURIComponent(orderId) + '/preview'
          : '/api/admin/technical-preview/' + encodeURIComponent(orderId);
        async function fetchPrivate(url) {
          const response = await fetch(url, {
            method: adminSession ? 'GET' : 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: adminSession ? undefined : { 'Content-Type': 'application/json' },
            body: adminSession ? undefined : JSON.stringify({ password }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'Acesso técnico recusado.');
          }
          return response;
        }
        const details = await (await fetchPrivate(base)).json();
        const media = [];
        for (const file of details.media || []) {
          const response = await fetchPrivate(base + '/media/' + encodeURIComponent(file.id));
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
  }, [orderId, password, adminSession]);

  async function finalizeAfterReview() {
    if(!letter || finishing || letter.submitted) return;
    if(!window.confirm('Você conferiu o conteúdo completo desta cartinha e deseja ENVIÁ-LA ao mural privado?\n\nA cartinha precisa estar paga e ter mensagem ou mídia salva. O acesso ao mural continuará obedecendo ao horário de liberação.'))return;
    setFinishing(true);setError('');setSuccess('');
    try {
      await api(
        adminSession
          ? '/api/admin/cartinhas/'+encodeURIComponent(orderId)+'/finalize'
          : '/api/admin/technical-preview/'+encodeURIComponent(orderId)+'/finalize',
        { method:'POST', data:adminSession?{}:{password} },
      );
      setLetter(previous=>({...previous,submitted:true}));
      setSuccess('Cartinha revisada e enviada ao mural privado. ✅');
      await onFinalized?.();
    }catch(cause){setError(cause.message||'Não foi possível finalizar esta cartinha.');}
    finally{setFinishing(false);}
  }

  return (
    <section className="technical-letter-preview" aria-label="Visualização técnica privativa">
      <div className="notice warning">
        <LockKeyhole size={18} />
        <span><strong>{adminSession ? 'Conferência administrativa autenticada.' : 'Prévia exclusivamente técnica.'}</strong>
          {' '}Conteúdo completo apenas nesta sessão, sem modificar pagamento, privacidade, publicação ou mensagens.</span>
      </div>
      {busy && <p className="muted" role="status"><RefreshCw size={16} /> Carregando cartinha completa…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {letter && (
        <>
          <p className="muted small"><Eye size={15} /> Prévia fiel ao componente real da cartinha, sem edição.</p>
          <LetterCard letter={letter} recipient={letter.recipient_name} actions={false} editable={false} />
          {allowFinalize && !letter.submitted && (
            <div className="technical-letter-finalize">
              <p>Confira a mensagem e os anexos acima antes de finalizar.
                Somente cartinhas pagas com conteúdo salvo serão aceitas.</p>
              <button type="button" className="btn"
                disabled={finishing || !['paid','preparing','delivered'].includes(letter.status) ||
                  (!plainLetter(letter.rich_html) && !letter.media?.length)}
                onClick={finalizeAfterReview}>
                <CheckCircle2 size={17}/>
                {finishing?'Finalizando…':'Revisei o conteúdo · aprovar e enviar esta cartinha'}
              </button>
              {!plainLetter(letter.rich_html) && !letter.media?.length &&
                <p className="notice warning">Este rascunho está vazio no servidor. Peça ao remetente que salve ou sincronize antes de tentar aprová-lo.</p>}
            </div>
          )}
          {success && <p role="status" className="notice success">{success}</p>}
        </>
      )}
    </section>
  );
}
