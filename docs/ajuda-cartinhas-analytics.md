# Cartinhas virtuais: link de ajuda, OG, Analytics e recuperação

## Link curto com contexto

- URL pública: `https://ejc.migos.club/ajuda/terminei-a-cartinha`
- Identificadores opcionais: `remetente`, `id` (repetido) e `para` (repetido).
- UTMs: `utm_source=whatsapp&utm_medium=mensagem&utm_campaign=recuperacao_cartinhas`.
- O redirecionamento é HTTP 302 para o WhatsApp. Nunca transmitir URL de edição, token ou código de mural em query string.
- Crawlers de compartilhamento recebem HTML com OG e `og:image` sem dados particulares.

## Publicar a arte final do WhatsApp

1. A arte deve ser um **PNG 1200 × 630 pixels, até 2 MB**, sem botões. Use a imagem aprovada nesta conversa.
2. Faça o deploy do Worker com `npm run deploy` ou `scripts/deploy.sh`.
3. Entre no Admin → **Configurações → OG das Cartinhas Virtuais**.
4. Envie o PNG pelo formulário **Publicar OG de ajuda**.
5. Confira `/og-ajuda-cartinhas.png` e compartilhe o link curto novamente no WhatsApp. O Worker atualiza a versão da URL da imagem ao mudar o arquivo no R2.

Até publicar o PNG, a rota usa a arte genérica existente, sem deixar o compartilhamento quebrado.

## Eventos de Analytics GA4

Consentimento da pessoa continua obrigatório para envio ao GA4. Os nomes dos eventos não contêm identidades, IDs ou conteúdo. Atributos conservados: contagens, estados, tipo de anexo e UTMs explícitas.

- `letter_composer_view`, `letter_first_edit`, `letter_preview_toggled`, `letter_attachment_added`, `photo_selected`, `audio_start`, `audio_recorded`.
- `letter_added_to_cart`, `checkout_created`, `checkout_view`, `checkout_status_changed`, `cart_pix_copied`, `cart_pix_claimed`.
- `letter_editor_view`, `letter_saved`, `letter_attachment_uploaded`, `letter_submitted`.
- `help_link_clicked`, `support_whatsapp_clicked`.
- `mural_code_redeemed`, `mural_view`, `private_letter_opened`, `mural_archive_downloaded`.
- `admin_whatsapp_invite_opened`, `admin_whatsapp_invite_confirmed`,
  `admin_recovered_notice_opened`, `admin_recovered_notice_confirmed`.

As páginas privadas são substituídas por caminhos sem tokens antes dos eventos. O fragmento `#token` e parâmetros como `remetente` e `id` não entram em `page_location` do GA4.

O acesso humano ao link de ajuda também incrementa um contador diário anônimo em D1, acessível no Admin → Configurações.

## Recuperação de cartinhas pagas vazias

A migração `0013_draft_recovery_tracking.sql` registra rascunhos pagos anteriormente vazios e quando passam a conter mensagem ou anexo. O Admin → Cartinhas mostra o status **Recuperada**, permite filtrar as recuperadas e prepara um aviso personalizado para o WhatsApp do encontrista **somente depois que a cartinha foi realmente enviada**.

- O link ao mural mantém o token no fragmento (`#token=`), não no query string, e carrega `utm_campaign=cartinha_recuperada`.
- A ação **Sim, enviei** registra a confirmação manual. Abrir o WhatsApp sozinho não equivale ao envio.
- A visualização de mensagens continua restrita ao destinatário com acesso pessoal; o painel normal continua mostrando somente dados operacionais.

## Publicação

`npm run check && npm run deploy` (ou `./scripts/deploy.sh`). Aplique as migrações D1 antes de servir a versão nova, conforme o script de deploy.
