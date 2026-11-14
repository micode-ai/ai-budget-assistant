# Importação do Wise

> Traga todo o seu histórico de transações do Wise para a aplicação de uma só vez. Carregue um extrato em CSV e a aplicação cria as despesas, receitas e conversões de moeda correspondentes.

## Visão geral

Se usa o Wise, a **Importação do Wise** permite trazer um extrato inteiro para a sua conta num único passo. Acabou-se escrever transações uma a uma — basta transferir um CSV do Wise, entregá-lo à aplicação e rever o que vai ser criado antes de confirmar.

A importação abrange três tipos de registos:

- **Despesas** — dinheiro que saiu do seu saldo Wise (débitos)
- **Receitas** — dinheiro que entrou (créditos)
- **Conversões de moeda** — quando trocou entre saldos dentro do Wise (p. ex., USD → EUR)

Cada transação importada fica marcada para que a aplicação saiba que veio do Wise — se carregar o mesmo extrato duas vezes, os duplicados são detetados e ignorados automaticamente.

## Passo 1 — Exportar um CSV do Wise

1. Abra o Wise (a aplicação web em **wise.com** ou a aplicação móvel do Wise).
2. Vá a **Transactions → Statements and Reports**.
3. Escolha o **intervalo de datas** (até 469 dias por ficheiro).
4. Escolha **CSV** como formato e indique a moeda / o saldo que pretende.
5. Transfira o ficheiro para o telemóvel.

> **Dica:** O Wise gera um CSV por moeda. Se quiser importar várias moedas, repita a exportação para cada uma e importe-as uma a seguir à outra.

## Passo 2 — Importar na aplicação

1. Abra a aplicação e vá a **Definições → Importação do Wise**.
2. Toque em **Escolher ficheiro CSV** e selecione o ficheiro que acabou de transferir.
3. A aplicação analisa o ficheiro (normalmente em menos de um segundo) e mostra uma pré-visualização.

## Passo 3 — Rever e confirmar

A pré-visualização lista todas as transações do CSV, cada uma com uma caixa de seleção.

- As **despesas** aparecem com um ícone vermelho a apontar para baixo; as **receitas** com um ícone verde a apontar para cima; as **conversões de moeda** com um ícone de troca e os dois lados do câmbio (p. ex., `120.00 USD → 109.50 EUR`).
- Junto aos comerciantes mais comuns (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix, etc.) aparece um pequeno indicador de **categoria sugerida**. Se já existir uma categoria com o mesmo nome na conta ativa, é associada automaticamente.
- As linhas que já importou num carregamento anterior aparecem **esbatidas e marcadas como «Já importada»** — não as pode selecionar outra vez, e é isso que evita duplicados.
- Desmarque o que não quiser importar (p. ex., transferências pessoais entre as suas próprias contas).

Quando a seleção estiver como pretende, toque em **Importar N linhas**. A aplicação grava tudo na sua conta numa única transação — ou todas as linhas selecionadas são criadas, ou nenhuma é.

## O que é associado

| Campo | De onde vem |
|---|---|
| Data | Coluna `Date` |
| Valor | `Amount` (valor absoluto) + `Total fees` incluídas |
| Moeda | Coluna `Currency` |
| Descrição | `Description`, ou, na falta dela, `Merchant` ou `Payment Reference` |
| Categoria | Sugerida a partir do comerciante, se for reconhecido; caso contrário, nenhuma |
| Origem | Marcada como `import`, para poder filtrar estas transações na análise |

## Conversões de moeda

Quando a mesma transferência do Wise envolve duas moedas (p. ex., converte 100 USD em euros), o Wise gera duas linhas — um débito em USD e um crédito em EUR. A aplicação reconhece estes pares pela `Payment Reference` que partilham e cria um único registo de **Câmbio** em vez de duas transações sem relação. O câmbio aparece em **Carteira → Câmbio** com a taxa correta.

## Voltar a importar

Voltar a carregar o mesmo CSV é seguro. Cada linha traz o seu `TransferWise ID` do Wise, e a aplicação recusa-se a criar um segundo registo para um ID que já importou. Isto significa que:

- Pode voltar a exportar um intervalo de datas mais longo e carregá-lo — só são criadas as linhas novas.
- Pode interromper uma pré-visualização a meio e recomeçar mais tarde — as linhas que já confirmou ficam registadas.

## Perguntas frequentes

- **P: Isto funciona com outros bancos?**
  **R:** Nesta importação, só são suportadas exportações CSV do Wise. Outros bancos podem usar disposições de colunas diferentes. Abra um pedido de funcionalidade se quiser que seja adicionado outro banco.

- **P: Posso importar um extrato em PDF ou XLSX?**
  **R:** Ainda não. Exporte os extratos do Wise em formato CSV.

- **P: O ficheiro é enviado para algum sítio com que me deva preocupar?**
  **R:** O CSV é enviado para o servidor do AI Budget Assistant, analisado em memória e descartado assim que a pré-visualização é gerada. Só são guardadas as linhas estruturadas que confirmar — não o ficheiro original.

- **P: O que acontece às comissões que o Wise me cobrou?**
  **R:** O Wise indica as comissões numa coluna separada, `Total fees`. A aplicação inclui a comissão na mesma despesa, para que o total corresponda ao que realmente saiu do seu saldo.

- **P: Importei as linhas erradas — posso anular?**
  **R:** Sim. As linhas importadas são despesas/receitas normais — abra cada uma e elimine-a como faria com qualquer outra transação. Depois de eliminada, pode voltar a importar a mesma linha mais tarde.

- **P: O meu CSV não tem linha de cabeçalho / tem um formato diferente. E agora?**
  **R:** Confirme que exportou um extrato em **Transactions → Statements and Reports → CSV**. O formato antigo «Activity Export» é diferente e não é suportado.

- **P: As minhas categorias do Wise são transferidas?**
  **R:** A categorização do próprio Wise é usada em parte para sugerir categorias para comerciantes comuns. A aplicação não cria categorias novas automaticamente — se não for encontrada correspondência, a linha é importada sem categoria e pode classificá-la mais tarde.

---

*Ver também: [Despesas e receitas](./03-expenses-and-income.md) | [Carteira e câmbio](./10-wallet-and-exchange.md) | [Contas](./09-accounts.md) | [Definições](./11-settings.md)*
