import React, { useEffect, useState } from 'react';
import { Home, Sun, X } from 'lucide-react';
import type { Indoor, IndoorKind } from '../../types';
import { indoorService } from '../../services/indoorService';
import { AMBIENT_KINDS, ambientEnvironment, indoorMetrics, type AmbientEnvironment } from '../../utils/indoors';
import { darkHoursFor } from '../../utils/photoperiods';
import { lightBindingFor, useDevicesOverview } from '../../services/devicesService';
import { PhotoperiodPresetPicker } from '../cultivations/PhotoperiodPresetPicker';

interface AmbientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  /** Para editar uno que ya existe; sin esto, crea uno nuevo. */
  ambientToEdit?: Indoor | null;
  onSaved: (ambient: Indoor) => void;
}

const FIELD = 'w-full min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand';
const LABEL = 'text-xs font-semibold text-ink-muted block space-y-1';
const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v.replace(',', '.')))) || undefined);
const PILL = (on: boolean) => `flex-1 min-h-10 rounded-full text-xs font-bold border ${on ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-line'}`;

/**
 * Crear o editar un ambiente: interior (carpa, sala o armario, con su luz) o exterior (patio, balcón,
 * terraza o invernadero, con luz natural). La hora de encendido se carga después en la tarjeta de luz.
 */
export const AmbientFormModal: React.FC<AmbientFormModalProps> = ({ isOpen, onClose, userId, ambientToEdit = null, onSaved }) => {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<AmbientEnvironment>('indoor');
  const [kind, setKind] = useState<IndoorKind>('carpa');
  const [size, setSize] = useState({ w: '', d: '', h: '' });
  const [lightType, setLightType] = useState('LED');
  const [watts, setWatts] = useState('');
  const [lightHours, setLightHours] = useState<number | ''>(18);
  const [darkHours, setDarkHours] = useState<number | null>(6);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // los superciclos (13/13, 14/14) necesitan un enchufe inteligente que maneje la luz de este ambiente
  const overview = useDevicesOverview();
  const hasSmartPlug = !!(ambientToEdit && lightBindingFor(overview, ambientToEdit.id));

  useEffect(() => {
    if (!isOpen) return;
    const a = ambientToEdit;
    setName(a?.name || '');
    setEnvironment(a ? ambientEnvironment(a) : 'indoor');
    setKind(a?.kind || 'carpa');
    setSize({ w: a?.widthCm ? String(a.widthCm) : '', d: a?.depthCm ? String(a.depthCm) : '', h: a?.heightCm ? String(a.heightCm) : '' });
    setLightType(a?.lighting?.type || 'LED');
    setWatts(a?.lighting?.usedWatts ? String(a.lighting.usedWatts) : '');
    setLightHours(a?.lighting?.photoperiodHoursLight ?? 18);
    setDarkHours(a?.lighting?.photoperiodHoursDark ?? (a?.lighting?.photoperiodHoursLight != null ? null : 6));
    setError(null);
  }, [isOpen, ambientToEdit]);

  if (!isOpen) return null;

  const indoor = environment === 'indoor';
  const draft = { widthCm: num(size.w), depthCm: num(size.d), heightCm: num(size.h), lighting: indoor ? { type: lightType, usedWatts: num(watts) } : undefined };
  const m = indoorMetrics(draft);
  const pickEnvironment = (e: AmbientEnvironment) => {
    setEnvironment(e);
    setKind(e === 'indoor' ? 'carpa' : 'patio');
  };

  const save = async () => {
    if (!name.trim()) return setError(indoor ? 'Ponele un nombre (por ejemplo, "Carpa 80x80").' : 'Ponele un nombre (por ejemplo, "Patio").');
    if (indoor && lightHours === '') return setError('Elegí las horas de luz.');
    setSaving(true);
    setError(null);
    try {
      const lighting = indoor
        ? {
            ...(ambientToEdit?.lighting || {}),
            type: lightType.trim() || 'LED',
            ...(num(watts) ? { usedWatts: num(watts) } : {}),
            photoperiodHoursLight: Number(lightHours),
            photoperiodHoursDark: darkHoursFor(Number(lightHours), darkHours),
          }
        : undefined;
      const data = { name: name.trim().slice(0, 60), environment, kind, widthCm: draft.widthCm, depthCm: draft.depthCm, heightCm: draft.heightCm, ...(lighting ? { lighting } : {}) };
      if (ambientToEdit) {
        await indoorService.updateIndoor(ambientToEdit.id, data, userId);
        onSaved({ ...ambientToEdit, ...data });
      } else {
        onSaved(await indoorService.createIndoor({ userId, ...data }));
      }
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar el ambiente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ambient-form-title" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div id="ambient-form-modal" className="w-full max-w-lg bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-line my-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">{indoor ? <Home className="w-5 h-5" aria-hidden="true" /> : <Sun className="w-5 h-5" aria-hidden="true" />}</div>
            <div>
              <h2 id="ambient-form-title" className="text-lg font-extrabold text-ink">
                {ambientToEdit ? 'Editar ambiente' : 'Nuevo ambiente'}
              </h2>
              <p className="text-xs text-ink-muted">Donde están tus plantas: una carpa o sala, o un lugar de exterior.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-ink-muted">¿Interior o exterior?</span>
          <div className="flex gap-2" role="group" aria-label="Interior o exterior">
            <button type="button" id="ambient-env-indoor" aria-pressed={indoor} disabled={!!ambientToEdit} onClick={() => pickEnvironment('indoor')} className={PILL(indoor)}>
              Interior
            </button>
            <button type="button" id="ambient-env-exterior" aria-pressed={!indoor} disabled={!!ambientToEdit} onClick={() => pickEnvironment('exterior')} className={PILL(!indoor)}>
              Exterior
            </button>
          </div>
        </div>

        <label className={LABEL}>
          <span>Nombre</span>
          <input id="ambient-name" className={FIELD} value={name} maxLength={60} placeholder={indoor ? 'Carpa 80x80' : 'Patio'} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="space-y-1">
          <span className="text-xs font-semibold text-ink-muted">Tipo</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de ambiente">
            {(Object.entries(AMBIENT_KINDS[environment]) as Array<[IndoorKind, string]>).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={PILL(kind === k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([['w', 'Ancho (cm)'], ['d', 'Fondo (cm)'], ['h', 'Alto (cm)']] as const).map(([k, l]) => (
            <label key={k} className={LABEL}>
              <span>{l}</span>
              <input
                id={`ambient-size-${k}`}
                className={FIELD}
                inputMode="numeric"
                value={size[k]}
                onChange={(e) => {
                  const v = e.target.value;
                  setSize((prev) => ({ ...prev, [k]: v }));
                }}
              />
            </label>
          ))}
        </div>

        {indoor ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className={LABEL}>
                <span>Luz</span>
                <input id="ambient-light-type" className={FIELD} value={lightType} placeholder="LED, sodio…" onChange={(e) => setLightType(e.target.value)} />
              </label>
              <label className={LABEL}>
                <span>Watts reales</span>
                <input id="ambient-light-watts" className={FIELD} inputMode="numeric" value={watts} placeholder="240" onChange={(e) => setWatts(e.target.value)} />
              </label>
            </div>
            {(m.volumeM3 || m.wattsPerM2) && (
              <p id="ambient-form-metrics" className="text-[11px] text-ink-muted">
                {m.volumeM3 ? `${m.volumeM3.toFixed(2).replace('.', ',')} m³` : ''}
                {m.volumeM3 && m.wattsPerM2 ? ' · ' : ''}
                {m.wattsPerM2 ? `${Math.round(m.wattsPerM2)} W/m²` : ''}
              </p>
            )}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-ink-muted">Horas de luz</span>
              <PhotoperiodPresetPicker
                idPrefix="ambient-photoperiod"
                light={lightHours}
                dark={darkHours}
                hasSmartPlug={hasSmartPlug}
                onSelect={(light, dark) => {
                  setLightHours(light);
                  setDarkHours(dark);
                }}
              />
              {lightHours !== '' && Number(lightHours) + darkHoursFor(Number(lightHours), darkHours) > 24 && !ambientToEdit?.lighting?.lightsOnDate && (
                <p id="ambient-supercycle-note" className="text-[11px] text-ink-muted">
                  Después, en la tarjeta de la luz, elegí el día y la hora de un encendido: con eso Cultiveta calcula los demás.
                </p>
              )}
            </div>
          </>
        ) : (
          <p id="ambient-exterior-note" className="text-xs text-ink-muted bg-surface border border-line rounded-2xl px-3 py-2.5">
            Exterior: luz natural, sin horario de luz. El clima se anota a mano o con un sensor.
          </p>
        )}

        {error && <p className="text-xs font-bold text-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" id="ambient-save" disabled={saving} onClick={save} className="cultiveta-btn-primary text-sm flex-1 justify-center disabled:opacity-50">
            {saving ? 'Guardando…' : ambientToEdit ? 'Guardar cambios' : 'Crear ambiente'}
          </button>
          <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmbientFormModal;
