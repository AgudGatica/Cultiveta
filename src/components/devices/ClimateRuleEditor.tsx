import React, { useState } from 'react';
import {
  CLIMATE_METRICS,
  CLIMATE_MODE_LABEL,
  CLIMATE_ROLES,
  ruleDirection,
  validateClimateRule,
  type ClimateMetric,
  type ClimateMode,
  type ClimateRole,
  type ClimateRule,
} from '../../utils/deviceRules';
import { localTimeZone } from '../../services/devicesService';

interface ClimateRuleEditorProps {
  role: ClimateRole;
  rule: ClimateRule;
  onSave: (rule: ClimateRule) => Promise<void> | void;
  onCancel: () => void;
  /** ¿Ese lugar tiene la luz con enchufe? (sin eso, "sigue a la luz" no sabe cuándo es de día). */
  hasLight?: boolean;
  /** ¿Ese lugar tiene sensor de ambiente? (sin eso, "por sensor" no tiene datos). */
  hasSensor?: boolean;
}

const FIELD = 'min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink w-full';
const toNum = (v: string) => Number(String(v).replace(',', '.'));
const MODES: ClimateMode[] = ['follow', 'follow_inverted', 'always', 'schedule', 'sensor'];

/** Cómo se maneja un equipo de clima: sigue a la luz (o al revés), siempre prendido, su propio horario o por sensor. */
export const ClimateRuleEditor: React.FC<ClimateRuleEditorProps> = ({ role, rule, onSave, onCancel, hasLight, hasSensor }) => {
  const info = CLIMATE_ROLES[role];
  const [mode, setMode] = useState<ClimateMode>(rule.mode);
  const [metric, setMetric] = useState<ClimateMetric>(rule.metric);
  const [on, setOn] = useState(String(rule.on));
  const [off, setOff] = useState(String(rule.off));
  const [useNight, setUseNight] = useState(!!rule.night);
  const [nOn, setNOn] = useState(String(rule.night?.on ?? rule.on));
  const [nOff, setNOff] = useState(String(rule.night?.off ?? rule.off));
  const [sensorLoss, setSensorLoss] = useState(rule.sensorLoss);
  const [onTime, setOnTime] = useState(rule.times?.on || '08:00');
  const [offTime, setOffTime] = useState(rule.times?.off || '20:00');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const unit = CLIMATE_METRICS[metric].unit;
  const dir = ruleDirection(role, metric);

  const save = async () => {
    const next: ClimateRule = {
      mode,
      metric,
      on: toNum(on),
      off: toNum(off),
      night: mode === 'sensor' && useNight ? { on: toNum(nOn), off: toNum(nOff) } : null,
      sensorLoss,
      times: mode === 'schedule' ? { on: onTime, off: offTime } : null,
      timeZone: mode === 'schedule' ? localTimeZone() : null,
    };
    const errs = validateClimateRule(role, next);
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

  return (
    <div className="climate-rule-editor space-y-2 rounded-2xl bg-surface border border-line p-3">
      <label className="text-xs font-semibold text-ink-muted block space-y-1">
        <span>Cómo se maneja</span>
        <select className={`climate-rule-mode ${FIELD}`} value={mode} onChange={(e) => setMode(e.target.value as ClimateMode)} aria-label="Cómo se maneja">
          {MODES.filter((m) => m !== 'sensor' || !info.noSensor).map((m) => (
            <option key={m} value={m}>
              {CLIMATE_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      {mode === 'schedule' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-ink-muted space-y-1">
            <span>Prende a las</span>
            <input type="time" className={`climate-rule-on-time ${FIELD}`} value={onTime} onChange={(e) => setOnTime(e.target.value)} aria-label="Prende a las" />
          </label>
          <label className="text-xs font-semibold text-ink-muted space-y-1">
            <span>Apaga a las</span>
            <input type="time" className={`climate-rule-off-time ${FIELD}`} value={offTime} onChange={(e) => setOffTime(e.target.value)} aria-label="Apaga a las" />
          </label>
        </div>
      )}
      {mode === 'sensor' && (
        <>
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Mira</span>
            <select className={FIELD} value={metric} onChange={(e) => setMetric(e.target.value as ClimateMetric)} aria-label="Qué mira">
              {(Object.keys(CLIMATE_METRICS) as ClimateMetric[]).map((m) => (
                <option key={m} value={m}>
                  {CLIMATE_METRICS[m].label} ({CLIMATE_METRICS[m].unit})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-ink-muted space-y-1">
              <span>Prende {dir === 'above' ? 'desde' : 'en'} ({unit})</span>
              <input className={FIELD} inputMode="decimal" value={on} onChange={(e) => setOn(e.target.value)} aria-label="Valor de encendido" />
            </label>
            <label className="text-xs font-semibold text-ink-muted space-y-1">
              <span>Apaga {dir === 'above' ? 'al bajar a' : 'al subir a'} ({unit})</span>
              <input className={FIELD} inputMode="decimal" value={off} onChange={(e) => setOff(e.target.value)} aria-label="Valor de apagado" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
            <input type="checkbox" checked={useNight} onChange={(e) => setUseNight(e.target.checked)} />
            Otros valores con la luz apagada
          </label>
          {useNight && (
            <div className="grid grid-cols-2 gap-2">
              <input className={FIELD} inputMode="decimal" value={nOn} onChange={(e) => setNOn(e.target.value)} aria-label="Encendido de noche" />
              <input className={FIELD} inputMode="decimal" value={nOff} onChange={(e) => setNOff(e.target.value)} aria-label="Apagado de noche" />
            </div>
          )}
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Si el sensor deja de mandar datos</span>
            <select className={FIELD} value={sensorLoss} onChange={(e) => setSensorLoss(e.target.value as ClimateRule['sensorLoss'])} aria-label="Si el sensor se calla">
              <option value="off">Apagarlo</option>
              <option value="on">Prenderlo</option>
              <option value="keep">Dejarlo como está</option>
            </select>
          </label>
          {hasSensor === false && (
            <p className="climate-rule-warning text-xs font-bold text-warn-ink">
              Este lugar no tiene un sensor de ambiente asignado: sin datos, el equipo hace lo que elijas arriba. Asigná uno en Equipos.
            </p>
          )}
        </>
      )}
      {(mode === 'follow' || mode === 'follow_inverted') && (
        <p className="text-xs text-ink-muted">
          {hasLight === false
            ? 'La luz de este lugar todavía no tiene un enchufe asignado: sin eso, Cultiveta no sabe cuándo es de día. Asigná la luz en Equipos.'
            : mode === 'follow'
              ? 'Prende y apaga a la misma hora que la luz. Queda cargado en el enchufe: sigue andando aunque cierres Cultiveta.'
              : 'Prende cuando la luz se apaga y apaga cuando se prende. Queda cargado en el enchufe: sigue andando aunque cierres Cultiveta.'}
        </p>
      )}
      {mode === 'schedule' && <p className="text-xs text-ink-muted">Todos los días a esas horas. Queda cargado en el enchufe: sigue andando aunque cierres Cultiveta.</p>}
      {mode === 'always' && <p className="text-xs text-ink-muted">Queda prendido todo el día. Si alguien lo apaga, Cultiveta lo vuelve a prender en su próxima revisión.</p>}
      {errors.map((e) => (
        <p key={e} className="text-xs font-bold text-error">
          {e}
        </p>
      ))}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={save} className="climate-rule-save cultiveta-btn-primary text-xs disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancel} className="cultiveta-btn-secondary text-xs">
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default ClimateRuleEditor;
