import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MailHeart, ArrowRight, LifeBuoy, LockKeyhole } from 'lucide-react';
import '../styles/pending-letter-help.css';

export default function PendingLetterHelp() {
  return (
    <main className="pending-letter-help">
      <div className="pending-letter-help__illustration" aria-hidden="true">
        <MailHeart size={58} strokeWidth={1.7} />
        <span>♡</span>
      </div>
      <p className="pending-letter-help__kicker">XX EJC SIMONÉSIA · CARTINHAS VIRTUAIS</p>
      <h1>Tem uma cartinha sua esperando para ficar completinha. <em>♡</em></h1>
      <p className="pending-letter-help__intro">
        Alguém recebeu o carinho que você começou a preparar, mas a mensagem ainda não
        apareceu inteira. E ficou com uma vontade enorme de ler cada palavra sua! 💌
      </p>

      <section className="pending-letter-help__steps" aria-label="Como terminar sua cartinha">
        <h2>Vamos terminar essa surpresa? 💗</h2>
        <ol>
          <li>Abra o <strong>link privado de edição</strong> que você recebeu ao criar sua cartinha.</li>
          <li>Confira as palavras, as fotos e os áudios. Os anexos já salvos continuam lá.</li>
          <li>Toque em <strong>Salvar rascunho</strong> se fizer alterações e depois em
            <strong> Finalizar e enviar cartinha</strong>.</li>
        </ol>
        <p>Se o texto não aparecer, tente abrir o link no mesmo celular e navegador em que o escreveu.</p>
      </section>

      <div className="pending-letter-help__actions">
        <Link to="/" className="btn">
          <ArrowRight size={18} /> Ir para as cartinhas
        </Link>
        <a className="btn outline" href="/ajuda/minha-cartinha" rel="noopener noreferrer">
          <LifeBuoy size={18} /> Preciso de ajuda da equipe
        </a>
      </div>
      <div className="pending-letter-help__privacy">
        <LockKeyhole size={18} />
        <span>Este recadinho não dá acesso à cartinha nem revela quem enviou ou recebeu.
          Para editar, use apenas o seu link privado original. Você não precisa pagar outra vez
          por uma cartinha já paga.</span>
      </div>
      <small><Heart size={14} /> Com carinho, Mini Mercado · XX EJC Simonésia</small>
    </main>
  );
}
