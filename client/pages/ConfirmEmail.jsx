import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, LockKeyhole } from 'lucide-react';
import { api } from '../lib/api';

export default function ConfirmEmail() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(incoming);
    window.history.replaceState(window.history.state, '', '/confirmar-email');
  }, []);
  async function confirm() {
    if (!token) return;
    setStatus('loading');
    try {
      await api('/api/receipt/confirm', { method: 'POST', data: { token } });
      setToken('');
      setStatus('done');
    } catch (cause) {
      setStatus('error');
      setMessage(cause.message);
    }
  }
  return (
    <div className="email-confirm">
      <MailCheck size={46} aria-hidden="true" />
      <span className="eyebrow">AVISO DE LEITURA · XX EJC</span>
      <h1>Um carinho que volta até você. 💌</h1>
      {status === 'done' ? (
        <div className="notice success" role="status">
          E-mail confirmado! Quando sua cartinha for aberta no mural, avisaremos uma única vez.
        </div>
      ) : (
        <>
          <p>Confirme que este e-mail é seu para receber um aviso quando o encontrista abrir sua cartinha.</p>
          {status === 'error' && <p className="notice error" role="alert">{message}</p>}
          <button className="btn" type="button" disabled={!token || status === 'loading'}
            onClick={confirm}>{status === 'loading' ? 'Confirmando...' : 'Confirmar meu e-mail'}</button>
          {!token && status !== 'error' && <p className="muted small">
            Link não encontrado. Abra novamente o botão recebido no e-mail.
          </p>}
        </>
      )}
      <p className="muted small"><LockKeyhole size={14} />
        A coordenação não recebe seu e-mail nem o conteúdo privado da homenagem.</p>
      <Link to="/" className="text-button">Voltar ao início</Link>
    </div>
  );
}
