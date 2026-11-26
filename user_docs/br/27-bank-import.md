# Importar transações do seu banco

> Importe transações de um extrato do seu banco em CSV, XLSX ou PDF. Suporta mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise, bancos alemães (Sparkasse, Volksbank, DKB, ING, comdirect, Commerzbank, N26) e qualquer outro banco pelo mapeador universal de colunas.

## Bancos suportados

- **mBank** — exportação CSV
- **PKO BP** — exportação CSV
- **Erste Bank** — extrato em PDF
- **Alior Bank** — extrato em PDF
- **Revolut** — exportação CSV
- **Wise** — exportação CSV (várias moedas; as conversões de moeda são detectadas automaticamente)
- **Bancos alemães** — exportação CSV de Sparkasse, Volksbank / Raiffeisenbank, DKB, ING Deutschland, comdirect, Commerzbank, N26. Eles aparecem na lista quando o app está em alemão; **Detectar automaticamente** reconhece os arquivos em qualquer idioma. Lançamentos pendentes (ainda não compensados) são ignorados, para não serem importados duas vezes depois de compensados
- **Outro** — qualquer banco, pelo mapeador universal de colunas (CSV)
- **Planilhas** — extratos em XLSX também funcionam; o app lê a primeira aba

Novos bancos são adicionados com o tempo. Se o seu ainda não estiver na lista, use **Outro** e mapeie as colunas você mesmo.

## Como importar

1. Vá em **Configurações → Importar transações**
2. Escolha seu banco na lista (ou **Outro (CSV personalizado)**, se ele não estiver na lista)
3. Selecione o arquivo que você exportou do banco
4. O app mostra uma prévia — cada linha aparece marcada como despesa, receita ou câmbio
5. Desmarque as linhas que você não quiser e toque em **Importar**

O app ignora as linhas que já existem na sua conta, comparando data, valor e moeda — importar o mesmo arquivo duas vezes não cria duplicatas. As linhas coincidentes ficam desmarcadas por padrão; marque de novo se for mesmo uma transação diferente.

## Onde encontrar a exportação do seu banco

- **mBank**: Web banking → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)
- **Revolut**: app Revolut → Statements → escolha o período → CSV → Download
- **Wise**: wise.com → Transactions → Statements and Reports → escolha o período → CSV → escolha a moeda/o saldo → Download

> **Dica para o Wise:** O Wise gera um CSV por saldo em cada moeda. Importe cada moeda separadamente. Até 469 dias por exportação.

## Wise — conversões de moeda e tarifas

Quando você converte moedas dentro do Wise (ex.: 100 USD → EUR), o Wise cria duas linhas. O app detecta esses pares automaticamente e cria um único registro de **Câmbio** (visível em Carteira → Câmbio) em vez de duas transações sem relação.

O Wise também informa as tarifas em uma coluna separada, `Total fees` — o app inclui a tarifa no valor da despesa, para que o total bata com o que realmente saiu do seu saldo.

## O que é importado

Cada linha vira uma Despesa, uma Receita ou um Câmbio. As categorias são sugeridas automaticamente para os estabelecimentos mais conhecidos — você pode mudá-las depois. Cada linha importada fica marcada com o banco de origem e um ID único, então importar o mesmo arquivo de novo é sempre seguro.

**Nomes de estabelecimentos mais limpos.** Redes de lojas conhecidas são reconhecidas automaticamente, então uma linha de extrato como `BIEDRONKA 1234 WARSZAWA` é salva simplesmente como **Biedronka**. Assim, uma loja aparece como um único estabelecimento nas suas análises, em vez de dezenas de entradas separadas por unidade.

## “Outro” — mapeador universal de CSV

Se o seu banco não estiver na lista, escolha **Outro (CSV personalizado)**. O app mostra uma prévia do arquivo e pede que você indique qual coluna tem a data, o valor e a descrição. Salve esse mapeamento com um nome, e o próximo CSV com o mesmo layout de colunas é importado automaticamente.

## Quando nada reconhece seu extrato

Se nenhum dos bancos acima servir e o arquivo não tiver um layout de colunas simples que o app consiga adivinhar sozinho, ele pode pedir a um modelo de IA que descubra as colunas para você — qual é a data, qual é o valor e assim por diante.

**Antes de qualquer envio, você é consultado uma vez.** Na primeira vez que isso acontece em uma conta, aparece uma tela explicando o que sai do seu dispositivo: em um CSV ou planilha, só a linha de cabeçalho e até 10 linhas de exemplo — nunca o arquivo inteiro. Em um extrato em PDF, são as primeiras 20 linhas do texto extraído. Você decide uma vez por conta; depois disso, o app lembra sua escolha.

- **Usar IA** — o arquivo é lido de novo com as colunas que o modelo identificou.
- **Vou mapear manualmente** — você vai direto para o mapeador manual descrito acima. Essa recusa acontece antes de qualquer análise, então ainda não há nada para pré-preencher — você mapeia as colunas do mesmo jeito que para qualquer outro banco não suportado.

**O resultado é mostrado, não presumido.** Quando a identificação pela IA dá certo, a prévia mostra uma fileira de chips acima das transações — algo como `Date → Data operacji`, `Amount → Kwota` — junto com o palpite de qual banco é este. É uma estimativa, não uma certeza: toque nessa fileira a qualquer momento para abrir o mapeador e corrigir uma coluna que a IA errou.

**Algumas coisas são sinalizadas para você conferir, em vez de presumidas em silêncio:**
- Se o arquivo não tiver nenhuma coluna de moeda, todas as linhas são lidas na moeda da sua conta, e um aviso informa isso — toque nele para mudar a moeda antes de importar; a alteração vale para o arquivo inteiro.
- Ler números de um PDF é mais difícil de conferir do que em um CSV, então o app tenta confirmar que o que encontrou bate com o saldo final do extrato. Quando não consegue confirmar, aparece um aviso pedindo que você revise a lista. Não é um erro — é simplesmente o caso normal sempre que um extrato não mostra um saldo corrente para comparar, ou quando a conferência não fecha.

**Extratos em PDF exigem o plano Pro.** Ler um PDF com IA exige mais processamento do que um CSV, então é um recurso Pro — uma conta gratuita vê uma tela de upgrade nesse ponto, em vez de uma mensagem de erro.

Os bancos já listados acima (mBank, PKO BP, Erste, Alior, Revolut, Wise) não são afetados por nada disso — eles são importados exatamente como descrito antes nesta página.

## Importações anteriores e desfazer

A seção **Importações anteriores**, no final de **Configurações → Importar transações**, mostra as últimas 20 importações — origem, data e número de linhas.

Para desfazer uma importação recente, toque na **seta de desfazer** (↩) à direita. Todas as transações dessa importação são removidas e o bloqueio de duplicatas é liberado, para você poder importar o mesmo arquivo de novo sem problemas.

- É possível desfazer por **30 dias** após a importação original.
- Importações com mais de 30 dias não mostram o botão de desfazer.

## Não encontrou seu banco?

No final de **Configurações → Importar transações** há um card **“Não encontrou seu banco?”**. Toque nele, digite o nome do banco e anexe um extrato de exemplo. Seu pedido vai direto para a nossa equipe.

## Codificação

Nos arquivos CSV, o app detecta automaticamente UTF-8 e Windows-1250 (comum nas exportações de bancos poloneses). Os extratos em PDF são lidos diretamente — não é preciso escolher codificação.

## Vindo de outro app?

Em **Configurações → Importar transações** há um card separado, **“Vindo de outro app?”**, com Monefy, Wallet by BudgetBakers e Money Manager / 1Money.

Exporte seu histórico do app antigo, escolha aqui a linha correspondente e suas transações chegam — **junto com suas categorias**. Uma categoria que você tinha lá e que ainda não existe aqui é criada para você, então seu histórico chega organizado, e não como uma pilha sem distinção.

As transferências entre suas próprias contas no app antigo são ignoradas: elas não são gastos, e importá-las contaria o mesmo dinheiro duas vezes.

Seu app não está na lista? Use **Detectar automaticamente (qualquer banco)** no topo — formatos de exportação desconhecidos são analisados automaticamente e, em geral, a importação funciona do mesmo jeito.

---

*Veja também: [Despesas e receitas](./03-expenses-and-income.md) | [Carteira e câmbio](./10-wallet-and-exchange.md) | [Configurações](./11-settings.md)*

## O relatório depois de uma importação

Quando uma importação traz um bom período de histórico (dez despesas ou mais), o app abre um relatório curto em vez de uma simples mensagem de “pronto”:

- **Gasto médio por mês** e o período que o extrato cobre.
- **Para onde foi seu dinheiro** — suas principais categorias, com valores e participações.
- **Assinaturas encontradas** — cobranças do mesmo valor, do mesmo favorecido, em um intervalo regular mensal ou semanal, que você ainda não acompanha.
- **Orçamentos mensais sugeridos** — para suas maiores categorias que ainda não têm orçamento, a partir do seu gasto médio mensal arredondado para cima. São estimativas que você pode ajustar.
- **Possíveis duplicatas** — o mesmo favorecido e o mesmo valor com um dia de diferença. Muitas vezes são duas compras reais, então elas só são mostradas, nunca removidas — vale conferir rapidamente com seu banco.
- **Onde você mais gasta** — seus maiores estabelecimentos.

Tudo o que é sugerido já vem marcado. Toque em **Configurar selecionados** para criar esses orçamentos e acompanhar essas assinaturas de uma vez, desmarque antes o que não quiser ou toque em **Agora não**. Nada é criado até você tocar. Os valores aparecem na sua moeda de exibição.
