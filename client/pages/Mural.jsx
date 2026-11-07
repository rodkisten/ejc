import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, LockKeyhole, Sparkles, MailOpen, LoaderCircle } from 'lucide-react';
import { api, track } from '../lib/api';
import { LetterCard, saveAllCards } from '../components/LetterCard';

export default function Mural() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState({});
  const [openBusy, setOpenBusy] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const muralToken = () => new URLSearchParams(location.hash.slice(1)).get('token');

  const load = useCallback(async () => {
    try {
      const token = muralToken();
      const response = await api(`/api/mural/${encodeURIComponent(slug)}`, { token: token || undefined });
      setData(response);
      setError('');
      track('mural_view');
    } catch (cause) {
      setError(cause.message);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function openLetter(id) {
    if (opened[id] || openBusy) return;
    setOpenBusy(id);
    setError('');
    try {
      // Accessing the actual letter (not just listing the mural) records first read.
      const response = await api(
        `/api/mural/${encodeURIComponent(slug)}/cards/${encodeURIComponent(id)}`,
        { token: muralToken() || undefined },
      );
      setOpened((previous) => ({ ...previous, [id]: response.card }));
      track('private_letter_opened');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setOpenBusy('');
    }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      for (const envelope of data.cards) {
        if (!opened[envelope.id]) await openLetter(envelope.id);
      }
      // Resolve the full set directly to avoid React state races.
      const cards = await Promise.all(data.cards.map(async (envelope) => {
        if (opened[envelope.id]) return opened[envelope.id];
        const response = await api(
          `/api/mural/${encodeURIComponent(slug)}/cards/${encodeURIComponent(envelope.id)}`,
          { token: muralToken() || undefined },
        );
        return response.card;
      }));
      await saveAllCards(cards, data.recipient.name);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mural-page">
      <div className="mural-intro">
        {data?.recipient?.photo_url &&
          <img className="mural-portrait" src={data.recipient.photo_url}
            alt={`Foto de ${data.recipient.name}`} />}
        <div className="hero-kicker"><LockKeyhole size={16} /> ESTE É UM ESPAÇO SECRETO</div>
        <h1>{data?.recipient?.name ? `O mural de ${data.recipient.name}` : 'Um cantinho só seu.'} <em>♡</em></h1>
        <p>Uma coleção de palavras, memórias, fotos e vozes que alguém guardou especialmente para você.</p>
      </div>
      {error && (
        <div className="form-card" role="alert">
          <h2>Não foi possível abrir a cartinha 🔐</h2><p>{error}</p>
          <Link to="/abrir" className="btn">Digitar meu código</Link>
        </div>
      )}
      {data && (
        <>
          <div className="mural-count">
            <Sparkles size={18} /> {data.cards.length} {data.cards.length === 1 ? 'cartinha especial' : 'cartinhas especiais'} para você
          </div>
          {data.locked && <div className="notice warning">
            O mural abre no horário de liberação configurado. A coordenação não lê nem escuta as homenagens.
          </div>}
          {!data.cards.length ? (
            <div className="empty"><h2>O carinho está a caminho. 💌</h2>
              <p>As mensagens enviadas aparecerão automaticamente no horário de liberação do encontro.</p>
            </div>
          ) : (
            <>
              <div className="mural-cards">
                {data.cards.map((envelope, index) => (
                  <div key={envelope.id} className="mural-envelope">
                    {opened[envelope.id] ? (
                      <LetterCard letter={opened[envelope.id]} recipient={data.recipient.name} />
                    ) : (
                      <button type="button" className="mural-envelope-button"
                        disabled={!!openBusy} onClick={() => openLetter(envelope.id)}>
                        {openBusy === envelope.id ? <LoaderCircle size={28} /> : <MailOpen size={31} />}
                        <strong>Uma cartinha só para você ♡</strong>
                        <span>Homenagem {index + 1} · Toque para abrir e ler</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn outline wide" disabled={busy || !!openBusy} onClick={downloadAll}>
                <Download size={18} /> {busy ? 'Montando arquivos...' : 'Baixar todas as cartinhas em ZIP'}
              </button>
            </>
          )}
          <p className="muted small center spaced">
            Seu código é pessoal. Não compartilhe fotos da etiqueta ou o link privado.
          </p>
        </>
      )}
    </div>
  );
}
