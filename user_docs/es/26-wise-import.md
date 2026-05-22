# Importar desde Wise

> Trae todo tu historial de transacciones de Wise a la app de una sola vez. Sube un extracto CSV y la app creará automáticamente los gastos, ingresos y conversiones de divisa correspondientes.

## Resumen

Si usas Wise, **Importar desde Wise** te permite cargar un extracto entero en tu cuenta en un solo paso. Se acabó escribir transacciones una por una — descarga un CSV desde Wise, dáselo a la app, y revisa lo que se va a crear antes de confirmar.

La importación cubre tres tipos de registros:

- **Gastos** — dinero que salió de tu saldo de Wise (cargos)
- **Ingresos** — dinero que entró (abonos)
- **Conversiones de divisa** — cuando cambiaste entre saldos dentro de Wise (p. ej. USD → EUR)

Cada transacción importada queda marcada para que la app sepa que viene de Wise — si subes el mismo extracto dos veces, los duplicados se detectan y omiten automáticamente.

## Paso 1 — Exporta un CSV desde Wise

1. Abre Wise (web en **wise.com** o la app móvil de Wise).
2. Ve a **Transactions → Statements and Reports**.
3. Elige el **rango de fechas** (hasta 469 días por archivo).
4. Elige **CSV** como formato y selecciona la divisa / saldo que quieras.
5. Descarga el archivo en tu teléfono.

> **Consejo:** Wise genera un CSV por cada divisa. Si quieres importar varias divisas, repite la exportación para cada una e impórtalas una tras otra.

## Paso 2 — Importa en la app

1. Abre la app y ve a **Ajustes → Importar desde Wise**.
2. Toca **Elegir archivo CSV** y selecciona el archivo que acabas de descargar.
3. La app procesa el archivo (normalmente en menos de un segundo) y te muestra una vista previa.

## Paso 3 — Revisa y confirma

La vista previa muestra cada transacción del CSV con una casilla.

- Los **gastos** aparecen con un icono rojo hacia abajo, los **ingresos** con un icono verde hacia arriba y las **conversiones de divisa** con un icono de intercambio y ambos lados de la operación (p. ej. `120.00 USD → 109.50 EUR`).
- Junto a comercios conocidos (Uber, Bolt, Lidl, Starbucks, Amazon, Netflix, etc.) aparece una pequeña **etiqueta de categoría sugerida**. Si ya existe una categoría con el mismo nombre en la cuenta activa, se asigna automáticamente.
- Las filas que ya importaste en una carga anterior aparecen **atenuadas y marcadas como "Ya importado"** — no se pueden seleccionar de nuevo, lo que te protege de duplicados.
- Desmarca lo que no quieras importar (p. ej. transferencias entre tus propias cuentas).

Cuando la selección sea correcta, toca **Importar N filas**. La app guarda todo en una única operación — o se crean todas las filas seleccionadas, o ninguna.

## Qué se guarda

| Campo | De dónde sale |
|---|---|
| Fecha | Columna `Date` |
| Importe | `Amount` (absoluto) + `Total fees` incluido |
| Divisa | Columna `Currency` |
| Descripción | `Description`, o en su defecto `Merchant` o `Payment Reference` |
| Categoría | Sugerida por el comercio si se reconoce; si no, ninguna |
| Origen | Marcado como `import` para que puedas filtrarlo en analíticas |

## Conversiones de divisa

Cuando la misma transferencia de Wise toca dos divisas (p. ej. conviertes 100 USD a euros), Wise emite dos filas — un cargo en USD y un abono en EUR. La app reconoce esos pares por la `Payment Reference` compartida y crea un único registro de **Conversión de divisa** en lugar de dos transacciones independientes. La conversión aparece en **Billetera → Cambios** con el tipo de cambio correcto.

## Re-importar

Volver a subir el mismo CSV es seguro. Cada fila lleva su `TransferWise ID` de Wise, y la app se niega a crear un segundo registro para un ID que ya importó. Esto significa que:

- Puedes volver a exportar un rango más amplio y subirlo — solo se crean las filas nuevas.
- Puedes detener una vista previa a la mitad y empezar de nuevo más tarde — las filas que ya confirmaste se recuerdan.

## Preguntas frecuentes

- **P: ¿Funciona con otros bancos?**
  **R:** Por ahora solo se admiten exportaciones CSV de Wise. Otros bancos pueden usar columnas distintas. Abre una solicitud de funcionalidad si quieres que añadamos otro banco.

- **P: ¿Puedo importar un extracto PDF o XLSX?**
  **R:** Todavía no. Exporta los extractos de Wise en formato CSV.

- **P: ¿Se sube el archivo a algún lugar que deba preocuparme?**
  **R:** El CSV se envía al servidor de AI Budget Assistant, se procesa en memoria y se descarta tan pronto como se genera la vista previa. Solo se almacenan las filas estructuradas que confirmes — no el archivo original.

- **P: ¿Qué pasa con las comisiones que Wise me cobró?**
  **R:** Wise reporta las comisiones en una columna `Total fees` separada. La app las suma al mismo gasto para que el total coincida con lo que realmente salió de tu saldo.

- **P: Importé las filas equivocadas — ¿puedo deshacerlo?**
  **R:** Sí. Las filas importadas son gastos/ingresos normales — abre cada uno y bórralo como cualquier otra transacción. Una vez borrado, puedes volver a importar la misma fila más tarde.

- **P: Mi CSV no tiene cabecera / tiene otro formato. ¿Qué hago?**
  **R:** Asegúrate de haber exportado desde **Transactions → Statements and Reports → CSV**. El formato heredado "Activity Export" es diferente y no se admite.

- **P: ¿Se mantienen mis categorías de Wise?**
  **R:** La categorización propia de Wise se usa parcialmente para sugerir categorías de comercios conocidos. La app no crea categorías nuevas automáticamente — si no hay coincidencia, la fila se importa sin categoría y puedes asignarla luego.

---

*Ver también: [Gastos e ingresos](./03-expenses-and-income.md) | [Billetera y cambio](./10-wallet-and-exchange.md) | [Cuentas](./09-accounts.md) | [Ajustes](./11-settings.md)*
