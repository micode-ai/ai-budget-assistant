# Chatbots — Telegram y WhatsApp

> Gestiona tus finanzas directamente desde Telegram o WhatsApp. Chatea con IA, añade gastos, escanea recibos y envía mensajes de voz — sin abrir la app.

## Resumen

Conecta tu cuenta a **Telegram**, **WhatsApp** o a ambos a la vez. Ambos bots ofrecen funciones idénticas — usa el mensajero que prefieras.

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

> Telegram y WhatsApp pueden estar conectados simultáneamente a la misma cuenta.

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
| `/income 3000 salario` | Añadir un ingreso |
| `/usage` | Ver uso de IA |
| `/account` | Cambiar cuenta activa |
| `/newchat` | Iniciar nueva conversación con IA |
| `/unlink` | Desconectar el bot |
| `/help` | Mostrar todos los comandos |

> En **WhatsApp** los comandos funcionan con o sin `/`.

## Escaneo de recibos

1. Saca una foto del recibo y envíala al bot
2. El bot extrae importe, fecha y comercio
3. Si la fecha es incorrecta — envía la correcta en formato `DD.MM.AAAA`
4. Confirma o cancela

## Coste de solicitudes IA

| Acción | Solicitudes IA |
|---|---|
| Mensaje de texto / chat IA | 1 |
| Mensaje de voz | 2 |
| Foto de recibo | 2 |

---

*Ver también: [Chat IA](./07-ai-chat.md) | [Cuentas](./09-accounts.md) | [Ajustes](./11-settings.md)*
