# Asistencia escolar con códigos QR

Aplicación web (mobile-first) para pasar lista escaneando el QR de cada alumno desde el navegador del celular.
React + Vite + TypeScript + Tailwind · Firebase Authentication + Cloud Firestore · desplegable en Vercel. Sin servidor propio ni servicios de pago.

> **Proyecto Firebase compartido.** Esta app usa el mismo proyecto Firebase que **citasFacil** (`dashboard-10a1b`).
> Todas sus colecciones llevan el prefijo `asis_` y el acceso exige un perfil en `asis_users`, así que los usuarios de citasFacil
> no ven nada de asistencia (y viceversa). **Lo único delicado son las reglas de Firestore**: son una sola por proyecto. Lee la sección 3.

---

## 1. Funciones

| Sección | Qué hace |
|---|---|
| **Inicio** | Botón grande «Pasar lista», sesiones de hoy (continuar las abiertas). |
| **Pasar lista** | Grupo + fecha (zona horaria de la institución) → cámara trasera → escaneo continuo. Confirmación verde con nombre, grupo y hora; amarillo para «Ya registrado», inactivo u otro grupo; rojo para QR inválido o error de red. Linterna, cerrar cámara, registro manual, resumen en tiempo real (total, presentes, pendientes, %, último alumno) y lista de pendientes/registrados sin salir del escáner. «Finalizar» → revisión → cerrar (opcionalmente marca a los pendientes como Ausente). |
| **Alumnos** | Alta, edición, búsqueda (nombre/matrícula), filtro por grupo y estado, activar/desactivar, eliminar con confirmación (el historial se conserva), importar CSV/XLSX con vista previa de duplicados y errores, QR (descargar PNG, imprimir ficha, regenerar). |
| **Grupos** | Alta/edición/activación, conteo de alumnos, hoja imprimible con los QR del grupo. |
| **Historial** | Sesiones por rango de fechas y grupo, detalle con filtros por estado, correcciones con auditoría (quién y cuándo), exportar CSV de la sesión, búsqueda del historial individual de un alumno. |
| **Informes** | % de asistencia por alumno en un rango, ordenable; CSV resumen y CSV detallado. |
| **Configuración** | Nombre y zona horaria de la institución, usuarios (invitar por correo, agregar por UID, rol, activar, quitar), nombre visible propio. |

Estados de asistencia: **Presente**, **Retardo**, **Ausente**, **Justificado**. El QR registra *Presente*; el resto se asigna manualmente.
% de asistencia = (presente + retardo) ÷ (sesiones − justificadas); una sesión sin registro del alumno cuenta como inasistencia.

Roles:
- **Docente**: pasa lista, registra/corrige en sesiones **abiertas**, consulta todo.
- **Administrador**: además gestiona alumnos, grupos, usuarios, configuración y corrige sesiones **cerradas**.

## 2. Estructura

```
├─ firestore/asistencia.rules   Bloque de reglas SOLO de asistencia (fuente de verdad)
├─ firestore.rules              Reglas COMBINADAS citasFacil + asistencia (lo que se publica)
├─ firestore.indexes.json       Índices compuestos necesarios
├─ scripts/merge-rules.mjs      Genera firestore.rules a partir de las reglas actuales del proyecto
├─ tests/rules.test.ts          Pruebas de reglas (emulador)
├─ vercel.json                  Reescritura SPA + cabeceras (Permissions-Policy cámara)
└─ src/
   ├─ lib/          Firebase, fechas por zona horaria, QR, CSV, importación, cálculos (puro, con pruebas)
   ├─ services/     Todas las operaciones de Firestore (users, groups, students, sessions, records, settings)
   ├─ scanner/      Cámara/lector QR (qr-scanner), filtro anti-duplicados, sonido/vibración
   ├─ hooks/        Autenticación, datos compartidos (grupos/config), alumnos por grupo, conexión
   ├─ components/   UI reutilizable, QR, importación, hoja de estado
   └─ pages/        Una página por sección
```

### Modelo de datos (Firestore)

| Colección | Documento | Notas |
|---|---|---|
| `asis_users/{uid}` | email, displayName, role (`admin`/`teacher`), active | El rol solo lo cambia un admin (nunca uno mismo). |
| `asis_invites/{correo}` | email, displayName, role | Se consume al activar la cuenta con correo verificado. |
| `asis_settings/institution` | name, timezone | |
| `asis_groups/{id}` | name, description, active | |
| `asis_students/{id}` | fullName, nameLower, enrollmentId, groupId, active, **qrToken** | `qrToken`: 128 bits aleatorios. Editar el nombre no lo cambia. |
| `asis_sessions/{id}` | groupId, groupName, date (`YYYY-MM-DD`), label, status (`open`/`closed`), startedAt/By, closedAt/By, totals | Varias sesiones por grupo y día (campo `label`). |
| `asis_records/{sessionId}_{studentId}` | studentName (copia histórica), groupName, date, status, method (`qr`/`manual`/`auto`), recordedAt (**hora del servidor**), recordedBy, correctionCount, updatedBy/At | **Id determinista** → un alumno no puede tener dos registros en la misma sesión. No se borran nunca. |
| `asis_audit/{recordId}_{n}` | from, to, note, by, at | Una entrada por corrección; las reglas la exigen. Inmutable. |

Por qué así: el id determinista + transacción + reglas hacen imposible duplicar asistencias aunque lleguen varias lecturas a la vez o desde dos celulares; copiar nombre y grupo en el registro preserva el historial aunque se borre o renombre al alumno; consultar siempre por `groupId`, `sessionId` o `studentId` evita leer colecciones completas.

### Prevención de duplicados al escanear (3 capas)
1. **`ScanGate`**: ignora lecturas del mismo QR mientras se guarda y hasta 2,5 s después de dejar de verlo.
2. **Transacción** `registerAttendance`: lee `asis_records/{sesión}_{alumno}`; si existe responde «Ya registrado» sin escribir.
3. **Reglas**: un `create` sobre un id existente se convierte en `update`, que exige auditoría → rechazado.

### Conexión
Los registros se guardan con transacciones, que **fallan sin conexión**: la app nunca muestra «registrado» hasta que el servidor confirmó. Sin red aparece un aviso rojo y el QR puede volver a escanearse. **No hay modo offline.**

## 3. Configurar Firebase (proyecto compartido `dashboard-10a1b`)

1. **Authentication** → *Sign-in method*: verifica que **Correo electrónico/contraseña** esté habilitado (citasFacil ya lo usa).
2. **Firestore** ya existe. Publica las reglas **combinadas** (nunca solo el bloque de asistencia, o borrarías las de citasFacil):
   1. Consola → Firestore → *Reglas* → copia el texto actual completo a un archivo, p. ej. `reglas-actuales.rules`
      (úsalo en vez de `appcitas/src/firebase/firestore-rules.txt` por si la consola tiene cambios que el repo no).
   2. `npm run rules:merge -- reglas-actuales.rules` → genera `firestore.rules` (el script es idempotente: si ya tenía el bloque, lo reemplaza).
   3. Revisa el diff (solo debe añadirse el bloque entre `>>> ASISTENCIA ESCOLAR >>>` y `<<< ASISTENCIA ESCOLAR <<<`), pégalo en la consola y usa **Rules Playground** antes de **Publicar**.
   4. Opcional: copia también el resultado a `appcitas/src/firebase/firestore-rules.txt` para que citasFacil no lo pierda en su próxima publicación.
3. **Índices**: crea en Firestore → *Índices* → *Compuestos* los tres de `firestore.indexes.json`
   (`asis_sessions: groupId ↑, date ↓` · `asis_records: groupId ↑, date ↓` · `asis_records: studentId ↑, date ↓`).
   Si falta uno, la consola del navegador muestra un enlace que lo crea en un clic.
   Evita `firebase deploy --only firestore:indexes` desde aquí: podría proponer borrar los índices de citasFacil que no están en este archivo.
4. **App Check**: si en citasFacil está *aplicado* (enforced) para Firestore, registra el dominio de esta app en la clave reCAPTCHA v3 y pon `VITE_RECAPTCHA_SITE_KEY`. Si no está aplicado, déjalo vacío.
5. **Restricciones de la API key** (Google Cloud → Credenciales): si la clave está restringida por referente HTTP, añade `localhost:5173`, tu IP local de pruebas y el dominio de Vercel.

### Primer administrador (de forma segura, sin credenciales en el código)
1. Abre la app y en la pantalla de inicio pulsa **«¿Te invitaron? Crea tu cuenta»** (o inicia sesión si ya tienes cuenta en citasFacil con ese correo).
2. Verás **«Acceso pendiente»** con tu **UID**. Cópialo.
3. Consola Firebase → Firestore → *Iniciar colección* `asis_users` → ID del documento = **tu UID**, con campos:
   - `email` (string) = tu correo en minúsculas
   - `displayName` (string) = tu nombre
   - `role` (string) = `admin`
   - `active` (boolean) = `true`
4. En la app pulsa **Reintentar**. Desde ahí invita al resto en *Configuración → Usuarios*: la persona crea su cuenta con ese correo, verifica el correo y el acceso se activa solo (con el rol de la invitación; las reglas impiden que alguien se asigne otro rol).

## 4. Desarrollo local

```bash
npm install
```
```bash
cp .env.example .env.local   # y rellena VITE_FIREBASE_* (Consola → Configuración del proyecto → Tus apps → Web)
```
```bash
npm run dev
```

Variables (todas públicas por diseño; la seguridad está en Auth + reglas):

| Variable | Valor para el proyecto compartido |
|---|---|
| `VITE_FIREBASE_API_KEY` | la misma `NEXT_PUBLIC_FIREBASE_API_KEY` de citasFacil |
| `VITE_FIREBASE_AUTH_DOMAIN` | `dashboard-10a1b.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `dashboard-10a1b` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `dashboard-10a1b.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `442172857608` |
| `VITE_FIREBASE_APP_ID` | `1:442172857608:web:b6a4ea4ffbeafa0eb760bd` (o registra una app web nueva para separar métricas) |
| `VITE_RECAPTCHA_SITE_KEY` | vacío salvo que App Check esté aplicado |

`.env.local` está en `.gitignore`. Nunca subas claves de servicio (Admin SDK): esta app no las necesita.

## 5. Desplegar en Vercel desde GitHub

1. Sube el repositorio a GitHub (`origin` ya apunta a `github.com/marcosavalos8/asistenciaescolar`).
2. Vercel → *Add New Project* → importa el repositorio. Vercel detecta **Vite**: build `npm run build`, salida `dist`.
3. *Settings → Environment Variables*: añade las `VITE_FIREBASE_*` de la tabla (Production y Preview) y vuelve a desplegar.
4. `vercel.json` ya incluye la reescritura a `index.html` (las rutas como `/pasar-lista/xyz` funcionan al recargar) y la cabecera `Permissions-Policy: camera=(self)`.

## 6. Probar el escáner en el celular

La cámara solo funciona en **HTTPS** o `localhost`.
- **Lo más simple:** abre la URL `https://…vercel.app` (o una *Preview Deployment*) en el celular.
- En red local: `npm run dev:host` expone `http://192.168.x.x:5173`, pero al no ser HTTPS el navegador **bloquea la cámara**; úsalo solo para revisar el diseño.
- iPhone (Safari): si se negó el permiso, *Ajustes → Safari → Cámara → Permitir*, o «aA» → *Configuración del sitio web*. Android (Chrome): candado → *Permisos → Cámara*.
- La linterna solo aparece si el dispositivo la expone al navegador (habitual en Android; iOS Safari generalmente no).

## 7. Pruebas

| # | Prueba | Estado |
|---|---|---|
| 13 | Compilación de producción (`npm run build`, incluye `tsc`) | ✅ ejecutada, sin errores |
| — | Pruebas unitarias (`npm test`): tokens QR, rechazo de QR inválidos, filtro anti-duplicados con lecturas simultáneas, CSV, fechas por zona horaria, validación de importación (duplicados/errores), cálculos de % | ✅ 16/16 |
| — | Pantalla de inicio de sesión en navegador (viewport móvil), sin errores de consola | ✅ |
| 11 | Reglas de Firestore (`npm run test:rules`, 18 casos en `tests/rules.test.ts`) | ⚠️ **No ejecutada**: requiere Java 11+ y `firebase-tools` (`npm i -g firebase-tools`). |
| 1–10, 12, 14 | Flujos con sesión iniciada, cámara real y despliegue | ⚠️ **No ejecutadas**: requieren tu cuenta en el proyecto real, un celular y Vercel. Lista manual abajo. |

**Lista de verificación manual** (después de publicar reglas y crear el primer admin):
1. Crear un grupo; crear, editar (cambiar nombre → el QR impreso sigue funcionando) y buscar alumnos.
2. Abrir el QR de un alumno → *Descargar PNG* e *Imprimir ficha*; en Grupos → *Imprimir QR*.
3. Importar un CSV con la plantilla (*Alumnos → Importar → Descargar plantilla*), incluyendo una matrícula repetida y una fila sin nombre: deben aparecer como Duplicado/Error.
4. En el celular (HTTPS): Pasar lista → escanear un QR válido → verde con nombre, grupo y hora.
5. Escanear un QR cualquiera (p. ej. de una web) → rojo «QR no válido»; QR de otro grupo → amarillo.
6. Mantener el mismo QR frente a la cámara varios segundos y volver a escanearlo → un solo registro y «Ya registrado».
7. *Registro manual* de un alumno pendiente.
8. Tocar un alumno registrado → cambiar a Retardo → en Historial aparece «corregido (1)» con autor y hora.
9. Historial: filtrar por fecha/grupo, abrir la sesión, buscar el historial de un alumno.
10. Exportar CSV de la sesión y CSV del informe; abrirlos en Excel (acentos correctos).
11. Activar modo avión durante el escaneo → aviso rojo «Sin conexión: NO se guardó».
12. Repetir 4–6 en un Android (Chrome) y en un iPhone (Safari); denegar el permiso de cámara y comprobar las instrucciones.
13. En Vercel, recargar directamente `/historial` y `/pasar-lista/<id>` (no debe dar 404).

## 8. Seguridad del QR y mejoras opcionales

- El QR contiene `ASIS1:<token>` (128 bits aleatorios). No incluye nombre ni matrícula; se valida contra Firestore en cada lectura.
- **Un QR puede fotografiarse o copiarse: no prueba que el alumno esté físicamente presente.** El docente debe escanear viendo al alumno.
- Si un QR se filtra: *Alumnos → QR → Regenerar QR* lo invalida de inmediato.
- Mejoras posibles sin complicar el uso diario: regeneración masiva por periodo (p. ej. cada semestre), credenciales con foto impresa junto al QR, o alertar cuando un mismo alumno se escanea en dos grupos el mismo día.
- Mejora recomendada a futuro: restringir a cada docente a sus grupos asignados (hoy cualquier docente activo ve todos los grupos).
