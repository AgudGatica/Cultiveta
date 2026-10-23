import React, { useMemo } from 'react';
import { AlertTriangle, Flame, Leaf, Medal, Plus, Sprout } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Genetics, PhotoRecord, UserProfile, Watering } from '../../types';
import type { GrowerProgress } from '../../utils/growerProgress';
import { isCropFinished, latestUploadedPhotoUrl } from '../../utils/cropCardInfo';
import { resolveCultivationDisplayPhoto } from '../../utils/cultivationPhotoResolver';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { EmptyState } from '../common/EmptyState';
import { TodayTasksCard } from './TodayTasksCard';
import { ActiveCropCard } from './ActiveCropCard';

interface DashboardOverviewProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos: PhotoRecord[];
  geneticsList?: Genetics[];
  userProfile?: UserProfile | null;
  userId?: string;
  /** Nivel y racha (sistema de logros). */
  progress?: GrowerProgress | null;
  isLoading?: boolean;
  isSyncing?: boolean;
  syncError?: string | null;
  onRefreshData?: () => void;
  onSelectCultivation: (cultivation: Cultivation) => void;
  onCreateCultivationClick: () => void;
  onOpenWateringModal: (cultivation?: Cultivation) => void;
  onTaskCompletedFeedback?: (message: string) => void;
}

/** Saludo según la hora local. */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 13) return 'Buen día';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Inicio: saludo, "Para hoy", cuatro números (cultivos, plantas, racha y nivel) y las tarjetas de
 * los cultivos activos. El detalle de cada cultivo (ambiente, riego, ciclo, gráficos) vive en su pantalla.
 */
export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cultivations,
  waterings,
  envRecords,
  photos,
  geneticsList = [],
  userProfile,
  userId,
  progress,
  isLoading = false,
  isSyncing = false,
  syncError = null,
  onRefreshData,
  onSelectCultivation,
  onCreateCultivationClick,
  onOpenWateringModal,
  onTaskCompletedFeedback,
}) => {
  const catalogPhotos = useGeneticsCatalogPhotos();
  const activeCrops = useMemo(() => cultivations.filter((c) => !isCropFinished(c)), [cultivations]);
  const totalPlants = activeCrops.reduce((acc, c) => acc + (c.plantCount || 1), 0);
  const firstName = (userProfile?.displayName || 'Cultivador').split(' ')[0] || 'Cultivador';

  const cropPhotos = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const crop of activeCrops) {
      map[crop.id] =
        latestUploadedPhotoUrl(photos, crop.id) || resolveCultivationDisplayPhoto(crop, catalogPhotos).displayPhotoUrl || null;
    }
    return map;
  }, [activeCrops, photos, catalogPhotos]);

  const numbers = [
    { id: 'home-stat-crops', label: activeCrops.length === 1 ? 'cultivo' : 'cultivos', value: activeCrops.length, icon: Sprout },
    { id: 'home-stat-plants', label: totalPlants === 1 ? 'planta' : 'plantas', value: totalPlants, icon: Leaf },
    { id: 'home-stat-streak', label: 'días de racha', value: progress?.stats.streak ?? 0, icon: Flame },
    { id: 'home-stat-level', label: 'nivel', value: progress?.level.level ?? 1, icon: Medal },
  ];

  const isInitialLoading = Boolean(isLoading && cultivations.length === 0 && waterings.length === 0 && envRecords.length === 0);

  return (
    <div id="dashboard-overview" className="space-y-4 sm:space-y-5 dashboard-overview">
      {/* 1. Saludo */}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight pt-1">
        {getGreeting()}, {firstName}
      </h1>

      {syncError && (
        <div role="alert" className="p-3.5 rounded-2xl bg-white border border-coral/40 text-ink text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-error shrink-0" aria-hidden="true" />
            <span>{syncError}</span>
          </div>
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isSyncing}
              className="min-h-11 px-3 rounded-xl bg-coral hover:brightness-95 text-white font-bold cursor-pointer text-xs shrink-0 disabled:opacity-50"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {isInitialLoading ? (
        <div role="status" aria-label="Cargando tus cultivos" className="space-y-4">
          <div className="cultiveta-card h-24 animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cultiveta-card h-20 animate-pulse" />
            ))}
          </div>
          <div className="cultiveta-card h-56 animate-pulse" />
        </div>
      ) : (
        <>
          {/* 2. Para hoy */}
          <TodayTasksCard
            cultivations={cultivations}
            waterings={waterings}
            envRecords={envRecords}
            userId={userId}
            onSelectCultivation={onSelectCultivation}
            onOpenWateringModal={onOpenWateringModal}
            onTaskCompletedFeedback={onTaskCompletedFeedback}
          />

          {/* 3. Cuatro números */}
          <section aria-label="Resumen" className="grid grid-cols-4 gap-2 sm:gap-3">
            {numbers.map(({ id, label, value, icon: Icon }) => (
              <div key={id} id={id} className="cultiveta-card p-3 sm:p-4 flex flex-col items-center text-center gap-1">
                <Icon className="w-4 h-4 text-brand" aria-hidden="true" />
                <b className="text-xl sm:text-2xl font-black text-ink leading-none">{value}</b>
                <small className="text-[10px] sm:text-xs font-semibold text-ink-muted leading-tight">{label}</small>
              </div>
            ))}
          </section>

          {/* 4. Cultivos activos */}
          {activeCrops.length === 0 ? (
            <EmptyState
              id="home-empty-crops"
              icon={Sprout}
              title="Todavía no tenés cultivos activos"
              description="Sumá tu primer cultivo para empezar a anotar riegos, ambiente y fotos."
              actionLabel="Creá tu primer cultivo"
              actionIcon={Plus}
              onAction={onCreateCultivationClick}
            />
          ) : (
            <section aria-labelledby="home-crops-title" className="space-y-3">
              <h2 id="home-crops-title" className="text-lg font-extrabold text-white flex items-center gap-2 px-1">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-logo-dot" />
                Cultivos activos ({activeCrops.length})
              </h2>
              <div id="home-crop-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeCrops.map((crop) => (
                  <ActiveCropCard
                    key={crop.id}
                    cultivation={crop}
                    photoUrl={cropPhotos[crop.id]}
                    geneticsList={geneticsList}
                    onOpen={onSelectCultivation}
                  />
                ))}
              </div>
              <button
                type="button"
                id="home-add-crop-btn"
                onClick={onCreateCultivationClick}
                className="cultiveta-btn-secondary w-full text-sm"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                Sumar cultivo
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
};
