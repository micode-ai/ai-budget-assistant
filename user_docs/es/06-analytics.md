# Analisis

> Visualiza tus patrones de gasto con graficos interactivos. Filtra por periodo de tiempo y moneda, profundiza en los detalles y obtiene informacion basada en IA para entender mejor tus finanzas.

## Vista general

La pestana **Analisis** ofrece una vista completa de tus gastos a traves de graficos, informacion e exploracion de datos. Todos los datos se basan en tus gastos en la cuenta seleccionada.

## Rango de tiempo y filtros

En la parte superior de la pantalla de Analisis:

- **Selector de rango de tiempo**: **Semana** | **Mes** | **Ano**
- **Filtro de moneda**: **Todas** las monedas, o selecciona una especifica (USD, EUR, PLN, etc.)

El rango seleccionado afecta a todos los graficos e informacion que aparecen debajo.

## Tarjetas de resumen

- **Total gastado** — tus gastos totales para el periodo seleccionado
  - **vs. periodo anterior** — "mas/menos que la semana/mes/ano pasado" con porcentaje
  - **vs. promedio de 3 meses** — p.ej. "18% sobre el promedio de 3 meses" (verde = por debajo, rojo = por encima), aparece tras al menos 1 mes completo anterior
- **Promedio por dia** — gasto diario promedio

## Carrusel de informacion IA

Un carrusel horizontal desplazable con informacion generada por IA (requiere plan Pro):

- **Anomalias de gasto** — gasto inusual detectado (por ejemplo, "78% mas de lo habitual en Transporte")
- **Predicciones de presupuesto** — cuando se proyecta que se agotara tu presupuesto
- **Oportunidades de ahorro** — sugerencias para reducir gastos
- **Comparaciones de categorias** — como se compara tu gasto entre categorias
- **Cambios de tendencia** — cambios significativos en patrones de gasto

Cada tarjeta de informacion tiene un nivel de severidad: critico (rojo), advertencia (amarillo) o informativo (azul).

> **Nota:** Los usuarios del plan Gratuito ven un mensaje para mejorar: "Mejora a Pro para obtener informacion de IA."

## Graficos

### Ingresos por categoria (Grafico de dona)

- Muestra sus ingresos desglosados por categoria para el periodo seleccionado
- Solo aparece cuando hay entradas de ingresos con categorias (p. ej., Salario, Freelance, Dividendos, Alquiler)
- Codificado en colores en una paleta verde/turquesa para distinguirlo de los graficos de gastos
- Los ingresos sin categoria se agrupan como "Otros"
- Aparece encima del grafico de tendencia de gastos

### Tendencia de gastos (Grafico de barras)

- Muestra el gasto diario o mensual durante el periodo seleccionado
- Interactivo: toca cualquier barra para profundizar en ese segmento de tiempo

### Gastos por categoria (Grafico de dona)

- Desglose por categoria con porcentajes
- Codigo de colores por categoria
- Toca un segmento para explorar los gastos de esa categoria

### Presupuesto vs. Real (Grafico de barras agrupadas)

- Comparacion lado a lado de los limites del presupuesto vs. gasto real
- Muestra **En camino** o **Presupuesto excedido** por categoria
- Solo aparece si tienes presupuestos activos

### Gasto por dia de la semana (Grafico de dias)

- Analisis de patrones que muestra en que dias gastas mas
- Informacion: "Gastas mas los sabados"

### Por comerciantes

- Los principales comerciantes donde gastaste en el periodo seleccionado
- Muestra hasta 8 comerciantes individuales; el resto se agrupa como "Otros"
- Solo aparece cuando al menos un gasto tiene un comerciante asignado

### Por etiquetas / Por proyectos

- **Desglose por etiquetas** — gasto agrupado por tus etiquetas personalizadas
- **Comparacion por proyectos** — gasto agrupado por proyectos
- Ayuda a rastrear gasto tematico (por ejemplo, todos los gastos de #cafe o costos del proyecto "Vacaciones")

## Exploracion detallada

Toca cualquier elemento del grafico para profundizar:

1. Vista de **Ano** — toca una barra de mes para acercarte a ese mes
2. Vista de **Mes** — toca una semana para acercarte a esa semana
3. Vista de **Semana** — toca un dia para ver las transacciones diarias
4. Vista de **Dia** — consulta las transacciones individuales

Usa el boton **Atras** para navegar hacia arriba a traves de los niveles.

## Informacion rapida

Debajo de los graficos, encontraras informacion rapida en formato de texto:

- **Categoria principal** — tu categoria con mayor gasto en este periodo
- **Dia de mayor gasto** — el dia con mas gastos
- **Consejo de presupuesto diario** — gasto diario recomendado para mantenerte en el objetivo
- **Ahorros en recibos** — importe total ahorrado en descuentos

## Articulos principales de recibos

Una tabla que muestra los articulos de recibos que compras con mas frecuencia:
- Nombre del articulo
- Total gastado
- Numero de compras

## Exportar

Toca **Exportar informe** para acceder a la pantalla de Exportacion e informes, donde puedes generar informes PDF, Excel o CSV, ver resumenes mensuales y gestionar copias de seguridad de datos. Ver [Exportacion e informes](./16-export-reports.md) para mas detalles.

## Preguntas frecuentes

- **P: Por que no veo ningun grafico?**
  **R:** Los graficos aparecen cuando tienes datos de gastos. Agrega algunos gastos primero y luego consulta Analisis.

- **P: Como se genera la informacion de IA?**
  **R:** La informacion se genera analizando tus patrones de gasto, comparando con datos historicos e identificando anomalias. Esto requiere una suscripcion Pro o Business.

---

*Ver tambien: [Presupuestos](./05-budgets.md) | [Historia de gastos](./08-spending-story.md) | [Exportacion e informes](./16-export-reports.md)*
