/**
 * Cuándo revisar la maceta, dicho como lo diría una persona: "Mañana a la mañana" en lugar de
 * "Entre 6 nov 2026 06:25 hs y 7 nov 2026 01:05 hs". Si la ventana ya pasó, lo dice.
 * Módulo puro: solo formatea la salida de calculateIrrigationForecast.
 */
import { daysBetween, getLocalTodayDateOnly } from './growthStageUtils';

export type WindowState = 'vencida' | 'ahora' | 'proxima';

export interface WindowDisplay {
  state: WindowState;
  /** Lo principal, en una frase. */
  text: string;
  /** Una aclaración debajo (a qué día corresponde o hasta cuándo). */
  note: string | null;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dayLabel(d: Date, now: Date): string {
  const diff = daysBetween(getLocalTodayDateOnly(now), getLocalTodayDateOnly(d));
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff > 1 && diff < 7) return `el ${d.toLocaleDateString('es-AR', { weekday: 'long' })}`;
  return `el ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')}`;
}

const partOfDay = (hour: number) => (hour < 6 ? 'a la madrugada' : hour < 12 ? 'a la mañana' : hour < 19 ? 'a la tarde' : 'a la noche');

const moment = (d: Date, now: Date) => `${dayLabel(d, now)} ${partOfDay(d.getHours())}`;

export function wateringWindowDisplay(startIso: string | null | undefined, endIso: string | null | undefined, now: Date = new Date()): WindowDisplay | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  if (now > end) {
    return { state: 'vencida', text: 'Ya pasó: revisá la maceta hoy', note: `Estaba prevista para ${dayLabel(start, now)}.` };
  }
  if (now >= start) {
    return { state: 'ahora', text: 'Ahora: revisá la maceta', note: `Hasta ${moment(end, now)}.` };
  }
  const from = moment(start, now);
  const to = moment(end, now);
  return { state: 'proxima', text: from === to ? capitalize(from) : `Entre ${from} y ${to}`, note: null };
}
