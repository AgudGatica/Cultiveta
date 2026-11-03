/**
 * pH y EC recomendados para el próximo riego, según la etapa, el sustrato y si es automática.
 *
 * De dónde salen los números (revisado el 2026-11-03):
 * - pH: la planta toma mejor los nutrientes en tierra entre 6,2 y 6,8, y en coco u otro sustrato sin tierra
 *   entre 5,8 y 6,2 (NC State, Whipker: cannabis en sustrato, 5,8–6,2). En hidroponía los ensayos usaron 5,6–6,0
 *   (Guelph 2021: 5,6; McGill 2024: 5,8; Utah State 2025: 5,8–6,2). Los estudios mantuvieron el MISMO pH en todo
 *   el ciclo: no hay evidencia de que convenga cambiarlo entre vegetativo y floración, así que acá no cambia.
 * - EC (total, con el agua, en mS/cm): en floración, 1,9 en el punto medio del ensayo de Guelph (Bevan, Jones y
 *   Zheng 2021, hidroponía) y 2 alcanzó para el máximo rendimiento en Utah State (Hershkowitz, Westmoreland y
 *   Bugbee 2025): subir a 4 no dio más cosecha ni más cannabinoides. En sustrato de turba, 1,4–1,5 en todo el
 *   ciclo (Westmoreland y Bugbee 2022). En vegetativo, 2 en hidroponía (Utah State 2025).
 * - Plántula, primeras semanas de vegetativo y últimas de floración: no hay estudios con EC; son los rangos
 *   habituales de cultivo (plántula 0,4–0,8; bajar al final). Automáticas: un 20 % menos (costumbre de cultivo,
 *   por ser plantas más chicas).
 * Si la marca del fertilizante indica otra EC, manda la de la marca.
 */
import type { Cultivation, Watering } from '../types';
import { buildCultivationStageSchedule } from './growthStageUtils';
import { RUNOFF_EC_RATIO_ALERT } from './agronomicThresholds';
import { growMethodFromText, growMethodOf } from './growMethod';

export type FeedMedium = 'tierra' | 'coco' | 'hidro';
export type FeedPhase = 'plantula' | 'vege_inicio' | 'vegetativo' | 'floracion' | 'final';

export interface FeedRange {
  min: number;
  max: number;
  /** Valor al que apuntar. */
  target: number;
}

export interface FeedTarget {
  medium: FeedMedium;
  phase: FeedPhase;
  /** "Floración en coco". */
  label: string;
  auto: boolean;
  ph: FeedRange;
  ec: FeedRange;
  /** Aviso según el último riego (drenaje salado). */
  note: string | null;
  /** Tierra abonada al principio: con agua alcanza. */
  soilNote: string | null;
}

export const MEDIUM_LABEL: Record<FeedMedium, string> = { tierra: 'tierra', coco: 'coco', hidro: 'hidroponía' };
export const PHASE_LABEL: Record<FeedPhase, string> = {
  plantula: 'Plántula',
  vege_inicio: 'Vegetativo (primeras semanas)',
  vegetativo: 'Vegetativo',
  floracion: 'Floración',
  final: 'Final de floración',
};

const PH: Record<FeedMedium, FeedRange> = {
  tierra: { min: 6.2, max: 6.8, target: 6.5 },
  coco: { min: 5.8, max: 6.2, target: 6.0 },
  hidro: { min: 5.6, max: 6.0, target: 5.8 },
};

const EC: Record<FeedPhase, Record<FeedMedium, FeedRange>> = {
  plantula: { tierra: { min: 0.4, max: 0.8, target: 0.6 }, coco: { min: 0.4, max: 0.8, target: 0.6 }, hidro: { min: 0.4, max: 0.8, target: 0.6 } },
  vege_inicio: { tierra: { min: 0.8, max: 1.2, target: 1.0 }, coco: { min: 0.8, max: 1.2, target: 1.0 }, hidro: { min: 0.8, max: 1.2, target: 1.0 } },
  vegetativo: { tierra: { min: 1.0, max: 1.6, target: 1.3 }, coco: { min: 1.2, max: 1.6, target: 1.4 }, hidro: { min: 1.4, max: 2.0, target: 1.8 } },
  floracion: { tierra: { min: 1.2, max: 1.8, target: 1.5 }, coco: { min: 1.4, max: 2.0, target: 1.8 }, hidro: { min: 1.6, max: 2.2, target: 2.0 } },
  final: { tierra: { min: 0.8, max: 1.2, target: 1.0 }, coco: { min: 0.8, max: 1.2, target: 1.0 }, hidro: { min: 0.8, max: 1.2, target: 1.0 } },
};

/** Las automáticas: un 20 % menos de EC. */
const AUTO_FACTOR = 0.8;
/** Vegetativo: estas primeras semanas, más suave. */
const VEGE_START_DAYS = 14;
/** Floración: los últimos días antes de cortar, se baja. */
const FINAL_DAYS = 10;

const round1 = (v: number) => Math.round(v * 10) / 10;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Tierra, coco (y sustratos sin tierra) o hidroponía según el sustrato cargado (lo que no se reconoce cuenta como tierra). */
export function feedMediumOf(substrateType: string | undefined): FeedMedium {
  const m = growMethodFromText(substrateType);
  return m === 'hidro' ? 'hidro' : m === 'sustrato' ? 'coco' : 'tierra';
}

/** En qué parte del ciclo está (null si ya no se riega: cosechada, secando o curando). */
export function feedPhaseFor(crop: Cultivation): FeedPhase | null {
  const stage = norm(crop.currentStage || '');
  if (/cosech|secad|curad|finaliz/.test(stage)) return null;
  if (/germin|plantula/.test(stage)) return 'plantula';
  if (/madur/.test(stage)) return 'final';
  const schedule = buildCultivationStageSchedule(crop, []);
  if (/vege/.test(stage)) return schedule.activeStageElapsedDays <= VEGE_START_DAYS ? 'vege_inicio' : 'vegetativo';
  if (/flor/.test(stage)) return /pre/.test(stage) || schedule.daysUntilHarvest > FINAL_DAYS ? 'floracion' : 'final';
  return 'vegetativo';
}

/**
 * Lo recomendado para el próximo riego. waterings: los del cultivo (para mirar el último drenaje).
 * En living soil no hay pH ni EC que recomendar (null: ver livingSoilGuide).
 */
export function feedTargetFor(crop: Cultivation, waterings: Watering[] = []): FeedTarget | null {
  const phase = feedPhaseFor(crop);
  if (!phase) return null;
  const method = growMethodOf(crop);
  if (method === 'living_soil') return null;
  const medium: FeedMedium = method === 'hidro' ? 'hidro' : method === 'sustrato' ? 'coco' : 'tierra';
  // turba, perlita o lana de roca: mismos valores que el coco, pero se dice "sustrato"
  const mediumLabel = method === 'sustrato' && !/coco/i.test(crop.substrate?.type || '') ? 'sustrato' : MEDIUM_LABEL[medium];
  const auto = /auto/i.test(crop.photoperiodType || '');
  const base = EC[phase][medium];
  const k = auto && phase !== 'plantula' ? AUTO_FACTOR : 1;
  const ec: FeedRange = { min: round1(base.min * k), max: round1(base.max * k), target: round1(base.target * k) };

  // El último riego con drenaje medido: si salió bastante más salado que lo que entró, se acumulan sales
  const last = waterings
    .filter((w) => w.cultivationId === crop.id && Number(w.ecIn) > 0 && Number(w.ecRunoff) > 0)
    .sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`))[0];
  let note: string | null = null;
  if (last && Number(last.ecRunoff) > Number(last.ecIn) * RUNOFF_EC_RATIO_ALERT) {
    note = `El último drenaje salió más salado (EC ${num(Number(last.ecRunoff))} contra ${num(Number(last.ecIn))} que entró): esta vez apuntá a EC ${num(ec.min)} o regá con agua sola.`;
  }
  const soilNote = medium === 'tierra' && (phase === 'plantula' || phase === 'vege_inicio') ? 'Si la tierra vino abonada, estas semanas alcanza con agua (con el pH bien).' : null;

  return { medium, phase, label: `${PHASE_LABEL[phase]} en ${mediumLabel}`, auto, ph: { ...PH[medium] }, ec, note, soilNote };
}

export type ReadingCheck = 'bien' | 'bajo' | 'alto';

/** ¿Lo que se midió está en el rango? */
export function checkReading(value: number, range: FeedRange): ReadingCheck {
  if (value < range.min) return 'bajo';
  if (value > range.max) return 'alto';
  return 'bien';
}

export interface LivingSoilGuide {
  phase: FeedPhase;
  /** "Floración en living soil". */
  label: string;
  /** Una sola sugerencia para la etapa. */
  tip: string;
}

const LIVING_TIPS: Record<FeedPhase, string> = {
  plantula: 'Mantené la tierra apenas húmeda: la plántula no necesita nada más.',
  vege_inicio: 'Solo agua. La tierra ya tiene lo que la planta necesita para arrancar.',
  vegetativo: 'Cada 3 a 4 semanas, sumá una capa de humus de lombriz o compost arriba de la tierra (cobertura).',
  floracion: 'Al empezar la floración, una enmienda de floración en la cobertura; si querés, tés de compost.',
  final: 'Solo agua hasta la cosecha.',
};

/** Living soil: no se riega con pH ni EC; una sugerencia según la etapa. */
export function livingSoilGuide(crop: Cultivation): LivingSoilGuide | null {
  if (growMethodOf(crop) !== 'living_soil') return null;
  const phase = feedPhaseFor(crop);
  if (!phase) return null;
  return { phase, label: `${PHASE_LABEL[phase]} en living soil`, tip: LIVING_TIPS[phase] };
}

/** 6,0 / 1,4 (coma decimal, un decimal). */
export const num = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
