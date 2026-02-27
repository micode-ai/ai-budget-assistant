# Cuentas

> Organiza tus finanzas con cuentas separadas. Usa Personal para seguimiento individual, Compartida para presupuestos familiares y Empresa para gastos corporativos. Invita miembros con control de acceso basado en roles.

## Vista general

La aplicacion admite multiples cuentas para separar diferentes contextos financieros. Cada cuenta tiene sus propios gastos, ingresos, presupuestos y billetera.

## Tipos de cuenta

![Lista de cuentas](../img/accounts.jpg)

| Tipo | Icono | Proposito |
|---|---|---|
| **Personal** | Icono de persona | Seguimiento de gastos individual |
| **Compartida** | Icono de personas | Presupuestos familiares o de grupo (por ejemplo, "Familia") |
| **Empresa** | Icono de maletin | Gastos de la empresa o equipo (por ejemplo, "MiCodigo") |
| **Inversion** | Icono de tendencia al alza | Seguimiento de carteras de inversion y activos |

Cada cuenta muestra su tipo y tu rol (Propietario, Editor u Observador).

## Cambiar cuenta

![Menu desplegable de Cambiar cuenta](../img/switch-account.jpg)

1. Toca el **nombre de la cuenta** en la esquina superior izquierda de cualquier pantalla (por ejemplo, "Familia")
2. Se abre el menu desplegable **Cambiar cuenta** mostrando todas tus cuentas
3. Toca la cuenta a la que deseas cambiar
4. La cuenta activa se marca con una marca de verificacion verde
5. Todas las pantallas se actualizan para mostrar los datos de la cuenta seleccionada

Toca **Gestionar cuentas** en la parte inferior del menu desplegable para ir a la lista completa de cuentas.

## Crear una cuenta

1. Ve a la lista de Cuentas (a traves de **Gestionar cuentas** o desde Ajustes)
2. Toca **Crear cuenta**
3. Introduce un **Nombre de cuenta** (por ejemplo, "Mi presupuesto")
4. Selecciona el **Tipo de cuenta**: Personal, Compartida, Empresa o Inversion
5. Selecciona la **Moneda** para esta cuenta
6. Toca **Crear**

> **Nota:** El plan Gratuito permite 1 cuenta, Pro permite hasta 3, Business permite cuentas ilimitadas.

## Unirse a una cuenta

Si alguien te ha invitado a su cuenta:

1. Toca **Unirse a cuenta** en la lista de Cuentas
2. Introduce el **codigo de invitacion** que recibiste
3. Toca **Unirse**
4. Veras un mensaje de exito: "Te has unido a la cuenta correctamente!"
5. La cuenta ahora aparece en tu lista de cuentas

## Ajustes de la cuenta

![Ajustes de la cuenta](../img/account-settings.jpg)

Toca cualquier cuenta para abrir sus ajustes:

### Detalles
- **Nombre** de la cuenta (editable por el Propietario)
- **Tipo** de cuenta y **moneda** (solo visualizacion)

### Miembros
- Lista de todos los miembros de la cuenta con sus roles
- Cada miembro muestra: avatar, nombre e insignia de rol (Propietario, Editor, Observador)

### Invitar miembros

1. Abre los Ajustes de la cuenta
2. Toca el **icono de invitacion** (icono de persona+ en la esquina superior derecha de la seccion de Miembros)
3. Elige el metodo de invitacion:
   - **Por correo electronico** — introduce la direccion de correo electronico de la persona, selecciona su rol (Editor u Observador), toca **Enviar invitacion**
   - **Por enlace** — se genera un codigo que puedes compartir. Toca para copiar o compartir a traves de aplicaciones de mensajeria

### Gestionar miembros (solo Propietario)

- **Cambiar rol** — toca el icono de cambio de rol junto a un miembro para asignar un nuevo rol
- **Eliminar miembro** — toca el icono de eliminar para quitar a un miembro (con confirmacion)

### Invitaciones pendientes

- Consulta las invitaciones que aun no han sido aceptadas
- **Cancelar invitacion** — revoca una invitacion pendiente

## Roles y permisos

| Permiso | Propietario | Editor | Observador |
|---|---|---|---|
| Ver gastos e ingresos | Si | Si | Si |
| Agregar/editar gastos | Si | Si | No |
| Agregar/editar ingresos | Si | Si | No |
| Crear/editar presupuestos | Si | Si | No |
| Gestionar miembros | Si | No | No |
| Editar ajustes de cuenta | Si | No | No |
| Eliminar cuenta | Si | No | No |

### Descripcion de roles
- **Propietario** — control total sobre la cuenta, puede gestionar miembros y ajustes
- **Editor** — puede agregar y editar gastos, ingresos y presupuestos
- **Observador** — solo puede ver datos (acceso de solo lectura)

## Eliminar una cuenta

1. Abre los Ajustes de la cuenta
2. Desplazate hasta el final y toca **Eliminar cuenta**
3. Confirma la eliminacion

> **Advertencia:** Eliminar una cuenta borra permanentemente todos sus datos (gastos, ingresos, presupuestos). Esta accion no se puede deshacer.

## Abandonar una cuenta

Si eres miembro (no el Propietario) de una cuenta compartida:
1. Abre los Ajustes de la cuenta
2. Toca **Abandonar cuenta**
3. Confirma — seras eliminado de la cuenta

## Cambio de cuentas en Telegram

Al usar el bot de Telegram, puedes cambiar de cuenta de dos maneras:

1. **Manualmente** — envia `/account` y toca la cuenta deseada
2. **Automaticamente** — menciona el nombre de una cuenta en tu mensaje (ej., "Muestra gastos en Family"), y la IA consultara esa cuenta para la solicitud actual

La deteccion automatica no cambia tu cuenta predeterminada — solo aplica al mensaje actual. Usa `/account` para cambiar permanentemente.

## Preguntas frecuentes

- **P: Cuantas cuentas puedo tener?**
  **R:** Gratuito: 1 cuenta, Pro: hasta 3, Business: ilimitadas.

- **P: Puedo transferir la propiedad de una cuenta?**
  **R:** Actualmente, el creador de la cuenta siempre es el Propietario. Contacta con soporte para transferencias de propiedad.

- **P: Puedo ver quien agrego un gasto en una cuenta compartida?**
  **R:** Los gastos en cuentas compartidas muestran que miembro los creo.

- **P: Puedo usar diferentes cuentas en el bot de Telegram?**
  **R:** Si. Envia `/account` para cambiar tu cuenta predeterminada, o simplemente menciona el nombre de la cuenta en tu mensaje para consultas puntuales. Ver [Bot de Telegram](./22-telegram-bot.md) para detalles.

---

*Ver tambien: [Ajustes](./11-settings.md) | [Planes de suscripcion](./12-subscription.md)*
