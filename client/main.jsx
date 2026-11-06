import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, Instagram, ShieldCheck } from 'lucide-react';
import { api, enableAnalytics, track } from './lib/api';
import Home from './pages/Home';
import Send from './pages/Send';
import Order from './pages/Order';
import Mural from './pages/Mural';
import PublicLetters from './pages/PublicLetters';
import Admin from './pages/Admin';
import './styles.css';

export const AppContext = React.createContext({ config: null, recipients: [], reload: async () => {} });
export function useApp() {
  return React.useContext(AppContext);
}
function Shell({ children }) {
  const path = useLocation().pathname;
  const [consent, setConsent] = useState(localStorage.getItem('ejc-consent'));
  const { config } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    track('page_view', { page_path: path });
    window.scrollTo(0, 0);
  }, [path]);
  const choose = (accepted) => {
    const value = accepted ? 'yes' : 'no';
    localStorage.setItem('ejc-consent', value);
    setConsent(value);
    if (accepted) enableAnalytics(config?.analytics_id);
  };
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container header-inner">
          {path !== '/' ? (
            <button className="icon-button" aria-label="Voltar" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
          ) : (
            <Heart size={23} className="header-heart" />
          )}
          <Link to="/" className="brand">
            cartinhas<span className="brand-spark">✳</span>
            <small>XX EJC · SIMONÉSIA</small>
          </Link>
          <Link to="/publicas" className="header-link">
            Cartinhas públicas
          </Link>
        </div>
      </header>
      <main className="container page">{children}</main>
      <footer className="container site-footer">
        <span>XX EJC Simonésia · 2026</span>
        <span>
          Feito com amor por <strong>Rod Costa</strong> ♡
        </span>
      </footer>
      {!consent && config?.analytics_id && (
        <aside className="consent-panel" aria-label="Preferências de análise">
          <div>
            Usamos métricas anônimas apenas com sua permissão. Nenhum texto, foto ou áudio vai para o
            Analytics.
          </div>
          <div className="inline-actions">
            <button onClick={() => choose(false)} className="btn ghost">
              Agora não
            </button>
            <button onClick={() => choose(true)} className="btn">
              Permitir métricas
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
function App() {
  const [publicData, setPublicData] = useState({ config: null, recipients: [] }),
    [error, setError] = useState('');
  const reload = async () => {
    try {
      const data = await api('/api/public');
      setPublicData(data);
      enableAnalytics(data.config?.analytics_id);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  return (
    <AppContext.Provider value={{ ...publicData, reload }}>
      <Shell>
        {error && (
          <div className="notice error">
            Não foi possível carregar as configurações: {error}{' '}
            <button onClick={reload}>Tentar novamente</button>
          </div>
        )}
        <Routes>
          <Route index element={<Home />} />
          <Route path="/enviar/:slug" element={<Send />} />
          <Route path="/pedido/:token" element={<Order />} />
          <Route path="/mural/:slug" element={<Mural />} />
          <Route path="/publicas" element={<PublicLetters />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route
            path="*"
            element={
              <div className="empty">
                <h1>Essa página não existe.</h1>
                <Link className="btn" to="/">
                  Voltar ao início
                </Link>
              </div>
            }
          />
        </Routes>
      </Shell>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
