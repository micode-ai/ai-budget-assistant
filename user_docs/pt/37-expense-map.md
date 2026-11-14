# Mapa de despesas

> Veja as suas despesas num mapa. Os talões digitalizados são colocados pela morada da loja; adicione a sua localização ou coloque um marcador à mão.

Veja os seus gastos num mapa. As despesas podem ter uma localização — obtida a partir da morada da loja impressa num talão digitalizado, do GPS do telemóvel no momento em que adiciona a despesa, ou colocada à mão — e a aplicação pode mostrar qualquer lista filtrada de despesas como marcadores clicáveis num mapa.

## De onde vêm as localizações

Uma despesa obtém a localização de uma de três fontes (a mais alta prevalece):

1. **Marcador manual** — coloque ou mova o marcador no ecrã de localização da despesa.
2. **Morada do talão** — quando digitaliza um talão, a aplicação lê a morada da loja impressa nele e converte-a automaticamente em coordenadas no mapa. Isto funciona mesmo que digitalize o talão mais tarde, em casa. Os talões enviados aos bots de chat (Telegram, WhatsApp, Slack) são localizados da mesma forma.
3. **GPS no momento do registo** — opcionalmente, a aplicação pode anexar de forma discreta a sua posição atual quando adiciona uma despesa no local (introdução manual, por voz ou captura automática de notificações do banco).

As transações importadas (ficheiros CSV/PDF do banco) não recebem localização.

## Captura por GPS

A captura por GPS está **ativada por predefinição**. Da primeira vez que adicionar uma despesa (à mão, por voz ou digitalizando um talão), a aplicação pede a permissão de localização — permita-a, e as novas despesas que adicionar em movimento passam a ter automaticamente a sua posição atual.

Para a desligar (ou voltar a ligar), abra **Definições → Dados e relatórios → Localização** e altere **Anexar localização às novas despesas**. Se recusou a permissão, permita a localização para a aplicação nas definições do sistema.

Pode sempre ver e remover a localização de uma despesa, e pode desligar esta opção a qualquer momento.

## Vista de mapa no separador Despesas

No separador **Despesas**, toque no ícone do mapa ao lado do ícone de pesquisa para passar da lista para um mapa. O mapa mostra as mesmas despesas que a lista — os filtros de período, categoria e comerciante aplicam-se todos. Toque novamente no ícone para voltar à lista.

- As despesas próximas são agrupadas em grupos numerados; toque num grupo para aproximar.
- Toque num marcador para ver o comerciante e o valor; toque em **Abrir** para ir para essa despesa.
- Se algumas despesas filtradas não tiverem localização, uma pequena faixa indica quantas são.

## Localização no ecrã da despesa

Quando uma despesa tem localização, o ecrã de detalhe mostra um pequeno mapa com o marcador e a morada (ou as coordenadas). A partir daí, pode:

- **Editar localização** — abre um mapa em ecrã inteiro onde pode tocar para colocar o marcador, arrastá-lo ou usar **A minha localização** para saltar para onde está.
- **Remover localização** — o ícone do caixote do lixo ao lado do mapa remove o marcador com um toque.

Uma despesa sem localização mostra antes um botão **Adicionar localização** (só para editores).

## Mapa da viagem

As contas de viagem têm um ponto de entrada próprio: abra a conta de viagem e toque em **Mapa da viagem**. A aplicação muda para essa viagem e abre o separador Despesas em modo de mapa — um diário visual de onde foi parar o dinheiro da viagem. Juntamente com a digitalização de talões e a captura por GPS, a maioria das despesas da viagem aparece no mapa automaticamente.

## Privacidade

- A captura por GPS está ativada por predefinição, mas precisa da sua permissão — a aplicação pede-a uma vez, e pode desligá-la a qualquer momento em **Definições → Dados e relatórios → Localização**.
- A procura da morada do talão usa apenas a morada impressa no talão — a localização do telemóvel não entra nisso.
- A localização faz parte do registo da despesa: os membros de uma conta partilhada que podem ver a despesa também veem a sua localização.
- Pode remover a localização de qualquer despesa a qualquer momento.
