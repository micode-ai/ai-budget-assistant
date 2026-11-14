# Encriptação ponto a ponto

> Proteja os seus dados financeiros com encriptação ponto a ponto (E2EE). Toda a informação sensível é encriptada no dispositivo antes de ser enviada para o servidor — ninguém além de si (e dos membros das suas contas partilhadas) a consegue ler.

## Visão geral

A encriptação ponto a ponto garante que as descrições, notas, nomes de categorias e outros dados de texto são encriptados no dispositivo antes da sincronização. O servidor guarda apenas dados encriptados e não os consegue ler, mesmo que a base de dados seja comprometida.

A encriptação é controlada por uma **frase-passe de encriptação** própria, que nunca é enviada para o servidor.

## Configurar a encriptação

1. Abra as **Definições**
2. Desloque-se até à secção **Segurança**
3. Toque em **Ativar encriptação**
4. Introduza uma **frase-passe de encriptação** (mínimo de 8 caracteres)
   - É diferente da palavra-passe de início de sessão
   - Escolha uma frase-passe forte de que se consiga lembrar
5. Confirme a frase-passe
6. Aparece no ecrã uma **Chave de recuperação**

> **Importante:** Guarde a Chave de recuperação de imediato! Anote-a ou guarde-a num gestor de palavras-passe. Formato: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. É a **única forma** de recuperar os dados se se esquecer da frase-passe.

Depois da configuração, a encriptação fica automaticamente ativa na conta atual.

## Desbloquear a encriptação

Depois de reiniciar a aplicação ou quando a sessão expira, a encriptação fica bloqueada. Os dados continuam guardados em segurança, mas os campos encriptados aparecem vazios até desbloquear.

Para desbloquear:

1. Abra **Definições** > **Segurança**
2. Toque em **Desbloquear encriptação**
3. Introduza a frase-passe de encriptação
4. Os dados voltam a ficar legíveis

## O que é encriptado

A encriptação funciona em dois níveis:

### Nível 1 — Campos de texto (predefinido)

| Dados | Encriptados |
|---|---|
| Descrições e notas das despesas | Sim |
| Nomes de locais | Sim |
| Dados dos talões | Sim |
| Nomes de categorias | Sim |
| Nomes de etiquetas | Sim |
| Nomes e descrições de projetos | Sim |
| Nomes de orçamentos | Sim |
| Montantes, datas, moedas | Não — ficam em texto simples |

**As funcionalidades do servidor** (análise, alertas de orçamento, análises de IA) continuam a funcionar porque os montantes e as datas continuam acessíveis.

### Nível 2 — Encriptação total (opcional)

Tudo o que está no Nível 1 e ainda:

| Dados | Encriptados |
|---|---|
| Montantes (despesas, receitas, orçamentos) | Sim |
| Preços e taxas de câmbio | Sim |
| Saldos das carteiras | Sim |

> **Nota:** Com o Nível 2, a análise no servidor e as funcionalidades de IA deixam de estar disponíveis, porque o servidor não consegue ler os montantes. Toda a análise é calculada localmente no dispositivo.

## Recuperação

Se se esquecer da frase-passe mas tiver a Chave de recuperação:

1. Abra **Definições** > **Segurança**
2. Toque em **Recuperar acesso**
3. Introduza a Chave de recuperação
4. Defina uma nova frase-passe
5. É gerada uma nova Chave de recuperação — guarde-a novamente

## Repor a encriptação

Se tiver perdido tanto a frase-passe como a Chave de recuperação:

1. Abra **Definições** > **Segurança**
2. Toque em **Repor encriptação** (botão vermelho)
3. Confirme a ação

> **Aviso:** Os dados encriptados anteriormente no servidor ficam **definitivamente ilegíveis**. Os dados locais no dispositivo não são afetados. Pode voltar a configurar a encriptação com uma nova frase-passe.

## Contas partilhadas

Quando a encriptação está ativa numa conta partilhada:

- O **proprietário da conta** tem de conceder as chaves de encriptação a cada membro
- Os novos membros veem os metadados (montantes, datas, categorias), mas **não conseguem ler os campos de texto encriptados** até o proprietário lhes conceder acesso
- A concessão das chaves acontece quando o proprietário abre a aplicação e aprova os membros pendentes
- Quando um membro é **removido** de uma conta partilhada, as chaves são substituídas por segurança — o membro removido deixa de conseguir desencriptar os dados novos

## Impacto nas funcionalidades da aplicação

| Funcionalidade | Nível 1 (Texto) | Nível 2 (Total) |
|---|---|---|
| Análise e gráficos | Funciona totalmente | Calculados localmente |
| Alertas de orçamento | Funciona totalmente | Indisponível |
| Chat de IA | Parcial (sem descrições) | Indisponível |
| Análises de IA | Parcial | Indisponível |
| História dos gastos | Parcial | Indisponível |
| Entrada por voz | Funciona totalmente | Funciona totalmente |
| Leitura de talões | Funciona totalmente | Funciona totalmente |
| Relatórios CSV/PDF/Excel | Montantes corretos, campos de texto vazios | Indisponível |
| Resumo mensal | Funciona (nomes obtidos localmente) | Indisponível |
| Cópia de segurança encriptada | Funciona totalmente | Funciona totalmente |
| Relatórios por e-mail | Montantes corretos, campos de texto vazios | Indisponível |

## Perguntas frequentes

- **P: A frase-passe de encriptação é a mesma que a palavra-passe de início de sessão?**
  **R:** Não. A frase-passe de encriptação é diferente e nunca é enviada para o servidor. A palavra-passe de início de sessão autentica a sua conta; a frase-passe de encriptação protege os seus dados.

- **P: O que acontece se me esquecer da frase-passe e perder a Chave de recuperação?**
  **R:** Os dados encriptados anteriormente no servidor ficam definitivamente ilegíveis. Pode repor a encriptação e começar de novo, mas os dados encriptados antigos não podem ser recuperados.

- **P: Os programadores da aplicação conseguem ler os meus dados encriptados?**
  **R:** Não. O servidor guarda apenas blocos de dados encriptados. Sem a sua frase-passe ou a Chave de recuperação, ninguém consegue desencriptar os seus dados.

- **P: A encriptação torna a aplicação mais lenta?**
  **R:** A configuração inicial demora alguns segundos a derivar as chaves. Depois disso, encriptar e desencriptar cada campo é praticamente instantâneo.

- **P: Posso desativar a encriptação depois de a ativar?**
  **R:** Pode repor a encriptação, o que remove a configuração de encriptação. No entanto, os dados que foram encriptados no servidor continuam encriptados e ficam ilegíveis.

---

*Ver também: [Definições](./11-settings.md) | [Contas](./09-accounts.md) | [Exportação e relatórios](./16-export-reports.md)*
