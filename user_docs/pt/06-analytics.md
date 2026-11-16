# Análise

> Visualize os seus padrões de gastos com gráficos interativos. Filtre por período e moeda, explore os detalhes e receba análises com IA para compreender melhor as suas finanças.

## Visão geral

O separador **Análise** dá uma visão completa dos seus gastos através de gráficos, análises e exploração de dados. Todos os dados se baseiam nas despesas da conta selecionada.

![Ecrã Análise com a história dos seus gastos e as receitas por categoria](../img/analytics.jpg)

## Período e filtros

No topo do ecrã Análise:

- **Seletor de período**: **Semana** | **Mês** | **Ano**
- **Filtro de moeda**: **Todas** as moedas, ou selecione uma em concreto (USD, EUR, PLN, etc.)

Se a sua conta tiver um **Mês financeiro** (por exemplo, a começar no dia do ordenado, dia 10), a vista **Mês** segue-o: *outubro* passa a ser de 10 de outubro a 9 de novembro, e as datas exatas aparecem por baixo do nome do mês. As comparações com meses anteriores e as barras mensais usam os mesmos períodos. As vistas Semana e Ano continuam a seguir o calendário.

O período selecionado afeta todos os gráficos e análises abaixo.

## Cartões de resumo

- **Total gasto** — o total das suas despesas no período selecionado
  - **face ao período anterior** — «mais do que no período anterior» ou «menos do que no período anterior» (semana/mês/ano), com a percentagem
  - **face à média de 3 meses** — aparece por baixo da comparação com o período anterior quando tiver pelo menos 1 mês completo de dados anteriores, por exemplo «18% acima da média de 3 meses» (verde = abaixo da média, vermelho = acima da média)
- **Média por dia** — gasto médio diário

Enquanto o período decorre, ambas as comparações usam os mesmos dias: no dia 5, os seus primeiros cinco dias são comparados com os primeiros cinco dias do período anterior (e dos últimos três meses), pelo que um mês a meio nunca parece uma grande poupança. A **Média por dia** conta apenas os dias já decorridos. A linha da média de 3 meses aparece na vista Mês.

## Receitas vs despesas

Mostra o que **ganhou**, **gastou** e **poupou** no período selecionado, e que parte das suas receitas conseguiu guardar (taxa de poupança). Se gastou mais do que ganhou, o último valor indica **Gasto a mais**. Por baixo, barras comparam receitas e despesas mês a mês: os últimos 6 meses na vista Mês e todos os meses do ano na vista Ano.

## Fixas vs variáveis

Mostra que parte das suas despesas é **fixa** — dinheiro que sai em cada período de qualquer forma — e lista as maiores despesas fixas. Uma despesa conta como fixa se for recorrente ou se corresponder a uma das suas subscrições ativas no gestor de subscrições (mesmo nome, ou mesma categoria e montante). Tudo o resto é variável. Para que a renda ou outro pagamento regular conte como fixo, marque-o como recorrente ou adicione-o como subscrição. As cobranças que o gestor de subscrições regista automaticamente em cada renovação contam sempre como fixas, mesmo que lhes mude o nome ou cancele a subscrição.

Também pode marcar uma categoria de despesa inteira como fixa: abra **Definições → Categorias**, edite a categoria (por exemplo, *Habitação*) e ative **Contar como despesa fixa**. Aplica-se à conta atual e é partilhado com os seus membros; num talão dividido só conta a parte dessa categoria.

## Próximos 30 dias

Aparece quando está a ver o período atual. É uma estimativa do seu saldo para cada um dos próximos 30 dias: o saldo de hoje, mais as receitas que chegam todos os meses, menos as renovações de subscrições e as despesas recorrentes nas respetivas datas, menos um dia típico de gastos do dia a dia. Se o saldo for ficar abaixo de zero, o cartão indica a partir de que dia, e as barras abaixo da linha mostram-no. **A seguir** lista os próximos pagamentos e receitas. As contribuições para objetivos de poupança não são descontadas e as receitas que não são mensais não contam, por isso encare o valor como uma orientação, não uma promessa. As compras planeadas e as dívidas com data de pagamento também são descontadas na respetiva data (as em atraso, hoje); o dinheiro que lhe devem não é contado. Para ver a previsão com esse dinheiro, ative **Contar o dinheiro que lhe devem** no cartão: o que ainda está em dívida é somado em cada data de vencimento (o que está atrasado, hoje). Da mesma forma, **Contar rendimentos irregulares** soma o dia médio dos rendimentos não mensais (trabalhos pontuais, reembolsos) dos últimos meses; só aparece se tiver rendimentos desse tipo.

## Ano a ano

Nas vistas de mês e ano, este cartão compara o período com o mesmo período de há um ano: o total e as principais categorias, cada uma com o que gastou nessa altura e a variação. Enquanto o período decorre, compara o mesmo número de dias: a primeira semana deste mês com a primeira semana do mesmo mês do ano passado. Gastar mais aparece a vermelho e menos a verde; uma categoria sem gastos no ano passado é marcada como **novo**. Se a sua conta tiver um **Mês financeiro**, «o mesmo mês do ano passado» é esse mês financeiro. O cartão aparece quando há gastos no período do ano passado.

## Quando gasto

Uma grelha dos seus dias recentes, uma coluna por semana e uma linha por dia da semana, sombreada pelo que gastou nesse dia — quanto mais escuro, mais (cada tom é um quarto dos seus dias com gastos). No computador abrange os últimos 12 meses; no telemóvel, tantos meses quantos couberem num tamanho legível. Toque num dia para ver a data e o total; caso contrário, o cartão indica o dia de maior gasto. Por baixo, **Média por dia do mês** mostra quanto gasta em média em cada dia do mês e que três dias custam mais. Se a sua conta tiver um **Mês financeiro**, o dia 1 é o primeiro dia dele — o do ordenado. A app não sabe a hora das compras, por isso o cartão trabalha com dias, não com horas. Aparece quando tiver pelo menos 14 dias com gastos.

## Património líquido

Abra-o a partir da entrada **Património líquido** no separador Análise ou tocando no cartão **Net Capital** do ecrã inicial. Soma tudo o que tem em todas as suas contas — o dinheiro de cada carteira, o valor de mercado dos seus investimentos e o dinheiro que lhe devem — menos as suas próprias dívidas, na sua moeda de apresentação. Vê a variação face ao mês passado e a há um ano, as quatro partes e os últimos 12 meses em barras: cada mês passado é reconstruído a partir dos seus registos e das taxas de câmbio desse mês, por isso o histórico existe desde o primeiro dia. Uma barra mais clara indica que alguns investimentos foram avaliados ao preço de compra por não haver preço de mercado nessa data. Em **Contas** pode desativar uma conta — por exemplo uma conta partilhada que outro membro também conta no seu património; a escolha fica guardada neste dispositivo. Uma conta totalmente encriptada não pode ser lida e não é contada.

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
- Nomes que só diferem em maiúsculas ou espaços (*Lidl*, *LIDL*) contam como um só comerciante; por baixo de cada nome vê quantas compras fez lá e o valor médio por compra

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
- **Por conta, eliminar ou arquivar:** os filhos pertencem à conta em que está (o ecrã indica-a) — cada conta, incluindo uma partilhada, tem a sua própria lista. Um filho sem custos atribuídos pode ser eliminado (abra-o e toque em **Eliminar filho**); um com custos só pode ser arquivado, para que os custos o mantenham. Numa conta encriptada o nome é guardado encriptado: desbloqueie primeiro a encriptação em **Definições → Segurança**, ou a app avisa em vez de guardar.
- **Criado na conta errada?** Abra o filho, toque em **Mover para outra conta** e escolha a conta (uma que possa editar). Só um filho sem custos atribuídos pode ser movido; para uma conta encriptada, a encriptação tem de estar desbloqueada.
- **Uma categoria para um filho:** abra o filho e escolha **Categorias deste filho** (por exemplo, uma categoria com o nome dele, ou «Escola»). Todas as despesas dessas categorias são atribuídas automaticamente — as já registadas assim que guarda, e as novas à medida que chegam (importações bancárias até à manhã seguinte). As despesas atribuídas à mão, ou com linhas de talão atribuídas, nunca mudam; retirar uma categoria só desfaz o que a regra acrescentou. Uma despesa em que a categoria é só uma parte de um talão dividido não é atribuída automaticamente.
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
