/**
 * tests/push_notifications.test.ts
 *
 * SUITE: AVISOS AL CELULAR (Web Push)
 *
 *  1. El resumen del día: qué dice cada tarea, hasta 3 y "y N más", a dónde lleva; nada si no hay tareas.
 *  2. Anotar el celular: solo con el servidor configurado, suscripción válida, como mucho 5, cuál es el equipo.
 *  3. Enviar: a todos los celulares; el que se dio de baja (410) se saca; aviso de prueba.
 *  4. Resumen del día por persona: a su hora (y 2 horas más), una vez por día, nada si está apagado o no hay tareas;
 *     tierra, living soil e hidroponía.
 *  5. Clima, equipos y Comunidad: preferencias, horas de silencio (23 a 8), un me gusta por publicación por hora,
 *     el mismo error de equipos como mucho cada 6 h.
 *  6. Ganchos: la Comunidad avisa cada aviso nuevo de la campana; Equipos avisa un error nuevo de la revisión.
 *  7. Las tareas del Inicio y las del servidor son las mismas.
 *  8. Service worker: muestra el aviso del servidor y al tocarlo abre su lugar.
 *  9. Ajustes → "Avisos al celular": iPhone sin instalar, activar, preferencias, hora, prueba y desactivar.
 * 10. Inicio: la tarjeta "¿Te avisamos cuándo regar?" aparece una sola vez.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import type { Cultivation, CultivationTask, Watering } from '../src/types';
import { addDays, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';
import { MemoryPushStore, PushService, deviceLabel, summaryMessage, type PushSender, type StoredSubscription } from '../src/server/push/pushService';
import { zonedToMs } from '../src/server/devices/tz';
import { buildDailyTasks } from '../src/utils/dailyTasks';
import { taskService } from '../src/services/taskService';
import { CommunityService } from '../src/server/community/communityService';
import { MemoryCommunityDb, MemoryCommunityFiles } from '../src/server/community/communityStore';
import { DeviceService, MemoryDeviceStore } from '../src/server/devices/deviceService';
import { pushNotifications } from '../src/services/pushNotifications';
import { PushSettingsSection } from '../src/components/user/PushSettingsSection';
import { PushPromptCard } from '../src/components/dashboard/PushPromptCard';

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
async function rejects(p: Promise<unknown>, re: RegExp, status?: number) {
  let err: any = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert(err && re.test(err.message) && (status === undefined || err.status === status), `esperaba error ${re} ${status ?? ''}: ${err?.message} ${err?.status ?? ''}`);
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const click = (el: Element | null) => act(async () => (el as HTMLElement).click());
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const TZ = 'America/Argentina/Buenos_Aires';
const today = getLocalTodayDateOnly();
const ago = (d: number) => addDays(today, -d);
const ymd = today.replace(/-/g, '');
/** Hoy a esa hora en Buenos Aires. */
const at = (clock: string) => zonedToMs(ymd, clock, TZ);

function crop(extra: Partial<Cultivation> = {}): Cultivation {
  return {
    id: 'c1', userId: 'u1', name: 'Gelato 33', startDate: ago(40), type: 'Indoor', plantCount: 1, currentStage: 'Vegetativo', stageStartDate: ago(30),
    substrate: { type: 'Coco', potVolumeLiters: 11, potType: 'Geotextil' }, status: 'Saludable', createdAt: '', updatedAt: '', ...extra,
  } as Cultivation;
}
const water = (cultivationId: string, daysAgo: number, extra: Partial<Watering> = {}): Watering =>
  ({ id: `w-${cultivationId}-${daysAgo}`, userId: 'u1', cultivationId, date: ago(daysAgo), time: '10:00', volumeLiters: 1, createdAt: '', ...extra }) as Watering;
const task = (extra: Partial<CultivationTask>): CultivationTask =>
  ({ id: 'x', cultivationId: 'c1', cultivationName: 'Gelato 33', type: 'watering', title: 'Riego', description: '', dueDate: today, urgency: 'today', priority: 'high', isCompleted: false, categoryLabel: '', ...extra }) as CultivationTask;

const SUB = (n: number): any => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh: `BPk${n}aaaa_bbb-ccc`, auth: `au${n}th_x-y` } });

class FakeSender implements PushSender {
  sent: Array<{ endpoint: string; msg: any; urgency: string }> = [];
  gone = new Set<string>();
  async send(sub: StoredSubscription, payload: string, opts: { urgency: string }) {
    if (this.gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    this.sent.push({ endpoint: sub.endpoint, msg: JSON.parse(payload), urgency: opts.urgency });
  }
}

function setup(o: { now?: number; day?: { cultivations: Cultivation[]; waterings: Watering[] }; sender?: boolean } = {}) {
  const clock = { t: o.now ?? at('10:00') };
  const sender = new FakeSender();
  const store = new MemoryPushStore();
  const svc = new PushService({
    store,
    sender: o.sender === false ? null : sender,
    publicKey: o.sender === false ? null : 'BPublicKey',
    timeZone: TZ,
    now: () => clock.t,
    loadDay: async () => ({ cultivations: o.day?.cultivations || [], waterings: o.day?.waterings || [], envRecords: [] }),
  });
  return { clock, sender, store, svc };
}

async function run() {
  console.log('\n🧪 Avisos al celular\n');

  await check('1. El resumen del día: qué dice y a dónde lleva', () => {
    assert(summaryMessage([]) === null && summaryMessage([task({ isCompleted: true }), task({ urgency: 'tomorrow' }), task({ type: 'env_alert' })]) === null, 'sin nada para hoy, nada');
    const one = summaryMessage([task({ urgency: 'overdue' })])!;
    assert(one.title === 'Hoy en Cultiveta: 1 cosa' && one.body === 'Regá Gelato 33 (atrasado)' && one.url === '/cultivos/c1' && one.tag === 'resumen', JSON.stringify(one));
    const many = summaryMessage([
      task({ id: 'tank_c2_x', cultivationId: 'c2', cultivationName: 'Carpa' }),
      task({ id: 'solution_c2_x', cultivationId: 'c2', cultivationName: 'Carpa' }),
      task({ id: 'f', type: 'flush' }),
      task({ id: 'd', type: 'defoliation' }),
      task({ id: 'h', type: 'harvest' }),
    ])!;
    assert(many.title === 'Hoy en Cultiveta: 5 cosas' && many.body === 'Revisá el tanque de Carpa · cambiá la solución de Carpa · lavado de raíces de Gelato 33 y 2 más' && many.url === '/', JSON.stringify(many));
    assert(deviceLabel('Mozilla/5.0 (Linux; Android 14)') === 'Android' && deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') === 'iPhone' && deviceLabel('') === 'Computadora', 'equipos');
  });

  await check('2. Anotar el celular', async () => {
    const off = setup({ sender: false });
    assert(off.svc.key() === null && !(await off.svc.status('u1')).configured, 'sin claves, no configurado');
    await rejects(off.svc.subscribe('u1', SUB(1)), /todavía no están configurados/, 503);
    const { svc } = setup();
    await rejects(svc.subscribe('u1', { ...SUB(1), endpoint: 'http://inseguro/x' }), /no mandó una suscripción válida/, 400);
    await rejects(svc.subscribe('u1', { ...SUB(1), keys: { p256dh: 'con espacios', auth: 'x' } }), /no mandó una suscripción válida/);
    const st = await svc.subscribe('u1', SUB(1), 'Mozilla/5.0 (Linux; Android 14)');
    assert(st.subscribed && st.devices.join() === 'Android' && st.settings.resumen && st.settings.summaryHour === 9, JSON.stringify(st));
    await svc.subscribe('u1', SUB(1), 'Mozilla/5.0 (Linux; Android 14)');
    assert((await svc.status('u1')).devices.length === 1, 'el mismo celular no se repite');
    for (let i = 2; i <= 7; i++) await svc.subscribe('u1', SUB(i));
    const all = await svc.status('u1', SUB(1).endpoint);
    assert(all.devices.length === 5 && !all.subscribed, 'como mucho 5 (los más viejos salen)');
    const un = await svc.unsubscribe('u1', SUB(7).endpoint);
    assert(!un.subscribed && un.devices.length === 4, 'baja');
    await rejects(svc.saveSettings('u1', { summaryHour: 25 }), /0 a 23/);
    const s = await svc.saveSettings('u1', { comunidad: false, summaryHour: 20, raro: true });
    assert(s.comunidad === false && s.summaryHour === 20 && s.clima && !('raro' in s), JSON.stringify(s));
  });

  await check('3. Enviar: a todos, sacar al que se dio de baja, aviso de prueba', async () => {
    const { svc, sender } = setup();
    await rejects(svc.test('u1'), /Primero activá/);
    await svc.subscribe('u1', SUB(1));
    await svc.subscribe('u1', SUB(2));
    sender.gone.add(SUB(2).endpoint);
    const r = await svc.test('u1');
    assert(r.sent === 1 && sender.sent[0].msg.title === '¡Listo! Los avisos funcionan' && sender.sent[0].urgency === 'high', JSON.stringify(sender.sent));
    assert((await svc.status('u1')).devices.length === 1, 'el que dio 410 se sacó');
    sender.gone.add(SUB(1).endpoint);
    await rejects(svc.test('u1'), /Volvé a activar/, 502);
  });

  await check('4. Resumen del día: a su hora, una vez, según el método', async () => {
    const day = { cultivations: [crop(), crop({ id: 'c9', name: 'Vieja', isFinished: true })], waterings: [water('c1', 12)] };
    const env = setup({ now: at('08:30'), day });
    await env.svc.subscribe('u1', SUB(1));
    await env.svc.dailySummaries();
    assert(env.sender.sent.length === 0, 'antes de las 9, nada');
    env.clock.t = at('09:05');
    const r = await env.svc.dailySummaries();
    assert(r.sent === 1 && env.sender.sent.length === 1, 'a las 9 sale');
    const msg = env.sender.sent[0].msg;
    assert(/^Hoy en Cultiveta/.test(msg.title) && /Regá Gelato 33/.test(msg.body) && !/Vieja/.test(msg.body) && msg.url === '/cultivos/c1', JSON.stringify(msg));
    env.clock.t = at('10:05');
    await env.svc.dailySummaries();
    assert(env.sender.sent.length === 1, 'una sola vez por día');

    const late = setup({ now: at('11:30'), day });
    await late.svc.subscribe('u1', SUB(1));
    await late.svc.dailySummaries();
    assert(late.sender.sent.length === 1, 'si a las 9 no corrió, sale hasta las 11');
    const tooLate = setup({ now: at('12:10'), day });
    await tooLate.svc.subscribe('u1', SUB(1));
    await tooLate.svc.dailySummaries();
    assert(tooLate.sender.sent.length === 0, 'después ya no');

    const offEnv = setup({ now: at('09:05'), day });
    await offEnv.svc.subscribe('u1', SUB(1));
    await offEnv.svc.saveSettings('u1', { resumen: false });
    await offEnv.svc.dailySummaries();
    assert(offEnv.sender.sent.length === 0, 'apagado, nada');

    const nothing = setup({ now: at('09:05'), day: { cultivations: [crop({ currentStage: 'Secado' as any })], waterings: [] } });
    await nothing.svc.subscribe('u1', SUB(1));
    assert((await nothing.svc.dailySummaries()).sent === 0 && nothing.sender.sent.length === 0, 'sin tareas, sin aviso');

    const hydro = setup({ now: at('09:05'), day: { cultivations: [crop({ growMethod: 'hidro', name: 'Carpa DWC' })], waterings: [water('c1', 3, { phIn: 5.8, ecIn: 1.6 })] } });
    await hydro.svc.subscribe('u1', SUB(1));
    await hydro.svc.dailySummaries();
    assert(/Revisá el tanque de Carpa DWC/.test(hydro.sender.sent[0]?.msg.body || ''), JSON.stringify(hydro.sender.sent));

    const living = setup({ now: at('09:05'), day: { cultivations: [crop({ growMethod: 'living_soil', name: 'Tierra viva' })], waterings: [water('c1', 12)] } });
    await living.svc.subscribe('u1', SUB(1));
    await living.svc.dailySummaries();
    assert(/Regá Tierra viva/.test(living.sender.sent[0]?.msg.body || ''), JSON.stringify(living.sender.sent));
  });

  await check('5. Clima, equipos y Comunidad', async () => {
    const { svc, sender, clock } = setup({ now: at('14:00') });
    await svc.subscribe('u1', SUB(1));
    await svc.climateAlert('u1', { title: 'Alerta Crítica: Temperatura Alta (34°C)', description: 'Ventilá.', cultivationId: 'c1' });
    assert(sender.sent[0].msg.url === '/cultivos/c1' && sender.sent[0].urgency === 'high', 'clima');
    const like = { kind: 'like' as const, fromHandle: 'luna', growlogId: 'g1', growlogTitle: 'Gelato 33', text: null };
    await svc.communityNotice('u1', like);
    await svc.communityNotice('u1', like);
    assert(sender.sent.filter((s) => s.msg.tag === 'like-g1').length === 1 && sender.sent[1].msg.title === 'A @luna le gustó tu growlog' && sender.sent[1].msg.url === '/comunidad/growlog/g1', 'un me gusta por publicación por hora');
    clock.t += 61 * 60_000;
    await svc.communityNotice('u1', like);
    assert(sender.sent.filter((s) => s.msg.tag === 'like-g1').length === 2, 'pasada la hora, otro');
    await svc.communityNotice('u1', { kind: 'follow', fromHandle: 'luna', growlogId: null, growlogTitle: null, text: null });
    assert(sender.sent.at(-1)!.msg.url === '/comunidad/growers/luna', 'seguidor: su perfil');

    await svc.deviceProblem('u1', 'Smart Life no responde');
    await svc.deviceProblem('u1', 'Smart Life no responde');
    assert(sender.sent.filter((s) => s.msg.tag === 'equipos-error').length === 1 && sender.sent.at(-1)!.msg.url === '/equipos', 'el mismo error, una vez');
    await svc.deviceProblem('u1', 'Shelly no responde');
    assert(sender.sent.filter((s) => s.msg.tag === 'equipos-error').length === 2, 'otro error, sí');

    // De noche: Comunidad y riego automático no suenan; clima y errores sí
    clock.t = at('03:00') + 86_400_000;
    const n = sender.sent.length;
    await svc.communityNotice('u1', { kind: 'comment', fromHandle: 'luna', growlogId: 'g1', growlogTitle: 'Gelato', text: 'Hermosa' });
    await svc.autoWatering('u1', 'c1', 'Gelato 33', 1.5);
    assert(sender.sent.length === n, 'de noche, silencio');
    await svc.climateAlert('u1', { title: 'Helada', description: 'Tapala.', cultivationId: 'c1' });
    assert(sender.sent.length === n + 1, 'el clima suena igual');
    clock.t = at('15:00');
    await svc.autoWatering('u1', 'c1', 'Gelato 33', 1.5);
    assert(sender.sent.at(-1)!.msg.body === 'Se regó Gelato 33 (1,5 L).', sender.sent.at(-1)!.msg.body);

    await svc.saveSettings('u1', { clima: false, comunidad: false, equipos: false });
    const m = sender.sent.length;
    await svc.climateAlert('u1', { title: 'x', description: 'y', cultivationId: 'c1' });
    await svc.communityNotice('u1', { kind: 'comment', fromHandle: 'luna', growlogId: 'g1', growlogTitle: 'Gelato', text: 'Hola' });
    await svc.deviceProblem('u1', 'Otro error');
    assert(sender.sent.length === m, 'apagados, nada');
  });

  await check('6. Ganchos: Comunidad y Equipos', async () => {
    const community = new CommunityService(new MemoryCommunityDb(), new MemoryCommunityFiles(), () => new Date('2026-11-01T12:00:00Z'));
    const notices: any[] = [];
    community.onNotice = (to, n) => void notices.push({ to, ...n });
    await community.saveProfile('u1', { handle: 'agus_grow', displayName: 'Agus', acceptRules: true } as any);
    await community.saveProfile('u2', { handle: 'luna', displayName: 'Luna', acceptRules: true } as any);
    await community.follow('u2', { uid: 'u1', follow: true });
    assert(notices.length === 1 && notices[0].to === 'u1' && notices[0].kind === 'follow' && notices[0].fromHandle === 'luna', JSON.stringify(notices));

    const problems: string[] = [];
    const now = { t: zonedToMs('20261031', '10:00', TZ) };
    const devices = new DeviceService({ store: new MemoryDeviceStore(), now: () => now.t, onProblem: (_u, text) => void problems.push(text) });
    await devices.connectTuya('u1', { mock: true });
    await devices.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 18, darkHours: 6, anchorMs: now.t - 3_600_000, timeZone: TZ } });
    await devices.tick('u1');
    assert(problems.length === 0, 'sin errores, sin aviso');
    delete (devices.mockOf('u1') as any).devices.mockstrip01;
    now.t += 30 * 60_000;
    await devices.tick('u1');
    assert(problems.length === 1 && problems[0].length > 0, `error nuevo: ${JSON.stringify(problems)}`);
    now.t += 30 * 60_000;
    await devices.tick('u1');
    assert(problems.length === 1, 'el mismo error no se repite en cada revisión');
  });

  await check('7. Las tareas del Inicio y las del servidor son las mismas', () => {
    localStorage.clear();
    const crops = [crop(), crop({ id: 'c2', name: 'Tanque', growMethod: 'hidro' }), crop({ id: 'c3', name: 'Flora', currentStage: 'Floración', stageStartDate: ago(58), floweringStartDate: ago(58), declaredFloweringWeeks: 9 })];
    const ws = [water('c1', 12), water('c2', 3)];
    const strip = (ts: CultivationTask[]) => JSON.stringify(ts.map((t) => [t.id, t.title, t.urgency]));
    assert(strip(taskService.getTasksForDashboard(crops, ws, [], 'u1')) === strip(buildDailyTasks(crops, ws, [])), 'iguales');
  });

  await check('8. Service worker: muestra el aviso y al tocarlo abre su lugar', async () => {
    const handlers: Record<string, (e: any) => void> = {};
    const shown: any[] = [];
    const opened: string[] = [];
    const posted: any[] = [];
    let clientList: any[] = [];
    const self: any = {
      addEventListener: (type: string, fn: any) => (handlers[type] = fn),
      registration: { showNotification: async (title: string, options: any) => void shown.push({ title, options }) },
      clients: { matchAll: async () => clientList, openWindow: async (url: string) => void opened.push(url), claim: async () => {} },
      location: { origin: 'https://cultiveta.ai.studio' },
      skipWaiting: () => {},
    };
    vm.runInNewContext(fs.readFileSync(path.resolve('public/sw.js'), 'utf8'), { self, caches: {}, fetch: async () => ({}), URL, console });
    const wait: Promise<any>[] = [];
    handlers.push({ data: { json: () => ({ title: 'Hoy en Cultiveta: 1 cosa', body: 'Regá Gelato 33', url: '/cultivos/c1', tag: 'resumen' }) }, waitUntil: (p: Promise<any>) => wait.push(p) });
    await Promise.all(wait);
    assert(shown[0].title === 'Hoy en Cultiveta: 1 cosa' && shown[0].options.body === 'Regá Gelato 33' && shown[0].options.tag === 'resumen' && shown[0].options.data.url === '/cultivos/c1', JSON.stringify(shown));
    handlers.push({ data: { json: () => ({ title: 'x', body: 'y', url: 'https://otro-sitio.com' }) }, waitUntil: (p: Promise<any>) => wait.push(p) });
    await Promise.all(wait);
    assert(shown[1].options.data.url === '/', 'solo lugares de la app');
    const notification = (url: string) => ({ notification: { close: () => {}, data: { url } }, waitUntil: (p: Promise<any>) => wait.push(p) });
    handlers.notificationclick(notification('/equipos'));
    await Promise.all(wait);
    assert(opened[0] === '/equipos', 'cerrada: se abre ahí');
    clientList = [{ focus: async () => {}, postMessage: (m: any) => posted.push(m) }];
    handlers.notificationclick(notification('/comunidad/growlog/g1'));
    await Promise.all(wait);
    assert(posted[0].type === 'NOTIFICATION_CLICKED' && posted[0].data.url === '/comunidad/growlog/g1' && opened.length === 1, 'abierta: va a ese lugar');
  });

  // Navegador con push: service worker, PushManager y permiso
  const nav = navigator as any;
  const setBrowser = (o: { ua?: string; push?: boolean; permission?: NotificationPermission }) => {
    Object.defineProperty(nav, 'userAgent', { value: o.ua || 'Mozilla/5.0 (Linux; Android 14) Chrome/130', configurable: true });
    Object.defineProperty(nav, 'maxTouchPoints', { value: 5, configurable: true });
    if (o.push === false) {
      delete nav.serviceWorker;
      delete (window as any).PushManager;
      delete (window as any).Notification;
      delete (globalThis as any).Notification;
      return;
    }
    Object.defineProperty(nav, 'serviceWorker', { value: {}, configurable: true });
    (window as any).PushManager = function () {};
    (window as any).Notification = (globalThis as any).Notification = { permission: o.permission || 'default', requestPermission: async () => 'granted' };
  };
  const real = { ...pushNotifications };
  const settings = { resumen: true, summaryHour: 9, clima: true, equipos: true, comunidad: true };
  const calls: any[] = [];
  const mockApi = (subscribed: boolean, configured = true) => {
    Object.assign(pushNotifications, {
      status: async () => ({ configured, subscribed, devices: subscribed ? ['Android'] : [], settings: { ...settings }, publicKey: 'BKey' }),
      enable: async () => (calls.push('enable'), { configured: true, subscribed: true, devices: ['Android'], settings: { ...settings }, publicKey: 'BKey' }),
      disable: async () => void calls.push('disable'),
      test: async () => void calls.push('test'),
      saveSettings: async (p: any) => (calls.push(p), { ...settings, ...p }),
    });
  };

  await check('9. Ajustes → "Avisos al celular"', async () => {
    try {
      setBrowser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari' });
      mockApi(false);
      let m = await mount(React.createElement(PushSettingsSection, {}));
      await flush();
      assert(m.container.querySelector('#push-ios-steps') && /Agregar a inicio/.test(m.container.textContent || '') && !m.container.querySelector('#push-enable'), 'iPhone sin instalar: los pasos');
      await m.unmount();

      setBrowser({ permission: 'denied' });
      m = await mount(React.createElement(PushSettingsSection, {}));
      await flush();
      assert(m.container.querySelector('#push-denied') && !m.container.querySelector('#push-enable'), 'bloqueados: cómo habilitarlos');
      await m.unmount();

      setBrowser({});
      mockApi(false, false);
      m = await mount(React.createElement(PushSettingsSection, {}));
      await flush();
      assert(/todavía no están activos/.test(m.container.textContent || '') && !m.container.querySelector('#push-enable'), 'servidor sin claves');
      await m.unmount();

      mockApi(false);
      const toasts: string[] = [];
      m = await mount(React.createElement(PushSettingsSection, { onShowToast: (t: string) => void toasts.push(t) }));
      await flush();
      const c = m.container;
      assert(c.querySelector('#push-settings')?.getAttribute('data-subscribed') === 'false' && c.querySelector('#push-enable'), 'botón para activar');
      await click(c.querySelector('#push-enable'));
      assert(calls.includes('enable') && c.querySelector('#push-settings')?.getAttribute('data-subscribed') === 'true' && /Activados/.test(c.textContent || ''), 'activado');
      assert(c.querySelectorAll('#push-settings ul li').length === 4 && (c.querySelector('#push-summary-hour') as HTMLSelectElement).value === '9', 'cuatro avisos y la hora');
      await click(c.querySelector('#push-toggle-comunidad'));
      assert(calls.some((x) => x?.comunidad === false) && !(c.querySelector('#push-toggle-comunidad') as HTMLInputElement).checked, 'apagar Comunidad');
      // tocar el interruptor (no el texto) también lo cambia
      await click(c.querySelector('#push-toggle-clima')!.nextElementSibling);
      assert(calls.some((x) => x?.clima === false) && !(c.querySelector('#push-toggle-clima') as HTMLInputElement).checked, 'tocar el interruptor');
      const sel = c.querySelector('#push-summary-hour') as HTMLSelectElement;
      await act(async () => {
        sel.value = '20';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert(calls.some((x) => x?.summaryHour === 20), 'la hora');
      await click(c.querySelector('#push-test'));
      assert(calls.includes('test') && /prueba/.test(toasts.join()), 'aviso de prueba');
      await click(c.querySelector('#push-disable'));
      assert(calls.includes('disable') && c.querySelector('#push-enable'), 'desactivar');
      await m.unmount();
    } finally {
      Object.assign(pushNotifications, real);
    }
  });

  await check('10. Inicio: "¿Te avisamos cuándo regar?" una sola vez', async () => {
    try {
      localStorage.clear();
      setBrowser({});
      mockApi(false);
      let m = await mount(React.createElement(PushPromptCard));
      await flush();
      assert(m.container.querySelector('#home-push-prompt')?.getAttribute('data-state') === 'ask' && /¿Te avisamos cuándo regar\?/.test(m.container.textContent || ''), 'aparece');
      await click(m.container.querySelector('#home-push-dismiss'));
      assert(!m.container.querySelector('#home-push-prompt'), '"Ahora no" la esconde');
      await m.unmount();
      m = await mount(React.createElement(PushPromptCard));
      await flush();
      assert(!m.container.querySelector('#home-push-prompt'), 'y no vuelve');
      await m.unmount();

      localStorage.clear();
      calls.length = 0;
      m = await mount(React.createElement(PushPromptCard));
      await flush();
      await click(m.container.querySelector('#home-push-enable'));
      assert(calls.includes('enable') && m.container.querySelector('#home-push-prompt')?.getAttribute('data-state') === 'done' && pushNotifications.promptDismissed(), 'activar desde el Inicio');
      await m.unmount();

      localStorage.clear();
      mockApi(true);
      m = await mount(React.createElement(PushPromptCard));
      await flush();
      assert(!m.container.querySelector('#home-push-prompt'), 'ya activados: no aparece');
      await m.unmount();

      localStorage.clear();
      setBrowser({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari' });
      m = await mount(React.createElement(PushPromptCard));
      await flush();
      assert(m.container.querySelector('#home-push-prompt')?.getAttribute('data-state') === 'ios' && /pantalla de inicio/.test(m.container.textContent || ''), 'iPhone: cómo instalarla');
      await m.unmount();
    } finally {
      Object.assign(pushNotifications, real);
      setBrowser({ push: false });
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
