import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import StickerLayer from '../components/letter/StickerLayer';
import TechnicalLetterPreview from '../components/TechnicalLetterPreview';
import '../styles/technical-preview.css';
import { THEMES } from '../../shared/letter.js';

const paid = (status) => ['paid', 'preparing', 'delivered'].includes(status);
function createdAt(value) {
  const raw = String(value || '').trim().replace(' ', 'T');
  const normalized = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(raw) ? raw : raw + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  });
}
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
  const location = useLocation();
  const technicalMode = new URLSearchParams(location.search).get('secret') === '000000';
  const [technicalInput, setTechnicalInput] = useState('');
  const [technicalPassword, setTechnicalPassword] = useState('');
  useEffect(() => {
    if (!technicalMode) {
      setTechnicalPassword('');
      setTechnicalInput('');
    }
  }, [technicalMode]);
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
      {slug && <Link className="text-button" to={'/admin/cartinhas' + (technicalMode ? '?secret=000000' : '')}>← Ver todas as cartinhas</Link>}
      {technicalMode && (
        <form className="admin-tech-gate" onSubmit={(event) => {
          event.preventDefault();
          setTechnicalPassword(technicalInput);
          setTechnicalInput('');
        }}>
          <strong>🔐 Modo de conferência técnica de layout</strong>
          <p>Somente para o responsável técnico. O parâmetro da URL não concede acesso: além do login administrativo, é necessária a credencial técnica separada configurada no servidor. A coordenação continua vendo apenas a prévia protegida.</p>
          {technicalPassword ? <div className="notice success">Credencial técnica informada para esta sessão. A verificação acontece no servidor ao abrir cada cartinha.</div> : null}
          <div className="admin-tech-entry">
            <label>Credencial técnica
              <input type="password" minLength={20} maxLength={256} autoComplete="off"
                placeholder="Senha técnica, não é 000000" value={technicalInput}
                onChange={(event) => setTechnicalInput(event.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={technicalInput.length < 20}>
              <LockKeyhole size={16} /> Ativar conferência
            </button>
            {technicalPassword && <button type="button" className="btn outline" onClick={() => {
              setTechnicalPassword('');
              setExpanded({});
            }}>Bloquear</button>}
          </div>
        </form>
      )}
      <div className="notice admin-letters-privacy">
        <ShieldCheck size={20} />
        {technicalMode && technicalPassword
          ? 'A lista administrativa continua protegida. Apenas uma prévia técnica aberta com autorização específica carrega seu conteúdo, sem alterar a privacidade para a coordenação.'
          : 'Somente o nome do remetente, os stickers e os dados operacionais são enviados para esta página. O blur é ilustrativo, não contém mensagens escondidas.'}
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
                {!slug && <Link to={'/admin/cartinhas/' + encodeURIComponent(letter.recipient_slug) + (technicalMode ? '?secret=000000' : '')}
                  className="admin-letter-recipient">{letter.recipient_name}</Link>}
                {slug && <strong className="admin-letter-recipient">{letter.recipient_name}</strong>}
                <p>De: <strong>{letter.sender_name}</strong></p>
                <small>{letter.id} · {createdAt(letter.created_at)}</small>
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
                  {expanded[letter.id] ? 'Fechar prévia' : technicalMode && technicalPassword ? 'Conferir layout completo' : 'Ver prévia protegida'}
                </button>
              </div>
            </div>
            {expanded[letter.id] && (technicalMode && technicalPassword
              ? <TechnicalLetterPreview orderId={letter.id} password={technicalPassword} />
              : <SecretLetterPreview letter={letter} />)}
          </article>
        ))}
      </div>
    </div>
  );
}
