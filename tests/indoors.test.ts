/**
 * tests/indoors.test.ts
 *
 * SUITE: INDOORS (carpas, salas, armarios) que agrupan cultivos y comparten la luz.
 *
 * 1. Los cultivos de un indoor usan su luz; los sueltos (o un indoor sin luz) siguen con la suya.
 * 2. Genéticas de adentro: se suman las plantas de cada genética entre cultivos.
 * 3. Medidas: superficie, volumen y W/m².
 * 4. Rutas: /indoors/:id abre el indoor y el menú resalta Inicio.
 * 5. Guardar la luz de un cultivo con indoor la guarda en el indoor; sin indoor, en el cultivo.
 * 6. Meter un cultivo en un indoor sin luz le pasa la del cultivo; al sacarlo, se queda con la del indoor.
 * 7. Inicio: tarjetas de indoors con cultivos, plantas y genéticas; cada cultivo dice en qué indoor está.
 * 8. Pantalla del indoor: su luz (compartida), cultivos adentro, los que se pueden meter y sus genéticas.
 * 9. Formulario de cultivo: con indoor elegido, la luz no se pide y se guarda el indoorId.
 * 10. Equipos: la luz se asigna a un indoor; la bomba no (va en un cultivo).
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, Indoor } from '../src/types';
import { withIndoorLighting, indoorGenetics, indoorMetrics, indoorSizeText, looseIndoorCrops } from '../src/utils/indoors';
import { parseAppRoute, pathForIndoor } from '../src/appRoutes';
import { getNavHighlight } from '../src/utils/cropCardInfo';
import { indoorService } from '../src/services/indoorService';
import { cultivationService } from '../src/services/cultivationService';
import { DashboardOverview } from '../src/components/dashboard/DashboardOverview';
import { IndoorDetailView } from '../src/components/indoors/IndoorDetailView';
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
  kind: 'carpa',
  widthCm: 120,
  depthCm: 120,
  heightCm: 200,
  lighting: { type: 'LED', usedWatts: 480, photoperiodHoursLight: 12, photoperiodHoursDark: 12, lightsOnTime: '08:00' },
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

async function run() {
  console.log('\n================================================================');
  console.log('   INDOORS (CARPAS QUE AGRUPAN CULTIVOS)');
  console.log('================================================================\n');

  await check('1. Los cultivos de un indoor usan su luz; los sueltos siguen con la suya', () => {
    const [a, b, c] = withIndoorLighting([crop('a', { indoorId: 'in1' }), crop('b'), crop('c', { indoorId: 'in2' })], [carpa, { ...carpa, id: 'in2', lighting: undefined }]);
    assert(a.lighting?.photoperiodHoursLight === 12 && a.lighting?.lightsOnTime === '08:00', 'adentro: 12/12 del indoor');
    assert(b.lighting?.photoperiodHoursLight === 18, 'suelto: la suya');
    assert(c.lighting?.photoperiodHoursLight === 18, 'indoor sin luz cargada: la del cultivo');
    assert(looseIndoorCrops([a, b, c, crop('d', { type: 'Outdoor' })]).map((x) => x.id).join() === 'b', 'para meter: interiores sin indoor');
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
    assert(indoorMetrics({ widthCm: 80 }).volumeM3 === null, 'sin medidas no inventa');
  });

  await check('4. Rutas: /indoors/:id abre el indoor', () => {
    const r = parseAppRoute('/indoors/in1');
    assert(r.view === 'indoor_detail' && r.indoorId === 'in1' && r.cultivationId === null, JSON.stringify(r));
    assert(pathForIndoor('a b') === '/indoors/a%20b', 'URL');
    assert(getNavHighlight('indoor_detail', null) === 'dashboard', 'menú: Inicio');
  });

  const origUpdateIndoor = indoorService.updateIndoor;
  const origUpdateCrop = cultivationService.updateCultivation;
  const calls: any[] = [];
  const spy = () => {
    calls.length = 0;
    indoorService.updateIndoor = async (id, updates) => void calls.push({ to: 'indoor', id, updates });
    cultivationService.updateCultivation = async (id, updates) => void calls.push({ to: 'crop', id, updates });
  };
  const unspy = () => {
    indoorService.updateIndoor = origUpdateIndoor;
    cultivationService.updateCultivation = origUpdateCrop;
  };

  await check('5. La luz de un cultivo con indoor se guarda en el indoor', async () => {
    spy();
    try {
      await indoorService.saveCropUpdates(crop('a', { indoorId: 'in1' }), { lighting: { type: 'LED', photoperiodHoursLight: 12, photoperiodHoursDark: 12 }, currentStage: 'Floración' }, 'u1');
      assert(calls.length === 2 && calls[0].to === 'indoor' && calls[0].id === 'in1' && calls[0].updates.lighting.photoperiodHoursLight === 12, JSON.stringify(calls));
      assert(calls[1].to === 'crop' && !('lighting' in calls[1].updates) && calls[1].updates.currentStage === 'Floración', 'la etapa sí va al cultivo');
      await indoorService.saveCropUpdates(crop('b'), { lighting: { type: 'LED', photoperiodHoursLight: 20 } }, 'u1');
      assert((calls.length as number) === 3 && calls[2].to === 'crop' && calls[2].updates.lighting.photoperiodHoursLight === 20, 'sin indoor: en el cultivo');
    } finally {
      unspy();
    }
  });

  await check('6. Meter y sacar un cultivo', async () => {
    spy();
    try {
      const empty = { ...carpa, lighting: undefined };
      const moved = await indoorService.addCrop(empty, crop('a', { lighting: { type: 'LED', photoperiodHoursLight: 20, photoperiodHoursDark: 4 } }), 'u1');
      assert(calls[0].to === 'indoor' && calls[0].updates.lighting.photoperiodHoursLight === 20, 'el indoor sin luz toma la del cultivo');
      assert(calls[1].to === 'crop' && calls[1].updates.indoorId === 'in1' && moved.indoorId === 'in1', 'el cultivo queda adentro');
      calls.length = 0;
      const out = await indoorService.removeCrop(carpa, moved, 'u1');
      assert(calls[0].to === 'crop' && calls[0].updates.indoorId === null && calls[0].updates.lighting.photoperiodHoursLight === 12 && out.indoorId === null, 'sale con la luz del indoor');
    } finally {
      unspy();
    }
  });

  await check('7. Inicio: indoors con cultivos, plantas y genéticas; cada cultivo dice su indoor', async () => {
    const crops = withIndoorLighting([crop('Lote A', { indoorId: 'in1', plantCount: 2, geneticsName: 'Gelato 33' }), crop('Lote B', { indoorId: 'in1', plantCount: 3, geneticsName: 'Amnesia' }), crop('Suelto')], [carpa]);
    const base = { cultivations: crops, waterings: [], envRecords: [], photos: [], onSelectCultivation: () => {}, onCreateCultivationClick: () => {}, onOpenWateringModal: () => {} };
    let m = await mount(React.createElement(DashboardOverview, { ...base, indoors: [carpa], onOpenIndoor: () => {}, onCreateIndoorClick: () => {} }));
    const card = m.container.querySelector('[data-indoor-card="in1"]')?.textContent || '';
    assert(/Carpa 120/.test(card) && /2 cultivos · 5 plantas/.test(card) && /Gelato 33/.test(card) && /Amnesia/.test(card), card);
    assert(/LUZ (PRENDIDA|APAGADA)/.test(card), 'con hora de encendido dice si está prendida');
    const chips = [...m.container.querySelectorAll('.crop-indoor-name')].map((x) => x.textContent);
    assert(chips.length === 2 && chips.every((t) => /En Carpa 120/.test(t || '')), `chips: ${chips}`);
    await m.unmount();
    m = await mount(React.createElement(DashboardOverview, { ...base, cultivations: [crop('Suelto')], indoors: [], onCreateIndoorClick: () => {} }));
    assert(m.container.querySelector('#home-create-indoor-btn'), 'sin indoors: invita a crear uno');
    await m.unmount();
  });

  await check('8. Pantalla del indoor: luz compartida, cultivos, los que se pueden meter y genéticas', async () => {
    const crops = withIndoorLighting([crop('Lote A', { indoorId: 'in1', plantCount: 2, geneticsName: 'Gelato 33' }), crop('Suelto')], [carpa]);
    const m = await mount(
      React.createElement(IndoorDetailView, {
        indoor: carpa,
        cultivations: crops,
        userId: 'u1',
        onBack: () => {},
        onOpenCrop: () => {},
        onEdit: () => {},
        onDeleted: () => {},
        onCreateCropHere: () => {},
        now: new Date(2026, 9, 31, 10, 0).getTime(),
      })
    );
    const t = m.container.textContent || '';
    assert(/Carpa 120/.test(t) && /120 × 120 × 200 cm/.test(t) && /333/.test(t), 'encabezado con medidas y W/m²');
    assert(/Es la luz de su cultivo/.test(m.container.querySelector('#light-shared-note')?.textContent || ''), 'luz compartida');
    assert(m.container.querySelector('#light-state-pill')?.textContent === 'PRENDIDA', '12/12 desde las 8: a las 10 prendida');
    assert(m.container.querySelectorAll('#indoor-crops [data-crop-card]').length === 1, 'un cultivo adentro');
    const opts = [...m.container.querySelectorAll('#indoor-add-select option')].map((o) => o.textContent);
    assert(opts.join() === 'Suelto', `para meter: ${opts}`);
    assert(/Gelato 33/.test(m.container.querySelector('#indoor-genetics')?.textContent || ''), 'genéticas');
    await m.unmount();
  });

  await check('9. Formulario de cultivo: con indoor, la luz no se pide y se guarda el indoorId', async () => {
    let saved: any = null;
    const origCreate = cultivationService.createCultivation;
    cultivationService.createCultivation = async (data: any) => (saved = { ...data, id: 'nuevo', createdAt: '', updatedAt: '' });
    try {
      const m = await mount(
        React.createElement(CultivationFormModal, { isOpen: true, onClose: () => {}, userId: 'u1', geneticsList: [], onSaved: () => {}, indoors: [carpa], initialIndoorId: 'in1' })
      );
      const select = m.container.querySelector('#crop-indoor-select') as HTMLSelectElement;
      assert(select && select.value === 'in1', 'arranca en el indoor pedido');
      assert(m.container.querySelector('#crop-indoor-light-note') && !m.container.querySelector('#crop-lighting-type-input'), 'en vez de la luz, el aviso');
      const nameInput = m.container.querySelector('#crop-name-input') as HTMLInputElement;
      if (nameInput) {
        const k = Object.keys(nameInput).find((x) => x.startsWith('__reactProps'))!;
        await act(async () => (nameInput as any)[k].onChange({ target: { value: 'Lote nuevo' } }));
      }
      await act(async () => (m.container.querySelector('button[type="submit"]') as HTMLButtonElement).click());
      assert(saved && saved.indoorId === 'in1' && saved.lighting.photoperiodHoursLight === 12, `guardado: ${JSON.stringify(saved && { indoorId: saved.indoorId, lighting: saved.lighting })}`);
      await m.unmount();
    } finally {
      cultivationService.createCultivation = origCreate;
    }
  });

  await check('10. Equipos: la luz va al indoor; la bomba no', async () => {
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
    assert(/van en un cultivo/.test(err), `bomba al indoor: ${err}`);
  });

  console.log('\n================================================================');
  console.log(` RESULTADO INDOORS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en indoors:', err);
  process.exit(1);
});
