# Importação do Wise

> Traga todo o seu histórico de transações do Wise para o app de uma vez só. Envie um extrato em CSV e o app cria as despesas, receitas e conversões de moeda correspondentes para você.

## Visão geral

Se você usa o Wise, a **Importação do Wise** permite trazer um extrato inteiro para sua conta em um único passo. Chega de digitar transações uma por uma — é só baixar um CSV do Wise, entregar ao app e revisar o que vai ser criado antes de confirmar.

A importação cobre três tipos de registro:

- **Despesas** — dinheiro que saiu do seu saldo Wise (débitos)
- **Receitas** — dinheiro que entrou (créditos)
- **Conversões de moeda** — quando você trocou entre saldos dentro do Wise (ex.: USD → EUR)

Cada transação importada fica marcada para que o app saiba que veio do Wise — se você enviar o mesmo extrato duas vezes, as duplicatas são detectadas e ignoradas automaticamente.

## Passo 1 — Exportar um CSV do Wise

1. Abra o Wise (o app web em **wise.com** ou o app do Wise no celular).
2. Vá em **Transactions → Statements and Reports**.
3. Escolha o **período** (até 469 dias por arquivo).
4. Escolha **CSV** como formato e selecione a moeda / o saldo que você quer.
5. Baixe o arquivo para o celular.

> **Dica:** O Wise gera um CSV por moeda. Se quiser importar várias moedas, repita a exportação para cada uma e importe uma depois da outra.

## Passo 2 — Importar no app

1. Abra o app e vá em **Configurações → Importação do Wise**.
2. Toque em **Escolher arquivo CSV** e selecione o arquivo que você acabou de baixar.
3. O app analisa o arquivo (normalmente em menos de um segundo) e mostra uma prévia.

## Passo 3 — Revisar e confirmar

A prévia lista todas as transações do CSV, cada uma com uma caixa de seleção.

- As **despesas** aparecem com um ícone vermelho apontando para baixo; as **receitas** com um ícone verde apontando para cima; as **conversões de moeda** com um ícone de troca e os dois lados do câmbio (ex.: `120.00 USD → 109.50 EUR`).
- Ao lado dos estabelecimentos mais comuns (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix etc.) aparece um pequeno chip de **categoria sugerida**. Se já existir uma categoria com o mesmo nome na conta ativa, ela é vinculada automaticamente.
- As linhas que você já importou em um envio anterior aparecem **esmaecidas e marcadas como “Já importada”** — não dá para selecioná-las de novo, e é isso que protege você contra duplicatas.
- Desmarque o que você não quiser importar (ex.: transferências pessoais entre suas próprias contas).

Quando estiver satisfeito com a seleção, toque em **Importar N linhas**. O app grava tudo na sua conta em uma única transação — ou todas as linhas selecionadas são criadas, ou nenhuma é.

## O que é preenchido

| Campo | De onde vem |
|---|---|
| Data | Coluna `Date` |
| Valor | `Amount` (valor absoluto) + `Total fees` incluídas |
| Moeda | Coluna `Currency` |
| Descrição | `Description` ou, se não houver, `Merchant` ou `Payment Reference` |
| Categoria | Sugerida a partir do estabelecimento, se ele for reconhecido; caso contrário, nenhuma |
| Origem | Marcada como `import`, para você poder filtrar essas transações nas análises |

## Conversões de moeda

Quando a mesma transferência do Wise envolve duas moedas (ex.: você converte 100 USD em euros), o Wise gera duas linhas — um débito em USD e um crédito em EUR. O app reconhece esses pares pela `Payment Reference` em comum e cria um único registro de **Câmbio** em vez de duas transações sem relação. O câmbio aparece em **Carteira → Câmbio** com a cotação correta.

## Importar de novo

Enviar o mesmo CSV de novo é seguro. Cada linha traz seu `TransferWise ID` do Wise, e o app se recusa a criar um segundo registro para um ID que já foi importado. Isso significa que:

- Você pode exportar de novo um período maior e enviá-lo — só as linhas novas são criadas.
- Você pode parar no meio de uma prévia e recomeçar depois — as linhas que você já confirmou ficam registradas.

## Perguntas frequentes

- **P: Isso funciona com outros bancos?**
  **R:** Nesta importação, só exportações CSV do Wise são suportadas. Outros bancos podem usar layouts de colunas diferentes. Abra uma solicitação de recurso se quiser que outro banco seja adicionado.

- **P: Posso importar um extrato em PDF ou XLSX?**
  **R:** Ainda não. Exporte os extratos do Wise em formato CSV.

- **P: O arquivo é enviado para algum lugar com que eu deva me preocupar?**
  **R:** O CSV é enviado para o servidor do AI Budget Assistant, analisado em memória e descartado assim que a prévia é gerada. Só as linhas estruturadas que você confirmar são salvas — não o arquivo original.

- **P: O que acontece com as tarifas que o Wise me cobrou?**
  **R:** O Wise informa as tarifas em uma coluna separada, `Total fees`. O app inclui a tarifa na mesma despesa, para que o total bata com o que realmente saiu do seu saldo.

- **P: Importei as linhas erradas — posso desfazer?**
  **R:** Sim. As linhas importadas são despesas/receitas normais — abra cada uma e exclua como faria com qualquer outra transação. Depois de excluída, você pode importar a mesma linha de novo mais tarde.

- **P: Meu CSV não tem linha de cabeçalho / tem outro formato. E agora?**
  **R:** Confira se você exportou um extrato em **Transactions → Statements and Reports → CSV**. O formato antigo “Activity Export” é diferente e não é suportado.

- **P: Minhas categorias do Wise vêm junto?**
  **R:** A categorização do próprio Wise é usada em parte para sugerir categorias para estabelecimentos comuns. O app não cria categorias novas automaticamente — se não houver correspondência, a linha é importada sem categoria e você pode classificá-la depois.

---

*Veja também: [Despesas e receitas](./03-expenses-and-income.md) | [Carteira e câmbio](./10-wallet-and-exchange.md) | [Contas](./09-accounts.md) | [Configurações](./11-settings.md)*
