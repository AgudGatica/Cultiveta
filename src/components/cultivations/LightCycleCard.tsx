import React, { useEffect, useMemo, useState } from 'react';
import { Moon, Plug, Pencil, Sun } from 'lucide-react';
import type { Cultivation } from '../../types';
import type { DeviceBindingState } from '../../services/devicesService';
import {
  DAY_MS,
  clockText,
  cycleFromLighting,
  cycleMs,
  formatCountdown,
  isDailyCycle,
  lightAnchor,
  lightProjection,
  lightState,
  phaseProgress,
  shiftHoursPerCycle,
  weekdayShort,
  whenText,
} from '../../utils/lightCycle';

export interface LightSchedule {
  lightsOnTime: string;
  /** Solo en superciclos: el día de un encendido (YYYY-MM-DD). En ciclos de 24 h va vacío. */
  lightsOnDate: string;
}

interface LightCycleCardProps {
  /** Un cultivo o un indoor: solo se usa su luz. */
  cultivation: Pick<Cultivation, 'lighting'>;
  /** Luz compartida de un indoor (se dice de cuál y para cuántos cultivos). */
  sharedNote?: string | null;
  onSaveSchedule: (schedule: LightSchedule) => Promise<void> | void;
  /** Lleva a Equipos para conectar un enchufe inteligente. */
  onConnectPlug?: () => void;
  /** Enchufe inteligente que maneja esta luz (si hay): su estado real y lo cargado en el equipo o su nube. */
  device?: DeviceBindingState | null;
  /** Hora fija (para los tests); sin esto, la tarjeta se actualiza cada segundo. */
  now?: number;
}

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
// Líneas cada 3 h (las de 6 en 6, más marcadas), también arriba de la luz, para leer el escalonado.
const GRID =
  'repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), rgba(255,255,255,0.9) calc(25% - 1px) 25%),' +
  'repeating-linear-gradient(90deg, transparent 0 calc(12.5% - 1px), rgba(255,255,255,0.5) calc(12.5% - 1px) 12.5%)';

/**
 * Anillo de Órbita: se va llenando con lo que pasó del tramo actual (luz u oscuridad).
 * Amarillo con la luz prendida, azul con la luz apagada.
 */
function LightRing({ on, progress, children }: { on: boolean; progress: number; children: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress || 0));
  return (
    <div id="light-ring" data-on={on ? 'true' : 'false'} data-progress={p.toFixed(3)} className="relative w-[132px] h-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-track" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform="rotate(-90 60 60)"
          className={`${on ? 'stroke-warn-line' : 'stroke-brand'} transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const hoursText = (h: number): string => (Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ','));
const todayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Luz del cultivo (traída de Órbita): si está prendida o apagada, cuánto falta para el próximo cambio,
 * las horas de luz y de oscuridad, y cómo queda cada uno de los próximos 7 días.
 * A mano funciona como un timer: se carga a qué hora prende (y, en un superciclo, qué día).
 * Con un enchufe de Smart Life asignado, el estado es el del equipo y el horario queda cargado en él.
 */
export const LightCycleCard: React.FC<LightCycleCardProps> = ({ cultivation, sharedNote = null, onSaveSchedule, onConnectPlug, device = null, now: fixedNow }) => {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow != null) return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fixedNow]);
  const now = fixedNow ?? tick;

  const cycle = cycleFromLighting(cultivation.lighting);
  const daily = isDailyCycle(cycle);
  const savedTime = cultivation.lighting?.lightsOnTime ?? '';
  const savedDate = cultivation.lighting?.lightsOnDate ?? '';
  const anchor = lightAnchor({ lightsOnTime: savedTime, lightsOnDate: daily ? '' : savedDate }, now);
  const needsDate = !daily && !savedDate;

  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(savedTime || '18:00');
  const [date, setDate] = useState(savedDate || todayKey(now));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El gráfico cambia de día a la medianoche; el resto se recalcula con cada segundo.
  const dayKey = todayKey(now);
  const days = useMemo(
    () => (anchor == null ? [] : lightProjection(cycle, anchor, now, 7)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor, cycle.lightHours, cycle.darkHours, dayKey]
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError('Elegí la hora en que se prende la luz.');
      return;
    }
    if (!daily && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('En un superciclo hace falta el día de un encendido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveSchedule({ lightsOnTime: time, lightsOnDate: daily ? '' : date });
      setEditing(false);
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const { onMs, offMs, totalMs } = cycleMs(cycle);
  const title = `${hoursText(onMs / 3_600_000)}/${hoursText(offMs / 3_600_000)}${daily ? '' : ` · ${hoursText(totalMs / 3_600_000)} h`}`;

  const form = (
    <form id="light-schedule-form" onSubmit={save} className="space-y-3">
      <p className="text-sm font-bold text-ink">{anchor == null || needsDate ? '¿A qué hora se prende la luz?' : 'Cambiar la hora de encendido'}</p>
      <p className="text-xs text-ink-muted">
        Como en tu timer: con la hora de encendido y las horas de luz y oscuridad, Cultiveta calcula sola cuándo se prende y
        cuándo se apaga.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-ink-muted flex flex-col gap-1">
          Hora de encendido
          <input
            id="light-on-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand"
          />
        </label>
        {!daily && (
          <label className="text-xs font-semibold text-ink-muted flex flex-col gap-1">
            Día de un encendido
            <input
              id="light-on-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand"
            />
          </label>
        )}
      </div>
      {device && (
        <p className="text-[11px] font-bold text-brand">
          Enchufe: {device.deviceName} · {device.label}. Con la hora, Cultiveta carga el horario en el enchufe.
        </p>
      )}
      {!daily && (
        <p className="text-[11px] text-ink-subtle">
          En un superciclo cada encendido arranca a otra hora: con el día y la hora de uno, Cultiveta calcula todos los demás.
        </p>
      )}
      {error && <p className="text-xs font-bold text-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" id="save-light-schedule" disabled={saving} className="cultiveta-btn-primary text-xs disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(false)} className="cultiveta-btn-secondary text-xs">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );

  const deviceOn = device && device.online !== false && device.on != null ? device.on : null;
  const app = device?.vendor === 'ewelink' ? 'eWeLink' : device?.vendor === 'shelly' ? 'Shelly' : 'Smart Life';
  const header = (state?: ReturnType<typeof lightState>) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
        {(deviceOn ?? state?.on) ? <Sun className="w-4 h-4 text-warn-line" aria-hidden="true" /> : <Moon className="w-4 h-4 text-brand" aria-hidden="true" />}
        Luz · {title}
      </span>
      {device && device.online === false ? (
        <span id="light-state-pill" className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-coral/15 text-coral">
          SIN CONEXIÓN
        </span>
      ) : (deviceOn != null || (state && state.started)) ? (
        <span
          id="light-state-pill"
          className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${
            (deviceOn ?? state?.on) ? 'bg-accent text-ink' : 'bg-brand-deep text-white'
          }`}
        >
          {(deviceOn ?? state?.on) ? 'PRENDIDA' : 'APAGADA'}
        </span>
      ) : null}
    </div>
  );

  const shared = sharedNote ? (
    <p id="light-shared-note" className="text-[11px] font-bold text-brand -mt-2">
      {sharedNote}
    </p>
  ) : null;

  if (anchor == null || needsDate || editing) {
    return (
      <section id="crop-light-card" className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-4">
        {header()}
        {shared}
        {form}
      </section>
    );
  }

  const state = lightState(cycle, anchor, now);
  // el anillo sigue al horario; si el enchufe dice otra cosa, la píldora de arriba muestra lo del equipo
  const ringOn = state.alwaysOn || state.on;
  const shift = shiftHoursPerCycle(cycle);
  const onH = hoursText(onMs / 3_600_000);

  return (
    <section id="crop-light-card" className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-4">
      {header(state)}
      {shared}

      <div className="flex items-center gap-4 sm:gap-6">
        <LightRing on={ringOn} progress={phaseProgress(cycle, anchor, now)}>
          <b className="text-[28px] font-black leading-none tracking-wide text-ink">{state.alwaysOn ? 'ON' : ringOn ? 'ON' : 'OFF'}</b>
          {state.alwaysOn ? (
            <small className="text-sm font-bold text-ink-muted mt-1">siempre</small>
          ) : (
            <small
              id="light-countdown"
              aria-label={`${state.nextChange === 'off' ? 'Se apaga en' : 'Se prende en'} ${formatCountdown(state.remainingMs ?? 0)}`}
              className="text-sm font-bold text-ink-muted mt-1 tabular-nums"
            >
              {formatCountdown(state.remainingMs ?? 0)}
            </small>
          )}
        </LightRing>
        <dl className="flex-1 min-w-0 space-y-2 text-xs">
          {!state.alwaysOn && state.nextChangeAt && (
            <div id="light-next">
              <dt className="text-ink-subtle font-semibold">Próximo</dt>
              <dd className="font-black text-ink">
                {state.nextChange === 'off' ? 'SE APAGA' : 'SE PRENDE'} {whenText(state.nextChangeAt, now)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-ink-subtle font-semibold">{daily ? 'Luz por día' : 'Cada vuelta'}</dt>
            <dd className="font-bold text-ink">
              {onH} h de luz · {hoursText(offMs / 3_600_000)} h de oscuridad
            </dd>
          </div>
          <div>
            <dt className="text-ink-subtle font-semibold">{daily ? 'Se prende' : 'Encendido de referencia'}</dt>
            <dd className="font-bold text-ink">{daily ? `todos los días a las ${savedTime}` : `${weekdayShort(anchor)} ${new Date(anchor).getDate()}, ${clockText(anchor)}`}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-1.5">Próximos 7 días</h4>
        <div id="light-projection" className="space-y-1.5">
          <div className="flex justify-end text-[10px] text-ink-subtle">h de luz</div>
          {days.map((d) => {
            const span = d.end - d.start;
            const label = `${weekdayShort(d.start)} ${new Date(d.start).getDate()}`;
            const desc = d.windows.length
              ? d.windows.map(([a, b]) => `de ${clockText(a)} a ${b === d.end ? '24:00' : clockText(b)}`).join(' y ')
              : 'sin luz';
            return (
              <div key={d.start} className="light-day grid grid-cols-[52px_1fr_40px] items-center gap-2 text-xs">
                <span className="text-ink-muted">{label}</span>
                <div
                  role="img"
                  aria-label={`${label}: luz ${desc}, ${hoursText(d.lightHours)} h`}
                  className="relative h-3.5 rounded-full bg-brand-deep/45 overflow-hidden"
                >
                  {d.windows.map(([a, b]) => (
                    <span
                      key={a}
                      className="absolute inset-y-0 bg-accent"
                      style={{ left: `${((a - d.start) / span) * 100}%`, width: `${((b - a) / span) * 100}%` }}
                    />
                  ))}
                  <span className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRID }} />
                  {now >= d.start && now < d.end && (
                    <span className="absolute -inset-y-0.5 w-0.5 bg-ink" style={{ left: `${((now - d.start) / span) * 100}%` }} />
                  )}
                </div>
                <span className="text-right font-bold text-ink">{hoursText(Math.round(d.lightHours * 10) / 10)} h</span>
              </div>
            );
          })}
          <div className="grid grid-cols-[52px_1fr_40px] gap-2" aria-hidden="true">
            <span />
            <div className="relative h-3.5 text-[10px] text-ink-subtle">
              {TICKS.map((h) => (
                <span
                  key={h}
                  className={`light-tick absolute -translate-x-1/2 ${h % 6 ? 'opacity-60 text-[9px] top-px' : ''}`}
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  {h}
                </span>
              ))}
            </div>
            <span />
          </div>
        </div>
        {totalMs !== DAY_MS && offMs > 0 && (
          <p id="light-shift-note" className="text-[11px] text-ink-muted mt-2">
            Cada encendido dura {onH} h seguidas y arranca {hoursText(Math.abs(shift))} h {shift > 0 ? 'más tarde' : 'más temprano'} que el
            anterior. El número de cada fila es la luz de ese día, de 0 a 24 h: cuando un encendido pasa la medianoche, una parte se
            cuenta en el día siguiente. Por eso algunos días no suman {onH} h.
          </p>
        )}
      </div>

      {device && (
        <div id="light-device-note" className="text-[11px] space-y-1">
          {device.loaded?.error ? (
            <p className="font-bold text-error">No se pudo cargar el horario en {app}: {device.loaded.error}</p>
          ) : device.loaded?.mode === 'daily' ? (
            <p className="text-ink-muted">
              {device.vendor === 'ewelink' ? 'Guardado en el Sonoff como bucle diario' : `Cargado en ${app} como programación diaria`}: sigue sola aunque cierres Cultiveta.
            </p>
          ) : device.loaded?.mode === 'loop' ? (
            <p className="text-ink-muted">Guardado en el Sonoff como bucle: alterna solo en el equipo y no vence.</p>
          ) : device.loaded?.mode === 'server' ? (
            <p className="text-ink-muted">La nube de Shelly no guarda horarios: Cultiveta deja programado cada cambio en el Shelly y el siguiente en su revisión de cada 5 minutos.</p>
          ) : device.loaded?.mode === 'once' && device.loaded.until ? (
            <p className="text-ink-muted">Cargado en {app} hasta {whenText(device.loaded.until, now)}. Cultiveta lo renueva solo.</p>
          ) : null}
          {deviceOn != null && state.started && !state.alwaysOn && deviceOn !== state.on && (
            <p className="font-bold text-warn-ink">
              El enchufe está {deviceOn ? 'PRENDIDO' : 'APAGADO'} y según el horario tendría que estar {state.on ? 'prendido' : 'apagado'}: Cultiveta lo corrige en la próxima revisión.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle bg-track px-2 py-1 rounded-lg">
          {device ? `Enchufe · ${device.deviceName} · ${device.label}` : 'A mano · timer'}
        </span>
        <button type="button" id="edit-light-schedule" onClick={() => setEditing(true)} className="cultiveta-btn-secondary text-xs">
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Cambiar hora</span>
        </button>
        {onConnectPlug && !device && (
          <button type="button" id="connect-plug" onClick={onConnectPlug} className="cultiveta-btn-secondary text-xs">
            <Plug className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Conectar enchufe inteligente</span>
          </button>
        )}
      </div>
    </section>
  );
};

export default LightCycleCard;
