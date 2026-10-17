/**
 * Umbrales agronómicos centralizados.
 *
 * Fuente única para condenseRecords.ts, wateringAlertUtils.ts y taskService.ts.
 * Los valores son exactamente los que tenía cada archivo. Donde dos archivos usaban
 * valores distintos para el mismo concepto, se conservan ambos con nombre propio
 * (marcados "PENDIENTE DE DECISIÓN") hasta definir un valor único.
 */

// ---------------------------------------------------------------------------
// Temperatura (°C)
// ---------------------------------------------------------------------------

/** PENDIENTE DE DECISIÓN: resumen de registros alerta con máxima > 30 °C. */
export const SUMMARY_TEMP_HIGH_ALERT_C = 30;
/** PENDIENTE DE DECISIÓN: tarea de alerta climática con lectura >= 29 °C. */
export const TASK_TEMP_HIGH_ALERT_C = 29;

/** Resumen: alerta si la mínima registrada es < 17 °C. */
export const SUMMARY_TEMP_LOW_ALERT_C = 17;
/** Resumen: alerta de amplitud térmica si (máx - mín) >= 9 °C. */
export const SUMMARY_TEMP_SWING_ALERT_C = 9;

// ---------------------------------------------------------------------------
// Humedad relativa (%)
// ---------------------------------------------------------------------------

/** PENDIENTE DE DECISIÓN: resumen alerta en floración con promedio > 62 %. */
export const SUMMARY_FLOWER_HUMIDITY_HIGH_PCT = 62;
/** PENDIENTE DE DECISIÓN: tarea de alerta en floración con lectura >= 65 %. */
export const TASK_FLOWER_HUMIDITY_HIGH_PCT = 65;

/** Resumen: alerta en vegetativo con promedio < 45 %. */
export const SUMMARY_VEG_HUMIDITY_LOW_PCT = 45;

// ---------------------------------------------------------------------------
// VPD (kPa)
// ---------------------------------------------------------------------------

/** Resumen: VPD promedio alto si > 1.55 kPa. */
export const SUMMARY_VPD_HIGH_KPA = 1.55;
/** Resumen: VPD promedio bajo en floración si < 0.75 kPa. */
export const SUMMARY_FLOWER_VPD_LOW_KPA = 0.75;

// ---------------------------------------------------------------------------
// pH y EC del riego
// ---------------------------------------------------------------------------

/** PENDIENTE DE DECISIÓN: resumen alerta si el pH promedio queda fuera de 5.8–6.7
 *  (el texto de la alerta menciona 6.0–6.5). */
export const SUMMARY_PH_MIN = 5.8;
export const SUMMARY_PH_MAX = 6.7;
/** PENDIENTE DE DECISIÓN: rango de pH recomendado en las tareas de riego. */
export const TASK_TARGET_PH_FLOWER = '6.2 - 6.5';
export const TASK_TARGET_PH_DEFAULT = '5.8 - 6.2';

/** Resumen: EC de entrada elevada si el promedio > 2.2 mS/cm. */
export const SUMMARY_EC_HIGH_MS = 2.2;
/** Resumen: salinidad del drenaje si EC drenaje > EC entrada × 1.35. */
export const SUMMARY_RUNOFF_EC_RATIO_ALERT = 1.35;

// ---------------------------------------------------------------------------
// Riego (días)
// ---------------------------------------------------------------------------

/** Intervalo recomendado de riego por etapa (usado por getRecommendedWateringIntervalDays). */
export const WATERING_INTERVAL_DAYS = {
  default: 3,
  finished: 0,
  flowering: 2,
  ripening: 2,
  seedling: 3,
  vegetative: 3,
} as const;

/** PENDIENTE DE DECISIÓN: el resumen alerta con >= 4 días sin riego, sin importar la etapa
 *  (las alertas de riego usan WATERING_INTERVAL_DAYS: 2–3 días según etapa). */
export const SUMMARY_DAYS_SINCE_WATERING_ALERT = 4;
