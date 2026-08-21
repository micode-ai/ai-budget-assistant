---
title: "Qué pasa si tu banco no está en la lista"
meta_description: "¿Tu banco no está en la lista? Descubre cómo la IA detecta las columnas de un CSV o lee un extracto en PDF para poder importar casi cualquier banco."
target_keyword: "importar extracto de cualquier banco"
slug: "importar-extracto-de-cualquier-banco"
pair: "ai-bank-import"
lang: "es"
date: "2026-08-20"
---

# Qué pasa si tu banco no está en la lista

Subes el archivo esperando que la app coloque las columnas sola, y en cambio te aparece una pantalla para mapearlas o, peor, una lista de transacciones vacía. Tu banco simplemente no es de los que la app reconoce a la primera. Es una decepción habitual, sobre todo cuando por fin te decides a ponerte al día con varios meses de gastos en una sola importación, y el archivo de un banco menos conocido, una casa de cambio o una cooperativa de crédito local no encaja en columnas ordenadas.

La buena noticia es que "no está en la lista" no significa "no se puede importar". Este artículo explica exactamente qué pasa por debajo cuando AI Budget Assistant no reconoce el formato de un archivo, y por qué el mecanismo que entra en juego es más seguro de lo que parece a primera vista.

## Por qué ninguna lista de bancos está nunca completa

Cualquier app de presupuesto que admita importación tiene que decidir de entrada qué bancos reconoce directamente. AI Budget Assistant detecta automáticamente mBank, PKO, Revolut, ING, Millennium y Pekao, además de Wise y los extractos en PDF de Erste y Alior. Eso cubre la mayoría de las cuentas habituales en Polonia, pero las cuentas bancarias no se limitan a los grandes nombres. Hay bancos más pequeños, cuentas de empresa con una exportación poco habitual, cuentas en el extranjero y exportaciones de otras apps financieras que alguien intenta traerse al cambiar de herramienta.

Mantener un analizador propio para cada uno de esos formatos para siempre no es viable, y cualquier formato nuevo seguiría siendo "no compatible" durante un tiempo hasta que alguien lo notara y escribiera una regla para él. Por eso, en lugar de esperar a que la lista crezca hasta incluir tu banco, la app tiene un mecanismo que intenta entender por sí solo la estructura de un archivo que nunca ha visto.

## Qué pasa cuando un archivo no se reconoce

Cuando subes un CSV o una hoja XLSX y ninguno de los analizadores integrados reconoce su estructura, entra en juego un modelo de IA. Su tarea es estrecha y concreta: no lee importes ni fechas por su cuenta, solo señala **qué columna es cuál** - cuál contiene la fecha de la operación, cuál el importe, cuál la descripción o el nombre del comercio. Esos nombres de columna se comprueban después, palabra por palabra, contra las cabeceras que realmente existen en tu archivo. Si el modelo "se inventara" una columna que no está en el archivo, se descarta toda la respuesta, no se acepta en silencio. Solo después de esa comprobación, las mismas reglas deterministas que gestionan el mapeo manual de columnas leen de verdad los números y las fechas del archivo.

Para los extractos en PDF, que es una función del plan Pro, el mecanismo funciona de otra forma, porque de un PDF no se pueden extraer nombres de columna sin más - el modelo tiene que extraer directamente las filas de transacciones del texto que se ha sacado de la página. Es el mismo tipo de tarea que ya hacían los analizadores escritos a mano para Erste o Alior, solo que en vez de código dedicado para cada banco, el modelo se las arregla con un formato que nadie ha descrito todavía.

## Lo que este mecanismo nunca hace

Esta distinción importa, porque es fácil pensar que "la IA importa el extracto" significa que el modelo se limita a adivinar las cifras. No es así. En CSV y XLSX, el modelo nunca devuelve un importe ni una fecha - solo devuelve nombres de columna, y esos siempre se comprueban contra las cabeceras reales de tu archivo. Los números y las fechas los lee el mismo código predecible que lleva años gestionando el mapeo manual. Eso convierte al mecanismo en una ayuda para reconocer la estructura, no en alguien que apunta tus gastos a ojo.

Aun así, no es garantía de acierto total a la primera - ningún mecanismo de reconocimiento de formato lo es. Por eso, antes de que nada llegue a tu presupuesto, tienes una previsualización para revisarlo, de lo que hablamos a continuación.

## Lo que ves y aceptas antes de que salga nada de tu teléfono

Antes de que cualquier parte del archivo llegue al modelo de IA, la app pide tu consentimiento, una sola vez por cuenta, y te muestra exactamente qué se va a enviar. Para un archivo CSV o XLSX, es la fila de cabecera más hasta diez filas de ejemplo, no el archivo entero ni todo tu historial de transacciones. Para un extracto en PDF, son las primeras veinte líneas de texto extraídas. Lo ves en la pantalla de consentimiento antes de que ocurra nada, así que la decisión es informada y no un valor por defecto.

Si tu cuenta tiene cifrado de extremo a extremo completo (el modo de privacidad total de la app), este mecanismo no se activa en absoluto. Los datos que la propia app no puede descifrar tampoco pueden enviarse a ningún modelo de IA, así que esas cuentas solo tienen disponible el mapeo manual de columnas - más seguro, aunque exige un toque más.

## Revisas y corriges antes de que se guarde nada

Después de que el modelo proponga un mapeo, no ves un resultado en bruto sin contexto. Ves una fila de "chips" editables que muestran lo que reconoció, algo como "Fecha → Data operacji" o "Importe → Suma transakcji". Si alguno está mal, la opción "¿Mal? Corrígelo" abre el mismo mapeador manual de columnas, ya rellenado con la propuesta del modelo, así que corriges una columna en lugar de empezar de cero.

Esta es la misma etapa de previsualización que acompaña a cualquier importación en AI Budget Assistant, ya sea que el banco se reconociera al instante o solo con ayuda de la IA: una lista completa de transacciones para revisar antes de que nada llegue a tu presupuesto, con categorías ya sugeridas automáticamente según el comercio.

## La segunda vez va más rápido

Cuando el mapeo de columnas de un formato concreto resulta correcto, su estructura -los nombres de columna en sí y cómo se escriben las fechas, sin ninguno de tus datos personales o de transacciones- se guarda en un diccionario global de formatos. La siguiente persona que suba un extracto de ese mismo banco ni siquiera necesita el paso de la IA: el formato ya se reconoce a la primera, igual que mBank o PKO. En cierto sentido, eres tú quien "desbloquea" tu formato para todos los que vengan después.

## Cómo probarlo

Si tienes por ahí un archivo de un banco con el que te rendiste antes porque la app no lo reconocía, merece la pena intentarlo de nuevo. Sube el CSV, el XLSX o el PDF a [AI Budget Assistant](https://ai-budget.pl), y si ninguno de los analizadores integrados lo reconoce, verás la pantalla de consentimiento descrita arriba en lugar de una lista vacía. Después de aceptar, obtienes una previsualización con un mapeo propuesto para revisar, igual que en cualquier otra importación.

El proceso completo de importar un extracto, desde conseguir el archivo de tu banco hasta evitar duplicados al reimportar, está en nuestra guía sobre [cómo importar un extracto bancario a tu app de presupuesto](/blog/es/importar-extracto-bancario/). Si prefieres no ocuparte de archivos y que la app registre los gastos directamente desde los avisos de pago de tu banco, mira cómo funciona [registrar gastos automáticamente](/blog/es/registrar-gastos-automaticamente/). La app es gratis en el navegador en [ai-budget.pl](https://ai-budget.pl), sin necesidad de tarjeta, y está disponible para Android en [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

---

## Preguntas frecuentes: importar el extracto de un banco que no está en la lista

**¿Qué pasa si mi banco no está soportado directamente?**

Si subes un CSV o XLSX que ninguno de los analizadores integrados reconoce, AI Budget Assistant intenta averiguar por sí solo qué columna es la fecha, cuál el importe y cuál la descripción, y te muestra el resultado para revisarlo y corregirlo. Para extractos en PDF (función Pro), el mecanismo extrae directamente las filas de transacciones del texto del documento. En ambos casos, ves una previsualización completa antes de que se guarde nada.

**¿Puede la IA equivocarse y meter un importe incorrecto?**

En los archivos CSV y XLSX, el modelo de IA nunca lee importes ni fechas por su cuenta - solo señala qué columna es cuál, y esos nombres se comprueban contra las cabeceras reales de tu archivo, así que una columna inventada se descarta. Los números los lee el mismo mecanismo que el mapeo manual. En cualquier caso, obtienes una previsualización de todas las transacciones antes de guardar nada, para revisar y corregir lo que no encaje.

**¿Se envía el contenido de mi extracto a algún sitio?**

Antes de que cualquier fragmento del archivo llegue al modelo de IA, ves una pantalla de consentimiento, única por cuenta, que muestra exactamente qué se va a enviar: la fila de cabecera más hasta diez filas de ejemplo para un CSV o XLSX, o las primeras veinte líneas de texto para un extracto en PDF. Las cuentas con cifrado de extremo a extremo completo no usan este mecanismo en absoluto, porque la app no puede acceder a sus datos para enviarlos al modelo.

**¿La importación asistida por IA funciona tan bien como para mBank o PKO?**

Depende del formato del archivo, pero el mecanismo está pensado para mejorar con el tiempo: cuando el mapeo de columnas de un banco nuevo resulta correcto, la propia estructura del archivo (sin tus datos) se guarda en un diccionario global, así que la siguiente importación de ese mismo formato de banco ya no necesita el paso de la IA. Aun así, siempre conviene repasar la previsualización antes de confirmar la importación, igual que con cualquier otro banco.

---

*Artículos relacionados: [Cómo importar un extracto bancario a tu app de presupuesto](/blog/es/importar-extracto-bancario/) | [Registrar gastos automáticamente sin escribir nada](/blog/es/registrar-gastos-automaticamente/)*
