import {
  Cultivation,
  CultivationGrowthStage,
  CultivationStageName,
  CultivationType,
  Genetics,
  PhotoperiodType,
  StageDateKnowledge,
} from '../types';

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

/**
 * Returns YYYY-MM-DD according to the user's local calendar day.
 * Avoids any UTC offset shifts caused by toISOString().split('T')[0].
 */
export function getLocalTodayDateOnly(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return formatDateOnly(y, m, day);
}

// Stage classification helpers to prevent "Prefloración" matching "Floración"
export function isFloweringStage(name?: string): boolean {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  if (clean.includes('preflor') || clean.includes('pre-flor') || clean.includes('pre flower')) {
    return false;
  }
  return clean.includes('flor');
}

export function isPreFloweringStage(name?: string): boolean {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  return clean.includes('preflor') || clean.includes('pre-flor') || clean.includes('pre flower');
}

export function isFlowerRelatedStage(name?: string): boolean {
  if (!name) return false;
  const clean = name.toLowerCase().trim();
  return isFloweringStage(clean) || isPreFloweringStage(clean) || clean.includes('madur') || clean.includes('lavad');
}

export interface StageTransitionResult {
  updatedStages: CultivationGrowthStage[];
  updates: Partial<Cultivation>;
}

/**
 * Computes deterministic stage transition updates:
 * - Closes previous active stage with actualEndDate = effectiveDate
 * - Opens target stage with actualStartDate = effectiveDate
 * - Updates cultivation.stageStartDate = effectiveDate
 * - Sets floweringStartDate ONLY when entering Floración (never Prefloración)
 */
export function computeStageTransition(
  cultivation: Cultivation,
  stages: CultivationGrowthStage[],
  selectedStageName: string,
  effectiveDate: string,
  options?: {
    updatePhotoperiod?: boolean;
    customLightHours?: number;
  }
): StageTransitionResult {
  const currIdx = stages.findIndex(
    (s) => s.name.toLowerCase().trim() === (cultivation.currentStage || '').toLowerCase().trim()
  );
  const targetIdx = stages.findIndex(
    (s) => s.name.toLowerCase().trim() === selectedStageName.toLowerCase().trim()
  );

  const isRegressing = currIdx !== -1 && targetIdx !== -1 && targetIdx < currIdx;
  const isEnteringFlowering =
    isFloweringStage(selectedStageName) &&
    !isFloweringStage(cultivation.currentStage);

  const updatedStages = stages.map((st, idx) => {
    const isTarget = idx === targetIdx;
    const isPastTarget = targetIdx !== -1 && idx < targetIdx;
    const isFutureOfTarget = targetIdx !== -1 && idx > targetIdx;
    const isPreviousActive = idx === currIdx;

    let actualStart = st.actualStartDate;
    let actualEnd = st.actualEndDate;
    let notes = st.notes;

    if (isRegressing) {
      if (isTarget) {
        actualStart = effectiveDate;
        actualEnd = undefined;
      } else if (isFutureOfTarget) {
        if (st.actualStartDate && !notes?.includes('[Historial previo]')) {
          const histNote = `[Historial previo: ${st.actualStartDate}${st.actualEndDate ? ` al ${st.actualEndDate}` : ''}]`;
          notes = notes ? `${notes} ${histNote}` : histNote;
        }
        actualStart = undefined;
        actualEnd = undefined;
      }
    } else {
      if (isTarget) {
        actualStart = effectiveDate;
        actualEnd = undefined;
      }

      if (isPastTarget && isPreviousActive) {
        actualEnd = effectiveDate;
      } else if (isPastTarget && idx === targetIdx - 1 && !actualEnd) {
        actualEnd = effectiveDate;
      }
    }

    return {
      ...st,
      isCompleted: isPastTarget,
      actualStartDate: actualStart,
      actualEndDate: actualEnd,
      notes,
      photoperiodHoursLight:
        isTarget && options?.updatePhotoperiod && options?.customLightHours !== undefined
          ? options.customLightHours
          : st.photoperiodHoursLight,
    };
  });

  const updates: Partial<Cultivation> = {
    currentStage: selectedStageName,
    stageStartDate: effectiveDate,
    stagesTimeline: updatedStages,
  };

  if (isEnteringFlowering) {
    updates.floweringStartDate = effectiveDate;
  } else if (isRegressing) {
    const florStageIndex = stages.findIndex((s) => isFloweringStage(s.name));
    if (florStageIndex !== -1 && targetIdx < florStageIndex) {
      updates.floweringStartDate = '';
    }
  }

  if (options?.updatePhotoperiod && cultivation.type !== 'Outdoor' && options.customLightHours !== undefined) {
    updates.lighting = {
      ...(cultivation.lighting || { type: 'LED Quantum Board', usedWatts: 240 }),
      photoperiodHoursLight: options.customLightHours,
      photoperiodHoursDark: Math.max(0, 24 - options.customLightHours),
    };
  }

  return { updatedStages, updates };
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
  options?: { includeYear?: boolean; isProjected?: boolean; isUnknown?: boolean }
): string {
  if (!dateStr || options?.isUnknown || dateStr === 'Sin fecha registrada') return 'Sin fecha registrada';
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
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status: 'completed' | 'active' | 'upcoming';
  dateKnowledge: StageDateKnowledge;
  isProjected: boolean;
  isActual: boolean;
  isUnknown?: boolean;
  startIsReal?: boolean;
  endIsReal?: boolean;
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
  isCycleStartKnown: boolean;
  activeStageElapsedDays: number;
  baselineHarvestDate: string;
  estimatedHarvestDate: string;
  daysUntilHarvest: number;
  weeksUntilHarvest: number;
  totalCycleDays: number | null;
  totalElapsedDays: number | null;
  overallProgressPct: number | null;
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
 * (floweringStartDate, stageStartDate, actualStartDate/actualEndDate) and propagates
 * forward real dates. NEVER projects backwards or invents past stage dates.
 */
export function buildCultivationStageSchedule(
  cultivation: Cultivation,
  geneticsList: Genetics[] = []
): CultivationScheduleSummary {
  const todayStr = getLocalTodayDateOnly();
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
  } else if (matchedGenetics?.declaredFloweringWeeks && matchedGenetics.declaredFloweringWeeks > 0) {
    floweringDaysGenetics = matchedGenetics.declaredFloweringWeeks * 7;
  } else if (cultivation.declaredFloweringWeeks && cultivation.declaredFloweringWeeks > 0) {
    floweringDaysGenetics = cultivation.declaredFloweringWeeks * 7;
  } else if (cultivation.stagesTimeline && cultivation.stagesTimeline.length > 0) {
    const florSt = cultivation.stagesTimeline.find((s) => isFloweringStage(s.name));
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
      const fIdx = baseStages.findIndex((s) => isFloweringStage(s.name));
      activeStageIndex = fIdx !== -1 ? fIdx : 0;
    } else {
      activeStageIndex = 0;
    }
  }

  const isFirstStage = activeStageIndex === 0;

  // Check if historical dates prior to active stage are known
  let historyKnownBeforeActive = isFirstStage;
  if (!isFirstStage) {
    if (cultivation.timelineHistoryMode === 'unknown_before_current_stage' || cultivation.timelineHistoryMode === 'partially_known') {
      historyKnownBeforeActive = false;
    } else if (cultivation.timelineHistoryMode === 'known_from_start') {
      historyKnownBeforeActive = true;
    } else if (cultivation.cycleStartKnown === true) {
      historyKnownBeforeActive = true;
    } else {
      // Conservative inference for legacy records:
      // If no stage prior to activeStage has actualStartDate:
      // and cultivation.startDate is identical to stageStartDate or floweringStartDate:
      // Tracking began at currentStage! Earlier stages are unknown!
      const hasPriorActualDate = baseStages.slice(0, activeStageIndex).some((s) => Boolean(s.actualStartDate));
      const startMatchesCurrentStage = Boolean(
        cultivation.startDate &&
        (cultivation.startDate === cultivation.stageStartDate ||
         (cultivation.floweringStartDate && cultivation.startDate === cultivation.floweringStartDate))
      );
      if (!hasPriorActualDate && startMatchesCurrentStage) {
        historyKnownBeforeActive = false;
      } else if (!hasPriorActualDate && cultivation.cycleStartKnown === false) {
        historyKnownBeforeActive = false;
      } else if (hasPriorActualDate) {
        historyKnownBeforeActive = true;
      } else {
        historyKnownBeforeActive = false;
      }
    }
  }

  // 4. Real dates priority
  const florIdx = baseStages.findIndex((s) => isFloweringStage(s.name));
  const isFlorActiveOrPassed = florIdx !== -1 && activeStageIndex >= florIdx;

  const realFloraStartDate = isFlorActiveOrPassed
    ? (cultivation.floweringStartDate ||
       (isFloweringStage(baseStages[activeStageIndex]?.name)
         ? cultivation.stageStartDate || null
         : null))
    : null;

  // 5. Active anchor date
  const isFlorActive = isFloweringStage(baseStages[activeStageIndex]?.name);
  const activeAnchor = (isFlorActive && realFloraStartDate)
    ? realFloraStartDate
    : (cultivation.stageStartDate ||
       baseStages[activeStageIndex]?.actualStartDate ||
       (isFirstStage ? cultivation.startDate : undefined) ||
       todayStr);

  // 6. Build reconciled schedule items
  const scheduleItems: StageScheduleItem[] = [];
  let runnerDate = activeAnchor;

  // First pass: stages prior to active stage
  for (let i = 0; i < activeStageIndex; i++) {
    const st = baseStages[i];
    const isFlor = isFloweringStage(st.name);
    const duration = (isFlor ? floweringDaysGenetics : st.expectedDurationDays) || 7;

    if (st.actualStartDate) {
      const sStart = st.actualStartDate;
      const sEnd = st.actualEndDate || addDays(sStart, duration);
      const startReal = true;
      const endReal = Boolean(st.actualEndDate);

      scheduleItems.push({
        id: st.id || `stage_${i}_${st.name.toLowerCase()}`,
        name: st.name,
        expectedDurationDays: duration,
        actualDurationDays: startReal && endReal ? Math.max(1, daysBetween(sStart, sEnd)) : undefined,
        startDate: sStart,
        endDate: sEnd,
        status: 'completed',
        dateKnowledge: startReal && endReal ? 'actual' : 'projected',
        isProjected: !(startReal && endReal),
        isActual: startReal && endReal,
        isUnknown: false,
        startIsReal: startReal,
        endIsReal: endReal,
        actualStartDate: sStart,
        actualEndDate: st.actualEndDate,
        photoperiodHoursLight: st.photoperiodHoursLight,
        targetTempMinC: st.targetTempMinC,
        targetTempMaxC: st.targetTempMaxC,
        targetHumidityMinPct: st.targetHumidityMinPct,
        targetHumidityMaxPct: st.targetHumidityMaxPct,
        notes: st.notes,
      });
    } else if (historyKnownBeforeActive && i === 0 && cultivation.startDate) {
      const sStart = cultivation.startDate;
      const sEnd = st.actualEndDate || addDays(sStart, duration);
      scheduleItems.push({
        id: st.id || `stage_${i}_${st.name.toLowerCase()}`,
        name: st.name,
        expectedDurationDays: duration,
        actualDurationDays: undefined,
        startDate: sStart,
        endDate: sEnd,
        status: 'completed',
        dateKnowledge: 'projected',
        isProjected: true,
        isActual: false,
        isUnknown: false,
        startIsReal: true,
        endIsReal: Boolean(st.actualEndDate),
        actualStartDate: sStart,
        actualEndDate: st.actualEndDate,
        photoperiodHoursLight: st.photoperiodHoursLight,
        targetTempMinC: st.targetTempMinC,
        targetTempMaxC: st.targetTempMaxC,
        targetHumidityMinPct: st.targetHumidityMinPct,
        targetHumidityMaxPct: st.targetHumidityMaxPct,
        notes: st.notes,
      });
    } else {
      // UNKNOWN: No explicit record, never fabricate past dates
      scheduleItems.push({
        id: st.id || `stage_${i}_${st.name.toLowerCase()}`,
        name: st.name,
        expectedDurationDays: duration,
        actualDurationDays: undefined,
        startDate: undefined,
        endDate: undefined,
        status: 'completed',
        dateKnowledge: 'unknown',
        isProjected: false,
        isActual: false,
        isUnknown: true,
        startIsReal: false,
        endIsReal: false,
        actualStartDate: undefined,
        actualEndDate: undefined,
        photoperiodHoursLight: st.photoperiodHoursLight,
        targetTempMinC: st.targetTempMinC,
        targetTempMaxC: st.targetTempMaxC,
        targetHumidityMinPct: st.targetHumidityMinPct,
        targetHumidityMaxPct: st.targetHumidityMaxPct,
        notes: st.notes,
      });
    }
  }

  // Second pass: active stage
  const activeSt = baseStages[activeStageIndex];
  if (activeSt) {
    const isFlor = isFloweringStage(activeSt.name);
    const duration = (isFlor ? floweringDaysGenetics : activeSt.expectedDurationDays) || 7;
    const stageStart = activeAnchor;
    const stageEnd = activeSt.actualEndDate || addDays(stageStart, duration);
    const startReal = Boolean(
      cultivation.stageStartDate ||
      activeSt.actualStartDate ||
      (isFlor && cultivation.floweringStartDate) ||
      (isFirstStage && cultivation.startDate)
    );

    scheduleItems.push({
      id: activeSt.id || `stage_${activeStageIndex}_${activeSt.name.toLowerCase()}`,
      name: activeSt.name,
      expectedDurationDays: duration,
      actualDurationDays: undefined,
      startDate: stageStart,
      endDate: stageEnd,
      status: 'active',
      dateKnowledge: 'actual',
      isProjected: true,
      isActual: startReal,
      isUnknown: false,
      startIsReal: startReal,
      endIsReal: Boolean(activeSt.actualEndDate),
      actualStartDate: startReal ? stageStart : activeSt.actualStartDate,
      actualEndDate: activeSt.actualEndDate,
      photoperiodHoursLight: activeSt.photoperiodHoursLight,
      targetTempMinC: activeSt.targetTempMinC,
      targetTempMaxC: activeSt.targetTempMaxC,
      targetHumidityMinPct: activeSt.targetHumidityMinPct,
      targetHumidityMaxPct: activeSt.targetHumidityMaxPct,
      notes: activeSt.notes,
    });

    runnerDate = stageEnd;
  }

  // Third pass: upcoming stages projected forward from runnerDate
  for (let i = activeStageIndex + 1; i < baseStages.length; i++) {
    const st = baseStages[i];
    const isFlor = isFloweringStage(st.name);
    const duration = (isFlor ? floweringDaysGenetics : st.expectedDurationDays) || 7;
    const stageStart = runnerDate;
    const stageEnd = addDays(stageStart, duration);
    runnerDate = stageEnd;

    scheduleItems.push({
      id: st.id || `stage_${i}_${st.name.toLowerCase()}`,
      name: st.name,
      expectedDurationDays: duration,
      actualDurationDays: undefined,
      startDate: stageStart,
      endDate: stageEnd,
      status: 'upcoming',
      dateKnowledge: 'projected',
      isProjected: true,
      isActual: false,
      isUnknown: false,
      startIsReal: false,
      endIsReal: false,
      actualStartDate: undefined,
      actualEndDate: undefined,
      photoperiodHoursLight: st.photoperiodHoursLight,
      targetTempMinC: st.targetTempMinC,
      targetTempMaxC: st.targetTempMaxC,
      targetHumidityMinPct: st.targetHumidityMinPct,
      targetHumidityMaxPct: st.targetHumidityMaxPct,
      notes: st.notes,
    });
  }

  // 7. Harvest calculations
  let harvestStageIndex = baseStages.findIndex(
    (s) => s.name.toLowerCase().includes('cosech') || s.name.toLowerCase().includes('corte')
  );
  if (harvestStageIndex === -1) {
    harvestStageIndex = baseStages.findIndex(
      (s) => s.name === 'Secado' || s.name === 'Finalizado'
    );
  }
  if (harvestStageIndex === -1) harvestStageIndex = baseStages.length - 1;

  const harvestStage = scheduleItems[harvestStageIndex] || scheduleItems[scheduleItems.length - 1];
  const estimatedHarvestDate = harvestStage?.startDate || harvestStage?.endDate || addDays(todayStr, 30);

  // Compute baseline harvest date for comparison
  let baselineTotalDays = 0;
  for (let i = 0; i <= harvestStageIndex; i++) {
    const isFlor = isFloweringStage(baseStages[i].name);
    baselineTotalDays += isFlor ? floweringDaysGenetics : (baseStages[i].expectedDurationDays || 7);
  }
  const baselineHarvestDate = addDays(cropStartDate, baselineTotalDays);

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

  // Cycle start knowledge & total elapsed calculation
  const isCycleStartKnown = isFirstStage || (scheduleItems[0]?.dateKnowledge === 'actual' && Boolean(scheduleItems[0]?.startDate));

  let totalElapsedDays: number | null = null;
  let totalCycleDays: number | null = null;
  let overallProgressPct: number | null = null;

  if (isCycleStartKnown && scheduleItems[0]?.startDate) {
    totalElapsedDays = Math.max(1, daysBetween(scheduleItems[0].startDate, todayStr));
    totalCycleDays = Math.max(1, daysBetween(scheduleItems[0].startDate, estimatedHarvestDate));
    overallProgressPct = Math.min(100, Math.round((totalElapsedDays / totalCycleDays) * 100));
  }

  const activeStageItem = scheduleItems[activeStageIndex] || scheduleItems[0];
  const activeStageStart = activeStageItem?.startDate || todayStr;
  const activeStageElapsedDays = Math.max(1, daysBetween(activeStageStart, todayStr));

  const floweringStage = scheduleItems.find((s) => isFloweringStage(s.name));

  return {
    stages: scheduleItems,
    activeStageIndex,
    activeStage: activeStageItem,
    cropStartDate,
    isCycleStartKnown,
    activeStageElapsedDays,
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
    let currentDate = cultivation.startDate || getLocalTodayDateOnly();

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
  estimatedHarvestDate: string;
  daysUntilHarvest: number;
  isHarvestCompleted: boolean;
}

export function calculateTimelineMetrics(
  cultivation: Cultivation,
  stages: CultivationGrowthStage[],
  geneticsList: Genetics[] = []
): TimelineMetrics {
  const schedule = buildCultivationStageSchedule(cultivation, geneticsList);
  const todayStr = getLocalTodayDateOnly();

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
    (isFloweringStage(schedule.activeStage.name)
      ? cultivation.floweringStartDate || schedule.activeStage.startDate
      : schedule.activeStage.startDate);

  const daysInActiveStage = Math.max(1, daysBetween(stageStartDate, todayStr));
  const expectedStageDuration = schedule.activeStage.expectedDurationDays || 1;
  const activeStageProgressPct = Math.min(
    100,
    Math.round((daysInActiveStage / expectedStageDuration) * 100)
  );

  let harvestStageIndex = stages.findIndex(
    (s) => s.name.toLowerCase().includes('cosech') || s.name.toLowerCase().includes('corte')
  );
  if (harvestStageIndex === -1) {
    harvestStageIndex = stages.findIndex(
      (s) => s.name === 'Secado' || s.name === 'Finalizado'
    );
  }
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
    estimatedHarvestDate: schedule.estimatedHarvestDate,
    daysUntilHarvest: schedule.daysUntilHarvest,
    isHarvestCompleted,
  };
}

/**
 * Builds or updates stagesTimeline ensuring deterministic knowledge preservation
 * across each stage:
 * - prior stages with explicit priorDates: actualStartDate preserved, dateKnowledge='actual', actualEndDate inferred from next stage
 * - prior stages without real dates: dateKnowledge='unknown', actualStartDate=undefined, NO backward projection
 * - active stage: actualStartDate=stageStartDate (or floweringStartDate), dateKnowledge='actual'
 * - future stages: dateKnowledge='projected', projected forward from active stage end
 */
export function buildUpdatedStagesTimeline(params: {
  currentStage: CultivationStageName;
  stageStartDate: string;
  floweringStartDate?: string;
  priorDates?: {
    germinacion?: string;
    plantula?: string;
    vegetativo?: string;
  };
  photoperiodType?: PhotoperiodType;
  declaredFloweringWeeks?: number;
  type?: CultivationType;
  existingTimeline?: CultivationGrowthStage[];
}): CultivationGrowthStage[] {
  // 1. Determinar lista base de etapas
  let baseStages: CultivationGrowthStage[] = [];
  if (params.existingTimeline && params.existingTimeline.length > 0) {
    baseStages = params.existingTimeline.map((s) => ({ ...s }));
  } else {
    const dummyCrop: any = {
      photoperiodType: params.photoperiodType || 'Fotoperiódica',
      declaredFloweringWeeks: params.declaredFloweringWeeks || 8,
      type: params.type || 'Indoor',
      startDate: params.stageStartDate,
      currentStage: params.currentStage,
    };
    baseStages = getStagesForCultivation(dummyCrop);
  }

  const normCurrent = (params.currentStage || '').toLowerCase().trim();
  const activeIdx = baseStages.findIndex(
    (s) => s.name.toLowerCase().trim() === normCurrent
  );
  const resolvedActiveIdx = activeIdx !== -1 ? activeIdx : 0;

  const explicitPriorDateForStage = (stageName: string): string | undefined => {
    const sName = stageName.toLowerCase().trim();
    if (sName.includes('germin')) {
      return params.priorDates?.germinacion?.trim() || undefined;
    }
    if (sName.includes('plánt') || sName.includes('plant')) {
      return params.priorDates?.plantula?.trim() || undefined;
    }
    if (sName.includes('veg')) {
      return params.priorDates?.vegetativo?.trim() || undefined;
    }
    return undefined;
  };

  const updatedStages: CultivationGrowthStage[] = [];
  const activeStageRealStart =
    (isFloweringStage(params.currentStage) && params.floweringStartDate) ||
    params.stageStartDate;

  // Paso 1: Asignar fechas reales a cada etapa
  for (let i = 0; i < baseStages.length; i++) {
    const st = { ...baseStages[i] };
    if (i < resolvedActiveIdx) {
      const explicit = explicitPriorDateForStage(st.name);
      if (explicit) {
        st.actualStartDate = explicit;
        st.startDate = explicit;
        st.dateKnowledge = 'actual';
        st.isCompleted = true;
      } else if (st.actualStartDate) {
        st.startDate = st.actualStartDate;
        st.dateKnowledge = 'actual';
        st.isCompleted = true;
      } else {
        st.actualStartDate = undefined;
        st.actualEndDate = undefined;
        st.startDate = undefined as any;
        st.endDate = undefined;
        st.dateKnowledge = 'unknown';
        st.isCompleted = true;
      }
    } else if (i === resolvedActiveIdx) {
      st.actualStartDate = activeStageRealStart;
      st.startDate = activeStageRealStart;
      st.actualEndDate = undefined;
      st.dateKnowledge = 'actual';
      st.isCompleted = false;
    } else {
      st.actualStartDate = undefined;
      st.actualEndDate = undefined;
      st.dateKnowledge = 'projected';
      st.isCompleted = false;
    }
    updatedStages.push(st);
  }

  // Paso 2: Inferir transiciones reales (actualEndDate) entre etapas conocidas consecutivas
  for (let i = 0; i < resolvedActiveIdx; i++) {
    const current = updatedStages[i];
    if (current.actualStartDate) {
      let nextKnownStart: string | undefined = undefined;
      for (let j = i + 1; j <= resolvedActiveIdx; j++) {
        if (updatedStages[j].actualStartDate) {
          nextKnownStart = updatedStages[j].actualStartDate;
          break;
        }
      }
      if (nextKnownStart) {
        current.actualEndDate = nextKnownStart;
        current.endDate = nextKnownStart;
        current.dateKnowledge = 'actual';
      } else if (!current.actualEndDate) {
        current.endDate = addDays(current.actualStartDate, current.expectedDurationDays || 7);
      }
    }
  }

  // Paso 3: Proyectar hacia adelante etapas futuras desde el cierre de la etapa activa
  const activeSt = updatedStages[resolvedActiveIdx];
  const activeDuration =
    (isFloweringStage(activeSt.name) && params.declaredFloweringWeeks
      ? Math.max(28, params.declaredFloweringWeeks * 7)
      : activeSt.expectedDurationDays) || 7;
  activeSt.endDate = addDays(activeSt.startDate || params.stageStartDate, activeDuration);

  let runner = activeSt.endDate;
  for (let i = resolvedActiveIdx + 1; i < updatedStages.length; i++) {
    const fut = updatedStages[i];
    fut.startDate = runner;
    const dur = fut.expectedDurationDays || 7;
    fut.endDate = addDays(fut.startDate, dur);
    fut.dateKnowledge = 'projected';
    runner = fut.endDate;
  }

  return updatedStages;
}

