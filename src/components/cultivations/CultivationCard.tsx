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
import { Cultivation, Watering, EnvironmentRecord } from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { ConfirmModal } from '../common/ConfirmModal';

interface CultivationCardProps {
  cultivation: Cultivation;
  latestWatering?: Watering | null;
  latestEnv?: EnvironmentRecord | null;
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

  // Análisis de estado único comprensible
  const isWateringUrgent = daysSinceWatering !== null && daysSinceWatering >= (isFlowering ? 3 : 4);
  const isEnvAlert =
    latestEnv &&
    (latestEnv.temperature < 17 ||
      latestEnv.temperature > 31 ||
      latestEnv.humidity < 35 ||
      latestEnv.humidity > 75);

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
    badgeBg: 'bg-[#62B95B]/15',
    textColor: 'text-[#62B95B]',
  };

  if (isWateringUrgent) {
    overallStatus = {
      label: 'Conviene regar 💧',
      isHealthy: false,
      hint: `Último riego hace ${daysSinceWatering} días`,
      badgeBg: 'bg-[#F3C843]/25',
      textColor: 'text-[#B8860B]',
    };
  } else if (isEnvAlert) {
    overallStatus = {
      label: 'Revisar ambiente 🌡️',
      isHealthy: false,
      hint: `${latestEnv?.temperature}°C · ${latestEnv?.humidity}% HR`,
      badgeBg: 'bg-[#EB7864]/15',
      textColor: 'text-[#EB7864]',
    };
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Si se hizo click en un botón de acción, no disparar el onClick principal
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    if (onClick) onClick();
    else if (onSelect) onSelect(cultivation.id);
  };

  return (
    <div
      id={`cultivation-card-${cultivation.id}`}
      onClick={handleCardClick}
      className="cultiveta-card p-5 sm:p-6 cursor-pointer relative group flex flex-col justify-between"
    >
      <div>
        {/* Fila superior: Nombre, Genética y Botón de opciones */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-extrabold text-[#29202F] truncate group-hover:text-[#6C45C7] transition-colors">
              {cultivation.name}
            </h3>

            {/* Metadatos sin cajas píldora (Zero-Pill discipline) */}
            <div className="flex items-center gap-2 text-xs text-[#6E5D77] mt-0.5 flex-wrap">
              <span>{cultivation.genetics || 'Genética variada'}</span>
              <span aria-hidden="true" className="text-[#DECDB3]">·</span>
              <span className="font-semibold text-[#29202F]">
                Día {totalDays}
              </span>
              <span aria-hidden="true" className="text-[#DECDB3]">·</span>
              <span>{cultivation.currentStage || 'Vegetativo'}</span>
            </div>
          </div>

          {/* Menú de eliminación / opciones secundarias */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteModalOpen(true);
            }}
            className="p-2 rounded-xl text-[#9887A2] hover:text-[#EB7864] hover:bg-[#EB7864]/10 transition-colors cursor-pointer shrink-0"
            title="Eliminar cultivo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Estado comprensible en 3 segundos (Un único estado claro) */}
        <div className="my-3.5 p-3 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-3 h-3 rounded-full shrink-0 ${overallStatus.isHealthy ? 'bg-[#62B95B]' : 'bg-[#EB7864] animate-pulse'}`} />
            <div className="min-w-0">
              <span className={`text-xs font-bold block ${overallStatus.textColor}`}>
                {overallStatus.label}
              </span>
              <span className="text-[11px] text-[#6E5D77] block truncate">
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
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6C45C7] hover:underline px-2 py-1 rounded-lg hover:bg-[#6C45C7]/10 transition-colors cursor-pointer"
          >
            <span>{showTechnicalDetails ? 'Ocultar' : 'Métricas'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showTechnicalDetails ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Capa de Detalles Técnicos Desplegables */}
        {showTechnicalDetails && (
          <div className="mb-3.5 p-3.5 rounded-2xl bg-[#FAF2E1] border border-[#DECDB3] space-y-2 text-xs text-[#29202F] animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[#6E5D77] block">Ambiente:</span>
                <span className="font-bold">
                  {latestEnv ? `${latestEnv.temperature}°C · ${latestEnv.humidity}% HR` : 'Sin registros'}
                </span>
                {latestEnv?.vpd !== undefined && (
                  <span className="text-[10px] text-[#6E5D77] block">VPD: {latestEnv.vpd} kPa</span>
                )}
              </div>
              <div>
                <span className="text-[#6E5D77] block">Último riego:</span>
                <span className="font-bold">
                  {latestWatering
                    ? `${daysSinceWatering === 0 ? 'Hoy' : daysSinceWatering === 1 ? 'Ayer' : `Hace ${daysSinceWatering}d`} · ${latestWatering.amountLiters}L`
                    : 'Sin riegos'}
                </span>
                {latestWatering?.ph !== undefined && (
                  <span className="text-[10px] text-[#6E5D77] block">pH {latestWatering.ph} · EC {latestWatering.ec || '-'}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botones de acción rápida cotidianos */}
      <div className="pt-3 border-t border-[#EFE3CF] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {onQuickWater && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickWater(cultivation);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              title="Registrar riego"
            >
              <Droplets className="w-3.5 h-3.5 text-[#62B95B]" />
              <span>Riego</span>
            </button>
          )}

          {onQuickPhoto && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickPhoto(cultivation);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              title="Subir foto"
            >
              <Camera className="w-3.5 h-3.5 text-[#6C45C7]" />
              <span>Foto</span>
            </button>
          )}

          {onQuickAI && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAI(cultivation);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#6C45C7] text-xs font-bold transition-colors cursor-pointer"
              title="Consultar a la IA"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleCardClick}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#6C45C7] hover:text-[#5B37AE] hover:underline cursor-pointer ml-auto"
        >
          <span>Ver carpa</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal de confirmación para eliminar */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteCultivation}
        title="¿Eliminar este cultivo?"
        description={`Se eliminará "${cultivation.name}". Esta acción no se puede deshacer.`}
        confirmText={isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
};
