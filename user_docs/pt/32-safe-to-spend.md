# Planear com antecedência — Seguro para gastar, capacidade de compra e captura automática

> Três ferramentas que trabalham em conjunto para gastar com confiança: um valor diário de orçamento sempre atualizado, a pergunta «posso pagar isto?» no chat e o registo automático de despesas a partir das notificações do banco (só Android).

## Seguro para gastar hoje

O destaque do ecrã inicial mostra o valor **Seguro para gastar** — uma estimativa do que pode gastar hoje sem deixar de cobrir todas as obrigações conhecidas até ao fim do mês.

### O que inclui

O valor é calculado a partir de:
- **Saldo da carteira** — os seus saldos atuais em todas as moedas, convertidos para a moeda de apresentação.
- **Subscrições a renovar** — subscrições ativas que renovam antes do fim do mês (do Gestor de subscrições).
- **Despesas recorrentes previstas** — despesas com repetição semanal, mensal ou anual que vencem antes do fim do mês.
- **Contribuições para objetivos** — o valor diário necessário para manter os seus objetivos de poupança no bom caminho.
- **Receita esperada** — se a aplicação detetar uma receita mensal regular (mesmo valor, intervalo de ~30 dias, pelo menos duas vezes nos últimos 90 dias), soma-a como receita esperada e usa o próximo dia de pagamento como horizonte, em vez do fim do mês.

### Fórmula

```
Seguro para gastar = (Saldo da carteira + Receita esperada − Obrigações) ÷ Dias restantes
```

O resultado nunca desce abaixo de zero — nunca verá um número negativo. Se as obrigações previstas ultrapassarem o saldo, o valor mostra 0 com uma nota explicativa.

### Painel de detalhe

Toque no valor para abrir um painel com o detalhe de cada componente: saldo da carteira, receita esperada, subscrições a renovar, despesas recorrentes e contribuições para objetivos. Todos os valores aparecem na moeda de apresentação; surge uma nota se alguma conversão tiver usado uma taxa de câmbio aproximada.

### Widget

O Seguro para gastar está disponível como widget do ecrã inicial. Pode mostrá-lo ou ocultá-lo em **Definições → Widgets**.

## Posso pagar isto? (Oráculo de capacidade de compra)

Faça ao chat de IA uma pergunta como «Posso pagar um voo de 200 €?» ou «Posso comprar um portátil novo por 3500 zł?». O chat usa o mesmo motor do Seguro para gastar para dar uma resposta determinística de sim ou não — a IA apenas narra o veredito, nunca adivinha.

Respostas possíveis:
- **Sim** — o valor cabe no orçamento seguro para gastar de hoje.
- **Sim, mas à justa** — cabe no saldo disponível, mas consome a maior parte dele.
- **Não** — ultrapassa os fundos disponíveis.
- **Sim, mas atrasa um objetivo** — é comportável, mas o seu objetivo de poupança «X» atrasa cerca de N dias.
- **Espere pelo dia de pagamento** — passa a ser comportável depois de chegar a próxima receita esperada (é mostrada a data sugerida).

## Captura automática no Android

No Android, a aplicação pode criar automaticamente uma despesa a partir das notificações push do seu banco — para nunca perder uma transação, mesmo quando não está a usar a aplicação.

### Como ativar

1. Aceda a **Definições → Importar transações → Captura automática de notificações (Android)**.
2. Leia a nota de privacidade e toque em **Ativar captura automática**.
3. A aplicação abre as definições de Acesso a notificações do sistema. Encontre **AI Budget Assistant** na lista e ative-o.
4. Volte à aplicação — o estado mostra **Acesso às notificações concedido**.

### Privacidade

O texto das notificações é analisado **apenas no seu dispositivo**. O nome do comerciante, o valor e a moeda são extraídos localmente; só a despesa resultante é sincronizada com o servidor — o texto original da notificação nunca é enviado para lado nenhum.

### Bancos suportados (Europa)

A captura automática funciona com as notificações dos principais bancos de retalho da Europa. Os países suportados incluem a Polónia (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), a Alemanha/Áustria (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), a França (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), a Espanha (BBVA, Santander, CaixaBank, Bankinter), os Países Baixos (ING, Rabobank, ABN AMRO, bunq), a Ucrânia (PrivatBank, monobank, Oschadbank) e a Rússia (Sberbank, Tinkoff, Alfa-Bank). Os neobancos internacionais Revolut e N26 também são suportados. A lista completa das aplicações suportadas aparece no ecrã de captura automática.

**Nota sobre categorias de comerciantes:** para bancos fora da Polónia, a aplicação pode não sugerir automaticamente uma categoria. A despesa fica registada sem categoria e pode corrigi-la manualmente — a aplicação aprende com as suas correções e passa a aplicá-las automaticamente no futuro.

### Eliminação de duplicados e conciliação entre fontes

Se uma notificação chegar mais do que uma vez, ou se também importar a mesma transação a partir de um CSV do banco, a aplicação elimina os duplicados automaticamente. Cada notificação capturada recebe uma impressão digital única; os duplicados são descartados sem aviso.

A aplicação também concilia as notificações capturadas com despesas adicionadas por outras vias:

- **Mesma moeda:** se mais tarde registar o mesmo pagamento manualmente ou através de um bot, a aplicação mantém automaticamente o registo mais completo e remove o registo provisório da notificação. Não precisa de fazer nada.
- **Digitalização de talão:** se digitalizar o talão de um pagamento que a aplicação já captou de uma notificação do banco (mesmo valor, no espaço de um dia), recebe uma sugestão de junção no feed de alertas — mesmo quando o banco e o talão dão nomes diferentes à loja («ZABKA Z5712» vs «Żabka»). Toque para juntar: os artigos e a fotografia do talão passam para o registo que fica.
- **Moeda diferente:** por vezes, a mesma compra aparece em duas moedas — por exemplo, um cartão cobrado em euros enquanto a notificação do banco mostra o valor em zlótis. A aplicação não consegue juntá-las automaticamente (os valores são diferentes), por isso mostra uma sugestão no feed de alertas. Toque no alerta para abrir o ecrã de junção, escolha o registo a manter e confirme. Também pode juntar diretamente a partir do ecrã de pré-visualização da importação, se vir numa linha o aviso «Pode já existir noutra moeda».

### Rever capturas

Toque no aviso de captura («Capturado 54 zł · Żabka — toque para rever») para abrir o detalhe da despesa e verificar ou corrigir o valor, o comerciante e a categoria antes de ser sincronizada.

### Só Android

A captura automática é uma funcionalidade do Android. No iOS e na web, esta secção não aparece. Uma alternativa no iOS é digitalizar a fotografia do talão através da funcionalidade de captura de talões já existente.
