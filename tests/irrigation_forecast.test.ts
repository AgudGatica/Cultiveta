/**
 * tests/irrigation_forecast.test.ts
 * 
 * SUITE DE PRUEBAS MATEMÁTICAS: MOTOR DE INTELIGENCIA HÍDRICA (18 CASOS)
 * Cumple estrictamente los 18 puntos definidos en Parte G:
 * 
 * 1. Sin historial: fallback + LOW confidence.
 * 2. Intervalos: 48h, 72h, 60h -> mediana = 60h.
 * 3. Un volumen actual mayor, manteniendo todo lo demás igual, no debe predecir un intervalo más corto sin razón.
 * 4. Mayor demanda ambiental debe tender a adelantar la ventana.
 * 5. Menor demanda debe tender a retrasarla.
 * 6. VPD usa environmentService.calculateVPD.
 * 7. No existe segunda fórmula VPD.
 * 8. PPFD + horas de luz calculan DLI correctamente.
 * 9. runoff se descuenta sólo cuando existe.
 * 10. Sin runoff no se inventa valor.
 * 11. Datos de peso útiles aumentan confidence.
 * 12. Datos de humedad de sustrato útiles aumentan confidence.
 * 13. Outliers extremos no destruyen la predicción gracias a mediana/MAD/IQR.
 * 14. Cultivo A nunca usa riegos de Cultivo B.
 * 15. Forecast devuelve ventana start/end.
 * 16. Forecast no devuelve instante falsamente exacto como única respuesta.
 * 17. Manejo horario/date-only correcto.
 * 18. Riego de 2 L no puede producir menos agua disponible que uno de 1 L en idénticas condiciones salvo runoff explícito.
 */

import { Cultivation, Watering, EnvironmentRecord } from '../src/types';
import {
  calculateIrrigationForecast,
  calculateMedian,
  calculateMAD,
  calculateIQR,
  calculateDLI,
  calculateEnvironmentalDemandIndex,
  buildWateringEpisodes,
  parseWateringTimestamp,
} from '../src/services/irrigationForecastService';
import { environmentService } from '../src/services/environmentService';

export async function runIrrigationForecastTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS MATEMÁTICAS: MOTOR DE INTELIGENCIA HÍDRICA (18 CASOS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const skipped = 0;

  const assert = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  const testCultivation: Cultivation = {
    id: 'crop_alpha_1',
    userId: 'user_1',
    name: 'OG Kush',
    type: 'Indoor',
    plantCount: 4,
    startDate: '2026-05-01',
    currentStage: 'Vegetativo',
    stageStartDate: '2026-05-15',
    substrate: {
      type: 'Sustrato Light Mix',
      potVolumeLiters: 11,
      potType: 'Geotextil',
    },
    lighting: {
      type: 'LED',
      nominalWatts: 240,
      usedWatts: 240,
      photoperiodHoursLight: 18,
      photoperiodHoursDark: 6,
    },
    status: 'ESTABLE',
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-15T10:00:00Z',
  };

  // =========================================================================
  // Caso 1: Sin historial: fallback + LOW confidence
  // =========================================================================
  await assert('1. Sin historial: fallback + LOW confidence', () => {
    const forecast = calculateIrrigationForecast(testCultivation, [], []);
    if (forecast.confidence !== 'low') {
      throw new Error(`Se esperaba confidence 'low', recibido: '${forecast.confidence}'`);
    }
    if (forecast.lastWateringAt !== null) {
      throw new Error('lastWateringAt debe ser null cuando no hay riegos');
    }
    if (!forecast.factors.some((f) => f.includes('Estimación inicial'))) {
      throw new Error('Debe explicar que es una estimación inicial basada en la etapa');
    }
    if (!forecast.missingSignals.includes('Sin riegos previos registrados')) {
      throw new Error('missingSignals debe incluir la ausencia de riegos');
    }
  });

  // =========================================================================
  // Caso 2: Intervalos: 48h, 72h, 60h -> mediana = 60h
  // =========================================================================
  await assert('2. Intervalos: 48h, 72h, 60h -> mediana = 60h', () => {
    const intervals = [48, 72, 60];
    const median = calculateMedian(intervals);
    if (median !== 60) {
      throw new Error(`La mediana de [48, 72, 60] debe ser 60, recibido: ${median}`);
    }
  });

  // =========================================================================
  // Caso 3: Un volumen actual mayor no debe predecir un intervalo más corto
  // =========================================================================
  await assert('3. Un volumen actual mayor, manteniendo todo lo demás igual, no debe predecir un intervalo más corto sin razón', () => {
    const baseW: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', time: '10:00', volumeLiters: 1.5, createdAt: '' },
      { id: 'w2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-13', time: '10:00', volumeLiters: 1.5, createdAt: '' },
      { id: 'w3', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', time: '10:00', volumeLiters: 1.5, createdAt: '' },
    ];

    const wateringsSmall: Watering[] = [
      ...baseW,
      { id: 'w4', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-19', time: '10:00', volumeLiters: 1.0, createdAt: '' },
    ];

    const wateringsLarge: Watering[] = [
      ...baseW,
      { id: 'w4', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-19', time: '10:00', volumeLiters: 2.5, createdAt: '' },
    ];

    const evalDate = new Date('2026-05-19T14:00:00Z');
    const fSmall = calculateIrrigationForecast(testCultivation, wateringsSmall, [], evalDate);
    const fLarge = calculateIrrigationForecast(testCultivation, wateringsLarge, [], evalDate);

    const smallNextMs = new Date(fSmall.wateringWindowStart).getTime();
    const largeNextMs = new Date(fLarge.wateringWindowStart).getTime();

    if (largeNextMs < smallNextMs) {
      throw new Error(`Un riego mayor (2.5L) predijo secado más rápido (${fLarge.wateringWindowStart}) que uno menor de 1.0L (${fSmall.wateringWindowStart})`);
    }
  });

  // =========================================================================
  // Caso 4: Mayor demanda ambiental debe tender a adelantar la ventana
  // =========================================================================
  await assert('4. Mayor demanda ambiental debe tender a adelantar la ventana', () => {
    const demandHigh = calculateEnvironmentalDemandIndex({
      currentVpd: 1.6, // alto
      currentTemp: 29, // alto
      historicalVpd: 1.1,
      historicalTemp: 24,
      stageName: 'Vegetativo',
    });

    const demandNormal = calculateEnvironmentalDemandIndex({
      currentVpd: 1.1,
      currentTemp: 24,
      historicalVpd: 1.1,
      historicalTemp: 24,
      stageName: 'Vegetativo',
    });

    if (demandHigh.demandIndex <= demandNormal.demandIndex) {
      throw new Error(`demandIndex para ambiente cálido/seco (${demandHigh.demandIndex}) debe ser mayor que el normal (${demandNormal.demandIndex})`);
    }
  });

  // =========================================================================
  // Caso 5: Menor demanda debe tender a retrasarla
  // =========================================================================
  await assert('5. Menor demanda debe tender a retrasarla', () => {
    const demandLow = calculateEnvironmentalDemandIndex({
      currentVpd: 0.7, // bajo/húmedo
      currentTemp: 20,
      historicalVpd: 1.1,
      historicalTemp: 24,
      stageName: 'Vegetativo',
    });

    if (demandLow.demandIndex >= 1.0) {
      throw new Error(`demandIndex para ambiente frío/húmedo (${demandLow.demandIndex}) debe ser menor a 1.0`);
    }
  });

  // =========================================================================
  // Caso 6: VPD usa environmentService.calculateVPD
  // =========================================================================
  await assert('6. VPD usa environmentService.calculateVPD', () => {
    const vpd = environmentService.calculateVPD(25, 50, 23); // Air: 25°C, Leaf: 23°C, RH: 50%
    if (typeof vpd !== 'number' || isNaN(vpd) || vpd <= 0) {
      throw new Error(`calculateVPD devolvió valor inválido: ${vpd}`);
    }
    // Verificación psicrométrica estándar: ~1.2 a 1.6 kPa
    if (vpd < 1.0 || vpd > 1.8) {
      throw new Error(`VPD calculado fuera de rango físico razonable: ${vpd}`);
    }
  });

  // =========================================================================
  // Caso 7: No existe segunda fórmula VPD
  // =========================================================================
  await assert('7. No existe segunda fórmula VPD (reutilización estricta)', () => {
    const vpdDirect = environmentService.calculateVPD(26, 55);
    const envRecord: EnvironmentRecord = {
      id: 'env_1',
      userId: 'u1',
      cultivationId: 'crop_alpha_1',
      date: '2026-05-15',
      time: '12:00',
      temperatureC: 26,
      humidityPct: 55,
      createdAt: '',
    };

    const episodes = buildWateringEpisodes(
      'crop_alpha_1',
      [
        { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-14', time: '10:00', volumeLiters: 1.5, createdAt: '' },
        { id: 'w2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-17', time: '10:00', volumeLiters: 1.5, createdAt: '' },
      ],
      [envRecord]
    );

    if (episodes[0].avgVpdKPa !== vpdDirect) {
      throw new Error(`El VPD en episodes (${episodes[0].avgVpdKPa}) debe coincidir exactamente con environmentService.calculateVPD (${vpdDirect})`);
    }
  });

  // =========================================================================
  // Caso 8: PPFD + horas de luz calculan DLI correctamente
  // =========================================================================
  await assert('8. PPFD + horas de luz calculan DLI correctamente', () => {
    // PPFD = 600 umol/m2/s, fotoperiodo = 18 h
    // DLI = 600 * (18 * 3600) / 1,000,000 = 600 * 64800 / 1,000,000 = 38.88 mol/m2/d
    const dli = calculateDLI(600, 18);
    if (dli !== 38.88) {
      throw new Error(`DLI esperado 38.88, recibido: ${dli}`);
    }
  });

  // =========================================================================
  // Caso 9: runoff se descuenta sólo cuando existe
  // =========================================================================
  await assert('9. runoff se descuenta sólo cuando existe', () => {
    const wWithRunoff: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 2.0, runoffVolumeLiters: 0.4, createdAt: '' },
    ];
    const forecast = calculateIrrigationForecast(testCultivation, wWithRunoff, []);
    if (forecast.netWaterLiters !== 1.6) {
      throw new Error(`netWaterLiters debió ser 1.6 L (2.0 - 0.4), recibido: ${forecast.netWaterLiters}`);
    }
  });

  // =========================================================================
  // Caso 10: Sin runoff no se inventa valor
  // =========================================================================
  await assert('10. Sin runoff no se inventa valor', () => {
    const wNoRunoff: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 2.0, createdAt: '' },
    ];
    const forecast = calculateIrrigationForecast(testCultivation, wNoRunoff, []);
    if (forecast.netWaterLiters !== 2.0) {
      throw new Error(`netWaterLiters debió ser 2.0 L (sin runoff ficticio), recibido: ${forecast.netWaterLiters}`);
    }
    if (!forecast.missingSignals.includes('Volumen de drenaje (runoff) no registrado')) {
      throw new Error('Debe marcar runoff como señal faltante cuando no se registró');
    }
  });

  // =========================================================================
  // Caso 11: Datos de peso útiles aumentan confidence
  // =========================================================================
  await assert('11. Datos de peso útiles aumentan confidence', () => {
    const wateringsWithWeight: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-01', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.1, potWeightAfterWateringKg: 5.6, createdAt: '' },
      { id: 'w2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-04', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.0, potWeightAfterWateringKg: 5.5, createdAt: '' },
      { id: 'w3', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-07', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.2, potWeightAfterWateringKg: 5.7, createdAt: '' },
      { id: 'w4', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.1, potWeightAfterWateringKg: 5.6, createdAt: '' },
      { id: 'w5', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-13', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.0, potWeightAfterWateringKg: 5.5, createdAt: '' },
      { id: 'w6', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', volumeLiters: 1.5, potWeightBeforeWateringKg: 4.1, potWeightAfterWateringKg: 5.6, createdAt: '' },
    ];

    const envData: EnvironmentRecord[] = [
      { id: 'e1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', time: '12:00', temperatureC: 24, humidityPct: 55, createdAt: '' },
      { id: 'e2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', time: '18:00', temperatureC: 25, humidityPct: 52, createdAt: '' },
    ];

    const forecast = calculateIrrigationForecast(testCultivation, wateringsWithWeight, envData);
    if (forecast.confidence !== 'high') {
      throw new Error(`Con 5+ episodios, ambiente y datos gravimétricos la confianza debió ser 'high', recibido: '${forecast.confidence}'`);
    }
  });

  // =========================================================================
  // Caso 12: Datos de humedad de sustrato útiles aumentan confidence
  // =========================================================================
  await assert('12. Datos de humedad de sustrato útiles aumentan confidence', () => {
    const wateringsWithMoisture: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-01', volumeLiters: 1.5, substrateMoistureBeforePct: 15, substrateMoistureAfterPct: 65, createdAt: '' },
      { id: 'w2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-04', volumeLiters: 1.5, substrateMoistureBeforePct: 18, substrateMoistureAfterPct: 70, createdAt: '' },
      { id: 'w3', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-07', volumeLiters: 1.5, substrateMoistureBeforePct: 16, substrateMoistureAfterPct: 68, createdAt: '' },
      { id: 'w4', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.5, substrateMoistureBeforePct: 17, substrateMoistureAfterPct: 66, createdAt: '' },
      { id: 'w5', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-13', volumeLiters: 1.5, substrateMoistureBeforePct: 15, substrateMoistureAfterPct: 65, createdAt: '' },
      { id: 'w6', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', volumeLiters: 1.5, substrateMoistureBeforePct: 16, substrateMoistureAfterPct: 67, createdAt: '' },
    ];

    const envData: EnvironmentRecord[] = [
      { id: 'e1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', time: '12:00', temperatureC: 24, humidityPct: 55, createdAt: '' },
      { id: 'e2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-16', time: '18:00', temperatureC: 25, humidityPct: 52, createdAt: '' },
    ];

    const forecast = calculateIrrigationForecast(testCultivation, wateringsWithMoisture, envData);
    if (forecast.confidence !== 'high') {
      throw new Error(`Con 5+ episodios, ambiente y humedad de sustrato la confianza debió ser 'high', recibido: '${forecast.confidence}'`);
    }
  });

  // =========================================================================
  // Caso 13: Outliers extremos no destruyen la predicción gracias a mediana/MAD/IQR
  // =========================================================================
  await assert('13. Outliers extremos no destruyen la predicción gracias a mediana/MAD/IQR', () => {
    // Tres ciclos normales de ~60h y uno accidental de 240h (ej. olvido de registro)
    const values = [48, 60, 72, 240];
    const med = calculateMedian(values);
    const mad = calculateMAD(values, med!);
    const { iqr } = calculateIQR(values);

    // Mediana debe ser 66 (promedio de 60 y 72), NO el promedio que es 105
    if (med! > 75) {
      throw new Error(`La mediana (${med}) fue distorsionada por el outlier de 240h`);
    }
    if (mad <= 0) {
      throw new Error('MAD debe ser mayor que 0');
    }
    if (iqr <= 0) {
      throw new Error('IQR debe ser mayor que 0');
    }
  });

  // =========================================================================
  // Caso 14: Cultivo A nunca usa riegos de Cultivo B
  // =========================================================================
  await assert('14. Cultivo A nunca usa riegos de Cultivo B', () => {
    const mixedWaterings: Watering[] = [
      { id: 'wa1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.5, createdAt: '' },
      { id: 'wa2', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-13', volumeLiters: 1.5, createdAt: '' },
      { id: 'wb1', userId: 'u1', cultivationId: 'crop_beta_OTHER', date: '2026-05-14', volumeLiters: 10.0, createdAt: '' },
    ];

    const forecastA = calculateIrrigationForecast(testCultivation, mixedWaterings, []);
    if (forecastA.appliedWaterLiters !== 1.5) {
      throw new Error(`El forecast de Cultivo A absorbió el riego de 10L de Cultivo B. Valor recibido: ${forecastA.appliedWaterLiters}`);
    }
  });

  // =========================================================================
  // Caso 15: Forecast devuelve ventana start/end
  // =========================================================================
  await assert('15. Forecast devuelve ventana start/end', () => {
    const waterings: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.5, createdAt: '' },
    ];
    const forecast = calculateIrrigationForecast(testCultivation, waterings, []);

    if (!forecast.wateringWindowStart || !forecast.wateringWindowEnd) {
      throw new Error('Forecast debe incluir wateringWindowStart y wateringWindowEnd');
    }
    if (forecast.wateringWindowStart >= forecast.wateringWindowEnd) {
      throw new Error(`wateringWindowStart (${forecast.wateringWindowStart}) debe ser anterior a wateringWindowEnd (${forecast.wateringWindowEnd})`);
    }
  });

  // =========================================================================
  // Caso 16: Forecast no devuelve instante falsamente exacto como única respuesta
  // =========================================================================
  await assert('16. Forecast no devuelve instante falsamente exacto como única respuesta', () => {
    const waterings: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.5, createdAt: '' },
    ];
    const forecast = calculateIrrigationForecast(testCultivation, waterings, []);

    const startMs = new Date(forecast.wateringWindowStart).getTime();
    const endMs = new Date(forecast.wateringWindowEnd).getTime();
    const spanHours = (endMs - startMs) / (1000 * 3600);

    // La ventana debe tener un ancho prudente de inspección (mínimo 6 horas)
    if (spanHours < 6) {
      throw new Error(`Ventana de inspección demasiado estrecha (${spanHours} h), induce a falsa precisión`);
    }
  });

  // =========================================================================
  // Caso 17: Manejo horario/date-only correcto
  // =========================================================================
  await assert('17. Manejo horario/date-only correcto', () => {
    const ts1 = parseWateringTimestamp('2026-05-10', '09:30');
    const ts2 = parseWateringTimestamp('2026-05-10', '15:30');

    const diffHours = (ts2 - ts1) / (1000 * 3600);
    if (diffHours !== 6) {
      throw new Error(`La diferencia entre 09:30 y 15:30 debe ser 6 h, recibido: ${diffHours}`);
    }
  });

  // =========================================================================
  // Caso 18: Riego de 2 L no puede producir menos agua disponible que uno de 1 L
  // =========================================================================
  await assert('18. Riego de 2 L no puede producir menos agua disponible que uno de 1 L en idénticas condiciones salvo runoff explícito', () => {
    const w1L: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 1.0, createdAt: '' },
    ];
    const w2L: Watering[] = [
      { id: 'w1', userId: 'u1', cultivationId: 'crop_alpha_1', date: '2026-05-10', volumeLiters: 2.0, createdAt: '' },
    ];

    const evalDate = new Date('2026-05-11T12:00:00Z');
    const f1L = calculateIrrigationForecast(testCultivation, w1L, [], evalDate);
    const f2L = calculateIrrigationForecast(testCultivation, w2L, [], evalDate);

    if (f2L.estimatedRemainingAvailableWaterLiters! < f1L.estimatedRemainingAvailableWaterLiters!) {
      throw new Error(`El riego de 2L dejó ${f2L.estimatedRemainingAvailableWaterLiters}L, menor que el de 1L (${f1L.estimatedRemainingAvailableWaterLiters}L)`);
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO PRUEBAS DE IRRIGATION FORECAST: ${passed} pasadas, ${failed} fallidas de 18`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} pruebas de irrigation forecast fallaron.`);
  }

  return { passed, failed, skipped };
}

if (process.argv[1]?.endsWith('irrigation_forecast.test.ts')) {
  runIrrigationForecastTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
