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
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const startDateStr = florStage ? florStage.startDate : (cultivation.floweringStartDate || cultivation.startDate);
    const floweringDaysElapsed = Math.max(1, daysBetween(startDateStr, todayStr));
    const typicalFloweringDays = schedule.floweringDaysGenetics || 56;
    const typicalFloweringWeeks = schedule.floweringWeeksGenetics || 8;

    const progressPercentage = Math.min(
      100,
      Math.max(1, Math.round((floweringDaysElapsed / typicalFloweringDays) * 100))
    );

    const daysRemaining = Math.max(0, typicalFloweringDays - floweringDaysElapsed);
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

    // Sub-fases fenológicas
    let subPhase = {
      title: 'Fase 1: Transición & Estiramiento (Stretch)',
      stageName: 'Floración Inicial (Sem. 1-2)',
      description: 'Aparición de primeros pistilos blancos y estiramiento vertical acelerado de ramas.',
      advice: 'Mantener balance nutricional, regular altura de luces para evitar espigado excesivo.',
      badgeColor: 'bg-[#62B95B]/15 text-[#2d6b28] border-[#62B95B]/30',
    };

    if (progressPercentage >= 25 && progressPercentage < 55) {
      subPhase = {
        title: 'Fase 2: Formación y Engorde de Cálices',
        stageName: 'Floración Media (Sem. 3-5)',
        description: 'Detención del crecimiento vertical. Desarrollo masivo de flores y primeros tricomas.',
        advice: 'Pico de nutrición PK (Fósforo y Potasio), controlar humedad relativa (<55% HR) y realizar defoliación si corresponde.',
        badgeColor: 'bg-[#F3C843]/25 text-[#735308] border-[#F3C843]/40',
      };
    } else if (progressPercentage >= 55 && progressPercentage < 80) {
      subPhase = {
        title: 'Fase 3: Compactación y Densidad de Resina',
        stageName: 'Floración Avanzada (Sem. 6-7)',
        description: 'Engorde final, proliferación de terpenos y tricomas volviéndose lechosos.',
        advice: 'Reducir nitrógeno, evitar mojar cogollos y asegurar ventilación continua para prevenir botrytis.',
        badgeColor: 'bg-[#6C45C7]/15 text-[#6C45C7] border-[#6C45C7]/30',
      };
    } else if (progressPercentage >= 80 && progressPercentage < 100) {
      subPhase = {
        title: 'Fase 4: Maduración Final & Lavado de Raíces',
        stageName: 'Maduración (Sem. 8+)',
        description: 'Pistilos oxidados en su mayoría. Consumo de reservas foliares.',
        advice: 'Regar con agua sola reposada/desclorada para limpiar sales acumuladas del sustrato.',
        badgeColor: 'bg-[#EB7864]/15 text-[#EB7864] border-[#EB7864]/30',
      };
    } else {
      subPhase = {
        title: 'Fase 5: Ventana Óptima de Cosecha',
        stageName: 'Lista para Cosechar (100%)',
        description: 'Genética cumplió su tiempo teórico. Monitorear tricomas con lupa o microscopio.',
        advice: 'Buscar 70-80% tricomas lechosos y 15-20% ámbar antes de cortar.',
        badgeColor: 'bg-[#62B95B] text-white border-[#62B95B]',
      };
    }

    // Milestones
    const milestones = [
      {
        week: 1,
        title: 'Inicio 12/12',
        subtitle: 'Primeros pistilos',
        isPassed: floweringDaysElapsed >= 1,
        isCurrent: progressPercentage < 25,
      },
      {
        week: 2,
        title: 'Fin Stretch',
        subtitle: 'Canopia formada',
        isPassed: progressPercentage >= 25,
        isCurrent: progressPercentage >= 25 && progressPercentage < 50,
      },
      {
        week: 4,
        title: 'Pico Engorde',
        subtitle: 'Nutrición PK máx',
        isPassed: progressPercentage >= 50,
        isCurrent: progressPercentage >= 50 && progressPercentage < 75,
      },
      {
        week: 7,
        title: 'Tricomas Lechosos',
        subtitle: 'Lavado de raíces',
        isPassed: progressPercentage >= 75,
        isCurrent: progressPercentage >= 75 && progressPercentage < 100,
      },
      {
        week: Math.ceil(typicalFloweringWeeks),
        title: 'Corte Estimado',
        subtitle: `~${typicalFloweringDays} días`,
        isPassed: progressPercentage >= 100,
        isCurrent: progressPercentage >= 100,
      },
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
    };
  }, [schedule, cultivation, geneticsList]);

  return (
    <div
      id="flowering-progress-section"
      className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-5 text-[#29202F]"
    >
      {/* Primera Capa: Resumen Inmediato y Progreso Visual */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EB7864]/15 text-[#EB7864] border border-[#EB7864]/30 flex items-center justify-center shrink-0">
            <Flower2 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg sm:text-xl font-black text-[#29202F]">
                Floración 🌸
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#EB7864]/15 text-[#EB7864] border border-[#EB7864]/30 text-xs font-bold">
                Semana {analysis.currentWeekNumber} de ~{analysis.typicalFloweringWeeks}
              </span>
            </div>
            <p className="text-xs text-[#6E5D77] mt-0.5">
              {analysis.geneticsName} {analysis.seedBank ? `· ${analysis.seedBank}` : ''}
            </p>
          </div>
        </div>

        {/* Fechas de inicio y corte estimado en primera capa */}
        <div className="flex items-center gap-4 text-xs font-semibold self-stretch sm:self-auto justify-between sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EFE3CF]">
          <div>
            <span className="text-[10px] text-[#9887A2] block uppercase tracking-wider">Inicio real</span>
            <span className="font-bold text-[#29202F] block">
              {formatFriendlyDate(analysis.startDateStr)}
            </span>
          </div>
          <span className="text-[#DECDB3]">→</span>
          <div>
            <span className="text-[10px] text-[#9887A2] block uppercase tracking-wider">Corte estimado</span>
            <span className="font-bold text-[#6C45C7] block">
              {formatFriendlyDate(analysis.estimatedHarvestDate, { isProjected: true })}
            </span>
          </div>
          <div className="text-right pl-2 sm:border-l sm:border-[#EFE3CF]">
            <span className="text-[10px] text-[#9887A2] block uppercase tracking-wider">Faltan aprox.</span>
            <span className="font-extrabold text-[#EB7864] block">
              {analysis.daysRemaining === 0 ? '¡Listo para cosechar!' : `${analysis.daysRemaining} días`}
            </span>
          </div>
        </div>
      </div>

      {/* Barra visual de progreso */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between items-baseline text-xs font-bold">
          <span className="text-[#6E5D77]">
            Día {analysis.floweringDaysElapsed} de ~{analysis.typicalFloweringDays} días florales
          </span>
          <span className="text-sm font-black text-[#EB7864]">
            {analysis.progressPercentage}%
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-[#FAF2E1] border border-[#EFE3CF] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#62B95B] via-[#F3C843] to-[#EB7864] rounded-full transition-all duration-700"
            style={{ width: `${analysis.progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Botón de Progressive Disclosure: Ver detalle de floración */}
      <div className="pt-2 flex justify-between items-center border-t border-[#EFE3CF]">
        <span className="text-xs font-semibold text-[#6E5D77]">
          {analysis.subPhase.title}
        </span>
        <button
          type="button"
          id="toggle-flowering-details-btn"
          onClick={() => setShowDetails((prev) => !prev)}
          className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer inline-flex items-center gap-1.5 py-1 px-2.5 rounded-xl hover:bg-[#6C45C7]/10 transition-colors"
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
        <div className="pt-3 space-y-4 animate-in fade-in duration-200 border-t border-[#EFE3CF]">
          {/* Subfase actual y consejo botánico */}
          <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${analysis.subPhase.badgeColor}`}>
                {analysis.subPhase.stageName}
              </span>
              <span className="text-xs text-[#9887A2] font-semibold">
                Día {analysis.currentDayInWeek} de la semana floral {analysis.currentWeekNumber}
              </span>
            </div>
            <p className="text-xs text-[#29202F] leading-relaxed">
              {analysis.subPhase.description}
            </p>
            <div className="p-3 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#6E5D77] flex items-start gap-2 mt-1">
              <Info className="w-4 h-4 text-[#F3C843] shrink-0 mt-0.5" />
              <span><strong>Consejo botánico:</strong> {analysis.subPhase.advice}</span>
            </div>
          </div>

          {/* Hitos semanales de floración */}
          <div className="space-y-2">
            <span className="text-xs font-extrabold text-[#29202F] uppercase tracking-wider block">
              Hitos de la Floración
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {analysis.milestones.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all ${
                    m.isCurrent
                      ? 'bg-[#EB7864]/10 border-[#EB7864]/40 text-[#29202F] font-bold shadow-2xs'
                      : m.isPassed
                      ? 'bg-[#FAF2E1] border-[#EFE3CF] text-[#29202F]'
                      : 'bg-white border-[#EFE3CF] text-[#9887A2]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-bold text-[#9887A2]">
                      Sem. {m.week}
                    </span>
                    {m.isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-[#62B95B]" />}
                  </div>
                  <span className="block font-bold text-xs truncate">{m.title}</span>
                  <span className="text-[10px] text-[#6E5D77] block mt-0.5">{m.subtitle}</span>
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
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-xs font-bold text-[#29202F] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Droplets className="w-3.5 h-3.5 text-[#62B95B]" />
                <span>Riego de Flora</span>
              </button>
            )}

            {onOpenPhotoModal && (
              <button
                type="button"
                onClick={onOpenPhotoModal}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-xs font-bold text-[#29202F] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Camera className="w-3.5 h-3.5 text-[#6C45C7]" />
                <span>Foto de Cogollos</span>
              </button>
            )}

            {onOpenAIAssistant && (
              <button
                type="button"
                onClick={onOpenAIAssistant}
                className="px-3.5 py-2 rounded-xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#6C45C7] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
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
