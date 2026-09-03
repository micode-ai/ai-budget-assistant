# Billetera y Cambio de divisa

> Rastrea saldos en multiples monedas y realiza cambios entre ellas con tasas de cambio en tiempo real. La billetera se actualiza automaticamente a medida que agregas gastos e ingresos.

## Vista general

La funcion de Billetera te permite rastrear tus saldos reales en cada moneda compatible. A medida que agregas gastos e ingresos, la billetera se actualiza automaticamente para reflejar tu posicion financiera actual.

## Saldos de la billetera

Accede a la Billetera desde:
- **Panel** — toca **Ver todo** junto a la seccion de Saldos de la billetera
- **Panel** — toca el boton de accion rapida **Transferencias** para acceso rapido a transferencias
- **Ajustes** — ve a Billetera > **Saldos**

Para cada moneda, veras:

| Campo | Descripcion |
|---|---|
| **Saldo actual** | Tu saldo en tiempo real en esta moneda |
| **Saldo inicial** | El saldo inicial que estableciste |
| **Total gastado** | Suma de todos los gastos en esta moneda |
| **Total ingresos** | Suma de todos los ingresos en esta moneda |
| **Cambio entrante** | Importe recibido de cambios de divisa |
| **Cambio saliente** | Importe gastado en cambios de divisa |
| **Transferencia entrante** | Importe recibido de transferencias entre cuentas |
| **Transferencia saliente** | Importe enviado en transferencias entre cuentas |

La formula: **Saldo actual = Saldo inicial + Total ingresos - Total gastado + Cambio entrante - Cambio saliente + Transferencia entrante - Transferencia saliente**

Una moneda aparece en la cartera por sí sola en cuanto registras dinero en ella: un gasto, un ingreso, un cambio o una transferencia. Hasta que le asignes un saldo inicial, este es 0, por lo que la tarjeta muestra exactamente la suma de tus transacciones. Si eliminas una moneda de la cartera, seguirá oculta aunque sigas registrando transacciones en ella: vuelve a asignarle un saldo para recuperar la tarjeta.

## Establecer saldo inicial

Establece tu saldo inicial para cada moneda:

1. Ve a **Ajustes** > **Billetera** > **Establecer saldo**
2. Selecciona la **Moneda** (USD, EUR, PLN, GBP, UAH, RUB o BYN)
3. Introduce el **Importe** — tu saldo real actual en esa moneda
4. Toca **Guardar**

Veras una confirmacion: "Saldo establecido correctamente."

> **Consejo:** Establece tus saldos iniciales cuando comiences a usar la aplicacion, para que la billetera refleje tus finanzas con precision desde el primer dia.

## Saldo total

Cuando tienes saldos en varias monedas, la aplicacion muestra un **Saldo total** convertido a la moneda principal configurada en tus ajustes. Esto te permite ver tu patrimonio completo en una sola cifra, sin necesidad de calcular manualmente los importes de cada billetera.

- El saldo total aparece en la parte superior de la pantalla de Billetera.
- La conversion utiliza las tasas de cambio mas recientes obtenidas automaticamente.
- Si cambias la moneda principal en **Ajustes**, el saldo total se recalcula de inmediato.

Puedes cambiar la moneda de visualizacion directamente aqui: toca una ficha de moneda encima del total para recalcular al instante el total y el grafico de Historial de saldo en esa moneda. Este es un cambio de visualizacion exclusivo para la pantalla de Billetera — no modifica la configuracion de moneda global de la aplicacion y se restablece a tu moneda predeterminada cuando abandonas la pantalla.

## Historial de saldo

En la parte superior de la pantalla de Billetera, la tarjeta **Historial de saldo** muestra como cambio tu saldo total cada mes en forma de grafico de barras:

- Las **barras verdes** significan que tu saldo crecio ese mes; las **barras rojas** significan que disminuyo.
- Toca cualquier barra para ver el cambio exacto de ese mes.
- Usa el selector **6M / 12M** para alternar entre los ultimos 6 o 12 meses.
- Los importes siguen la moneda que elijas en las fichas de moneda, convertidos a las tasas de cambio mas recientes.

## Transferencias entre cuentas

Transfiere dinero entre tus diferentes cuentas (por ejemplo, de Negocio a Personal):

1. Ve a **Billetera** > **Transferencia**
2. Selecciona la **Cuenta origen** — la cuenta desde la que envias el dinero. Cada ficha de cuenta muestra su saldo actual
3. Selecciona la **Cuenta destino** — la cuenta que recibira el dinero
4. Selecciona la **Moneda**
5. Introduce el **Importe**. Debajo del campo, **Disponible:** muestra el saldo de la cuenta origen en la moneda elegida — toca **Max** para usarlo todo
6. Si las monedas de las cuentas difieren, ajusta la **Tasa de cambio** (se obtiene automaticamente)
7. Elige la **Fecha** — por defecto es hoy; tocala para registrar una transferencia anterior
8. Opcionalmente agrega **Notas** (por ejemplo, "Reembolso de gastos" o "Ahorro mensual")
9. Toca **Transferir** para completar

Si el importe supera el saldo que la app conoce, veras un aviso, pero la transferencia se guarda igualmente. Nunca se bloquea: puedes estar registrando una transferencia posterior o quiza nunca se fijo el saldo inicial de la cuenta.

Un guion (—) en lugar del saldo significa que la app aun no tiene esa cifra. Los saldos de cuentas distintas de la actual vienen del servidor, asi que pueden faltar la primera vez que abres el formulario sin conexion.

### Transferencias frecuentes

Si ya has transferido dinero antes, aparece una fila **Frecuentes** en la parte superior del formulario con tus rutas mas usadas (por ejemplo, *Personal → Ahorros 2000 PLN*). Toca una y el formulario se rellena: cuentas, monedas y el importe de la ultima vez que usaste esa ruta. Puedes cambiar lo que quieras antes de guardar.

No se ofrecen rutas con cuentas a las que ya no tienes acceso.

### Transferencias recientes

Debajo del formulario de transferencia, encontraras las 5 transferencias mas recientes con:
- Cuenta origen y cuenta destino
- Moneda e importe transferido
- Tasa de cambio utilizada (si las monedas difieren)
- Fecha
- Notas (si se agregaron)

Toca **Mostrar todo** para abrir el historial completo de transferencias.

### Historial de transferencias

La pantalla **Historial de transferencias** muestra una lista completa de todas tus transferencias entre cuentas. Accede tocando **Mostrar todo** en la seccion Transferencias recientes.

Filtros disponibles:
- **Cuenta** — filtrar por una cuenta de origen o destino especifica
- **Periodo** — elige entre: **Todo el tiempo**, **Este mes**, **Ultimos 3 meses** o **Este ano**

### Editar una transferencia

Abre una transferencia desde **Transferencias recientes** o desde el historial y toca **Editar**. Puedes cambiar:
- Ambas cuentas — origen y destino
- Los importes y la tasa de cambio
- La fecha
- Las notas y la opcion **Contar como ingreso**

Al cambiar una cuenta, ese lado de la transferencia pasa tambien a la moneda de esa cuenta. Si **Contar como ingreso** esta activo, el registro de ingreso correspondiente se mueve tambien a la nueva cuenta destino.

Puedes mover cualquiera de los dos lados a otra cuenta a la que pertenezcas, incluso si eso deja fuera de la transferencia la cuenta en la que estás trabajando. Así es como se corrige una transferencia que fue a la cuenta equivocada: pasa a aparecer en el historial de las dos cuentas a las que ahora pertenece y desaparece de la que ya no le corresponde.

Registrar, editar y eliminar transferencias funciona sin conexión: el cambio se queda en tu dispositivo y se envía la próxima vez que abras la pantalla de Cartera con conexión. Si el servidor rechaza un cambio —por ejemplo, porque ya no tienes acceso a una de las cuentas elegidas—, la aplicación te lo dice y la transferencia queda tal como estaba.

En una cuenta compartida, todos los miembros ven las transferencias que la afectan, sin importar quién las registró; el saldo de la cuenta ya las contaba de todos modos. Cualquier miembro que hubiera podido hacer la transferencia —es decir, que pertenece a las dos cuentas y no es observador en la cuenta que paga— también puede corregirla o eliminarla.

## Cambio de divisa

![Pantalla de Cambio de divisa](../img/exchange.jpg)

Cambia dinero entre tus billeteras de diferentes monedas:

### Paso a paso

1. Toca **Cambio** desde las acciones rapidas del Panel, o ve a **Ajustes** > **Billetera**
2. Selecciona la moneda de **Origen** (por ejemplo, USD) — toca una ficha de moneda para seleccionar
3. Selecciona la moneda de **Destino** (por ejemplo, EUR) — toca una ficha de moneda para seleccionar
4. Introduce el importe en el campo "Origen" o "Destino" — el otro se calcula automaticamente
5. La **Tasa de cambio** se obtiene automaticamente (por ejemplo, "1 USD = 0,8407 EUR")
6. Puedes tocar el boton de **intercambiar** (flechas centrales) para invertir las monedas
7. Opcionalmente edita la tasa de cambio manualmente si obtuviste una tasa diferente
8. Agrega **Notas** opcionales (por ejemplo, "Cambio en aeropuerto" o "Transferencia bancaria")
9. Toca **Cambio** para completar

### Funciones

- **Tasas de cambio en tiempo real** — obtenidas y mostradas automaticamente
- **Boton de intercambiar** — invierte rapidamente las monedas de Origen y Destino
- **Modificacion manual de tasa** — edita la tasa si tu tasa real es diferente
- **Campo de notas** — agrega contexto al cambio
- **Cambios recientes** — consulta tu historial de cambios

### Alertas de tipo de cambio

No hace falta que vigiles el tipo de cambio tú mismo. En la pantalla de Cambio, la tarjeta **Alertas de tipo de cambio** fija un objetivo para el par que tengas seleccionado y te avisa cuando el tipo real lo alcanza.

1. Selecciona las divisas **De** y **A** que te interesan
2. Toca el **+** de la tarjeta **Alertas de tipo de cambio**
3. Escribe tu objetivo — el campo dice `1 <De> = ___ <A>`
4. Elige **por encima de** o **por debajo de**. La aplicación preselecciona la opción que encaja con el número que escribiste (por encima si tu objetivo es mayor que el tipo actual, por debajo si es menor); toca el otro chip para cambiarla
5. Toca **Añadir alerta**

El tipo se comprueba en nuestros servidores una vez por hora, así que funciona con la aplicación cerrada. Cuando se alcanza tu objetivo recibes una notificación —*«1 EUR son ahora 4,3512 PLN. Toca para cambiar.»*— y al tocarla se abre la pantalla de Cambio con ese par ya seleccionado.

Cada alerta se dispara **una sola vez** y luego se detiene, para que un tipo que ronda tu objetivo no te avise una y otra vez. Añade una alerta nueva si quieres seguir vigilando ese par.

La tarjeta muestra las alertas del par seleccionado, así que al cambiar de divisas cambia la lista. Para verlas todas, toca **Ver todo** en ella o **Alertas de tipo de cambio** en la pantalla de Cartera.

Esa pantalla es donde viven todas tus alertas: las que siguen esperando y las que ya se activaron, con el tipo de cambio y la fecha en que lo hicieron. Como una alerta se activa una sola vez, ese historial es el único registro en la aplicación de que ocurrió: la notificación se puede descartar. Desde ahí puedes crear una alerta para cualquier par sin tocar el formulario de cambio, borrar cualquiera con el icono de la papelera y mantener hasta **20** en espera.

Las alertas son **personales**: te acompañan en todas tus cuentas, nadie más las ve y un observador puede crearlas igual que cualquiera. No hay un interruptor aparte en los ajustes de notificaciones: eliminar la alerta es la forma de apagarla.

### Cambios recientes

Debajo del formulario de cambio, encontraras los 5 cambios de divisa mas recientes con:
- Monedas intercambiadas (Origen a Destino)
- Importes
- Tasa de cambio utilizada
- Fecha
- Notas (si se agregaron)

Toca **Mostrar todo** para abrir el historial completo de cambios.

### Historial de cambios

La pantalla **Historial de cambios** muestra una lista completa de todos tus cambios de divisa. Accede tocando **Mostrar todo** en la seccion Cambios recientes.

Filtros disponibles:
- **Moneda** — filtrar por un par de monedas especifico
- **Periodo** — elige entre: **Todo el tiempo**, **Este mes**, **Ultimos 3 meses** o **Este ano**

### Editar o eliminar un cambio

Toca cualquier cambio en el historial para abrir su pantalla de detalles. Desde alli puedes:
- Tocar el icono de **lapiz** para editar los importes, la tasa o las notas — luego **Guardar**
- Tocar el icono de **papelera** para eliminar el cambio (aparece una confirmacion)

Los saldos de la billetera se recalculan automaticamente tras editar o eliminar.

## Monedas compatibles

| Codigo | Moneda |
|---|---|
| USD | Dolar estadounidense |
| EUR | Euro |
| PLN | Zloty polaco |
| GBP | Libra esterlina |
| UAH | Grivna ucraniana |
| RUB | Rublo ruso |
| BYN | Rublo bielorruso |

## Preguntas frecuentes

- **P: De donde provienen las tasas de cambio?**
  **R:** Las tasas de cambio se obtienen de un servicio en linea y se actualizan regularmente. Representan tasas de mercado aproximadas.

- **P: Puedo cambiar divisas si no tengo suficiente saldo?**
  **R:** La aplicacion te advertira sobre saldo insuficiente, pero aun puedes registrar el cambio para mantener tus registros precisos.

- **P: Un cambio de divisa cuenta como un gasto?**
  **R:** No. Los cambios de divisa son independientes de los gastos — mueven dinero entre billeteras de diferentes monedas sin afectar los totales de tus gastos.

- **P: Cual es la diferencia entre una transferencia y un cambio de divisa?**
  **R:** Un **cambio de divisa** convierte dinero de una moneda a otra dentro de la misma cuenta (por ejemplo, de USD a EUR). Una **transferencia** mueve dinero entre diferentes cuentas (por ejemplo, de tu cuenta de Negocio a tu cuenta Personal), pudiendo ser en la misma moneda o en monedas distintas.

- **P: Una transferencia afecta el saldo de mi billetera?**
  **R:** Si. La cuenta origen vera una **Transferencia saliente** que reduce su saldo, y la cuenta destino vera una **Transferencia entrante** que aumenta su saldo. El saldo total entre ambas cuentas se mantiene igual (salvo diferencias por tasa de cambio si las monedas difieren).

---

*Ver tambien: [Panel](./02-dashboard.md) | [Ajustes](./11-settings.md)*
