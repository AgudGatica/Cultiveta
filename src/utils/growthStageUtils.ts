import { Cultivation, CultivationGrowthStage, CultivationStageName, Genetics } from '../types';

export interface StagePreset {
  id: string;
  name: string;
  description: string;
  stages: Array<{
    name: CultivationStageName;
    expectedDurationDays: number;
    photoperiodHoursLight?: number;
    targetTempMinC?: number;
    targetTempMaxC?: number;
    targetHumidityMinPct?: number;
    targetHumidityMaxPct?: number;
    notes?: string;
  }>;
}

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: 'indoor_photoperiodic',
    name: 'Indoor Fotoperiódica (4 sem vege + 8-9 sem flora)',
    description: 'Esquema clásico para semillas fotoperiódicas en carpa indoor.',
    stages: [
      {
        name: 'Germinación',
        expectedDurationDays: 7,
        photoperiodHoursLight: 18,
        targetTempMinC: 22,
        targetTempMaxC: 26,
        targetHumidityMinPct: 70,
        targetHumidityMaxPct: 85,
        notes: 'Humedad constante, oscuridad inicial o luz muy tenue.',
      },
      {
        name: 'Plántula',
        expectedDurationDays: 14,
        photoperiodHoursLight: 18,
        targetTempMinC: 22,
        targetTempMaxC: 26,
        targetHumidityMinPct: 65,
        targetHumidityMaxPct: 75,
        notes: 'Desarrollo de primeros pares de hojas y enraizamiento.',
      },
      {
        name: 'Vegetativo',
        expectedDurationDays: 28,
        photoperiodHoursLight: 18,
        targetTempMinC: 22,
        targetTempMaxC: 28,
        targetHumidityMinPct: 55,
        targetHumidityMaxPct: 70,
        notes: 'Fase de crecimiento foliar, podas (apical, FIM) y entrenamiento LST.',
      },
      {
        name: 'Prefloración',
        expectedDurationDays: 7,
        photoperiodHoursLight: 12,
        targetTempMinC: 21,
        targetTempMaxC: 26,
        targetHumidityMinPct: 50,
        targetHumidityMaxPct: 60,
        notes: 'Cambio de fotoperiodo a 12/12. Estiramiento vertical (stretch).',
      },
      {
        name: 'Floración',
        expectedDurationDays: 56, // 8 semanas
        photoperiodHoursLight: 12,
        targetTempMinC: 20,
        targetTempMaxC: 26,
        targetHumidityMinPct: 40,
        targetHumidityMaxPct: 50,
        notes: 'Engorde de cogollos, desarrollo de resina y tricomas.',
      },
      {
        name: 'Maduración',
        expectedDurationDays: 10,
        photoperiodHoursLight: 12,
        targetTempMinC: 19,
        targetTempMaxC: 24,
        targetHumidityMinPct: 35,
        targetHumidityMaxPct: 45,
        notes: 'Lavado de raíces con agua sola, monitoreo del punto de tricomas.',
      },
      {
        name: 'Cosecha',
        expectedDurationDays: 2,
        photoperiodHoursLight: 0,
        targetTempMinC: 18,
        targetTempMaxC: 22,
        targetHumidityMinPct: 45,
        targetHumidityMaxPct: 55,
        notes: 'Corte de plantas, manicurado en fresco o en seco.',
      },
      {
        name: 'Secado',
        expectedDurationDays: 14,
        photoperiodHoursLight: 0,
        targetTempMinC: 18,
        targetTempMaxC: 21,
        targetHumidityMinPct: 55,
        targetHumidityMaxPct: 62,
        notes: 'Espacio oscuro y ventilado sin aire directo.',
      },
      {
        name: 'Curado',
        expectedDurationDays: 30,
        photoperiodHoursLight: 0,
        targetTempMinC: 17,
        targetTempMaxC: 20,
        targetHumidityMinPct: 58,
        targetHumidityMaxPct: 62,
        notes: 'Frascos herméticos de vidrio con apertura diaria.',
      },
    ],
  },
  {
    id: 'autoflowering',
    name: 'Automática Rápida (10-11 semanas ciclo total)',
    description: 'Fotoperiodo continuo de 20/4 sin cambio de horario.',
    stages: [
      {
        name: 'Germinación',
        expectedDurationDays: 5,
        photoperiodHoursLight: 20,
        targetTempMinC: 22,
        targetTempMaxC: 26,
        targetHumidityMinPct: 70,
        targetHumidityMaxPct: 80,
        notes: 'Sembrar idealmente en maceta definitiva para evitar estrés.',
      },
      {
        name: 'Plántula',
        expectedDurationDays: 10,
        photoperiodHoursLight: 20,
        targetTempMinC: 22,
        targetTempMaxC: 26,
        targetHumidityMinPct: 65,
        targetHumidityMaxPct: 75,
        notes: 'Riegos ligeros y bioestimulante radicular.',
      },
      {
        name: 'Vegetativo',
        expectedDurationDays: 21,
        photoperiodHoursLight: 20,
        targetTempMinC: 22,
        targetTempMaxC: 27,
        targetHumidityMinPct: 55,
        targetHumidityMaxPct: 65,
        notes: 'Crecimiento explosivo antes de la floración automática.',
      },
      {
        name: 'Floración',
        expectedDurationDays: 42,
        photoperiodHoursLight: 20,
        targetTempMinC: 20,
        targetTempMaxC: 26,
        targetHumidityMinPct: 40,
        targetHumidityMaxPct: 50,
        notes: 'Engorde bajo luz potente continua.',
      },
      {
        name: 'Maduración',
        expectedDurationDays: 7,
        photoperiodHoursLight: 20,
        targetTempMinC: 19,
        targetTempMaxC: 24,
        targetHumidityMinPct: 35,
        targetHumidityMaxPct: 45,
        notes: 'Lavado de sustrato y maduración de tricomas.',
      },
      {
        name: 'Secado',
        expectedDurationDays: 12,
        photoperiodHoursLight: 0,
        targetTempMinC: 18,
        targetTempMaxC: 21,
        targetHumidityMinPct: 55,
        targetHumidityMaxPct: 62,
        notes: 'Secado controlado a oscuras.',
      },
      {
        name: 'Curado',
        expectedDurationDays: 21,
        photoperiodHoursLight: 0,
        targetTempMinC: 18,
        targetTempMaxC: 20,
        targetHumidityMinPct: 58,
        targetHumidityMaxPct: 62,
        notes: 'Curado en frasco para maximizar terpenos.',
      },
    ],
  },
  {
    id: 'sativa_long',
    name: 'Sativa de Floración Larga (12+ sem flora)',
    description: 'Para genéticas tropicales con floración prolongada.',
    stages: [
      {
        name: 'Germinación',
        expectedDurationDays: 7,
        photoperiodHoursLight: 18,
        targetTempMinC: 23,
        targetTempMaxC: 27,
        notes: 'Humedad cálida constante.',
      },
      {
        name: 'Plántula',
        expectedDurationDays: 14,
        photoperiodHoursLight: 18,
        targetTempMinC: 23,
        targetTempMaxC: 27,
        notes: 'Enraizamiento y adaptación.',
      },
      {
        name: 'Vegetativo',
        expectedDurationDays: 21,
        photoperiodHoursLight: 18,
        targetTempMinC: 22,
        targetTempMaxC: 28,
        notes: 'Vegetativo breve para controlar altura.',
      },
      {
        name: 'Prefloración',
        expectedDurationDays: 10,
        photoperiodHoursLight: 11,
        targetTempMinC: 21,
        targetTempMaxC: 26,
        notes: 'Estiramiento pronunciado x3 o x4.',
      },
      {
        name: 'Floración',
        expectedDurationDays: 84, // 12 semanas
        photoperiodHoursLight: 11,
        targetTempMinC: 20,
        targetTempMaxC: 26,
        notes: 'Floración extensa con pistilos continuos.',
      },
      {
        name: 'Maduración',
        expectedDurationDays: 14,
        photoperiodHoursLight: 11,
        targetTempMinC: 19,
        targetTempMaxC: 24,
        notes: 'Lavado progresivo.',
      },
      {
        name: 'Secado',
        expectedDurationDays: 14,
        photoperiodHoursLight: 0,
        notes: 'Secado lento.',
      },
      {
        name: 'Curado',
        expectedDurationDays: 45,
        photoperiodHoursLight: 0,
        notes: 'Curado prolongado recomendado para sativas.',
      },
    ],
  },
  {
    id: 'outdoor_season',
    name: 'Exterior / Outdoor de Temporada',
    description: 'Cultivo natural en exterior con vegetativo en primavera/verano.',
    stages: [
      {
        name: 'Germinación',
        expectedDurationDays: 7,
        notes: 'Inicio protegido en interior o mini-invernadero.',
      },
      {
        name: 'Plántula',
        expectedDurationDays: 21,
        notes: 'Primeras hojas y trasplante a maceta intermedia.',
      },
      {
        name: 'Vegetativo',
        expectedDurationDays: 60,
        notes: 'Crecimiento vigoroso a pleno sol de primavera-verano.',
      },
      {
        name: 'Prefloración',
        expectedDurationDays: 14,
        notes: 'Acortamiento de días a fines de verano.',
      },
      {
        name: 'Floración',
        expectedDurationDays: 60,
        notes: 'Floración de otoño. Proteger de lluvias intensas.',
      },
      {
        name: 'Maduración',
        expectedDurationDays: 10,
        notes: 'Revisar botritis y orugas en cogollos maduros.',
      },
      {
        name: 'Cosecha',
        expectedDurationDays: 3,
        notes: 'Corte por ramas o planta completa.',
      },
      {
        name: 'Secado',
        expectedDurationDays: 15,
        notes: 'Secado en habitación oscura y ventilada.',
      },
      {
        name: 'Curado',
        expectedDurationDays: 30,
        notes: 'Curado en recipientes sellados.',
      },
    ],
  },
];

// ==========================================
// PURE DATE-ONLY ARITHMETIC (NO TIMEZONE JUMPS)
// ==========================================

export function parseDateOnly(dateStr?: string | null): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

export function formatDateOnly(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Helper to add days to a date string YYYY-MM-DD safely without timezone shifts
export function addDays(dateStr: string, days: number): string {
  const parsed = parseDateOnly(dateStr);
  if (!parsed) return dateStr;
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatDateOnly(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate());
}

// Helper to get days between two dates YYYY-MM-DD safely
export function daysBetween(dateStrA: string, dateStrB: string): number {
  const pA = parseDateOnly(dateStrA);
  const pB = parseDateOnly(dateStrB);
  if (!pA || !pB) return 0;
  const utcA = Date.UTC(pA.year, pA.month - 1, pA.day);
  const utcB = Date.UTC(pB.year, pB.month - 1, pB.day);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export function formatFriendlyDate(
  dateStr?: string,
  options?: { includeYear?: boolean; isProjected?: boolean }
): string {
  if (!dateStr) return '—';
  const parsed = parseDateOnly(dateStr);
  if (!parsed) return dateStr;
  const monthNames = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];
  const monthName = monthNames[parsed.month - 1] || '';
  const yearSuffix = options?.includeYear !== false ? ` ${parsed.year}` : '';
  const formatted = `${parsed.day} ${monthName}${yearSuffix}`;
  if (options?.isProjected) {
    return `~${formatted}`;
  }
  return formatted;
}

export interface StageScheduleItem {
  id: string;
  name: string;
  expectedDurationDays: number;
  actualDurationDays?: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'completed' | 'active' | 'upcoming';
  isProjected: boolean;
  isActual: boolean;
  actualStartDate?: string;
  actualEndDate?: string;
  photoperiodHoursLight?: number;
  targetTempMinC?: number;
  targetTempMaxC?: number;
  targetHumidityMinPct?: number;
  targetHumidityMaxPct?: number;
  notes?: string;
  deltaDays?: number;
}

export interface CultivationScheduleSummary {
  stages: StageScheduleItem[];
  activeStageIndex: number;
  activeStage: StageScheduleItem;
  cropStartDate: string;
  baselineHarvestDate: string;
  estimatedHarvestDate: string;
  daysUntilHarvest: number;
  weeksUntilHarvest: number;
  totalCycleDays: number;
  totalElapsedDays: number;
  overallProgressPct: number;
  adjustmentDeltaDays: number;
  hasStageAdjustments: boolean;
  adjustmentReason: string;
  floweringDaysGenetics: number;
  floweringWeeksGenetics: number;
  floweringStage?: StageScheduleItem;
  harvestStage?: StageScheduleItem;
}

/**
 * Single source of truth for cultivation stage dates and calendar schedule.
 * Reconciles theoretical presets with actual user recorded milestones
 * (floweringStartDate, stageStartDate, stage timelines) and propagates
 * forward real dates.
 */
export function buildCultivationStageSchedule(
  cultivation: Cultivation,
  geneticsList: Genetics[] = []
): CultivationScheduleSummary {
  const now = new Date();
  const todayStr = formatDateOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const cropStartDate = cultivation.startDate || todayStr;

  // 1. Determine genetics flowering days
  const matchedGenetics =
    geneticsList.find(
      (g) =>
        g.id === cultivation.geneticsId ||
        (g.name &&
          cultivation.geneticsName &&
          g.name.toLowerCase().trim() === cultivation.geneticsName.toLowerCase().trim())
    ) || null;

  let floweringDaysGenetics = 56; // 8 weeks standard
  if (matchedGenetics?.declaredFloweringDays && matchedGenetics.declaredFloweringDays > 0) {
    floweringDaysGenetics = matchedGenetics.declaredFloweringDays;
  } else if (cultivation.declaredFloweringWeeks && cultivation.declaredFloweringWeeks > 0) {
    floweringDaysGenetics = cultivation.declaredFloweringWeeks * 7;
  } else if (matchedGenetics?.declaredFloweringWeeks && matchedGenetics.declaredFloweringWeeks > 0) {
    floweringDaysGenetics = matchedGenetics.declaredFloweringWeeks * 7;
  } else if (cultivation.stagesTimeline && cultivation.stagesTimeline.length > 0) {
    const florSt = cultivation.stagesTimeline.find((s) => s.name?.toLowerCase().includes('flor'));
    if (florSt?.expectedDurationDays && florSt.expectedDurationDays > 0) {
      floweringDaysGenetics = florSt.expectedDurationDays;
    }
  }
  const floweringWeeksGenetics = Math.round((floweringDaysGenetics / 7) * 10) / 10;

  // 2. Base stages sequence
  const baseStages = getStagesForCultivation(cultivation);

  // 3. Normalized active stage
  const normalizedCurrent = (cultivation.currentStage || '').toLowerCase().trim();
  let activeStageIndex = baseStages.findIndex(
    (s) => s.name.toLowerCase().trim() === normalizedCurrent
  );
  if (activeStageIndex === -1) {
    if (cultivation.floweringStartDate) {
      const fIdx = baseStages.findIndex((s) => s.name.toLowerCase().includes('flor'));
      activeStageIndex = fIdx !== -1 ? fIdx : 0;
    } else {
      activeStageIndex = 0;
    }
  }

  // 4. Real dates priority
  const realFloraStartDate =
    cultivation.floweringStartDate ||
    (baseStages[activeStageIndex]?.name.toLowerCase().includes('flor')
      ? cultivation.stageStartDate || null
      : null);

  const realActiveStageStart = cultivation.stageStartDate || null;

  // 5. Compute baseline harvest date
  let baselineTotalDays = 0;
  let harvestStageIndex = baseStages.findIndex(
    (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
  );
  if (harvestStageIndex === -1) harvestStageIndex = baseStages.length - 1;

  for (let i = 0; i <= harvestStageIndex; i++) {
    const isFlor = baseStages[i].name === 'Floración';
    baselineTotalDays += isFlor ? floweringDaysGenetics : (baseStages[i].expectedDurationDays || 7);
  }
  const baselineHarvestDate = addDays(cropStartDate, baselineTotalDays);

  // 6. Build reconciled schedule items
  const scheduleItems: StageScheduleItem[] = [];
  let runnerDate = cropStartDate;

  for (let i = 0; i < baseStages.length; i++) {
    const st = baseStages[i];
    const isFlor = st.name === 'Floración';
    const duration = (isFlor ? floweringDaysGenetics : st.expectedDurationDays) || 7;

    const isCompleted = i < activeStageIndex;
    const isActive = i === activeStageIndex;
    const isUpcoming = i > activeStageIndex;

    let stageStart = runnerDate;
    let stageEnd = addDays(stageStart, duration);
    let isActual = false;
    let isProjected = true;
    const status: 'completed' | 'active' | 'upcoming' = isCompleted
      ? 'completed'
      : isActive
      ? 'active'
      : 'upcoming';

    if (isCompleted) {
      isActual = true;
      isProjected = false;
      if (st.startDate) {
        stageStart = st.startDate;
      }
      if (st.endDate) {
        stageEnd = st.endDate;
      } else if (i === activeStageIndex - 1 && realActiveStageStart) {
        stageEnd = realActiveStageStart;
      } else if ((st.name === 'Vegetativo' || st.name === 'Prefloración') && realFloraStartDate) {
        stageEnd = realFloraStartDate;
      } else {
        stageEnd = addDays(stageStart, duration);
      }
      runnerDate = stageEnd;
    } else if (isActive) {
      isActual = true;
      isProjected = true;
      if (isFlor && realFloraStartDate) {
        stageStart = realFloraStartDate;
      } else if (realActiveStageStart) {
        stageStart = realActiveStageStart;
      } else {
        stageStart = runnerDate;
      }
      stageEnd = addDays(stageStart, duration);
      runnerDate = stageEnd;
    } else {
      // isUpcoming
      isActual = false;
      isProjected = true;
      if (isFlor && realFloraStartDate) {
        stageStart = realFloraStartDate;
      } else {
        stageStart = runnerDate;
      }
      stageEnd = addDays(stageStart, duration);
      runnerDate = stageEnd;
    }

    scheduleItems.push({
      id: st.id || `stage_${i}_${st.name.toLowerCase()}`,
      name: st.name,
      expectedDurationDays: duration,
      actualDurationDays: isCompleted ? Math.max(1, daysBetween(stageStart, stageEnd)) : undefined,
      startDate: stageStart,
      endDate: stageEnd,
      status,
      isProjected,
      isActual,
      actualStartDate: isActual ? stageStart : undefined,
      actualEndDate: !isProjected ? stageEnd : undefined,
      photoperiodHoursLight: st.photoperiodHoursLight,
      targetTempMinC: st.targetTempMinC,
      targetTempMaxC: st.targetTempMaxC,
      targetHumidityMinPct: st.targetHumidityMinPct,
      targetHumidityMaxPct: st.targetHumidityMaxPct,
      notes: st.notes,
    });
  }

  // 7. Reconcile estimated harvest
  const harvestStage = scheduleItems[harvestStageIndex] || scheduleItems[scheduleItems.length - 1];
  const estimatedHarvestDate = harvestStage.startDate || harvestStage.endDate;

  const adjustmentDeltaDays = daysBetween(baselineHarvestDate, estimatedHarvestDate);
  const hasStageAdjustments = adjustmentDeltaDays !== 0;

  let adjustmentReason = 'El cronograma se encuentra alineado con la proyección inicial.';
  if (adjustmentDeltaDays > 0) {
    adjustmentReason = `Se extendió ${adjustmentDeltaDays} días porque etapas previas duraron más de lo previsto.`;
  } else if (adjustmentDeltaDays < 0) {
    adjustmentReason = `Se adelantó ${Math.abs(adjustmentDeltaDays)} días respecto a la estimación inicial.`;
  }

  const daysUntilHarvest = Math.max(0, daysBetween(todayStr, estimatedHarvestDate));
  const weeksUntilHarvest = Math.ceil(daysUntilHarvest / 7);
  const totalElapsedDays = Math.max(1, daysBetween(cropStartDate, todayStr));
  const totalCycleDays = Math.max(1, daysBetween(cropStartDate, estimatedHarvestDate));
  const overallProgressPct = Math.min(100, Math.round((totalElapsedDays / totalCycleDays) * 100));

  const floweringStage = scheduleItems.find((s) => s.name === 'Floración');

  return {
    stages: scheduleItems,
    activeStageIndex,
    activeStage: scheduleItems[activeStageIndex] || scheduleItems[0],
    cropStartDate,
    baselineHarvestDate,
    estimatedHarvestDate,
    daysUntilHarvest,
    weeksUntilHarvest,
    totalCycleDays,
    totalElapsedDays,
    overallProgressPct,
    adjustmentDeltaDays,
    hasStageAdjustments,
    adjustmentReason,
    floweringDaysGenetics,
    floweringWeeksGenetics,
    floweringStage,
    harvestStage,
  };
}

export function getStageIcon(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes('germin')) return '🌱';
  if (lower.includes('plánt') || lower.includes('plant')) return '🌿';
  if (lower.includes('vege') || lower.includes('crecim')) return '🌳';
  if (lower.includes('preflor') || lower.includes('transic')) return '✨';
  if (lower.includes('flor')) return '🌸';
  if (lower.includes('madur') || lower.includes('lavad')) return '🍯';
  if (lower.includes('cosech') || lower.includes('corte')) return '✂️';
  if (lower.includes('secad')) return '💨';
  if (lower.includes('curad')) return '🏺';
  if (lower.includes('final')) return '🏁';
  return '🍃';
}

export function getStageColorClasses(stageName: string, isActive: boolean, isCompleted: boolean) {
  if (isActive) {
    return {
      bg: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
      border: 'border-emerald-500 ring-2 ring-emerald-500/30',
      text: 'text-emerald-900',
    };
  }
  if (isCompleted) {
    return {
      bg: 'bg-stone-800',
      badge: 'bg-stone-100 text-stone-700 border-stone-300',
      border: 'border-stone-300',
      text: 'text-stone-700',
    };
  }
  return {
    bg: 'bg-stone-200',
    badge: 'bg-stone-50 text-stone-500 border-stone-200',
    border: 'border-stone-200',
    text: 'text-stone-500',
  };
}

/**
 * Returns the growth stages for a cultivation.
 * If user has customized stagesTimeline, returns it with dates recalculated if needed.
 * Otherwise, generates a default sequence matching the crop's photoperiod and genetics.
 */
export function getStagesForCultivation(cultivation: Cultivation): CultivationGrowthStage[] {
  let stages: CultivationGrowthStage[] = [];

  if (cultivation.stagesTimeline && cultivation.stagesTimeline.length > 0) {
    stages = cultivation.stagesTimeline;
  } else {
    // Choose preset based on photoperiod
    let preset: StagePreset;
    if (cultivation.photoperiodType === 'Automática') {
      preset = STAGE_PRESETS[1]; // autoflowering
    } else if (cultivation.declaredFloweringWeeks && cultivation.declaredFloweringWeeks >= 11) {
      preset = STAGE_PRESETS[2]; // sativa long
    } else if (cultivation.type === 'Outdoor') {
      preset = STAGE_PRESETS[3]; // outdoor
    } else {
      preset = STAGE_PRESETS[0]; // standard photoperiodic
    }

    // Adjust flowering duration if declaredFloweringWeeks is specified
    let currentDate = cultivation.startDate || new Date().toISOString().split('T')[0];

    preset.stages.forEach((item, idx) => {
      let duration = item.expectedDurationDays;
      // If it's flowering and the crop has custom declared weeks:
      if (item.name === 'Floración' && cultivation.declaredFloweringWeeks) {
        duration = Math.max(28, cultivation.declaredFloweringWeeks * 7);
      }

      const startDate = currentDate;
      const endDate = addDays(startDate, duration);
      currentDate = endDate;

      stages.push({
        id: `stage_${idx}_${item.name.toLowerCase()}`,
        name: item.name,
        startDate,
        endDate,
        expectedDurationDays: duration,
        photoperiodHoursLight: item.photoperiodHoursLight,
        targetTempMinC: item.targetTempMinC,
        targetTempMaxC: item.targetTempMaxC,
        targetHumidityMinPct: item.targetHumidityMinPct,
        targetHumidityMaxPct: item.targetHumidityMaxPct,
        notes: item.notes,
        isCompleted: false,
      });
    });
  }

  // Ensure isCompleted dynamically reflects current stage position
  const normalizedCurrent = (cultivation.currentStage || '').toLowerCase().trim();
  const currentStageIdx = stages.findIndex(
    (s) => s.name.toLowerCase().trim() === normalizedCurrent
  );

  if (currentStageIdx !== -1) {
    return stages.map((st, idx) => ({
      ...st,
      isCompleted: idx < currentStageIdx,
    }));
  }

  return stages;
}

export function getNextStage(
  cultivation: Cultivation,
  stages: CultivationGrowthStage[]
): CultivationGrowthStage | null {
  if (!stages || stages.length === 0) return null;
  const normalizedCurrent = (cultivation.currentStage || '').toLowerCase().trim();
  const currentIdx = stages.findIndex(
    (s) => s.name.toLowerCase().trim() === normalizedCurrent
  );

  if (currentIdx !== -1 && currentIdx < stages.length - 1) {
    return stages[currentIdx + 1];
  }
  return null;
}

export interface TimelineMetrics {
  totalElapsedDays: number;
  totalCycleDays: number;
  overallProgressPct: number;
  activeStage: CultivationGrowthStage;
  activeStageIndex: number;
  daysInActiveStage: number;
  activeStageProgressPct: number;
  projectedHarvestDate: string;
  daysUntilHarvest: number;
  isHarvestCompleted: boolean;
}

export function calculateTimelineMetrics(
  cultivation: Cultivation,
  stages: CultivationGrowthStage[]
): TimelineMetrics {
  const schedule = buildCultivationStageSchedule(cultivation);
  const now = new Date();
  const todayStr = formatDateOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const activeStage = stages[schedule.activeStageIndex] || stages[0] || {
    id: schedule.activeStage.id,
    name: schedule.activeStage.name,
    startDate: schedule.activeStage.startDate,
    endDate: schedule.activeStage.endDate,
    expectedDurationDays: schedule.activeStage.expectedDurationDays,
    isCompleted: false,
  };

  const stageStartDate =
    cultivation.stageStartDate ||
    (schedule.activeStage.name.toLowerCase().includes('flor')
      ? cultivation.floweringStartDate || schedule.activeStage.startDate
      : schedule.activeStage.startDate);

  const daysInActiveStage = Math.max(1, daysBetween(stageStartDate, todayStr));
  const expectedStageDuration = schedule.activeStage.expectedDurationDays || 1;
  const activeStageProgressPct = Math.min(
    100,
    Math.round((daysInActiveStage / expectedStageDuration) * 100)
  );

  let harvestStageIndex = stages.findIndex(
    (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
  );
  if (harvestStageIndex === -1) {
    harvestStageIndex = stages.length - 1;
  }

  const isHarvestCompleted = Boolean(
    cultivation.isFinished || schedule.activeStageIndex >= harvestStageIndex
  );

  return {
    totalElapsedDays: schedule.totalElapsedDays,
    totalCycleDays: schedule.totalCycleDays,
    overallProgressPct: schedule.overallProgressPct,
    activeStage,
    activeStageIndex: schedule.activeStageIndex,
    daysInActiveStage,
    activeStageProgressPct,
    projectedHarvestDate: schedule.estimatedHarvestDate,
    daysUntilHarvest: schedule.daysUntilHarvest,
    isHarvestCompleted,
  };
}
