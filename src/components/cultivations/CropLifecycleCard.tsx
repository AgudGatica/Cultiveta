import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { Cultivation, Genetics } from '../../types';
import {
  buildCultivationStageSchedule,
  formatFriendlyDate,
  isFloweringStage,
} from '../../utils/growthStageUtils';

interface CropLifecycleCardProps {
  cultivation: Cultivation;
  geneticsList?: Genetics[];
}

/**
 * Ciclo del cultivo: barra de avance con los hitos Siembra → Vegetativo → Floración → Cosecha y,
 * al desplegar, el desglose de etapas (real, parcial, sin fecha o estimada). Antes estaba en el Inicio.
 */
export const CropLifecycleCard: React.FC<CropLifecycleCardProps> = ({ cultivation, geneticsList = [] }) => {
  const [showDetails, setShowDetails] = useState(false);

  const timeline = useMemo(() => {
    const schedule = buildCultivationStageSchedule(cultivation, geneticsList);

    let harvestIdx = schedule.stages.findIndex(
      (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
    );
    if (harvestIdx === -1) harvestIdx = schedule.stages.length - 1;
    const lifecycleStages = schedule.stages.slice(0, harvestIdx + 1);

    const totalExpectedCycleDays = lifecycleStages.reduce((acc, s) => acc + (s.expectedDurationDays || 7), 0) || 1;
    const baseCycleDays = schedule.totalCycleDays || totalExpectedCycleDays;

    let cumulativeDays = 0;
    const milestones = lifecycleStages.map((st, idx) => {
      const duration = st.expectedDurationDays || 1;
      const startDay = cumulativeDays;
      const pct = Math.min(100, Math.max(0, Math.round((startDay / baseCycleDays) * 100)));
      const isReached =
        schedule.overallProgressPct !== null ? schedule.overallProgressPct >= pct : idx < schedule.activeStageIndex;
      cumulativeDays += duration;
      return {
        id: st.id || `stage_${idx}`,
        name: st.name,
        durationDays: duration,
        isReached,
        isCurrent: idx === schedule.activeStageIndex,
        startDate: st.startDate,
        endDate: st.endDate,
        isActual: st.isActual,
        isProjected: st.isProjected,
        dateKnowledge: st.dateKnowledge,
        isUnknown: Boolean(st.isUnknown || st.dateKnowledge === 'unknown'),
        startIsReal: st.startIsReal,
        endIsReal: st.endIsReal,
      };
    });

    const vegeStage = schedule.stages.find((s) => s.name.toLowerCase().includes('vege'));
    const floraStage = schedule.floweringStage || schedule.stages.find((s) => isFloweringStage(s.name));

    return {
      schedule,
      milestones,
      progressPct: schedule.overallProgressPct,
      roadmapProgressPct: schedule.roadmapProgressPct,
      isCycleStartKnown: schedule.isCycleStartKnown,
      activeStageElapsedDays: schedule.activeStageElapsedDays,
      elapsedDays: schedule.totalElapsedDays,
      totalCycleDays: schedule.totalCycleDays,
      currentStageName: cultivation.currentStage || schedule.activeStage?.name || 'Vegetativo',
      vegeDates: vegeStage
        ? `${formatFriendlyDate(vegeStage.startDate)} → ${formatFriendlyDate(vegeStage.endDate, { isProjected: vegeStage.isProjected })}`
        : null,
      floraDates: floraStage
        ? `${formatFriendlyDate(floraStage.startDate, { isProjected: !floraStage.isActual })} → ${formatFriendlyDate(floraStage.endDate, { isProjected: true })}`
        : null,
      harvestDate: formatFriendlyDate(schedule.estimatedHarvestDate, { isProjected: true }),
      startDateFormatted: formatFriendlyDate(schedule.cropStartDate),
    };
  }, [cultivation, geneticsList]);

  return (
    <section id="crop-lifecycle-card-section" className="cultiveta-card p-5 sm:p-6 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-extrabold text-ink">Ciclo del cultivo</h3>
          {timeline.progressPct !== null ? (
            <span className="text-xs font-bold text-ok-ink">{timeline.progressPct}% del ciclo estimado</span>
          ) : (
            <span className="text-xs font-bold text-brand">Inicio de ciclo no registrado</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {timeline.elapsedDays !== null && timeline.totalCycleDays !== null ? (
            <span className="text-xs text-ink-muted font-semibold">
              Día {timeline.elapsedDays} de ~{timeline.totalCycleDays}
            </span>
          ) : (
            <span className="text-xs text-ink-muted font-semibold">
              Día {timeline.activeStageElapsedDays} en {timeline.currentStageName}
            </span>
          )}
          <button
            type="button"
            id="toggle-lifecycle-details-btn"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
            className="min-h-11 text-xs font-bold text-brand hover:underline cursor-pointer flex items-center gap-1"
          >
            <span>{showDetails ? 'Ocultar etapas' : 'Ver etapas'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <div className="relative w-full h-3 bg-track rounded-full overflow-hidden">
        <motion.div
          key={`cycle-progress-bar-${cultivation.id}`}
          id="cycle-progress-bar-fill"
          className="h-full cultiveta-stage-progress rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${timeline.roadmapProgressPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-ink-muted pt-1 px-0.5">
        <div className="text-left">
          <span className="block font-bold text-ink">Siembra</span>
          <span className="text-[10px] text-ink-muted block mt-0.5">
            {timeline.isCycleStartKnown ? timeline.startDateFormatted : 'Sin fecha registrada'}
          </span>
        </div>
        <div className="text-left sm:text-center">
          <span className="block font-bold text-ink">Vegetativo</span>
          {timeline.vegeDates && <span className="text-[10px] text-ink-muted block mt-0.5 truncate">{timeline.vegeDates}</span>}
        </div>
        <div className="text-left sm:text-center">
          <span className="block font-bold text-ink">Floración</span>
          {timeline.floraDates && <span className="text-[10px] text-ink-muted block mt-0.5 truncate">{timeline.floraDates}</span>}
        </div>
        <div className="text-left sm:text-right">
          <span className="block font-bold text-ink">Cosecha</span>
          <span className="text-[10px] text-ink-muted block mt-0.5">{timeline.harvestDate}</span>
        </div>
      </div>

      {showDetails && (
        <div
          id="crop-lifecycle-stage-breakdown"
          className="pt-3 border-t border-chip-line grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs animate-in fade-in duration-200"
        >
          {timeline.milestones.map((m, mIdx) => {
            let tag = 'Estimada';
            if (m.isCurrent || mIdx === timeline.schedule.activeStageIndex) {
              tag = 'Actual';
            } else if (mIdx < timeline.schedule.activeStageIndex) {
              if (m.dateKnowledge === 'unknown' || m.isUnknown || !m.startDate) {
                tag = 'Anterior · Sin fecha';
              } else if (m.dateKnowledge === 'actual' || (m.startIsReal && m.endIsReal)) {
                tag = 'Anterior · Real';
              } else {
                tag = 'Anterior · Parcial';
              }
            }

            const dateText =
              m.dateKnowledge === 'unknown' || m.isUnknown || !m.startDate
                ? 'Sin fecha registrada'
                : `${formatFriendlyDate(m.startDate, { isProjected: !m.isActual })} → ${formatFriendlyDate(m.endDate, { isProjected: m.isProjected })}`;

            return (
              <div
                key={m.id}
                className={`p-3 rounded-xl border transition-all ${
                  m.isCurrent
                    ? 'bg-ok/10 border-ok/40 text-ink font-bold shadow-2xs'
                    : m.isReached
                      ? 'bg-track border-chip-line text-ink'
                      : 'bg-white border-chip-line text-ink-muted'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-ink-muted uppercase tracking-wider block">{tag}</span>
                  {m.isCurrent && <span className="w-2 h-2 rounded-full bg-ok animate-pulse" title="Etapa actual" />}
                </div>
                <span className="block font-bold truncate">{m.name}</span>
                <span className="text-[10px] text-ink-muted block mt-0.5">{dateText}</span>
                <span className="text-[10px] text-ink-muted block mt-0.5">{m.durationDays} días</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
