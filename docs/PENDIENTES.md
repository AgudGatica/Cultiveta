# Pendientes de Cultiveta

Recordatorio de lo que queda abierto. Tachá cada punto (`[x]`) cuando esté resuelto.
Última actualización: 2026-11-01.

---

## 1. Tareas tuyas para que la Fase 3 funcione en producción

- [x] **Cloud Scheduler (hecho el 2026-11-01):** el job `cultiveta-clima` (cada hora, us-central1) llama a la app publicada en https://cultiveta.ai.studio. `OUTDOOR_SYNC_SECRET` se carga en los **Secrets de AI Studio** (no en Cloud Run a mano: AI Studio lo pisa al publicar); si se cambia ahí, hay que volver a publicar y actualizar el encabezado de los dos jobs. Antes: definir `OUTDOOR_SYNC_SECRET` en el servicio de Cloud Run y crear el job horario que llama a `POST /api/internal/outdoor-weather`. Comando en [fase3-propuesta.md](fase3-propuesta.md#configurar-cloud-scheduler-una-sola-vez). Hasta hacerlo, el clima exterior no se sincroniza solo.
- [x] **Volver a desplegar las reglas de Firestore (Comunidad, hecho el 2026-11-01 a las 21:35):** `firestore.rules` suma `profiles`, `handles`, `growlogs`, `follows` y `reports` cerradas al navegador. Publicarlas en la consola de Firebase **antes** de usar la Comunidad en la app publicada.
- [x] **Desplegar las reglas de Firestore (hecho el 2026-11-01 desde la consola de Firebase, base `ai-studio-cultiveta-…`; las de antes eran del 11/10 y no cerraban `deviceIntegrations` ni `aiUsage`). Si cambia `firestore.rules`, hay que volver a publicarlas: AI Studio no las despliega al publicar la app.** Antes: `firebase deploy --only firestore:rules` (regla de `update` con `userId`, colección `aiUsage` y, desde el 2026-10-31, `deviceIntegrations`: las claves de Smart Life no las puede leer el navegador). **Antes de usar Smart Life en producción.**
- [x] **Equipos (Smart Life): revisión cada 5 minutos (hecho el 2026-11-01, job `cultiveta-equipos`; la primera vuelta automática respondió 200).** Crear un segundo job de Cloud Scheduler que llame a `POST /api/internal/devices-tick` con el mismo encabezado `x-cultiveta-cron-secret` (el valor de `OUTDOOR_SYNC_SECRET`), con la frecuencia `*/5 * * * *`. Rellena el horario de los superciclos cargado en Smart Life, aplica las reglas por sensor (extractor, humidificador…), corrige lo que quedó al revés, apaga una bomba olvidada, hace el riego automático (y lo anota en el cultivo) y lee los sensores. Lee los sensores y equipos por sensor en cada vuelta y la luz cada 15 min, para cuidar el cupo de consultas de Tuya (revisá el plan de tu proyecto en iot.tuya.com si hay muchas cuentas). Sin el job, los ciclos de 24 h igual andan (quedan como programación diaria en Smart Life) y un superciclo dura la semana que se cargó al asignarlo o al cambiar la hora. **El riego automático de la bomba (programado o por humedad) depende por completo de este job:** sin él, la bomba solo riega con "Regar".
- [x] **Equipos: habilitar eWeLink (Sonoff) (hecho el 2026-11-02).** App "Cultiveta" en dev.ewelink.cc (cuenta del dueño, desarrollador individual, OAuth 2.0, Standard Role, **vence el 2027-11-02**: renovarla antes). Las claves están en los Secrets de AI Studio (no en Cloud Run) y la app publicada ya las tiene. La URL es `https://cultiveta.ai.studio/equipos`. Crear una app gratis de Cultiveta en [dev.ewelink.cc](https://dev.ewelink.cc) (tipo OAuth 2.0) con la Redirect URL `https://<dominio de Cultiveta>/equipos`, y cargar en Cloud Run `EWELINK_APP_ID`, `EWELINK_APP_SECRET` y `EWELINK_REDIRECT_URL` (la misma URL). Hasta hacerlo, en Equipos eWeLink solo se puede probar con los Sonoff de prueba. Shelly no necesita nada: cada persona usa la clave de su nube. Con Shelly, la luz depende del job de 5 minutos (ver arriba): cada cambio queda programado en el equipo, pero el siguiente lo programa la revisión.
- [x] **Revisar variables de entorno (revisado el 2026-11-01 en la app publicada: `APP_TIMEZONE` = Buenos Aires; `AI_DAILY_LIMIT` = 20 por persona por día, a propósito más bajo que el valor por defecto; se cambian en los Secrets de AI Studio y se vuelve a publicar)** en Cloud Run: `APP_TIMEZONE` (por defecto Buenos Aires) y `AI_DAILY_LIMIT` (por defecto 60 consultas por día).

## 2. Datos que necesito para Google Play

**En pausa (2026-11-01):** todavía no se publica en Google Play; se retoma cuando el dueño decida subirla.

- [ ] **Email de contacto** para la página web pública de borrado de cuenta (requisito de Google Play).
- [ ] **Huella SHA-256** de la firma de la app para `/.well-known/assetlinks.json` (TWA en Play Store).
- [ ] **Capturas de pantalla** para el manifest y la ficha de la tienda.

---

## Resuelto el 2026-10-17

- [x] Umbrales unificados con los valores del resumen: temperatura > 30 °C / < 17 °C, humedad en floración > 62 %, pH recomendado 5,8–6,5 (alerta fuera de 5,8–6,7), EC > 2,2. Se usan en el resumen de IA, tareas, Inicio, detalle del cultivo y estado de salud (`src/utils/agronomicThresholds.ts`). Los de clima exterior del servidor quedan aparte (editables por cultivo).
- [x] "Riego atrasado" siempre según la ventana del pronóstico (se quitó el plazo fijo de 4 días).
- [x] Drenaje por categoría: se muestra como señal en el pronóstico, sin cambiar el cálculo.
- [x] `@types/react` agregado; se corrigieron los errores que aparecieron (incluidos bugs reales: fertilizantes y PPFD que nunca se mostraban, estado "revisar pronto" que nunca aparecía).
- [x] `react-router`: cada pantalla tiene su URL (`/cultivos`, `/cultivos/:id`, `/geneticas`, `/cosechas`, `/comparador`, `/ia`, `/calculadoras`) y funciona el botón "atrás".
- [x] Peso de la maceta: 3 niveles (liviana / normal / pesada).
- [x] Confirmado: un cultivo sin riegos muestra "primer riego pendiente".
- [x] Fechas de riego interpretadas en hora local (antes en UTC, quedaban un día antes en Argentina).
- [x] Se quitaron valores inventados: 24 °C / 55 % y 1,5 L en el Inicio, 24 °C / 58 % en el resumen semanal, "~2 L/planta" en tareas sin maceta conocida.
- [x] Tests: DOM de jsdom listo antes de cargar React (helper `tests/helpers/setupDom.ts`), E2E encuentra Chrome en Windows, `new_sync_defects` y `sync_scenarios` sin esperas fijas.
- [x] Botones verdes con texto blanco pasados a colores con contraste AA.
