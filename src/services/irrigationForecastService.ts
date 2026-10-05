import { Cultivation, Watering, EnvironmentRecord, IrrigationForecast, PotLiftFeeling } from '../types';
import { environmentService } from './environmentService';
import { getRecommendedWateringIntervalDays } from '../utils/wateringAlertUtils';
import {
  getLocalTodayDateOnly,
  parseDateOnly,
  formatDateOnly,
  addDays,
  isFloweringStage,
} from '../utils/growthStageUtils';

export interface WateringEpisode {
  episodeIndex: number;
  cultivationId: string;
  wateringStartAt: string; // YYYY-MM-DDTHH:mm
  wateringEndAt: string;
  intervalHours: number;
  appliedVolumeLiters: number;
  runoffVolumeLiters?: number;
  netVolumeLiters: number;
  avgTempC: number | null;
  maxTempC: number | null;
  avgHumidityPct: number | null;
  avgVpdKPa: number | null;
  maxVpdKPa: number | null;
  avgPpfd: number | null;
  estimatedDli: number | null;
  potLiftBeforeWatering?: PotLiftFeeling;
  potWeightBeforeKg?: number;
  potWeightAfterKg?: number;
  potWeightLossKg?: number;
  substrateMoistureBeforePct?: number;
  substrateMoistureAfterPct?: number;
}

export interface HistoricalWateringStats {
  episodes: WateringEpisode[];
  intervalsHours: number[];
  representativeIntervalsHours: number[];
  medianIntervalHours: number | null;
  averageIntervalHours: number | null;
  dispersionHours: number; // MAD (Median Absolute Deviation)
  volumesLiters: number[];
  medianVolumeLiters: number | null;
  averageVolumeLiters: number | null;
  historicalAvgVpd: number | null;
  historicalAvgTemp: number | null;
  hasDirectWeightMeasurements: boolean;
  hasDirectMoistureMeasurements: boolean;
  hasDirectPotLift: boolean;
  potLiftDistribution?: {
    heavy: number;
    medium: number;
    light: number;
    very_light: number;
  };
  intervalByVpdLevel?: {
    lowVpdAvgHours: number | null;
    mediumVpdAvgHours: number | null;
    highVpdAvgHours: number | null;
    sampleSize: number;
  };
}

/**
 * Calculates DLI (Daily Light Integral in mol/m²/day) from PPFD (umol/m²/s) and photoperiod hours.
 * Formula: PPFD * (photoperiodHours * 3600 seconds) / 1,000,000
 */
export function calculateDLI(ppfd: number, photoperiodHours: number): number {
  if (ppfd <= 0 || photoperiodHours <= 0) return 0;
  const lightSeconds = photoperiodHours * 3600;
  return Number(((ppfd * lightSeconds) / 1_000_000).toFixed(2));
}

/**
 * Robust median calculation to eliminate outlier distortion.
 */
export function calculateMedian(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
}

/**
 * Median Absolute Deviation (MAD) for robust dispersion measurement.
 */
export function calculateMAD(values: number[], median: number): number {
  if (!values || values.length <= 1) return 0;
  const absoluteDeviations = values.map((v) => Math.abs(v - median));
  const mad = calculateMedian(absoluteDeviations);
  return mad ?? 0;
}

/**
 * Interquartile Range (IQR).
 */
export function calculateIQR(values: number[]): { q1: number; q3: number; iqr: number } {
  if (!values || values.length < 4) {
    const med = calculateMedian(values) || 0;
    return { q1: med, q3: med, iqr: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);

  const q1 = calculateMedian(lowerHalf) ?? sorted[0];
  const q3 = calculateMedian(upperHalf) ?? sorted[sorted.length - 1];
  return { q1, q3, iqr: Number((q3 - q1).toFixed(1)) };
}

/**
 * Combines date string (YYYY-MM-DD or ISO) and optional time (HH:mm) into a UTC millisecond timestamp.
 */
export function parseWateringTimestamp(dateStr: string, timeStr?: string): number {
  if (!dateStr) return Date.now();
  const dateOnly = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) return Date.now();

  let hours = 12;
  let minutes = 0;
  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && h >= 0 && h <= 23) hours = h;
    if (!isNaN(m) && m >= 0 && m <= 59) minutes = m;
  } else if (dateStr.includes('T')) {
    const timePart = dateStr.split('T')[1];
    if (timePart) {
      const [h, m] = timePart.split(':').map(Number);
      if (!isNaN(h) && h >= 0 && h <= 23) hours = h;
      if (!isNaN(m) && m >= 0 && m <= 59) minutes = m;
    }
  }

  return Date.UTC(parsed.year, parsed.month - 1, parsed.day, hours, minutes);
}

/**
 * Formats a timestamp into YYYY-MM-DDTHH:mm
 */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

/**
 * Builds dryback episodes between consecutive waterings for a single cultivation.
 * Each episode contains environmental statistics and net water applied.
 */
export function buildWateringEpisodes(
  cultivationId: string,
  waterings: Watering[],
  envRecords: EnvironmentRecord[]
): WateringEpisode[] {
  // Strict filter by cultivationId
  const cropWaterings = waterings
    .filter((w) => w.cultivationId === cultivationId && w.volumeLiters > 0)
    .sort((a, b) => parseWateringTimestamp(a.date, a.time) - parseWateringTimestamp(b.date, b.time));

  if (cropWaterings.length < 2) {
    return [];
  }

  const cropEnv = envRecords
    .filter((e) => !e.cultivationId || e.cultivationId === cultivationId)
    .sort((a, b) => parseWateringTimestamp(a.date, a.time) - parseWateringTimestamp(b.date, b.time));

  const episodes: WateringEpisode[] = [];

  for (let i = 0; i < cropWaterings.length - 1; i++) {
    const currentW = cropWaterings[i];
    const nextW = cropWaterings[i + 1];

    const startMs = parseWateringTimestamp(currentW.date, currentW.time);
    const endMs = parseWateringTimestamp(nextW.date, nextW.time);
    const diffHours = (endMs - startMs) / (1000 * 60 * 60);

    // Discard anomalies (negative or unrealistically long periods > 20 days)
    if (diffHours < 6 || diffHours > 480) {
      continue;
    }

    const appliedVolume = currentW.volumeLiters;
    const runoffVolume = currentW.runoffVolumeLiters !== undefined && currentW.runoffVolumeLiters > 0
      ? currentW.runoffVolumeLiters
      : undefined;
    const netVolume = Math.max(0.1, appliedVolume - (runoffVolume || 0));

    // Match environment records inside this episode
    const episodeEnv = cropEnv.filter((e) => {
      const eMs = parseWateringTimestamp(e.date, e.time);
      return eMs >= startMs && eMs <= endMs;
    });

    let avgTemp: number | null = null;
    let maxTemp: number | null = null;
    let avgHum: number | null = null;
    let avgVpd: number | null = null;
    let maxVpd: number | null = null;
    let avgPpfd: number | null = null;

    if (episodeEnv.length > 0) {
      const temps = episodeEnv.map((e) => e.temperatureC).filter((t): t is number => typeof t === 'number');
      const hums = episodeEnv.map((e) => e.humidityPct).filter((h): h is number => typeof h === 'number');
      const vpds = episodeEnv.map((e) => {
        if (typeof e.vpdKPa === 'number' && e.vpdKPa > 0) return e.vpdKPa;
        const t = e.temperatureC;
        const h = e.humidityPct;
        if (typeof t === 'number' && typeof h === 'number') {
          return environmentService.calculateVPD(t, h, e.leafTempC);
        }
        return null;
      }).filter((v): v is number => typeof v === 'number');

      const ppfds = episodeEnv.map((e) => e.ppfd).filter((p): p is number => typeof p === 'number' && p > 0);

      if (temps.length > 0) {
        avgTemp = Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1));
        maxTemp = Number(Math.max(...temps).toFixed(1));
      }
      if (hums.length > 0) {
        avgHum = Number((hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1));
      }
      if (vpds.length > 0) {
        avgVpd = Number((vpds.reduce((a, b) => a + b, 0) / vpds.length).toFixed(2));
        maxVpd = Number(Math.max(...vpds).toFixed(2));
      }
      if (ppfds.length > 0) {
        avgPpfd = Math.round(ppfds.reduce((a, b) => a + b, 0) / ppfds.length);
      }
    }

    // Direct measurement: pot weight loss between watering after-weight and next pre-weight
    let potWeightLossKg: number | undefined = undefined;
    if (
      currentW.potWeightAfterWateringKg !== undefined &&
      nextW.potWeightBeforeWateringKg !== undefined &&
      currentW.potWeightAfterWateringKg > nextW.potWeightBeforeWateringKg
    ) {
      potWeightLossKg = Number((currentW.potWeightAfterWateringKg - nextW.potWeightBeforeWateringKg).toFixed(2));
    }

    episodes.push({
      episodeIndex: i,
      cultivationId,
      wateringStartAt: formatTimestamp(startMs),
      wateringEndAt: formatTimestamp(endMs),
      intervalHours: Number(diffHours.toFixed(1)),
      appliedVolumeLiters: appliedVolume,
      runoffVolumeLiters: runoffVolume,
      netVolumeLiters: Number(netVolume.toFixed(2)),
      avgTempC: avgTemp,
      maxTempC: maxTemp,
      avgHumidityPct: avgHum,
      avgVpdKPa: avgVpd,
      maxVpdKPa: maxVpd,
      avgPpfd,
      estimatedDli: null,
      potLiftBeforeWatering: nextW.potLiftBeforeWatering,
      potWeightBeforeKg: currentW.potWeightBeforeWateringKg,
      potWeightAfterKg: currentW.potWeightAfterWateringKg,
      potWeightLossKg,
      substrateMoistureBeforePct: currentW.substrateMoistureBeforePct,
      substrateMoistureAfterPct: currentW.substrateMoistureAfterPct,
    });
  }

  return episodes;
}

/**
 * Calculates historical statistical summary based on episodes.
 * Uses robust MEDIAN and MAD/IQR to prevent single extreme events from corrupting forecasts.
 * Distinguishes anticipated waterings (potLift = 'heavy') from full dryback cycles.
 */
export function calculateHistoricalWateringStats(episodes: WateringEpisode[]): HistoricalWateringStats {
  if (episodes.length === 0) {
    return {
      episodes: [],
      intervalsHours: [],
      representativeIntervalsHours: [],
      medianIntervalHours: null,
      averageIntervalHours: null,
      dispersionHours: 0,
      volumesLiters: [],
      medianVolumeLiters: null,
      averageVolumeLiters: null,
      historicalAvgVpd: null,
      historicalAvgTemp: null,
      hasDirectWeightMeasurements: false,
      hasDirectMoistureMeasurements: false,
      hasDirectPotLift: false,
      potLiftDistribution: { heavy: 0, medium: 0, light: 0, very_light: 0 },
    };
  }

  const intervals = episodes.map((e) => e.intervalHours);
  const volumes = episodes.map((e) => e.netVolumeLiters);

  // Pot lift evaluation
  const potLiftDistribution = {
    heavy: episodes.filter((e) => e.potLiftBeforeWatering === 'heavy').length,
    medium: episodes.filter((e) => e.potLiftBeforeWatering === 'medium').length,
    light: episodes.filter((e) => e.potLiftBeforeWatering === 'light').length,
    very_light: episodes.filter((e) => e.potLiftBeforeWatering === 'very_light').length,
  };
  const hasDirectPotLift = episodes.some((e) => Boolean(e.potLiftBeforeWatering));

  // Determine representative dryback intervals:
  // Episodes with potLift === 'heavy' indicate that the user watered prematurely before dryback.
  // We do NOT treat those short intervals as full dryback.
  const representativeEpisodes = episodes.filter((e) => e.potLiftBeforeWatering !== 'heavy');
  const candidateIntervals = representativeEpisodes.length > 0
    ? representativeEpisodes.map((e) => e.intervalHours)
    : intervals;

  const medianInterval = calculateMedian(candidateIntervals);
  const avgInterval = Number((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1));
  const dispersion = medianInterval ? calculateMAD(candidateIntervals, medianInterval) : 0;

  const medianVolume = calculateMedian(volumes);
  const avgVolume = Number((volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(2));

  const vpds = episodes.map((e) => e.avgVpdKPa).filter((v): v is number => typeof v === 'number');
  const temps = episodes.map((e) => e.avgTempC).filter((t): t is number => typeof t === 'number');

  const historicalAvgVpd = vpds.length > 0
    ? Number((vpds.reduce((a, b) => a + b, 0) / vpds.length).toFixed(2))
    : null;

  const historicalAvgTemp = temps.length > 0
    ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1))
    : null;

  const hasDirectWeight = episodes.some((e) => e.potWeightLossKg !== undefined && e.potWeightLossKg > 0);
  const hasDirectMoisture = episodes.some(
    (e) => e.substrateMoistureBeforePct !== undefined || e.substrateMoistureAfterPct !== undefined
  );

  // Correlation of interval by VPD level if sufficient episodes
  let intervalByVpdLevel: HistoricalWateringStats['intervalByVpdLevel'] = undefined;
  if (vpds.length >= 3) {
    const lowVpdEpisodes = episodes.filter((e) => e.avgVpdKPa !== null && e.avgVpdKPa < 1.0);
    const medVpdEpisodes = episodes.filter((e) => e.avgVpdKPa !== null && e.avgVpdKPa >= 1.0 && e.avgVpdKPa <= 1.4);
    const highVpdEpisodes = episodes.filter((e) => e.avgVpdKPa !== null && e.avgVpdKPa > 1.4);

    intervalByVpdLevel = {
      lowVpdAvgHours: lowVpdEpisodes.length > 0
        ? Number((lowVpdEpisodes.reduce((sum, e) => sum + e.intervalHours, 0) / lowVpdEpisodes.length).toFixed(1))
        : null,
      mediumVpdAvgHours: medVpdEpisodes.length > 0
        ? Number((medVpdEpisodes.reduce((sum, e) => sum + e.intervalHours, 0) / medVpdEpisodes.length).toFixed(1))
        : null,
      highVpdAvgHours: highVpdEpisodes.length > 0
        ? Number((highVpdEpisodes.reduce((sum, e) => sum + e.intervalHours, 0) / highVpdEpisodes.length).toFixed(1))
        : null,
      sampleSize: vpds.length,
    };
  }

  return {
    episodes,
    intervalsHours: intervals,
    representativeIntervalsHours: candidateIntervals,
    medianIntervalHours: medianInterval,
    averageIntervalHours: avgInterval,
    dispersionHours: Number(dispersion.toFixed(1)),
    volumesLiters: volumes,
    medianVolumeLiters: medianVolume,
    averageVolumeLiters: avgVolume,
    historicalAvgVpd,
    historicalAvgTemp,
    hasDirectWeightMeasurements: hasDirectWeight,
    hasDirectMoistureMeasurements: hasDirectMoisture,
    hasDirectPotLift,
    potLiftDistribution,
    intervalByVpdLevel,
  };
}

/**
 * Calculates environmental demand index.
 * Relates current VPD and temperature to historical baselines.
 * Higher environmental demand (>1.0) accelerates transpirational dryback.
 * Lower environmental demand (<1.0) decelerates it.
 */
export function calculateEnvironmentalDemandIndex(params: {
  currentVpd: number | null;
  currentTemp: number | null;
  historicalVpd: number | null;
  historicalTemp: number | null;
  stageName?: string;
}): {
  demandIndex: number;
  notes: string[];
  baselineSource: 'historical' | 'generic_stage' | 'insufficient_data';
} {
  const { currentVpd, currentTemp, historicalVpd, historicalTemp, stageName } = params;
  const notes: string[] = [];

  let baselineSource: 'historical' | 'generic_stage' | 'insufficient_data' = 'historical';
  let baselineVpd = historicalVpd;
  let baselineTemp = historicalTemp;

  if (baselineVpd === null || baselineTemp === null) {
    baselineSource = 'generic_stage';
    baselineVpd = historicalVpd ?? (isFloweringStage(stageName) ? 1.3 : 1.0);
    baselineTemp = historicalTemp ?? (isFloweringStage(stageName) ? 23.5 : 24.5);
  }

  if (currentVpd === null && currentTemp === null && historicalVpd === null && historicalTemp === null) {
    baselineSource = 'insufficient_data';
  }

  let vpdRatio = 1.0;
  if (currentVpd !== null && baselineVpd > 0) {
    vpdRatio = currentVpd / baselineVpd;
    if (vpdRatio > 1.15) {
      notes.push(`VPD actual (${currentVpd} kPa) superior a la referencia (${baselineVpd} kPa), acelerando la transpiración.`);
    } else if (vpdRatio < 0.85) {
      notes.push(`VPD actual (${currentVpd} kPa) inferior a la referencia (${baselineVpd} kPa), ralentizando la demanda hídrica.`);
    }
  }

  let tempRatio = 1.0;
  if (currentTemp !== null && baselineTemp > 0) {
    tempRatio = currentTemp / baselineTemp;
  }

  // Weight VPD significantly higher (65%) than temperature (35%) because VPD directly governs stomatal transpiration
  let rawIndex = 0.65 * vpdRatio + 0.35 * tempRatio;

  // Bound index safely between 0.70 (very humid/cool) and 1.55 (very dry/hot)
  const demandIndex = Number(Math.min(1.55, Math.max(0.70, rawIndex)).toFixed(2));

  return { demandIndex, notes, baselineSource };
}

/**
 * Central deterministic mathematical engine for irrigation forecasting.
 * Pure function: receives real records, computes intervals, statistical medians,
 * demand index, and non-spurious inspection windows.
 */
export function calculateIrrigationForecast(
  cultivation: Cultivation,
  waterings: Watering[],
  envRecords: EnvironmentRecord[],
  evalDate: Date = new Date()
): IrrigationForecast {
  const modelVersion = '1.0.0-deterministic';
  const factors: string[] = [];
  const missingSignals: string[] = [];

  // 1. Filter waterings for this cultivation
  const cropWaterings = waterings
    .filter((w) => w.cultivationId === cultivation.id && w.volumeLiters > 0)
    .sort((a, b) => parseWateringTimestamp(a.date, a.time) - parseWateringTimestamp(b.date, b.time));

  const episodes = buildWateringEpisodes(cultivation.id, cropWaterings, envRecords);
  const stats = calculateHistoricalWateringStats(episodes);

  // Fallback check when no watering is recorded at all
  if (cropWaterings.length === 0) {
    const stage = cultivation.currentStage || 'Vegetativo';
    const fallbackDays = getRecommendedWateringIntervalDays(stage) || 3;
    const fallbackHours = fallbackDays * 24;

    const evalMs = evalDate.getTime();
    const estNextMs = evalMs + fallbackHours * 3600 * 1000;
    const windowStartMs = estNextMs - 12 * 3600 * 1000;
    const windowEndMs = estNextMs + 12 * 3600 * 1000;

    missingSignals.push('Sin riegos previos registrados');
    missingSignals.push('Sin registros ambientales pos-riego');
    missingSignals.push('Volumen de drenaje (runoff) no registrado');
    missingSignals.push('Peso de maceta no medido');
    missingSignals.push('Humedad de sustrato no medida');

    factors.push(`Estimación inicial basada en la etapa (${stage}: ~${fallbackDays} días).`);
    factors.push('Todavía faltan ciclos registrados para personalizar el cálculo al comportamiento de este cultivo.');

    return {
      lastWateringAt: null,
      hoursSinceLastWatering: null,
      appliedWaterLiters: null,
      netWaterLiters: null,
      avgTempSinceWatering: null,
      maxTempSinceWatering: null,
      avgHumiditySinceWatering: null,
      avgVpdSinceWatering: null,
      maxVpdSinceWatering: null,
      avgPpfdSinceWatering: null,
      estimatedDli: null,
      historicalMedianIntervalHours: null,
      historicalAverageVolumeLiters: null,
      historicalMedianVolumeLiters: null,
      demandIndex: 1.0,
      estimatedDrybackRateLitersPerDay: null,
      estimatedRemainingAvailableWaterLiters: null,
      estimatedNextWateringAt: formatTimestamp(estNextMs),
      wateringWindowStart: formatTimestamp(windowStartMs),
      wateringWindowEnd: formatTimestamp(windowEndMs),
      confidence: 'low',
      factors,
      missingSignals,
      modelVersion,
    };
  }

  // Latest watering details
  const lastW = cropWaterings[cropWaterings.length - 1];
  const lastWateringMs = parseWateringTimestamp(lastW.date, lastW.time);
  const lastWateringAt = formatTimestamp(lastWateringMs);

  const evalMs = evalDate.getTime();
  const hoursSinceLastWatering = Math.max(0, Number(((evalMs - lastWateringMs) / (1000 * 60 * 60)).toFixed(1)));

  const appliedWaterLiters = lastW.volumeLiters;
  const runoffVolumeLiters = lastW.runoffVolumeLiters !== undefined && lastW.runoffVolumeLiters > 0
    ? lastW.runoffVolumeLiters
    : undefined;
  const netWaterLiters = Math.max(0.1, appliedWaterLiters - (runoffVolumeLiters || 0));

  factors.push(`Último riego: ${appliedWaterLiters} L el ${lastW.date}${lastW.time ? ` a las ${lastW.time}` : ''}.`);
  if (runoffVolumeLiters !== undefined) {
    factors.push(`Drenaje registrado: ${runoffVolumeLiters} L (agua retenida aproximada: ${netWaterLiters} L).`);
  } else {
    missingSignals.push('Volumen de drenaje (runoff) no registrado');
  }

  // 2. Environment since last watering
  const cropEnv = envRecords
    .filter((e) => !e.cultivationId || e.cultivationId === cultivation.id)
    .filter((e) => parseWateringTimestamp(e.date, e.time) >= lastWateringMs);

  let avgTempSince: number | null = null;
  let maxTempSince: number | null = null;
  let avgHumSince: number | null = null;
  let avgVpdSince: number | null = null;
  let maxVpdSince: number | null = null;
  let avgPpfdSince: number | null = null;
  let estimatedDli: number | null = null;

  if (cropEnv.length > 0) {
    const temps = cropEnv.map((e) => e.temperatureC).filter((t): t is number => typeof t === 'number');
    const hums = cropEnv.map((e) => e.humidityPct).filter((h): h is number => typeof h === 'number');
    const vpds = cropEnv.map((e) => {
      if (typeof e.vpdKPa === 'number' && e.vpdKPa > 0) return e.vpdKPa;
      const t = e.temperatureC;
      const h = e.humidityPct;
      if (typeof t === 'number' && typeof h === 'number') {
        return environmentService.calculateVPD(t, h, e.leafTempC);
      }
      return null;
    }).filter((v): v is number => typeof v === 'number');

    const ppfds = cropEnv.map((e) => e.ppfd).filter((p): p is number => typeof p === 'number' && p > 0);

    if (temps.length > 0) {
      avgTempSince = Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1));
      maxTempSince = Number(Math.max(...temps).toFixed(1));
      factors.push(`Temperatura media post-riego: ${avgTempSince} °C.`);
    }
    if (hums.length > 0) {
      avgHumSince = Number((hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1));
    }
    if (vpds.length > 0) {
      avgVpdSince = Number((vpds.reduce((a, b) => a + b, 0) / vpds.length).toFixed(2));
      maxVpdSince = Number(Math.max(...vpds).toFixed(2));
      factors.push(`VPD promedio post-riego: ${avgVpdSince} kPa.`);
    }
    if (ppfds.length > 0) {
      avgPpfdSince = Math.round(ppfds.reduce((a, b) => a + b, 0) / ppfds.length);
      const photoHours = cultivation.lighting?.photoperiodHoursLight;
      if (typeof photoHours === 'number' && photoHours > 0) {
        estimatedDli = calculateDLI(avgPpfdSince, photoHours);
        factors.push(`Radiación lumínica: PPFD ~${avgPpfdSince} µmol/m²/s (DLI estimado ~${estimatedDli} mol/m²/d con ${photoHours}h de luz).`);
      } else {
        estimatedDli = null;
        missingSignals.push('Fotoperíodo no registrado: no se puede calcular DLI con precisión.');
        factors.push(`Radiación lumínica: PPFD ~${avgPpfdSince} µmol/m²/s (sin fotoperíodo registrado para calcular DLI).`);
      }
    } else {
      missingSignals.push('PPFD / DLI no registrado');
    }
  } else {
    missingSignals.push('Sin registros ambientales posteriores al último riego');
  }

  // Qualitative pot lift observation
  if (lastW.potLiftBeforeWatering) {
    const potLiftDescriptions: Record<PotLiftFeeling, string> = {
      very_light: "Percepción de maceta antes de regar: 'muy liviana' (sustrato seco al momento del riego).",
      light: "Percepción de maceta antes de regar: 'liviana' (buena pérdida de agua previa).",
      medium: "Percepción de maceta antes de regar: 'intermedia' (humedad residual presente).",
      heavy: "Percepción de maceta antes de regar: 'pesada' (riego realizado de forma anticipada).",
    };
    factors.push(potLiftDescriptions[lastW.potLiftBeforeWatering]);
  } else {
    missingSignals.push('Percepción de peso de maceta (levantada a mano) no registrada');
  }

  if (lastW.substrateMoistureBeforePct !== undefined) {
    factors.push(`Humedad de sustrato medida con sensor: ${lastW.substrateMoistureBeforePct}%.`);
  } else {
    missingSignals.push('Humedad de sustrato no medida');
  }

  // 3. Environmental Demand Index
  const demandResult = calculateEnvironmentalDemandIndex({
    currentVpd: avgVpdSince,
    currentTemp: avgTempSince,
    historicalVpd: stats.historicalAvgVpd,
    historicalTemp: stats.historicalAvgTemp,
    stageName: cultivation.currentStage,
  });
  const demandIndex = demandResult.demandIndex;
  const baselineSource = demandResult.baselineSource;

  if (baselineSource === 'generic_stage') {
    factors.push('Estimación inicial: todavía no hay suficiente historial ambiental propio.');
  }

  if (demandIndex > 1.08) {
    factors.push('El ambiente actual está demandando más agua que la referencia histórica (acelera el secado).');
  } else if (demandIndex < 0.92) {
    factors.push('El ambiente actual presenta baja demanda transpiratoria (retrasa el secado).');
  }

  // 4. Baseline interval determination
  let baselineIntervalHours = 72; // default 3 days
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (stats.episodes.length >= 3 && stats.medianIntervalHours !== null) {
    baselineIntervalHours = stats.medianIntervalHours;
    factors.push(`Historial del cultivo: ${stats.episodes.length} ciclos anteriores con mediana de ${stats.medianIntervalHours} h.`);

    // Determine confidence: generic_stage reduces confidence
    const hasUsefulSignals = stats.hasDirectPotLift || stats.hasDirectMoistureMeasurements || stats.hasDirectWeightMeasurements;
    if (stats.episodes.length >= 5 && cropEnv.length >= 2 && hasUsefulSignals && baselineSource === 'historical') {
      confidence = 'high';
    } else if (stats.episodes.length >= 3 && cropEnv.length >= 1) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  } else {
    // Fallback based on stage
    const stage = cultivation.currentStage || 'Vegetativo';
    const fallbackDays = getRecommendedWateringIntervalDays(stage) || 3;
    baselineIntervalHours = fallbackDays * 24;
    confidence = 'low';

    if (stats.episodes.length > 0) {
      factors.push(`Se cuenta con solo ${stats.episodes.length} ciclo(s) previo(s); se combina con la pauta de ${stage} (~${fallbackDays}d).`);
    } else {
      factors.push(`Estimación inicial basada en la etapa (${stage}: ~${fallbackDays}d).`);
    }
  }

  // 5. Volume adjustment
  // A higher water volume must provide more available water, extending dryback time in proportion (non-inverting)
  let volumeAdjustmentFactor = 1.0;
  if (stats.medianVolumeLiters && stats.medianVolumeLiters > 0) {
    const volRatio = netWaterLiters / stats.medianVolumeLiters;
    // Damped power law: 2L vs 1L increases interval by ~60%, never decreases it
    volumeAdjustmentFactor = Number(Math.pow(volRatio, 0.75).toFixed(2));
  }

  // 6. Predict adjusted dryback interval
  // Predicted Interval = (Baseline Interval * Volume Factor) / Demand Index
  let predictedIntervalHours = (baselineIntervalHours * volumeAdjustmentFactor) / demandIndex;
  // Safety bounds (12 hours minimum, 240 hours maximum)
  predictedIntervalHours = Math.max(12, Math.min(240, predictedIntervalHours));

  // 7. Dryback rate and remaining water
  const estimatedDrybackRateLitersPerDay = Number((netWaterLiters / (predictedIntervalHours / 24)).toFixed(2));
  const fractionElapsed = Math.min(1.0, hoursSinceLastWatering / predictedIntervalHours);
  const estimatedRemainingAvailableWaterLiters = Number(Math.max(0, netWaterLiters * (1 - fractionElapsed)).toFixed(2));

  // 8. Inspection Window (start and end) to avoid false precision
  // Window derives from dispersion: either MAD or 12% margin around predicted completion
  const dispersionHours = Math.max(4, stats.dispersionHours > 0 ? stats.dispersionHours : predictedIntervalHours * 0.12);
  const halfWindow = Math.max(3, Math.min(24, dispersionHours));

  const targetNextMs = lastWateringMs + predictedIntervalHours * 3600 * 1000;
  const windowStartMs = targetNextMs - halfWindow * 3600 * 1000;
  const windowEndMs = targetNextMs + halfWindow * 3600 * 1000;

  return {
    lastWateringAt,
    hoursSinceLastWatering,
    appliedWaterLiters,
    netWaterLiters,
    avgTempSinceWatering: avgTempSince,
    maxTempSinceWatering: maxTempSince,
    avgHumiditySinceWatering: avgHumSince,
    avgVpdSinceWatering: avgVpdSince,
    maxVpdSinceWatering: maxVpdSince,
    avgPpfdSinceWatering: avgPpfdSince,
    estimatedDli,
    historicalMedianIntervalHours: stats.medianIntervalHours,
    historicalAverageVolumeLiters: stats.averageVolumeLiters,
    historicalMedianVolumeLiters: stats.medianVolumeLiters,
    demandIndex,
    estimatedDrybackRateLitersPerDay,
    estimatedRemainingAvailableWaterLiters,
    estimatedNextWateringAt: formatTimestamp(targetNextMs),
    wateringWindowStart: formatTimestamp(windowStartMs),
    wateringWindowEnd: formatTimestamp(windowEndMs),
    confidence,
    baselineSource,
    factors,
    missingSignals,
    modelVersion,
  };
}
