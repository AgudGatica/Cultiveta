/**
 * Nivel del grower, XP, logros y racha.
 *
 * Todo se CALCULA a partir de los registros que ya están en Firestore (no hay contador de XP):
 * el historial viejo cuenta, funciona igual en varios dispositivos y no se desincroniza.
 * Lo único que se guarda aparte es cuándo se ganó cada logro y el último nivel festejado
 * (users/{uid}/progress/state), para que cada festejo aparezca una sola vez.
 *
 * Módulo puro (sin React ni Firebase) para poder testearlo.
 */
import type {
  Cultivation,
  DiaryEntry,
  EnvironmentRecord,
  Harvest,
  PhotoRecord,
  Watering,
} from '../types';
import { addDays, getLocalTodayDateOnly, isFloweringStage, parseDateOnly } from './growthStageUtils';

// ─────────────────────────────────────────────────────────────
// Niveles
// ─────────────────────────────────────────────────────────────

export const LEVELS: ReadonlyArray<{ minXp: number; name: string }> = [
  { minXp: 0, name: 'Semilla' },
  { minXp: 120, name: 'Germinado' },
  { minXp: 300, name: 'Plántula' },
  { minXp: 600, name: 'Grower' },
  { minXp: 1000, name: 'Cultivador' },
  { minXp: 1600, name: 'Jardinero experto' },
  { minXp: 2400, name: 'Maestro del indoor' },
  { minXp: 3500, name: 'Leyenda verde' },
];

export interface LevelInfo {
  /** Número de nivel, desde 1. */
  level: number;
  name: string;
  xp: number;
  /** XP mínimo del nivel actual. */
  floorXp: number;
  /** XP para el próximo nivel (null en el máximo). */
  nextXp: number | null;
  nextName: string | null;
  /** Avance de la barra dentro del nivel actual, de 0 a 1. */
  pct: number;
}

export function levelInfo(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let i = 0;
  while (i + 1 < LEVELS.length && safeXp >= LEVELS[i + 1].minXp) i++;
  const current = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    name: current.name,
    xp: safeXp,
    floorXp: current.minXp,
    nextXp: next ? next.minXp : null,
    nextName: next ? next.name : null,
    pct: next ? (safeXp - current.minXp) / (next.minXp - current.minXp) : 1,
  };
}

// ─────────────────────────────────────────────────────────────
// XP
// ─────────────────────────────────────────────────────────────

export type XpSource =
  | 'watering'
  | 'photo'
  | 'environment'
  | 'diary'
  | 'cultivation'
  | 'fertilization'
  | 'stage'
  | 'aiAnalysis'
  | 'harvest';

export const XP_RULES: Record<XpSource, { xp: number; label: string; howTo: string }> = {
  watering: { xp: 10, label: 'Riego registrado', howTo: 'Registrar un riego' },
  photo: { xp: 12, label: 'Foto agregada', howTo: 'Subir una foto' },
  environment: { xp: 6, label: 'Ambiente registrado', howTo: 'Anotar temperatura y humedad' },
  diary: { xp: 8, label: 'Nota del diario', howTo: 'Escribir una nota del diario' },
  cultivation: { xp: 15, label: 'Cultivo nuevo', howTo: 'Crear un cultivo' },
  fertilization: { xp: 10, label: 'Tabla de fertilización', howTo: 'Armar una tabla de fertilización' },
  stage: { xp: 10, label: 'Cambio de etapa', howTo: 'Registrar un cambio de etapa' },
  aiAnalysis: { xp: 5, label: 'Diagnóstico con IA', howTo: 'Analizar una foto con IA' },
  harvest: { xp: 40, label: 'Cosecha registrada', howTo: 'Registrar una cosecha' },
};

export const XP_SOURCES = Object.keys(XP_RULES) as XpSource[];

/** XP extra por cada logro desbloqueado. */
export const BADGE_XP = 30;

// ─────────────────────────────────────────────────────────────
// Datos de entrada
// ─────────────────────────────────────────────────────────────

type Demoable = { isDemo?: boolean };

export interface ProgressInput {
  cultivations: Array<Pick<Cultivation, 'currentStage' | 'stagesTimeline' | 'floweringStartDate' | 'isFinished'> & Demoable>;
  waterings: Array<Pick<Watering, 'date' | 'volumeLiters' | 'phIn' | 'phRunoff' | 'createdAt'> & { time?: string } & Demoable>;
  environmentRecords: Array<Pick<EnvironmentRecord, 'date' | 'createdAt'> & { time?: string; isAutoLogged?: boolean } & Demoable>;
  photos: Array<Pick<PhotoRecord, 'date' | 'createdAt'> & Demoable>;
  diaryEntries: Array<Pick<DiaryEntry, 'date' | 'createdAt'> & Demoable>;
  harvests: Array<Demoable>;
  fertilizationSchedules: Array<Demoable>;
  photoAnalyses: Array<Demoable>;
}

export interface ProgressOptions {
  /** Contar los datos de ejemplo (true para mostrar; false para festejar y guardar). */
  includeDemo?: boolean;
  /** Fecha local de hoy (YYYY-MM-DD). Por defecto, la del dispositivo. */
  today?: string;
}

/** Etapas desde las que se considera que el cultivo ya floreció. */
const POST_FLOWERING_STAGES = ['floración', 'maduración', 'lavado', 'cosecha', 'cosechado', 'secado', 'curado', 'finalizado'];

function reachedFlowering(c: ProgressInput['cultivations'][number]): boolean {
  const stage = (c.currentStage || '').toLowerCase().trim();
  if (isFloweringStage(c.currentStage) || POST_FLOWERING_STAGES.includes(stage)) return true;
  if (c.floweringStartDate) return true;
  return Boolean(c.stagesTimeline?.some((s) => isFloweringStage(s.name) && s.actualStartDate));
}

/** Cambios de etapa reales: etapas con fecha real, sin contar la primera (el arranque del cultivo). */
export function countStageChanges(c: Pick<Cultivation, 'stagesTimeline'>): number {
  const withRealDate = (c.stagesTimeline || []).filter((s) => Boolean(s.actualStartDate)).length;
  return Math.max(0, withRealDate - 1);
}

function dateKey(value?: string | null): string | null {
  const p = parseDateOnly(value);
  if (!p) return null;
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Hora local (0–23) de un registro: el campo "time" si existe; si no, createdAt. */
function recordHour(r: { time?: string; createdAt?: string }): number | null {
  if (r.time && /^\d{1,2}:\d{2}/.test(r.time)) return Number(r.time.split(':')[0]);
  if (r.createdAt) {
    const d = new Date(r.createdAt);
    if (!Number.isNaN(d.getTime())) return d.getHours();
  }
  return null;
}

export const EARLY_BIRD_FROM_HOUR = 5;
export const EARLY_BIRD_UNTIL_HOUR = 8;

// ─────────────────────────────────────────────────────────────
// Racha
// ─────────────────────────────────────────────────────────────

/** Días (YYYY-MM-DD, hora local) con al menos un riego, foto, ambiente manual o nota. */
export function activeDays(input: ProgressInput, options: ProgressOptions = {}): Set<string> {
  const keep = <T extends Demoable>(list: T[]) => (options.includeDemo === false ? list.filter((x) => !x.isDemo) : list);
  const days = new Set<string>();
  const add = (value?: string) => {
    const key = dateKey(value);
    if (key) days.add(key);
  };
  keep(input.waterings).forEach((w) => add(w.date));
  keep(input.photos).forEach((p) => add(p.date));
  keep(input.environmentRecords).filter((e) => !e.isAutoLogged).forEach((e) => add(e.date));
  keep(input.diaryEntries).forEach((d) => add(d.date));
  return days;
}

/** Días seguidos con registros. Si hoy todavía no hay registros, cuenta hasta ayer. */
export function currentStreak(days: Set<string>, today: string = getLocalTodayDateOnly()): number {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
// Logros
// ─────────────────────────────────────────────────────────────

export interface ProgressStats {
  counts: Record<XpSource, number>;
  totalLiters: number;
  wateringsWithPh: number;
  floweringCrops: number;
  hasEarlyBird: boolean;
  streak: number;
  bestStreak: number;
  /** Riegos + fotos + ambiente manual + notas. */
  totalRecords: number;
}

/** Nombre del ícono de lucide-react (se resuelve en la interfaz). */
export type BadgeIcon =
  | 'Sprout'
  | 'Trees'
  | 'Droplet'
  | 'Droplets'
  | 'Waves'
  | 'FlaskConical'
  | 'Camera'
  | 'Images'
  | 'Thermometer'
  | 'NotebookPen'
  | 'ClipboardList'
  | 'Flower2'
  | 'Scissors'
  | 'ScanSearch'
  | 'Flame'
  | 'Zap'
  | 'Sunrise';

export interface BadgeDef {
  id: string;
  icon: BadgeIcon;
  name: string;
  description: string;
  test: (s: ProgressStats) => boolean;
}

export const BADGES: ReadonlyArray<BadgeDef> = [
  { id: 'first_crop', icon: 'Sprout', name: 'Primer cultivo', description: 'Creaste tu primer cultivo', test: (s) => s.counts.cultivation >= 1 },
  { id: 'crops_5', icon: 'Trees', name: 'Cultivo en serie', description: '5 cultivos cargados', test: (s) => s.counts.cultivation >= 5 },
  { id: 'first_watering', icon: 'Droplet', name: 'Primer riego', description: 'Registraste tu primer riego', test: (s) => s.counts.watering >= 1 },
  { id: 'waterings_25', icon: 'Droplets', name: 'Mano firme', description: '25 riegos registrados', test: (s) => s.counts.watering >= 25 },
  { id: 'liters_50', icon: 'Waves', name: 'Medio centenar', description: '50 litros regados en total', test: (s) => s.totalLiters >= 50 },
  { id: 'ph_10', icon: 'FlaskConical', name: 'pH al día', description: '10 riegos con pH medido', test: (s) => s.wateringsWithPh >= 10 },
  { id: 'first_photo', icon: 'Camera', name: 'Primera foto', description: 'Subiste tu primera foto', test: (s) => s.counts.photo >= 1 },
  { id: 'photos_50', icon: 'Images', name: 'Álbum completo', description: '50 fotos de seguimiento', test: (s) => s.counts.photo >= 50 },
  { id: 'environment_10', icon: 'Thermometer', name: 'Clima bajo control', description: '10 registros de ambiente', test: (s) => s.counts.environment >= 10 },
  { id: 'first_note', icon: 'NotebookPen', name: 'Primera nota', description: 'Escribiste en el diario', test: (s) => s.counts.diary >= 1 },
  { id: 'fertilization_plan', icon: 'ClipboardList', name: 'Plan de nutrición', description: 'Armaste una tabla de fertilización', test: (s) => s.counts.fertilization >= 1 },
  { id: 'first_flowers', icon: 'Flower2', name: 'Primeras flores', description: 'Un cultivo llegó a floración', test: (s) => s.floweringCrops >= 1 },
  { id: 'first_harvest', icon: 'Scissors', name: 'Primera cosecha', description: 'Registraste tu primera cosecha', test: (s) => s.counts.harvest >= 1 },
  { id: 'first_ai_diagnosis', icon: 'ScanSearch', name: 'Ojo clínico', description: 'Analizaste una foto con IA', test: (s) => s.counts.aiAnalysis >= 1 },
  { id: 'streak_7', icon: 'Flame', name: 'Semana completa', description: '7 días seguidos registrando', test: (s) => s.bestStreak >= 7 },
  { id: 'streak_30', icon: 'Zap', name: 'Constancia total', description: '30 días seguidos registrando', test: (s) => s.bestStreak >= 30 },
  { id: 'early_bird', icon: 'Sunrise', name: 'Madrugador', description: 'Un registro entre las 5 y las 8 de la mañana', test: (s) => s.hasEarlyBird },
];

export function computeStats(input: ProgressInput, options: ProgressOptions = {}): ProgressStats {
  const keep = <T extends Demoable>(list: T[]) => (options.includeDemo === false ? list.filter((x) => !x.isDemo) : list);
  const cultivations = keep(input.cultivations);
  const waterings = keep(input.waterings);
  const manualEnv = keep(input.environmentRecords).filter((e) => !e.isAutoLogged);
  const photos = keep(input.photos);
  const diary = keep(input.diaryEntries);

  const counts: Record<XpSource, number> = {
    watering: waterings.length,
    photo: photos.length,
    environment: manualEnv.length,
    diary: diary.length,
    cultivation: cultivations.length,
    fertilization: keep(input.fertilizationSchedules).length,
    stage: cultivations.reduce((acc, c) => acc + countStageChanges(c), 0),
    aiAnalysis: keep(input.photoAnalyses).length,
    harvest: keep(input.harvests).length,
  };

  const isEarly = (r: { time?: string; createdAt?: string }) => {
    const h = recordHour(r);
    return h !== null && h >= EARLY_BIRD_FROM_HOUR && h < EARLY_BIRD_UNTIL_HOUR;
  };

  const days = activeDays(input, options);
  return {
    counts,
    totalLiters: waterings.reduce((acc, w) => acc + (Number(w.volumeLiters) > 0 ? Number(w.volumeLiters) : 0), 0),
    wateringsWithPh: waterings.filter((w) => typeof w.phIn === 'number' || typeof w.phRunoff === 'number').length,
    floweringCrops: cultivations.filter(reachedFlowering).length,
    hasEarlyBird: [...waterings, ...manualEnv, ...photos, ...diary].some(isEarly),
    streak: currentStreak(days, options.today),
    bestStreak: bestStreak(days),
    totalRecords: waterings.length + photos.length + manualEnv.length + diary.length,
  };
}

export function evaluateBadges(stats: ProgressStats): string[] {
  return BADGES.filter((b) => {
    try {
      return b.test(stats);
    } catch {
      return false;
    }
  }).map((b) => b.id);
}

export function baseXp(counts: Record<XpSource, number>): number {
  return XP_SOURCES.reduce((acc, s) => acc + counts[s] * XP_RULES[s].xp, 0);
}

export interface GrowerProgress {
  stats: ProgressStats;
  unlockedBadgeIds: string[];
  xp: number;
  level: LevelInfo;
}

export function computeProgress(input: ProgressInput, options: ProgressOptions = {}): GrowerProgress {
  const stats = computeStats(input, options);
  const unlockedBadgeIds = evaluateBadges(stats);
  const xp = baseXp(stats.counts) + unlockedBadgeIds.length * BADGE_XP;
  return { stats, unlockedBadgeIds, xp, level: levelInfo(xp) };
}

// ─────────────────────────────────────────────────────────────
// Festejos: qué es nuevo entre dos cálculos
// ─────────────────────────────────────────────────────────────

/** Lo que se guarda en users/{uid}/progress/state. */
export interface PersistedProgress {
  /** id del logro → fecha ISO en que se ganó. */
  badges: Record<string, string>;
  /** Último nivel festejado. */
  celebratedLevel: number;
}

export interface XpEvent {
  source: XpSource;
  xp: number;
  label: string;
}

export interface ProgressDiff {
  /** Primera vez de la cuenta: guardar el estado actual sin festejar. */
  initialize: boolean;
  xpEvents: XpEvent[];
  newBadgeIds: string[];
  levelUp: LevelInfo | null;
}

/**
 * Compara el progreso anterior con el nuevo (ambos SIN datos de ejemplo) y lo ya festejado.
 * - persisted null → primera vez: no se festeja nada, solo se inicializa.
 * - previous null → no hay base para avisos "+XP" (recién cargó la app).
 */
export function diffProgress(
  previous: GrowerProgress | null,
  next: GrowerProgress,
  persisted: PersistedProgress | null
): ProgressDiff {
  if (!persisted) {
    return { initialize: true, xpEvents: [], newBadgeIds: [], levelUp: null };
  }
  const xpEvents: XpEvent[] = [];
  if (previous) {
    for (const source of XP_SOURCES) {
      const delta = next.stats.counts[source] - previous.stats.counts[source];
      if (delta > 0) {
        xpEvents.push({ source, xp: delta * XP_RULES[source].xp, label: XP_RULES[source].label });
      }
    }
  }
  const newBadgeIds = next.unlockedBadgeIds.filter((id) => !persisted.badges[id]);
  const levelUp = next.level.level > (persisted.celebratedLevel || 1) ? next.level : null;
  return { initialize: false, xpEvents, newBadgeIds, levelUp };
}
