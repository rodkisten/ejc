import React,{useState} from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowUpRight, HeartHandshake, AudioLines, Image as ImageIcon, PenLine, LockKeyhole, Sparkles } from 'lucide-react';
import { useApp } from '../main';
import { money, track } from '../lib/api';
const colors=['pink','blue','lavender','yellow','mint'];
export default function Home(){
  const {recipients,config}=useApp(),[search,setSearch]=useState('');
  const filtered=recipients.filter(r=>r.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <>
    <section className="hero"><div className="hero-grid"><div>
      <div className="hero-kicker"><Sparkles size={16}/> UMA LEMBRANÇA QUE FICA</div>
      <h1>Tem coisas que só <em>a sua voz</em> consegue dizer.</h1>
      <p>Envie uma cartinha com palavras, fotos e áudios para alguém que está vivendo o XX Encontro de Jovens com Cristo.</p>
      <a className="btn hero-cta" href="#encontristas">Escrever uma cartinha <ArrowUpRight size={19}/></a>
    </div><div className="hero-art" aria-hidden="true"><div className="paper paper-back">COM CARINHO</div><div className="paper paper-front"><span>Para você ♡</span><strong>Que esse encontro transforme o seu mundo.</strong><i>Com carinho, alguém especial.</i><span className="paper-heart">♥</span></div><div className="floating-star">✳</div></div></div></section>
    <section className="benefits"><span><AudioLines size={17}/> Grave e regrave seu áudio</span><span><ImageIcon size={17}/> Adicione suas fotos</span><span><PenLine size={17}/> Formate sua carta</span><span><LockKeyhole size={17}/> Mural pessoal e protegido</span></section>
    <section id="encontristas" className="find-section"><div className="section-head"><div><span className="eyebrow">01 / ESCOLHA UM DESTINATÁRIO</span><h2>Para quem vai o seu carinho?</h2><p>Encontre um nome ou abra o link individual que recebeu.</p></div><span className="count-chip">{recipients.length} encontristas</span></div>
      <label className="search-box"><Search size={20}/><input type="search" placeholder="Buscar pelo nome..." value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value.length===3)track('recipient_search');}}/></label>
      <div className="recipient-grid">{filtered.map((r,i)=><Link key={r.id} className="recipient-card" to={`/enviar/${r.slug}`} onClick={()=>track('recipient_selected')}><div className={`recipient-avatar ${colors[i%colors.length]}`}>{r.photo_url?<img src={r.photo_url} alt={`Foto de ${r.name}`} loading="lazy"/>:r.name.split(' ').slice(0,2).map(x=>x[0]).join('')}</div><div className="recipient-name"><strong>{r.name}</strong><small>Enviar uma cartinha</small></div><ArrowUpRight size={20}/></Link>)}</div>
      {!filtered.length && <div className="empty">Nenhum encontrista encontrado. Confira a escrita ou tente outro nome.</div>}
      {!config?.open && <p className="notice">A criação de novas cartinhas está temporariamente pausada pela coordenação.</p>}
      {config?.amount_cents && <p className="muted small center">Contribuição por cartinha: {money(config.amount_cents)} · Pix conferido pela coordenação</p>}
    </section>
    <section className="bottom-cta"><HeartHandshake size={28}/><h2>Uma mensagem pequena. Uma memória enorme.</h2><p>A cartinha chega diretamente ao mural privado do encontrista após o horário de liberação, sem moderação pela coordenação.</p></section>
  </>;
}
