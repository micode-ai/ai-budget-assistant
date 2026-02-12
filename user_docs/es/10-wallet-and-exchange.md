# Billetera y Cambio de divisa

> Rastrea saldos en multiples monedas y realiza cambios entre ellas con tasas de cambio en tiempo real. La billetera se actualiza automaticamente a medida que agregas gastos e ingresos.

## Vista general

La funcion de Billetera te permite rastrear tus saldos reales en cada moneda compatible. A medida que agregas gastos e ingresos, la billetera se actualiza automaticamente para reflejar tu posicion financiera actual.

## Saldos de la billetera

Accede a la Billetera desde:
- **Panel** -- toca **Ver todo** junto a la seccion de Saldos de la billetera
- **Ajustes** -- ve a Billetera > **Saldos**

Para cada moneda, veras:

| Campo | Descripcion |
|---|---|
| **Saldo actual** | Tu saldo en tiempo real en esta moneda |
| **Saldo inicial** | El saldo inicial que estableciste |
| **Total gastado** | Suma de todos los gastos en esta moneda |
| **Cambio entrante** | Importe recibido de cambios de divisa |
| **Cambio saliente** | Importe gastado en cambios de divisa |

La formula: **Saldo actual = Saldo inicial - Total gastado + Total ingresos + Cambio entrante - Cambio saliente**

## Establecer saldo inicial

Establece tu saldo inicial para cada moneda:

1. Ve a **Ajustes** > **Billetera** > **Establecer saldo**
2. Selecciona la **Moneda** (USD, EUR, PLN, GBP, UAH o RUB)
3. Introduce el **Importe** -- tu saldo real actual en esa moneda
4. Toca **Guardar**

Veras una confirmacion: "Saldo establecido correctamente."

> **Consejo:** Establece tus saldos iniciales cuando comiences a usar la aplicacion, para que la billetera refleje tus finanzas con precision desde el primer dia.

## Cambio de divisa

![Pantalla de Cambio de divisa](../img/exchange.jpg)

Cambia dinero entre tus billeteras de diferentes monedas:

### Paso a paso

1. Toca **Cambio** desde las acciones rapidas del Panel, o ve a **Ajustes** > **Billetera**
2. Selecciona la moneda de **Origen** (por ejemplo, USD) -- toca una ficha de moneda para seleccionar
3. Selecciona la moneda de **Destino** (por ejemplo, EUR) -- toca una ficha de moneda para seleccionar
4. Introduce el importe en el campo "Origen" o "Destino" -- el otro se calcula automaticamente
5. La **Tasa de cambio** se obtiene automaticamente (por ejemplo, "1 USD = 0,8407 EUR")
6. Puedes tocar el boton de **intercambiar** (flechas centrales) para invertir las monedas
7. Opcionalmente edita la tasa de cambio manualmente si obtuviste una tasa diferente
8. Agrega **Notas** opcionales (por ejemplo, "Cambio en aeropuerto" o "Transferencia bancaria")
9. Toca **Cambio** para completar

### Funciones

- **Tasas de cambio en tiempo real** -- obtenidas y mostradas automaticamente
- **Boton de intercambiar** -- invierte rapidamente las monedas de Origen y Destino
- **Modificacion manual de tasa** -- edita la tasa si tu tasa real es diferente
- **Campo de notas** -- agrega contexto al cambio
- **Cambios recientes** -- consulta tu historial de cambios

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

## Preguntas frecuentes

- **P: De donde provienen las tasas de cambio?**
  **R:** Las tasas de cambio se obtienen de un servicio en linea y se actualizan regularmente. Representan tasas de mercado aproximadas.

- **P: Puedo cambiar divisas si no tengo suficiente saldo?**
  **R:** La aplicacion te advertira sobre saldo insuficiente, pero aun puedes registrar el cambio para mantener tus registros precisos.

- **P: Un cambio de divisa cuenta como un gasto?**
  **R:** No. Los cambios de divisa son independientes de los gastos -- mueven dinero entre billeteras de diferentes monedas sin afectar los totales de tus gastos.

---

*Ver tambien: [Panel](./02-dashboard.md) | [Ajustes](./11-settings.md)*
