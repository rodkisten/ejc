import React,{useCallback,useEffect,useState} from 'react';
import {useParams,Link} from 'react-router-dom';
import { Download, LockKeyhole, Sparkles } from 'lucide-react';
import { api, track } from '../lib/api';
import {LetterCard,saveAllCards} from '../components/LetterCard';
export default function Mural(){
  const {slug}=useParams(),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{
      const token=new URLSearchParams(location.hash.slice(1)).get('token');
      const r=await api(`/api/mural/${encodeURIComponent(slug)}`,{token:token||undefined});setData(r);setError('');track('mural_view');
    }catch(e){setError(e.message);}
  },[slug]);
  useEffect(()=>{load();},[load]);
  return <div className="mural-page"><div className="mural-intro">{data?.recipient?.photo_url&&<img className="mural-portrait" src={data.recipient.photo_url} alt={`Foto de ${data.recipient.name}`}/>}<div className="hero-kicker"><LockKeyhole size={16}/> ESTE É UM ESPAÇO SECRETO</div><h1>{data?.recipient?.name ? `O mural de ${data.recipient.name}` : 'Um cantinho só seu.'} <em>♡</em></h1><p>Uma coleção de palavras, memórias, fotos e vozes que alguém guardou especialmente para você.</p></div>
    {error&&<div className="form-card"><h2>Convite privado necessário 🔐</h2><p>{error}</p><p>Abra a página de acesso e digite os seis caracteres da sua etiqueta. Apenas o nome do encontrista não libera o conteúdo.</p><Link to="/abrir" className="btn">Digitar meu código</Link></div>}
    {data&&<><div className="mural-count"><Sparkles size={18}/> {data.cards.length} {data.cards.length===1?'cartinha especial':'cartinhas especiais'} para você</div>
      {data.locked&&<div className="notice warning">O mural abre no horário de liberação configurado. A coordenação não lê nem escuta as homenagens neste sistema.</div>}
      {data.cards.length===0?<div className="empty"><h2>O carinho está a caminho. 💌</h2><p>As mensagens enviadas aparecerão automaticamente no horário de liberação do encontro.</p></div>:<><div className="mural-cards">{data.cards.map(letter=><LetterCard key={letter.id} letter={letter} recipient={data.recipient.name}/>)}</div><button className="btn outline wide" disabled={busy} onClick={async()=>{setBusy(true);try{await saveAllCards(data.cards,data.recipient.name);}catch(e){setError(e.message);}finally{setBusy(false);}}}><Download size={18}/> {busy?'Montando arquivos...':'Baixar todas as cartinhas em ZIP'}</button></>}
      <p className="muted small center spaced">Seu link ou código é pessoal: qualquer pessoa que o possua poderá acessar o mural. Mantenha-o em segredo.</p></>}
  </div>;
}
