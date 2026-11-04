import React, { useState, useMemo } from 'react';
import {
  Flower2,
  Clock,
  ChevronDown,
  Droplets,
  Camera,
  Sparkles,
  Info,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { Cultivation, Genetics } from '../../types';
import {
  buildCultivationStageSchedule,
  formatFriendlyDate,
  daysBetween,
  getLocalTodayDateOnly,
  isFloweringStage,
  floraPhaseOf,
  MATURATION_DAYS,
  PREFLORA_DAYS,
} from '../../utils/growthStageUtils';

export interface FloweringProgressSectionProps {
  cultivation: Cultivation;
  geneticsList?: Genetics[];
  onOpenWateringModal?: () => void;
  onOpenPhotoModal?: () => void;
  onOpenAIAssistant?: () => void;
}

export const FloweringProgressSection: React.FC<FloweringProgressSectionProps> = ({
  cultivation,
  geneticsList = [],
  onOpenWateringModal,
  onOpenPhotoModal,
  onOpenAIAssistant,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // 1. Single source of truth calculation using centralized schedule builder
  const schedule = useMemo(() => {
    return buildCultivationStageSchedule(cultivation, geneticsList);
  }, [cultivation, geneticsList]);

  // 2. Flowering stage specifics
  const analysis = useMemo(() => {
    const florStage = schedule.floweringStage;
    const todayStr = getLocalTodayDateOnly();

    const startDateStr = florStage?.startDate || cultivation.floweringStartDate || (isFloweringStage(cultivation.currentStage) ? cultivation.stageStartDate : todayStr);
    const startIsReal = Boolean(cultivation.floweringStartDate || florStage?.startIsReal || (isFloweringStage(cultivation.currentStage) && cultivation.stageStartDate));
    const floweringDaysElapsed = Math.max(1, daysBetween(startDateStr, todayStr));
    const typicalFloweringDays = schedule.floweringDaysGenetics || 56;
    const typicalFloweringWeeks = schedule.floweringWeeksGenetics || 8;

    const progressPercentage = Math.min(
      100,
      Math.max(1, Math.round((floweringDaysElapsed / typicalFloweringDays) * 100))
    );

    const daysUntilHarvest = schedule.daysUntilHarvest;
    const daysRemaining = daysUntilHarvest !== undefined ? daysUntilHarvest : Math.max(0, typicalFloweringDays - floweringDaysElapsed);
    const weeksRemaining = Math.ceil(daysRemaining / 7);
    const currentWeekNumber = Math.max(1, Math.ceil(floweringDaysElapsed / 7));
    const currentDayInWeek = ((floweringDaysElapsed - 1) % 7) + 1;

    // Matched genetics info
    const matchedGenetics =
      geneticsList.find(
        (g) =>
          g.id === cultivation.geneticsId ||
          (g.name &&
            cultivation.geneticsName &&
            g.name.toLowerCase().trim() === cultivation.geneticsName.toLowerCase().trim())
      ) || null;

    const geneticsName = matchedGenetics?.name || cultivation.geneticsName || 'Genética híbrida';
    const seedBank = matchedGenetics?.seedBank || cultivation.seedBank || '';

    // Sub-fases dentro de la floración, por días desde el 12/12: preflora (semanas 1–3), engorde,
    // compactación y, los últimos días, maduración y lavado de raíces (todo dentro de los días de la genética).
    const floraDay = Math.max(1, daysBetween(startDateStr, todayStr) + 1);
    const phase = floraPhaseOf(floraDay, typicalFloweringDays);
    const prefloraEnd = Math.min(PREFLORA_DAYS, Math.round(typicalFloweringDays * 0.4));
    const maturationStart = typicalFloweringDays - MATURATION_DAYS;
    const midEngorde = Math.round((prefloraEnd + maturationStart) / 2);
    let subPhase = {
      title: 'Fase 1: Preflora (estiramiento y primeros pelos)',
      stageName: `Preflora (días 1-${prefloraEnd})`,
      description: 'Empieza el día del 12/12: estiramiento vertical de las ramas y aparición de los primeros pistilos blancos.',
      advice: 'Mantener el balance nutricional y regular la altura de las luces para que no se estire de más.',
      badgeColor: 'bg-ok/15 text-ok-ink border-ok/30',
    };
    if (phase === 'engorde' && floraDay <= midEngorde) {
      subPhase = {
        title: 'Fase 2: Formación y engorde de cálices',
        stageName: `Engorde (días ${prefloraEnd + 1}-${midEngorde})`,
        description: 'Termina el estiramiento. Desarrollo masivo de flores y primeros tricomas.',
        advice: 'Pico de nutrición PK (fósforo y potasio), humedad por debajo de 55 % y defoliación si corresponde.',
        badgeColor: 'bg-warn-line/25 text-[#735308] border-warn-line/40',
      };
    } else if (phase === 'engorde') {
      subPhase = {
        title: 'Fase 3: Compactación y resina',
        stageName: `Engorde final (días ${midEngorde + 1}-${maturationStart})`,
        description: 'Engorde final, terpenos y tricomas que se van volviendo lechosos.',
        advice: 'Reducir el nitrógeno, no mojar los cogollos y asegurar ventilación continua para prevenir botrytis.',
        badgeColor: 'bg-brand/15 text-brand border-brand/30',
      };
    } else if (phase === 'maduracion' && (daysUntilHarvest === undefined || daysUntilHarvest > 2)) {
      subPhase = {
        title: 'Fase 4: Maduración y lavado de raíces',
        stageName: `Maduración (últimos ${MATURATION_DAYS} días)`,
        description: 'Pistilos oxidados en su mayoría. La planta consume sus reservas.',
        advice: 'Regar con agua sola reposada o desclorada para limpiar las sales del sustrato.',
        badgeColor: 'bg-coral/15 text-coral border-coral/30',
      };
    } else if (phase === 'maduracion' && daysUntilHarvest === 0) {
      subPhase = {
        title: 'Ventana estimada de cosecha',
        stageName: 'Ventana de cosecha',
        description: 'Confirmá la madurez mirando los tricomas.',
        advice: 'Buscar 70-80 % de tricomas lechosos y 15-20 % ámbar antes de cortar.',
        badgeColor: 'bg-ok-ink text-white border-ok',
      };
    } else if (phase === 'maduracion') {
      subPhase = {
        title: 'Cosecha estimada muy cerca',
        stageName: `Cosecha próxima (~${daysUntilHarvest}d)`,
        description: 'Revisá los tricomas antes de cortar.',
        advice: 'Confirmá la madurez de la resina con lupa o microscopio en los cálices del medio.',
        badgeColor: 'bg-ok-ink text-white border-ok',
      };
    }

    // Hitos, contados desde el día del 12/12
    const milestones = [
      { week: 1, title: 'Inicio 12/12', subtitle: 'Arranca la preflora', isPassed: floraDay >= 1, isCurrent: phase === 'preflora' },
      { week: Math.ceil(prefloraEnd / 7), title: 'Fin del estiramiento', subtitle: 'Primeros pelos y canopia formada', isPassed: floraDay > prefloraEnd, isCurrent: floraDay > prefloraEnd && floraDay <= midEngorde },
      { week: Math.ceil(midEngorde / 7), title: 'Pico de engorde', subtitle: 'Nutrición PK máxima', isPassed: floraDay > midEngorde, isCurrent: floraDay > midEngorde && floraDay <= maturationStart },
      { week: Math.ceil((maturationStart + 1) / 7), title: 'Lavado de raíces', subtitle: 'Tricomas lechosos', isPassed: floraDay > maturationStart, isCurrent: phase === 'maduracion' && daysRemaining > 2 },
      { week: Math.ceil(typicalFloweringWeeks), title: 'Corte estimado', subtitle: `~${typicalFloweringDays} días desde el 12/12`, isPassed: daysRemaining === 0 && floraDay >= typicalFloweringDays, isCurrent: daysRemaining <= 2 },
    ];

    return {
      startDateStr,
      floweringDaysElapsed,
      typicalFloweringDays,
      typicalFloweringWeeks,
      progressPercentage,
      daysRemaining,
      weeksRemaining,
      currentWeekNumber,
      currentDayInWeek,
      geneticsName,
      seedBank,
      subPhase,
      milestones,
      estimatedHarvestDate: schedule.estimatedHarvestDate,
      startIsReal,
    };
  }, [schedule, cultivation, geneticsList]);

  return (
    <div
      id="flowering-progress-section"
      className="bg-white rounded-[32px] p-6 sm:p-8 border border-line shadow-xs relative overflow-hidden space-y-5 text-ink"
    >
      {/* Primera Capa: Resumen Inmediato y Progreso Visual */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-coral/15 text-coral border border-coral/30 flex items-center justify-center shrink-0">
            <Flower2 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg sm:text-xl font-black text-ink">
                Floración 🌸
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-coral/15 text-coral border border-coral/30 text-xs font-bold">
                Semana {analysis.currentWeekNumber} de ~{analysis.typicalFloweringWeeks}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              {analysis.geneticsName} {analysis.seedBank ? `· ${analysis.seedBank}` : ''}
            </p>
          </div>
        </div>

        {/* Fechas de inicio y corte estimado en primera capa */}
        <div className="flex items-center gap-4 text-xs font-semibold self-stretch sm:self-auto justify-between sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
          <div>
            <span className="text-[10px] text-ink-subtle block uppercase tracking-wider">
              {analysis.startIsReal ? 'Inicio real' : 'Inicio estimado'}
            </span>
            <span className="font-bold text-ink block">
              {formatFriendlyDate(analysis.startDateStr, { isProjected: !analysis.startIsReal })}
            </span>
          </div>
          <span className="text-line">→</span>
          <div>
            <span className="text-[10px] text-ink-subtle block uppercase tracking-wider">Corte estimado</span>
            <span className="font-bold text-brand block">
              {formatFriendlyDate(analysis.estimatedHarvestDate, { isProjected: true })}
            </span>
          </div>
          <div className="text-right pl-2 sm:border-l sm:border-line">
            <span className="text-[10px] text-ink-subtle block uppercase tracking-wider">Faltan aprox.</span>
            <span className="font-extrabold text-coral block">
              {analysis.daysRemaining === 0
                ? 'Ventana de cosecha'
                : analysis.daysRemaining <= 2
                ? `Cosecha muy cerca (~${analysis.daysRemaining}d)`
                : `${analysis.daysRemaining} días`}
            </span>
          </div>
        </div>
      </div>

      {/* Barra visual de progreso */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between items-baseline text-xs font-bold">
          <span className="text-ink-muted">
            Día {analysis.floweringDaysElapsed} de ~{analysis.typicalFloweringDays} días florales
          </span>
          <span className="text-sm font-black text-coral">
            {analysis.progressPercentage}%
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-track border border-line overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-ok via-warn-line to-coral rounded-full transition-all duration-700"
            style={{ width: `${analysis.progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Botón de Progressive Disclosure: Ver detalle de floración */}
      <div className="pt-2 flex justify-between items-center border-t border-line">
        <span className="text-xs font-semibold text-ink-muted">
          {analysis.subPhase.title}
        </span>
        <button
          type="button"
          id="toggle-flowering-details-btn"
          onClick={() => setShowDetails((prev) => !prev)}
          className="text-xs font-bold text-brand hover:underline cursor-pointer inline-flex items-center gap-1.5 py-1 px-2.5 rounded-xl hover:bg-brand/10 transition-colors"
        >
          <span>{showDetails ? 'Ocultar detalle' : 'Ver detalle de floración'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              showDetails ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Capa de Detalles de Floración Expandible */}
      {showDetails && (
        <div className="pt-3 space-y-4 animate-in fade-in duration-200 border-t border-line">
          {/* Subfase actual y consejo botánico */}
          <div className="p-4 rounded-2xl bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${analysis.subPhase.badgeColor}`}>
                {analysis.subPhase.stageName}
              </span>
              <span className="text-xs text-ink-subtle font-semibold">
                Día {analysis.currentDayInWeek} de la semana floral {analysis.currentWeekNumber}
              </span>
            </div>
            <p className="text-xs text-ink leading-relaxed">
              {analysis.subPhase.description}
            </p>
            <div className="p-3 rounded-xl bg-white border border-line text-xs text-ink-muted flex items-start gap-2 mt-1">
              <Info className="w-4 h-4 text-warn-line shrink-0 mt-0.5" />
              <span><strong>Consejo botánico:</strong> {analysis.subPhase.advice}</span>
            </div>
          </div>

          {/* Hitos semanales de floración */}
          <div className="space-y-2">
            <span className="text-xs font-extrabold text-ink uppercase tracking-wider block">
              Hitos de la Floración
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {analysis.milestones.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all ${
                    m.isCurrent
                      ? 'bg-coral/10 border-coral/40 text-ink font-bold shadow-2xs'
                      : m.isPassed
                      ? 'bg-track border-line text-ink'
                      : 'bg-white border-line text-ink-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-ink-subtle">
                      Sem. {m.week}
                    </span>
                    {m.isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-ok" />}
                  </div>
                  <span className="block font-bold text-xs truncate">{m.title}</span>
                  <span className="text-[10px] text-ink-muted block mt-0.5">{m.subtitle}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones Rápidas */}
          <div className="pt-2 flex flex-wrap items-center gap-2 justify-end">
            {onOpenWateringModal && (
              <button
                type="button"
                onClick={onOpenWateringModal}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-track border border-line text-xs font-bold text-ink transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Droplets className="w-3.5 h-3.5 text-ok" />
                <span>Riego de Flora</span>
              </button>
            )}

            {onOpenPhotoModal && (
              <button
                type="button"
                onClick={onOpenPhotoModal}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-track border border-line text-xs font-bold text-ink transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Camera className="w-3.5 h-3.5 text-brand" />
                <span>Foto de Cogollos</span>
              </button>
            )}

            {onOpenAIAssistant && (
              <button
                type="button"
                onClick={onOpenAIAssistant}
                className="px-3.5 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Consultar por Tricomas</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
