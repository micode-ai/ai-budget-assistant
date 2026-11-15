# Simulador de cenários

> Arraste os controlos deslizantes para ajustar as suas categorias de despesas e receitas — e veja exatamente quanto a sua poupança poderia mudar em 3, 6 ou 12 meses.

## Visão geral

O **Simulador de cenários** permite responder a perguntas do tipo «e se?» sobre as suas finanças sem mexer nos dados reais. Mova um controlo para cortar 20% nos gastos com alimentação, junte uma receita extra de 1 000 zł de um trabalho paralelo e veja de imediato como ficaria a sua poupança acumulada daqui a 6 meses.

Todos os cálculos são feitos no dispositivo — nenhum dado é enviado para lado nenhum e nada é alterado no seu histórico real de despesas.

## Como aceder

Abra o separador **Análise** e toque no cartão **Simulador de cenários** no topo do ecrã.

## Como são calculados os números

O simulador usa as **transações dos últimos 3 meses** para estimar uma média mensal de cada categoria:

```
média mensal = total da categoria nos últimos 3 meses ÷ 3
```

Todos os montantes são convertidos para a sua moeda base com as taxas de câmbio atuais.

## Ajustar despesas

Cada categoria de despesa aparece com a sua média mensal atual e um controlo deslizante que vai de **−100%** a **+100%**, em passos de 5%.

- Arraste para a **esquerda** (negativo) para simular cortes nos gastos — a barra fica verde
- Arraste para a **direita** (positivo) para simular aumentos nos gastos — a barra fica vermelha
- A legenda por baixo do controlo mostra o montante resultante

## Ajustar receitas

As categorias de receita funcionam da mesma forma. Arraste para a direita para simular um aumento salarial e para a esquerda para uma redução.

### Adicionar receita extra

Toque em **Adicionar receita extra** dentro da secção de receitas para introduzir uma fonte adicional (por exemplo, um projeto paralelo ou trabalho freelance). Introduza uma descrição e um montante mensal. Pode adicionar várias linhas de receita extra.

## Gráfico de projeção

O gráfico mostra a poupança acumulada ao longo do horizonte selecionado:

- **Linha cinzenta** — trajetória atual (sem alterações)
- **Linha colorida** — trajetória do cenário (com os seus ajustes)

Use os botões **3 / 6 / 12 meses** por cima do gráfico para mudar o horizonte da projeção. As projeções são estimativas baseadas nas médias dos últimos meses, não uma previsão garantida.

## Cartões de resumo

Três cartões por baixo do gráfico mostram, lado a lado, os totais do cenário a 3, 6 e 12 meses. O horizonte selecionado fica em destaque. Cada cartão mostra:

- A poupança acumulada do cenário
- A poupança acumulada atual (para comparação)
- A diferença face à trajetória atual

## Barra de resumo (topo do ecrã)

O cartão no topo do ecrã é atualizado em tempo real:

| Lado esquerdo | Lado direito |
|---|---|
| Poupança mensal atual | Poupança mensal do cenário |
| (sem alteração) | ↑ ou ↓ diferença |

## Guardar cenários

Toque em **Guardar cenário** na barra de ações no topo para guardar o estado atual dos controlos e o horizonte da projeção com um nome à sua escolha (por exemplo, «Reduzir restaurantes 30%»). Os cenários guardados ficam no seu dispositivo — pode voltar a eles quando quiser.

- **Plano Free**: até 5 cenários guardados
- **Pro / Business**: ilimitados

## Carregar um cenário guardado

Toque em **Cenários guardados** (ícone de pasta) na barra de ações para abrir a lista de cenários guardados. Toque numa linha para repor de imediato todos os controlos e o horizonte nesse estado. Para eliminar um cenário guardado, toque no ícone do caixote do lixo na respetiva linha.

## Partilhar uma projeção

Toque em **Partilhar** (ao lado do botão de repor, no fundo do ecrã) para abrir a folha de partilha do sistema com um resumo em texto da projeção atual. O resumo inclui:

- Poupança mensal atual vs. do cenário
- Diferença mensal
- Totais acumulados para o horizonte selecionado

Nenhum dado é enviado — a folha de partilha usa apenas texto, gerado no dispositivo.

## Repor

Toque em **Repor tudo** no fundo do ecrã para pôr todos os controlos e receitas extra a zero. Os cenários guardados não são afetados.

## Perguntas frequentes

- **P: Mexer nos controlos altera os meus dados reais?**
  **R:** Não. O simulador é só de leitura — apenas lê os dados históricos para calcular as médias. Nada é guardado nem alterado.

- **P: Porque é que os montantes das categorias parecem mais baixos do que esperava?**
  **R:** Os montantes são uma média de 3 meses. Se num desses meses gastou invulgarmente pouco (por exemplo, porque esteve fora), a média fica mais baixa.

- **P: A minha categoria de receita não aparece.**
  **R:** Só aparecem no simulador as categorias com pelo menos uma transação nos últimos 3 meses.

- **P: A projeção parece errada — a minha poupança aparece negativa.**
  **R:** Se as suas despesas atuais forem superiores às receitas, o ponto de partida já é negativo. O simulador mostra quanto o cenário melhora ou agrava essa diferença.

---

*Ver também: [Análise](./06-analytics.md) | [Auditoria de despesas](./19-fat-finder.md) | [Objetivos de poupança](./18-savings-goals.md)*
