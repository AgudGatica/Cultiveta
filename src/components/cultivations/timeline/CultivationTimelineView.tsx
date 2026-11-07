import React, { useState, useMemo } from 'react';
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
import { Cultivation, CultivationGrowthStage, Genetics } from '../../../types';
import {
  getStagesForCultivation,
  getNextStage,
  calculateTimelineMetrics,
  getStageIcon,
  formatFriendlyDate,
  buildCultivationStageSchedule,
  addDays,
} from '../../../utils/growthStageUtils';
import { StageConfigModal } from './StageConfigModal';
import { darkHoursFor } from '../../../utils/photoperiods';
import { StageTransitionModal } from './StageTransitionModal';
import { cultivationService } from '../../../services/cultivationService';
import { dec } from '../../../utils/formatNumber';

interface CultivationTimelineViewProps {
  cultivation: Cultivation;
  userId: string;
  geneticsList?: Genetics[];
  onCultivationUpdated?: (updatedCultivation: Cultivation) => void;
  onOpenCalendarModal?: () => void;
}

export const CultivationTimelineView: React.FC<CultivationTimelineViewProps> = ({
  cultivation,
  userId,
  geneticsList = [],
  onCultivationUpdated,
  onOpenCalendarModal,
}) => {
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [stageForTransition, setStageForTransition] = useState<CultivationGrowthStage | null>(null);
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);

  const stages = getStagesForCultivation(cultivation);
  const metrics = calculateTimelineMetrics(cultivation, stages, geneticsList);
  const nextStage = getNextStage(cultivation, stages);
  const schedule = buildCultivationStageSchedule(cultivation, geneticsList);

  const handleOpenTransition = (targetStage?: CultivationGrowthStage | null) => {
    setStageForTransition(targetStage || nextStage || stages[0]);
    setIsTransitionModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner: Progress Overview & Actions */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-line shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-ink">
                Línea de tiempo y etapas
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-ink-muted mt-1">
              Progreso cronológico de{' '}
              <strong className="text-ink font-semibold">{cultivation.name}</strong> a lo
              largo de las fases fenológicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {nextStage && !cultivation.isFinished && (
              <button
                type="button"
                id="timeline-advance-next-stage-btn"
                onClick={() => handleOpenTransition(nextStage)}
                className="px-4 py-2.5 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
                title={`Avanzar cultivo a ${nextStage.name}`}
              >
                <PlayCircle className="w-4 h-4 text-ok-ink" />
                <span>Avanzar a {nextStage.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-ok-ink" />
              </button>
            )}

            {onOpenCalendarModal && (
              <button
                type="button"
                id="timeline-open-calendar-btn"
                onClick={onOpenCalendarModal}
                className="px-3.5 py-2.5 rounded-2xl bg-white border border-line hover:bg-surface text-ink text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                title="Sincronizar etapas con Google Calendar"
              >
                <Calendar className="w-4 h-4 text-ok-ink" />
                <span className="hidden sm:inline">Google</span>
                <span>Calendar</span>
              </button>
            )}

            <button
              type="button"
              id="timeline-change-stage-btn"
              onClick={() => handleOpenTransition(null)}
              className="px-3.5 py-2.5 rounded-2xl bg-track hover:bg-line text-ink text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
              title="Cambiar a cualquier etapa del ciclo"
            >
              <Clock className="w-4 h-4 text-ink-muted" />
              <span>Cambiar etapa</span>
            </button>

            <button
              type="button"
              id="open-stage-config-btn"
              onClick={() => setIsConfigModalOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
            >
              <Settings2 className="w-4 h-4 text-ok-ink" />
              <span className="hidden sm:inline">Definir /</span>
              <span>Configurar etapas</span>
            </button>
          </div>
        </div>

        {/* Global Cycle Progress Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {schedule.overallProgressPct !== null ? (
                <>
                  <span className="font-extrabold text-ink text-sm">
                    Día {schedule.totalElapsedDays}
                  </span>
                  <span className="text-ink-subtle">de ~{schedule.totalCycleDays} días estimados</span>
                  <span className="px-2 py-0.5 rounded-full bg-ok-bg text-ok-ink font-extrabold text-xs">
                    {schedule.overallProgressPct}% ciclo total
                  </span>
                </>
              ) : (
                <>
                  <span className="font-extrabold text-ink text-sm">
                    Día {schedule.activeStageElapsedDays}
                  </span>
                  <span className="text-ink-subtle">en {schedule.activeStage.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-icon-bg text-brand font-extrabold text-xs">
                    Inicio de ciclo no registrado
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 text-ink-muted font-medium text-xs sm:text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-ink-subtle" />
                Inicio: <strong>{schedule.isCycleStartKnown ? formatFriendlyDate(schedule.cropStartDate) : 'Sin fecha registrada'}</strong>
              </span>
              <span className="flex items-center gap-1 text-warn-ink font-bold">
                <Flag className="w-3.5 h-3.5 text-warn-ink" />
                Cosecha estimada:{' '}
                <strong>{formatFriendlyDate(schedule.estimatedHarvestDate, { isProjected: true })}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-line text-ink font-bold text-[11px]">
                {schedule.daysUntilHarvest} días restantes
              </span>
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-line overflow-hidden relative">
            <div
              className="h-full bg-brand-deep rounded-full transition-all duration-700"
              style={{ width: `${schedule.roadmapProgressPct}%` }}
            />
          </div>
        </div>

        {/* Active Stage Spotlight Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-ok-bg border border-ok-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-brand-deep text-white flex items-center justify-center text-2xl shadow-sm shrink-0">
              {getStageIcon(metrics.activeStage.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-ok-ink uppercase tracking-wider">
                  Etapa actual:
                </span>
                <span className="text-base font-extrabold text-ink">
                  {metrics.activeStage.name}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ok-bg text-ok-ink text-[11px] font-extrabold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-deep animate-pulse" />
                  En curso
                </span>
              </div>
              <div className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-3">
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
                    <span className="flex items-center gap-1 font-semibold text-warn-ink">
                      <Sun className="w-3.5 h-3.5 text-warn-ink" />
                      {metrics.activeStage.photoperiodHoursLight}/
                      {24 - metrics.activeStage.photoperiodHoursLight}h luz
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-full sm:w-64 space-y-1.5 shrink-0">
            <div className="flex justify-between text-xs font-bold text-ok-ink">
              <span>Ritmo de la etapa</span>
              <span>{metrics.activeStageProgressPct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-ok-bg overflow-hidden">
              <div
                className="h-full bg-brand-deep rounded-full transition-all duration-500"
                style={{ width: `${metrics.activeStageProgressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Roadmap / Timeline Track */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-line shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-ink">
              Cronograma visual de hitos
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Haz clic en cualquier etapa para ver sus especificaciones u objetivos agronómicos.
            </p>
          </div>
          <span className="text-xs text-ink-subtle font-semibold hidden sm:inline-block">
            {stages.length} Etapas planificadas
          </span>
        </div>

        {/* Scrollable Horizontal Track */}
        <div className="overflow-x-auto pb-4 pt-2 scrollbar-thin scrollbar-thumb-stone-200">
          <div className="min-w-[720px] px-4 py-3 relative flex items-start justify-between">
            {/* Background connecting line */}
            <div className="absolute top-9 left-8 right-8 h-1 bg-line -z-0" />

            {stages.map((st, index) => {
              const schedItem =
                schedule.stages[index] ||
                schedule.stages.find((s) => s.name.toLowerCase() === st.name.toLowerCase());

              const isActive = schedItem ? schedItem.status === 'active' : st.name === cultivation.currentStage;
              const isCompleted = schedItem ? schedItem.status === 'completed' : (st.isCompleted || index < metrics.activeStageIndex);
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
                        ? 'bg-brand-deep text-white ring-4 ring-ok shadow-md scale-110'
                        : isCompleted
                        ? 'bg-brand-deep text-white hover:bg-brand-deep shadow-xs'
                        : 'bg-white text-ink-subtle border-2 border-line hover:border-line'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 text-ok-ink stroke-[3]" />
                    ) : (
                      <span>{icon}</span>
                    )}
                  </div>

                  {/* Stage Label */}
                  <div className="mt-2.5 space-y-0.5">
                    <span
                      className={`text-xs font-bold block truncate max-w-[100px] ${
                        isActive
                          ? 'text-ok-ink font-extrabold'
                          : isCompleted
                          ? 'text-ink'
                          : 'text-ink-subtle'
                      }`}
                    >
                      {st.name}
                    </span>

                    <span className="text-[11px] text-ink-muted font-medium block">
                      {st.expectedDurationDays}d
                      {st.photoperiodHoursLight !== undefined && (
                        <span> · {st.photoperiodHoursLight}h</span>
                      )}
                    </span>

                    {schedItem && (
                      <span className="text-[11px] text-ink-subtle block">
                        {formatFriendlyDate(schedItem.startDate, {
                          isProjected: !schedItem.startIsReal,
                          includeYear: false,
                        })}
                      </span>
                    )}

                    {isActive && (
                      <span className="inline-block px-1.5 py-0.2 rounded-full bg-ok-bg text-ok-ink text-[11px] font-extrabold uppercase tracking-wider mt-0.5">
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
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-ink">
            Detalle de cada etapa fenológica
          </h3>
          <span className="text-xs text-ink-muted">
            Podés cambiar de etapa según el desarrollo real de tus plantas
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {stages.map((st, index) => {
            const schedItem =
              schedule.stages[index] ||
              schedule.stages.find((s) => s.name.toLowerCase() === st.name.toLowerCase());

            const isActive = schedItem ? schedItem.status === 'active' : st.name === cultivation.currentStage;
            const isCompleted = schedItem ? schedItem.status === 'completed' : (st.isCompleted || index < metrics.activeStageIndex);
            const icon = getStageIcon(st.name);

            // Reconciled calendar date presentation
            let dateDisplay = '—';
            if (schedItem) {
              const isHarvestLike =
                schedItem.name === 'Cosecha' ||
                schedItem.name === 'Secado' ||
                schedItem.name === 'Finalizado';

              const isStartProjected = !schedItem.startIsReal;
              const isEndProjected = !schedItem.endIsReal;

              if (isHarvestLike) {
                dateDisplay = formatFriendlyDate(schedItem.startDate, { isProjected: isStartProjected });
              } else if (schedItem.status === 'completed') {
                dateDisplay = `${formatFriendlyDate(schedItem.startDate, { isProjected: isStartProjected })} → ${formatFriendlyDate(schedItem.endDate, { isProjected: isEndProjected })}`;
              } else if (schedItem.status === 'active') {
                dateDisplay = `${formatFriendlyDate(schedItem.startDate, { isProjected: isStartProjected })} → ${formatFriendlyDate(schedItem.endDate, { isProjected: true })}`;
              } else {
                dateDisplay = `${formatFriendlyDate(schedItem.startDate, { isProjected: true })} → ${formatFriendlyDate(schedItem.endDate, { isProjected: true })}`;
              }
            } else {
              dateDisplay = `${formatFriendlyDate(st.startDate)} → ${formatFriendlyDate(st.endDate)}`;
            }

            return (
              <div
                key={st.id || index}
                className={`rounded-3xl p-5 border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'bg-white border-ok-line ring-2 ring-ok shadow-md'
                    : isCompleted
                    ? 'bg-surface border-line'
                    : 'bg-white border-line hover:border-line'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl p-2 rounded-2xl bg-track shrink-0">
                        {icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-base text-ink">{st.name}</h4>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full bg-brand-deep text-white text-[11px] font-extrabold uppercase tracking-wider">
                              Etapa actual
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-2 py-0.5 rounded-full bg-line text-ink text-[11px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-ok-ink" />
                              Completada
                            </span>
                          )}
                        </div>

                        {/* Fechas calendario reales y proyectadas */}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-ink-muted font-medium">
                            {dateDisplay}
                          </span>
                          {schedItem && (
                            <span
                              className={`text-[11px] font-bold px-1.5 py-0.2 rounded-md ${
                                schedItem.status === 'completed' && schedItem.isActual
                                  ? 'bg-ok-bg text-ok-ink'
                                  : schedItem.status === 'active'
                                  ? 'bg-warn-bg text-warn-ink'
                                  : 'bg-icon-bg text-brand'
                              }`}
                            >
                              {schedItem.status === 'completed'
                                ? (schedItem.isActual ? 'Real' : 'Proyectado')
                                : schedItem.status === 'active'
                                ? 'En curso'
                                : 'Proyectado'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-ink block">
                        {st.expectedDurationDays} días
                      </span>
                      <span className="text-xs text-ink-subtle">
                        (~{dec(st.expectedDurationDays / 7, 1)} sem)
                      </span>
                    </div>
                  </div>

                  {/* Active progress bar inside card if active */}
                  {isActive && (
                    <div className="p-3 rounded-2xl bg-ok-bg border border-ok-line space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-ok-ink">
                        <span>
                          Día {metrics.daysInActiveStage} de {st.expectedDurationDays}
                        </span>
                        <span>{metrics.activeStageProgressPct}% completado</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-ok-bg overflow-hidden">
                        <div
                          className="h-full bg-brand-deep rounded-full"
                          style={{ width: `${metrics.activeStageProgressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Metadata Chips: Photoperiod, Temp, HR */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {st.photoperiodHoursLight !== undefined && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-warn-bg border border-warn-line text-warn-ink text-xs font-semibold">
                        <Sun className="w-3.5 h-3.5 text-warn-ink" />
                        <span>
                          {st.photoperiodHoursLight}/{darkHoursFor(st.photoperiodHoursLight, st.photoperiodHoursDark)}h
                        </span>
                      </span>
                    )}

                    {st.targetTempMinC && st.targetTempMaxC && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-track border border-line text-ink text-xs font-medium">
                        <Thermometer className="w-3.5 h-3.5 text-ink-muted" />
                        <span>
                          {st.targetTempMinC}°-{st.targetTempMaxC}°C
                        </span>
                      </span>
                    )}

                    {st.targetHumidityMinPct && st.targetHumidityMaxPct && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-icon-bg border border-chip-line text-brand text-xs font-medium">
                        <Droplets className="w-3.5 h-3.5 text-brand" />
                        <span>
                          HR {st.targetHumidityMinPct}%-{st.targetHumidityMaxPct}%
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Stage Notes / Agronomic advice */}
                  {st.notes && (
                    <p className="text-xs text-ink-muted bg-surface p-2.5 rounded-xl border border-line italic">
                      "{st.notes}"
                    </p>
                  )}
                </div>

                {/* Quick Action Footer */}
                <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                  <span className="text-xs text-ink-subtle">
                    Posición {index + 1} de {stages.length}
                  </span>

                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleOpenTransition(st)}
                      className="px-3 py-1.5 rounded-xl bg-track hover:bg-brand-deep hover:text-white text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs group"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-ok-ink group-hover:text-white transition-colors" />
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
