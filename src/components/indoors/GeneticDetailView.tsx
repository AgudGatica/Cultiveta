import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, Droplets, Leaf, Scissors, Sprout } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Genetics, Indoor, Watering } from '../../types';
import { indoorService } from '../../services/indoorService';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { resolveCropGenetics } from '../../utils/cropGenetics';
import { buildCultivationStageSchedule } from '../../utils/growthStageUtils';
import { getCropDayLabel } from '../../utils/cropCardInfo';
import { ambientsForCrop, cropForGenetic, harvestText } from '../../utils/indoors';
import { GeneticsShowcaseCard } from '../genetics/GeneticsShowcaseCard';
import { IrrigationForecastCard } from '../cultivations/IrrigationForecastCard';

interface GeneticDetailViewProps {
  /** Ambiente donde está (para volver y para moverla). */
  ambient: Indoor | null;
  ambients: Indoor[];
  crop: Cultivation;
  /** Posición de la genética en su cultivo. */
  index: number;
  waterings?: Watering[];
  envRecords?: EnvironmentRecord[];
  geneticsList?: Genetics[];
  userId: string;
  onBack: () => void;
  /** El cultivo completo: línea de tiempo, fotos, nutrición y etapas. */
  onOpenCrop: (crop: Cultivation) => void;
  /** Anotar un riego. */
  onWater: (crop: Cultivation) => void;
  onMoved?: (to: Indoor) => void;
  showToast?: (msg: string) => void;
}

const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const dateText = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '';
};

/**
 * Una genética dentro de su ambiente: su foto y ficha, cuánto le falta para cortar, cómo viene y sus
 * riegos. Los riegos y las etapas son del cultivo (si el cultivo tiene más de una genética, los comparten).
 */
export const GeneticDetailView: React.FC<GeneticDetailViewProps> = ({
  ambient,
  ambients,
  crop,
  index,
  waterings = [],
  envRecords = [],
  geneticsList = [],
  userId,
  onBack,
  onOpenCrop,
  onWater,
  onMoved,
  showToast,
}) => {
  const photos = useGeneticsCatalogPhotos();
  const cards = useMemo(() => resolveCropGenetics(crop, geneticsList, photos), [crop, geneticsList, photos]);
  const card = cards[index] || cards[0];
  const one = useMemo(() => cropForGenetic(crop, index), [crop, index]);
  const schedule = useMemo(() => buildCultivationStageSchedule(one, geneticsList), [one, geneticsList]);
  const plants = Math.max(1, card?.plantCount || one.plantCount || 1);
  const others = cards.filter((_, i) => i !== index).map((c) => c.name);
  const cropWaterings = waterings.filter((w) => w.cultivationId === crop.id).sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const moveTargets = ambientsForCrop(crop, ambients).filter((a) => a.id !== crop.indoorId);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const progress = schedule.overallProgressPct ?? schedule.roadmapProgressPct;

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
  return (
    <div id="genetic-detail" className="space-y-4 max-w-3xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-white hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {ambient ? ambient.name : 'Jardín'}
      </button>

      <GeneticsShowcaseCard
        id="genetic-showcase"
        name={card.name}
        seedBank={card.seedBank}
        dominance={card.dominance}
        photoUrl={card.photoUrl}
        estimatedYield={card.estimatedYield}
        floweringDays={card.floweringDays}
        organolepticProfile={card.organolepticProfile}
      >
        <div className="flex items-center justify-center gap-2 rounded-full bg-ok-bg border border-ok-line min-h-[52px] px-4 text-ok-ink font-bold text-xs sm:text-sm">
          <Leaf className="w-4 h-4 shrink-0" aria-hidden="true" />
          {plants === 1 ? '1 planta' : `${plants} plantas`}
          {card.photoperiodType ? ` · ${card.photoperiodType}` : ''}
        </div>
      </GeneticsShowcaseCard>

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
        <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
          {crop.currentStage || schedule.activeStage?.name} · {getCropDayLabel(one, geneticsList)}
        </p>
      </section>

      <section id="genetic-waterings" className={`${CARD} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
            <Droplets className="w-4 h-4 text-brand" aria-hidden="true" />
            Riegos
          </span>
          <button type="button" id="genetic-water" onClick={() => onWater(crop)} className="cultiveta-btn-primary text-xs">
            <Droplets className="w-3.5 h-3.5" aria-hidden="true" />
            Anotar riego
          </button>
        </div>
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

      <section className={`${CARD} space-y-3`}>
        <button type="button" id="genetic-open-crop" onClick={() => onOpenCrop(crop)} className="cultiveta-btn-secondary text-sm w-full justify-center">
          Ver todo: línea de tiempo, fotos, nutrición y etapas
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
  );
};

export default GeneticDetailView;
