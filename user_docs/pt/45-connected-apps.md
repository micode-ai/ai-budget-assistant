# Aplicações ligadas e programadores

> Permita que outra aplicação que usa — um software de contabilidade, por exemplo — trabalhe com as suas despesas do AI Budget, veja exatamente o que lhe é permitido fazer e corte-lhe o acesso com um toque. Os programadores podem criar aplicações deste tipo sobre a API do AI Budget.

## O que significa ligar uma aplicação

Alguns produtos conseguem trabalhar com os seus dados do AI Budget dentro dos próprios ecrãs: uma aplicação de contabilidade pode ir buscar as suas despesas e talões, ou adicionar despesas por si. Para o permitir, liga a aplicação a **uma ou mais** das suas contas do AI Budget.

A aplicação nunca vê a sua palavra-passe. Quando clica no botão «Ligar AI Budget» dessa aplicação, abre-se uma página do AI Budget onde inicia sessão como habitualmente e vê:

- o nome da aplicação, o respetivo site e quem a criou;
- **Verificada pelo AI Budget** (uma aplicação que verificámos, como a nossa) ou **Não verificada pelo AI Budget**;
- a lista de permissões que a aplicação pede;
- **Contas a ligar** — uma caixa de seleção para cada conta. Marque cada conta que a aplicação pode usar; **Permitir** fica desativado até marcar pelo menos uma. Se só for possível ligar uma conta, ela já vem marcada. As contas que só pode ver, ou que usam encriptação total, aparecem a cinzento com o motivo, e uma conta com encriptação de texto é assinalada como só de leitura.

Toque em **Permitir** para ligar, ou em **Recusar** para voltar à aplicação sem a ligar. Permita apenas aplicações em que confia.

**Voltar a ligar uma aplicação.** Se a aplicação já estiver ligada, o ecrã abre com as contas que ela já tem marcadas, juntamente com qualquer outra conta que ainda possa ser ligada. O que marcar é a lista completa: marque uma conta nova para a acrescentar, desmarque uma para cortar o acesso da aplicação a ela. O acesso da aplicação às contas que deixar marcadas continua a funcionar sem interrupção.

Quando uma aplicação tem várias contas, indica-nos a que conta se refere cada pedido — não precisa de fazer nada.

## O que cada permissão permite

- **Ver as suas despesas: valores, datas, categorias, artigos e etiquetas** — a aplicação pode ler as despesas da conta ligada, incluindo os artigos de um talão e as alterações e eliminações posteriores.
- **Adicionar, alterar e eliminar despesas** — a aplicação pode escrever nessa conta. As despesas que adicionar mostram **Adicionado via** e o nome da aplicação no ecrã da despesa.
- **Transferir as fotografias dos seus talões** — a aplicação pode transferir a imagem ou o PDF do talão anexado a uma despesa.
- **Ver as suas categorias de despesas** — a aplicação pode ler a sua lista de categorias, para classificar corretamente as novas despesas.
- **Ver e adicionar as suas receitas** — a aplicação pode ler as receitas da conta ligada e, com a permissão de escrita, adicionar, alterar e eliminar receitas. As receitas que adicionar mostram **Adicionado via** e o nome da aplicação. As receitas criadas por uma transferência entre as suas contas são só de leitura.
- **Ver e gerir os seus orçamentos** — a aplicação pode ler os seus orçamentos com o progresso do período atual e, com a permissão de escrita, criá-los, alterá-los e eliminá-los.
- **Ver os totais das suas receitas e gastos** — a aplicação pode ler resumos: totais por categoria e por mês. Partilha esses totais, não os registos individuais, e os valores são convertidos para a sua moeda de apresentação.

Qualquer aplicação ligada pode ver também o nome, o tipo e a moeda das contas que marcou, bem como o seu nome. Nunca recebe o seu endereço de e-mail e nunca pode ver uma conta que não tenha marcado.

## Ver e desligar aplicações

Abra **Definições → Aplicações ligadas**. Cada aplicação ocupa uma linha, com as contas a que está ligada, quem a ligou e quando, quando foi usada pela última vez e as respetivas permissões.

Para cortar o acesso a **uma conta**, toque em **Remover conta** ao lado dela e confirme. A aplicação perde essa conta de imediato — o próximo pedido que fizer para ela é recusado —, enquanto as outras contas continuam a funcionar. Remover a última conta desliga a aplicação por completo.

Para cortar o acesso à aplicação inteira, toque em **Desligar** e confirme. Perde o acesso a todas as contas de uma só vez. As despesas que já adicionou ficam nas suas contas. Para voltar a usar a aplicação, ligue-a novamente a partir da própria aplicação.

Sempre que uma aplicação é ligada ou recebe novas contas, enviamos um e-mail a quem o fez, com a lista das contas acrescentadas. Se receber um e não reconhecer a aplicação, desligue-a de imediato.

Se não vir **Aplicações ligadas** em Definições, a ligação de aplicações ainda não está disponível.

## Contas partilhadas

Só um **proprietário** ou um **editor** de uma conta pode ligar-lhe uma aplicação; quem só pode ver uma conta vê-a a cinzento.

Uma aplicação ligada a uma conta partilhada vê as despesas de **todos** nessa conta, e não apenas as de quem a ligou. É por isso que todos os proprietários e editores dessa conta veem a aplicação em **Aplicações ligadas**, com a indicação de quem a ligou, e podem removê-la dessa conta.

Só vê as contas de uma ligação de que é proprietário ou editor — nunca as outras contas que a pessoa que ligou a aplicação escolheu. Quando toca em **Desligar**, a aplicação perde apenas essas contas suas; continua ligada para quem a configurou, e só essa pessoa a pode desligar por completo. Quando um editor liga uma aplicação, os proprietários das contas ligadas também recebem um e-mail, com a lista apenas das contas deles.

Se a pessoa que ligou uma aplicação passar depois a leitor ou sair de uma conta, a aplicação deixa de funcionar para essa conta; as outras contas não são afetadas. Uma conta eliminada é retirada da aplicação automaticamente.

## Contas encriptadas

- Uma conta com **encriptação total** (incluindo os valores) não pode ser ligada de todo — a aplicação não conseguiria ler nada nela.
- Uma conta com **encriptação de texto** pode ser ligada **só de leitura**: a aplicação vê os valores, as datas e as categorias, mas as descrições, notas, comerciantes, nomes de artigos, etiquetas e outro texto encriptado ficam ocultos, e não pode adicionar nem alterar despesas.

Consulte [Encriptação ponto a ponto](./15-encryption.md) para saber o que cada nível abrange.

## Para programadores

Pode criar a sua própria aplicação sobre a API do AI Budget — é gratuito. Abra **Definições → Programadores** e toque em **Criar aplicação**: dê-lhe um nome, uma página inicial e os endereços de redirecionamento que vai usar, e escolha **Aplicação de servidor** ou **Aplicação móvel ou de navegador**. Recebe de imediato um **Client ID**; uma aplicação de servidor recebe também um client secret, mostrado **uma única vez** — copie-o imediatamente.

A referência completa da API e um guia passo a passo (em inglês, polaco e russo) estão em [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), também acessíveis através de **Documentação da API** no ecrã Programadores. Pode registar até 10 aplicações.
