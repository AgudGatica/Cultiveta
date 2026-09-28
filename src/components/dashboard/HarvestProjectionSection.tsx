import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Scissors,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  History,
  Layers,
  Hourglass,
  Sprout,
  Flower2,
  CalendarCheck,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Cultivation, Genetics, CultivationGrowthStage } from '../../types';
import {
  getStagesForCultivation,
  addDays,
  daysBetween,
  formatFriendlyDate,
} from '../../utils/growthStageUtils';

export interface HarvestProjectionSectionProps {
  cultivations: Cultivation[];
  geneticsList?: Genetics[];
  onSelectCultivation: (cultivation: Cultivation) => void;
  onOpenCalendarModal?: (cultivation: Cultivation) => void;
}

interface StageBreakdownItem {
  name: string;
  expectedDays: number;
  actualOrProjectedDays: number;
  startDate: string;
  endDate: string;
  status: 'completed' | 'active' | 'upcoming';
  deltaDays: number;
}

interface CropHarvestProjection {
  cultivation: Cultivation;
  geneticsName: string;
  seedBank: string;
  photoperiodType: string;
  matchedGenetics: Genetics | null;
  startDateStr: string;
  todayStr: string;
  totalElapsedDays: number;

  // Proyecciones
  baselineHarvestDate: string;
  baselineTotalDays: number;

  adjustedHarvestDate: string;
  adjustedTotalDays: number;

  daysUntilHarvest: number;
  weeksUntilHarvest: number;
  progressPercent: number;

  // Ajustes de etapas
  adjustmentDeltaDays: number; // positivo = retraso/extensión, negativo = adelanto
  hasStageAdjustments: boolean;
  adjustmentReason: string;

  // Desglose de etapas
  stagesBreakdown: StageBreakdownItem[];
  currentStageName: string;
  floweringDaysGenetics: number;
}

export const HarvestProjectionSection: React.FC<HarvestProjectionSectionProps> = ({
  cultivations,
  geneticsList = [],
  onSelectCultivation,
  onOpenCalendarModal,
}) => {
  // Filtrar cultivos activos
  const activeCultivations = useMemo(() => {
    return cultivations.filter((c) => !c.isFinished && c.status?.toLowerCase() !== 'cosechado');
  }, [cultivations]);

  const [selectedCropId, setSelectedCropId] = useState<string>('');

  const activeCrop = useMemo(() => {
    if (activeCultivations.length === 0) return null;
    const found = activeCultivations.find((c) => c.id === selectedCropId);
    return found || activeCultivations[0];
  }, [activeCultivations, selectedCropId]);

  // Cálculo de la proyección de cosecha ajustada por cambios de etapa
  const projection: CropHarvestProjection | null = useMemo(() => {
    if (!activeCrop) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const cropStartDate = activeCrop.startDate || todayStr;
    const totalElapsedDays = Math.max(1, daysBetween(cropStartDate, todayStr));

    // 1. Obtener la genética seleccionada
    const matchedGenetics =
      geneticsList.find(
        (g) =>
          g.id === activeCrop.geneticsId ||
          (g.name &&
            activeCrop.geneticsName &&
            g.name.toLowerCase().trim() === activeCrop.geneticsName.toLowerCase().trim())
      ) || null;

    const geneticsName = matchedGenetics?.name || activeCrop.geneticsName || 'Genética híbrida';
    const seedBank = matchedGenetics?.seedBank || activeCrop.seedBank || 'Banco seleccionado';
    const photoperiodType =
      matchedGenetics?.photoperiodType || activeCrop.photoperiodType || 'Fotoperiódica';
    const isAuto = photoperiodType === 'Automática';

    // 2. Duración típica de floración según la genética
    let floweringDaysGenetics = 56; // 8 semanas por defecto
    if (matchedGenetics?.declaredFloweringDays && matchedGenetics.declaredFloweringDays > 0) {
      floweringDaysGenetics = matchedGenetics.declaredFloweringDays;
    } else if (activeCrop.declaredFloweringWeeks && activeCrop.declaredFloweringWeeks > 0) {
      floweringDaysGenetics = activeCrop.declaredFloweringWeeks * 7;
    } else if (matchedGenetics?.declaredFloweringWeeks && matchedGenetics.declaredFloweringWeeks > 0) {
      floweringDaysGenetics = matchedGenetics.declaredFloweringWeeks * 7;
    }

    // 3. Obtener el esquema de etapas estándar (baseline)
    const stages = getStagesForCultivation(activeCrop);

    // Calcular el ciclo teórico inicial (Baseline)
    let baselineTotalDays = 0;
    const harvestStageIdx = stages.findIndex(
      (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
    );
    const lastCycleStageIdx = harvestStageIdx !== -1 ? harvestStageIdx : stages.length - 1;

    for (let i = 0; i <= lastCycleStageIdx; i++) {
      let stageDays = stages[i].expectedDurationDays || 7;
      if (stages[i].name === 'Floración') {
        stageDays = floweringDaysGenetics;
      }
      baselineTotalDays += stageDays;
    }
    if (baselineTotalDays <= 0) {
      baselineTotalDays = isAuto ? 75 : 95;
    }

    const baselineHarvestDate = addDays(cropStartDate, baselineTotalDays);

    // 4. Calcular la proyección ajustada basada en los cambios de etapa registrados
    const normalizedCurrentStage = (activeCrop.currentStage || '').toLowerCase().trim();
    const isAlreadyInFlora =
      normalizedCurrentStage.includes('flor') ||
      normalizedCurrentStage.includes('madur') ||
      Boolean(activeCrop.floweringStartDate);

    const stagesBreakdown: StageBreakdownItem[] = [];
    let adjustedTotalDays = 0;
    let adjustmentReason = '';
    let hasStageAdjustments = false;

    // Fecha en que comenzó la etapa actual
    const currentStageStartDate = activeCrop.stageStartDate || cropStartDate;

    if (isAlreadyInFlora) {
      // Si ya está en floración, conocemos la fecha exacta en la que floreció
      const realFloraStartDate =
        activeCrop.floweringStartDate || currentStageStartDate || cropStartDate;
      const actualPreFloraDays = Math.max(1, daysBetween(cropStartDate, realFloraStartDate));

      // Días teóricos que se esperaban antes de floración
      let expectedPreFloraDays = 0;
      for (let i = 0; i < stages.length; i++) {
        if (stages[i].name === 'Floración') break;
        expectedPreFloraDays += stages[i].expectedDurationDays || 7;
      }
      if (expectedPreFloraDays === 0) expectedPreFloraDays = isAuto ? 28 : 42;

      const preFloraDelta = actualPreFloraDays - expectedPreFloraDays;
      if (preFloraDelta !== 0) {
        hasStageAdjustments = true;
        if (preFloraDelta > 0) {
          adjustmentReason = `La fase vegetativa se extendió ${preFloraDelta} días más de lo previsto (+${preFloraDelta}d). La floración inició el ${formatFriendlyDate(realFloraStartDate)}.`;
        } else {
          adjustmentReason = `El cultivo pasó a floración ${Math.abs(preFloraDelta)} días antes de lo estimado (${preFloraDelta}d). La floración inició el ${formatFriendlyDate(realFloraStartDate)}.`;
        }
      } else {
        adjustmentReason = `Transición a floración realizada en el día estimado (${formatFriendlyDate(realFloraStartDate)}). Cronograma alineado.`;
      }

      // Proyección ajustada de cosecha = Inicio real de flora + duración genética de floración + días de maduración/cosecha
      const adjustedHarvestDate = addDays(realFloraStartDate, floweringDaysGenetics);
      adjustedTotalDays = daysBetween(cropStartDate, adjustedHarvestDate);

      // Desglose de etapas para visualización
      stages.forEach((st) => {
        const isFlor = st.name === 'Floración';
        const isPast =
          st.name === 'Germinación' ||
          st.name === 'Plántula' ||
          st.name === 'Vegetativo' ||
          st.name === 'Prefloración';

        if (isPast) {
          stagesBreakdown.push({
            name: st.name,
            expectedDays: st.expectedDurationDays,
            actualOrProjectedDays: st.actualDurationDays || st.expectedDurationDays,
            startDate: st.startDate || cropStartDate,
            endDate: st.endDate || realFloraStartDate,
            status: 'completed',
            deltaDays: (st.actualDurationDays || st.expectedDurationDays) - st.expectedDurationDays,
          });
        } else if (isFlor) {
          stagesBreakdown.push({
            name: 'Floración',
            expectedDays: floweringDaysGenetics,
            actualOrProjectedDays: floweringDaysGenetics,
            startDate: realFloraStartDate,
            endDate: adjustedHarvestDate,
            status: normalizedCurrentStage.includes('flor') ? 'active' : 'completed',
            deltaDays: 0,
          });
        } else {
          stagesBreakdown.push({
            name: st.name,
            expectedDays: st.expectedDurationDays,
            actualOrProjectedDays: st.expectedDurationDays,
            startDate: adjustedHarvestDate,
            endDate: addDays(adjustedHarvestDate, st.expectedDurationDays),
            status: 'upcoming',
            deltaDays: 0,
          });
        }
      });
    } else {
      // Está en fase previa (Germinación, Plántula o Vegetativo)
      // Comprobamos si el tiempo en la etapa activa actual ha superado o variado los días previstos
      const activeStageIdx = stages.findIndex(
        (s) => s.name.toLowerCase().trim() === normalizedCurrentStage
      );
      const activeStage = stages[activeStageIdx] || stages[0];

      const daysInActiveStage = Math.max(1, daysBetween(currentStageStartDate, todayStr));
      const expectedDaysForActive = activeStage.expectedDurationDays || 14;

      let stageVariation = 0;
      if (daysInActiveStage > expectedDaysForActive) {
        stageVariation = daysInActiveStage - expectedDaysForActive;
        hasStageAdjustments = true;
        adjustmentReason = `La etapa actual (${activeStage.name}) lleva ${daysInActiveStage} días (${stageVariation} días más de lo previsto). Se ajusta la fecha estimada de floración y corte.`;
      } else {
        adjustmentReason = `Etapa actual (${activeStage.name}) en curso dentro de los plazos típicos (${daysInActiveStage}/${expectedDaysForActive} días).`;
      }

      adjustedTotalDays = baselineTotalDays + stageVariation;

      // Desglose de etapas
      stages.forEach((st, idx) => {
        let status: 'completed' | 'active' | 'upcoming' = 'upcoming';
        if (idx < activeStageIdx) status = 'completed';
        else if (idx === activeStageIdx) status = 'active';

        const exp = st.name === 'Floración' ? floweringDaysGenetics : st.expectedDurationDays;
        const act = idx === activeStageIdx ? Math.max(exp, daysInActiveStage) : exp;

        stagesBreakdown.push({
          name: st.name,
          expectedDays: exp,
          actualOrProjectedDays: act,
          startDate: st.startDate || cropStartDate,
          endDate: st.endDate || addDays(cropStartDate, act),
          status,
          deltaDays: act - exp,
        });
      });
    }

    const adjustedHarvestDate = addDays(cropStartDate, adjustedTotalDays);
    const adjustmentDeltaDays = daysBetween(baselineHarvestDate, adjustedHarvestDate);
    const daysUntilHarvest = Math.max(0, daysBetween(todayStr, adjustedHarvestDate));
    const weeksUntilHarvest = Math.ceil(daysUntilHarvest / 7);
    const progressPercent = Math.min(
      100,
      Math.max(1, Math.round((totalElapsedDays / adjustedTotalDays) * 100))
    );

    return {
      cultivation: activeCrop,
      geneticsName,
      seedBank,
      photoperiodType,
      matchedGenetics,
      startDateStr: cropStartDate,
      todayStr,
      totalElapsedDays,
      baselineHarvestDate,
      baselineTotalDays,
      adjustedHarvestDate,
      adjustedTotalDays,
      daysUntilHarvest,
      weeksUntilHarvest,
      progressPercent,
      adjustmentDeltaDays,
      hasStageAdjustments: hasStageAdjustments || adjustmentDeltaDays !== 0,
      adjustmentReason,
      stagesBreakdown,
      currentStageName: activeCrop.currentStage || 'Vegetativo',
      floweringDaysGenetics,
    };
  }, [activeCrop, geneticsList]);

  if (activeCultivations.length === 0 || !projection || !activeCrop) {
    return null;
  }

  return (
    <div
      id="harvest-projection-section"
      className="bg-[#0F0F0F] rounded-[32px] p-6 sm:p-8 border border-zinc-800 shadow-xl relative overflow-hidden space-y-6 animate-fade-in-up"
    >
      {/* Fondo ambiental sutil */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-emerald-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header: Título, selector de cultivo y badges */}
      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-amber-950/50">
            <Scissors className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-amber-400">
                Proyección Dinámica de Cosecha
              </span>
              {projection.hasStageAdjustments && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
                  Ajustada por Etapas ({projection.adjustmentDeltaDays > 0 ? `+${projection.adjustmentDeltaDays}d` : `${projection.adjustmentDeltaDays}d`})
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5 flex items-center gap-2">
              <span>Fecha Estimada de Cosecha & Ciclo Fenológico</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cálculo sincronizado entre fecha de inicio, duración de la genética y cambios de etapa registrados
            </p>
          </div>
        </div>

        {/* Selector de Carpa si hay múltiples cultivos activos */}
        {activeCultivations.length > 1 ? (
          <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 shrink-0">
            <span className="text-[10px] font-mono font-semibold text-zinc-400 px-2">Carpa:</span>
            {activeCultivations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCropId(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeCrop.id === c.id
                    ? 'bg-amber-500 text-black shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
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
              className="px-3.5 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Ver Carpa</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        )}
      </div>

      {/* Hero Principal: Fecha Proyectada Ajustada y Métricas de Comparación */}
      <div className="relative z-10 p-6 rounded-3xl bg-zinc-950/70 border border-zinc-800/90 space-y-6 shadow-inner">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Columna Izquierda: Gran Fecha de Cosecha Ajustada */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                {activeCrop.name} · {projection.geneticsName}
              </span>
              <span className="text-xs text-zinc-400">({projection.seedBank})</span>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-zinc-400">Fecha Proyectada de Cosecha:</span>
              <div className="text-3xl sm:text-4xl lg:text-5xl font-mono font-black text-amber-300 tracking-tight flex items-baseline gap-2">
                <span>{formatFriendlyDate(projection.adjustedHarvestDate)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-300 pt-1">
              <div className="flex items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                <Hourglass className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono font-bold text-white">
                  {projection.daysUntilHarvest === 0
                    ? '¡Listo para cosechar!'
                    : `Faltan ~${projection.daysUntilHarvest} días`}
                </span>
                <span className="text-zinc-500">
                  (~{projection.weeksUntilHarvest} sem.)
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-800">
                <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-400">Inicio:</span>
                <span className="font-mono text-zinc-200">
                  {formatFriendlyDate(projection.startDateStr)} (Día {projection.totalElapsedDays})
                </span>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Tarjeta Comparativa (Teórica vs Ajustada) */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-amber-400" />
                Sincronización Fenológica
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                  projection.adjustmentDeltaDays === 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : projection.adjustmentDeltaDays > 0
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                }`}
              >
                {projection.adjustmentDeltaDays === 0
                  ? 'Sin variaciones'
                  : projection.adjustmentDeltaDays > 0
                  ? `+${projection.adjustmentDeltaDays} días vs cálculo inicial`
                  : `${projection.adjustmentDeltaDays} días vs cálculo inicial`}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-zinc-800">
                <span className="text-zinc-400">Proyección teórica inicial:</span>
                <span className="font-mono text-zinc-300">
                  {formatFriendlyDate(projection.baselineHarvestDate)} ({projection.baselineTotalDays}d)
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800">
                <span className="text-zinc-400">Floración de la genética:</span>
                <span className="font-mono text-purple-300 font-bold">
                  {projection.floweringDaysGenetics} días (~{Math.round((projection.floweringDaysGenetics / 7) * 10) / 10} sem.)
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-zinc-400">Ciclo total recalculado:</span>
                <span className="font-mono text-amber-300 font-bold">
                  {projection.adjustedTotalDays} días ({projection.totalElapsedDays}d transcurridos)
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-snug bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800/80">
              💡 <span className="text-zinc-200">{projection.adjustmentReason}</span>
            </p>
          </div>
        </div>

        {/* Barra de Progreso Global del Ciclo Completo */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <span>Progreso del ciclo total:</span>
              <strong className="text-white">
                {projection.totalElapsedDays} / {projection.adjustedTotalDays} días
              </strong>
            </span>
            <span className="text-amber-400 font-bold">
              {projection.progressPercent}% completado
            </span>
          </div>

          <div className="relative w-full h-4 rounded-full bg-zinc-900 border border-zinc-800 p-0.5 overflow-hidden flex items-center shadow-inner">
            <div
              role="progressbar"
              aria-valuenow={projection.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: `${Math.min(100, Math.max(3, projection.progressPercent))}%` }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            ></div>
          </div>
        </div>

        {/* Desglose Fenológico por Etapas: Historial Real y Proyecciones Futuras */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              Cronología de Etapas y Ajustes Registrados
            </span>
            {onOpenCalendarModal && (
              <button
                type="button"
                onClick={() => onOpenCalendarModal(activeCrop)}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Ver Calendario</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {projection.stagesBreakdown.map((stage, idx) => {
              const isFlora = stage.name.toLowerCase().includes('flor');
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                    stage.status === 'active'
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                      : stage.status === 'completed'
                      ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300'
                      : 'bg-zinc-950/40 border-zinc-900 text-zinc-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white flex items-center gap-1.5">
                      {isFlora ? (
                        <Flower2 className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      {stage.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                        stage.status === 'active'
                          ? 'bg-amber-500 text-black'
                          : stage.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {stage.status === 'active'
                        ? 'EN CURSO'
                        : stage.status === 'completed'
                        ? 'COMPLETADA'
                        : 'PROYECTADA'}
                    </span>
                  </div>

                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Duración:</span>
                      <span className="font-mono font-bold text-zinc-200">
                        {stage.actualOrProjectedDays} días
                      </span>
                    </div>
                    {stage.deltaDays !== 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-zinc-500">Desvío:</span>
                        <span
                          className={`font-mono ${
                            stage.deltaDays > 0 ? 'text-amber-400' : 'text-cyan-400'
                          }`}
                        >
                          {stage.deltaDays > 0 ? `+${stage.deltaDays}d` : `${stage.deltaDays}d`} vs inicial
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/60 truncate">
                    {formatFriendlyDate(stage.startDate)} → {formatFriendlyDate(stage.endDate)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
