/**
 * tests/dashboard_lifecycle_progress.test.ts
 *
 * SUITE DE PRUEBAS: DASHBOARD, BARRA DE PROGRESO DEL CICLO Y DESGLOSE DE ETAPAS EN HISTORIAL PARCIAL (12 CASOS)
 *
 * 1. ciclo completo: overallProgressPct es number.
 * 2. ciclo parcial: overallProgressPct === null.
 * 3. ciclo parcial: roadmapProgressPct es number.
 * 4. roadmapProgressPct: finite y entre 0 y 100.
 * 5. Dashboard parcial renderiza #cycle-progress-bar-fill.
 * 6. ancho del fill no contiene: null, undefined, NaN.
 * 7. cultivo iniciado directamente en Floración muestra fill > 0.
 * 8. Dashboard parcial no renderiza: "Día null" ni "null%".
 * 9. cabecera parcial usa día de la etapa y NO edad total ficticia.
 * 10. Siembra/Germinación desconocida muestra: "Sin fecha registrada".
 * 11. etapa anterior unknown muestra: "Anterior · Sin fecha".
 * 12. ciclo completo conserva: "Día X de ~Y" y overallProgressPct.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Cultivation } from '../src/types';
import {
  buildCultivationStageSchedule,
  buildUpdatedStagesTimeline,
} from '../src/utils/growthStageUtils';
import { DashboardOverview } from '../src/components/dashboard/DashboardOverview';

// Configurar JSDOM para ejecución React
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

async function run(): Promise<void> {
  console.log('\n================================================================');
  console.log('   PRUEBAS DE DASHBOARD: BARRA DE PROGRESO & DESGLOSE (12 CASOS) ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const recordPass = (msg: string) => {
    passed++;
    console.log(`  ✓ [PASÓ] ${msg}`);
  };

  const recordFail = (msg: string, err: any) => {
    failed++;
    console.error(`  ✗ [FALLÓ] ${msg}:`, err?.message || err);
  };

  const assert = (condition: any, message: string) => {
    if (!condition) {
      throw new Error(`FAIL: ${message}`);
    }
  };

  // 1. Escenario Ciclo Completo (conocido desde Germinación)
  const timelineComplete = buildUpdatedStagesTimeline({
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    priorDates: {
      germinacion: '2026-08-01',
      plantula: '2026-08-08',
      vegetativo: '2026-08-22',
    },
    declaredFloweringWeeks: 8,
  });

  const cropComplete: Cultivation = {
    id: 'crop_complete',
    userId: 'user_1',
    name: 'Amnesia Haze Completa',
    type: 'Indoor',
    plantCount: 2,
    startDate: '2026-08-01',
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    timelineHistoryMode: 'known_from_start',
    cycleStartKnown: true,
    stagesTimeline: timelineComplete,
    substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
    status: 'ESTABLE',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-09-27T10:00:00Z',
  };

  // 2. Escenario Ciclo Parcial (Vegetativo conocido, Germinación/Plántula desconocidas)
  const timelinePartial = buildUpdatedStagesTimeline({
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    priorDates: {
      vegetativo: '2026-08-20',
    },
    declaredFloweringWeeks: 8,
  });

  const cropPartial: Cultivation = {
    id: 'crop_partial',
    userId: 'user_1',
    name: 'OG Kush Parcial',
    type: 'Indoor',
    plantCount: 1,
    startDate: '2026-08-20',
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    timelineHistoryMode: 'partially_known',
    cycleStartKnown: false,
    stagesTimeline: timelinePartial,
    substrate: { type: 'Turba', potVolumeLiters: 11, potType: 'Geotextil' },
    status: 'ESTABLE',
    createdAt: '2026-09-27T10:00:00Z',
    updatedAt: '2026-09-27T10:00:00Z',
  };

  // 3. Escenario Iniciado directamente en Floración (Esqueje sin historial previo)
  const timelineDirectFlora = buildUpdatedStagesTimeline({
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    declaredFloweringWeeks: 8,
  });

  const cropDirectFlora: Cultivation = {
    id: 'crop_direct_flora',
    userId: 'user_1',
    name: 'Esqueje Floración Directa',
    type: 'Indoor',
    plantCount: 1,
    startDate: '2026-09-27',
    currentStage: 'Floración',
    stageStartDate: '2026-09-27',
    floweringStartDate: '2026-09-27',
    timelineHistoryMode: 'unknown_before_current_stage',
    cycleStartKnown: false,
    stagesTimeline: timelineDirectFlora,
    substrate: { type: 'Coco', potVolumeLiters: 7, potType: 'Airpot' },
    status: 'ESTABLE',
    createdAt: '2026-09-27T10:00:00Z',
    updatedAt: '2026-09-27T10:00:00Z',
  };

  const scheduleComplete = buildCultivationStageSchedule(cropComplete, []);
  const schedulePartial = buildCultivationStageSchedule(cropPartial, []);
  const scheduleDirectFlora = buildCultivationStageSchedule(cropDirectFlora, []);

  // -------------------------------------------------------------------------
  // 1. ciclo completo: overallProgressPct es number.
  // -------------------------------------------------------------------------
  try {
    assert(
      typeof scheduleComplete.overallProgressPct === 'number',
      `scheduleComplete.overallProgressPct debe ser number, recibido: ${typeof scheduleComplete.overallProgressPct}`
    );
    assert(
      scheduleComplete.overallProgressPct !== null && scheduleComplete.overallProgressPct > 0,
      `scheduleComplete.overallProgressPct debe ser positivo, recibido: ${scheduleComplete.overallProgressPct}`
    );
    recordPass('1. ciclo completo: overallProgressPct es number');
  } catch (e) {
    recordFail('1. ciclo completo: overallProgressPct es number', e);
  }

  // -------------------------------------------------------------------------
  // 2. ciclo parcial: overallProgressPct === null.
  // -------------------------------------------------------------------------
  try {
    assert(
      schedulePartial.overallProgressPct === null,
      `schedulePartial.overallProgressPct debe ser estrictamente null, recibido: ${schedulePartial.overallProgressPct}`
    );
    recordPass('2. ciclo parcial: overallProgressPct === null');
  } catch (e) {
    recordFail('2. ciclo parcial: overallProgressPct === null', e);
  }

  // -------------------------------------------------------------------------
  // 3. ciclo parcial: roadmapProgressPct es number.
  // -------------------------------------------------------------------------
  try {
    assert(
      typeof schedulePartial.roadmapProgressPct === 'number',
      `schedulePartial.roadmapProgressPct debe ser number, recibido: ${typeof schedulePartial.roadmapProgressPct}`
    );
    recordPass('3. ciclo parcial: roadmapProgressPct es number');
  } catch (e) {
    recordFail('3. ciclo parcial: roadmapProgressPct es number', e);
  }

  // -------------------------------------------------------------------------
  // 4. roadmapProgressPct: finite y entre 0 y 100.
  // -------------------------------------------------------------------------
  try {
    const rPct = schedulePartial.roadmapProgressPct;
    assert(Number.isFinite(rPct), `roadmapProgressPct debe ser finito, recibido: ${rPct}`);
    assert(
      rPct >= 0 && rPct <= 100,
      `roadmapProgressPct debe estar entre 0 y 100, recibido: ${rPct}`
    );
    recordPass('4. roadmapProgressPct: finite y entre 0 y 100');
  } catch (e) {
    recordFail('4. roadmapProgressPct: finite y entre 0 y 100', e);
  }

  // -------------------------------------------------------------------------
  // 5. Dashboard parcial renderiza #cycle-progress-bar-fill.
  // 6. ancho del fill no contiene: null, undefined, NaN.
  // 8. Dashboard parcial no renderiza: "Día null" ni "null%".
  // 9. cabecera parcial usa día de la etapa y NO edad total ficticia.
  // 10. Siembra/Germinación desconocida muestra: "Sin fecha registrada".
  // 11. etapa anterior unknown muestra: "Anterior · Sin fecha".
  // -------------------------------------------------------------------------
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(DashboardOverview, {
        cultivations: [cropPartial],
        selectedCultivation: cropPartial,
        waterings: [],
        envRecords: [],
        photos: [],
        harvests: [],
        userId: 'user_1',
        geneticsList: [],
        onSelectCultivation: () => {},
        onOpenNewCultivationModal: () => {},
        onOpenWateringModal: () => {},
        onOpenEnvModal: () => {},
        onOpenPhotoModal: () => {},
        onOpenAIAssistant: () => {},
        onOpenCalendarModal: () => {},
      })
    );
  });

  // 5. Dashboard parcial renderiza #cycle-progress-bar-fill.
  try {
    const fillEl = container.querySelector('#cycle-progress-bar-fill');
    assert(fillEl, 'Debe existir el elemento #cycle-progress-bar-fill en el DOM');
    recordPass('5. Dashboard parcial renderiza #cycle-progress-bar-fill');
  } catch (e) {
    recordFail('5. Dashboard parcial renderiza #cycle-progress-bar-fill', e);
  }

  // 6. ancho del fill no contiene: null, undefined, NaN.
  try {
    const fillEl = container.querySelector('#cycle-progress-bar-fill') as HTMLElement | null;
    assert(fillEl, '#cycle-progress-bar-fill debe existir');
    const styleAttr = fillEl?.getAttribute('style') || '';
    assert(!styleAttr.includes('null%'), `El estilo no debe contener "null%", recibido: "${styleAttr}"`);
    assert(!styleAttr.includes('undefined%'), `El estilo no debe contener "undefined%", recibido: "${styleAttr}"`);
    assert(!styleAttr.includes('NaN%'), `El estilo no debe contener "NaN%", recibido: "${styleAttr}"`);
    assert(
      Number.isFinite(schedulePartial.roadmapProgressPct),
      'roadmapProgressPct debe ser un número válido'
    );
    recordPass('6. ancho del fill no contiene: null, undefined, NaN');
  } catch (e) {
    recordFail('6. ancho del fill no contiene: null, undefined, NaN', e);
  }

  // -------------------------------------------------------------------------
  // 7. cultivo iniciado directamente en Floración muestra fill > 0.
  // -------------------------------------------------------------------------
  try {
    assert(
      typeof scheduleDirectFlora.roadmapProgressPct === 'number',
      'roadmapProgressPct de esqueje directo debe ser number'
    );
    assert(
      scheduleDirectFlora.roadmapProgressPct > 0,
      `cultivo iniciado directamente en Floración debe tener roadmapProgressPct > 0, recibido: ${scheduleDirectFlora.roadmapProgressPct}`
    );
    assert(
      scheduleDirectFlora.roadmapProgressPct <= 100,
      `roadmapProgressPct no debe exceder 100, recibido: ${scheduleDirectFlora.roadmapProgressPct}`
    );
    recordPass('7. cultivo iniciado directamente en Floración muestra fill > 0');
  } catch (e) {
    recordFail('7. cultivo iniciado directamente en Floración muestra fill > 0', e);
  }

  // -------------------------------------------------------------------------
  // 8. Dashboard parcial no renderiza: "Día null" ni "null%".
  // -------------------------------------------------------------------------
  try {
    const fullText = container.textContent || '';
    assert(!fullText.includes('Día null'), `No debe contener "Día null", texto: "${fullText.substring(0, 300)}"`);
    assert(!fullText.includes('null%'), `No debe contener "null%", texto: "${fullText.substring(0, 300)}"`);
    assert(!fullText.includes('~null días'), `No debe contener "~null días"`);
    recordPass('8. Dashboard parcial no renderiza: "Día null" ni "null%"');
  } catch (e) {
    recordFail('8. Dashboard parcial no renderiza: "Día null" ni "null%"', e);
  }

  // -------------------------------------------------------------------------
  // 9. cabecera parcial usa día de la etapa y NO edad total ficticia.
  // -------------------------------------------------------------------------
  try {
    const fullText = container.textContent || '';
    const activeDays = schedulePartial.activeStageElapsedDays;
    // La cabecera debe indicar "Día X de Floración"
    const expectedHeaderStr = `Día ${activeDays} de Floración`;
    assert(
      fullText.includes(expectedHeaderStr),
      `La cabecera debe contener "${expectedHeaderStr}", texto observado: ${fullText.substring(0, 300)}`
    );
    recordPass('9. cabecera parcial usa día de la etapa y NO edad total ficticia');
  } catch (e) {
    recordFail('9. cabecera parcial usa día de la etapa y NO edad total ficticia', e);
  }

  // -------------------------------------------------------------------------
  // 10. Siembra/Germinación desconocida muestra: "Sin fecha registrada".
  // -------------------------------------------------------------------------
  try {
    const lifecycleSection = container.querySelector('#crop-lifecycle-card-section');
    assert(lifecycleSection, 'Debe existir la sección #crop-lifecycle-card-section');
    const textContent = lifecycleSection?.textContent || '';
    assert(
      textContent.includes('Sin fecha registrada'),
      `Bajo Siembra debe mostrarse "Sin fecha registrada", recibido: ${textContent}`
    );
    recordPass('10. Siembra/Germinación desconocida muestra: "Sin fecha registrada"');
  } catch (e) {
    recordFail('10. Siembra/Germinación desconocida muestra: "Sin fecha registrada"', e);
  }

  // -------------------------------------------------------------------------
  // 11. etapa anterior unknown muestra: "Anterior · Sin fecha".
  // -------------------------------------------------------------------------
  try {
    const toggleBtn = container.querySelector('#toggle-lifecycle-details-btn') as HTMLButtonElement | null;
    assert(toggleBtn, 'Debe existir botón para alternar detalles de etapas');

    // Desplegar desglose de etapas
    await act(async () => {
      toggleBtn?.click();
    });

    const breakdownEl = container.querySelector('#crop-lifecycle-stage-breakdown');
    assert(breakdownEl, 'Debe existir el desglose #crop-lifecycle-stage-breakdown');

    const breakdownText = breakdownEl?.textContent || '';
    assert(
      breakdownText.includes('Anterior · Sin fecha'),
      `El desglose de etapas debe contener "Anterior · Sin fecha" para Germinación/Plántula, recibido: ${breakdownText}`
    );
    assert(
      breakdownText.includes('Anterior · Real'),
      `El desglose de etapas debe contener "Anterior · Real" para Vegetativo (conocido), recibido: ${breakdownText}`
    );
    recordPass('11. etapa anterior unknown muestra: "Anterior · Sin fecha"');
  } catch (e) {
    recordFail('11. etapa anterior unknown muestra: "Anterior · Sin fecha"', e);
  }

  await act(async () => {
    root.unmount();
  });
  container.remove();

  // -------------------------------------------------------------------------
  // 12. ciclo completo conserva: "Día X de ~Y" y overallProgressPct.
  // -------------------------------------------------------------------------
  try {
    const completeContainer = document.createElement('div');
    document.body.appendChild(completeContainer);
    const completeRoot = createRoot(completeContainer);

    await act(async () => {
      completeRoot.render(
        React.createElement(DashboardOverview, {
          cultivations: [cropComplete],
          selectedCultivation: cropComplete,
          waterings: [],
          envRecords: [],
          photos: [],
          harvests: [],
          userId: 'user_1',
          geneticsList: [],
          onSelectCultivation: () => {},
          onOpenNewCultivationModal: () => {},
          onOpenWateringModal: () => {},
          onOpenEnvModal: () => {},
          onOpenPhotoModal: () => {},
          onOpenAIAssistant: () => {},
          onOpenCalendarModal: () => {},
        })
      );
    });

    const completeText = completeContainer.textContent || '';
    const expectedElapsedStr = `Día ${scheduleComplete.totalElapsedDays} de ~${scheduleComplete.totalCycleDays}`;
    const expectedPctStr = `${scheduleComplete.overallProgressPct}% del ciclo estimado`;

    assert(
      completeText.includes(expectedElapsedStr),
      `Ciclo completo debe incluir "${expectedElapsedStr}", recibido: ${completeText.substring(0, 400)}`
    );
    assert(
      completeText.includes(expectedPctStr),
      `Ciclo completo debe incluir "${expectedPctStr}", recibido: ${completeText.substring(0, 400)}`
    );

    await act(async () => {
      completeRoot.unmount();
    });
    completeContainer.remove();

    recordPass('12. ciclo completo conserva: "Día X de ~Y" y overallProgressPct');
  } catch (e) {
    recordFail('12. ciclo completo conserva: "Día X de ~Y" y overallProgressPct', e);
  }

  console.log('\n================================================================');
  console.log(` RESULTADO DASHBOARD LIFECYCLE PROGRESS: ${passed} pasadas, ${failed} fallidas de 12`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Error fatal en suite dashboard_lifecycle_progress:', err);
  process.exit(1);
});
