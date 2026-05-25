# Importar transacciones desde su banco

> Importe transacciones desde un archivo CSV o un extracto en PDF de su banco, o desde cualquier banco usando el mapeador universal de columnas.

## Bancos compatibles

- **mBank** — exportación CSV
- **PKO BP** — exportación CSV
- **Erste Bank** — extracto en PDF
- **Alior Bank** — extracto en PDF
- **Wise** — exportación CSV (consulte [Importación de Wise](./26-wise-import.md))
- **Other** — cualquier banco, mediante el mapeador universal de columnas (CSV)

Se añaden más bancos con el tiempo. Si el suyo no aparece en la lista, use **Other** y asigne las columnas manualmente.

## Cómo importar

1. Vaya a **Ajustes → Importar transacciones**
2. Seleccione su banco de la lista (o **Other (custom CSV)** si no aparece)
3. Seleccione el archivo exportado desde su banco — un **CSV** para mBank/PKO, un extracto **PDF** para Erste/Alior
4. La aplicación muestra una vista previa con cada fila marcada como gasto, ingreso o cambio de divisa
5. Desmarque las filas que no desee y pulse **Importar**

La aplicación omite las filas que ya existen en su cuenta — tanto si las importó antes como si las añadió manualmente — comparando fecha, importe y divisa, de modo que importar el archivo no creará duplicados. Las filas coincidentes aparecen desmarcadas por defecto; márquelas de nuevo si se trata de una transacción realmente distinta.

## Dónde encontrar el archivo en su banco

- **mBank**: Banca web → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Historia operacji → Eksportuj → CSV
- **Erste Bank**: bankowość internetowa → Wyciągi → pobierz wyciąg (PDF)
- **Alior Bank**: Alior Online → Wyciągi → pobierz wyciąg (PDF)

## Qué se importa

Cada fila se convierte en un Gasto, un Ingreso o un Cambio de divisa (cuando la aplicación detecta una transacción FX emparejada en la misma fecha con diferentes divisas). Las categorías se sugieren automáticamente para los comercios más habituales (Biedronka, Żabka, Orlen, Lidl, Rossmann, etc.) — puede modificarlas posteriormente.

## "Other" — mapeador universal de CSV

Si su banco no está en la lista, elija **Other (custom CSV)**. La aplicación muestra una vista previa del archivo y le pide que indique qué columna contiene la fecha, el importe y la descripción. Puede guardar este mapeo con un nombre y el próximo CSV con el mismo diseño de columnas se importará automáticamente.

## Importaciones pasadas y deshacer

La sección **Importaciones pasadas** en la parte inferior de **Ajustes → Importar transacciones** muestra las últimas 20 importaciones — banco de origen, fecha y número de transacciones creadas.

Para deshacer una importación reciente, toca la **flecha de deshacer** (↩) en el lado derecho de la fila. Se pedirá confirmación antes de eliminar nada.

- Deshacer está disponible durante **30 días** desde la importación original.
- Todas las transacciones de esa importación se eliminan de tu cuenta.
- El bloqueo de deduplicación se elimina para que puedas volver a importar el mismo archivo.
- Las importaciones de más de 30 días no muestran el botón de deshacer.

## ¿No ve su banco?

En la parte inferior de **Ajustes → Importar transacciones** hay una tarjeta **"¿No ve su banco?"**. Púlsela, introduzca el nombre del banco y adjunte un ejemplo del extracto que le proporciona (CSV o PDF). Envíelo y lo usaremos para añadir compatibilidad con ese banco. Su solicitud va directamente a nuestro equipo — no se publica nada públicamente.

## Codificación

Para archivos CSV, la aplicación detecta automáticamente UTF-8 y Windows-1250 (la codificación más habitual de los bancos polacos). Si la vista previa muestra caracteres polacos ilegibles, seleccione la codificación manualmente en el mapeador. Los extractos en PDF se leen directamente — no es necesario elegir codificación.

---

*Véase también: [Importación de Wise](./26-wise-import.md) | [Gastos e ingresos](./03-expenses-and-income.md) | [Ajustes](./11-settings.md)*
