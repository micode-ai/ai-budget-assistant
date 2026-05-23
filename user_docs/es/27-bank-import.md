# Importar transacciones desde su banco

> Importe transacciones directamente desde exportaciones CSV de los principales bancos polacos o de cualquier banco usando el mapeador universal de columnas.

## Bancos compatibles

Puede importar transacciones directamente desde exportaciones CSV de los principales bancos polacos: **mBank, PKO BP, ING Bank Śląski, Bank Millennium, Pekao SA**. Para cualquier otro banco, el mapeador universal de columnas le permite describir el formato manualmente.

## Cómo importar

1. Vaya a **Ajustes → Importar transacciones**
2. Seleccione su banco de la lista (o "Otro (CSV personalizado)" para bancos no compatibles)
3. Seleccione el archivo CSV exportado desde la banca en línea de su banco
4. La aplicación muestra una vista previa con cada fila marcada como gasto, ingreso o cambio de divisa
5. Desmarque las filas que no desee y pulse **Importar**

La aplicación recuerda qué filas ya han sido importadas por fecha, importe y descripción — subir el mismo CSV dos veces no creará duplicados.

## Dónde encontrar el CSV en su banco

- **mBank**: Banca web → Historia operacji → Eksport → CSV
- **PKO BP**: iPKO → Lista operacji → Pobierz → CSV
- **ING Bank Śląski**: Moje ING → Historia → Eksportuj → CSV
- **Bank Millennium**: Web → Historia rachunku → Eksport → CSV
- **Pekao SA**: Pekao24 → Historia → Eksport → CSV

## Qué se importa

Cada fila se convierte en un Gasto, un Ingreso o un Cambio de divisa (cuando la app detecta una transacción FX emparejada en la misma fecha con diferentes divisas). Las categorías se sugieren automáticamente para los comercios más habituales (Biedronka, Żabka, Orlen, Lidl, etc.) — puede modificarlas posteriormente.

## "Otro" — mapeador universal de CSV

Si su banco no está en la lista, elija "Otro (CSV personalizado)". La aplicación muestra una vista previa del archivo y le pide que indique qué columna contiene la fecha, el importe y la descripción. Puede guardar este mapeo con un nombre y el próximo CSV con el mismo diseño de columnas se importará automáticamente.

## Codificación

La aplicación detecta automáticamente UTF-8 y Windows-1250 (la codificación más habitual de los bancos polacos). Si la vista previa muestra caracteres polacos ilegibles, seleccione la codificación manualmente en el mapeador.

---

*Véase también: [Importación de Wise](./26-wise-import.md) | [Gastos e ingresos](./03-expenses-and-income.md) | [Ajustes](./11-settings.md)*
