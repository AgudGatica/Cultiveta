/**
 * tests/timeline_unknown_history_and_pot_lift.test.ts
 *
 * SUITE DE PRUEBAS: CRONOLOGÍA DE HISTORIAL DESCONOCIDO, PERCEPCIÓN DE PESO MANUAL (POT LIFT) Y CONTEXTO IA (20 CASOS)
 *
 * 1. cultivo creado directamente en Floración 2026-09-27: Germinación = unknown.
 * 2. Plántula = unknown.
 * 3. Vegetativo = unknown.
 * 4. Floración startDate = 2026-09-27 y actual.
 * 5. etapas futuras sí tienen fechas proyectadas.
 * 6. ninguna etapa anterior recibe 2026-09-27.
 * 7. no existe proyección hacia atrás.
 * 8. WateringModal ya no renderiza inputs de kg.
 * 9. WateringModal permite heavy/medium/light/very_light.
 * 10. guardar riego persiste potLiftBeforeWatering.
 * 11. heavy queda fuera de intervalos representativos.
 * 12. light/very_light sí participan.
 * 13. taskService NO crea harvest task con 3+ días restantes.
 * 14. taskService crea harvest task con 2 días restantes.
 * 15. taskService crea harvest task con 1 día restante.
 * 16. taskService usa la misma estimatedHarvestDate del schedule.
 * 17. AI general no crea dummy Indoor.
 * 18. AI general no crea dummy de 1 planta.
 * 19. server no inventa 18/6.
 * 20. contexto IA recibe genetics/photos/notes/harvests.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Cultivation,
  Watering,
  Genetics,
  PhotoRecord,
  DiaryEntry,
  Harvest,
  PotLiftFeeling,
} from '../src/types';
import {
  buildCultivationStageSchedule,
  getLocalTodayDateOnly,
  addDays,
} from '../src/utils/growthStageUtils';
import { WateringModal } from '../src/components/logs/WateringModal';
import { wateringService } from '../src/services/wateringService';
import {
  calculateHistoricalWateringStats,
  WateringEpisode,
} from '../src/services/irrigationForecastService';
import { taskService } from '../src/services/taskService';
import { aiService } from '../src/services/aiService';
import { buildCultivationIntelligenceContext } from '../src/services/cultivationIntelligenceService';

// Configurar entorno DOM para pruebas de UI
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

globalThis.window = dom.window as any;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.localStorage = dom.window.localStorage as any;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export async function runTimelineUnknownHistoryAndPotLiftTests(): Promise<{
  passed: number;
  failed: number;
  skipped: number;
}> {
  console.log('\n================================================================');
  console.log('   PRUEBAS: TIMELINE HISTORIAL DESCONOCIDO & POT LIFT (20 CASOS)');
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

  // Cultivo creado directamente en Floración el 27 de septiembre de 2026
  const cropFloraSept27: Cultivation = {
    id: 'crop_flora_2026_09_27',
    userId: 'user_eval_pot_lift',
    name: 'Gorilla Glue Floración Directa',
    type: 'Indoor',
    plantCount: 4,
    startDate: '2026-09-27',
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    timelineHistoryMode: 'unknown_before_current_stage',
    cycleStartKnown: false,
    substrate: {
      type: 'Turba / Perlita / Humus',
      potVolumeLiters: 11,
      potType: 'Geotextil',
    },
    status: 'ESTABLE',
    createdAt: '2026-09-27T10:00:00.000Z',
    updatedAt: '2026-09-27T10:00:00.000Z',
  };

  const scheduleSept27 = buildCultivationStageSchedule(cropFloraSept27);

  // 1. cultivo creado directamente en Floración 2026-09-27: Germinación = unknown
  await assert('1. cultivo creado directamente en Floración 2026-09-27: Germinación = unknown', () => {
    const germStage = scheduleSept27.stages.find((s) => s.name.toLowerCase().includes('germin'));
    if (!germStage) throw new Error('No se encontró etapa Germinación');
    if (germStage.dateKnowledge !== 'unknown') {
      throw new Error(`Esperado dateKnowledge 'unknown', recibido '${germStage.dateKnowledge}'`);
    }
    if (germStage.isUnknown !== true) {
      throw new Error('isUnknown debería ser true');
    }
    if (germStage.startDate !== undefined) {
      throw new Error(`startDate debería ser undefined, recibido '${germStage.startDate}'`);
    }
  });

  // 2. Plántula = unknown
  await assert('2. Plántula = unknown', () => {
    const plantulaStage = scheduleSept27.stages.find((s) => s.name.toLowerCase().includes('plánt'));
    if (!plantulaStage) throw new Error('No se encontró etapa Plántula');
    if (plantulaStage.dateKnowledge !== 'unknown' || plantulaStage.isUnknown !== true) {
      throw new Error(`Plántula debería ser unknown. dateKnowledge: ${plantulaStage.dateKnowledge}`);
    }
    if (plantulaStage.startDate !== undefined) {
      throw new Error(`Plántula startDate debería ser undefined, recibido '${plantulaStage.startDate}'`);
    }
  });

  // 3. Vegetativo = unknown
  await assert('3. Vegetativo = unknown', () => {
    const vegStage = scheduleSept27.stages.find((s) => s.name.toLowerCase().includes('veg'));
    if (!vegStage) throw new Error('No se encontró etapa Vegetativo');
    if (vegStage.dateKnowledge !== 'unknown' || vegStage.isUnknown !== true) {
      throw new Error(`Vegetativo debería ser unknown. dateKnowledge: ${vegStage.dateKnowledge}`);
    }
    if (vegStage.startDate !== undefined) {
      throw new Error(`Vegetativo startDate debería ser undefined, recibido '${vegStage.startDate}'`);
    }
  });

  // 4. Floración startDate = 2026-09-27 y actual
  await assert('4. Floración startDate = 2026-09-27 y actual', () => {
    const florStage = scheduleSept27.floweringStage;
    if (!florStage) throw new Error('No se encontró floweringStage');
    if (florStage.startDate !== '2026-09-27') {
      throw new Error(`Esperado startDate '2026-09-27', recibido '${florStage.startDate}'`);
    }
    if (florStage.dateKnowledge !== 'actual' || florStage.isActual !== true) {
      throw new Error(`Floración debería ser actual, recibido '${florStage.dateKnowledge}'`);
    }
  });

  // 5. etapas futuras sí tienen fechas proyectadas
  await assert('5. etapas futuras sí tienen fechas proyectadas', () => {
    const futureStages = scheduleSept27.stages.slice(scheduleSept27.activeStageIndex + 1);
    if (futureStages.length === 0) {
      throw new Error('Debería existir al menos una etapa futura tras Floración');
    }
    for (const f of futureStages) {
      if (!f.startDate) {
        throw new Error(`Etapa futura ${f.name} debe tener startDate proyectada`);
      }
      if (f.dateKnowledge !== 'projected' || f.isProjected !== true) {
        throw new Error(`Etapa futura ${f.name} debe ser 'projected', recibido '${f.dateKnowledge}'`);
      }
    }
  });

  // 6. ninguna etapa anterior recibe 2026-09-27
  await assert('6. ninguna etapa anterior recibe 2026-09-27', () => {
    const priorStages = scheduleSept27.stages.slice(0, scheduleSept27.activeStageIndex);
    for (const p of priorStages) {
      if (p.startDate === '2026-09-27') {
        throw new Error(`Etapa anterior ${p.name} recibió erróneamente la fecha de Floración '2026-09-27'`);
      }
    }
  });

  // 7. no existe proyección hacia atrás
  await assert('7. no existe proyección hacia atrás', () => {
    const priorStages = scheduleSept27.stages.slice(0, scheduleSept27.activeStageIndex);
    for (const p of priorStages) {
      if (p.startDate !== undefined) {
        throw new Error(`Etapa anterior ${p.name} tiene startDate '${p.startDate}'. No debe proyectarse hacia atrás.`);
      }
    }
  });

  // 8. WateringModal ya no renderiza inputs de kg
  await assert('8. WateringModal ya no renderiza inputs de kg', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(WateringModal, {
          isOpen: true,
          onClose: () => {},
          userId: 'user_test_modal',
          cultivations: [cropFloraSept27],
          defaultCultivationId: cropFloraSept27.id,
          onWateringAdded: () => {},
        })
      );
    });

    const kgInputBefore = container.querySelector('#watering-pot-weight-before-input');
    const kgInputAfter = container.querySelector('#watering-pot-weight-after-input');
    const textKgBefore = container.textContent?.includes('Peso antes de regar (kg)');
    const textKgAfter = container.textContent?.includes('Peso después de regar (kg)');

    root.unmount();
    container.remove();

    if (kgInputBefore !== null || kgInputAfter !== null) {
      throw new Error('WateringModal todavía renderiza inputs de peso en kg');
    }
    if (textKgBefore || textKgAfter) {
      throw new Error('WateringModal todavía contiene texto de peso en kg');
    }
  });

  // 9. WateringModal permite heavy/medium/light/very_light
  await assert('9. WateringModal permite heavy/medium/light/very_light', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(WateringModal, {
          isOpen: true,
          onClose: () => {},
          userId: 'user_test_modal',
          cultivations: [cropFloraSept27],
          defaultCultivationId: cropFloraSept27.id,
          onWateringAdded: () => {},
        })
      );
    });

    const heavyBtn = container.querySelector('[data-testid="pot-lift-heavy"]') as HTMLButtonElement;
    const mediumBtn = container.querySelector('[data-testid="pot-lift-medium"]') as HTMLButtonElement;
    const lightBtn = container.querySelector('[data-testid="pot-lift-light"]') as HTMLButtonElement;
    const veryLightBtn = container.querySelector('[data-testid="pot-lift-very-light"]') as HTMLButtonElement;

    if (!heavyBtn || !mediumBtn || !lightBtn || !veryLightBtn) {
      root.unmount();
      container.remove();
      throw new Error('Faltan opciones de potLift (heavy/medium/light/very_light) en el modal');
    }

    // Verificar clic interactivo
    await act(async () => {
      heavyBtn.click();
    });

    root.unmount();
    container.remove();
  });

  // 10. guardar riego persiste potLiftBeforeWatering
  await assert('10. guardar riego persiste potLiftBeforeWatering', async () => {
    const saved = await wateringService.addWatering({
      userId: 'user_eval_pot_lift',
      cultivationId: cropFloraSept27.id,
      date: '2026-10-02',
      volumeLiters: 2.5,
      potLiftBeforeWatering: 'light',
    });

    if (saved.potLiftBeforeWatering !== 'light') {
      throw new Error(`potLiftBeforeWatering esperado 'light', obtenido '${saved.potLiftBeforeWatering}'`);
    }
    if ((saved as any).potWeightBeforeWateringKg !== undefined) {
      throw new Error('No debe inventar o convertir potLift a potWeightBeforeWateringKg');
    }
  });

  // 11. heavy queda fuera de intervalos representativos
  await assert('11. heavy queda fuera de intervalos representativos', () => {
    const epNormal: WateringEpisode = {
      episodeIndex: 0,
      cultivationId: 'c1',
      wateringStartAt: '2026-09-20T10:00',
      wateringEndAt: '2026-09-23T10:00',
      intervalHours: 72,
      appliedVolumeLiters: 2.5,
      netVolumeLiters: 2.5,
      avgTempC: null,
      maxTempC: null,
      avgHumidityPct: null,
      avgVpdKPa: null,
      maxVpdKPa: null,
      avgPpfd: null,
      estimatedDli: null,
      potLiftBeforeWatering: 'light',
    };
    const epHeavy: WateringEpisode = {
      episodeIndex: 1,
      cultivationId: 'c1',
      wateringStartAt: '2026-09-23T10:00',
      wateringEndAt: '2026-09-24T10:00',
      intervalHours: 24, // Riego muy anticipado con maceta pesada
      appliedVolumeLiters: 2.0,
      netVolumeLiters: 2.0,
      avgTempC: null,
      maxTempC: null,
      avgHumidityPct: null,
      avgVpdKPa: null,
      maxVpdKPa: null,
      avgPpfd: null,
      estimatedDli: null,
      potLiftBeforeWatering: 'heavy',
    };

    const stats = calculateHistoricalWateringStats([epNormal, epHeavy]);
    if (stats.representativeIntervalsHours.includes(24)) {
      throw new Error('El intervalo de 24h con potLift: heavy debe quedar fuera de los intervalos representativos');
    }
    if (stats.representativeIntervalsHours.length !== 1) {
      throw new Error(`Esperado 1 intervalo representativo, recibido ${stats.representativeIntervalsHours.length}`);
    }
  });

  // 12. light/very_light sí participan
  await assert('12. light/very_light sí participan', () => {
    const epLight: WateringEpisode = {
      episodeIndex: 0,
      cultivationId: 'c1',
      wateringStartAt: '2026-09-20T10:00',
      wateringEndAt: '2026-09-23T10:00',
      intervalHours: 72,
      appliedVolumeLiters: 2.5,
      netVolumeLiters: 2.5,
      avgTempC: null,
      maxTempC: null,
      avgHumidityPct: null,
      avgVpdKPa: null,
      maxVpdKPa: null,
      avgPpfd: null,
      estimatedDli: null,
      potLiftBeforeWatering: 'light',
    };
    const epVeryLight: WateringEpisode = {
      episodeIndex: 1,
      cultivationId: 'c1',
      wateringStartAt: '2026-09-23T10:00',
      wateringEndAt: '2026-09-26T22:00',
      intervalHours: 84,
      appliedVolumeLiters: 2.5,
      netVolumeLiters: 2.5,
      avgTempC: null,
      maxTempC: null,
      avgHumidityPct: null,
      avgVpdKPa: null,
      maxVpdKPa: null,
      avgPpfd: null,
      estimatedDli: null,
      potLiftBeforeWatering: 'very_light',
    };

    const stats = calculateHistoricalWateringStats([epLight, epVeryLight]);
    if (!stats.representativeIntervalsHours.includes(72) || !stats.representativeIntervalsHours.includes(84)) {
      throw new Error('Tanto light como very_light deben participar en los intervalos representativos');
    }
  });

  // 13. taskService NO crea harvest task con 3+ días restantes
  await assert('13. taskService NO crea harvest task con 3+ días restantes', () => {
    const todayStr = getLocalTodayDateOnly();
    // Cultivo con 56 días de flora esperados.
    // Si empezó hace 50 días, faltan 6 días (> 2 días).
    const cropEarly: Cultivation = {
      ...cropFloraSept27,
      id: 'crop_early_harvest_test',
      startDate: addDays(todayStr, -50),
      stageStartDate: addDays(todayStr, -50),
      floweringStartDate: addDays(todayStr, -50),
      declaredFloweringWeeks: 8, // 56 días
    };

    const tasks = taskService.getTasksForDashboard([cropEarly], [], [], 'user_eval_pot_lift', [], []);
    const harvestTask = tasks.find((t) => t.type === 'harvest');
    if (harvestTask) {
      throw new Error(`taskService creó harvest task cuando faltaban más de 2 días: ${harvestTask.title}`);
    }
  });

  // 14. taskService crea harvest task con 2 días restantes
  await assert('14. taskService crea harvest task con 2 días restantes', () => {
    const todayStr = getLocalTodayDateOnly();
    // Con 66 días totales de floración + maduración esperados, -64 días sitúa daysUntilHarvest exactamente en 2
    const crop2Days: Cultivation = {
      ...cropFloraSept27,
      id: 'crop_2days_harvest_test',
      startDate: addDays(todayStr, -64),
      stageStartDate: addDays(todayStr, -64),
      floweringStartDate: addDays(todayStr, -64),
      declaredFloweringWeeks: 8,
    };

    const tasks = taskService.getTasksForDashboard([crop2Days], [], [], 'user_eval_pot_lift', [], []);
    const harvestTask = tasks.find((t) => t.type === 'harvest');
    if (!harvestTask) {
      throw new Error('taskService DEBE crear harvest task cuando faltan 2 días restantes');
    }
    if (!harvestTask.title.includes('Inspección de Tricomas')) {
      throw new Error(`Título inesperado: ${harvestTask.title}`);
    }
  });

  // 15. taskService crea harvest task con 1 día restante
  await assert('15. taskService crea harvest task con 1 día restante', () => {
    const todayStr = getLocalTodayDateOnly();
    // Con 66 días totales esperados, -65 días sitúa daysUntilHarvest exactamente en 1
    const crop1Day: Cultivation = {
      ...cropFloraSept27,
      id: 'crop_1day_harvest_test',
      startDate: addDays(todayStr, -65),
      stageStartDate: addDays(todayStr, -65),
      floweringStartDate: addDays(todayStr, -65),
      declaredFloweringWeeks: 8,
    };

    const tasks = taskService.getTasksForDashboard([crop1Day], [], [], 'user_eval_pot_lift', [], []);
    const harvestTask = tasks.find((t) => t.type === 'harvest');
    if (!harvestTask) {
      throw new Error('taskService DEBE crear harvest task cuando falta 1 día restante');
    }
  });

  // 16. taskService usa la misma estimatedHarvestDate del schedule
  await assert('16. taskService usa la misma estimatedHarvestDate del schedule', () => {
    const todayStr = getLocalTodayDateOnly();
    const crop1Day: Cultivation = {
      ...cropFloraSept27,
      id: 'crop_1day_harvest_test_2',
      startDate: addDays(todayStr, -65),
      stageStartDate: addDays(todayStr, -65),
      floweringStartDate: addDays(todayStr, -65),
      declaredFloweringWeeks: 8,
    };

    const schedule = buildCultivationStageSchedule(crop1Day);
    const tasks = taskService.getTasksForDashboard([crop1Day], [], [], 'user_eval_pot_lift', [], []);
    const harvestTask = tasks.find((t) => t.type === 'harvest');
    if (!harvestTask) throw new Error('No se encontró harvestTask');

    if (harvestTask.dueDate !== schedule.estimatedHarvestDate) {
      throw new Error(
        `taskService dueDate (${harvestTask.dueDate}) difiere de schedule.estimatedHarvestDate (${schedule.estimatedHarvestDate})`
      );
    }
  });

  // 17. AI general no crea dummy Indoor
  await assert('17. AI general no crea dummy Indoor', async () => {
    let interceptedCultivation: any = 'not_called';
    const originalChat = aiService.chatWithCropContext;
    aiService.chatWithCropContext = async (params: any) => {
      interceptedCultivation = params.cultivation;
      return { reply: 'ok botánico', evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] } };
    };

    try {
      await aiService.askAssistant({
        question: '¿Qué es el déficit de presión de vapor en botánica?',
      });

      if (interceptedCultivation !== undefined) {
        throw new Error(`Se fabricó cultivo dummy: ${JSON.stringify(interceptedCultivation)}`);
      }
    } finally {
      aiService.chatWithCropContext = originalChat;
    }
  });

  // 18. AI general no crea dummy de 1 planta
  await assert('18. AI general no crea dummy de 1 planta', async () => {
    let interceptedPlantCount: any = undefined;
    const originalChat = aiService.chatWithCropContext;
    aiService.chatWithCropContext = async (params: any) => {
      interceptedPlantCount = params.cultivation?.plantCount;
      return { reply: 'ok botánico', evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] } };
    };

    try {
      await aiService.askAssistant({
        question: 'Consulta agronómica general sin cultivo activo',
      });

      if (interceptedPlantCount !== undefined) {
        throw new Error(`Se fabricó dummy plantCount: ${interceptedPlantCount}`);
      }
    } finally {
      aiService.chatWithCropContext = originalChat;
    }
  });

  // 19. server no inventa 18/6
  await assert('19. server no inventa 18/6', () => {
    // Verificamos el contexto precalculado determinista sin fotoperiodo configurado
    const cropSinLuz: Cultivation = {
      ...cropFloraSept27,
      lighting: {
        type: 'LED Quantum Board',
      },
    };
    const ctx = buildCultivationIntelligenceContext({
      cultivation: cropSinLuz,
      waterings: [],
      envRecords: [],
    });

    if (ctx.identity.photoperiodHoursLight !== undefined) {
      throw new Error(`photoperiodHoursLight debería ser undefined, recibido ${ctx.identity.photoperiodHoursLight}`);
    }
    if (ctx.identity.photoperiodHoursDark !== undefined) {
      throw new Error(`photoperiodHoursDark debería ser undefined, recibido ${ctx.identity.photoperiodHoursDark}`);
    }

    // Comprobamos la regla de formateo del servidor
    const photoperiodStr =
      ctx.identity.photoperiodHoursLight !== undefined && ctx.identity.photoperiodHoursDark !== undefined
        ? `${ctx.identity.photoperiodHoursLight}h luz / ${ctx.identity.photoperiodHoursDark}h oscuridad`
        : 'No registrado';

    if (photoperiodStr !== 'No registrado') {
      throw new Error(`Esperado 'No registrado', obtenido '${photoperiodStr}'`);
    }
  });

  // 20. contexto IA recibe genetics/photos/notes/harvests
  await assert('20. contexto IA recibe genetics/photos/notes/harvests', () => {
    const mockGenetics: Genetics[] = [
      {
        id: 'gen_haze_1',
        userId: 'user_eval_pot_lift',
        name: 'Super Lemon Haze',
        seedBank: 'Green House Seeds',
        photoperiodType: 'Fotoperiódica',
        declaredFloweringWeeks: 10,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const mockCropWithGen: Cultivation = {
      ...cropFloraSept27,
      geneticsId: 'gen_haze_1',
    };

    const mockPhotos: PhotoRecord[] = [
      {
        id: 'photo_1',
        userId: 'user_eval_pot_lift',
        cultivationId: cropFloraSept27.id,
        date: '2026-09-28',
        dayOfCultivation: 1,
        url: '',
        stage: 'Floración',
        category: 'flor',
        createdAt: '2026-09-28T10:00:00.000Z',
      },
      {
        id: 'photo_2',
        userId: 'user_eval_pot_lift',
        cultivationId: cropFloraSept27.id,
        date: '2026-09-29',
        dayOfCultivation: 2,
        url: '',
        stage: 'Floración',
        category: 'tricomas',
        createdAt: '2026-09-29T10:00:00.000Z',
      },
    ];

    const mockNotes: DiaryEntry[] = [
      {
        id: 'note_1',
        userId: 'user_eval_pot_lift',
        cultivationId: cropFloraSept27.id,
        date: '2026-09-28',
        title: 'Entrada flora',
        content: 'Transición a 12/12 completada exitosamente sin signos de estrés.',
        tags: ['flora'],
        createdAt: '2026-09-28T12:00:00.000Z',
        updatedAt: '2026-09-28T12:00:00.000Z',
      },
    ];

    const mockHarvests: Harvest[] = [
      {
        id: 'harvest_prev_1',
        userId: 'user_eval_pot_lift',
        cultivationId: 'crop_old',
        cultivationName: 'Anterior',
        startDate: '2026-05-01',
        harvestDate: '2026-08-01',
        totalDays: 92,
        plantCount: 1,
        finalDryWeightGrams: 145,
        gramsPerPlant: 145,
        rating1To5: 5,
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    ];

    const ctx = buildCultivationIntelligenceContext({
      cultivation: mockCropWithGen,
      waterings: [],
      envRecords: [],
      photos: mockPhotos,
      diaryEntries: mockNotes,
      geneticsList: mockGenetics,
      harvests: mockHarvests,
    });

    if (ctx.identity.geneticsName !== 'Super Lemon Haze') {
      throw new Error(`Esperado geneticsName 'Super Lemon Haze', recibido '${ctx.identity.geneticsName}'`);
    }
    if (ctx.notesAndPhotos?.recentPhotosCount !== 2) {
      throw new Error(`Esperado 2 fotos, recibido ${ctx.notesAndPhotos?.recentPhotosCount}`);
    }
    if (ctx.notesAndPhotos?.recentNotesCount !== 1) {
      throw new Error(`Esperado 1 nota, recibido ${ctx.notesAndPhotos?.recentNotesCount}`);
    }
    if (ctx.harvestsSummary?.pastHarvestsCount !== 1) {
      throw new Error(`Esperado 1 cosecha previa, recibido ${ctx.harvestsSummary?.pastHarvestsCount}`);
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO TIMELINE UNKNOWN HISTORY & POT LIFT: ${passed} pasadas, ${failed} fallidas de 20`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} pruebas fallaron.`);
  }

  return { passed, failed, skipped };
}

// Auto-ejecución CLI
if (process.argv[1]?.endsWith('timeline_unknown_history_and_pot_lift.test.ts')) {
  runTimelineUnknownHistoryAndPotLiftTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
