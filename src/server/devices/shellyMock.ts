/**
 * Shelly Cloud de prueba (sin cuenta ni equipos): responde /device/all_status, /v2/devices/api/get y
 * /v2/devices/api/set/switch como la nube de verdad, y cumple el toggle_after con el reloj (el equipo
 * se da vuelta solo). Un Shelly Plus 2PM (Gen2, 2 salidas), un Shelly 1 (Gen1) y un H&T (Gen2).
 */
export const MOCK_SHELLY = { server: 'https://shelly-mock-eu.shelly.cloud', authKey: 'MOCKSHELLYAUTHKEY0000000000000000000000000000' };

type Out = { output: boolean; timer: { startedAt: number; duration: number; to: boolean } | null };

export function createMockShelly(o: { now?: () => number; listWorks?: boolean } = {}) {
  const now = o.now || Date.now;
  const devices: Record<string, { gen: number; code: string; online: boolean; outs: Out[]; tC?: number; rh?: number; battery?: number; watts?: number }> = {
    a8032ab1c2d3: { gen: 2, code: 'SNSW-102P16EU', online: true, outs: [{ output: false, timer: null }, { output: false, timer: null }], watts: 0 },
    e8db84d4b2f1: { gen: 1, code: 'SHSW-1', online: true, outs: [{ output: false, timer: null }] },
    b0b21c11aa01: { gen: 2, code: 'SNSN-0013A', online: true, outs: [], tC: 24.2, rh: 57, battery: 88 },
  };
  const state = { calls: [] as Array<{ path: string; body: any }>, listWorks: o.listWorks !== false };
  const reply = (status: number, body: any) => ({ status, ok: status < 400, json: async () => body });

  /** El equipo se da vuelta solo cuando vence su toggle_after. */
  function catchUp(id: string) {
    for (const out of devices[id].outs) {
      if (out.timer && out.timer.startedAt + out.timer.duration <= now() / 1000) {
        out.output = out.timer.to;
        out.timer = null;
      }
    }
  }
  function statusOf(id: string) {
    const d = devices[id];
    catchUp(id);
    if (d.gen === 1) {
      return {
        relays: d.outs.map((x) => ({ ison: x.output, has_timer: !!x.timer, timer_remaining: x.timer ? Math.round(x.timer.startedAt + x.timer.duration - now() / 1000) : 0 })),
        meters: d.outs.map(() => ({ power: 0 })),
      };
    }
    const st: any = { sys: { unixtime: Math.floor(now() / 1000) } };
    d.outs.forEach((x, i) => {
      st[`switch:${i}`] = { id: i, output: x.output, apower: x.output ? d.watts || 0 : 0, ...(x.timer ? { timer_started_at: x.timer.startedAt, timer_duration: x.timer.duration } : {}) };
    });
    if (d.tC != null) st['temperature:0'] = { id: 0, tC: d.tC };
    if (d.rh != null) st['humidity:0'] = { id: 0, rh: d.rh };
    if (d.battery != null) st['devicepower:0'] = { id: 0, battery: { percent: d.battery } };
    return st;
  }

  async function fetchImpl(url: string, opts: any = {}) {
    const u = new URL(url);
    const isForm = /urlencoded/.test(opts.headers?.['Content-Type'] || '');
    const body = isForm ? Object.fromEntries(new URLSearchParams(opts.body)) : opts.body ? JSON.parse(opts.body) : {};
    state.calls.push({ path: u.pathname, body });
    const key = isForm ? body.auth_key : u.searchParams.get('auth_key');
    if (u.origin !== MOCK_SHELLY.server) return reply(404, { error: 'NOT_FOUND' });
    if (key !== MOCK_SHELLY.authKey) return reply(401, { isok: false, errors: { invalid_token: 'Invalid auth key' } });
    if (u.pathname === '/device/all_status') {
      if (!state.listWorks) return reply(404, { isok: false, errors: { not_found: 'Not found' } });
      const map = Object.fromEntries(Object.keys(devices).map((id) => [id, { ...statusOf(id), _dev_info: { id, gen: `G${devices[id].gen}`, code: devices[id].code, online: devices[id].online } }]));
      return reply(200, { isok: true, data: { devices_status: map } });
    }
    if (u.pathname === '/v2/devices/api/get') {
      return reply(
        200,
        (body.ids || []).filter((id: string) => devices[id]).map((id: string) => ({ id, type: 'relay', code: devices[id].code, gen: devices[id].gen, online: devices[id].online ? 1 : 0, status: statusOf(id) }))
      );
    }
    if (u.pathname === '/v2/devices/api/set/switch') {
      const d = devices[body.id];
      if (!d) return reply(400, { error: 'DEVICE_NOT_FOUND', data: { messages: ['Device not found'] } });
      if (!d.online) return reply(400, { error: 'DEVICE_OFFLINE', data: { messages: ['Device is offline'] } });
      const out = d.outs[body.channel || 0];
      if (!out) return reply(400, { error: 'DEVICE_INVALID_CHANNEL', data: { messages: ['Invalid channel'] } });
      catchUp(body.id);
      out.output = !!body.on;
      out.timer = body.toggle_after > 0 ? { startedAt: now() / 1000, duration: body.toggle_after, to: !body.on } : null;
      return reply(200, null);
    }
    return reply(404, { error: 'NOT_FOUND' });
  }

  return {
    fetchImpl,
    devices,
    state,
    /** La salida (y si se va a dar vuelta sola). */
    out(id: string, ch = 0) {
      catchUp(id);
      return devices[id].outs[ch];
    },
    /** Como si alguien la cambiara con el botón o desde la app Shelly (sin timer). */
    flip(id: string, ch = 0) {
      catchUp(id);
      const out = devices[id].outs[ch];
      out.output = !out.output;
      out.timer = null;
    },
  };
}

export type MockShelly = ReturnType<typeof createMockShelly>;
