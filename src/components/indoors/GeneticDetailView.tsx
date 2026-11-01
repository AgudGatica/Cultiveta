import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock, Dna, Droplets, Flag, Home, Leaf, Scale, Scissors, Sparkles, Sprout, Sun } from 'lucide-react';
import type { Cultivation, DiaryEntry, EnvironmentRecord, Genetics, Indoor, PhotoRecord, Watering } from '../../types';
import { indoorService } from '../../services/indoorService';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { resolveCropGenetics } from '../../utils/cropGenetics';
import { buildCultivationStageSchedule, getNextStage, getStagesForCultivation, type StageScheduleItem } from '../../utils/growthStageUtils';
import { ambientsForCrop, cropForGenetic, harvestText, isExteriorAmbient } from '../../utils/indoors';
import { IrrigationForecastCard } from '../cultivations/IrrigationForecastCard';
import { PlantTimeline } from '../cultivations/PlantTimeline';
import { StageTransitionModal } from '../cultivations/timeline/StageTransitionModal';
import { PhotoImageView } from '../common/PhotoImageView';

interface GeneticDetailViewProps {
  /** Ambiente donde está (para volver y para moverla). */
  ambient: Indoor | null;
  ambients: Indoor[];
  crop: Cultivation;
  /** Posición de la genética en su cultivo. */
  index: number;
  waterings?: Watering[];
  envRecords?: EnvironmentRecord[];
  photos?: PhotoRecord[];
  diaryEntries?: DiaryEntry[];
  geneticsList?: Genetics[];
  userId: string;
  onBack: () => void;
  /** El cultivo completo: fotos, nutrición, tabla y diario. */
  onOpenCrop: (crop: Cultivation) => void;
  /** Anotar un riego. */
  onWater: (crop: Cultivation) => void;
  /** Después de cambiar de etapa. */
  onCropUpdated?: (crop: Cultivation) => void;
  onMoved?: (to: Indoor) => void;
  showToast?: (msg: string) => void;
}

type Tab = 'resumen' | 'etapas' | 'timeline';
const TABS: Record<Tab, string> = { resumen: 'Resumen', etapas: 'Etapas', timeline: 'Timeline' };

const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const dateText = (d?: string, month: 'long' | 'short' = 'long') => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month }) : '';
};
const num = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

/** Qué dice cada etapa en la pestaña Etapas: sus fechas y cuánto duró (o cuánto se espera). */
function stageLine(s: StageScheduleItem, activeDay: number): { when: string; pill: string } {
  const days = s.actualDurationDays ?? s.expectedDurationDays;
  if (s.status === 'completed') {
    return { when: s.startDate && s.endDate ? `${dateText(s.startDate, 'short')} – ${dateText(s.endDate, 'short')}` : 'Sin fechas anotadas', pill: days ? `${days} d` : '' };
  }
  if (s.status === 'active') return { when: s.startDate ? `Desde el ${dateText(s.startDate, 'short')} · actual` : 'Actual', pill: `día ${Math.max(1, activeDay)}` };
  return { when: s.startDate ? `Estimada: ${dateText(s.startDate, 'short')}` : 'Más adelante', pill: s.expectedDurationDays ? `${s.expectedDurationDays} d` : '' };
}

/**
 * Una genética dentro de su ambiente, como una planta en Canopia: su foto grande arriba, en qué etapa
 * está y tres pestañas. Resumen (para cortar, números, riegos y su ficha), Etapas (por las que pasó y
 * las que vienen) y Timeline (la planta que crece desde la maceta hasta el cogollo, con las fotos).
 * Los riegos, las fotos y las etapas son del cultivo: si tiene más de una genética, los comparten.
 */
export const GeneticDetailView: React.FC<GeneticDetailViewProps> = ({
  ambient,
  ambients,
  crop,
  index,
  waterings = [],
  envRecords = [],
  photos = [],
  diaryEntries = [],
  geneticsList = [],
  userId,
  onBack,
  onOpenCrop,
  onWater,
  onCropUpdated,
  onMoved,
  showToast,
}) => {
  const catalogPhotos = useGeneticsCatalogPhotos();
  const cards = useMemo(() => resolveCropGenetics(crop, geneticsList, catalogPhotos), [crop, geneticsList, catalogPhotos]);
  const card = cards[index] || cards[0];
  const one = useMemo(() => cropForGenetic(crop, index), [crop, index]);
  const schedule = useMemo(() => buildCultivationStageSchedule(one, geneticsList), [one, geneticsList]);
  const plants = Math.max(1, card?.plantCount || one.plantCount || 1);
  const others = cards.filter((_, i) => i !== index).map((c) => c.name);
  const cropWaterings = useMemo(
    () => waterings.filter((w) => w.cultivationId === crop.id).sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`)),
    [waterings, crop.id]
  );
  const cropPhotos = useMemo(() => photos.filter((p) => p.cultivationId === crop.id), [photos, crop.id]);
  const cropDiary = useMemo(() => diaryEntries.filter((d) => d.cultivationId === crop.id), [diaryEntries, crop.id]);
  const latestPhoto = useMemo(() => [...cropPhotos].sort((a, b) => b.date.localeCompare(a.date))[0], [cropPhotos]);
  const moveTargets = ambientsForCrop(crop, ambients).filter((a) => a.id !== crop.indoorId);
  const [tab, setTab] = useState<Tab>('resumen');
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [stageModal, setStageModal] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const stages = useMemo(() => getStagesForCultivation(crop), [crop]);
  const nextStage = useMemo(() => getNextStage(crop, stages), [crop, stages]);
  const progress = schedule.overallProgressPct ?? schedule.roadmapProgressPct;
  const stageName = crop.currentStage || schedule.activeStage?.name || 'Sin etapa';
  const day = schedule.isCycleStartKnown && typeof schedule.totalElapsedDays === 'number' && schedule.totalElapsedDays > 0 ? schedule.totalElapsedDays : null;
  const liters = cropWaterings.reduce((a, w) => a + (Number(w.volumeLiters) || 0), 0);
  const phs = cropWaterings.map((w) => Number(w.phIn)).filter((v) => Number.isFinite(v) && v > 0);
  const exterior = ambient ? isExteriorAmbient(ambient) : crop.type !== 'Indoor';

  const move = async () => {
    const to = moveTargets.find((a) => a.id === (moveTo || moveTargets[0]?.id));
    if (!to) return;
    const what = others.length ? `${crop.name} (con ${others.join(', ')})` : card?.name || crop.name;
    if (!window.confirm(`¿Pasar ${what} a ${to.name}?`)) return;
    setBusy(true);
    try {
      await indoorService.moveCrop(crop, to, userId);
      showToast?.(`Ahora está en ${to.name}`);
      onMoved?.(to);
    } finally {
      setBusy(false);
    }
  };

  if (!card) return null;
  const heroPhoto = card.photoUrl && !heroFailed ? card.photoUrl : null;

  return (
    <div id="genetic-detail" className="space-y-4 max-w-3xl mx-auto">
      {/* Foto principal de la genética, con su nombre, en qué etapa está y en qué ambiente */}
      <section id="genetic-hero" className="relative overflow-hidden rounded-[28px] bg-brand-deep aspect-[4/5] sm:aspect-[16/10] shadow-sm">
        {heroPhoto ? (
          <img src={heroPhoto} alt={`${card.name}${card.seedBank ? ` - ${card.seedBank}` : ''}`} referrerPolicy="no-referrer" onError={() => setHeroFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : latestPhoto ? (
          <PhotoImageView photo={latestPhoto} userId={userId} alt={`Foto de ${card.name}`} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/25">
            <Dna className="w-24 h-24 stroke-[1.2]" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-3 min-h-10 px-3 rounded-full bg-black/35 backdrop-blur-sm text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-black/50"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {ambient ? ambient.name : 'Jardín'}
        </button>
        <div className="absolute left-4 right-4 bottom-4 space-y-2 text-white">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">{card.name}</h1>
          <p className="text-sm text-white/85">
            {[card.seedBank, card.dominance, card.photoperiodType].filter(Boolean).join(' · ') || 'Genética'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span id="genetic-stage-chip" className="inline-flex items-center gap-1 rounded-full bg-primary text-ink px-2.5 py-1 text-xs font-black">
              <Sprout className="w-3.5 h-3.5" aria-hidden="true" />
              {stageName}
              {schedule.activeStageElapsedDays > 0 ? ` · día ${schedule.activeStageElapsedDays}` : ''}
            </span>
            {day && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-bold">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Día {day} · Semana {Math.floor((day - 1) / 7) + 1}
              </span>
            )}
            {ambient && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-bold">
                {exterior ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Home className="w-3.5 h-3.5" aria-hidden="true" />}
                {ambient.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-bold">
              <Leaf className="w-3.5 h-3.5" aria-hidden="true" />
              {plants === 1 ? '1 planta' : `${plants} plantas`}
            </span>
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        <button type="button" id="genetic-water" onClick={() => onWater(crop)} className="cultiveta-btn-primary text-sm flex-1 justify-center">
          <Droplets className="w-4 h-4" aria-hidden="true" />
          Anotar riego
        </button>
        {nextStage && (
          <button type="button" id="genetic-change-stage" onClick={() => setStageModal(true)} className="cultiveta-btn-secondary text-sm">
            <Flag className="w-4 h-4" aria-hidden="true" />
            Cambiar etapa
          </button>
        )}
      </div>

      <div role="tablist" aria-label="Secciones" className="grid grid-cols-3 p-1 rounded-2xl bg-white/15 gap-1">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`genetic-tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`genetic-panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-xl text-sm font-extrabold transition-colors ${tab === t ? 'bg-white text-ink shadow-xs' : 'text-white hover:bg-white/10'}`}
          >
            {TABS[t]}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div id="genetic-panel-resumen" role="tabpanel" aria-labelledby="genetic-tab-resumen" className="space-y-4">
          <section id="genetic-harvest" className={`${CARD} space-y-3`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-brand" aria-hidden="true" />
              Para cortar
            </span>
            <p className="text-2xl font-black text-ink">{harvestText(schedule.daysUntilHarvest)}</p>
            {schedule.estimatedHarvestDate && schedule.daysUntilHarvest > 0 && (
              <p className="text-xs text-ink-muted flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                Cosecha estimada: {dateText(schedule.estimatedHarvestDate)}
              </p>
            )}
            <div className="h-2.5 rounded-full bg-surface border border-line overflow-hidden" aria-label={`Avance del ciclo: ${Math.round(progress)} %`}>
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
          </section>

          <section id="genetic-stats" aria-label="Números" className="grid grid-cols-3 gap-2">
            {[
              // sin el día de arranque del cultivo, los de la etapa actual
              ...(day
                ? [
                    ['Día', String(day)],
                    ['Semana', String(Math.floor((day - 1) / 7) + 1)],
                  ]
                : [
                    [`Día de ${stageName.toLowerCase()}`, String(Math.max(1, schedule.activeStageElapsedDays))],
                    [`Semana de ${stageName.toLowerCase()}`, String(Math.floor((Math.max(1, schedule.activeStageElapsedDays) - 1) / 7) + 1)],
                  ]),
              ['Riegos', String(cropWaterings.length)],
              ['Litros', num(liters)],
              ['Fotos', String(cropPhotos.length)],
              ['pH prom.', phs.length ? num(phs.reduce((a, v) => a + v, 0) / phs.length) : '—'],
            ].map(([l, v]) => (
              <div key={l} className="cultiveta-card p-3 text-center">
                <small className="block text-[10px] font-semibold text-ink-muted">{l}</small>
                <b className="block text-xl font-black text-ink leading-tight">{v}</b>
              </div>
            ))}
          </section>

          <section id="genetic-waterings" className={`${CARD} space-y-3`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-brand" aria-hidden="true" />
              Últimos riegos
            </span>
            {cropWaterings.length === 0 ? (
              <p className="text-xs text-ink-muted">Todavía no hay riegos anotados.</p>
            ) : (
              <ul className="divide-y divide-line">
                {cropWaterings.slice(0, 5).map((w) => (
                  <li key={w.id} className="genetic-watering py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">
                      {dateText(w.date)}
                      {w.time ? ` · ${w.time}` : ''}
                    </span>
                    <span className="text-ink-muted">
                      {String(w.volumeLiters).replace('.', ',')} L{w.phIn ? ` · pH ${w.phIn}` : ''}
                      {w.ecIn ? ` · EC ${w.ecIn}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {others.length > 0 && (
              <p className="text-[11px] text-ink-subtle">Comparte cultivo con {others.join(', ')}: los riegos y las etapas son los mismos.</p>
            )}
          </section>

          <IrrigationForecastCard cultivation={crop} waterings={waterings} envRecords={envRecords} />

          <section id="genetic-showcase" className={`${CARD} space-y-3`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Dna className="w-4 h-4 text-brand" aria-hidden="true" />
              Ficha de {card.name}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface border border-line p-3">
                <small className="text-[10px] font-semibold text-ink-muted flex items-center gap-1">
                  <Scale className="w-3 h-3" aria-hidden="true" />
                  Rendimiento
                </small>
                <b className="block text-sm font-black text-ink">{card.estimatedYield ? `${card.estimatedYield} g/m²` : '—'}</b>
              </div>
              <div className="rounded-2xl bg-surface border border-line p-3">
                <small className="text-[10px] font-semibold text-ink-muted flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  Floración
                </small>
                <b className="block text-sm font-black text-ink">{card.floweringDays ? `${card.floweringDays} días` : '—'}</b>
              </div>
            </div>
            {card.organolepticProfile && (
              <p className="text-xs text-ink flex gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <b>Aroma y gusto:</b> {card.organolepticProfile}
                </span>
              </p>
            )}
          </section>

          <section className={`${CARD} space-y-3`}>
            <button type="button" id="genetic-open-crop" onClick={() => onOpenCrop(crop)} className="cultiveta-btn-secondary text-sm w-full justify-center">
              Ver todo el cultivo: fotos, nutrición, tabla y diario
            </button>
            {moveTargets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink-muted w-full">Pasar a otro ambiente</span>
                <select id="genetic-move-select" aria-label="Ambiente" value={moveTo || moveTargets[0].id} onChange={(e) => setMoveTo(e.target.value)} className="min-h-10 px-3 rounded-xl bg-white border border-line text-sm text-ink flex-1 min-w-0">
                  {moveTargets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="button" id="genetic-move" disabled={busy} onClick={move} className="cultiveta-btn-secondary text-xs disabled:opacity-50">
                  Pasar
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'etapas' && (
        <div id="genetic-panel-etapas" role="tabpanel" aria-labelledby="genetic-tab-etapas" className="space-y-4">
          <section id="genetic-stages" className={`${CARD}`}>
            <ol className="relative">
              {schedule.stages.map((s, i) => {
                const { when, pill } = stageLine(s, schedule.activeStageElapsedDays);
                const last = i === schedule.stages.length - 1;
                return (
                  <li key={s.id} data-stage-status={s.status} className="genetic-stage relative flex gap-3 pb-4 last:pb-0">
                    {!last && <span className={`absolute left-[9px] top-5 bottom-0 w-0.5 ${s.status === 'completed' ? 'bg-ok' : 'bg-line'}`} aria-hidden="true" />}
                    <span
                      className={`relative z-10 mt-0.5 w-5 h-5 rounded-full shrink-0 border-[3px] ${
                        s.status === 'completed' ? 'bg-ok border-ok' : s.status === 'active' ? 'bg-primary border-brand-deep' : 'bg-white border-line border-dashed'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <b className={`block text-sm ${s.status === 'upcoming' ? 'text-ink-muted font-bold' : 'text-ink font-extrabold'}`}>{s.name}</b>
                      <small className="text-xs text-ink-muted">{when}</small>
                    </div>
                    {pill && (
                      <span className={`self-start shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black ${s.status === 'active' ? 'bg-brand-deep text-white' : 'bg-track text-ink-muted'}`}>
                        {pill}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
          {nextStage && (
            <button type="button" onClick={() => setStageModal(true)} className="cultiveta-btn-primary text-sm w-full justify-center">
              <Flag className="w-4 h-4" aria-hidden="true" />
              Pasar a {nextStage.name}
            </button>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div id="genetic-panel-timeline" role="tabpanel" aria-labelledby="genetic-tab-timeline" className="space-y-4">
          {/* La planta crece desde la maceta: lo más reciente arriba, con el cogollo cuando florece */}
          <PlantTimeline cultivation={one} waterings={cropWaterings} diaryEntries={cropDiary} photos={cropPhotos} geneticsList={geneticsList} userId={userId} />
        </div>
      )}

      {stageModal && (
        <StageTransitionModal
          isOpen={stageModal}
          onClose={() => setStageModal(false)}
          cultivation={crop}
          initialSelectedStage={nextStage}
          stages={stages}
          userId={userId}
          onStageChanged={(updated) => onCropUpdated?.(updated)}
        />
      )}
    </div>
  );
};

export default GeneticDetailView;
