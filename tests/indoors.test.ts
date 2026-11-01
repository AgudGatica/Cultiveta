/**
 * tests/indoors.test.ts
 *
 * SUITE: AMBIENTES (carpas, salas o lugares de exterior) y el Jardín, en capas: Jardín → ambiente → genética.
 *
 * 1. Los cultivos de un ambiente interior usan su luz; en exterior (o sin ambiente) cada uno la suya.
 * 2. Genéticas de adentro: se suman las plantas entre cultivos.
 * 3. Medidas: superficie, volumen y W/m².
 * 4. Rutas: /ambientes/:id (y la vieja /indoors/:id) y /ambientes/:id/geneticas/:cultivo/:n.
 * 5. Un cultivo suelto recibe un ambiente con su nombre: interior con su luz, o exterior (patio o invernadero).
 * 6. La luz de un cultivo en un ambiente interior se guarda en el ambiente; pasar de ambiente.
 * 7. Clima como en Órbita: húmedo / óptimo / seco según la etapa (floración si alguna planta florece).
 * 8. Jardín: solo ambientes (portada interior o exterior, luz, plantas y genéticas); los sueltos, abajo.
 * 9. Ambiente: luz compartida, clima anotado a mano con su franja y genéticas con cuánto falta para cortar.
 * 10. Genética: ficha, para cortar, riegos y pasar a otro ambiente del mismo tipo.
 * 11. Formulario de cultivo: sumar plantas a un ambiente exterior lo deja exterior y en ese ambiente.
 * 12. Equipos: la luz va a un ambiente; la bomba no (va en un cultivo).
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, EnvironmentRecord, Indoor, Watering } from '../src/types';
import { withIndoorLighting, indoorGenetics, indoorMetrics, indoorSizeText, ambientForCrop, autoAmbientId, cropsWithoutAmbient, ambientsForCrop, geneticEntries } from '../src/utils/indoors';
import { evaluateAmbient, targetsForStages } from '../src/utils/ambientEvaluation';
import { parseAppRoute, pathForIndoor, pathForGenetic } from '../src/appRoutes';
import { getNavHighlight } from '../src/utils/cropCardInfo';
import { indoorService } from '../src/services/indoorService';
import { cultivationService } from '../src/services/cultivationService';
import { DashboardOverview } from '../src/components/dashboard/DashboardOverview';
import { AmbientDetailView } from '../src/components/indoors/AmbientDetailView';
import { GeneticDetailView } from '../src/components/indoors/GeneticDetailView';
import { CultivationFormModal } from '../src/components/cultivations/CultivationFormModal';
import { DeviceService, MemoryDeviceStore } from '../src/server/devices/deviceService';

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
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}

const crop = (id: string, extra: Partial<Cultivation> = {}): Cultivation =>
  ({
    id,
    userId: 'u1',
    name: id,
    startDate: '2026-10-01',
    type: 'Indoor',
    plantCount: 1,
    currentStage: 'Vegetativo',
    stageStartDate: '2026-10-01',
    substrate: { type: 'Turba', potVolumeLiters: 11, potType: 'Geotextil' },
    lighting: { type: 'LED', photoperiodHoursLight: 18, photoperiodHoursDark: 6 },
    status: 'ESTABLE',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...extra,
  }) as Cultivation;
const carpa: Indoor = {
  id: 'in1',
  userId: 'u1',
  name: 'Carpa 120',
  environment: 'indoor',
  kind: 'carpa',
  widthCm: 120,
  depthCm: 120,
  heightCm: 200,
  lighting: { type: 'LED', usedWatts: 480, photoperiodHoursLight: 12, photoperiodHoursDark: 12, lightsOnTime: '08:00' },
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const patio: Indoor = { id: 'ex1', userId: 'u1', name: 'Patio', environment: 'exterior', kind: 'patio', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' };
const terraza: Indoor = { ...patio, id: 'ex2', name: 'Terraza', kind: 'terraza' };

async function run() {
  console.log('\n================================================================');
  console.log('   AMBIENTES Y JARDÍN');
  console.log('================================================================\n');

  await check('1. Luz del ambiente interior; en exterior, la de cada cultivo', () => {
    const [a, b, c] = withIndoorLighting([crop('a', { indoorId: 'in1' }), crop('b'), crop('c', { indoorId: 'ex1', type: 'Outdoor' })], [carpa, { ...patio, lighting: { type: 'Sol', photoperiodHoursLight: 14 } }]);
    assert(a.lighting?.photoperiodHoursLight === 12 && a.lighting?.lightsOnTime === '08:00', 'adentro: 12/12 del ambiente');
    assert(b.lighting?.photoperiodHoursLight === 18, 'suelto: la suya');
    assert(c.lighting?.photoperiodHoursLight === 18, 'exterior: no se comparte luz');
  });

  await check('2. Genéticas de adentro: se suman las plantas entre cultivos', () => {
    const g = indoorGenetics([
      crop('Lote A', { plantCount: 3, geneticsList: [{ id: '1', name: 'Gelato 33', plantCount: 2 }, { id: '2', name: 'Amnesia', plantCount: 1 }] }),
      crop('Lote B', { plantCount: 2, geneticsName: 'gelato 33' }),
    ]);
    assert(g[0].name === 'Gelato 33' && g[0].plants === 4 && g[0].crops.join() === 'Lote A,Lote B', JSON.stringify(g[0]));
    assert(g[1].name === 'Amnesia' && g[1].plants === 1, JSON.stringify(g[1]));
  });

  await check('3. Medidas: superficie, volumen y W/m²', () => {
    const m = indoorMetrics(carpa);
    assert(Math.abs((m.areaM2 || 0) - 1.44) < 1e-9 && Math.abs((m.volumeM3 || 0) - 2.88) < 1e-9 && Math.round(m.wattsPerM2 || 0) === 333, JSON.stringify(m));
    assert(indoorSizeText(carpa) === '120 × 120 × 200 cm', indoorSizeText(carpa));
  });

  await check('4. Rutas de ambientes y genéticas', () => {
    assert(parseAppRoute('/ambientes/in1').view === 'indoor_detail' && parseAppRoute('/ambientes/in1').indoorId === 'in1', 'ambiente');
    assert(parseAppRoute('/indoors/in1').view === 'indoor_detail', 'dirección vieja');
    const g = parseAppRoute('/ambientes/in1/geneticas/c9/2');
    assert(g.view === 'genetic_detail' && g.indoorId === 'in1' && g.cultivationId === 'c9' && g.geneticIndex === 2, JSON.stringify(g));
    assert(pathForIndoor('a b') === '/ambientes/a%20b' && pathForGenetic('in1', 'c9', 2) === '/ambientes/in1/geneticas/c9/2', 'URLs');
    assert(getNavHighlight('genetic_detail', null) === 'dashboard' && getNavHighlight('indoor_detail', null) === 'dashboard', 'menú: Jardín');
  });

  await check('5. Cultivo suelto → ambiente con su nombre (interior o exterior)', () => {
    const i = ambientForCrop(crop('Purple Punch'));
    assert(i.name === 'Purple Punch' && i.environment === 'indoor' && i.kind === 'carpa' && i.lighting?.photoperiodHoursLight === 18, JSON.stringify(i));
    const o = ambientForCrop(crop('PRUEBA EXT', { type: 'Outdoor' }));
    assert(o.environment === 'exterior' && o.kind === 'patio' && !o.lighting, JSON.stringify(o));
    assert(ambientForCrop(crop('Inv', { type: 'Invernadero' })).kind === 'invernadero', 'invernadero');
    assert(autoAmbientId('c1') === 'auto_c1', 'id fijo: no se duplica');
    const list = [crop('a'), crop('b', { indoorId: 'in1' }), crop('c', { isFinished: true })];
    assert(cropsWithoutAmbient(list).map((c) => c.id).join() === 'a', 'solo los activos sin ambiente');
    assert(ambientsForCrop({ type: 'Outdoor' }, [carpa, patio, terraza]).map((a) => a.id).join() === 'ex1,ex2', 'un exterior va a exteriores');
  });

  const orig = { ui: indoorService.updateIndoor, uc: cultivationService.updateCultivation, ci: indoorService.createIndoor };
  const calls: any[] = [];
  const spy = () => {
    calls.length = 0;
    indoorService.updateIndoor = async (id, updates) => void calls.push({ to: 'indoor', id, updates });
    cultivationService.updateCultivation = async (id, updates) => void calls.push({ to: 'crop', id, updates });
    indoorService.createIndoor = async (data, id) => (calls.push({ to: 'create', id, data }), { ...data, id: id || 'x', createdAt: '', updatedAt: '' } as Indoor);
  };
  const unspy = () => {
    indoorService.updateIndoor = orig.ui;
    cultivationService.updateCultivation = orig.uc;
    indoorService.createIndoor = orig.ci;
  };

  await check('6. Luz de un cultivo en un ambiente interior → al ambiente; armar ambiente y pasar de ambiente', async () => {
    spy();
    try {
      await indoorService.saveCropUpdates(crop('a', { indoorId: 'in1' }), { lighting: { type: 'LED', photoperiodHoursLight: 12, photoperiodHoursDark: 12 }, currentStage: 'Floración' }, 'u1');
      assert(calls[0].to === 'indoor' && calls[0].updates.lighting.photoperiodHoursLight === 12 && calls[1].to === 'crop' && !('lighting' in calls[1].updates), JSON.stringify(calls));
      calls.length = 0;
      const amb = await indoorService.createAmbientForCrop(crop('Suelto', { type: 'Outdoor' }), 'u1');
      assert(calls[0].to === 'create' && calls[0].id === 'auto_Suelto' && calls[0].data.environment === 'exterior', 'crea con id fijo');
      assert(calls[1].to === 'crop' && calls[1].updates.indoorId === amb.id, 'y lo mete adentro');
      calls.length = 0;
      await indoorService.moveCrop(crop('a', { lighting: { type: 'LED', photoperiodHoursLight: 20 } }), { ...carpa, lighting: undefined }, 'u1');
      assert(calls[0].to === 'indoor' && calls[0].updates.lighting.photoperiodHoursLight === 20 && calls[1].updates.indoorId === 'in1', 'el ambiente sin luz toma la del cultivo');
    } finally {
      unspy();
    }
  });

  await check('7. Clima como en Órbita: húmedo / óptimo / seco según la etapa', () => {
    const flora = targetsForStages(['Vegetativo', 'Floración']);
    assert(flora.label === 'Floración', 'si alguna florece, rangos de floración');
    const ok = evaluateAmbient({ temperatureC: 24, humidityPct: 50 }, flora);
    assert(ok.band === 'optimo' && ok.temp === 'bien' && ok.rh === 'bien' && ok.vpd > 1.1 && ok.vpd < 1.5, JSON.stringify(ok));
    const wet = evaluateAmbient({ temperatureC: 24, humidityPct: 70 }, flora);
    assert(wet.band === 'humedo' && wet.rh === 'alta' && wet.bar.marker < wet.bar.optStart, JSON.stringify(wet));
    const dry = evaluateAmbient({ temperatureC: 29, humidityPct: 35 }, targetsForStages(['Vegetativo']));
    assert(dry.band === 'seco' && dry.temp === 'alta' && dry.rh === 'baja' && dry.bar.marker > dry.bar.optEnd, JSON.stringify(dry));
    assert(targetsForStages(['Plántula']).label === 'Plántula', 'plántulas');
  });

  const crops = withIndoorLighting(
    [
      crop('Lote A', { indoorId: 'in1', plantCount: 2, geneticsName: 'Gelato 33', currentStage: 'Floración', floweringStartDate: '2026-10-10', declaredFloweringWeeks: 8 }),
      crop('Lote B', { indoorId: 'in1', plantCount: 3, geneticsName: 'Amnesia' }),
      crop('Tomates', { indoorId: 'ex1', type: 'Outdoor', geneticsName: 'Northern Lights' }),
      crop('Suelto'),
    ],
    [carpa, patio]
  );

  await check('8. Jardín: solo ambientes con su portada; los sueltos, abajo', async () => {
    const base = { cultivations: crops, waterings: [], envRecords: [], photos: [], onSelectCultivation: () => {}, onCreateCultivationClick: () => {}, onOpenWateringModal: () => {} };
    let m = await mount(React.createElement(DashboardOverview, { ...base, indoors: [carpa, patio], onOpenIndoor: () => {}, onCreateIndoorClick: () => {} }));
    const card = m.container.querySelector('[data-ambient-card="in1"]');
    const t = card?.textContent || '';
    assert(/Carpa 120/.test(t) && /5 plantas · 2 genéticas/.test(t) && /Gelato 33/.test(t) && /LUZ (PRENDIDA|APAGADA)/.test(t), t);
    assert(card?.querySelector('[data-cover="interior"] img') && m.container.querySelector('[data-ambient-card="ex1"] [data-cover="exterior"]'), 'portada interior y exterior');
    assert(/LUZ NATURAL/.test(m.container.querySelector('[data-ambient-card="ex1"]')?.textContent || ''), 'exterior: luz natural');
    assert(/Nuevo ambiente/.test(m.container.querySelector('#home-add-ambient-btn')?.textContent || ''), 'botón Nuevo ambiente');
    const loose = [...m.container.querySelectorAll('#home-loose-crops [data-crop-card]')].map((x) => x.getAttribute('data-crop-card'));
    assert(loose.join() === 'Suelto' && !m.container.querySelector('#home-ambients [data-crop-card]'), `solo el suelto como cultivo: ${loose}`);
    await m.unmount();
    m = await mount(React.createElement(DashboardOverview, { ...base, cultivations: [], indoors: [], onCreateIndoorClick: () => {} }));
    assert(/Creá tu primer ambiente/.test(m.container.querySelector('#home-empty-crops')?.textContent || ''), 'vacío: crear ambiente');
    await m.unmount();
  });

  const now = new Date(2026, 9, 31, 10, 0).getTime();
  const env: EnvironmentRecord[] = [
    { id: 'e1', userId: 'u1', cultivationId: 'Lote A', date: '2026-10-31', time: '09:00', temperatureC: 24, humidityPct: 70, createdAt: new Date(now - 3600_000).toISOString() },
    { id: 'e0', userId: 'u1', cultivationId: 'Lote B', date: '2026-10-30', time: '09:00', temperatureC: 20, humidityPct: 40, createdAt: new Date(now - 86400_000).toISOString() },
  ];

  await check('9. Ambiente: luz compartida, clima con su franja y genéticas con cuánto falta para cortar', async () => {
    const m = await mount(
      React.createElement(AmbientDetailView, {
        ambient: carpa,
        cultivations: crops,
        envRecords: env,
        userId: 'u1',
        onBack: () => {},
        onOpenGenetic: () => {},
        onEdit: () => {},
        onDeleted: () => {},
        onAddPlants: () => {},
        now,
      })
    );
    const c = m.container;
    assert(/Es la luz de sus 5 plantas/.test(c.querySelector('#light-shared-note')?.textContent || ''), 'luz compartida');
    assert(c.querySelector('#light-state-pill')?.textContent === 'PRENDIDA', '12/12 desde las 8: a las 10 prendida');
    const climate = c.querySelector('#ambient-climate')?.textContent || '';
    assert(/Floración/.test(climate) && /AIRE HÚMEDO/.test(climate) && /Anotado a mano hace 1 h/.test(climate) && /HUMEDAD ALTA/.test(climate), climate);
    const cards = [...c.querySelectorAll('[data-genetic-card]')].map((x) => x.textContent || '');
    assert(cards.length === 2 && cards.some((x) => /Gelato 33/.test(x) && /2 plantas · Floración/.test(x)) && cards.every((x) => /para cortar/.test(x)), cards.join(' | '));
    await act(async () => (c.querySelector('#ambient-delete') as HTMLButtonElement).click());
    assert(/tiene plantas/.test(c.textContent || ''), 'no se borra con plantas adentro');
    await m.unmount();
  });

  await check('10. Genética: ficha, para cortar, riegos y pasar a otro ambiente del mismo tipo', async () => {
    const waterings = [
      { id: 'w1', userId: 'u1', cultivationId: 'Lote A', date: '2026-10-30', time: '08:00', volumeLiters: 1.5, phIn: 6.2, createdAt: '' },
      { id: 'w2', userId: 'u1', cultivationId: 'Lote B', date: '2026-10-30', volumeLiters: 3, createdAt: '' },
    ] as Watering[];
    const loteA = crops[0];
    const m = await mount(
      React.createElement(GeneticDetailView, {
        ambient: carpa,
        ambients: [carpa, { ...carpa, id: 'in2', name: 'Armario' }, patio],
        crop: loteA,
        index: 0,
        waterings,
        envRecords: env,
        userId: 'u1',
        onBack: () => {},
        onOpenCrop: () => {},
        onWater: () => {},
      })
    );
    const c = m.container;
    assert(/Gelato 33/.test(c.querySelector('#genetic-showcase')?.textContent || '') && /2 plantas/.test(c.textContent || ''), 'ficha');
    assert(/(Faltan \d+ días|Falta 1 día) para cortar|Lista para cortar/.test(c.querySelector('#genetic-harvest')?.textContent || ''), c.querySelector('#genetic-harvest')?.textContent || '');
    const rows = [...c.querySelectorAll('.genetic-watering')].map((x) => x.textContent || '');
    assert(rows.length === 1 && /1,5 L · pH 6.2/.test(rows[0]), `solo los riegos de su cultivo: ${rows}`);
    const opts = [...c.querySelectorAll('#genetic-move-select option')].map((o) => o.textContent);
    assert(opts.join() === 'Armario', `solo otros ambientes interiores: ${opts}`);
    await m.unmount();
  });

  await check('11. Sumar plantas a un ambiente exterior: el cultivo queda exterior y adentro', async () => {
    let saved: any = null;
    const origCreate = cultivationService.createCultivation;
    cultivationService.createCultivation = async (data: any) => (saved = { ...data, id: 'nuevo', createdAt: '', updatedAt: '' });
    try {
      const m = await mount(React.createElement(CultivationFormModal, { isOpen: true, onClose: () => {}, userId: 'u1', geneticsList: [], onSaved: () => {}, indoors: [carpa, patio], initialIndoorId: 'ex1' }));
      assert((m.container.querySelector('#crop-type-select') as HTMLSelectElement).value === 'Outdoor', 'tipo exterior');
      const opts = [...m.container.querySelectorAll('#crop-indoor-select option')].map((o) => o.textContent);
      assert(opts.includes('Patio') && !opts.includes('Carpa 120'), `solo ambientes exteriores: ${opts}`);
      assert(!m.container.querySelector('#crop-indoor-light-note'), 'en exterior no hay luz compartida');
      const nameInput = m.container.querySelector('#crop-name-input') as HTMLInputElement;
      const k = Object.keys(nameInput).find((x) => x.startsWith('__reactProps'))!;
      await act(async () => (nameInput as any)[k].onChange({ target: { value: 'Tomates 2' } }));
      await act(async () => (m.container.querySelector('button[type="submit"]') as HTMLButtonElement).click());
      assert(saved && saved.indoorId === 'ex1' && saved.type === 'Outdoor', `guardado: ${JSON.stringify(saved && { indoorId: saved.indoorId, type: saved.type })}`);
      await m.unmount();
    } finally {
      cultivationService.createCultivation = origCreate;
    }
  });

  await check('12. Equipos: la luz va a un ambiente; la bomba no', async () => {
    const checked: string[] = [];
    const svc = new DeviceService({ store: new MemoryDeviceStore(), verifyCultivation: async (_u, id, kind) => (checked.push(`${kind}:${id}`), { name: kind === 'indoor' ? 'Carpa 120' : 'Lote' }) });
    await svc.connectTuya('u1', { mock: true });
    const b = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'in1', targetKind: 'indoor', schedule: { lightHours: 12, darkHours: 12, anchorMs: Date.now() - 3600_000, timeZone: 'America/Argentina/Buenos_Aires' } });
    assert(b.targetKind === 'indoor' && b.cultivationName === 'Carpa 120' && checked[0] === 'indoor:in1', JSON.stringify({ kind: b.targetKind, name: b.cultivationName, checked }));
    let err = '';
    try {
      await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'in1', targetKind: 'indoor' });
    } catch (e: any) {
      err = e.message;
    }
    assert(/van en un cultivo/.test(err), `bomba al ambiente: ${err}`);
  });

  // geneticEntries ordena por lo que falta para cortar
  await check('13. Genéticas del ambiente ordenadas por lo que falta para cortar', () => {
    const e = geneticEntries(crops.filter((c) => c.indoorId === 'in1'));
    assert(e.length === 2 && e[0].daysToHarvest <= e[1].daysToHarvest && e[0].card.name === 'Gelato 33', e.map((x) => `${x.card.name}:${x.daysToHarvest}`).join());
  });

  console.log('\n================================================================');
  console.log(` RESULTADO AMBIENTES: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en indoors:', err);
  process.exit(1);
});
