# Lista de la compra inteligente

> Una lista de la compra compartida que además te dice qué tienda es más barata para tu cesta — calculado a partir de los precios de tus propios tiques, sin coste de IA.

La Lista de la compra inteligente es una lista compartida para tu cuenta. A diferencia de una lista normal, está conectada con el historial de precios de tu **Índice de Inflación Personal**: cada artículo que has comprado y escaneado tiene un precio conocido en una tienda conocida, así que la app puede clasificar las tiendas según el total real de tu cesta, sugerirte qué toca reponer y avisarte de bajadas de precio genuinas.

## Dónde encontrarla

Abre **Lista de la compra** desde los accesos rápidos de la pantalla de inicio, o ve a **Ajustes → Lista de la compra**. En una cuenta compartida, todos ven y editan la misma lista.

## Crear y cambiar de lista

Toda cuenta empieza con una lista predeterminada llamada "My List". Puedes mantener varias listas (por ejemplo "Supermercado" y "Farmacia") y cambiar entre ellas.

Toca la píldora con el nombre de la lista en la parte superior de la pantalla para abrir **Gestionar listas**, donde puedes:

- **Cambiar** — toca cualquier lista para hacerla la activa.
- **Crear** — toca **Nueva lista** y ponle un nombre. Cualquier miembro de la cuenta puede crear una lista.
- **Renombrar** — toca el icono de lápiz en una fila. Cualquier miembro de la cuenta puede renombrar una lista.
- **Archivar** — oculta la lista sin eliminarla (sus artículos se conservan). Solo editores y el propietario de la cuenta.
- **Eliminar** — borra la lista y todos sus artículos de forma permanente. Solo editores y el propietario de la cuenta.

Los observadores pueden ver, cambiar entre listas, añadir artículos y marcarlos como comprados en cualquier lista, pero no pueden archivar ni eliminar una.

## Añadir artículos

Toca **Añadir artículo** para abrir el panel de añadir. Puedes añadir un artículo de tres formas:

- **Buscar en tus productos rastreados** — empieza a escribir y aparecerán debajo los productos coincidentes de tu historial del Índice de Inflación Personal.
- **Comprados con frecuencia** — cuando el campo de búsqueda está vacío, una fila horizontal muestra tus productos más comprados para añadirlos con un toque.
- **Texto libre** — si lo que escribiste no coincide con ningún producto rastreado, toca **Añadir "…"** para añadirlo como un artículo de texto sin más. Los artículos de texto libre no están vinculados al historial de precios, así que no aparecerán en las comparaciones de precios.

Cada artículo de la lista tiene una casilla, un contador de cantidad editable y un icono de eliminar. Los artículos marcados bajan al final de la lista. Usa **Borrar marcados** (arriba a la derecha de la pantalla) para quitar de una vez todo lo que ya has marcado.

## Comparar precios ("Dónde es más barato")

Toca **Comparar precios** al final de la lista para ver qué tienda es más barata para todo lo que sigue sin marcar en tu lista.

La app mira el último precio que pagaste por cada artículo de la lista en cada tienda de tu historial, y para cada tienda muestra:

- El **total estimado** de tu cesta en esa tienda.
- Una insignia de **cobertura** ("5/7 artículos") que indica cuántos de tus artículos tienen precio conocido allí.
- Una insignia **Más barato** en la tienda con mejor relación calidad-precio. Una tienda solo gana la insignia si cubre todos tus artículos, o al menos el 80 % cuando ninguna tienda los cubre todos.
- Un aviso de **precios desactualizados** si algunos de los precios usados tienen más de 90 días.
- Un recuento de artículos **sin precio** en esa tienda.

Debajo de las tarjetas de tienda, **Precio más bajo por artículo** desglosa la comparación artículo por artículo, mostrando la tienda y el precio más bajo de cada uno — útil cuando ninguna tienda cubre toda tu cesta.

Solo se incluyen en la comparación los artículos con un producto asociado (añadidos desde tus productos rastreados, no como texto libre).

> **Nota:** Comparar precios entre tiendas es una función **Pro**. Los usuarios del plan gratuito ven un aviso para actualizar al tocar **Comparar precios**.

Si aún no has escaneado suficientes tiques, verás un aviso para escanear algunos primero — la comparación necesita historial de precios del que partir.

## Mapa de tiendas

Desde la pantalla de comparación de precios, toca el icono del mapa (arriba a la derecha) para abrir el **Mapa de tiendas**. Muestra cada tienda de tu comparación que tenga una ubicación conocida (capturada automáticamente al escanear un tique con dirección, o añadida manualmente).

- Selector **Más barato / Cercanas** — ordena la lista de tiendas bajo el mapa por el total estimado de la cesta o por la distancia hasta ti.
- Toca **Buscar cerca** para obtener tu ubicación actual y mostrar distancias. Esto requiere permiso de ubicación; sin él, las tiendas siguen apareciendo en el mapa pero sin etiquetas de distancia.
- Las tiendas sin dirección conocida no aparecen en el mapa, y un aviso te indica cuántas se han omitido.

## Hora de reponer

La app observa con qué frecuencia compras cada producto rastreado. Cuando ha visto al menos 3 compras de un producto, aprende tu patrón habitual de recompra (por ejemplo, "compras leche aproximadamente cada 6 días"). Cuando un producto está pendiente de reponer según ese patrón — y aún no está en ninguna de tus listas — aparece como un chip en la fila **Hora de reponer** en la parte superior de la lista de la compra. Toca un chip para añadir ese artículo directamente a tu lista.

También recibes una notificación push diaria cuando algo está pendiente de reponer, como máximo una vez al día, resumiendo el primer artículo pendiente ("¿Hora de reabastecer? Leche y 2 más").

## Ofertas para ti

La app compara el precio que has pagado recientemente por un producto rastreado con su precio medio de los últimos 90 días. Si el último precio de una tienda para un producto está significativamente por debajo de esa media, aparece como un chip en la fila **Ofertas para ti**, con el nombre de la tienda y el porcentaje de descuento. Toca un chip para añadir el artículo a tu lista.

Las ofertas también se envían como notificación push diaria cuando se detecta una bajada genuina, para que no tengas que abrir la app para no perdértela.

## Gestionar notificaciones

Ambas notificaciones están activadas por defecto y se pueden desactivar por separado en **Ajustes → Notificaciones**:

- **Recordatorios de reposición** — el aviso push diario de "hora de reponer".
- **Alertas de ofertas** — el aviso push diario de bajada de precio.

## Origen de los datos

Las predicciones de reposición, la detección de ofertas y las comparaciones de precios entre tiendas se construyen a partir de los precios por artículo capturados al escanear tiques con la cámara (OCR) — los mismos datos que alimentan tu Índice de Inflación Personal. Los gastos introducidos manualmente y las importaciones bancarias no incluyen precios por producto, así que no alimentan estas funciones. Cuantos más tiques escanees, mejores serán las sugerencias y comparaciones.
