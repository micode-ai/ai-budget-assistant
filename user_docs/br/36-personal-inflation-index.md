# Índice de inflação pessoal

> Acompanhe como os preços que você realmente paga mudam com o tempo, calculados a partir dos seus recibos escaneados — sem custo de IA.

O Índice de inflação pessoal mostra como os preços que você realmente paga mudaram ao longo do tempo — calculado a partir dos seus próprios recibos escaneados. Diferente dos números oficiais de inflação, ele reflete a sua cesta de compras de verdade.

## Como funciona

Quando você escaneia um recibo, o app extrai cada item (por exemplo, “Mleko Łaciate”, “Chleb Razowy”) e registra o preço pago e o nome da loja. Com o tempo, o app monta um histórico de preços para cada produto e calcula a sua inflação pessoal como uma média ponderada de todos os produtos acompanhados.

A fórmula pondera os produtos por quanto você gasta com eles (itens que você compra com frequência e a preços altos pesam mais no índice), dando uma visão justa de como as mudanças de preço afetam os seus gastos específicos.

## Onde encontrar

O Índice de inflação pessoal aparece na aba **Análises**, abaixo da seção Insights de IA. Ele mostra:

- Um número de destaque: **“Sua inflação: +11,4%”** no período selecionado
- Quantos produtos estão sendo acompanhados
- Uma lista de produtos com a variação de preço de cada um
- Gráfico do histórico de preços e comparação entre lojas para cada produto (toque em qualquer produto)

## Escolhendo o período

Toque em **3M**, **6M** ou **12M** para mudar o período de comparação. O app compara os preços da primeira metade do período (a “base”) com os da segunda metade (o “atual”), então um período de 6 meses compara os meses 1–3 com os meses 4–6.

O índice mostra `null` até que pelo menos 3 produtos tenham sido comprados tanto no período base quanto no atual.

## Comparação entre lojas

Toque em qualquer produto para ver:
- Um gráfico do histórico de preços ao longo do tempo
- Uma tabela com o preço mais recente em cada loja onde você comprou esse produto, do mais barato para o mais caro
- Uma opção para renomear o produto (veja abaixo)

## Buscando o histórico de preços de um produto

A aba Análises só lista os produtos que mais variaram — aqueles cujo preço mais mudou.
Para consultar **qualquer** produto que você já escaneou, acesse **Configurações → Dados de referência → Produtos** e
use a caixa de busca (por exemplo, busque “azeite”). Toque em um resultado para ver o mesmo gráfico de histórico de preços e
a comparação da loja mais barata, mesmo para um produto que você comprou só uma ou duas vezes — esta tela não exige
um número mínimo de compras, então um produto novo aparece assim que o primeiro recibo com ele é
escaneado.

## Gerenciando os nomes dos produtos

O app dá automaticamente um nome curto e limpo a cada produto (por exemplo, “PIWO TYSKIE 0,5L 4,7%” → “Tyskie Piwo”). Você pode corrigir ou personalizar esses nomes.

### Renomeando um produto

Toque em qualquer linha de produto na seção de inflação e depois na opção de renomear. Digite o nome que preferir e salve. Isso só muda como o produto é exibido — o histórico de preços por trás dele é mantido.

### Gerenciando todos os produtos

Acesse **Configurações → Dados de referência → Produtos** para ver todos os produtos acompanhados. Ali você pode:

- **Ver o histórico de preços e a loja mais barata** de qualquer produto (toque em uma linha)
- **Renomear** qualquer produto (toque no ícone de lápis em uma linha)
- **Mesclar** várias variações de um produto em uma só (toque e segure para selecionar e depois toque em Mesclar) — útil quando o mesmo produto aparece com nomes um pouco diferentes
- **Restaurar** o nome original de um produto personalizado (toque no ícone de restaurar em uma linha que foi renomeada)

### Mesclando produtos

Se você vê “Mleko 3.2%” e “Mleko Łaciate” separados, mas eles são o mesmo produto, selecione os dois, toque em Mesclar e digite o nome padrão que você quer. Todo o histórico de preços dos dois nomes passa a ficar reunido sob esse único nome.

## Conseguindo mais dados

O índice precisa de pelo menos 3 produtos com compras tanto no período base quanto no atual. Se você vir a mensagem “Escaneie alguns recibos para ver sua inflação”, continue escaneando recibos com o tempo — o índice aparece automaticamente quando houver dados suficientes.

Só os recibos escaneados com a câmera (OCR) entram no índice. Despesas digitadas manualmente e importações bancárias não trazem os itens por produto.

## Preços da comunidade — onde está mais barato

**Onde está mais barato** (Análises → Índice de inflação pessoal → o banner da comunidade) é **grátis para todo mundo**. Ele compara o preço de um produto entre lojas usando preços anônimos de recibos que outros compradores escolheram compartilhar.

- É **opcional**: ative **Configurações → Dados e relatórios → Compartilhar preços anônimos** para contribuir. Você pode consultar os preços da comunidade de qualquer forma.
- Um preço só aparece depois que **vários compradores diferentes** o confirmam, então um único recibo nunca define o preço de uma loja. A tela mostra isso como, por exemplo, “5+ compradores”.
- Por isso, uma loja ou um produto pode ainda não aparecer — simplesmente ainda não foi confirmado por gente suficiente. Os preços aparecem depois de algumas semanas de dados.
- Nada pode ser ligado a você: só ficam guardados o produto, a região da loja e o preço — nunca seu nome, sua conta ou sua localização exata.

## Privacidade

Todo o histórico de preços fica guardado na sua conta, no servidor. Ele não é compartilhado entre contas nem usado para montar nenhum catálogo de produtos compartilhado. Se você excluir sua conta, todo o histórico de preços é excluído junto. A única exceção são os preços anônimos da comunidade, opcionais, descritos acima.
