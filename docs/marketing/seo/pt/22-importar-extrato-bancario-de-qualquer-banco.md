---
title: "Importar extrato bancário de qualquer banco com IA"
meta_description: "Como importar o extrato bancário em CSV, Excel ou PDF de qualquer banco para uma aplicação de orçamento: a IA identifica as colunas e confirma tudo antes."
target_keyword: "importar extrato bancário"
slug: "importar-extrato-bancario-de-qualquer-banco"
pair: "ai-bank-import"
lang: "pt"
date: "2026-11-14"
---

# Importar o extrato bancário quando o seu banco não está na lista

Exportou o extrato do homebanking, carregou o ficheiro na aplicação de orçamento à espera de ver os movimentos arrumados, e em vez disso apareceu um ecrã a pedir para indicar as colunas, ou pior, uma lista vazia. O formato do seu banco simplesmente não é um dos que a aplicação reconhece à primeira. Em Portugal isto acontece muito: cada banco exporta à sua maneira, uns com a data do movimento e a data-valor, outros com débito e crédito em colunas separadas, outros com cabeçalhos repetidos ou linhas de saldo pelo meio.

A boa notícia: «não está na lista» não quer dizer «não dá para importar». Este artigo explica exatamente o que acontece nos bastidores quando o AI Budget Assistant não reconhece o formato de um ficheiro, e porque é que o mecanismo que entra em ação é mais seguro do que pode parecer à primeira vista.

## Porque é que nenhuma lista de bancos está completa

Qualquer aplicação que importe extratos tem de decidir de antemão que formatos reconhece diretamente. O AI Budget Assistant reconhece à primeira, por exemplo, os ficheiros do Revolut e do Wise, muito usados em Portugal, e os de vários bancos polacos, o mercado onde a aplicação nasceu. Os bancos portugueses não têm, para já, um leitor dedicado.

Manter um leitor próprio para cada formato de cada banco, para sempre, não é realista. Há bancos grandes e pequenos, contas de empresa com exportações diferentes, contas noutros países e exportações de outras aplicações de finanças que alguém quer trazer ao mudar de ferramenta. E qualquer formato novo ficaria «não suportado» durante meses até alguém escrever uma regra para ele. Por isso, em vez de esperar que a lista cresça até chegar ao seu banco, a aplicação tem um mecanismo que tenta perceber sozinho a estrutura de um ficheiro que nunca viu.

## Como obter o extrato no homebanking

O ponto de partida é sempre o mesmo, seja qual for o banco: no homebanking ou na aplicação do banco, abra a lista de movimentos da conta, escolha o período e procure uma opção de exportação ou de transferência do extrato. Os formatos mais úteis, por ordem de preferência:

- **CSV ou Excel (XLSX)** – o melhor ponto de partida, porque cada movimento já vem numa linha e cada dado numa coluna.
- **PDF** – funciona, mas exige leitura do texto do documento, por isso é uma funcionalidade do plano Pro.

Os nomes dos menus variam de banco para banco, mas a opção costuma estar junto da pesquisa de movimentos. Se o banco só oferecer PDF para períodos longos, exporte em CSV mês a mês: é mais rápido de rever.

## O que acontece quando o ficheiro não é reconhecido

Quando carrega um CSV ou uma folha de cálculo XLSX e nenhum dos leitores incorporados reconhece a disposição, entra em ação um modelo de IA. A tarefa dele é estreita e muito concreta: não lê valores nem datas. Limita-se a indicar **que coluna é qual** – qual tem a data do movimento, qual o valor (ou as colunas de débito e crédito, quando vêm separadas), qual a descrição ou o comerciante. Esses nomes de colunas são depois comparados, palavra por palavra, com os cabeçalhos que existem de facto no seu ficheiro. Se o modelo «inventar» uma coluna que não está lá, a resposta inteira é rejeitada, e não aceite em silêncio. Só depois dessa verificação é que as mesmas regras determinísticas usadas no mapeamento manual de colunas leem os números e as datas.

Nos extratos em PDF, uma funcionalidade do plano Pro, o mecanismo é diferente, porque de um PDF não se tiram simplesmente nomes de colunas: o modelo tem de extrair as próprias linhas de movimentos a partir do texto da página. Sempre que o extrato tem saldo inicial e saldo final, a aplicação confere se a soma dos movimentos encontrados bate certo. Se não bater, ou se o extrato não tiver saldo final para comparar, avisa-o de que podem faltar linhas, em vez de fingir que está tudo completo.

## O que este mecanismo nunca faz

A distinção é importante, porque é fácil assumir que «a IA importa o extrato» significa que o modelo adivinha os números. Não é o caso. Em CSV e XLSX, o modelo nunca devolve um valor nem uma data: devolve apenas nomes de colunas, e esses nomes são sempre confirmados contra os cabeçalhos reais do ficheiro. Os números e as datas são lidos pelo mesmo código previsível que trata o mapeamento manual. O mecanismo ajuda a reconhecer a estrutura; não anda a olhar para os seus gastos.

Mesmo assim, não é uma garantia de exatidão perfeita à primeira tentativa, como nenhum mecanismo de reconhecimento de formatos é. Por isso, antes de qualquer movimento chegar ao orçamento, recebe uma pré-visualização para confirmar, descrita mais abaixo.

## O que vê e autoriza antes de algo sair do telemóvel

Antes de qualquer parte do ficheiro chegar ao modelo de IA, a aplicação pede o seu consentimento, uma vez por conta, num ecrã intitulado «Deixar a IA ler este extrato?», e mostra exatamente o que vai ser enviado. Num CSV ou XLSX, é a linha de cabeçalho e até dez linhas de exemplo, nunca o ficheiro inteiro nem o histórico completo. Num extrato em PDF, são as primeiras vinte linhas do texto extraído. Vê tudo isto antes de decidir: pode tocar em «Usar IA» ou em «Vou mapear manualmente».

Se a conta tiver a encriptação de ponta a ponta total ativa (o modo de privacidade máxima da aplicação), este mecanismo nem sequer corre. Dados que a própria aplicação não consegue desencriptar também não podem ser enviados a nenhum modelo de IA, por isso essas contas usam apenas o mapeamento manual de colunas, mais seguro, embora custe um toque a mais.

## Revê e corrige antes de guardar

Depois de o modelo propor o mapeamento, não recebe um resultado em bruto sem contexto. Vê uma fila de etiquetas editáveis com o que foi reconhecido, algo como «Data → Data Mov.» ou «Descrição → Descritivo». Se alguma estiver errada, a opção «Errado? Toque para corrigir» abre o mesmo mapeador manual de colunas, já preenchido com a proposta do modelo, para corrigir uma coluna em vez de começar do zero. Se o ficheiro não tiver coluna de moeda, a aplicação diz em que moeda leu as linhas e deixa alterá-la antes de importar.

É a mesma pré-visualização que acompanha qualquer importação no AI Budget Assistant, quer o banco tenha sido reconhecido de imediato quer só com a ajuda da IA: a lista completa de movimentos para rever antes de entrar no orçamento, com as categorias já sugeridas a partir do comerciante e com os movimentos que já existem na conta desmarcados, para que importar o mesmo ficheiro duas vezes não crie duplicados.

## Da segunda vez é mais rápido

Assim que o mapeamento de um formato se confirma correto, a sua forma – apenas os nomes das colunas e o modo como as datas e os valores estão escritos, sem nenhum dado pessoal nem nenhum movimento – fica guardada num dicionário global de formatos. A pessoa seguinte que carregar um extrato do mesmo banco já não precisa do passo de IA: o formato é reconhecido à primeira. De certa forma, é o primeiro utilizador a «desbloquear» o formato do seu banco para todos os que vêm depois.

## Como experimentar

Se tem um ficheiro de um banco que desistiu de importar porque a aplicação não o reconhecia, vale a pena tentar de novo. Vá a **Definições → Importar transações** no [AI Budget Assistant](https://ai-budget.pl), escolha o ficheiro CSV, XLSX ou PDF e, se nenhum leitor incorporado o reconhecer, verá o ecrã de consentimento descrito acima em vez de uma lista vazia. Depois de aceitar, recebe uma pré-visualização com o mapeamento sugerido para confirmar, como em qualquer outra importação.

Importar o extrato é o atalho mais rápido para um [controlo de despesas](/blog/pt/controlo-de-despesas/) completo, e o ponto de partida natural para [fazer um orçamento familiar](/blog/pt/como-fazer-um-orcamento-familiar/) com números reais em vez de estimativas. A aplicação é gratuita no browser em [ai-budget.pl](https://ai-budget.pl), sem cartão, e está disponível para Android no [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## FAQ: importar extrato bancário

**O que acontece se o meu banco não for suportado diretamente?**

Se carregar um CSV ou XLSX que nenhum leitor incorporado reconhece, o AI Budget Assistant tenta perceber sozinho qual é a coluna da data, do valor e da descrição, e mostra-lhe o resultado para rever e corrigir. Nos extratos em PDF (uma funcionalidade do plano Pro), o mecanismo extrai as linhas de movimentos diretamente do texto do documento. Em ambos os casos, recebe uma pré-visualização completa antes de qualquer coisa ser guardada.

**A aplicação tem suporte específico para os bancos portugueses?**

Não há, para já, leitores dedicados a bancos portugueses. Os extratos de qualquer banco português passam pela importação universal: a IA identifica as colunas de um CSV ou XLSX, ou lê o PDF no plano Pro, e o resultado é sempre confirmado por si na pré-visualização. O Revolut e o Wise, muito usados em Portugal, são reconhecidos diretamente.

**A IA pode enganar-se e registar um valor errado?**

Em CSV e XLSX, o modelo de IA nunca lê valores nem datas: indica apenas que coluna é qual, e esses nomes são confirmados contra os cabeçalhos reais do ficheiro, por isso uma coluna inventada é rejeitada. Os números são lidos pelo mesmo mecanismo do mapeamento manual. Em qualquer caso, vê a pré-visualização de cada movimento antes de guardar e pode corrigir o que parecer errado.

**O conteúdo do meu extrato é enviado para algum lado?**

Antes de qualquer parte do ficheiro chegar ao modelo de IA, aparece um ecrã de consentimento, uma vez por conta, que mostra exatamente o que vai ser enviado: a linha de cabeçalho e até dez linhas de exemplo num CSV ou XLSX, ou as primeiras vinte linhas de texto num PDF. As contas com encriptação de ponta a ponta total não usam este mecanismo, porque a aplicação não tem acesso aos dados para os enviar.

**Se importar o mesmo extrato duas vezes, os movimentos ficam duplicados?**

Não. Na pré-visualização, os movimentos que já existem na conta aparecem desmarcados, por isso pode voltar a importar um extrato com períodos sobrepostos sem duplicar despesas. Se um movimento for mesmo diferente, basta voltar a marcá-lo.

---

*Artigos relacionados: [Controlo de despesas sem esforço](/blog/pt/controlo-de-despesas/) | [IA para finanças pessoais](/blog/pt/ia-para-financas-pessoais/)*
