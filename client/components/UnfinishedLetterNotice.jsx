import React, { useState } from 'react';
import { Heart, LifeBuoy, RefreshCw, MessageCircleHeart, Copy } from 'lucide-react';
import '../styles/unfinished-letter.css';

const EMPTY_NAMES = new Set([
  'anônimo', 'anonimo', 'uma pessoa especial',
  'remetente não informado', 'remetente nao informado',
]);

export function displaySenderName(value) {
  const name = String(value || '').trim();
  return name && !EMPTY_NAMES.has(name.toLocaleLowerCase('pt-BR')) ? name : '';
}

export default function UnfinishedLetterNotice({
  senderName, onRefresh, onSupportClick, onRequestCompletion,
}) {
  const author = displaySenderName(senderName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shortUrl, setShortUrl] = useState('');
  const [copied, setCopied] = useState(false);

  async function requestCompletion() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const url = await onRequestCompletion();
      if (url) setShortUrl(url);
    } catch (cause) {
      setError(cause.message || 'Não foi possível preparar a mensagem.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
    } catch {
      window.prompt('Copie este link:', shortUrl);
    }
  }

  return (
    <article className="unfinished-letter-note" aria-label="Cartinha ainda em preparação">
      <div className="unfinished-letter-note-icon" aria-hidden="true">💌</div>
      <span className="unfinished-letter-note-kicker">UM CARINHO AINDA EM PREPARAÇÃO</span>
      <h2>Essa cartinha ainda está sendo escrita. <span>♡</span></h2>
      <p>Alguém começou a preparar uma surpresa cheia de carinho para você,
        mas ainda não conseguiu terminar. Volte mais tarde para conferir.
        Algumas palavras bonitas merecem um pouquinho mais de tempo. 💜</p>
      {author ? (
        <p className="unfinished-letter-note-sender">
          Se você conhece <strong>{author}</strong>, pode pedir com carinho que essa pessoa
          entre em <a href="https://ejc.migos.club/?utm_source=mural_cartinha_rascunho" target="_blank" rel="noopener noreferrer">
            ejc.migos.club
          </a>, retome seu rascunho pelo link privado e finalize o envio da cartinha.
        </p>
      ) : (
        <p className="unfinished-letter-note-sender">
          Quem começou esta cartinha pode voltar a <a href="https://ejc.migos.club/?utm_source=mural_cartinha_rascunho"
            target="_blank" rel="noopener noreferrer">ejc.migos.club</a>,
          abrir seu rascunho pelo link privado e finalizar o envio.
        </p>
      )}
      {onRequestCompletion && (
        <p className="unfinished-letter-note-invitation">
          💗 Que tal pedir para essa pessoa concluir a cartinha? Preparamos uma mensagem
          delicada para você enviar, agradecendo pelo carinho e demonstrando vontade de ler.
        </p>
      )}
      <div className="unfinished-letter-note-actions">
        {onRequestCompletion && (
          <button className="btn unfinished-letter-note-whatsapp" type="button"
            disabled={busy} onClick={requestCompletion}>
            <MessageCircleHeart size={19} />
            {busy ? 'Preparando mensagem…' : 'Pedir para concluir pelo WhatsApp'}
          </button>
        )}
        {onRefresh && (
          <button className="btn outline" type="button" onClick={onRefresh}>
            <RefreshCw size={17} /> Conferir novamente
          </button>
        )}
        {onSupportClick
          ? <button type="button" className="btn ghost" onClick={onSupportClick}>
              <LifeBuoy size={17}/> Precisa de ajuda? Fale com o suporte
            </button>
          : <a className="btn ghost" href="/ajuda/minha-cartinha" target="_blank" rel="noopener noreferrer">
              <LifeBuoy size={17}/> Precisa de ajuda? Fale com o suporte
            </a>}
      </div>
      {shortUrl && (
        <div className="unfinished-letter-note-share-link">
          <span>Seu link curtinho para enviar 💌</span>
          <div>
            <a href={shortUrl} target="_blank" rel="noopener noreferrer">{shortUrl}</a>
            <button className="btn ghost" type="button" onClick={copyLink}>
              <Copy size={16} /> {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="unfinished-letter-note-error" role="alert">{error}</p>}
      <small><Heart size={14} aria-hidden="true" /> Com carinho, equipe do Mini Mercado · XX EJC Simonésia</small>
    </article>
  );
}
