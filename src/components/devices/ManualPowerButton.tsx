import React, { useState } from 'react';
import { Power } from 'lucide-react';
import { devicesService, type DeviceBindingState } from '../../services/devicesService';
import { whenText } from '../../utils/lightCycle';

/** "Prendida a mano hasta hoy 18:00: después sigue el horario." (null si no está a mano). */
export function manualText(b: Pick<DeviceBindingState, 'manual' | 'role'>, now: number, female = false): string | null {
  const m = b.manual;
  if (!m || m.until <= now) return null;
  const state = m.value ? (female ? 'Prendida' : 'Prendido') : female ? 'Apagada' : 'Apagado';
  return `${state} a mano hasta ${whenText(m.until, now)}: después sigue ${b.role === 'light' ? 'su horario' : 'su regla'} solo.`;
}

interface ManualPowerButtonProps {
  binding: DeviceBindingState;
  /** "la luz" (femenino) o "el equipo". */
  female?: boolean;
  onToast?: (msg: string) => void;
  /** Después de la orden (por ejemplo, para volver a leer los equipos). */
  onDone?: () => Promise<void> | void;
  id?: string;
  className?: string;
}

/**
 * Prender o apagar a mano un toma asignado (la luz o un equipo de clima). Como en un timer: queda así hasta
 * el próximo cambio de su horario y después sigue solo. Sin conexión con el equipo, no se puede.
 */
export const ManualPowerButton: React.FC<ManualPowerButtonProps> = ({ binding, female = false, onToast, onDone, id, className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = binding.on === true;
  const offline = binding.online === false;
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const manual = await devicesService.setPower(binding.deviceId, binding.code, !on);
      await onDone?.();
      const what = female ? (on ? 'Apagada' : 'Prendida') : on ? 'Apagado' : 'Prendido';
      onToast?.(manual ? `${what} a mano hasta ${whenText(manual.until, Date.now())}` : `${what}: vuelve a seguir ${binding.role === 'light' ? 'su horario' : 'su regla'}`);
    } catch (e: any) {
      setError(e?.message || 'No se pudo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        id={id}
        data-power={on ? 'on' : 'off'}
        disabled={busy || offline || binding.on == null}
        onClick={toggle}
        className={`manual-power cultiveta-btn-secondary text-xs disabled:opacity-50 ${className}`}
      >
        <Power className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{busy ? (on ? 'Apagando…' : 'Prendiendo…') : on ? 'Apagar' : 'Prender'}</span>
      </button>
      {error && <span className="text-[11px] font-bold text-error">{error}</span>}
    </span>
  );
};

export default ManualPowerButton;
