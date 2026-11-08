import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, AudioLines, Heart, HeartHandshake,
  Image as ImageIcon, LockKeyhole, PenLine, Search, ShoppingBag, Sparkles,
  Eye, ImagePlus, Pencil, Trash2, Check, X,
} from 'lucide-react';
import { useApp } from '../main';
import { useCart } from '../lib/cart';
import { api, money, track } from '../lib/api';
import SquarePhotoEditor from '../components/SquarePhotoEditor';
import { publishOgImage } from '../lib/og';
import { avatarColor, avatarInitials, visibleRecipients } from '../lib/recipient-wall';

function Portrait({ person, priority }) {
  return person.photo_url ? (
    <img
      src={person.photo_url}
      alt={`Foto de ${person.name}`}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
    />
  ) : (
    <span aria-hidden="true">{avatarInitials(person.name)}</span>
  );
}

export default function Home() {
  const { recipients, config, reload } = useApp();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [admin, setAdmin] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState('');
  const [photoSelection, setPhotoSelection] = useState(null);
  const [notice, setNotice] = useState('');
  const [adminError, setAdminError] = useState('');

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        await api('/api/admin/me');
        if (alive) setAdmin(true);
      } catch {
        if (alive) setAdmin(false);
      }
    };
    check();
    window.addEventListener('focus', check);
    return () => { alive = false; window.removeEventListener('focus', check); };
  }, []);

  async function addPerson(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setSavingId('new'); setAdminError(''); setNotice('');
    try {
      const response = await api('/api/admin/recipients/import', {
        method: 'POST', data: { names: [newName.trim()] },
      });
      await reload();
      setNotice(response.inserted ? 'Encontrista adicionado à lista.' : 'Este nome já existe.');
      setNewName('');
    } catch (cause) { setAdminError(cause.message); }
    finally { setSavingId(''); }
  }

  async function saveName(person, event) {
    event.preventDefault();
    const name = editingName.trim();
    if (!name) return;
    setSavingId(person.id); setAdminError(''); setNotice('');
    try {
      const updated = await api('/api/admin/recipients/' + person.id, {
        method: 'PATCH', data: { name },
      });
      await reload();
      setEditingId('');
      setNotice('Nome atualizado. Os links e códigos antigos permanecem válidos.');
      if (updated.og_needs_refresh) {
        try { await publishOgImage({ ...person, name }); }
        catch { setNotice('Nome salvo. Atualize a prévia do WhatsApp no painel administrativo.'); }
      }
    } catch (cause) { setAdminError(cause.message); }
    finally { setSavingId(''); }
  }

  async function deletePerson(person) {
    if (!window.confirm('Excluir ' + person.name + '? Com cartinhas existentes, o encontrista será apenas arquivado e as mensagens serão preservadas.')) return;
    setSavingId(person.id); setAdminError(''); setNotice('');
    try {
      const response = await api('/api/admin/recipients/' + person.id, { method: 'DELETE' });
      await reload();
      setNotice(response.mode === 'archived'
        ? 'Encontrista arquivado. Suas cartinhas e códigos privados foram preservados.'
        : 'Encontrista excluído.');
    } catch (cause) { setAdminError(cause.message); }
    finally { setSavingId(''); }
  }

  async function reframePhoto(person) {
    setAdminError('');
    try {
      const response = await fetch(person.photo_url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Foto anterior indisponível.');
      const file = await response.blob();
      setPhotoSelection({ person, file: new File([file], 'foto-existente.jpg', {
        type: file.type || 'image/jpeg',
      }) });
    } catch (cause) { setAdminError(cause.message); }
  }

  async function removePhoto(person) {
    if (!window.confirm('Remover a foto de ' + person.name + '?')) return;
    setSavingId(person.id); setAdminError(''); setNotice('');
    try {
      await api('/api/admin/recipients/' + person.id + '/photo', { method: 'DELETE' });
      await reload();
      setNotice('Foto removida.');
      try { await publishOgImage({ ...person, photo_url: null }); }
      catch { setNotice('Foto removida. Atualize a prévia do WhatsApp no painel.'); }
    } catch (cause) { setAdminError(cause.message); }
    finally { setSavingId(''); }
  }

  async function uploadPhoto(file) {
    const person = photoSelection?.person;
    if (!person) return false;
    if (!window.confirm('Confirmo que tenho autorização para divulgar a foto de ' + person.name + ', inclusive dos responsáveis se menor de idade.')) return false;
    setSavingId(person.id); setAdminError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/recipients/' + person.id + '/photo', {
        method: 'POST', body: file, credentials: 'same-origin',
        headers: { 'Content-Type': file.type, 'X-Photo-Consent': 'confirmed' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar foto.');
      await reload();
      setNotice('Foto quadrada salva.');
      try { await publishOgImage({ ...person, photo_url: data.photo_url }); }
      catch { setNotice('Foto salva. Atualize a prévia do WhatsApp no painel.'); }
      return true;
    } catch (cause) { setAdminError(cause.message); return false; }
    finally { setSavingId(''); }
  }

  // All recipients appear at once. No second list, pagination or artificial cap.
  const people = useMemo(() => visibleRecipients(recipients, search), [recipients, search]);

  return (
    <div className="classic-ejc-home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles size={16} /> UMA LEMBRANÇA QUE FICA</span>
            <h1 id="home-title">
              Tem coisas que só <em>a sua voz</em> consegue dizer.
            </h1>
            <p>
              Envie uma cartinha cheia de carinho, com palavras, fotos, áudios
              e adesivos para quem está vivendo o XX EJC Simonésia. 💌
            </p>
            <div className="inline-actions classic-hero-actions">
              <a className="btn hero-cta" href="#encontristas">
                Escrever uma cartinha <ArrowUpRight size={19} />
              </a>
              {cart.items.length > 0 && (
                <Link className="btn ghost" to="/carrinho">
                  <ShoppingBag size={17} /> Meu carrinho ({cart.items.length})
                </Link>
              )}
            </div>
            <p className="classic-hero-note">
              <Heart size={16} /> Um carinho que só vocês poderão ler.
            </p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="paper paper-back">LOVE YOU</div>
            <div className="paper paper-front">
              <span>Para você ♡</span>
              <strong>Que esse encontro transforme o seu mundo.</strong>
              <i>Com carinho, alguém especial.</i>
              <span className="paper-heart">♥</span>
            </div>
            <div className="floating-star">✳</div>
          </div>
        </div>
      </section>

      <div className="benefits" aria-label="Recursos das cartinhas">
        <span><AudioLines size={17} /> Áudios com sua voz</span>
        <span><ImageIcon size={17} /> Fotos especiais</span>
        <span><PenLine size={17} /> Papel e adesivos</span>
        <span><LockKeyhole size={17} /> Mural privado</span>
      </div>

      <section id="encontristas" className="find-section classic-people-wall"
        aria-labelledby="recipient-heading">
        <div className="section-head">
          <div>
            <span className="eyebrow">01 / ESCOLHA UM ENCONTRISTA</span>
            <h2 id="recipient-heading">Para quem vai o seu carinho?</h2>
            <p>Todos os encontristas estão aqui. Escolha alguém ou busque pelo nome.</p>
          </div>
          <span className="count-chip" aria-live="polite">
            {search.trim()
              ? `${people.length} de ${recipients.length}`
              : `${recipients.length} encontristas`}
          </span>
        </div>
        <label className="search-box classic-search-box">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar encontrista pelo nome"
            placeholder="Buscar pelo nome..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (event.target.value.trim().length === 3) track('recipient_search');
            }}
          />
          {search && (
            <button type="button" className="classic-search-clear" aria-label="Limpar busca"
              onClick={() => setSearch('')}>✕</button>
          )}
        </label>
        {admin && (
          <div className="home-admin-tools" role="region" aria-label="Ferramentas da coordenação">
            <div>
              <strong>Modo coordenação ativo <Check size={15} /></strong>
              <p>Edite encontristas e veja as prévias protegidas sem sair desta página.</p>
            </div>
            <form onSubmit={addPerson}>
              <input type="text" aria-label="Nome do novo encontrista" placeholder="Novo encontrista"
                maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} />
              <button className="btn" type="submit" disabled={!!savingId || !newName.trim()}>Adicionar</button>
            </form>
            <Link className="btn ghost" to="/admin/cartinhas">Ver todas as cartinhas <Eye size={16} /></Link>
          </div>
        )}
        {admin && adminError && <div className="notice error" role="alert">{adminError}</div>}
        {admin && notice && <div className="notice" role="status">{notice}</div>}
        <div className="recipient-grid classic-recipient-grid">
          {people.map((person, index) => {
            const tone = avatarColor(person);
            return (
              <div className="recipient-item" key={person.id || person.slug}>
              <Link
                className="recipient-card classic-recipient-card"
                to={`/enviar/${person.slug}`}
                style={{
                  '--recipient-bg': tone.background,
                  '--recipient-ink': tone.foreground,
                  '--recipient-border': tone.border,
                }}
                onClick={() => track('recipient_selected')}
                aria-label={`Enviar uma cartinha para ${person.name}`}
              >
                <div className="recipient-avatar classic-recipient-avatar">
                  <Portrait person={person} priority={index < 8} />
                </div>
                <div className="recipient-name">
                  <strong>{person.name}</strong>
                  <small>Enviar uma cartinha 💌</small>
                </div>
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              {admin && (
                <div className="recipient-admin-actions" aria-label={'Administração de ' + person.name}>
                  <Link className="recipient-admin-private" to={'/admin/cartinhas/' + encodeURIComponent(person.slug)}
                    title={'Ver cartinhas de ' + person.name}><Eye size={15} /> Cartinhas</Link>
                  <button type="button" disabled={!!savingId} onClick={() => {
                    setEditingId(person.id); setEditingName(person.name); setAdminError(''); setNotice('');
                  }}><Pencil size={15} /> Editar</button>
                  <label className="recipient-admin-upload"><ImagePlus size={15} />
                    {person.photo_url ? 'Foto' : 'Adicionar foto'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!savingId}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setPhotoSelection({ person, file });
                        event.target.value = '';
                      }} />
                  </label>
                  {person.photo_url && (
                    <button type="button" disabled={!!savingId} onClick={() => reframePhoto(person)}
                      title="Reenquadrar foto atual"><ImagePlus size={15} /> Ajustar</button>
                  )}
                  {person.photo_url && (
                    <button type="button" disabled={!!savingId} title="Remover foto"
                      aria-label={'Remover foto de ' + person.name} onClick={() => removePhoto(person)}>
                      <X size={15} />
                    </button>
                  )}
                  <button type="button" disabled={!!savingId} className="recipient-admin-danger"
                    aria-label={'Excluir ' + person.name} title="Excluir encontrista"
                    onClick={() => deletePerson(person)}><Trash2 size={15} /></button>
                </div>
              )}
              {admin && editingId === person.id && (
                <form className="recipient-inline-editor" onSubmit={(event) => saveName(person, event)}>
                  <label htmlFor={'edit-name-' + person.id}>Nome do encontrista</label>
                  <input id={'edit-name-' + person.id} type="text" maxLength={100} autoFocus
                    value={editingName} disabled={!!savingId}
                    onChange={(event) => setEditingName(event.target.value)} />
                  <div className="inline-actions">
                    <button type="submit" className="btn" disabled={!!savingId || !editingName.trim()}>
                      <Check size={15} /> Salvar
                    </button>
                    <button type="button" className="btn ghost" disabled={!!savingId}
                      onClick={() => setEditingId('')}><X size={15} /> Cancelar</button>
                  </div>
                </form>
              )}
              </div>
            );
          })}
        </div>
        {people.length === 0 && (
          <div className="empty">
            {search.trim() ? 'Nenhum nome encontrado. Tente outra escrita.'
              : 'Os encontristas aparecerão aqui em breve.'}
          </div>
        )}
        {!config?.open && (
          <p className="notice">A criação de novas cartinhas está temporariamente pausada.</p>
        )}
        {config?.amount_cents && (
          <p className="muted small center">
            {money(config.amount_cents)} por cartinha · Um único Pix para várias homenagens
          </p>
        )}
      </section>

      {admin && photoSelection && (
        <SquarePhotoEditor person={photoSelection.person} file={photoSelection.file}
          onCancel={() => setPhotoSelection(null)}
          onSave={async (file) => {
            const saved = await uploadPhoto(file);
            if (saved) setPhotoSelection(null);
            return saved;
          }} />
      )}
      <section className="bottom-cta">
        <HeartHandshake size={28} />
        <h2>Uma mensagem pequena. Uma memória enorme.</h2>
        <p>
          Cada encontrista abre seu mural pessoal com um código exclusivo,
          no momento preparado para o encontro.
        </p>
      </section>
    </div>
  );
}
