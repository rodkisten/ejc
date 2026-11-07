import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ArrowUpRight, AudioLines, Image as ImageIcon, PenLine,
  LockKeyhole, Sparkles, ShoppingBag, Download, Share2,
  Sticker as StickerIcon, MailOpen, Heart, Send,
} from 'lucide-react';
import { useApp } from '../main';
import { useCart } from '../lib/cart';
import { money, track } from '../lib/api';
import { Sticker } from '../components/letter/Sticker';
import { avatarColor, avatarInitials, visibleRecipients } from '../lib/recipient-wall';

function Portrait({ person, index = 0 }) {
  return person.photo_url
    ? <img src={person.photo_url} alt={`Foto de ${person.name}`}
        loading={index < 6 ? 'eager' : 'lazy'} decoding="async" />
    : <span aria-hidden="true">{avatarInitials(person.name)}</span>;
}

export default function Home() {
  const { recipients, config } = useApp();
  const cart = useCart();
  const [search, setSearch] = useState('');
  // Intentionally render the complete list: no slices, pagination or "load more".
  const people = useMemo(() => visibleRecipients(recipients, search), [recipients, search]);
  const total = recipients.length;

  return (
    <div className="ejc-home">
      <section className="ejc-new-hero" aria-labelledby="home-title">
        <div className="ejc-hero-copy">
          <span className="hero-kicker"><Sparkles size={16} /> XX EJC · SIMONÉSIA</span>
          <h1 id="home-title">Uma cartinha. <em>Um abraço que atravessa o encontro.</em></h1>
          <p>Escolha alguém especial e crie uma mensagem só sua. Com palavras,
            fotos, áudios e adesivos para guardar para sempre.</p>
          <div className="inline-actions ejc-hero-actions">
            <a href="#encontristas" className="btn hero-cta">
              Enviar uma cartinha <ArrowUpRight size={19} />
            </a>
            {cart.items.length > 0 && (
              <Link to="/carrinho" className="btn ghost">
                <ShoppingBag size={18} /> Meu carrinho ({cart.items.length})
              </Link>
            )}
          </div>
          <p className="hero-small-note">
            <Heart size={16} /> Feito para surpreender. Protegido para ser só de vocês.
          </p>
        </div>
        <div className="ejc-hero-letters" aria-label="Exemplo de cartinha decorada">
          <div className="ejc-hero-paper ejc-hero-paper-back" aria-hidden="true">
            PARA ALGUÉM ESPECIAL ♡
          </div>
          <div className="ejc-hero-paper ejc-hero-paper-main">
            <span className="hero-letter-eyebrow">💌 PARA VOCÊ · COM CARINHO</span>
            <strong>Que a fé floresça em cada novo passo.</strong>
            <span>O encontro termina, mas o amor de Deus continua.</span>
            <i>♡ Com carinho, de alguém especial</i>
            <div className="ejc-hero-sticker ejc-hero-sticker-a" aria-hidden="true">
              <Sticker presetId="ejc-parabens" />
            </div>
            <div className="ejc-hero-sticker ejc-hero-sticker-b" aria-hidden="true">
              <Sticker presetId="nossa-senhora" />
            </div>
          </div>
          <div className="ejc-hero-decoration" aria-hidden="true">✳</div>
        </div>
      </section>

      <div className="ejc-feature-ribbon" aria-label="O que você pode enviar">
        <span><StickerIcon size={17} /> Adesivos de fé</span>
        <span><AudioLines size={17} /> Áudios</span>
        <span><ImageIcon size={17} /> Fotos</span>
        <span><PenLine size={17} /> Cartinha personalizada</span>
        <span><LockKeyhole size={17} /> Mural secreto</span>
      </div>

      <section id="encontristas" className="ejc-collage-section ejc-recipient-mural"
        aria-labelledby="ejc-mural-title">
        <div className="section-head ejc-mural-heading">
          <div>
            <span className="eyebrow">TODOS OS ENCONTRISTAS · XX EJC</span>
            <h2 id="ejc-mural-title">Um mural de <em>gente especial.</em> ♡</h2>
            <p>Todo mundo está aqui! Encontre pelo nome ou escolha uma
              cartinha para enviar sua homenagem.</p>
          </div>
          <span className="count-chip" aria-live="polite">
            {search.trim() ? `${people.length} de ${total}` : `${total} encontristas`}
          </span>
        </div>

        <label className="search-box ejc-mural-search">
          <Search size={20} aria-hidden="true" />
          <input type="search" aria-label="Buscar encontrista pelo nome"
            placeholder="Buscar pelo nome do encontrista..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (event.target.value.trim().length === 3) track('recipient_search');
            }} />
          {search && (
            <button type="button" className="ejc-clear-search"
              aria-label="Limpar busca" onClick={() => setSearch('')}>✕</button>
          )}
        </label>

        <div className="ejc-portrait-wall" aria-label="Mural completo de encontristas">
          {people.map((person, index) => {
            const tone = avatarColor(person);
            return (
              <Link to={'/enviar/' + person.slug} key={person.id || person.slug}
                className="ejc-polaroid"
                style={{
                  '--avatar-bg': tone.background,
                  '--avatar-ink': tone.foreground,
                  '--avatar-edge': tone.border,
                }}
                aria-label={'Criar cartinha para ' + person.name}
                onClick={() => track('recipient_selected')}>
                <div className="ejc-polaroid-photo">
                  <Portrait person={person} index={index} />
                  <span className="ejc-polaroid-heart" aria-hidden="true">♡</span>
                </div>
                <div className="ejc-polaroid-caption">
                  <strong>{person.name}</strong>
                  <span>Enviar uma cartinha 💌</span>
                </div>
                <ArrowUpRight className="ejc-polaroid-arrow" size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
        {!people.length && (
          <div className="empty">
            {search.trim()
              ? 'Não encontramos esse nome. Experimente outra escrita.'
              : 'Os nomes dos encontristas aparecerão aqui em breve.'}
          </div>
        )}
        <p className="ejc-mural-footnote">
          <Heart size={15} /> Todos os {total} encontristas aparecem neste mural,
          sem precisar carregar mais.
        </p>
        {!config?.open && (
          <p className="notice">A criação de novas cartinhas está temporariamente pausada.</p>
        )}
        {config?.amount_cents && (
          <p className="muted small center">
            {money(config.amount_cents)} por cartinha · Adicione várias ao carrinho e pague com um único Pix
          </p>
        )}
      </section>

      <section className="ejc-how-section" aria-labelledby="ejc-how-title">
        <div className="section-head"><div>
          <span className="eyebrow">TUDO O QUE A SUA CARTINHA PODE SER</span>
          <h2 id="ejc-how-title">Mais do que <em>uma mensagem.</em></h2>
          <p>Uma surpresa feita com sua voz, suas lembranças e sua criatividade.</p>
        </div></div>
        <div className="ejc-how-grid">
          <article><StickerIcon size={24} /><h3>Decore com adesivos</h3>
            <p>Escolha um tema, mude a tipografia e cole adesivos na sua cartinha.</p></article>
          <article><AudioLines size={24} /><h3>Grave sua voz</h3>
            <p>Envie áudios e fotos junto com palavras que ficam para sempre.</p></article>
          <article><ShoppingBag size={24} /><h3>Presenteie muita gente</h3>
            <p>Faça cartinhas novas ou duplique uma para vários encontristas. Um Pix só.</p></article>
          <article><MailOpen size={24} /><h3>Um mural só seu</h3>
            <p>Cada encontrista abre suas homenagens com seu código pessoal.</p></article>
          <article><Download size={24} /><h3>Guarde para sempre</h3>
            <p>Baixe a carta em imagem e seus arquivos, ou tudo em ZIP.</p></article>
          <article><Share2 size={24} /><h3>Compartilhe com carinho</h3>
            <p>Use o compartilhamento do celular no Telegram, WhatsApp ou outros apps.</p></article>
        </div>
        <div className="ejc-bottom-links">
          <a href="#encontristas" className="btn">Criar minha cartinha <Send size={18} /></a>
          <Link className="btn ghost" to="/abrir">Já tenho meu código de leitura</Link>
        </div>
      </section>
    </div>
  );
}
