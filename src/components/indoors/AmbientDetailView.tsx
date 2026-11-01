import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Dna, Fan, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Genetics, Indoor } from '../../types';
import { indoorService } from '../../services/indoorService';
import { climateBindingsFor, devicesService, lightBindingFor, sensorBindingFor, useDevicesOverview } from '../../services/devicesService';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { CLIMATE_ROLES, describeClimateRule } from '../../utils/deviceRules';
import { targetsForStages } from '../../utils/ambientEvaluation';
import { INDOOR_KINDS, ambientCoverImage, cropsInIndoor, geneticEntries, harvestText, indoorMetrics, indoorSizeText, isExteriorAmbient, type GeneticEntry } from '../../utils/indoors';
import { LightCycleCard, type LightSchedule } from '../cultivations/LightCycleCard';
import { AmbientClimateCard, type AmbientReading } from './AmbientClimateCard';

interface AmbientDetailViewProps {
  ambient: Indoor;
  /** Todos los cultivos (con la luz del ambiente ya puesta en los de adentro). */
  cultivations: Cultivation[];
  envRecords?: EnvironmentRecord[];
  userId: string;
  geneticsList?: Genetics[];
  onBack: () => void;
  onOpenGenetic: (entry: GeneticEntry) => void;
  onEdit: (ambient: Indoor) => void;
  onDeleted: () => void;
  /** Sumar plantas (un cultivo nuevo que ya arranca en este ambiente). */
  onAddPlants: (ambient: Indoor) => void;
  onOpenDevices?: (focus: 'luz' | 'ambiente' | 'riego') => void;
  showToast?: (msg: string) => void;
  now?: number;
}

const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const dateText = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
};
const recordAt = (r: EnvironmentRecord) => Date.parse(r.createdAt) || Date.parse(`${r.date}T${r.time || '12:00'}`) || 0;

/**
 * Un ambiente: su luz (si es interior, la de todas sus plantas), el clima (sensor o a mano, con la franja
 * húmedo / óptimo / seco) y sus genéticas, cada una con su foto y cuánto le falta para cortar.
 */
export const AmbientDetailView: React.FC<AmbientDetailViewProps> = ({
  ambient,
  cultivations,
  envRecords = [],
  userId,
  geneticsList = [],
  onBack,
  onOpenGenetic,
  onEdit,
  onDeleted,
  onAddPlants,
  onOpenDevices,
  showToast,
  now,
}) => {
  const overview = useDevicesOverview();
  const photos = useGeneticsCatalogPhotos();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const exterior = isExteriorAmbient(ambient);
  const crops = cropsInIndoor(cultivations, ambient.id);
  const entries = useMemo(() => geneticEntries(crops, geneticsList, photos), [crops, geneticsList, photos]);
  const plants = crops.reduce((n, c) => n + (c.plantCount || 1), 0);
  const metrics = indoorMetrics(ambient);
  const size = indoorSizeText(ambient);
  const targets = targetsForStages(crops.map((c) => c.currentStage));
  const climate = climateBindingsFor(overview, ambient.id);

  // Clima: el sensor del ambiente si mide; si no, lo último anotado en cualquiera de sus plantas
  const sensor = sensorBindingFor(overview, ambient.id, 'sensor_th');
  const cropIds = new Set(crops.map((c) => c.id));
  const lastRecord = envRecords.filter((r) => cropIds.has(r.cultivationId) && Number.isFinite(r.temperatureC) && Number.isFinite(r.humidityPct)).sort((a, b) => recordAt(b) - recordAt(a))[0];
  let reading: AmbientReading | null = null;
  if (sensor?.online === false) reading = { temperatureC: 0, humidityPct: 0, at: sensor.readAt || 0, source: 'sensor', deviceName: sensor.deviceName, offline: true };
  else if (sensor?.sensors?.temperature != null && sensor.sensors.humidity != null) {
    reading = { temperatureC: sensor.sensors.temperature, humidityPct: sensor.sensors.humidity, at: sensor.readAt || Date.now(), source: 'sensor', deviceName: sensor.deviceName };
  } else if (lastRecord) reading = { temperatureC: lastRecord.temperatureC, humidityPct: lastRecord.humidityPct, at: recordAt(lastRecord), source: 'manual' };

  const remove = () => {
    if (crops.length) {
      setError(`${ambient.name} tiene plantas: pasalas a otro ambiente (desde cada genética) o terminá su cultivo antes de borrarlo.`);
      return;
    }
    if (!window.confirm(`¿Borrar ${ambient.name}?`)) return;
    setBusy(true);
    (async () => {
      // sus equipos (luz, clima, sensor) dejan de estar asignados: si no, seguirían manejando un ambiente que ya no está
      for (const b of overview.bindings.filter((x) => x.targetKind === 'indoor' && x.cultivationId === ambient.id)) await devicesService.unbind(b.id).catch(() => {});
      await indoorService.deleteIndoor(ambient, cultivations, userId);
      showToast?.('Ambiente borrado');
      onDeleted();
    })()
      .catch((e) => setError(e?.message || 'No se pudo borrar.'))
      .finally(() => setBusy(false));
  };

  return (
    <div id="ambient-detail" className="space-y-4 max-w-3xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-white hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Jardín
      </button>

      <section className="cultiveta-card overflow-hidden">
        <div className="relative aspect-[2/1] w-full bg-icon-bg" data-cover={exterior ? 'exterior' : 'interior'}>
          {!coverFailed && <img src={ambientCoverImage(ambient)} alt="" onError={() => setCoverFailed(true)} className="w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="absolute left-4 right-4 bottom-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white/85">
                {exterior ? 'Exterior' : 'Interior'} · {INDOOR_KINDS[ambient.kind] || 'Ambiente'}
                {size ? ` · ${size}` : ''}
              </p>
              <h1 className="text-2xl font-black text-white tracking-tight truncate">{ambient.name}</h1>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" id="ambient-edit" onClick={() => onEdit(ambient)} className="min-h-9 px-3 rounded-full bg-white/90 text-ink text-xs font-bold inline-flex items-center gap-1" aria-label="Editar ambiente">
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button type="button" id="ambient-delete" disabled={busy} onClick={remove} className="min-h-9 px-3 rounded-full bg-white/90 text-error text-xs font-bold inline-flex items-center gap-1" aria-label="Borrar ambiente">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center p-3">
          {[
            ['Plantas', String(plants)],
            ['Genéticas', String(entries.length)],
            exterior ? ['Luz', 'Natural'] : [metrics.wattsPerM2 ? 'W/m²' : 'Volumen', metrics.wattsPerM2 ? String(Math.round(metrics.wattsPerM2)) : metrics.volumeM3 ? `${metrics.volumeM3.toFixed(2).replace('.', ',')} m³` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-surface border border-line p-2.5">
              <b className="block text-lg font-black text-ink leading-tight">{v}</b>
              <small className="text-[10px] font-semibold text-ink-muted">{l}</small>
            </div>
          ))}
        </div>
        {error && <p className="text-xs font-bold text-error px-4 pb-3">{error}</p>}
      </section>

      {exterior ? (
        <section className={`${CARD} flex items-center gap-3`}>
          <Sun className="w-6 h-6 text-warn-line shrink-0" aria-hidden="true" />
          <p className="text-sm text-ink">Luz natural: el sol marca el día. En exterior no hay horario de luz que cargar.</p>
        </section>
      ) : (
        <LightCycleCard
          cultivation={ambient}
          sharedNote={plants ? `Es la luz de ${plants === 1 ? 'su planta' : `sus ${plants} plantas`}.` : null}
          onSaveSchedule={async (schedule: LightSchedule) => {
            await indoorService.updateIndoor(ambient.id, { lighting: { ...(ambient.lighting ?? { type: '' }), ...schedule } }, userId);
            showToast?.('Hora de encendido de la luz guardada.');
          }}
          onConnectPlug={onOpenDevices ? () => onOpenDevices('luz') : undefined}
          device={lightBindingFor(overview, ambient.id)}
          now={now}
        />
      )}

      <AmbientClimateCard
        reading={reading}
        targets={targets}
        now={now}
        manualBlockedReason={crops.length ? null : 'Sumá plantas al ambiente para anotar su clima.'}
        onSaveManual={async (r) => {
          await indoorService.addAmbientReading(ambient, crops, r, userId);
          showToast?.('Clima anotado para todo el ambiente.');
        }}
        onConnectSensor={onOpenDevices ? () => onOpenDevices('ambiente') : undefined}
      >
        {climate.map((b) => (
          <div key={b.id} className="ambient-climate-device rounded-2xl bg-surface border border-line p-3 space-y-1">
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
      </AmbientClimateCard>

      <section id="ambient-genetics" className="space-y-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Dna className="w-5 h-5" aria-hidden="true" />
            Genéticas{entries.length ? ` (${entries.length})` : ''}
          </h2>
          <button type="button" id="ambient-add-plants" onClick={() => onAddPlants(ambient)} className="cultiveta-btn-secondary text-xs">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Sumar plantas
          </button>
        </div>
        {entries.length === 0 && (
          <div className={`${CARD} text-sm text-ink-muted`}>Todavía no hay plantas en este ambiente. Sumá la primera con su genética.</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entries.map((e) => (
            <button
              key={`${e.crop.id}_${e.index}`}
              type="button"
              data-genetic-card={`${e.crop.id}_${e.index}`}
              onClick={() => onOpenGenetic(e)}
              className="cultiveta-card cultiveta-card-hover overflow-hidden text-left flex cursor-pointer"
              aria-label={`Abrir ${e.card.name}`}
            >
              <div className="w-28 shrink-0 bg-icon-bg relative">
                {e.card.photoUrl ? (
                  <img src={e.card.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-brand">
                    <Dna className="w-8 h-8 stroke-[1.5]" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="p-3 min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-1">
                  <h3 className="text-sm font-extrabold text-ink leading-tight">{e.card.name}</h3>
                  <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" aria-hidden="true" />
                </div>
                {e.card.seedBank && <p className="text-[11px] text-ink-muted truncate">{e.card.seedBank}</p>}
                <p className="text-[11px] font-semibold text-ink">
                  {e.plants} planta{e.plants === 1 ? '' : 's'} · {e.stage}
                </p>
                <p className="genetic-harvest text-[11px] font-black text-brand">
                  {harvestText(e.daysToHarvest)}
                  {e.daysToHarvest > 0 && e.harvestDate ? ` · ${dateText(e.harvestDate)}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AmbientDetailView;
