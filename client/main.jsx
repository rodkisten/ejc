import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Instagram, ShieldCheck, ShoppingBag } from 'lucide-react';
import { CartProvider, useCart } from './lib/cart';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import './styles/cart.css';
import { api, enableAnalytics, track } from './lib/api';
import Home from './pages/Home';
import Send from './pages/Send';
import Order from './pages/Order';
import Mural from './pages/Mural';
import Admin from './pages/Admin';
import Unlock from './pages/Unlock';
import ConfirmEmail from './pages/ConfirmEmail';
import './styles/email-read.css';
import Privacy from './pages/Privacy';
import './styles.css';
import './legacy-theme.css';
import './styles/stickers.css';
import './styles/sticker-picker.css';
import './styles/sticker-layer.css';
import './styles/letter-controls.css';
import './styles/letter-canvas.css';
import './styles/instagram-export.css';

export const AppContext=React.createContext({ config:null, recipients:[], reload:async()=>{} });
export function useApp(){return React.useContext(AppContext);}
function Shell({children}) {
  const path=useLocation().pathname;
  const [consent,setConsent]=useState(localStorage.getItem('ejc-consent'));
  const {config}=useApp();
  const cart=useCart();
  const navigate=useNavigate();
  useEffect(()=>{
    // Nunca encaminhar códigos, tokens ou caminhos privados ao Google Analytics.
    const safePath=path.startsWith('/pedido/')?'/pedido/:privado':
      path.startsWith('/mural/')?'/mural/:privado':
      path.startsWith('/enviar/')?'/enviar/:encontrista':path;
    track('page_view',{page_path:safePath});
    window.scrollTo(0,0);
  },[path]);
  const choose = accepted => { const value=accepted?'yes':'no';localStorage.setItem('ejc-consent',value);setConsent(value);if(accepted)enableAnalytics(config?.analytics_id); };
  return <div className="app-shell">
    <header className="site-header"><div className="container header-inner">
      {path !== '/' ? <button className="icon-button" aria-label="Voltar" onClick={()=>navigate(-1)}><ArrowLeft size={20}/></button> : <Heart size={23} className="header-heart"/>}
      <Link to="/" className="brand">cartinhas<span className="brand-spark">💌</span><small>XX EJC · SIMONÉSIA</small></Link>
      <div className="header-actions"><Link to="/abrir" className="header-link">Abrir meu mural</Link><Link to="/carrinho" className="header-cart" aria-label={"Meu carrinho com " + cart.items.length + " cartinhas"}><ShoppingBag size={19}/><span>Carrinho</span>{cart.items.length>0&&<b>{cart.items.length}</b>}</Link></div>
    </div></header>
    <main className="container page">{children}</main>
    <footer className="container site-footer"><span>XX EJC Simonésia · 2026</span><span>Feito com amor pela <strong>equipe do Mini Mercado</strong> e arquitetado por Rodolfo Costa</span><Link to="/privacidade">Privacidade e segurança</Link></footer>
    {!consent && config?.analytics_id && <aside className="consent-panel" aria-label="Preferências de análise"><div>Usamos estatísticas de navegação somente com seu consentimento. Não enviamos textos, fotos, áudios nem códigos privados ao Analytics.</div><div className="inline-actions"><button onClick={()=>choose(false)} className="btn ghost">Agora não</button><button onClick={()=>choose(true)} className="btn">Permitir métricas</button></div></aside>}
  </div>;
}
function App(){
  const [publicData,setPublicData]=useState({config:null,recipients:[]}),[error,setError]=useState('');
  const reload=async()=>{try{const data=await api('/api/public');setPublicData(data);enableAnalytics(data.config?.analytics_id);}catch(e){setError(e.message);}};
  useEffect(()=>{reload();},[]);
  return <AppContext.Provider value={{...publicData,reload}}><Shell>
    {error && <div className="notice error">Não foi possível carregar as configurações: {error} <button onClick={reload}>Tentar novamente</button></div>}
    <Routes>
      <Route index element={<Home/>}/>
      <Route path="/enviar/:slug" element={<Send/>}/>
      <Route path="/carrinho" element={<Cart/>}/>
      <Route path="/checkout/:token" element={<Checkout/>}/>
      <Route path="/pedido/:token" element={<Order/>}/>
      <Route path="/mural/:slug" element={<Mural/>}/>
      <Route path="/abrir" element={<Unlock/>}/>
      <Route path="/confirmar-email" element={<ConfirmEmail/>}/>
      <Route path="/privacidade" element={<Privacy/>}/>
      <Route path="/publicas" element={<div className="empty"><h1>As cartinhas são privadas 🔐</h1><p>Não há galeria pública. A leitura exige o código ou link pessoal do encontrista.</p><Link className="btn" to="/abrir">Abrir meu mural</Link></div>}/>
      <Route path="/admin/*" element={<Admin/>}/>
      <Route path="*" element={<div className="empty"><h1>Essa página não existe.</h1><Link className="btn" to="/">Voltar ao início</Link></div>}/>
    </Routes>
  </Shell></AppContext.Provider>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><CartProvider><App/></CartProvider></BrowserRouter>);
