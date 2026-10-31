/**
 * Riego automático con bomba (traído de Órbita): programado (atado a la luz o a una hora fija, en uno o
 * varios pulsos) o por humedad del sustrato (wet/dry). Lo decide la revisión periódica del servidor;
 * cada riego sale por el mismo camino que "Regar" (topes de la bomba y cuenta regresiva del enchufe).
 */
import { zonedDateKey, zonedToMs } from './tz';
import { DAY_MS, HOUR_MS, MIN_MS } from '../../utils/lightCycle';
import type { AutoIrrigation } from '../../utils/deviceRules';

/** Horario de la luz del cultivo (el mismo que se carga en Smart Life). */
export interface IrrigationLight {
  lightHours: number;
  darkHours: number;
  anchorMs: number;
}

export interface DueWatering {
  at: number;
  seconds: number;
  reason: string;
}

/** Un riego programado que pasó hace más que esto ya no se hace (el servidor estuvo caído): mejor tarde que nunca, no. */
export const LATE_MS = 10 * MIN_MS;

/** Riegos del modo programado que caen en [from, to). Sin horario de luz, los atados a la luz no riegan. */
export function scheduledWaterings(auto: AutoIrrigation, light: IrrigationLight | null, from: number, to: number): DueWatering[] {
  const s = auto.scheduled;
  const step = s.shotS * 1000 + s.pauseMin * MIN_MS;
  const span = s.pulses > 1 ? (s.pulses - 1) * step : 0;
  const lo = from - span - DAY_MS;
  const hi = to + DAY_MS;
  const triggers = new Set<number>();
  if (s.when === 'light') {
    if (!light) return [];
    const total = (light.lightHours + light.darkHours) * HOUR_MS;
    if (!(total > 0)) return [];
    const onMs = light.lightHours * HOUR_MS;
    const off = Math.min(s.offsetMin * MIN_MS, onMs); // siempre dentro de las horas de luz
    // se engancha a cada encendido del horario: si cambia el fotoperiodo, sigue andando
    for (let k = Math.max(0, Math.floor((lo - light.anchorMs) / total)); ; k++) {
      const start = light.anchorMs + k * total;
      if (start > hi) break;
      triggers.add(s.trigger === 'after_on' ? start + off : start + onMs - off);
    }
  } else {
    for (let d = lo; d <= hi; d += DAY_MS) triggers.add(zonedToMs(zonedDateKey(d, auto.timeZone), s.fixedTime, auto.timeZone));
  }
  const label = s.when === 'fixed' ? `programado a las ${s.fixedTime}` : `programado ${s.offsetMin} min ${s.trigger === 'after_on' ? 'después de prender' : 'antes de apagar'} la luz`;
  const out: DueWatering[] = [];
  for (const t of [...triggers].sort((a, b) => a - b)) {
    for (let i = 0; i < s.pulses; i++) {
      const at = t + i * step;
      if (at >= from && at < to) out.push({ at, seconds: s.shotS, reason: s.pulses > 1 ? `${label} (pulso ${i + 1} de ${s.pulses})` : label });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface WetDryState {
  /** Llegó a "seco" y está regando hasta "húmedo". */
  filling: boolean;
  shotsToday: number;
  lastShotAt: number | null;
  /** Día (en la zona de la persona) al que corresponden los riegos contados. */
  day: string | null;
}

/** Un paso del modo por humedad: riega al llegar a "seco" y sigue, con pausas, hasta "húmedo". De noche no. */
export function wetDryStep(
  state: WetDryState | null | undefined,
  moisture: number | null,
  isNight: boolean,
  now: number,
  w: AutoIrrigation['wetdry'],
  timeZone: string
): { action: 'none' | 'wait' | 'shot'; seconds?: number; reason: string; state: WetDryState } {
  const st: WetDryState = { filling: false, shotsToday: 0, lastShotAt: null, day: null, ...(state || {}) };
  const today = zonedDateKey(now, timeZone);
  if (st.day !== today) {
    st.day = today;
    st.shotsToday = 0;
  }
  if (moisture == null || !Number.isFinite(moisture)) return { action: 'none', reason: 'la sonda de sustrato no tiene datos: no riega', state: st };
  if (st.filling && moisture >= w.wet) {
    st.filling = false;
    return { action: 'none', reason: `llegó a ${w.wet} %`, state: st };
  }
  if (!st.filling && moisture <= w.dry) st.filling = true;
  if (!st.filling) return { action: 'none', reason: `sustrato en ${Math.round(moisture)} %: todavía no está seco`, state: st };
  if (isNight) return { action: 'none', reason: 'de noche espera a que prenda la luz (secarse de noche es parte del ciclo)', state: st };
  if (st.shotsToday >= w.maxShots) return { action: 'none', reason: `ya regó ${w.maxShots} veces hoy`, state: st };
  if (st.lastShotAt != null && now - st.lastShotAt < w.pauseMin * MIN_MS) return { action: 'wait', reason: 'pausa entre riegos', state: st };
  st.shotsToday += 1;
  st.lastShotAt = now;
  const why = moisture <= w.dry ? `seco ≤ ${w.dry} %` : `riega hasta ${w.wet} %`;
  return { action: 'shot', seconds: w.shotS, reason: `por humedad: sustrato en ${Math.round(moisture)} % (${why})`, state: st };
}
