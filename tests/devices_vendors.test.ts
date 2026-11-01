/**
 * tests/devices_vendors.test.ts
 *
 * SUITE: SONOFF / EWELINK Y SHELLY EN EL SERVIDOR (src/server/devices), con sus nubes de prueba.
 *
 * 1. eWeLink sin la app de Cultiveta: no se puede iniciar sesión; el de prueba sí. Tomas por modelo,
 *    cuenta regresiva solo en los que tienen inching y el sensor Zigbee en grados.
 * 2. Inicio de sesión de eWeLink: la vuelta con otro "state" se rechaza; con el suyo, queda conectado.
 * 3. Luz 13/13 en un Sonoff: pausa los temporizadores de la persona, guarda un bucle que se cumple solo
 *    en el equipo y al desasignar vuelve todo como estaba.
 * 4. Luz 18/6 en un Sonoff: bucle diario 18:00 → 12:00.
 * 5. Bomba en un Sonoff DUAL: riega con el inching del equipo y se apaga sola; sin inching no hay bomba.
 * 6. Shelly: server que no es de shelly.cloud y clave inválida se rechazan; lista Gen1, Gen2 y el H&T.
 * 7. Luz 18/6 en un Shelly: el equipo queda "dándose vuelta solo" en el próximo cambio y la revisión
 *    programa el siguiente apenas pasa uno.
 * 8. Bomba en un Shelly: toggle_after, se apaga sola.
 * 9. Shelly sin lista de la nube: con Device Ids anda; sin ellos, dice cómo agregarlos.
 * 10. Varias marcas: si una falla, las otras se ven; desconectar una deja las otras; borrar la cuenta, todo.
 */

import { DeviceService, MemoryDeviceStore } from '../src/server/devices/deviceService';
import { zonedToMs } from '../src/server/devices/tz';
import { createMockEwelink, MOCK_EWELINK_APP } from '../src/server/devices/ewelinkMock';
import { cleanShellyServer } from '../src/server/devices/shellyClient';

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
async function rejects(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e: any) {
    return e?.message || String(e);
  }
  return '';
}

const TZ = 'America/Argentina/Buenos_Aires';
const ar = (date: string, clock: string) => zonedToMs(date, clock, TZ);
const MIN = 60_000;

function setup(start: number, extra: Partial<ConstructorParameters<typeof DeviceService>[0]> = {}) {
  const now = { t: start };
  const svc = new DeviceService({ store: new MemoryDeviceStore(), now: () => now.t, ...extra });
  return { now, svc };
}
const light13 = { lightHours: 13, darkHours: 13, anchorMs: ar('20261026', '08:00'), timeZone: TZ };
const light18 = { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ };

async function run() {
  console.log('\n================================================================');
  console.log('   SONOFF / EWELINK Y SHELLY (SERVIDOR)');
  console.log('================================================================\n');

  await check('1. eWeLink: sin la app de Cultiveta no hay inicio de sesión; el de prueba lista tomas y sensores', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    assert(/dev\.ewelink\.cc/.test(await rejects(() => svc.ewelinkLogin('u1'))), 'sin app');
    assert((await svc.status('u1')).ewelink.available === false, 'no disponible');
    const r = await svc.connectEwelink('u1', { mock: true });
    assert(r.devices === 4, `4 equipos: ${r.devices}`);
    const list = await svc.devices('u1');
    const by = (name: string) => list.find((d: any) => d.name.startsWith(name)) as any;
    const basic = by('Sonoff Basic');
    assert(basic.id === 'ewelink-1000a1b2c3' && basic.vendor === 'ewelink', basic.id);
    assert(basic.channels.length === 1 && basic.channels[0].hasCountdown, 'Basic: 1 toma con inching');
    const dual = by('Sonoff DUAL');
    assert(dual.channels.map((c: any) => c.code).join() === 'switch_1,switch_2', `DUAL R3: 2 tomas aunque publique 4 (${dual.channels.map((c: any) => c.code)})`);
    assert(!by('TH16').channels[0].hasCountdown, 'TH16 sin inching');
    const snzb = by('SNZB-02');
    assert(snzb.sensors?.temperature === 23.9 && snzb.sensors?.humidity === 61, JSON.stringify(snzb.sensors));
  });

  await check('2. Inicio de sesión de eWeLink: el "state" tiene que ser el de esta persona', async () => {
    const now = { t: ar('20261031', '10:00') };
    const cloud = createMockEwelink({ now: () => now.t });
    const svc = new DeviceService({ store: new MemoryDeviceStore(), now: () => now.t, fetchImpl: cloud.fetchImpl, ewelinkApp: MOCK_EWELINK_APP });
    const { url } = await svc.ewelinkLogin('u1');
    const q = new URL(url).searchParams;
    assert(q.get('clientId') === MOCK_EWELINK_APP.appId && q.get('redirectUrl') === MOCK_EWELINK_APP.redirectUrl && q.get('authorization'), url);
    assert(/venció o no es de esta cuenta/.test(await rejects(() => svc.connectEwelink('u1', { code: 'codigo-de-prueba', region: 'us', state: 'otro' }))), 'state ajeno');
    const r = await svc.connectEwelink('u1', { code: 'codigo-de-prueba', region: 'us', state: q.get('state')! });
    assert(r.devices === 4, `conectado: ${r.devices}`);
    const st = await svc.status('u1');
    assert(st.ewelink.connected && !st.ewelink.mock && st.ewelink.available && !st.tuya.connected, JSON.stringify(st.ewelink));
    assert(/venció/.test(await rejects(() => svc.connectEwelink('u1', { code: 'codigo-de-prueba', region: 'us', state: q.get('state')! }))), 'el state se usa una sola vez');
  });

  await check('3. Luz 13/13 en un Sonoff: bucle en el equipo, pausa lo de la persona y al desasignar vuelve', async () => {
    const { now, svc } = setup(ar('20261031', '10:00'));
    await svc.connectEwelink('u1', { mock: true });
    const mock = svc.ewelinkMockOf('u1');
    const th = mock.devices['1000a7b8c9'];
    const b = await svc.bind('u1', { deviceId: 'ewelink-1000a7b8c9', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light13 });
    const timers = th.params.timers;
    assert(timers.filter((x: any) => x.type === 'repeat').every((x: any) => x.enabled === 0), 'los de la persona, pausados');
    const loop = timers.find((x: any) => x.type === 'duration');
    assert(loop && loop.enabled === 1 && / 1560 /.test(loop.at), `bucle de 26 h: ${loop?.at}`);
    // 13/13 desde el 26/10 a las 08:00: el 31/10 apagó a las 05:00 y prende a las 18:00
    assert(mock.out('1000a7b8c9') === 'off', 'apagada ahora');
    now.t = ar('20261031', '18:01');
    assert(mock.out('1000a7b8c9') === 'on', 'a las 18 la prendió el bucle del equipo (sin servidor)');
    now.t = ar('20261101', '07:01');
    assert(mock.out('1000a7b8c9') === 'off', 'y a las 7 del otro día la apagó (13 h de luz)');
    const ov = await svc.overview('u1');
    assert(ov.bindings[0].loaded?.mode === 'loop', `cargado como bucle: ${JSON.stringify(ov.bindings[0].loaded)}`);
    await svc.unbind('u1', b.id);
    assert(!th.params.timers.some((x: any) => x.type === 'duration'), 'sin el bucle de Cultiveta');
    assert(th.params.timers.every((x: any) => x.enabled === 1), 'los de la persona, activos');
  });

  await check('4. Luz 18/6 en un Sonoff: bucle diario 18:00 → 12:00', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    await svc.connectEwelink('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'ewelink-1000a1b2c3', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    const ov = await svc.overview('u1');
    const l = ov.bindings[0].loaded;
    assert(l?.mode === 'daily' && l.daily?.on === '18:00' && l.daily?.off === '12:00', JSON.stringify(l));
  });

  await check('5. Bomba en un Sonoff DUAL: inching del equipo; sin inching no hay bomba', async () => {
    const { now, svc } = setup(ar('20261031', '10:00'));
    await svc.connectEwelink('u1', { mock: true });
    assert(/cuenta regresiva/.test(await rejects(() => svc.bind('u1', { deviceId: 'ewelink-1000a7b8c9', code: 'switch_1', role: 'pump', cultivationId: 'c1' }))), 'TH16 sin inching');
    const pump = await svc.bind('u1', { deviceId: 'ewelink-1000d4e5f6', code: 'switch_2', role: 'pump', cultivationId: 'c1' });
    const r = await svc.water('u1', pump.id, 30);
    const mock = svc.ewelinkMockOf('u1');
    const dual = mock.devices['1000d4e5f6'];
    assert(r.seconds === 30 && dual.params.pulses.find((x: any) => x.outlet === 1).width === 30000, `inching de 30 s: ${JSON.stringify(dual.params.pulses[1])}`);
    assert(mock.out('1000d4e5f6', 1) === 'on', 'regando');
    now.t += 31_000;
    assert(mock.out('1000d4e5f6', 1) === 'off', 'se apagó sola');
  });

  await check('6. Shelly: server ajeno y clave inválida se rechazan; lista Gen1, Gen2 y el H&T', async () => {
    assert(cleanShellyServer('shelly-103-eu.shelly.cloud') === 'https://shelly-103-eu.shelly.cloud' && cleanShellyServer('https://evil.com') === null && cleanShellyServer('a.shelly.cloud.evil.com') === null, 'server');
    const { svc } = setup(ar('20261031', '10:00'));
    assert(/shelly\.cloud/.test(await rejects(() => svc.connectShelly('u1', { server: 'https://evil.com', authKey: 'x'.repeat(40) }))), 'server ajeno');
    assert(/clave/.test(await rejects(() => svc.connectShelly('u1', { server: 'shelly-103-eu.shelly.cloud', authKey: 'corta' }))), 'clave corta');
    const r = await svc.connectShelly('u1', { mock: true });
    assert(r.devices === 3, `3 Shelly: ${r.devices}`);
    const list = await svc.devices('u1');
    const plus = list.find((d: any) => d.id === 'shelly-a8032ab1c2d3') as any;
    const one = list.find((d: any) => d.id === 'shelly-e8db84d4b2f1') as any;
    const ht = list.find((d: any) => d.id === 'shelly-b0b21c11aa01') as any;
    assert(plus.channels.length === 2 && plus.channels.every((c: any) => c.hasCountdown) && plus.vendor === 'shelly', 'Plus 2PM: 2 salidas con toggle_after');
    assert(one.channels.length === 1 && one.channels[0].hasCountdown, 'Shelly 1 (Gen1)');
    assert(ht.sensors?.temperature === 24.2 && ht.sensors?.humidity === 57 && ht.sensors?.battery === 88, JSON.stringify(ht.sensors));
  });

  await check('7. Luz 18/6 en un Shelly: se da vuelta sola en cada cambio y la revisión programa el siguiente', async () => {
    const { now, svc } = setup(ar('20261031', '10:00'));
    await svc.connectShelly('u1', { mock: true });
    const mock = svc.shellyMockOf('u1');
    await svc.bind('u1', { deviceId: 'shelly-a8032ab1c2d3', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    let out = mock.out('a8032ab1c2d3');
    assert(out.output === true && out.timer?.duration === 2 * 3600 && out.timer.to === false, `prendida, se apaga sola a las 12: ${JSON.stringify(out)}`);
    now.t = ar('20261031', '12:01');
    assert(mock.out('a8032ab1c2d3').output === false, 'a las 12 se apagó sola (sin servidor)');
    now.t = ar('20261031', '12:05');
    await svc.tick('u1');
    out = mock.out('a8032ab1c2d3');
    assert(out.output === false && out.timer?.to === true && Math.abs(out.timer.duration - (ar('20261031', '18:00') - now.t) / 1000) < 2, `apagada, prende sola a las 18: ${JSON.stringify(out)}`);
    const calls = mock.state.calls.length;
    now.t = ar('20261031', '12:10');
    await svc.tick('u1');
    assert(!mock.state.calls.slice(calls).some((c) => c.path.endsWith('set/switch')), 'si ya está programado, no manda nada');
    now.t = ar('20261031', '18:01');
    assert(mock.out('a8032ab1c2d3').output === true, 'a las 18 prendió sola');
    mock.flip('a8032ab1c2d3');
    now.t = ar('20261031', '18:06');
    await svc.tick('u1');
    out = mock.out('a8032ab1c2d3');
    assert(out.output === true && out.timer?.to === false, 'si alguien la apagó, la revisión la vuelve a prender con su cambio programado');
    const ov = await svc.overview('u1');
    assert(ov.bindings[0].loaded?.mode === 'server' && ov.bindings[0].loaded?.daily?.on === '18:00', JSON.stringify(ov.bindings[0].loaded));
  });

  await check('8. Bomba en un Shelly: toggle_after, se apaga sola', async () => {
    const { now, svc } = setup(ar('20261031', '10:00'));
    await svc.connectShelly('u1', { mock: true });
    const mock = svc.shellyMockOf('u1');
    const pump = await svc.bind('u1', { deviceId: 'shelly-e8db84d4b2f1', code: 'switch_1', role: 'pump', cultivationId: 'c1' });
    await svc.water('u1', pump.id, 20);
    assert(mock.out('e8db84d4b2f1').output === true && mock.out('e8db84d4b2f1').timer?.duration === 20, 'regando 20 s');
    now.t += 21_000;
    assert(mock.out('e8db84d4b2f1').output === false, 'se apagó sola');
  });

  await check('9. Shelly sin lista de la nube: con Device Ids anda; sin ellos, dice cómo agregarlos', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    svc.shellyMockOf('u1').state.listWorks = false;
    assert(/Device Id/.test(await rejects(() => svc.connectShelly('u1', { mock: true }))), 'sin ids');
    const r = await svc.connectShelly('u1', { mock: true, ids: 'a8032ab1c2d3, b0b21c11aa01' });
    assert(r.devices === 2, `con ids: ${r.devices}`);
    assert((await svc.status('u1')).shelly.ids.length === 2, 'quedan guardados');
    assert(/Device Id/.test(await rejects(() => svc.connectShelly('u1', { mock: true, ids: 'no valido!' }))), 'id inválido');
  });

  await check('10. Varias marcas: si una falla se ven las otras; desconectar una deja las demás', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.connectShelly('u1', { mock: true });
    await svc.connectEwelink('u1', { mock: true });
    const tuyaLight = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    await svc.bind('u1', { deviceId: 'shelly-e8db84d4b2f1', code: 'switch_1', role: 'pump', cultivationId: 'c1' });
    // la sesión de eWeLink se cae: la lista trae Smart Life y Shelly, con el error de eWeLink aparte
    const em = svc.ewelinkMockOf('u1');
    em.state.at = 'otro';
    em.state.rt = 'otro';
    const r = await svc.devicesWithErrors('u1');
    assert(r.devices.some((d: any) => d.vendor === 'tuya') && r.devices.some((d: any) => d.vendor === 'shelly') && !r.devices.some((d: any) => d.vendor === 'ewelink'), 'las otras marcas se ven');
    assert(/^eWeLink: /.test((r.errors as any).ewelink || ''), JSON.stringify(r.errors));
    await svc.disconnectShelly('u1');
    const st = await svc.status('u1');
    assert(!st.shelly.connected && st.tuya.connected && st.ewelink.connected, JSON.stringify(st));
    const ov = await svc.overview('u1');
    assert(ov.bindings.length === 1 && ov.bindings[0].id === tuyaLight.id, 'queda solo la luz de Smart Life');
    await svc.disconnectAll('u1');
    assert(!(await svc.status('u1')).tuya.connected && !(await svc.overview('u1')).connected, 'todo desconectado');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO SONOFF Y SHELLY: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en devices_vendors:', err);
  process.exit(1);
});
