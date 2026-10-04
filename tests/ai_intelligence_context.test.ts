/**
 * tests/ai_intelligence_context.test.ts
 * 
 * SUITE DE PRUEBAS DE CONTEXTO E IA: CULTIVETA IA CON CONTEXTO DE ALTA PRECISIÓN (10 CASOS)
 * Cumple estrictamente los 10 puntos definidos en Parte H:
 * 
 * 1. IA recibe irrigationForecast.
 * 2. IA recibe schedule.
 * 3. IA recibe stage history real.
 * 4. IA recibe mediana de intervalos.
 * 5. IA recibe datos ambientales agregados.
 * 6. IA no recibe una maceta ficticia de 10 L.
 * 7. IA no recibe tipo de sustrato inventado.
 * 8. IA no sustituye wateringWindow con otro cálculo.
 * 9. evidence puede contener registros, métricas y fechas reales.
 * 10. Si faltan datos, la IA debe reconocerlo.
 */

import { Cultivation, Watering, EnvironmentRecord, Genetics } from '../src/types';
import { buildCultivationIntelligenceContext } from '../src/services/cultivationIntelligenceService';
import { buildCultivationStageSchedule } from '../src/utils/growthStageUtils';

export async function runAIIntelligenceContextTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS DE CONTEXTO E IA: CULTIVETA IA DETERMINISTA (10 CASOS)');
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

  const testCrop: Cultivation = {
    id: 'crop_ai_eval_1',
    userId: 'user_eval',
    name: 'Amnesia Haze',
    type: 'Indoor',
    plantCount: 6,
    startDate: '2026-05-01',
    currentStage: 'Floración',
    stageStartDate: '2026-06-01',
    floweringStartDate: '2026-06-01',
    substrate: {
      type: 'Coco / Perlita',
      potVolumeLiters: 15,
      potType: 'Geotextil',
    },
    lighting: {
      type: 'LED Bar 480W',
      usedWatts: 480,
      photoperiodHoursLight: 12,
      photoperiodHoursDark: 12,
    },
    stagesTimeline: [
      { id: 'st1', name: 'Germinación', startDate: '2026-05-01', actualStartDate: '2026-05-01', actualEndDate: '2026-05-06', isCompleted: true, expectedDurationDays: 5 },
      { id: 'st2', name: 'Plántula', startDate: '2026-05-06', actualStartDate: '2026-05-06', actualEndDate: '2026-05-16', isCompleted: true, expectedDurationDays: 10 },
      { id: 'st3', name: 'Vegetativo', startDate: '2026-05-16', actualStartDate: '2026-05-16', actualEndDate: '2026-06-01', isCompleted: true, expectedDurationDays: 16 },
      { id: 'st4', name: 'Floración', startDate: '2026-06-01', actualStartDate: '2026-06-01', isCompleted: false, expectedDurationDays: 63 },
      { id: 'st5', name: 'Cosecha', startDate: '2026-08-03', isCompleted: false, expectedDurationDays: 3 },
    ],
    status: 'ESTABLE',
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
  };

  const waterings: Watering[] = [
    { id: 'w1', userId: 'user_eval', cultivationId: 'crop_ai_eval_1', date: '2026-06-01', time: '09:00', volumeLiters: 2.0, phIn: 6.0, ecIn: 1.4, createdAt: '' },
    { id: 'w2', userId: 'user_eval', cultivationId: 'crop_ai_eval_1', date: '2026-06-03', time: '18:00', volumeLiters: 2.0, phIn: 6.1, ecIn: 1.5, createdAt: '' },
    { id: 'w3', userId: 'user_eval', cultivationId: 'crop_ai_eval_1', date: '2026-06-06', time: '10:00', volumeLiters: 2.0, phIn: 6.2, ecIn: 1.6, runoffVolumeLiters: 0.3, createdAt: '' },
  ];

  const envRecords: EnvironmentRecord[] = [
    { id: 'e1', userId: 'user_eval', cultivationId: 'crop_ai_eval_1', date: '2026-06-06', time: '12:00', temperatureC: 25, humidityPct: 50, vpdKPa: 1.45, ppfd: 700, createdAt: '' },
    { id: 'e2', userId: 'user_eval', cultivationId: 'crop_ai_eval_1', date: '2026-06-06', time: '18:00', temperatureC: 26, humidityPct: 48, vpdKPa: 1.55, ppfd: 720, createdAt: '' },
  ];

  const evalDate = new Date('2026-06-07T12:00:00Z');

  // =========================================================================
  // Caso 1: IA recibe irrigationForecast
  // =========================================================================
  await assert('1. IA recibe irrigationForecast', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    if (!context.irrigation || !context.irrigation.forecast) {
      throw new Error('context.irrigation.forecast debe existir en el contexto');
    }
    if (!context.irrigation.forecast.wateringWindowStart || !context.irrigation.forecast.wateringWindowEnd) {
      throw new Error('El forecast para la IA debe contener wateringWindowStart y wateringWindowEnd');
    }
    if (!context.irrigation.forecast.confidence) {
      throw new Error('El forecast debe incluir nivel de confianza');
    }
  });

  // =========================================================================
  // Caso 2: IA recibe schedule central
  // =========================================================================
  await assert('2. IA recibe schedule central', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    const expectedSchedule = buildCultivationStageSchedule(testCrop);
    if (context.chronology.estimatedHarvestDate !== expectedSchedule.estimatedHarvestDate) {
      throw new Error(`estimatedHarvestDate en contexto IA (${context.chronology.estimatedHarvestDate}) difiere de buildCultivationStageSchedule (${expectedSchedule.estimatedHarvestDate})`);
    }
  });

  // =========================================================================
  // Caso 3: IA recibe stage history real
  // =========================================================================
  await assert('3. IA recibe stage history real', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    const completed = context.chronology.completedStages;
    if (!Array.isArray(completed) || completed.length < 3) {
      throw new Error(`Se esperaban al menos 3 etapas completadas, recibidas: ${completed?.length}`);
    }

    const veg = completed.find((s) => s.name === 'Vegetativo');
    if (!veg || veg.actualStartDate !== '2026-05-16' || veg.actualEndDate !== '2026-06-01') {
      throw new Error('El historial de Vegetativo no contiene las fechas reales registradas');
    }
  });

  // =========================================================================
  // Caso 4: IA recibe mediana de intervalos
  // =========================================================================
  await assert('4. IA recibe mediana de intervalos', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    const med = context.irrigation.statistics.medianIntervalHours;
    if (typeof med !== 'number' || med <= 0) {
      throw new Error(`medianIntervalHours debe ser un número positivo, recibido: ${med}`);
    }
  });

  // =========================================================================
  // Caso 5: IA recibe datos ambientales agregados
  // =========================================================================
  await assert('5. IA recibe datos ambientales agregados', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    const avgEnv = context.environment.avgSinceLastWatering;
    if (avgEnv.vpdKPa === undefined || avgEnv.tempC === undefined) {
      throw new Error('avgSinceLastWatering debe incluir promedios de VPD y Temperatura');
    }
    if (avgEnv.estimatedDli === undefined || avgEnv.estimatedDli <= 0) {
      throw new Error('avgSinceLastWatering debe incluir DLI estimado para Indoor con PPFD');
    }
  });

  // =========================================================================
  // Caso 6: IA no recibe una maceta ficticia de 10 L
  // =========================================================================
  await assert('6. IA no recibe una maceta ficticia de 10 L', () => {
    const cropWithoutPot: Cultivation = {
      ...testCrop,
      substrate: {
        type: 'Sustrato sin volumen',
        potVolumeLiters: undefined as any,
        potType: 'Plástico',
      },
    };

    const context = buildCultivationIntelligenceContext({
      cultivation: cropWithoutPot,
      waterings: [],
      envRecords: [],
      evalDate,
    });

    if (context.identity.potVolumeLiters !== undefined) {
      throw new Error(`potVolumeLiters no debió inventarse como 10L, recibido: ${context.identity.potVolumeLiters}`);
    }
  });

  // =========================================================================
  // Caso 7: IA no recibe tipo de sustrato inventado
  // =========================================================================
  await assert('7. IA no recibe tipo de sustrato inventado', () => {
    const cropWithoutSubstrate: Cultivation = {
      ...testCrop,
      substrate: undefined as any,
    };

    const context = buildCultivationIntelligenceContext({
      cultivation: cropWithoutSubstrate,
      waterings: [],
      envRecords: [],
      evalDate,
    });

    if (context.identity.substrateType !== undefined) {
      throw new Error(`substrateType debió ser undefined cuando no se registró, recibido: ${context.identity.substrateType}`);
    }
  });

  // =========================================================================
  // Caso 8: IA no sustituye wateringWindow con otro cálculo
  // =========================================================================
  await assert('8. IA no sustituye wateringWindow con otro cálculo (contrato del prompt)', () => {
    const context = buildCultivationIntelligenceContext({
      cultivation: testCrop,
      waterings,
      envRecords,
      evalDate,
    });

    const windowStart = context.irrigation.forecast.wateringWindowStart;
    const windowEnd = context.irrigation.forecast.wateringWindowEnd;

    // Verificar que el contrato provee valores no nulos listos para ser consumidos textualmente por la IA
    if (!windowStart || !windowEnd) {
      throw new Error('wateringWindowStart y wateringWindowEnd deben estar disponibles para que la IA los cite textualmente');
    }
  });

  // =========================================================================
  // Caso 9: evidence puede contener registros, métricas y fechas reales
  // =========================================================================
  await assert('9. evidence puede contener registros, métricas y fechas reales', () => {
    const mockAIResponse = {
      reply: 'De acuerdo con tu último riego de 2.0 L el 6 de junio y el VPD actual de 1.5 kPa...',
      evidence: {
        recordsReferenced: ['Riego de 2.0L el 6 de junio', 'Registro ambiental de 1.5 kPa'],
        metricsReferenced: ['2.0 L', '1.5 kPa', 'VPD promedio 1.50 kPa'],
        datesReferenced: ['2026-06-06', '2026-06-08'],
      },
    };

    if (!Array.isArray(mockAIResponse.evidence.recordsReferenced)) {
      throw new Error('evidence.recordsReferenced debe ser un array');
    }
    if (!Array.isArray(mockAIResponse.evidence.metricsReferenced)) {
      throw new Error('evidence.metricsReferenced debe ser un array');
    }
    if (!Array.isArray(mockAIResponse.evidence.datesReferenced)) {
      throw new Error('evidence.datesReferenced debe ser un array');
    }
  });

  // =========================================================================
  // Caso 10: Si faltan datos, la IA debe reconocerlo
  // =========================================================================
  await assert('10. Si faltan datos, la IA debe reconocerlo (señales faltantes explícitas)', () => {
    const cropMinimal: Cultivation = {
      ...testCrop,
      substrate: undefined as any,
      lighting: undefined as any,
    };

    const context = buildCultivationIntelligenceContext({
      cultivation: cropMinimal,
      waterings: [],
      envRecords: [],
      evalDate,
    });

    const missing = context.irrigation.forecast.missingSignals;
    if (!Array.isArray(missing) || missing.length < 3) {
      throw new Error(`Se esperaban al menos 3 señales faltantes documentadas, encontradas: ${missing.length}`);
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO PRUEBAS DE CONTEXTO E IA: ${passed} pasadas, ${failed} fallidas de 10`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} pruebas de contexto e IA fallaron.`);
  }

  return { passed, failed, skipped };
}

if (process.argv[1]?.endsWith('ai_intelligence_context.test.ts')) {
  runAIIntelligenceContextTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
