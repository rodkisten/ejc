import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LockKeyhole, ArrowRight, ShieldCheck } from 'lucide-react';
import { api, track } from '../lib/api';

const normaliseCode = (value) =>
  String(value || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);

export default function Unlock() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initialised = useRef(false);

  async function unlock(value) {
    const clean = normaliseCode(value);
    if (clean.length !== 6) {
      setError('O código deve ter seis caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/mural/redeem', {
        method: 'POST',
        data: { code: clean },
      });
      track('mural_code_redeemed');
      navigate(`/mural/${encodeURIComponent(result.slug)}#token=${encodeURIComponent(result.grant)}`, {
        replace: true,
      });
    } catch (cause) {
      setError(cause.message || 'Não foi possível verificar o código.');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const incoming = new URLSearchParams(window.location.search).get('codigo');
    if (!incoming) return;
    // Remove the printed code from history before analytics or further requests.
    window.history.replaceState(window.history.state, '', '/abrir');
    const clean = normaliseCode(incoming);
    setCode(clean);
    if (clean.length === 6) unlock(clean);
  }, []);

  return (
    <section className="unlock-page">
      <div className="unlock-icon" aria-hidden="true"><KeyRound size={34} /></div>
      <span className="eyebrow">XX EJC SIMONÉSIA · MURAL SECRETO</span>
      <h1>Sua cartinha está esperando por você. <em>♡</em></h1>
      <p>
        Escaneie o QR Code da etiqueta que recebeu ou digite abaixo o código
        de seis caracteres impresso no seu cartão.
      </p>
      <form
        className="form-card unlock-form"
        onSubmit={(event) => { event.preventDefault(); unlock(code); }}
      >
        <label htmlFor="mural-code">Código do seu mural</label>
        <input
          id="mural-code"
          value={code}
          onChange={(event) => { setCode(normaliseCode(event.target.value)); setError(''); }}
          maxLength={6}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="ABC234"
          aria-invalid={!!error}
          aria-describedby={error ? 'mural-code-error' : undefined}
          className="mural-code-input"
          required
        />
        {error && <p id="mural-code-error" className="notice error" role="alert">{error}</p>}
        <button className="btn wide" disabled={busy || code.length !== 6} type="submit">
          {busy ? 'Verificando seu código...' : 'Abrir meu mural'}
          {!busy && <ArrowRight size={18} />}
        </button>
      </form>
      <p className="unlock-privacy"><LockKeyhole size={16} />
        Este código é pessoal. Guarde-o e não publique nas redes sociais.
      </p>
      <p className="muted small"><ShieldCheck size={15} />
        As mensagens só aparecem após a aprovação e no horário de liberação do encontro.
      </p>
    </section>
  );
}
