---
title: "Plantilla de presupuesto en Excel: estructura y sus límites"
meta_description: "Una plantilla de presupuesto en Excel que funciona: columnas, categorías y fórmulas de resumen, más el momento honesto en que una hoja ya no basta."
target_keyword: "plantilla de presupuesto en Excel"
slug: "plantilla-presupuesto-excel"
pair: "excel-budget"
lang: "es"
date: "2026-09-20"
---

# Plantilla de presupuesto en Excel: estructura y cuándo se queda corta

Buscas una plantilla de presupuesto en Excel porque quieres empezar hoy, no leer otro artículo sobre motivación. Tienes razón: una hoja de cálculo de verdad basta para arrancar, es gratis y ves cada fórmula tú mismo. Este texto te da una estructura que puedes copiar en diez minutos, y luego te cuenta con honestidad en qué momento una hoja empieza a limitarte y qué suele pasar después.

## Lo que una buena plantilla de presupuesto en Excel necesita de verdad

La mayoría de las hojas de presupuesto familiar que he visto cometen el mismo error: demasiadas pestañas, poca estructura. Una plantilla que funciona necesita en realidad cuatro cosas.

**Una sola pestaña de movimientos.** No tres hojas para tres cuentas ni una notita aparte para el efectivo. Una lista continua, una fila por gasto.

**Una lista fija de categorías.** Entre diez y quince categorías es el punto justo: vivienda, alimentación, comer fuera, transporte, suministros, salud, suscripciones, compras, hijos (si aplica), ahorro, deudas, ocio. Con menos pierdes el detalle que hace útil un presupuesto. Con más, apuntar un gasto se convierte en una tarea en sí misma.

**Una pestaña de resumen.** Una lista de movimientos por sí sola no dice nada. Necesitas un sitio que sume los gastos por categoría y por mes, para que las cifras cuenten algo de verdad.

**Una columna de saldo.** Ver lo que queda, no solo lo que has gastado, es justo la diferencia entre un diario y un presupuesto.

## Una estructura sencilla que puedes copiar

Tu pestaña "Movimientos" necesita cinco columnas: **Fecha**, **Categoría**, **Descripción**, **Importe**, **Cuenta/método de pago**. No hace falta nada más para empezar. Añade columnas solo cuando de verdad notes que te falta una.

Para el resumen, usa una fórmula de suma condicional: `SUMAR.SI` en la versión española de Excel, `SUMIF` en la inglesa y en Google Sheets (el nombre exacto depende del idioma de tu hoja). Una fila por categoría, una columna por mes, y cada celda suma los importes de la pestaña de movimientos que cumplen las dos condiciones a la vez.

El saldo se calcula más fácil como una suma acumulada: saldo inicial más ingresos menos gastos, arrastrado fila a fila o mes a mes en la pestaña de resumen. No necesita ser sofisticado, solo tiene que decirte si vas bien antes de que te sorprenda el fin de mes.

Y eso es prácticamente todo. Excel y Google Sheets se comportan igual aquí, así que usa el que ya tengas abierto.

## Dónde una hoja de cálculo empieza a fallar

Siendo honestos: para quien disfruta manteniéndola y tiene finanzas sencillas, una hoja aguanta años. El problema no está en las fórmulas. Está en que cada apunte lo tiene que escribir una persona, a mano, cada vez.

Una compra grande al mes no es ningún problema. Veinte pequeñas (un café, un billete de bus, una bolsa de patatas, un pedido a domicilio) y el esfuerzo de apuntar cada una por separado empieza a pesar más que el beneficio de seguirlas. Por eso fracasan los presupuestos: [la fricción](/blog/es/control-de-gastos/), no la falta de disciplina. La mayoría empieza una hoja de presupuesto con verdadero entusiasmo y la abandona en silencio a las pocas semanas, agotada por el mismo tecleo manual al que se apuntó.

El segundo problema aparece cuando el presupuesto se lleva entre dos personas. Uno se queda como dueño del archivo y lo manda por correo, el otro apunta gastos tarde o nunca, y al cabo de un mes tenéis dos versiones distintas de cuánto queda realmente para gastar.

## Cuándo merece la pena dar el siguiente paso

Algunas señales de que ya no es un problema de disciplina, sino de herramienta:

- Pasan cuatro o cinco días de forma habitual antes de abrir el archivo y ponerte al día.
- Tu pareja ha dejado de apuntar nada, porque el archivo "es tuyo".
- Quieres ver un gasto en el momento en que ocurre, no reconstruirlo desde un tique una semana después.
- Casi todo lo pagas con tarjeta o móvil, así que volver a teclear cada movimiento en la hoja empieza a parecer trabajo duplicado.

Ninguna de estas señales significa que el presupuesto no te funcione. Significa que la hoja ya no encaja con cómo gastas de verdad.

## Qué viene después de la hoja de cálculo

Lo que sustituye a una hoja de cálculo debería conservar lo que funcionaba en ella (categorías claras, totales mensuales, un saldo visible) y quitar exactamente lo que la mataba: teclear cada apunte a mano. Es la misma fricción que trata con más detalle [nuestra guía de las mejores apps de presupuesto](/blog/es/mejores-apps-de-presupuesto/), y es lo único que decide si una herramienta sobrevive más de dos semanas, no la lista de funciones.

En AI Budget Assistant añades un gasto por voz ("doce euros de comida"), fotografiando un tique, o, en Android, sin tocar el móvil en absoluto, porque la app lee la propia notificación de pago de tu banco y registra el gasto ella sola. El historial que ya tienes en el banco lo subes una vez como CSV o PDF en lugar de reescribirlo línea a línea; [nuestra guía para importar un extracto bancario](/blog/es/importar-extracto-bancario/) explica ese paso exacto. Para parejas funciona igual, solo que ambos entráis desde vuestros propios móviles a una vista compartida en tiempo real, en lugar de mandaros un archivo por correo.

Puedes empezar sin tarjeta, directamente en el navegador en [ai-budget.pl](https://ai-budget.pl), o instalarla en Android desde [Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant).

## FAQ: plantilla de presupuesto en Excel

**¿Existe una plantilla gratuita de presupuesto en Excel?**
Puedes construir la tuya en unos diez minutos siguiendo la estructura de este artículo: una pestaña de movimientos con cinco columnas, una lista fija de categorías y una pestaña de resumen con una fórmula de suma condicional. Las plantillas listas de la galería de Excel o Google Sheets también funcionan, aunque suelen traer más pestañas de las que realmente necesitas para empezar.

**¿Excel o Google Sheets: qué es mejor para un presupuesto familiar?**
Para un presupuesto familiar la diferencia es sobre todo cosmética. Ambos manejan las mismas fórmulas de suma condicional y tablas dinámicas. Google Sheets gana si el presupuesto lo lleváis dos personas y queréis editar el mismo archivo a la vez desde distintos dispositivos, sin mandarlo por correo.

**¿Cómo dejo de olvidarme de actualizar mi presupuesto en Excel?**
Es realmente difícil. Fijar un momento concreto, por ejemplo el domingo por la noche, ayuda, pero la solución real es reducir el tiempo de apuntar un gasto a unos segundos. Por eso existen el escaneo de tiques y la entrada por voz en las apps de presupuesto: eliminan justo el paso que la gente se salta.

**¿Cuándo conviene pasar de una hoja de cálculo a una app de presupuesto?**
Cuando empiezas a notar huecos habituales en tus apuntes, cuando la otra persona del presupuesto ha dejado de registrar gastos, o cuando casi todo ya son pagos con tarjeta que preferirías importar en vez de reescribir a mano. La hoja en sí nunca fue el problema; el apunte manual detrás suele serlo.

---

*Artículos relacionados: [Control de gastos: cómo llevar un seguimiento que dure](/blog/es/control-de-gastos/) | [Mejores apps de presupuesto en 2026: guía honesta](/blog/es/mejores-apps-de-presupuesto/) | [Cómo importar un extracto bancario a tu app de presupuesto](/blog/es/importar-extracto-bancario/)*
