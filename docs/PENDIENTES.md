# Pendientes de Cultiveta

Recordatorio de lo que quedó abierto después de las Fases 1 a 3 (rama `feat/rediseno-oceano`).
Tachá cada punto (`[x]`) cuando esté resuelto.

---

## 1. Tareas tuyas para que la Fase 3 funcione en producción

- [ ] **Cloud Scheduler:** definir `OUTDOOR_SYNC_SECRET` en el servicio de Cloud Run y crear el job horario que llama a `POST /api/internal/outdoor-weather`. Comando en [fase3-propuesta.md](fase3-propuesta.md#configurar-cloud-scheduler-una-sola-vez). Hasta hacerlo, el clima exterior no se sincroniza solo.
- [ ] **Desplegar las reglas de Firestore:** `firebase deploy --only firestore:rules` (regla de `update` con `userId` y colección `aiUsage`).
- [ ] **Revisar variables de entorno** en Cloud Run: `APP_TIMEZONE` (por defecto Buenos Aires) y `AI_DAILY_LIMIT` (por defecto 60 consultas por día).

## 2. Decisiones pendientes de la Fase 2

- [ ] **Umbrales que difieren entre archivos** (hoy conviven, marcados "PENDIENTE DE DECISIÓN" en `src/utils/agronomicThresholds.ts`):

  | Umbral | Resumen IA | Tareas / alertas |
  |---|---|---|
  | Temperatura alta | > 30 °C | ≥ 29 °C (el texto dice 28 °C) |
  | Humedad en floración | > 62 % | ≥ 65 % |
  | pH | alerta fuera de 5,8–6,7 (el texto dice 6,0–6,5) | recomendado 5,8–6,2 veg. / 6,2–6,5 flor. |
  | Días sin riego | ≥ 4 días fijo | 2–3 días según etapa |

- [ ] **Drenaje por categoría** (no drenó / poco / normal / mucho): hoy se guarda pero el pronóstico no lo usa. Definir cómo sumarlo.
- [ ] **`@types/react`** (dependencia nueva): sin ella TypeScript no revisa las props de los componentes.
- [ ] **Peso de la maceta:** quedaron 4 niveles (un test lo exige) en vez de los 3 de la maqueta.
- [ ] **Confirmar:** un cultivo sin riegos ahora dice "primer riego pendiente" en lugar de "atrasado".

## 3. Decisiones y datos pendientes de la Fase 3

- [ ] **`react-router`** (dependencia nueva): URLs por pantalla y botón "atrás" de Android.
- [ ] **Email de contacto** para la página web pública de borrado de cuenta (requisito de Google Play).
- [ ] **Huella SHA-256** de la firma de la app para `/.well-known/assetlinks.json` (TWA en Play Store).
- [ ] **Capturas de pantalla** para el manifest y la ficha de la tienda.
- [ ] **Umbrales del clima exterior** en `server.ts` (35 / 11 °C, 75 / 25 %): otra copia distinta a las de la Fase 2.

## 4. Hallazgos para más adelante (no tocados)

- [ ] `src/services/taskService.ts`: la fecha del último riego se interpreta en UTC y en Argentina queda un día antes (afecta el cálculo del próximo riego).
- [ ] El Inicio inventa valores cuando faltan datos: 24 °C / 55 % de ambiente y 1,5 L de riego.
- [ ] Más umbrales duplicados: `cultivationService` (32 °C) y `CultivationDetailView` (18–29 °C, 40–70 %).
- [ ] Tests de jsdom que importan React antes de armar el DOM: no detectan cambios en campos de formulario.
- [ ] Tests intermitentes: `new_sync_defects` caso 2 y `sync_scenarios` (a veces se cuelga).
- [ ] El test E2E dice que no encuentra Chrome aunque está instalado en `C:\Program Files\Google\Chrome`.
- [ ] Varios botones verdes con texto blanco (`bg-ok` + `text-white`) fuera del Inicio no llegan al contraste AA.
