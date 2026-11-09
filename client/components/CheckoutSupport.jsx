import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { checkoutSupportHref } from '../lib/checkoutSupport';
import { track } from '../lib/api';
import '../styles/checkout-support.css';

export default function CheckoutSupport({
  step,
  orderId,
  checkoutId,
  recipientNames = [],
}) {
  // Only composed when the user elects to open WhatsApp, never persisted.
  const handleSupport = () => {
    const href = checkoutSupportHref({
      step,
      orderId,
      checkoutId,
      recipientNames,
      url: window.location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: window.innerWidth + '×' + window.innerHeight,
      online: navigator.onLine ? 'Online' : 'Offline',
      timestamp: new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      }),
    });
    track('support_whatsapp_clicked',{stage:step?.includes('Pix')?'payment':'editor'});
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="checkout-support">
      <div className="checkout-support-copy">
        <LifeBuoy size={22} aria-hidden="true" />
        <div>
          <strong>Enfrentando problemas? A gente te ajuda! 💬</strong>
          <p>Seu WhatsApp abrirá com destinatário, código do pedido e dados técnicos para a equipe identificar o problema.</p>
          <small>Não incluímos sua cartinha, o Pix completo nem o link secreto de edição.</small>
        </div>
      </div>
      <button type="button" className="btn outline" onClick={handleSupport}>
        Pedir ajuda no WhatsApp
      </button>
    </div>
  );
}
