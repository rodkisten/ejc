# Aprovação em massa de Pix · Mini Mercado XX EJC

Há duas formas de confirmar vários pagamentos **com uma única autorização de lote**,
sem clicar em **Confirmar este Pix** para cada transação.

## 1. Pelo extrato OFX do Sicoob (recomendado)

1. No Admin → Pedidos, abra **Conciliar extrato Pix**.
2. Importe o OFX do Sicoob. Ele é lido só no navegador, sem enviar o extrato ao servidor.
3. A seção **Aprovar Pix em massa** seleciona automaticamente as correspondências
   seguras: somente Pix recebidos com **TXID único, valor idêntico e
   referência bancária rastreável** (E2E ou FITID).
4. Desmarque qualquer lançamento que não queira aprovar.
5. Marque as duas confirmações de que o extrato e os valores foram conferidos.
6. Pressione **Aprovar N Pix de uma vez** e confirme a operação uma só vez.
7. Acompanhe o progresso. O painel informa quantos foram aprovados e quais falharam.

Pagamentos sem TXID, apenas com valor correspondente, com valores divergentes,
duplicados ou já confirmados **não são selecionados automaticamente**.
Esses casos permanecem para conferência individual no Sicoob.

## 2. Sem OFX, pela pesquisa de pagamentos

1. Em Admin → Pedidos → **Localizar um Pix e suas cartinhas**, filtre os pagamentos.
2. Clique em **Selecionar TODOS os pendentes desta busca**. O sistema percorre
   todas as páginas da consulta, mesmo com centenas de pagamentos. A lista comum
   continua paginada, com **Carregar mais pagamentos**, para não pesar no celular.
   Alternativamente, selecione apenas os pendentes já carregados ou marque cada Pix.
3. O **código Pix / referência bancária E2E/FITID é opcional** por pagamento.
   Preencha quando tiver essa informação. Não invente códigos.
4. Marque as confirmações de crédito recebido e de valor conferido.
5. Pressione **Confirmar N Pix de uma vez** e autorize o lote apenas uma vez.
   Não há mais o limite de 100 confirmações. A confirmação informa a quantidade,
   o valor total e quantos pagamentos estão sem referência.
6. Mantenha a página aberta enquanto os pagamentos são processados. Um progresso
   mostra os sucessos e falhas; itens não confirmados permanecem selecionados
   para uma tentativa posterior.

Se informar códigos, cada Pix precisa de sua referência individual:
o formulário rejeita referências repetidas ou inválidas. Se não houver código,
o pagamento é marcado como pago **por conferência manual**, com referência
bancária `NULL` e um evento de auditoria `manual_batch_no_reference`.
A falta do código não comprova recebimento: a equipe deve conferir o
extrato no banco antes de aprovar.

## Proteções mantidas

- Só o admin logado pode usar essas funcionalidades.
- A confirmação continua sendo **manual**, baseada no extrato da conta recebedora.
- Cada item passa pelas rotas administrativas autenticadas, com validação de status,
  valor e recebimento; somente o lote aceita referência bancária vazia.
- Pedidos cancelados e já pagos não podem ser aprovados de novo.
- O checkout agrupado é confirmado uma vez, liberando as cartinhas vinculadas.
- O processamento é sequencial e exibe resultados parciais, caso um item falhe.
- Textos, fotos, áudios e tokens privados das cartinhas não são consultados.
- Não há integração de leitura automática do extrato bancário no servidor.

## Validação e publicação

```bash
git pull --rebase --autostash origin main
npm run check && npm run build
bash scripts/deploy.sh
```

**Atenção:** se houver PR aberto, mescle o PR antes de executar o deploy.
Os testes unitários cobrem as regras do algoritmo de seleção, códigos bancários
duplicados, estados indisponíveis e divergências de valor.
