# Fat Finder (auditoria de despesas)

> Uma auditoria mensal feita pela IA que analisa seus gastos, identifica desperdícios — assinaturas, extravagâncias recorrentes, serviços desnecessários — e sugere cortes concretos com uma estimativa de economia.

## Visão geral

O **Fat Finder** examina 3 meses do seu histórico de transações, detecta padrões de consumo e gera um relatório mostrando onde você poderia economizar. Cada achado traz valores concretos, níveis de gravidade e sugestões práticas.

## Como acessar

- **Cartão no Painel** — mostra os resultados do Fat Finder salvos em cache na tela inicial. Toque para abrir o relatório completo e gerar uma análise nova.
- **Navegação direta** — abra a tela do Fat Finder pelo cartão no Painel

## Requisitos

- Cada geração de relatório usa **3 solicitações de IA** da sua cota mensal
- Os relatórios ficam **em cache por 30 dias** para cada período de análise

## Resumo do relatório

O topo do relatório mostra:
- **Economia mensal potencial** — o valor total que você poderia economizar (uma estimativa)
- **Período de análise** — o intervalo de datas analisado
- **Número de achados** — quantas oportunidades foram identificadas

## Tipos de achado

A IA identifica estas categorias de desperdício:

| Tipo | Descrição |
|---|---|
| **Assinatura** | Cobranças recorrentes de valor parecido todo mês (streaming, academia, ferramentas SaaS) |
| **Extravagância recorrente** | Gastos regulares não essenciais que vão se somando (comer fora com frequência, cafezinhos) |
| **Despesa alta** | Despesas individuais bem acima da sua transação média |
| **Excesso na categoria** | Categorias em que os gastos cresceram mais de 20% de um mês para o outro |
| **Uso excessivo de serviço** | Uso intenso de delivery, transporte por aplicativo ou serviços parecidos |

## Detalhes do achado

Cada cartão de achado inclui:

- **Título** — descrição curta do problema
- **Selo de gravidade** — Baixa, Média ou Alta
  - **Baixa** — menos de 5% do total de gastos
  - **Média** — 5–10% do total de gastos
  - **Alta** — mais de 10% do total de gastos
- **Descrição** — explicação detalhada com valores concretos
- **Atual vs. Sugerido** — seu custo mensal atual comparado com a recomendação da IA
- **Economia potencial** — quanto você economizaria por mês (estimativa)
- **Sugestão de ação** — uma recomendação concreta em uma frase
- **Despesas relacionadas** — lista expansível com as transações que geraram esse achado

## Moeda

Todos os valores da auditoria aparecem na sua **moeda de exibição** — a escolhida no seletor de moeda da tela inicial. Despesas registradas em outras moedas são convertidas para ela pela cotação do dia antes da análise, para que o total e a economia sejam comparáveis; o relatório avisa quando os valores foram convertidos e, por isso, são aproximados. Uma única cobrança em outra moeda não muda mais a moeda da auditoria inteira — uma conta que gasta em zlótis é auditada em zlótis. Mudar a moeda de exibição gera a auditoria de novo na nova moeda.

## Ações

- **Gerar relatório de novo** — força uma nova análise com os dados mais recentes (custa 3 solicitações de IA)
- **Expandir/recolher** — toque nos achados para mostrar ou ocultar as descrições e as despesas relacionadas

## Cartão no Painel

O cartão compacto do Fat Finder na tela inicial mostra:
- A economia potencial total, em destaque
- Os 3 principais achados, com pontos de gravidade e valores de economia
- O botão **Ver relatório completo** para ver todos os detalhes

Se nenhum achado for encontrado, você verá a mensagem “Tudo certo!”.

## Perguntas frequentes

- **P: Com que frequência devo consultar o Fat Finder?**
  **R:** O relatório cobre o mês atual. Consulte uma vez por mês para ter as informações mais relevantes. Toque em **Gerar relatório de novo** para receber uma análise nova.

- **P: Por que vejo achados diferentes a cada mês?**
  **R:** A IA analisa os dados dos seus 3 meses mais recentes. Conforme seus padrões de consumo mudam, os achados são atualizados.

- **P: A IA apontou uma despesa necessária. Posso descartá-la?**
  **R:** No momento, não é possível descartar achados individuais. A IA dá sugestões — você decide quais seguir.

- **P: Funciona com contas criptografadas?**
  **R:** Em contas com criptografia total (nível 2), o Fat Finder não consegue analisar as descrições das despesas, então pode gerar menos achados ou achados menos específicos.

---

*Veja também: [Metas de economia](./18-savings-goals.md) | [História dos gastos](./08-spending-story.md) | [Chat de IA](./07-ai-chat.md)*
