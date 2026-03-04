# Simulador de escenarios

> Mueve los controles deslizantes para ajustar las categorías de gastos e ingresos — y ver al instante cómo cambiarían tus ahorros en 3, 6 o 12 meses.

## Descripción general

El **Simulador de escenarios** responde preguntas de tipo "¿qué pasaría si...?" sin modificar los datos reales. Reduce los gastos en alimentación un 20%, añade un ingreso adicional de 500 € — y observa al momento cuánto podrías ahorrar en 6 meses.

Todos los cálculos son locales. No se envían datos a ningún lugar y el historial de transacciones permanece sin cambios.

## Cómo acceder

Abre la pestaña **Análisis** y toca el banner del **Simulador de escenarios** en la parte superior de la pantalla.

## De dónde vienen los importes

El simulador utiliza las **últimas 3 meses** de transacciones y calcula un promedio mensual por categoría:

```
promedio mensual = total de la categoría en 3 meses ÷ 3
```

Todos los importes se convierten a tu moneda base utilizando los tipos de cambio actuales.

## Ajustar gastos

Cada categoría de gasto se muestra con su promedio mensual actual y un control deslizante de **−100%** a **+100%** en pasos de 5%.

- Arrastra a la **izquierda** (negativo) para modelar recortes de gastos — la barra se vuelve verde
- Arrastra a la **derecha** (positivo) para modelar aumentos de gastos — la barra se vuelve roja
- La etiqueta bajo el control muestra el importe resultante

## Ajustar ingresos

Las categorías de ingresos funcionan igual. Derecha = aumento, izquierda = reducción.

### Añadir ingresos adicionales

Toca **Añadir ingreso adicional** en la sección de ingresos para introducir una nueva fuente (p. ej., trabajo freelance). Introduce una descripción y un importe mensual. Puedes añadir varias entradas.

## Gráfico de proyección

El gráfico muestra los ahorros acumulados durante el horizonte seleccionado:

- **Línea gris** — camino actual (sin cambios)
- **Línea de color** — camino del escenario (con tus ajustes)

Usa los chips **3 / 6 / 12 meses** sobre el gráfico para cambiar el horizonte de proyección.

## Tarjetas de resumen

Tres tarjetas bajo el gráfico muestran los totales del escenario para 3, 6 y 12 meses. El horizonte actual está resaltado. Cada tarjeta muestra:

- Ahorros acumulados según el escenario
- Ahorros acumulados según el camino actual (para comparar)
- Diferencia

## Barra de resumen (parte superior)

La tarjeta en la parte superior de la pantalla se actualiza en tiempo real.

## Restablecer

Toca **Restablecer todo** en la parte inferior para devolver todos los controles e ingresos adicionales a cero.

## Preguntas frecuentes

- **P: ¿Los controles cambian mis datos reales?**
  **R:** No. El simulador solo lee el historial de transacciones para calcular promedios. Nada se guarda ni se cambia.

- **P: ¿Por qué los importes de las categorías parecen bajos?**
  **R:** Los importes son un promedio de 3 meses. Si un mes tuvo gastos inusualmente bajos, el promedio será menor.

- **P: Falta una categoría de ingresos.**
  **R:** Solo se muestran las categorías con al menos una transacción en los últimos 3 meses.

---

*Ver también: [Análisis](./06-analytics.md) | [Fat Finder](./19-fat-finder.md) | [Objetivos de ahorro](./18-savings-goals.md)*
