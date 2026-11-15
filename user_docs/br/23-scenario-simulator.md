# Simulador de cenários

> Arraste os controles deslizantes para ajustar suas categorias de despesas e receitas — e veja exatamente quanto sua economia poderia mudar em 3, 6 ou 12 meses.

## Visão geral

O **Simulador de cenários** permite responder a perguntas do tipo “e se?” sobre suas finanças sem mexer nos dados reais. Mova um controle para cortar 20% dos gastos com alimentação, inclua uma renda extra de 1.000 zł de um trabalho paralelo e veja na hora como ficaria sua economia acumulada daqui a 6 meses.

Todos os cálculos são feitos no aparelho — nenhum dado é enviado para lugar nenhum e nada muda no seu histórico real de despesas.

## Como acessar

Abra a aba **Análises** e toque no cartão **Simulador de cenários** no topo da tela.

## Como os números são calculados

O simulador usa as **transações dos últimos 3 meses** para estimar uma média mensal de cada categoria:

```
média mensal = total da categoria nos últimos 3 meses ÷ 3
```

Todos os valores são convertidos para sua moeda base com as cotações atuais.

## Ajustar despesas

Cada categoria de despesa aparece com a média mensal atual e um controle deslizante que vai de **−100%** a **+100%**, em passos de 5%.

- Arraste para a **esquerda** (negativo) para simular cortes nos gastos — a barra fica verde
- Arraste para a **direita** (positivo) para simular aumentos nos gastos — a barra fica vermelha
- O rótulo abaixo do controle mostra o valor resultante

## Ajustar receitas

As categorias de receita funcionam do mesmo jeito. Arraste para a direita para simular um aumento de salário e para a esquerda para uma redução.

### Adicionar receita extra

Toque em **Adicionar receita extra** dentro da seção de receitas para informar uma fonte adicional (por exemplo, um projeto paralelo ou um trabalho freelance). Digite uma descrição e um valor mensal. Você pode adicionar várias linhas de receita extra.

## Gráfico de projeção

O gráfico mostra a economia acumulada ao longo do horizonte selecionado:

- **Linha cinza** — trajetória atual (sem mudanças)
- **Linha colorida** — trajetória do cenário (com seus ajustes)

Use os botões **3 / 6 / 12 meses** acima do gráfico para mudar o horizonte da projeção. As projeções são estimativas baseadas nas médias dos últimos meses, não uma previsão garantida.

## Cartões de resumo

Três cartões abaixo do gráfico mostram, lado a lado, os totais do cenário em 3, 6 e 12 meses. O horizonte selecionado fica em destaque. Cada cartão mostra:

- A economia acumulada do cenário
- A economia acumulada atual (para comparação)
- A diferença em relação à trajetória atual

## Barra de resumo (topo da tela)

O cartão no topo da tela é atualizado em tempo real:

| Lado esquerdo | Lado direito |
|---|---|
| Economia mensal atual | Economia mensal do cenário |
| (sem alteração) | ↑ ou ↓ diferença |

## Salvar cenários

Toque em **Salvar cenário** na barra de ações no topo para salvar o estado atual dos controles e o horizonte da projeção com um nome que você escolher (por exemplo, “Cortar restaurantes 30%”). Os cenários salvos ficam no seu aparelho — você pode voltar a eles quando quiser.

- **Plano Free**: até 5 cenários salvos
- **Pro / Business**: ilimitados

## Carregar um cenário salvo

Toque em **Cenários salvos** (ícone de pasta) na barra de ações para abrir a lista de cenários salvos. Toque em qualquer linha para restaurar na hora todos os controles e o horizonte daquele estado. Para excluir um cenário salvo, toque no ícone de lixeira na linha dele.

## Compartilhar uma projeção

Toque em **Compartilhar** (ao lado do botão de redefinir, na parte de baixo da tela) para abrir a tela de compartilhamento do sistema com um resumo em texto da projeção atual. O resumo inclui:

- Economia mensal atual vs. do cenário
- Diferença mensal
- Totais acumulados para o horizonte selecionado

Nenhum dado é enviado — o compartilhamento usa só texto, gerado no aparelho.

## Redefinir

Toque em **Redefinir tudo** na parte de baixo da tela para zerar todos os controles e receitas extras. Os cenários salvos não são afetados.

## Perguntas frequentes

- **P: Mexer nos controles altera meus dados reais?**
  **R:** Não. O simulador é somente leitura — ele só lê seus dados históricos para calcular as médias. Nada é salvo nem alterado.

- **P: Por que os valores das categorias parecem mais baixos do que eu esperava?**
  **R:** Os valores são uma média de 3 meses. Se em um desses meses você gastou bem menos que o normal (por exemplo, porque estava viajando), a média fica mais baixa.

- **P: Minha categoria de receita não aparece.**
  **R:** Só aparecem no simulador as categorias com pelo menos uma transação nos últimos 3 meses.

- **P: A projeção parece errada — minha economia aparece negativa.**
  **R:** Se suas despesas atuais são maiores que suas receitas, o ponto de partida já é negativo. O simulador mostra o quanto o cenário melhora ou piora essa diferença.

---

*Veja também: [Análises](./06-analytics.md) | [Auditoria de despesas](./19-fat-finder.md) | [Metas de economia](./18-savings-goals.md)*
