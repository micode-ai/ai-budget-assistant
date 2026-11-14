---
title: "Como importar o extrato bancário de qualquer banco"
meta_description: "Importe o extrato bancário em CSV, Excel ou PDF de qualquer banco: a IA identifica as colunas, você confere a prévia e nada é salvo sem a sua revisão."
target_keyword: "importar extrato bancário"
slug: "importar-extrato-bancario"
pair: "ai-bank-import"
lang: "br"
date: "2026-11-14"
---

# Como importar o extrato bancário de qualquer banco para o seu app de finanças

Você baixa o extrato no internet banking, abre o app de finanças esperando que tudo se encaixe sozinho, e o que aparece é uma tela pedindo para mapear colunas, ou pior, uma lista de transações vazia. É uma frustração conhecida, principalmente no dia em que você finalmente decide colocar três meses de gastos em dia de uma vez.

A verdade é que nenhum app de finanças tem um leitor pronto para cada banco, conta digital, cooperativa e fintech que existe no Brasil. A boa notícia: "o app não conhece o meu banco" não significa "não dá para importar". Este artigo mostra exatamente o que acontece por trás quando o AI Budget Assistant não reconhece o formato de um arquivo, e por que a solução que entra em ação é mais segura do que parece.

## Por que nenhuma lista de bancos fica completa

Todo app que importa extratos precisa decidir quais formatos vai reconhecer de cara. O AI Budget Assistant nasceu na Europa: ele tem leitores dedicados para alguns bancos europeus e para serviços como a Wise, mas **não tem leitores dedicados para bancos brasileiros**. Dizemos isso com todas as letras porque é justamente o ponto deste artigo.

Mesmo um app brasileiro não conseguiria manter um leitor para cada formato para sempre. Cada banco exporta de um jeito: um usa ponto e vírgula, outro vírgula; um põe o valor numa coluna só com sinal de menos, outro separa crédito e débito; um escreve a data como 05/11/2026, outro como 2026-11-05. Bancos mudam o layout sem avisar. Em vez de esperar a lista crescer até chegar ao seu banco, o app tem um mecanismo que tenta entender a estrutura de um arquivo que ele nunca viu.

## Antes de tudo: qual arquivo baixar do banco

O app aceita três formatos:

- **CSV**: a opção mais confiável quando o banco oferece.
- **Excel (XLSX)**: funciona igual ao CSV. Se o banco só entrega o formato antigo **.xls**, abra o arquivo no Excel ou no Google Sheets e salve como XLSX ou CSV.
- **PDF**: o extrato ou a fatura do cartão em PDF, lidos pela IA (recurso do plano Pro).

O formato **OFX**, que muitos bancos brasileiros oferecem pensando em programas de contabilidade, **não é aceito**. Se ele for a única opção no internet banking, procure a exportação em PDF, Excel ou CSV, que costuma estar na mesma tela.

## O que acontece quando o arquivo não é reconhecido

Quando você envia um CSV ou XLSX e nenhum dos leitores prontos reconhece o layout, um modelo de IA entra em cena. O trabalho dele é estreito e bem definido: ele não lê valores nem datas. Ele só aponta **qual coluna é qual**: qual tem a data da transação, qual tem o valor, qual tem a descrição ou o nome do estabelecimento. Esses nomes de coluna são então conferidos, palavra por palavra, com os cabeçalhos que existem de verdade no seu arquivo. Se o modelo "inventar" uma coluna que não está lá, a resposta inteira é rejeitada, e não aceita em silêncio. Só depois dessa checagem as mesmas regras determinísticas usadas no mapeamento manual leem os números e as datas.

Com o extrato em **PDF**, o mecanismo é outro, porque não dá para tirar nomes de coluna de um PDF: o modelo precisa extrair as próprias linhas de transação do texto da página. Para não deixar furos passarem calados, o app compara a soma das transações encontradas com o saldo inicial e final do extrato. Se não bater, ou se o documento não tiver saldo final para comparar, você vê um aviso pedindo para revisar a lista.

## O que esse mecanismo nunca faz

A distinção importa, porque é fácil imaginar que "a IA importa o extrato" quer dizer "o modelo chuta os números". Não quer. No caminho do CSV e do XLSX, o modelo nunca devolve um valor ou uma data: ele só devolve nomes de coluna, sempre conferidos com os cabeçalhos reais do arquivo. Os números são lidos pelo mesmo código previsível que faz o mapeamento manual. É um ajudante para reconhecer estrutura, não alguém olhando seus gastos e estimando.

Ainda assim, não é garantia de acerto perfeito de primeira, como nenhum reconhecimento de formato é. Por isso, antes de qualquer coisa chegar ao seu orçamento, existe uma prévia para conferir.

## O que você vê e autoriza antes de qualquer dado sair do celular

Antes de qualquer parte do arquivo chegar ao modelo de IA, o app pede a sua autorização, uma vez por conta, e mostra exatamente o que será enviado. Para um CSV ou XLSX, são a linha de cabeçalho e até 10 linhas de exemplo, não o arquivo inteiro nem todo o seu histórico. Para um PDF, são as primeiras 20 linhas de texto do extrato. Você lê isso na tela "Deixar a IA ler este extrato?" antes de qualquer coisa acontecer, e pode escolher "Vou mapear manualmente".

Se a sua conta tem criptografia de ponta a ponta, esse mecanismo nem roda. Dados que o próprio app não consegue decifrar não podem ser enviados a modelo nenhum, então essas contas usam só o mapeamento manual de colunas: mais privado, com um toque a mais.

## Você revisa e corrige antes de salvar

Depois que o modelo propõe o mapeamento, você não recebe um resultado cru, sem contexto. Aparece uma linha de etiquetas editáveis mostrando o que ele reconheceu, algo como "Data → Data Lançamento" ou "Valor → Valor (R$)". Se alguma estiver errada, a opção "Errado? Toque para corrigir" abre o mesmo mapeador manual, já preenchido com o palpite do modelo, para você corrigir uma coluna em vez de recomeçar do zero.

Se o arquivo não tiver coluna de moeda, o app avisa que leu todas as linhas na moeda da conta, para você conferir antes de importar. Essa é a mesma prévia de qualquer importação no AI Budget Assistant: a lista completa das transações para revisar, com categorias já sugeridas pelo estabelecimento e possíveis duplicados marcados, para que importar o mesmo período duas vezes não conte nada em dobro. E se algo der errado depois, "Desfazer importação" remove as transações daquele arquivo de uma vez.

## Da segunda vez é mais rápido

Quando o mapeamento de um formato se confirma correto, o formato dele (só os nomes das colunas e o jeito de escrever datas e valores, sem nenhum dado seu ou das suas transações) vai para um dicionário global de formatos. A próxima pessoa que enviar um extrato daquele mesmo banco nem precisa da etapa de IA: o formato já é reconhecido de cara. De certo modo, você é quem "destrava" o formato do seu banco para todo mundo que vier depois.

## Como testar

Se você tem um extrato que nunca conseguiu importar em app nenhum, vale tentar de novo. Envie o CSV, o Excel ou o PDF para o [AI Budget Assistant](https://ai-budget.pl), e se nenhum leitor pronto reconhecer o arquivo, você verá a tela de autorização descrita acima em vez de uma lista vazia. Depois de aceitar, chega a prévia com o mapeamento sugerido para conferir, como em qualquer outra importação.

Com o histórico dentro do app, o próximo passo é transformar esses números em hábito: o guia de [controle de gastos](/blog/br/controle-de-gastos/) mostra como manter tudo em dia sem planilha, e [como fazer um orçamento familiar](/blog/br/como-fazer-um-orcamento-familiar/) mostra como definir limites a partir desses dados reais. O app é gratuito no navegador em [ai-budget.pl](https://ai-budget.pl), sem cartão de crédito, e está no [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant) para Android.

---

## FAQ: importar extrato bancário

**O que acontece se o app não reconhecer o meu banco?**

Se você enviar um CSV ou XLSX que nenhum leitor pronto reconhece, o AI Budget Assistant tenta descobrir sozinho qual coluna é a data, qual é o valor e qual é a descrição, e mostra o resultado para você revisar e corrigir. No extrato em PDF (recurso do plano Pro), o mecanismo extrai as linhas de transação direto do texto do documento. Nos dois casos, você vê a prévia completa antes de qualquer coisa ser salva.

**O app tem suporte específico ao Nubank, Itaú, Bradesco ou outros bancos brasileiros?**

Não há leitores dedicados para bancos brasileiros. O extrato do seu banco em CSV, Excel ou PDF passa pela importação universal com IA descrita neste artigo, que identifica o formato e mostra uma prévia para conferir. Quando um formato se confirma correto, ele passa a ser reconhecido de cara nas próximas importações.

**A IA pode errar e lançar um valor errado?**

No CSV e no XLSX, o modelo de IA nunca lê valores nem datas: ele só indica qual coluna é qual, e esses nomes são conferidos com os cabeçalhos reais do arquivo, então uma coluna inventada é rejeitada. Os números são lidos pelo mesmo mecanismo do mapeamento manual. De qualquer forma, você vê a prévia de cada transação antes de salvar e pode corrigir o que parecer estranho.

**O conteúdo do meu extrato é enviado para algum lugar?**

Antes de qualquer parte do arquivo chegar ao modelo de IA, aparece uma tela de autorização, uma vez por conta, mostrando exatamente o que será enviado: a linha de cabeçalho e até 10 linhas de exemplo de um CSV ou XLSX, ou as primeiras 20 linhas de texto de um PDF. Contas com criptografia de ponta a ponta não usam esse mecanismo, porque o app não tem acesso aos dados para enviá-los ao modelo.

**Posso importar um arquivo OFX?**

Não. O app aceita CSV, Excel (XLSX) e PDF. A maioria dos bancos oferece pelo menos um desses formatos na mesma tela em que oferece o OFX; procure a opção de exportar o extrato em PDF ou em planilha.

**E se eu importar o mesmo período duas vezes?**

A prévia marca as transações que parecem já existir, para nada ser contado em dobro. E se você importar o arquivo errado, a opção "Desfazer importação" remove de uma vez todas as transações daquele arquivo.

---

*Artigos relacionados: [Controle de gastos sem planilha](/blog/br/controle-de-gastos/) | [IA para finanças pessoais: o que ela faz de verdade](/blog/br/ia-para-financas-pessoais/)*
