# Cifrado de extremo a extremo

> Protege tus datos financieros con cifrado de extremo a extremo (E2EE). Toda la informacion sensible se cifra en tu dispositivo antes de enviarse al servidor — nadie excepto tu (y los miembros de tu cuenta compartida) puede leerla.

## Vista general

El cifrado de extremo a extremo garantiza que tus descripciones, notas, nombres de categorias y otros datos de texto se cifren en tu dispositivo antes de sincronizarse. El servidor solo almacena datos cifrados y no puede leerlos, incluso si la base de datos se ve comprometida.

Tu controlas el cifrado con una **frase de cifrado** separada que nunca se envia al servidor.

## Configurar el cifrado

1. Abre **Ajustes**
2. Desplazate hasta la seccion **Seguridad**
3. Toca **Activar cifrado**
4. Introduce una **frase de cifrado** (minimo 8 caracteres)
   - Es diferente de tu contrasena de inicio de sesion
   - Elige una frase segura que puedas recordar
5. Confirma la frase de cifrado
6. Se mostrara una **Clave de recuperacion** en pantalla

> **Importante:** Guarda tu Clave de recuperacion de inmediato! Anotala o guardala en un gestor de contrasenas. Formato: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Esta es la **unica forma** de recuperar tus datos si olvidas la frase de cifrado.

Despues de la configuracion, el cifrado se activa automaticamente para tu cuenta actual.

## Desbloquear el cifrado

Despues de reiniciar la aplicacion o cuando tu sesion expire, el cifrado se bloquea. Tus datos siguen almacenados de forma segura, pero los campos cifrados apareceran vacios hasta que desbloquees.

Para desbloquear:

1. Abre **Ajustes** > **Seguridad**
2. Toca **Desbloquear cifrado**
3. Introduce tu frase de cifrado
4. Tus datos vuelven a ser legibles

## Que se cifra

El cifrado funciona en dos niveles:

### Nivel 1 — Campos de texto (predeterminado)

| Datos | Cifrado |
|---|---|
| Descripciones y notas de gastos | Si |
| Nombres de ubicaciones | Si |
| Datos de recibos | Si |
| Nombres de categorias | Si |
| Nombres de etiquetas | Si |
| Nombres y descripciones de proyectos | Si |
| Nombres de presupuestos | Si |
| Importes, fechas, monedas | No — permanecen en texto plano |

**Las funciones del servidor** (analisis, alertas de presupuesto, informacion de IA) siguen funcionando porque los importes y las fechas permanecen accesibles.

### Nivel 2 — Cifrado completo (opcional)

Todo lo del Nivel 1, mas:

| Datos | Cifrado |
|---|---|
| Importes (gastos, ingresos, presupuestos) | Si |
| Precios y tipos de cambio | Si |
| Saldos de billetera | Si |

> **Nota:** Con el Nivel 2, los analisis del servidor y las funciones de IA no estan disponibles porque el servidor no puede leer los importes. Todos los analisis se calculan localmente en tu dispositivo.

## Recuperacion

Si olvidas tu frase de cifrado pero tienes tu Clave de recuperacion:

1. Abre **Ajustes** > **Seguridad**
2. Toca **Recuperar**
3. Introduce tu Clave de recuperacion
4. Establece una nueva frase de cifrado
5. Se genera una nueva Clave de recuperacion — guardala de nuevo

## Restablecer el cifrado

Si pierdes tanto tu frase de cifrado como tu Clave de recuperacion:

1. Abre **Ajustes** > **Seguridad**
2. Toca **Restablecer cifrado** (boton rojo)
3. Confirma la accion

> **Advertencia:** Los datos previamente cifrados en el servidor se vuelven **permanentemente ilegibles**. Los datos locales en tu dispositivo no se ven afectados. Puedes configurar el cifrado de nuevo con una nueva frase de cifrado.

## Cuentas compartidas

Cuando el cifrado esta activado para una cuenta compartida:

- El **propietario de la cuenta** debe otorgar claves de cifrado a cada miembro
- Los nuevos miembros pueden ver metadatos (importes, fechas, categorias) pero **no pueden leer los campos de texto cifrados** hasta que el propietario les conceda acceso
- La concesion de claves ocurre cuando el propietario abre la aplicacion y aprueba a los miembros pendientes
- Cuando un miembro es **eliminado** de una cuenta compartida, las claves se rotan por seguridad — el miembro eliminado ya no puede descifrar datos nuevos

## Impacto en las funciones de la aplicacion

| Funcion | Nivel 1 (Texto) | Nivel 2 (Completo) |
|---|---|---|
| Analisis y graficos | Funciona completamente | Se calcula localmente |
| Alertas de presupuesto | Funciona completamente | No disponible |
| Chat IA | Parcial (sin descripciones) | No disponible |
| Informacion de IA | Parcial | No disponible |
| Historia de gastos | Parcial | No disponible |
| Entrada de voz | Funciona completamente | Funciona completamente |
| Escaneo de recibos | Funciona completamente | Funciona completamente |

## Preguntas frecuentes

- **P: La frase de cifrado es la misma que mi contrasena de inicio de sesion?**
  **R:** No. La frase de cifrado es independiente y nunca se envia al servidor. Tu contrasena de inicio de sesion autentica tu cuenta; la frase de cifrado protege tus datos.

- **P: Que pasa si olvido mi frase de cifrado y pierdo la Clave de recuperacion?**
  **R:** Los datos previamente cifrados en el servidor se vuelven permanentemente ilegibles. Puedes restablecer el cifrado y empezar de nuevo, pero los datos cifrados antiguos no se pueden recuperar.

- **P: Los desarrolladores de la aplicacion pueden leer mis datos cifrados?**
  **R:** No. El servidor solo almacena datos cifrados. Sin tu frase de cifrado o Clave de recuperacion, nadie puede descifrar tus datos.

- **P: El cifrado hace que la aplicacion sea mas lenta?**
  **R:** La configuracion inicial tarda unos segundos para la derivacion de claves. Despues de eso, cifrar y descifrar campos individuales es practicamente instantaneo.

- **P: Puedo desactivar el cifrado despues de activarlo?**
  **R:** Puedes restablecer el cifrado, lo que elimina la configuracion de cifrado. Sin embargo, los datos que fueron cifrados en el servidor permanecen cifrados y se vuelven ilegibles.

---

*Ver tambien: [Ajustes](./11-settings.md) | [Cuentas](./09-accounts.md)*
