# Carteira de investimentos

> Acompanhe a sua carteira de investimentos com preços de mercado em tempo real. Siga ações, ETF, criptomoedas, obrigações e matérias-primas num só lugar.

## Visão geral

A funcionalidade Carteira de investimentos permite:

- Acompanhar posições em vários tipos de ativos
- Ver os preços em tempo real e o valor da carteira
- Analisar o desempenho em diferentes períodos
- Comparar a sua rentabilidade com referências de mercado (SPY, QQQ, DIA, IWM)
- Registar transações de compra e venda, com comissões

## Criar uma conta de investimento

O acompanhamento de investimentos requer uma conta própria do tipo **Investimento**:

1. Abra o separador **Contas**
2. Toque em **Criar conta**
3. Escolha **Investimento** como tipo de conta
4. Dê um nome à carteira (por exemplo, «Carteira principal», «Reforma»)
5. Toque em **Criar**

## Adicionar posições

### Pesquisar ativos

1. Abra a sua conta de investimento
2. Toque em **Adicionar ativo**
3. Pesquise pelo símbolo (por exemplo, «AAPL») ou pelo nome da empresa (por exemplo, «Apple»)
4. Escolha o ativo correto nos resultados da pesquisa
5. Adicione notas, se quiser
6. Toque em **Guardar**

### Tipos de ativos suportados

| Tipo | Exemplos |
|------|----------|
| Ações | AAPL, MSFT, GOOGL |
| ETF | SPY, QQQ, VTI |
| Cripto | BTC, ETH, SOL |
| Obrigações | Obrigações do Tesouro e de empresas |
| Matérias-primas | Ouro, prata, petróleo |

## Registar transações

Depois de adicionar uma posição, registe as transações de compra e venda:

1. Abra os detalhes da posição
2. Toque em **Adicionar transação**
3. Escolha o tipo de transação: **Comprar** ou **Vender**
4. Introduza:
   - **Quantidade** — número de ações/unidades
   - **Preço por unidade** — preço de compra ou de venda
   - **Comissão** — comissão da corretora (opcional)
   - **Data** — data da transação
   - **Notas** — qualquer informação adicional (opcional)
5. Toque em **Guardar**

A aplicação calcula automaticamente:
- **Custo médio** — preço médio de compra ponderado
- **Total investido** — soma de todas as compras menos as vendas
- **L/P atual** — lucro/prejuízo com base no preço atual

## Resumo da carteira

O ecrã principal de investimentos mostra:

- **Valor total** — valor de mercado atual de todas as posições
- **L/P total** — lucro/prejuízo global
- **L/P total %** — rentabilidade em percentagem
- **Variação diária** — variação do valor no dia de hoje

Cada posição mostra:
- O preço atual e a variação diária
- A quantidade detida e o custo médio
- O L/P individual e a percentagem de alocação

## Análise

Aceda à análise detalhada da carteira:

1. Toque no botão **Análise**
2. Escolha o período: 1S, 1M, 3M, 1A ou Tudo

### Gráfico de desempenho

Mostra o valor da carteira ao longo do tempo, comparado com o montante investido. A área entre as duas linhas representa os seus ganhos ou perdas.

### Alocação por tipo

Mostra como a carteira está distribuída pelos tipos de ativos (ações, ETF, cripto, etc.).

### Maiores subidas e descidas

Lista as posições com melhor e pior desempenho, por rentabilidade percentual.

### Análises de IA da carteira (Pro+)

Obtenha uma análise da carteira feita por IA, com recomendações práticas:

1. Abra o separador **Análise**
2. Desloque-se até ao carrossel de **análises** no topo
3. Deslize para a esquerda/direita para ver as diferentes análises
4. Toque no botão de fechar para ocultar uma análise

**Tipos de análise:**

| Tipo | Descrição |
|------|-------------|
| Risco de concentração | Avisa quando um ativo domina a carteira |
| Desequilíbrio setorial | Alerta quando a carteira está muito concentrada num tipo de ativo |
| Desempenho abaixo do mercado | Identifica ativos que ficam atrás do mercado |
| Desempenho acima do mercado | Destaca oportunidades de reequilíbrio |
| Desvio face à referência | Mostra quando a carteira se afasta da referência |
| Falta de diversificação | Sugere tipos de ativos em falta |
| Alerta de custo médio | Ganhos/perdas não realizados relevantes para efeitos fiscais |
| Impacto das comissões | Avisa quando as comissões reduzem a rentabilidade |

Cada análise inclui uma visualização (gráfico) e uma sugestão prática.

**Nota:** As análises de IA ficam em cache durante 24 horas e cada atualização custa 2,5 créditos de IA.

### Comparação com referência (Pro+)

Compare a rentabilidade da sua carteira com índices de mercado:

| Referência | Descrição |
|-----------|-------------|
| SPY | Índice S&P 500 |
| QQQ | Índice Nasdaq 100 |
| DIA | Dow Jones Industrial |
| IWM | Russell 2000 (pequena capitalização) |

**Como ler a comparação:**
- **Rentabilidade da carteira** — o seu ganho/perda real em percentagem
- **Rentabilidade da referência** — o desempenho do índice no mesmo período
- **Diferença** — quanto ficou acima ou abaixo do índice

## Como são feitos os cálculos

Toque em qualquer cartão de análise para ver a explicação da fórmula:

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
- Toque no botão **Atualizar preços** para atualizar de imediato
- Os preços históricos ficam em cache para reduzir o consumo de dados

## Dicas

1. **Acompanhe tudo** — Adicione todos os seus investimentos para ter uma visão completa
2. **Registe as comissões** — Inclua as comissões da corretora para um L/P correto
3. **Use as referências** — Compare com os índices para medir o desempenho
4. **Reveja com regularidade** — Consulte a análise todas as semanas para detetar tendências

## Limitações

- Os dados de preços são fornecidos pela API Twelve Data
- Alguns títulos menos comuns podem não estar disponíveis
- Os dados históricos estão limitados aos dias de negociação
- Os preços em tempo real podem ter um atraso de 15 minutos

---

[Anterior: Conquistas e gamificação](./13-gamification.md) | [Voltar ao índice](./00-index.md)
