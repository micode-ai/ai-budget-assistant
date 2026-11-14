# Bots de chat — Telegram, WhatsApp e Slack

> Gerencie suas finanças direto do Telegram, do WhatsApp ou do Slack. Converse com a IA, adicione despesas, escaneie recibos e envie mensagens de voz — sem abrir o app.

## Visão geral

Conecte sua conta ao **Telegram**, ao **WhatsApp**, ao **Slack** ou a qualquer combinação deles ao mesmo tempo. Os três bots oferecem exatamente os mesmos recursos — use o mensageiro que preferir.

Para conectar: **Configurações → Bots de chat**.

## Vincular sua conta

### Telegram
1. Toque em **Conectar o Telegram** — aparece um código de 6 caracteres (válido por 10 minutos)
2. Abra o Telegram e encontre o bot
3. Envie `/link SEU_CODIGO` (por exemplo, `/link A3F2B1`)
4. Você verá “Conta vinculada com sucesso!”

### WhatsApp
1. Toque em **Conectar o WhatsApp** — aparecem um código e um QR code
2. Toque em **Abrir o WhatsApp** (a mensagem já vem preenchida) ou escaneie o QR code
3. Envie `link SEU_CODIGO` para o bot
4. Você verá “Conta vinculada com sucesso!”

### Slack
1. Toque em **Conectar o Slack** — aparece um código de 6 caracteres (válido por 10 minutos)
2. Abra o Slack, encontre o app **AI Budget Assistant** e abra uma mensagem direta com ele
3. Envie `link SEU_CODIGO` (por exemplo, `link A3F2B1`)
4. Você verá “Conta vinculada com sucesso!”

> O Telegram, o WhatsApp e o Slack podem estar todos conectados à mesma conta ao mesmo tempo.

## O que você pode fazer

- **Adicionar despesas ou receitas**: escreva naturalmente ou use comandos
- **Chat de IA**: faça qualquer pergunta sobre finanças — a mesma IA do app
- **Mensagens de voz**: fale a despesa ou a pergunta (2 solicitações de IA por mensagem)
- **Fotos de recibos**: envie uma foto para escanear automaticamente (2 solicitações de IA por foto)
- **Ver o uso da IA**: `/usage`
- **Trocar de conta**: `/account`

## Comandos

| Comando | O que faz |
|---|---|
| `/link CÓDIGO` | Vincula o mensageiro ao app |
| `/expense 50 almoço` | Adiciona uma despesa |
| `/group 120 pizza` | Adiciona uma despesa a um grupo compartilhado |
| `/income 3000 salário` | Adiciona uma receita |
| `/category expense Alimentação` | Cria uma categoria |
| `/usage` | Mostra o uso e os limites de solicitações de IA |
| `/account` | Troca a conta ativa |
| `/newchat` | Inicia uma nova conversa com a IA |
| `/unlink` | Desconecta o bot |
| `/help` | Mostra todos os comandos |

> No **WhatsApp** e no **Slack**, os comandos funcionam com ou sem a `/` no início. Você também pode digitar só um valor e uma descrição: `50 almoço`.

## Adicionar uma despesa a um grupo compartilhado

Envie `/group 120 pizza` para adicionar uma despesa a um dos seus grupos compartilhados (no WhatsApp e no Slack, `group 120 pizza` também funciona). Se você participa de vários grupos, o bot pergunta qual — escolha na lista. Depois confira o cartão: grupo, valor, descrição, *pago por você*, *dividido igualmente* — e toque em **Confirmar**, ou em **Cancelar** para não adicionar nada. Você é sempre quem pagou, e a despesa é sempre dividida igualmente entre todos os membros; para outro pagador ou outra divisão, adicione a despesa no app. Para usar outra moeda, coloque-a depois do valor (`/group 25 EUR táxi`): a despesa é convertida para a moeda do grupo pela cotação do dia e, se não houver cotação disponível, o bot avisa e não adiciona nada. Grupos arquivados não são oferecidos, e isso não usa solicitações de IA.

## Escanear recibos

1. Tire uma foto de um recibo e envie para o bot
2. O bot extrai o valor, a data e o estabelecimento por OCR
3. Se a data estiver errada, envie a data correta no formato `DD.MM.AAAA`
4. Confirme para adicionar a despesa, ou cancele

### Corrigir as linhas escaneadas

Às vezes o OCR lê um preço errado, inventa uma linha ou pula outra. Toque em **✏️ Itens** (no WhatsApp: **✏️ Corrigir → Itens**) e envie uma correção por mensagem:

| Mensagem | O que faz |
|---|---|
| `3 = 14,69` | define o preço da linha 3 |
| `3: Pão de centeio` | renomeia a linha 3 |
| `3 -` | exclui a linha 3 |
| `+ Pão 5,99` | adiciona uma linha |
| `= 233,98` | corrige o total do recibo |

Tanto `14,69` quanto `14.69` funcionam. Depois de cada correção, o bot reenvia a lista numerada e uma linha `Linhas: … · total do recibo: …` — quando os dois valores não batem, ainda tem algo lido errado no recibo. A divisão por categorias é refeita a partir das linhas corrigidas, então corrija também o total quando mudar um preço.

Quando terminar, toque em **Adicionar despesa** — nada é salvo antes disso, e cancelar descarta todas as correções. Aqui só dá para corrigir as linhas e o total; para mudar a categoria de uma linha, abra a despesa no app.

## Várias contas

Se você tem várias contas (por exemplo, “Pessoal” e “Família”):
- Mencione o nome da conta na mensagem: “Mostre as despesas em Família” — a IA consulta essa conta só para essa mensagem
- Use `/account` para trocar de vez a conta padrão do bot

## Custo em solicitações de IA

| Ação | Solicitações de IA usadas |
|---|---|
| Mensagem de texto / chat de IA | 1 |
| Mensagem de voz | 2 |
| Foto de recibo | 2 |

Quando seu limite é atingido, o bot avisa você em vez de processar a solicitação. Use `/usage` para ver quantas solicitações ainda restam.

## Moedas suportadas

O bot reconhece os símbolos de moeda: ₴ (UAH), $ (USD), € (EUR), zł (PLN), £ (GBP), ₽ (RUB).

**Exemplos:** `/expense 50$ almoço` · `50 zł almoço` · `expense 100₴ mercado`

## Perguntas frequentes

**P: Posso conectar o Telegram, o WhatsApp e o Slack?**
Sim — são vínculos independentes e todos funcionam ao mesmo tempo.

**P: Em que idioma o bot responde?**
No idioma definido em Configurações → Aparência.

**P: Preciso de uma assinatura para usar os bots?**
Os bots usam solicitações de IA da cota mensal do seu plano. Quem usa o plano Free tem um limite mensal menor.

---

*Veja também: [Chat de IA](./07-ai-chat.md) | [Contas](./09-accounts.md) | [Configurações](./11-settings.md)*
