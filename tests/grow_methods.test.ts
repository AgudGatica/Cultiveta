/**
 * tests/grow_methods.test.ts
 *
 * SUITE: FORMA DE CULTIVO (tierra, living soil, coco o sustrato, hidroponía)
 *
 *  1. El método: el elegido o, si no hay, el que dice el texto del sustrato.
 *  2. Living soil: sin pH ni EC para el riego, una sugerencia por etapa; sin alertas de pH/EC del riego.
 *  3. Hidroponía: el pH del tanque va más bajo (5,6–6,0) y no alerta con 5,6.
 *  4. Tanque: sin controles, control atrasado (48 h), agua caliente, pH, EC y cambio de solución (14 días),
 *     un aviso a la vez y en orden de importancia.
 *  5. Tarjetas "Living soil: solo agua" y "Tanque".
 *  6. En hidroponía nunca hay "riego atrasado".
 *  7. Tareas: "Revisar el tanque" y "Cambiar la solución" en vez del riego; living soil sin pH ni lavado de raíces.
 *  8. Anotar riego en living soil: pH y EC ocultos hasta "Medir igual"; "Con té o enmienda".
 *  9. Anotar riego en hidroponía: "Control del tanque", sin drenaje ni peso, guarda kind 'tanque' y el cambio.
 * 10. Formulario: "¿Cómo cultivás?" deduce del sustrato y guarda lo elegido.
 * 11. Nutrición en living soil: se alimenta la tierra, sin tabla de fertilizantes.
 * 12. Comunidad: colección "Living soil".
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, Watering } from '../src/types';
import { addDays, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import { growMethodFromText, growMethodOf } from '../src/utils/growMethod';
import { feedTargetFor, livingSoilGuide } from '../src/utils/feedTargets';
import { tankStatus } from '../src/utils/hydroTank';
import { analyzeWateringUrgency } from '../src/utils/wateringAlertUtils';
import { cultivationService } from '../src/services/cultivationService';
import { taskService } from '../src/services/taskService';
import { wateringService } from '../src/services/wateringService';
import { fertilizationService } from '../src/services/fertilizationService';
import { LivingSoilCard } from '../src/components/cultivations/FeedTargetCard';
import { HydroTankCard } from '../src/components/cultivations/HydroTankCard';
import { WateringModal } from '../src/components/logs/WateringModal';
import { CultivationFormModal } from '../src/components/cultivations/CultivationFormModal';
import { FertilizationSectionView } from '../src/components/cultivations/FertilizationSectionView';
import { buildGrowlog, exploreSections, growlogCard } from '../src/utils/growlog';

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
const click = (el: Element | null) => act(async () => (el as HTMLElement).click());
const buttonWithText = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) || null;

const today = getLocalTodayDateOnly();
const ago = (d: number) => addDays(today, -d);
const HOUR = 3_600_000;
const NOW = Date.now();
const hoursAgo = (h: number) => {
  const d = new Date(NOW - h * HOUR);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
};

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
const living = (extra: Partial<Cultivation> = {}) => crop({ growMethod: 'living_soil', substrate: { type: 'Living soil', potVolumeLiters: 40, potType: 'Geotextil' }, ...extra });
const hydro = (extra: Partial<Cultivation> = {}) => crop({ growMethod: 'hidro', substrate: { type: 'DWC', potVolumeLiters: 20, potType: 'Hidropónico' }, ...extra });

let wid = 0;
function w(hAgo: number, extra: Partial<Watering> = {}): Watering {
  return { id: `w${++wid}`, userId: 'u1', cultivationId: 'c1', ...hoursAgo(hAgo), volumeLiters: 0, createdAt: '', ...extra } as Watering;
}

async function run() {
  console.log('\n🧪 Forma de cultivo: living soil e hidroponía\n');

  await check('1. El método: elegido o deducido del sustrato', () => {
    assert(growMethodFromText('Living soil') === 'living_soil' && growMethodFromText('Super Soil casero') === 'living_soil' && growMethodFromText('Tierra viva no-till') === 'living_soil', 'living soil');
    assert(growMethodFromText('Hidroponía') === 'hidro' && growMethodFromText('RDWC') === 'hidro' && growMethodFromText('Aeroponía') === 'hidro', 'hidroponía');
    assert(growMethodFromText('Turba / Perlita / Humus') === 'sustrato' && growMethodFromText('Fibra de coco') === 'sustrato' && growMethodFromText('Lana de roca') === 'sustrato', 'sustrato');
    assert(growMethodFromText('Tierra abonada') === 'tierra' && growMethodFromText('') === 'tierra' && growMethodFromText(undefined) === 'tierra', 'lo demás, tierra');
    assert(growMethodOf(crop({ growMethod: 'hidro' })) === 'hidro', 'lo elegido gana sobre el texto ("Coco")');
    assert(growMethodOf(crop()) === 'sustrato', 'sin elegir, del texto');
  });

  await check('2. Living soil: sin pH ni EC, una sugerencia por etapa, sin alertas del riego', () => {
    assert(feedTargetFor(living()) === null, 'no hay pH ni EC para el riego');
    const vege = livingSoilGuide(living())!;
    assert(vege.phase === 'vegetativo' && /cobertura/.test(vege.tip) && vege.label === 'Vegetativo en living soil', JSON.stringify(vege));
    assert(/Solo agua hasta la cosecha/.test(livingSoilGuide(living({ currentStage: 'Maduración' }))!.tip), 'final: solo agua');
    assert(livingSoilGuide(crop()) === null && livingSoilGuide(living({ currentStage: 'Secado' as any })) === null, 'solo living soil y en ciclo');
    const sour = { id: 'x', userId: 'u1', cultivationId: 'c1', date: today, volumeLiters: 2, phIn: 4.5, ecIn: 3.5, createdAt: '' } as Watering;
    assert(cultivationService.computeHealthStatus(living(), sour).status === 'ESTABLE', 'living soil: no evalúa pH ni EC');
    assert(cultivationService.computeHealthStatus(crop(), sour).status === 'ATENCION', 'coco: sí');
  });

  await check('3. Hidroponía: pH del tanque más bajo, sin falsa alerta con 5,6', () => {
    const t = feedTargetFor(hydro())!;
    assert(t.ph.target === 5.8 && t.ph.min === 5.6 && t.ph.max === 6.0, JSON.stringify(t.ph));
    const r = (phIn: number) => ({ id: 'x', userId: 'u1', cultivationId: 'c1', date: today, volumeLiters: 0, phIn, createdAt: '' }) as Watering;
    assert(cultivationService.computeHealthStatus(hydro(), r(5.6)).status === 'ESTABLE', '5,6 en hidroponía está bien');
    assert(cultivationService.computeHealthStatus(hydro(), r(5.3)).status === 'REVISAR', '5,3 sí avisa');
    assert(cultivationService.computeHealthStatus(crop(), r(5.6)).status === 'REVISAR', 'en coco 5,6 avisa como antes');
  });

  await check('4. Tanque: un aviso a la vez, en orden de importancia', () => {
    assert(tankStatus(crop(), []) === null && tankStatus(living(), []) === null, 'solo hidroponía');
    const none = tankStatus(hydro(), [], NOW)!;
    assert(none.alert.kind === 'check' && /primer control/.test(none.alert.text) && none.hoursSinceCheck === null, 'sin controles');
    const late = tankStatus(hydro(), [w(72, { phIn: 5.8, ecIn: 1.4 })], NOW)!;
    assert(late.alert.kind === 'check' && /Hace 3 días/.test(late.alert.text), late.alert.text);
    // Agua caliente gana sobre pH alto
    const hot = tankStatus(hydro(), [w(2, { phIn: 6.5, ecIn: 1.4, waterTempC: 25 })], NOW)!;
    assert(hot.alert.kind === 'temp_high' && /25,0 °C/.test(hot.alert.text) && /pudrición de raíz/.test(hot.alert.text), hot.alert.text);
    const phHigh = tankStatus(hydro(), [w(2, { phIn: 6.4, ecIn: 1.4, waterTempC: 20 })], NOW)!;
    assert(phHigh.alert.kind === 'ph_high' && /Bajalo a 5,8/.test(phHigh.alert.text), phHigh.alert.text);
    const ecHigh = tankStatus(hydro(), [w(2, { phIn: 5.8, ecIn: 2.4 })], NOW)!;
    assert(ecHigh.alert.kind === 'ec_high' && /agua sola/.test(ecHigh.alert.text), ecHigh.alert.text);
    const ecLow = tankStatus(hydro(), [w(2, { phIn: 5.8, ecIn: 1.1 })], NOW)!;
    assert(ecLow.alert.kind === 'ec_low' && /solución a EC 1,8/.test(ecLow.alert.text), ecLow.alert.text);
    // Lo último anotado de cada cosa, aunque el último control no tenga todo
    const mixed = tankStatus(hydro(), [w(30, { phIn: 5.9, ecIn: 1.5, waterTempC: 19 }), w(3, { phIn: 5.7 })], NOW)!;
    assert(mixed.ph === 5.7 && mixed.ec === 1.5 && mixed.tempC === 19 && mixed.alert.kind === 'ok', JSON.stringify(mixed));
    assert(/Cambio de solución en 13 días/.test(mixed.alert.text), mixed.alert.text);
    // Cambio de solución: 14 días desde el primer control si nunca se anotó uno
    const change = tankStatus(hydro(), [w(15 * 24, { phIn: 5.8, ecIn: 1.4 }), w(2, { phIn: 5.8, ecIn: 1.4 })], NOW)!;
    assert(change.alert.kind === 'change' && change.changeInDays === 0 && /toca cambiar toda la solución/.test(change.alert.text), change.alert.text);
    const changed = tankStatus(hydro(), [w(15 * 24, { phIn: 5.8, ecIn: 1.4 }), w(4 * 24, { solutionChange: true }), w(2, { phIn: 5.8, ecIn: 1.4 })], NOW)!;
    assert(changed.daysSinceChange === 4 && changed.changeInDays === 10 && changed.alert.kind === 'ok', JSON.stringify(changed));
    const others = tankStatus(hydro(), [{ ...w(2, { phIn: 9 }), cultivationId: 'otro' }], NOW)!;
    assert(others.alert.kind === 'check', 'solo los controles de este cultivo');
  });

  await check('5. Tarjetas "Living soil: solo agua" y "Tanque"', async () => {
    const ls = await mount(React.createElement(LivingSoilCard, { guide: livingSoilGuide(living())! }));
    assert(/Living soil: solo agua/.test(ls.container.textContent || '') && /No hace falta corregir el pH/.test(ls.container.textContent || ''), 'living soil');
    assert(/cobertura/.test(ls.container.querySelector('#living-soil-tip')?.textContent || ''), 'sugerencia de la etapa');
    await click(ls.container.querySelector('#living-why'));
    const why = ls.container.querySelector('#living-why-text')?.textContent || '';
    assert(/amortigua el pH/.test(why) && /cloramina/.test(why) && /6,2 y 7/.test(why), why);
    await ls.unmount();

    let checks = 0;
    const st = tankStatus(hydro(), [w(2, { phIn: 6.4, ecIn: 1.4, waterTempC: 23 })], NOW)!;
    const tk = await mount(React.createElement(HydroTankCard, { status: st, onCheck: () => checks++ }));
    const c = tk.container;
    assert(c.querySelector('#hydro-tank')?.getAttribute('data-alert') === 'temp_high', 'aviso');
    assert(c.querySelector('#tank-ph')?.textContent === '6,4' && c.querySelector('#tank-ph')?.getAttribute('data-out') === 'true', 'pH fuera de rango');
    assert(c.querySelector('#tank-ec')?.getAttribute('data-out') === 'false' && c.querySelector('#tank-temp')?.getAttribute('data-out') === 'true', 'EC bien, agua caliente');
    assert(/hace 2 h/.test(c.textContent || '') && /5,6–6,0/.test(c.textContent || ''), 'último control y rango');
    await click(c.querySelector('#tank-check'));
    assert(checks === 1, 'abre el control del tanque');
    await click(c.querySelector('#tank-table-toggle'));
    assert(c.querySelector('#tank-table button[data-medium="hidro"]')?.getAttribute('aria-pressed') === 'true' && c.querySelectorAll('#tank-table tbody tr').length === 5, 'tabla por etapa, en hidroponía');
    assert(c.querySelector('#tank-table tr[data-when="ahora"]')?.getAttribute('data-phase') === 'vegetativo', 'la etapa de ahora');
    await tk.unmount();
  });

  await check('6. Hidroponía: nunca "riego atrasado"', () => {
    const old = { id: 'x', userId: 'u1', cultivationId: 'c1', date: ago(20), volumeLiters: 1, createdAt: '' } as Watering;
    const a = analyzeWateringUrgency(hydro(), old, new Date());
    assert(!a.isOverdue && !a.isDueToday && a.badgeText === 'Hidroponía' && a.daysSinceWatering === 20, JSON.stringify(a));
    assert(analyzeWateringUrgency(crop(), old, new Date()).isOverdue, 'en coco sí');
  });

  await check('7. Tareas según el método', () => {
    localStorage.clear();
    const hydroTasks = taskService.getTasksForDashboard([hydro()], [w(72, { phIn: 5.8, ecIn: 1.4 })], [], 'u1');
    const tankTask = hydroTasks.find((t) => t.id.startsWith('tank_'))!;
    assert(!hydroTasks.some((t) => t.id.startsWith('watering_')), 'sin tarea de riego');
    assert(tankTask && tankTask.title === '¡Revisá el tanque!' && tankTask.urgency === 'overdue' && /Hace 3 días/.test(tankTask.description) && tankTask.type === 'watering', JSON.stringify(tankTask));
    const fresh = taskService.getTasksForDashboard([hydro()], [w(30, { phIn: 5.8, ecIn: 1.4 })], [], 'u1').find((t) => t.id.startsWith('tank_'))!;
    assert(fresh.title === 'Revisar el tanque' && fresh.urgency === 'today' && /pH 5,8 y EC 1,8/.test(fresh.description), JSON.stringify(fresh));
    assert(!taskService.getTasksForDashboard([hydro()], [w(30)], [], 'u1').some((t) => t.id.startsWith('solution_')), 'sin cambio de solución todavía');
    const due = taskService.getTasksForDashboard([hydro()], [w(15 * 24), w(30)], [], 'u1').find((t) => t.id.startsWith('solution_'))!;
    assert(due && due.title === 'Cambiar la solución' && /Cambié toda la solución/.test(due.description), JSON.stringify(due));

    const flowering = { currentStage: 'Floración' as const, stageStartDate: ago(58), floweringStartDate: ago(58), declaredFloweringWeeks: 9 };
    const ls = taskService.getTasksForDashboard([living(flowering)], [], [], 'u1');
    const lsWater = ls.find((t) => t.id.startsWith('watering_'))!;
    assert(lsWater && !/pH/.test(lsWater.description), lsWater?.description);
    assert(!ls.some((t) => t.type === 'flush'), 'living soil: sin lavado de raíces');
    const coco = taskService.getTasksForDashboard([crop(flowering)], [], [], 'u1');
    assert(/pH recomendado/.test(coco.find((t) => t.id.startsWith('watering_'))!.description) && coco.some((t) => t.type === 'flush'), 'coco como antes');
    const hydroFlush = taskService.getTasksForDashboard([hydro(flowering)], [w(2)], [], 'u1').find((t) => t.type === 'flush')!;
    assert(hydroFlush && /solución del tanque por agua sola/.test(hydroFlush.description), hydroFlush?.description);
    // la flora empezó hace 58 días: día 58 (antes, en Argentina, la fecha se leía en UTC y decía 59)
    assert(/^Día 58 de flora/.test(hydroFlush.description), hydroFlush.description);
  });

  const modal = (c: Cultivation) =>
    mount(React.createElement(WateringModal, { isOpen: true, onClose: () => {}, userId: 'u1', cultivations: [c], defaultCultivationId: 'c1', onWateringAdded: () => {} }));

  await check('8. Anotar riego en living soil', async () => {
    const m = await modal(living());
    const c = m.container;
    assert(/Living soil:/.test(c.querySelector('#watering-living-note')?.textContent || ''), 'solo agua');
    assert(!c.querySelector('#watering-ph-in-input') && !c.querySelector('#watering-feed-guide'), 'sin pH ni EC ni guía');
    assert(buttonWithText(c, 'Con té o enmienda') && !buttonWithText(c, 'Con nutrientes'), 'té o enmienda');
    await click(c.querySelector('#watering-measure-anyway'));
    assert(c.querySelector('#watering-ph-in-input') && c.querySelector('#watering-ec-in-input'), 'medir igual');
    await type(c.querySelector('#watering-ph-in-input'), '7.4');
    assert(!c.querySelector('#watering-ph-check'), 'sin "bien/alto": no hay pH recomendado');
    await m.unmount();
  });

  await check('9. Anotar riego en hidroponía: control del tanque', async () => {
    let saved: any = null;
    const orig = wateringService.addWatering;
    (wateringService as any).addWatering = async (data: any) => (saved = { ...data, id: 'n1', createdAt: '' });
    try {
      const m = await modal(hydro());
      const c = m.container;
      assert(c.querySelector('#watering-modal-title')?.textContent === 'Control del tanque', 'título');
      assert(!c.querySelector('#drainage-options-group') && !/Peso de la maceta/i.test(c.textContent || ''), 'sin drenaje ni peso');
      assert(/pH del tanque/.test(c.textContent || '') && c.querySelector('#watering-tank-temp-input'), 'pH y temperatura del tanque');
      assert(buttonWithText(c, 'Solución (con nutrientes)'), 'repone con solución');
      await type(c.querySelector('#watering-ph-in-input'), '6.3');
      assert(c.querySelector('#watering-ph-check')?.getAttribute('data-check') === 'alto', 'pH alto para hidroponía');
      await type(c.querySelector('#watering-ec-in-input'), '1.4');
      assert(c.querySelector('#watering-ec-check')?.getAttribute('data-check') === 'bien', 'la EC del tanque se evalúa aunque sea agua sola');
      await type(c.querySelector('#watering-tank-temp-input'), '24');
      assert(c.querySelector('#watering-temp-check')?.getAttribute('data-check') === 'alto', 'agua caliente');
      await click(c.querySelector('#watering-solution-change'));
      await act(async () => (c.querySelector('#save-watering-btn') as HTMLButtonElement).click());
      assert(saved && saved.kind === 'tanque' && saved.solutionChange === true && saved.volumeLiters === 0 && saved.phIn === 6.3 && saved.waterTempC === 24, JSON.stringify(saved));
      assert(saved.drainageLevel === undefined && saved.potLiftBeforeWatering === undefined, 'sin drenaje ni peso');
      await m.unmount();
    } finally {
      (wateringService as any).addWatering = orig;
    }
  });

  await check('10. Formulario: "¿Cómo cultivás?"', async () => {
    let saved: any = null;
    const origCreate = cultivationService.createCultivation;
    cultivationService.createCultivation = async (data: any) => (saved = { ...data, id: 'nuevo', createdAt: '', updatedAt: '' });
    try {
      const m = await mount(React.createElement(CultivationFormModal, { isOpen: true, onClose: () => {}, userId: 'u1', geneticsList: [], onSaved: () => {} }));
      const c = m.container;
      const pressed = () => [...c.querySelectorAll('#crop-grow-method button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.id);
      assert(c.querySelectorAll('#crop-grow-method button').length === 4, 'cuatro opciones');
      assert(pressed().join() === 'crop-grow-method-sustrato', `por defecto, del sustrato: ${pressed()}`);
      const sub = c.querySelector('#crop-substrate-type-input') as HTMLInputElement;
      const k = Object.keys(sub).find((x) => x.startsWith('__reactProps'))!;
      await act(async () => (sub as any)[k].onChange({ target: { value: 'Living soil casero' } }));
      assert(pressed().join() === 'crop-grow-method-living_soil', `sigue al texto: ${pressed()}`);
      await click(c.querySelector('#crop-grow-method-hidro'));
      assert(pressed().join() === 'crop-grow-method-hidro', 'lo elegido gana');
      const nameInput = c.querySelector('#crop-name-input') as HTMLInputElement;
      const kn = Object.keys(nameInput).find((x) => x.startsWith('__reactProps'))!;
      await act(async () => (nameInput as any)[kn].onChange({ target: { value: 'Tanque 1' } }));
      await act(async () => (c.querySelector('button[type="submit"]') as HTMLButtonElement).click());
      assert(saved && saved.growMethod === 'hidro', `guardado: ${saved && saved.growMethod}`);
      await m.unmount();

      const e = await mount(React.createElement(CultivationFormModal, { isOpen: true, onClose: () => {}, userId: 'u1', geneticsList: [], onSaved: () => {}, cultivationToEdit: living() }));
      assert(e.container.querySelector('#crop-grow-method-living_soil')?.getAttribute('aria-pressed') === 'true', 'al editar, el guardado');
      await e.unmount();
    } finally {
      cultivationService.createCultivation = origCreate;
    }
  });

  await check('11. Nutrición en living soil: se alimenta la tierra', async () => {
    const calls: string[] = [];
    const orig = { get: fertilizationService.getScheduleByCultivation, save: fertilizationService.saveSchedule };
    (fertilizationService as any).getScheduleByCultivation = async () => (calls.push('get'), null);
    (fertilizationService as any).saveSchedule = async () => (calls.push('save'), null);
    try {
      const tea = { id: 't1', userId: 'u1', cultivationId: 'c1', date: ago(3), volumeLiters: 5, productsUsed: [{ name: 'Té de compost' }], createdAt: '' } as unknown as Watering;
      const m = await mount(React.createElement(FertilizationSectionView, { cultivation: living(), userId: 'u1', waterings: [tea] }));
      const c = m.container;
      assert(c.querySelector('#living-soil-nutrition') && /se alimenta la tierra/.test(c.textContent || ''), 'living soil');
      assert(c.querySelector('#living-soil-card') && /Té de compost/.test(c.textContent || ''), 'sugerencia y enmiendas anotadas');
      assert(calls.length === 0, `no busca ni arma una tabla de fertilizantes: ${calls}`);
      await m.unmount();
    } finally {
      (fertilizationService as any).getScheduleByCultivation = orig.get;
      (fertilizationService as any).saveSchedule = orig.save;
    }
  });

  await check('12. Comunidad: colección "Living soil"', () => {
    const profile = { uid: 'u1', handle: 'agus', displayName: 'Agus', avatarUrl: null, avatarColor: '#1F6F8B' };
    const g = (id: string, c: Cultivation) =>
      buildGrowlog({ id, crop: c, geneticIndex: 0, geneticKey: 'g-a', profile, privacy: 'public', location: null, photos: [], waterings: [], notes: [], envRecords: [], ambient: null, now: new Date(NOW).toISOString() });
    const ls = g('g1', crop({ growMethod: 'living_soil' }));
    assert(ls.medium === 'living' && ls.crop.growMethod === 'living_soil', `medium ${ls.medium}`);
    assert(g('g2', hydro()).medium === 'hidro' && g('g3', crop({ substrate: { type: 'Tierra', potVolumeLiters: 20, potType: 'Geotextil' } })).medium === 'tierra', 'hidroponía y tierra');
    const { sections } = exploreSections([growlogCard(ls), growlogCard(g('g2', hydro()))], new Date(NOW));
    const living = sections.find((s) => s.id === 'living');
    assert(living && living.title === 'Living soil' && living.growlogs.length === 1 && living.growlogs[0].id === 'g1', JSON.stringify(sections.map((s) => [s.id, s.growlogs.length])));
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
