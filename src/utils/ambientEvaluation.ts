/**
 * Cómo está el clima de un ambiente (traído de Órbita): la franja de VPD del aire con "húmedo / óptimo /
 * seco" y la temperatura y la humedad de cada etapa. Módulo puro.
 */
import { vpdAir } from './deviceRules';
import { isFlowerOrRipeningStage } from './agronomicThresholds';

export interface AmbientTargets {
  label: string;
  /** Rangos óptimos [mín, máx]. */
  vpd: [number, number];
  temp: [number, number];
  rh: [number, number];
}

export const AMBIENT_TARGETS: Record<'plantula' | 'vegetativo' | 'floracion', AmbientTargets> = {
  plantula: { label: 'Plántula', vpd: [0.4, 0.8], temp: [22, 26], rh: [65, 75] },
  vegetativo: { label: 'Vegetativo', vpd: [0.8, 1.2], temp: [22, 28], rh: [55, 70] },
  floracion: { label: 'Floración', vpd: [1.1, 1.5], temp: [20, 27], rh: [40, 55] },
};

const isSeedling = (stage: string) => /germin|pl[aá]ntula|esqueje|enraiz/i.test(stage || '');

/** Los rangos para un ambiente según sus cultivos: si alguno florece, los de floración (los más estrictos con la humedad). */
export function targetsForStages(stages: string[]): AmbientTargets {
  if (stages.some((s) => isFlowerOrRipeningStage(s))) return AMBIENT_TARGETS.floracion;
  if (stages.length && stages.every(isSeedling)) return AMBIENT_TARGETS.plantula;
  return AMBIENT_TARGETS.vegetativo;
}

export type Level = 'baja' | 'bien' | 'alta';
const level = (v: number, [lo, hi]: [number, number]): Level => (v < lo ? 'baja' : v > hi ? 'alta' : 'bien');

export interface AmbientEvaluation {
  vpd: number;
  /** El aire: húmedo (VPD bajo), óptimo o seco (VPD alto). */
  band: 'humedo' | 'optimo' | 'seco';
  temp: Level;
  rh: Level;
  /** Para dibujar la franja (0–100 %): dónde empieza y termina lo óptimo y dónde cae la lectura. */
  bar: { optStart: number; optEnd: number; marker: number };
}

const BAR_MIN = 0.2;
const BAR_MAX = 2.2;
const pct = (v: number) => Math.min(100, Math.max(0, ((v - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));

export function evaluateAmbient(reading: { temperatureC: number; humidityPct: number }, targets: AmbientTargets): AmbientEvaluation {
  const vpd = Math.round(vpdAir(reading.temperatureC, reading.humidityPct) * 100) / 100;
  const [lo, hi] = targets.vpd;
  return {
    vpd,
    band: vpd < lo ? 'humedo' : vpd > hi ? 'seco' : 'optimo',
    temp: level(reading.temperatureC, targets.temp),
    rh: level(reading.humidityPct, targets.rh),
    bar: { optStart: pct(lo), optEnd: pct(hi), marker: pct(vpd) },
  };
}

/** Una lectura a mano sirve 12 horas (después hay que volver a cargarla). */
export const MANUAL_READING_TTL_MS = 12 * 3_600_000;

export interface AmbientPoint {
  at: number;
  temp: number;
  rh: number;
  vpd: number;
}

/** Cuándo se tomó una lectura (ms): la hora guardada o, si no hay, la fecha y la hora anotadas. */
export const envRecordAt = (r: { createdAt?: string; date: string; time?: string }): number =>
  Date.parse(r.createdAt || '') || Date.parse(`${r.date}T${r.time || '12:00'}`) || 0;

/**
 * Histórico del clima de un ambiente desde `from` (ms), de la más vieja a la más nueva. Una lectura
 * anotada para todo el ambiente queda en cada cultivo de adentro: se cuenta una sola vez.
 */
export function ambientHistory(
  records: Array<{ createdAt?: string; date: string; time?: string; temperatureC: number; humidityPct: number }>,
  from = 0
): AmbientPoint[] {
  const seen = new Set<string>();
  const out: AmbientPoint[] = [];
  for (const r of records) {
    if (!Number.isFinite(r.temperatureC) || !Number.isFinite(r.humidityPct)) continue;
    const at = envRecordAt(r);
    if (!at || at < from) continue;
    const key = `${Math.round(at / 60000)}|${r.temperatureC}|${r.humidityPct}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at, temp: r.temperatureC, rh: r.humidityPct, vpd: Math.round(vpdAir(r.temperatureC, r.humidityPct) * 100) / 100 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Mínimo, promedio, máximo y qué parte de las lecturas cayó en el rango óptimo. */
export function historyStats(values: number[], [lo, hi]: [number, number]) {
  if (!values.length) return null;
  const sum = values.reduce((a, v) => a + v, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    inRangePct: Math.round((values.filter((v) => v >= lo && v <= hi).length / values.length) * 100),
  };
}
