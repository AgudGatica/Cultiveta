import React, { useMemo, useState } from 'react';
import { AlertTriangle, Flame, Home, Leaf, Medal, Plus } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Genetics, Indoor, PhotoRecord, UserProfile, Watering } from '../../types';
import type { GrowerProgress } from '../../utils/growerProgress';
import { isCropFinished } from '../../utils/cropCardInfo';
import { EmptyState } from '../common/EmptyState';
import { TodayTasksCard } from './TodayTasksCard';
import { PushPromptCard } from './PushPromptCard';
import { ActiveCropCard } from './ActiveCropCard';
import { AmbientCard } from '../indoors/AmbientCard';
import { GeneticCard } from '../indoors/GeneticCard';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { cropsInIndoor, cropsWithoutAmbient, geneticEntries, isExteriorAmbient, type GeneticEntry } from '../../utils/indoors';

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
  /** Ambientes (carpas, salas o lugares de exterior) que agrupan las plantas. */
  indoors?: Indoor[];
  onOpenIndoor?: (indoor: Indoor) => void;
  /** Nuevo ambiente. */
  onCreateIndoorClick?: () => void;
  /** Pestaña Plantas: abrir una genética dentro de su ambiente. */
  onOpenGenetic?: (entry: GeneticEntry) => void;
}

type GardenTab = 'ambientes' | 'plantas';
// la pestaña elegida se mantiene al entrar a un ambiente o a una planta y volver
let lastGardenTab: GardenTab = 'ambientes';

/** Saludo según la hora local. */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 13) return 'Buen día';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Jardín (la pantalla de inicio): saludo, "Para hoy", cuatro números (ambientes, plantas, racha y nivel)
 * y dos pestañas, como en Canopia: Ambientes (cada uno con su portada) y Plantas (cada genética, con su
 * ambiente). Un cultivo sin ambiente (mientras se le arma uno) se ve abajo, en "Sin ambiente". El detalle de cada cultivo (ambiente, riego, ciclo, gráficos) vive en su pantalla.
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
  indoors = [],
  onOpenIndoor,
  onCreateIndoorClick,
  onOpenGenetic,
}) => {
  const activeCrops = useMemo(() => cultivations.filter((c) => !isCropFinished(c)), [cultivations]);
  const loose = useMemo(() => cropsWithoutAmbient(cultivations), [cultivations]);
  const totalPlants = activeCrops.reduce((acc, c) => acc + (c.plantCount || 1), 0);
  const [tab, setTabState] = useState<GardenTab>(lastGardenTab);
  const setTab = (t: GardenTab) => {
    lastGardenTab = t;
    setTabState(t);
  };
  const catalogPhotos = useGeneticsCatalogPhotos();
  // Pestaña Plantas: cada genética de cada ambiente, la que está más cerca de cortar primero
  const ambientById = useMemo(() => new Map(indoors.map((i) => [i.id, i])), [indoors]);
  const plantEntries = useMemo(
    () => geneticEntries(activeCrops.filter((c) => c.indoorId && ambientById.has(c.indoorId)), geneticsList, catalogPhotos),
    [activeCrops, ambientById, geneticsList, catalogPhotos]
  );
  const newAmbient = onCreateIndoorClick || onCreateCultivationClick;
  const firstName = (userProfile?.displayName || 'Cultivador').split(' ')[0] || 'Cultivador';

  const numbers = [
    { id: 'home-stat-ambients', label: indoors.length === 1 ? 'ambiente' : 'ambientes', value: indoors.length, icon: Home },
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

          {/* Avisos al celular: se ofrece una sola vez */}
          {cultivations.some((c) => !c.isFinished) && <PushPromptCard />}

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

          {/* 4. Ambientes y Plantas (como en Canopia): las plantas están adentro de cada ambiente */}
          {indoors.length === 0 && activeCrops.length === 0 ? (
            <EmptyState
              id="home-empty-crops"
              icon={Home}
              title="Todavía no tenés ambientes"
              description="Creá tu carpa, sala o lugar de exterior y sumale plantas para empezar a anotar riegos, clima y fotos."
              actionLabel="Creá tu primer ambiente"
              actionIcon={Plus}
              onAction={newAmbient}
            />
          ) : (
            <section aria-label="Tu jardín" className="space-y-3">
              <div role="tablist" aria-label="Ver" className="grid grid-cols-2 p-1 rounded-2xl bg-white/15 gap-1">
                {(
                  [
                    ['ambientes', `Ambientes (${indoors.length})`, Home],
                    ['plantas', `Plantas (${plantEntries.length})`, Leaf],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`home-tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls={key === 'ambientes' ? 'home-ambients' : 'home-plants'}
                    onClick={() => setTab(key)}
                    className={`min-h-11 rounded-xl text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
                      tab === key ? 'bg-white text-ink shadow-xs' : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'ambientes' ? (
                <div id="home-ambients" role="tabpanel" aria-labelledby="home-tab-ambientes" className="space-y-3">
                  {indoors.length > 0 && (
                    <div id="home-ambient-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {indoors.map((i) => (
                        <AmbientCard key={i.id} ambient={i} crops={cropsInIndoor(cultivations, i.id)} onOpen={(x) => onOpenIndoor?.(x)} />
                      ))}
                    </div>
                  )}
                  <button type="button" id="home-add-ambient-btn" onClick={newAmbient} className="cultiveta-btn-secondary w-full text-sm">
                    <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                    Nuevo ambiente
                  </button>
                </div>
              ) : (
                <div id="home-plants" role="tabpanel" aria-labelledby="home-tab-plantas" className="space-y-3">
                  {plantEntries.length === 0 ? (
                    <p className="cultiveta-card p-5 text-sm text-ink-muted text-center">Todavía no hay plantas en tus ambientes. Sumá la primera con su genética.</p>
                  ) : (
                    <div id="home-plant-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {plantEntries.map((e) => {
                        const amb = ambientById.get(e.crop.indoorId || '');
                        return (
                          <GeneticCard
                            key={`${e.crop.id}_${e.index}`}
                            entry={e}
                            ambient={amb ? { name: amb.name, exterior: isExteriorAmbient(amb) } : null}
                            onOpen={(x) => (onOpenGenetic ? onOpenGenetic(x) : onSelectCultivation(x.crop))}
                          />
                        );
                      })}
                    </div>
                  )}
                  <button type="button" id="home-add-plants-btn" onClick={onCreateCultivationClick} className="cultiveta-btn-secondary w-full text-sm">
                    <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                    Sumar plantas
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 5. Cultivos que todavía no están en un ambiente (se les arma uno solo) */}
          {loose.length > 0 && (
            <section id="home-loose-crops" aria-labelledby="home-loose-title" className="space-y-3">
              <h2 id="home-loose-title" className="text-sm font-extrabold text-white/90 px-1">
                Sin ambiente ({loose.length})
              </h2>
              <div id="home-crop-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {loose.map((crop) => (
                  <ActiveCropCard key={crop.id} cultivation={crop} geneticsList={geneticsList} onOpen={onSelectCultivation} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
