# Verificação de preços no talão — isto custa mais do que costuma pagar?

> Logo depois de digitalizar um talão, cada artigo é comparado com o preço mediano que já pagou pelo mesmo produto, na mesma loja — para que possa dar por um desconto em falta enquanto ainda está junto à caixa.

## O que é

Cada talão que digitaliza é discretamente comparado com o seu próprio histórico de compras: o preço mediano que pagou por esse produto exato, nessa loja exata, nas últimas 12 semanas. Quando uma linha custa visivelmente mais do que isso, é assinalada de imediato — enquanto ainda pode perguntar na caixa ou ver o saco, e não perdida num relatório que nunca vai abrir.

É simples aritmética sobre os seus próprios talões anteriores. Não há IA envolvida, e não há nada para ativar nem configurar.

## O que nunca diz

Isto nunca afirma que lhe cobraram a mais, que houve engano ou que um desconto lhe foi negado — um talão não consegue provar nada disso. Se não houver nenhuma linha de desconto impressa, nada mostra que algum desconto devesse ter sido aplicado, por isso a aplicação nunca acusa ninguém. A abordagem é sempre a mesma, honesta: **isto custa mais do que o habitual — vale a pena verificar o talão**. Uma promoção que não entrou sem ninguém dar por isso é a causa real mais comum, e esta formulação traz isso à tona sem apontar o dedo à loja.

Tudo o que a aplicação mostra é o que **encontrou** acima dos seus preços habituais — nunca o que **poupou**, porque não há forma de saber se chegou a fazer alguma coisa a esse respeito.

## Onde o vai ver

- **Logo depois de digitalizar um talão** — um cartão como «2 artigos custam mais do que o habitual», com «Cerca de 6,20 zł a mais do que costuma pagar aqui — vale a pena verificar o talão.» por baixo. Toque para o abrir e ver cada produto assinalado, com o que costuma pagar, o que pagou desta vez e a diferença. Nunca o impede de guardar o talão e nunca altera nenhum valor — é informação, não uma edição.
- **Nos bots de chat** (Telegram, WhatsApp, Slack) — ao digitalizar um talão através de um bot, a mensagem de confirmação ganha uma linha extra quando algo foi encontrado, já que as digitalizações dos bots passam exatamente pela mesma verificação que as da aplicação.
- **No separador Análise** — uma linha «Encontrados X acima dos seus preços habituais este ano», que só aparece quando algo foi realmente encontrado.
- **Nos seus alertas** — cada talão digitalizado com uma ocorrência pode também aparecer como um alerta no sino de alertas, para não ter de se lembrar de verificar.

## Até que ponto confiar numa ocorrência

Um produto precisa de pelo menos **duas** compras anteriores na mesma loja antes de a verificação dizer alguma coisa sobre ele, por isso fica em silêncio durante algum tempo numa conta nova — e torna-se mais precisa quanto mais digitalizar. Uma ocorrência baseada em exatamente duas compras anteriores leva a indicação **«com base em apenas duas compras anteriores»**, para que a possa pesar em conformidade; três ou mais compras anteriores são um sinal mais firme.

## O que compara — e o que deliberadamente não compara

- Apenas o **mesmo produto na mesma loja**. O preço numa loja nunca é comparado com o do mesmo produto comprado noutro sítio.
- Apenas **a mesma moeda** — nada é convertido para esta comparação.
- Embalagens de tamanhos diferentes contam como produtos diferentes: o digitalizador mantém o tamanho no nome do produto (por exemplo «Mleko Łaciate 3,2% 1L»), por isso uma garrafa de 1 L e uma de 0,5 L são acompanhadas em separado, exatamente como deve ser.
- Um salto de preço enorme é deliberadamente ignorado em vez de assinalado — é muito mais provável tratar-se de outro produto (ou de uma linha mal lida) do que de uma verdadeira alteração de preço.

## Preços da comunidade num talão

Se tiver pouco histórico próprio para um produto, a verificação pode compará-lo com o que outros clientes costumam pagar **na mesma loja** (de forma anónima, na mesma moeda). Essa linha diz **«outros costumam pagar»** e indica que se baseia em preços anónimos de outros clientes. A formulação mantém o mesmo cuidado: mais do que outros clientes costumam pagar aqui — vale a pena verificar o talão. Os preços da comunidade precisam primeiro de ser confirmados por vários clientes, e são gratuitos para todos.

## O total anual

Se alguma vez tiver sido encontrado algo em mais do que uma moeda, o separador Análise mostra apenas um total — na sua própria moeda, se algo tiver aparecido nela, ou caso contrário o maior valor individual. Os valores nunca são somados entre moedas, porque isso obrigaria a converter dinheiro, e esta funcionalidade tem o cuidado de nunca o converter.

## Bom saber

- Funciona automaticamente em todos os talões digitalizados — câmara, galeria, PDF e talões digitalizados através do Telegram, WhatsApp ou Slack.
- Uma ocorrência nunca impede que guarde o talão e nunca edita um valor por si.
- Os preços e as diferenças são apresentados na moeda do próprio talão.
