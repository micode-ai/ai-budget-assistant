# Bots de chat — Telegram, WhatsApp e Slack

> Faça a gestão das suas finanças diretamente no Telegram, no WhatsApp ou no Slack. Converse com a IA, adicione despesas, digitalize talões e envie mensagens de voz — sem abrir a aplicação.

## Visão geral

Ligue a sua conta ao **Telegram**, ao **WhatsApp**, ao **Slack** ou a qualquer combinação dos três em simultâneo. Os três bots oferecem exatamente as mesmas funcionalidades — use o mensageiro que preferir.

Para ligar: **Definições → Bots de chat**.

## Associar a sua conta

### Telegram
1. Toque em **Ligar o Telegram** — aparece um código de 8 caracteres (válido durante 10 minutos)
2. Abra o Telegram e procure o bot
3. Envie `/link SEU_CODIGO` (por exemplo, `/link A3F2B1`)
4. Verá «Conta associada com sucesso!»

### WhatsApp
1. Toque em **Ligar o WhatsApp** — aparecem um código e um código QR
2. Toque em **Abrir o WhatsApp** (a mensagem já vem preenchida) ou leia o código QR
3. Envie `link SEU_CODIGO` ao bot
4. Verá «Conta associada com sucesso!»

### Slack
1. Toque em **Ligar o Slack** — aparece um código de 8 caracteres (válido durante 10 minutos)
2. Abra o Slack, procure a aplicação **AI Budget Assistant** e abra uma mensagem direta com ela
3. Envie `link SEU_CODIGO` (por exemplo, `link A3F2B1`)
4. Verá «Conta associada com sucesso!»

> O Telegram, o WhatsApp e o Slack podem estar todos ligados à mesma conta ao mesmo tempo.

## O que pode fazer

- **Adicionar despesas ou receitas**: escreva naturalmente ou use comandos
- **Chat de IA**: faça qualquer pergunta sobre finanças — a mesma IA da aplicação
- **Mensagens de voz**: diga a despesa ou a pergunta em voz alta (2 pedidos de IA por mensagem)
- **Fotografias de talões**: envie uma fotografia para ser lida automaticamente (2 pedidos de IA por fotografia)
- **Ver a utilização da IA**: `/usage`
- **Mudar de conta**: `/account`

## Comandos

| Comando | O que faz |
|---|---|
| `/link CÓDIGO` | Associa o mensageiro à aplicação |
| `/expense 50 almoço` | Adiciona uma despesa |
| `/group 120 pizza` | Adiciona uma despesa a um grupo partilhado |
| `/income 3000 salário` | Adiciona uma receita |
| `/category expense Alimentação` | Cria uma categoria |
| `/usage` | Mostra a utilização e os limites de pedidos de IA |
| `/account` | Muda a conta ativa |
| `/newchat` | Inicia uma nova conversa com a IA |
| `/unlink` | Desliga o bot |
| `/help` | Mostra todos os comandos |

> No **WhatsApp** e no **Slack**, os comandos funcionam com ou sem a `/` inicial. Também pode escrever apenas um montante e uma descrição: `50 almoço`.

## Adicionar uma despesa a um grupo partilhado

Envie `/group 120 pizza` para adicionar uma despesa a um dos seus grupos partilhados (no WhatsApp e no Slack, `group 120 pizza` também funciona). Se estiver em vários grupos, o bot pergunta qual — escolha-o na lista. Depois confira o cartão: grupo, montante, descrição, *pago por si*, *dividido em partes iguais* — e toque em **Confirmar**, ou em **Cancelar** para não adicionar nada. Fica sempre registado como quem pagou, e a despesa é sempre dividida em partes iguais por todos os membros; para outro pagador ou outra divisão, adicione-a na aplicação. Para indicar outra moeda, escreva-a a seguir ao montante (`/group 25 EUR táxi`): a despesa é convertida para a moeda do grupo à taxa do dia e, se não houver taxa disponível, o bot avisa e não adiciona nada. Os grupos arquivados não são apresentados, e esta ação não consome pedidos de IA.

## Digitalizar talões

1. Tire uma fotografia a um talão e envie-a ao bot
2. O bot extrai o montante, a data e o comerciante por OCR
3. Se a data estiver errada, envie a data correta no formato `DD.MM.AAAA`
4. Confirme para adicionar a despesa, ou cancele

### Corrigir as linhas lidas

O OCR às vezes lê mal um preço, inventa uma linha ou salta outra. Toque em **✏️ Artigos** (no WhatsApp: **✏️ Corrigir → Artigos**) e envie uma correção por mensagem:

| Mensagem | O que faz |
|---|---|
| `3 = 14,69` | define o preço da linha 3 |
| `3: Pão de centeio` | muda o nome da linha 3 |
| `3 -` | elimina a linha 3 |
| `+ Pão 5,99` | adiciona uma linha |
| `= 233,98` | corrige o total do talão |

Tanto `14,69` como `14.69` funcionam. Depois de cada correção, o bot volta a enviar a lista numerada e uma linha `Linhas: … · total do talão: …` — quando os dois valores não coincidem, ainda há algo mal lido no talão. A divisão por categorias é recalculada a partir das linhas corrigidas, por isso corrija também o total quando alterar um preço.

Quando terminar, toque em **Adicionar despesa** — nada é guardado até o fazer, e cancelar descarta todas as correções. Aqui só é possível corrigir as linhas e o total; para mudar a categoria de uma linha, abra a despesa na aplicação.

### Talão de combustível → registo de combustível

Se o talão digitalizado for de um posto de combustível e os litros e o preço por litro tiverem sido lidos com clareza, o bot propõe **⛽ Adicionar ao registo (o seu carro)** logo depois de guardar a despesa (no WhatsApp o botão diz **⛽ Ao registo** e o carro aparece na mensagem). Toque nele e escreva a quilometragem em km, por exemplo `123456`; o abastecimento fica registado como depósito cheio para esse carro. O carro é escolhido como na aplicação: o seu único carro, senão aquele em que registou o último abastecimento, senão o único carro com esse combustível — se ainda assim não for claro, o botão não aparece. Toque em **Ignorar** para deixar a despesa sem abastecimento; qualquer outra mensagem segue para o chat como habitualmente. Os observadores não podem registar abastecimentos.

## Várias contas

Se tiver várias contas (por exemplo, «Pessoal» e «Família»):
- Mencione o nome da conta na mensagem: «Mostra as despesas em Família» — a IA consulta essa conta apenas para essa mensagem
- Use `/account` para mudar de forma permanente a conta predefinida do bot

## Custo em pedidos de IA

| Ação | Pedidos de IA usados |
|---|---|
| Mensagem de texto / chat de IA | 1 |
| Mensagem de voz | 2 |
| Fotografia de talão | 2 |

Quando atinge o limite, o bot envia-lhe um aviso em vez de processar o pedido. Use `/usage` para ver quantos pedidos lhe restam.

## Moedas suportadas

O bot reconhece os símbolos de moeda: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB).

**Exemplos:** `/expense 50$ almoço` · `50 zł almoço` · `expense 100₴ mercearia`

## Perguntas frequentes

**P: Posso ligar o Telegram, o WhatsApp e o Slack?**
Sim — são ligações independentes e funcionam todas em simultâneo.

**P: Em que idioma responde o bot?**
No idioma definido em Definições → Aparência.

**P: Preciso de uma subscrição para usar os bots?**
Os bots usam pedidos de IA da quota mensal do seu plano. Os utilizadores do plano Free têm um limite mensal mais baixo.

---

*Ver também: [Chat de IA](./07-ai-chat.md) | [Contas](./09-accounts.md) | [Definições](./11-settings.md)*
