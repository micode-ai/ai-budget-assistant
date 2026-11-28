# Apps conectados e desenvolvedores

> Deixe outro app que você usa — um software de contabilidade, por exemplo — trabalhar com suas despesas do AI Budget, veja exatamente o que ele tem permissão para fazer e corte o acesso dele com um toque. Desenvolvedores podem criar apps assim sobre a API do AI Budget.

## O que significa conectar um app

Alguns produtos conseguem trabalhar com seus dados do AI Budget dentro das próprias telas: um app de contabilidade pode puxar suas despesas e recibos, ou adicionar despesas por você. Para permitir isso, você conecta o app a **uma ou mais** das suas contas do AI Budget.

O app nunca vê sua senha. Quando você clica no botão “Conectar AI Budget” do app, ele leva você a uma página do AI Budget onde você entra normalmente e vê:

- o nome do app, o site dele e quem o criou;
- **Verificado pelo AI Budget** (um app que nós verificamos, como o nosso) ou **Não verificado pelo AI Budget**;
- a lista de permissões que o app está pedindo;
- **Contas a conectar** — uma caixa de seleção para cada conta. Marque cada conta que o app pode usar; **Permitir** fica desativado até pelo menos uma estar marcada. Se só uma conta puder ser conectada, ela já vem marcada. Contas que você só pode visualizar, ou que usam criptografia total, aparecem em cinza com o motivo, e uma conta com criptografia de texto é indicada como somente leitura.

Toque em **Permitir** para conectar, ou em **Negar** para voltar ao app sem conectar. Só permita apps em que você confia.

**Conectando um app de novo.** Se o app já estiver conectado, a tela abre com as contas que ele já tem marcadas, junto com qualquer outra conta que ainda possa ser conectada. O que você marcar é a lista completa: marque uma conta nova para adicioná-la, desmarque uma para cortar o acesso do app a ela. O acesso do app às contas que você deixar marcadas continua funcionando sem interrupção.

Quando um app tem várias contas, ele nos informa a qual conta cada solicitação se refere — você não precisa fazer nada.

## O que cada permissão permite

- **Ver suas despesas: valores, datas, categorias, itens e tags** — o app pode ler as despesas da conta conectada, incluindo os itens de um recibo e as alterações e exclusões posteriores.
- **Adicionar, alterar e excluir despesas** — o app pode gravar nessa conta. As despesas que ele adicionar mostram **Adicionado via** e o nome do app na tela da despesa.
- **Baixar as fotos dos seus recibos** — o app pode baixar a imagem ou o PDF do recibo anexado a uma despesa.
- **Ver suas categorias de despesas** — o app pode ler sua lista de categorias, para classificar as novas despesas corretamente.
- **Ver e adicionar suas receitas** — o app pode ler as receitas da conta conectada e, com a permissão de escrita, adicionar, alterar e excluir receitas. As receitas que ele adicionar mostram **Adicionado via** e o nome do app. Receitas criadas por uma transferência entre suas contas são somente leitura.
- **Ver e gerenciar seus orçamentos** — o app pode ler seus orçamentos com o andamento do período atual e, com a permissão de escrita, criá-los, alterá-los e excluí-los.
- **Ver os totais das suas receitas e gastos** — o app pode ler resumos: totais por categoria e por mês. Ele recebe esses totais, não os lançamentos individuais, e os valores são convertidos para a sua moeda de exibição.

Todo app conectado também pode ver o nome, o tipo e a moeda das contas que você marcou, além do seu nome. Ele nunca recebe seu endereço de e-mail e nunca pode ver uma conta que você não marcou.

## Vendo e desconectando apps

Abra **Configurações → Apps conectados**. Cada app ocupa uma linha, com as contas às quais está conectado, quem o conectou e quando, quando foi usado pela última vez e as permissões dele.

Para cortar o acesso a **uma conta**, toque em **Remover conta** ao lado dela e confirme. O app perde essa conta imediatamente — a próxima solicitação dele para ela é recusada —, enquanto as outras contas continuam funcionando. Remover a última conta desconecta o app por completo.

Para cortar o acesso do app inteiro, toque em **Desconectar** e confirme. Ele perde o acesso a todas as contas de uma vez. As despesas que ele já adicionou continuam nas suas contas. Para usar o app de novo, conecte-o novamente a partir do próprio app.

Sempre que um app é conectado ou recebe novas contas, enviamos um e-mail para quem fez isso, com a lista das contas adicionadas. Se você receber um e não reconhecer o app, desconecte-o imediatamente.

Se você não vê **Apps conectados** em Configurações, a conexão de apps ainda não está disponível.

## Contas compartilhadas

Só um **proprietário** ou um **editor** de uma conta pode conectar um app a ela; quem só pode visualizar uma conta a vê em cinza.

Um app conectado a uma conta compartilhada vê as despesas de **todo mundo** nela, não só as de quem o conectou. Por isso, todos os proprietários e editores dessa conta veem o app em **Apps conectados**, com quem o conectou, e podem removê-lo dessa conta.

Você só vê as contas de uma conexão das quais você mesmo é proprietário ou editor — nunca as outras contas que a pessoa que conectou o app escolheu. Quando você toca em **Desconectar**, o app perde só essas suas contas; ele continua conectado para quem o configurou, e só essa pessoa pode desconectá-lo por completo. Quando um editor conecta um app, os proprietários das contas conectadas também recebem um e-mail, com a lista apenas das contas deles.

Se a pessoa que conectou um app depois virar visualizador ou sair de uma conta, o app deixa de funcionar para essa conta; as outras contas dele não são afetadas. Uma conta excluída é retirada do app automaticamente.

## Contas criptografadas

- Uma conta com **criptografia total** (os valores também são criptografados) não pode ser conectada de jeito nenhum — o app não conseguiria ler nada nela.
- Uma conta com **criptografia de texto** pode ser conectada como **somente leitura**: o app vê valores, datas e categorias, mas descrições, notas, estabelecimentos, nomes de itens, tags e outros textos criptografados ficam ocultos, e ele não pode adicionar nem alterar despesas.

Veja [Criptografia de ponta a ponta](./15-encryption.md) para saber o que cada nível cobre.

## Conectar um assistente de IA (MCP)

Você pode permitir que um assistente de IA, como o Claude ou o ChatGPT, leia seus dados do AI Budget e responda a perguntas como “quanto eu gastei com mercado no mês passado?”.

1. No assistente, adicione um conector personalizado (no Claude: **Configurações → Conectores → Adicionar conector personalizado**) e informe o endereço `https://api.ai-budget.pl/mcp`.
2. O assistente abre uma página do AI Budget onde você entra normalmente. Ela mostra o nome do próprio assistente e o aviso **registrado automaticamente por um assistente de IA** — nós não verificamos esse assistente, então só conecte um que você mesmo tenha iniciado. Marque as contas que ele pode usar e toque em **Permitir**.
3. Faça sua pergunta no assistente.

Um assistente tem acesso **somente leitura**: ele pode ler despesas, receitas, categorias, orçamentos e totais de gastos, mas não pode adicionar, alterar nem excluir nada, nem baixar as fotos dos recibos. Contas com criptografia total não podem ser conectadas, e contas com criptografia de texto ocultam o texto criptografado, exatamente como acontece com qualquer app conectado.

Para cortar o acesso de um assistente, abra **Configurações → Apps conectados** e toque em **Desconectar** ao lado dele. Ele perde o acesso na hora.

## Para desenvolvedores

Você pode criar seu próprio app sobre a API do AI Budget — é grátis. Abra **Configurações → Desenvolvedores** e toque em **Criar app**: dê a ele um nome, uma página inicial e os endereços de redirecionamento que ele vai usar, e escolha **App de servidor** ou **App móvel ou de navegador**. Você recebe um **Client ID** na hora; um app de servidor também recebe um client secret, mostrado **uma única vez** — copie-o imediatamente.

A referência completa da API e um guia passo a passo (em inglês, polonês e russo) estão em [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), também disponíveis em **Documentação da API** na tela Desenvolvedores. Você pode registrar até 10 apps.
