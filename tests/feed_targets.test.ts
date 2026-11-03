/**
 * tests/feed_targets.test.ts
 *
 * SUITE: pH Y EC RECOMENDADOS PARA EL PRÓXIMO RIEGO (src/utils/feedTargets.ts)
 *
 *  1. Sustrato: tierra, coco o hidroponía según lo cargado (lo desconocido cuenta como tierra).
 *  2. Etapa: plántula; vegetativo las primeras 2 semanas y después; floración; los últimos 10 días y
 *     maduración como "final"; cosechada, secando o curando, nada.
 *  3. pH por sustrato, igual en todo el ciclo; EC por etapa y sustrato.
 *  4. Automáticas: un 20 % menos de EC (en plántula, igual).
 *  5. Si el último drenaje salió bastante más salado que lo que entró, avisa que baje la EC.
 *  6. Tierra al principio: con agua alcanza si vino abonada.
 *  7. Lo medido: bien, bajo o alto.
 *  8. Tarjeta "Próximo riego": valores, rango y "¿De dónde sale?".
 *  9. Anotar riego: muestra lo recomendado y dice si lo medido está bien (la EC solo con nutrientes).
 * 10. Tabla completa por etapa: la de ahora, la próxima y desde cuándo vienen las que faltan.
 * 11. La tabla en la tarjeta y al anotar el riego: cerrada de entrada, se abre y se puede mirar otro medio.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, Watering } from '../src/types';
import { addDays, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import { checkReading, feedMediumOf, feedPhaseFor, feedPhaseStarts, feedTable, feedTargetFor } from '../src/utils/feedTargets';
import { FeedTargetCard } from '../src/components/cultivations/FeedTargetCard';
import { WateringModal } from '../src/components/logs/WateringModal';

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

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}
function type(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!;
  return act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const today = getLocalTodayDateOnly();
const ago = (d: number) => addDays(today, -d);

function crop(extra: Partial<Cultivation> = {}): Cultivation {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Carpa',
    startDate: ago(40),
    type: 'Indoor',
    plantCount: 2,
    currentStage: 'Vegetativo',
    stageStartDate: ago(30),
    substrate: { type: 'Coco', potVolumeLiters: 11, potType: 'Geotextil' },
    status: 'Saludable',
    createdAt: '',
    updatedAt: '',
    ...extra,
  } as Cultivation;
}

async function run() {
  console.log('\n🧪 pH y EC para el próximo riego\n');

  await check('1. Sustrato: tierra, coco o hidroponía', () => {
    assert(feedMediumOf('Tierra / Sustrato') === 'tierra' && feedMediumOf('') === 'tierra' && feedMediumOf('Light Mix') === 'tierra', 'tierra');
    assert(feedMediumOf('Fibra de coco') === 'coco' && feedMediumOf('Lana de roca') === 'coco', 'coco y sustratos sin tierra');
    assert(feedMediumOf('Hidroponía') === 'hidro' && feedMediumOf('DWC') === 'hidro', 'hidroponía');
  });

  await check('2. Etapa del ciclo', () => {
    assert(feedPhaseFor(crop({ currentStage: 'Plántula', stageStartDate: ago(5) })) === 'plantula', 'plántula');
    assert(feedPhaseFor(crop({ currentStage: 'Germinación', stageStartDate: ago(1) })) === 'plantula', 'germinación');
    assert(feedPhaseFor(crop({ currentStage: 'Vegetativo', stageStartDate: ago(6) })) === 'vege_inicio', 'vege, primeras semanas');
    assert(feedPhaseFor(crop({ currentStage: 'Vegetativo', stageStartDate: ago(30) })) === 'vegetativo', 'vege');
    assert(feedPhaseFor(crop({ currentStage: 'Floración', stageStartDate: ago(10), floweringStartDate: ago(10), declaredFloweringWeeks: 9 })) === 'floracion', 'floración');
    assert(feedPhaseFor(crop({ currentStage: 'Floración', stageStartDate: ago(66), floweringStartDate: ago(66), declaredFloweringWeeks: 9 })) === 'final', 'últimos 10 días antes de la cosecha estimada');
    assert(feedPhaseFor(crop({ currentStage: 'Prefloración', stageStartDate: ago(3) })) === 'floracion', 'prefloración');
    assert(feedPhaseFor(crop({ currentStage: 'Maduración' })) === 'final', 'maduración');
    for (const st of ['Cosecha', 'Secado', 'Curado', 'Finalizado']) assert(feedPhaseFor(crop({ currentStage: st as any })) === null, st);
  });

  await check('3. pH por sustrato (igual en todo el ciclo) y EC por etapa', () => {
    const vegeCoco = feedTargetFor(crop())!;
    assert(vegeCoco.ph.target === 6.0 && vegeCoco.ph.min === 5.8 && vegeCoco.ph.max === 6.2, JSON.stringify(vegeCoco.ph));
    assert(vegeCoco.ec.target === 1.4 && vegeCoco.ec.min === 1.2 && vegeCoco.ec.max === 1.6 && vegeCoco.label === 'Vegetativo en coco', JSON.stringify(vegeCoco));
    const floraCoco = feedTargetFor(crop({ currentStage: 'Floración', stageStartDate: ago(10), floweringStartDate: ago(10), declaredFloweringWeeks: 9 }))!;
    assert(floraCoco.ph.target === 6.0 && floraCoco.ec.target === 1.8 && floraCoco.ec.max === 2.0, 'floración en coco: mismo pH, EC 1,8');
    const tierra = feedTargetFor(crop({ substrate: { type: 'Tierra', potVolumeLiters: 20, potType: 'Geotextil' } }))!;
    assert(tierra.ph.target === 6.5 && tierra.ph.min === 6.2 && tierra.ph.max === 6.8, 'tierra 6,2–6,8');
    const hidro = feedTargetFor(crop({ substrate: { type: 'Hidroponía', potVolumeLiters: 0, potType: 'Hidropónico' }, currentStage: 'Floración', stageStartDate: ago(10), floweringStartDate: ago(10), declaredFloweringWeeks: 9 }))!;
    assert(hidro.ph.target === 5.8 && hidro.ec.target === 2.0 && hidro.ec.max === 2.2, 'hidro en floración: pH 5,8, EC 2');
    const plantula = feedTargetFor(crop({ currentStage: 'Plántula', stageStartDate: ago(4) }))!;
    assert(plantula.ec.min === 0.4 && plantula.ec.max === 0.8, 'plántula 0,4–0,8');
  });

  await check('4. Automáticas: 20 % menos de EC (en plántula igual)', () => {
    const auto = feedTargetFor(crop({ photoperiodType: 'Automática' }))!;
    assert(auto.auto && auto.ec.target === 1.1 && auto.ec.min === 1.0 && auto.ec.max === 1.3, JSON.stringify(auto.ec));
    assert(auto.ph.target === 6.0, 'el pH no cambia');
    const plantula = feedTargetFor(crop({ photoperiodType: 'Automática', currentStage: 'Plántula', stageStartDate: ago(4) }))!;
    assert(plantula.ec.target === 0.6, 'plántula igual');
  });

  await check('5. Drenaje salado: avisa que baje la EC', () => {
    const w = (id: string, date: string, ecIn: number, ecRunoff?: number): Watering => ({ id, userId: 'u1', cultivationId: 'c1', date, volumeLiters: 1, ecIn, ecRunoff, createdAt: '' });
    const salado = feedTargetFor(crop(), [w('a', ago(5), 1.4, 1.5), w('b', ago(2), 1.4, 2.4)])!;
    assert(salado.note && /más salado/.test(salado.note) && /EC 2,4 contra 1,4/.test(salado.note) && /apuntá a EC 1,2/.test(salado.note), salado.note || '');
    const bien = feedTargetFor(crop(), [w('a', ago(5), 1.4, 2.4), w('b', ago(2), 1.4, 1.6)])!;
    assert(bien.note === null, 'solo mira el último drenaje medido');
    assert(feedTargetFor(crop(), [w('a', ago(1), 1.4)])!.note === null, 'sin drenaje medido, nada');
  });

  await check('6. Tierra al principio: con agua alcanza si vino abonada', () => {
    const t = feedTargetFor(crop({ currentStage: 'Vegetativo', stageStartDate: ago(5), substrate: { type: 'Tierra', potVolumeLiters: 20, potType: 'Geotextil' } }))!;
    assert(t.phase === 'vege_inicio' && /alcanza con agua/.test(t.soilNote || ''), 'tierra abonada');
    assert(feedTargetFor(crop())!.soilNote === null, 'coco: no');
  });

  await check('7. Lo medido: bien, bajo o alto', () => {
    const r = { min: 5.8, max: 6.2, target: 6.0 };
    assert(checkReading(6.0, r) === 'bien' && checkReading(5.8, r) === 'bien' && checkReading(5.5, r) === 'bajo' && checkReading(6.6, r) === 'alto', 'rangos');
  });

  await check('8. Tarjeta "Próximo riego"', async () => {
    const m = await mount(React.createElement(FeedTargetCard, { target: feedTargetFor(crop({ photoperiodType: 'Automática' }))! }));
    const c = m.container;
    assert(c.querySelector('#feed-ph')?.textContent === '6,0' && c.querySelector('#feed-ec')?.textContent === '1,1', 'valores');
    assert(/entre 5,8 y 6,2/.test(c.textContent || '') && /Vegetativo en coco · automática/.test(c.textContent || ''), 'rango y etapa');
    assert(!c.querySelector('#feed-why-text'), 'la explicación arranca cerrada');
    await act(async () => (c.querySelector('#feed-why') as HTMLButtonElement).click());
    assert(/Guelph y Utah/.test(c.querySelector('#feed-why-text')?.textContent || '') && /20 % menos/.test(c.querySelector('#feed-why-text')?.textContent || ''), 'de dónde sale');
    await m.unmount();
  });

  await check('9. Anotar riego: lo recomendado y si lo medido está bien', async () => {
    const m = await mount(React.createElement(WateringModal, { isOpen: true, onClose: () => {}, userId: 'u1', cultivations: [crop()], defaultCultivationId: 'c1', onWateringAdded: () => {} }));
    const c = m.container;
    const guide = c.querySelector('#watering-feed-guide')?.textContent || '';
    assert(/Para este riego/.test(guide) && /pH 6,0/.test(guide) && /la EC es la de tu agua/.test(guide), guide);
    await type(c.querySelector('#watering-ph-in-input'), '6.6');
    assert(c.querySelector('#watering-ph-check')?.getAttribute('data-check') === 'alto' && /apuntá a 6,0/.test(c.querySelector('#watering-ph-check')?.textContent || ''), 'pH alto');
    await type(c.querySelector('#watering-ph-in-input'), '6');
    assert(c.querySelector('#watering-ph-check')?.getAttribute('data-check') === 'bien', 'pH bien');
    await type(c.querySelector('#watering-ec-in-input'), '2.5');
    assert(!c.querySelector('#watering-ec-check'), 'con agua sola no evalúa la EC');
    const withNutrients = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Con nutrientes') as HTMLButtonElement;
    await act(async () => withNutrients.click());
    assert(/EC 1,4/.test(c.querySelector('#watering-feed-guide')?.textContent || ''), 'con nutrientes muestra la EC');
    assert(c.querySelector('#watering-ec-check')?.getAttribute('data-check') === 'alto', 'EC alta');
    await m.unmount();
  });

  await check('10. Tabla por etapa: la de ahora, la próxima y desde cuándo', () => {
    const rows = feedTable('coco', false, 'floracion', { final: '2030-01-10' });
    assert(rows.map((r) => r.when).join() === 'antes,antes,antes,ahora,proxima', rows.map((r) => r.when).join());
    assert(rows.every((r) => r.ph.target === 6.0) && rows[3].ec.target === 1.8 && rows[4].from === '2030-01-10' && rows[0].from === null, 'valores y fecha');
    const auto = feedTable('hidro', true, null);
    assert(auto.every((r) => r.when === 'despues') && auto[0].ec.target === 0.6 && auto[3].ec.target === 1.6 && auto[3].ph.target === 5.8, 'automática: 20 % menos salvo plántula');
    const starts = feedPhaseStarts(crop({ startDate: ago(20), currentStage: 'Vegetativo', stageStartDate: ago(5) }));
    assert(starts.vegetativo === addDays(ago(5), 15) && !!starts.floracion && !!starts.final && !starts.plantula && !starts.vege_inicio, JSON.stringify(starts));
    assert(starts.floracion! > starts.vegetativo! && starts.final! > starts.floracion!, 'en orden');
    assert(feedTargetFor(crop({ currentStage: 'Vegetativo', stageStartDate: ago(5) }))!.starts.vegetativo === starts.vegetativo, 'viene con lo recomendado');
  });

  await check('11. La tabla en la tarjeta y al anotar el riego', async () => {
    const m = await mount(React.createElement(FeedTargetCard, { target: feedTargetFor(crop({ currentStage: 'Vegetativo', stageStartDate: ago(5) }))! }));
    const c = m.container;
    assert(c.querySelector('#feed-table-toggle')?.getAttribute('aria-expanded') === 'false' && !c.querySelector('#feed-table'), 'cerrada de entrada');
    await act(async () => (c.querySelector('#feed-table-toggle') as HTMLButtonElement).click());
    assert(c.querySelectorAll('#feed-table tbody tr').length === 5, 'cinco etapas');
    const now = c.querySelector('#feed-table tr[data-when="ahora"]');
    assert(now?.getAttribute('data-phase') === 'vege_inicio' && /Ahora/.test(now.textContent || ''), 'la de ahora');
    assert(/Próxima · desde el/.test(c.querySelector('#feed-table tr[data-when="proxima"]')?.textContent || ''), 'la próxima con fecha');
    assert(c.querySelector('#feed-table button[data-medium="coco"]')?.getAttribute('aria-pressed') === 'true', 'arranca en el medio del cultivo');
    await act(async () => (c.querySelector('#feed-table button[data-medium="tierra"]') as HTMLButtonElement).click());
    assert(/6,5/.test(c.querySelector('#feed-table tbody tr')?.textContent || ''), 'tierra: pH 6,5');
    await m.unmount();
    const w = await mount(React.createElement(WateringModal, { isOpen: true, onClose: () => {}, userId: 'u1', cultivations: [crop()], defaultCultivationId: 'c1', onWateringAdded: () => {} }));
    const t = w.container.querySelector('#watering-feed-guide #watering-feed-table-toggle') as HTMLButtonElement;
    assert(t && !w.container.querySelector('#watering-feed-table'), 'en Anotar riego, cerrada');
    await act(async () => t.click());
    assert(w.container.querySelectorAll('#watering-feed-table tbody tr').length === 5, 'se abre');
    await w.unmount();
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
