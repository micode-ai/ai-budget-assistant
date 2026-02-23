# Widgets de pantalla de inicio

> Añade widgets de Android a tu pantalla de inicio para acceder instantáneamente a tus datos de gastos, o para registrar un gasto sin abrir la aplicación.

## ¿Qué son los widgets?

Los widgets son pequeños paneles interactivos en la pantalla de inicio de Android. AI Budget Assistant ofrece cuatro widgets:

| Widget | Tamaño | Contenido |
|--------|--------|-----------|
| **Presupuesto – Hoy** | Pequeño | Gasto total de hoy + cambio respecto a ayer |
| **Presupuesto – Semana** | Mediano | Gráfico de barras de los últimos 7 días |
| **Presupuesto – Vista general** | Grande | Progreso del presupuesto + categorías principales |
| **Presupuesto – Añadir rápido** | Tira compacta | Tres botones de acceso directo |

> **Solo Android.** iOS no admite widgets en la pantalla de inicio. Todas las funciones están disponibles dentro de la aplicación.

---

## Cómo añadir un widget

1. **Mantén pulsada** un área vacía de la pantalla de inicio
2. Toca **Widgets**
3. Desplázate hasta **AI Budget Assistant**
4. **Mantén pulsado** el widget deseado y arrástralo a la pantalla
5. Suéltalo para colocarlo

---

## Presupuesto – Hoy (Pequeño)

Vista rápida del día:

- **Total de hoy** en gastos
- **Indicador de cambio** respecto a ayer (verde = menos, rojo = más)

**Tamaño**: 110 × 40 dp. Toca el widget para abrir la aplicación.

---

## Presupuesto – Semana (Mediano)

Resumen semanal de un vistazo:

- **Gráfico de barras** de gastos de los últimos 7 días
- **Total de hoy** debajo del gráfico

**Tamaño**: 250 × 110 dp. Toca el widget para abrir la aplicación.

---

## Presupuesto – Vista general (Grande)

Tu panel financiero en la pantalla de inicio:

- **Barras de progreso** de cada presupuesto activo
- **Categorías de gasto principales** con importes del período actual

**Tamaño**: 250 × 180 dp. Toca el widget para abrir la aplicación.

---

## Presupuesto – Añadir rápido

Empieza a registrar un gasto con un toque, sin abrir la aplicación.

```
┌───────────────────────────────────────────┐
│  🎤 Voz  │  📷 Escanear  │  ✏️ Manual  │
└───────────────────────────────────────────┘
```

| Botón | Acción |
|-------|--------|
| 🎤 **Voz** | Abre la pantalla de grabación de voz |
| 📷 **Escanear** | Abre el escáner de tickets |
| ✏️ **Manual** | Abre el formulario de entrada manual |

**Tamaño**: 250 × 60 dp. Sin actualización en segundo plano — no afecta a la batería.

---

## Frecuencia de actualización

| Widget | Intervalo |
|--------|-----------|
| Presupuesto – Hoy | Cada 30 minutos |
| Presupuesto – Semana | Cada 30 minutos |
| Presupuesto – Vista general | Cada 30 minutos |
| Presupuesto – Añadir rápido | Estático |

---

## Preguntas frecuentes

**P: ¿Por qué no aparecen los widgets en el selector?**
R: Asegúrate de que la app esté instalada y hayas iniciado sesión al menos una vez.

**P: El widget muestra "Sin datos". ¿Qué hago?**
R: Abre la app y añade al menos un gasto, o espera el próximo ciclo de sincronización. Puedes sincronizar manualmente en **Ajustes → Sincronizar ahora**.

**P: ¿Puedo cambiar el tamaño de los widgets?**
R: Hoy y Añadir rápido tienen tamaño fijo. Semana se puede redimensionar horizontalmente. Vista general se puede redimensionar horizontal y verticalmente.
