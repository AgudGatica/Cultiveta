/**
 * Seguridad de los equipos reales, a partir de la revisión de código del 2026-11-07:
 *  1. Un horario de ciclo mínimo se rechaza y un dato roto ya guardado no cuelga los cálculos.
 *  2. Si la cuenta está ocupada, la consulta no escribe nada y la revisión saltea esa vuelta.
 *  3. Una marca desconectada no vuelve por una consulta o revisión en curso.
 *  4. Dos revisiones a la vez riegan una sola vez, y el riego queda guardado antes de prender.
 *  5. Cortar el riego no espera turno.
 *  6. Un cultivo terminado o borrado no se riega solo.
 *  7. Calefactor y humidificador se apagan al dejar de manejarlos.
 *  8. Los topes valen para lo que riega de verdad; no se pisa un riego en curso.
 *  9. Un error de riego no lo borra otro equipo que anduvo bien.
 * 10. Una clave de Tuya mal escrita no toca lo cargado en los equipos.
 * 11. Una cuenta caída no frena la revisión de las demás.
 */

import { DeviceService, MemoryDeviceStore, validateSchedule } from '../src/server/devices/deviceService';
import { scheduledWaterings } from '../src/server/devices/autoIrrigation';
import { onIntervals } from '../src/utils/lightCycle';
import { zonedToMs } from '../src/server/devices/tz';

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
const light18 = { lightHours: 18, darkHours: 6, anchorMs: ar('20261024', '18:00'), timeZone: TZ };
const pumpCfg = { flowLph: 8, maxSeconds: 120, maxLiters: 5 };
const scheduled = (extra: any = {}) => ({ mode: 'scheduled', timeZone: TZ, scheduled: { when: 'light', trigger: 'after_on', offsetMin: 30, fixedTime: '09:00', shotS: 60, pulses: 1, pauseMin: 30, ...extra } });

function setup(start: number, extra: any = {}) {
  const now = { t: start };
  const records: any[] = [];
  const store = new MemoryDeviceStore();
  const svc = new DeviceService({ store, now: () => now.t, recordWatering: async (_u, w) => void records.push(w), ...extra });
  return { now, svc, store, records, mock: () => svc.mockOf('u1') };
}
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e: any) {
    return e;
  }
};
const pumpFor = async (env: ReturnType<typeof setup>) => {
  await env.svc.connectTuya('u1', { mock: true });
  return env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_2', role: 'pump', cultivationId: 'c1', pump: pumpCfg, schedule: light18 });
};

async function run() {
  console.log('\n================================================================');
  console.log('   SEGURIDAD DE LOS EQUIPOS');
  console.log('================================================================\n');

  await check('1. Horarios: ciclo menor a una hora rechazado; un dato roto guardado no cuelga nada', () => {
    const bad = { lightHours: 1e-12, darkHours: 0, anchorMs: 0, timeZone: TZ };
    let err: any = null;
    try {
      validateSchedule(bad);
    } catch (e) {
      err = e;
    }
    assert(/inválido/.test(err?.message || ''), 'rechazado al guardar');
    assert(validateSchedule({ ...light18, lightHours: 13, darkHours: 13 })?.lightHours === 13, 'un superciclo sigue valiendo');
    const t = ar('20261031', '10:00');
    const auto = scheduled() as any;
    assert(scheduledWaterings(auto, bad, t, t + 60_000).length === 0, 'riego: termina y no programa nada');
    assert(onIntervals({ lightHours: 0.0000005, darkHours: 0 }, 0, t, t + 86_400_000).length === 0, 'luz: termina y no devuelve tramos');
  });

  await check('2. Cuenta ocupada: la consulta muestra lo guardado sin escribir y la revisión saltea', async () => {
    const env = setup(ar('20261031', '10:00'));
    await pumpFor(env);
    await env.store.acquire('u1', 'otro', env.now.t, 60_000);
    const before = JSON.stringify(await env.store.get('u1'));
    const ov = await env.svc.overview('u1');
    assert(ov.connected && ov.bindings.length === 1, 'igual muestra los equipos');
    assert(JSON.stringify(await env.store.get('u1')) === before, 'no escribió');
    const r: any = await env.svc.tick('u1');
    assert(r.skipped === true, 'la revisión saltea esa vuelta');
    await env.store.release('u1', 'otro');
    assert(!(await env.svc.tick('u1') as any).skipped, 'libre: revisa');
  });

  await check('3. Una marca desconectada no vuelve por una consulta en curso', async () => {
    const env = setup(ar('20261031', '10:00'));
    await env.svc.connectTuya('u1', { mock: true });
    await Promise.all([env.svc.overview('u1'), env.svc.overview('u1'), env.svc.disconnectTuya('u1'), env.svc.tick('u1')]);
    await env.svc.overview('u1');
    assert(!(await env.store.get('u1')), 'sigue borrada');
    assert((await env.store.listUserIds()).length === 0, 'la revisión ya no la encuentra');
  });

  await check('4. Dos revisiones a la vez riegan una vez; lo guarda antes de prender', async () => {
    const env = setup(ar('20261031', '18:29'));
    const pump = await pumpFor(env);
    await env.svc.setAuto('u1', pump.id, scheduled());
    env.now.t = ar('20261031', '18:31');
    let savedBeforeOn = false;
    const realSave = env.store.save.bind(env.store);
    env.store.save = async (u, d) => {
      if ((d.irrigation?.[pump.id]?.lastCheck ?? 0) > ar('20261031', '18:30') && env.mock().devices.mockstrip01.status.switch_2 === false) savedBeforeOn = true;
      return realSave(u, d);
    };
    await Promise.all([env.svc.tick('u1'), env.svc.tick('u1'), env.svc.tick('u1')]);
    assert(env.records.length === 1, `un riego: ${env.records.length}`);
    assert(savedBeforeOn, 'el turno de riego quedó guardado antes de prender la bomba');
  });

  await check('5. Cortar el riego no espera a que se libere la cuenta', async () => {
    const env = setup(ar('20261031', '10:00'));
    const pump = await pumpFor(env);
    await env.svc.water('u1', pump.id, 30);
    assert(env.mock().devices.mockstrip01.status.switch_2 === true, 'regando');
    await env.store.acquire('u1', 'otro', env.now.t, 60_000);
    const stop = env.svc.stopWater('u1', pump.id).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    assert(env.mock().devices.mockstrip01.status.switch_2 === false, 'la bomba ya se apagó');
    await env.store.release('u1', 'otro');
    await stop;
  });

  await check('6. Cultivo terminado o borrado: no riega y deja anotado por qué', async () => {
    for (const [state, text] of [['finished', 'terminó'], ['missing', 'no existe']] as const) {
      const env = setup(ar('20261031', '18:29'), { cropState: async () => state });
      const pump = await pumpFor(env);
      await env.svc.setAuto('u1', pump.id, scheduled());
      env.now.t = ar('20261031', '18:31');
      await env.svc.tick('u1');
      assert(env.records.length === 0, `${state}: no riega`);
      const b = (await env.svc.overview('u1')).bindings.find((x: any) => x.role === 'pump');
      assert(new RegExp(text).test(b.irrigation.note), `${state}: ${b.irrigation.note}`);
    }
    const down = setup(ar('20261031', '18:29'), { cropState: async () => { throw new Error('sin base'); } });
    const pump = await pumpFor(down);
    await down.svc.setAuto('u1', pump.id, scheduled());
    down.now.t = ar('20261031', '18:31');
    await down.svc.tick('u1');
    assert(down.records.length === 0, 'si no se puede saber, tampoco riega');
  });

  await check('7. Calefactor y humidificador quedan apagados; un extractor no se toca', async () => {
    const env = setup(ar('20261031', '10:00'));
    await env.svc.connectTuya('u1', { mock: true });
    const always = { mode: 'always', sensorLoss: 'off' };
    const heater = await env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'climate', climateRole: 'heater', cultivationId: 'c1', rule: always });
    const fan = await env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_3', role: 'climate', climateRole: 'exhaust', cultivationId: 'c1', rule: always });
    const st = () => env.mock().devices.mockstrip01.status;
    assert(st().switch_1 === true && st().switch_3 === true, 'prendidos');
    await env.svc.unbind('u1', heater.id);
    assert(st().switch_1 === false, 'calefactor apagado al desasignar');
    await env.svc.unbind('u1', fan.id);
    assert(st().switch_3 === true, 'el extractor queda como estaba');
    await env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'climate', climateRole: 'humidifier', cultivationId: 'c1', rule: always });
    assert(st().switch_1 === true, 'humidificador prendido');
    await env.svc.disconnectTuya('u1');
    assert(st().switch_1 === false, 'apagado al desconectar');
  });

  await check('8. Topes con redondeo por minutos; no se pisa un riego en curso', async () => {
    const env = setup(ar('20261031', '10:00'));
    const pump = await pumpFor(env);
    await env.svc.water('u1', pump.id, 30);
    const twice = await fails(() => env.svc.water('u1', pump.id, 30));
    assert(twice?.status === 409 && /ya está regando/.test(twice.message), `doble toque: ${twice?.message}`);
    env.now.t += 31_000;
    const saved = (await env.store.get('u1'))!;
    saved.bindings[0].countdownUnit = 'min';
    saved.bindings[0].pump = { flowLph: 8, maxSeconds: 30, maxLiters: 5 };
    await env.store.save('u1', saved);
    const capped = await fails(() => env.svc.water('u1', pump.id, 10));
    assert(capped?.status === 409 && /minutos/.test(capped.message), `tope: ${capped?.message}`);
  });

  await check('9. Un riego que falla no queda tapado por otro equipo que anduvo bien', async () => {
    const problems: string[] = [];
    const env = setup(ar('20261031', '18:29'), { onProblem: (_u: string, text: string) => problems.push(text) });
    const pump = await pumpFor(env);
    await env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c2', schedule: light18 });
    await env.svc.setAuto('u1', pump.id, scheduled());
    const saved = (await env.store.get('u1'))!;
    saved.bindings.find((b) => b.id === pump.id)!.pump = { flowLph: 8, maxSeconds: 30, maxLiters: 5 };
    await env.store.save('u1', saved);
    env.now.t = ar('20261031', '18:31');
    await env.svc.tick('u1');
    assert(problems.length === 1, `aviso: ${JSON.stringify(problems)}`);
    assert(((await env.store.get('u1'))!).lastError, 'el error queda guardado');
  });

  await check('10. Una clave de Tuya mal escrita no toca lo cargado', async () => {
    const env = setup(ar('20261031', '10:00'));
    await env.svc.connectTuya('u1', { mock: true });
    await env.svc.bind('u1', { deviceId: 'mockstrip01', code: 'switch_1', role: 'light', cultivationId: 'c1', schedule: light18 });
    const before = JSON.stringify((await env.store.get('u1'))!.bindings);
    const err = await fails(() => env.svc.connectTuya('u1', { accessId: 'corto', accessSecret: 'x' }));
    assert(err, 'rechaza');
    assert(JSON.stringify((await env.store.get('u1'))!.bindings) === before, 'la luz sigue asignada');
  });

  await check('11. Una cuenta que falla no frena a las demás', async () => {
    const env = setup(ar('20261031', '10:00'));
    await env.svc.connectTuya('u1', { mock: true });
    await env.svc.connectTuya('u2', { mock: true });
    const realGet = env.store.get.bind(env.store);
    env.store.get = async (u) => {
      if (u === 'u1') throw new Error('falla de esta cuenta');
      return realGet(u);
    };
    const warn = console.warn;
    console.warn = () => {};
    const r: any = await env.svc.tickAll();
    console.warn = warn;
    assert(r.accounts === 2 && r.failed === 1, JSON.stringify(r));
  });

  console.log('\n================================================================');
  console.log(` RESULTADO SEGURIDAD DE EQUIPOS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en devices_safety:', err);
  process.exit(1);
});
