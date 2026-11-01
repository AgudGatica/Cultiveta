import React, { useEffect, useState } from 'react';
import { Home, X } from 'lucide-react';
import type { Indoor, IndoorKind } from '../../types';
import { indoorService } from '../../services/indoorService';
import { INDOOR_KINDS, indoorMetrics } from '../../utils/indoors';
import { darkHoursFor } from '../../utils/photoperiods';
import { PhotoperiodPresetPicker } from '../cultivations/PhotoperiodPresetPicker';

interface IndoorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  /** Para editar uno que ya existe; sin esto, crea uno nuevo. */
  indoorToEdit?: Indoor | null;
  onSaved: (indoor: Indoor) => void;
}

const FIELD = 'w-full min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand';
const LABEL = 'text-xs font-semibold text-ink-muted block space-y-1';
const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v.replace(',', '.')))) || undefined);

/**
 * Crear o editar un indoor (carpa, sala o armario): nombre, medidas y luz. La hora de encendido se
 * carga después en la tarjeta de luz del indoor, como en un cultivo.
 */
export const IndoorFormModal: React.FC<IndoorFormModalProps> = ({ isOpen, onClose, userId, indoorToEdit = null, onSaved }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<IndoorKind>('carpa');
  const [size, setSize] = useState({ w: '', d: '', h: '' });
  const [lightType, setLightType] = useState('LED');
  const [watts, setWatts] = useState('');
  const [lightHours, setLightHours] = useState<number | ''>(18);
  const [darkHours, setDarkHours] = useState<number | null>(6);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const i = indoorToEdit;
    setName(i?.name || '');
    setKind(i?.kind || 'carpa');
    setSize({ w: i?.widthCm ? String(i.widthCm) : '', d: i?.depthCm ? String(i.depthCm) : '', h: i?.heightCm ? String(i.heightCm) : '' });
    setLightType(i?.lighting?.type || 'LED');
    setWatts(i?.lighting?.usedWatts ? String(i.lighting.usedWatts) : '');
    setLightHours(i?.lighting?.photoperiodHoursLight ?? 18);
    setDarkHours(i?.lighting?.photoperiodHoursDark ?? (i?.lighting?.photoperiodHoursLight != null ? null : 6));
    setError(null);
  }, [isOpen, indoorToEdit]);

  if (!isOpen) return null;

  const draft = { widthCm: num(size.w), depthCm: num(size.d), heightCm: num(size.h), lighting: { type: lightType, usedWatts: num(watts) } };
  const m = indoorMetrics(draft);

  const save = async () => {
    if (!name.trim()) return setError('Ponele un nombre (por ejemplo, "Carpa 80x80").');
    if (lightHours === '') return setError('Elegí las horas de luz.');
    setSaving(true);
    setError(null);
    try {
      const lighting = {
        ...(indoorToEdit?.lighting || {}),
        type: lightType.trim() || 'LED',
        ...(num(watts) ? { usedWatts: num(watts) } : {}),
        photoperiodHoursLight: Number(lightHours),
        photoperiodHoursDark: darkHoursFor(Number(lightHours), darkHours),
      };
      const data = { name: name.trim().slice(0, 60), kind, widthCm: draft.widthCm, depthCm: draft.depthCm, heightCm: draft.heightCm, lighting };
      if (indoorToEdit) {
        await indoorService.updateIndoor(indoorToEdit.id, data, userId);
        onSaved({ ...indoorToEdit, ...data });
      } else {
        onSaved(await indoorService.createIndoor({ userId, ...data }));
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el indoor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="indoor-form-title" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div id="indoor-form-modal" className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-line my-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <Home className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="indoor-form-title" className="text-lg font-extrabold text-ink">
                {indoorToEdit ? 'Editar indoor' : 'Nuevo indoor'}
              </h2>
              <p className="text-xs text-ink-muted">Una carpa, sala o armario con su luz. Los cultivos de adentro la comparten.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className={LABEL}>
          <span>Nombre</span>
          <input id="indoor-name" className={FIELD} value={name} maxLength={60} placeholder="Carpa 80x80" onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-ink-muted">Tipo</span>
          <div className="flex gap-2" role="group" aria-label="Tipo de indoor">
            {(Object.keys(INDOOR_KINDS) as IndoorKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`flex-1 min-h-10 rounded-full text-xs font-bold border ${kind === k ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-line'}`}
              >
                {INDOOR_KINDS[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([['w', 'Ancho (cm)'], ['d', 'Fondo (cm)'], ['h', 'Alto (cm)']] as const).map(([k, l]) => (
            <label key={k} className={LABEL}>
              <span>{l}</span>
              <input id={`indoor-size-${k}`} className={FIELD} inputMode="numeric" value={size[k]} onChange={(e) => {
                  const v = e.target.value;
                  setSize((prev) => ({ ...prev, [k]: v }));
                }} />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>
            <span>Luz</span>
            <input id="indoor-light-type" className={FIELD} value={lightType} placeholder="LED, sodio…" onChange={(e) => setLightType(e.target.value)} />
          </label>
          <label className={LABEL}>
            <span>Watts reales</span>
            <input id="indoor-light-watts" className={FIELD} inputMode="numeric" value={watts} placeholder="240" onChange={(e) => setWatts(e.target.value)} />
          </label>
        </div>
        {(m.volumeM3 || m.wattsPerM2) && (
          <p id="indoor-form-metrics" className="text-[11px] text-ink-muted">
            {m.volumeM3 ? `${m.volumeM3.toFixed(2).replace('.', ',')} m³` : ''}
            {m.volumeM3 && m.wattsPerM2 ? ' · ' : ''}
            {m.wattsPerM2 ? `${Math.round(m.wattsPerM2)} W/m²` : ''}
          </p>
        )}

        <div className="space-y-1">
          <span className="text-xs font-semibold text-ink-muted">Horas de luz</span>
          <PhotoperiodPresetPicker
            idPrefix="indoor-photoperiod"
            light={lightHours}
            dark={darkHours}
            onSelect={(light, dark) => {
              setLightHours(light);
              setDarkHours(dark);
            }}
          />
        </div>

        {error && <p className="text-xs font-bold text-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" id="indoor-save" disabled={saving} onClick={save} className="cultiveta-btn-primary text-sm flex-1 justify-center disabled:opacity-50">
            {saving ? 'Guardando…' : indoorToEdit ? 'Guardar cambios' : 'Crear indoor'}
          </button>
          <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default IndoorFormModal;
