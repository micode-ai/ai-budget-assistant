# Aplicaciones conectadas y desarrolladores

> Deja que otra app que usas —por ejemplo, tu programa de contabilidad— trabaje con tus gastos de AI Budget, mira exactamente qué puede hacer y córtale el acceso con un toque. Los desarrolladores pueden crear estas apps sobre la API de AI Budget.

## Qué significa conectar una app

Algunos productos pueden trabajar con tus datos de AI Budget desde sus propias pantallas: una app de contabilidad puede recoger tus gastos y tickets, o añadir gastos por ti. Para permitirlo, conectas la app a **una** de tus cuentas de AI Budget.

La app nunca ve tu contraseña. Cuando pulsas su botón «Conectar AI Budget», te lleva a una página de AI Budget donde inicias sesión como siempre y ves:

- el nombre de la app, su web y quién la ha creado;
- **Verificada por AI Budget** (una app que hemos revisado, como la nuestra) o **No verificada por AI Budget**;
- la lista de permisos que pide la app;
- **Cuenta que se conectará**: eliges qué cuenta puede usar la app.

Pulsa **Permitir** para conectarla o **Denegar** para volver a la app sin conectar nada. Permite solo apps de confianza.

## Qué permite cada permiso

- **Ver tus gastos: importes, fechas, categorías, artículos y etiquetas**: la app puede leer los gastos de la cuenta conectada, incluidos los artículos de un ticket y los cambios y eliminaciones posteriores.
- **Añadir, modificar y eliminar gastos**: la app puede escribir en esa cuenta. Los gastos que añade muestran **Añadido a través de** y el nombre de la app en la pantalla del gasto.
- **Descargar las fotos de tus tickets**: la app puede descargar la imagen o el PDF del ticket adjunto a un gasto.
- **Ver tus categorías de gastos**: la app puede leer tu lista de categorías para clasificar bien los gastos nuevos.

Toda app conectada ve además el nombre, el tipo y la moneda de la cuenta, y tu nombre. Nunca recibe tu dirección de correo y no puede ver tus otras cuentas.

## Ver y desconectar apps

Abre **Ajustes → Aplicaciones conectadas**. Cada app aparece con la cuenta a la que está conectada, quién la conectó y cuándo, cuándo se usó por última vez y sus permisos.

Pulsa **Desconectar** y confirma. La app pierde el acceso a esa cuenta al instante: su siguiente petición ya se rechaza. Los gastos que ya añadió se quedan en tu cuenta. Para volver a usarla, conéctala de nuevo desde la app.

Cada vez que se conecta una app, enviamos un correo a la persona que la conectó. Si recibes uno y no reconoces la app, desconéctala enseguida.

Si no ves **Aplicaciones conectadas** en Ajustes, la conexión de apps todavía no está disponible.

## Cuentas compartidas

Solo un **propietario** o un **editor** de una cuenta puede conectarle una app; quien solo puede ver la cuenta la verá desactivada.

Una app conectada a una cuenta compartida ve los gastos de **todos** sus miembros, no solo los de quien la conectó. Por eso todos los propietarios y editores de la cuenta ven en **Aplicaciones conectadas** cada app conectada a ella, con quién la conectó, y cualquiera de ellos puede desconectarla. Cuando un editor conecta una app, los propietarios de la cuenta también reciben el correo.

Si la persona que conectó la app pasa después a solo lectura o sale de la cuenta, la app deja de funcionar para esa cuenta.

## Cuentas cifradas

- Una cuenta con **cifrado completo** (también los importes) no se puede conectar: la app no podría leer nada.
- Una cuenta con **cifrado de texto** se puede conectar **solo en lectura**: la app ve importes, fechas y categorías, pero las descripciones, notas, comercios, nombres de artículos, etiquetas y demás texto cifrado quedan ocultos, y no puede añadir ni modificar gastos.

Qué cubre cada nivel se explica en [Cifrado de extremo a extremo](./15-encryption.md).

## Para desarrolladores

Puedes crear tu propia app sobre la API de AI Budget, gratis. Abre **Ajustes → Desarrolladores** y pulsa **Crear app**: ponle un nombre, una web y las direcciones de redirección que usará, y elige **App de servidor** o **App móvil o de navegador**. El **Client ID** lo recibes al momento; una app de servidor recibe además un client secret que se muestra **una sola vez**: cópialo enseguida.

La referencia completa de la API y una guía paso a paso (en inglés, polaco y ruso) están en [api.ai-budget.pl/public/docs](https://api.ai-budget.pl/public/docs), también enlazadas desde **Documentación de la API** en la pantalla de desarrolladores. Puedes registrar hasta 10 apps.
