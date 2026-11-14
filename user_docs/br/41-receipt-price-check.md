# Conferência de preços no recibo — isso custa mais do que você costuma pagar?

> Logo depois que você escaneia um recibo, cada item é comparado com o preço mediano que você já pagou pelo mesmo produto, na mesma loja — para você perceber um desconto que ficou de fora enquanto ainda está no caixa.

## O que é

Cada recibo que você escaneia é conferido discretamente com o seu próprio histórico de compras: o preço mediano que você pagou por aquele produto exato, naquela loja exata, nas últimas 12 semanas. Quando uma linha custa visivelmente mais do que isso, ela aparece na hora — enquanto você ainda pode perguntar no caixa ou olhar a sacola, e não escondida em um relatório que você nunca vai abrir.

É pura aritmética sobre os seus próprios recibos anteriores. Não há IA envolvida, e não há nada para ativar ou configurar.

## O que ela nunca diz

Isso nunca afirma que você foi cobrado a mais, enganado ou que um desconto foi negado — um recibo não consegue provar nada disso. Se não há nenhuma linha de desconto impressa, nada mostra que algum desconto deveria ter sido aplicado, então o app nunca acusa ninguém. A abordagem é sempre a mesma, honesta: **isso custa mais que o normal — vale a pena conferir o recibo**. Uma promoção que não entrou sem ninguém perceber é a causa real mais comum, e essa formulação mostra isso sem apontar o dedo para a loja.

Tudo o que o app mostra é o que ele **encontrou** acima dos seus preços habituais — nunca o que você **economizou**, porque não há como saber se você realmente fez algo a respeito.

## Onde você vai ver

- **Logo depois de escanear um recibo** — um card como “2 itens custam mais que o normal”, com “Cerca de 6,20 zł a mais do que você costuma pagar aqui — vale a pena conferir o recibo.” logo abaixo. Toque para abrir e ver cada produto sinalizado, com o que você costuma pagar, o que pagou desta vez e a diferença. Isso nunca impede você de salvar o recibo e nunca altera nenhum valor — é informação, não uma edição.
- **Nos bots de chat** (Telegram, WhatsApp, Slack) — ao escanear um recibo por um bot, a mensagem de confirmação ganha uma linha extra quando algo foi encontrado, já que os escaneamentos dos bots passam exatamente pela mesma conferência que os do app.
- **Na aba Análises** — uma linha “Encontramos X acima dos seus preços habituais este ano”, que só aparece quando algo realmente foi encontrado.
- **Nos seus alertas** — cada recibo escaneado com uma ocorrência também pode aparecer como um alerta no sininho, para você não precisar lembrar de conferir.

## Quanto confiar em uma ocorrência

Um produto precisa de pelo menos **duas** compras anteriores na mesma loja antes que a conferência diga algo sobre ele, então ela fica em silêncio por um tempo em uma conta nova — e fica mais precisa quanto mais você escaneia. Uma ocorrência baseada em exatamente duas compras anteriores vem marcada com **“com base em apenas duas compras anteriores”**, para você pesar isso; três ou mais compras anteriores são um sinal mais firme.

## O que ela compara — e o que deliberadamente não compara

- Só o **mesmo produto na mesma loja**. O preço em uma loja nunca é comparado com o do mesmo produto comprado em outro lugar.
- Só **a mesma moeda** — nada é convertido para essa comparação.
- Embalagens de tamanhos diferentes contam como produtos diferentes: o scanner mantém o tamanho no nome do produto (por exemplo, “Mleko Łaciate 3,2% 1L”), então uma garrafa de 1 L e uma de 0,5 L são acompanhadas separadamente, exatamente como deve ser.
- Um salto enorme de preço é deliberadamente ignorado em vez de sinalizado — é muito mais provável que seja outro produto (ou uma linha mal lida) do que uma mudança real de preço.

## Preços da comunidade em um recibo

Se você tem pouco histórico próprio de um produto, a conferência pode compará-lo com o que outros clientes costumam pagar **na mesma loja** (de forma anônima, na mesma moeda). Essa linha diz **“outros costumam pagar”** e informa que se baseia em preços anônimos de outros clientes. A formulação mantém o mesmo cuidado: mais do que outros clientes costumam pagar aqui — vale a pena conferir o recibo. Os preços da comunidade precisam antes ser confirmados por vários clientes, e são grátis para todos.

## O total do ano

Se algo já foi encontrado em mais de uma moeda, a aba Análises mostra só um total — na sua própria moeda, se algo apareceu nela, ou, caso contrário, o maior valor individual. Os valores nunca são somados entre moedas, porque isso significaria converter dinheiro, e este recurso toma cuidado para nunca converter.

## Bom saber

- Funciona automaticamente em todo recibo escaneado — câmera, galeria, PDF e recibos escaneados pelo Telegram, WhatsApp ou Slack.
- Uma ocorrência nunca impede você de salvar o recibo e nunca edita um valor por você.
- Preços e diferenças aparecem na moeda do próprio recibo.
