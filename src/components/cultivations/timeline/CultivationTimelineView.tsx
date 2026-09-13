import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Settings2,
  Sparkles,
  Sun,
  Thermometer,
  Droplets,
  ChevronRight,
  PlayCircle,
  Flag,
  Scissors,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Cultivation, CultivationGrowthStage } from '../../../types';
import {
  getStagesForCultivation,
  getNextStage,
  calculateTimelineMetrics,
  getStageIcon,
  formatFriendlyDate,
  addDays,
} from '../../../utils/growthStageUtils';
import { StageConfigModal } from './StageConfigModal';
import { StageTransitionModal } from './StageTransitionModal';
import { cultivationService } from '../../../services/cultivationService';

interface CultivationTimelineViewProps {
  cultivation: Cultivation;
  userId: string;
  onCultivationUpdated?: (updatedCultivation: Cultivation) => void;
}

export const CultivationTimelineView: React.FC<CultivationTimelineViewProps> = ({
  cultivation,
  userId,
  onCultivationUpdated,
}) => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [stageForTransition, setStageForTransition] = useState<CultivationGrowthStage | null>(null);
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);

  const stages = getStagesForCultivation(cultivation);
  const metrics = calculateTimelineMetrics(cultivation, stages);
  const nextStage = getNextStage(cultivation, stages);

  const handleOpenTransition = (targetStage?: CultivationGrowthStage | null) => {
    setStageForTransition(targetStage || nextStage || stages[0]);
    setIsTransitionModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner: Progress Overview & Actions */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⏱️</span>
              <h2 className="text-xl font-extrabold text-stone-900">
                Línea de Tiempo y Etapas de Crecimiento
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              Progreso cronológico de{' '}
              <strong className="text-stone-800 font-semibold">{cultivation.name}</strong> a lo
              largo de las fases fenológicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {nextStage && !cultivation.isFinished && (
              <button
                type="button"
                id="timeline-advance-next-stage-btn"
                onClick={() => handleOpenTransition(nextStage)}
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
                title={`Avanzar cultivo a ${nextStage.name}`}
              >
                <PlayCircle className="w-4 h-4 text-emerald-200" />
                <span>Avanzar a {nextStage.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-emerald-200" />
              </button>
            )}

            <button
              type="button"
              id="timeline-change-stage-btn"
              onClick={() => handleOpenTransition(null)}
              className="px-3.5 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              title="Cambiar a cualquier etapa del ciclo"
            >
              <Clock className="w-4 h-4 text-stone-600" />
              <span>Cambiar Etapa</span>
            </button>

            <button
              type="button"
              id="open-stage-config-btn"
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
            >
              <Settings2 className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Definir /</span>
              <span>Configurar Etapas</span>
            </button>
          </div>
        </div>

        {/* Global Cycle Progress Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-stone-900 text-sm">
                Día {metrics.totalElapsedDays}
              </span>
              <span className="text-stone-400">de {metrics.totalCycleDays} días estimados</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                {metrics.overallProgressPct}% ciclo total
              </span>
            </div>

            <div className="flex items-center gap-4 text-stone-600 font-medium text-[11px] sm:text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                Inicio: <strong>{formatFriendlyDate(cultivation.startDate)}</strong>
              </span>
              <span className="flex items-center gap-1 text-amber-800 font-bold">
                <Flag className="w-3.5 h-3.5 text-amber-600" />
                Cosecha estimada:{' '}
                <strong>{formatFriendlyDate(metrics.projectedHarvestDate)}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 font-bold text-[10px]">
                {metrics.daysUntilHarvest} días restantes
              </span>
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-stone-200 overflow-hidden relative">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-700"
              style={{ width: `${metrics.overallProgressPct}%` }}
            />
          </div>
        </div>

        {/* Active Stage Spotlight Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
              {getStageIcon(metrics.activeStage.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                  Etapa Actual:
                </span>
                <span className="text-base font-extrabold text-stone-900">
                  {metrics.activeStage.name}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-extrabold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  En curso
                </span>
              </div>
              <div className="text-xs text-stone-600 mt-1 flex flex-wrap items-center gap-3">
                <span>
                  Día <strong>{metrics.daysInActiveStage}</strong> de{' '}
                  {metrics.activeStage.expectedDurationDays} días planificados
                </span>
                <span>·</span>
                <span>
                  Progreso de etapa: <strong>{metrics.activeStageProgressPct}%</strong>
                </span>
                {metrics.activeStage.photoperiodHoursLight !== undefined && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1 font-semibold text-amber-800">
                      <Sun className="w-3.5 h-3.5 text-amber-600" />
                      {metrics.activeStage.photoperiodHoursLight}/
                      {24 - metrics.activeStage.photoperiodHoursLight}h luz
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-1.5 shrink-0">
            <div className="flex justify-between text-[11px] font-bold text-emerald-950">
              <span>Ritmo de la etapa</span>
              <span>{metrics.activeStageProgressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-emerald-200/80 overflow-hidden">
              <div
                className="h-full bg-emerald-700 rounded-full transition-all duration-500"
                style={{ width: `${metrics.activeStageProgressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Roadmap / Timeline Track */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-stone-900">
              Cronograma Visual de Hitos
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Haz clic en cualquier etapa para ver sus especificaciones u objetivos agronómicos.
            </p>
          </div>
          <span className="text-xs text-stone-400 font-semibold hidden sm:inline-block">
            {stages.length} Etapas planificadas
          </span>
        </div>

        {/* Scrollable Horizontal Track */}
        <div className="overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-stone-200">
          <div className="min-w-[720px] px-4 py-3 relative flex items-start justify-between">
            {/* Background connecting line */}
            <div className="absolute top-9 left-8 right-8 h-1 bg-stone-200 -z-0" />

            {stages.map((st, index) => {
              const isActive = st.name === cultivation.currentStage;
              const isCompleted = st.isCompleted || index < metrics.activeStageIndex;
              const isFuture = !isActive && !isCompleted;
              const icon = getStageIcon(st.name);

              return (
                <div
                  key={st.id || index}
                  onClick={() => handleOpenTransition(st)}
                  title={`Clic para ver detalles u objetivos de ${st.name}`}
                  className="relative z-10 flex flex-col items-center cursor-pointer group px-2 max-w-[110px] text-center"
                >
                  {/* Node Circle */}
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg transition-all duration-300 ${
                      isActive
                        ? 'bg-emerald-600 text-white ring-4 ring-emerald-300 shadow-md scale-110'
                        : isCompleted
                        ? 'bg-stone-900 text-white hover:bg-stone-800 shadow-xs'
                        : 'bg-white text-stone-400 border-2 border-stone-300 hover:border-stone-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 text-emerald-400 stroke-[3]" />
                    ) : (
                      <span>{icon}</span>
                    )}
                  </div>

                  {/* Stage Label */}
                  <div className="mt-2.5 space-y-0.5">
                    <span
                      className={`text-xs font-bold block truncate max-w-[100px] ${
                        isActive
                          ? 'text-emerald-900 font-extrabold'
                          : isCompleted
                          ? 'text-stone-800'
                          : 'text-stone-400'
                      }`}
                    >
                      {st.name}
                    </span>

                    <span className="text-[10px] text-stone-500 font-medium block">
                      {st.expectedDurationDays}d
                      {st.photoperiodHoursLight !== undefined && (
                        <span> · {st.photoperiodHoursLight}h</span>
                      )}
                    </span>

                    {isActive && (
                      <span className="inline-block px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-extrabold uppercase tracking-wider mt-0.5">
                        Activa
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stages Detailed Cards List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-stone-700">
            Detalle de Cada Etapa Fenológica
          </h3>
          <span className="text-xs text-stone-500">
            Puedes cambiar de etapa según el desarrollo real de tus plantas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {stages.map((st, index) => {
            const isActive = st.name === cultivation.currentStage;
            const isCompleted = st.isCompleted || index < metrics.activeStageIndex;
            const icon = getStageIcon(st.name);

            return (
              <div
                key={st.id || index}
                className={`rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'bg-white border-emerald-400 ring-2 ring-emerald-400/30 shadow-md'
                    : isCompleted
                    ? 'bg-stone-50/70 border-stone-200/90'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-2xl bg-stone-100 shrink-0">
                        {icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-base text-stone-900">{st.name}</h4>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                              Etapa Actual
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Completada
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-stone-500">
                          {formatFriendlyDate(st.startDate)} → {formatFriendlyDate(st.endDate)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-stone-900 block">
                        {st.expectedDurationDays} días
                      </span>
                      <span className="text-[11px] text-stone-400">
                        (~{(st.expectedDurationDays / 7).toFixed(1)} sem)
                      </span>
                    </div>
                  </div>

                  {/* Active progress bar inside card if active */}
                  {isActive && (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80 space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-emerald-950">
                        <span>
                          Día {metrics.daysInActiveStage} de {st.expectedDurationDays}
                        </span>
                        <span>{metrics.activeStageProgressPct}% completado</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-emerald-200 overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-full"
                          style={{ width: `${metrics.activeStageProgressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Metadata Chips: Photoperiod, Temp, HR */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {st.photoperiodHoursLight !== undefined && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        <span>
                          {st.photoperiodHoursLight}/{24 - st.photoperiodHoursLight}h
                        </span>
                      </span>
                    )}

                    {st.targetTempMinC && st.targetTempMaxC && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium">
                        <Thermometer className="w-3.5 h-3.5 text-stone-500" />
                        <span>
                          {st.targetTempMinC}°-{st.targetTempMaxC}°C
                        </span>
                      </span>
                    )}

                    {st.targetHumidityMinPct && st.targetHumidityMaxPct && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 text-xs font-medium">
                        <Droplets className="w-3.5 h-3.5 text-cyan-600" />
                        <span>
                          HR {st.targetHumidityMinPct}%-{st.targetHumidityMaxPct}%
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Stage Notes / Agronomic advice */}
                  {st.notes && (
                    <p className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100 italic">
                      "{st.notes}"
                    </p>
                  )}
                </div>

                {/* Quick Action Footer */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[11px] text-stone-400">
                    Posición {index + 1} de {stages.length}
                  </span>

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleOpenTransition(st)}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-emerald-600 hover:text-white text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs group"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white transition-colors" />
                      <span>Cambiar a esta etapa</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Configuration Modal */}
      {isConfigModalOpen && (
        <StageConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          cultivation={cultivation}
          userId={userId}
          initialStages={stages}
          onStagesUpdated={(updated) => {
            if (onCultivationUpdated) {
              onCultivationUpdated(updated);
            }
          }}
        />
      )}

      {/* Stage Transition / Advance Modal */}
      {isTransitionModalOpen && (
        <StageTransitionModal
          isOpen={isTransitionModalOpen}
          onClose={() => setIsTransitionModalOpen(false)}
          cultivation={cultivation}
          initialSelectedStage={stageForTransition}
          stages={stages}
          userId={userId}
          onStageChanged={(updated) => {
            if (onCultivationUpdated) {
              onCultivationUpdated(updated);
            }
          }}
        />
      )}
    </div>
  );
};
