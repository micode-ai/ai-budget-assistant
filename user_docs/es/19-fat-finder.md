# Fat Finder (Auditoria de gastos)

> Una auditoria mensual impulsada por IA que analiza tus gastos, identifica desperdicios — suscripciones, gastos recurrentes innecesarios, servicios superfluos — y sugiere recortes concretos con ahorros estimados.

## Vista general

El **Fat Finder** analiza 3 meses de tu historial de transacciones, detecta patrones de gasto y genera un informe que destaca donde podrias ahorrar dinero. Cada hallazgo incluye montos especificos, niveles de severidad y sugerencias aplicables.

## Como acceder

- **Tarjeta del panel** — muestra los resultados guardados de Fat Finder. Toca para abrir el informe completo y generar un análisis nuevo.
- **Navegacion directa** — accede a la pantalla del Fat Finder desde la tarjeta del panel

## Requisitos

- Cada generacion de informe consume **3 solicitudes de IA** de tu cuota mensual
- Los informes se **almacenan en cache durante 30 dias** por periodo de analisis

## Resumen del informe

La parte superior del informe muestra:
- **Ahorro potencial mensual total** — la cantidad combinada que podrias ahorrar
- **Periodo de analisis** — el rango de fechas analizado
- **Numero de hallazgos** — cuantas oportunidades se identificaron

## Tipos de hallazgos

La IA identifica estas categorias de desperdicio en gastos:

| Tipo | Descripcion |
|---|---|
| **Suscripcion** | Cargos recurrentes con montos similares cada mes (streaming, gimnasio, herramientas SaaS) |
| **Gasto recurrente** | Gastos regulares no esenciales que se acumulan (comer fuera frecuentemente, cafes diarios) |
| **Gran gasto puntual** | Gastos individuales significativamente mayores que tu transaccion promedio |
| **Exceso por categoria** | Categorias donde el gasto crecio mas del 20% mes a mes |
| **Uso excesivo de servicios** | Alto uso de servicios de delivery, transporte con conductor u otros servicios similares |

## Detalles del hallazgo

Cada tarjeta de hallazgo incluye:

- **Titulo** — descripcion breve del problema
- **Insignia de severidad** — Baja, Media o Alta
  - **Baja** — menos del 5% del gasto total
  - **Media** — del 5 al 10% del gasto total
  - **Alta** — mas del 10% del gasto total
- **Descripcion** — explicacion detallada con montos especificos
- **Actual vs. Sugerido** — tu costo mensual actual comparado con la recomendacion de la IA
- **Ahorro potencial** — cuanto ahorrarias por mes
- **Sugerencia de accion** — una recomendacion concreta en una frase
- **Gastos relacionados** — lista expandible de transacciones especificas que activaron este hallazgo

## Acciones

- **Regenerar** — fuerza un nuevo analisis con los datos mas recientes (cuesta 3 solicitudes de IA)
- **Expandir/contraer** — toca los hallazgos para mostrar u ocultar descripciones y gastos relacionados

## Tarjeta del panel

La tarjeta compacta del Fat Finder en la pantalla de inicio muestra:
- Ahorro potencial total mostrado de forma destacada
- Los 3 hallazgos principales con puntos de severidad y montos de ahorro
- Boton **Ver informe completo** para ver todos los detalles

Si no se detectan hallazgos, veras un mensaje de "Todo bien!".

## Preguntas frecuentes

- **P: Con que frecuencia debo revisar el Fat Finder?**
  **R:** El informe cubre el mes actual. Revisalo una vez al mes para obtener las conclusiones mas relevantes. Toca **Regenerar** para obtener un analisis actualizado.

- **P: Por que veo hallazgos diferentes cada mes?**
  **R:** La IA analiza tus 3 meses mas recientes de datos. A medida que cambian tus patrones de gasto, los hallazgos se actualizan en consecuencia.

- **P: La IA marco un gasto necesario. Puedo descartarlo?**
  **R:** Actualmente, no se pueden descartar hallazgos individuales. La IA proporciona sugerencias — tu decides cuales poner en practica.

- **P: Funciona con cuentas cifradas?**
  **R:** Para cuentas con cifrado completo (Nivel 2), el Fat Finder no puede analizar las descripciones de gastos, por lo que puede producir menos hallazgos o hallazgos menos especificos.

---

*Ver tambien: [Metas de ahorro](./18-savings-goals.md) | [Historia de gastos](./08-spending-story.md) | [Chat con IA](./07-ai-chat.md)*
