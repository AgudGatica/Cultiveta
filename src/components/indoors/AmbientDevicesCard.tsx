import React, { useState } from 'react';
import { Fan, Plus, SlidersHorizontal } from 'lucide-react';
import { devicesService, type DeviceBindingState } from '../../services/devicesService';
import { CLIMATE_MODE_LABEL, CLIMATE_ROLES, describeClimateRule } from '../../utils/deviceRules';
import { ClimateRuleEditor } from '../devices/ClimateRuleEditor';
import { ManualPowerButton, manualText } from '../devices/ManualPowerButton';

interface AmbientDevicesCardProps {
  /** Equipos de clima asignados al ambiente (extractor, intracción, ventilador…). */
  devices: DeviceBindingState[];
  /** ¿La luz del ambiente tiene enchufe? (para "sigue a la luz"). */
  hasLight: boolean;
  /** ¿El ambiente tiene sensor de ambiente? (para "por sensor"). */
  hasSensor: boolean;
  /** Lleva a Equipos para asignar otro toma. */
  onAssign?: () => void;
  onToast?: (msg: string) => void;
  now?: number;
}

/**
 * Equipos del ambiente: cada toma de clima con cómo se maneja (sigue a la luz, al revés, siempre prendido,
 * su propio horario o por sensor), si está prendido y por qué, y botones para prenderlo o apagarlo a mano
 * y para cambiar cómo se maneja. Se asignan en Equipos.
 */
export const AmbientDevicesCard: React.FC<AmbientDevicesCardProps> = ({ devices, hasLight, hasSensor, onAssign, onToast, now = Date.now() }) => {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section id="ambient-devices" className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Fan className="w-4 h-4 text-brand" aria-hidden="true" />
          Equipos del ambiente
        </span>
        {onAssign && (
          <button type="button" id="ambient-devices-assign" onClick={onAssign} className="cultiveta-btn-secondary text-xs">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Asignar otro
          </button>
        )}
      </div>

      {devices.length === 0 && (
        <p className="text-xs text-ink-muted">
          Extractor, intracción, ventilador, humidificador… Asigná cada toma de tu zapatilla en Equipos y acá elegís cómo se maneja: que siga a la luz, siempre prendido, a qué hora prende y apaga, o por sensor.
        </p>
      )}

      <ul className="space-y-2">
        {devices.map((b) => {
          const role = b.climateRole ? CLIMATE_ROLES[b.climateRole] : null;
          const note = manualText(b, now);
          return (
            <li key={b.id} className="ambient-device rounded-2xl bg-surface border border-line p-3 space-y-2" data-binding={b.id} data-mode={b.rule?.mode || ''}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{role?.label || 'Equipo'}</p>
                  <p className="text-[11px] text-ink-subtle truncate">
                    {b.deviceName} · {b.label}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${
                    b.online === false ? 'bg-coral/15 text-coral' : b.on ? 'bg-accent text-ink' : 'bg-brand-deep text-white'
                  }`}
                >
                  {b.online === false ? 'SIN CONEXIÓN' : b.on ? 'PRENDIDO' : 'APAGADO'}
                </span>
              </div>
              {b.climateRole && b.rule && (
                <p className="text-xs text-ink">
                  <b>{CLIMATE_MODE_LABEL[b.rule.mode]}</b>
                  {b.rule.mode !== 'follow' && b.rule.mode !== 'always' ? `: ${describeClimateRule(b.climateRole, b.rule)}` : ''}
                </p>
              )}
              {note ? (
                <p className="ambient-device-manual text-[11px] font-bold text-brand">{note}</p>
              ) : (
                b.lastReason && <p className="text-[11px] text-ink-subtle">Ahora: {b.lastReason}</p>
              )}
              {(b.rule?.mode === 'follow' || b.rule?.mode === 'follow_inverted') && !hasLight && (
                <p className="text-[11px] font-bold text-warn-ink">La luz de este ambiente todavía no tiene un enchufe asignado: sin eso no sabe cuándo es de día.</p>
              )}
              {editing === b.id && b.climateRole && b.rule ? (
                <ClimateRuleEditor
                  role={b.climateRole}
                  rule={b.rule}
                  hasLight={hasLight}
                  hasSensor={hasSensor}
                  onCancel={() => setEditing(null)}
                  onSave={async (rule) => {
                    await devicesService.setRule(b.id, rule);
                    setEditing(null);
                    onToast?.(`${role?.label || 'Equipo'}: ${CLIMATE_MODE_LABEL[rule.mode].toLowerCase()}`);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  <ManualPowerButton binding={b} onToast={onToast} />
                  {b.climateRole && b.rule && (
                    <button type="button" onClick={() => setEditing(b.id)} className="ambient-device-edit cultiveta-btn-secondary text-xs">
                      <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                      Cómo se maneja
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default AmbientDevicesCard;
