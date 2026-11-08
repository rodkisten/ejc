import React, { useMemo, useState } from 'react';
import { Printer, RefreshCw, LockKeyhole, Copy, CheckSquare } from 'lucide-react';
import QrCode from '../components/QrCode';
import { api } from '../lib/api';
import './labels.css';

const chunk = (items, count) =>
  Array.from({ length: Math.ceil(items.length / count) }, (_, page) =>
    items.slice(page * count, (page + 1) * count),
  );

export default function Labels({ info, reload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState({});
  const people = useMemo(
    () => info.recipients
      .filter((person) => person.active !== 0)
      .filter((person) => person.name.toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR'))),
    [info.recipients, query],
  );
  const printable = people.filter((person) => person.mural_code && selected[person.id] !== false);
  const pages = chunk(printable, 8);
  const pending = info.recipients.filter((person) => person.active !== 0 && !person.mural_code).length;

  async function generate(regenerate = false) {
    if (regenerate && !confirm(
      'Regerar todos os códigos? Os cartões já impressos deixarão de funcionar. Continue?',
    )) return;
    setBusy(true);
    setError('');
    try {
      const response = await api('/api/admin/mural-codes/generate', {
        method: 'POST',
        data: { regenerate },
      });
      await reload();
      setNotice(`${response.generated} códigos gerados. Os códigos anteriores ${regenerate ? 'foram invalidados' : 'foram preservados'}.`);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mural-labels">
      <div className="section-head no-print">
        <div>
          <span className="eyebrow">XX EJC · ENTREGAR AO ENCONTRISTA</span>
          <h1>Etiquetas do mural secreto</h1>
          <p>Imprima oito por página A4. Cada etiqueta tem QR, código pessoal, nome e foto autorizada.</p>
        </div>
        <button className="btn" disabled={!printable.length} onClick={() => window.print()}>
          <Printer size={18} /> Imprimir A4
        </button>
      </div>

      <div className="form-card labels-controls no-print">
        <div className="inline-actions">
          <button className="btn" disabled={busy || pending === 0} onClick={() => generate(false)}>
            <CheckSquare size={16} /> Gerar {pending} códigos pendentes
          </button>
          <button className="btn outline" disabled={busy || !info.recipients.length} onClick={() => generate(true)}>
            <RefreshCw size={16} /> Regerar todos
          </button>
        </div>
        <label htmlFor="label-search">Selecionar encontristas para imprimir</label>
        <input
          id="label-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar pelo nome"
          type="search"
        />
        <div className="labels-selection">
          <button className="btn ghost" onClick={() => setSelected({})}>Selecionar todos</button>
          <button
            className="btn ghost"
            onClick={() => setSelected(Object.fromEntries(people.map((person) => [person.id, false])))}
          >
            Desmarcar todos
          </button>
          <span className="muted small">{printable.length} etiquetas · {pages.length} páginas A4</span>
        </div>
        <div className="labels-person-picker">
          {people.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                disabled={!person.mural_code}
                checked={!!person.mural_code && selected[person.id] !== false}
                onChange={(event) => setSelected((old) => ({ ...old, [person.id]: event.target.checked }))}
              />
              <span>{person.name} {person.mural_code ? `· ${person.mural_code}` : '(sem código)'}</span>
            </label>
          ))}
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice success">{notice}</p>}
        <p className="muted small">O QR da etiqueta é privado: só entregue ao respectivo encontrista. Quem tiver o código poderá acessar o mural após a liberação.</p>
      </div>

      {!printable.length && (
        <div className="empty no-print">
          <LockKeyhole size={25} />
          <p>Gere os códigos ou selecione encontristas para visualizar as etiquetas.</p>
        </div>
      )}

      {pages.map((group, pageIndex) => (
        <section className="labels-sheet" key={pageIndex} aria-label={`Folha ${pageIndex + 1}`}>
          {group.map((person) => {
            const link = `${location.origin}/abrir#codigo=${encodeURIComponent(person.mural_code)}`;
            return (
              <article className="mural-print-label" key={person.id}>
                <div className="label-topline">✳ XX EJC SIMONÉSIA <span>♡</span></div>
                <div className="label-body">
                  <div className="label-message">
                    { /*  <div className="label-profile">
                      {person.photo_url ? (
                        <img src={person.photo_url} alt="" crossOrigin="anonymous" />
                      ) : (
                        <span aria-hidden="true">{person.name.slice(0, 2).toUpperCase()}</span>
                      )} */ }
                    </div>
                    <small>UM PRESENTE PARA</small>
                    <strong>{person.name}</strong>
                    <span className="label-description">Suas cartinhas, fotos e áudios estão aqui.</span>
                    <span className="label-personal-code">{person.mural_code}</span>
                    <small>Ou acesse <b>ejc.migos.club/abrir</b></small>
                  </div>
                  <div className="label-qr">
                    <QrCode value={link} size={104} variant="standard" logoUrl={info.config.logo_url} />
                    <span>ESCANEIE E ABRA ♡</span>
                  </div>
                </div>
                <div className="label-bottomline">
                  <LockKeyhole size={11} /> Não compartilhe seu acesso
                  <span>Feito com amor pela equipe do Mini Mercado</span>
                </div>
              </article>
            );
          })}
        </section>
      ))}
      <div className="no-print muted small labels-end-note">
        <Copy size={14} /> Imprima em escala de 100%, papel A4 vertical e margens padrão.
      </div>
    </div>
  );
}
