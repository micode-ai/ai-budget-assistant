# Bot do WhatsApp

> Gerencie suas finanças direto no WhatsApp. Converse com a IA, adicione despesas por comando, escaneie recibos e envie mensagens de voz — tudo sem abrir o app.

## Visão geral

O **Bot do WhatsApp** permite que você interaja com o AI Budget Assistant pelo WhatsApp. Vincule sua conta uma vez e você já pode registrar despesas, fazer perguntas sobre suas finanças e gerenciar orçamentos — direto no mensageiro.

O bot funciona do mesmo jeito que o [Bot do Telegram](./22-telegram-bot.md): a mesma IA, os mesmos comandos, o mesmo suporte a várias contas. Use o mensageiro que preferir.

## Vincular sua conta

1. Abra o app e vá em **Configurações**
2. Toque em **Bot do WhatsApp** na seção **Notificações e integrações**
3. Toque em **Conectar o WhatsApp** — aparecem um código de 6 caracteres e um QR code (válidos por 10 minutos)
4. Depois, escolha uma das opções:
   - Toque em **Abrir o WhatsApp** — o WhatsApp abre com a mensagem `link SEU_CODIGO` já preenchida. É só tocar em enviar.
   - Ou escaneie o QR code com a câmera de outro celular para abrir o WhatsApp nesse aparelho.
   - Ou copie o código e envie `link SEU_CODIGO` manualmente para o número de WhatsApp do bot.
5. Você verá uma confirmação: “Conta vinculada com sucesso!”

> **Observação:** Cada número de WhatsApp pode estar vinculado a uma única conta do app por vez. Vincular de novo substitui a conexão anterior.

## Comandos do bot

Os comandos funcionam com ou sem `/` no início — tanto `expense 50 lunch` quanto `/expense 50 lunch` são aceitos.

| Comando | Descrição |
|---|---|
| `link CODE` | Vincular seu WhatsApp ao app |
| `expense AMOUNT DESC` | Adicionar uma despesa rapidamente (ex.: `expense 50 lunch`) |
| `income AMOUNT DESC` | Adicionar uma receita rapidamente (ex.: `income 3000 salary`) |
| `category [TYPE] NAME` | Criar uma categoria (ex.: `category expense Food`) |
| `categories` | Listar e excluir categorias |
| `categorize` | Classificar suas despesas sem categoria, um grupo por vez |
| `usage` | Ver seu uso de IA, limites e detalhamento |
| `account` | Alternar entre suas contas |
| `newchat` | Começar uma nova conversa com a IA |
| `unlink` | Desconectar o WhatsApp da sua conta |
| `help` | Mostrar todos os comandos disponíveis |

Você também pode simplesmente digitar um número e uma descrição (`50 lunch`) — o bot trata isso como uma despesa.

## Chat com IA no WhatsApp

Envie qualquer mensagem de texto para o bot e ela será processada pelo assistente de IA — o mesmo disponível na aba **Chat IA** do app.

**Exemplos:**
- “Com o que eu gastei mais este mês?”
- “Mostre minhas despesas da semana passada”
- “Adicione uma despesa de 500 UAH em mercado”
- “Como está meu orçamento?”

A IA entende comandos em linguagem natural, confirmação de ações (botões ✅ Confirmar / ❌ Cancelar), detalhamento por categoria e análise do orçamento. Os botões de confirmação aparecem logo abaixo da mensagem.

## Detecção automática da conta

Se você tiver várias contas (ex.: “Pessoal” e “Família”), a IA detecta automaticamente quando você menciona o nome de uma conta na mensagem e consulta a conta certa.

**Exemplos:**
- “Mostre minhas despesas na conta Família” — consulta a conta Família
- “Adicione uma despesa de 100 UAH em mercado na Família” — cria a despesa na conta Família

> **Observação:** Isso não troca sua conta padrão de forma permanente. Use `account` para mudar a padrão.

## Mensagens de voz

1. Grave uma mensagem de voz no WhatsApp (segure o botão do microfone)
2. Envie para o bot
3. O bot transcreve o que você falou (mostrando o texto reconhecido) e processa como uma mensagem do chat com IA

As mensagens de voz aceitam os mesmos comandos e perguntas que as mensagens de texto. Cada mensagem de voz custa 2 solicitações de IA (transcrição + processamento pela IA).

## Leitura de recibos

1. Tire uma foto de um recibo e envie para o bot
2. O bot faz a leitura com OCR e mostra um resumo (valor, data, estabelecimento)
3. Se a data estiver errada, toque em **Alterar data** e envie a data correta no formato `DD.MM.YYYY` (ex.: `28.03.2026`)
4. Toque em **Adicionar despesa** para confirmar ou em **Cancelar** para rejeitar

Você também pode enviar imagens de recibos como documentos (arquivos de imagem ou PDF).

## Trocar de conta

Se você tiver várias contas:

1. Envie `account`
2. O bot mostra suas contas em uma lista tocável
3. Toque na conta para a qual quer trocar
4. A conta ativa é confirmada em uma resposta

Todos os comandos e consultas à IA seguintes usam a conta selecionada até você trocar de novo.

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

- **P: Posso usar o bot sem vincular a conta?**
  **R:** Não, primeiro você precisa vincular seu número de WhatsApp com um código do app.

- **P: O bot funciona em grupos?**
  **R:** Não. O bot só responde em conversas privadas 1:1.

- **P: Qual conta o bot usa?**
  **R:** O bot usa sua conta padrão (definida ao vincular ou pelo comando `account`). Você também pode mencionar o nome de uma conta na mensagem, e a IA usa essa conta automaticamente na consulta.

- **P: Posso vincular o WhatsApp e o Telegram à mesma conta do app?**
  **R:** Sim. São vínculos independentes. Você pode ter os dois conectados ao mesmo tempo.

- **P: As mensagens para o bot contam no meu limite de solicitações de IA?**
  **R:** Sim. O chat com IA custa 1 solicitação por mensagem, as mensagens de voz custam 2 solicitações e as fotos de recibos custam 2 solicitações. Use `usage` para ver quanto ainda resta. Quando o limite é atingido, o bot avisa você em vez de processar a solicitação.

- **P: Em que idioma o bot responde?**
  **R:** O bot responde no idioma definido no app (Configurações → Aparência). Todas as mensagens do sistema, comandos e botões são traduzidos.

- **P: Meu número de celular mudou — o que acontece com o vínculo?**
  **R:** É só conectar de novo pelo app com seu novo número de WhatsApp. O vínculo antigo é substituído automaticamente.

---

*Veja também: [Chat IA](./07-ai-chat.md) | [Bot do Telegram](./22-telegram-bot.md) | [Contas](./09-accounts.md) | [Configurações](./11-settings.md)*
