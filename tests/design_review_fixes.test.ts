/**
 * tests/design_review_fixes.test.ts
 *
 * SUITE: ARREGLOS DE LA CRÍTICA DE DISEÑO
 *
 *  1. Para hoy: la misma tarea en varias plantas del mismo ambiente es una sola fila; el riego no se junta.
 *  2. Para hoy en pantalla: dice el ambiente, se marca de una vez y abre el ambiente.
 *  3. Riego: los litros primero, cuándo en una línea y Guardar siempre a la vista.
 *  4. Genética: los botones se reparten el ancho y nada ensancha la pantalla.
 *  5. Campana: sin palabras técnicas, alertas agrupadas y "Activar" anota el celular de verdad.
 *  6. Preferencias: estilo claro, palabras simples, y guarda lo mismo que antes.
 *  7. Cultivo en un ambiente: primero lo que más se hace, lo raro al final y sin repetir luz ni ventana de riego.
 *  8. Cultivo sin ambiente: sigue teniendo su luz y su ventana de riego (no tiene otras pantallas).
 *  9. Contraste: los textos que no se leían ya no existen, y los colores llegan al mínimo.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import type { Cultivation, CultivationTask, Indoor } from '../src/types';
import { addDays, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import { groupTodayTasks } from '../src/utils/todayGroups';
import { taskService } from '../src/services/taskService';
import { indoorService } from '../src/services/indoorService';
import { authService } from '../src/services/authService';
import { pushNotifications } from '../src/services/pushNotifications';
import { TodayTasksCard } from '../src/components/dashboard/TodayTasksCard';
import { WateringModal, whenText } from '../src/components/logs/WateringModal';
import { GeneticDetailView } from '../src/components/indoors/GeneticDetailView';
import { NotificationCenterModal, groupAlerts } from '../src/components/notifications/NotificationCenterModal';
import { UserPreferencesModal } from '../src/components/user/UserPreferencesModal';
import { CultivationDetailView } from '../src/components/cultivations/CultivationDetailView';
import { StatusPill } from '../src/components/common/StatusPill';

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

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());

const today = getLocalTodayDateOnly();
const ago = (d: number) => addDays(today, -d);
const iso = '2026-10-01T00:00:00Z';

const carpa: Indoor = { id: 'in1', userId: 'u1', name: 'Carpa 120', environment: 'indoor', kind: 'carpa', lighting: { type: 'LED', photoperiodHoursLight: 12, photoperiodHoursDark: 12, lightsOnTime: '08:00' }, createdAt: iso, updatedAt: iso };
const crop = (id: string, extra: Partial<Cultivation> = {}): Cultivation =>
  ({
    id, userId: 'u1', name: `Cultivo ${id}`, geneticsName: `Genética ${id}`, startDate: ago(60), type: 'Indoor', photoperiodType: 'Fotoperiódica', plantCount: 1,
    currentStage: 'Vegetativo', stageStartDate: ago(30), substrate: { type: 'Turba', potVolumeLiters: 11, potType: 'Geotextil' },
    lighting: { type: 'LED', photoperiodHoursLight: 18, photoperiodHoursDark: 6 }, status: 'ESTABLE', createdAt: iso, updatedAt: iso, ...extra,
  }) as Cultivation;
const task = (id: string, cultivationId: string, extra: Partial<CultivationTask> = {}): CultivationTask =>
  ({ id, cultivationId, cultivationName: `Cultivo ${cultivationId}`, stage: 'Floración', type: 'defoliation', urgency: 'today', priority: 'medium', isCompleted: false, categoryLabel: 'Poda', title: 'Poda de bajos', description: 'Sacá las hojas de abajo.', dueDate: today, ...extra }) as CultivationTask;

async function run() {
  console.log('\n================================================================');
  console.log('   ARREGLOS DE LA CRÍTICA DE DISEÑO');
  console.log('================================================================\n');

  await check('1. Para hoy: una fila por tarea y ambiente; el riego no se junta', () => {
    const crops = [crop('a', { indoorId: 'in1' }), crop('b', { indoorId: 'in1' }), crop('c', { indoorId: 'in2' }), crop('d')];
    const groups = groupTodayTasks(
      [
        task('t1', 'a'),
        task('t2', 'b'),
        task('t3', 'c'), // otro ambiente
        task('t4', 'd'), // sin ambiente
        task('t5', 'a', { urgency: 'overdue', title: 'Poda de bajos' }), // atrasada: aparte
        task('w1', 'a', { type: 'watering', title: 'Riego' }),
        task('w2', 'b', { type: 'watering', title: 'Riego' }),
      ],
      crops
    );
    assert(groups.length === 6, `filas: ${groups.length}`);
    assert(groups[0].id === 't1' && groups[0].tasks.map((t) => t.id).join() === 't1,t2' && groups[0].indoorId === 'in1', JSON.stringify(groups[0]));
    assert(groups.filter((g) => g.tasks[0].type === 'watering').every((g) => g.tasks.length === 1), 'cada riego se anota por separado');
    assert(groups.find((g) => g.id === 't5')?.isLate === true, 'la atrasada va aparte');
  });

  await check('2. Para hoy en pantalla: dice el ambiente, se marca de una vez y abre el ambiente', async () => {
    const realFetchTasks = taskService.fetchServerTasks;
    const alerts = [task('al1', 'a', { type: 'env_alert', title: 'Humedad alta' }), task('al2', 'b', { type: 'env_alert', title: 'Humedad alta' })];
    taskService.fetchServerTasks = async () => alerts;
    const crops = [crop('a', { indoorId: 'in1' }), crop('b', { indoorId: 'in1' })];
    // regados ayer: no aparecen tareas de riego
    const waterings = crops.map((c) => ({ id: `w-${c.id}`, userId: 'u1', cultivationId: c.id, date: today, volumeLiters: 1, createdAt: iso })) as any[];
    const opened: string[] = [];
    localStorage.clear();
    try {
      const m = await mount(React.createElement(TodayTasksCard, { cultivations: crops, waterings, envRecords: [], userId: 'u-hoy', indoors: [carpa], onOpenIndoor: (i: Indoor) => opened.push(i.id) }));
      const row = m.container.querySelector('li[data-task-id="al1"]');
      assert(row?.getAttribute('data-task-count') === '2' && /Carpa 120 · 2 genéticas · hoy/.test(row.textContent || ''), row?.textContent || 'sin fila');
      assert(!m.container.querySelector('li[data-task-id="al2"]'), 'la segunda no se repite');
      await click(row?.querySelector('button'));
      assert(opened.join() === 'in1', 'tocarla abre el ambiente');
      await click(row?.querySelector('button[aria-label^="Marcar hecha"]'));
      const done = Object.keys(taskService.getCompletedTaskMap('u-hoy'));
      assert(done.includes('al1') && done.includes('al2'), `se marcan las dos: ${done}`);
      await m.unmount();
    } finally {
      taskService.fetchServerTasks = realFetchTasks;
      localStorage.clear();
    }
  });

  await check('3. Riego: los litros primero, cuándo en una línea y Guardar siempre a la vista', async () => {
    assert(whenText(today, '19:41', today) === 'Hoy, 19:41' && whenText(ago(1), '10:00', today) === 'Ayer, 10:00' && /^3 nov\.?, 10:00$/.test(whenText('2026-11-03', '10:00', '2026-11-20')), whenText('2026-11-03', '10:00', '2026-11-20'));
    const m = await mount(React.createElement(WateringModal, { isOpen: true, onClose: () => {}, userId: 'u1', cultivations: [crop('a')], onWateringAdded: () => {} }));
    const q = (s: string) => m.container.querySelector(s) as HTMLElement;
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & 4);
    assert(follows(q('#watering-crop-select'), q('#watering-volume-input')) && follows(q('#watering-volume-input'), q('#watering-when')), 'cultivo, litros y cuándo');
    assert(/Cuándo: Hoy, /.test(q('#watering-when').textContent || ''), q('#watering-when').textContent || '');
    assert((q('#watering-when-fields') as HTMLElement).hidden, 'fecha y hora quedan cerradas');
    await click(q('#watering-when-toggle'));
    assert(!(q('#watering-when-fields') as HTMLElement).hidden && q('#watering-date-input'), 'se abren al tocar Cambiar');
    const actions = q('#watering-actions');
    assert(/\bsticky\b/.test(actions.className) && /\bbottom-0\b/.test(actions.className) && actions.contains(q('#save-watering-btn')), actions.className);
    assert(actions.parentElement?.lastElementChild === actions, 'el pie es lo último del formulario');
    await m.unmount();
  });

  await check('4. Genética: los botones se reparten el ancho y nada ensancha la pantalla', async () => {
    const c = crop('a', { indoorId: 'in1' });
    const m = await mount(React.createElement(GeneticDetailView, { ambient: carpa, ambients: [carpa], crop: c, index: 0, userId: 'u1', onBack: () => {}, onOpenCrop: () => {}, onWater: () => {} }));
    const buttons = [...m.container.querySelectorAll('#genetic-actions button')];
    assert(buttons.length === 3 && buttons.every((b) => b.classList.contains('cultiveta-btn-row')), buttons.map((b) => b.className).join(' | '));
    await m.unmount();
    const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
    const rule = (name: string) => css.slice(css.indexOf(`${name} {`), css.indexOf('}', css.indexOf(`${name} {`)));
    assert(/flex: 1 1 0/.test(rule('.cultiveta-btn-row')) && /min-width: 0/.test(rule('.cultiveta-btn-row')), rule('.cultiveta-btn-row'));
    assert(/overflow-x: clip/.test(rule('.cultiveta-app-shell')), rule('.cultiveta-app-shell'));
  });

  // Navegador con push, para la sección "Avisos al celular"
  const nav = navigator as any;
  Object.defineProperty(nav, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14) Chrome/130', configurable: true });
  Object.defineProperty(nav, 'maxTouchPoints', { value: 5, configurable: true });
  Object.defineProperty(nav, 'serviceWorker', { value: {}, configurable: true });
  (window as any).PushManager = function () {};
  let askedByModal = 0;
  (window as any).Notification = (globalThis as any).Notification = { permission: 'default', requestPermission: async () => (askedByModal++, 'granted') };
  const settings = { resumen: true, summaryHour: 9, clima: true, equipos: true, comunidad: true };
  const realPush = { ...pushNotifications };
  const realFetch = globalThis.fetch;

  await check('5. Campana: sin palabras técnicas, alertas agrupadas y "Activar" anota el celular de verdad', async () => {
    const at = new Date().toISOString();
    const alerts = [task('a1', 'a', { type: 'env_alert', title: 'Humedad alta', createdAt: at }), task('a2', 'b', { type: 'env_alert', title: 'Humedad alta', createdAt: at }), task('a3', 'b', { type: 'env_alert', title: 'Frío', createdAt: at })];
    assert(groupAlerts(alerts).map((g) => `${g.title}:${g.crops.length}`).join() === 'Humedad alta:2,Frío:1', JSON.stringify(groupAlerts(alerts)));

    let enabled = 0;
    let subscribed = false;
    Object.assign(pushNotifications, {
      status: async () => ({ configured: true, subscribed, devices: [], settings, publicKey: 'BKey' }),
      enable: async () => (enabled++, (subscribed = true), { configured: true, subscribed: true, devices: ['Android'], settings, publicKey: 'BKey' }),
    });
    globalThis.fetch = (async () => new Response(JSON.stringify(alerts), { status: 200 })) as any;
    const selected: string[] = [];
    const prefs: number[] = [];
    try {
      const m = await mount(React.createElement(NotificationCenterModal, { isOpen: true, onClose: () => {}, userId: 'u1', onSelectCultivation: (id: string) => selected.push(id), onOpenPreferences: () => prefs.push(1) }));
      const text = m.container.textContent || '';
      for (const word of ['cron', 'env_alert', 'SSE', 'Service Worker', 'Firestore', 'Simular']) assert(!text.includes(word), `todavía dice "${word}"`);
      assert(!/zinc-|#0F0F0F/.test(m.container.innerHTML), 'sigue el estilo oscuro');
      const groups = m.container.querySelectorAll('[data-alert-group]');
      assert(groups.length === 2 && /2 cultivos/.test(groups[0].textContent || ''), `grupos: ${groups.length}`);
      await click(groups[1].querySelector('button'));
      assert(selected.join() === 'b', 'abre el cultivo');
      await click(m.container.querySelector('#push-enable'));
      assert(enabled === 1 && askedByModal === 0, `activó ${enabled}, permiso suelto ${askedByModal}`);
      await click(m.container.querySelector('#push-open-preferences'));
      assert(prefs.length === 1, 'ya activado: lleva a elegir qué avisos llegan');
      await m.unmount();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  await check('6. Preferencias: estilo claro, palabras simples, y guarda lo mismo que antes', async () => {
    const realUpdate = authService.updateUserPreferences;
    const saved: any[] = [];
    authService.updateUserPreferences = (async (_uid: string, p: any) => void saved.push(p)) as any;
    try {
      const profile: any = { uid: 'u1', email: 'a@b.c', displayName: 'Agus', preferences: { tempUnit: 'C', volumeUnit: 'L', advancedMode: true, alertTypes: { climateAlerts: true, wateringAlerts: false, calendarReminders: true, soundEnabled: true } } };
      const m = await mount(React.createElement(UserPreferencesModal, { isOpen: true, onClose: () => {}, userProfile: profile }));
      const text = m.container.textContent || '';
      for (const word of ['Firestore', 'Cron', 'Gemini', 'Elige', 'deseas']) assert(!text.includes(word), `todavía dice "${word}"`);
      assert(!/zinc-|#0F0F0F|amber-|cyan-/.test(m.container.innerHTML), 'sigue el estilo oscuro');
      assert(!(m.container.querySelector('#toggle-watering-alerts') as HTMLInputElement).checked, 'lee lo guardado');
      await click(m.container.querySelector('#toggle-climate-alerts'));
      await click(m.container.querySelector('#save-preferences-btn'));
      const p = saved[0];
      assert(p?.alertTypes.climateAlerts === false && p.alertTypes.wateringAlerts === false && p.advancedMode === true && p.tempUnit === 'C', JSON.stringify(p));
      await m.unmount();
    } finally {
      authService.updateUserPreferences = realUpdate;
    }
  });

  Object.assign(pushNotifications, realPush);
  const cropProps = {
    userId: 'u1', waterings: [], envRecords: [], photos: [], diaryEntries: [], onBack: () => {}, onEditCultivation: () => {}, onDeleteCultivation: () => {}, onOpenWateringModal: () => {},
    onOpenEnvModal: () => {}, onOpenPhotoModal: () => {}, onOpenDiaryModal: () => {}, onHarvestFinalized: () => {},
  };

  await check('7. Cultivo en un ambiente: primero lo que más se hace, lo raro al final y sin repetir', async () => {
    const realGet = indoorService.getIndoors;
    const list = [carpa];
    (indoorService as any).getIndoors = () => list;
    const opened: string[] = [];
    try {
      const m = await mount(React.createElement(CultivationDetailView as any, { ...cropProps, cultivation: crop('a', { indoorId: 'in1' }), onOpenIndoor: (id: string) => opened.push(id) }));
      const q = (s: string) => m.container.querySelector(s) as HTMLElement;
      const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & 4);
      assert(follows(q('#crop-back-btn'), q('#crop-quick-actions')) && follows(q('#crop-quick-actions'), q('#crop-today')), 'volver, acciones y hoy');
      assert(!/Último Riego/.test(q('#crop-today').textContent || ''), 'hoy no repite el último riego');
      const more = q('#crop-more-actions');
      assert(more.contains(q('#finalize-crop-btn')) && more.contains(q('#open-calendar-sync-btn')) && more.contains(q('#edit-crop-btn')) && more.contains(q('#delete-crop-btn')), 'lo raro va junto');
      assert(follows(q('#crop-tabs'), more), 'y va al final');
      assert(!q('#crop-irrigation-forecast'), 'la ventana de riego está en la genética');
      assert(!q('[id^="light-"]'), 'la luz está en el ambiente');
      assert(!q('#feed-target'), 'pH y EC están en la genética');
      await click(q('#crop-see-ambient'));
      assert(opened.join() === 'in1', 'lleva al ambiente');
      const tabs = [...m.container.querySelectorAll('#crop-tabs button')];
      assert(tabs.length === 7 && tabs.every((b) => /whitespace-nowrap/.test(b.className) && /min-h-11/.test(b.className)), 'pestañas en una línea y cómodas');
      assert(!/[\u{1F300}-\u{1FAFF}⏱]/u.test(tabs.map((b) => b.textContent).join()), 'sin emojis');
      await m.unmount();
    } finally {
      (indoorService as any).getIndoors = realGet;
    }
  });

  await check('8. Cultivo sin ambiente: sigue teniendo su luz y su ventana de riego', async () => {
    const m = await mount(React.createElement(CultivationDetailView as any, { ...cropProps, cultivation: crop('a') }));
    assert(m.container.querySelector('#crop-irrigation-forecast'), 'ventana de riego');
    assert(m.container.querySelector('#feed-target'), 'pH y EC');
    assert(m.container.querySelector('[id^="light-"]'), 'luz');
    assert(!m.container.querySelector('#crop-see-ambient'), 'no hay ambiente al que ir');
    await m.unmount();
  });

  await check('9. Contraste: los textos que no se leían ya no existen, y los colores llegan al mínimo', async () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
      });
    const bad: string[] = [];
    for (const f of walk('src/components')) {
      const t = fs.readFileSync(f, 'utf8');
      if (/\btext-ok(?![-\w/])/.test(t)) bad.push(`${f}: text-ok`);
      if (/\btext-coral(?![-\w/])/.test(t)) bad.push(`${f}: text-coral`);
      if (/\bbg-coral(\s+hover:\S+)?\s+text-white/.test(t)) bad.push(`${f}: blanco sobre coral`);
    }
    assert(bad.length === 0, bad.join(', '));

    const css = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
    const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const [fg, bg] of [['ink-subtle', 'card'], ['ink-subtle', 'surface'], ['ink-muted', 'surface'], ['ok-ink', 'ok-bg'], ['error', 'card'], ['brand', 'surface']]) {
      assert(ratio(token(fg), token(bg)) >= 4.5, `${fg} sobre ${bg}: ${ratio(token(fg), token(bg)).toFixed(2)}`);
    }
    assert(ratio('#FFFFFF', token('error')) >= 4.5, 'blanco sobre el rojo de los botones');

    const pill = await mount(React.createElement(StatusPill, { status: 'ESTABLE' as any }));
    assert(/text-ok-ink/.test(pill.container.innerHTML) && !/emerald|font-mono|animate-pulse/.test(pill.container.innerHTML), pill.container.innerHTML);
    await pill.unmount();
  });

  console.log('\n================================================================');
  console.log(` RESULTADO ARREGLOS DE DISEÑO: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en design_review_fixes:', err);
  process.exit(1);
});
