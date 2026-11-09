# 💌 Cartinhas do XX EJC · Simonésia

**Feito com amor por Rod Costa** · EJC Simonésia · novembro de 2026

Aplicação de homenagens digitais: **React 19 + React Router 7 + Vite 7** no frontend; **Cloudflare Worker com API HTTP nativa**, banco **D1** e mídia privada **R2**. O objetivo é vender **cartinhas, nunca produtos**. O visitante monta um carrinho de uma ou mais homenagens com remetentes individuais e paga **um único Pix** pelo total. Não depende de ações GitHub para publicar.

> **Estado:** alterações de privacidade implementadas. Execute os testes e o build antes de publicar; a nova versão ainda não foi validada no navegador em produção. Não foi possível executar o build completo Vite neste ambiente offline (dependências npm não estão instaladas). Publicar e validar no Safari real e fazer um Pix de teste **antes** de distribuir os QR Codes.


## Novidade: home de colagens, cartinhas múltiplas e artes PNG (07/11/2026)

A versão de carrinho foi implementada na branch `feat/cartinhas-carrinho-colagem`. **Ainda não é um deploy em produção.**

#
### Avisos de leitura e relay

A conexão já existente com **Resend** permanece: para receber aviso de primeira abertura da cartinha, o remetente confirma o próprio e-mail, e a notificação é gerada apenas após a abertura individual no mural. Isso não comprova leitura integral. Configure `RESEND_API_KEY` e `RESEND_FROM` **somente como segredos no Worker**. O endereço não aparece no painel.

O relay da coordenação recebe eventos operacionais de pedido e Pix, nunca o texto ou a mídia das cartinhas. Use `RELAY_URL=https://xtelegram-cf.migos.club/send`, `RELAY_TOKEN` em secrets e `RELAY_CHAT_ID` conforme a configuração do bot. Rotacione qualquer credencial que tenha sido exposta anteriormente e nunca inclua tokens no código ou nos logs.

## Conciliação Sicoob OFX

Em **/admin → Pedidos → Conciliar extrato Pix**, a coordenação pode selecionar um arquivo OFX
exportado do Sicoob. O extrato é interpretado **localmente no navegador**, sem upload
de movimentações bancárias. O painel relaciona créditos Pix com pedidos pendentes
pelo TXID e valor quando o banco inclui o TXID; caso contrário, oferece seleção
manual por valor, sem presumir que transações de mesmo valor sejam da mesma compra.
A coordenação precisa verificar a entrada na conta recebedora e confirmar explicitamente
cada Pix. Referências OFX não são apresentadas como E2E e são deduplicadas antes de
liberar cartinhas agrupadas.

Guia e limitações: [docs/sicoob-ofx.md](docs/sicoob-ofx.md).

## Jornada do comprador

1. A home apresenta um mural de retratos autorizados, cada um clicável, e mantém a **lista completa com busca por nome**. Clicar em qualquer encontrista abre `/enviar/:slug`.
2. Em `/enviar/:slug`, a pessoa escolhe o remetente **daquela cartinha**, escreve a mensagem e adiciona áudios, fotos e adesivos PNG instalados. O rascunho, inclusive as mídias, é salvo em IndexedDB do navegador.
3. `/carrinho` permite **editar**, **remover**, **duplicar para outro encontrista** e **criar cartas novas**. A assinatura é independente. Uma mesma pessoa pode receber mais de uma cartinha.
4. `POST /api/checkouts` recebe de 1 a 20 itens e valida o valor unitário **exclusivamente no servidor**. A API cria um `checkout` e múltiplos `orders` privativos, em transação D1. O único BR Code Pix inclui a **soma correta** com um `txid` da compra.
5. Em `/checkout/:token`, o comprador vê o Pix consolidado e pode **editar cada cartinha mesmo após copiar o Pix**, sem refazer a compra. **Confirmar alterações** grava no servidor e devolve ao mesmo QR e código Copia e Cola. A coordenação aprova **uma transferência**, em `/admin`, verificando entrada no extrato, identificador e valor total.
6. Em `/pedido/:token`, a pessoa com o link secreto pode revisar **texto, assinatura, adesivos, fotos e áudios antes ou depois da aprovação bancária**. O texto e a decoração são gravados no D1 ao gerar a compra. A tela de Pix sincroniza os anexos locais com R2; não a feche antes da mensagem de sincronização terminar. Apenas depois da confirmação bancária é possível **enviar ao mural**, que continua privado e só abre no horário do encontro.
7. O encontrista abre o envelope, pode baixar a carta PNG, o ZIP com mídias e usar **Telegram / Compartilhar** na folha de compartilhamento nativa do iPhone. Não existe postagem automática por bot no Telegram nem exposição do token do mural.

### Artes PNG originais

Foram recuperados **seis arquivos PNG originais já produzidos para o EJC**. Eles não foram substituídos por SVG. O pacote `XX_EJC_Artes_Originais_PNG.zip` deve ser importado em **Administração → Stickers PNG → Importar artes originais**. O formulário aceita esse ZIP ou arquivos individuais, e relaciona os seis nomes de arquivo aos adesivos predefinidos. A biblioteca permite acrescentar outras artes PNG. O seletor público mostra somente PNGs realmente instalados, e a exportação usa **exatamente a mesma URL /api/stickers/:id.png** que o editor.

A plataforma não publica os arquivos em R2 automaticamente a partir de conversas do ChatGPT. Eles precisam ser importados pelo formulário administrativo após deploy. Não divulgue o editor com adesivos antes de instalar e conferir as seis artes.

### Imagens de compartilhamento

As rotas `/enviar/:slug` e `/mural/:slug` recebem metatags OG injetadas no HTML pelo Worker, com imagem PNG de **1200 × 630**, nome e foto autorizada dentro da área central visível em miniaturas quadradas. Em **Administração → Encontristas**, clique em **Publicar nova OG da home** e **Gerar/atualizar prévias** para publicar os PNGs no R2 depois do deploy. A home também possui uma arte moderna autoral, com fallback antigo se não for gerada ainda.

### Alterações de banco e operação

- Migration **`0009_checkout_cart.sql`** cria `checkouts` e adiciona `orders.checkout_id` e `checkout_item_index`, preservando pedidos anteriores.
- O painel administrativo mostra Pix agrupados e os dados operacionais dos destinatários. Em `/admin/cartinhas`, o admin também vê o nome do remetente e somente os stickers normalizados, inclusive com Pix pendente. Texto, fotos, áudio, assinatura e links privados não são enviados.
- Os valores não podem ser alterados no browser depois da criação do checkout, nem é possível confirmar individualmente um pedido vinculado a Pix agrupado.
- Para reduzir abuso de armazenamento em compras não confirmadas, o pré-envio aceita até 12 anexos e 48 MiB por cartinha, além de 160 MiB no total de um Pix agrupado. Após a confirmação bancária aplicam-se os limites normais da infraestrutura.
- O texto e a decoração passam a estar disponíveis pelo **link privado de checkout mesmo em outro dispositivo**. Fotos e áudios originais saem do IndexedDB para o R2 ao abrir o checkout; acompanhe a sincronização antes de trocar de dispositivo. Quem possui o link secreto pode editar o conteúdo até o prazo, mas a coordenação continua sem endpoints de leitura.
- Antes de publicar: `npm ci && npm run check && npm run build && npm run db:remote`, faça backup do D1, teste Pix real em valor pequeno, revisite a página após pagar, exporte fotos/áudios no Safari e confira OG no WhatsApp.


## Jornada

1. A pessoa escaneia a plaquinha de divulgação, encontra o nome em `/` ou abre `/enviar/:slug`.
2. Prepara a mensagem no editor rico (títulos, negrito, itálico, listas, citações e sublinhado), seleciona **quantas fotos quiser** e grava/regrava um ou mais áudios, com player de ondas e velocidade. Pode pagar sem ter terminado de escrever.
3. Antes de gerar o Pix, o rascunho fica no **IndexedDB**. Ao criar o checkout, texto, remetente e composição são persistidos em D1, e os anexos são sincronizados para R2 ao abrir o Pix. Aguarde o término da sincronização de arquivos antes de fechar a página ou mudar de aparelho.
4. É gerado um **Pix BR Code estático** com valor configurável por mensagem e `txid` específico. O administrador compara valor e identificador da transferência no **extrato real do banco**. A confirmação manual do Pix libera o envio da cartinha privada, sem moderação.
5. A pessoa continua pelo link privado `/pedido/:token`, salva o conteúdo no R2 e envia diretamente para o mural privado. Pode editar até o prazo configurado, sem revisão pela equipe.
6. Somente cartinhas enviadas aparecem no mural do encontrista após o horário configurado. O código privado de seis caracteres é inserido em `/abrir`. Administradores não podem entrar no mural usando apenas a sessão administrativa.
7. Não existe galeria pública, opção de publicação ou moderação. A antiga API `/api/publicas` retorna 410 e os dados de visibilidade pública anteriores são desativados na migração.
8. No mural, o encontrista baixa cartinha PNG caligráfica, áudios, fotos ou ZIP único com todas as cartinhas e anexos. No celular, o compartilhamento Instagram/WhatsApp usa **Web Share API**; não existe publicação direta por API Meta sem OAuth e permissões correspondentes.

## React Router

| URL | Página | Acesso |
| --- | --- | --- |
| `/` | Mural fotográfico em colagem, lista pesquisável e apresentação das funções | Público |
| `/enviar/:slug` | Editor da cartinha nova ou duplicada | Público |
| `/carrinho` | Carrinho de cartas com Pix consolidado | Rascunhos locais |
| `/checkout/:token` | Pix, cópia do código e edição individual das cartinhas antes da aprovação | Link privado |
| `/pedido/:token` | Edição de rascunho antes/depois do Pix e envio ao mural somente após pagamento | Link privado |
| `/mural/:slug` | Mural secreto | Somente acesso assinado derivado do código pessoal |
| `/abrir` | Digitar código pessoal do mural | Destinatário |
| `/admin` | Conferência Pix e situação operacional, sem conteúdo | Administrador |
| `/admin/pedidos/:id` | Conferência do Pix e metadados do pedido | Administrador |
| `/admin/encontristas` | Importação, fotos e OG personalizado | Administrador |
| `/admin/cartinhas` e `/admin/cartinhas/:slug` | Prévia protegida: remetente, stickers e situação, inclusive Pix pendente | Administrador |
| `/admin/stickers` | Upload das artes PNG originais para R2 | Administrador |
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

Depois de publicar, configure em `/admin/configuracoes` a **chave Pix, titular, cidade, valor único, prazo de edição, horário de abertura do mural** e opcionalmente Measurement ID `G-...`. Importe os encontristas, gere os códigos das etiquetas e faça um Pix real de baixo valor, conferência, envio privado e testes de áudio e foto no Safari, QR impresso e ZIP.

> As migrations mantêm tabelas legadas de produtos da versão anterior para preservar dados existentes, mas **elas não aparecem no checkout nem são usadas pelas novas rotas**. Faça backup do D1 antes de migrar uma base existente.

## Estrutura

```text
index.html                    Entrada Vite
client/
  main.jsx                   React Router, layout e analytics
  pages/                     Home, Send, Order, Mural, Unlock, Privacy, Admin, Labels
  components/                RichEditor, Recorder, VoicePlayer, LetterCard, QrCode
  lib/                       API, IndexedDB, gerador QR
  styles.css                 Design mobile e estilos de impressão
src/
  worker.js                  API D1/R2, Pix, mural privado e demo
  pix.js                     Geração Pix BR Code
migrations/                  0001 a 0006
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

## Murais secretos, códigos curtos e etiquetas (versão 3)

**Acesso do encontrista:** o admin abre `/admin/etiquetas` e gera códigos
alfanuméricos únicos de **6 caracteres**. A ferramenta apresenta **8 etiquetas
em cada folha A4 vertical**, com nome, foto autorizada, código e QR Code.
O QR leva a `/abrir?codigo=XXXXXX`. O encontrista também pode abrir
`/abrir` e digitar o código manualmente. O código é retirado da barra de
endereços após a leitura.

Ao trocar um código, QR Codes antigos e acessos concedidos com aquele código
deixam de funcionar. Os antigos links privados longos são invalidados na migração 0006; reimprima as etiquetas de acesso quando necessário.
Há limitação de tentativas erradas por IP para proteger os códigos de 6
caracteres. Os murais exibem cartinhas enviadas **somente após o horário
de liberação configurado**, respeitando a exceção de liberação administrativa.

**Compartilhamento social:** o Worker injeta OpenGraph e Twitter Card diretamente
no HTML das URLs `/enviar/:slug` e `/mural/:slug`. Portanto, os robôs de
prévia do WhatsApp, Telegram, Facebook e X recebem os metadados sem executar
JavaScript. A imagem PNG verdadeira, de **1200 × 630 pixels**, é criada no
navegador administrativo e armazenada no R2. Isso evita gerar imagens pesadas
em cada visita pública.

Depois de importar encontristas, clique em **Encontristas → Gerar imagens de
todos os encontristas** para criar as prévias com nome e foto. Ao cadastrar
uma foto, a prévia individual é gerada automaticamente. Enquanto não houver
imagem gerada, o link continua compartilhável com título e descrição, mas
sem a foto no cartão social. A autorização para divulgação da foto é
obrigatória, inclusive autorização dos responsáveis se houver menores.

Instagram não oferece uma API web pública que permita publicar uma história
diretamente em qualquer conta. O botão de compartilhar abre a folha de
compartilhamento do dispositivo; a plataforma de destino decide como exibe
o link. As mesmas metatags OG servem aos apps que suportam prévias.

### Migrações e validação

```bash
git pull --ff-only
npm install
npm run format
npm run check
npm run build
bash scripts/deploy.sh
```

O script `deploy.sh` aplica automaticamente as migrações remotas
`0004_mural_codes.sql` e `0005_og_images.sql`.
Reveja o formato das etiquetas no **Safari → Imprimir → A4, escala 100%**,
e teste URLs `/enviar/<slug>` no depurador de compartilhamento das redes.
Sem executar esses passos na conta Cloudflare, o repositório atualizado não
significa que o site em produção já mudou.

**Importante:** não coloque tokens privados em Analytics, OG tags ou links
públicos. As prévias do mural mostram apenas dados autorizados (nome e foto),
nunca textos, áudios, mensagens ou códigos secretos.

## Privacidade das cartinhas (versão atual)

- **Sem moderação**: a coordenação não aprova, rejeita, altera, lê nem escuta as cartinhas pelo painel. Os endpoints de moderação, leitura de carta e mídia pela administração foram desativados no servidor, não apenas escondidos na interface.
- **Sem galeria pública**: toda carta é privada, inclusive as que anteriormente tinham a opção de publicação ativada. A migração `0006_private_letters.sql` desliga essa opção e revoga links longos de mural que podiam ser emitidos pelo administrador.
- **Pagamentos separados de conteúdo**: `/api/admin/bootstrap` e as consultas de pagamento continuam sem nome do remetente ou conteúdo privado. A nova rota autenticada `/api/admin/cartinhas` fornece nome do remetente, destinatário, status e stickers permitidos, inclusive rascunhos e Pix pendente, sem entregar texto, assinatura, fotos, áudios, links de mídia ou tokens.
- **Entrega pelo horário**: o envio é direto para o mural do encontrista, sem aprovação; a leitura começa depois do horário de liberação estabelecido nas configurações.
- **Segredo do mural**: os códigos de seis caracteres são gerados e impressos pela coordenação. Qualquer pessoa que tenha uma cópia do QR ou do código pode acessar o mural. Guarde as etiquetas e entregue a cada destinatário sem exposição pública.
- **Limite técnico**: os dados ainda são armazenados em formato legível no D1/R2; **não há criptografia ponta a ponta**. O bloqueio do painel não impede que um operador com acesso privilegiado à infraestrutura examine os dados. Não divulgar promessa de impossibilidade absoluta de acesso até implementar criptografia ponta a ponta e gestão de chaves exclusivamente pelos participantes.
- **Analytics**: somente rotas genéricas (sem tokens e códigos) são enviadas como visualizações de página, após consentimento. Não enviar conteúdo das cartas, voz, fotos, códigos privados ou tokens.

A política transparente está disponível em `/privacidade` e a coordenação só deve dizer que **não tem acesso ao conteúdo pelo painel**. Para confidencialidade inclusive frente à infraestrutura será necessária uma arquitetura E2EE adicional.

## Personalização das cartinhas (stickers, papel e Instagram)

A partir da versão de composição, os participantes podem decorar suas cartinhas
antes de pagar e ajustar o resultado após o Pix confirmado:

- **Catálogo de 20 opções de adesivos**, em quatro categorias (Parabéns, Coragem, Fé e Versículos). As artes utilizadas são PNGs originais instalados no R2; a seleção mostra apenas as disponíveis.
  Referências no padrão católico: **João 15,9**, **Filipenses 1,6** e **Filipenses 4,13**.
  As artes são PNG originais cadastrados no R2 em Administração > Stickers PNG. Editor e exportação usam a mesma arte; sem PNG instalado, o adesivo fica pendente.
- **4 papéis** (Lavanda, Rosa Chá, Azul Mariano e Pêssego) e **3 opções de fonte**
  (Clássica, Manuscrita e Moderna). Seleção com um toque, sem configurar estilos manualmente.
- **Assinatura opcional**, com nome personalizado ou envio sem assinatura.
- **Adesivos com toque, arrastar, setas do teclado, girar, aumentar, diminuir e remover**.
  Até seis adesivos, posicionados numa área decorativa que evita cobrir o texto da carta.
  O botão **Surpreenda-me** distribui dois adesivos harmonizados com o papel selecionado.
- **Tipografia adaptável** na prévia para reduzir o vazio em cartas curtas; conteúdos
  extensos continuam completos e podem aumentar a altura da carta.
- **Exportação em PNG com múltiplas páginas** quando o texto é longo; ZIP preserva
  fotos, áudios, texto e todas as páginas. Exportação para **Instagram Feed
  1080 × 1350** e **Stories 1080 × 1920**, com prévia truncada explicitamente
  se o texto inteiro não couber. Compartilhamento pelo menu nativo do iPhone.
- **Sem publicação automática**: somente o autor ou destinatário com link
  autorizado pode compartilhar. Nenhuma composição, assinatura personalizada
  ou imagem da carta é exposta às rotas administrativas.

A decoração é salva no **IndexedDB** durante a preparação pré-Pix e em
`orders.composition_json` na D1 após confirmar o pagamento. A migração
`migrations/0007_letter_compositions.sql` mantém as cartinhas anteriores
compatíveis: caso não haja composição, aplica o papel Lavanda e a fonte Clássica.

### Arquivos adicionados

```text
shared/letter.js                         Catálogo, temas, normalização e layout puro
client/components/letter/Sticker.jsx      Adesivos PNG originais do R2
client/components/letter/StickerPicker.jsx
client/components/letter/StickerLayer.jsx
client/components/letter/LetterControls.jsx
client/components/letter/LetterCanvas.jsx
client/components/social/InstagramExportPanel.jsx
client/hooks/useLetterComposer.js
client/lib/letterExport.js                Renderização em Canvas, páginas, feed, story
client/styles/                             Estilos e comportamento responsivo
tests/letter-composition.test.js
migrations/0007_letter_compositions.sql
```

### Antes de disponibilizar ao público

Rode `npm ci && npm run format && npm run format:check && npm run check && npm run build`
no Codespaces. Verifique na prática o Safari do iPhone, tanto em portrait quanto
landscape, especialmente o arrastar dos adesivos e o compartilhamento de imagens.
O deploy existente aplica a migração D1 de forma incremental. Sem aprovação dos
testes, não publique a versão nova.

## Prévias do WhatsApp, Facebook e Telegram

O Cloudflare Worker gera as metatags `og:title`, `og:description`, `og:url`,
`og:image`, `og:image:secure_url`, `og:image:type`, `og:image:width`,
`og:image:height`, `og:image:alt` e as Twitter Cards diretamente no HTML.
O robô social **não precisa executar React** e as rotas de destinatários usam o
documento HTML base `/` para não depender dos cabeçalhos de navegação de SPA.

- A prévia personalizada é um PNG **1200×630**, com nome e foto autorizada,
  visualmente contidos no centro seguro (x=320…880). Isso evita cortes em
  miniaturas quadradas de WhatsApp.
- Se ainda não houver arte personalizada, o site entrega a imagem genérica
  real `/og-ejc-default.png` (PNG **600×315**) em vez de omitir `og:image`.
- URLs de imagem e os links de compartilhamento incluem um parâmetro de
  versão `?v=` / `?og=`. Isso diminui o risco de o WhatsApp reutilizar
  a miniatura antiga após a atualização.
- Os cartões sociais mostram somente nome/foto autorizada e informações
  genéricas do evento. **Não incluem conteúdo de cartinhas, fotos privadas,
  áudios, tokens de pedido nem códigos de mural.**

### Atualizar as imagens antigas

Depois do deploy, no admin abra **Encontristas → Imagens para redes sociais**
e clique em **Gerar/atualizar prévias para WhatsApp**.
A nova versão de PNG é identificada internamente pelo prefixo `og/v2/`.
O admin mostra quantas artes anteriores precisam ser renovadas e uma simulação
da miniatura quadrada. As imagens armazenadas antes desta atualização não
são modificadas automaticamente pelo deploy.

### Validar uma URL real

No Codespaces, depois de executar o deploy:

```bash
npm run og:check -- 'https://ejc.migos.club/enviar/ana-clara?og=REVISAO'
```

Substitua o slug pelo de um encontrista existente e use o **link versionado
copiado pelo admin** em vez de `REVISAO`. O verificador simula o
`facebookexternalhit` (utilizado pelos serviços de prévia da Meta), confere
HTTP 200, um único `og:image`, MIME PNG verdadeiro, dimensões coincidentes e
ausência de redirects para autenticação.

**Importante:** se Cloudflare Access, Bot Fight Mode ou regras WAF bloquearem
os crawlers, uma metatag correta não será suficiente. As rotas públicas de
envio (`/enviar/*`) e os arquivos de imagens OG
(`/api/og/*`, `/og-ejc-default.png`) precisam ser acessíveis sem sessão,
enquanto as APIs privadas, o admin e o conteúdo do mural continuam protegidos.
O WhatsApp mantém cache próprio; por isso, novas URLs versionadas são
preferíveis a reenviar um link antigo esperando atualização instantânea.

## Adesivos de colagem do XX EJC

O catálogo de vinte adesivos foi convertido em **arquivos de imagem**.
O repositório inclui `public/stickers/<id>.svg` com recortes de papel,
tipografia intensa, coroas, cruzes e cores amarelo, magenta, roxo e azul.
O aplicativo usa essas artes diretamente no picker, na carta e na exportação
para feed e stories, no lugar do componente de ícones minimalistas.

Um pacote adicional com **20 imagens WebP de colagem geradas a partir das
referências visuais** pode ser copiado para `public/stickers/` com os mesmos
nomes; quando presente, tem prioridade sobre os SVGs de reserva. A distribuição
dessas imagens depende de incluí-las como arquivos binários no repositório
antes do build. Não publicar um SVG se o arquivo correspondente faltar.

## Relay e aviso por e-mail (sem moderação)

A equipe **não aprova, rejeita, lê ou ouve** as homenagens. Os eventos de relay
são operacionais, sem conteúdo, nome do remetente, mídia privada, e-mail ou
código do mural:

- `order_created`: pedido de cartinha criado
- `payment_claimed`: comprador informou que fez Pix
- `payment_confirmed`: coordenação confirmou o Pix no extrato
- `letter_sent`: cartinha enviada ao mural privado
- `letter_released`: chegou o horário de liberação
- `letter_read`: destinatário abriu uma cartinha específica pela primeira vez

A fila `notification_outbox` utiliza D1, chaves únicas por pedido/evento,
entrega assíncrona imediatamente após a requisição e reconciliação a cada
cinco minutos por Cron Trigger. Falhas transientes são repetidas com backoff.

### Configurar relay

No Cloudflare Worker, definir como **secrets** (nunca comitar nem colar valores
reais no código):

```sh
npx wrangler secret put RELAY_URL
npx wrangler secret put RELAY_TOKEN
npx wrangler secret put RELAY_CHAT_ID
```

`RELAY_URL` deve ser a URL **completa do endpoint HTTPS** que recebe POST JSON.
O Worker envia um Bearer token no header `Authorization` e um payload
`{text,chat_id,event,idempotency_key}`. Como o endpoint e o esquema específicos
do relay externo ainda não foram fornecidos, é preciso confirmar que essa
API aceita o contrato antes de ativar em produção.

**Nunca utilizar um token previamente compartilhado em conversa.** Rotacione-o
no serviço do relay antes de configurar o secret.

### E-mail transacional

**Resend** é a implementação principal. O plano gratuito publicado oferece
3.000 e-mails/mês com limite diário de 100. A alternativa Brevo oferece
300 e-mails/dia no plano gratuito. Os avisos só aparecem na interface quando
`RESEND_API_KEY` e `RESEND_FROM` estiverem configurados.

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
```

Configure e valide o domínio `ejc.migos.club` no Resend, incluindo as entradas
DNS de autenticação do remetente. Use um endereço como
`Cartinhas XX EJC <avisos@ejc.migos.club>`.

**Consentimento:** opcional na tela de envio e também disponível no link privado
do pedido. O sistema envia um e-mail de confirmação com link de fragmento
(`/confirmar-email#token=...`); a pessoa precisa confirmar o endereço.
Somente quando **o encontrista toca para abrir o envelope de uma carta específica**
a API registra `first_read_at` e agenda um único `email_read`.
Visitar a página do mural ou apenas listar cartas **não** marca leitura.

O e-mail é cifrado com AES-GCM usando uma chave derivada de `SESSION_SECRET`
e persistido somente na tabela `order_read_receipts`. Não é retornado no
painel administrativo. Evite alterar o `SESSION_SECRET` em produção sem plano
de migração das chaves, pois isso tornaria os endereços já armazenados ilegíveis.

O aviso de leitura não compartilha o conteúdo, fotos, áudios ou nome do
remetente; registra apenas a primeira abertura pelo acesso privado.
Não é possível verificar se o destinatário leu todas as palavras.

### Aplicar em produção

```sh
npm ci
npm run format
npm run check
npm run build
bash scripts/deploy.sh
```

A migração `0008_read_receipts_notifications.sql` adiciona as tabelas e
o campo `orders.first_read_at`. O Cron Trigger `*/5 * * * *` exige a publicação
do Worker com a configuração atualizada. **Sem os secrets definidos, nenhuma
notificação externa será enviada.** Teste um pedido de demonstração completo
antes de habilitar a campanha.

## Carrinho, colagens, PNGs e prévias sociais

- Home com mural de retratos autorizados, galeria em colagem expansível, pesquisa integral e apresentação das funções.
- Cartinhas com remetentes independentes, foto, áudio, texto, decoração e rascunho local em IndexedDB.
- Duplicação de cartinhas para diferentes encontristas, carrinho editável e um único Pix gerado pelo servidor com preço unitário multiplicado pela quantidade.
- Migração 0009_checkout_cart.sql: tabela de checkouts e vínculos com pedidos individuais. Cada carta tem acesso privado independente, sem acesso ao conteúdo pelo painel administrativo.
- Conferência do Pix único no painel de coordenação, com valor total e referência bancária. Cartas agrupadas não possuem Pix próprio.
- OG social personalizado em PNG 1200 x 630, com foto e nome em destaque central seguro. Após publicar, use Admin > Encontristas > Gerar/atualizar prévias para WhatsApp.
- Upload das artes originais em Admin > Stickers PNG. O histórico do ChatGPT não é acessível automaticamente pelo Worker: os PNGs precisam ser cadastrados uma vez.
- Cartinhas compartilháveis como arquivos PNG pelo menu nativo do iPhone, permitindo escolher Telegram e outros apps, sem compartilhar o código do mural privado.
- Animações delicadas na home e ao abrir cartas, respeitando a preferência por movimento reduzido.

### Publicação

Execute npm ci, npm run check, npm run build e bash scripts/deploy.sh. O deploy aplica migrations remotas e publica o Worker junto ao frontend.
Não considere commits na branch como publicação em ejc.migos.club. Antes de divulgar, teste um Pix real de valor pequeno, confira o valor total e o txid no banco, confirme o checkout, abra cada cartinha, envie anexos e verifique o compartilhamento no Safari.
Rascunhos com fotos e áudios ficam no navegador que iniciou a compra; não limpe dados nem troque de aparelho antes de concluir.

## Layout clássico restaurado e fotos quadradas dos encontristas

A home voltou ao layout original do XX EJC, com o papel da cartinha
sobreposto e a paleta **pêssego, rosa e lilás**, respeitando o tema
`legacy-theme.css`. As regras de `client/styles/home.css` impedem que a
ilustração ultrapasse os limites no Safari do iPhone.

A lista pública continua **com todos os encontristas de uma vez**, sem
limite de 18, sem segunda listagem e sem paginação. O filtro ignora acentos.
O avatar de cada participante usa foto autorizada ou iniciais em uma das
12 cores estáveis, com borda individual.

### Editor de foto quadrada

Em **Admin → Encontristas → Adicionar foto / Trocar foto**, a foto
selecionada abre um editor de enquadramento **1:1**. Arraste a imagem
para posicionar o rosto e use o controle de zoom. **Salvar foto quadrada**
gera no próprio iPhone/navegador um JPEG de **768 × 768 px**; o arquivo
original não é enviado ao Worker.

Para ajustar uma foto antiga, use **Reenquadrar** na pessoa correspondente.
Assim não é necessário remover o cadastro. A autorização para publicar
fotos, inclusive de menores pelos responsáveis, continua obrigatória.

A API de fotos dos encontristas valida a proporção 1:1 e o JPEG antes
de atualizar a imagem armazenada no R2. Fotos antigas que não foram
reprocessadas ainda aparecem enquadradas via `object-fit: cover` até
o admin reenquadrá-las. As fotos de **cartinhas privadas** não são alteradas.

A mesma foto quadrada aparece na lista, nos cartões de pagamento,
no editor, no mural, nas etiquetas impressas e no PNG de redes sociais.
As imagens OG geradas passam a usar área fotográfica quadrada e a
paleta original; fotos antigas precisam ser reenquadradas ou as OGs
atualizadas manualmente no admin.

### Verificação antes de publicar

```bash
git switch main
git pull --ff-only
npm ci
npm run check
npm run build
bash scripts/deploy.sh
```

Os testes `tests/home-layout.test.js`, `tests/square-photo.test.js`
e `tests/og-preview.test.js` cobrem o layout restaurado, recorte,
dimensões JPEG, bordas e área quadrada das prévias.

Teste o Safari em 320px, 375px, 390px e 430px, incluindo gesto de
arrastar, zoom, publicação e um nome de encontrista longo.


## Conferência de Pix por código e nome de controle (migração 0010)

No painel administrativo, **Localizar um Pix e suas cartinhas** permite consultar
código da compra, TXID, referência E2E já registrada, encontrista e o **nome
para conferência** informado por quem compra. O campo identifica o pagamento
sem alterar a assinatura da mensagem e sem aparecer no mural. Um único Pix
consolidado libera todas as cartinhas após conferência manual do valor e do
crédito no extrato bancário. Nenhum texto, mídia ou token privado é retornado
pela pesquisa de pagamentos.

O checkout mantém o identificador e código Pix originais mesmo após a pessoa
editar e confirmar o texto, a assinatura, as fotos ou os adesivos no link
privado. O estado canônico da cartinha fica no D1, seus anexos no R2 após
sincronização; o IndexedDB preserva rascunhos como cópias locais para recuperação,
sem manter um carrinho faturado como compra nova. Não limpe os dados do Safari
antes de confirmar que os anexos foram sincronizados. Os links privados da
compra continuam funcionando em outros aparelhos após a sincronização.

A migração `migrations/0010_private_payer_name.sql` cria o atributo
`payer_name` em compras e pedidos pré-existentes com valor padrão vazio.
Aplique as migrações antes de publicar o Worker. Para ensaio, confira pelo
código `EJCB-...` um Pix com duas cartinhas, edite cada uma, verifique no
extrato e confirme manualmente o pagamento no admin.

## Administração de encontristas: edição e exclusão

Na rota `/admin/encontristas`, cada cadastro tem **Editar nome** e **Excluir**, além das ações de foto e imagem de compartilhamento. Renomear um encontrista preserva seu `id`, `slug` e código do mural, para não invalidar links e QR Codes já impressos. A imagem OG é regenerada com o novo nome no painel, quando possível.

**Exclusão segura:** sem pedidos vinculados, o cadastro é removido definitivamente do D1 e as imagens associadas são limpas do R2. Se houver pedidos ou cartinhas, **Excluir** arquiva o encontrista (`active = 0`), retirando-o da lista pública e impedindo novas compras, mas preservando pagamentos e a leitura das cartas antigas pelo código privado. O filtro **Mostrar arquivados** permite restaurar o cadastro; os arquivos não são apagados nesse caso. Todas as ações exigem login administrativo e a exclusão pede confirmação.

A busca administrativa de pagamentos usa `LIKE ... COLLATE NOCASE` sem aplicar `UPPER` à cadeia com acentos, corrigindo a pesquisa por valores como “Conferência”. O teste antigo que exigia a remoção do rascunho ao gerar o Pix foi atualizado: agora o carrinho ativo é esvaziado, mas o conteúdo e os anexos locais continuam preservados, com a versão canônica no servidor.


## Suporte das cartinhas pelo WhatsApp

Existem dois links públicos curtos:

- `/ajuda/terminei-a-cartinha`: o remetente confirma o envio e informa nome, destinatários e IDs de seus pedidos para a coordenação.
- `/ajuda/minha-cartinha`: o encontrista pede ajuda para abrir ou visualizar suas cartinhas. Os convites, a carta recuperada e o mural constroem URLs personalizadas com nome, IDs operacionais e parâmetros UTM. No mural, o link inclui dados não secretos do navegador (user agent, tamanho da tela, idioma, conexão e horário). A mensagem pré-preenchida termina com uma linha divisória para descrever o problema.

As duas rotas fazem `302` para `https://wa.me/5532999662604` ao receber uma visita comum. Robôs de WhatsApp/Meta recebem HTML com `og:title`, `og:description` e imagem 1200 × 630, sem nomes, IDs nem links privados no HTML. Nunca incluir `#token`, URLs de edição, fotos ou conteúdo das cartas no link público de suporte.

**Publicação das imagens:** depois de `bash scripts/deploy.sh` (que executa testes, build e migrações D1), entre em **Admin → Configurações**, nas duas caixas *OG: Enviei minha cartinha, e agora?* e *OG: Me ajude com minha cartinha*. Envie em cada uma o PNG correspondente, **1200 × 630 e até 2 MB**. O endpoint autenticado grava no R2, respectivamente, `og/help-finished-v1.png` e `og/help-recipient-v1.png`; o Worker os serve em `/og-ajuda-cartinhas.png` e `/og-ajuda-minha-cartinha.png`. Até publicar, o Worker mostra uma arte OG de fallback. Os arquivos de design não são enviados automaticamente pelo deploy.

Os cliques em links curtos são contados em `help_link_counts` por dia/campanha, sem IP, texto ou token. Os eventos GA4 do site são enviados apenas após consentimento, com URLs privadas normalizadas. A recuperação de rascunhos pagos vazios é registrada em `draft_recovery` e a equipe só pode confirmar o aviso no WhatsApp depois que a cartinha recuperada tiver conteúdo e estiver enviada. Abrir o WhatsApp não marca a mensagem como enviada.

