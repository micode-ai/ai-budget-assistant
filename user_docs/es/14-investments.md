# Cartera de inversiones

> Realiza un seguimiento de tu cartera de inversiones con precios de mercado en tiempo real. Monitoriza acciones, ETFs, criptomonedas, bonos y materias primas en un solo lugar.

## Descripcion general

La funcion de cartera de inversiones te permite:

- Seguir posiciones de diferentes tipos de activos
- Ver precios en tiempo real y el valor de la cartera
- Analizar rendimientos en diferentes periodos
- Comparar tus resultados con benchmarks de mercado (SPY, QQQ, DIA, IWM)
- Registrar transacciones de compra/venta con comisiones

## Crear una cuenta de inversion

El seguimiento de inversiones requiere un tipo de cuenta especial **Inversion**:

1. Ve a la pestana **Cuentas**
2. Toca **Crear cuenta**
3. Selecciona el tipo **Inversion**
4. Nombra tu cartera (ej. "Cartera principal", "Jubilacion")
5. Toca **Crear**

## Agregar posiciones

### Buscar activos

1. Abre tu cuenta de inversion
2. Toca **Agregar posicion**
3. Busca por simbolo (ej. "AAPL") o nombre de empresa (ej. "Apple")
4. Selecciona el activo correcto de los resultados
5. Agrega notas (opcional)
6. Toca **Guardar**

### Tipos de activos compatibles

| Tipo | Ejemplos |
|------|----------|
| Acciones | AAPL, MSFT, GOOGL |
| ETFs | SPY, QQQ, VTI |
| Criptomonedas | BTC, ETH, SOL |
| Bonos | Gubernamentales y corporativos |
| Materias primas | Oro, plata, petroleo |

## Registrar transacciones

Despues de agregar una posicion, registra tus transacciones de compra/venta:

1. Abre los detalles de la posicion
2. Toca **Agregar transaccion**
3. Selecciona el tipo: **Compra** o **Venta**
4. Introduce:
   - **Cantidad** — numero de acciones/unidades
   - **Precio por unidad** — precio de compra/venta
   - **Comision** — comision del broker (opcional)
   - **Fecha** — fecha de la transaccion
   - **Notas** — informacion adicional (opcional)
5. Toca **Guardar**

La aplicacion calcula automaticamente:
- **Precio medio de compra** — precio promedio ponderado
- **Total invertido** — suma de compras menos ventas
- **Ganancia/perdida actual** — basada en el precio actual

## Resumen de la cartera

La pantalla principal de inversiones muestra:

- **Valor total** — valor de mercado actual de todas las posiciones
- **Ganancia/perdida total** — cantidad de ganancia o perdida
- **Rendimiento total %** — retorno porcentual
- **Cambio del dia** — cambio de valor de hoy

Para cada posicion se muestra:
- Precio actual y cambio diario
- Tu cantidad y precio promedio
- Ganancia/perdida individual y porcentaje en cartera

## Analiticas

Accede a analiticas detalladas de la cartera:

1. Toca el boton **Analiticas**
2. Selecciona el periodo: 1S, 1M, 3M, 1A o Todo

### Grafico de rendimiento

Muestra el valor de la cartera a lo largo del tiempo comparado con la cantidad invertida. El area entre las lineas representa tu ganancia o perdida.

### Distribucion por tipos

Visualiza la distribucion de la cartera por tipos de activos (acciones, ETFs, cripto, etc.).

### Principales ganadores y perdedores

Lista de las mejores y peores posiciones por rendimiento porcentual.

### Insights AI de cartera (Pro+)

Obtén análisis de tu cartera impulsado por IA con recomendaciones accionables:

1. Abre la pestaña **Analíticas**
2. Desplázate al carrusel de **Insights** en la parte superior
3. Desliza izquierda/derecha para ver diferentes insights
4. Toca el botón de cerrar para ocultar un insight

**Tipos de insights:**

| Tipo | Descripción |
|------|-------------|
| Riesgo de concentración | Advierte cuando un activo domina la cartera |
| Desequilibrio sectorial | Alerta sobre sobreexposición a un tipo de activo |
| Bajo rendimiento | Identifica activos que van por detrás del mercado |
| Alto rendimiento | Destaca oportunidades de reequilibrio |
| Desviación del benchmark | Muestra cuando la cartera se aleja del benchmark |
| Brecha de diversificación | Sugiere tipos de activos faltantes |
| Alerta de base de costo | Ganancias/pérdidas no realizadas relevantes fiscalmente |
| Impacto de comisiones | Advierte cuando las comisiones reducen los retornos |

Cada insight incluye una visualización (gráfico) y una sugerencia accionable.

**Nota:** Los insights AI se almacenan en caché durante 24 horas y cuestan 2.5 créditos AI por actualización.

### Comparacion con benchmark (Pro+)

Compara el rendimiento de tu cartera con indices de mercado:

| Benchmark | Descripcion |
|-----------|-------------|
| SPY | Indice S&P 500 |
| QQQ | Indice Nasdaq 100 |
| DIA | Indice Dow Jones Industrial |
| IWM | Russell 2000 (pequena capitalizacion) |

**Entendiendo la comparacion:**
- **Rendimiento de la cartera** — tu ganancia/perdida porcentual real
- **Rendimiento del benchmark** — rendimiento del indice en el mismo periodo
- **Diferencia** — cuanto superaste o quedaste por debajo del mercado

## Entendiendo los calculos

Toca cualquier tarjeta de analiticas para ver la explicacion de la formula:

### Rendimiento
```
Rendimiento % = ((Valor final - Valor inicial) / Valor inicial) x 100
```

### Ganancia/perdida (G/P)
```
G/P = Valor actual - Total invertido
G/P % = (G/P / Total invertido) x 100
```

### Distribucion
```
Porcentaje % = (Valor del activo / Valor total de la cartera) x 100
```

## Actualizacion de precios

- Los precios se actualizan automaticamente cada 15 minutos
- Toca el boton **Actualizar** para actualizacion inmediata
- Los precios historicos se almacenan en cache para ahorrar datos

## Consejos

1. **Diversifica el seguimiento** — agrega todas las inversiones para una vision completa
2. **Incluye comisiones** — registra las comisiones del broker para calculos precisos
3. **Usa benchmarks** — compara con indices para evaluar resultados
4. **Revisa regularmente** — mira las analiticas semanalmente para detectar tendencias

## Limitaciones

- Los datos de precios provienen de Twelve Data API
- Algunos instrumentos exoticos pueden no estar disponibles
- Datos historicos limitados a dias de mercado
- Los precios en tiempo real pueden tener un retraso de hasta 15 minutos

---

[Anterior: Logros y Gamificacion](./13-gamification.md) | [Volver al indice](./00-index.md)
