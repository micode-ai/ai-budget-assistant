# Bot do Telegram

> Faça a gestão das suas finanças diretamente no Telegram. Converse com a IA, adicione despesas por comando, digitalize talões e use mensagens de voz — tudo sem abrir a aplicação.

## Visão geral

O **Bot do Telegram** permite interagir com o AI Budget Assistant a partir do Telegram. Associe a sua conta uma vez e passa a poder registar despesas, fazer perguntas sobre finanças e gerir orçamentos — diretamente no seu mensageiro.

## Associar a sua conta

1. Abra a aplicação e vá a **Definições**
2. Toque em **Bot do Telegram** na secção de integrações
3. Toque em **Ligar o Telegram** — aparece um código de 8 caracteres (válido durante 10 minutos)
4. Abra o Telegram e procure o bot
5. Envie `/link CÓDIGO` (por exemplo, `/link A3F2B1`)
6. Verá uma confirmação: «Conta associada com sucesso!»

> **Nota:** Cada conta do Telegram só pode estar associada a uma conta da aplicação de cada vez. Voltar a associar substitui a ligação anterior.

## Comandos do bot

| Comando | Descrição |
|---|---|
| `/start` | Mensagem de boas-vindas e instruções de configuração |
| `/link CÓDIGO` | Associa o seu Telegram à aplicação |
| `/expense MONTANTE DESC` | Adiciona rapidamente uma despesa (por exemplo, `/expense 50 almoço`) |
| `/income MONTANTE DESC` | Adiciona rapidamente uma receita (por exemplo, `/income 3000 salário`) |
| `/category [TIPO] NOME` | Cria uma categoria (por exemplo, `/category expense Alimentação`) |
| `/categories` | Lista e elimina categorias |
| `/categorize` | Classifica as despesas sem categoria, um grupo de cada vez |
| `/usage` | Mostra a utilização da IA, os limites e o detalhe por funcionalidade |
| `/account` | Alterna entre as suas contas |
| `/newchat` | Inicia uma nova conversa com a IA |
| `/unlink` | Desliga o Telegram da sua conta |
| `/help` | Mostra todos os comandos disponíveis |

## Chat de IA no Telegram

Envie qualquer mensagem de texto ao bot e ela será processada pelo assistente de IA — o mesmo que está disponível no separador Chat IA da aplicação.

**Exemplos:**
- «Em que gastei mais este mês?»
- «Mostra as minhas despesas da semana passada»
- «Adiciona uma despesa de 500 UAH em mercearia»
- «Como está o meu orçamento?»

A IA suporta todas as funcionalidades do chat da aplicação: comandos em linguagem natural, confirmação de ações, distribuição por categoria e análise do orçamento.

## Deteção automática da conta

Se tiver várias contas (por exemplo, «Pessoal» e «Família»), a IA deteta automaticamente quando menciona o nome de uma conta na mensagem e consulta a conta certa.

**Exemplos:**
- «Mostra as minhas despesas na conta Família» — consulta a conta Família
- «Quanto gastei em comida?» — consulta a conta predefinida
- «Adiciona uma despesa de 100 UAH em mercearia na Família» — cria a despesa na conta Família

> **Nota:** Isto não altera de forma permanente a sua conta predefinida. Use `/account` para mudar a conta predefinida.

## Mensagens de voz

1. Grave uma mensagem de voz no Telegram
2. Envie-a ao bot
3. O bot transcreve o que disse e processa-o como uma mensagem do chat de IA

As mensagens de voz aceitam os mesmos comandos e perguntas que as mensagens de texto.

## Digitalizar talões

1. Tire uma fotografia a um talão
2. Envie a fotografia ao bot
3. O bot lê o talão por OCR e mostra um resumo
4. Se a data estiver errada, toque em **Alterar data** e envie a data correta (DD.MM.AAAA)
5. Toque em **Adicionar despesa** para confirmar, ou em **Cancelar** para rejeitar

Também pode enviar imagens de talões como documentos (PDF ou imagens). Os talões em PDF ficam guardados e podem ser vistos na aplicação — toque na pré-visualização do PDF para o abrir.

## Mudar de conta

Se tiver várias contas:

1. Envie `/account`
2. O bot mostra todas as suas contas com botões
3. Toque na conta para a qual quer mudar
4. A conta ativa fica assinalada com um visto

Todos os comandos e perguntas à IA seguintes usam a conta selecionada até voltar a mudar.

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

**Exemplos:** `/expense 50$ almoço`, `/expense 100₴ mercearia`, `/expense 30 EUR táxi`

## Perguntas frequentes

- **P: Posso usar o bot sem associar a conta?**
  **R:** Não. Primeiro tem de associar a sua conta do Telegram com um código gerado na aplicação.

- **P: O bot funciona em conversas de grupo?**
  **R:** O bot foi pensado apenas para conversas privadas (1:1).

- **P: Que conta usa o bot?**
  **R:** O bot usa a sua conta predefinida (definida na associação ou através de `/account`). Também pode mencionar o nome de uma conta na mensagem e a IA usa automaticamente essa conta para o pedido.

- **P: Posso associar várias contas do Telegram?**
  **R:** Não. Cada utilizador da aplicação pode ter uma conta do Telegram associada, e cada conta do Telegram só pode estar associada a um utilizador da aplicação.

- **P: As mensagens do bot contam para o limite de pedidos de IA?**
  **R:** Sim. O chat de IA custa 1 pedido por mensagem, as mensagens de voz custam 2 pedidos (transcrição + processamento pela IA) e as fotografias de talões custam 2 pedidos. Use `/usage` para ver o que lhe resta. Quando atinge o limite, o bot envia-lhe um aviso em vez de processar o pedido.

- **P: Em que idioma responde o bot?**
  **R:** O bot responde no mesmo idioma definido na aplicação (Definições > Aparência). Todas as mensagens do sistema, comandos e botões estão traduzidos.

---

*Ver também: [Chat de IA](./07-ai-chat.md) | [Contas](./09-accounts.md) | [Definições](./11-settings.md)*
