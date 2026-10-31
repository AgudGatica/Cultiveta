/**
 * tests/device_rules.test.ts
 *
 * SUITE: REGLAS DE CLIMA Y RIEGO SEGURO (src/utils/deviceRules.ts) y la tarjeta "Equipos del cultivo".
 *
 * 1. Extractor: prende al pasar el valor, sigue en el margen y apaga al bajar.
 * 2. Humidificador: prende al BAJAR; valores de noche con la luz apagada.
 * 3. Sin sensor: apagar, prender o dejar como está, según se eligió.
 * 4. Sigue a la luz y al revés.
 * 5. Reglas inválidas: al revés, sin margen y ventilador por sensor.
 * 6. Riego: sin conexión, sin cuenta regresiva o pasado de los topes, no riega.
 * 7. La tarjeta muestra la bomba con "Regar" (y su riego automático) y cada equipo de clima con su estado y por qué.
 * 8. Riego automático: valores inválidos, descripción y riego atado a la luz en un superciclo.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { evaluateClimate, validateClimateRule, defaultClimateRule, checkWaterOrder, describeClimateRule, DEFAULT_PUMP, DEFAULT_AUTO_IRRIGATION, validateAutoIrrigation, describeAutoIrrigation } from '../src/utils/deviceRules';
import { scheduledWaterings } from '../src/server/devices/autoIrrigation';
import { CropDevicesCard } from '../src/components/cultivations/CropDevicesCard';
import { devicesService } from '../src/services/devicesService';

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

const r = (temperature: number | null, humidity: number | null) => ({ temperature, humidity });

async function run() {
  console.log('\n================================================================');
  console.log('   REGLAS DE CLIMA Y RIEGO SEGURO');
  console.log('================================================================\n');

  await check('1. Extractor: prende ≥ 27, sigue en el margen y apaga ≤ 24', () => {
    const rule = defaultClimateRule('exhaust');
    assert(evaluateClimate('exhaust', rule, { readings: r(28, 50), lightOn: true, currentOn: false }).on, '28 prende');
    assert(evaluateClimate('exhaust', rule, { readings: r(25, 50), lightOn: true, currentOn: true }).on, '25 sigue prendido');
    assert(!evaluateClimate('exhaust', rule, { readings: r(25, 50), lightOn: true, currentOn: false }).on, '25 sigue apagado');
    assert(!evaluateClimate('exhaust', rule, { readings: r(23.9, 50), lightOn: true, currentOn: true }).on, '23,9 apaga');
    assert(describeClimateRule('exhaust', rule) === 'prende ≥ 27 °C, apaga ≤ 24 °C', describeClimateRule('exhaust', rule));
  });

  await check('2. Humidificador: prende al bajar; de noche usa sus valores', () => {
    const rule = { ...defaultClimateRule('humidifier'), night: { on: 60, off: 70 } };
    assert(evaluateClimate('humidifier', rule, { readings: r(24, 40), lightOn: true, currentOn: false }).on, '40 % de día prende');
    assert(!evaluateClimate('humidifier', rule, { readings: r(24, 58), lightOn: true, currentOn: false }).on, '58 % de día no');
    const n = evaluateClimate('humidifier', rule, { readings: r(24, 58), lightOn: false, currentOn: false });
    assert(n.on && /noche/.test(n.reason), `58 % de noche prende: ${n.reason}`);
  });

  await check('3. Sin datos del sensor: lo que se eligió', () => {
    const base = defaultClimateRule('exhaust');
    assert(!evaluateClimate('exhaust', { ...base, sensorLoss: 'off' }, { readings: null, lightOn: true, currentOn: true }).on, 'apagar');
    assert(evaluateClimate('exhaust', { ...base, sensorLoss: 'on' }, { readings: null, lightOn: true, currentOn: false }).on, 'prender');
    assert(evaluateClimate('exhaust', { ...base, sensorLoss: 'keep' }, { readings: r(null, 50), lightOn: true, currentOn: true }).on, 'como estaba');
  });

  await check('4. Sigue a la luz y al revés', () => {
    const fan = defaultClimateRule('fan');
    assert(fan.mode === 'follow', 'el ventilador sigue a la luz por defecto');
    assert(evaluateClimate('fan', fan, { readings: null, lightOn: true, currentOn: false }).on, 'con la luz');
    assert(evaluateClimate('dehumidifier', { ...fan, mode: 'follow_inverted' }, { readings: null, lightOn: false, currentOn: false }).on, 'al revés');
  });

  await check('5. Reglas inválidas', () => {
    assert(/SUBIR/.test(validateClimateRule('exhaust', { ...defaultClimateRule('exhaust'), on: 24, off: 27 })[0] || ''), 'al revés');
    assert(validateClimateRule('exhaust', { ...defaultClimateRule('exhaust'), on: 25, off: 24 }).some((e) => /al menos 2/.test(e)), 'sin margen');
    assert(validateClimateRule('fan', { ...defaultClimateRule('exhaust') }).some((e) => /quedaría prendido/.test(e)), 'ventilador por sensor');
    assert(validateClimateRule('heater', defaultClimateRule('heater')).length === 0, 'el calefactor por defecto sirve');
  });

  await check('6. Riego seguro', () => {
    const cfg = { flowLph: 8, maxSeconds: 120, maxLiters: 0.2 };
    assert(!checkWaterOrder(30, cfg, { online: false, hasCountdown: true }).ok, 'sin conexión');
    assert(!checkWaterOrder(30, cfg, { online: true, hasCountdown: false }).ok, 'sin cuenta regresiva');
    assert(!checkWaterOrder(200, cfg, { online: true, hasCountdown: true }).ok, 'pasado del tope de segundos');
    assert(!checkWaterOrder(100, cfg, { online: true, hasCountdown: true }).ok, 'pasado del tope de litros (0,22 L)');
    const ok = checkWaterOrder(60, DEFAULT_PUMP, { online: true, hasCountdown: true });
    assert(ok.ok && Math.abs(ok.liters - 60 * 8 / 3600) < 1e-9, JSON.stringify(ok));
  });

  await check('7. Tarjeta del cultivo: bomba con "Regar" y equipos de clima con su estado', async () => {
    const realFetch = globalThis.fetch;
    const binding = (extra: any) => ({ deviceId: 'd1', deviceName: 'Zapatilla', cultivationId: 'c1', cultivationName: 'Carpa', online: true, sensors: null, readAt: null, loaded: null, ...extra });
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        connected: true,
        mock: true,
        bindings: [
          binding({ id: 'p', code: 'switch_2', label: 'Toma 2', role: 'pump', on: false, pump: { flowLph: 8, maxSeconds: 300, maxLiters: 20 }, countdownCode: 'countdown_2', watering: null, auto: { ...DEFAULT_AUTO_IRRIGATION, mode: 'scheduled' }, irrigation: { last: { at: Date.now() - 60_000, seconds: 60, liters: 0.13, reason: 'programado' }, note: null } }),
          binding({ id: 'e', code: 'switch_3', label: 'Toma 3', role: 'climate', climateRole: 'exhaust', rule: defaultClimateRule('exhaust'), on: true, lastReason: 'temperatura 28 °C' }),
        ],
      }),
    });
    try {
      await devicesService.refreshOverview();
    } finally {
      (globalThis as any).fetch = realFetch;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(CropDevicesCard, { cultivation: { id: 'c1' } as any, userId: 'u1' })));
    assert(container.querySelector('#pump-water')?.textContent?.includes('Regar 30 s'), 'botón Regar');
    assert(/0,07 L/.test(container.textContent || ''), `litros estimados: ${container.textContent}`);
    const auto = container.querySelector('#crop-pump-auto')?.textContent || '';
    assert(/30 min después de prender/.test(auto) && /Último: \S+ \d\d:\d\d · 60 s \(0,13 L\)/.test(auto), `riego automático: ${auto}`);
    const dev = container.querySelector('.crop-climate-device')?.textContent || '';
    assert(/Extractor/.test(dev) && /PRENDIDO/.test(dev) && /28 °C/.test(dev), dev);
    await act(async () => root.unmount());
    devicesService.reset();
  });

  await check('8. Riego automático: valores inválidos, descripción y superciclo 13/13', () => {
    const base = { ...DEFAULT_AUTO_IRRIGATION, timeZone: 'America/Argentina/Buenos_Aires' };
    assert(validateAutoIrrigation({ ...base, mode: 'scheduled' }, 300).length === 0, 'el programado por defecto sirve');
    assert(validateAutoIrrigation({ ...base, mode: 'wetdry' }, 300).length === 0, 'el de humedad por defecto sirve');
    assert(validateAutoIrrigation({ ...base, mode: 'wetdry', wetdry: { ...base.wetdry, dry: 50, wet: 55 } }, 300).some((e) => /10 puntos/.test(e)), 'banda angosta');
    assert(validateAutoIrrigation({ ...base, mode: 'scheduled', scheduled: { ...base.scheduled, when: 'fixed', fixedTime: '25:00' } }, 300).some((e) => /hora/.test(e)), 'hora inválida');
    assert(validateAutoIrrigation({ ...base, mode: 'scheduled' }, 30).some((e) => /tope de la bomba/.test(e)), 'más que el tope');
    assert(describeAutoIrrigation({ ...base, mode: 'scheduled' }) === 'Programado: 30 min después de prender la luz · 60 s', describeAutoIrrigation({ ...base, mode: 'scheduled' }));
    assert(describeAutoIrrigation(null) === 'Solo a mano', 'apagado');
    // 13/13 desde el 26/10 a las 08:00 (Argentina): cada encendido llega 2 h más tarde y el riego lo sigue
    const H = 3_600_000;
    const anchor = Date.UTC(2026, 9, 26, 11, 0);
    const light = { lightHours: 13, darkHours: 13, anchorMs: anchor };
    const after = scheduledWaterings({ ...base, mode: 'scheduled' }, light, anchor, anchor + 72 * H);
    assert(after.map((d) => (d.at - anchor) / H).join() === '0.5,26.5,52.5', `después de prender: ${after.map((d) => (d.at - anchor) / H)}`);
    const before = scheduledWaterings({ ...base, mode: 'scheduled', scheduled: { ...base.scheduled, trigger: 'before_off', offsetMin: 60 } }, light, anchor, anchor + 26 * H);
    assert(before.length === 1 && before[0].at === anchor + 12 * H, 'una hora antes de apagar');
    assert(scheduledWaterings({ ...base, mode: 'scheduled' }, null, anchor, anchor + 72 * H).length === 0, 'sin horario de luz no riega lo atado a la luz');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO REGLAS DE CLIMA Y RIEGO: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en device_rules:', err);
  process.exit(1);
});
