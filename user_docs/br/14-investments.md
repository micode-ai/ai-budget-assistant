# Carteira de investimentos

> Acompanhe sua carteira de investimentos com preços de mercado em tempo real. Monitore ações, ETFs, criptomoedas, títulos de renda fixa e commodities em um só lugar.

## Visão geral

O recurso Carteira de investimentos permite:

- Acompanhar posições em vários tipos de ativos
- Ver preços em tempo real e o valor da carteira
- Analisar o desempenho em diferentes períodos
- Comparar seus retornos com benchmarks de mercado (SPY, QQQ, DIA, IWM)
- Registrar transações de compra e venda, com taxas

## Criando uma conta de investimento

Para acompanhar investimentos, você precisa de uma conta do tipo **Investimento**:

1. Vá até a aba **Contas**
2. Toque em **Criar conta**
3. Escolha **Investimento** como tipo de conta
4. Dê um nome à carteira (por exemplo, “Carteira principal”, “Aposentadoria”)
5. Toque em **Criar**

## Adicionando posições

### Buscando ativos

1. Abra sua conta de investimento
2. Toque em **Adicionar ativo**
3. Busque pelo ticker (por exemplo, “AAPL”) ou pelo nome da empresa (por exemplo, “Apple”)
4. Escolha o ativo correto nos resultados da busca
5. Adicione observações, se quiser
6. Toque em **Salvar**

### Tipos de ativos suportados

| Tipo | Exemplos |
|------|----------|
| Ações | AAPL, MSFT, GOOGL |
| ETFs | SPY, QQQ, VTI |
| Cripto | BTC, ETH, SOL |
| Títulos de renda fixa | Títulos públicos e privados |
| Commodities | Ouro, prata, petróleo |

## Registrando transações

Depois de adicionar uma posição, registre suas transações de compra e venda:

1. Abra os detalhes da posição
2. Toque em **Adicionar transação**
3. Escolha o tipo de transação: **Comprar** ou **Vender**
4. Informe:
   - **Quantidade** — número de ações/cotas
   - **Preço por unidade** — preço de compra ou de venda
   - **Taxa** — corretagem (opcional)
   - **Data** — data da transação
   - **Observações** — qualquer informação adicional (opcional)
5. Toque em **Salvar**

O app calcula automaticamente:
- **Custo médio** — preço médio ponderado de compra
- **Total investido** — soma de todas as compras menos as vendas
- **L/P atual** — lucro/prejuízo com base no preço atual

## Resumo da carteira

A tela principal de investimentos mostra:

- **Valor total** — valor de mercado atual de todas as posições
- **L/P total** — lucro/prejuízo geral
- **L/P total %** — retorno percentual
- **Variação do dia** — variação do valor hoje

Cada posição exibe:
- O preço atual e a variação do dia
- Sua quantidade e o custo médio
- O L/P individual e o percentual de alocação

## Análises

Acesse as análises detalhadas da carteira:

1. Toque no botão **Análises**
2. Escolha o período: 1S, 1M, 3M, 1A ou Tudo

### Gráfico de desempenho

Mostra o valor da carteira ao longo do tempo, comparado com o valor investido. A área entre as duas linhas representa seus ganhos ou perdas.

### Alocação por tipo

Mostra como sua carteira está distribuída entre os tipos de ativos (ações, ETFs, cripto etc.).

### Maiores altas e baixas

Lista as posições com melhor e pior desempenho, por retorno percentual.

### Insights de IA da carteira (Pro+)

Receba uma análise da sua carteira feita por IA, com recomendações práticas:

1. Abra a aba **Análises**
2. Role até o carrossel de **insights** no topo
3. Deslize para a esquerda/direita para ver os diferentes insights
4. Toque no botão de fechar para ocultar um insight

**Tipos de insight:**

| Tipo | Descrição |
|------|-------------|
| Risco de concentração | Avisa quando um ativo domina sua carteira |
| Desequilíbrio setorial | Alerta quando a carteira está muito concentrada em um tipo de ativo |
| Desempenho abaixo do mercado | Identifica ativos que estão ficando para trás do mercado |
| Desempenho acima do mercado | Destaca oportunidades de rebalanceamento |
| Desvio do benchmark | Mostra quando a carteira se afasta do benchmark |
| Falta de diversificação | Sugere tipos de ativos que estão faltando |
| Alerta de custo médio | Ganhos/perdas não realizados relevantes para o imposto |
| Impacto das taxas | Avisa quando as taxas estão comendo seus retornos |

Cada insight traz uma visualização (gráfico) e uma sugestão prática.

**Observação:** Os insights de IA ficam em cache por 24 horas, e cada atualização custa 2,5 créditos de IA.

### Comparação com o benchmark (Pro+)

Compare os retornos da sua carteira com índices de mercado:

| Benchmark | Descrição |
|-----------|-------------|
| SPY | Índice S&P 500 |
| QQQ | Índice Nasdaq 100 |
| DIA | Dow Jones Industrial |
| IWM | Russell 2000 (small caps) |

**Entendendo a comparação:**
- **Retorno da carteira** — seu ganho/perda real em porcentagem
- **Retorno do benchmark** — o desempenho do índice no mesmo período
- **Diferença** — quanto você ficou acima ou abaixo do índice

## Entendendo os cálculos

Toque em qualquer card de análise para ver a explicação da fórmula:

### Desempenho
```
Return % = ((End Value - Start Value) / Start Value) x 100
```

### L/P (lucro e prejuízo)
```
P&L = Current Value - Total Invested
P&L % = (P&L / Total Invested) x 100
```

### Alocação
```
Allocation % = (Asset Value / Total Portfolio Value) x 100
```

## Atualização de preços

- Os preços são atualizados automaticamente a cada 15 minutos
- Toque no botão **Atualizar preços** para atualizar na hora
- Os preços históricos ficam em cache para economizar dados

## Dicas

1. **Acompanhe tudo** — Adicione todos os seus investimentos para ter uma visão completa
2. **Registre as taxas** — Inclua a corretagem para ter um L/P preciso
3. **Use os benchmarks** — Compare com os índices para medir seu desempenho
4. **Revise com frequência** — Confira as análises toda semana para identificar tendências

## Limitações

- Os dados de preços são fornecidos pela API Twelve Data
- Alguns ativos menos comuns podem não estar disponíveis
- Os dados históricos se limitam aos dias de pregão
- Os preços em tempo real podem ter um atraso de 15 minutos

---

[Anterior: Conquistas e gamificação](./13-gamification.md) | [Voltar ao índice](./00-index.md)
