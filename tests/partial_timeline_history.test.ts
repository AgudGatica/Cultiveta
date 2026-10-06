/**
 * tests/partial_timeline_history.test.ts
 *
 * SUITE DE PRUEBAS: HISTORIAL PARCIALMENTE CONOCIDO, CRONOLOGÍA POR ETAPAS,
 * FORMULARIO DE CULTIVO & RESUMEN SEMANAL IA (17 CASOS)
 *
 * 1. Germinación unknown.
 * 2. Plántula unknown.
 * 3. Vegetativo 2026-08-20 actual.
 * 4. Floración 2026-09-27 actual.
 * 5. Futuro projected.
 * 6. No backward projection.
 * 7. Vegetativo conocido NO implica cycleStartKnown = true.
 * 8. Germinación conocida SÍ puede implicar cycleStartKnown = true.
 * 9. priorDates.plantula persiste en stagesTimeline.
 * 10. priorDates.vegetativo persiste en stagesTimeline.
 * 11. Reabrir formulario recupera esas fechas.
 * 12. Cambio a Floración respeta 2026-09-27 en vez de hoy.
 * 13. floweringStartDate = 2026-09-27.
 * 14. Vegetativo.actualEndDate = Floración.actualStartDate.
 * 15. getWeeklySummary no crea dummy Indoor.
 * 16. getWeeklySummary no inventa Vegetativo.
 * 17. getWeeklySummary no inventa stageStartDate.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Cultivation,
  CultivationGrowthStage,
} from '../src/types';
import {
  buildCultivationStageSchedule,
  buildUpdatedStagesTimeline,
  getLocalTodayDateOnly,
  isFloweringStage,
} from '../src/utils/growthStageUtils';
import { CultivationFormModal } from '../src/components/cultivations/CultivationFormModal';
import { cultivationService } from '../src/services/cultivationService';
import { aiService } from '../src/services/aiService';

// Configurar entorno DOM para pruebas de formulario y UI
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
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

async function run() {
  console.log('\n================================================================');
  console.log('   PRUEBAS: HISTORIAL PARCIALMENTE CONOCIDO & IA (17 CASOS)   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(msg: string) {
    passed++;
    console.log(`  ✓ [PASÓ] ${msg}`);
  }

  function recordFail(msg: string, err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${msg}:`, err?.message || err);
  }

  // Escenario central:
  // Cultivo en Floración con fecha 2026-09-27.
  // Vegetativo empezó 2026-08-20.
  // Germinación y Plántula desconocidas.
  const timelineStages = buildUpdatedStagesTimeline({
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    priorDates: {
      vegetativo: '2026-08-20',
    },
    declaredFloweringWeeks: 8,
  });

  const cropPartial: Cultivation = {
    id: 'crop-partial-eval-1',
    userId: 'user-eval',
    name: 'OG Kush Parcial',
    type: 'Indoor',
    plantCount: 1,
    startDate: '2026-08-20',
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    timelineHistoryMode: 'partially_known',
    cycleStartKnown: false,
    stagesTimeline: timelineStages,
    substrate: {
      type: 'Turba',
      potVolumeLiters: 11,
      potType: 'Geotextil',
    },
    status: 'ESTABLE',
    createdAt: '2026-09-27T00:00:00Z',
    updatedAt: '2026-09-27T00:00:00Z',
  };

  const schedule = buildCultivationStageSchedule(cropPartial, []);

  const germStage = schedule.stages.find((s) => s.name.toLowerCase().includes('germin'));
  const plantulaStage = schedule.stages.find((s) => s.name.toLowerCase().includes('plánt') || s.name.toLowerCase().includes('plant'));
  const vegStage = schedule.stages.find((s) => s.name.toLowerCase().includes('veg'));
  const florStage = schedule.stages.find((s) => isFloweringStage(s.name));
  const futureStages = schedule.stages.filter((s, idx) => idx > schedule.activeStageIndex);

  // 1. Germinación unknown.
  try {
    assert(germStage, 'Debe existir etapa Germinación');
    assert(germStage?.dateKnowledge === 'unknown', `Germinación dateKnowledge debe ser unknown, recibido: ${germStage?.dateKnowledge}`);
    assert(germStage?.startDate === undefined, 'Germinación startDate debe ser undefined');
    assert(germStage?.actualStartDate === undefined, 'Germinación actualStartDate debe ser undefined');
    recordPass('1. Germinación unknown');
  } catch (e) {
    recordFail('1. Germinación unknown', e);
  }

  // 2. Plántula unknown.
  try {
    assert(plantulaStage, 'Debe existir etapa Plántula');
    assert(plantulaStage?.dateKnowledge === 'unknown', `Plántula dateKnowledge debe ser unknown, recibido: ${plantulaStage?.dateKnowledge}`);
    assert(plantulaStage?.startDate === undefined, 'Plántula startDate debe ser undefined');
    assert(plantulaStage?.actualStartDate === undefined, 'Plántula actualStartDate debe ser undefined');
    recordPass('2. Plántula unknown');
  } catch (e) {
    recordFail('2. Plántula unknown', e);
  }

  // 3. Vegetativo 2026-08-20 actual.
  try {
    assert(vegStage, 'Debe existir etapa Vegetativo');
    assert(vegStage?.actualStartDate === '2026-08-20', `Vegetativo actualStartDate debe ser 2026-08-20, recibido: ${vegStage?.actualStartDate}`);
    assert(vegStage?.startDate === '2026-08-20', `Vegetativo startDate debe ser 2026-08-20, recibido: ${vegStage?.startDate}`);
    assert(vegStage?.dateKnowledge === 'actual', `Vegetativo dateKnowledge debe ser actual, recibido: ${vegStage?.dateKnowledge}`);
    recordPass('3. Vegetativo 2026-08-20 actual');
  } catch (e) {
    recordFail('3. Vegetativo 2026-08-20 actual', e);
  }

  // 4. Floración 2026-09-27 actual.
  try {
    assert(florStage, 'Debe existir etapa Floración');
    assert(florStage?.actualStartDate === '2026-09-27', `Floración actualStartDate debe ser 2026-09-27, recibido: ${florStage?.actualStartDate}`);
    assert(florStage?.startDate === '2026-09-27', `Floración startDate debe ser 2026-09-27, recibido: ${florStage?.startDate}`);
    assert(florStage?.dateKnowledge === 'actual', `Floración dateKnowledge debe ser actual, recibido: ${florStage?.dateKnowledge}`);
    recordPass('4. Floración 2026-09-27 actual');
  } catch (e) {
    recordFail('4. Floración 2026-09-27 actual', e);
  }

  // 5. Futuro projected.
  try {
    assert(futureStages.length > 0, 'Deben existir etapas futuras proyectadas');
    for (const fut of futureStages) {
      assert(fut.dateKnowledge === 'projected', `Etapa futura ${fut.name} debe ser projected`);
      assert(fut.isProjected === true, `Etapa futura ${fut.name} debe tener isProjected = true`);
      assert(fut.actualStartDate === undefined, `Etapa futura ${fut.name} no debe tener actualStartDate`);
      assert(fut.startDate && fut.startDate >= '2026-09-27', `Etapa futura ${fut.name} startDate debe ser >= 2026-09-27`);
    }
    recordPass('5. Futuro projected');
  } catch (e) {
    recordFail('5. Futuro projected', e);
  }

  // 6. No backward projection.
  try {
    assert(germStage?.startDate === undefined, 'Germinación no debe tener startDate proyectada hacia atrás');
    assert(germStage?.endDate === undefined, 'Germinación no debe tener endDate proyectada hacia atrás');
    assert(plantulaStage?.startDate === undefined, 'Plántula no debe tener startDate proyectada hacia atrás');
    assert(plantulaStage?.endDate === undefined, 'Plántula no debe tener endDate proyectada hacia atrás');
    recordPass('6. No backward projection');
  } catch (e) {
    recordFail('6. No backward projection', e);
  }

  // 7. Vegetativo conocido NO implica cycleStartKnown = true.
  try {
    assert(cropPartial.cycleStartKnown === false, 'cycleStartKnown debe ser false si Germinación es desconocida');
    assert(schedule.isCycleStartKnown === false, 'schedule.isCycleStartKnown debe ser false');
    assert(schedule.totalCycleDays === null, 'totalCycleDays debe ser null si cycleStart no es conocido');
    assert(schedule.totalElapsedDays === null, 'totalElapsedDays debe ser null si cycleStart no es conocido');
    assert(schedule.overallProgressPct === null, 'overallProgressPct debe ser estrictamente null si cycleStart no es conocido (no inventar porcentaje)');
    recordPass('7. Vegetativo conocido NO implica cycleStartKnown = true');
  } catch (e) {
    recordFail('7. Vegetativo conocido NO implica cycleStartKnown = true', e);
  }

  // 8. Germinación conocida SÍ puede implicar cycleStartKnown = true.
  try {
    const timelineWithGerm = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        germinacion: '2026-07-20',
        vegetativo: '2026-08-20',
      },
    });
    const cropWithGerm: Cultivation = {
      ...cropPartial,
      startDate: '2026-07-20',
      timelineHistoryMode: 'known_from_start',
      cycleStartKnown: true,
      stagesTimeline: timelineWithGerm,
    };
    const schedWithGerm = buildCultivationStageSchedule(cropWithGerm, []);
    assert(cropWithGerm.cycleStartKnown === true, 'cycleStartKnown debe ser true si germinación es conocida');
    assert(schedWithGerm.isCycleStartKnown === true, 'schedule.isCycleStartKnown debe ser true');
    assert(schedWithGerm.totalCycleDays !== null && schedWithGerm.totalCycleDays > 0, 'totalCycleDays debe ser numérico');
    recordPass('8. Germinación conocida SÍ puede implicar cycleStartKnown = true');
  } catch (e) {
    recordFail('8. Germinación conocida SÍ puede implicar cycleStartKnown = true', e);
  }

  // 9. priorDates.plantula persiste en stagesTimeline.
  try {
    const timelineBoth = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        plantula: '2026-08-01',
        vegetativo: '2026-08-20',
      },
    });
    const plStage = timelineBoth.find((s) => s.name.toLowerCase().includes('plánt') || s.name.toLowerCase().includes('plant'));
    assert(plStage, 'Debe existir etapa Plántula en timeline');
    assert(plStage?.actualStartDate === '2026-08-01', `Plántula actualStartDate debe ser 2026-08-01, recibido: ${plStage?.actualStartDate}`);
    assert(plStage?.actualEndDate === '2026-08-20', `Plántula actualEndDate debe ser 2026-08-20 (inicio de Vegetativo), recibido: ${plStage?.actualEndDate}`);
    assert(plStage?.dateKnowledge === 'actual', 'Plántula dateKnowledge debe ser actual');
    recordPass('9. priorDates.plantula persiste en stagesTimeline');
  } catch (e) {
    recordFail('9. priorDates.plantula persiste en stagesTimeline', e);
  }

  // 10. priorDates.vegetativo persiste en stagesTimeline.
  try {
    const timelineBoth = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        plantula: '2026-08-01',
        vegetativo: '2026-08-20',
      },
    });
    const vStage = timelineBoth.find((s) => s.name.toLowerCase().includes('veg'));
    assert(vStage, 'Debe existir etapa Vegetativo en timeline');
    assert(vStage?.actualStartDate === '2026-08-20', `Vegetativo actualStartDate debe ser 2026-08-20, recibido: ${vStage?.actualStartDate}`);
    assert(vStage?.actualEndDate === '2026-09-27', `Vegetativo actualEndDate debe ser 2026-09-27 (inicio de Floración), recibido: ${vStage?.actualEndDate}`);
    recordPass('10. priorDates.vegetativo persiste en stagesTimeline');
  } catch (e) {
    recordFail('10. priorDates.vegetativo persiste en stagesTimeline', e);
  }

  // 11. Reabrir formulario recupera esas fechas.
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const cropForEdit: Cultivation = {
      ...cropPartial,
      stagesTimeline: [
        {
          id: 'st-0',
          name: 'Germinación',
          startDate: undefined as any,
          endDate: undefined,
          actualStartDate: undefined,
          expectedDurationDays: 7,
          dateKnowledge: 'unknown',
        },
        {
          id: 'st-1',
          name: 'Plántula',
          startDate: '2026-08-01',
          endDate: '2026-08-20',
          actualStartDate: '2026-08-01',
          actualEndDate: '2026-08-20',
          expectedDurationDays: 14,
          dateKnowledge: 'actual',
        },
        {
          id: 'st-2',
          name: 'Vegetativo',
          startDate: '2026-08-20',
          endDate: '2026-09-27',
          actualStartDate: '2026-08-20',
          actualEndDate: '2026-09-27',
          expectedDurationDays: 35,
          dateKnowledge: 'actual',
        },
        {
          id: 'st-3',
          name: 'Floración',
          startDate: '2026-09-27',
          endDate: '2026-11-22',
          actualStartDate: '2026-09-27',
          expectedDurationDays: 56,
          dateKnowledge: 'actual',
        },
      ],
    };

    await act(async () => {
      root.render(
        React.createElement(CultivationFormModal, {
          isOpen: true,
          onClose: () => {},
          userId: 'user-eval',
          geneticsList: [],
          onSaved: () => {},
          cultivationToEdit: cropForEdit,
        })
      );
    });

    const plantulaInput = container.querySelector('#prior-stage-plantula-input') as HTMLInputElement | null;
    const vegInput = container.querySelector('#prior-stage-vegetativo-input') as HTMLInputElement | null;
    const germInput = container.querySelector('#prior-stage-germinacion-input') as HTMLInputElement | null;

    assert(plantulaInput, 'Debe existir input de fecha previa de Plántula');
    assert(vegInput, 'Debe existir input de fecha previa de Vegetativo');
    assert(germInput, 'Debe existir input de fecha previa de Germinación');

    assert(plantulaInput?.value === '2026-08-01', `Input Plántula debe precargar 2026-08-01, valor actual: ${plantulaInput?.value}`);
    assert(vegInput?.value === '2026-08-20', `Input Vegetativo debe precargar 2026-08-20, valor actual: ${vegInput?.value}`);
    assert(germInput?.value === '', `Input Germinación debe estar vacío para etapa unknown, valor actual: ${germInput?.value}`);

    await act(async () => {
      root.unmount();
    });
    container.remove();

    recordPass('11. Reabrir formulario recupera esas fechas');
  } catch (e) {
    recordFail('11. Reabrir formulario recupera esas fechas', e);
  }

  // 12. Cambio a Floración respeta 2026-09-27 en vez de hoy.
  // 13. floweringStartDate = 2026-09-27.
  let savedPayloadFromChange: any = null;
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // Cultivo previo en Vegetativo
    const cropInVeg: Cultivation = {
      id: 'crop-veg-to-flor',
      userId: 'user-eval',
      name: 'Transición a Floración',
      type: 'Indoor',
      plantCount: 1,
      startDate: '2026-08-01',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-08-01',
      timelineHistoryMode: 'unknown_before_current_stage',
      cycleStartKnown: false,
      substrate: {
        type: 'Turba',
        potVolumeLiters: 11,
        potType: 'Geotextil',
      },
      status: 'ESTABLE',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    };

    // Espiar updateCultivation
    const origUpdate = cultivationService.updateCultivation;
    cultivationService.updateCultivation = async (_id: string, payload: any) => {
      savedPayloadFromChange = payload;
      return { ...cropInVeg, ...payload } as any;
    };

    await act(async () => {
      root.render(
        React.createElement(CultivationFormModal, {
          isOpen: true,
          onClose: () => {},
          userId: 'user-eval',
          geneticsList: [],
          onSaved: (c: Cultivation) => {
            savedPayloadFromChange = c;
          },
          cultivationToEdit: cropInVeg,
        })
      );
    });

    const stageSelect = container.querySelector('#crop-stage-select') as HTMLSelectElement;
    const dateInput = container.querySelector('#crop-start-date-input') as HTMLInputElement;
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    assert(stageSelect, 'Debe existir selector de etapa');
    assert(dateInput, 'Debe existir input de fecha de inicio de etapa');
    assert(submitBtn, 'Debe existir botón de submit');

    const triggerChange = (element: any, val: string) => {
      const propsKey = Object.keys(element).find((k) => k.startsWith('__reactProps'));
      if (propsKey && element[propsKey]?.onChange) {
        element[propsKey].onChange({ target: { value: val } });
      } else {
        element.value = val;
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      }
    };

    // Usuario cambia Vegetativo -> Floración
    await act(async () => {
      triggerChange(stageSelect, 'Floración');
    });

    // Usuario escribe explícitamente 2026-09-27
    await act(async () => {
      triggerChange(dateInput, '2026-09-27');
    });

    // Enviar formulario
    await act(async () => {
      submitBtn.click();
    });

    cultivationService.updateCultivation = origUpdate;

    assert(savedPayloadFromChange, 'Debe haberse guardado el cultivo');
    const today = getLocalTodayDateOnly();
    assert(
      savedPayloadFromChange.stageStartDate === '2026-09-27',
      `stageStartDate debe ser exactamente 2026-09-27 (prioridad de fecha del usuario), recibido: ${savedPayloadFromChange.stageStartDate} (hoy=${today})`
    );
    recordPass('12. Cambio a Floración respeta 2026-09-27 en vez de hoy');

    // 13. floweringStartDate = 2026-09-27.
    assert(
      savedPayloadFromChange.floweringStartDate === '2026-09-27',
      `floweringStartDate debe ser 2026-09-27, recibido: ${savedPayloadFromChange.floweringStartDate}`
    );
    recordPass('13. floweringStartDate = 2026-09-27');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  } catch (e) {
    recordFail('12 & 13. Cambio a Floración respeta 2026-09-27', e);
  }

  // 14. Vegetativo.actualEndDate = Floración.actualStartDate.
  // y no saltar etapas unknown: Germinación o Plántula sin etapa contigua conocida deben tener actualEndDate = undefined
  try {
    const updatedStages = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        vegetativo: '2026-08-20',
      },
    });
    const veg = updatedStages.find((s) => s.name.toLowerCase().includes('veg'));
    const flor = updatedStages.find((s) => isFloweringStage(s.name));

    assert(veg, 'Debe existir etapa Vegetativo');
    assert(flor, 'Debe existir etapa Floración');
    assert(
      veg?.actualEndDate === flor?.actualStartDate,
      `Vegetativo actualEndDate (${veg?.actualEndDate}) debe ser idéntico a Floración actualStartDate (${flor?.actualStartDate})`
    );
    assert(veg?.actualEndDate === '2026-09-27', `Vegetativo actualEndDate debe ser 2026-09-27, recibido: ${veg?.actualEndDate}`);
    assert(veg?.dateKnowledge === 'actual', 'Vegetativo consecutivo a Floración debe tener dateKnowledge actual');

    // Caso de no saltar etapas unknown:
    // Germinación: 20 julio, Plántula: unknown, Vegetativo: 20 agosto
    const timelineWithSkip = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        germinacion: '2026-07-20',
        vegetativo: '2026-08-20',
      },
    });
    const germSkip = timelineWithSkip.find((s) => s.name.toLowerCase().includes('germin'));
    const plantulaSkip = timelineWithSkip.find((s) => s.name.toLowerCase().includes('plánt') || s.name.toLowerCase().includes('plant'));

    assert(germSkip, 'Debe existir Germinación');
    assert(germSkip?.actualStartDate === '2026-07-20', 'Germinación actualStartDate debe ser 2026-07-20');
    assert(plantulaSkip?.actualStartDate === undefined, 'Plántula debe ser unknown (sin actualStartDate)');
    assert(
      germSkip?.actualEndDate === undefined,
      `Germinación.actualEndDate NO debe saltar Plántula unknown. Recibido: ${germSkip?.actualEndDate}`
    );
    assert(
      germSkip?.dateKnowledge === 'projected',
      `Germinación sin fin real conocido debe tener dateKnowledge="projected", recibido: ${germSkip?.dateKnowledge}`
    );

    // Caso de Plántula: 1 agosto, Vegetativo: unknown, Floración: 27 septiembre
    const timelineWithPlantulaSkip = buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: '2026-09-27',
      floweringStartDate: '2026-09-27',
      priorDates: {
        plantula: '2026-08-01',
      },
    });
    const plantulaOnly = timelineWithPlantulaSkip.find((s) => s.name.toLowerCase().includes('plánt') || s.name.toLowerCase().includes('plant'));
    assert(plantulaOnly, 'Debe existir Plántula');
    assert(plantulaOnly?.actualStartDate === '2026-08-01', 'Plántula actualStartDate debe ser 2026-08-01');
    assert(
      plantulaOnly?.actualEndDate === undefined,
      `Plántula.actualEndDate NO debe saltar Vegetativo unknown. Recibido: ${plantulaOnly?.actualEndDate}`
    );
    assert(
      plantulaOnly?.dateKnowledge === 'projected',
      `Plántula sin fin real conocido debe tener dateKnowledge="projected", recibido: ${plantulaOnly?.dateKnowledge}`
    );

    recordPass('14. Vegetativo.actualEndDate = Floración.actualStartDate');
  } catch (e) {
    recordFail('14. Vegetativo.actualEndDate = Floración.actualStartDate', e);
  }

  // 15. getWeeklySummary no crea dummy Indoor.
  // 16. getWeeklySummary no inventa Vegetativo.
  // 17. getWeeklySummary no inventa stageStartDate.
  try {
    let capturedBody: any = null;
    const origFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, init?: any) => {
      if (url === '/api/ai/weekly-summary' || url === '/api/ai/summary') {
        capturedBody = JSON.parse(init?.body || '{}');
        return {
          ok: true,
          json: async () => ({
            summary: 'Resumen semanal basado exclusivamente en métricas reales de los cultivos evaluados.',
          }),
        };
      }
      return origFetch(url, init);
    };

    const weeklyRes = await aiService.getWeeklySummary({
      cultivations: [
        { name: 'Amnesia Haze', stage: 'Floración', genetics: 'Amnesia' },
      ],
      wateringsCount: 4,
      recentEnvAvg: { tempC: 24.5, humidityPct: 52 },
    });

    (globalThis as any).fetch = origFetch;

    assert(weeklyRes && weeklyRes.length > 0, 'getWeeklySummary debe retornar texto');

    // 15. getWeeklySummary no crea dummy Indoor
    assert(
      capturedBody?.cultivation?.type !== 'Indoor',
      `getWeeklySummary NO debe fabricar dummy type Indoor. Payload capturado: ${JSON.stringify(capturedBody)}`
    );
    recordPass('15. getWeeklySummary no crea dummy Indoor');

    // 16. getWeeklySummary no inventa Vegetativo
    assert(
      capturedBody?.cultivation?.currentStage !== 'Vegetativo',
      `getWeeklySummary NO debe forzar currentStage Vegetativo. Payload capturado: ${JSON.stringify(capturedBody)}`
    );
    recordPass('16. getWeeklySummary no inventa Vegetativo');

    // 17. getWeeklySummary no inventa stageStartDate
    assert(
      !capturedBody?.cultivation?.stageStartDate,
      `getWeeklySummary NO debe inventar un stageStartDate ficticio. Payload capturado: ${JSON.stringify(capturedBody)}`
    );
    recordPass('17. getWeeklySummary no inventa stageStartDate');
  } catch (e) {
    recordFail('15, 16 o 17. getWeeklySummary no inventa datos agronómicos ficticios', e);
  }

  console.log('\n================================================================');
  console.log(` RESULTADO PARTIAL TIMELINE HISTORY: ${passed} pasadas, ${failed} fallidas de 17`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Error fatal en suite partial_timeline_history:', err);
  process.exit(1);
});
