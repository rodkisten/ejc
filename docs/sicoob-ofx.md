# Conciliar pagamentos do Sicoob por OFX

## Como usar

1. Entre no **Internet Banking do Sicoob** (não é necessariamente a mesma tela do app).
2. Acesse **Conta → Consultas → Conta Corrente**, selecione o período, **Consultar → Salvar → Formato OFX**. Algumas cooperativas exibem o menu em outra posição ou requerem habilitação do formato.
3. Acesse **/admin → Pedidos → Conciliar extrato Pix** no EJC.
4. Selecione o arquivo `.ofx`. O arquivo é analisado localmente no Safari/navegador, **sem upload do extrato bancário**.
5. O sistema mostra créditos recebidos e a carteira de pagamentos pendentes. Ele sugere vínculo automático **somente quando o TXID e o valor coincidirem exatamente**. Quando o extrato não traz TXID, mostre sugestões por valor, mas exija seleção humana.
6. Confirme que o extrato pertence à conta Sicoob recebedora e que o lançamento é um Pix realmente recebido.
7. Clique em **Confirmar este Pix** somente após verificar a correspondência. A confirmação grava uma referência bancária única e libera todas as cartinhas daquele checkout.

## Segurança e limitações

- OFX pode conter **FITID** (identificador do lançamento), **não necessariamente EndToEndId/E2E**, e normalmente não garante exposição do **TXID**.
- O sistema não usa FITID como se fosse E2E. Se o E2E não aparecer, calcula uma referência `OFX<hash>` derivada de banco, conta, FITID, data e valor, para impedir reutilização do mesmo lançamento. **Isso não autentica a origem do extrato.**
- Se um lançamento não trouxer FITID nem E2E, informe o E2E extraído diretamente do comprovante para rastrear a confirmação.
- O nome do pagador pode ser diferente do comprador e o mesmo valor pode aparecer em várias compras. Valor isolado **nunca** confirma pagamento.
- Um único checkout pode conter várias cartinhas, mas apenas **uma transferência** deve quitá-lo.
- O arquivo OFX é um documento controlado pelo administrador; pode ser editado. A versão implementada exige revisão manual do extrato real, não confirmação automática sem intervenção.
- O sistema não usa credenciais Sicoob, não acessa conta bancária, não consulta saldo e não faz pagamentos.
- Consulte diretamente o banco se o arquivo não distinguir Pix de outros créditos ou se existirem dúvidas sobre estorno e devolução.
- Os dados de texto, mídias e remetentes privados das cartinhas não são acessados nessa conciliação.

## Futuro: confirmação automática de verdade

O Sicoob oferece APIs empresariais para Pix Recebimentos e Conta Corrente, mas acesso, credenciais e elegibilidade dependem da titularidade e do produto contratado. A confirmação via webhook/API requer cobrança e consulta autenticadas, validação de liquidação, valor e TXID, deduplicação e tratamento de devoluções. O OFX **não substitui** essa integração.

Referências:
- https://www.sicoob.com.br/web/sicoob/servicos-empresa/-/asset_publisher/lPNqdz0jZZX1/content/id/166036588
- https://ajuda.contaazul.com/hc/pt-br/articles/360060741971-Integra%C3%A7%C3%A3o-banc%C3%A1ria-via-OFX-como-exportar-extrato-em-OFX-do-Sicoob
