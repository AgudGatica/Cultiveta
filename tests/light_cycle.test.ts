/**
 * tests/light_cycle.test.ts
 *
 * SUITE: LUZ DEL CULTIVO (src/utils/lightCycle.ts y LightCycleCard), traída de Órbita.
 *
 * 1. Ciclos de 24 h y superciclos: duración de la vuelta.
 * 2. A mano (timer): 18/6 que prende a las 18 → a las 10 de la mañana sigue prendida y apaga a las 12.
 * 3. Un 20/4 que prende a las 8: a las 2 de la mañana está prendida (viene del día anterior) y el día suma 20 h.
 * 4. Superciclo 13/13: cada día de 0 a 24 h suma entre 11 y 13 h; el estado y el próximo encendido.
 * 5. Sin hora (o con una hora inválida) no se calcula nada.
 * 6. Textos: cuenta regresiva y "hoy / mañana / día".
 * 7. Tarjeta sin hora: pide la hora de encendido y la guarda (sin día en un ciclo de 24 h).
 * 8. Tarjeta con hora: PRENDIDA, cuenta regresiva, 7 días, marcas cada 3 h y sin promedio en 24 h.
 * 9. Tarjeta de un superciclo: explica por qué un día no suma las horas de la vuelta.
 * 10. Superciclo sin día de encendido: lo pide.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  cycleMs,
  isDailyCycle,
  lightAnchor,
  lightState,
  lightProjection,
  formatCountdown,
  whenText,
  HOUR_MS,
} from '../src/utils/lightCycle';
import { LightCycleCard } from '../src/components/cultivations/LightCycleCard';
import { scheduleSnapshot, sameSchedule } from '../src/services/devicesService';
import type { Cultivation } from '../src/types';

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

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function crop(lighting: Partial<NonNullable<Cultivation['lighting']>>): Cultivation {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Carpa',
    startDate: '2026-10-01',
    type: 'Indoor',
    plantCount: 1,
    currentStage: 'Vegetativo',
    stageStartDate: '2026-10-01',
    substrate: { type: 'Sustrato', potVolumeLiters: 10, potType: 'Plástico' },
    lighting: { type: 'LED', ...lighting },
    status: 'Saludable',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  } as unknown as Cultivation;
}

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}

async function run() {
  console.log('\n================================================================');
  console.log('   LUZ DEL CULTIVO (TIMER Y SUPERCICLOS)');
  console.log('================================================================\n');

  await check('1. Duración de la vuelta: 24 h en 18/6, 26 h en 13/13', () => {
    assert(cycleMs({ lightHours: 18, darkHours: 6 }).totalMs === 24 * HOUR_MS, '18/6');
    assert(isDailyCycle({ lightHours: 12, darkHours: 12 }), '12/12 es diario');
    assert(!isDailyCycle({ lightHours: 13, darkHours: 13 }), '13/13 no es diario');
  });

  await check('2. 18/6 que prende a las 18: a las 10 está prendida y apaga a las 12', () => {
    const now = at(2026, 10, 31, 10);
    const anchor = lightAnchor({ lightsOnTime: '18:00' }, now)!;
    const s = lightState({ lightHours: 18, darkHours: 6 }, anchor, now);
    assert(s.on && s.nextChange === 'off', `estado ${JSON.stringify(s)}`);
    assert(s.nextChangeAt === at(2026, 10, 31, 12), `apaga a las ${new Date(s.nextChangeAt!).toTimeString()}`);
  });

  await check('3. 20/4 que prende a las 8: a las 2 está prendida y el día suma 20 h', () => {
    const now = at(2026, 10, 31, 2);
    const c = { lightHours: 20, darkHours: 4 };
    const anchor = lightAnchor({ lightsOnTime: '08:00' }, now)!;
    assert(lightState(c, anchor, now).on, 'prendida a las 2');
    const [today] = lightProjection(c, anchor, now, 1);
    assert(today.lightHours === 20, `horas: ${today.lightHours}`);
    assert(today.windows.length === 2, 'dos tramos: hasta las 4 y desde las 8');
  });

  await check('4. Superciclo 13/13: días de 11 a 13 h, apagada y prende a las 18', () => {
    const c = { lightHours: 13, darkHours: 13 };
    const anchor = lightAnchor({ lightsOnTime: '08:00', lightsOnDate: '2026-10-26' }, 0)!;
    const now = at(2026, 10, 31, 15);
    const hours = lightProjection(c, anchor, now, 7).map((d) => d.lightHours);
    assert(JSON.stringify(hours) === JSON.stringify([11, 11, 11, 11, 13, 13, 13]), `horas: ${hours}`);
    const s = lightState(c, anchor, now);
    assert(!s.on && s.nextChangeAt === at(2026, 10, 31, 18), 'apagada hasta las 18');
  });

  await check('5. Sin hora o con una hora inválida no se calcula', () => {
    assert(lightAnchor({}, Date.now()) === null, 'sin hora');
    assert(lightAnchor({ lightsOnTime: '25:00' }, Date.now()) === null, '25:00');
    assert(lightAnchor({ lightsOnTime: 'mañana' }, Date.now()) === null, 'texto');
  });

  await check('6. Cuenta regresiva y "hoy / mañana / día"', () => {
    assert(formatCountdown(2 * HOUR_MS + 5 * 60000 + 3000) === '2:05:03', formatCountdown(2 * HOUR_MS + 5 * 60000 + 3000));
    const now = at(2026, 10, 31, 15);
    assert(whenText(at(2026, 10, 31, 18), now) === 'hoy 18:00', 'hoy');
    assert(whenText(at(2026, 11, 1, 2), now) === 'mañana 02:00', 'mañana');
    assert(whenText(at(2026, 11, 2, 20), now) === 'lun 2 20:00', whenText(at(2026, 11, 2, 20), now));
  });

  await check('7. Sin hora: pide la hora de encendido y la guarda sin día (ciclo de 24 h)', async () => {
    const saved: any[] = [];
    const { container, unmount } = await mount(
      React.createElement(LightCycleCard, { cultivation: crop({ photoperiodHoursLight: 18, photoperiodHoursDark: 6 }), onSaveSchedule: (s: any) => { saved.push(s); }, now: at(2026, 10, 31, 10) })
    );
    const input = container.querySelector('#light-on-time') as HTMLInputElement;
    assert(input, 'falta el campo de hora');
    assert(!container.querySelector('#light-on-date'), 'en 24 h no pide día');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '20:00');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => (container.querySelector('#save-light-schedule') as HTMLButtonElement).click());
    assert(saved.length === 1 && saved[0].lightsOnTime === '20:00' && saved[0].lightsOnDate === '', `guardado: ${JSON.stringify(saved)}`);
    await unmount();
  });

  await check('8. Con hora: PRENDIDA, cuenta regresiva, 7 días, marcas cada 3 h y sin promedio', async () => {
    const { container, unmount } = await mount(
      React.createElement(LightCycleCard, { cultivation: crop({ photoperiodHoursLight: 18, photoperiodHoursDark: 6, lightsOnTime: '18:00' }), onSaveSchedule: () => {}, onConnectPlug: () => {}, now: at(2026, 10, 31, 10) })
    );
    assert(container.querySelector('#light-state-pill')?.textContent === 'PRENDIDA', 'PRENDIDA');
    assert(container.querySelector('#light-countdown')?.textContent === 'Se apaga en 2:00:00', container.querySelector('#light-countdown')?.textContent || '');
    assert(container.querySelectorAll('.light-day').length === 7, '7 días');
    assert([...container.querySelectorAll('.light-tick')].map((x) => x.textContent).join(',') === '0,3,6,9,12,15,18,21,24', 'marcas');
    assert(!/promedio/i.test(container.textContent || ''), 'sin promedio en 24 h');
    assert(!container.querySelector('#light-shift-note'), 'en 24 h no hace falta la nota del superciclo');
    assert(container.querySelector('#connect-plug'), 'botón para conectar el enchufe');
    await unmount();
  });

  await check('9. Superciclo con día: explica por qué un día no suma las 13 h', async () => {
    const { container, unmount } = await mount(
      React.createElement(LightCycleCard, { cultivation: crop({ photoperiodHoursLight: 13, photoperiodHoursDark: 13, lightsOnTime: '08:00', lightsOnDate: '2026-10-26' }), onSaveSchedule: () => {}, now: at(2026, 10, 31, 15) })
    );
    assert(container.querySelector('#light-state-pill')?.textContent === 'APAGADA', 'APAGADA');
    assert(/arranca 2 h más tarde/.test(container.querySelector('#light-shift-note')?.textContent || ''), 'nota del corrimiento');
    assert([...container.querySelectorAll('.light-day')][0].textContent?.includes('11 h'), 'el sábado suma 11 h');
    await unmount();
  });

  await check('11. Con enchufe: estado del equipo, lo cargado en Smart Life y sin botón de conectar', async () => {
    const device = { id: 'b1', deviceId: 'd1', deviceName: 'Zapatilla', code: 'switch_1', label: 'Toma 1', cultivationId: 'c1', cultivationName: 'Carpa', role: 'light', online: true, on: false, sensors: null, readAt: null, loaded: { mode: 'daily', until: null, daily: { on: '18:00', off: '12:00' }, error: null } } as any;
    const { container, unmount } = await mount(
      React.createElement(LightCycleCard, { cultivation: crop({ photoperiodHoursLight: 18, photoperiodHoursDark: 6, lightsOnTime: '18:00' }), onSaveSchedule: () => {}, onConnectPlug: () => {}, device, now: at(2026, 10, 31, 10) })
    );
    assert(container.querySelector('#light-state-pill')?.textContent === 'APAGADA', 'muestra lo que reporta el enchufe');
    const note = container.querySelector('#light-device-note')?.textContent || '';
    assert(/programación diaria/.test(note) && /lo corrige/.test(note), note);
    assert(/Enchufe · Zapatilla · Toma 1/.test(container.textContent || ''), 'dice qué enchufe es');
    assert(!container.querySelector('#connect-plug'), 'ya no ofrece conectar');
    await unmount();
  });

  await check('12. Lo que se manda al servidor: horas y un encendido con la hora local', () => {
    const snap = scheduleSnapshot(crop({ photoperiodHoursLight: 18, photoperiodHoursDark: 6, lightsOnTime: '18:00' }), at(2026, 10, 31, 10));
    assert(snap && snap.lightHours === 18 && snap.darkHours === 6 && new Date(snap.anchorMs).getHours() === 18, JSON.stringify(snap));
    const otherDay = { ...snap!, anchorMs: snap!.anchorMs + 3 * 24 * HOUR_MS };
    assert(sameSchedule(snap, otherDay), 'otro día del mismo ciclo es el mismo horario');
    assert(!sameSchedule(snap, { ...snap!, anchorMs: snap!.anchorMs + HOUR_MS }), 'una hora después no');
    assert(scheduleSnapshot(crop({ photoperiodHoursLight: 13, photoperiodHoursDark: 13, lightsOnTime: '08:00' })) === null, 'superciclo sin día: todavía no');
  });

  await check('10. Superciclo sin día de encendido: lo pide', async () => {
    const { container, unmount } = await mount(
      React.createElement(LightCycleCard, { cultivation: crop({ photoperiodHoursLight: 13, photoperiodHoursDark: 13, lightsOnTime: '08:00' }), onSaveSchedule: () => {}, now: at(2026, 10, 31, 15) })
    );
    assert(container.querySelector('#light-on-date'), 'pide el día');
    await unmount();
  });

  console.log('\n================================================================');
  console.log(` RESULTADO LUZ DEL CULTIVO: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en light_cycle:', err);
  process.exit(1);
});
