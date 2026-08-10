# Importar transacciones desde tu banco

> Importa transacciones desde un extracto CSV, XLSX o PDF de tu banco. Compatible con mBank, PKO BP, Erste Bank, Alior Bank, Revolut, Wise y cualquier otro banco mediante el mapeador universal de columnas.

## Bancos compatibles

- **mBank** — exportación CSV
- **PKO BP** — exportación CSV
- **Erste Bank** — extracto PDF
- **Alior Bank** — extracto PDF
- **Revolut** — exportación CSV
- **Wise** — exportación CSV (multidivisa, conversiones FX detectadas automáticamente)
- **Otro** — cualquier banco, mediante el mapeador universal de columnas (CSV)
- **Hojas de cálculo** — los extractos XLSX también funcionan; la app lee la primera hoja

## Cómo importar

1. Ve a **Ajustes → Importar transacciones**
2. Elige tu banco de la lista (o **Otro (CSV)** si no está)
3. Selecciona el archivo exportado desde tu banco
4. La app muestra una vista previa — cada fila marcada como gasto, ingreso o cambio de divisa
5. Desmarca las filas que no quieras y toca **Importar**

La app omite filas que ya existen en la cuenta, comparando por fecha, importe y divisa.

## Dónde encontrar el export en tu banco

- **Revolut**: app de Revolut → Statements → elige rango de fechas → CSV → Descargar
- **Wise**: wise.com → Transactions → Statements and Reports → elige rango de fechas → CSV → elige divisa/saldo → Descargar

> **Consejo Wise:** Wise genera un CSV por saldo de divisa. Importa cada divisa por separado. Hasta 469 días por exportación.

## Wise — conversiones de divisas y comisiones

Al convertir divisas en Wise (p.ej. 100 USD → EUR) se crean dos filas. La app detecta estos pares automáticamente y crea un único registro de **Cambio de divisa** (Cartera → Cambios).

Las comisiones de Wise de la columna `Total fees` se incluyen automáticamente en el importe del gasto.

## Qué se importa

Cada fila se convierte en un Gasto, Ingreso o Cambio de divisa. Las categorías se sugieren automáticamente para comercios populares. Cada fila tiene un ID único — reimportar el mismo archivo es seguro.

**Nombres de comercios más claros.** Las cadenas de tiendas conocidas se reconocen automáticamente, de modo que una línea del extracto como `BIEDRONKA 1234 WARSZAWA` se guarda simplemente como **Biedronka**. Así, una misma tienda aparece como un único comercio en tus análisis, en lugar de docenas de entradas separadas.

## «Otro» — mapeador universal

Si tu banco no está en la lista, elige **Otro (CSV)**. La app muestra una vista previa y te pide indicar qué columna contiene la fecha, el importe y la descripción. Guarda este mapeo para importaciones futuras.

## Cuando nada reconoce tu extracto

Si ninguno de los bancos anteriores encaja y el archivo no tiene un diseño de columnas simple que la app pueda adivinar por sí sola, puede pedirle a un modelo de IA que determine las columnas por ti: cuál es la fecha, cuál es el importe, etc.

**Antes de enviar nada, se te pregunta una vez.** La primera vez que esto ocurre en una cuenta, verás una pantalla que explica qué sale de tu dispositivo: para un CSV o una hoja de cálculo, solo la fila de encabezado y hasta 10 filas de ejemplo — nunca el archivo completo. Para un extracto en PDF, son las primeras 20 líneas de texto extraído. Decides una vez por cuenta; después, la app recuerda tu elección.

- **Acepta**, y el archivo se vuelve a leer con las columnas que determinó el modelo.
- **Rechaza**, y pasas directamente al mapeador manual descrito arriba. Rechazar ocurre antes de que se analice nada, así que todavía no hay nada que rellenar — asignas las columnas igual que con cualquier otro banco no compatible.

**El resultado se muestra, no se da por hecho.** Cuando la correspondencia por IA tiene éxito, la vista previa muestra una fila de chips sobre tus transacciones — algo como `Fecha → Data operacji`, `Importe → Kwota` — junto con su suposición sobre qué banco es. Es una suposición fundamentada, no una certeza: toca la fila en cualquier momento para abrir el mapeador y corregir una columna que haya identificado mal.

**Hay algunas cosas que se señalan para que las revises, no que se asuman en silencio:**
- Si el archivo no tiene ninguna columna de divisa, cada fila se interpreta en la divisa de tu propia cuenta, y un aviso te lo indica — tócalo para cambiar la divisa antes de importar; el cambio se aplica a todo el archivo.
- Leer números de un PDF es más difícil de verificar que en un CSV, así que la app intenta confirmar que lo encontrado cuadra con el saldo final del extracto. Cuando no puede confirmarlo, verás un aviso pidiéndote que revises la lista. Esto no es un error: es simplemente el caso habitual cuando un extracto no imprime un saldo corriente con el que comparar, o cuando la comprobación no cuadra.

**Los extractos en PDF requieren un plan Pro.** Leer un PDF con IA exige más procesamiento que un CSV, así que es una función Pro: una cuenta gratuita ve ahí una pantalla de mejora de plan en lugar de un mensaje de error.

Los bancos ya listados arriba (mBank, PKO BP, Erste, Alior, Revolut, Wise) no se ven afectados por nada de esto — se importan exactamente como se describe antes en esta página.

## Historial de importaciones y Deshacer

La sección **Importaciones anteriores** muestra las últimas 20 importaciones. Toca la **flecha de deshacer** (↩) para revertir una importación. Todas las transacciones de ese lote se eliminarán.

- Deshacer disponible durante **30 días** desde la importación.

## ¿No ves tu banco?

Al final de **Ajustes → Importar transacciones** hay una tarjeta **«¿No ves tu banco?»**. Tócala, escribe el nombre del banco y adjunta un extracto de ejemplo.

---

*Ver también: [Gastos e ingresos](./03-expenses-and-income.md) | [Cartera y cambio](./10-wallet-and-exchange.md) | [Ajustes](./11-settings.md)*
