# Revisão de rascunhos pagos e links de continuação

## Para a administração

1. Entre normalmente em **/admin/cartinhas**. A sessão administrativa já permite usar
   **Ver cartinha completa**. Não é necessário token de remetente nem senha técnica adicional.
2. Abra uma cartinha para ver **texto, stickers, fotos e áudios finalizados no servidor**.
   Os arquivos são carregados sob a mesma sessão administrativa e não recebem links públicos.
3. Se estiver paga, ainda como rascunho e com conteúdo salvo, use
   **Revisei o conteúdo · aprovar e enviar esta cartinha**. Há também um botão de
   finalização em massa para rascunhos pagos elegíveis.
4. Para um rascunho pago vazio, use **Criar link para [nome do remetente] continuar**.
   **Copiar mensagem e link** prepara a mensagem identificando o remetente para
   envio privado no WhatsApp. Não há envio automático ao remetente.

## Link de recuperação

- É um link privado para **/pedido/**, com assinatura criptográfica HMAC e validade
  de **14 dias**. Não expõe nem substitui o token original do pedido, que é guardado
  apenas na forma de hash.
- Só pode ser emitido por uma sessão administrativa autenticada, para cartinha
  **paga e não enviada**. Ele permite finalizar a edição desta cartinha mesmo após
  a data geral de encerramento da campanha.
- Não libera a compra de novas cartinhas, altera Pix ou antecipa a abertura do mural.
  Depois que a cartinha é enviada, o link de recuperação não dá mais acesso de edição.
- Um link deve ser compartilhado exclusivamente com o remetente desejado. Quem
  possui esse link tem acesso ao rascunho particular durante a validade.
- O conteúdo que existe apenas no IndexedDB do aparelho do remetente não pode
  ser recuperado no servidor. O remetente deverá abrir o link e reenviar o que
  ainda não estiver sincronizado.

## Segurança e comunicação

A listagem geral ainda transmite apenas metadados e o indicador **has_content**.
Somente ao abrir a prévia individual autenticada o navegador carrega texto ou mídia.
Todas as prévias e anexos possuem `Cache-Control: no-store` e não geram
notificações de leitura. As operações de finalização continuam auditadas.

**Importante:** os textos e avisos de privacidade já existentes na aplicação
foram mantidos a pedido do responsável. Alguns afirmam que a coordenação não pode
ler ou ouvir cartinhas; com esta funcionalidade de administração, essa afirmação
deixa de ser literalmente verdadeira. A comunicação de privacidade precisa ser
alinhada quando houver autorização para revisá-la.
