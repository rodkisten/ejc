import React from 'react';
import QrCode from './QrCode';
import '../styles/mini-qr-cards.css';

const palettes = ['coral', 'purple', 'blue', 'sunny', 'pink'];

export default function MiniQrCard({ value, recipientName, index = 0 }) {
  return (
    <article className={'ejc-mini-card mini-' + palettes[index % palettes.length]}
      aria-label={'Cartão QR para enviar cartinha' + (recipientName ? ' a ' + recipientName : '')}>
      <div className="mini-paper mini-paper-top" aria-hidden="true" />
      <div className="mini-paper mini-paper-bottom" aria-hidden="true" />
      <span className="mini-doodle mini-heart" aria-hidden="true">♡</span>
      <span className="mini-doodle mini-star" aria-hidden="true">✳</span>
      <svg className="mini-cross" viewBox="0 0 84 105" aria-hidden="true">
        <path d="M30 5h23v25h27v24H53v46H30V54H3V30h27z"
          fill="#8c3e1c" stroke="#fffaf4" strokeWidth="5" strokeLinejoin="round" />
        <path d="M5 42c15 3 19 21 32 29C51 76 62 49 77 41l-5 15c-16 30-27 38-39 34C21 85 15 60 5 56z"
          fill="#fff0e1" stroke="#edcfb4" strokeWidth="2" />
      </svg>
      <div className="mini-copy">
        <span className="mini-logo">XX EJC <em>SIMONÉSIA-MG</em></span>
        <div className="mini-headline">
          <span>ENVIE SUA</span>
          <strong>CARTINHA!</strong>
        </div>
        {recipientName && (
          <div className="mini-name">
            <small>PARA</small>
            <strong>{recipientName}</strong>
          </div>
        )}
        <div className="mini-footline">UM CARINHO COM FÉ ♡</div>
      </div>
      <div className="mini-qr-block">
        <div className="mini-qr-white">
          <QrCode value={value} size={160} variant="print" />
        </div>
        <span>ESCANEIE AQUI <b>✦</b></span>
      </div>
    </article>
  );
}
