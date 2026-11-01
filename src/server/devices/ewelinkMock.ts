/**
 * Nube de eWeLink de prueba (sin cuenta ni equipos), traída de Órbita: responde como la API v2 (token
 * por OAuth con firma, lista de equipos, órdenes y temporizadores) y cumple el inching y los
 * temporizadores con el reloj, como el Sonoff. Rechaza con 4002 la orden { switch } en un equipo de
 * varios canales, como la nube de verdad.
 */
import { ewelinkHmac } from './ewelinkClient';

export const MOCK_EWELINK_APP = { appId: 'mockappid0000000', appSecret: 'mocksecret000000000000000000000', redirectUrl: 'http://localhost/equipos' };
export const MOCK_EWELINK_CODE = 'codigo-de-prueba';

const MIN = 60_000;

export function createMockEwelink(o: { now?: () => number } = {}) {
  const now = o.now || Date.now;
  const t0 = now();
  const dev = (deviceid: string, name: string, uiid: number, productModel: string, params: any) => ({ deviceid, name, online: true, extra: { uiid, model: productModel }, productModel, brandName: 'SONOFF', params, lastRun: t0, offAt: {} as Record<string, number> });
  const devices: Record<string, ReturnType<typeof dev>> = {
    '1000a1b2c3': dev('1000a1b2c3', 'Sonoff Basic (prueba)', 1, 'BASICR2', { switch: 'off', pulse: 'off', pulseWidth: 500, timers: [] }),
    '1000d4e5f6': dev('1000d4e5f6', 'Sonoff DUAL R3 (prueba)', 126, 'DUALR3', { switches: [0, 1, 2, 3].map((outlet) => ({ outlet, switch: 'off' })), pulses: [0, 1, 2, 3].map((outlet) => ({ outlet, pulse: 'off', width: 1000 })), timers: [] }),
    '1000a7b8c9': dev('1000a7b8c9', 'TH16 de la carpa (prueba)', 15, 'TH16', {
      switch: 'off',
      currentTemperature: '25.1',
      currentHumidity: '55',
      timers: [
        // horario de la persona en la app eWeLink: prende 9:00 y apaga 21:00 de Argentina (cron en UTC)
        { mId: 'aaaa0001-0000-4000-8000-000000000001', type: 'repeat', coolkit_timer_type: 'repeat', enabled: 1, at: '0 12 * * *', do: { switch: 'on' } },
        { mId: 'aaaa0001-0000-4000-8000-000000000002', type: 'repeat', coolkit_timer_type: 'repeat', enabled: 1, at: '0 0 * * *', do: { switch: 'off' } },
      ],
    }),
    '1000ccdd02': dev('1000ccdd02', 'SNZB-02 (prueba)', 1770, 'SNZB-02', { temperature: '2390', humidity: '6100', battery: 95 }),
  };
  const state = { codes: new Set([MOCK_EWELINK_CODE]), at: null as string | null, rt: null as string | null, calls: [] as any[] };
  const reply = (body: any) => ({ status: 200, ok: true, json: async () => body });
  const err = (error: number, msg: string) => reply({ error, msg, data: {} });

  function apply(d: any, a: any, at: number) {
    if (!a) return;
    if (a.outlet != null && Array.isArray(d.params.switches)) {
      const s = d.params.switches.find((x: any) => x.outlet === a.outlet);
      if (s) s.switch = a.switch;
    } else if (a.switch) d.params.switch = a.switch;
    if (a.switch === 'on') arm(d, a.outlet, at);
  }
  function arm(d: any, outlet: number | undefined, at: number) {
    if (outlet != null && d.params.pulses) {
      const p = d.params.pulses.find((x: any) => x.outlet === outlet && x.pulse === 'on');
      if (p) d.offAt[outlet] = at + p.width;
    } else if (outlet == null && d.params.pulse === 'on') d.offAt.single = at + d.params.pulseWidth;
  }
  function cronOk(spec: string, ms: number) {
    const [mm, hh, dd, mo, wd] = String(spec).split(/\s+/);
    const d = new Date(ms);
    const f = (x: string, v: number) => x === '*' || x.split(',').map(Number).includes(v);
    return f(mm, d.getUTCMinutes()) && f(hh, d.getUTCHours()) && f(dd, d.getUTCDate()) && f(mo, d.getUTCMonth() + 1) && f(wd, d.getUTCDay());
  }
  /** Lo que pasó desde la última consulta: inching y temporizadores, minuto a minuto. */
  function catchUp(d: any) {
    const t = now();
    const timers = (d.params.timers || []).filter((x: any) => x.enabled === 1);
    for (let m = Math.floor(d.lastRun / MIN) * MIN + MIN; m <= Math.min(t, d.lastRun + 40 * 1440 * MIN); m += MIN) {
      for (const [k, at] of Object.entries(d.offAt as Record<string, number>)) {
        if (at <= m) {
          apply(d, k === 'single' ? { switch: 'off' } : { outlet: +k, switch: 'off' }, at);
          delete d.offAt[k];
        }
      }
      for (const x of timers) {
        if (x.type === 'once' && Math.floor(Date.parse(x.at) / MIN) * MIN === m) apply(d, x.do, m);
        if (x.type === 'repeat' && cronOk(x.at, m)) apply(d, x.do, m);
        if (x.type === 'duration') {
          const [iso, per, run] = String(x.at).split(' ');
          const s = Math.floor(Date.parse(iso) / MIN) * MIN;
          const P = +per * MIN;
          const R = +run * MIN;
          if (m < s) continue;
          const ph = (m - s) % P;
          if (ph === 0) apply(d, x.startDo, m);
          else if (R && ph === R) apply(d, x.endDo, m);
        }
      }
    }
    // el inching que vence entre minutos (riegos de segundos)
    for (const [k, at] of Object.entries(d.offAt as Record<string, number>)) {
      if (at <= t) {
        apply(d, k === 'single' ? { switch: 'off' } : { outlet: +k, switch: 'off' }, at);
        delete d.offAt[k];
      }
    }
    d.lastRun = Math.max(d.lastRun, t);
  }

  async function fetchImpl(url: string, opts: any = {}) {
    const u = new URL(url);
    const h = opts.headers || {};
    const body = opts.body ? JSON.parse(opts.body) : {};
    state.calls.push({ method: opts.method, path: u.pathname, body });
    if (h['X-CK-Appid'] !== MOCK_EWELINK_APP.appId) return err(407, 'appid invalid');
    if (u.pathname === '/v2/user/oauth/token' || u.pathname === '/v2/user/refresh') {
      if (h.Authorization !== `Sign ${ewelinkHmac(opts.body, MOCK_EWELINK_APP.appSecret)}`) return err(401, 'sign invalid');
      if (u.pathname === '/v2/user/oauth/token' && !state.codes.has(body.code)) return err(400, 'code invalid');
      if (u.pathname === '/v2/user/refresh' && body.rt !== state.rt) return err(401, 'rt invalid');
      state.at = `at-${now()}`;
      state.rt = `rt-${now()}`;
      return reply({ error: 0, data: u.pathname.endsWith('token') ? { accessToken: state.at, refreshToken: state.rt, atExpiredTime: now() + 30 * 864e5, rtExpiredTime: now() + 60 * 864e5 } : { at: state.at, rt: state.rt } });
    }
    if (!state.at || h.Authorization !== `Bearer ${state.at}`) return err(401, 'token invalid');
    Object.values(devices).forEach(catchUp);
    if (u.pathname === '/v2/device/thing' && opts.method === 'GET') {
      const list = Object.values(devices).map((d, i) => ({ itemType: 1, index: i + 1, itemData: { deviceid: d.deviceid, name: d.name, online: d.online, extra: d.extra, productModel: d.productModel, brandName: d.brandName, params: JSON.parse(JSON.stringify(d.params)) } }));
      return reply({ error: 0, data: { thingList: list, total: list.length } });
    }
    if (u.pathname === '/v2/device/thing/status' && opts.method === 'POST') {
      const d = devices[body.id];
      if (!d) return err(4005, 'device not found');
      if (!d.online) return err(4003, 'device offline');
      const p = body.params || {};
      if (Array.isArray(d.params.switches) && 'switch' in p) return err(4002, 'params error');
      if (p.timers) d.params.timers = JSON.parse(JSON.stringify(p.timers));
      if (p.pulse) d.params.pulse = p.pulse;
      if (p.pulseWidth) d.params.pulseWidth = p.pulseWidth;
      (p.pulses || []).forEach((x: any) => {
        const q = d.params.pulses.find((y: any) => y.outlet === x.outlet);
        if (q) Object.assign(q, x);
      });
      if (p.switch) apply(d, { switch: p.switch }, now());
      (p.switches || []).forEach((x: any) => apply(d, x, now()));
      return reply({ error: 0, data: {} });
    }
    return err(404, 'not found');
  }

  return {
    fetchImpl,
    devices,
    state,
    /** Cumple el inching y los temporizadores hasta ahora (el equipo lo hace solo). */
    tick() {
      Object.values(devices).forEach(catchUp);
    },
    /** Como si alguien cambiara el toma desde la app eWeLink o con el botón. */
    flip(deviceid: string, outlet = 0) {
      const d = devices[deviceid];
      catchUp(d);
      if (Array.isArray(d.params.switches)) {
        const s = d.params.switches.find((x: any) => x.outlet === outlet);
        s.switch = s.switch === 'on' ? 'off' : 'on';
      } else d.params.switch = d.params.switch === 'on' ? 'off' : 'on';
    },
    /** El estado de una toma ("on" / "off"). */
    out(deviceid: string, outlet = 0): string {
      const d = devices[deviceid];
      catchUp(d);
      return Array.isArray(d.params.switches) ? d.params.switches.find((x: any) => x.outlet === outlet).switch : d.params.switch;
    },
  };
}

export type MockEwelink = ReturnType<typeof createMockEwelink>;
