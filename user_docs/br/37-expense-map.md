# Mapa de despesas

> Veja suas despesas em um mapa. Os recibos escaneados são posicionados pelo endereço da loja; adicione sua localização ou coloque um marcador manualmente.

Veja seus gastos em um mapa. As despesas podem ter uma localização — tirada do endereço da loja impresso em um recibo escaneado, do GPS do celular no momento em que você adiciona a despesa, ou colocada manualmente — e o app pode mostrar qualquer lista filtrada de despesas como marcadores clicáveis em um mapa.

## De onde vêm as localizações

Uma despesa recebe a localização de uma de três fontes (a mais alta tem prioridade):

1. **Marcador manual** — você mesmo coloca ou move o marcador na tela de localização da despesa.
2. **Endereço do recibo** — quando você escaneia um recibo, o app lê o endereço da loja impresso nele e o converte automaticamente em coordenadas no mapa. Isso funciona mesmo se você escanear o recibo depois, em casa. Recibos enviados aos bots de chat (Telegram, WhatsApp, Slack) são posicionados do mesmo jeito.
3. **GPS na hora do registro** — opcionalmente, o app pode anexar discretamente sua posição atual quando você adiciona uma despesa na hora (registro manual, por voz ou captura automática de notificações do banco).

Transações importadas (arquivos CSV/PDF do banco) não recebem localização.

## Captura por GPS

A captura por GPS vem **ativada por padrão**. Na primeira vez que você adicionar uma despesa (manualmente, por voz ou escaneando um recibo), o app pede a permissão de localização — permita, e as novas despesas que você adicionar na rua passam a ter sua posição atual automaticamente.

Para desativar (ou reativar), abra **Configurações → Dados e relatórios → Localização** e altere **Anexar localização às novas despesas**. Se você recusou a permissão, permita a localização para o app nas configurações do sistema.

Você sempre pode ver e remover a localização de uma despesa, e pode desligar essa opção a qualquer momento.

## Visualização de mapa na aba Despesas

Na aba **Despesas**, toque no ícone de mapa ao lado do ícone de busca para trocar a lista por um mapa. O mapa mostra as mesmas despesas que a lista — seus filtros de período, categoria e estabelecimento continuam valendo. Toque no ícone de novo para voltar à lista.

- Despesas próximas são agrupadas em grupos numerados; toque em um grupo para aproximar.
- Toque em um marcador para ver o estabelecimento e o valor; toque em **Abrir** para ir até essa despesa.
- Se algumas despesas filtradas não tiverem localização, uma pequena faixa mostra quantas são.

## Localização na tela da despesa

Quando uma despesa tem localização, a tela de detalhes mostra um pequeno mapa com o marcador e o endereço (ou as coordenadas). Dali você pode:

- **Editar localização** — abre um mapa em tela cheia onde você pode tocar para colocar o marcador, arrastá-lo ou usar **Minha localização** para ir até onde você está.
- **Remover localização** — o ícone de lixeira ao lado do mapa remove o marcador com um toque.

Uma despesa sem localização mostra, em vez disso, um botão **Adicionar localização** (só para editores).

## Mapa da viagem

Contas de viagem têm um atalho próprio: abra a conta de viagem e toque em **Mapa da viagem**. O app muda para essa viagem e abre a aba Despesas no modo de mapa — um diário visual de para onde foi o dinheiro da viagem. Junto com o escaneamento de recibos e a captura por GPS, a maioria das despesas da viagem vai parar no mapa automaticamente.

## Privacidade

- A captura por GPS vem ativada por padrão, mas precisa da sua permissão — o app pede uma vez, e você pode desativá-la a qualquer momento em **Configurações → Dados e relatórios → Localização**.
- A busca pelo endereço do recibo usa só o endereço impresso no recibo — a localização do celular não entra nisso.
- A localização faz parte do registro da despesa: membros de uma conta compartilhada que podem ver a despesa também veem a localização dela.
- Você pode remover a localização de qualquer despesa a qualquer momento.
