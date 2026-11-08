# Entrega de murais por WhatsApp · XX EJC Simonésia

## Objetivo

A coordenação cadastra o telefone de cada encontrista, mas somente o administrador autenticado
pode preparar o convite por WhatsApp. A aba **Admin → WhatsApp** mostra exclusivamente
encontristas ativos com ao menos uma cartinha vinculada.

## Como usar

1. Abra **Admin → Encontristas** ou **Admin → WhatsApp**.
2. Informe o número brasileiro com DDD no campo **WhatsApp do encontrista** e salve.
3. Na aba WhatsApp, consulte a quantidade de cartinhas vinculadas e **prontas**.
4. Quando houver carta **paga e enviada**, pressione **Enviar mural pelo WhatsApp**.
5. A aplicação gera e publica automaticamente uma imagem OG exclusiva de 1200 × 630 px se necessário.
6. Em seguida, o servidor emite um link privado assinado para o mural, com validade de 14 dias.
7. O WhatsApp abre com o contato correto, mensagem com emojis e link pessoal preenchidos.
8. Revise o destinatário e toque em **Enviar** no próprio WhatsApp.

Se o Safari bloquear a nova aba, a interface exibirá **Abrir WhatsApp** como alternativa.
O sistema não envia automaticamente nem marca a mensagem como entregue.

## Conteúdo

A mensagem pessoal usa *negrito* e _itálico_ do WhatsApp, cita Jeremias 31,3 e
Filipenses 1,6 em formato católico e termina com o crédito solicitado pela equipe:

> Rodolfo Costa, Evelyne Pimentel, Tia Mariana e Tio Saulinho, Tia Daisy e Tio Davidson.

Se o mural ainda não estiver liberado, o destinatário verá o aviso de abertura agendada,
sem desbloquear mensagens antes do horário configurado.

## Privacidade e segurança

- O telefone fica **somente** na tabela `recipients.whatsapp_phone` e é exposto apenas ao `/api/admin/bootstrap` autenticado.
- A API pública (`/api/public`) não inclui o telefone, o código do mural ou o token de acesso.
- O backend só cria links quando existe ao menos uma carta com pagamento confirmado **e** enviada.
- O token é assinado com `SESSION_SECRET` e validado pelo mural existente. Não é armazenado em banco.
- O token está no **fragmento `#token=...`**, fora das requisições HTTP/OG, mas é enviado ao destinatário no texto do WhatsApp por ser seu acesso pessoal.
- A OG do mural mostra **somente nome/foto previamente autorizada e arte do convite**, nunca texto das cartinhas, fotos anexadas, áudios, códigos ou links privados.
- O endereço compartilhado inclui um parâmetro `?og=` versionado, para favorecer a atualização da miniatura nos caches sociais.
- Não há rastreamento de entregas de WhatsApp nem confirmação de leitura pelo painel.

## Banco de dados e implantação

A migração `migrations/0011_recipient_whatsapp.sql` cria `whatsapp_phone` e `mural_og_key`.
O `scripts/deploy.sh` já roda testes, build e **migrações D1 antes da publicação**:

```bash
npm run check && npm run build
bash scripts/deploy.sh
```

Para apenas validar a D1 local, utilize `npm run db:local`.

**Importante:** este recurso foi adicionado à branch de desenvolvimento da PR #20;
não estará disponível em produção até que o PR seja integrado e publicado.
