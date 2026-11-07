import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, AudioLines, Heart, HeartHandshake,
  Image as ImageIcon, LockKeyhole, PenLine, Search, ShoppingBag, Sparkles,
} from 'lucide-react';
import { useApp } from '../main';
import { useCart } from '../lib/cart';
import { money, track } from '../lib/api';
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
  const { recipients, config } = useApp();
  const cart = useCart();
  const [search, setSearch] = useState('');
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
        <div className="recipient-grid classic-recipient-grid">
          {people.map((person, index) => {
            const tone = avatarColor(person);
            return (
              <Link
                key={person.id || person.slug}
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
