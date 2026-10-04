/**
 * tests/dashboard_mini_stats.test.ts
 * 
 * SUITE DE PRUEBAS DE DASHBOARD: MINI-STATS REORGANIZADOS EN HERO CARD (5 CASOS)
 * Cumple estrictamente los requisitos definidos en Parte I:
 * 
 * 1. Existen exactamente una vez en el DOM: stat-active-crops, stat-total-plants, stat-recent-waterings, stat-diary-photos.
 * 2. Están contenidos dentro de main-crop-hero-card.
 * 3. Aparecen antes del selector "Cultivos:".
 * 4. No queda la antigua grilla de cuatro cards grandes fuera del hero.
 * 5. Los valores calculados son exactos según las métricas esperadas.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Cultivation, Watering, EnvironmentRecord, PhotoRecord } from '../src/types';
import { DashboardOverview } from '../src/components/dashboard/DashboardOverview';
import { getLocalTodayDateOnly } from '../src/utils/growthStageUtils';

// Configurar JSDOM para renderizar React
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

export async function runDashboardMiniStatsTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS DE DASHBOARD: MINI-STATS EN HERO CARD (5 CASOS)      ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const skipped = 0;

  const assert = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  const todayStr = getLocalTodayDateOnly();

  const mockCultivations: Cultivation[] = [
    {
      id: 'crop_1',
      userId: 'user_1',
      name: 'Purple Punch',
      type: 'Indoor',
      plantCount: 4,
      startDate: '2026-05-01',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-05-15',
      substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
      status: 'ESTABLE',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-15T10:00:00Z',
    },
    {
      id: 'crop_2',
      userId: 'user_1',
      name: 'Gorilla Glue',
      type: 'Indoor',
      plantCount: 4,
      startDate: '2026-05-10',
      currentStage: 'Plántula',
      stageStartDate: '2026-05-10',
      substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
      status: 'ESTABLE',
      createdAt: '2026-05-10T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    },
  ];

  const mockWaterings: Watering[] = [
    { id: 'w1', userId: 'user_1', cultivationId: 'crop_1', date: todayStr, volumeLiters: 1.5, createdAt: '' },
    { id: 'w2', userId: 'user_1', cultivationId: 'crop_2', date: todayStr, volumeLiters: 1.0, createdAt: '' },
  ];

  const mockEnv: EnvironmentRecord[] = [
    { id: 'e1', userId: 'user_1', cultivationId: 'crop_1', date: todayStr, temperatureC: 24, humidityPct: 55, createdAt: '' },
  ];

  const mockPhotos: PhotoRecord[] = [
    { id: 'p1', userId: 'user_1', cultivationId: 'crop_1', date: todayStr, url: 'https://example.com/p1.jpg', createdAt: '', dayOfCultivation: 15, stage: 'Vegetativo', category: 'planta completa' },
    { id: 'p2', userId: 'user_1', cultivationId: 'crop_1', date: todayStr, url: 'https://example.com/p2.jpg', createdAt: '', dayOfCultivation: 15, stage: 'Vegetativo', category: 'planta completa' },
    { id: 'p3', userId: 'user_1', cultivationId: 'crop_2', date: todayStr, url: 'https://example.com/p3.jpg', createdAt: '', dayOfCultivation: 5, stage: 'Plántula', category: 'planta completa' },
  ];

  const container = document.getElementById('root')!;
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(DashboardOverview, {
        cultivations: mockCultivations,
        waterings: mockWaterings,
        envRecords: mockEnv,
        photos: mockPhotos,
        onRefreshData: () => {},
        onSelectCultivation: () => {},
        onCreateCultivationClick: () => {},
        onOpenWateringModal: () => {},
        onOpenEnvModal: () => {},
        onOpenPhotoModal: () => {},
        onOpenAIAssistant: () => {},
        onOpenCalendarModal: () => {},
      })
    );
  });

  // =========================================================================
  // Caso 1: Existen exactamente una vez en el DOM
  // =========================================================================
  assert('1. Existen exactamente una vez en el DOM: stat-active-crops, stat-total-plants, stat-recent-waterings, stat-diary-photos', () => {
    const activeCropsEl = document.querySelectorAll('#stat-active-crops');
    const totalPlantsEl = document.querySelectorAll('#stat-total-plants');
    const recentWateringsEl = document.querySelectorAll('#stat-recent-waterings');
    const diaryPhotosEl = document.querySelectorAll('#stat-diary-photos');

    if (activeCropsEl.length !== 1) {
      throw new Error(`stat-active-crops debe aparecer exactamente 1 vez, encontrado: ${activeCropsEl.length}`);
    }
    if (totalPlantsEl.length !== 1) {
      throw new Error(`stat-total-plants debe aparecer exactamente 1 vez, encontrado: ${totalPlantsEl.length}`);
    }
    if (recentWateringsEl.length !== 1) {
      throw new Error(`stat-recent-waterings debe aparecer exactamente 1 vez, encontrado: ${recentWateringsEl.length}`);
    }
    if (diaryPhotosEl.length !== 1) {
      throw new Error(`stat-diary-photos debe aparecer exactamente 1 vez, encontrado: ${diaryPhotosEl.length}`);
    }
  });

  // =========================================================================
  // Caso 2: Están contenidos dentro de main-crop-hero-card
  // =========================================================================
  assert('2. Están contenidos dentro de main-crop-hero-card', () => {
    const heroCard = document.getElementById('main-crop-hero-card');
    if (!heroCard) {
      throw new Error('main-crop-hero-card no fue encontrado en el DOM');
    }

    const insideActive = heroCard.querySelector('#stat-active-crops');
    const insidePlants = heroCard.querySelector('#stat-total-plants');
    const insideWater = heroCard.querySelector('#stat-recent-waterings');
    const insidePhotos = heroCard.querySelector('#stat-diary-photos');

    if (!insideActive || !insidePlants || !insideWater || !insidePhotos) {
      throw new Error('Los 4 mini-stats deben estar anidados dentro de main-crop-hero-card');
    }
  });

  // =========================================================================
  // Caso 3: Aparecen antes del selector "Cultivos:"
  // =========================================================================
  assert('3. Aparecen antes del selector "Cultivos:"', () => {
    const heroCard = document.getElementById('main-crop-hero-card')!;
    const heroHtml = heroCard.innerHTML;

    const statsIndex = heroHtml.indexOf('id="stat-active-crops"');
    const selectorIndex = heroHtml.indexOf('Cultivos:');

    if (statsIndex === -1) {
      throw new Error('No se encontró stat-active-crops en hero card');
    }
    if (selectorIndex === -1) {
      throw new Error('No se encontró el selector "Cultivos:" en hero card');
    }

    if (statsIndex >= selectorIndex) {
      throw new Error(`Los mini-stats (pos ${statsIndex}) deben ubicarse antes del selector "Cultivos:" (pos ${selectorIndex})`);
    }
  });

  // =========================================================================
  // Caso 4: No queda la antigua grilla de cuatro cards grandes fuera del hero
  // =========================================================================
  assert('4. No queda la antigua grilla de cuatro cards grandes fuera del hero', () => {
    const allStatsContainers = Array.from(document.querySelectorAll('#stat-active-crops, #stat-total-plants, #stat-recent-waterings, #stat-diary-photos'));
    const heroCard = document.getElementById('main-crop-hero-card')!;

    for (const el of allStatsContainers) {
      if (!heroCard.contains(el)) {
        throw new Error(`Se encontró ${el.id} fuera de main-crop-hero-card`);
      }
    }
  });

  // =========================================================================
  // Caso 5: Los valores calculados son exactos según las métricas esperadas
  // =========================================================================
  assert('5. Los valores calculados son exactos según las métricas esperadas', () => {
    const activeEl = document.getElementById('stat-active-crops')!;
    const plantsEl = document.getElementById('stat-total-plants')!;
    const waterEl = document.getElementById('stat-recent-waterings')!;
    const photosEl = document.getElementById('stat-diary-photos')!;

    // 2 cultivos activos
    if (!activeEl.textContent?.includes('2')) {
      throw new Error(`stat-active-crops debió mostrar 2, contenido: ${activeEl.textContent}`);
    }
    // 4 + 4 = 8 plantas totales
    if (!plantsEl.textContent?.includes('8')) {
      throw new Error(`stat-total-plants debió mostrar 8, contenido: ${plantsEl.textContent}`);
    }
    // 2 riegos recientes
    if (!waterEl.textContent?.includes('2')) {
      throw new Error(`stat-recent-waterings debió mostrar 2, contenido: ${waterEl.textContent}`);
    }
    // 3 fotos
    if (!photosEl.textContent?.includes('3')) {
      throw new Error(`stat-diary-photos debió mostrar 3, contenido: ${photosEl.textContent}`);
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO PRUEBAS DE DASHBOARD MINI-STATS: ${passed} pasadas, ${failed} fallidas de 5`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} pruebas de dashboard mini-stats fallaron.`);
  }

  return { passed, failed, skipped };
}

if (process.argv[1]?.endsWith('dashboard_mini_stats.test.ts')) {
  runDashboardMiniStatsTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
