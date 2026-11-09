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

## Aviso de rascunhos na página inicial (visão do remetente)

Ao abrir a página principal, o navegador procura cartinhas inacabadas em:

- histórico de checkouts e links privados do `localStorage` (incluindo os links
  de pedidos individuais anteriormente abertos neste aparelho);
- índice do carrinho e rascunhos do IndexedDB `ejc-cartinhas-offline`;
- informações privadas de status obtidas por `/api/checkout` e `/api/order`,
  **somente quando há um token privado válido**.

A interface destaca **Pix confirmado · cartinha em rascunho** apenas após
confirmar o estado de pagamento no servidor. Para uma compra ainda pendente,
mostra **Pix ainda não confirmado**. Para rascunhos exclusivamente locais, mostra
**Rascunho salvo neste aparelho**, sem supor que já tenham sido pagos.

Cada item tem um botão para continuar no pedido existente (`/pedido/:token`)
ou no editor local (`/enviar/:slug`). O sistema não cria novos pagamentos e
remove do aviso cartas já enviadas. A revisão também ocorre ao voltar ao Safari
no iPhone, com prevenção de respostas desatualizadas.

Os tokens dos pedidos individuais passam a ser lembrados neste aparelho quando
o remetente abre um link válido, permitindo retornar à edição pela home.
Isso não cria um índice público e não recupera pedidos de outro navegador sem
seu link privado. Nunca são guardados textos ou anexos no histórico de links.

O aviso mantém intactas as mensagens e políticas de privacidade existentes.
