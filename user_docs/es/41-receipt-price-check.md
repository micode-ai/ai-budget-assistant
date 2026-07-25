# Comprobación de precios del recibo — ¿es más de lo habitual?

> Justo después de escanear un recibo, cada artículo se compara con la mediana de lo que has pagado antes por ese mismo producto en ese mismo comercio — para que puedas detectar un descuento que no se aplicó mientras todavía estás en la caja.

## Qué es

Cada recibo que escaneas se compara discretamente con tu propio historial de compras: la mediana de lo que has pagado por ese producto exacto, en ese comercio exacto, durante las últimas 12 semanas. Cuando una línea cuesta notablemente más que eso, se muestra de inmediato — mientras todavía puedes preguntar en caja o mirar en la bolsa, no escondido en un informe que nunca abrirás.

Es pura aritmética sobre tus propios recibos anteriores. No interviene ninguna IA, y no hay nada que activar ni configurar.

## Lo que nunca dice

Nunca afirma que te han cobrado de más, que te han estafado o que te negaron un descuento a propósito — un recibo no puede demostrar nada de eso. Si no aparece impresa una línea de descuento, nada indica que alguna vez debiera haberse aplicado, así que la app nunca acusa. El planteamiento es siempre el mismo, honesto: **esto cuesta más de lo habitual — vale la pena revisar el recibo**. Una promoción que silenciosamente no se aplicó es la causa real más habitual, y esta forma de decirlo lo saca a la luz sin señalar al comercio con el dedo.

Lo que la app te muestra es lo que ha **encontrado** por encima de tus precios habituales — nunca lo que has **ahorrado**, porque no hay forma de saber si realmente actuaste al respecto.

## Dónde lo verás

- **Justo después de escanear un recibo** — una tarjeta como "2 artículos cuestan más de lo habitual", con "Unos 6,20 zł más de lo que sueles pagar aquí — vale la pena revisar el recibo" debajo. Tócala para ver cada producto marcado: lo que sueles pagar, lo que pagaste esta vez y la diferencia. Nunca impide guardar el recibo y nunca cambia ningún importe por ti — es información, no una edición.
- **En los bots de chat** (Telegram, WhatsApp, Slack) — escanear un recibo a través de un bot añade una línea extra al mensaje de confirmación cuando se encuentra algo, ya que los escaneos por bot pasan exactamente por la misma comprobación que la app.
- **En la pestaña Analítica** — una línea que dice "Encontrado X por encima de tus precios habituales este año", que solo aparece cuando realmente ha salido algo.
- **En tus alertas** — cada recibo escaneado con un hallazgo también puede aparecer como una alerta en tu campana, para que no tengas que acordarte de comprobarlo.

## Cuánto fiarte de un hallazgo

Un producto necesita al menos **dos** compras anteriores en el mismo comercio antes de que la comprobación diga algo sobre él, así que se mantiene en silencio durante un tiempo en una cuenta nueva — y se afina cuanto más escaneas. Un hallazgo basado en exactamente dos compras anteriores se etiqueta como "**basado solo en dos compras anteriores**", para que sepas cuánto peso darle; tres compras anteriores o más son una señal más firme.

## Qué compara — y qué no, a propósito

- Solo **el mismo producto en el mismo comercio**. Un precio en una tienda nunca se compara con el mismo producto comprado en otro sitio.
- Solo **la misma moneda** — nunca se convierte nada para esta comparación.
- Distintos tamaños de envase cuentan como productos distintos: el escáner conserva el tamaño en el nombre del producto (por ejemplo, "Mleko Łaciate 3,2% 1L"), así que una botella de 1 L y una de 0,5 L se siguen por separado — tal y como debe ser.
- Un salto de precio enorme se ignora a propósito en lugar de reportarse — es mucho más probable que sea un producto distinto (o una línea mal leída) que un cambio de precio real.

## El total anual

Si alguna vez se ha encontrado algo en más de una moneda, la pestaña Analítica muestra solo un total — tu propia moneda, si algo apareció en ella, o si no, el importe individual más alto. Los importes nunca se suman entre monedas, porque eso implicaría convertir dinero, algo que esta función se cuida mucho de no hacer nunca.

## Es bueno saber

- Funciona automáticamente en cada recibo escaneado — con cámara, desde la galería, en PDF, y en recibos escaneados a través de Telegram, WhatsApp o Slack.
- Un hallazgo nunca impide guardar el recibo ni cambia ningún importe por ti.
- Los precios y las diferencias se muestran en la moneda propia del recibo.
