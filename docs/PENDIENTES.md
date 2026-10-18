# Pendientes de Cultiveta

Recordatorio de lo que queda abierto. Tachá cada punto (`[x]`) cuando esté resuelto.
Última actualización: 2026-10-17.

---

## 1. Tareas tuyas para que la Fase 3 funcione en producción

- [ ] **Cloud Scheduler:** definir `OUTDOOR_SYNC_SECRET` en el servicio de Cloud Run y crear el job horario que llama a `POST /api/internal/outdoor-weather`. Comando en [fase3-propuesta.md](fase3-propuesta.md#configurar-cloud-scheduler-una-sola-vez). Hasta hacerlo, el clima exterior no se sincroniza solo.
- [ ] **Desplegar las reglas de Firestore:** `firebase deploy --only firestore:rules` (regla de `update` con `userId` y colección `aiUsage`).
- [ ] **Revisar variables de entorno** en Cloud Run: `APP_TIMEZONE` (por defecto Buenos Aires) y `AI_DAILY_LIMIT` (por defecto 60 consultas por día).

## 2. Datos que necesito para Google Play

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
