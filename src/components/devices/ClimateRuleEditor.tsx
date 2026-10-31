import React, { useState } from 'react';
import {
  CLIMATE_METRICS,
  CLIMATE_ROLES,
  ruleDirection,
  validateClimateRule,
  type ClimateMetric,
  type ClimateMode,
  type ClimateRole,
  type ClimateRule,
} from '../../utils/deviceRules';

interface ClimateRuleEditorProps {
  role: ClimateRole;
  rule: ClimateRule;
  onSave: (rule: ClimateRule) => Promise<void> | void;
  onCancel: () => void;
}

const FIELD = 'min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink w-full';
const toNum = (v: string) => Number(String(v).replace(',', '.'));

/** Cómo se maneja un equipo de clima: por sensor (con sus valores) o siguiendo a la luz. */
export const ClimateRuleEditor: React.FC<ClimateRuleEditorProps> = ({ role, rule, onSave, onCancel }) => {
  const info = CLIMATE_ROLES[role];
  const [mode, setMode] = useState<ClimateMode>(rule.mode);
  const [metric, setMetric] = useState<ClimateMetric>(rule.metric);
  const [on, setOn] = useState(String(rule.on));
  const [off, setOff] = useState(String(rule.off));
  const [useNight, setUseNight] = useState(!!rule.night);
  const [nOn, setNOn] = useState(String(rule.night?.on ?? rule.on));
  const [nOff, setNOff] = useState(String(rule.night?.off ?? rule.off));
  const [sensorLoss, setSensorLoss] = useState(rule.sensorLoss);
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
      <label className="text-[11px] font-semibold text-ink-muted block space-y-1">
        <span>Cómo se maneja</span>
        <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value as ClimateMode)} aria-label="Cómo se maneja">
          {!info.noSensor && <option value="sensor">Por sensor</option>}
          <option value="follow">Sigue a la luz</option>
          <option value="follow_inverted">Al revés de la luz</option>
        </select>
      </label>
      {mode === 'sensor' && (
        <>
          <label className="text-[11px] font-semibold text-ink-muted block space-y-1">
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
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Prende {dir === 'above' ? 'desde' : 'en'} ({unit})</span>
              <input className={FIELD} inputMode="decimal" value={on} onChange={(e) => setOn(e.target.value)} aria-label="Valor de encendido" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Apaga {dir === 'above' ? 'al bajar a' : 'al subir a'} ({unit})</span>
              <input className={FIELD} inputMode="decimal" value={off} onChange={(e) => setOff(e.target.value)} aria-label="Valor de apagado" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-muted">
            <input type="checkbox" checked={useNight} onChange={(e) => setUseNight(e.target.checked)} />
            Otros valores con la luz apagada
          </label>
          {useNight && (
            <div className="grid grid-cols-2 gap-2">
              <input className={FIELD} inputMode="decimal" value={nOn} onChange={(e) => setNOn(e.target.value)} aria-label="Encendido de noche" />
              <input className={FIELD} inputMode="decimal" value={nOff} onChange={(e) => setNOff(e.target.value)} aria-label="Apagado de noche" />
            </div>
          )}
          <label className="text-[11px] font-semibold text-ink-muted block space-y-1">
            <span>Si el sensor deja de mandar datos</span>
            <select className={FIELD} value={sensorLoss} onChange={(e) => setSensorLoss(e.target.value as ClimateRule['sensorLoss'])} aria-label="Si el sensor se calla">
              <option value="off">Apagarlo</option>
              <option value="on">Prenderlo</option>
              <option value="keep">Dejarlo como está</option>
            </select>
          </label>
        </>
      )}
      {mode !== 'sensor' && (
        <p className="text-[11px] text-ink-muted">Queda cargado en Smart Life junto con la luz: sigue andando aunque cierres Cultiveta.</p>
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

export default ClimateRuleEditor;
