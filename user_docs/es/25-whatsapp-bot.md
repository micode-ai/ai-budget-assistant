# Bot de WhatsApp

> Gestiona tus finanzas directamente desde WhatsApp. Chatea con la IA, añade gastos por comando, escanea recibos y envía mensajes de voz — sin abrir la app.

## Resumen

El **Bot de WhatsApp** te permite usar AI Budget Assistant desde WhatsApp. Vincula tu cuenta una vez y registra gastos, haz preguntas financieras y gestiona presupuestos — desde tu mensajero.

El bot funciona igual que el [Bot de Telegram](./22-telegram-bot.md): misma IA, mismos comandos, mismo soporte multi-cuenta.

## Vincular tu cuenta

1. Abre la app y ve a **Configuración**
2. Toca **WhatsApp Bot** en Integraciones
3. Toca **Conectar WhatsApp** — aparece un código de 6 caracteres y un código QR (válido 10 minutos)
4. Luego:
   - Toca **Abrir WhatsApp** — WhatsApp se abre con el mensaje `link TU_CÓDIGO` ya escrito.
   - O escanea el QR con otro teléfono.
   - O copia el código y envía `link TU_CÓDIGO` manualmente al número de WhatsApp del bot.
5. Verás: «¡Cuenta vinculada!»

> **Nota:** Cada número de WhatsApp se vincula a una cuenta de la app. Re-vincular reemplaza la conexión anterior.

## Comandos del bot

Los comandos funcionan con o sin `/` — `expense 50 almuerzo` y `/expense 50 almuerzo` son equivalentes.

| Comando | Descripción |
|---|---|
| `link CÓDIGO` | Vincular WhatsApp |
| `expense MONTO DESC` | Añadir gasto rápido |
| `income MONTO DESC` | Añadir ingreso rápido |
| `category [TIPO] NOMBRE` | Crear categoría |
| `categories` | Listar y eliminar categorías |
| `usage` | Uso de IA y límites |
| `account` | Cambiar de cuenta |
| `newchat` | Nueva conversación IA |
| `unlink` | Desvincular WhatsApp |
| `help` | Mostrar comandos |

## Chat IA en WhatsApp

Envía cualquier mensaje — la IA lo procesará.

**Ejemplos:**
- «¿En qué gasté más este mes?»
- «Muestra mis gastos de la semana pasada»

## Mensajes de voz

Graba un mensaje de voz en WhatsApp y envíalo al bot. Costo: 2 solicitudes IA.

## Escaneo de recibos

1. Toma foto de un recibo y envíala al bot
2. El bot lo escanea con OCR y muestra un resumen
3. Si la fecha es incorrecta, toca **Cambiar fecha** y envía `DD.MM.AAAA`
4. Toca **Agregar gasto** o **Cancelar**

## Cambiar cuenta

Envía `account` — el bot muestra tus cuentas como lista tocable.

## Monedas soportadas

| Símbolo | Moneda |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

## FAQ

- **P: ¿Sin vinculación?** **R:** No, vincula tu WhatsApp con el código de la app.
- **P: ¿En grupos?** **R:** No, solo 1:1.
- **P: ¿WhatsApp y Telegram a la vez?** **R:** Sí, vinculaciones independientes.
- **P: ¿Cuentan los mensajes contra el límite IA?** **R:** Sí. Chat: 1, voz/recibos: 2.
- **P: ¿En qué idioma responde?** **R:** El configurado en la app.

---

*Ver también: [Chat IA](./07-ai-chat.md) | [Bot Telegram](./22-telegram-bot.md) | [Configuración](./11-settings.md)*
