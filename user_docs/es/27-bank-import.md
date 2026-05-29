# Importar transacciones desde tu banco

> Importa transacciones desde un extracto CSV o PDF de tu banco. Compatible con mBank, PKO BP, Erste Bank, Alior Bank, Wise y cualquier otro banco mediante el mapeador universal de columnas.

## Bancos compatibles

- **mBank** — exportación CSV
- **PKO BP** — exportación CSV
- **Erste Bank** — extracto PDF
- **Alior Bank** — extracto PDF
- **Wise** — exportación CSV (multidivisa, conversiones FX detectadas automáticamente)
- **Otro** — cualquier banco, mediante el mapeador universal de columnas (CSV)

## Cómo importar

1. Ve a **Ajustes → Importar transacciones**
2. Elige tu banco de la lista (o **Otro (CSV)** si no está)
3. Selecciona el archivo exportado desde tu banco
4. La app muestra una vista previa — cada fila marcada como gasto, ingreso o cambio de divisa
5. Desmarca las filas que no quieras y toca **Importar**

La app omite filas que ya existen en la cuenta, comparando por fecha, importe y divisa.

## Dónde encontrar el export en tu banco

- **Wise**: wise.com → Transactions → Statements and Reports → elige rango de fechas → CSV → elige divisa/saldo → Descargar

> **Consejo Wise:** Wise genera un CSV por saldo de divisa. Importa cada divisa por separado. Hasta 469 días por exportación.

## Wise — conversiones de divisas y comisiones

Al convertir divisas en Wise (p.ej. 100 USD → EUR) se crean dos filas. La app detecta estos pares automáticamente y crea un único registro de **Cambio de divisa** (Cartera → Cambios).

Las comisiones de Wise de la columna `Total fees` se incluyen automáticamente en el importe del gasto.

## Qué se importa

Cada fila se convierte en un Gasto, Ingreso o Cambio de divisa. Las categorías se sugieren automáticamente para comercios populares. Cada fila tiene un ID único — reimportar el mismo archivo es seguro.

## «Otro» — mapeador universal

Si tu banco no está en la lista, elige **Otro (CSV)**. La app muestra una vista previa y te pide indicar qué columna contiene la fecha, el importe y la descripción. Guarda este mapeo para importaciones futuras.

## Historial de importaciones y Deshacer

La sección **Importaciones anteriores** muestra las últimas 20 importaciones. Toca la **flecha de deshacer** (↩) para revertir una importación. Todas las transacciones de ese lote se eliminarán.

- Deshacer disponible durante **30 días** desde la importación.

## ¿No ves tu banco?

Al final de **Ajustes → Importar transacciones** hay una tarjeta **«¿No ves tu banco?»**. Tócala, escribe el nombre del banco y adjunta un extracto de ejemplo.

---

*Ver también: [Gastos e ingresos](./03-expenses-and-income.md) | [Cartera y cambio](./10-wallet-and-exchange.md) | [Ajustes](./11-settings.md)*
