import React, { useState } from 'react';
import {
  Sprout,
  Droplets,
  Camera,
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Trash2,
  Calendar,
  Thermometer,
} from 'lucide-react';
import { Cultivation, Watering, EnvironmentRecord, GeneticsCatalogPhoto } from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { ConfirmModal } from '../common/ConfirmModal';
import { resolveCultivationDisplayPhoto } from '../../utils/cultivationPhotoResolver';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';

interface CultivationCardProps {
  cultivation: Cultivation;
  latestWatering?: Watering | null;
  latestEnv?: EnvironmentRecord | null;
  catalogPhotos?: Record<string, GeneticsCatalogPhoto>;
  onClick?: () => void;
  onSelect?: (id: string) => void;
  onQuickWater?: (cultivation: Cultivation) => void;
  onQuickPhoto?: (cultivation: Cultivation) => void;
  onQuickAI?: (cultivation: Cultivation) => void;
  onQuickCalendar?: (cultivation: Cultivation) => void;
  onDeleteCultivation?: (id: string) => void;
  onDelete?: (id: string) => void;
  userId?: string;
}

export const CultivationCard: React.FC<CultivationCardProps> = ({
  cultivation,
  latestWatering,
  latestEnv,
  catalogPhotos: catalogPhotosProp,
  onClick,
  onSelect,
  onQuickWater,
  onQuickPhoto,
  onQuickAI,
  onQuickCalendar,
  onDeleteCultivation,
  onDelete,
  userId,
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const subscribedPhotos = useGeneticsCatalogPhotos();
  const effectiveCatalogPhotos = catalogPhotosProp || subscribedPhotos;

  const photoResolution = React.useMemo(() => {
    return resolveCultivationDisplayPhoto(cultivation, effectiveCatalogPhotos);
  }, [cultivation, effectiveCatalogPhotos]);

  const handleDeleteCultivation = async () => {
    try {
      setIsDeleting(true);
      await cultivationService.deleteCultivation(cultivation.id, userId || cultivation.userId);
      setIsDeleteModalOpen(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cultiveta_cultivation_deleted', {
            detail: { id: cultivation.id, name: cultivation.name },
          })
        );
      }
      if (onDeleteCultivation) onDeleteCultivation(cultivation.id);
      if (onDelete) onDelete(cultivation.id);
    } catch (err) {
      console.error('Error al eliminar el cultivo:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const stageDays = cultivationService.calculateStageDays(cultivation.stageStartDate);
  const isFlowering =
    cultivation.currentStage?.toLowerCase().includes('flor') ||
    cultivation.currentStage?.toLowerCase().includes('madur');

  // Cálculo de días desde el último riego
  const daysSinceWatering = React.useMemo(() => {
    if (!latestWatering?.date) return null;
    const dateStr = latestWatering.date.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const waterDate = new Date(y, m, d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.floor((today.getTime() - waterDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    return null;
  }, [latestWatering]);

  const tempVal = (latestEnv as any)?.temperatureC ?? (latestEnv as any)?.temperature ?? null;
  const humVal = (latestEnv as any)?.humidityPct ?? (latestEnv as any)?.humidity ?? null;
  const vpdVal = (latestEnv as any)?.vpdKPa ?? (latestEnv as any)?.vpd ?? null;

  const volumeVal = (latestWatering as any)?.volumeLiters ?? (latestWatering as any)?.amountLiters ?? null;
  const phVal = (latestWatering as any)?.phIn ?? (latestWatering as any)?.ph ?? null;
  const ecVal = (latestWatering as any)?.ecIn ?? (latestWatering as any)?.ec ?? null;

  // Detección de cultivo finalizado o cosechado
  const isFinished = Boolean(
    cultivation.isFinished === true ||
    cultivation.status?.toLowerCase() === 'cosechado' ||
    cultivation.status?.toLowerCase() === 'finalizado' ||
    cultivation.currentStage?.toLowerCase() === 'cosechado'
  );

  // Análisis de estado único comprensible
  const isWateringUrgent = !isFinished && daysSinceWatering !== null && daysSinceWatering >= (isFlowering ? 3 : 4);
  const isEnvAlert =
    !isFinished &&
    tempVal !== null &&
    (tempVal < 17 || tempVal > 31 || (humVal !== null && (humVal < 35 || humVal > 75)));

  let overallStatus: {
    label: string;
    isHealthy: boolean;
    hint: string;
    badgeBg: string;
    textColor: string;
  } = {
    label: 'Está joya 🌱',
    isHealthy: true,
    hint: 'Todo en orden por acá',
    badgeBg: 'bg-ok/15',
    textColor: 'text-ok',
  };

  if (isFinished) {
    const isHarvest = cultivation.status?.toLowerCase() === 'cosechado' || cultivation.currentStage?.toLowerCase() === 'cosechado';
    overallStatus = {
      label: isHarvest ? 'Cosechado ✂️' : 'Finalizado',
      isHealthy: true,
      hint: cultivation.harvestDate ? `Cosechado el ${cultivation.harvestDate.split('T')[0]}` : 'Ciclo completado',
      badgeBg: 'bg-brand/15',
      textColor: 'text-brand',
    };
  } else if (isWateringUrgent) {
    overallStatus = {
      label: 'Conviene regar 💧',
      isHealthy: false,
      hint: `Último riego hace ${daysSinceWatering} días`,
      badgeBg: 'bg-warn-line/25',
      textColor: 'text-[#B8860B]',
    };
  } else if (isEnvAlert) {
    overallStatus = {
      label: 'Revisar ambiente 🌡️',
      isHealthy: false,
      hint: `${tempVal}°C · ${humVal}% HR`,
      badgeBg: 'bg-coral/15',
      textColor: 'text-coral',
    };
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Si se hizo click en un botón de acción, no disparar el onClick principal
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (onClick) onClick();
    else if (onSelect) onSelect(cultivation.id);
  };

  const geneticsDisplayName =
    cultivation.geneticsName ||
    (cultivation.geneticsList && cultivation.geneticsList[0]?.name) ||
    (cultivation as any).genetics ||
    'Genética variada';

  return (
    <div
      id={`cultivation-card-${cultivation.id}`}
      onClick={handleCardClick}
      className="cultiveta-card p-5 sm:p-6 cursor-pointer relative group flex flex-col justify-between"
    >
      <div>
        {/* Fila superior: Identidad, Miniatura compacta y Botón de opciones */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          {/* Miniatura compacta si existe coverPhotoUrl o fotografía de genética */}
          {photoResolution.displayPhotoUrl && !thumbError && (
            <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-track border border-line shrink-0 mt-0.5">
              <img
                data-testid="cultivation-card-thumbnail"
                src={photoResolution.displayPhotoUrl}
                alt={cultivation.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setThumbError(true)}
              />
              {photoResolution.isReferencePhoto && (
                <div
                  title="Foto de referencia del catálogo"
                  className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-2xs text-[8px] text-white font-bold text-center leading-tight py-0.5"
                >
                  Ref
                </div>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-extrabold text-ink truncate group-hover:text-brand transition-colors">
              {cultivation.name}
            </h3>
            {/* Metadatos sin cajas píldora (Zero-Pill discipline) */}
            <div className="flex items-center gap-2 text-xs text-ink-muted mt-0.5 flex-wrap">
              <span className="truncate">{geneticsDisplayName}</span>
              <span aria-hidden="true" className="text-line">·</span>
              <span className="font-semibold text-ink shrink-0">
                {isFinished ? `${totalDays} días totales` : `Día ${totalDays}`}
              </span>
              <span aria-hidden="true" className="text-line">·</span>
              <span className="shrink-0">{isFinished ? (cultivation.status?.toLowerCase() === 'cosechado' || cultivation.currentStage?.toLowerCase() === 'cosechado' ? 'Cosechado' : 'Finalizado') : (cultivation.currentStage || 'Vegetativo')}</span>
            </div>
          </div>
          {/* Menú de eliminación / opciones secundarias */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteModalOpen(true);
            }}
            className="p-2 rounded-xl text-ink-subtle hover:text-coral hover:bg-coral/10 transition-colors cursor-pointer shrink-0"
            title="Eliminar cultivo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Estado comprensible en 3 segundos (Un único estado claro) */}
        <div className="my-3.5 p-3 rounded-2xl bg-surface border border-line flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-3 h-3 rounded-full shrink-0 ${isFinished ? 'bg-brand' : overallStatus.isHealthy ? 'bg-ok' : 'bg-coral animate-pulse'}`} />
            <div className="min-w-0">
              <span className={`text-xs font-bold block ${overallStatus.textColor}`}>
                {overallStatus.label}
              </span>
              <span className="text-[11px] text-ink-muted block truncate">
                {overallStatus.hint}
              </span>
            </div>
          </div>
          {/* Botón desplegable para detalles técnicos (Progressive Disclosure) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowTechnicalDetails((prev) => !prev);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline px-2 py-1 rounded-lg hover:bg-brand/10 transition-colors cursor-pointer"
          >
            <span>Detalles</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showTechnicalDetails ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Ficha Técnica Expandible (Solo si el usuario lo solicita explícitamente) */}
        {showTechnicalDetails && (
          <div className="mb-3.5 p-3.5 rounded-2xl bg-track/60 border border-line text-xs space-y-2 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2 text-ink">
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle block">Medio</span>
                <span className="font-semibold">{cultivation.substrate?.type || 'No especificado'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle block">Macetas</span>
                <span className="font-semibold">{cultivation.substrate?.potVolumeLiters ? `${cultivation.substrate.potVolumeLiters}L (${cultivation.substrate.potType || 'Geotextil'})` : 'No especificado'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle block">Iluminación</span>
                <span className="font-semibold">{cultivation.lighting?.type || 'No especificado'}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle block">Potencia</span>
                <span className="font-semibold">{cultivation.lighting?.usedWatts ? `${cultivation.lighting.usedWatts}W` : 'No especificado'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fila de Acciones Rápidas (Iconos táctiles y limpios) */}
      <div className="pt-3 border-t border-line flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onQuickWater) onQuickWater(cultivation);
          }}
          disabled={isFinished}
          className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${isFinished ? 'opacity-40 cursor-not-allowed bg-stone-100 text-stone-400 border-stone-200' : 'bg-ok/10 hover:bg-ok/20 text-ok border-ok/20 active:scale-95'}`}
          title="Registrar riego rápido"
        >
          <Droplets className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Riego</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onQuickPhoto) onQuickPhoto(cultivation);
          }}
          disabled={isFinished}
          className={`flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${isFinished ? 'opacity-40 cursor-not-allowed bg-stone-100 text-stone-400 border-stone-200' : 'bg-warn-line/15 hover:bg-warn-line/25 text-ink border-warn-line/30 active:scale-95'}`}
          title="Tomar fotografía del cultivo"
        >
          <Camera className="w-3.5 h-3.5 shrink-0 text-ink" />
          <span className="hidden sm:inline">Foto</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onQuickAI) onQuickAI(cultivation);
          }}
          className="flex-1 py-2 px-2.5 rounded-xl border bg-brand/10 hover:bg-brand/20 text-brand border-brand/20 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
          title="Asistente agronómico IA"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">IA</span>
        </button>
      </div>

      {/* Modal de confirmación para eliminar cultivo */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteCultivation}
        title="¿Eliminar este cultivo?"
        message={`Esta acción borrará definitivamente "${cultivation.name}" y todos sus riegos, mediciones y fotos asociadas. Esta acción no se puede deshacer.`}
        confirmLabel={isDeleting ? 'Eliminando...' : 'Eliminar cultivo'}
        isDestructive
      />
    </div>
  );
};
