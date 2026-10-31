/**
 * Ciclo de luz del cultivo (traído de la app de referencia Órbita).
 *
 * Con la hora en que se prende la luz y las horas de luz y oscuridad, calcula si ahora está prendida
 * o apagada, cuánto falta para el próximo cambio y cómo queda cada uno de los próximos días.
 * Sirve para la luz manejada a mano (un timer) y, más adelante, para un enchufe inteligente.
 *
 * - Ciclos de 24 h (18/6, 12/12…): alcanza con la hora; se repite todos los días.
 * - Superciclos (13/13, 14/14…): la vuelta dura más de 24 h y cada encendido se corre respecto del
 *   anterior, así que hace falta la fecha de un encendido (lightsOnDate) además de la hora.
 */
import { darkHoursFor } from './photoperiods';

export const MIN_MS = 60_000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface LightCycle {
  lightHours: number;
  darkHours: number;
}

export interface LightCycleState {
  /** El primer encendido ya pasó (en un superciclo puede estar por venir). */
  started: boolean;
  on: boolean;
  /** Siempre prendida (sin horas de oscuridad): no hay próximo cambio. */
  alwaysOn: boolean;
  nextChange: 'on' | 'off' | null;
  nextChangeAt: number | null;
  remainingMs: number | null;
}

export interface LightDay {
  /** Medianoche (hora local) del día. */
  start: number;
  end: number;
  /** Tramos con la luz prendida dentro del día, [desde, hasta] en ms. */
  windows: Array<[number, number]>;
  /** Horas de luz que caen en ese día (de 0 a 24 h). */
  lightHours: number;
}

export function cycleMs(c: LightCycle): { onMs: number; offMs: number; totalMs: number } {
  const onMs = Math.max(0, Math.round(c.lightHours * HOUR_MS));
  const offMs = Math.max(0, Math.round(c.darkHours * HOUR_MS));
  return { onMs, offMs, totalMs: onMs + offMs };
}

export const isDailyCycle = (c: LightCycle): boolean => cycleMs(c).totalMs === DAY_MS;

/** El ciclo guardado en el cultivo (por defecto 18/6, como el resto de la app). */
export function cycleFromLighting(lighting?: { photoperiodHoursLight?: number; photoperiodHoursDark?: number } | null): LightCycle {
  const lightHours = lighting?.photoperiodHoursLight ?? 18;
  return { lightHours, darkHours: darkHoursFor(lightHours, lighting?.photoperiodHoursDark) };
}

/** "18:30" → { h: 18, m: 30 }; cualquier otra cosa → null. */
export function parseClock(value?: string | null): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? { h, m } : null;
}

/** "2026-10-31" → medianoche local de ese día; inválida → null. */
function parseDay(value?: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Un momento en que la luz se prendió (o se va a prender), a partir de lo que cargó el usuario.
 * - Con fecha (superciclos): ese día a esa hora.
 * - Sin fecha (ciclos de 24 h): esa hora, una semana atrás, para que el cálculo cubra también la
 *   luz que viene del día anterior (por ejemplo un 20/4 que prende a las 8 y apaga a las 4).
 * Sin hora válida → null (todavía no se sabe a qué hora prende).
 */
export function lightAnchor(
  schedule: { lightsOnTime?: string | null; lightsOnDate?: string | null } | null | undefined,
  nowMs: number
): number | null {
  const clock = parseClock(schedule?.lightsOnTime);
  if (!clock) return null;
  const day = parseDay(schedule?.lightsOnDate);
  if (day) {
    day.setHours(clock.h, clock.m, 0, 0);
    return day.getTime();
  }
  const base = new Date(nowMs);
  base.setHours(clock.h, clock.m, 0, 0);
  base.setDate(base.getDate() - 7);
  return base.getTime();
}

export function lightState(c: LightCycle, anchor: number, now: number): LightCycleState {
  const { onMs, offMs, totalMs } = cycleMs(c);
  if (!(totalMs > 0) || !onMs) {
    return { started: now >= anchor, on: false, alwaysOn: false, nextChange: null, nextChangeAt: null, remainingMs: null };
  }
  if (now < anchor) {
    return { started: false, on: false, alwaysOn: false, nextChange: 'on', nextChangeAt: anchor, remainingMs: anchor - now };
  }
  if (offMs === 0) {
    return { started: true, on: true, alwaysOn: true, nextChange: null, nextChangeAt: null, remainingMs: null };
  }
  const pos = (now - anchor) % totalMs;
  const on = pos < onMs;
  const remainingMs = on ? onMs - pos : totalMs - pos;
  return { started: true, on, alwaysOn: false, nextChange: on ? 'off' : 'on', nextChangeAt: now + remainingMs, remainingMs };
}

/** Tramos con la luz prendida entre from y to (ms), recortados a ese rango. */
export function onIntervals(c: LightCycle, anchor: number, from: number, to: number): Array<[number, number]> {
  const { onMs, totalMs } = cycleMs(c);
  if (!(totalMs > 0) || !onMs || to <= from) return [];
  const out: Array<[number, number]> = [];
  let k = Math.max(0, Math.floor((from - anchor) / totalMs));
  for (let start = anchor + k * totalMs; start < to; k += 1, start = anchor + k * totalMs) {
    const end = start + onMs;
    if (end > from) out.push([Math.max(start, from), Math.min(end, to)]);
  }
  return out;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Los próximos días (desde hoy), cada uno de 0 a 24 h, con sus tramos de luz. */
export function lightProjection(c: LightCycle, anchor: number, fromMs: number, days = 7): LightDay[] {
  const today = startOfDay(fromMs);
  return Array.from({ length: days }, (_, i) => {
    const start = addDays(today, i);
    const end = addDays(today, i + 1);
    const windows = onIntervals(c, anchor, start, end);
    return { start, end, windows, lightHours: windows.reduce((acc, [s, e]) => acc + (e - s), 0) / HOUR_MS };
  });
}

/** Cuántas horas más tarde (positivo) o más temprano (negativo) arranca cada encendido que el anterior. */
export function shiftHoursPerCycle(c: LightCycle): number {
  return (cycleMs(c).totalMs - DAY_MS) / HOUR_MS;
}

/** 5:12:03 (horas sin tope; minutos y segundos con dos cifras). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const weekdayShort = (ms: number): string => WEEKDAYS_SHORT[new Date(ms).getDay()];
export const clockText = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "hoy 18:00", "mañana 02:00" o "dom 1 20:00". */
export function whenText(ms: number, now: number): string {
  const diffDays = Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);
  const day = diffDays === 0 ? 'hoy' : diffDays === 1 ? 'mañana' : `${weekdayShort(ms)} ${new Date(ms).getDate()}`;
  return `${day} ${clockText(ms)}`;
}
