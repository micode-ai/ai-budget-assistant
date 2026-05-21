# Presupuestos

> Establece límites de gasto y realiza un seguimiento de tu progreso en tiempo real. Crea presupuestos para categorías específicas o distribuye tu presupuesto entre varias categorías, con períodos personalizables y umbrales de alerta automáticos.

## Vista general

Los presupuestos te ayudan a controlar tus gastos estableciendo límites para períodos de tiempo específicos. La aplicación rastrea tus gastos en comparación con estos límites y te notifica cuando te acercas o excedes tu presupuesto.

## Lista de presupuestos

La pestaña **Presupuestos** muestra todos tus presupuestos activos:

- **Nombre del presupuesto** y período (Diario, Semanal, Mensual, Anual, Personalizado)
- **Barra de progreso** — indicador visual de gasto vs. límite
- **Importe gastado** del presupuesto total (por ejemplo, "2 846 zl de 20 000 zl")
- **Insignia de estado**:
  - **En camino** (verde) — el gasto está dentro del límite
  - **Presupuesto excedido** (rojo) — el gasto ha superado el límite
- Importe **restante** o excedente

> **Nota:** Si aún no tienes presupuestos, verás un mensaje: "Crea un presupuesto para comenzar a rastrear tus límites de gasto."

## Crear un presupuesto

### Paso a paso

1. Toca **Crear presupuesto** en la pestaña Presupuestos (o el botón **+**)
2. Introduce un **Nombre del presupuesto** (por ejemplo, "Supermercado mensual")
3. Selecciona la **Moneda**
4. Elige un **Modo de presupuesto**:
   - **General** — un importe total único, opcionalmente vinculado a una categoría
   - **Por categorías** — distribuye el presupuesto entre varias categorías, cada una con su propio límite
5. Introduce el **Importe** (modo General) o añade categorías con importes (modo Por categorías)
6. Elige un **Período**:
   - **Diario** — se reinicia cada día
   - **Semanal** — se reinicia cada semana
   - **Mensual** — se reinicia cada mes
   - **Anual** — se reinicia cada año
7. Establece el umbral de **Alerta en** (por defecto: 80%) — recibirás una notificación cuando el gasto alcance este porcentaje
8. Toca **Crear presupuesto**

### Modo «Por categorías»

En el modo **Por categorías** puedes asignar un límite de gasto a cada categoría:

- Toca **Añadir categoría** para seleccionar una categoría de la lista
- Introduce el importe para cada categoría
- El presupuesto total es igual a la suma de todos los importes por categoría
- Puedes añadir tantas categorías como necesites

## Detalles del presupuesto

Toca cualquier presupuesto para ver sus detalles completos:

- **Visualización de progreso** — barra que muestra lo gastado vs. el límite
- **Estado** — En camino o Presupuesto excedido
- **Desglose por categorías** — para presupuestos con varias categorías, verás el progreso de cada una:
  - Punto de color + nombre de categoría
  - Gastado / asignado
  - Barra de progreso por categoría (verde/amarillo/rojo)
- **Período** — el rango de tiempo del presupuesto
- **Umbral de alerta** — el punto de activación de la notificación (por ejemplo, 80%)
- **Días restantes** — cuántos días quedan en el período actual
- **Total proyectado** — gasto total estimado para el final del período
- **Activo/Inactivo** — estado actual del presupuesto

### Acciones:
- **Editar** (icono de lápiz) — modificar el nombre, importe, categorías, período o umbral de alerta
- **Eliminar** — eliminar el presupuesto (con confirmación)

## Historial de gastos

La tarjeta **Historial** muestra cómo has cumplido tu presupuesto durante los últimos 6 períodos. Disponible para todos los tipos de período excepto Personalizado.

- **Gráfico de barras** — cada grupo muestra dos barras: tus gastos reales (de color) y el límite del presupuesto (gris) para ese período.
  - Barra verde — gastos dentro del límite
  - Barra roja — límite superado
- **Resumen de cumplimiento** — p. ej., «Excedido 3 de 6 períodos» o «Ahorro prom.: 42 $»
- **Exceso promedio** — si superaste el límite en algunos períodos, muestra el importe promedio excedido

> **Consejo:** Usa la tarjeta de historial para detectar patrones de gasto excesivo recurrentes. Si ves 3–4 barras rojas seguidas, considera aumentar el límite o ajustar tus hábitos en esa categoría.

## Editar un presupuesto

Toca el **icono de lápiz** en la pantalla de detalles del presupuesto para cambiar al modo de edición:

- Cambiar el nombre del presupuesto, moneda, período o umbral de alerta
- Cambiar entre los modos **General** y **Por categorías**
- En modo Por categorías: añadir, eliminar o cambiar importes de categorías
- Toca **Guardar** para aplicar los cambios, o **Cancelar** para descartarlos

## Alertas de presupuesto

La aplicación monitoriza automáticamente tus presupuestos y envía notificaciones:

- **Alerta de umbral** — cuando el gasto alcanza el porcentaje de alerta establecido (por ejemplo, 80%)
- **Alerta de presupuesto excedido** — cuando el gasto supera el 100%
- El color de la barra de progreso cambia dinámicamente:
  - Verde — menos del 80% utilizado
  - Amarillo/Naranja — 80–100% utilizado
  - Rojo — más del 100% utilizado

> **Consejo:** La tarjeta de Presupuesto mensual en el Panel muestra el estado de tu presupuesto principal de un vistazo.

## Preguntas frecuentes

- **P: ¿Puedo tener múltiples presupuestos al mismo tiempo?**
  **R:** Sí. Puedes crear tantos presupuestos como necesites — para diferentes categorías, períodos o gasto general.

- **P: ¿Cuál es la diferencia entre los modos General y Por categorías?**
  **R:** General establece un límite total único (opcionalmente para una categoría). Por categorías permite establecer límites individuales para cada categoría — útil cuando quieres rastrear alimentación, transporte y ocio por separado dentro de un mismo presupuesto.

- **P: ¿Qué sucede cuando termina el período de un presupuesto?**
  **R:** El presupuesto se reinicia automáticamente para el nuevo período. Los datos de gasto anteriores se conservan en Análisis.

- **P: ¿El presupuesto rastrea gastos en todas las monedas?**
  **R:** Cada presupuesto está vinculado a una moneda. Solo los gastos en esa moneda cuentan para el presupuesto.

---

*Ver también: [Panel](./02-dashboard.md) | [Análisis](./06-analytics.md)*
