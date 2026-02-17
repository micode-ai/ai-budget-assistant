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
- **Articulos** — articulos individuales con cantidades y precios (si se detectan)
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

## Preguntas frecuentes

- **P: Que idiomas admite la entrada de voz?**
  **R:** La entrada de voz funciona mejor en el idioma configurado en la aplicacion. Admite los 8 idiomas de la aplicacion.

- **P: Puedo escanear recibos en cualquier idioma?**
  **R:** Si, la IA puede procesar recibos en la mayoria de los idiomas y extraera importes y articulos independientemente del idioma del recibo.

- **P: Que archivos PDF son compatibles?**
  **R:** Se admiten tanto PDFs digitales (por ejemplo, facturas de Amazon o PayPal) como recibos escaneados en PDF. El tamano maximo del archivo es 10 MB. Los PDFs digitales con texto seleccionable se procesan mas rapido y con mayor precision. Para PDFs escaneados, asegurate de que el escaneo sea nitido y de alto contraste.

- **P: Por que el importe fue incorrecto despues del escaneo?**
  **R:** La extraccion por IA no siempre es perfecta. Revisa siempre la pantalla de confirmacion y corrige cualquier error antes de guardar. Los recibos borrosos o danados pueden producir resultados menos precisos.

- **P: La entrada de voz o el escaneo de recibos consume mis solicitudes IA?**
  **R:** Si, cada entrada de voz o escaneo de recibo utiliza una solicitud IA de tu cuota mensual.

---

*Ver tambien: [Gastos e Ingresos](./03-expenses-and-income.md) | [Chat IA](./07-ai-chat.md)*
