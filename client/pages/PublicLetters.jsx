import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Globe2,ShieldCheck} from 'lucide-react';
import {api,track} from '../lib/api';
import {LetterCard} from '../components/LetterCard';
export default function PublicLetters(){
  const [cards,setCards]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{api('/api/publicas').then(x=>{setCards(x.cards);track('public_gallery_open');}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  return <div className="public-page"><div className="section-head"><div><span className="eyebrow"><Globe2 size={14}/> GALERIA PÚBLICA</span><h1>Cartinhas que podem ser compartilhadas. <em>♡</em></h1><p>Apenas homenagens autorizadas por quem enviou, aprovadas pela coordenação e liberadas para leitura.</p></div><ShieldCheck size={33}/></div>
    {loading&&<div className="loading">Buscando cartinhas...</div>}{error&&<div className="notice error">{error}</div>}
    {!loading&&!cards.length&&<div className="empty"><h2>Por enquanto, nenhuma cartinha pública.</h2><p>A privacidade vem primeiro. A maioria das mensagens ficará no mural secreto de cada encontrista.</p><Link to="/" className="btn">Enviar uma cartinha</Link></div>}
    <div className="mural-cards">{cards.map(letter=><LetterCard key={letter.id} letter={letter}/>)}</div>
  </div>;
}
