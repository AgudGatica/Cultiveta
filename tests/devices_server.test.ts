/**
 * tests/devices_server.test.ts
 *
 * SUITE: SMART LIFE REAL EN EL SERVIDOR (src/server/devices), con la nube de Tuya de prueba.
 *
 * 1. Firma oficial de Tuya: coincide con los dos ejemplos de la documentación.
 * 2. Zona horaria: fechas y horas de Argentina aunque el servidor corra en UTC.
 * 3. Conectar: claves inválidas se rechazan; la zapatilla de prueba lista sus equipos.
 * 4. Luz 18/6 que prende a las 18: pausa los horarios de la app Smart Life de ese toma, carga una
 *    programación diaria 18:00 → 12:00 y deja la luz como corresponde ahora.
 * 5. Superciclo 13/13: órdenes de un solo uso para la semana, que terminan con la luz apagada y se
 *    cumplen solas (sin servidor) a la hora de Argentina.
 * 6. Revisión periódica: si alguien cambió el toma, lo vuelve a poner como corresponde.
 * 7. Cambiar la hora de encendido vuelve a cargar el horario.
 * 8. Un toma con la luz asignada no se prende "a mano"; uno libre sí.
 * 9. Sensor de ambiente asignado: el cultivo ve temperatura y humedad.
 * 10. Desasignar y desconectar: se borra lo de Cultiveta y vuelven los horarios de la persona.
 */

import { tuyaSign, signUrl, channelsOf, sensorsOf } from '../src/server/devices/tuyaClient';
import { DeviceService, MemoryDeviceStore, DeviceError } from '../src/server/devices/deviceService';
import { zonedToMs, zonedClock, zonedDateKey, offsetString } from '../src/server/devices/tz';
import { SCHEDULE_CATEGORY } from '../src/server/devices/lightSchedule';

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

const TZ = 'America/Argentina/Buenos_Aires';
const ar = (date: string, clock: string) => zonedToMs(date, clock, TZ);
const HOUR = 3_600_000;

function setup(start: number) {
  const now = { t: start };
  const svc = new DeviceService({ store: new MemoryDeviceStore(), now: () => now.t });
  return { now, svc, mock: () => svc.mockOf('u1') };
}
const userTimers = (mock: any, cat: string) => (mock.timers.mockstrip01 || []).find((c: any) => c.category.category === cat);

async function run() {
  console.log('\n================================================================');
  console.log('   SMART LIFE REAL (SERVIDOR)');
  console.log('================================================================\n');

  await check('1. Firma oficial de Tuya (ejemplos de la documentación)', () => {
    const base = { clientId: '1KAD46OrT9HafiKdsXeg', secret: '4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC', t: '1588925778000', nonce: '5138cc3a9033d69856923fd07b491173', method: 'GET', sigHeaders: [['area_id', '29a33e8796834b1efa6'], ['call_id', '8afdb70ab2ed11eb85290242ac130003']] as Array<[string, string]> };
    assert(tuyaSign({ ...base, url: signUrl('/v1.0/token', { grant_type: 1 }) }) === '9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E', 'token');
    assert(tuyaSign({ ...base, accessToken: '3f4eda2bdec17232f67c0b188af3eec1', url: signUrl('/v2.0/apps/schema/users', { page_size: 50, page_no: 1 }) }) === 'AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784', 'con token');
    const ch = channelsOf([{ code: 'switch_2', value: true }, { code: 'switch_1', value: false }, { code: 'countdown_1', value: 0 }]);
    assert(ch.map((c) => c.code).join() === 'switch_1,switch_2' && ch[1].on, 'tomas');
    assert(sensorsOf([{ code: 'va_temperature', value: 245 }, { code: 'va_humidity', value: 58 }])?.temperature === 24.5, 'sensor sin especificación');
  });

  await check('2. Fechas y horas de Argentina aunque el servidor esté en UTC', () => {
    const ms = ar('20261031', '18:00');
    assert(ms === Date.UTC(2026, 9, 31, 21, 0), 'las 18 de Argentina son las 21 UTC');
    assert(zonedClock(ms, TZ) === '18:00' && zonedDateKey(ms, TZ) === '20261031', 'vuelta');
    assert(offsetString(ms, TZ) === '-03:00', offsetString(ms, TZ));
  });

  await check('3. Conectar: claves inválidas se rechazan; la zapatilla de prueba lista sus equipos', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    let err: any = null;
    try {
      await svc.connectTuya('u1', { accessId: 'corto', accessSecret: 'x' });
    } catch (e) {
      err = e;
    }
    assert(err instanceof DeviceError, 'rechazo');
    const r = await svc.connectTuya('u1', { mock: true });
    assert(r.devices === 3, `equipos: ${r.devices}`);
    const st = await svc.status('u1');
    assert(st.tuya.connected && st.tuya.mock, 'conectado de prueba');
    const devs = await svc.devices('u1');
    assert(devs.find((d) => d.id === 'mockstrip01')!.channels.length === 5, 'zapatilla con 5 tomas');
  });

  await check('4. Luz 18/6 a las 18: pausa lo de la app, carga programación diaria y aplica el estado', async () => {
    const { svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    const anchorMs = ar('20261024', '18:00');
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', cultivationName: 'Carpa', schedule: { lightHours: 18, darkHours: 6, anchorMs, timeZone: TZ } });
    const own = userTimers(mock(), 'category_switch_1');
    const statuses = own.groups.flatMap((g: any) => g.timers.map((t: any) => `${t.time}:${t.status}`));
    assert(statuses.includes('07:00:0') && statuses.includes('20:00:0'), `las de la persona pausadas: ${statuses}`);
    assert(statuses.includes('18:00:1') && statuses.includes('12:00:1'), `programación diaria de Cultiveta: ${statuses}`);
    assert(mock().devices.mockstrip01.status.switch_1 === true, 'a las 10 la luz está prendida (de 18 a 12)');
    const ov = await svc.overview('u1');
    assert(ov.bindings[0].on === true && ov.bindings[0].loaded?.mode === 'daily', JSON.stringify(ov.bindings[0].loaded));
  });

  await check('5. Superciclo 13/13: la semana cargada termina apagada y se cumple sola', async () => {
    const { now, svc, mock } = setup(ar('20261031', '15:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 13, darkHours: 13, anchorMs: ar('20261026', '08:00'), timeZone: TZ } });
    const mine = userTimers(mock(), SCHEDULE_CATEGORY);
    const ev = mine.groups.flatMap((g: any) => g.timers).map((x: any) => `${x.date} ${x.time} ${x.functions[0].value ? 'ON' : 'OFF'}`);
    assert(ev[0] === '20261031 18:00 ON' && ev[1] === '20261101 07:00 OFF', ev.slice(0, 3).join(' | '));
    assert(/OFF$/.test(ev[ev.length - 1]), `termina apagada: ${ev[ev.length - 1]}`);
    assert(mock().devices.mockstrip01.status.switch_1 === false, 'a las 15 está apagada');
    now.t = ar('20261031', '18:00') + 30_000;
    mock().runCloud(now.t);
    assert(mock().devices.mockstrip01.status.switch_1 === true, 'prendió sola a las 18 de Argentina');
  });

  await check('6. Revisión periódica: corrige el toma si quedó al revés', async () => {
    const { now, svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ } });
    mock().flip('switch_1');
    now.t += 5 * 60_000;
    const r = await svc.tick('u1');
    assert(r.fixes === 1 && mock().devices.mockstrip01.status.switch_1 === true, `corrigió: ${JSON.stringify(r)}`);
    const all = await svc.tickAll();
    assert(all.accounts === 1 && all.fixes === 0, 'nada más que corregir');
  });

  await check('7. Cambiar la hora de encendido vuelve a cargar el horario', async () => {
    const { svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ } });
    const r = await svc.setSchedule('u1', 'c1', { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '06:00'), timeZone: TZ });
    assert(r.changed, 'cambió');
    const times = userTimers(mock(), 'category_switch_1').groups.flatMap((g: any) => g.timers.filter((t: any) => t.status === 1).map((t: any) => t.time));
    assert(times.includes('06:00') && times.includes('00:00') && !times.includes('18:00'), `nuevo horario: ${times}`);
    assert((await svc.setSchedule('u1', 'c1', { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '06:00'), timeZone: TZ })).changed === false, 'igual: no reescribe');
  });

  await check('8. Un toma con la luz asignada no se prende a mano; uno libre sí', async () => {
    const { svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', cultivationName: 'Carpa', schedule: { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ } });
    let err: any = null;
    try {
      await svc.command('u1', 'mockstrip01', 'switch_1', false);
    } catch (e) {
      err = e;
    }
    assert(err?.status === 409 && /Carpa/.test(err.message), 'rechazado');
    await svc.command('u1', 'mockstrip01', 'switch_2', true);
    assert(mock().devices.mockstrip01.status.switch_2 === true, 'toma libre prendido');
  });

  await check('9. Sensor de ambiente asignado: el cultivo ve temperatura y humedad', async () => {
    const { svc } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockth01', code: 'sensor', role: 'sensor_th', cultivationId: 'c1' });
    const ov = await svc.overview('u1');
    const b = ov.bindings.find((x: any) => x.role === 'sensor_th');
    assert(b && b.sensors?.temperature === 24.5 && b.sensors?.humidity === 58, JSON.stringify(b?.sensors));
  });

  await check('10. Desasignar y desconectar: se borra lo de Cultiveta y vuelve lo de la persona', async () => {
    const { svc, mock } = setup(ar('20261031', '15:00'));
    await svc.connectTuya('u1', { mock: true });
    const b = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 13, darkHours: 13, anchorMs: ar('20261026', '08:00'), timeZone: TZ } });
    await svc.unbind('u1', b.id);
    assert(!userTimers(mock(), SCHEDULE_CATEGORY), 'sin órdenes de Cultiveta');
    const st = userTimers(mock(), 'category_switch_1').groups.flatMap((g: any) => g.timers.map((t: any) => t.status));
    assert(st.every((s: number) => s === 1), `las de la persona activas: ${st}`);
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ } });
    await svc.disconnectTuya('u1');
    const left = userTimers(mock(), 'category_switch_1').groups.flatMap((g: any) => g.timers.map((t: any) => `${t.time}:${t.status}`));
    assert(left.join() === '07:00:1,20:00:1', `solo lo de la persona, activo: ${left}`);
    assert(!(await svc.status('u1')).tuya.connected, 'desconectado');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO SMART LIFE REAL: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en devices_server:', err);
  process.exit(1);
});
