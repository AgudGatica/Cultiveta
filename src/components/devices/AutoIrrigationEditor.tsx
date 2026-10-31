import React, { useState } from 'react';
import { DEFAULT_AUTO_IRRIGATION, secondsToLiters, validateAutoIrrigation, type AutoIrrigation, type PumpConfig } from '../../utils/deviceRules';
import { localTimeZone } from '../../services/devicesService';

interface AutoIrrigationEditorProps {
  auto: AutoIrrigation | null | undefined;
  pump: PumpConfig;
  /** Hay una sonda de sustrato asignada al cultivo (sin ella no se puede regar por humedad). */
  hasSoilSensor: boolean;
  /** El cultivo tiene la hora de encendido de la luz cargada (para lo atado a la luz). */
  hasLightSchedule: boolean;
  onSave: (auto: AutoIrrigation) => Promise<void> | void;
  onCancel: () => void;
}

const FIELD = 'min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink w-full';
const toNum = (v: string) => Number(String(v).replace(',', '.'));
const liters = (l: number) => `${(Math.round(l * 100) / 100).toString().replace('.', ',')} L`;

/** Riego automático de una bomba: solo a mano, programado (con la luz o a una hora) o por humedad. */
export const AutoIrrigationEditor: React.FC<AutoIrrigationEditorProps> = ({ auto, pump, hasSoilSensor, hasLightSchedule, onSave, onCancel }) => {
  const start = auto || DEFAULT_AUTO_IRRIGATION;
  const [mode, setMode] = useState<AutoIrrigation['mode']>(start.mode);
  const [when, setWhen] = useState(start.scheduled.when);
  const [trigger, setTrigger] = useState(start.scheduled.trigger);
  const [offsetMin, setOffsetMin] = useState(String(start.scheduled.offsetMin));
  const [fixedTime, setFixedTime] = useState(start.scheduled.fixedTime);
  const [shotS, setShotS] = useState(String(start.scheduled.shotS));
  const [pulses, setPulses] = useState(String(start.scheduled.pulses));
  const [pauseMin, setPauseMin] = useState(String(start.scheduled.pauseMin));
  const [dry, setDry] = useState(String(start.wetdry.dry));
  const [wet, setWet] = useState(String(start.wetdry.wet));
  const [wdShot, setWdShot] = useState(String(start.wetdry.shotS));
  const [wdPause, setWdPause] = useState(String(start.wetdry.pauseMin));
  const [maxShots, setMaxShots] = useState(String(start.wetdry.maxShots));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: AutoIrrigation = {
      mode,
      scheduled: { when, trigger, offsetMin: toNum(offsetMin), fixedTime, shotS: toNum(shotS), pulses: toNum(pulses), pauseMin: toNum(pauseMin) },
      wetdry: { dry: toNum(dry), wet: toNum(wet), shotS: toNum(wdShot), pauseMin: toNum(wdPause), maxShots: toNum(maxShots) },
      timeZone: localTimeZone(),
    };
    const errs = validateAutoIrrigation(next, pump.maxSeconds);
    if (mode === 'wetdry' && !hasSoilSensor) errs.unshift('Para regar por humedad, primero asigná una sonda de sustrato a este cultivo.');
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch (e: any) {
      setErrors([e?.message || 'No se pudo guardar.']);
    } finally {
      setSaving(false);
    }
  };

  const shot = mode === 'wetdry' ? toNum(wdShot) : toNum(shotS);
  return (
    <div className="auto-irrigation-editor space-y-2 rounded-2xl bg-surface border border-line p-3">
      <label className="text-[11px] font-semibold text-ink-muted block space-y-1">
        <span>Riego automático</span>
        <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value as AutoIrrigation['mode'])} aria-label="Riego automático">
          <option value="off">Solo a mano</option>
          <option value="scheduled">Programado</option>
          <option value="wetdry">Por humedad del sustrato</option>
        </select>
      </label>

      {mode === 'scheduled' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Cuándo</span>
              <select className={FIELD} value={when} onChange={(e) => setWhen(e.target.value as 'light' | 'fixed')} aria-label="Cuándo riega">
                <option value="light">Con la luz</option>
                <option value="fixed">A una hora fija</option>
              </select>
            </label>
            {when === 'fixed' ? (
              <label className="text-[11px] font-semibold text-ink-muted space-y-1">
                <span>Hora</span>
                <input type="time" className={FIELD} value={fixedTime} onChange={(e) => setFixedTime(e.target.value)} aria-label="Hora del riego" />
              </label>
            ) : (
              <label className="text-[11px] font-semibold text-ink-muted space-y-1">
                <span>Momento</span>
                <select className={FIELD} value={trigger} onChange={(e) => setTrigger(e.target.value as 'after_on' | 'before_off')} aria-label="Momento del riego">
                  <option value="after_on">Después de prender</option>
                  <option value="before_off">Antes de apagar</option>
                </select>
              </label>
            )}
          </div>
          {when === 'light' && (
            <label className="text-[11px] font-semibold text-ink-muted block space-y-1">
              <span>Minutos {trigger === 'after_on' ? 'después de prender' : 'antes de apagar'}</span>
              <input className={FIELD} inputMode="numeric" value={offsetMin} onChange={(e) => setOffsetMin(e.target.value)} aria-label="Minutos respecto de la luz" />
            </label>
          )}
          {when === 'light' && !hasLightSchedule && (
            <p className="text-[11px] font-bold text-coral">Este cultivo no tiene la hora de encendido de la luz: cargala en la tarjeta Luz para que riegue.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Segundos</span>
              <input className={FIELD} inputMode="numeric" value={shotS} onChange={(e) => setShotS(e.target.value)} aria-label="Segundos por riego" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Pulsos</span>
              <input className={FIELD} inputMode="numeric" value={pulses} onChange={(e) => setPulses(e.target.value)} aria-label="Pulsos" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Pausa (min)</span>
              <input className={FIELD} inputMode="numeric" value={pauseMin} disabled={toNum(pulses) <= 1} onChange={(e) => setPauseMin(e.target.value)} aria-label="Pausa entre pulsos" />
            </label>
          </div>
          <p className="text-[11px] text-ink-subtle">Varios pulsos cortos mojan parejo sin encharcar. Si el servidor estuvo caído, el riego que se pasó no se hace tarde.</p>
        </>
      )}

      {mode === 'wetdry' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Riega con (% o menos)</span>
              <input className={FIELD} inputMode="numeric" value={dry} onChange={(e) => setDry(e.target.value)} aria-label="Seco" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Hasta (%)</span>
              <input className={FIELD} inputMode="numeric" value={wet} onChange={(e) => setWet(e.target.value)} aria-label="Húmedo" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Segundos</span>
              <input className={FIELD} inputMode="numeric" value={wdShot} onChange={(e) => setWdShot(e.target.value)} aria-label="Segundos por riego" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Pausa (min)</span>
              <input className={FIELD} inputMode="numeric" value={wdPause} onChange={(e) => setWdPause(e.target.value)} aria-label="Pausa entre riegos" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Por día</span>
              <input className={FIELD} inputMode="numeric" value={maxShots} onChange={(e) => setMaxShots(e.target.value)} aria-label="Riegos por día" />
            </label>
          </div>
          {!hasSoilSensor && <p className="text-[11px] font-bold text-coral">Falta una sonda de sustrato asignada a este cultivo.</p>}
          <p className="text-[11px] text-ink-subtle">Con la luz apagada no riega: secarse de noche es parte del ciclo. Después de cada riego espera la pausa para que el agua baje.</p>
        </>
      )}

      {mode !== 'off' && Number.isFinite(shot) && shot > 0 && (
        <p className="text-[11px] text-ink-muted">
          Cada riego ≈ {liters(secondsToLiters(shot, pump))} (tope de la bomba: {pump.maxSeconds} s). Cada uno queda anotado en el cultivo.
        </p>
      )}
      {errors.map((e) => (
        <p key={e} className="text-[11px] font-bold text-error">
          {e}
        </p>
      ))}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={save} className="cultiveta-btn-primary text-xs disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="cultiveta-btn-secondary text-xs">
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default AutoIrrigationEditor;
