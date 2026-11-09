import React from 'react';
import { Heart, LifeBuoy, RefreshCw } from 'lucide-react';
import { SUPPORT_WHATSAPP } from '../lib/checkoutSupport.js';
import '../styles/unfinished-letter.css';

const EMPTY_NAMES = new Set([
  'anônimo', 'anonimo', 'uma pessoa especial',
  'remetente não informado', 'remetente nao informado',
]);

export function displaySenderName(value) {
  const name = String(value || '').trim();
  return name && !EMPTY_NAMES.has(name.toLocaleLowerCase('pt-BR')) ? name : '';
}

export default function UnfinishedLetterNotice({ senderName, onRefresh }) {
  const author = displaySenderName(senderName);
  const supportText = 'Olá! 💌 Preciso de ajuda com uma cartinha do XX EJC Simonésia que ainda não foi finalizada.';
  const supportUrl = 'https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + encodeURIComponent(supportText);

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
      <div className="unfinished-letter-note-actions">
        {onRefresh && (
          <button className="btn outline" type="button" onClick={onRefresh}>
            <RefreshCw size={17} /> Conferir novamente
          </button>
        )}
        <a className="btn ghost" href={supportUrl} target="_blank" rel="noopener noreferrer">
          <LifeBuoy size={17} /> Precisa de ajuda? Fale com o suporte
        </a>
      </div>
      <small><Heart size={14} aria-hidden="true" /> Com carinho, equipe do Mini Mercado · XX EJC Simonésia</small>
    </article>
  );
}
