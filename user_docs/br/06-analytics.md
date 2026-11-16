# Análises

> Visualize seus padrões de gastos com gráficos interativos. Filtre por período e moeda, aprofunde-se nos detalhes e receba insights com IA para entender melhor suas finanças.

## Visão geral

A aba **Análises** oferece uma visão completa dos seus gastos por meio de gráficos, insights e exploração de dados. Todos os dados se baseiam nas despesas da conta selecionada.

![Tela Análises com a história dos seus gastos e as receitas por categoria](../img/analytics.jpg)

## Período e filtros

No topo da tela Análises:

- **Seletor de período**: **Semana** | **Mês** | **Ano**
- **Filtro de moeda**: **Todas** as moedas, ou selecione uma específica (USD, EUR, PLN etc.)

Se a sua conta tiver um **Mês financeiro** (por exemplo, começando no dia do pagamento, dia 10), a visualização **Mês** segue esse mês: *outubro* passa a ir de 10 de outubro a 9 de novembro, e as datas exatas aparecem abaixo do nome do mês. As comparações com meses anteriores e as barras mensais usam os mesmos períodos. As visualizações Semana e Ano continuam no calendário.

O período selecionado afeta todos os gráficos e insights abaixo.

## Cartões de resumo

- **Total gasto** — o total das suas despesas no período selecionado
  - **em relação ao período anterior** — “mais do que no período anterior” ou “menos do que no período anterior” (semana/mês/ano), com a porcentagem
  - **em relação à média de 3 meses** — aparece abaixo da comparação com o período anterior quando você tem pelo menos 1 mês completo de dados anteriores, por exemplo “18% acima da média de 3 meses” (verde = abaixo da média, vermelho = acima da média)
- **Média por dia** — gasto médio diário

Enquanto o período está em andamento, as duas comparações usam os mesmos dias: no dia 5, seus primeiros cinco dias são comparados com os primeiros cinco dias do período anterior (e dos últimos três meses), então um mês pela metade nunca parece uma grande economia. A **Média por dia** conta só os dias que já passaram. A linha da média de 3 meses aparece na visualização Mês.

## Receitas vs despesas

Mostra quanto você **ganhou**, **gastou** e **economizou** no período selecionado, e que parte da sua renda você guardou (taxa de economia). Se você gastou mais do que ganhou, o último valor aparece como **Gasto a mais**. Abaixo, barras comparam receitas e despesas mês a mês: os últimos 6 meses na visualização Mês e todos os meses do ano na visualização Ano.

## Fixas vs variáveis

Mostra quanto dos seus gastos é **fixo** — dinheiro que sai todo período de qualquer jeito — e lista as maiores despesas fixas. Uma despesa conta como fixa quando é recorrente ou quando bate com uma das suas assinaturas ativas no gerenciador de assinaturas (mesmo nome, ou mesma categoria e valor). Todo o resto é variável. Para que o aluguel ou outro pagamento regular conte como fixo, marque-o como recorrente ou cadastre-o como assinatura. As cobranças que o gerenciador de assinaturas lança automaticamente na renovação sempre contam como fixas, mesmo que você mude o nome delas ou cancele a assinatura.

Você também pode marcar uma categoria de despesa inteira como fixa: abra **Configurações → Categorias**, edite a categoria (por exemplo, *Moradia*) e ative **Contar como despesa fixa**. Vale para a conta atual e é compartilhado com os membros dela; num recibo dividido só conta a parte dessa categoria.

## Próximos 30 dias

Aparece quando você está vendo o período atual. É uma estimativa do seu saldo para cada um dos próximos 30 dias: o saldo de hoje, mais as receitas que entram todo mês, menos as renovações de assinaturas e as despesas recorrentes nas datas delas, menos um dia típico de gastos do dia a dia. Se o saldo for ficar abaixo de zero, o cartão mostra a partir de que dia, e as barras abaixo da linha indicam isso. **Próximos lançamentos** lista os próximos pagamentos e receitas. Aportes em metas de economia não são descontados e receitas que não são mensais não entram, então use o valor como referência, não como promessa. Compras planejadas e dívidas suas com vencimento também são descontadas na data (as atrasadas, hoje); o dinheiro que outras pessoas te devem não entra. Para ver a previsão com esse dinheiro, ative **Contar o dinheiro que devem a você** no cartão: o que ainda falta receber é somado em cada data de vencimento (o que está atrasado, hoje). Da mesma forma, **Contar renda irregular** soma o dia médio da renda que não vem todo mês (freelas, reembolsos) dos últimos meses; só aparece se você tiver esse tipo de renda.

## Ano a ano

Nas visões de mês e ano, este cartão compara o período com o mesmo período de um ano atrás: o total e as principais categorias, cada uma com o que você gastou na época e a variação. Enquanto o período está em andamento, compara o mesmo número de dias: a primeira semana deste mês com a primeira semana do mesmo mês no ano passado. Gastar mais aparece em vermelho e menos em verde; uma categoria sem gastos no ano passado é marcada como **novo**. Se a sua conta tiver um **Mês financeiro**, "o mesmo mês do ano passado" é esse mês financeiro. O cartão aparece quando há gastos no período do ano passado.

## Quando eu gasto

Uma grade dos seus dias recentes, uma coluna por semana e uma linha por dia da semana, colorida pelo quanto você gastou naquele dia — quanto mais escuro, mais (cada tom é um quarto dos seus dias com gastos). No computador ela cobre os últimos 12 meses; no celular, quantos meses couberem em tamanho legível. Toque em um dia para ver a data e o total; senão o cartão mostra seu dia de maior gasto. Abaixo, **Média por dia do mês** mostra quanto você gasta em média em cada dia do mês e quais três dias custam mais. Se a sua conta tiver um **Mês financeiro**, o dia 1 é o primeiro dia dele — o do pagamento. O app não sabe o horário das compras, então o cartão trabalha com dias, não com horas. Ele aparece quando você tiver pelo menos 14 dias com gastos.

## Patrimônio líquido

Abra pela entrada **Patrimônio líquido** na aba Análises ou tocando no cartão **Net Capital** da tela inicial. Ele soma tudo o que você tem em todas as suas contas — o dinheiro de cada carteira, o valor de mercado dos seus investimentos e o dinheiro que devem a você — menos as suas próprias dívidas, na sua moeda de exibição. Você vê a variação em relação ao mês passado e a um ano atrás, as quatro partes e os últimos 12 meses em barras: cada mês passado é reconstruído com base nos seus registros e nas taxas de câmbio daquele mês, então o histórico já existe desde o primeiro dia. Uma barra mais clara indica que alguns investimentos foram avaliados pelo preço de compra porque não havia preço de mercado naquela data. Em **Contas** você pode desativar uma conta — por exemplo uma conta compartilhada que outro membro também conta no patrimônio dele; a escolha fica salva neste dispositivo. Uma conta totalmente criptografada não pode ser lida e não é contada.

## Carrossel de insights com IA

Um carrossel com rolagem horizontal de insights gerados por IA (requer o plano Pro):

- **Anomalias nos gastos** — gastos fora do comum detectados (por exemplo, “78% a mais que o normal em Transporte”)
- **Previsões do orçamento** — quando a previsão é de que seu orçamento acabe
- **Oportunidades de economia** — sugestões para reduzir os gastos
- **Comparação de categorias** — como seus gastos se comparam entre as categorias
- **Mudanças de tendência** — mudanças significativas nos padrões de gastos

Cada cartão de insight tem um nível de gravidade: crítico (vermelho), aviso (amarelo) ou informação (azul).

> **Observação:** Usuários do plano Free veem um convite para fazer upgrade: “Faça upgrade para o Pro para ter insights de IA.”

## Gráficos

### Receitas por categoria (gráfico de rosca)

- Divide suas receitas por categoria no período selecionado
- Só aparece quando você tem receitas com categorias (por exemplo, Salário, Freelance, Dividendos, Aluguel)
- Usa uma paleta de verdes/verde-azulado para se diferenciar dos gráficos de despesas
- Receitas sem categoria são agrupadas em “Outras”
- Aparece acima do gráfico de tendência de gastos
- As categorias de receita funcionam do mesmo jeito: as categorias principais mostram o total das suas subcategorias, e tocar em uma delas abre o detalhamento.

### Tendência de gastos (gráfico de barras)

- Mostra os gastos diários ou mensais ao longo do período selecionado
- Interativo: toque em qualquer barra para detalhar aquele intervalo de tempo

### Gastos por categoria (gráfico de rosca)

- Divisão por categoria com porcentagens
- Cores por categoria
- Toque em uma fatia de uma categoria principal (marcada com ›) para ver as subcategorias dela; tocar em uma fatia sem subcategorias apenas a destaca
- **As subcategorias se somam à categoria principal** — o gráfico de rosca mostra só as categorias de nível superior, e o valor de uma categoria principal inclui as subcategorias dela. Categorias principais com subcategorias são marcadas com ›. Toque em uma (na fatia ou na linha dela) para redesenhar o gráfico para essa categoria: as subcategorias dela, mais “<Categoria principal> (sem subcategoria)” para os gastos registrados diretamente na categoria principal. Toque na trilha “Todas as categorias › <Categoria principal>” para voltar. O detalhamento é reiniciado sempre que os dados de análise são recalculados — uma transação nova ou editada, uma sincronização, uma troca de idioma, ou uma mudança de período, conta ou moeda. Gastos em uma subcategoria excluída ficam em uma fatia de nível superior separada, porque o app não guarda categorias excluídas no dispositivo. Os chips “vs. média” de uma categoria principal usam o valor somado. O mesmo funciona nos cartões de análise da versão web para desktop.

### Orçamento vs. real (gráfico de barras agrupadas)

- Comparação lado a lado entre os limites do orçamento e os gastos reais
- Mostra **Dentro do previsto** ou **Acima do orçamento** para cada categoria
- Só aparece se você tiver orçamentos ativos

### Gastos por dia da semana (gráfico semanal)

- Análise de padrões que mostra em quais dias você gasta mais
- Insight: “Dia em que você mais gasta: sábado”

### Por estabelecimento

- Os principais estabelecimentos onde você gastou no período selecionado
- Mostra até 8 estabelecimentos individuais; o restante é agrupado em “Outros”
- Só aparece quando pelo menos uma despesa tem estabelecimento preenchido
- Nomes que só mudam em letras maiúsculas ou espaços (*Lidl*, *LIDL*) contam como um só estabelecimento; abaixo de cada nome você vê quantas compras fez ali e o valor médio por compra

Se a mesma loja aparecer com vários nomes, abra **Configurações → Estabelecimentos** para organizá-los: toque em **Selecionar**, marque as variações e use **Mesclar** para uni-las em um só nome. O app também sugere grupos prováveis (por exemplo, várias entradas *Biedronka*) que você pode mesclar com um só toque — assim elas contam como um único estabelecimento nesses gráficos.

### Por membro

- Quem registrou quanto dos gastos no período selecionado.
- Só aparece em contas compartilhadas com pelo menos dois membros com gastos.

### Por tag / Por projeto

- **Distribuição por tag** — gastos agrupados pelas suas tags personalizadas
- **Comparação de projetos** — gastos agrupados por projeto
- Ajuda a acompanhar gastos temáticos (por exemplo, todas as despesas com #café ou os custos do projeto “Férias”)

## Detalhamento

Toque em qualquer elemento do gráfico para se aprofundar:

1. Visão **Ano** — toque na barra de um mês para ampliar aquele mês
2. Visão **Mês** — toque em uma semana para ampliar aquela semana
3. Visão **Semana** — toque em um dia para ver as transações do dia
4. Visão **Dia** — veja as transações individuais

Use o botão **Voltar** para subir de nível.

## Insights rápidos

Abaixo dos gráficos, você encontra insights rápidos em texto:

- **Categoria principal** — a categoria em que você mais gastou neste período
- **Dia de maior gasto** — o dia com mais gastos
- **Dica de orçamento diário** — gasto diário recomendado para ficar dentro do previsto
- **Economia nos recibos** — total economizado com descontos. Toque para ver quais lojas deram os maiores descontos e de quais recibos eles vieram.
- **Vasilhames pagos** — total de vasilhame de embalagens retornáveis (“kaucja”/“Pfand”/“statiegeld”) pago nos recibos escaneados. Toque para ver a mesma divisão por loja/recibo. Corresponde ao que você pagou no caixa, não a um reembolso — garrafas e latas devolvidas não são registradas.

As duas linhas só aparecem quando você tem um desconto ou um vasilhame registrado no período, e só se a sua conta não estiver totalmente criptografada (nesse caso o app não consegue ler os valores para detalhá-los).

## Itens mais comprados

Uma tabela com os itens de recibo que você compra com mais frequência:
- Nome do item
- Total gasto
- Número de compras

## Exportar

Toque em **Exportar relatório** para abrir a tela [Exportação e relatórios](./16-export-reports.md), onde você pode gerar relatórios em PDF, Excel e CSV, ver os resumos mensais e gerenciar os backups dos dados.

## Custos dos filhos

Veja quanto cada filho custa para você, sem achismo.

- **Adicionar filhos:** Configurações > Dados de referência > Filhos. Só um nome e uma cor são guardados. Arquive um filho em vez de excluí-lo; as despesas dele continuam atribuídas.
- **Atribuir uma despesa inteira:** em uma despesa nova ou existente, escolha um ou mais filhos. Com vários filhos, o valor é dividido em partes iguais, a menos que você edite as partes. Uma despesa usa atribuição da despesa inteira ou atribuição por linha do recibo, não as duas; o app pergunta antes de trocar.
- **Atribuir linhas do recibo:** depois de escanear um recibo, atribua linhas individuais (fraldas, material escolar) a um filho. O app memoriza sua escolha e a sugere na próxima vez. Uma sugestão nunca é aplicada sem a sua confirmação. “Extrair itens” mantém a atribuição dos produtos que continuam no recibo e informa quantos não conseguiu transferir.
- **Em massa:** selecione várias despesas e escolha Atribuir a filho. Despesas com atribuição por linha são ignoradas e a contagem é mostrada.
- **Totais:** a tela do filho (e um cartão na aba Análises) mostra este mês, este ano e uma divisão por categoria na sua moeda de exibição. Um total marcado com ≈ inclui uma aproximação porque faltava uma cotação; esses valores são deixados de fora em vez de serem estimados. Despesas planejadas e valores a receber de contas divididas não são contados.
- **800+ e cobertura:** quando uma receita parece ser o benefício 800+ (por exemplo, “800+” ou “rodzina 800” na descrição), o app oferece marcá-la para um filho. A cobertura é o benefício recebido dividido pelo que esse filho custou no mesmo período.
- **Cartão para compartilhar:** crie uma imagem com os totais de um filho. O nome do filho fica oculto por padrão; você pode ativá-lo.
- **Extrato em PDF (Pro, editores):** um resumo dos custos de um filho em um período de até 24 meses, com totais, divisão mensal e por categoria, a lista de despesas e os recibos. Cada página traz um rodapé dizendo que foi preparada no app a partir de dados inseridos pelo usuário, e o momento a que os dados se referem. É um resumo dos seus próprios registros, não um documento legal nem certificado. Contém apenas o que já chegou ao servidor, então o app sincroniza primeiro e pede que você aguarde se algo ainda estiver pendente. Não está disponível em contas com criptografia de ponta a ponta.
- **Pais separados:** mantenha os filhos em uma conta pessoal, para que o outro genitor não veja seus demais gastos. Uma conta compartilhada mostra tudo para todos os membros.

## Perguntas frequentes

- **P: Por que não vejo nenhum gráfico?**
  **R:** Os gráficos aparecem depois que você tem dados de despesas. Adicione algumas despesas primeiro e depois confira Análises.

- **P: Como os insights com IA são gerados?**
  **R:** Os insights são gerados analisando seus padrões de gastos, comparando-os com dados históricos e identificando anomalias. Isso requer uma assinatura Pro ou Business.

---

*Veja também: [Orçamentos](./05-budgets.md) | [História dos gastos](./08-spending-story.md) | [Exportação e relatórios](./16-export-reports.md)*
