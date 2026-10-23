import React, { useMemo, useState } from 'react';
import { Award, CalendarDays, FileText, Pencil, Scale, Sprout, Star, Timer } from 'lucide-react';
import type { Cultivation, Harvest, PhotoRecord } from '../../types';
import {
  latestUploadedPhotoUrl,
  listFinishedCrops,
  getGeneticsLabel,
  type FinishedCropSummary,
} from '../../utils/cropCardInfo';
import { resolveCultivationDisplayPhoto } from '../../utils/cultivationPhotoResolver';
import { formatFriendlyDate } from '../../utils/growthStageUtils';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { EmptyState } from '../common/EmptyState';
import { HarvestReportView } from './HarvestReportView';
import { EditHarvestModal } from '../harvests/EditHarvestModal';

interface FinishedCropsViewProps {
  cultivations: Cultivation[];
  harvests: Harvest[];
  photos: PhotoRecord[];
  userId?: string;
  onOpenCultivation: (cultivation: Cultivation) => void;
  onNavigateToCompare?: (cropAId?: string) => void;
  onHarvestUpdated?: (updated: Harvest) => void;
}

/** Cultivo mínimo para mostrar la ficha de una cosecha cuyo cultivo ya no existe. */
function cultivationFromHarvest(h: Harvest): Cultivation {
  return {
    id: h.cultivationId,
    userId: h.userId,
    name: h.cultivationName,
    startDate: h.startDate,
    currentStage: 'Finalizado',
    stageStartDate: h.harvestDate,
    type: 'Indoor',
    plantCount: h.plantCount,
    geneticsName: h.geneticsName,
    seedBank: h.seedBank,
    substrate: { type: '', potVolumeLiters: 0, potType: 'Otro' },
    status: 'ESTABLE',
    isFinished: true,
    createdAt: h.createdAt,
    updatedAt: h.createdAt,
  };
}

const fmt = (date: string | null) => (date ? formatFriendlyDate(date) : 'Sin fecha');

/**
 * Cultivos: historial de cultivos terminados unido con Cosechas. Arriba, los totales de las cosechas;
 * abajo, cada cultivo con foto, genética, fechas, días, peso y puntaje. Tocar abre el detalle; la ficha
 * de cosecha se abre desde su botón.
 */
export const FinishedCropsView: React.FC<FinishedCropsViewProps> = ({
  cultivations,
  harvests,
  photos,
  userId,
  onOpenCultivation,
  onNavigateToCompare,
  onHarvestUpdated,
}) => {
  const catalogPhotos = useGeneticsCatalogPhotos();
  const [report, setReport] = useState<{ harvest: Harvest; cultivation: Cultivation } | null>(null);
  const [harvestToEdit, setHarvestToEdit] = useState<Harvest | null>(null);

  const items = useMemo(() => {
    const finished = listFinishedCrops(cultivations, harvests);
    const known = new Set(cultivations.map((c) => c.id));
    // Cosechas cuyo cultivo se borró: siguen apareciendo (solo con su ficha).
    const orphans: FinishedCropSummary[] = harvests
      .filter((h) => !known.has(h.cultivationId))
      .map((h) => ({
        crop: cultivationFromHarvest(h),
        harvest: h,
        startDate: h.startDate || null,
        endDate: h.harvestDate || null,
        totalDays: h.totalDays || null,
        dryWeightGrams: h.finalDryWeightGrams || null,
        rating: h.rating1To5 || null,
      }));
    return [...finished, ...orphans].sort((a, b) =>
      (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')
    );
  }, [cultivations, harvests]);

  const knownIds = useMemo(() => new Set(cultivations.map((c) => c.id)), [cultivations]);

  // Totales de las cosechas registradas
  const totalDryGrams = harvests.reduce((acc, h) => acc + (h.finalDryWeightGrams || 0), 0);
  const totalPlants = harvests.reduce((acc, h) => acc + (h.plantCount || 1), 0);
  const avgGramsPerPlant = totalPlants > 0 ? totalDryGrams / totalPlants : 0;
  const avgDays = harvests.length > 0 ? Math.round(harvests.reduce((acc, h) => acc + (h.totalDays || 0), 0) / harvests.length) : 0;

  const handleHarvestUpdated = (updated: Harvest) => {
    if (report && report.harvest.id === updated.id) setReport({ ...report, harvest: updated });
    onHarvestUpdated?.(updated);
  };

  const editModal = (
    <EditHarvestModal
      isOpen={harvestToEdit !== null}
      harvest={harvestToEdit}
      userId={userId}
      onClose={() => setHarvestToEdit(null)}
      onHarvestUpdated={handleHarvestUpdated}
    />
  );

  if (report) {
    return (
      <>
        <HarvestReportView
          harvest={report.harvest}
          cultivation={report.cultivation}
          onBack={() => setReport(null)}
          onEditHarvest={(h) => setHarvestToEdit(h)}
        />
        {editModal}
      </>
    );
  }

  const totals = [
    { label: 'Total cosechado', value: `${Math.round(totalDryGrams * 10) / 10} g` },
    { label: 'Promedio por planta', value: `${Math.round(avgGramsPerPlant * 10) / 10} g` },
    { label: 'Duración promedio', value: `${avgDays} días` },
    { label: 'Cultivos terminados', value: String(items.length) },
  ];

  return (
    <div id="finished-crops-view" className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Cultivos</h1>
          <p className="text-xs sm:text-sm text-white/85 font-medium">Tus cultivos terminados y sus cosechas</p>
        </div>
        {onNavigateToCompare && items.length > 1 && (
          <button
            type="button"
            id="finished-compare-btn"
            onClick={() => onNavigateToCompare()}
            className="cultiveta-btn-secondary text-xs shrink-0"
          >
            <Scale className="w-4 h-4 text-brand" aria-hidden="true" />
            Comparar
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          id="finished-empty"
          icon={Award}
          title="Todavía no terminaste ningún cultivo"
          description="Cuando finalices un cultivo desde su detalle, va a aparecer acá con su cosecha, sus fechas y su peso."
        />
      ) : (
        <>
          <section aria-label="Totales de cosecha" className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {totals.map((t) => (
              <div key={t.label} className="cultiveta-card p-3.5 sm:p-4 text-center">
                <b className="block text-lg sm:text-2xl font-black text-ink leading-tight">{t.value}</b>
                <small className="text-[11px] sm:text-xs font-semibold text-ink-muted">{t.label}</small>
              </div>
            ))}
          </section>

          <div id="finished-crop-list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => {
              const { crop, harvest } = item;
              const exists = knownIds.has(crop.id);
              const photoUrl =
                latestUploadedPhotoUrl(photos, crop.id) ||
                (harvest?.photoUrls?.[0] ?? null) ||
                resolveCultivationDisplayPhoto(crop, catalogPhotos).displayPhotoUrl ||
                null;
              const genetics = getGeneticsLabel(crop);
              const openMain = () => {
                if (exists) onOpenCultivation(crop);
                else if (harvest) setReport({ harvest, cultivation: crop });
              };
              return (
                <article
                  key={`${crop.id}_${harvest?.id || 'sin-cosecha'}`}
                  data-finished-crop={crop.id}
                  className="cultiveta-card overflow-hidden flex flex-col"
                >
                  <button
                    type="button"
                    onClick={openMain}
                    aria-label={exists ? `Abrir ${crop.name}` : `Ver ficha de cosecha de ${crop.name}`}
                    className="text-left flex gap-3 p-3.5 cursor-pointer hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                  >
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-icon-bg text-brand shrink-0 flex items-center justify-center">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <Sprout className="w-8 h-8 stroke-[1.5]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-base font-extrabold text-ink truncate">{crop.name}</h2>
                        {item.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-accent shrink-0" aria-label={`${item.rating} de 5`}>
                            {Array.from({ length: item.rating }).map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 fill-accent" aria-hidden="true" />
                            ))}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-ink-muted truncate">{genetics || 'Genética sin cargar'}</p>
                      <p className="text-xs text-ink flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {fmt(item.startDate)} → {fmt(item.endDate)}
                        </span>
                      </p>
                      <div className="flex items-center gap-3 text-xs font-bold text-ink">
                        <span className="inline-flex items-center gap-1">
                          <Timer className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                          {item.totalDays ? `${item.totalDays} días` : 'Días sin calcular'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                          {item.dryWeightGrams ? `${item.dryWeightGrams} g` : 'Sin peso'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {harvest && (
                    <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
                      <button
                        type="button"
                        onClick={() => setReport({ harvest, cultivation: crop })}
                        className="cultiveta-btn-secondary text-xs"
                      >
                        <FileText className="w-4 h-4 text-brand" aria-hidden="true" />
                        Ver ficha
                      </button>
                      <button type="button" onClick={() => setHarvestToEdit(harvest)} className="cultiveta-btn-secondary text-xs">
                        <Pencil className="w-4 h-4 text-brand" aria-hidden="true" />
                        Editar cosecha
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
      {editModal}
    </div>
  );
};
