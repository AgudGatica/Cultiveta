/**
 * tests/plant_timeline.test.ts
 *
 * SUITE: LÍNEA DE TIEMPO CON FORMA DE PLANTA (src/utils/plantTimeline.ts y PlantTimeline)
 *
 * 1. Riego importante: con nutrientes, pH/EC u observaciones; uno solo con litros no lo es.
 * 2. Copa según la etapa: plántula, vegetativo, prefloración, floración y cosecha.
 * 3. Eventos del más reciente al más viejo; fotos y notas siempre; solo del cultivo y sin fechas futuras.
 * 4. Riegos comunes agrupados por semana con cantidad y litros; los importantes van solos.
 * 5. Cambios de etapa con fecha real (sin el arranque, que es la maceta).
 * 6. Días y semana de cada evento y días hasta el anterior (largo del tallo).
 * 7. Sin inicio conocido y datos anteriores: el tallo arranca en el dato más viejo.
 * 8. Tamaño de la planta: un cultivo nuevo es chico; uno terminado está completo.
 * 9. Cultivo sin registros: sin eventos, día 1.
 * 10. El tramo de tallo crece con los días y tiene tope.
 * 11. Render: copa, eventos en orden, tarjetas de foto y nota, maceta con la fecha de inicio.
 * 12. Render: con más de 20 registros muestra 20 y "Ver anteriores".
 * 13. Etapa vigente en una fecha y día dentro de la etapa.
 * 14. Cada registro trae la etapa y el día de etapa de ese momento.
 * 15. La foto va grande al centro con descripción, fecha y etapa.
 * 16. La nota va al costado con su texto, fecha y etapa.
 * 17. Hojas alternadas y una hoja grande para la mascota cada 3 tarjetas al costado.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, DiaryEntry, PhotoRecord, Watering } from '../src/types';
import { addDays, buildUpdatedStagesTimeline, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import { buildPlantTimeline, crownForStage, isImportantWatering, stageAtDate, stemSegmentPx } from '../src/utils/plantTimeline';
import { PlantTimeline } from '../src/components/cultivations/PlantTimeline';

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
const ago = (n: number) => addDays(today, -n);

function crop(partial: Partial<Cultivation> & { id: string }): Cultivation {
  return {
    userId: 'u',
    name: partial.id,
    type: 'Indoor',
    plantCount: 1,
    startDate: ago(30),
    currentStage: 'Vegetativo',
    stageStartDate: ago(10),
    cycleStartKnown: true,
    substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
    status: 'ESTABLE',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const w = (id: string, date: string, extra: Partial<Watering> = {}): Watering => ({
  id, userId: 'u', cultivationId: 'c1', date, volumeLiters: 2, createdAt: '', ...extra,
});
const note = (id: string, date: string, extra: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id, userId: 'u', cultivationId: 'c1', date, content: `Contenido ${id}`, createdAt: '', updatedAt: '', ...extra,
});
const photo = (id: string, date: string, extra: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id, userId: 'u', cultivationId: 'c1', url: `https://example.com/${id}.jpg`, date, dayOfCultivation: 1,
  stage: 'Vegetativo', category: 'planta completa', createdAt: '', ...extra,
});

async function run() {
  console.log('\n================================================================');
  console.log('   LÍNEA DE TIEMPO CON FORMA DE PLANTA');
  console.log('================================================================\n');

  await check('1. Riego importante: nutrientes, pH/EC u observaciones; solo litros no', () => {
    assert(!isImportantWatering(w('a', today)), 'solo litros');
    assert(isImportantWatering(w('b', today, { phIn: 6.2 })), 'pH');
    assert(isImportantWatering(w('c', today, { ecRunoff: 1.4 })), 'EC de drenaje');
    assert(isImportantWatering(w('d', today, { productsUsed: [{ name: 'Bio Grow', dosageMlPerL: 2, totalAmountMl: 4 } as any] })), 'nutrientes');
    assert(isImportantWatering(w('e', today, { observations: 'Hojas caídas' })), 'observaciones');
    assert(!isImportantWatering(w('f', today, { observations: '   ' })), 'observación vacía');
  });

  await check('2. Copa según la etapa', () => {
    assert(crownForStage('Germinación', false) === 'seedling', 'germinación');
    assert(crownForStage('Plántula', false) === 'seedling', 'plántula');
    assert(crownForStage('Vegetativo', false) === 'vegetative', 'vegetativo');
    assert(crownForStage('Prefloración', false) === 'preflower', 'prefloración');
    assert(crownForStage('Floración', false) === 'flower', 'floración');
    assert(crownForStage('Maduración', false) === 'flower', 'maduración');
    assert(crownForStage('Secado', false) === 'harvest', 'secado');
    assert(crownForStage('Floración', true) === 'harvest', 'terminado');
  });

  const c1 = crop({ id: 'c1' });
  const data = {
    waterings: [
      w('w_plain1', ago(20)),
      w('w_plain2', ago(19), { volumeLiters: 1.5 }),
      w('w_ph', ago(12), { phIn: 6.1, ecIn: 1.2 }),
      w('w_other_crop', ago(5), { cultivationId: 'c2', phIn: 6 }),
      w('w_future', addDays(today, 3), { phIn: 6 }),
    ],
    diaryEntries: [note('n1', ago(8), { title: 'Poda baja' })],
    photos: [photo('p1', ago(2), { caption: 'Así viene' })],
  };
  const model = buildPlantTimeline(c1, data, [], today);

  await check('3. Más reciente arriba; fotos y notas; solo este cultivo y sin futuro', () => {
    const ids = model.events.map((e) => e.id);
    assert(ids[0] === 'photo_p1', `primero: ${ids[0]}`);
    assert(ids.includes('note_n1'), 'falta la nota');
    assert(!ids.some((id) => id.includes('other_crop') || id.includes('future')), `ids: ${ids.join(',')}`);
    const dates = model.events.map((e) => e.date);
    assert(dates.every((d, i) => i === 0 || dates[i - 1] >= d), 'no está ordenado del más reciente al más viejo');
  });

  await check('4. Riegos comunes agrupados por semana; los importantes solos', () => {
    const group = model.events.find((e) => e.kind === 'watering_group');
    assert(group && group.count === 2 && group.liters === 3.5, `grupo: ${JSON.stringify(group)}`);
    assert(group.title === '2 riegos' && group.detail === '3.5 L en total', `${group.title} / ${group.detail}`);
    const important = model.events.find((e) => e.id === 'watering_w_ph');
    assert(important && important.detail?.includes('pH 6.1') && important.detail.includes('EC 1.2'), important?.detail || 'falta');
  });

  await check('5. Cambios de etapa con fecha real, sin el arranque', () => {
    const start = ago(40);
    const flower = ago(6);
    const c = crop({
      id: 'c1',
      startDate: start,
      currentStage: 'Floración',
      stageStartDate: flower,
      floweringStartDate: flower,
      stagesTimeline: buildUpdatedStagesTimeline({
        currentStage: 'Floración',
        stageStartDate: flower,
        floweringStartDate: flower,
        priorDates: { germinacion: start, vegetativo: ago(25) },
      }),
    });
    const m = buildPlantTimeline(c, { waterings: [], diaryEntries: [], photos: [] }, [], today);
    const stages = m.events.filter((e) => e.kind === 'stage').map((e) => e.title);
    assert(stages.includes('Empieza Floración') && stages.includes('Empieza Vegetativo'), stages.join(','));
    assert(!stages.some((t) => t.includes('Germinación')), 'el arranque no es un evento');
    assert(m.crown === 'flower', `copa: ${m.crown}`);
  });

  await check('6. Día, semana y días hasta el anterior', () => {
    const p = model.events.find((e) => e.id === 'photo_p1')!;
    assert(p.dayNumber === 29 && p.week === 5, `día ${p.dayNumber}, semana ${p.week}`);
    assert(p.gapDaysToOlder === 6, `separación con la nota: ${p.gapDaysToOlder}`);
    // El más viejo es el grupo de riegos comunes, fechado en su último riego (hace 19 días)
    const oldest = model.events[model.events.length - 1];
    assert(oldest.kind === 'watering_group' && oldest.date === ago(19), `más viejo: ${oldest.id} ${oldest.date}`);
    assert(oldest.gapDaysToOlder === 11, `del primer registro al inicio: ${oldest.gapDaysToOlder}`);
    assert(model.gapDaysToToday === 2, `de la última foto a hoy: ${model.gapDaysToToday}`);
  });

  await check('7. Sin inicio conocido y datos anteriores: arranca en el dato más viejo', () => {
    const c = crop({ id: 'c1', startDate: ago(5), cycleStartKnown: false, stagesTimeline: undefined });
    const m = buildPlantTimeline(c, { waterings: [w('old', ago(15), { phIn: 6 })], diaryEntries: [], photos: [] }, [], today);
    assert(m.startDate === ago(15), `inicio: ${m.startDate}`);
    assert(m.isStartKnown === false, 'debería marcarse como primer registro');
    assert(m.events[0].dayNumber === 1, `día del primer dato: ${m.events[0].dayNumber}`);
  });

  await check('8. Un cultivo nuevo es chico; uno terminado está completo', () => {
    const fresh = buildPlantTimeline(crop({ id: 'c1', startDate: today, currentStage: 'Germinación' }), { waterings: [], diaryEntries: [], photos: [] }, [], today);
    assert(fresh.growth < 0.1 && fresh.crown === 'seedling', `nuevo: ${fresh.growth} ${fresh.crown}`);
    const done = buildPlantTimeline(crop({ id: 'c1', isFinished: true, harvestDate: ago(1) }), { waterings: [], diaryEntries: [], photos: [] }, [], today);
    assert(done.growth === 1 && done.crown === 'harvest', `terminado: ${done.growth} ${done.crown}`);
    assert(done.totalDays === 30, `días hasta la cosecha: ${done.totalDays}`);
  });

  await check('9. Sin registros: sin eventos y día 1', () => {
    const m = buildPlantTimeline(crop({ id: 'empty', startDate: today }), { waterings: [], diaryEntries: [], photos: [] }, [], today);
    assert(m.events.length === 0 && m.totalDays === 1, `${m.events.length} eventos, día ${m.totalDays}`);
  });

  await check('10. El tramo de tallo crece con los días y tiene tope', () => {
    assert(stemSegmentPx(0) < stemSegmentPx(3) && stemSegmentPx(3) < stemSegmentPx(10), 'crece');
    assert(stemSegmentPx(100) === 120 && stemSegmentPx(-5) === stemSegmentPx(0), 'tope y piso');
  });

  // ───────────── Render ─────────────
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PlantTimeline, { cultivation: c1, ...data, userId: 'u' }));
  });

  await check('11. Copa, eventos en orden, tarjetas de foto y nota y maceta con el inicio', () => {
    const section = container.querySelector('#plant-timeline');
    assert(section, 'falta la sección');
    assert(section.querySelector('[data-crown="vegetative"]'), 'copa de vegetativo');
    const order = Array.from(section.querySelectorAll('[data-event-id]')).map((el) => el.getAttribute('data-event-id'));
    assert(order.join(',') === model.events.map((e) => e.id).join(','), `orden: ${order.join(',')}`);
    assert(section.querySelector('[data-event-kind="photo"]') && section.querySelector('[data-event-kind="note"]'), 'tarjetas');
    assert(section.textContent?.includes('Poda baja'), 'título de la nota');
    assert(section.querySelector('svg[aria-label="Maceta: inicio del cultivo"]'), 'maceta');
    assert(section.textContent?.includes('Inicio ·'), 'fecha de inicio');
  });

  await act(async () => root.unmount());

  const many = Array.from({ length: 25 }, (_, i) => note(`m${i}`, ago(25 - i)));
  const root2 = createRoot(container);
  await act(async () => {
    root2.render(
      React.createElement(PlantTimeline, { cultivation: c1, waterings: [], diaryEntries: many, photos: [], userId: 'u' })
    );
  });

  await check('12. Con más de 20 registros muestra 20 y "Ver anteriores"', async () => {
    const count = () => container.querySelectorAll('[data-event-id]').length;
    assert(count() === 20, `visibles: ${count()}`);
    const btn = container.querySelector('#plant-timeline-more-btn') as HTMLButtonElement | null;
    assert(btn && btn.textContent?.includes('Ver anteriores (5)'), btn?.textContent || 'falta el botón');
    await act(async () => btn.click());
    assert(count() === 25, `después: ${count()}`);
  });

  await act(async () => root2.unmount());

  // ───────────── Etapa de cada registro, foto centrada, nota al costado y lugar de la mascota ─────────────
  await check('13. Etapa vigente y día dentro de la etapa', () => {
    const stages = [
      { name: 'Germinación', startDate: ago(40) },
      { name: 'Vegetativo', startDate: ago(30) },
      { name: 'Floración', startDate: ago(10) },
      { name: 'Plántula', isUnknown: true },
    ];
    const veg = stageAtDate(stages, ago(22));
    assert(veg?.name === 'Vegetativo' && veg.day === 9, `vegetativo: ${JSON.stringify(veg)}`);
    const flower = stageAtDate(stages, ago(10));
    assert(flower?.name === 'Floración' && flower.day === 1, `primer día de flora: ${JSON.stringify(flower)}`);
    assert(stageAtDate(stages, ago(50)) === null, 'antes de la primera etapa no hay dato');
    const recorded = stageAtDate(stages, ago(5), 'Floración');
    assert(recorded?.name === 'Floración' && recorded.day === 6, `etapa guardada en la foto: ${JSON.stringify(recorded)}`);
    const unknownDay = stageAtDate(stages, ago(5), 'Prefloración');
    assert(unknownDay?.name === 'Prefloración' && unknownDay.day === undefined, 'etapa guardada sin fecha conocida');
  });

  const start = ago(40);
  const flowerStart = ago(10);
  const c2 = crop({
    id: 'c1',
    startDate: start,
    currentStage: 'Floración',
    stageStartDate: flowerStart,
    floweringStartDate: flowerStart,
    stagesTimeline: buildUpdatedStagesTimeline({
      currentStage: 'Floración',
      stageStartDate: flowerStart,
      floweringStartDate: flowerStart,
      priorDates: { germinacion: start, vegetativo: ago(30) },
    }),
  });
  const rich = {
    waterings: [w('wr1', ago(9), { phIn: 6 }), w('wr2', ago(7), { phIn: 6.1 }), w('wr3', ago(6), { phIn: 6.2 })],
    diaryEntries: [note('nr1', ago(22), { content: 'Hojas de abajo amarillas' })],
    photos: [photo('pr1', ago(4), { caption: 'Carencia de calcio', stage: 'Floración' })],
  };

  await check('14. Cada registro trae la etapa y el día de etapa de ese momento', () => {
    const m = buildPlantTimeline(c2, rich, [], today);
    const p = m.events.find((e) => e.id === 'photo_pr1')!;
    assert(p.stageName === 'Floración' && p.stageDay === 7, `foto: ${p.stageName} ${p.stageDay}`);
    const n = m.events.find((e) => e.id === 'note_nr1')!;
    assert(n.stageName === 'Vegetativo' && n.stageDay === 9, `nota: ${n.stageName} ${n.stageDay}`);
  });

  const root3 = createRoot(container);
  await act(async () => {
    root3.render(React.createElement(PlantTimeline, { cultivation: c2, ...rich, userId: 'u' }));
  });

  await check('15. La foto va grande al centro con su descripción, fecha y etapa', () => {
    const row = container.querySelector('[data-event-id="photo_pr1"]');
    assert(row?.getAttribute('data-layout') === 'center', `ubicación: ${row?.getAttribute('data-layout')}`);
    const text = row.textContent || '';
    assert(text.includes('“Carencia de calcio”'), `descripción: ${text}`);
    assert(text.includes('Día 37') && text.includes('Floración, día 7'), `fecha y etapa: ${text}`);
  });

  await check('16. La nota va al costado con su texto, fecha y etapa', () => {
    const row = container.querySelector('[data-event-id="note_nr1"]');
    assert(row && ['left', 'right'].includes(row.getAttribute('data-layout') || ''), 'la nota no está al costado');
    const card = row.querySelector('[data-event-kind="note"]');
    const text = card?.textContent || '';
    assert(text.includes('Nota') && text.includes('Hojas de abajo amarillas'), `texto: ${text}`);
    assert(text.includes('Vegetativo, día 9') && text.includes('Día 19'), `fecha y etapa: ${text}`);
    assert(!text.includes('Nota del diario'), 'no repite el título genérico');
  });

  await check('17. Hojas laterales alternadas y una hoja grande para la mascota cada 3', () => {
    // 3 riegos, 1 nota y 2 cambios de etapa van al costado; la foto va al centro
    const sides = Array.from(container.querySelectorAll('li[data-layout="left"], li[data-layout="right"]'));
    assert(sides.length === 6, `tarjetas al costado: ${sides.length}`);
    const layouts = sides.map((li) => li.getAttribute('data-layout'));
    assert(layouts.join(',') === 'right,left,right,left,right,left', `lados: ${layouts.join(',')}`);
    const spots = Array.from(container.querySelectorAll('[data-mascot-spot]'));
    assert(spots.length === 2, `lugares para la mascota: ${spots.length}`);
    assert(sides[2].contains(spots[0]) && sides[5].contains(spots[1]), 'la hoja grande va en la 3.ª y la 6.ª tarjeta');
  });

  await act(async () => root3.unmount());

  console.log('\n================================================================');
  console.log(` RESULTADO LÍNEA DE TIEMPO DE PLANTA: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en plant_timeline:', err);
  process.exit(1);
});
