# Deudas y Prestamos

> Registra el dinero que prestas y pides prestado. Ve quien te debe y a quien debes, registra pagos y controla las fechas de vencimiento — todo integrado con tus gastos e ingresos.

## Descripcion general

La funcion «Deudas y Prestamos» te permite rastrear dos tipos de obligaciones financieras:

![Pantalla de Deudas y Préstamos con dinero prestado y tomado en préstamo](../img/debts.jpg)

- **Dinero prestado** — dinero que le diste a alguien (registrado como gasto con marca de deuda)
- **Dinero tomado en prestamo** — dinero que alguien te dio (registrado como ingreso con marca de deuda)

Los reembolsos funcionan de la misma manera:
- Cuando alguien **te devuelve** dinero — se registra como ingreso vinculado al gasto de deuda original
- Cuando **tu devuelves** dinero — se registra como gasto vinculado al ingreso de deuda original

El estado de la deuda se calcula automaticamente:
- **Activa** — queda un saldo pendiente
- **Pagada** — la deuda se ha reembolsado completamente
- **Vencida** — la fecha de vencimiento ha pasado y el saldo sigue pendiente

## Crear una deuda

La forma mas rapida de agregar una deuda es desde la pantalla **Deudas y Prestamos**:

1. Abre la pantalla **Deudas y Prestamos** (desde el widget del Panel o Ajustes)
2. Toca el boton **+** en la esquina inferior derecha
3. Elige **Prestar dinero** o **Pedir prestado**
4. Completa el monto, descripcion, nombre del contacto y fecha de vencimiento opcional
5. Toca **Guardar**

Tambien puedes crear deudas manualmente desde los formularios de gastos o ingresos (ver abajo).

## Prestar dinero

### Paso a paso

1. Ve a **Transacciones** y toca el boton **+**
2. Selecciona **Entrada manual**
3. Ingresa el **monto** que estas prestando
4. Ingresa una **descripcion** (ej. «Prestamo a Juan»)
5. Activa el interruptor **Preste dinero**
6. Ingresa el **nombre del contacto** — a quien le prestas
7. Opcionalmente establece una **fecha de vencimiento** — cuando esperas el reembolso
8. Toca **Guardar gasto**

El gasto se marcara como deuda y aparecera en la pantalla de Deudas y Prestamos.

> **Nota:** El monto afecta tu saldo como un gasto regular (dinero que sale).

## Pedir prestado

### Paso a paso

1. Ve a **Transacciones**, cambia a la pestana **Ingresos** y toca **+**
2. Ingresa el **monto** que estas pidiendo prestado
3. Ingresa una **descripcion** (ej. «Prestamo de Maria»)
4. Activa el interruptor **Pedi prestado**
5. Ingresa el **nombre del contacto** — a quien le pides prestado
6. Opcionalmente establece una **fecha de vencimiento** — cuando debes devolver
7. Toca **Guardar ingreso**

El ingreso se marcara como deuda y aparecera en la pantalla de Deudas y Prestamos.

> **Nota:** El monto afecta tu saldo como ingreso regular (dinero que entra).

## Registrar un reembolso

### Cuando alguien te devuelve dinero (por dinero prestado)

1. Abre el **gasto** original (el prestamo que diste)
2. Toca **Registrar reembolso**
3. Seras redirigido a un formulario de nuevo ingreso prellenado con el nombre del contacto y la moneda
4. Ingresa el **monto del reembolso** (puede ser parcial)
5. Toca **Guardar ingreso**

### Cuando tu devuelves dinero (por dinero tomado en prestamo)

1. Abre el **ingreso** original (el prestamo que recibiste)
2. Toca **Registrar reembolso**
3. Seras redirigido a un formulario de nuevo gasto prellenado con el nombre del contacto y la moneda
4. Ingresa el **monto del reembolso** (puede ser parcial)
5. Toca **Guardar gasto**

> **Consejo:** Puedes registrar multiples reembolsos parciales. El saldo restante se actualiza automaticamente.

## Pantalla de Deudas y Prestamos

Accede a la pantalla de Deudas y Prestamos desde **Ajustes > Deudas y Prestamos** o tocando el widget de deudas en el Panel.

### Tarjetas de resumen

En la parte superior de la pantalla, dos tarjetas muestran:
- **Te deben** — monto total pendiente que te deben (verde)
- **Debes** — monto total pendiente que debes (rojo)

Los montos se convierten automaticamente a tu moneda base usando tasas de cambio actuales.

### Pestanas

Cambia entre dos vistas:
- **Dinero prestado** — deudas donde prestaste dinero a otros
- **Dinero tomado** — deudas donde pediste dinero prestado

### Filtros

Filtra deudas por estado:
- **Todas** — mostrar todas las deudas
- **Activas** — solo deudas con saldo pendiente
- **Vencidas** — solo deudas con fecha vencida
- **Pagadas** — solo deudas completamente reembolsadas

### Tarjeta de deuda

Cada deuda muestra:
- **Nombre del contacto** — con quien esta la deuda
- **Descripcion** — motivo de la deuda
- **Distintivo de estado** — Activa (azul), Vencida (rojo) o Pagada (verde)
- **Monto original** — el monto inicial de la deuda en moneda original
- **Monto restante** — cuanto falta por pagar
- **Barra de progreso** — indicador visual del progreso de reembolso (porcentaje)
- **Fecha de vencimiento** — cuando vence la deuda (si se establecio)

Toca una tarjeta de deuda para ver los detalles completos del gasto o ingreso y registrar reembolsos.

## Notificaciones push

Si una deuda tiene una fecha de vencimiento, la app envía notificaciones push automáticas:

- **3 días antes del vencimiento** — recordatorio: "Deuda en 3 días: Juan"
- **Al día siguiente del vencimiento** — alerta de vencimiento: "Deuda vencida: Juan"

Las notificaciones se envían al propietario de la deuda (quien la registró), no a la contraparte.

Para habilitar o deshabilitar los recordatorios, ve a **Configuración → Notificaciones → Recordatorios de deudas**.

## Widget en el panel

El widget de Deudas y Prestamos siempre es visible en el Panel (cuando esta habilitado en los ajustes de widgets):

- **Cuando tienes deudas:** muestra los totales «Te deben» y «Debes», ademas de un boton **+** para navegar rapidamente a la pantalla de Deudas y Prestamos
- **Cuando no tienes deudas:** muestra un estado vacio con un boton **Agregar deuda** para comenzar

Toca el widget para ir directamente a la pantalla de Deudas y Prestamos.

## Soporte multidivisa

Las deudas pueden estar en cualquier moneda compatible. Los totales en el Panel y la pantalla de Deudas se convierten automaticamente a tu moneda base con tasas de cambio en tiempo real. Las tarjetas individuales siempre muestran montos en la moneda original.

## Preguntas frecuentes

- **P: ¿Puedo prestar dinero en una moneda y recibir el reembolso en otra?**
  **R:** Los reembolsos se registran en la misma moneda que la deuda original para garantizar un seguimiento preciso.

- **P: ¿Prestar dinero afecta mi presupuesto?**
  **R:** Si, prestar se registra como gasto y pedir prestado como ingreso. Afectan tu saldo y seguimiento de presupuesto como cualquier otra transaccion.

- **P: ¿Puedo editar una deuda despues de crearla?**
  **R:** Si, toca la deuda para ver sus detalles y usa el boton Editar. Puedes cambiar la descripcion, nombre del contacto y fecha de vencimiento.

- **P: ¿Que pasa cuando una deuda se paga completamente?**
  **R:** El estado cambia automaticamente a «Pagada» y la barra de progreso muestra 100%. La deuda permanece en tu historial como referencia.

- **P: ¿Como elimino una deuda?**
  **R:** Abre los detalles de la deuda y toca Eliminar. Ten en cuenta que esto tambien elimina la entrada de gasto o ingreso asociada.

---

*Ver tambien: [Gastos e Ingresos](./03-expenses-and-income.md) | [Billetera y Cambio de divisa](./10-wallet-and-exchange.md)*
