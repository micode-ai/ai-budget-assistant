# Bot do WhatsApp

> Faça a gestão das suas finanças diretamente no WhatsApp. Converse com a IA, adicione despesas por comando, digitalize talões e envie mensagens de voz — tudo sem abrir a aplicação.

## Visão geral

O **Bot do WhatsApp** permite interagir com o AI Budget Assistant a partir do WhatsApp. Associe a sua conta uma vez e passa a poder registar despesas, fazer perguntas sobre as suas finanças e gerir orçamentos — diretamente no mensageiro.

O bot funciona da mesma forma que o [Bot do Telegram](./22-telegram-bot.md): a mesma IA, os mesmos comandos, o mesmo suporte para várias contas. Use o mensageiro que preferir.

## Associar a sua conta

1. Abra a aplicação e vá a **Definições**
2. Toque em **Bot do WhatsApp** na secção **Notificações e integrações**
3. Toque em **Ligar o WhatsApp** — aparecem um código de 8 caracteres e um código QR (válidos durante 10 minutos)
4. Depois, escolha uma das opções:
   - Toque em **Abrir o WhatsApp** — o WhatsApp abre com a mensagem `link O_SEU_CODIGO` já preenchida. Basta tocar em enviar.
   - Ou digitalize o código QR com a câmara de outro telemóvel para abrir o WhatsApp nesse aparelho.
   - Ou copie o código e envie `link O_SEU_CODIGO` manualmente para o número de WhatsApp do bot.
5. Verá uma confirmação: «Conta associada com sucesso!»

> **Nota:** Cada número de WhatsApp pode estar associado a uma única conta da aplicação de cada vez. Voltar a associar substitui a ligação anterior.

## Comandos do bot

Os comandos funcionam com ou sem `/` no início — tanto `expense 50 lunch` como `/expense 50 lunch` são aceites.

| Comando | Descrição |
|---|---|
| `link CODE` | Associar o seu WhatsApp à aplicação |
| `expense AMOUNT DESC` | Adicionar rapidamente uma despesa (p. ex., `expense 50 lunch`) |
| `income AMOUNT DESC` | Adicionar rapidamente uma receita (p. ex., `income 3000 salary`) |
| `category [TYPE] NAME` | Criar uma categoria (p. ex., `category expense Food`) |
| `categories` | Listar e eliminar categorias |
| `categorize` | Classificar as despesas sem categoria, um grupo de cada vez |
| `usage` | Ver a utilização de IA, os limites e o detalhe |
| `account` | Mudar entre as suas contas |
| `newchat` | Começar uma nova conversa com a IA |
| `unlink` | Desligar o WhatsApp da sua conta |
| `help` | Mostrar todos os comandos disponíveis |

Também pode simplesmente escrever um número e uma descrição (`50 lunch`) — o bot trata isso como uma despesa.

## Chat com IA no WhatsApp

Envie qualquer mensagem de texto ao bot e ela é processada pelo assistente de IA — o mesmo que está disponível no separador **Chat IA** da aplicação.

**Exemplos:**
- «Em que gastei mais este mês?»
- «Mostra as minhas despesas da semana passada»
- «Adiciona uma despesa de 500 UAH em mercearia»
- «Como está o meu orçamento?»

A IA suporta comandos em linguagem natural, confirmação de ações (botões ✅ Confirmar / ❌ Cancelar), detalhe por categoria e análise do orçamento. Os botões de confirmação aparecem diretamente por baixo da mensagem.

## Deteção automática da conta

Se tiver várias contas (p. ex., «Pessoal» e «Família»), a IA deteta automaticamente quando menciona o nome de uma conta na mensagem e consulta a conta certa.

**Exemplos:**
- «Mostra as minhas despesas na conta Família» — consulta a conta Família
- «Adiciona uma despesa de 100 UAH em mercearia na Família» — cria a despesa na conta Família

> **Nota:** Isto não altera de forma permanente a sua conta predefinida. Use `account` para mudar a predefinida.

## Mensagens de voz

1. Grave uma mensagem de voz no WhatsApp (mantenha premido o botão do microfone)
2. Envie-a ao bot
3. O bot transcreve o que disse (mostrando o texto reconhecido) e processa-o como uma mensagem do chat com IA

As mensagens de voz aceitam os mesmos comandos e perguntas que as mensagens de texto. Cada mensagem de voz custa 2 pedidos de IA (transcrição + processamento pela IA).

## Digitalização de talões

1. Tire uma fotografia a um talão e envie-a ao bot
2. O bot digitaliza-a com OCR e mostra um resumo (valor, data, comerciante)
3. Se a data estiver errada, toque em **Alterar data** e envie a data correta no formato `DD.MM.YYYY` (p. ex., `28.03.2026`)
4. Toque em **Adicionar despesa** para confirmar ou em **Cancelar** para rejeitar

Também pode enviar imagens de talões como documentos (ficheiros de imagem ou PDF).

## Mudar de conta

Se tiver várias contas:

1. Envie `account`
2. O bot mostra as suas contas numa lista em que pode tocar
3. Toque na conta para a qual quer mudar
4. A conta ativa é confirmada numa resposta

Todos os comandos e consultas à IA seguintes usam a conta selecionada até voltar a mudar.

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

**Exemplos:** `expense 50$ lunch`, `expense 100₴ groceries`, `expense 30 EUR taxi`

## Perguntas frequentes

- **P: Posso usar o bot sem associar a conta?**
  **R:** Não, primeiro tem de associar o seu número de WhatsApp com um código da aplicação.

- **P: O bot funciona em conversas de grupo?**
  **R:** Não. O bot só responde em conversas privadas 1:1.

- **P: Que conta é que o bot usa?**
  **R:** O bot usa a sua conta predefinida (definida ao associar ou através de `account`). Também pode mencionar o nome de uma conta na mensagem, e a IA usa automaticamente essa conta para a consulta.

- **P: Posso associar o WhatsApp e o Telegram à mesma conta da aplicação?**
  **R:** Sim. São associações independentes. Pode ter as duas ligadas ao mesmo tempo.

- **P: As mensagens ao bot contam para o meu limite de pedidos de IA?**
  **R:** Sim. O chat com IA custa 1 pedido por mensagem, as mensagens de voz custam 2 pedidos e as fotografias de talões custam 2 pedidos. Use `usage` para ver o saldo restante. Quando o limite é atingido, o bot envia-lhe um aviso em vez de processar o pedido.

- **P: Em que idioma responde o bot?**
  **R:** O bot responde no idioma definido na aplicação (Definições → Aparência). Todas as mensagens de sistema, comandos e botões estão traduzidos.

- **P: Mudei de número de telemóvel — o que acontece à associação?**
  **R:** Basta voltar a ligar a partir da aplicação com o novo número de WhatsApp. A associação antiga é substituída automaticamente.

---

*Ver também: [Chat IA](./07-ai-chat.md) | [Bot do Telegram](./22-telegram-bot.md) | [Contas](./09-accounts.md) | [Definições](./11-settings.md)*
