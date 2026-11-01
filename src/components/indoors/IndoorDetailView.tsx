import React, { useState } from 'react';
import { ArrowLeft, Dna, Fan, Home, Pencil, Plus, Thermometer, Trash2 } from 'lucide-react';
import type { Cultivation, Genetics, Indoor } from '../../types';
import { indoorService } from '../../services/indoorService';
import { climateBindingsFor, devicesService, lightBindingFor, sensorBindingFor, useDevicesOverview } from '../../services/devicesService';
import { environmentService } from '../../services/environmentService';
import { CLIMATE_ROLES, describeClimateRule } from '../../utils/deviceRules';
import { INDOOR_KINDS, cropsInIndoor, indoorGenetics, indoorMetrics, indoorSizeText, looseIndoorCrops } from '../../utils/indoors';
import { LightCycleCard, type LightSchedule } from '../cultivations/LightCycleCard';
import { ActiveCropCard } from '../dashboard/ActiveCropCard';

interface IndoorDetailViewProps {
  indoor: Indoor;
  /** Todos los cultivos (con la luz del indoor ya puesta en los de adentro). */
  cultivations: Cultivation[];
  userId: string;
  geneticsList?: Genetics[];
  onBack: () => void;
  onOpenCrop: (crop: Cultivation) => void;
  onEdit: (indoor: Indoor) => void;
  onDeleted: () => void;
  /** Nuevo cultivo que ya arranca en este indoor. */
  onCreateCropHere: (indoor: Indoor) => void;
  onOpenDevices?: (focus: 'luz' | 'ambiente' | 'riego') => void;
  showToast?: (msg: string) => void;
  now?: number;
}

const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const ago = (ms: number | null) => {
  if (!ms) return '';
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
};

/**
 * Un indoor: su luz (la de todos los cultivos de adentro), el ambiente y los equipos de clima del
 * indoor, los cultivos que tiene y todas las genéticas que hay adentro.
 */
export const IndoorDetailView: React.FC<IndoorDetailViewProps> = ({
  indoor,
  cultivations,
  userId,
  geneticsList = [],
  onBack,
  onOpenCrop,
  onEdit,
  onDeleted,
  onCreateCropHere,
  onOpenDevices,
  showToast,
  now,
}) => {
  const overview = useDevicesOverview();
  const crops = cropsInIndoor(cultivations, indoor.id);
  const loose = looseIndoorCrops(cultivations);
  const [toAdd, setToAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genetics = indoorGenetics(crops);
  const plants = crops.reduce((n, c) => n + (c.plantCount || 1), 0);
  const metrics = indoorMetrics(indoor);
  const size = indoorSizeText(indoor);
  const sensor = sensorBindingFor(overview, indoor.id, 'sensor_th');
  const climate = climateBindingsFor(overview, indoor.id);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (ok) showToast?.(ok);
    } catch (e: any) {
      setError(e?.message || 'No se pudo.');
    } finally {
      setBusy(false);
    }
  };
  const addCrop = () => {
    const crop = loose.find((c) => c.id === (toAdd || loose[0]?.id));
    if (!crop) return;
    run(async () => {
      await indoorService.addCrop(indoor, crop, userId);
      setToAdd('');
    }, `${crop.name} ahora está en ${indoor.name}`);
  };
  const removeCrop = (crop: Cultivation) => {
    if (!window.confirm(`¿Sacar ${crop.name} de ${indoor.name}? Se queda con la luz que tiene ahora.`)) return;
    run(() => indoorService.removeCrop(indoor, crop, userId).then(() => undefined), `${crop.name} salió de ${indoor.name}`);
  };
  const remove = () => {
    const msg = crops.length
      ? `¿Borrar ${indoor.name}? Sus ${crops.length} cultivo${crops.length === 1 ? '' : 's'} quedan sueltos, con la luz que tienen ahora, y sus equipos quedan sin asignar.`
      : `¿Borrar ${indoor.name}?`;
    if (!window.confirm(msg)) return;
    run(async () => {
      // sus equipos (luz, clima, sensor) dejan de estar asignados: si no, seguirían manejando un indoor que ya no está
      for (const b of overview.bindings.filter((x) => x.targetKind === 'indoor' && x.cultivationId === indoor.id)) await devicesService.unbind(b.id).catch(() => {});
      await indoorService.deleteIndoor(indoor, cultivations, userId);
      onDeleted();
    }, 'Indoor borrado');
  };

  return (
    <div id="indoor-detail" className="space-y-4 max-w-3xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-white hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Inicio
      </button>

      <section className={`${CARD} space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2.5 rounded-2xl bg-brand/10 text-brand shrink-0">
              <Home className="w-6 h-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-ink tracking-tight truncate">{indoor.name}</h1>
              <p className="text-xs text-ink-muted">
                {INDOOR_KINDS[indoor.kind] || 'Indoor'}
                {size ? ` · ${size}` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" id="indoor-edit" onClick={() => onEdit(indoor)} className="cultiveta-btn-secondary text-xs" aria-label="Editar indoor">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Editar</span>
            </button>
            <button type="button" id="indoor-delete" disabled={busy} onClick={remove} className="cultiveta-btn-secondary text-xs text-error" aria-label="Borrar indoor">
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Cultivos', String(crops.length)],
            ['Plantas', String(plants)],
            [metrics.wattsPerM2 ? 'W/m²' : 'Volumen', metrics.wattsPerM2 ? String(Math.round(metrics.wattsPerM2)) : metrics.volumeM3 ? `${metrics.volumeM3.toFixed(2).replace('.', ',')} m³` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-surface border border-line p-2.5">
              <b className="block text-lg font-black text-ink leading-tight">{v}</b>
              <small className="text-[10px] font-semibold text-ink-muted">{l}</small>
            </div>
          ))}
        </div>
        {error && <p className="text-xs font-bold text-error">{error}</p>}
      </section>

      <LightCycleCard
        cultivation={indoor}
        sharedNote={crops.length ? `Es la luz de ${crops.length === 1 ? 'su cultivo' : `sus ${crops.length} cultivos`}.` : null}
        onSaveSchedule={async (schedule: LightSchedule) => {
          await indoorService.updateIndoor(indoor.id, { lighting: { ...(indoor.lighting ?? { type: '' }), ...schedule } }, userId);
          showToast?.('Hora de encendido de la luz guardada.');
        }}
        onConnectPlug={onOpenDevices ? () => onOpenDevices('luz') : undefined}
        device={lightBindingFor(overview, indoor.id)}
        now={now}
      />

      <section id="indoor-ambient" className={`${CARD} space-y-3`}>
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Thermometer className="w-4 h-4 text-brand" aria-hidden="true" />
          Ambiente del indoor
        </span>
        {sensor?.sensors && (sensor.sensors.temperature != null || sensor.sensors.humidity != null) ? (
          <div>
            <p className="text-2xl font-black text-ink">
              {sensor.sensors.temperature != null ? `${sensor.sensors.temperature} °C` : '—'}
              <span className="text-ink-muted font-bold"> · </span>
              {sensor.sensors.humidity != null ? `${sensor.sensors.humidity} %` : '—'}
            </p>
            {sensor.sensors.temperature != null && sensor.sensors.humidity != null && (
              <p className="text-xs text-ink-muted">VPD: {environmentService.calculateVPD(sensor.sensors.temperature, sensor.sensors.humidity)} kPa</p>
            )}
            <p className="text-[11px] text-ink-subtle">{sensor.online === false ? 'Sensor sin conexión' : `Medido por ${sensor.deviceName} · ${ago(sensor.readAt)}`}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">Sin sensor: el ambiente se anota a mano en cada cultivo.</p>
            {onOpenDevices && (
              <button type="button" onClick={() => onOpenDevices('ambiente')} className="cultiveta-btn-secondary text-xs">
                Conectar mi sensor
              </button>
            )}
          </div>
        )}
        {climate.map((b) => (
          <div key={b.id} className="indoor-climate-device rounded-2xl bg-surface border border-line p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink flex items-center gap-1.5">
                <Fan className="w-4 h-4 text-brand" aria-hidden="true" />
                {b.climateRole ? CLIMATE_ROLES[b.climateRole].label : 'Equipo'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${b.online === false ? 'bg-coral/15 text-coral' : b.on ? 'bg-accent text-ink' : 'bg-brand-deep text-white'}`}>
                {b.online === false ? 'SIN CONEXIÓN' : b.on ? 'PRENDIDO' : 'APAGADO'}
              </span>
            </div>
            {b.climateRole && b.rule && <p className="text-xs text-ink-muted">{describeClimateRule(b.climateRole, b.rule)}</p>}
            {b.lastReason && <p className="text-[11px] text-ink-subtle">Ahora: {b.lastReason}</p>}
          </div>
        ))}
      </section>

      <section id="indoor-crops" className={`${CARD} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Cultivos adentro</h2>
          <button type="button" id="indoor-new-crop" onClick={() => onCreateCropHere(indoor)} className="cultiveta-btn-secondary text-xs">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Nuevo cultivo acá
          </button>
        </div>
        {crops.length === 0 && <p className="text-xs text-ink-muted">Todavía no hay cultivos en este indoor.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {crops.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <ActiveCropCard cultivation={c} geneticsList={geneticsList} onOpen={onOpenCrop} />
              <button type="button" disabled={busy} onClick={() => removeCrop(c)} className="indoor-remove-crop text-[11px] font-bold text-ink-muted hover:underline px-1">
                Sacar del indoor
              </button>
            </div>
          ))}
        </div>
        {loose.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line">
            <span className="text-xs font-semibold text-ink-muted pt-2">Meter un cultivo que ya tenés:</span>
            <div className="flex flex-wrap items-center gap-2 w-full">
              <select id="indoor-add-select" aria-label="Cultivo para meter en el indoor" value={toAdd || loose[0].id} onChange={(e) => setToAdd(e.target.value)} className="min-h-10 px-3 rounded-xl bg-white border border-line text-sm text-ink flex-1 min-w-0">
                {loose.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" id="indoor-add-crop" disabled={busy} onClick={addCrop} className="cultiveta-btn-primary text-xs disabled:opacity-50">
                Meter
              </button>
            </div>
            <p className="text-[11px] text-ink-subtle w-full">Al entrar, el cultivo usa la luz de este indoor{indoor.lighting?.photoperiodHoursLight ? '' : ' (y si el indoor todavía no tiene luz cargada, toma la del cultivo)'}.</p>
          </div>
        )}
      </section>

      <section id="indoor-genetics" className={`${CARD} space-y-2`}>
        <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Dna className="w-4 h-4 text-brand" aria-hidden="true" />
          Genéticas adentro
        </h2>
        {genetics.length === 0 ? (
          <p className="text-xs text-ink-muted">Cuando sumes cultivos, acá se ven todas las genéticas del indoor.</p>
        ) : (
          <ul className="divide-y divide-line">
            {genetics.map((g) => (
              <li key={g.name} className="indoor-genetic py-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink truncate">{g.name}</span>
                <span className="text-[11px] text-ink-muted shrink-0">
                  {g.plants} planta{g.plants === 1 ? '' : 's'} · {g.crops.join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default IndoorDetailView;
