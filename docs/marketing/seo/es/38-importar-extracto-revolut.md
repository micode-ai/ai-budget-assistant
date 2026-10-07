---
title: "Importar el extracto de Revolut a tu presupuesto"
meta_description: "Cómo importar el extracto CSV de Revolut a una app de presupuesto: exportación, vista previa, cambios de divisa unificados y sin duplicados al reimportar."
target_keyword: "importar extracto revolut"
slug: "importar-extracto-revolut"
pair: "import-revolut"
lang: "es"
date: "2026-10-07"
---

# Importar el extracto de Revolut a tu presupuesto en unos minutos

Para importar un extracto de Revolut, genera un extracto en CSV en la app de Revolut y, en AI Budget Assistant, abre Ajustes → Importar transacciones → Revolut y elige el archivo. Verás una vista previa con categorías sugeridas, duplicados desmarcados y cambios de divisa unidos en un solo movimiento. Todo en pocos minutos.

Revolut es de los bancos más fáciles de importar: su CSV tiene un diseño de columnas fijo e indica la divisa de cada fila. Aquí tienes qué lee exactamente la app y en qué fijarte.

## ¿Cómo exporto un extracto desde Revolut?

En la app de Revolut abre los extractos de tu cuenta (en la interfaz en inglés la sección se llama Statements), elige el periodo y el formato CSV, y descarga el archivo en tu móvil u ordenador. Revolut cambia los nombres de los botones de vez en cuando; si la pantalla es distinta, busca la opción que genera un extracto y te deja elegir CSV.

Un buen hábito: la primera vez descarga un periodo largo, de tres a seis meses. Reimportar periodos que se solapan es seguro, porque la app reconoce lo que ya tiene.

## ¿Cómo importo el archivo paso a paso?

1. **Descarga el CSV de Revolut** en el dispositivo donde usas la app.
2. En AI Budget Assistant, ve a **Ajustes → Importar transacciones**.
3. Elige **Revolut** en la lista (o **Detectar automáticamente (cualquier banco)**, que reconoce el diseño de Revolut por sus cabeceras).
4. Selecciona el archivo. La app muestra una vista previa: cada fila como gasto, ingreso o cambio de divisa, con categoría sugerida.
5. Desmarca las filas que no quieras, corrige categorías y pulsa **Importar**.

En la vista previa verás contadores de filas seleccionadas y ya importadas. Las que la app ya conoce aparecen desmarcadas por defecto.

## ¿Qué lee la app de un archivo de Revolut?

| Elemento | Tratamiento |
|---|---|
| Formato | CSV separado por comas, cabeceras en la primera fila |
| Columnas | Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance |
| Fecha | De Started Date (solo la fecha, sin hora) |
| Importe | Con signo: negativo es gasto, positivo es ingreso |
| Divisa | Por fila, así una cuenta multidivisa no mezcla monedas |
| Estado | Solo se importan filas COMPLETED; las rechazadas y pendientes se omiten |
| Cambio de divisa | Dos filas EXCHANGE con la misma fecha y signos opuestos se unen en un cambio de divisa |
| Comercio | De Description, con nombre normalizado para las cadenas conocidas |

## ¿Qué pasa con los cambios de divisa y las cuentas multidivisa?

Una cuenta de Revolut suele tener varias divisas. Si cambias eslotis por euros, el archivo trae dos filas: una salida en una divisa y una entrada en otra. Contadas por separado, crearían un gasto falso y un ingreso falso. Por eso la app las empareja y guarda un único **cambio de divisa**, visible en la Cartera y no en tus gastos.

Las compras en divisas extranjeras se quedan en su propia divisa.

## ¿Cómo evito duplicados y qué hago si algo sale mal?

La app te protege de dos maneras. Primero, cada fila recibe un identificador único formado por fecha, importe y descripción, así que importar el mismo archivo otra vez no añade nada. Segundo, compara fecha, importe y divisa con las transacciones de tu cuenta, también las manuales, y desmarca las repeticiones probables.

Dos compras idénticas el mismo día, como dos cafés al mismo precio, se conservan como dos transacciones. Si no te convence el resultado, en el historial de importaciones, al final de la pantalla, puedes deshacerlo con un toque durante 30 días y volver a importar el mismo archivo.

Para la mecánica general, lee [Importar extracto bancario](/blog/es/importar-extracto-bancario/). Si tu banco no está en la lista, mira [Importar extracto de cualquier banco](/blog/es/importar-extracto-de-cualquier-banco/).

## ¿Es seguro?

Nunca introduces tu usuario ni contraseña de Revolut. Importas un archivo estático que descargaste tú, así que la app solo ve el historial de ese archivo. Puedes probar AI Budget Assistant gratis en [ai-budget.pl](https://ai-budget.pl) o en [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: Importar el extracto de Revolut

**¿Qué formato de extracto de Revolut necesito?**

CSV. Es el archivo con las columnas Type, Started Date, Description, Amount, Currency, State y Balance que Revolut genera en la sección de extractos de tu cuenta. Un PDF solo se puede leer mediante lectura con IA, que es una función Pro, así que para importaciones habituales elige CSV.

**¿Se importan las transacciones rechazadas o pendientes?**

No. Solo se toman las filas con estado COMPLETED. Un pago con tarjeta rechazado no restará de tu presupuesto, y uno pendiente aparecerá en un extracto posterior cuando se liquide.

**¿Un cambio de divisa en Revolut cuenta como gasto?**

No. Dos filas de cambio con la misma fecha y signos opuestos se unen en un cambio de divisa en la Cartera. No infla ni los gastos ni los ingresos.

**¿Puedo importar el mismo extracto dos veces?**

Sí, y no se duplicará nada. Las filas repetidas se reconocen y se desmarcan en la vista previa como ya importadas.

**¿Puedo deshacer una importación de Revolut?**

Sí. En el historial de importaciones, al final de la pantalla de importación, toca la flecha de deshacer junto a la importación. Funciona durante 30 días y después puedes importar el mismo archivo de nuevo.
