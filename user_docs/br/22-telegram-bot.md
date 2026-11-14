# Bot do Telegram

> Gerencie suas finanças direto do Telegram. Converse com a IA, adicione despesas por comando, escaneie recibos e use mensagens de voz — tudo sem abrir o app.

## Visão geral

O **Bot do Telegram** permite interagir com o AI Budget Assistant pelo Telegram. Vincule sua conta uma vez e você já pode registrar despesas, fazer perguntas sobre finanças e gerenciar orçamentos — direto do seu mensageiro.

## Vincular sua conta

1. Abra o app e vá em **Configurações**
2. Toque em **Bot do Telegram** na seção de integrações
3. Toque em **Conectar o Telegram** — aparece um código de 6 caracteres (válido por 10 minutos)
4. Abra o Telegram e encontre o bot
5. Envie `/link CÓDIGO` (por exemplo, `/link A3F2B1`)
6. Você verá uma confirmação: “Conta vinculada com sucesso!”

> **Observação:** Cada conta do Telegram só pode ficar vinculada a uma conta do app por vez. Vincular de novo substitui a conexão anterior.

## Comandos do bot

| Comando | Descrição |
|---|---|
| `/start` | Mensagem de boas-vindas e instruções de configuração |
| `/link CÓDIGO` | Vincula seu Telegram ao app |
| `/expense VALOR DESC` | Adiciona rapidamente uma despesa (por exemplo, `/expense 50 almoço`) |
| `/income VALOR DESC` | Adiciona rapidamente uma receita (por exemplo, `/income 3000 salário`) |
| `/category [TIPO] NOME` | Cria uma categoria (por exemplo, `/category expense Alimentação`) |
| `/categories` | Lista e exclui categorias |
| `/categorize` | Classifica as despesas sem categoria, um grupo por vez |
| `/usage` | Mostra o uso da IA, os limites e o detalhamento por recurso |
| `/account` | Alterna entre suas contas |
| `/newchat` | Inicia uma nova conversa com a IA |
| `/unlink` | Desconecta o Telegram da sua conta |
| `/help` | Mostra todos os comandos disponíveis |

## Chat de IA no Telegram

Envie qualquer mensagem de texto para o bot e ela será processada pelo assistente de IA — o mesmo disponível na aba Chat IA do app.

**Exemplos:**
- “Com o que eu mais gastei este mês?”
- “Mostre minhas despesas da semana passada”
- “Adicione uma despesa de 500 UAH em mercado”
- “Como está meu orçamento?”

A IA oferece todos os recursos do chat do app: comandos em linguagem natural, confirmação de ações, distribuição por categoria e análise do orçamento.

## Detecção automática da conta

Se você tem várias contas (por exemplo, “Pessoal” e “Família”), a IA detecta automaticamente quando você menciona o nome de uma conta na mensagem e consulta a conta certa.

**Exemplos:**
- “Mostre minhas despesas na conta Família” — consulta a conta Família
- “Quanto gastei com comida?” — consulta a conta padrão
- “Adicione uma despesa de 100 UAH em mercado na Família” — cria a despesa na conta Família

> **Observação:** Isso não muda sua conta padrão de forma permanente. Use `/account` para trocar a conta padrão.

## Mensagens de voz

1. Grave uma mensagem de voz no Telegram
2. Envie para o bot
3. O bot transcreve sua fala e a processa como uma mensagem do chat de IA

As mensagens de voz aceitam os mesmos comandos e perguntas das mensagens de texto.

## Escanear recibos

1. Tire uma foto de um recibo
2. Envie a foto para o bot
3. O bot lê o recibo por OCR e mostra um resumo
4. Se a data estiver errada, toque em **Alterar data** e envie a data correta (DD.MM.AAAA)
5. Toque em **Adicionar despesa** para confirmar, ou em **Cancelar** para rejeitar

Você também pode enviar imagens de recibos como documentos (PDF ou imagens). Os recibos em PDF ficam salvos e podem ser vistos no app — toque na pré-visualização do PDF para abri-lo.

## Trocar de conta

Se você tem várias contas:

1. Envie `/account`
2. O bot mostra todas as suas contas com botões
3. Toque na conta para a qual quer trocar
4. A conta ativa fica marcada com um check

Todos os comandos e perguntas à IA seguintes vão usar a conta selecionada até você trocar de novo.

## Moedas suportadas

O bot reconhece símbolos e códigos de moeda nos comandos:

| Símbolo | Moeda |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Exemplos:** `/expense 50$ almoço`, `/expense 100₴ mercado`, `/expense 30 EUR táxi`

## Perguntas frequentes

- **P: Posso usar o bot sem vincular a conta?**
  **R:** Não. Primeiro você precisa vincular sua conta do Telegram com um código gerado no app.

- **P: O bot funciona em grupos?**
  **R:** O bot foi feito apenas para conversas privadas (1:1).

- **P: Qual conta o bot usa?**
  **R:** O bot usa sua conta padrão (definida no vínculo ou por `/account`). Você também pode mencionar o nome de uma conta na mensagem, e a IA usa essa conta automaticamente para a consulta.

- **P: Posso vincular várias contas do Telegram?**
  **R:** Não. Cada usuário do app pode ter uma conta do Telegram vinculada, e cada conta do Telegram só pode ser vinculada a um usuário do app.

- **P: As mensagens do bot contam para o limite de solicitações de IA?**
  **R:** Sim. O chat de IA custa 1 solicitação por mensagem, as mensagens de voz custam 2 solicitações (transcrição + processamento pela IA) e as fotos de recibos custam 2 solicitações. Use `/usage` para ver seu saldo restante. Quando o limite é atingido, o bot avisa você em vez de processar a solicitação.

- **P: Em que idioma o bot responde?**
  **R:** O bot responde no mesmo idioma definido no app (Configurações > Aparência). Todas as mensagens do sistema, comandos e botões são traduzidos.

---

*Veja também: [Chat de IA](./07-ai-chat.md) | [Contas](./09-accounts.md) | [Configurações](./11-settings.md)*
