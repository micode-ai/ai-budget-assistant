# Presupuestos

> Establece limites de gasto y realiza un seguimiento de tu progreso en tiempo real. Crea presupuestos para categorias especificas o para el gasto general, con periodos personalizables y umbrales de alerta automaticos.

## Vista general

Los presupuestos te ayudan a controlar tus gastos estableciendo limites para periodos de tiempo especificos. La aplicacion rastrea tus gastos en comparacion con estos limites y te notifica cuando te acercas o excedes tu presupuesto.

## Lista de presupuestos

La pestana **Presupuestos** muestra todos tus presupuestos activos:

- **Nombre del presupuesto** y periodo (Diario, Semanal, Mensual, Anual, Personalizado)
- **Barra de progreso** -- indicador visual de gasto vs. limite
- **Importe gastado** del presupuesto total (por ejemplo, "2 846 zl de 20 000 zl")
- **Insignia de estado**:
  - **En camino** (verde) -- el gasto esta dentro del limite
  - **Presupuesto excedido** (rojo) -- el gasto ha superado el limite
- Importe **restante** o excedente

> **Nota:** Si aun no tienes presupuestos, veras un mensaje: "Crea un presupuesto para comenzar a rastrear tus limites de gasto."

## Crear un presupuesto

### Paso a paso

1. Toca **Crear presupuesto** en la pestana Presupuestos (o el boton **+**)
2. Introduce un **Nombre del presupuesto** (por ejemplo, "Supermercado mensual")
3. Introduce el **Importe** -- tu limite de gasto
4. Selecciona la **Moneda**
5. Elige un **Periodo**:
   - **Diario** -- se reinicia cada dia
   - **Semanal** -- se reinicia cada semana
   - **Mensual** -- se reinicia cada mes
   - **Anual** -- se reinicia cada ano
   - **Personalizado** -- establece tu propio rango de fechas
6. Opcionalmente selecciona una **Categoria** -- para rastrear el gasto en una categoria especifica (por ejemplo, "Comida y Restaurantes"). Dejala vacia para un presupuesto general que rastree todos los gastos
7. Establece el umbral de **Alerta en** (por defecto: 80%) -- recibiras una notificacion cuando el gasto alcance este porcentaje
8. Toca **Crear presupuesto**

## Detalles del presupuesto

Toca cualquier presupuesto para ver sus detalles completos:

- **Visualizacion de progreso** -- barra que muestra lo gastado vs. el limite
- **Estado** -- En camino o Presupuesto excedido
- **Periodo** -- el rango de tiempo del presupuesto
- **Categoria** -- la categoria rastreada (o "Todas" para presupuestos generales)
- **Umbral de alerta** -- el punto de activacion de la notificacion (por ejemplo, 80%)
- **Dias restantes** -- cuantos dias quedan en el periodo actual
- **Total proyectado** -- gasto total estimado para el final del periodo basado en el ritmo actual
- **Activo/Inactivo** -- activa o desactiva el presupuesto

### Acciones:
- **Editar** -- modificar el nombre, importe o configuracion del presupuesto
- **Eliminar** -- eliminar el presupuesto (con confirmacion)

## Alertas de presupuesto

La aplicacion monitoriza automaticamente tus presupuestos y envia notificaciones:

- **Alerta de umbral** -- cuando el gasto alcanza el porcentaje de alerta establecido (por ejemplo, 80%)
- **Alerta de presupuesto excedido** -- cuando el gasto supera el 100%
- El color de la barra de progreso cambia dinamicamente:
  - Verde -- menos del 70% utilizado
  - Amarillo/Naranja -- 70-90% utilizado
  - Rojo -- mas del 90% utilizado

> **Consejo:** La tarjeta de Presupuesto mensual en el Panel muestra el estado de tu presupuesto principal de un vistazo.

## Preguntas frecuentes

- **P: Puedo tener multiples presupuestos al mismo tiempo?**
  **R:** Si. Puedes crear tantos presupuestos como necesites -- para diferentes categorias, periodos o gasto general.

- **P: Que sucede cuando termina el periodo de un presupuesto?**
  **R:** El presupuesto se reinicia automaticamente para el nuevo periodo. Los datos de gasto anteriores se conservan en Analisis.

- **P: El presupuesto rastrea gastos en todas las monedas?**
  **R:** Cada presupuesto esta vinculado a una moneda. Solo los gastos en esa moneda cuentan para el presupuesto.

---

*Ver tambien: [Panel](./02-dashboard.md) | [Analisis](./06-analytics.md)*
