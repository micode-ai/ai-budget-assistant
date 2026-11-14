# Criptografia de ponta a ponta

> Proteja seus dados financeiros com criptografia de ponta a ponta (E2EE). Todas as informações sensíveis são criptografadas no seu aparelho antes de serem enviadas ao servidor — ninguém além de você (e dos membros das suas contas compartilhadas) consegue lê-las.

## Visão geral

A criptografia de ponta a ponta garante que suas descrições, notas, nomes de categorias e outros dados de texto sejam criptografados no seu aparelho antes da sincronização. O servidor armazena apenas dados criptografados e não consegue lê-los, mesmo que o banco de dados seja comprometido.

Você controla a criptografia com uma **frase secreta de criptografia** própria, que nunca é enviada ao servidor.

## Configurando a criptografia

1. Abra as **Configurações**
2. Role até a seção **Segurança**
3. Toque em **Ativar criptografia**
4. Digite uma **frase secreta de criptografia** (mínimo de 8 caracteres)
   - Ela é diferente da sua senha de login
   - Escolha uma frase secreta forte da qual você consiga se lembrar
5. Confirme a frase secreta
6. Uma **Chave de recuperação** aparece na tela

> **Importante:** Guarde sua Chave de recuperação imediatamente! Anote-a ou salve-a em um gerenciador de senhas. Formato: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Ela é a **única forma** de recuperar seus dados se você esquecer a frase secreta.

Depois da configuração, a criptografia é ativada automaticamente na sua conta atual.

## Desbloqueando a criptografia

Depois de reiniciar o app ou quando a sessão expira, a criptografia fica bloqueada. Seus dados continuam armazenados com segurança, mas os campos criptografados aparecem vazios até você desbloquear.

Para desbloquear:

1. Abra **Configurações** > **Segurança**
2. Toque em **Desbloquear criptografia**
3. Digite sua frase secreta de criptografia
4. Seus dados voltam a ficar legíveis

## O que é criptografado

A criptografia funciona em dois níveis:

### Nível 1 — Campos de texto (padrão)

| Dados | Criptografado |
|---|---|
| Descrições e notas das despesas | Sim |
| Nomes de locais | Sim |
| Dados dos recibos | Sim |
| Nomes de categorias | Sim |
| Nomes de tags | Sim |
| Nomes e descrições de projetos | Sim |
| Nomes de orçamentos | Sim |
| Valores, datas, moedas | Não — ficam em texto simples |

**Os recursos do servidor** (análises, alertas de orçamento, insights de IA) continuam funcionando porque os valores e as datas continuam acessíveis.

### Nível 2 — Criptografia total (opcional)

Tudo o que está no Nível 1, mais:

| Dados | Criptografado |
|---|---|
| Valores (despesas, receitas, orçamentos) | Sim |
| Preços e cotações | Sim |
| Saldos das carteiras | Sim |

> **Observação:** Com o Nível 2, as análises no servidor e os recursos de IA ficam indisponíveis, porque o servidor não consegue ler os valores. Todas as análises são calculadas localmente no seu aparelho.

## Recuperação

Se você esqueceu a frase secreta, mas tem a Chave de recuperação:

1. Abra **Configurações** > **Segurança**
2. Toque em **Recuperar acesso**
3. Digite sua Chave de recuperação
4. Defina uma nova frase secreta
5. Uma nova Chave de recuperação é gerada — guarde-a de novo

## Redefinindo a criptografia

Se você perdeu tanto a frase secreta quanto a Chave de recuperação:

1. Abra **Configurações** > **Segurança**
2. Toque em **Redefinir criptografia** (botão vermelho)
3. Confirme a ação

> **Atenção:** Os dados criptografados anteriormente no servidor ficam **permanentemente ilegíveis**. Os dados locais no seu aparelho não são afetados. Você pode configurar a criptografia de novo com uma nova frase secreta.

## Contas compartilhadas

Quando a criptografia está ativada em uma conta compartilhada:

- O **proprietário da conta** precisa conceder as chaves de criptografia a cada membro
- Novos membros veem os metadados (valores, datas, categorias), mas **não conseguem ler os campos de texto criptografados** até o proprietário liberar o acesso
- A concessão das chaves acontece quando o proprietário abre o app e aprova os membros pendentes
- Quando um membro é **removido** de uma conta compartilhada, as chaves são trocadas por segurança — o membro removido não consegue mais descriptografar os dados novos

## Impacto nos recursos do app

| Recurso | Nível 1 (Texto) | Nível 2 (Total) |
|---|---|---|
| Análises e gráficos | Funciona totalmente | Calculados localmente |
| Alertas de orçamento | Funciona totalmente | Indisponível |
| Chat de IA | Parcial (sem descrições) | Indisponível |
| Insights de IA | Parcial | Indisponível |
| História dos gastos | Parcial | Indisponível |
| Entrada por voz | Funciona totalmente | Funciona totalmente |
| Leitura de recibos | Funciona totalmente | Funciona totalmente |
| Relatórios CSV/PDF/Excel | Valores corretos, campos de texto vazios | Indisponível |
| Resumo mensal | Funciona (nomes obtidos localmente) | Indisponível |
| Backup criptografado | Funciona totalmente | Funciona totalmente |
| Relatórios por e-mail | Valores corretos, campos de texto vazios | Indisponível |

## Perguntas frequentes

- **P: A frase secreta de criptografia é a mesma coisa que a minha senha de login?**
  **R:** Não. A frase secreta de criptografia é separada e nunca é enviada ao servidor. A senha de login autentica sua conta; a frase secreta de criptografia protege seus dados.

- **P: O que acontece se eu esquecer a frase secreta e perder a Chave de recuperação?**
  **R:** Os dados criptografados anteriormente no servidor ficam permanentemente ilegíveis. Você pode redefinir a criptografia e começar do zero, mas os dados criptografados antigos não podem ser recuperados.

- **P: Os desenvolvedores do app conseguem ler meus dados criptografados?**
  **R:** Não. O servidor armazena apenas blocos de dados criptografados. Sem a sua frase secreta ou a Chave de recuperação, ninguém consegue descriptografar seus dados.

- **P: A criptografia deixa o app mais lento?**
  **R:** A configuração inicial leva alguns segundos para derivar as chaves. Depois disso, criptografar e descriptografar cada campo é praticamente instantâneo.

- **P: Posso desativar a criptografia depois de ativá-la?**
  **R:** Você pode redefinir a criptografia, o que remove a configuração de criptografia. Porém, os dados que foram criptografados no servidor continuam criptografados e ficarão ilegíveis.

---

*Veja também: [Configurações](./11-settings.md) | [Contas](./09-accounts.md) | [Exportação e relatórios](./16-export-reports.md)*
