# Fase 3 · Propuesta y estado

Plan corto para cada punto: riesgo, archivos y orden. Al final, lo que encontré al leer `server.ts` completo.

## Estado de la implementación

| Punto | Estado |
|-------|--------|
| 1. Cron fuera de `node-cron` | Hecho. `POST /api/internal/outdoor-weather` con secreto; mediciones con id por cultivo y hora; una alerta por cultivo, condición y día; arreglos en memoria limitados a 500. **Falta crear el job en Cloud Scheduler** (pasos abajo). |
| 2. Regla `update` con `userId` | Hecho en `firestore.rules` (+ colección reservada `aiUsage`). Tests 8–10 agregados; requieren el emulador de Firestore. **Falta desplegar las reglas** (`firebase deploy --only firestore:rules`). |
| 3. Endurecer `/api/*` | Hecho: sin datos `system`, notificaciones solo al dueño, `/api/outdoor/cultivations` verifica el cultivo en Firestore, límite diario de IA (`AI_DAILY_LIMIT`), body de 2 MB (15 MB en `/api/ai`), errores 500 sin detalles internos, `PORT` desde el entorno, fechas en `APP_TIMEZONE`. |
| 4. Borrado completo de cuenta | Hecho en la app (menú del usuario → "Tus datos y tu cuenta"). **Falta la página web pública de borrado** que pide Google Play (necesita un email de contacto). |
| 5. Exportación de datos | Hecho (JSON con todas las colecciones; fotos como enlaces). El ZIP con fotos necesitaría una dependencia nueva. |
| 6. Manifest y service worker | Hecho: íconos PNG 192/512/maskable y apple-touch, manifest con colores Océano, service worker con caché del shell (solo en producción). **Falta** `assetlinks.json` (necesita la huella SHA-256 de la firma de la app) y capturas para la tienda. |
| 7. Carga diferida | Paso 1 hecho (`React.lazy`): JS inicial de 2.337 kB a 1.916 kB. El paso 2 (router con URLs) necesita `react-router` → pendiente de tu aprobación. |

### Configurar Cloud Scheduler (una sola vez)

1. Definí `OUTDOOR_SYNC_SECRET` en el servicio de Cloud Run (un valor largo y aleatorio).
2. Creá el job (reemplazá la URL y el secreto):
   ```
   gcloud scheduler jobs create http cultiveta-clima-exterior \
     --schedule="0 * * * *" --time-zone="America/Argentina/Buenos_Aires" \
     --uri="https://TU-SERVICIO.run.app/api/internal/outdoor-weather" \
     --http-method=POST \
     --headers="x-cultiveta-cron-secret=TU_SECRETO"
   ```
3. Probalo con `gcloud scheduler jobs run cultiveta-clima-exterior` y revisá los logs del servicio.

Escala de riesgo: **alto** = puede romper datos o el acceso de usuarios; **medio** = cambia comportamiento visible; **bajo** = interno o fácil de revertir.

---

## Orden recomendado

| # | Tarea | Por qué en este orden |
|---|-------|-----------------------|
| 1 | Cron fuera de `node-cron` (y bajarlo a 1 vez por hora) | Hoy corre **cada minuto** y escribe en Firestore: es el problema de costo y datos más urgente. |
| 2 | Regla `update` con `userId` | Cambio chico de seguridad, sin tocar código de la app. |
| 3 | Endurecer `/api/ai/*` y `/api/outdoor/*` | El token ya se verifica; falta límite de uso y cerrar los registros `system`. |
| 4 | Borrado completo de cuenta | Requisito de Google Play para apps con registro. |
| 5 | Exportación completa de datos | Reusa el mismo recorrido de colecciones que el borrado. |
| 6 | Manifest y service worker reales | Necesario para instalar como PWA / TWA en Play Store. |
| 7 | Router con carga diferida | Mejora de rendimiento; no bloquea nada. |

---

## 1. Cron fuera de `node-cron` en Cloud Run

**Riesgo: alto** (hoy) → **medio** (el cambio).

**Estado actual** (`server.ts:1304`): `cron.schedule('* * * * *', ...)` corre **cada minuto**, aunque la función se llama `syncHourlyOutdoorWeather`. Por cada cultivo exterior con coordenadas:
- escribe 1 medición en `environmentRecords` por minuto (1.440 por día);
- si el clima está fuera de rango, consulta a Gemini, crea 1 tarea en `tasks` y manda 1 notificación **por minuto**;
- consulta **todos** los cultivos activos de **todos** los usuarios (`cultivations where isFinished == false`) cada minuto.

En Cloud Run además:
- con 0 instancias activas el cron no corre; con varias, corre una vez por instancia (registros duplicados);
- `outdoorRecordsStore` y `outdoorTasksStore` son arreglos en memoria que crecen sin límite y se pierden al reiniciar.

**Propuesta:**
1. Sacar `cron.schedule` de `server.ts` y exponer `POST /api/internal/outdoor-weather`, protegido con un token OIDC de Cloud Scheduler (verificado con `google-auth-library`, que ya viene con firebase-admin) o con un secreto compartido en un header.
2. Crear un job de **Cloud Scheduler** cada 1 hora que llame a ese endpoint.
3. Evitar duplicados: id determinístico por cultivo y hora (`auto-env-{cropId}-{YYYYMMDDHH}`) y `set` idempotente.
4. Una sola alerta por cultivo, tipo de condición y día (id determinístico), en lugar de una por minuto.
5. Quitar los stores en memoria o limitarlos (las alertas ya quedan en Firestore).

**Archivos:** `server.ts`, `package.json` (quitar `node-cron` y `@types/node-cron`), configuración de Cloud Scheduler (fuera del repo).
**Pendiente tuyo:** confirmar que el hosting final es Cloud Run (AI Studio deploy) y la frecuencia deseada.

---

## 2. Regla `update` en `firestore.rules` que valide el `userId` nuevo

**Riesgo: bajo/medio.**

**Estado actual:** `allow read, update, delete: if ... resource.data.userId == request.auth.uid`. Para `update` solo valida el documento **anterior**: un usuario puede cambiar `userId` de un documento suyo y "regalárselo" a otra cuenta (le aparece datos que no creó).

**Propuesta:**
```
allow read, delete: if request.auth != null
  && !isReservedTopLevelCollection()
  && resource.data.userId == request.auth.uid;

allow update: if request.auth != null
  && !isReservedTopLevelCollection()
  && resource.data.userId == request.auth.uid
  && request.resource.data.userId == request.auth.uid;
```

**Archivos:** `firestore.rules`, `tests/firestore_admin_rules.test.ts` (sumar casos: cambiar `userId` debe fallar; editar sin cambiarlo debe pasar).
**Riesgo a revisar:** cualquier `updateDoc` del cliente que no incluya `userId` sigue funcionando (la regla mira el documento resultante, que conserva el `userId`). Los `setDoc` sin `merge` que omitan `userId` fallarían: hay que revisarlos antes (`wateringService.updateWatering` usa `merge: true`, está bien).
**Verificación:** requiere el emulador de Firestore (hoy esa suite se omite en esta PC).

---

## 3. Verificación del token en `/api/ai/*`

**Ya está implementada:** `server.ts:251` → `app.use('/api/ai', verifyFirebaseAuth)`, que valida el JWT con `verifyIdToken` y rechaza expirados o revocados. Este punto del prompt no se cumplía como estaba descrito.

**Lo que sí falta (propuesta):**
- **Límite de uso por usuario** en `/api/ai/*` (cada llamada consume Gemini). Opción sin dependencias: contador por `uid` en Firestore por día (`aiUsage/{uid}_{fecha}`), rechazar con 429 al pasar N.
- **Bajar el límite del body** de 50 MB (`express.json({ limit: '50mb' })`) a ~2 MB; las imágenes ya tienen su propio límite de 10 MB.
- **No devolver `err.message` crudo** al cliente en los 500 (filtra detalles internos).
- `/api/outdoor/cultivations` deja registrar cualquier `id` con cualquier coordenada: un usuario puede pisar la entrada de otro si conoce el id, y cargar cultivos sin límite (cada uno dispara Open-Meteo + Gemini en el cron). Validar que el cultivo exista en Firestore con ese `userId` antes de registrarlo.
- Los registros con `userId: 'system'` se muestran a **todos** los usuarios (`/api/outdoor/environment-records`, `/api/outdoor/tasks`, `/api/notifications/recent`) y `broadcastNotification` sin destinatario llega a todos los clientes SSE. Quitar el fallback `'system'`.

**Archivos:** `server.ts`. **Riesgo: medio.**

---

## 4. Borrado completo de datos al eliminar la cuenta

**Riesgo: alto** (borrado irreversible).

**Estado actual:** `authService.deleteAccount()` existe pero **ninguna pantalla lo llama**. Además solo borra `users/{uid}` y el usuario de Auth; quedarían huérfanos: `cultivations`, `waterings`, `environmentRecords`, `diaryEntries`, `harvests`, `photos`, `photoAnalyses`, `fertilizationSchedules`, `favoriteGenetics`, `genetics`, `tasks` y los archivos en Storage `users/{uid}/**`. Los errores se tragan (`console.warn`), así que puede fallar en silencio (por ejemplo, `auth/requires-recent-login`).

**Propuesta:**
1. Endpoint `POST /api/account/delete` (con `verifyFirebaseAuth`) que, con Admin SDK: borra en lotes cada colección `where('userId','==',uid)`, borra `users/{uid}`, borra `users/{uid}/**` en Storage y por último `auth.deleteUser(uid)`.
2. En el cliente: pedir reautenticación reciente, confirmación con `ConfirmModal` destructivo y limpiar `localStore` / IndexedDB de la cola de fotos.
3. Página web pública de solicitud de borrado (Google Play también la pide).

**Archivos:** `server.ts`, `src/services/authService.ts`, `src/services/localStore.ts`, `src/services/photoOfflineQueue.ts`, `src/components/user/UserPreferencesModal.tsx` (botón), tests nuevos con emulador.
**Orden:** primero la exportación (punto 5) para ofrecer "descargá tus datos antes de borrar".

---

## 5. Exportación completa de datos

**Riesgo: bajo.**

**Estado actual:** solo hay exportación CSV de mediciones de un cultivo (`MeasurementsTableView.tsx:105`) y exportación de fotos pendientes.

**Propuesta:** `GET /api/account/export` que arma un JSON con todas las colecciones del usuario (mismo recorrido que el punto 4) y las URLs firmadas de sus fotos; en el cliente, botón "Descargá tus datos" que baja `cultiveta-export-AAAA-MM-DD.json`. Opcional: ZIP con las fotos (requeriría una dependencia nueva → consultar).

**Archivos:** `server.ts`, `src/services/authService.ts` (o un `accountService.ts` nuevo), `UserPreferencesModal.tsx`.

---

## 6. Manifest y service worker reales

**Riesgo: bajo.**

**Estado actual:**
- `public/manifest.json` usa un único ícono SVG en data-URI (un emoji) con `sizes: "192x192 512x512"`: Chrome y Play (TWA) exigen PNG de 192 y 512 y uno *maskable*. Colores viejos (`#D7F000`, `#5C4FCF`).
- `public/sw.js` solo maneja notificaciones: no cachea nada, así que la app no abre sin conexión aunque los datos sean offline-first. Íconos de notificación también en data-URI con emojis.
- `index.html` usa un favicon emoji y clases de la paleta anterior en `<body>`.

**Propuesta:**
1. Íconos PNG 192, 512 y 512 maskable (+ `apple-touch-icon`) en `public/icons/`, generados desde el logo Océano.
2. Manifest con `id`, `scope`, `theme_color: #1B2E7A`, `background_color: #1F9C8C` y `screenshots` (los pide la tienda).
3. Service worker con precache del shell (`index.html`, JS y CSS con hash) y estrategia *stale-while-revalidate* para estáticos; nunca cachear `/api/*`. Sin dependencias: lista de assets generada en el build (plugin chico de Vite propio) o `vite-plugin-pwa` (dependencia nueva → consultar).
4. Para Play Store vía TWA: `/.well-known/assetlinks.json`.

**Archivos:** `public/manifest.json`, `public/sw.js`, `public/icons/*`, `index.html`, `vite.config.ts`.

---

## 7. Router con carga diferida

**Riesgo: medio** (toca la navegación).

**Estado actual:** no hay router. `App.tsx` elige la vista con `currentView === '...'` y todas se importan de entrada: el build genera un único JS de **2,3 MB** (600 kB gzip). No hay URLs por pantalla (el botón "atrás" de Android sale de la app).

**Propuesta en dos pasos:**
1. **Sin dependencias:** `React.lazy` + `Suspense` para las vistas pesadas (genéticas, cosechas, comparador, calculadoras, IA y los gráficos de Recharts) manteniendo `currentView`. Baja el JS inicial sin cambiar la navegación.
2. **Con router** (`react-router`, dependencia nueva → consultar): rutas `/`, `/cultivos`, `/cultivos/:id`, `/geneticas`, etc., sincronizadas con el historial para que "atrás" funcione en Android.

**Archivos:** `src/App.tsx`, `src/main.tsx`, `src/components/common/MobileNav.tsx`, `Sidebar.tsx`.

---

## Lo que encontré en `server.ts` (1.892 líneas)

Ordenado por gravedad.

| Gravedad | Hallazgo | Dónde |
|----------|----------|-------|
| Alta | Cron cada minuto: 1.440 mediciones por día por cultivo exterior, más Gemini, tarea y notificación por minuto si hay alerta. Consulta todos los cultivos de todos los usuarios. | `:1304`, `:889` |
| Alta | Datos con `userId: 'system'` visibles para **todos** los usuarios; `broadcastNotification` sin destinatario llega a todos. | `:877`, `:1345`, `:1362`, `:1465` |
| Alta | `/api/outdoor/cultivations` acepta cualquier `id` y coordenadas sin validar contra Firestore: permite pisar entradas ajenas y cargar cultivos sin límite (cada uno genera llamadas a Open-Meteo y Gemini). | `:1313` |
| Media | Sin límite de uso en `/api/ai/*`: cualquier usuario autenticado puede generar costo de Gemini sin tope. | `:369`–`:839` |
| Media | Arreglos en memoria (`outdoorRecordsStore`, `outdoorTasksStore`) que crecen sin límite y se pierden al reiniciar; no se comparten entre instancias. | `:862` |
| Media | Body JSON de hasta 50 MB en todas las rutas. | `:36` |
| Media | `PORT` fijo en 3000: Cloud Run asigna el puerto por `process.env.PORT` (hoy funciona solo si AI Studio lo configura en 3000). | `:34` |
| Media | Umbrales del clima exterior propios (35 °C, 11 °C, 75 %, 25 %): otra copia distinta de los de la Fase 2. | `:1048` |
| Baja | Los 500 devuelven `err.message` al cliente. | varias rutas |
| Baja | `/api/ai/summary` y `/weekly-summary` hacen `JSON.parse` sin `try` sobre la respuesta del modelo. | `:708`, `:743` |
| Baja | Fecha de "hoy" en UTC (`toISOString`) para registros automáticos y tareas: en Cloud Run (UTC) una medición de las 22 h de Argentina queda con fecha del día siguiente. | `:964`, `:996`, `:1435` |
| Baja | Emojis en títulos de alertas y notificaciones (`🚨`), contra la regla de UI sin emojis. | `:1230`, `:1433` |

**Lo que está bien hecho:** verificación de JWT en todas las rutas privadas; rol admin solo por custom claims o UIDs en variables de entorno (`src/server/adminAuthMiddleware.ts`); protección SSRF y aislamiento por usuario en `resolveImagePart`; validación de imágenes por *magic bytes*; subida de fotos del catálogo con ruta versionada y rollback; fallback determinista de la IA sin inventar datos.

**Detalle aparte:** `src/firebase/paths.ts` dice `DIARY: 'diary'`, pero `diaryService` usa la colección `diaryEntries`. Hoy no rompe nada (no se usa la constante), pero conviene alinearlo antes del borrado y la exportación (puntos 4 y 5).
