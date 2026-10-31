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
 * 11. Bomba: riega con la cuenta regresiva del toma, se apaga sola y respeta los topes.
 * 12. Sin cuenta regresiva no hay bomba; una bomba olvidada se apaga; no se prende a mano.
 * 13. Extractor por sensor: margen para no prender y apagar sin parar; sin sensor, apagado.
 * 14. Lo que sigue a la luz (o al revés) queda cargado en Smart Life y sigue los cambios de horario.
 * 15. Humidificador con valores de noche; una regla al revés se rechaza.
 * 16. Riego programado 30 min después de prender la luz: riega una vez, lo anota con la hora de
 *     Argentina y, si el servidor estuvo caído, no riega atrasado.
 * 17. Riego a hora fija en 3 pulsos; topes y sonda que faltan se rechazan; el horario nuevo de la luz
 *     llega a la bomba.
 * 18. Riego por humedad: riega al llegar a seco, con pausas, hasta el tope por día; de noche espera.
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
  const records: any[] = [];
  const svc = new DeviceService({ store: new MemoryDeviceStore(), now: () => now.t, recordWatering: async (userId, w) => void records.push({ userId, ...w }) });
  return { now, svc, records, count: () => records.length, mock: () => svc.mockOf('u1') };
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

  const light18 = { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ };

  await check('11. Bomba: riega N segundos con la cuenta regresiva del toma y se apaga sola; los topes no se pasan', async () => {
    const { now, svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    const pump = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1', pump: { flowLph: 8, maxSeconds: 120, maxLiters: 5 } });
    const r = await svc.water('u1', pump.id, 30);
    assert(r.seconds === 30 && Math.abs(r.liters - 30 * 8 / 3600) < 1e-9, JSON.stringify(r));
    assert(mock().devices.mockstrip01.status.switch_2 === true && mock().devices.mockstrip01.status.countdown_2 === 30, 'prendida con cuenta regresiva de 30 s');
    now.t += 31_000;
    mock().runCountdowns();
    assert(mock().devices.mockstrip01.status.switch_2 === false, 'se apagó sola (cuenta regresiva del equipo)');
    await svc.tick('u1');
    assert(mock().devices.mockstrip01.status.switch_2 === false, 'y la revisión no la vuelve a prender');
    let err: any = null;
    try {
      await svc.water('u1', pump.id, 200);
    } catch (e) {
      err = e;
    }
    assert(err?.status === 409 && /tope/.test(err.message), `tope: ${err?.message}`);
    mock().state.offline = true;
    err = null;
    try {
      await svc.water('u1', pump.id, 10);
    } catch (e) {
      err = e;
    }
    assert(err && /no responde/.test(err.message), `sin conexión no riega: ${err?.message}`);
  });

  await check('12. Un toma sin cuenta regresiva no se usa como bomba; la bomba olvidada se apaga', async () => {
    const { now, svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    let err: any = null;
    try {
      await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_usb1', role: 'pump', cultivationId: 'c1' });
    } catch (e) {
      err = e;
    }
    assert(err && /cuenta regresiva/.test(err.message), `USB sin seguro: ${err?.message}`);
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1' });
    mock().flip('switch_2');
    now.t += 5 * 60_000;
    await svc.tick('u1');
    assert(mock().devices.mockstrip01.status.switch_2 === false, 'la apagó la revisión');
    err = null;
    try {
      await svc.command('u1', 'mockstrip01', 'switch_2', true);
    } catch (e) {
      err = e;
    }
    assert(err?.status === 409 && /Regar/.test(err.message), 'no se prende a mano');
  });

  await check('13. Extractor por sensor: prende al pasar 27 °C, sigue hasta bajar de 24 °C y apaga sin sensor', async () => {
    const { now, svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockth01', code: 'sensor', role: 'sensor_th', cultivationId: 'c1' });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_3', role: 'climate', climateRole: 'exhaust', cultivationId: 'c1' });
    const sw3 = () => mock().devices.mockstrip01.status.switch_3;
    assert(sw3() === false, 'con 24,5 °C queda apagado');
    const step = async (tenths: number) => {
      mock().setReading('mockth01', { va_temperature: tenths });
      now.t += 5 * 60_000;
      await svc.tick('u1');
      return sw3();
    };
    assert((await step(280)) === true, 'a 28 °C prende');
    assert((await step(250)) === true, 'a 25 °C sigue prendido (margen)');
    assert((await step(235)) === false, 'a 23,5 °C apaga');
    mock().devices.mockth01.online = false;
    mock().setReading('mockth01', { va_temperature: 300 });
    now.t += 40 * 60_000;
    await svc.tick('u1');
    assert(sw3() === false, 'sensor sin datos: apagado');
    const ov = await svc.overview('u1');
    assert(/sensor sin datos/.test(ov.bindings.find((b: any) => b.role === 'climate').lastReason || ''), 'dice por qué');
  });

  await check('14. Ventilador que sigue a la luz y uno al revés: quedan cargados en Smart Life', async () => {
    const { svc, mock } = setup(ar('20261031', '10:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_3', role: 'climate', climateRole: 'fan', cultivationId: 'c1' });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_4', role: 'climate', climateRole: 'dehumidifier', cultivationId: 'c1', rule: { mode: 'follow_inverted' } });
    const times = (code: string) => (userTimers(mock(), `category_${code}`)?.groups || []).flatMap((g: any) => g.timers.filter((t: any) => t.status === 1).map((t: any) => `${t.time}${t.functions[0].value ? '+' : '-'}`)).sort().join(' ');
    assert(times('switch_3') === '12:00- 18:00+', `ventilador con la luz: ${times('switch_3')}`);
    assert(times('switch_4') === '12:00+ 18:00-', `deshumidificador al revés: ${times('switch_4')}`);
    const st = mock().devices.mockstrip01.status;
    assert(st.switch_1 === true && st.switch_3 === true && st.switch_4 === false, 'a las 10: luz y ventilador prendidos, el otro apagado');
    // si cambia el horario de la luz, se recarga lo que la sigue
    await svc.setSchedule('u1', 'c1', { ...light18, anchorMs: ar('20261024', '06:00') });
    assert(times('switch_3') === '00:00- 06:00+', `ventilador con la luz nueva: ${times('switch_3')}`);
  });

  await check('15. Humidificador con valores de noche y reglas inválidas rechazadas', async () => {
    const { now, svc, mock } = setup(ar('20261031', '13:00'));
    await svc.connectTuya('u1', { mock: true });
    await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    await svc.bind('u1', { deviceId: 'mockth01', code: 'sensor', role: 'sensor_th', cultivationId: 'c1' });
    let err: any = null;
    try {
      await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_3', role: 'climate', climateRole: 'humidifier', cultivationId: 'c1', rule: { mode: 'sensor', metric: 'humidity', on: 55, off: 45, sensorLoss: 'off' } });
    } catch (e) {
      err = e;
    }
    assert(err && /BAJAR/.test(err.message), `al revés se rechaza: ${err?.message}`);
    const hum = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_3', role: 'climate', climateRole: 'humidifier', cultivationId: 'c1', rule: { mode: 'sensor', metric: 'humidity', on: 45, off: 55, night: { on: 60, off: 70 }, sensorLoss: 'off' } });
    // 13 h: luz apagada (18/6 apaga a las 12) → valores de noche: 58 % ≤ 60 → prende
    assert(mock().devices.mockstrip01.status.switch_3 === true, `de noche prende con 58 %: ${hum.lastReason}`);
    now.t = ar('20261031', '19:00');
    await svc.tick('u1');
    assert(mock().devices.mockstrip01.status.switch_3 === false, 'de día, 58 % está por arriba de 55: apaga');
  });

  /** La revisión cada 5 min hasta esa hora (y la cuenta regresiva del equipo, que apaga la bomba). */
  const ticksUntil = async (env: ReturnType<typeof setup>, until: number) => {
    while (env.now.t + 5 * 60_000 <= until) {
      env.now.t += 5 * 60_000;
      env.mock().runCountdowns();
      await env.svc.tick('u1');
    }
  };
  const pumpCfg = { flowLph: 8, maxSeconds: 120, maxLiters: 5 };
  const scheduled = (extra: any) => ({ mode: 'scheduled', timeZone: TZ, scheduled: { when: 'light', trigger: 'after_on', offsetMin: 30, fixedTime: '09:00', shotS: 60, pulses: 1, pauseMin: 30, ...extra } });

  await check('16. Riego programado 30 min después de prender la luz: una vez, anotado y nunca atrasado', async () => {
    const env = setup(ar('20261031', '18:02'));
    const { svc, records, count, mock } = env;
    await svc.connectTuya('u1', { mock: true });
    // sin toma de luz: la bomba usa el horario que manda la app (18/6, prende a las 18)
    const pump = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1', pump: pumpCfg, schedule: light18 });
    await svc.setAuto('u1', pump.id, scheduled({}));
    await ticksUntil(env, ar('20261031', '19:00'));
    assert(count() === 1, `un riego: ${JSON.stringify(records)}`);
    const r = records[0];
    assert(r.userId === 'u1' && r.cultivationId === 'c1' && r.date === '2026-10-31' && r.time === '18:32', JSON.stringify(r));
    assert(r.volumeLiters === 0.13 && /automático/.test(r.observations) && /después de prender/.test(r.observations), r.observations);
    assert(mock().devices.mockstrip01.status.switch_2 === false, 'la apagó su cuenta regresiva');
    const ov = await svc.overview('u1');
    const b = ov.bindings.find((x: any) => x.role === 'pump');
    assert(b.auto?.mode === 'scheduled' && b.irrigation?.last?.seconds === 60, JSON.stringify(b.irrigation));
    // al otro día el servidor estuvo caído de 18:20 a 18:45: el de las 18:30 no se hace tarde
    env.now.t = ar('20261101', '18:45');
    await svc.tick('u1');
    assert(count() === 1, 'no riega atrasado');
    await ticksUntil(env, ar('20261102', '18:40'));
    assert(count() === 2 && records[1].date === '2026-11-02', `al día siguiente vuelve: ${records.map((x) => x.date + ' ' + x.time)}`);
  });

  await check('17. A hora fija en 3 pulsos; topes y sonda faltante rechazados; el horario nuevo llega a la bomba', async () => {
    const env = setup(ar('20261102', '08:50'));
    const { svc, records, count } = env;
    await svc.connectTuya('u1', { mock: true });
    const pump = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1', pump: pumpCfg, schedule: light18 });
    const fail = async (auto: any) => {
      try {
        await svc.setAuto('u1', pump.id, auto);
      } catch (e: any) {
        return e.message as string;
      }
      return '';
    };
    assert(/tope de la bomba/.test(await fail(scheduled({ shotS: 200 }))), 'más que el tope');
    assert(/Pausa/.test(await fail(scheduled({ pulses: 3, pauseMin: 2 }))), 'pausa más corta que la revisión');
    assert(/sonda de sustrato/.test(await fail({ mode: 'wetdry', timeZone: TZ })), 'por humedad sin sonda');
    await svc.setAuto('u1', pump.id, scheduled({ when: 'fixed', fixedTime: '09:00', pulses: 3, pauseMin: 15 }));
    let err: any = null;
    try {
      await svc.setPump('u1', pump.id, { ...pumpCfg, maxSeconds: 30 });
    } catch (e) {
      err = e;
    }
    assert(err && /riego automático/.test(err.message), `bajar el tope por debajo del riego: ${err?.message}`);
    await ticksUntil(env, ar('20261102', '10:00'));
    assert(records.map((r) => r.time).join() === '09:00,09:20,09:35', `pulsos 09:00, 09:16 y 09:32: ${records.map((r) => r.time)}`);
    assert(/pulso 3 de 3/.test(records[2].observations), records[2].observations);
    // la luz pasa a prender a las 6: la bomba se entera (para lo atado a la luz)
    assert((await svc.setSchedule('u1', 'c1', { ...light18, anchorMs: ar('20261024', '06:00') })).changed, 'cambió');
    const ov = await svc.overview('u1');
    assert(ov.bindings.find((x: any) => x.role === 'pump').schedule.anchorMs === ar('20261024', '06:00'), 'horario nuevo en la bomba');
  });

  await check('18. Por humedad: riega al llegar a seco, con pausas, hasta el tope del día; de noche espera', async () => {
    const env = setup(ar('20261101', '08:00'));
    const { svc, records, count, mock } = env;
    await svc.connectTuya('u1', { mock: true });
    const pump = await svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1', pump: pumpCfg, schedule: light18 });
    await svc.bind('u1', { deviceId: 'mocksoil01', code: 'sensor', role: 'sensor_soil', cultivationId: 'c1' });
    await svc.setAuto('u1', pump.id, { mode: 'wetdry', timeZone: TZ, wetdry: { dry: 40, wet: 65, shotS: 30, pauseMin: 15, maxShots: 3 } });
    const soil = (v: number) => mock().setReading('mocksoil01', { humidity: v });
    const note = async () => (await svc.overview('u1')).bindings.find((x: any) => x.role === 'pump').irrigation?.note || '';
    soil(42);
    await ticksUntil(env, ar('20261101', '08:05'));
    assert(count() === 0 && /todavía no está seco/.test(await note()), `42 %: no riega (${await note()})`);
    soil(38);
    await ticksUntil(env, ar('20261101', '08:10'));
    assert(count() === 1 && /sustrato en 38 %/.test(records[0].observations), `38 %: riega (${count()})`);
    soil(45);
    await ticksUntil(env, ar('20261101', '08:20'));
    assert(count() === 1, 'sigue regando hasta húmedo, pero respeta la pausa de 15 min');
    await ticksUntil(env, ar('20261101', '08:25'));
    assert(count() === 2 && /riega hasta 65 %/.test(records[1].observations), `a los 15 min, otro: ${count()}`);
    soil(50);
    await ticksUntil(env, ar('20261101', '09:30'));
    assert(count() === 3 && /ya regó 3 veces hoy/.test(await note()), `tope de 3 por día: ${count()} (${await note()})`);
    soil(70);
    await ticksUntil(env, ar('20261101', '09:35'));
    assert(/llegó a 65 %/.test(await note()), await note());
    // otro día, con la luz apagada (18/6 apaga a las 12): seco, pero espera a que prenda
    env.now.t = ar('20261102', '12:55');
    soil(30);
    await ticksUntil(env, ar('20261102', '13:00'));
    assert(count() === 3 && /de noche/.test(await note()), `de noche no riega: ${await note()}`);
    await ticksUntil(env, ar('20261102', '18:05'));
    assert(count() === 4 && records[3].time === '18:00', `prende la luz y riega: ${records.map((r) => r.time)}`);
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
