/**
 * Nube de Tuya de prueba (traída de Órbita): responde como la API real (token, equipos vinculados,
 * estado, especificación, órdenes y programaciones) y verifica la firma de cada pedido. No se conecta a
 * nada real. Sirve para los tests y para "Probar con una zapatilla de prueba" en Equipos.
 */
import { tuyaSign, signUrl } from './tuyaClient';
import { zonedToMs } from './tz';

type Status = Record<string, any>;
interface MockDevice {
  id: string;
  name: string;
  product_name: string;
  category: string;
  online: boolean;
  status: Status;
}
interface MockTimer {
  time: string;
  date: string;
  loops: string;
  status: number;
  timer_id: string;
  alias_name: string;
  timezone_id: string;
  functions: Array<{ code: string; value: unknown }>;
}
interface MockCategory {
  category: { category: string };
  groups: Array<{ id: string; timers: MockTimer[] }>;
}

export const MOCK_TUYA_ID = 'mockid000000';
export const MOCK_TUYA_SECRET = 'mocksecret0000000000000000000000';

export function createMockTuya(o: { now?: () => number; withSensors?: boolean; timeZone?: string } = {}) {
  const now = o.now || Date.now;
  const tz = o.timeZone || 'America/Argentina/Buenos_Aires';
  const devices: Record<string, MockDevice> = {
    mockstrip01: {
      id: 'mockstrip01',
      name: 'Zapatilla 4 tomas (prueba)',
      product_name: 'Power Strip',
      category: 'cz',
      online: true,
      status: { switch_1: false, switch_2: false, switch_3: false, switch_4: false, switch_usb1: false, countdown_1: 0, countdown_2: 0, countdown_3: 0, countdown_4: 0, cur_power: 0 },
    },
  };
  const SCALES: Record<string, number> = { va_temperature: 1, temp_current: 1 };
  if (o.withSensors !== false) {
    devices.mockth01 = { id: 'mockth01', name: 'Sensor T/H (prueba)', product_name: 'Temperature Humidity Sensor', category: 'wsdcg', online: true, status: { va_temperature: 245, va_humidity: 58, battery_percentage: 90 } };
    devices.mocksoil01 = { id: 'mocksoil01', name: 'Sensor de sustrato (prueba)', product_name: 'Soil Sensor', category: 'zwjcy', online: true, status: { humidity: 42, temp_current: 210, battery_percentage: 80 } };
  }
  const loads: Record<string, number> = { switch_1: 2400, switch_2: 450, switch_3: 250, switch_4: 150 };
  const recalc = (d: MockDevice) => {
    if ('cur_power' in d.status) d.status.cur_power = Object.entries(loads).reduce((a, [c, w]) => a + (d.status[c] ? w : 0), 0);
  };
  // programaciones "de la app Smart Life" de ejemplo: la luz prende 07:00 y apaga 20:00 todos los días
  const daily = (id: string, time: string, code: string, value: boolean): { id: string; timers: MockTimer[] } => ({
    id,
    timers: [{ time, loops: '1111111', date: '00000000', status: 1, timer_id: `${id}t`, alias_name: '', timezone_id: tz, functions: [{ code, value }] }],
  });
  const timers: Record<string, MockCategory[]> = {
    mockstrip01: [{ category: { category: 'category_switch_1' }, groups: [daily('g1on', '07:00', 'switch_1', true), daily('g1off', '20:00', 'switch_1', false)] }],
  };
  const state = { tokens: {} as Record<string, boolean>, calls: [] as any[], offline: false };
  const ok = (result: unknown) => ({ success: true, result, t: now() });
  const fail = (code: number, msg: string) => ({ success: false, code, msg, t: now() });
  const ran = new Set<string>();
  const cdEnd: Record<string, number> = {};
  const runCountdowns = () => {
    const t = now();
    Object.entries(cdEnd).forEach(([k, end]) => {
      if (t < end) return;
      const [id, code] = k.split('|');
      devices[id].status[code] = false;
      delete cdEnd[k];
      recalc(devices[id]);
    });
  };

  /** La "nube" ejecuta las programaciones de un solo uso que ya vencieron (para probar sin servidor). */
  function runCloud(t: number, id = 'mockstrip01') {
    (timers[id] || []).forEach((c) =>
      c.groups.forEach((g) =>
        g.timers.forEach((x) => {
          if (x.status !== 1 || x.loops !== '0000000' || ran.has(x.timer_id) || zonedToMs(x.date, x.time, x.timezone_id) > t) return;
          ran.add(x.timer_id);
          x.functions.forEach((f) => {
            devices[id].status[f.code] = f.value;
          });
          recalc(devices[id]);
        })
      )
    );
  }

  async function fetchImpl(fullUrl: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
    const method = init.method || 'GET';
    const headers = init.headers || {};
    const body = init.body;
    const u = new URL(fullUrl);
    const query = Object.fromEntries(u.searchParams.entries());
    const url = signUrl(u.pathname, query);
    state.calls.push({ method, path: u.pathname, body: body ? JSON.parse(body) : null });
    const respond = (j: unknown) => ({ status: 200, json: async () => j });
    runCountdowns();
    if (headers.client_id !== MOCK_TUYA_ID) return respond(fail(1005, 'clientId is invalid'));
    const token = headers.access_token || '';
    const expected = tuyaSign({ clientId: MOCK_TUYA_ID, secret: MOCK_TUYA_SECRET, accessToken: token, t: headers.t, nonce: headers.nonce, method, url, body: body || '' });
    if (expected !== headers.sign) return respond(fail(1004, 'sign invalid'));
    if (u.pathname === '/v1.0/token' || u.pathname.startsWith('/v1.0/token/')) {
      const tk = 'tk' + Math.random().toString(36).slice(2, 12);
      state.tokens[tk] = true;
      return respond(ok({ access_token: tk, refresh_token: 'rf' + tk, expire_time: 7200, uid: 'mockuid' }));
    }
    if (!state.tokens[token]) return respond(fail(1010, 'token invalid'));
    const asList = (d: MockDevice) => ({ ...d, online: d.online && !state.offline, update_time: Math.floor(now() / 1000), status: Object.entries(d.status).map(([code, value]) => ({ code, value })) });
    if (u.pathname === '/v1.0/iot-01/associated-users/devices') return respond(ok({ devices: Object.values(devices).map(asList), has_more: false }));
    let m = /^\/v1\.0\/devices\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const d = devices[m[1]];
      return respond(d ? ok(asList(d)) : fail(2001, 'device not exist'));
    }
    m = /^\/v1\.0\/iot-03\/devices\/([^/]+)\/specification$/.exec(u.pathname);
    if (m) {
      const d = devices[m[1]];
      if (!d) return respond(fail(2001, 'device not exist'));
      const fn = Object.keys(d.status)
        .filter((c) => /^switch|^countdown/.test(c))
        .map((code) => ({ code, type: code.startsWith('switch') ? 'Boolean' : 'Integer', values: code.startsWith('countdown') ? JSON.stringify({ unit: 's', min: 0, max: 86400, scale: 0 }) : '{}' }));
      const st = Object.keys(d.status)
        .filter((c) => typeof d.status[c] === 'number' && !/^switch|^countdown/.test(c))
        .map((code) => ({ code, type: 'Integer', values: JSON.stringify({ scale: SCALES[code] || 0 }) }));
      return respond(ok({ category: d.category, functions: fn, status: fn.concat(st) }));
    }
    m = /^\/v1\.0\/devices\/([^/]+)\/timers$/.exec(u.pathname);
    if (m && method === 'GET') return respond(ok(timers[m[1]] || []));
    if (m && method === 'POST') {
      // como la API real: las de un solo uso solo en el futuro; máximo 30 por equipo (contando las pausadas)
      const b = JSON.parse(body || '{}');
      if (!b.category || !/^[01]{7}$/.test(b.loops || '') || !b.timezone_id || !b.time_zone || !Array.isArray(b.instruct) || !b.instruct.length) return respond(fail(1109, 'param is illegal'));
      for (const x of b.instruct) {
        if (b.loops === '0000000' && (!/^\d{8}$/.test(x.date || '') || zonedToMs(x.date, x.time, b.timezone_id) <= now())) return respond(fail(1109, 'timer time expired'));
      }
      const list = timers[m[1]] || (timers[m[1]] = []);
      const total = list.reduce((n, c) => n + c.groups.reduce((k, g) => k + g.timers.length, 0), 0);
      if (total + b.instruct.length > 30) return respond(fail(1109, 'LINKAGE_TIMER_OVER_MAX_LIMIT_30'));
      let cat = list.find((c) => c.category.category === b.category);
      if (!cat) list.push((cat = { category: { category: b.category }, groups: [] }));
      const gid = 'g' + Math.random().toString(36).slice(2, 10);
      cat.groups.push({
        id: gid,
        timers: b.instruct.map((x: any, i: number) => ({ time: x.time, date: x.date || '00000000', loops: b.loops, status: 1, timer_id: gid + i, alias_name: b.alias_name || '', timezone_id: b.timezone_id, functions: x.functions })),
      });
      return respond(ok({ group_id: gid }));
    }
    m = /^\/v1\.0\/devices\/([^/]+)\/timers\/categories\/([^/]+)\/groups\/([^/]+)\/status$/.exec(u.pathname);
    if (m && method === 'PUT') {
      const cat = (timers[m[1]] || []).find((c) => c.category.category === decodeURIComponent(m![2]));
      const g = cat && cat.groups.find((x) => x.id === decodeURIComponent(m![3]));
      if (!g) return respond(fail(2001, 'timer not exist'));
      const { value } = JSON.parse(body || '{}');
      if (!['0', '1'].includes(value)) return respond(fail(1109, 'param is illegal'));
      g.timers.forEach((t) => {
        t.status = +value;
      });
      return respond(ok(true));
    }
    m = /^\/v1\.0\/devices\/([^/]+)\/timers\/categories\/([^/]+)\/groups\/([^/]+)$/.exec(u.pathname);
    if (m && method === 'DELETE') {
      const cat = (timers[m[1]] || []).find((x) => x.category.category === decodeURIComponent(m![2]));
      const gi = cat ? cat.groups.findIndex((g) => g.id === decodeURIComponent(m![3])) : -1;
      if (gi < 0) return respond(fail(2001, 'timer not exist'));
      cat!.groups.splice(gi, 1);
      return respond(ok(true));
    }
    m = /^\/v1\.0\/devices\/([^/]+)\/timers\/categories\/([^/]+)$/.exec(u.pathname);
    if (m && method === 'DELETE') {
      const list = timers[m[1]] || [];
      const i = list.findIndex((c) => c.category.category === decodeURIComponent(m![2]));
      if (i < 0) return respond(fail(2001, 'timer not exist'));
      list.splice(i, 1);
      return respond(ok(true));
    }
    m = /^\/v1\.0\/iot-03\/devices\/([^/]+)\/commands$/.exec(u.pathname);
    if (m && method === 'POST') {
      const d = devices[m[1]];
      if (!d) return respond(fail(2001, 'device not exist'));
      if (!d.online || state.offline) return respond(fail(2008, 'device is offline'));
      const { commands } = JSON.parse(body || '{}');
      for (const c of commands || []) {
        if (!(c.code in d.status)) return respond(fail(2017, 'command or value not support'));
        d.status[c.code] = c.value;
        const sw = String(c.code).replace('countdown', 'switch');
        if (String(c.code).startsWith('countdown')) {
          if (c.value > 0) cdEnd[`${d.id}|${sw}`] = now() + c.value * 1000;
          else delete cdEnd[`${d.id}|${sw}`];
        }
      }
      recalc(d);
      return respond(ok(true));
    }
    return respond(fail(1108, 'uri path invalid'));
  }

  return {
    fetchImpl,
    devices,
    timers,
    state,
    runCloud,
    /** Cambia lo que mide un sensor de prueba. */
    setReading(id: string, values: Status) {
      Object.assign(devices[id].status, values);
    },
    /** Como si alguien cambiara el toma desde la app Smart Life o con el botón. */
    flip(code: string, id = 'mockstrip01') {
      devices[id].status[code] = !devices[id].status[code];
      recalc(devices[id]);
    },
  };
}

export type MockTuya = ReturnType<typeof createMockTuya>;
