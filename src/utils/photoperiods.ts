/**
 * Fotoperiodos de Cultiveta: horas de luz y de oscuridad de cada ciclo.
 *
 * - Los ciclos normales duran 24 h (luz + oscuridad = 24).
 * - Los superciclos duran más de 24 h (13/13 = 26 h, 14/14 = 28 h). Son experimentales y solo se pueden
 *   usar con un enchufe inteligente Wi-Fi que maneje ciclos de más de 24 h: un temporizador común
 *   repite el mismo horario todos los días y no puede hacerlos.
 *
 * Módulo puro.
 */

export type PhotoperiodPhase = 'veg' | 'flower';

export interface PhotoperiodPreset {
  id: string;
  light: number;
  dark: number;
  name: string;
  hint: string;
  phase: PhotoperiodPhase;
  /** Aclaración corta que se muestra entre paréntesis. */
  note?: string;
  /** Ciclo de más de 24 h: experimental y con enchufe inteligente. */
  supercycle?: boolean;
}

/**
 * Máximo de horas de luz en un ciclo de 24 h. Siempre tiene que haber oscuridad: el vegetativo más
 * largo es 20/4 (recomendado para autoflorecientes).
 */
export const MAX_LIGHT_HOURS = 20;

/** Horas de luz dentro de lo permitido (0 a MAX_LIGHT_HOURS). */
export function clampLightHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.min(MAX_LIGHT_HOURS, Math.max(0, Math.round(hours)));
}

export const PHOTOPERIOD_PRESETS: ReadonlyArray<PhotoperiodPreset> = [
  { id: '18-6', light: 18, dark: 6, name: 'Vegetativo', hint: 'El clásico de vegetativo.', phase: 'veg' },
  {
    id: '20-4',
    light: 20,
    dark: 4,
    name: 'Vegetativo largo',
    note: 'recomendado para autoflorecientes',
    hint: '20 horas de luz y 4 de oscuridad. Recomendado para autoflorecientes.',
    phase: 'veg',
  },
  { id: '12-12', light: 12, dark: 12, name: 'Floración clásica', hint: 'El estándar para inducir y mantener la floración.', phase: 'flower' },
  {
    id: '13-11',
    light: 13,
    dark: 11,
    name: 'Floración +1 h',
    hint: 'Floración con una hora más de luz: la planta florece igual y gana más peso en las flores.',
    phase: 'flower',
  },
  {
    id: '13-13',
    light: 13,
    dark: 13,
    name: 'Superciclo 26 h',
    hint: 'Ciclo de 26 horas: 13 de luz y 13 de oscuridad.',
    phase: 'flower',
    supercycle: true,
  },
  {
    id: '14-14',
    light: 14,
    dark: 14,
    name: 'Superciclo 28 h',
    hint: 'Ciclo de 28 horas: 14 de luz y 14 de oscuridad.',
    phase: 'flower',
    supercycle: true,
  },
];

export const STANDARD_PRESETS = PHOTOPERIOD_PRESETS.filter((p) => !p.supercycle);
export const SUPERCYCLE_PRESETS = PHOTOPERIOD_PRESETS.filter((p) => p.supercycle);
/** Cuadro "Vegetativo": 18/6 y 20/4. */
export const VEG_PRESETS = STANDARD_PRESETS.filter((p) => p.phase === 'veg');
/** Cuadro "Floración": 12/12 y 13/11. */
export const FLOWER_PRESETS = STANDARD_PRESETS.filter((p) => p.phase === 'flower');

/** Horas de oscuridad: las guardadas; si no hay, las que completan 24 h. */
export function darkHoursFor(light: number, dark?: number | null): number {
  if (typeof dark === 'number' && Number.isFinite(dark) && dark >= 0) return dark;
  return Math.max(0, 24 - (Number.isFinite(light) ? light : 0));
}

export function findPhotoperiodPreset(light: number, dark?: number | null): PhotoperiodPreset | null {
  const d = darkHoursFor(light, dark);
  return PHOTOPERIOD_PRESETS.find((p) => p.light === light && p.dark === d) || null;
}

export interface PhotoperiodDescription {
  light: number;
  dark: number;
  /** "13/11" */
  label: string;
  cycleHours: number;
  supercycle: boolean;
  /** Nombre del preset ("Floración +1 h") o "Superciclo N h"; null si no coincide con ninguno. */
  name: string | null;
  /** Porcentaje del ciclo con luz y con oscuridad (sobre la duración real del ciclo). */
  lightPct: number;
  darkPct: number;
}

export function describePhotoperiod(light: number, dark?: number | null): PhotoperiodDescription {
  const l = Number.isFinite(light) ? Math.max(0, light) : 0;
  const d = darkHoursFor(l, dark);
  const cycleHours = l + d;
  const supercycle = cycleHours > 24;
  const preset = findPhotoperiodPreset(l, d);
  const lightPct = cycleHours > 0 ? Math.round((l / cycleHours) * 100) : 0;
  return {
    light: l,
    dark: d,
    label: `${l}/${d}`,
    cycleHours,
    supercycle,
    name: preset?.name || (supercycle ? `Superciclo ${cycleHours} h` : null),
    lightPct,
    darkPct: cycleHours > 0 ? 100 - lightPct : 0,
  };
}

/**
 * ¿Se pueden elegir superciclos? Solo con un enchufe inteligente Wi-Fi conectado a la app
 * (hoja de ruta, punto 2). Mientras no exista esa integración, quedan visibles pero bloqueados.
 */
export function canUseSupercycles(hasSmartPlug = false): boolean {
  return hasSmartPlug;
}
