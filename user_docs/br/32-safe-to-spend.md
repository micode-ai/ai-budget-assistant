# Planejando com antecedência — Livre para gastar, capacidade de compra e captura automática

> Três ferramentas que funcionam juntas para você gastar com confiança: um valor diário de orçamento sempre atualizado, a pergunta “posso pagar isso?” no chat e o registro automático de despesas a partir das notificações do banco (só Android).

## Livre para gastar hoje

O destaque da tela inicial mostra o valor **Livre para gastar** — uma estimativa de quanto você pode gastar hoje e ainda cobrir todas as obrigações conhecidas até o fim do mês.

### O que entra na conta

O valor é calculado a partir de:
- **Saldo da carteira** — seus saldos atuais em todas as moedas, convertidos para a sua moeda de exibição.
- **Próximas assinaturas** — assinaturas ativas que renovam antes do fim do mês (do Gerenciador de assinaturas).
- **Próximas despesas recorrentes** — despesas com repetição semanal, mensal ou anual que vencem antes do fim do mês.
- **Contribuições para metas** — o valor diário necessário para manter suas metas de economia em dia.
- **Receita esperada** — se o app detectar uma receita mensal regular (mesmo valor, intervalo de ~30 dias, pelo menos duas vezes nos últimos 90 dias), ele a soma como receita esperada e usa o próximo dia de pagamento como horizonte, em vez do fim do mês.

Se você nunca definiu o saldo da carteira (sem saldo inicial nem correção), a carteira só conhece o que você registrou, contado a partir de zero. O Disponível para gastar e a previsão **Próximos 30 dias** avisam isso e oferecem **Definir saldo** — informe quanto você realmente tem e os dois valores passam a partir de dinheiro real. Na tela inicial, o próprio valor traz a indicação **A partir de zero · saldo não definido**, para você ver sem abrir o detalhamento.

### Fórmula

```
Livre para gastar = (Saldo da carteira + Receita esperada − Obrigações) ÷ Dias restantes
```

O resultado nunca fica abaixo de zero — você nunca verá um número negativo. Se as obrigações previstas passarem do seu saldo, o valor mostra 0 com uma nota explicativa.

### Painel de detalhes

Toque no valor para abrir um painel com cada componente: saldo da carteira, receita esperada, próximas assinaturas, despesas recorrentes e contribuições para metas. Todos os valores aparecem na sua moeda de exibição; uma nota aparece se alguma conversão usou uma cotação aproximada.

### Widget

O Livre para gastar está disponível como widget da tela inicial. Você pode mostrá-lo ou ocultá-lo em **Configurações → Widgets**.

## Posso pagar isso? (Oráculo de capacidade de compra)

Faça ao chat de IA uma pergunta como “Posso pagar uma passagem de 200 €?” ou “Posso comprar um notebook novo por 3500 zł?”. O chat usa o mesmo motor do Livre para gastar para dar uma resposta determinística de sim ou não — a IA só narra o veredito, nunca chuta.

Respostas possíveis:
- **Sim** — o valor cabe no orçamento livre para gastar de hoje.
- **Sim, mas apertado** — cabe no seu saldo disponível, mas consome a maior parte dele.
- **Não** — passa dos seus recursos disponíveis.
- **Sim, mas atrasa uma meta** — dá para pagar, mas sua meta de economia “X” atrasa cerca de N dias.
- **Espere o dia do pagamento** — dá para pagar depois que a próxima receita esperada entrar (a data sugerida é exibida).

## Captura automática no Android

No Android, o app pode criar automaticamente uma despesa a partir das notificações push do seu banco — assim você nunca perde uma transação, mesmo quando não está usando o app.

### Como ativar

1. Acesse **Configurações → Importar transações → Captura automática de notificações (Android)**.
2. Leia a nota de privacidade e toque em **Ativar captura automática**.
3. O app abre as configurações de Acesso a notificações do sistema. Encontre **AI Budget Assistant** na lista e ative.
4. Volte ao app — o status mostra **Acesso às notificações permitido**.

### Privacidade

O texto das notificações é analisado **somente no seu aparelho**. O nome do estabelecimento, o valor e a moeda são extraídos localmente; só a despesa resultante é sincronizada com o servidor — o texto original da notificação nunca é enviado para lugar nenhum.

### Bancos compatíveis (Europa)

A captura automática funciona com notificações dos principais bancos de varejo da Europa. Os países compatíveis incluem Polônia (PKO BP, mBank, Pekao, ING, Millennium, Santander, Alior, BNP Paribas, Crédit Agricole, Nest Bank), Alemanha/Áustria (Deutsche Bank, Commerzbank, DKB, ING-DiBa, Sparkasse, George/Erste), França (BNP Paribas, Crédit Agricole, Boursorama, Société Générale), Espanha (BBVA, Santander, CaixaBank, Bankinter), Países Baixos (ING, Rabobank, ABN AMRO, bunq), Ucrânia (PrivatBank, monobank, Oschadbank) e Rússia (Sberbank, Tinkoff, Alfa-Bank). Os bancos digitais internacionais Revolut e N26 também são compatíveis. A lista completa de apps compatíveis aparece na tela de captura automática.

**Observação sobre categorias de estabelecimentos:** para bancos fora da Polônia, o app pode não sugerir uma categoria automaticamente. A despesa é registrada sem categoria e você pode corrigi-la manualmente — o app aprende com suas correções e passa a aplicá-las automaticamente no futuro.

### Remoção de duplicatas e conciliação entre fontes

Se uma notificação chegar mais de uma vez, ou se você também importar a mesma transação de um CSV do banco, o app remove as duplicatas automaticamente. Cada notificação capturada recebe uma impressão digital única; as duplicatas são descartadas sem aviso.

O app também concilia as notificações capturadas com despesas adicionadas por outros caminhos:

- **Mesma moeda:** se depois você registrar o mesmo pagamento manualmente ou por um bot, o app mantém automaticamente o registro mais completo e remove o registro provisório da notificação. Você não precisa fazer nada.
- **Recibo escaneado:** se você escanear o recibo de um pagamento que o app já capturou de uma notificação do banco (mesmo valor, dentro de um dia), recebe uma sugestão de mesclagem no feed de alertas — mesmo quando o banco e o recibo chamam a loja por nomes diferentes (“ZABKA Z5712” vs “Żabka”). Toque para mesclar: os itens e a foto do recibo passam para o registro que fica.
- **Moeda diferente:** às vezes a mesma compra aparece em duas moedas — por exemplo, um cartão cobrado em euros enquanto a notificação do banco mostra o valor em zlótis. O app não consegue mesclar esses registros automaticamente (os valores são diferentes), então mostra uma sugestão no feed de alertas. Toque no alerta para abrir a tela de mesclagem, escolha qual registro manter e confirme. Você também pode mesclar direto na tela de prévia da importação, se vir o aviso “Pode já existir em outra moeda” em uma linha.

### Revisando as capturas

Toque no aviso de captura (“Capturado 54 zł · Żabka — toque para revisar”) para abrir os detalhes da despesa e conferir ou corrigir o valor, o estabelecimento e a categoria antes de ela ser sincronizada.

### Só Android

A captura automática é um recurso do Android. No iOS e na web, esta seção não aparece. Uma alternativa no iOS é escanear a foto do recibo pelo recurso de captura de recibos que já existe.
