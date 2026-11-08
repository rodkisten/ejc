import React from 'react';
import QrCode from './QrCode';
import '../styles/photo-poster.css';

// Live QR is rendered on top of vector-like print CSS, never painted into a
// generated picture. This keeps its exact destination and scan quality.
export default function PhotoPoster({ value, recipientName, photoUrl }) {
  return (
    <article className="ejc-photo-poster" aria-label="Cartaz A4 para enviar cartinhas">
      <div className="poster-paper poster-paper-blue" aria-hidden="true" />
      <div className="poster-paper poster-paper-orange" aria-hidden="true" />
      <div className="poster-paper poster-paper-violet" aria-hidden="true" />
      <div className="poster-paper poster-paper-bottom" aria-hidden="true" />
      <span className="poster-doodle poster-doodle-heart" aria-hidden="true">♡</span>
      <span className="poster-doodle poster-doodle-star" aria-hidden="true">✺</span>
      <span className="poster-doodle poster-doodle-spark" aria-hidden="true">✧</span>
      <span className="poster-doodle poster-doodle-bird" aria-hidden="true">✝</span>
      <span className="poster-pixel-heart" aria-hidden="true">♥</span>
      <header className="poster-brand">
        <strong>XX EJC</strong>
        <span>Simonésia-MG</span>
      </header>
      <svg className="poster-wood-cross" viewBox="0 0 230 310" aria-hidden="true">
        <defs>
          <linearGradient id="poster-wood" x1="0" x2="1">
            <stop stopColor="#51210c" />
            <stop offset=".35" stopColor="#a94c1d" />
            <stop offset=".72" stopColor="#76300e" />
            <stop offset="1" stopColor="#3a1409" />
          </linearGradient>
        </defs>
        <circle cx="105" cy="145" r="103" fill="#ffc928" />
        <path d="M102 18h43v70h75v44h-75v164h-43V132H21V88h81z" fill="url(#poster-wood)" stroke="#fff9e9" strokeWidth="10" strokeLinejoin="round" />
        <path d="M27 99c34 11 40 93 72 98 38 8 58-83 96-97l10 22c-30 21-54 113-105 109-53-4-70-89-84-108z" fill="#fff2e2" stroke="#efdbcc" strokeWidth="4" />
        <path d="M25 123l-9 88 26-6 16-54M205 122l9 93-33-10-11-53" fill="#fff2e2" stroke="#efdbcc" strokeWidth="4" />
      </svg>
      <section className="poster-headline">
        <span>Envie sua</span>
        <strong>cartinha!</strong>
        <i aria-hidden="true">♡</i>
      </section>
      <div className={photoUrl ? 'poster-wish with-photo' : 'poster-wish'}>
        <span>{recipientName ? 'UM CARINHO PARA' : 'PARABENIZE UM ENCONTRISTA'}</span>
        {recipientName ? <strong style={{ fontSize: recipientName.length > 32 ? '3cqw' : recipientName.length > 20 ? '3.6cqw' : '4.4cqw' }}>{recipientName}</strong> : <strong>com fé e carinho</strong>}
      </div>
      {photoUrl && (
        <div className="poster-photo">
          <img src={photoUrl} alt={'Foto de ' + recipientName} />
        </div>
      )}
      <section className="poster-scan">
        <div className="poster-scan-title">ESCANEIE O QR CODE</div>
        <div className="poster-qr-plate">
          <QrCode value={value} size={480} variant="print" />
        </div>
        <div className="poster-scan-caption">
          Aponte a câmera do celular e escreva sua homenagem!
        </div>
      </section>
      <span className="poster-doodle poster-doodle-chalice" aria-hidden="true">✝</span>
      <span className="poster-doodle poster-doodle-sun" aria-hidden="true">☀</span>
      <footer className="poster-bottom">
        <span>UMA MENSAGEM. UMA LEMBRANÇA. MUITO AMOR.</span>
        <strong>XX EJC · SIMONÉSIA-MG</strong>
      </footer>
    </article>
  );
}
