# Panel

> Tu centro de control financiero. Consulta el estado de tu presupuesto, ingresos, gastos y saldos de billetera de un vistazo, con acciones rapidas para agregar gastos en un solo toque. Puedes mostrar u ocultar secciones individuales desde [Ajustes](./11-settings.md) → Widgets del panel.

## Vista general

El Panel es la primera pantalla que ves despues de iniciar sesion. Muestra un saludo personalizado, el contexto de tu cuenta actual y las metricas financieras clave del mes en curso.

![Panel con acciones rapidas y resumen de presupuesto](../img/home-1.jpg)

## Cambiar cuenta

En la esquina superior izquierda, toca el nombre de la cuenta (por ejemplo, **Familia**) para abrir el menu desplegable **Cambiar cuenta**. Puedes alternar entre tus cuentas Personal, Compartida y Empresa. Todos los datos del Panel se actualizan para reflejar la cuenta seleccionada.

## Acciones rapidas

La barra de acciones rápidas debajo del saludo es una fila horizontal y desplazable de atajos de un solo toque a las tareas más comunes. Desliza hacia la izquierda para ver más.

Acciones disponibles:

| Accion | Descripción |
|---|---|
| **Agregar gasto** | Abre el formulario de gasto manual |
| **Escanear recibo** | Abre la cámara para fotografiar un recibo para extracción con IA |
| **Entrada de voz** | Describe tu gasto de forma natural por voz |
| **Ingreso por voz** | Describe tu ingreso de forma natural por voz (oculto por defecto) |
| **Escanear factura** | Fotografía una factura para registrar un ingreso (oculto por defecto) |
| **Cambio** | Abre el formulario de cambio de divisa |
| **Conversor** | Abre el conversor de divisas |
| **Transferencias** | Abre el formulario de transferencia entre billeteras |

Puedes personalizar esta barra: ve a **Ajustes → Widgets del panel**, abre la sección **Acciones rápidas**, activa o desactiva cualquier acción, y arrastra los controles para reordenarlas. **Ingreso por voz** y **Escanear factura** están ocultos por defecto — actívalos allí si registras ingresos por voz o escaneando facturas.

## Salud Financiera

El widget **Salud Financiera** muestra una puntuación única de 0–100 que resume tu salud financiera general del mes actual:

- **Verde (70–100)** — las finanzas están en excelente estado
- **Amarillo (40–69)** — algunas áreas necesitan atención
- **Rojo (0–39)** — se detectaron problemas significativos

El indicador circular en la parte superior derecha de la tarjeta se llena proporcionalmente a tu puntuación. Toca la tarjeta para abrir un desglose con cuatro componentes:

| Componente | Pts máx | Descripción |
|---|---|---|
| Cumplimiento del presupuesto | 25 | % de presupuestos activos sin superar el límite |
| Tasa de ahorro | 25 | Mapea tu % de ahorro mensual linealmente (0% → 0 pts, 20%+ → 25 pts) |
| Progreso de metas | 25 | % de metas de ahorro activas en camino hacia su fecha límite |
| Salud de deudas | 25 | Deducción proporcional por deudas vencidas |

> **«Datos insuficientes»** aparece cuando menos de dos componentes tienen datos (p. ej., una cuenta nueva sin presupuestos, metas, deudas ni ingresos todavía).

La puntuación se calcula completamente en el dispositivo, sin necesidad de conexión a internet ni llamadas a IA.

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

## Ingresos y gastos

![Panel desplazado — ingresos, gastos, billetera](../img/home-2.jpg)

Una tarjeta combinada con tus totales mensuales lado a lado:

- **Ingresos** (izquierda, verde) — tus ingresos totales del mes actual (por ejemplo, **+$2,482.52**). Toca para ir a la pestana **Transacciones** (vista de Ingresos)
- **Gastos** (derecha) — tus gastos totales del mes actual (por ejemplo, **-$4,838.99**). Toca para ir a la pestana **Transacciones** (vista de Gastos)

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

## Calendario

El widget **Calendario** muestra una cuadrícula mensual con puntos de colores que indican los días con transacciones:

- **Punto verde** — se registró un ingreso ese día
- **Punto rojo** — se registró un gasto ese día
- **Hoy** se destaca con un círculo naranja
- **Navegación por meses** — flechas izquierda/derecha para cambiar entre meses

Debajo de la cuadrícula del calendario se muestra un resumen:

- **Ingresos** — ingresos totales del mes seleccionado (convertidos a la moneda base)
- **Gastos** — gastos totales del mes seleccionado
- **Beneficio neto** — ingresos menos gastos, verde si es positivo, rojo si es negativo

Toca **Toca para ver detalles** para abrir la pantalla completa del Calendario con tres pestañas:

| Pestaña | Contenido |
|---|---|
| **Categorías** | Desglose de ingresos y gastos por categorías — cada fila muestra el icono de la categoría, nombre, porcentaje y monto. Beneficio neto al final |
| **Cuentas** | Saldo actual de cada billetera de moneda con porcentaje del total |
| **Transacciones** | Lista cronológica de todas las transacciones del mes. Toca un día en el calendario para filtrar por ese día específico; toca de nuevo para quitar el filtro |

> **Consejo:** Todos los montos en el Calendario se convierten automáticamente a tu moneda base, para que veas totales precisos incluso con múltiples monedas.

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
  **R:** Si. Ve a **Ajustes → Widgets del panel** y activa o desactiva las secciones que quieras. Tus preferencias se guardan y persisten entre reinicios. También puedes arrastrar widgets para reordenarlos. La barra de acciones rápidas se personaliza de la misma manera — abre la sección **Acciones rápidas** en Ajustes → Widgets del panel para mostrar, ocultar o reordenar sus botones.

---

*Ver tambien: [Gastos e Ingresos](./03-expenses-and-income.md) | [Billetera y Cambio](./10-wallet-and-exchange.md) | [Fat Finder](./19-fat-finder.md) | [Analiticas](./06-analytics.md)*
