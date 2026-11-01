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
