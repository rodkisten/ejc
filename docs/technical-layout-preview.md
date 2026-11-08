# Conferência técnica de cartinhas e impressão

## Habilitar acesso somente técnico

A visualização padrão da coordenação permanece protegida: o endpoint GET /api/admin/cartinhas não retorna texto, foto nem áudio.

Configure em produção, sem colocar valor real no Git:

```bash
npx wrangler secret put TECH_PREVIEW_SECRET
```

Informe uma credencial aleatória exclusiva de 20 ou mais caracteres, diferente da senha do admin. Não use 000000 como senha real.

1. Autentique-se em https://ejc.migos.club/admin.
2. Abra https://ejc.migos.club/admin/cartinhas?secret=000000.
3. Digite a credencial técnica separada na tela.
4. Abra a prévia completa desejada, usando o mesmo componente LetterCard da página real.
5. Use Fechar prévia, Bloquear e saia do painel ao encerrar.

O parâmetro ?secret=000000 somente ativa a interface técnica bloqueada. Não é uma senha de autorização. As solicitações protegidas exigem simultaneamente sessão administrativa e TECH_PREVIEW_SECRET verificados no servidor.

A credencial não é salva no storage nem na URL, apenas mantida na memória da página. As fotos e os áudios são obtidos por POST autorizado e exibidos com URLs blob: temporárias, revogadas ao fechar a prévia. Nenhuma alteração em pedidos, pagamentos, conteúdo ou publicação ocorre. Respostas são no-store; depois de cinco tentativas inválidas há bloqueio por 15 minutos.

Se a coordenação tiver acesso à senha administrativa, não compartilhe TECH_PREVIEW_SECRET com ela. Quem obtiver as duas credenciais poderá visualizar conteúdo, então rotacione o segredo em caso de exposição.

## QR para impressão A4

Em Admin → QR e impressão, a página gera 10 mini cartões por A4, com 2 colunas e 5 linhas. Cada cartão mede 95 × 53 mm, com margens de 8 mm e espaçamento de 4 mm.

Os 10 cartões usam o endereço selecionado no painel e o QR é codificado dinamicamente, sem logo sobre o padrão. Para impressão fotográfica, utilize escala 100%, gráficos de fundo e qualidade alta.

## OG para WhatsApp

A imagem dinâmica tem dimensões de 1200 × 630; nome, foto, cruz e textos principais permanecem no centro seguro. Para substituir as imagens já publicadas no R2, após o deploy use Atualizar prévia do WhatsApp ou Gerar/atualizar prévias para WhatsApp, pois a atualização do código por si só não modifica PNGs existentes. O WhatsApp também pode conservar miniaturas em cache.
