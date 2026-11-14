# Fat Finder (auditoria de despesas)

> Uma auditoria mensal feita pela IA que analisa os seus gastos, identifica desperdícios — subscrições, extravagâncias recorrentes, serviços dispensáveis — e sugere cortes concretos com uma estimativa da poupança.

## Visão geral

O **Fat Finder** percorre 3 meses do seu histórico de transações, deteta padrões de consumo e gera um relatório que mostra onde poderia poupar. Cada constatação inclui montantes concretos, níveis de gravidade e sugestões práticas.

## Como aceder

- **Cartão no Painel** — mostra os resultados do Fat Finder guardados em cache no ecrã inicial. Toque para abrir o relatório completo e gerar uma análise nova.
- **Navegação direta** — abra o ecrã do Fat Finder a partir do cartão no Painel

## Requisitos

- Cada geração de relatório consome **3 pedidos de IA** da sua quota mensal
- Os relatórios ficam **em cache durante 30 dias** por período de análise

## Resumo do relatório

O topo do relatório mostra:
- **Poupança mensal potencial** — o montante total que poderia poupar (uma estimativa)
- **Período de análise** — o intervalo de datas analisado
- **Número de constatações** — quantas oportunidades foram identificadas

## Tipos de constatação

A IA identifica estas categorias de desperdício:

| Tipo | Descrição |
|---|---|
| **Subscrição** | Cobranças recorrentes de valor semelhante todos os meses (streaming, ginásio, ferramentas SaaS) |
| **Extravagância recorrente** | Gastos regulares não essenciais que se acumulam (refeições fora frequentes, cafés) |
| **Despesa elevada** | Despesas individuais muito acima da sua transação média |
| **Excesso na categoria** | Categorias em que os gastos cresceram mais de 20% de um mês para o outro |
| **Uso excessivo de serviço** | Uso intenso de entregas ao domicílio, transporte por aplicação ou serviços semelhantes |

## Detalhes da constatação

Cada cartão de constatação inclui:

- **Título** — descrição curta do problema
- **Etiqueta de gravidade** — Baixa, Média ou Alta
  - **Baixa** — menos de 5% do total de gastos
  - **Média** — 5–10% do total de gastos
  - **Alta** — mais de 10% do total de gastos
- **Descrição** — explicação detalhada com montantes concretos
- **Atual vs. Sugerido** — o seu custo mensal atual comparado com a recomendação da IA
- **Poupança potencial** — quanto pouparia por mês (estimativa)
- **Sugestão de ação** — uma recomendação concreta numa frase
- **Despesas relacionadas** — lista expansível das transações que originaram esta constatação

## Moeda

Todos os montantes da auditoria são apresentados na sua **moeda de apresentação** — a escolhida no seletor de moeda do ecrã inicial. As despesas registadas noutras moedas são convertidas para ela à taxa do dia antes da análise, para que o total e a poupança sejam comparáveis; o relatório indica quando os valores foram convertidos e são, por isso, aproximados. Uma única cobrança noutra moeda já não muda a moeda de toda a auditoria — uma conta que gasta em zlótis é auditada em zlótis. Mudar a moeda de apresentação gera a auditoria novamente na nova moeda.

## Ações

- **Gerar relatório de novo** — força uma nova análise com os dados mais recentes (custa 3 pedidos de IA)
- **Expandir/recolher** — toque nas constatações para mostrar ou ocultar as descrições e as despesas relacionadas

## Cartão no Painel

O cartão compacto do Fat Finder no ecrã inicial mostra:
- A poupança potencial total, em destaque
- As 3 principais constatações, com pontos de gravidade e montantes de poupança
- O botão **Ver relatório completo** para ver todos os detalhes

Se não forem encontradas constatações, verá a mensagem «Está tudo bem!».

## Perguntas frequentes

- **P: Com que frequência devo consultar o Fat Finder?**
  **R:** O relatório abrange o mês atual. Consulte-o uma vez por mês para obter as informações mais relevantes. Toque em **Gerar relatório de novo** para obter uma análise nova.

- **P: Porque vejo constatações diferentes todos os meses?**
  **R:** A IA analisa os dados dos seus 3 meses mais recentes. À medida que os seus padrões de consumo mudam, as constatações são atualizadas em conformidade.

- **P: A IA assinalou uma despesa necessária. Posso descartá-la?**
  **R:** De momento, não é possível descartar constatações individuais. A IA faz sugestões — é o utilizador que decide quais seguir.

- **P: Funciona com contas encriptadas?**
  **R:** Nas contas com encriptação total (nível 2), o Fat Finder não consegue analisar as descrições das despesas, pelo que pode gerar menos constatações ou constatações menos específicas.

---

*Ver também: [Objetivos de poupança](./18-savings-goals.md) | [História dos gastos](./08-spending-story.md) | [Chat de IA](./07-ai-chat.md)*
