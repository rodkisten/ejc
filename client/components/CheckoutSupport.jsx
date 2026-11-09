import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { openSecureSupport } from '../lib/secureSupport.js';
import { track } from '../lib/api';
import '../styles/checkout-support.css';

export default function CheckoutSupport({
  step,
  orderId,
  checkoutId,
  recipientNames = [],
  senderName = '',
  senderPhone = '',
  checkoutToken = '',
  orderToken = '',
  orderIds = [],
  recipientSlugs = [],
}) {
  const [error,setError] = React.useState('');
  const handleSupport = async () => {
    setError('');
    try {
      await openSecureSupport({
        purpose:'support',name:senderName,phone:senderPhone,
        ids:orderIds.length?orderIds:orderId?[orderId]:[],
        checkoutId,recipientSlugs,
        token:orderToken||checkoutToken||undefined,
        stage:step||'editor',
        source:'site',medium:'botao',campaign:'suporte_cartinhas',
        content:checkoutId?'checkout':'editor'
      });
      track('support_whatsapp_clicked',{stage:checkoutId?'payment':'editor'});
    } catch(cause){setError(cause.message||'Não foi possível abrir o suporte.');}
  };

  return (
    <div className="checkout-support">
      <div className="checkout-support-copy">
        <LifeBuoy size={22} aria-hidden="true" />
        <div>
          <strong>Enfrentando problemas? A gente te ajuda! 💬</strong>
          <p>Seu atendimento abrirá com os dados do pedido protegidos por um link criptografado. A mensagem terá acesso administrativo para conferência.</p>
          <small>Não incluímos sua cartinha, o Pix completo nem o link secreto de edição.</small>
        </div>
      </div>
      {error&&<div className="notice error" role="alert">{error}</div>}
      <button type="button" className="btn outline" onClick={handleSupport}>
        Pedir ajuda no WhatsApp
      </button>
    </div>
  );
}
