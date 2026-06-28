# Planificación — Gasto seguro, asequibilidad y captura automática

> Tres herramientas que trabajan juntas para que gastes con confianza: un número de presupuesto diario en vivo, una pregunta de chat "¿Puedo permitirme esto?" y captura automática de gastos desde notificaciones bancarias (solo Android).

## Gasto seguro hoy

El héroe de la pantalla de inicio muestra un número de **Gasto seguro** — el importe que puedes gastar hoy y aún cubrir todas tus obligaciones conocidas antes de fin de mes.

### Qué incluye

El número se calcula a partir de:
- **Saldo de cartera** — tus saldos actuales en todas las divisas, convertidos a tu moneda de visualización.
- **Suscripciones próximas** — suscripciones activas que se renuevan antes de fin de mes (del Gestor de suscripciones).
- **Gastos recurrentes próximos** — gastos con repetición semanal, mensual o anual que vencen antes de fin de mes.
- **Aportaciones a objetivos** — el importe diario necesario para mantener tus objetivos de ahorro en marcha.
- **Ingresos esperados** — si la app detecta un ingreso mensual regular (mismo importe, intervalo de ~30 días, al menos dos veces en los últimos 90 días), lo añade como ingreso esperado y usa la próxima fecha de cobro como horizonte.

### Fórmula

```
Gasto seguro = (Saldo + Ingresos esperados − Obligaciones) ÷ Días restantes
```

El resultado se limita a cero — nunca verás un número negativo. Si las obligaciones superan tu saldo, el número muestra 0 con una nota explicativa.

### Desglose

Toca el número para abrir una hoja de desglose que muestra cada componente: saldo de cartera, ingresos esperados, suscripciones próximas, gastos recurrentes y aportaciones a objetivos. Todos los importes están en tu moneda de visualización; aparece una nota si alguna conversión usó un tipo de cambio aproximado.

### Widget

El Gasto seguro está disponible como widget de pantalla de inicio. Puedes mostrarlo u ocultarlo en **Ajustes → Widgets**.

## ¿Puedo permitirme esto? (Oráculo de asequibilidad)

Haz al chat de IA preguntas como "¿Puedo permitirme un vuelo de 200 €?" o "¿Puedo comprar un portátil nuevo por 3500 zł?". El chat usa el mismo motor que el Gasto seguro para dar una respuesta determinista de sí o no — la IA solo narra el veredicto, nunca adivina.

Respuestas posibles:
- **Sí** — el importe está dentro del presupuesto seguro de hoy.
- **Sí, pero justo** — cabe en tu saldo disponible pero usa la mayor parte.
- **No** — supera tus fondos disponibles.
- **Sí, pero retrasa un objetivo** — asequible, pero tu objetivo de ahorro "X" se retrasa aproximadamente N días.
- **Espera hasta el día de cobro** — asequible después de que llegue tu próximo ingreso esperado (se muestra la fecha sugerida).

## Captura automática Android

En Android, la app puede crear automáticamente un gasto a partir de las notificaciones push de tu banco — para que no te pierdas ninguna transacción aunque no estés en la app.

### Cómo activarlo

1. Ve a **Ajustes → Importar transacciones → Captura automática (Android)**.
2. Lee la nota de privacidad y toca **Activar**.
3. La app abre los ajustes de acceso a notificaciones del sistema. Busca **AI Budget Assistant** en la lista y actívalo.
4. Regresa a la app — el estado muestra **Permiso concedido**.

### Privacidad

El texto de las notificaciones se procesa **solo en tu dispositivo**. El nombre del comercio, el importe y la divisa se extraen localmente; solo el gasto resultante se sincroniza con el servidor — el texto bruto de la notificación nunca se envía a ningún sitio.

### Bancos compatibles (Polonia)

La captura automática funciona con notificaciones de los principales bancos polacos, como PKO BP, mBank, Pekao, Revolut y otros. La lista de apps compatibles se muestra en la pantalla de Captura automática.

### Deduplicación

Si una notificación se entrega más de una vez, o si también importas la misma transacción desde un CSV bancario, la app deduplica automáticamente. Cada notificación capturada recibe una huella única; los duplicados se descartan silenciosamente.

### Revisar capturas

Toca el aviso de captura ("Capturado 54 zł · Żabka — toca para revisar") para abrir el detalle del gasto y verificar o corregir el importe, comercio y categoría antes de sincronizar.

### Solo Android

La captura automática es una función de Android. En iOS y web, esta sección no aparece. Una alternativa para iOS es escanear una foto de recibo a través de la función de captura de recibos existente.
