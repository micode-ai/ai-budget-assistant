# Importar transações do seu banco

> Importe transações a partir de um extrato do seu banco em CSV, XLSX ou PDF. Suporta mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise e qualquer outro banco através do mapeador universal de colunas.

## Bancos suportados

- **mBank** — exportação CSV
- **PKO BP** — exportação CSV
- **Erste Bank** — extrato em PDF
- **Alior Bank** — extrato em PDF
- **Revolut** — exportação CSV
- **Wise** — exportação CSV (várias moedas; as conversões de moeda são detetadas automaticamente)
- **Outro** — qualquer banco, através do mapeador universal de colunas (CSV)
- **Folhas de cálculo** — os extratos em XLSX também funcionam; a aplicação lê a primeira folha

Vão sendo adicionados mais bancos ao longo do tempo. Se o seu ainda não estiver na lista, use **Outro** e mapeie as colunas manualmente.

## Como importar

1. Vá a **Definições → Importar transações**
2. Escolha o seu banco na lista (ou **Outro (CSV personalizado)**, se não estiver na lista)
3. Selecione o ficheiro que exportou do banco
4. A aplicação mostra uma pré-visualização — cada linha aparece marcada como despesa, receita ou câmbio
5. Desmarque as linhas que não quiser e toque em **Importar**

A aplicação ignora as linhas que já existem na sua conta, comparando data, valor e moeda — importar o mesmo ficheiro duas vezes não cria duplicados. As linhas coincidentes ficam desmarcadas por predefinição; volte a marcar uma se for mesmo uma transação diferente.

## Onde encontrar a exportação do seu banco

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)
- **Revolut**: aplicação Revolut → Statements → escolha o intervalo de datas → CSV → Download
- **Wise**: wise.com → Transactions → Statements and Reports → escolha o intervalo de datas → CSV → escolha a moeda/o saldo → Download

> **Dica para o Wise:** O Wise gera um CSV por saldo em cada moeda. Importe cada moeda separadamente. Até 469 dias por exportação.

## Wise — conversões de moeda e comissões

Quando converte moedas dentro do Wise (p. ex., 100 USD → EUR), o Wise cria duas linhas. A aplicação deteta estes pares automaticamente e cria um único registo de **Câmbio** (visível em Carteira → Câmbio) em vez de duas transações sem relação.

O Wise também indica as comissões numa coluna separada, `Total fees` — a aplicação inclui a comissão no valor da despesa, para que o total corresponda ao que realmente saiu do seu saldo.

## O que é importado

Cada linha passa a ser uma Despesa, uma Receita ou um Câmbio. As categorias são sugeridas automaticamente para os comerciantes mais conhecidos — pode alterá-las mais tarde. Cada linha importada fica marcada com o banco de origem e um ID único, por isso voltar a importar o mesmo ficheiro é sempre seguro.

**Nomes de comerciantes mais arrumados.** As cadeias de lojas conhecidas são reconhecidas automaticamente, por isso uma linha de extrato como `BIEDRONKA 1234 WARSZAWA` fica guardada simplesmente como **Biedronka**. Assim, uma loja aparece como um único comerciante na sua análise, em vez de dezenas de entradas separadas por loja.

## «Outro» — mapeador universal de CSV

Se o seu banco não estiver na lista, escolha **Outro (CSV personalizado)**. A aplicação mostra uma pré-visualização do ficheiro e pede-lhe que indique que coluna tem a data, o valor e a descrição. Guarde este mapeamento com um nome e o próximo CSV com a mesma disposição de colunas é importado automaticamente.

## Quando nada reconhece o seu extrato

Se nenhum dos bancos acima servir e o ficheiro não tiver uma disposição de colunas simples que a aplicação consiga adivinhar sozinha, pode pedir a um modelo de IA que identifique as colunas por si — qual é a data, qual é o valor, e assim por diante.

**Antes de qualquer envio, é-lhe perguntado uma vez.** Da primeira vez que isto acontece numa conta, aparece um ecrã a explicar o que sai do seu dispositivo: num CSV ou numa folha de cálculo, apenas a linha de cabeçalho e até 10 linhas de exemplo — nunca o ficheiro inteiro. Num extrato em PDF, são as primeiras 20 linhas do texto extraído. Decide uma vez por conta; depois disso, a aplicação lembra-se da sua escolha.

- **Usar IA** — o ficheiro é lido de novo com as colunas que o modelo identificou.
- **Vou mapear manualmente** — passa diretamente para o mapeador manual descrito acima. Esta recusa acontece antes de qualquer análise, por isso ainda não há nada para pré-preencher — mapeia as colunas da mesma forma que para qualquer outro banco não suportado.

**O resultado é mostrado, não presumido.** Quando a identificação pela IA funciona, a pré-visualização mostra uma fila de indicadores por cima das transações — algo como `Date → Data operacji`, `Amount → Kwota` — juntamente com o seu palpite sobre que banco é este. É uma estimativa, não uma certeza: toque nessa fila a qualquer momento para abrir o mapeador e corrigir uma coluna mal identificada.

**Algumas coisas são assinaladas para verificar, em vez de presumidas em silêncio:**
- Se o ficheiro não tiver nenhuma coluna de moeda, todas as linhas são lidas na moeda da sua conta e um aviso informa-lhe disso — toque nele para mudar a moeda antes de importar; a alteração aplica-se ao ficheiro inteiro.
- Ler números de um PDF é mais difícil de verificar do que num CSV, por isso a aplicação tenta confirmar que o que encontrou bate certo com o saldo final do extrato. Quando não o consegue confirmar, aparece um aviso a pedir-lhe que reveja a lista. Não é um erro — é simplesmente o caso normal sempre que um extrato não apresenta um saldo corrente para comparar, ou quando a verificação não bate certo.

**Os extratos em PDF exigem o plano Pro.** Ler um PDF com IA exige mais processamento do que um CSV, por isso é uma funcionalidade Pro — numa conta gratuita aparece um ecrã de upgrade nesse ponto, em vez de uma mensagem de erro.

Os bancos já indicados acima (mBank, PKO BP, Erste, Alior, Revolut, Wise) não são afetados por nada disto — são importados exatamente como descrito mais acima nesta página.

## Importações anteriores e anular

A secção **Importações anteriores**, no fundo de **Definições → Importar transações**, mostra as últimas 20 importações — origem, data e número de linhas.

Para anular uma importação recente, toque na **seta de anular** (↩) à direita. Todas as transações dessa importação são removidas e o bloqueio de duplicados é limpo, para que possa voltar a importar o mesmo ficheiro sem problemas.

- É possível anular durante **30 dias** após a importação original.
- As importações com mais de 30 dias não mostram o botão de anular.

## Não encontra o seu banco?

No fundo de **Definições → Importar transações** há um cartão **«Não encontra o seu banco?»**. Toque nele, escreva o nome do banco e anexe um extrato de exemplo. O seu pedido vai diretamente para a nossa equipa.

## Codificação

Nos ficheiros CSV, a aplicação deteta automaticamente UTF-8 e Windows-1250 (comum nas exportações de bancos polacos). Os extratos em PDF são lidos diretamente — não é preciso escolher codificação.

## Vem de outra aplicação?

Em **Definições → Importar transações** há um cartão à parte, **«Vem de outra aplicação?»**, com Monefy, Wallet by BudgetBakers e Money Manager / 1Money.

Exporte o histórico da aplicação antiga, escolha aqui a linha correspondente e as suas transações chegam — **juntamente com as suas categorias**. Uma categoria que tinha lá e que ainda não existe aqui é criada automaticamente, para que o histórico chegue organizado e não como um monte indistinto.

As transferências entre as suas próprias contas na aplicação antiga são ignoradas: não são gastos, e importá-las contaria o mesmo dinheiro duas vezes.

A sua aplicação não está na lista? Use **Detetar automaticamente (qualquer banco)** no topo — os formatos de exportação desconhecidos são analisados automaticamente e, normalmente, a importação corre bem na mesma.

---

*Ver também: [Despesas e receitas](./03-expenses-and-income.md) | [Carteira e câmbio](./10-wallet-and-exchange.md) | [Definições](./11-settings.md)*

## O relatório depois de uma importação

Quando uma importação traz um período de histórico a sério (dez despesas ou mais), a aplicação abre um pequeno relatório em vez de uma simples mensagem de «concluído»:

- **Gasto médio por mês** e o período que o extrato abrange.
- **Para onde foi o seu dinheiro** — as suas principais categorias, com valores e percentagens.
- **Subscrições encontradas** — cobranças do mesmo valor, do mesmo beneficiário, a um intervalo regular mensal ou semanal, que ainda não acompanha.
- **Orçamentos mensais sugeridos** — para as suas maiores categorias que ainda não têm orçamento, com base no seu gasto médio mensal arredondado para cima. São estimativas que pode ajustar.
- **Possíveis duplicados** — o mesmo beneficiário e o mesmo valor com um dia de diferença. Muitas vezes são duas compras reais, por isso só são mostrados, nunca removidos — vale a pena confirmar rapidamente com o banco.
- **Onde gasta mais** — os seus maiores comerciantes.

Tudo o que é sugerido começa assinalado. Toque em **Configurar selecionados** para criar esses orçamentos e acompanhar essas subscrições de uma só vez, desmarque antes o que não quiser ou toque em **Agora não**. Nada é criado até tocar. Os valores são apresentados na sua moeda de apresentação.
