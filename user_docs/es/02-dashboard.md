# Panel

> Tu centro de control financiero. Consulta el estado de tu presupuesto, ingresos, gastos y saldos de billetera de un vistazo, con acciones rapidas para agregar gastos en un solo toque.

## Vista general

El Panel es la primera pantalla que ves despues de iniciar sesion. Muestra un saludo personalizado, el contexto de tu cuenta actual y las metricas financieras clave del mes en curso.

![Panel con acciones rapidas y resumen de presupuesto](../img/home-1.jpg)

## Cambiar cuenta

En la esquina superior izquierda, toca el nombre de la cuenta (por ejemplo, **Familia**) para abrir el menu desplegable **Cambiar cuenta**. Puedes alternar entre tus cuentas Personal, Compartida y Empresa. Todos los datos del Panel se actualizan para reflejar la cuenta seleccionada.

## Acciones rapidas

Cuatro botones de accion rapida debajo del saludo te dan acceso inmediato a las tareas mas comunes:

| Boton | Accion |
|---|---|
| **Agregar gasto** | Abre el formulario de gasto manual |
| **Entrada de voz** | Abre la pantalla de gasto por voz — describe tu gasto de forma natural |
| **Escanear recibo** | Abre la camara para fotografiar un recibo para extraccion con IA |
| **Cambio** | Abre el formulario de cambio de divisa |

## Widget de Gamificacion

Debajo de las acciones rapidas, una tarjeta compacta muestra tu progreso de gamificacion:

- **Nivel** — tu nivel actual con una barra de progreso de XP hacia el siguiente nivel
- **Racha** — tu conteo de racha de seguimiento diario con un icono de fuego o copo de nieve

Toca esta tarjeta para abrir la pantalla completa de **Logros** con todas las insignias, detalles de racha y filtros por categoria.

> Consulta [Logros y Gamificacion](./13-gamification.md) para mas detalles sobre como funcionan los XP, niveles y logros.

## Tarjeta de presupuesto mensual

- Muestra tu gasto actual comparado con tu presupuesto mensual (por ejemplo, **2 846,83 zl de 20 000,00 zl**)
- Barra de progreso con codigo de colores: verde (bajo control), amarillo (acercandose al limite), rojo/naranja (cerca o por encima del presupuesto)
- Muestra el **porcentaje utilizado** (por ejemplo, 86% utilizado)
- Toca la tarjeta para ir a la pestana **Presupuestos** y ver los detalles

> **Nota:** Si no tienes un presupuesto mensual configurado, veras una sugerencia para crear uno.

## Ingresos totales de este mes

![Panel desplazado — ingresos, gastos, billetera](../img/home-2.jpg)

- Muestra tus ingresos totales del mes actual en verde (por ejemplo, **+$2,482.52**)
- Toca para ir a la pestana **Transacciones** (vista de Ingresos)

## Gastos totales de este mes

- Muestra tus gastos totales del mes actual en rojo (por ejemplo, **-$4,838.99**)
- Toca para ir a la pestana **Transacciones** (vista de Gastos)

## Beneficio neto

Debajo de las tarjetas de ingresos y gastos, el widget de **Beneficio neto** muestra cuanto dinero has ahorrado o perdido realmente este mes y rastrea la tendencia de los ultimos 6 meses como un grafico de lineas:

- **Beneficio neto del mes actual** — se muestra encima del grafico en verde (positivo) o rojo (negativo)
- **Tendencia de 6 meses** — grafico de lineas con el beneficio neto mensual (ingresos − gastos) de los ultimos 6 meses
- Toca un punto de datos para ver el valor exacto de ese mes

> **Formula:** Beneficio neto = Ingresos totales − Gastos totales (ambos convertidos a tu moneda base)

## Capital neto

El widget de **Capital neto** muestra tu patrimonio total en todas las billeteras de divisas, convertido a tu moneda base:

- **Capital neto total** — suma de todos los saldos de la billetera convertidos a la moneda de configuracion, en verde (positivo) o rojo (negativo)
- **Desglose por moneda** — el saldo actual de cada moneda aparece listado debajo del total

> **Nota:** El widget de Capital neto solo aparece despues de establecer tus saldos iniciales de billetera. Consulta [Billetera y Cambio](./10-wallet-and-exchange.md) para configurarlos.

## Tarjeta Fat Finder

Debajo de la seccion de deudas, la tarjeta del **Fat Finder** muestra un resumen de tu auditoria mensual de gastos:

- **Ahorro potencial total** — cuanto podrias ahorrar al mes
- **3 hallazgos principales** — lista rapida con puntos de severidad y montos de ahorro
- **Ver informe completo** — toca para abrir la pantalla detallada del Fat Finder

Esta tarjeta requiere una **suscripcion Pro o Business**. Los usuarios del plan gratuito ven una invitacion a mejorar su plan.

> Consulta [Fat Finder](./19-fat-finder.md) para la guia completa de la funcion.

## Saldos de la billetera

- Tarjetas con desplazamiento horizontal mostrando tu saldo en cada moneda (por ejemplo, **EUR 16,723.00**, **PLN 2 192,89**, **USD $56...**)
- Toca **Ver todo** para ir a la vista completa de la Billetera con desgloses detallados
- Si no hay saldos configurados, veras una indicacion para agregar tu saldo inicial

## Deslizar para actualizar

Desliza hacia abajo en cualquier parte del Panel para actualizar todos los datos y sincronizar con el servidor.

## Preguntas frecuentes

- **P: Por que el Panel muestra $0 en todo?**
  **R:** Aun no has agregado ningun gasto o ingreso. Usa los botones de accion rapida para agregar tu primera transaccion.

- **P: Puedo personalizar lo que aparece en el Panel?**
  **R:** El diseno del Panel es fijo, pero se adapta a tus datos: los saldos de la billetera solo aparecen despues de configurarlos, y las tarjetas de presupuesto solo aparecen con presupuestos activos.

---

*Ver tambien: [Gastos e Ingresos](./03-expenses-and-income.md) | [Billetera y Cambio](./10-wallet-and-exchange.md) | [Fat Finder](./19-fat-finder.md) | [Analiticas](./06-analytics.md)*
