# Análise

> Visualize os seus padrões de gastos com gráficos interativos. Filtre por período e moeda, explore os detalhes e receba análises com IA para compreender melhor as suas finanças.

## Visão geral

O separador **Análise** dá uma visão completa dos seus gastos através de gráficos, análises e exploração de dados. Todos os dados se baseiam nas despesas da conta selecionada.

![Ecrã Análise com a história dos seus gastos e as receitas por categoria](../img/analytics.jpg)

## Período e filtros

No topo do ecrã Análise:

- **Seletor de período**: **Semana** | **Mês** | **Ano**
- **Filtro de moeda**: **Todas** as moedas, ou selecione uma em concreto (USD, EUR, PLN, etc.)

O período selecionado afeta todos os gráficos e análises abaixo.

## Cartões de resumo

- **Total gasto** — o total das suas despesas no período selecionado
  - **face ao período anterior** — «mais do que no período anterior» ou «menos do que no período anterior» (semana/mês/ano), com a percentagem
  - **face à média de 3 meses** — aparece por baixo da comparação com o período anterior quando tiver pelo menos 1 mês completo de dados anteriores, por exemplo «18% acima da média de 3 meses» (verde = abaixo da média, vermelho = acima da média)
- **Média por dia** — gasto médio diário

Enquanto o período decorre, ambas as comparações usam os mesmos dias: no dia 5, os seus primeiros cinco dias são comparados com os primeiros cinco dias do período anterior (e dos últimos três meses), pelo que um mês a meio nunca parece uma grande poupança. A **Média por dia** conta apenas os dias já decorridos. A linha da média de 3 meses aparece na vista Mês.

## Carrossel de análises com IA

Um carrossel com deslocação horizontal de análises geradas por IA (requer o plano Pro):

- **Anomalias nos gastos** — gastos invulgares detetados (por exemplo, «mais 78% do que o habitual em Transportes»)
- **Previsões do orçamento** — quando se prevê que o orçamento se esgote
- **Oportunidades de poupança** — sugestões para reduzir os gastos
- **Comparação de categorias** — como os seus gastos se comparam entre categorias
- **Mudanças de tendência** — alterações significativas nos padrões de gastos

Cada cartão de análise tem um nível de gravidade: crítico (vermelho), aviso (amarelo) ou informação (azul).

> **Nota:** Os utilizadores do plano Free veem um convite para fazer upgrade: «Faça upgrade para Pro para ter análises de IA.»

## Gráficos

### Receitas por categoria (gráfico circular)

- Reparte as suas receitas por categoria no período selecionado
- Só aparece quando tem receitas com categorias (por exemplo, Salário, Trabalho independente, Dividendos, Rendas)
- Usa uma paleta de verdes/azul-petróleo para se distinguir dos gráficos de despesas
- As receitas sem categoria são agrupadas em «Outras»
- Aparece por cima do gráfico de tendência de gastos
- As categorias de receita funcionam da mesma forma: as categorias principais mostram o total das suas subcategorias, e tocar numa delas mostra o seu detalhe.

### Tendência de gastos (gráfico de barras)

- Mostra os gastos diários ou mensais ao longo do período selecionado
- Interativo: toque em qualquer barra para ver o detalhe desse intervalo de tempo

### Gastos por categoria (gráfico circular)

- Repartição por categoria com percentagens
- Cores por categoria
- Toque numa fatia de uma categoria principal (marcada com ›) para ver as suas subcategorias; tocar numa fatia sem subcategorias apenas a destaca
- **As subcategorias somam-se à categoria principal** — o gráfico circular mostra só as categorias de topo, e o montante de uma categoria principal inclui as suas subcategorias. As categorias principais com subcategorias estão marcadas com ›. Toque numa (na fatia ou na sua linha) para redesenhar o gráfico para essa categoria: as suas subcategorias, mais «<Categoria principal> (sem subcategoria)» para os gastos registados diretamente na categoria principal. Toque no caminho «Todas as categorias › <Categoria principal>» para voltar. O detalhe é reposto sempre que os dados da análise são recalculados — uma transação nova ou editada, uma sincronização, uma mudança de idioma, ou uma mudança de período, conta ou moeda. Os gastos numa subcategoria eliminada ficam numa fatia de topo à parte, porque a aplicação não guarda no dispositivo as categorias eliminadas. Os indicadores «face à média» de uma categoria principal usam o montante somado. O mesmo funciona nos cartões de análise da versão web para computador.

### Orçamento vs. real (gráfico de barras agrupadas)

- Comparação lado a lado dos limites do orçamento com os gastos reais
- Mostra **Dentro do previsto** ou **Acima do orçamento** para cada categoria
- Só aparece se tiver orçamentos ativos

### Gastos por dia da semana (gráfico semanal)

- Análise de padrões que mostra os dias em que gasta mais
- Observação: «O dia em que mais gasta: sábado»

### Por comerciante

- Os principais comerciantes onde gastou dinheiro no período selecionado
- Mostra até 8 comerciantes individuais; os restantes são agrupados em «Outros»
- Só aparece quando pelo menos uma despesa tem comerciante preenchido

Se a mesma loja aparecer com vários nomes, abra **Definições → Comerciantes** para os arrumar: toque em **Selecionar**, marque as variantes e use **Juntar** para as unir num só nome. A aplicação também sugere grupos prováveis (por exemplo, várias entradas *Biedronka*) que pode juntar com um só toque — para que contem como um único comerciante nestes gráficos.

### Por membro

- Quem registou quanto dos gastos no período selecionado.
- Só aparece em contas partilhadas com pelo menos dois membros com gastos.

### Por etiqueta / Por projeto

- **Distribuição por etiqueta** — gastos agrupados pelas suas etiquetas personalizadas
- **Comparação de projetos** — gastos agrupados por projeto
- Ajuda a acompanhar gastos temáticos (por exemplo, todas as despesas com #café ou os custos do projeto «Férias»)

## Ver em detalhe

Toque em qualquer elemento de um gráfico para explorar em mais detalhe:

1. Vista **Ano** — toque na barra de um mês para ampliar esse mês
2. Vista **Mês** — toque numa semana para ampliar essa semana
3. Vista **Semana** — toque num dia para ver as transações desse dia
4. Vista **Dia** — veja as transações individuais

Use o botão **Voltar** para subir de nível.

## Observações rápidas

Por baixo dos gráficos, encontra observações rápidas em texto:

- **Categoria principal** — a categoria em que mais gastou neste período
- **Dia de maior gasto** — o dia com mais gastos
- **Dica de orçamento diário** — gasto diário recomendado para se manter dentro do previsto
- **Poupança nos talões** — total poupado com descontos. Toque para ver que lojas lhe deram os maiores descontos e de que talões vieram.
- **Depósitos pagos** — total de depósitos de embalagens retornáveis («kaucja»/«Pfand»/«statiegeld») pagos nos talões digitalizados. Toque para ver a mesma repartição por loja/talão. Corresponde ao que pagou na caixa, não a um reembolso — as garrafas e latas devolvidas não são registadas.

As duas linhas só aparecem quando tiver um desconto ou um depósito registado no período, e apenas se a sua conta não estiver totalmente encriptada (nesse caso a aplicação não consegue ler os valores para os repartir).

## Artigos mais comprados

Uma tabela com os artigos de talão que compra com mais frequência:
- Nome do artigo
- Total gasto
- Número de compras

## Exportar

Toque em **Exportar relatório** para abrir o ecrã [Exportação e relatórios](./16-export-reports.md), onde pode gerar relatórios em PDF, Excel e CSV, ver os resumos mensais e gerir as cópias de segurança dos dados.

## Custos dos filhos

Veja quanto lhe custa cada filho, sem adivinhar.

- **Adicionar filhos:** Definições > Dados de referência > Filhos. Só são guardados um nome e uma cor. Arquive um filho em vez de o eliminar; as despesas dele continuam atribuídas.
- **Atribuir uma despesa inteira:** numa despesa nova ou existente, escolha um ou mais filhos. Com vários filhos, o montante é dividido em partes iguais, a menos que edite as partes. Uma despesa usa a atribuição da despesa inteira ou a atribuição por linha do talão, não as duas; a aplicação pergunta antes de mudar.
- **Atribuir linhas do talão:** depois de digitalizar um talão, atribua linhas individuais (fraldas, material escolar) a um filho. A aplicação memoriza a sua escolha e sugere-a da próxima vez. Uma sugestão nunca é aplicada sem a sua confirmação. «Extrair artigos» mantém a atribuição dos produtos que continuam no talão e indica quantos não conseguiu transferir.
- **Em massa:** selecione várias despesas e escolha Atribuir a filho. As despesas com atribuição por linha são ignoradas e a contagem é mostrada.
- **Totais:** o ecrã do filho (e um cartão no separador Análise) mostra este mês, este ano e uma repartição por categoria na sua moeda de apresentação. Um total marcado com ≈ inclui uma aproximação porque faltava uma taxa de câmbio; esses montantes são deixados de fora em vez de serem adivinhados. As despesas planeadas e os valores a receber de contas divididas não são contados.
- **800+ e cobertura:** quando uma receita parece ser o subsídio 800+ (por exemplo, «800+» ou «rodzina 800» na descrição), a aplicação propõe marcá-la para um filho. A cobertura é o subsídio recebido dividido pelo que esse filho custou no mesmo período.
- **Cartão para partilhar:** crie uma imagem com os totais de um filho. O nome do filho fica oculto por predefinição; pode ativá-lo.
- **Extrato em PDF (Pro, editores):** um resumo dos custos de um filho num período de até 24 meses, com totais, repartição mensal e por categoria, a lista de despesas e os talões. Cada página tem um rodapé a indicar que foi preparada na aplicação a partir de dados introduzidos pelo utilizador, e o momento a que os dados se referem. É um resumo dos seus próprios registos, não um documento legal nem certificado. Contém apenas o que já chegou ao servidor, por isso a aplicação sincroniza primeiro e pede-lhe que aguarde se ainda houver algo pendente. Não está disponível em contas com encriptação ponto a ponto.
- **Pais separados:** mantenha os filhos numa conta pessoal, para que o outro progenitor não veja os seus restantes gastos. Uma conta partilhada mostra tudo a todos os membros.

## Perguntas frequentes

- **P: Porque é que não vejo nenhum gráfico?**
  **R:** Os gráficos aparecem depois de ter dados de despesas. Adicione primeiro algumas despesas e depois consulte a Análise.

- **P: Como são geradas as análises com IA?**
  **R:** As análises são geradas a partir dos seus padrões de gastos, comparando-os com dados históricos e identificando anomalias. Requer uma subscrição Pro ou Business.

---

*Ver também: [Orçamentos](./05-budgets.md) | [História dos gastos](./08-spending-story.md) | [Exportação e relatórios](./16-export-reports.md)*
