import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import StickerLayer from '../components/letter/StickerLayer';
import { THEMES } from '../../shared/letter.js';

const paid = (status) => ['paid', 'preparing', 'delivered'].includes(status);
function statusText(letter) {
  if (letter.status === 'cancelled') return 'Pedido cancelado';
  if (paid(letter.status)) return letter.submitted ? 'Pago · enviada' : 'Pago · rascunho';
  return letter.submitted ? 'Pix pendente · enviada' : 'Pix pendente · rascunho';
}

// A API retorna SOMENTE remetente, metadados e adesivos. Nenhum segredo é
// enviado ao navegador do administrador, nem sequer em nós ocultos no DOM.
function SecretLetterPreview({ letter }) {
  const theme = THEMES[letter.theme] || THEMES.lilac;
  return (
    <div className="admin-secret-paper" style={{
      '--secret-paper': theme.paper,
      '--secret-edge': theme.edge,
      '--secret-ink': theme.ink,
      '--secret-accent': theme.accent,
    }}>
      <div className="admin-secret-paper-head">
        <span>✳ XX EJC SIMONÉSIA ✳</span>
        <h3>Para {letter.recipient_name} ♡</h3>
        <div className="admin-secret-sender">
          Enviada por <strong>{letter.sender_name}</strong>
        </div>
      </div>
      <div className="admin-secret-hidden" aria-label="Conteúdo da mensagem privado e indisponível à coordenação">
        <div className="admin-secret-blur" aria-hidden="true">
          <span /><span /><span /><span /><span />
          <div className="admin-secret-image-shapes"><i /><i /></div>
        </div>
        <div className="admin-secret-lock">
          <LockKeyhole size={24} />
          <strong>Conteúdo secreto</strong>
          <span>Somente o encontrista poderá ler, ver fotos e ouvir áudios.</span>
        </div>
      </div>
      {letter.stickers.length > 0 ? (
        <div className="admin-secret-stickers">
          <span className="eyebrow"><Sparkles size={15} /> Adesivos visíveis</span>
          <StickerLayer composition={{ stickers: letter.stickers }} />
        </div>
      ) : <p className="muted small admin-secret-stickers-empty">Nenhum sticker nesta cartinha.</p>}
      <p className="admin-secret-footer"><ShieldCheck size={16} />
        Esta prévia não revela texto, imagens, áudio nem links de acesso.
      </p>
    </div>
  );
}

export default function AdminLetters() {
  const { slug } = useParams();
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/admin/cartinhas');
      setLetters(response.letters || []);
      setError('');
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const selected = slug ? letters.find((letter) => letter.recipient_slug === slug) : null;
  const rows = useMemo(() => letters.filter((letter) => {
    if (slug && letter.recipient_slug !== slug) return false;
    if (filter === 'pending' && paid(letter.status)) return false;
    if (filter === 'paid' && !paid(letter.status)) return false;
    if (filter === 'draft' && letter.submitted) return false;
    if (filter === 'sent' && !letter.submitted) return false;
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return !query || [letter.recipient_name, letter.sender_name, letter.id]
      .some((text) => String(text).toLocaleLowerCase('pt-BR').includes(query));
  }), [letters, slug, search, filter]);
  const heading = slug ? 'Cartinhas de ' + (selected?.recipient_name || 'encontrista') : 'Todas as cartinhas';

  return (
    <div className="admin-letters-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">COORDENAÇÃO / ACESSO RESTRITO</span>
          <h1>{heading}</h1>
          <p>Veja todas as homenagens, inclusive as que ainda aguardam Pix. O conteúdo permanece inacessível à coordenação.</p>
        </div>
        <button type="button" className="btn ghost" disabled={loading} onClick={refresh}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {slug && <Link className="text-button" to="/admin/cartinhas">← Ver todas as cartinhas</Link>}
      <div className="notice admin-letters-privacy">
        <ShieldCheck size={20} />
        Somente o nome do remetente, os stickers e os dados operacionais são enviados para esta página. O blur é ilustrativo, não contém mensagens escondidas.
      </div>
      <div className="admin-letters-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input type="search" aria-label="Buscar cartinhas por remetente, encontrista ou pedido"
            placeholder="Buscar remetente ou encontrista..." value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label="Filtrar cartinhas" value={filter}
          onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todas as situações</option>
          <option value="pending">Pix pendente</option>
          <option value="paid">Pagas</option>
          <option value="sent">Enviadas</option>
          <option value="draft">Rascunhos</option>
        </select>
        <strong aria-live="polite">{rows.length} cartinha(s)</strong>
      </div>
      {loading && <div className="loading">Carregando cartinhas...</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {!loading && !error && !rows.length && (
        <div className="empty">Nenhuma cartinha encontrada com esses filtros.</div>
      )}
      <div className="admin-letters-list">
        {!loading && !error && rows.map((letter) => (
          <article className="admin-letter-entry form-card" key={letter.id}>
            <div className="admin-letter-summary">
              <div>
                {!slug && <Link to={'/admin/cartinhas/' + encodeURIComponent(letter.recipient_slug)}
                  className="admin-letter-recipient">{letter.recipient_name}</Link>}
                {slug && <strong className="admin-letter-recipient">{letter.recipient_name}</strong>}
                <p>De: <strong>{letter.sender_name}</strong></p>
                <small>{letter.id} · {new Date(letter.created_at + (letter.created_at.includes('Z') ? '' : 'Z')).toLocaleString('pt-BR')}</small>
              </div>
              <div className="admin-letter-summary-actions">
                <span className={'admin-letter-status ' + (paid(letter.status) ? 'is-paid' : 'is-pending')}>
                  {statusText(letter)}
                </span>
                <button type="button" className="btn outline" aria-expanded={!!expanded[letter.id]}
                  onClick={() => setExpanded((previous) => ({
                    ...previous, [letter.id]: !previous[letter.id],
                  }))}>
                  {expanded[letter.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  {expanded[letter.id] ? 'Fechar prévia' : 'Ver prévia protegida'}
                </button>
              </div>
            </div>
            {expanded[letter.id] && <SecretLetterPreview letter={letter} />}
          </article>
        ))}
      </div>
    </div>
  );
}
