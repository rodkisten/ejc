# Finalizar cartinhas pagas que continuam como rascunho

## Por que acontece?

O pagamento Pix e o envio da cartinha são etapas independentes. A confirmação
bancária altera o pedido para `paid`, mas `submitted_at` continua vazio até
o remetente usar **Enviar ao mural privado**. A tela de WhatsApp só conta como
**prontas** as cartinhas que estejam **pagas E enviadas**.

## Solução para a coordenação

1. Faça login no painel e abra **Admin → Cartinhas**.
2. Em **Finalizar cartinhas pagas**, confira os três indicadores:
   - **Rascunhos pagos:** ainda não enviados, mas com pagamento confirmado;
   - **Com conteúdo salvo:** têm texto legível, foto ou áudio finalizado no servidor;
   - **Sem conteúdo:** permanecem como rascunhos, pois não há o que entregar.
3. Toque **Finalizar N cartinhas pagas** e autorize uma única vez.
4. Mantenha o navegador aberto enquanto o progresso avança. O servidor faz
   lotes de até 40 cartinhas e o cliente percorre todos os lotes automaticamente.
5. Atualize a aba WhatsApp e confira a quantidade de encontristas com cartinhas prontas.

A finalização **não envia mensagem de WhatsApp automaticamente**. Ela prepara as
cartinhas para o mural privado, que continua respeitando o horário de liberação.

## Regras de segurança

- Apenas administradores autenticados conseguem executar a operação.
- O sistema nunca finaliza pedidos `pending`, `claimed` ou `cancelled`.
- Não finaliza cartinhas sem texto nem mídia pronta no armazenamento.
- Verifica e atualiza `submitted_at` apenas quando ainda é nulo, evitando
  finalizações duplicadas e mantendo os links existentes.
- A API retorna apenas totais, IDs de falhas e progresso; não envia mensagem,
  HTML, foto, áudio ou token privado da cartinha à coordenação.
- O evento `letter_sent` recebe marcador de auditoria `admin_bulk_finalize`.
- Falhas de notificação são sinalizadas separadamente da finalização.

## Se nada aparecer como elegível

Uma cartinha **Pago · rascunho** pode ter texto apenas no IndexedDB do
remetente, ou foto/áudio que ainda não foi sincronizado. Nesses casos,
somente o remetente com seu link privado pode confirmar/sincronizar o material.
A coordenação não consegue recuperar conteúdo que nunca foi salvo no servidor.
