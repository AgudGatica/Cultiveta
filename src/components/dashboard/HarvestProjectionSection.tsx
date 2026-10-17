import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Scissors,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Cultivation, Genetics } from '../../types';
import {
  buildCultivationStageSchedule,
  formatFriendlyDate,
} from '../../utils/growthStageUtils';

export interface HarvestProjectionSectionProps {
  cultivation: Cultivation;
  geneticsList?: Genetics[];
  onOpenCalendarModal?: () => void;
}

export const HarvestProjectionSection: React.FC<HarvestProjectionSectionProps> = ({
  cultivation,
  geneticsList = [],
  onOpenCalendarModal,
}) => {
  const [showStageBreakdown, setShowStageBreakdown] = useState(false);

  // Single source of truth from centralized schedule
  const schedule = useMemo(() => {
    return buildCultivationStageSchedule(cultivation, geneticsList);
  }, [cultivation, geneticsList]);

  const matchedGenetics = useMemo(() => {
    return (
      geneticsList.find(
        (g) =>
          g.id === cultivation.geneticsId ||
          (g.name &&
            cultivation.geneticsName &&
            g.name.toLowerCase().trim() === cultivation.geneticsName.toLowerCase().trim())
      ) || null
    );
  }, [cultivation, geneticsList]);

  const geneticsName = matchedGenetics?.name || cultivation.geneticsName || 'Genética híbrida';

  return (
    <div
      id="harvest-projection-section"
      className="bg-white rounded-[32px] p-6 sm:p-8 border border-line shadow-xs relative overflow-hidden space-y-5 text-ink"
    >
      {/* Header: Proyección del Ciclo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-brand/15 text-brand border border-brand/30 flex items-center justify-center shrink-0">
            <Scissors className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-ink">
              Proyección del ciclo
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Cálculo estimativo de corte basado en etapas fenológicas y genética ({geneticsName})
            </p>
          </div>
        </div>

        {onOpenCalendarModal && (
          <button
            type="button"
            onClick={onOpenCalendarModal}
            className="px-4 py-2 rounded-2xl bg-white hover:bg-track border border-line text-xs font-bold text-brand transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs self-stretch sm:self-auto justify-center"
          >
            <Calendar className="w-4 h-4 text-brand" />
            <span>Ver en Calendario</span>
          </button>
        )}
      </div>

      {/* Hero Projection Card */}
      <div className="p-5 rounded-2xl bg-surface border border-line space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Fecha Estimada de Corte */}
          <div className="p-4 rounded-xl bg-white border border-line">
            <span className="text-[10px] text-ink-subtle uppercase font-bold tracking-wider block">
              Fecha estimada de corte
            </span>
            <span className="text-xl sm:text-2xl font-black text-brand block mt-1">
              {formatFriendlyDate(schedule.estimatedHarvestDate, { isProjected: true })}
            </span>
            <span className="text-[11px] text-ink-muted block mt-0.5">
              {schedule.daysUntilHarvest === 0
                ? 'Ventana de cosecha lista'
                : `Faltan aproximadamente ${schedule.daysUntilHarvest} días (~${schedule.weeksUntilHarvest} sem)`}
            </span>
          </div>

          {/* Estado de Ajustes */}
          <div className="p-4 rounded-xl bg-white border border-line">
            <span className="text-[10px] text-ink-subtle uppercase font-bold tracking-wider block">
              Ajustes del cronograma
            </span>
            <div className="flex items-center gap-2 mt-1">
              {schedule.hasStageAdjustments ? (
                <span className="text-base font-extrabold text-coral flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-coral" />
                  <span>{schedule.adjustmentDeltaDays > 0 ? `+${schedule.adjustmentDeltaDays}d de ajuste` : `${schedule.adjustmentDeltaDays}d de ajuste`}</span>
                </span>
              ) : (
                <span className="text-base font-extrabold text-ok flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-ok" />
                  <span>Cronograma alineado</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-ink-muted block mt-0.5 leading-tight">
              {schedule.adjustmentReason}
            </span>
          </div>

          {/* Duración Total Proyectada */}
          <div className="p-4 rounded-xl bg-white border border-line">
            <span className="text-[10px] text-ink-subtle uppercase font-bold tracking-wider block">
              Ciclo Total Estimado
            </span>
            <span className="text-xl sm:text-2xl font-black text-ink block mt-1">
              {schedule.totalCycleDays !== null ? `~${schedule.totalCycleDays} días` : 'Por estimar'}
            </span>
            <span className="text-[11px] text-ink-muted block mt-0.5">
              {schedule.overallProgressPct !== null ? (
                `Llevas ${schedule.totalElapsedDays} días transcurridos (${schedule.overallProgressPct}%)`
              ) : (
                `Día ${schedule.activeStageElapsedDays} en etapa actual (${schedule.activeStage.name})`
              )}
            </span>
          </div>
        </div>

        {/* Explicación de fechas REALES vs PROYECTADAS */}
        <div className="flex items-center justify-between text-xs text-ink-muted pt-1">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <span className="w-2.5 h-2.5 rounded-full bg-ok" />
              <span>REAL: Confirmado por registro</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
              <span className="w-2.5 h-2.5 rounded-full bg-brand" />
              <span>PROYECTADO (~): Estimación biológica</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowStageBreakdown((prev) => !prev)}
            className="text-xs font-bold text-brand hover:underline cursor-pointer inline-flex items-center gap-1 py-1"
          >
            <span>{showStageBreakdown ? 'Ocultar desglose' : 'Ver desglose por etapa'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showStageBreakdown ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Desglose detallado por etapa */}
        {showStageBreakdown && (
          <div className="pt-3 border-t border-line space-y-2 animate-in fade-in duration-200">
            <span className="text-xs font-extrabold uppercase tracking-wider text-ink block">
              Desglose de Etapas del Cronograma
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {schedule.stages.map((st) => (
                <div
                  key={st.id}
                  className={`p-3 rounded-xl border ${
                    st.status === 'active'
                      ? 'bg-ok/10 border-ok/40 font-bold'
                      : st.status === 'completed'
                      ? 'bg-white border-line text-ink'
                      : 'bg-white/60 border-line text-ink-muted'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-ink">{st.name}</span>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                        st.status === 'active'
                          ? 'bg-ok text-white'
                          : st.status === 'completed' && st.isActual
                          ? 'bg-track text-ink'
                          : 'bg-stone-100 text-ink-subtle'
                      }`}
                    >
                      {st.status === 'active'
                        ? 'Actual'
                        : st.status === 'completed' && st.isActual
                        ? 'Real'
                        : 'Proyectada'}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted space-y-0.5">
                    <div>
                      {formatFriendlyDate(st.startDate, { isProjected: !st.startIsReal })} →{' '}
                      {formatFriendlyDate(st.endDate, { isProjected: !st.endIsReal })}
                    </div>
                    <div className="text-[10px] text-ink-subtle">
                      {st.expectedDurationDays} días {st.status === 'completed' ? 'duración' : 'estimados'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
