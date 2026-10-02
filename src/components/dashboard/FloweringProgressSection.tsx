import React, { useState, useMemo } from 'react';
import {
  Flower2,
  Sparkles,
  Calendar,
  Clock,
  Scissors,
  Droplets,
  Camera,
  ChevronRight,
  Info,
  Layers,
  Timer,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import { Cultivation, Genetics } from '../../types';
import { cultivationService } from '../../services/cultivationService';

export interface FloweringProgressSectionProps {
  cultivations: Cultivation[];
  geneticsList?: Genetics[];
  onSelectCultivation: (cultivation: Cultivation) => void;
  onOpenWateringModal?: (cultivation?: Cultivation) => void;
  onOpenPhotoModal?: (cultivation?: Cultivation) => void;
  onOpenAIAssistant?: (cultivation?: Cultivation) => void;
}

export interface FloweringAnalysisResult {
  cultivation: Cultivation;
  matchedGenetics: Genetics | null;
  geneticsName: string;
  seedBank: string;
  floweringDaysElapsed: number;
  floweringWeeksElapsed: number;
  currentDayInWeek: number;
  typicalFloweringDays: number;
  typicalFloweringWeeks: number;
  progressPercentage: number;
  daysRemaining: number;
  weeksRemaining: number;
  estimatedHarvestDate: Date;
  estimatedHarvestDateStr: string;
  floweringStartDateStr: string;
  currentWeekNumber: number;
  subPhase: {
    title: string;
    stageName: string;
    description: string;
    advice: string;
    badgeColor: string;
    barColor: string;
  };
  milestones: Array<{
    week: number;
    pct: number;
    title: string;
    subtitle: string;
    isPassed: boolean;
    isCurrent: boolean;
  }>;
}

export const FloweringProgressSection: React.FC<FloweringProgressSectionProps> = ({
  cultivations,
  geneticsList = [],
  onSelectCultivation,
  onOpenWateringModal,
  onOpenPhotoModal,
  onOpenAIAssistant,
}) => {
  // 1. Filtrar cultivos activos que estén en fase de floración o prefloración
  const floweringCrops = useMemo(() => {
    return cultivations.filter((c) => {
      if (c.isFinished || c.status?.toLowerCase() === 'cosechado') return false;
      const stageLower = (c.currentStage || '').toLowerCase();
      return (
        stageLower.includes('flor') ||
        stageLower.includes('madur') ||
        stageLower.includes('preflor') ||
        Boolean(c.floweringStartDate)
      );
    });
  }, [cultivations]);

  // Selección de cultivo actual a visualizar (permite alternar si hay múltiples)
  const [selectedCropId, setSelectedCropId] = useState<string>('');

  // Sincronizar el cultivo seleccionado por defecto
  const activeCrop = useMemo(() => {
    if (floweringCrops.length === 0) return null;
    const found = floweringCrops.find((c) => c.id === selectedCropId);
    return found || floweringCrops[0];
  }, [floweringCrops, selectedCropId]);

  // 2. Cálculo detallado de días transcurridos vs duración típica de la genética
  const analysis: FloweringAnalysisResult | null = useMemo(() => {
    if (!activeCrop) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Días transcurridos en floración:
    let floweringStartDateStr = activeCrop.floweringStartDate;
    if (!floweringStartDateStr && activeCrop.currentStage === 'Floración') {
      floweringStartDateStr = activeCrop.stageStartDate || activeCrop.startDate;
    }
    if (!floweringStartDateStr) {
      floweringStartDateStr = activeCrop.startDate;
    }

    const fStartDate = new Date(floweringStartDateStr);
    fStartDate.setHours(0, 0, 0, 0);

    // Diferencia exacta en días
    const diffMs = Math.max(0, today.getTime() - fStartDate.getTime());
    const floweringDaysElapsed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const floweringWeeksElapsed = Math.floor(floweringDaysElapsed / 7);
    const currentDayInWeek = (floweringDaysElapsed % 7) || 7;
    const currentWeekNumber = Math.max(1, Math.ceil(floweringDaysElapsed / 7));

    // Búsqueda de la genética seleccionada
    const matchedGenetics =
      geneticsList.find(
        (g) =>
          g.id === activeCrop.geneticsId ||
          (g.name && activeCrop.geneticsName && g.name.toLowerCase().trim() === activeCrop.geneticsName.toLowerCase().trim())
      ) || null;

    const geneticsName = matchedGenetics?.name || activeCrop.geneticsName || 'Genética híbrida';
    const seedBank = matchedGenetics?.seedBank || activeCrop.seedBank || 'Banco seleccionado';

    // Determinar la duración típica de floración según la genética
    let typicalFloweringDays = 56; // 8 semanas por defecto

    if (matchedGenetics?.declaredFloweringDays && matchedGenetics.declaredFloweringDays > 0) {
      typicalFloweringDays = matchedGenetics.declaredFloweringDays;
    } else if (activeCrop.declaredFloweringWeeks && activeCrop.declaredFloweringWeeks > 0) {
      typicalFloweringDays = activeCrop.declaredFloweringWeeks * 7;
    } else if (matchedGenetics?.declaredFloweringWeeks && matchedGenetics.declaredFloweringWeeks > 0) {
      typicalFloweringDays = matchedGenetics.declaredFloweringWeeks * 7;
    } else if (activeCrop.stagesTimeline && activeCrop.stagesTimeline.length > 0) {
      const florStage = activeCrop.stagesTimeline.find((s) => s.name?.toLowerCase().includes('flor'));
      if (florStage?.expectedDurationDays && florStage.expectedDurationDays > 0) {
        typicalFloweringDays = florStage.expectedDurationDays;
      }
    }

    const typicalFloweringWeeks = Math.round((typicalFloweringDays / 7) * 10) / 10;

    // Cálculo del porcentaje de avance (0% a 100%+)
    const rawProgress = (floweringDaysElapsed / typicalFloweringDays) * 100;
    const progressPercentage = Math.min(100, Math.max(1, Math.round(rawProgress)));

    // Días y semanas restantes
    const daysRemaining = Math.max(0, typicalFloweringDays - floweringDaysElapsed);
    const weeksRemaining = Math.ceil(daysRemaining / 7);

    // Fecha estimada de cosecha
    const estimatedHarvestDate = new Date(fStartDate);
    estimatedHarvestDate.setDate(estimatedHarvestDate.getDate() + typicalFloweringDays);

    const estimatedHarvestDateStr = estimatedHarvestDate.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    // Sub-fases fenológicas de floración
    let subPhase = {
      title: 'Fase 1: Transición & Estiramiento (Stretch)',
      stageName: 'Floración Inicial (Sem. 1-2)',
      description: 'Aparición de primeros pistilos blancos y estiramiento vertical acelerado de ramas.',
      advice: 'Mantener fósforo y nitrógeno balanceado, ajustar distancia de luminarias para evitar espigado excesivo.',
      badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      barColor: 'from-emerald-500 to-teal-400',
    };

    if (progressPercentage >= 25 && progressPercentage < 55) {
      subPhase = {
        title: 'Fase 2: Formación y Engorde de Cálices',
        stageName: 'Floración Media (Sem. 3-5)',
        description: 'Detención del crecimiento vertical. Desarrollo masivo de cálices florales y primeros tricomas glandulares.',
        advice: 'Pico de nutrición PK (Fósforo y Potasio), controlar humedad relativa (<55% HR) y realizar defoliación estratégica.',
        badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        barColor: 'from-amber-500 to-orange-400',
      };
    } else if (progressPercentage >= 55 && progressPercentage < 80) {
      subPhase = {
        title: 'Fase 3: Compactación y Densidad de Resina',
        stageName: 'Floración Avanzada (Sem. 6-7)',
        description: 'Engorde final, engrosamiento de cogollos y proliferación máxima de terpenos. Tricomas volviéndose lechosos.',
        advice: 'Reducir nitrógeno drásticamente, evitar mojar flores y asegurar ventilación continua para prevenir botrytis.',
        badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        barColor: 'from-purple-500 to-pink-500',
      };
    } else if (progressPercentage >= 80 && progressPercentage < 100) {
      subPhase = {
        title: 'Fase 4: Maduración Final & Lavado de Raíces',
        stageName: 'Maduración (Sem. 8+)',
        description: 'Pistilos en su mayoría oxidados (anaranjados/marrones). Consumo de reservas de clorofila de las hojas.',
        advice: 'Regar únicamente con agua osmotizada o reposada para limpiar sales del sustrato y mejorar ceniza y aroma.',
        badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        barColor: 'from-pink-500 via-rose-500 to-amber-400',
      };
    } else if (progressPercentage >= 100) {
      subPhase = {
        title: 'Fase 5: Ventana Óptima de Cosecha Alcanzada',
        stageName: 'Lista para Cosechar (100%)',
        description: 'La genética completó el tiempo teórico declarado. Tricomas en estado lechoso con 10-20% ámbar.',
        advice: 'Examinar cabezas de tricomas con lupa 60x. Realizar corte en periodo de oscuridad para conservar terpenos.',
        badgeColor: 'bg-amber-400 text-black border-amber-300 font-bold',
        barColor: 'from-amber-400 via-yellow-300 to-emerald-400',
      };
    }

    // Hitos para la barra visual (0%, 25%, 50%, 75%, 100%)
    const milestones = [
      {
        week: 1,
        pct: 0,
        title: 'Cambio 12/12',
        subtitle: 'Inicio de floración',
        isPassed: floweringDaysElapsed >= 1,
        isCurrent: progressPercentage < 25,
      },
      {
        week: 2,
        pct: 25,
        title: 'Fin Stretch',
        subtitle: 'Pistilos formados',
        isPassed: progressPercentage >= 25,
        isCurrent: progressPercentage >= 25 && progressPercentage < 50,
      },
      {
        week: 4,
        pct: 50,
        title: 'Pico Engorde',
        subtitle: 'Nutrición PK máx',
        isPassed: progressPercentage >= 50,
        isCurrent: progressPercentage >= 50 && progressPercentage < 75,
      },
      {
        week: 7,
        pct: 75,
        title: 'Tricomas Lechosos',
        subtitle: 'Inicio de lavado',
        isPassed: progressPercentage >= 75,
        isCurrent: progressPercentage >= 75 && progressPercentage < 100,
      },
      {
        week: Math.ceil(typicalFloweringWeeks),
        pct: 100,
        title: 'Cosecha Estimada',
        subtitle: `${typicalFloweringDays} días teóricos`,
        isPassed: progressPercentage >= 100,
        isCurrent: progressPercentage >= 100,
      },
    ];

    return {
      cultivation: activeCrop,
      matchedGenetics,
      geneticsName,
      seedBank,
      floweringDaysElapsed,
      floweringWeeksElapsed,
      currentDayInWeek,
      typicalFloweringDays,
      typicalFloweringWeeks,
      progressPercentage,
      daysRemaining,
      weeksRemaining,
      estimatedHarvestDate,
      estimatedHarvestDateStr,
      floweringStartDateStr,
      currentWeekNumber,
      subPhase,
      milestones,
    };
  }, [activeCrop, geneticsList]);

  // Si no hay cultivos en floración activa, mostrar un estado amigable e informativo
  if (floweringCrops.length === 0 || !analysis || !activeCrop) {
    const nextVegetativeCrop = cultivations.find(
      (c) => !c.isFinished && (c.currentStage === 'Vegetativo' || c.currentStage === 'Plántula')
    );

    return (
      <div
        id="flowering-progress-empty-section"
        className="bg-white rounded-[32px] p-6 sm:p-7 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#EB7864]/15 text-[#EB7864] border border-[#EB7864]/30 flex items-center justify-center shrink-0">
              <Flower2 className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#EB7864]">
                  Fenología Reproductiva
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#FAF2E1] text-[#6E5D77] text-[10px] font-semibold">
                  0 en Floración
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-[#29202F] mt-0.5">
                Avance Estimado de la Etapa de Floración
              </h3>
              <p className="text-xs text-[#6E5D77] mt-0.5">
                Calcula el progreso porcentual comparando los días transcurridos contra la duración típica de la genética.
              </p>
            </div>
          </div>

          {nextVegetativeCrop && (
            <button
              type="button"
              onClick={() => onSelectCultivation(nextVegetativeCrop)}
              className="px-4 py-2 rounded-2xl bg-[#FFFDF7] hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <span>Ver {nextVegetativeCrop.name} ({nextVegetativeCrop.currentStage})</span>
              <ChevronRight className="w-4 h-4 text-[#9887A2]" />
            </button>
          )}
        </div>

        <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#6E5D77] flex items-start gap-3.5">
          <Info className="w-5 h-5 text-[#F3C843] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[#29202F] font-bold">
              Actualmente no tienes carpas en etapa de <strong>Floración</strong> o <strong>Prefloración</strong>.
            </p>
            <p className="text-[#6E5D77] leading-relaxed">
              En cuanto cambies el fotoperiodo a 12/12 o tu cultivo pase a floración, este módulo calculará en tiempo real
              el porcentaje de avance de cogollos, la semana floral actual y la proyección exacta de cosecha de acuerdo a los días declarados por el banco de semillas de tu genética.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="flowering-progress-section"
      className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-6 animate-fade-in-up text-[#29202F]"
    >
      {/* Header superior: Título, insignias y selector de cultivo si hay más de 1 en flora */}
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#EFE3CF]">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#EB7864]/15 text-[#EB7864] border border-[#EB7864]/30 flex items-center justify-center shrink-0">
            <Flower2 className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#EB7864]">
                Monitoreo Fenológico Floral
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#EB7864]/15 text-[#EB7864] border border-[#EB7864]/30 text-[10px] font-bold">
                {analysis.currentWeekNumber}ª SEMANA
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#29202F] mt-0.5 flex items-center gap-2">
              <span>Avance Estimado de Floración</span>
            </h2>
            <p className="text-xs text-[#6E5D77] mt-0.5">
              Comparativa de días transcurridos vs duración típica de la genética seleccionada
            </p>
          </div>
        </div>

        {/* Selector de carpas en floración (si hay múltiples cultivos florando) */}
        {floweringCrops.length > 1 ? (
          <div className="flex items-center gap-1.5 bg-[#FFFDF7] p-1 rounded-2xl border border-[#EFE3CF] shrink-0">
            <span className="text-[10px] font-semibold text-[#6E5D77] px-2">Carpa:</span>
            {floweringCrops.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCropId(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeCrop.id === c.id
                    ? 'bg-[#EB7864] text-white shadow-xs font-bold'
                    : 'text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectCultivation(activeCrop)}
              className="px-3.5 py-2 rounded-2xl bg-[#FFFDF7] hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Ver Carpa</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[#9887A2]" />
            </button>
          </div>
        )}
      </div>

      {/* Hero Card de Avance: Visual Progress Bar + Porcentaje + Hitos */}
      <div className="relative z-10 p-6 rounded-3xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-6 shadow-xs">
        {/* Cabecera del Hero con datos clave del cultivo y porcentaje */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl sm:text-2xl font-black text-[#29202F] tracking-tight">
                {activeCrop.name}
              </h3>
              <span className="text-xs text-[#EB7864] font-semibold px-2 py-0.5 rounded-md bg-[#EB7864]/10 border border-[#EB7864]/20">
                {analysis.geneticsName}
              </span>
              {analysis.seedBank && (
                <span className="text-xs text-[#6E5D77] font-medium">
                  · {analysis.seedBank}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#6E5D77] mt-1">
              <span className="flex items-center gap-1 text-[#29202F] font-semibold">
                <Clock className="w-3.5 h-3.5 text-[#EB7864]" />
                Día {analysis.floweringDaysElapsed} de floración (Día {analysis.currentDayInWeek} de Sem. {analysis.currentWeekNumber})
              </span>
              <span>•</span>
              <span className="text-[#6E5D77]">
                Objetivo genético: {analysis.typicalFloweringDays} días (~{analysis.typicalFloweringWeeks} semanas)
              </span>
            </div>
          </div>

          {/* Gran Callout Numérico de Porcentaje */}
          <div className="flex items-baseline gap-2 shrink-0 bg-white px-4 py-2.5 rounded-2xl border border-[#EFE3CF] shadow-xs">
            <span className="text-3xl sm:text-4xl font-mono font-black text-[#EB7864] tracking-tight">
              {analysis.progressPercentage}%
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#9887A2]">
                Avance
              </span>
              <span className="text-[10px] text-[#6E5D77] font-medium">
                {analysis.daysRemaining === 0 ? 'Completado' : `Faltan ~${analysis.daysRemaining}d`}
              </span>
            </div>
          </div>
        </div>

        {/* BARRA DE PROGRESO VISUAL PRINCIPAL */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span>Progreso fenológico:</span>
              <span className="text-white font-bold">{analysis.floweringDaysElapsed} / {analysis.typicalFloweringDays} días</span>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${analysis.subPhase.badgeColor}`}>
              {analysis.subPhase.stageName}
            </span>
          </div>

          {/* Track contenedor con glow */}
          <div className="relative w-full h-5 sm:h-6 rounded-full bg-zinc-900/90 border border-zinc-800 p-0.5 overflow-hidden shadow-inner flex items-center">
            {/* Relleno con gradiente dinámico */}
            <div
              role="progressbar"
              aria-valuenow={analysis.progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${Math.min(100, Math.max(2, analysis.progressPercentage))}%` }}
              className={`h-full rounded-full bg-gradient-to-r ${analysis.subPhase.barColor} transition-all duration-1000 ease-out relative shadow-[0_0_16px_rgba(244,63,94,0.4)] flex items-center justify-end pr-2`}
            >
              {/* Brillo interno */}
              <div className="absolute inset-0 bg-white/10 rounded-full"></div>
              {analysis.progressPercentage >= 15 && (
                <span className="relative z-10 text-[10px] font-mono font-black text-black drop-shadow-xs select-none">
                  {analysis.progressPercentage}%
                </span>
              )}
            </div>

            {/* Marcadores de porcentaje discretos (25%, 50%, 75%) */}
            <div className="absolute inset-0 pointer-events-none flex justify-between px-1 items-center">
              <span className="w-px h-2.5 bg-zinc-700/60 ml-[25%]"></span>
              <span className="w-px h-3.5 bg-zinc-600 ml-[25%]"></span>
              <span className="w-px h-2.5 bg-zinc-700/60 ml-[25%]"></span>
            </div>
          </div>

          {/* Marcadores / Hitos debajo de la barra */}
          <div className="grid grid-cols-5 text-center gap-1 pt-1">
            {analysis.milestones.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col items-center text-[10px] transition-colors ${
                  m.isCurrent
                    ? 'text-rose-400 font-bold'
                    : m.isPassed
                    ? 'text-zinc-300 font-medium'
                    : 'text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-1">
                  {m.isPassed ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
                  )}
                  <span className="font-mono">{m.pct}%</span>
                </div>
                <span className="truncate max-w-full font-semibold mt-0.5">{m.title}</span>
                <span className="hidden sm:inline text-[9px] text-zinc-500 truncate max-w-full">{m.subtitle}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sub-fase actual y recomendaciones agronómicas */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-bold text-white">{analysis.subPhase.title}</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              {analysis.subPhase.description}
            </p>
            <p className="text-zinc-300 text-[11px] pt-0.5">
              <strong className="text-rose-400 font-medium">Recomendación agronómica:</strong> {analysis.subPhase.advice}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            {onOpenWateringModal && (
              <button
                type="button"
                onClick={() => onOpenWateringModal(activeCrop)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Registrar solución nutritiva de floración"
              >
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                <span>Riego Floral</span>
              </button>
            )}
            {onOpenPhotoModal && (
              <button
                type="button"
                onClick={() => onOpenPhotoModal(activeCrop)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Fotografiar desarrollo de cogollos y tricomas"
              >
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                <span>Foto Flores</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid de 4 Métricas Comparativas Clave */}
      <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Métrica 1: Días Transcurridos */}
        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[10px]">Días Transcurridos</span>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-white">
              Día {analysis.floweringDaysElapsed}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Semana {analysis.currentWeekNumber} · Desde {analysis.floweringStartDateStr}
            </p>
          </div>
        </div>

        {/* Métrica 2: Duración Típica de la Genética */}
        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[10px]">Duración Genética</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-purple-300">
              {analysis.typicalFloweringDays} días
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
              {analysis.typicalFloweringWeeks} semanas · {analysis.geneticsName}
            </p>
          </div>
        </div>

        {/* Métrica 3: Días Restantes Estimados */}
        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[10px]">Tiempo Restante</span>
            <Timer className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-amber-300">
              {analysis.daysRemaining === 0 ? '0 días' : `~${analysis.daysRemaining} días`}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {analysis.daysRemaining === 0 ? 'Fase de cosecha activa' : `~${analysis.weeksRemaining} sem. para corte`}
            </p>
          </div>
        </div>

        {/* Métrica 4: Proyección de Cosecha */}
        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-mono uppercase tracking-wider text-[10px]">Cosecha Estimada</span>
            <Scissors className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-mono font-bold text-rose-300 truncate">
              {analysis.estimatedHarvestDateStr}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1">
              <span>{analysis.progressPercentage >= 100 ? '¡Lista para corte!' : 'Punto de tricomas'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
