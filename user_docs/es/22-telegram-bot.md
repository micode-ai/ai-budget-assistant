# Bot de Telegram

> Gestiona tus finanzas directamente desde Telegram. Chatea con la IA, anade gastos por comando, escanea recibos y usa mensajes de voz — todo sin abrir la aplicacion.

## Vista general

El **Bot de Telegram** te permite interactuar con tu Asistente de presupuesto IA directamente desde Telegram. Vincula tu cuenta una vez y podras registrar gastos, hacer preguntas financieras y gestionar presupuestos — directamente desde tu mensajero.

## Vincular tu cuenta

1. Abre la aplicacion y ve a **Configuracion**
2. Toca **Bot de Telegram** en la seccion Integraciones
3. Toca **Generar codigo** — aparece un codigo de 6 caracteres (valido por 10 minutos)
4. Abre Telegram y busca el bot
5. Envia `/link CODIGO` (por ejemplo, `/link A3F2B1`)
6. Veras una confirmacion: "Cuenta vinculada exitosamente!"

> **Nota:** Cada cuenta de Telegram solo puede vincularse a una cuenta de la aplicacion. Vincular nuevamente reemplaza la conexion anterior.

## Comandos del bot

| Comando | Descripcion |
|---|---|
| `/start` | Mensaje de bienvenida e instrucciones de configuracion |
| `/link CODIGO` | Vincular tu Telegram a la aplicacion |
| `/expense CANTIDAD DESC` | Anadir un gasto rapidamente (por ejemplo, `/expense 50 almuerzo`) |
| `/income CANTIDAD DESC` | Anadir un ingreso rapidamente (por ejemplo, `/income 3000 salario`) |
| `/account` | Cambiar entre tus cuentas |
| `/newchat` | Iniciar una nueva conversacion con la IA |
| `/unlink` | Desvincular Telegram de tu cuenta |
| `/help` | Mostrar todos los comandos disponibles |

## Chat IA en Telegram

Envia cualquier mensaje de texto al bot y sera procesado por el asistente de IA — el mismo disponible en la pestana Chat IA de la aplicacion.

**Ejemplos:**
- "En que gaste mas este mes?"
- "Muestra mis gastos de la semana pasada"
- "Anadir gasto 500₴ para comestibles"
- "Cual es el estado de mi presupuesto?"

La IA soporta todas las funciones del chat en la aplicacion: comandos en lenguaje natural, confirmacion de acciones, desglose por categorias y analisis de presupuesto.

## Deteccion automatica de cuenta

Si tienes varias cuentas (por ejemplo, "Personal" y "Familiar"), la IA detecta automaticamente cuando mencionas el nombre de una cuenta en tu mensaje y consulta la cuenta correcta.

**Ejemplos:**
- "Muestra mis gastos en la cuenta Familiar" — consulta la cuenta Familiar
- "Cuanto gaste en comida?" — consulta la cuenta predeterminada
- "Anadir gasto 100₴ para comestibles a Familiar" — crea el gasto en la cuenta Familiar

> **Nota:** Esto no cambia permanentemente tu cuenta predeterminada. Usa `/account` para cambiarla.

## Mensajes de voz

1. Graba un mensaje de voz en Telegram
2. Envialo al bot
3. El bot transcribe tu voz y lo procesa como un mensaje de chat IA

Los mensajes de voz soportan los mismos comandos y preguntas que los mensajes de texto.

## Escaneo de recibos

1. Toma una foto de un recibo
2. Envia la foto al bot
3. El bot lo escanea usando OCR y muestra un resumen
4. Toca **Confirmar** para anadir el gasto, o **Cancelar** para rechazar

Tambien puedes enviar imagenes de recibos como documentos (PDF o imagenes).

## Cambiar de cuenta

Si tienes varias cuentas:

1. Envia `/account`
2. El bot muestra todas tus cuentas con botones en linea
3. Toca la cuenta a la que quieres cambiar
4. La cuenta activa esta marcada con una palomita

Todos los comandos y consultas de IA posteriores usaran la cuenta seleccionada hasta que cambies de nuevo.

## Soporte de monedas

El bot reconoce simbolos y codigos de moneda en los comandos:

| Simbolo | Moneda |
|---|---|
| ₴ | UAH |
| $ | USD |
| € | EUR |
| zł | PLN |
| £ | GBP |
| ₽ | RUB |

**Ejemplos:** `/expense 50$ almuerzo`, `/expense 100₴ comestibles`, `/expense 30 EUR taxi`

## Preguntas frecuentes

- **P: Puedo usar el bot sin vincular?**
  **R:** No, primero necesitas vincular tu cuenta de Telegram usando un codigo de la aplicacion.

- **P: Funciona el bot en chats grupales?**
  **R:** El bot esta disenado solo para conversaciones privadas (1:1).

- **P: Que cuenta usa el bot?**
  **R:** El bot usa tu cuenta predeterminada (establecida durante la vinculacion o via `/account`). Tambien puedes mencionar el nombre de una cuenta en tu mensaje, y la IA usara automaticamente esa cuenta para la consulta.

- **P: Puedo vincular multiples cuentas de Telegram?**
  **R:** No, cada usuario de la aplicacion puede tener una cuenta de Telegram vinculada, y cada cuenta de Telegram puede vincularse a un usuario.

- **P: Los mensajes del bot cuentan contra mi limite de solicitudes IA?**
  **R:** Si, cada mensaje procesado por la IA (texto, voz) usa una solicitud de tu cuota mensual.

---

*Ver tambien: [Chat IA](./07-ai-chat.md) | [Cuentas](./09-accounts.md) | [Configuracion](./11-settings.md)*
