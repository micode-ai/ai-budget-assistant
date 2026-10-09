# Chatbots — Telegram, WhatsApp y Slack

> Gestiona tus finanzas directamente desde Telegram, WhatsApp o Slack. Chatea con IA, añade gastos, escanea recibos y envía mensajes de voz — sin abrir la app.

## Resumen

Conecta tu cuenta a **Telegram**, **WhatsApp**, **Slack** o cualquier combinación a la vez. Los tres bots ofrecen funciones idénticas — usa el mensajero que prefieras.

Para conectar: **Ajustes → Chatbots**.

## Vincular tu cuenta

### Telegram
1. Toca **Conectar Telegram** — aparece un código de 6 caracteres (válido 10 minutos)
2. Abre Telegram y busca el bot
3. Envía `/link TU_CÓDIGO` (ej. `/link A3F2B1`)
4. Verás «¡Cuenta vinculada con éxito!»

### WhatsApp
1. Toca **Conectar WhatsApp** — aparece el código y un QR
2. Toca **Abrir WhatsApp** (el mensaje está prellenado) o escanea el QR
3. Envía `link TU_CÓDIGO` al bot
4. Verás «¡Cuenta vinculada con éxito!»

### Slack
1. Toca **Conectar Slack** — aparece un código de 6 caracteres (válido 10 minutos)
2. Abre Slack, encuentra la app **AI Budget Assistant** y abre un mensaje directo con ella
3. Envía `link TU_CÓDIGO` (ej. `link A3F2B1`)
4. Verás «¡Cuenta vinculada con éxito!»

> Telegram, WhatsApp y Slack pueden estar todos conectados simultáneamente a la misma cuenta.

## Qué puedes hacer

- **Añadir gastos e ingresos**: escribe de forma natural o usa comandos
- **Chat con IA**: haz cualquier pregunta financiera — la misma IA que en la app
- **Mensajes de voz**: habla tu gasto o pregunta (2 solicitudes IA por mensaje)
- **Fotos de recibos**: envía una foto para escanear automáticamente (2 solicitudes IA)
- **Consultar uso de IA**: `/usage`
- **Cambiar cuenta**: `/account`

## Comandos

| Comando | Qué hace |
|---|---|
| `/link CÓDIGO` | Vincular el mensajero a la app |
| `/expense 50 almuerzo` | Añadir un gasto |
| `/group 120 pizza` | Añadir un gasto a un grupo compartido |
| `/income 3000 salario` | Añadir un ingreso |
| `/usage` | Ver uso de IA |
| `/account` | Cambiar cuenta activa |
| `/newchat` | Iniciar nueva conversación con IA |
| `/unlink` | Desconectar el bot |
| `/help` | Mostrar todos los comandos |

> En **WhatsApp** y **Slack** los comandos funcionan con o sin `/`. También puedes escribir solo un importe y descripción: `50 almuerzo`.

## Añadir un gasto a un grupo compartido

Envía `/group 120 pizza` para añadir un gasto a uno de tus grupos compartidos (en WhatsApp y Slack también vale `group 120 pizza`). Si estás en varios grupos, el bot te pregunta a cuál: elígelo de la lista. Después revisa la tarjeta (grupo, importe, descripción, *pagado por ti*, *a partes iguales*) y toca **Confirmar**, o **Cancelar** para no añadir nada. Tú siempre eres quien paga y el gasto siempre se divide a partes iguales entre todos los miembros; si pagó otra persona o quieres otro reparto, añádelo en la app. Para indicar otra moneda, escríbela tras el importe (`/group 25 EUR taxi`): el gasto se convierte a la moneda del grupo al tipo de hoy y, si no hay tipo disponible, el bot te lo dice y no añade nada. Los grupos archivados no aparecen y esto no consume solicitudes de IA.

## Escaneo de recibos

1. Saca una foto del recibo y envíala al bot
2. El bot extrae importe, fecha y comercio
3. Si la fecha es incorrecta — envía la correcta en formato `DD.MM.AAAA`
4. Confirma o cancela

### Corregir las líneas escaneadas

El OCR a veces lee mal un precio, inventa una línea o se salta otra. Toca **✏️ Líneas** (en WhatsApp: **✏️ Editar → Líneas**) y envía una corrección por mensaje:

| Mensaje | Qué hace |
|---|---|
| `3 = 14,69` | fija el precio de la línea 3 |
| `3: Pan de centeno` | renombra la línea 3 |
| `3 -` | borra la línea 3 |
| `+ Pan 5,99` | añade una línea |
| `= 233,98` | corrige el total del recibo |

Sirven tanto `14,69` como `14.69`. Tras cada corrección el bot reenvía la lista numerada y una línea `Líneas: … · total del recibo: …`; si esas dos cifras no coinciden, algo del recibo sigue mal leído. El reparto por categorías se recalcula a partir de las líneas corregidas, así que corrige también el total cuando cambies un precio.

Cuando termines, toca **Añadir gasto**: nada se guarda hasta entonces, y cancelar descarta todas las correcciones. Aquí solo se pueden corregir las líneas y el total; para cambiar la categoría de una línea, abre el gasto en la aplicación.

## Coste de solicitudes IA

| Acción | Solicitudes IA |
|---|---|
| Mensaje de texto / chat IA | 1 |
| Mensaje de voz | 2 |
| Foto de recibo | 2 |

## Preguntas frecuentes

**P: ¿Puedo conectar Telegram, WhatsApp y Slack?**
Sí — son enlaces independientes y todos funcionan simultáneamente.

---

*Ver también: [Chat IA](./07-ai-chat.md) | [Cuentas](./09-accounts.md) | [Ajustes](./11-settings.md)*
