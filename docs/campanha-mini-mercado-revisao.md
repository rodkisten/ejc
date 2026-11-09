# Campanha oficial Mini Mercado · XX EJC Simonésia

## Carta gratuita para todos

Em **Admin → WhatsApp**, abra a seção **Uma carta para cada encontrista**.

- Edite o título, a história, a fonte, o papel e até seis stickers PNG originais.
- O editor usa Markdown simples: dois asteriscos para negrito, sublinhados para itálico,
  e ## para títulos. A prévia usa o componente real da cartinha, com adesivos arrastáveis.
- Edite a mensagem para WhatsApp. Variáveis: {nome}, {link}, {quantidade}.
- Salve a edição e clique **Publicar carta para TODOS os encontristas**.

O sistema cria um **presente gratuito**, sem Pix nem venda, assinado pelo
**Mini Mercado XX EJC Simonésia** para cada encontrista ativo. A publicação
é idempotente, sem duplicar cartas. Ao publicar de novo, apenas cartas que ainda
não foram lidas são atualizadas; as já lidas são preservadas.

As cartas seguem a data de liberação normal do mural. O conteúdo das cartas
particulares permanece privado.

## WhatsApp com controle de envio

- Filtre por **Campanha não enviada**.
- Toque **Enviar carta do Mini Mercado** no encontrista.
- O WhatsApp abre com o texto e o link pessoal contendo prévia OG.
- Anexe manualmente a imagem PNG se quiser enviá-la como arquivo.
- Quando voltar, confirme: **Você enviou a imagem E a mensagem?**
- **Sim, enviei** grava data e contagem de envios no banco; **Ainda não enviei**
  não marca o contato.
- O botão vira **Enviado ✅ · Reenviar** e permanece clicável.
- Os convites antigos do mural possuem histórico separado.

O navegador não pode provar que uma mensagem ou imagem foi enviada pelo
WhatsApp; o registro é uma declaração manual da coordenação.

## Rascunhos pagos: revisão com senha técnica

1. Acesse Admin → Cartinhas?secret=000000. A URL só mostra a interface, não libera dados.
2. Informe a senha TECH_PREVIEW_SECRET do Worker, com pelo menos 20 caracteres,
   além do login de administrador.
3. Filtre **Pagos que ainda são rascunhos**.
4. Abra **Conferir layout completo**. Texto e anexos aparecem apenas nessa
   prévia autenticada e não são expostos na lista comum.
5. Depois de conferir, clique **Revisei o conteúdo · aprovar e enviar esta cartinha**.

O backend verifica que o pagamento já está aprovado e que há texto ou mídia
realmente salva no servidor. Não finaliza Pix pendente nem rascunho vazio.
A revisão não marca o conteúdo como lido pelo encontrista.

Se o editor técnico mostrar uma cartinha vazia, o remetente precisa abrir seu
link privado e sincronizar novamente o texto, a foto ou o áudio. O servidor
não recupera conteúdo que ficou apenas no navegador do remetente.

## Publicação

Aplique a migração 0012_mini_mercado_campaign.sql antes do deploy do Worker,
rode npm run check e npm run build, e publique o frontend e a API.
