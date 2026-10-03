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
      className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-5 text-[#29202F]"
    >
      {/* Header: Proyección del Ciclo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#6C45C7]/15 text-[#6C45C7] border border-[#6C45C7]/30 flex items-center justify-center shrink-0">
            <Scissors className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-[#29202F]">
              Proyección del ciclo
            </h3>
            <p className="text-xs text-[#6E5D77] mt-0.5">
              Cálculo estimativo de corte basado en etapas fenológicas y genética ({geneticsName})
            </p>
          </div>
        </div>

        {onOpenCalendarModal && (
          <button
            type="button"
            onClick={onOpenCalendarModal}
            className="px-4 py-2 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-xs font-bold text-[#6C45C7] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs self-stretch sm:self-auto justify-center"
          >
            <Calendar className="w-4 h-4 text-[#6C45C7]" />
            <span>Ver en Calendario</span>
          </button>
        )}
      </div>

      {/* Hero Projection Card */}
      <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Fecha Estimada de Corte */}
          <div className="p-4 rounded-xl bg-white border border-[#EFE3CF]">
            <span className="text-[10px] text-[#9887A2] uppercase font-bold tracking-wider block">
              Fecha estimada de corte
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#6C45C7] block mt-1">
              {formatFriendlyDate(schedule.estimatedHarvestDate, { isProjected: true })}
            </span>
            <span className="text-[11px] text-[#6E5D77] block mt-0.5">
              {schedule.daysUntilHarvest === 0
                ? 'Ventana de cosecha lista'
                : `Faltan aproximadamente ${schedule.daysUntilHarvest} días (~${schedule.weeksUntilHarvest} sem)`}
            </span>
          </div>

          {/* Estado de Ajustes */}
          <div className="p-4 rounded-xl bg-white border border-[#EFE3CF]">
            <span className="text-[10px] text-[#9887A2] uppercase font-bold tracking-wider block">
              Ajustes del cronograma
            </span>
            <div className="flex items-center gap-2 mt-1">
              {schedule.hasStageAdjustments ? (
                <span className="text-base font-extrabold text-[#EB7864] flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-[#EB7864]" />
                  <span>{schedule.adjustmentDeltaDays > 0 ? `+${schedule.adjustmentDeltaDays}d de ajuste` : `${schedule.adjustmentDeltaDays}d de ajuste`}</span>
                </span>
              ) : (
                <span className="text-base font-extrabold text-[#62B95B] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#62B95B]" />
                  <span>Cronograma alineado</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#6E5D77] block mt-0.5 leading-tight">
              {schedule.adjustmentReason}
            </span>
          </div>

          {/* Duración Total Proyectada */}
          <div className="p-4 rounded-xl bg-white border border-[#EFE3CF]">
            <span className="text-[10px] text-[#9887A2] uppercase font-bold tracking-wider block">
              Ciclo Total Estimado
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#29202F] block mt-1">
              ~{schedule.totalCycleDays} días
            </span>
            <span className="text-[11px] text-[#6E5D77] block mt-0.5">
              Llevas {schedule.totalElapsedDays} días transcurridos ({schedule.overallProgressPct}%)
            </span>
          </div>
        </div>

        {/* Explicación de fechas REALES vs PROYECTADAS */}
        <div className="flex items-center justify-between text-xs text-[#6E5D77] pt-1">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#29202F]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#62B95B]" />
              <span>REAL: Confirmado por registro</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#6C45C7]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6C45C7]" />
              <span>PROYECTADO (~): Estimación biológica</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowStageBreakdown((prev) => !prev)}
            className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer inline-flex items-center gap-1 py-1"
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
          <div className="pt-3 border-t border-[#EFE3CF] space-y-2 animate-in fade-in duration-200">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#29202F] block">
              Desglose de Etapas del Cronograma
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {schedule.stages.map((st) => (
                <div
                  key={st.id}
                  className={`p-3 rounded-xl border ${
                    st.status === 'active'
                      ? 'bg-[#62B95B]/10 border-[#62B95B]/40 font-bold'
                      : st.status === 'completed'
                      ? 'bg-white border-[#EFE3CF] text-[#29202F]'
                      : 'bg-white/60 border-[#EFE3CF] text-[#6E5D77]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-[#29202F]">{st.name}</span>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                        st.status === 'active'
                          ? 'bg-[#62B95B] text-white'
                          : st.status === 'completed'
                          ? 'bg-[#FAF2E1] text-[#29202F]'
                          : 'bg-stone-100 text-[#9887A2]'
                      }`}
                    >
                      {st.status === 'active' ? 'Actual' : st.status === 'completed' ? 'Real' : 'Proyectada'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6E5D77] space-y-0.5">
                    <div>
                      {formatFriendlyDate(st.startDate, { isProjected: !st.isActual })} →{' '}
                      {formatFriendlyDate(st.endDate, { isProjected: st.isProjected })}
                    </div>
                    <div className="text-[10px] text-[#9887A2]">
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
