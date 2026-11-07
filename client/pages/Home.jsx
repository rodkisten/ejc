import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ArrowUpRight, AudioLines, Image as ImageIcon, PenLine,
  LockKeyhole, Sparkles, ShoppingBag, Download, Share2, Sticker as StickerIcon,
  MailOpen, Heart, Send,
} from 'lucide-react';
import { useApp } from '../main';
import { useCart } from '../lib/cart';
import { money, track } from '../lib/api';
import { Sticker } from '../components/letter/Sticker';

const colors = ['pink', 'blue', 'lavender', 'yellow', 'mint'];

function Portrait({ person, index = 0 }) {
  return person.photo_url
    ? <img src={person.photo_url} alt={'Foto de ' + person.name} loading={index > 4 ? 'lazy' : 'eager'}/>
    : <span>{person.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>;
}

export default function Home() {
  const { recipients, config } = useApp();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const query = search.toLocaleLowerCase('pt-BR').trim();
  const filtered = recipients.filter((person) =>
    person.name.toLocaleLowerCase('pt-BR').includes(query));
  const portraits = recipients.slice(0, 18);

  return (
    <>
      <section className="ejc-new-hero">
        <div className="ejc-hero-copy">
          <span className="hero-kicker"><Sparkles size={16}/> XX EJC · SIMONÉSIA</span>
          <h1>Uma cartinha. <em>Um abraço que atravessa o encontro.</em></h1>
          <p>Escolha alguém especial e crie uma mensagem só sua. Com palavras, fotos, áudios e adesivos para guardar para sempre.</p>
          <div className="inline-actions ejc-hero-actions">
            <a href="#encontristas" className="btn hero-cta">Enviar uma cartinha <ArrowUpRight size={19}/></a>
            {cart.items.length>0&&<Link to="/carrinho" className="btn ghost">
              <ShoppingBag size={18}/> Meu carrinho ({cart.items.length})
            </Link>}
          </div>
          <p className="hero-small-note"><Heart size={15}/> Feito para surpreender. Protegido para ser só de vocês.</p>
        </div>
        <div className="ejc-hero-letters" aria-label="Exemplo de cartinha decorada">
          <div className="ejc-hero-paper ejc-hero-paper-back" aria-hidden="true">PARA ALGUÉM ESPECIAL ♡</div>
          <div className="ejc-hero-paper ejc-hero-paper-main">
            <span className="hero-letter-eyebrow">💌 PARA VOCÊ · COM CARINHO</span>
            <strong>Que a fé floresça em cada novo passo.</strong>
            <span>O encontro termina, mas o amor de Deus continua.</span>
            <i>♡ Com carinho, de alguém especial</i>
            <div className="ejc-hero-sticker ejc-hero-sticker-a"><Sticker presetId="ejc-parabens"/></div>
            <div className="ejc-hero-sticker ejc-hero-sticker-b"><Sticker presetId="nossa-senhora"/></div>
          </div>
          <div className="ejc-hero-decoration" aria-hidden="true">✳</div>
        </div>
      </section>

      <section className="ejc-feature-ribbon" aria-label="O que você pode enviar">
        <span><StickerIcon size={17}/> Adesivos de fé</span>
        <span><AudioLines size={17}/> Áudios</span>
        <span><ImageIcon size={17}/> Fotos</span>
        <span><PenLine size={17}/> Cartinha personalizada</span>
        <span><LockKeyhole size={17}/> Mural secreto</span>
      </section>

      <section className="ejc-collage-section" aria-labelledby="ejc-mural-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">CONHEÇA QUEM VAI RECEBER</span>
            <h2 id="ejc-mural-title">Um mural de <em>gente especial.</em></h2>
            <p>Toque numa foto para preparar uma surpresa.</p>
          </div>
          <span className="count-chip">{recipients.length} encontristas</span>
        </div>
        <div className="ejc-portrait-wall">
          {portraits.map((person,index)=>(
            <Link to={'/enviar/'+person.slug} key={person.id}
              className={'ejc-polaroid ejc-polaroid--'+(index%6)}
              aria-label={'Criar cartinha para '+person.name} onClick={()=>track('recipient_selected')}>
              <div className="ejc-polaroid-photo"><Portrait person={person} index={index}/></div>
              <strong>{person.name}</strong>
              <ArrowUpRight size={17}/>
            </Link>
          ))}
          {!portraits.length&&<div className="ejc-wall-placeholder">
            <span>♡</span><p>Os retratos dos encontristas vão florescer por aqui.</p>
          </div>}
        </div>
        <a className="text-button ejc-all-people-link" href="#encontristas">
          Encontrar um nome na lista completa <ArrowUpRight size={18}/>
        </a>
      </section>

      <section id="encontristas" className="find-section ejc-find-section">
        <div className="section-head">
          <div><span className="eyebrow">LISTA COMPLETA / BUSCA POR NOME</span>
            <h2>Para quem vai <em>seu carinho?</em></h2>
            <p>Busque o encontrista pelo nome. Cada cartão abre o editor de envio.</p>
          </div>
          <span className="count-chip">{filtered.length} de {recipients.length}</span>
        </div>
        <label className="search-box"><Search size={20}/>
          <input type="search" placeholder="Buscar pelo nome do encontrista..." value={search}
            onChange={event=>{
              setSearch(event.target.value);
              if(event.target.value.length===3)track('recipient_search');
            }}/>
        </label>
        <div className="recipient-grid">
          {filtered.map((person,index)=>(
            <Link to={'/enviar/'+person.slug} key={person.id} className="recipient-card"
              onClick={()=>track('recipient_selected')}>
              <div className={'recipient-avatar '+colors[index%colors.length]}>
                <Portrait person={person} index={index}/>
              </div>
              <div className="recipient-name"><strong>{person.name}</strong>
                <small>Enviar uma cartinha 💌</small>
              </div>
              <ArrowUpRight size={20}/>
            </Link>
          ))}
        </div>
        {!filtered.length&&<div className="empty">Não encontramos esse nome. Tente outra escrita.</div>}
        {!config?.open&&<p className="notice">A criação de novas cartinhas está temporariamente pausada.</p>}
        {config?.amount_cents&&<p className="muted small center">
          {money(config.amount_cents)} por cartinha · Adicione várias ao carrinho e pague com um único Pix
        </p>}
      </section>

      <section className="ejc-how-section" aria-labelledby="ejc-how-title">
        <div className="section-head"><div>
          <span className="eyebrow">TUDO O QUE A SUA CARTINHA PODE SER</span>
          <h2 id="ejc-how-title">Mais do que <em>uma mensagem.</em></h2>
          <p>Uma surpresa feita com a sua voz, suas lembranças e a sua criatividade.</p>
        </div></div>
        <div className="ejc-how-grid">
          <article><StickerIcon size={24}/><h3>Decore com adesivos</h3><p>Escolha um tema, mude a tipografia e cole adesivos na sua cartinha.</p></article>
          <article><AudioLines size={24}/><h3>Grave sua voz</h3><p>Envie áudios e fotos junto com palavras que ficam para sempre.</p></article>
          <article><ShoppingBag size={24}/><h3>Presenteie muita gente</h3><p>Faça cartinhas novas ou duplique uma para vários encontristas. Um Pix só.</p></article>
          <article><MailOpen size={24}/><h3>Um mural só seu</h3><p>Cada encontrista abre suas homenagens com seu código pessoal e lê no momento certo.</p></article>
          <article><Download size={24}/><h3>Guarde para sempre</h3><p>Baixe a carta em imagem e seus arquivos, ou tudo de uma vez em ZIP.</p></article>
          <article><Share2 size={24}/><h3>Compartilhe no Telegram</h3><p>No celular, use a opção de compartilhar o arquivo com Telegram, WhatsApp ou outros apps.</p></article>
        </div>
        <div className="ejc-bottom-links">
          <a href="#encontristas" className="btn">Criar minha cartinha <Send size={18}/></a>
          <Link className="btn ghost" to="/abrir">Já tenho meu código de leitura</Link>
        </div>
      </section>
    </>
  );
}
