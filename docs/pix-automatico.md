# Pix: conciliação automática, sem falsos positivos

**Estado atual:** o QR mostra uma cobrança Pix estática com valor e identificador `txid`, destinada à chave bancária configurada. A única confirmação real que o sistema faz hoje é a **conferência manual** da entrada do dinheiro pela coordenação. O clique do comprador em "Já paguei" não confirma o Pix.

## Opção A: API do banco que recebe

Perguntar primeiro à coordenação **qual é o banco e o tipo da conta (PF/PJ)**. Se a conta possuir API Pix do recebedor, habilitar credenciais, cobranças identificadas por `txid` e webhook de liquidação. Não assumir que uma chave Pix de conta pessoal dá acesso à API. O Banco do Brasil, por exemplo, documenta API Pix para PJ habilitada.

## Opção B: provedor de cobranças

Exemplo Woovi/OpenPix: criar cobrança via API com `correlationID` igual ao pedido e o valor em centavos; armazenar o identificador do provedor no D1; usar o BR Code retornado para pagar. O evento de webhook `OPENPIX:CHARGE_COMPLETED` informa pagamento confirmado. Nesse caso, **o recebedor passa a receber pela conta do provedor**, não necessariamente pela chave Pix bancária atual. Verificar titularidade, habilitação e tarifas.

## Fluxo do backend (quando houver uma conta habilitada)

1. `POST /api/orders` cria o pedido em `pending`, com `provider_charge_id`, `correlation_id`, valor e expiração.
2. Chamada autenticada ao banco/provedor cria uma cobrança Pix identificada. **Nunca** deixar credencial do PSP no frontend.
3. `POST /api/webhooks/pix` é recebido no Worker. **Validar assinatura HMAC ou credencial e, se necessário, consultar a cobrança na API do PSP**, sem confiar cegamente nos dados recebidos.
4. Confirmar o `provider_charge_id`, `correlation_id`, valor, moeda BRL e status de liquidação real. Não usar apenas o nome do pagador nem o mesmo valor como correspondência.
5. Gravar um evento único no D1 (`provider_event_id` com índice UNIQUE), deduplicar reenvios, verificar que o pagamento não está estornado e fazer transição atômica `pending/claimed -> paid`.
6. A interface consulta `GET /api/order` e desbloqueia texto, foto e áudio somente quando o servidor confirmar `paid`.
7. Reconciliar cobranças pendentes periodicamente com a API do provedor para tratar perda de webhook, com logs e alertas no admin.
8. Manter revisão manual como fallback; registrar quem aprovou e qual comprovante bancário foi validado.

**Nunca** liberar conteúdo apenas porque um QR Code foi lido, porque um usuário clicou "Já paguei" ou porque chegou um webhook sem autenticidade verificada.

### Pontos pendentes antes da ativação

- Escolher banco/provedor e verificar conta habilitada, tarifas e prazo de ativação.
- Obter credenciais e segredo de validação no Secret Manager/Workers secrets, não no GitHub.
- Implementar e testar o adaptador do provedor e persistência idempotente, incluindo eventos duplicados e pagamentos de valor divergente.
- Confirmar um Pix real de pequeno valor e um cenário de cancelamento/estorno.

### Referências oficiais

- https://www.bb.com.br/site/developers/api-pix/
- https://developers.woovi.com/
- https://developers.woovi.com/docs/boleto/boleto-webhook
- https://docs.asaas.com/
