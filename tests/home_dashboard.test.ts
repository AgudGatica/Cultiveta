/**
 * tests/home_dashboard.test.ts
 *
 * SUITE: INICIO ESTILO "JARDÍN" Y CULTIVOS (TERMINADOS + COSECHAS)
 *
 * Lógica pura (src/utils/cropCardInfo.ts y appRoutes):
 *  1-4. "Semana X · Día Y" con inicio conocido (incluido el cambio de semana) y "Día N de <etapa>" sin él.
 *  5. Etiqueta de genética: una, varias o ninguna.
 *  6-7. Destino de "volver" y botón resaltado del detalle según el cultivo esté activo o terminado.
 *  8. "Para hoy": solo pendientes de hoy o atrasadas.
 *  9. Terminados con su cosecha: peso, días, orden y sin activos.
 *  10. Última foto subida (sin las de la cola local).
 *  11. /cosechas lleva a Cultivos.
 *
 * Inicio (DashboardOverview):
 *  12. Saludo con el nombre.
 *  13. Cuatro números: cultivos activos, plantas, racha y nivel.
 *  14. Una tarjeta por cultivo activo (los terminados no aparecen) con genética, etapa, semana/día y plantas.
 *  15. Tocar la tarjeta abre el cultivo.
 *  16. Ya no están los bloques viejos (cultivo principal, atención, mini-números).
 *  17. "Para hoy" muestra 4 tareas y "Ver N más" despliega el resto.
 *  18. Marcar un riego como hecho abre el formulario de riego y la tarea sale de la lista.
 *  19. Sin cultivos activos: "Todo al día" y el estado vacío con "Creá tu primer cultivo".
 *
 * Cultivos (FinishedCropsView):
 *  20. Muestra terminados y cosechas sin cultivo, con totales; tocar abre el detalle.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, CultivationTask, Harvest, PhotoRecord, Watering } from '../src/types';
import { addDays, buildCultivationStageSchedule, buildUpdatedStagesTimeline, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import {
  getCropDayLabel,
  getDetailBackTarget,
  getGeneticsLabel,
  getNavHighlight,
  latestUploadedPhotoUrl,
  listFinishedCrops,
  selectTodayTasks,
} from '../src/utils/cropCardInfo';
import { parseAppRoute, pathForView } from '../src/appRoutes';
import { computeProgress } from '../src/utils/growerProgress';
import { DashboardOverview } from '../src/components/dashboard/DashboardOverview';
import { FinishedCropsView } from '../src/components/cultivations/FinishedCropsView';

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASÓ] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const today = getLocalTodayDateOnly();

function crop(partial: Partial<Cultivation> & { id: string }): Cultivation {
  return {
    userId: 'user_1',
    name: partial.id,
    type: 'Indoor',
    plantCount: 1,
    startDate: addDays(today, -20),
    currentStage: 'Vegetativo',
    stageStartDate: addDays(today, -5),
    substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
    status: 'ESTABLE',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
    ...partial,
  };
}

function knownStartCrop(id: string, daysAgo: number): Cultivation {
  const start = addDays(today, -daysAgo);
  return crop({
    id,
    startDate: start,
    currentStage: 'Plántula',
    stageStartDate: start,
    cycleStartKnown: true,
    timelineHistoryMode: 'known_from_start',
    stagesTimeline: buildUpdatedStagesTimeline({ currentStage: 'Plántula', stageStartDate: start, priorDates: { germinacion: start } }),
  });
}

async function run() {
  console.log('\n================================================================');
  console.log('   INICIO ESTILO JARDÍN Y CULTIVOS TERMINADOS');
  console.log('================================================================\n');

  // ───────────── Lógica pura ─────────────
  await check('1. Inicio conocido hace 10 días → "Semana 2 · Día 11"', () => {
    const c = knownStartCrop('k10', 10);
    const label = getCropDayLabel(c, [], today);
    assert(label === 'Semana 2 · Día 11', `recibido: ${label}`);
  });

  await check('2. Día 7 es la semana 1 y el día 8 la semana 2', () => {
    const d7 = getCropDayLabel(knownStartCrop('k6', 6), [], today);
    const d8 = getCropDayLabel(knownStartCrop('k7', 7), [], today);
    assert(d7 === 'Semana 1 · Día 7', `día 7: ${d7}`);
    assert(d8 === 'Semana 2 · Día 8', `día 8: ${d8}`);
  });

  await check('3. Sin inicio conocido → "Día N de Floración" con los días de la etapa', () => {
    const flowerStart = addDays(today, -12);
    const c = crop({
      id: 'partial',
      startDate: flowerStart,
      currentStage: 'Floración',
      stageStartDate: flowerStart,
      floweringStartDate: flowerStart,
      cycleStartKnown: false,
      timelineHistoryMode: 'unknown_before_current_stage',
      stagesTimeline: buildUpdatedStagesTimeline({ currentStage: 'Floración', stageStartDate: flowerStart, floweringStartDate: flowerStart }),
    });
    const schedule = buildCultivationStageSchedule(c, []);
    const label = getCropDayLabel(c, [], today);
    assert(label === `Día ${schedule.activeStageElapsedDays} de Floración`, `recibido: ${label}`);
    assert(!label.includes('Semana'), 'no debe inventar la semana del ciclo');
  });

  await check('4. El texto nunca muestra null ni NaN', () => {
    const label = getCropDayLabel(crop({ id: 'bare', stagesTimeline: undefined }), [], today);
    assert(!/null|NaN|undefined/.test(label), `recibido: ${label}`);
  });

  await check('5. Genética: nombre, "N genéticas" o null', () => {
    assert(getGeneticsLabel({ geneticsName: 'Gelato 33' }) === 'Gelato 33', 'una genética');
    assert(
      getGeneticsLabel({ geneticsList: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }) === '2 genéticas',
      'varias genéticas'
    );
    assert(getGeneticsLabel({ geneticsList: [{ id: 'a', name: 'Solo' }] }) === 'Solo', 'lista de una');
    assert(getGeneticsLabel({}) === null, 'sin dato');
  });

  await check('6. Volver: activo → Inicio; terminado o cosechado → Cultivos', () => {
    assert(getDetailBackTarget(crop({ id: 'a' })) === 'dashboard', 'activo');
    assert(getDetailBackTarget(crop({ id: 'f', isFinished: true })) === 'cultivations', 'terminado');
    assert(getDetailBackTarget(crop({ id: 'c', status: 'Cosechado' })) === 'cultivations', 'cosechado');
    assert(getDetailBackTarget(null) === 'dashboard', 'sin cultivo');
  });

  await check('7. Botón resaltado: detalle activo → Inicio, terminado → Cultivos, resto igual', () => {
    assert(getNavHighlight('cultivation_detail', crop({ id: 'a' })) === 'dashboard', 'activo');
    assert(getNavHighlight('cultivation_detail', crop({ id: 'f', isFinished: true })) === 'cultivations', 'terminado');
    assert(getNavHighlight('profile', null) === 'profile', 'otra pantalla');
  });

  await check('8. "Para hoy" deja solo pendientes de hoy o atrasadas', () => {
    const t = (id: string, urgency: CultivationTask['urgency'], isCompleted = false): CultivationTask => ({
      id,
      cultivationId: 'c',
      cultivationName: 'C',
      type: 'watering',
      title: id,
      description: '',
      dueDate: today,
      urgency,
      priority: 'high',
      isCompleted,
      categoryLabel: '',
    });
    const ids = selectTodayTasks([t('atrasada', 'overdue'), t('hoy', 'today'), t('hecha', 'today', true), t('manana', 'tomorrow'), t('luego', 'upcoming')]).map((x) => x.id);
    assert(ids.join(',') === 'atrasada,hoy', `recibido: ${ids.join(',')}`);
  });

  await check('9. Terminados con su cosecha: peso, días y orden del más reciente', () => {
    const harvests: Harvest[] = [
      {
        id: 'h1', userId: 'user_1', cultivationId: 'old', cultivationName: 'Old', startDate: '2026-01-01', harvestDate: '2026-04-01',
        totalDays: 90, plantCount: 2, finalDryWeightGrams: 120, gramsPerPlant: 60, rating1To5: 4, createdAt: '',
      },
    ];
    const list = listFinishedCrops(
      [
        crop({ id: 'old', isFinished: true, startDate: '2026-01-01' }),
        crop({ id: 'new', isFinished: true, startDate: '2026-05-01', harvestDate: '2026-08-01', finalWeight: 80 }),
        crop({ id: 'active' }),
      ],
      harvests
    );
    assert(list.length === 2, `esperaba 2 terminados, hubo ${list.length}`);
    assert(list[0].crop.id === 'new' && list[1].crop.id === 'old', `orden: ${list.map((x) => x.crop.id).join(',')}`);
    assert(list[1].dryWeightGrams === 120 && list[1].totalDays === 90 && list[1].rating === 4, 'datos de la cosecha');
    assert(list[0].dryWeightGrams === 80 && list[0].harvest === null, 'peso final del cultivo sin cosecha');
    assert(list[0].totalDays === 92, `días calculados por fechas: ${list[0].totalDays}`);
  });

  await check('10. Última foto subida, sin las que siguen en la cola local', () => {
    const photo = (id: string, date: string, extra: Partial<PhotoRecord> = {}): PhotoRecord => ({
      id, userId: 'user_1', cultivationId: 'c1', url: `https://example.com/${id}.jpg`, date, dayOfCultivation: 1,
      stage: 'Vegetativo', category: 'planta completa', createdAt: '', ...extra,
    });
    const photos = [
      photo('vieja', '2026-01-01'),
      photo('nueva', '2026-02-01'),
      photo('pendiente', '2026-03-01', { isPendingSync: true }),
      photo('local', '2026-03-02', { url: 'blob:local' }),
      photo('otra', '2026-04-01', { cultivationId: 'c2' }),
    ];
    assert(latestUploadedPhotoUrl(photos, 'c1') === 'https://example.com/nueva.jpg', `recibido: ${latestUploadedPhotoUrl(photos, 'c1')}`);
    assert(latestUploadedPhotoUrl(photos, 'c3') === null, 'sin fotos');
  });

  await check('11. /cosechas abre Cultivos y "harvests" apunta a /cultivos', () => {
    assert(parseAppRoute('/cosechas').view === 'cultivations', 'ruta vieja');
    assert(parseAppRoute('/cosechas/').view === 'cultivations', 'con barra final');
    assert(pathForView('harvests') === '/cultivos', 'enlaces internos viejos');
    assert(parseAppRoute('/cultivos').view === 'cultivations', 'Cultivos');
  });

  // ───────────── Inicio ─────────────
  const multi = crop({
    id: 'multi',
    name: 'Carpa grande',
    plantCount: 3,
    geneticsList: [{ id: 'g1', name: 'Gelato' }, { id: 'g2', name: 'Zkittlez' }],
  });
  const single = { ...knownStartCrop('single', 10), name: 'Purple Punch', geneticsName: 'Purple Punch', plantCount: 4 };
  const finished = crop({ id: 'done', name: 'Cultivo terminado', isFinished: true, plantCount: 9 });
  const waterings: Watering[] = [
    { id: 'w1', userId: 'user_1', cultivationId: 'single', date: today, volumeLiters: 2, createdAt: '' },
    { id: 'w2', userId: 'user_1', cultivationId: 'multi', date: today, volumeLiters: 2, createdAt: '' },
  ];
  const progress = computeProgress(
    {
      cultivations: [multi, single, finished],
      waterings,
      environmentRecords: [],
      photos: [],
      diaryEntries: [],
      harvests: [],
      fertilizationSchedules: [],
      photoAnalyses: [],
    },
    { today }
  );

  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const selected: string[] = [];

  await act(async () => {
    root.render(
      React.createElement(DashboardOverview, {
        cultivations: [multi, single, finished],
        waterings,
        envRecords: [],
        photos: [],
        userId: 'user_home',
        userProfile: { uid: 'user_home', email: null, displayName: 'Agustín Gatica', createdAt: '' },
        progress,
        onSelectCultivation: (c: Cultivation) => selected.push(c.id),
        onCreateCultivationClick: () => {},
        onOpenWateringModal: () => {},
      })
    );
  });

  await check('12. Saludo con el nombre', () => {
    const h1 = container.querySelector('h1')?.textContent || '';
    assert(/^(Buen día|Buenas tardes|Buenas noches), Agustín$/.test(h1), `recibido: ${h1}`);
  });

  await check('13. Cuatro números: 2 cultivos activos, 7 plantas, racha y nivel', () => {
    const num = (id: string) => container.querySelector(`#${id} b`)?.textContent;
    assert(num('home-stat-crops') === '2', `cultivos: ${num('home-stat-crops')}`);
    assert(num('home-stat-plants') === '7', `plantas: ${num('home-stat-plants')}`);
    assert(num('home-stat-streak') === String(progress.stats.streak), `racha: ${num('home-stat-streak')}`);
    assert(progress.stats.streak === 1, 'el riego de hoy da racha 1');
    assert(num('home-stat-level') === String(progress.level.level), `nivel: ${num('home-stat-level')}`);
  });

  await check('14. Una tarjeta por cultivo activo, con genética, etapa, semana/día y plantas', () => {
    const cards = Array.from(container.querySelectorAll('[data-crop-card]'));
    assert(cards.length === 2, `tarjetas: ${cards.length}`);
    assert(!container.querySelector('[data-crop-card="done"]'), 'el terminado no aparece');
    const multiText = container.querySelector('[data-crop-card="multi"]')?.textContent || '';
    assert(multiText.includes('Carpa grande') && multiText.includes('2 genéticas') && multiText.includes('3 plantas'), multiText);
    assert(multiText.includes('Vegetativo'), 'chip de etapa');
    const singleText = container.querySelector('[data-crop-card="single"]')?.textContent || '';
    assert(singleText.includes('Semana 2 · Día 11') && singleText.includes('4 plantas'), singleText);
  });

  await check('15. Tocar la tarjeta abre el cultivo', async () => {
    await act(async () => {
      (container.querySelector('[data-crop-card="multi"]') as HTMLButtonElement).click();
    });
    assert(selected.includes('multi'), `seleccionados: ${selected.join(',')}`);
  });

  await check('16. Ya no están los bloques viejos del Inicio', () => {
    for (const id of ['main-crop-hero-card', 'home-attention-block', 'stat-recent-waterings', 'stat-diary-photos', 'home-irrigation-forecast', 'dashboard-upcoming-task-widget']) {
      assert(!container.querySelector(`#${id}`), `sigue #${id}`);
    }
    assert(container.querySelector('#home-today-card'), 'falta "Para hoy"');
  });

  await act(async () => root.unmount());

  // "Para hoy" con 6 cultivos sin riegos: 6 tareas de riego para hoy
  const thirsty = Array.from({ length: 6 }, (_, i) => crop({ id: `sed_${i}`, name: `Sed ${i}` }));
  const opened: string[] = [];
  const root2 = createRoot(container);
  await act(async () => {
    root2.render(
      React.createElement(DashboardOverview, {
        cultivations: thirsty,
        waterings: [],
        envRecords: [],
        photos: [],
        userId: 'user_tasks',
        onSelectCultivation: () => {},
        onCreateCultivationClick: () => {},
        onOpenWateringModal: (c?: Cultivation) => opened.push(c?.id || ''),
      })
    );
  });

  await check('17. "Para hoy" muestra 4 tareas y "Ver N más" despliega el resto', async () => {
    const rows = () => container.querySelectorAll('#home-today-card li[data-task-id]').length;
    assert(rows() === 4, `filas visibles: ${rows()}`);
    const toggle = container.querySelector('#home-today-toggle-btn') as HTMLButtonElement | null;
    assert(toggle, 'falta "Ver N más"');
    const total = selectTodayTasks(
      (await import('../src/services/taskService')).taskService.getTasksForDashboard(thirsty, [], [], 'user_tasks')
    ).length;
    assert(toggle.textContent === `Ver ${total - 4} más`, `texto: ${toggle.textContent}`);
    await act(async () => toggle.click());
    assert(rows() === total, `después de desplegar: ${rows()} de ${total}`);
  });

  await check('18. Marcar un riego como hecho abre el formulario y la tarea sale de la lista', async () => {
    const row = container.querySelector('#home-today-card li[data-task-id^="watering_sed_0_"]') as HTMLElement | null;
    assert(row, 'falta la tarea de riego');
    const before = container.querySelectorAll('#home-today-card li[data-task-id]').length;
    await act(async () => {
      (row.querySelector('button[aria-label^="Marcar hecha"]') as HTMLButtonElement).click();
    });
    assert(opened.includes('sed_0'), `formularios abiertos: ${opened.join(',')}`);
    const after = container.querySelectorAll('#home-today-card li[data-task-id]').length;
    assert(after === before - 1, `antes ${before}, después ${after}`);
    assert(!container.querySelector('li[data-task-id^="watering_sed_0_"]'), 'la tarea sigue en la lista');
  });

  await act(async () => root2.unmount());

  const root3 = createRoot(container);
  let created = 0;
  await act(async () => {
    root3.render(
      React.createElement(DashboardOverview, {
        cultivations: [finished],
        waterings: [],
        envRecords: [],
        photos: [],
        userId: 'user_empty',
        onSelectCultivation: () => {},
        onCreateCultivationClick: () => {
          created++;
        },
        onOpenWateringModal: () => {},
      })
    );
  });

  await check('19. Sin cultivos activos: "Todo al día" y estado vacío para crear el primero', async () => {
    const today = container.querySelector('#home-today-card');
    assert(today?.getAttribute('data-state') === 'empty' && today.textContent?.includes('Todo al día'), today?.textContent || 'sin tarjeta');
    const empty = container.querySelector('#home-empty-crops');
    assert(empty, 'falta el estado vacío');
    const btn = Array.from(empty.querySelectorAll('button')).find((b) => b.textContent?.includes('Creá tu primer cultivo'));
    assert(btn, 'falta el botón');
    await act(async () => btn.click());
    assert(created === 1, 'no abrió el formulario de cultivo');
  });

  await act(async () => root3.unmount());

  // ───────────── Cultivos (terminados + cosechas) ─────────────
  const root4 = createRoot(container);
  const openedCrops: string[] = [];
  const harvests: Harvest[] = [
    {
      id: 'h_done', userId: 'user_1', cultivationId: 'done', cultivationName: 'Cultivo terminado', startDate: '2026-01-01',
      harvestDate: '2026-04-01', totalDays: 90, plantCount: 2, finalDryWeightGrams: 100, gramsPerPlant: 50, rating1To5: 5, createdAt: '',
    },
    {
      id: 'h_orphan', userId: 'user_1', cultivationId: 'borrado', cultivationName: 'Cultivo borrado', startDate: '2025-06-01',
      harvestDate: '2025-09-01', totalDays: 92, plantCount: 2, finalDryWeightGrams: 60, gramsPerPlant: 30, rating1To5: 3, createdAt: '',
    },
  ];
  await act(async () => {
    root4.render(
      React.createElement(FinishedCropsView, {
        cultivations: [finished, multi],
        harvests,
        photos: [],
        userId: 'user_1',
        onOpenCultivation: (c: Cultivation) => openedCrops.push(c.id),
      })
    );
  });

  await check('20. Cultivos: terminados y cosechas sin cultivo, con totales; tocar abre el detalle', async () => {
    const cards = Array.from(container.querySelectorAll('[data-finished-crop]')).map((el) => el.getAttribute('data-finished-crop'));
    assert(cards.join(',') === 'done,borrado', `tarjetas: ${cards.join(',')}`);
    const text = container.textContent || '';
    assert(text.includes('160 g') && text.includes('Total cosechado'), 'total cosechado');
    assert(text.includes('90 días') && text.includes('100 g'), 'días y peso de la tarjeta');
    assert(!container.querySelector('[data-finished-crop="multi"]'), 'un activo apareció en Cultivos');
    await act(async () => {
      (container.querySelector('[data-finished-crop="done"] button') as HTMLButtonElement).click();
    });
    assert(openedCrops.join(',') === 'done', `abiertos: ${openedCrops.join(',')}`);
    assert(container.querySelectorAll('[data-finished-crop] button').length >= 4, 'faltan los botones de ficha');
  });

  await act(async () => root4.unmount());

  console.log('\n================================================================');
  console.log(` RESULTADO INICIO Y CULTIVOS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en home_dashboard:', err);
  process.exit(1);
});
