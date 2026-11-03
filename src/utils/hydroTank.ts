/**
 * Hidroponía: el tanque de solución. No se "riega": se controla el tanque.
 * - pH y EC todos los días, a la misma hora (Oklahoma State Extension); acá se avisa a las 48 h sin control.
 * - Cambiar toda la solución cada 2 semanas (Oklahoma State; otras guías dicen 7–14 días).
 * - El pH sube solo (la planta toma nitrato): hay que bajarlo. Si la EC sube, el agua se evaporó: se repone con
 *   agua sola. Si baja, la planta come: se repone con solución.
 * - Agua a 18–22 °C: más caliente tiene menos oxígeno y aparece la pudrición de raíz.
 * Se muestra UN aviso a la vez, el más importante.
 */
import type { Cultivation, Watering } from '../types';
import { feedTargetFor, num, type FeedTarget } from './feedTargets';
import { growMethodOf } from './growMethod';

export const CHECK_DUE_HOURS = 48;
export const SOLUTION_CHANGE_DAYS = 14;
export const TANK_TEMP_RANGE = { min: 18, max: 22, target: 20 };

export type TankAlertKind = 'check' | 'temp_high' | 'temp_low' | 'ph_high' | 'ph_low' | 'ec_high' | 'ec_low' | 'change' | 'ok';

export interface TankStatus {
  target: FeedTarget;
  /** Último control anotado (o null si nunca). */
  lastCheckAt: number | null;
  hoursSinceCheck: number | null;
  /** Último valor anotado de cada cosa (de los últimos controles). */
  ph: number | null;
  ec: number | null;
  tempC: number | null;
  daysSinceChange: number | null;
  /** Días que faltan para el próximo cambio de solución (0 = ya toca). */
  changeInDays: number | null;
  alert: { kind: TankAlertKind; text: string };
}

const at = (w: Pick<Watering, 'date' | 'time' | 'createdAt'>) => {
  const t = Date.parse(`${w.date}T${w.time && /^\d\d:\d\d/.test(w.time) ? w.time.slice(0, 5) : '12:00'}:00`);
  return Number.isFinite(t) ? t : Date.parse(w.createdAt) || 0;
};
const num0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** El estado del tanque de un cultivo en hidroponía (null si no es hidroponía o ya terminó). */
export function tankStatus(crop: Cultivation, waterings: Watering[], now: number = Date.now()): TankStatus | null {
  if (growMethodOf(crop) !== 'hidro') return null;
  const target = feedTargetFor(crop, []);
  if (!target) return null;
  const mine = waterings.filter((w) => w.cultivationId === crop.id).sort((a, b) => at(b) - at(a));
  const last = mine[0] || null;
  const lastCheckAt = last ? at(last) : null;
  const hoursSinceCheck = lastCheckAt === null ? null : Math.max(0, (now - lastCheckAt) / 3_600_000);
  const latest = (pick: (w: Watering) => unknown) => {
    for (const w of mine) {
      const v = num0(pick(w));
      if (v !== null) return v;
    }
    return null;
  };
  const ph = latest((w) => w.phIn);
  const ec = latest((w) => w.ecIn);
  const tempC = latest((w) => w.waterTempC);
  // Desde el último cambio de solución; si nunca se anotó uno, desde el primer control
  const change = mine.find((w) => w.solutionChange) || mine[mine.length - 1] || null;
  const daysSinceChange = change ? Math.floor((now - at(change)) / 86_400_000) : null;
  const changeInDays = daysSinceChange === null ? null : Math.max(0, SOLUTION_CHANGE_DAYS - daysSinceChange);

  let alert: TankStatus['alert'];
  if (hoursSinceCheck === null) alert = { kind: 'check', text: 'Anotá el primer control del tanque: pH, EC y temperatura del agua.' };
  else if (hoursSinceCheck > CHECK_DUE_HOURS) alert = { kind: 'check', text: `Hace ${Math.round(hoursSinceCheck / 24)} días que no anotás el tanque. Revisá pH y EC todos los días, a la misma hora.` };
  else if (tempC !== null && tempC > TANK_TEMP_RANGE.max) alert = { kind: 'temp_high', text: `Agua a ${num(tempC)} °C: con más de ${TANK_TEMP_RANGE.max} °C tiene menos oxígeno y aparece la pudrición de raíz. Enfriala (18–22 °C).` };
  else if (tempC !== null && tempC < 16) alert = { kind: 'temp_low', text: `Agua a ${num(tempC)} °C: muy fría, la planta come más lento. Llevala a 18–22 °C.` };
  else if (ph !== null && ph > target.ph.max) alert = { kind: 'ph_high', text: `El pH subió a ${num(ph)} (es normal: la planta lo sube). Bajalo a ${num(target.ph.target)}.` };
  else if (ph !== null && ph < target.ph.min) alert = { kind: 'ph_low', text: `El pH está en ${num(ph)}, bajo. Subilo a ${num(target.ph.target)}.` };
  else if (ec !== null && ec > target.ec.max) alert = { kind: 'ec_high', text: `EC ${num(ec)}, alta: el agua se evapora y la solución se concentra. Reponé con agua sola (pH ${num(target.ph.target)}).` };
  else if (ec !== null && ec < target.ec.min) alert = { kind: 'ec_low', text: `EC ${num(ec)}, baja: la planta está comiendo. Reponé con solución a EC ${num(target.ec.target)}.` };
  else if (changeInDays === 0) alert = { kind: 'change', text: `Pasaron ${daysSinceChange} días: toca cambiar toda la solución del tanque.` };
  else alert = { kind: 'ok', text: changeInDays !== null ? `Todo en rango. Cambio de solución en ${changeInDays === 1 ? '1 día' : `${changeInDays} días`}.` : 'Todo en rango.' };

  return { target, lastCheckAt, hoursSinceCheck, ph, ec, tempC, daysSinceChange, changeInDays, alert };
}
