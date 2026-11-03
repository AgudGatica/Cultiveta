import React from 'react';
import { CheckCircle2, ClipboardCheck, Container } from 'lucide-react';
import { num } from '../../utils/feedTargets';
import { TANK_TEMP_RANGE, type TankStatus } from '../../utils/hydroTank';

const ago = (h: number) => (h < 1 ? 'recién' : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`);

/**
 * Hidroponía: el tanque. pH, EC y temperatura del agua de ahora contra lo recomendado, cuándo fue el último
 * control y UN aviso (el más importante). En lugar de "Próximo riego" y del pronóstico de riego.
 */
export const HydroTankCard: React.FC<{ status: TankStatus; onCheck?: () => void; className?: string }> = ({ status, onCheck, className = '' }) => {
  const { target } = status;
  const tile = (id: string, label: string, value: number | null, unit: string, range: { min: number; max: number }) => {
    const out = value !== null && (value < range.min || value > range.max);
    return (
      <div className="rounded-2xl bg-surface border border-line p-2.5 text-center">
        <small className="block text-[10px] font-semibold text-ink-muted">{label}</small>
        <b id={id} data-out={out} className={`block text-xl font-black leading-tight ${out ? 'text-coral' : 'text-ink'}`}>
          {value === null ? '—' : num(value)}
          {value !== null && unit && <small className="text-xs">{unit}</small>}
        </b>
        <small className="block text-[10px] text-ink-muted">
          {num(range.min)}–{num(range.max)}
        </small>
      </div>
    );
  };
  const ok = status.alert.kind === 'ok';
  return (
    <section id="hydro-tank" data-alert={status.alert.kind} className={`bg-white rounded-[28px] p-5 border border-line shadow-2xs space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Container className="w-4 h-4 text-brand" aria-hidden="true" />
          Tanque
        </span>
        <small className="text-[11px] font-semibold text-ink-subtle text-right">
          {target.label}
          {status.hoursSinceCheck !== null ? ` · ${ago(status.hoursSinceCheck)}` : ''}
        </small>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tile('tank-ph', 'pH', status.ph, '', target.ph)}
        {tile('tank-ec', 'EC (mS/cm)', status.ec, '', target.ec)}
        {tile('tank-temp', 'Agua', status.tempC, ' °C', TANK_TEMP_RANGE)}
      </div>
      <p
        id="tank-alert"
        className={`text-xs font-semibold rounded-2xl p-2.5 border flex gap-1.5 ${ok ? 'bg-ok-bg border-ok-line text-ok-ink' : 'bg-warn-bg border-warn-line text-warn-ink'}`}
      >
        {ok && <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
        {status.alert.text}
      </p>
      <p className="text-[11px] text-ink-muted">pH y EC todos los días a la misma hora; toda la solución nueva cada 2 semanas.</p>
      {onCheck && (
        <button type="button" id="tank-check" onClick={onCheck} className="cultiveta-btn-primary text-sm w-full justify-center">
          <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
          Anotar control del tanque
        </button>
      )}
    </section>
  );
};
