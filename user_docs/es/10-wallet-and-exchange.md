# Billetera y Cambio de divisa

> Rastrea saldos en multiples monedas y realiza cambios entre ellas con tasas de cambio en tiempo real. La billetera se actualiza automaticamente a medida que agregas gastos e ingresos.

## Vista general

La funcion de Billetera te permite rastrear tus saldos reales en cada moneda compatible. A medida que agregas gastos e ingresos, la billetera se actualiza automaticamente para reflejar tu posicion financiera actual.

## Saldos de la billetera

Accede a la Billetera desde:
- **Panel** — toca **Ver todo** junto a la seccion de Saldos de la billetera
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

## Transferencias entre cuentas

Transfiere dinero entre tus diferentes cuentas (por ejemplo, de Negocio a Personal):

1. Ve a **Billetera** > **Transferencia**
2. Selecciona la **Cuenta origen** — la cuenta desde la que envias el dinero
3. Selecciona la **Cuenta destino** — la cuenta que recibira el dinero
4. Selecciona la **Moneda**
5. Introduce el **Importe**
6. Si las monedas de las cuentas difieren, ajusta la **Tasa de cambio** (se obtiene automaticamente)
7. Opcionalmente agrega **Notas** (por ejemplo, "Reembolso de gastos" o "Ahorro mensual")
8. Toca **Transferir** para completar

### Transferencias recientes

Debajo del formulario de transferencia, encontraras una lista de tus transferencias recientes con:
- Cuenta origen y cuenta destino
- Moneda e importe transferido
- Tasa de cambio utilizada (si las monedas difieren)
- Fecha
- Notas (si se agregaron)

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

### Cambios recientes

Debajo del formulario de cambio, encontraras una lista de tus cambios de divisa recientes con:
- Monedas intercambiadas (Origen a Destino)
- Importes
- Tasa de cambio utilizada
- Fecha
- Notas (si se agregaron)

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
