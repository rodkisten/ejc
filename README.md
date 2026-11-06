# 💌 Mini Mercado Digital · XX EJC Simonésia

> ejcsimonesia2026@

MVP independente, pensado para mobile e publicado em **um único Cloudflare Worker** com D1 e R2 privado. **Não depende de GitHub Actions nem de um provedor Pix com webhook.**

> **Status:** código pronto para configuração e testes. Não foi publicado nem testado em conta Cloudflare real neste ambiente. Não use em um evento real sem executar o checklist abaixo.

## O que está implementado

- Plaquinha com QR Code de divulgação gerado no painel, levando à loja pública.
- Pesquisa por encontrista e **um destinatário por pedido** (um encontrista pode receber vários pedidos).
- Carrinho com vários produtos, preços calculados exclusivamente no servidor.
- Cobrança **Pix BR Code estática** com valor específico, `txid`, QR Code e Copia e Cola.
- Pedido com identificador único `EJC-XXXXXXXXXXXX` e QR Code próprio que abre o pedido na área administrativa.
- Botão "Já paguei" apenas notifica a coordenação, **não confirma pagamento**.
- Admin confere extrato bancário, valor e **identificador bancário único** (E2E/ID da transação) para liberar a homenagem. Um mesmo identificador não pode aprovar dois pedidos.
- Após confirmação: mensagem editável, fotos sem limite predefinido de quantidade e gravações de áudio sem tempo máximo estabelecido pela loja. Upload multipart de 8 MiB no R2.
- Link privado do comprador com token aleatório, sessão de administrador por cookie HttpOnly assinada por HMAC.
- Prazo de encerramento configurável pelo administrador; padrão **domingo, 08/11/2026, às 16h em Brasília**. Bloqueio de escrita realizado no Worker.
- Painel de pedidos, importação de encontristas (um por linha), cadastro/edição de produtos, conferência de Pix, preparo e entrega.
- Proteção contra força bruta na autenticação e limitação simples de pedidos por IP; arquivos privados e URLs temporárias assinadas para reprodução.

## Requisitos

- Node.js 22+ e npm (os testes integrados usam `node:sqlite`).
- Conta Cloudflare com Workers, D1 e R2 disponíveis (R2 pode exigir ativação de cobrança na conta).
- Chave Pix de banco comum **e nome correto do recebedor**.
- Lista de encontristas cuja divulgação tenha sido autorizada pela organização.
- Produtos/preços e responsável por verificar pagamentos no extrato.

## Publicar (Codespaces, computador ou terminal)

Extraia o ZIP, abra a pasta `ejc-mini-mercado` e execute:

```bash
bash scripts/deploy.sh
```

O script instala dependências, autentica no Cloudflare, cria/identifica um D1 e um bucket privado R2, aplica migrations, publica o Worker e solicita uma senha administrativa forte. Ele **não grava sua chave Pix no código**: configure-a pelo painel.

Se o terminal não puder abrir o navegador para autenticação, autentique o Wrangler antes de rodar com `CLOUDFLARE_API_TOKEN` configurado em ambiente seguro, com permissões específicas de Workers/D1/R2. Evite imprimir tokens nos logs.

O Wrangler mostra uma URL `*.workers.dev` após o deploy. Acesse `https://SEU-WORKER.workers.dev/admin` e preencha:

1. **Configurações:** chave Pix, nome exibido pelo banco, cidade, prazo configurável e permissão de novos pedidos.
2. **Encontristas:** cole um nome por linha.
3. **Produtos:** cadastre os presentes e os preços.
4. **QR da rua:** imprima a plaquinha. Se quiser, associe o domínio `ejc.migos.club` ao Worker **antes de imprimir**; caso mude o domínio, reimprima os códigos.
5. **Pedidos:** use o identificador bancário de cada Pix efetivamente recebido para confirmar e liberar a homenagem.

Se desejar configurar um domínio personalizado, faça isso em **Cloudflare → Workers & Pages → Worker → Settings → Domains & Routes → Add → Custom Domain**. Não existe deploy automático ao domínio `ejc.migos.club` sem a etapa de associação ao seu domínio na conta Cloudflare.

### Rodar localmente

```bash
npm install
cp .dev.vars.example .dev.vars
# Configure ADMIN_PASSWORD e SESSION_SECRET em .dev.vars
npm run db:local
npm run dev
```

Acesse `http://localhost:8787` e `/admin`. Os recursos D1/R2 ficam locais no modo dev, conforme o Wrangler. Lembre-se de que a gravação de microfone requer `https` ou `localhost`.

## Fluxo financeiro

**Pix estático não é Pix com confirmação automática.** O TXID identifica o pedido no QR Code, mas nem todos os aplicativos bancários o mostram claramente no extrato.

- O comprador cria o pedido e recebe a cobrança com o valor e o `txid`.
- O comprador pode solicitar conferência após pagar.
- O administrador busca a transferência no **extrato real**, confere o valor e registra o identificador bancário exclusivo (preferencialmente o EndToEndId/E2E).
- Só depois o Worker altera o estado de `pending/claimed` para `paid` e libera uploads e texto.
- Se o banco não disponibilizar um identificador consistente, **não invente um ID**. Resolva a conciliação com a equipe e ajuste a validação antes de operar.

A cobrança Pix permanece reaproveitável no mundo bancário mesmo depois da confirmação ou do fechamento do site. Evite pedir pagamentos adicionais para uma cobrança já paga; concilie depósitos duplicados manualmente.

## Arquivos e duração

- Áudio gravado via `MediaRecorder`, usando formato nativo do navegador, enviado progressivamente em partes de 8 MiB para R2. O envio pode continuar depois da gravação parar; não feche a página até aparecer "salvo".
- Em iPhone, o Safari pode suspender ou encerrar gravações longas ao bloquear a tela. O aplicativo **não estabelece tempo máximo**, mas não consegue eliminar as limitações de iOS, rede e espaço de armazenamento.
- Fotos são enviadas individualmente, também multipart. Não há limite programado de quantidade; aplicam-se os limites técnicos da plataforma (incluindo até 10.000 partes por objeto), custo de armazenamento, rede e riscos de abuso.
- Uploads incompletos são automaticamente abortados pelo R2 conforme a política da plataforma, tipicamente após 7 dias. Parte do áudio abaixo de 8 MiB ainda em memória pode ser perdida se o Safari encerrar antes de o usuário parar a gravação.
- Bucket R2 **não deve ser exposto publicamente**. A reprodução é autenticada; para compradores utiliza-se URL temporária assinada de até 4 horas.
- Edição encerrada pelo horário configurado; conteúdo continua disponível para leitura e administração até a política de retenção/exclusão adotada pela organização.

## Segurança e proteção de dados

- Não configure credenciais bancárias, e-mail/senha de banco, nem leitura automática do banco. **Nunca** peça comprovantes como prova definitiva.
- Use uma senha administrativa de pelo menos 14 caracteres, preferencialmente longa e aleatória. Para proteção adicional, configure regras Cloudflare Access/WAF para `/admin` e `/api/admin/*`; o próprio painel mantém autenticação por cookie.
- Evite divulgar dados dos encontristas além do nome autorizado. Confirme com a organização as permissões necessárias, especialmente para menores.
- Estabeleça prazo de retenção e remoção de mensagens e arquivos após o evento. A versão inicial **não apaga automaticamente** dados pessoais após o EJC.
- Apenas quem possuir o link privado pode editar a homenagem antes do encerramento. Não poste esse link em redes sociais.
- Faça monitoramento de custos e atividade do R2, dado que o sistema não impõe quotas por usuário como solicitado.
- O **painel não é uma contabilidade**: registre conciliação bancária e eventual estorno fora do sistema, segundo os procedimentos da organização.

## Checklist obrigatório de aceitação antes de distribuir QR Code

- [ ] Abrir site pelo QR Code impresso em Safari iPhone e Android.
- [ ] Testar busca por encontrista com acentos e nomes semelhantes.
- [ ] Criar pedido de baixo valor e verificar cálculo no servidor.
- [ ] Validar **Pix Copia e Cola e QR** em pelo menos dois bancos, nome do recebedor, valor e recebimento.
- [ ] Verificar que clicar "Já paguei" **não libera** conteúdo.
- [ ] Confirmar pagamento real no painel usando E2E correto; tentar reutilizar E2E e ver rejeição.
- [ ] Abrir link privado da homenagem e testar texto, foto HEIC/JPEG e áudio no Safari do iPhone.
- [ ] Testar um áudio de 10+ minutos, tela ligada, upload completo, reprodução e interrupção de rede.
- [ ] Testar bloqueio de edição após alterar temporariamente horário de encerramento no admin (e restaurar).
- [ ] Testar rota `/admin?order=EJC-...` pelo QR do pedido, incluindo login e retorno.
- [ ] Verificar que link de uma homenagem **não abre** arquivos de outra.
- [ ] Confirmar a equipe e o fluxo de contingência sem internet.
- [ ] Garantir que configurações da conta Cloudflare, R2 e DNS estejam sob controle da organização.

## Organização do projeto

```text
public/
  index.html     Página base mobile-first
  style.css      Identidade visual
  app.js         Loja, painel e captura/upload de mídia
  qr.js          QR Codes (biblioteca MIT empacotada localmente)
src/
  worker.js      API, validação, pagamentos, autenticação, R2
  pix.js         Gerador BR Code Pix e CRC-16
migrations/
  0001_initial.sql
scripts/
  deploy.sh      Publicação direta, sem GitHub Actions
tests/
  pix.test.js    Testes unitários
```

## Referências técnicas

- Banco Central, Manual de Padrões para Iniciação do Pix (QR estático / txid): https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=630&tipo=Instru%C3%A7%C3%A3o+Normativa+BCB
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
- Cloudflare R2 multipart: https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
- D1 Wrangler: https://developers.cloudflare.com/d1/wrangler-commands/

> Biblioteca QR: Kazuhiko Arase, **MIT License**, código de QRCode for JavaScript empacotado a partir do `qrcode-terminal` que acompanha o npm instalado. Os avisos de licença permanecem em `public/qr.js`.
