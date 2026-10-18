/**
 * Umbrales agronómicos centralizados (cultivo bajo control: indoor / invernadero).
 *
 * Fuente única para el resumen de registros (IA), las tareas, el Inicio, el detalle del cultivo
 * y el estado de salud. Valores unificados según la decisión del 2026-10-17 ("Resumen + ventana").
 *
 * Los umbrales de alertas de clima EXTERIOR del servidor (server.ts: 35/11 °C, 75/25 %) son
 * aparte a propósito: aplican a cultivos al aire libre y cada persona puede personalizarlos.
 *
 * El "riego atrasado" NO usa un plazo fijo: sale de la ventana de calculateIrrigationForecast.
 */

// ---------------------------------------------------------------------------
// Temperatura (°C)
// ---------------------------------------------------------------------------

/** Alerta de temperatura alta si la lectura es > 30 °C. */
export const TEMP_HIGH_ALERT_C = 30;
/** Alerta de temperatura baja si la lectura es < 17 °C. */
export const TEMP_LOW_ALERT_C = 17;
/** Resumen: alerta de amplitud térmica si (máx - mín) >= 9 °C. */
export const TEMP_SWING_ALERT_C = 9;

// ---------------------------------------------------------------------------
// Humedad relativa (%)
// ---------------------------------------------------------------------------

/** Alerta de humedad alta en floración / maduración si es > 62 %. */
export const FLOWER_HUMIDITY_HIGH_PCT = 62;
/** Alerta de humedad baja en vegetativo si es < 45 %. */
export const VEG_HUMIDITY_LOW_PCT = 45;
/** Alerta de humedad muy baja en cualquier etapa si es < 30 %. */
export const HUMIDITY_CRITICAL_LOW_PCT = 30;

// ---------------------------------------------------------------------------
// VPD (kPa)
// ---------------------------------------------------------------------------

/** VPD alto si es > 1.55 kPa. */
export const VPD_HIGH_KPA = 1.55;
/** VPD bajo en floración si es < 0.75 kPa. */
export const FLOWER_VPD_LOW_KPA = 0.75;

// ---------------------------------------------------------------------------
// pH y EC del riego
// ---------------------------------------------------------------------------

/** Rango de pH recomendado (texto para tareas y mensajes). */
export const PH_TARGET_MIN = 5.8;
export const PH_TARGET_MAX = 6.5;
export const PH_TARGET_TEXT = '5.8 - 6.5';
/** Alerta si el pH queda fuera de 5.8–6.7. */
export const PH_ALERT_MIN = 5.8;
export const PH_ALERT_MAX = 6.7;

/** EC de entrada elevada si es > 2.2 mS/cm. */
export const EC_HIGH_MS = 2.2;
/** Salinidad del drenaje si EC drenaje > EC entrada × 1.35. */
export const RUNOFF_EC_RATIO_ALERT = 1.35;

// ---------------------------------------------------------------------------
// Riego (días)
// ---------------------------------------------------------------------------

/**
 * Intervalo de referencia por etapa. Lo usa calculateIrrigationForecast como base cuando todavía
 * no hay historial suficiente; no se usa directamente para decidir "atrasado".
 */
export const WATERING_INTERVAL_DAYS = {
  default: 3,
  finished: 0,
  flowering: 2,
  ripening: 2,
  seedling: 3,
  vegetative: 3,
} as const;

// ---------------------------------------------------------------------------
// Helpers de evaluación
// ---------------------------------------------------------------------------

export function isFlowerOrRipeningStage(stage?: string): boolean {
  const s = (stage || '').toLowerCase();
  return s.includes('flor') || s.includes('madur');
}

/** Evalúa una lectura ambiental puntual. Solo evalúa los valores que existen (no supone nada). */
export function evaluateEnvironmentReading(
  reading: { temperatureC?: number | null; humidityPct?: number | null },
  stage?: string
): { tempHigh: boolean; tempLow: boolean; humidityHigh: boolean; humidityLow: boolean } {
  const t = typeof reading.temperatureC === 'number' ? reading.temperatureC : null;
  const h = typeof reading.humidityPct === 'number' ? reading.humidityPct : null;
  const flower = isFlowerOrRipeningStage(stage);
  const veg = (stage || '').toLowerCase().includes('vege');
  return {
    tempHigh: t !== null && t > TEMP_HIGH_ALERT_C,
    tempLow: t !== null && t < TEMP_LOW_ALERT_C,
    humidityHigh: h !== null && flower && h > FLOWER_HUMIDITY_HIGH_PCT,
    humidityLow: h !== null && (h < HUMIDITY_CRITICAL_LOW_PCT || (veg && h < VEG_HUMIDITY_LOW_PCT)),
  };
}
