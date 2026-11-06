# 💌 Cartinhas do XX EJC · Simonésia

**Feito com amor por Rod Costa** · EJC Simonésia · novembro de 2026

Aplicação de homenagens digitais: **React 19 + React Router 7 + Vite 7** no frontend; **Cloudflare Worker com API HTTP nativa**, banco **D1** e mídia privada **R2**. O objetivo é vender **uma cartinha, nunca produtos**, com um único encontrista por pedido. Não depende de ações GitHub para publicar.

> **Estado:** frontend e API implementados em código e os testes automatizados do Worker passaram. Não foi possível executar o build completo Vite neste ambiente offline (dependências npm não estão instaladas). Publicar e validar no Safari real e fazer um Pix de teste **antes** de distribuir os QR Codes.

## Jornada

1. A pessoa escaneia a plaquinha de divulgação, encontra o nome em `/` ou abre `/enviar/:slug`.
2. Prepara a mensagem no editor rico (títulos, negrito, itálico, listas, citações e sublinhado), seleciona **quantas fotos quiser** e grava/regrava um ou mais áudios, com player de ondas e velocidade. Pode pagar sem ter terminado de escrever.
3. Antes de pagar, o rascunho (inclusive arquivos) vive no **IndexedDB** daquele navegador. Não limpe os dados do celular nem troque de dispositivo antes de transferir o rascunho para o servidor.
4. É gerado um **Pix BR Code estático** com valor configurável por mensagem e `txid` específico. O administrador compara valor e identificador da transferência no **extrato real do banco**. Apenas uma confirmação manual válida libera o upload e o envio para moderação.
5. A pessoa continua pelo link privado `/pedido/:token`, salva o conteúdo no R2 e submete à moderação. Qualquer edição após uma aprovação invalida a aprovação, exigindo nova revisão.
6. Apenas cartinhas aprovadas aparecem no mural privado `/mural/:slug#token=...` depois do horário configurado. O administrador pode antecipar individualmente a liberação. O link de **envio** com slug jamais dá acesso ao mural.
7. O remetente pode marcar uma mensagem como pública, **desativado por padrão**. Só mensagens aprovadas e liberadas aparecem em `/publicas`.
8. No mural, o encontrista baixa cartinha PNG caligráfica, áudios, fotos ou ZIP único com todas as cartinhas e anexos. No celular, o compartilhamento Instagram/WhatsApp usa **Web Share API**; não existe publicação direta por API Meta sem OAuth e permissões correspondentes.

## React Router

| URL | Página | Acesso |
| --- | --- | --- |
| `/` | Lista pesquisável de encontristas | Público |
| `/enviar/:slug` | Editor, gravação, fotos e checkout inicial | Público |
| `/pedido/:token` | Pix, status, rascunho e envio para moderação | Link privado |
| `/mural/:slug` | Mural secreto | Convite `#token` ou admin |
| `/publicas` | Cartinhas explicitamente públicas | Público |
| `/admin` | Pedidos e moderação | Administrador |
| `/admin/pedidos/:id` | Conferência do Pix e aprovação | Administrador |
| `/admin/encontristas` | Importação, links individuais e mural secreto | Administrador |
| `/admin/configuracoes` | Pix, valor, horários, GA4 | Administrador |
| `/admin/qrcodes` | Cartazes QR coloridos e impressão A4 | Administrador |
| `/admin/demo` | Criar/apagar exemplos fictícios | Administrador |

## Segurança e limites práticos

- O QR Pix é um meio de pagamento, **não um comprovante**. A confirmação exige o identificador bancário único e verificação do valor no extrato.
- Tokens individuais são aleatórios, os hashes são salvos no D1, arquivos no R2 são privados e URLs de mídia são assinadas e temporárias. Links privados devem ser entregues somente aos destinatários.
- **Data de fechamento e horário de liberação são diferentes e configuráveis.** A API valida o prazo em Brasília independentemente da UI.
- Não impomos um limite arbitrário ao número de fotos ou à duração dos áudios. Gravações longas, memória do Safari, R2 e rede impõem limites reais; mantenha o aparelho ativo durante a gravação.
- A versão de ZIP no navegador exige memória; arquivos agregados acima de **200 MB** são recusados nessa versão para evitar travamento do iPhone. Baixe cartinhas individualmente nesse caso.
- A autorização para usar nomes de menores, o acesso da coordenação e o prazo de retenção dos conteúdos devem ser acertados antes de abrir a campanha.
- GA4 é opcional, exige consentimento positivo e registra somente eventos de navegação/ações, nunca nomes, textos, arquivos, Pix ou links privados.
- O editor sanitiza HTML para texto formatado. Fotos são anexadas como uma composição visual à cartinha.
- Dados de demonstração têm mensagens fictícias, imagens gráficas ilustrativas geradas e áudios sintéticos de tom, não fotografias/vozes de pessoas reais. O botão **Apagar exemplos** remove todos os pedidos demonstrativos, inclusive seus anexos.

## Requisitos e deploy

Node.js 22+, conta Cloudflare com Workers, D1 e R2 habilitados, npm e `openssl`.

```bash
npm install
npm run check
npm run build
bash scripts/deploy.sh
```

O deploy cria/vincula D1 e R2, aplica ambas as migrations, **compila Vite para `dist/`** e publica o Worker com assets SPA. Configure os segredos `SESSION_SECRET` e `ADMIN_PASSWORD` pelo script, **nunca no repositório**.

Para desenvolvimento local execute `npm run dev:worker` para a API com D1/R2 local na porta 8787. Em outra sessão execute `npm run dev` para o Vite na porta 5173. `vite.config.js` já encaminha `/api` para o Worker local. O script de produção serve frontend e API na mesma origem.

Depois de publicar, configure em `/admin/configuracoes` a **chave Pix, titular, cidade, valor único, prazo de edição, horário de abertura do mural** e opcionalmente Measurement ID `G-...`. Importe os encontristas, gere os links privados e faça um Pix real de baixo valor, conferência, moderação, teste de áudio e foto no Safari, QR impresso e ZIP.

> As migrations mantêm tabelas legadas de produtos da versão anterior para preservar dados existentes, mas **elas não aparecem no checkout nem são usadas pelas novas rotas**. Faça backup do D1 antes de migrar uma base existente.

## Estrutura

```text
index.html                    Entrada Vite
client/
  main.jsx                   React Router, layout e analytics
  pages/                     Home, Send, Order, Mural, PublicLetters, Admin
  components/                RichEditor, Recorder, VoicePlayer, LetterCard, QrCode
  lib/                       API, IndexedDB, gerador QR
  styles.css                 Design mobile e estilos de impressão
src/
  worker.js                  API D1/R2, Pix, moderação, mural e demo
  pix.js                     Geração Pix BR Code
migrations/                  0001 e 0002
scripts/deploy.sh            Build e deploy sem GitHub Actions
tests/                       Testes de fluxo, privacidade e Pix
wrangler.jsonc               Worker e SPA assets em dist/
```

## Formatação e QR Codes

Rode `npm install`, `npm run format` e `npm run format:check` para padronizar os arquivos com Prettier 3. Os arquivos SQL ficam excluídos até a instalação de um plugin de formatação SQL.

A interface gera QR Codes com `react-qrcode-logo` (Pix de alto contraste, cartazes decorados e identificadores). A opção de download dos QR Codes do painel agora exporta PNG a partir do canvas.

## Marca original, fotos e QR Codes

- Identidade visual restaurada: roxo, lilás, rosa e pêssego; não usa a paleta predominantemente vinho da migração inicial.
- Configurações > **Logo do Mini Mercado**: envie PNG/JPEG/WebP até 2 MB. A logo é armazenada no R2 e aparece centralizada em QR Codes gerados com `react-qrcode-logo`.
- Sem imagem cadastrada, é exibida apenas uma marca **provisória "XX EJC"**. Para usar a logo oficial, faça o upload no painel.
- Administração > Encontristas: cada nome tem foto individual (PNG, JPEG, WebP até 5 MB), exibida na busca, no checkout Pix e no mural. O envio exige confirmação expressa de autorização de imagem, inclusive dos responsáveis no caso de menores.
- As imagens são servidas somente pelo Worker, com conteúdo do R2 e conferência da autorização para fotos dos encontristas.
- A tela Pix exibe valor, nome do encontrista, titular recebedor, cidade, ID do pedido e txid. **Esses detalhes ficam fora do QR bancário** para manter o BR Code intacto.
- Verifique leitura do QR com câmeras e apps de bancos diferentes antes de divulgar na rua. Se o QR com logo não for reconhecido, use o Pix Copia e Cola e reduza/retire o logotipo. Não publique antes de validar.

### Migrar o banco de dados

A migração `0003_recipient_photos.sql` adiciona os campos de foto e autorização sem apagar os encontristas já cadastrados.

```bash
npm install
npm run db:remote
npm run format
npm run format:check
npm run build
npm run check
```

As etapas dependem de login Cloudflare e de npm disponível no ambiente do operador. Nenhuma dessas operações publica a aplicação automaticamente.

Consulte [o plano de confirmação automática do Pix](docs/pix-automatico.md) para ligar a API de um banco recebedor ou um PSP. A confirmação **continua manual** nesta branch.

## Deploy corrigido para Codespaces, Termius e Safari (06/11)

Use Node.js 22+ e `bash scripts/deploy.sh` na raiz do projeto. O script agora:

1. Instala dependências, incluindo o Wrangler registrado no package-lock (e, apenas para login remoto, Wrangler atualizado sob demanda).
2. Se não houver autenticação Cloudflare, exibe **URL fixa + código curto** via `wrangler login --device --browser=false`. Abra `https://dash.cloudflare.com/oauth2/device` no Safari e digite o código.
3. Localiza ou cria o D1, sem alterar `wrangler.jsonc`: cria `.wrangler.deploy.jsonc` na raiz, ignorado pelo Git, contendo o UUID da **sua conta**.
4. Verifica o bucket R2 e o cria, se necessário.
5. Executa `npm run check` e `npm run build`. Não publica se algum falhar.
6. Aplica migrações remotas (incluindo fotos) e publica Worker + React.
7. Preserva segredos existentes e solicita senha administrativa no terminal somente se estiver faltando.
8. Opcionalmente valida `GET /api/health` se passar `EJC_PUBLIC_URL=https://SEU_DOMINIO` no ambiente.

**Sem acesso à internet ou com limites da conta Cloudflare:** não há como completar o deploy remotamente. O projeto já pode ficar no GitHub, mas a implantação só se conclui quando Wrangler conectar à conta e todos os passos forem aprovados.

Para diagnosticar o script sem Cloudflare, execute `npm run deploy:doctor`.

## Pagamento Mercado Pago: conta pessoa física

A conta Mercado Pago PF pode ser usada como ponto de partida para configurar uma aplicação de pagamentos, sujeito à liberação de credenciais e produtos para a conta. A API Pix Checkout Transparente exige criar **uma cobrança por pedido**, vinculada a uma referência externa e a dados mínimos do comprador (incluindo e-mail), e configurar webhooks assinados para acompanhar `approved`.

O **QR Pix estático configurado hoje** não ganha confirmação automática só por ser uma chave Mercado Pago. Até implantar e homologar a API, a coordenação confere e aprova manualmente cada transferência. Não inclua credenciais do Mercado Pago em GitHub nem no navegador; use Wrangler Secrets.
