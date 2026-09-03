# Entrada de voz y Escaneo de recibos

> Deja que la IA haga el trabajo. Describe tu gasto de forma natural o fotografa un recibo — la aplicacion extrae el importe, la descripcion, el comercio y la categoria automaticamente.

## Gasto por voz

![Pantalla de Gasto por voz](../img/voice-expense-4.jpg)

### Como funciona

1. Toca **Entrada de voz** desde las acciones rapidas del Panel, o toca **+** en la pantalla de Transacciones y selecciona **Entrada de voz**
2. Veras un icono grande de microfono con el texto **"Toca para comenzar a hablar"**
3. Toca el boton del microfono para empezar a grabar
4. Habla de forma natural, por ejemplo: *"Cafe en Starbucks, cinco dolares"*
5. Toca de nuevo para detener la grabacion
6. La aplicacion procesa tu voz y extrae los detalles del gasto

### Pantalla de confirmacion

Despues del procesamiento, veras una confirmacion con los datos extraidos:

- **Importe** — extraido de tu voz (editable)
- **Descripcion** — para que fue el gasto (editable)
- **Comercio** — donde gastaste (editable)
- **Categoria** — asignada automaticamente (editable)
- Indicador de **Confianza** — **Alta confianza** o **Confianza media**

Revisa los detalles, realiza las correcciones necesarias y luego:
- Toca **Guardar gasto** para confirmar y guardar
- Toca **Intentar de nuevo** para volver a grabar

Despues de guardar, puedes tocar **Agregar otro** para grabar un nuevo gasto por voz.

### Consejos para mejores resultados

- Habla con claridad e incluye tanto el articulo/descripcion como el importe
- Incluye el nombre del comercio si es relevante (por ejemplo, "Almuerzo en McDonald's, doce euros")
- Especifica la moneda si es diferente a la predeterminada
- Mantenlo simple — un gasto por grabacion

## Escanear recibo

![Pantalla de Escanear recibo](../img/scan-receipt-4.jpg)

### Como funciona

1. Toca **Escanear recibo** desde las acciones rapidas del Panel, o toca **+** en la pantalla de Transacciones y selecciona **Escanear recibo**
2. Veras tres opciones:
   - **Tomar foto** — abre tu camara para fotografiar el recibo
   - **Elegir de la galeria** — selecciona una foto existente
   - **Subir PDF** — elige un archivo PDF (facturas digitales, recibos escaneados, hasta 10 MB)
3. Opcionalmente, introduce **Instrucciones adicionales para la IA** (por ejemplo, "Dividir a partes iguales entre dos personas", "Ignorar la propina")
4. La aplicacion analiza el recibo y extrae los datos

### Pantalla de confirmacion

Despues del analisis de la IA, veras:

- **Importe total** — extraido del recibo (editable)
- **Descripcion** — resumen generado (editable)
- **Comercio** — nombre de la tienda/restaurante (editable)
- **Categoria** — asignada automaticamente (editable)
- **Fecha** — del recibo (editable)
- **Articulos** — articulos individuales con cantidades y precios (si se detectan) — toca cualquier articulo para editarlo, eliminarlo o anadir uno que el escaneo paso por alto (ver **Editar articulos** mas abajo)
- **Descuento** — importe del descuento (si esta presente en el recibo)
- Indicador de **Confianza** — **Alta confianza** o **Confianza media**
- Interruptor **Guardar imagen del recibo** — mantener la foto adjunta al gasto

Revisa y corrige cualquier detalle, luego:
- Toca **Guardar gasto** para confirmar
- Toca **Escanear de nuevo** para probar con otra foto

### Consejos para mejores resultados

- Fotografa con buena iluminacion — evita sombras y reflejos
- Asegurate de que el recibo completo sea visible y este plano
- Mantene la camara estable para evitar desenfoque
- Usa **Instrucciones adicionales para la IA** para un tratamiento especial (por ejemplo, "Esto esta en EUR", "Ignorar el primer articulo")

### Editar artículos

La extracción por IA no siempre es perfecta: puede faltar una cifra en el precio, un descuento puede colarse en el precio unitario, o el escaneo puede pasar por alto una línea entera. No hace falta volver a escanear ni borrar todo el gasto para corregirlo:

- **Toca cualquier artículo** de la lista para editar su nombre, cantidad, precio unitario o precio total. Toca **Guardar** para aplicar la corrección.
- **Toca el icono de papelera** junto a un artículo para eliminarlo — útil para una línea duplicada o inventada.
- **Toca + Añadir artículo** al final de la lista para añadir una línea que el escaneo pasó por alto.

Se muestran todos los artículos, sin límite, sean los que sean los que tenga el recibo. Cualquier cambio actualiza de inmediato la división por categorías y los totales, así que lo que guardas siempre coincide con lo que ves en pantalla. El importe total, el descuento y el depósito del recibo se mantienen tal como se escanearon — solo los artículos individuales son editables.

### División por categorías

Los recibos del supermercado a menudo mezclan varios tipos de artículos en una sola compra — alimentos, artículos del hogar, alcohol. Cuando la aplicación reconoce más de un tipo de artículo en un recibo, divide automáticamente el gasto entre las categorías correspondientes en lugar de asignarlo todo a una sola.

- En la pantalla de confirmación aparece una fila de chips de categoría sobre la lista de artículos, etiquetada **Dividir por categoría** (por ejemplo, "Alimentación 180 · Hogar 35 · Alcohol 25"), que muestra cómo se desglosará el importe total.
- Toca **Cambiar categorías** para abrir una lista de todos los artículos y ajustar a qué categoría pertenece cada uno. Tus cambios se aplican de inmediato — y se recuerdan, de modo que el mismo producto se categoriza correctamente la próxima vez que lo escanees.
- Si los artículos no suman lo suficientemente cerca del importe total del recibo, la aplicación recurre a una sola categoría en lugar de adivinar.
- Los depósitos de botellas y latas se reconocen y se muestran como su propia categoría, para que puedas ver cuánto de tu gasto es envase que puedes recuperar.
- Esto solo cambia cómo aparece tu gasto en Analítica y en los gráficos — nunca cambia tus presupuestos, que siguen contabilizando contra la categoría general única del recibo.
- A veces ninguna de tus categorías existentes encaja con un grupo de artículos. En ese caso, la aplicación sugiere una categoría totalmente nueva, mostrada como un chip marcado con un **+** (por ejemplo, "+ Productos de limpieza 10"). Todavía no se crea — toca **Cambiar categorías** para reasignar sus artículos a una categoría existente, o dejarla tal como se sugirió. La nueva categoría solo se crea de verdad cuando guardas el recibo.

Funciona igual tanto si escaneas desde la aplicación como desde los bots de Telegram, WhatsApp o Slack.

### Escanear una pila de recibos

¿Tienes acumulada una semana de recibos en papel? Después de guardar uno, la confirmación te ofrece dos opciones en lugar de simplemente cerrar la pantalla:

- **Escanear otro** — vuelve directamente a la cámara sin salir de la pantalla, para que puedas resolver toda una pila uno tras otro
- **Listo** — termina y te devuelve a donde empezaste

Mientras escaneas, un pequeño contador muestra cuántos recibos has guardado en esta sesión. Cada 15 recibos, la app te avisa con un recordatorio amistoso de que puedes seguir o tomar un descanso — tu progreso ya está guardado de cualquier forma. El contador se reinicia al salir de la pantalla; solo está para darte una sensación de progreso durante una sesión.

## Ingresos por voz

Registra los pagos recibidos por voz — el mismo flujo que Gasto por voz, optimizado para ingresos.

### Cómo funciona

1. Toca **Ingresos por voz** desde las acciones rápidas del Panel, o toca el icono del micrófono en el pie del formulario **Agregar ingreso**
2. Toca el botón (verde) del micrófono para empezar a grabar
3. Habla de forma natural, por ejemplo: *"Recibidos 500 del cliente, honorarios de consultoría"*
4. Toca de nuevo para detener la grabación
5. La aplicación extrae el importe, la descripción y la **categoría de ingreso** más adecuada

### Pantalla de confirmación

- **Importe** — extraído de tu voz (editable)
- **Descripción** — para qué fue el pago (editable)
- **Categoría** — categoría de ingreso asignada automáticamente (editable)
- **Moneda** — detectada o establecida por defecto en tu moneda base

Toca **Guardar ingreso** para confirmar, o **Intentar de nuevo** para volver a grabar.

### Consejos para mejores resultados

- Menciona el importe y una breve descripción
- Especifica la moneda si difiere de tu moneda predeterminada

---

## Escanear factura

Fotografía o sube una factura o documento de pago para capturar ingresos automáticamente.

### Cómo funciona

1. Toca **Escanear factura** desde las acciones rápidas del Panel, o toca el icono del documento en el pie del formulario **Agregar ingreso**
2. Elige **Tomar foto**, **Elegir de la galería** o **Subir PDF**
3. Opcionalmente, introduce instrucciones adicionales para la IA
4. La aplicación extrae el importe total, la fecha y la categoría

### Pantalla de confirmación

- **Importe total** — extraído del documento
- **Descripción** — resumen generado
- **Categoría** — categoría de ingreso asignada automáticamente
- **Fecha** — del documento

Revisa los detalles, toca ✓ para guardar o el icono del lápiz para abrir el formulario completo de Agregar ingreso con los datos pre-rellenados.

> **Nota:** El OCR de facturas extrae únicamente el total y la fecha. Los elementos de línea de las facturas se ignoran intencionalmente para evitar el doble conteo en documentos de facturación de varias líneas.

---

## Preguntas frecuentes

- **P: Que idiomas admite la entrada de voz?**
  **R:** La entrada de voz funciona mejor en el idioma configurado en la aplicacion. Admite los 8 idiomas de la aplicacion.

- **P: Puedo escanear recibos en cualquier idioma?**
  **R:** Si, la IA puede procesar recibos en la mayoria de los idiomas y extraera importes y articulos independientemente del idioma del recibo.

- **P: Que archivos PDF son compatibles?**
  **R:** Se admiten tanto PDFs digitales (por ejemplo, facturas de Amazon o PayPal) como recibos escaneados en PDF. El tamano maximo del archivo es 10 MB. Los PDFs digitales con texto seleccionable se procesan mas rapido y con mayor precision. Para PDFs escaneados, asegurate de que el escaneo sea nitido y de alto contraste.

- **P: Por que el importe fue incorrecto despues del escaneo?**
  **R:** La extraccion por IA no siempre es perfecta. Revisa siempre la pantalla de confirmacion y corrige cualquier error antes de guardar. Los recibos borrosos o danados pueden producir resultados menos precisos. Si un articulo concreto esta mal, tocalo para editarlo directamente — consulta **Editar artículos** más arriba.

- **P: La entrada de voz o el escaneo de recibos consume mis solicitudes IA?**
  **R:** Si, cada entrada de voz o escaneo de recibo utiliza una solicitud IA de tu cuota mensual.

- **P: ¿Por qué un recibo terminó dividido en varias categorías en mis gráficos?**
  **R:** Cuando un recibo mezcla claramente distintos tipos de artículos (por ejemplo, alimentación y alcohol), la aplicación lo divide automáticamente entre las categorías correspondientes en tus gráficos de gasto. Esto nunca cambia tus presupuestos. Toca **Cambiar categorías** en la pantalla de confirmación del recibo para ajustarlo — las correcciones se recuerdan para la próxima vez.

---

*Ver tambien: [Gastos e Ingresos](./03-expenses-and-income.md) | [Chat IA](./07-ai-chat.md)*
