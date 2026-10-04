import {
  Cultivation,
  Watering,
  EnvironmentRecord,
  PhotoRecord,
  DiaryEntry,
  Genetics,
  Harvest,
  CultivationIntelligenceContext,
} from '../types';
import { buildCultivationStageSchedule, daysBetween, getLocalTodayDateOnly, isFloweringStage } from '../utils/growthStageUtils';
import { calculateIrrigationForecast, calculateHistoricalWateringStats, buildWateringEpisodes } from './irrigationForecastService';

/**
 * Precalculates high-precision agronomic context for Cultiveta IA.
 * Replaces unstructured raw dumps with structured, deterministic metrics.
 */
export function buildCultivationIntelligenceContext(params: {
  cultivation: Cultivation;
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos?: PhotoRecord[];
  diaryEntries?: DiaryEntry[];
  geneticsList?: Genetics[];
  harvests?: Harvest[];
  evalDate?: Date;
}): CultivationIntelligenceContext {
  const {
    cultivation,
    waterings,
    envRecords,
    photos = [],
    diaryEntries = [],
    geneticsList = [],
    harvests = [],
    evalDate = new Date(),
  } = params;

  // 1. Identity context (no fictional defaults)
  const matchedGenetics = geneticsList.find(
    (g) =>
      g.id === cultivation.geneticsId ||
      (g.name && cultivation.geneticsName && g.name.toLowerCase().trim() === cultivation.geneticsName.toLowerCase().trim())
  );

  const identity: CultivationIntelligenceContext['identity'] = {
    cultivationId: cultivation.id,
    name: cultivation.name,
    geneticsName: cultivation.geneticsName || matchedGenetics?.name || undefined,
    seedBank: cultivation.seedBank || matchedGenetics?.seedBank || undefined,
    type: cultivation.type || 'Indoor',
    plantCount: cultivation.plantCount || 1,
    substrateType: cultivation.substrate?.type || undefined,
    potVolumeLiters: cultivation.substrate?.potVolumeLiters || undefined,
    potType: cultivation.substrate?.potType || undefined,
    lightingType: cultivation.lighting?.type || undefined,
    lightingWatts: cultivation.lighting?.usedWatts || cultivation.lighting?.nominalWatts || undefined,
    photoperiodHoursLight: cultivation.lighting?.photoperiodHoursLight || (isFloweringStage(cultivation.currentStage) ? 12 : 18),
    photoperiodHoursDark: cultivation.lighting?.photoperiodHoursDark || (isFloweringStage(cultivation.currentStage) ? 12 : 6),
  };

  // 2. Chronological context strictly derived from buildCultivationStageSchedule
  const schedule = buildCultivationStageSchedule(cultivation, geneticsList);
  const todayStr = getLocalTodayDateOnly(evalDate);
  const realDaysElapsed = Math.max(1, daysBetween(schedule.cropStartDate, todayStr));

  const activeStage = schedule.activeStage;
  const stageStart = activeStage?.actualStartDate || cultivation.stageStartDate || activeStage?.startDate;
  const daysInActiveStage = stageStart ? Math.max(1, daysBetween(stageStart, todayStr)) : 1;

  const completedStages = schedule.stages
    .filter((s) => s.status === 'completed')
    .map((s) => ({
      name: s.name,
      actualDurationDays: s.actualDurationDays,
      actualStartDate: s.actualStartDate,
      actualEndDate: s.actualEndDate,
      expectedDurationDays: s.expectedDurationDays,
    }));

  const chronology: CultivationIntelligenceContext['chronology'] = {
    startDate: schedule.cropStartDate,
    realDaysElapsed,
    currentStage: cultivation.currentStage || activeStage?.name || 'Vegetativo',
    stageStartDate: stageStart,
    daysInActiveStage,
    actualStartDate: activeStage?.actualStartDate,
    actualEndDate: activeStage?.actualEndDate,
    completedStages,
    projectedHarvestDate: schedule.estimatedHarvestDate,
    estimatedHarvestDate: schedule.estimatedHarvestDate,
    adjustmentDeltaDays: schedule.adjustmentDeltaDays,
    hasStageAdjustments: schedule.hasStageAdjustments,
  };

  // 3. Irrigation Context & Deterministic Forecast
  const cropWaterings = waterings
    .filter((w) => w.cultivationId === cultivation.id && w.volumeLiters > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const episodes = buildWateringEpisodes(cultivation.id, cropWaterings, envRecords);
  const stats = calculateHistoricalWateringStats(episodes);
  const forecast = calculateIrrigationForecast(cultivation, cropWaterings, envRecords, evalDate);

  const lastW = cropWaterings.length > 0 ? cropWaterings[cropWaterings.length - 1] : null;

  const lastWateringData = lastW
    ? {
        date: lastW.date,
        time: lastW.time,
        volumeLiters: lastW.volumeLiters,
        phIn: lastW.phIn,
        ecIn: lastW.ecIn,
        phRunoff: lastW.phRunoff,
        ecRunoff: lastW.ecRunoff,
        waterTempC: lastW.waterTempC,
        productsSummary: lastW.productsUsed?.map((p) => `${p.name} (${p.dosageMlPerL || ''} ml/L)`),
        runoffVolumeLiters: lastW.runoffVolumeLiters,
      }
    : null;

  const recentWateringsSummary = cropWaterings.slice(-5).map((w, idx, arr) => {
    let hoursSincePrev: number | undefined = undefined;
    if (idx > 0) {
      const prevDate = new Date(arr[idx - 1].date).getTime();
      const currDate = new Date(w.date).getTime();
      hoursSincePrev = Math.round((currDate - prevDate) / (1000 * 60 * 60));
    }
    return {
      date: w.date,
      volumeL: w.volumeLiters,
      phIn: w.phIn,
      ecIn: w.ecIn,
      hoursSincePrevious: hoursSincePrev,
    };
  });

  const irrigation: CultivationIntelligenceContext['irrigation'] = {
    lastWatering: lastWateringData,
    recentWaterings: recentWateringsSummary,
    statistics: {
      medianIntervalHours: stats.medianIntervalHours,
      averageIntervalHours: stats.averageIntervalHours,
      medianVolumeLiters: stats.medianVolumeLiters,
      totalRecordedWaterings: cropWaterings.length,
      intervalByVpdLevel: stats.intervalByVpdLevel,
    },
    forecast,
  };

  // 4. Environment Context
  const cropEnv = envRecords
    .filter((e) => !e.cultivationId || e.cultivationId === cultivation.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const latestEnv = cropEnv.length > 0 ? cropEnv[0] : null;

  const environment: CultivationIntelligenceContext['environment'] = {
    latest: latestEnv
      ? {
          date: latestEnv.date,
          time: latestEnv.time,
          tempC: latestEnv.temperatureC,
          humidityPct: latestEnv.humidityPct,
          vpdKPa: latestEnv.vpdKPa,
          ppfd: latestEnv.ppfd,
        }
      : null,
    avgSinceLastWatering: {
      tempC: forecast.avgTempSinceWatering ?? undefined,
      maxTempC: forecast.maxTempSinceWatering ?? undefined,
      humidityPct: forecast.avgHumiditySinceWatering ?? undefined,
      vpdKPa: forecast.avgVpdSinceWatering ?? undefined,
      maxVpdKPa: forecast.maxVpdSinceWatering ?? undefined,
      ppfd: forecast.avgPpfdSinceWatering ?? undefined,
      estimatedDli: forecast.estimatedDli ?? undefined,
    },
    recordsCount: cropEnv.length,
  };

  // 5. Notes & Photos
  const cropNotes = diaryEntries.filter((d) => d.cultivationId === cultivation.id);
  const cropPhotos = photos.filter((p) => p.cultivationId === cultivation.id);

  const notesAndPhotos: CultivationIntelligenceContext['notesAndPhotos'] = {
    recentNotesCount: cropNotes.length,
    recentPhotosCount: cropPhotos.length,
    recentNoteSnippets: cropNotes.slice(-3).map((n) => n.content?.slice(0, 120) || ''),
    recentPhotoCategories: Array.from(new Set(cropPhotos.slice(-6).map((p) => p.category || 'general'))),
  };

  // 6. Harvests Summary
  const pastHarvestsCount = harvests.length;
  const recentHarvest = harvests.length > 0 ? harvests[0] : null;

  const harvestsSummary: CultivationIntelligenceContext['harvestsSummary'] = {
    pastHarvestsCount,
    recentHarvestWeightGrams: recentHarvest?.finalDryWeightGrams,
  };

  return {
    identity,
    chronology,
    irrigation,
    environment,
    notesAndPhotos,
    harvestsSummary,
  };
}
