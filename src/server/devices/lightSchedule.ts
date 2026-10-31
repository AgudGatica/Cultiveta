/**
 * Horario de la luz cargado en la nube de Smart Life (traído de Órbita): así la luz se prende y se
 * apaga sola aunque el servidor de Cultiveta no esté corriendo.
 * - Ciclo de 24 h: una programación diaria por toma (prende y apaga), que no vence.
 * - Superciclo: órdenes de un solo uso para los próximos 7 días, en la categoría "cultiveta"; las que
 *   caen en el mismo minuto van juntas (Tuya acepta 30 por equipo, contando las de la persona). El
 *   servidor rellena cuando queda poco. Termina siempre con la luz apagada.
 * Las programaciones de la app Smart Life ("category_switch_N" de la persona) no se tocan acá.
 */
import { cycleMs, onIntervals, DAY_MS, HOUR_MS, MIN_MS } from '../../utils/lightCycle';
import { offsetString, zonedClock, zonedDateKey } from './tz';
import type { TuyaCloud, TuyaTimer } from './tuyaClient';

export const SCHEDULE_CATEGORY = 'cultiveta';
const HORIZON = 7 * DAY_MS;
const EXTRA = 2 * DAY_MS;
const LEAD = 2 * MIN_MS;
const CHUNK = 10;
const MAX_TIMERS = 30;

export interface LightItem {
  code: string;
  lightHours: number;
  darkHours: number;
  /** Un encendido (ms absolutos), calculado en el navegador con la hora local de la persona. */
  anchorMs: number;
  timeZone: string;
}

export interface ScheduleState {
  mode: 'once' | 'daily' | 'none';
  sig: string;
  until: number | null;
  span: number;
  count: number;
  codes: string[];
  groups: Array<{ category: string; groupId: string }>;
  daily?: Array<{ code: string; on: string; off: string }>;
  at: number;
  error: string | null;
}

type Event = { at: number; functions: Array<{ code: string; value: boolean }> };

function eventsOf(windows: Array<[number, number]>, from: number, to: number): Array<{ at: number; value: boolean }> {
  const out: Array<{ at: number; value: boolean }> = [];
  windows
    .slice()
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e]) => {
      const last = out[out.length - 1];
      if (last && !last.value && Math.abs(last.at - s) < MIN_MS) out.pop();
      else if (s > from) out.push({ at: s, value: true });
      if (e < to) out.push({ at: e, value: false });
    });
  return out.map((x) => ({ at: Math.round(x.at / MIN_MS) * MIN_MS, value: x.value })).filter((x) => x.at > from + LEAD);
}

/** Órdenes de todos los tomas del equipo, juntas por minuto. */
export function mergeEvents(items: LightItem[], from: number, to: number): Event[] {
  const byAt = new Map<number, Array<{ code: string; value: boolean }>>();
  items.forEach((it) =>
    eventsOf(onIntervals({ lightHours: it.lightHours, darkHours: it.darkHours }, it.anchorMs, from, to), from, to).forEach((e) => {
      const f = byAt.get(e.at) || [];
      f.push({ code: it.code, value: e.value });
      byAt.set(e.at, f);
    })
  );
  return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([at, functions]) => ({ at, functions }));
}

/** Cuántas órdenes cargar: hasta el horizonte y el cupo, dejando todas las luces apagadas al final. */
export function pickCount(ev: Event[], end: number, budget: number, codes: string[]): number {
  const allOff = (n: number) =>
    codes.every((code) => {
      let on: boolean | null = null;
      for (let i = 0; i < n; i++) {
        const f = ev[i].functions.find((x) => x.code === code);
        if (f) on = f.value;
      }
      return on !== true;
    });
  let n = Math.min(ev.filter((x) => x.at <= end).length, budget);
  for (let j = n; !allOff(j) && j < Math.min(ev.length, budget); j++) if (allOff(j + 1)) return j + 1;
  while (n > 0 && !allOff(n)) n--;
  return n;
}

/** Ciclo de 24 h: a qué hora prende y apaga cada toma, todos los días. null = alguno no es de 24 h. */
export function dailyPlan(items: LightItem[]): Array<{ code: string; on: string; off: string }> | null {
  if (!items.every((it) => cycleMs(it).totalMs === DAY_MS && cycleMs(it).offMs > 0)) return null;
  return items.map((it) => ({ code: it.code, on: zonedClock(it.anchorMs, it.timeZone), off: zonedClock(it.anchorMs + cycleMs(it).onMs, it.timeZone) }));
}

const signatureOf = (items: LightItem[], mode: string) =>
  JSON.stringify([1, mode, items.map((it) => [it.code, it.lightHours, it.darkHours, it.anchorMs % cycleMs(it).totalMs, it.timeZone])]);

/** Borra lo que cargó Cultiveta en ese equipo. Devuelve cuántas programaciones de la persona hay. */
async function clearOwn(client: TuyaCloud, deviceId: string, prev: ScheduleState | undefined): Promise<number> {
  const all: TuyaTimer[] = await client.getTimers(deviceId);
  const owned = new Set((prev?.groups || []).map((g) => g.groupId));
  if (all.some((x) => x.category === SCHEDULE_CATEGORY)) await client.deleteTimerCategory(deviceId, SCHEDULE_CATEGORY);
  for (const g of prev?.groups || []) {
    if (all.some((x) => x.groupId === g.groupId)) await client.deleteTimerGroup(deviceId, g.category, g.groupId);
  }
  return all.filter((x) => x.category !== SCHEDULE_CATEGORY && !owned.has(x.groupId)).length;
}

export const emptySchedule = (t: number): ScheduleState => ({ mode: 'none', sig: 'none', until: null, span: 0, count: 0, codes: [], groups: [], at: t, error: null });

/** Saca todo lo de Cultiveta del equipo (al desasignar la luz o desconectar Smart Life). */
export async function clearSchedule(client: TuyaCloud, deviceId: string, prev: ScheduleState | undefined, t: number): Promise<ScheduleState> {
  await clearOwn(client, deviceId, prev);
  return emptySchedule(t);
}

/**
 * Pone al día lo cargado en el equipo para estas luces. Solo escribe si cambió el horario o si a lo
 * cargado le queda menos de la mitad. Devuelve el estado nuevo (o el mismo si no hizo falta nada).
 */
export async function syncSchedule(client: TuyaCloud, deviceId: string, items: LightItem[], prev: ScheduleState | undefined, t: number, force = false): Promise<ScheduleState> {
  if (!items.length) return prev && prev.mode !== 'none' ? clearSchedule(client, deviceId, prev, t) : prev || emptySchedule(t);
  const plan = dailyPlan(items);
  const sig = signatureOf(items, plan ? 'daily' : 'once');
  const fresh = prev && !prev.error && prev.sig === sig && (prev.mode === 'daily' || (prev.until != null && prev.until - t > Math.max(prev.span / 2, HOUR_MS)));
  if (fresh && !force) return prev!;
  const tz = items[0].timeZone;
  const tzBody = { timezone_id: tz, time_zone: offsetString(t, tz) };
  const foreign = await clearOwn(client, deviceId, prev);
  const budget = MAX_TIMERS - foreign;

  if (plan) {
    if (budget < plan.length * 2) throw new Error(`Smart Life ya tiene ${foreign} programaciones en este equipo y el máximo es ${MAX_TIMERS} (cuentan las pausadas). Borrá algunas desde la app Smart Life.`);
    const groups: ScheduleState['groups'] = [];
    for (const p of plan) {
      const category = `category_${p.code}`;
      const r: any = await client.addTimers(deviceId, {
        category,
        loops: '1111111',
        ...tzBody,
        alias_name: 'Cultiveta',
        instruct: [
          { time: p.on, functions: [{ code: p.code, value: true }] },
          { time: p.off, functions: [{ code: p.code, value: false }] },
        ],
      });
      if (r?.group_id) groups.push({ category, groupId: String(r.group_id) });
    }
    return { mode: 'daily', sig, until: null, span: 0, count: plan.length * 2, codes: plan.map((p) => p.code), groups, daily: plan, at: t, error: null };
  }

  if (budget < 2) throw new Error(`Smart Life ya tiene ${foreign} programaciones en este equipo y el máximo es ${MAX_TIMERS} (cuentan las pausadas). Borrá algunas desde la app Smart Life para que Cultiveta pueda cargar el horario.`);
  const end = t + HORIZON;
  const ev = mergeEvents(items, t, end + EXTRA);
  const list = ev.slice(0, pickCount(ev, end, budget, items.map((it) => it.code)));
  for (let i = 0; i < list.length; i += CHUNK) {
    await client.addTimers(deviceId, {
      category: SCHEDULE_CATEGORY,
      loops: '0000000',
      ...tzBody,
      alias_name: 'Cultiveta',
      instruct: list.slice(i, i + CHUNK).map((x) => ({ date: zonedDateKey(x.at, tz), time: zonedClock(x.at, tz), functions: x.functions })),
    });
  }
  const until = list.length ? list[list.length - 1].at : t;
  return { mode: 'once', sig, until, span: until - t, count: list.length, codes: items.map((it) => it.code), groups: [], at: t, error: null };
}
