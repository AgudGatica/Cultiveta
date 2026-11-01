/**
 * Sonoff y otros equipos de eWeLink por la API oficial v2 de CoolKit (traído de Órbita). Cultiveta tiene
 * UNA app en dev.ewelink.cc (APPID, APP SECRET y Redirect URL en variables del servidor): cada persona
 * solo inicia sesión en eWeLink y vuelve con un código que el servidor cambia por el token.
 * Habla "como" Tuya:
 *   · Tomas: "switch_N" (N = outlet + 1). Un canal: { switch }. Varios: { switches: [{ outlet, switch }] }.
 *     Cuántos canales tiene sale del catálogo por uiid (el MINI R4 y el BASIC R4 publican cuatro y son de uno).
 *   · Cuenta regresiva "countdown_N": el "inching" (pulse) del equipo, que lo apaga solo aunque se corte
 *     internet. Solo la tienen los equipos que publican pulse / pulses (la bomba la necesita).
 *   · Horario de la luz: un temporizador de bucle (type "duration") por toma guardado en el equipo:
 *     "at": "<inicio UTC> <vuelta en min> <min hasta la segunda orden>". No vence (máx. 8 activos por equipo).
 */
import crypto from 'crypto';
import type { TuyaTimer } from './tuyaClient';
import type { DeviceCloud, LoopPlan } from './cloud';

type FetchLike = (url: string, init?: any) => Promise<{ status: number; ok?: boolean; json: () => Promise<any> }>;

export const EWELINK_PREFIX = 'ewelink-';
export const EWELINK_REGIONS = ['us', 'eu', 'as', 'cn'] as const;
const OAUTH_PAGE = 'https://c2ccdn.coolkit.cc/oauth/index.html';
const MAX_ENABLED = 8;
const OWN_CATEGORY = 'cultiveta';
/** Canales por uiid (los que tienen más de uno); el resto es de un canal. */
const CHANNELS: Record<number, number> = { 2: 2, 3: 3, 4: 4, 7: 2, 8: 3, 9: 4, 29: 2, 30: 3, 31: 4, 113: 2, 114: 3, 126: 2, 139: 2, 140: 3, 141: 4, 161: 2, 162: 3, 165: 2 };

export interface EwelinkConfig {
  appId: string;
  appSecret: string;
  redirectUrl: string;
  region: string;
  at?: string;
  rt?: string;
  atExp?: number;
  rtExp?: number;
  /** Temporizadores que cargó Cultiveta en cada equipo (mId). */
  mine: Record<string, string[]>;
}

export class EwelinkError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export const ewelinkHmac = (msg: string, secret: string) => crypto.createHmac('sha256', secret).update(msg).digest('base64');
const nonce = () => crypto.randomBytes(4).toString('hex');
export const ewelinkHost = (region: string) => `https://${region || 'us'}-apia.coolkit.${region === 'cn' ? 'cn' : 'cc'}`;
const rawId = (id: string) => String(id).replace(EWELINK_PREFIX, '');
/** "23.5" o 2350 (Zigbee, en centésimos) → 23,5; "unavailable" → null. */
function num(v: unknown, max: number): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round((Math.abs(n) > max ? n / 100 : n) * 10) / 10;
}
function friendly(code: number, msg?: string): string {
  if (code === 401 || code === 402) return 'La sesión de eWeLink venció: volvé a conectar eWeLink en Equipos.';
  if (code === 407) return 'La app de Cultiveta en eWeLink no tiene permiso para esto (revisá la APPID de OAuth 2.0 en dev.ewelink.cc).';
  if (code === 4002) return 'El equipo no aceptó la orden (formato de canales distinto).';
  if (code === 503 || code === 504 || code === 4003) return 'El equipo de eWeLink no responde (sin conexión).';
  return `eWeLink: ${msg || 'error'} (${code}).`;
}

export class EwelinkCloud implements DeviceCloud {
  calls = 0;
  cfg: EwelinkConfig;
  private fetchImpl: FetchLike;
  private now: () => number;
  private onChange: (cfg: EwelinkConfig) => void;
  private cache: { at: number; list: any[] | null } = { at: 0, list: null };

  constructor(o: { cfg: EwelinkConfig; fetchImpl?: FetchLike; now?: () => number; onChange?: (cfg: EwelinkConfig) => void }) {
    this.cfg = { ...o.cfg, mine: { ...(o.cfg.mine || {}) } };
    this.fetchImpl = o.fetchImpl || ((url, init) => fetch(url, init) as any);
    this.now = o.now || Date.now;
    this.onChange = o.onChange || (() => {});
  }

  // ---------- OAuth ----------

  loginUrl(state: string): string {
    const { appId, appSecret, redirectUrl } = this.cfg;
    const seq = String(this.now());
    const q = new URLSearchParams({ clientId: appId, seq, authorization: ewelinkHmac(`${appId}_${seq}`, appSecret), redirectUrl, grantType: 'authorization_code', state, nonce: nonce(), showQRCode: 'false' });
    return `${OAUTH_PAGE}?${q}`;
  }
  private async raw(region: string, method: string, path: string, body: string | undefined, extra: Record<string, string>) {
    this.calls++;
    let res;
    try {
      res = await this.fetchImpl(`${ewelinkHost(region)}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-CK-Appid': this.cfg.appId, 'X-CK-Nonce': nonce(), ...extra }, body });
    } catch {
      throw new EwelinkError('No hay conexión con eWeLink.', -1);
    }
    let j: any;
    try {
      j = await res.json();
    } catch {
      throw new EwelinkError(`eWeLink respondió algo inesperado (HTTP ${res.status}).`, res.status);
    }
    if (j.error) throw new EwelinkError(friendly(j.error, j.msg), j.error);
    return j.data || {};
  }
  private signed(region: string, path: string, body: unknown) {
    const txt = JSON.stringify(body);
    return this.raw(region, 'POST', path, txt, { Authorization: `Sign ${ewelinkHmac(txt, this.cfg.appSecret)}` });
  }
  /** Cambia el código de la página de eWeLink por el token (queda en cfg). */
  async exchange(code: string, region: string) {
    const d = await this.signed(region, '/v2/user/oauth/token', { code: String(code), redirectUrl: this.cfg.redirectUrl, grantType: 'authorization_code' });
    Object.assign(this.cfg, { region, at: d.accessToken || d.at, rt: d.refreshToken || d.rt, atExp: d.atExpiredTime || this.now() + 30 * 864e5, rtExp: d.rtExpiredTime || this.now() + 60 * 864e5 });
    this.onChange(this.cfg);
  }
  private async refresh() {
    const d = await this.signed(this.cfg.region, '/v2/user/refresh', { rt: this.cfg.rt });
    Object.assign(this.cfg, { at: d.at || d.accessToken, rt: d.rt || d.refreshToken || this.cfg.rt, atExp: this.now() + 30 * 864e5 });
    this.onChange(this.cfg);
  }
  private async api(method: string, path: string, body?: unknown) {
    if (!this.cfg.at) throw new EwelinkError('eWeLink no está conectado.', 401);
    if (this.cfg.atExp && this.cfg.atExp - this.now() < 2 * 864e5 && this.cfg.rt) {
      try {
        await this.refresh();
      } catch {
        /* se usa el que hay */
      }
    }
    const go = () => this.raw(this.cfg.region, method, path, body ? JSON.stringify(body) : undefined, { Authorization: `Bearer ${this.cfg.at}` });
    try {
      return await go();
    } catch (e: any) {
      if ((e.code === 401 || e.code === 402) && this.cfg.rt) {
        await this.refresh();
        return go();
      }
      throw e;
    }
  }

  // ---------- equipos ----------

  private async things(force = false): Promise<any[]> {
    if (!force && this.cache.list && this.now() - this.cache.at < 15000) return this.cache.list;
    const out: any[] = [];
    let begin = -99999;
    for (let i = 0; i < 20; i++) {
      const d = await this.api('GET', `/v2/device/thing?num=30&beginIndex=${begin}`);
      const list = d.thingList || [];
      list.filter((x: any) => (x.itemType === 1 || x.itemType === 2) && x.itemData?.deviceid).forEach((x: any) => out.push({ ...x.itemData, shared: x.itemType === 2 }));
      if (list.length < 30) break;
      begin = list[list.length - 1].index;
    }
    this.cache = { at: this.now(), list: out };
    return out;
  }
  /** fresh: antes de escribir la lista entera de temporizadores se lee al día (si no, se pisa lo recién cambiado en la app). */
  private async thing(id: string, fresh = false) {
    const raw = rawId(id);
    let t = fresh ? null : (await this.things()).find((x) => x.deviceid === raw);
    if (!t) t = (await this.things(true)).find((x) => x.deviceid === raw);
    if (!t) throw new EwelinkError('Ese equipo ya no está en tu cuenta de eWeLink.', 404);
    return t;
  }
  private shapeOf(t: any) {
    const p = t.params || {};
    const uiid = +(t.extra?.uiid || 0);
    const multi = Array.isArray(p.switches);
    return { uiid, multi, relay: multi || p.switch != null, channels: multi ? CHANNELS[uiid] || 1 : p.switch != null ? 1 : 0, inching: multi ? Array.isArray(p.pulses) : 'pulse' in p };
  }
  private toDevice(t: any) {
    const p = t.params || {};
    const s = this.shapeOf(t);
    const status: Array<{ code: string; value: unknown }> = [];
    for (let n = 0; n < s.channels; n++) {
      status.push({ code: `switch_${n + 1}`, value: s.multi ? (p.switches.find((x: any) => x.outlet === n) || {}).switch === 'on' : p.switch === 'on' });
      if (s.inching) status.push({ code: `countdown_${n + 1}`, value: 0 });
    }
    const temp = num(p.currentTemperature ?? p.temperature, 80);
    const hum = num(p.currentHumidity ?? p.humidity, 100);
    if (temp != null) status.push({ code: 'va_temperature', value: temp });
    if (hum != null) status.push({ code: 'va_humidity', value: hum });
    if (p.battery != null && p.battery !== '' && Number.isFinite(+p.battery)) status.push({ code: 'battery_percentage', value: +p.battery });
    if (p.power != null && Number.isFinite(parseFloat(p.power))) status.push({ code: 'cur_power', value: Math.round(parseFloat(p.power) * 10) });
    return {
      id: EWELINK_PREFIX + t.deviceid,
      name: t.name || t.productModel || 'Sonoff',
      product_name: t.productModel || t.extra?.model || 'Sonoff',
      online: !!t.online,
      category: s.relay ? 'cz' : 'wsdcg',
      update_time: Math.floor(this.now() / 1000),
      status,
    };
  }
  async listDevices() {
    return (await this.things(true)).map((t) => this.toDevice(t));
  }
  async getDevice(id: string) {
    return this.toDevice(await this.thing(id, true));
  }
  /** Los valores ya vienen en unidades (sin escala). */
  async getSpecification() {
    return { functions: [], status: ['va_temperature', 'va_humidity', 'battery_percentage'].map((code) => ({ code, values: '{"scale":0}' })) };
  }
  private async setParams(id: string, params: Record<string, unknown>) {
    await this.api('POST', '/v2/device/thing/status', { type: 1, id: rawId(id), params });
    const t = this.cache.list?.find((x) => x.deviceid === rawId(id));
    if (t) t.params = { ...(t.params || {}), ...params };
  }
  /** [{ code: 'switch_1', value: true }, { code: 'countdown_1', value: 30 }] → prender con inching de 30 s. */
  async sendCommands(id: string, commands: Array<{ code: string; value: unknown }>) {
    const t = await this.thing(id);
    const s = this.shapeOf(t);
    const p0 = t.params || {};
    const byCh = new Map<number, { on?: boolean; after?: number }>();
    for (const c of commands || []) {
      const m = /^(switch|countdown)_(\d+)$/.exec(String(c.code));
      if (!m) throw new EwelinkError(`Toma inválido para eWeLink: ${c.code}`, 400);
      const e = byCh.get(+m[2] - 1) || {};
      if (m[1] === 'switch') e.on = !!c.value;
      else e.after = +(c.value as number);
      byCh.set(+m[2] - 1, e);
    }
    const params: Record<string, any> = {};
    for (const [ch, e] of byCh) {
      if (e.on == null) continue;
      const width = e.on && (e.after || 0) > 0 ? Math.max(500, Math.round((e.after as number) * 2) * 500) : 0; // pasos de 0,5 s
      if (s.multi) {
        (params.switches ||= []).push({ outlet: ch, switch: e.on ? 'on' : 'off' });
        const had = (p0.pulses || []).find((x: any) => x.outlet === ch && x.pulse === 'on');
        if (width || (e.on && had)) (params.pulses ||= []).push({ outlet: ch, pulse: width ? 'on' : 'off', width: width || had?.width || 1000 });
      } else {
        params.switch = e.on ? 'on' : 'off';
        if (width) Object.assign(params, { pulse: 'on', pulseWidth: width });
        else if (e.on && p0.pulse === 'on') params.pulse = 'off'; // un toma que fue bomba no se apaga solo
      }
    }
    if (Object.keys(params).length) await this.setParams(id, params);
    return true;
  }

  // ---------- temporizadores (como las programaciones de Tuya) ----------

  private codeOf(x: any) {
    const d = x.do || x.startDo || {};
    return `switch_${(d.outlet ?? 0) + 1}`;
  }
  async getTimers(id: string): Promise<TuyaTimer[]> {
    const t = await this.thing(id, true);
    const mine = new Set(this.cfg.mine[t.deviceid] || []);
    return ((t.params && t.params.timers) || []).map((x: any) => {
      const code = this.codeOf(x);
      const act = x.do || x.startDo || {};
      return { category: mine.has(x.mId) ? OWN_CATEGORY : `category_${code}`, groupId: x.mId, timerId: x.mId, time: '', loops: '', date: '', active: x.enabled === 1, functions: [{ code, value: act.switch === 'on' }], alias: '' };
    });
  }
  private async writeTimers(t: any, timers: any[]) {
    const enabled = timers.filter((x) => x.enabled === 1).length;
    if (enabled > MAX_ENABLED) throw new EwelinkError(`${t.name || 'El equipo'} tendría ${enabled} temporizadores activos y eWeLink permite ${MAX_ENABLED}. Pausá o borrá alguno en la app eWeLink.`, 400);
    await this.setParams(EWELINK_PREFIX + t.deviceid, { timers });
  }
  /** Reemplaza los bucles de Cultiveta del equipo; los temporizadores de la persona quedan. */
  async setLoops(id: string, plans: LoopPlan[]) {
    const t = await this.thing(id, true);
    const s = this.shapeOf(t);
    const mine = new Set(this.cfg.mine[t.deviceid] || []);
    const keep = ((t.params && t.params.timers) || []).filter((x: any) => !mine.has(x.mId));
    const act = (code: string, on: boolean) => {
      const n = (+String(code).split('_')[1] || 1) - 1;
      return s.multi ? { outlet: n, switch: on ? 'on' : 'off' } : { switch: on ? 'on' : 'off' };
    };
    const ours = plans.map((p) => ({ mId: crypto.randomUUID(), type: 'duration', coolkit_timer_type: 'duration', enabled: 1, at: `${new Date(p.start).toISOString()} ${p.periodMin} ${p.runMin}`, startDo: act(p.code, p.startOn), endDo: act(p.code, !p.startOn) }));
    await this.writeTimers(t, keep.concat(ours));
    this.cfg.mine[t.deviceid] = ours.map((x) => x.mId);
    this.onChange(this.cfg);
  }
  /** ¿Siguen en el equipo los bucles de Cultiveta? (un Sonoff sin luz puede perderlos). */
  async loopsPresent(id: string) {
    const t = await this.thing(id, true);
    const have = new Set(((t.params && t.params.timers) || []).map((x: any) => x.mId));
    return (this.cfg.mine[t.deviceid] || []).every((m) => have.has(m));
  }
  async addTimers(): Promise<any> {
    throw new EwelinkError('En eWeLink el horario se guarda como bucle.', 400);
  }
  async deleteTimerCategory(id: string, category: string) {
    if (category !== OWN_CATEGORY) return true;
    const t = await this.thing(id, true);
    const mine = new Set(this.cfg.mine[t.deviceid] || []);
    const timers = (t.params && t.params.timers) || [];
    if (timers.some((x: any) => mine.has(x.mId))) await this.writeTimers(t, timers.filter((x: any) => !mine.has(x.mId)));
    this.cfg.mine[t.deviceid] = [];
    this.onChange(this.cfg);
    return true;
  }
  async deleteTimerGroup(id: string, _category: string, groupId: string) {
    const t = await this.thing(id, true);
    const ids = String(groupId).split(',');
    await this.writeTimers(t, ((t.params && t.params.timers) || []).filter((x: any) => !ids.includes(x.mId)));
    return true;
  }
  /** "0" pausa y "1" reactiva un temporizador (los de la persona nunca se borran). */
  async setTimerGroupStatus(id: string, _category: string, groupId: string, value: '0' | '1') {
    const t = await this.thing(id, true);
    const ids = String(groupId).split(',');
    await this.writeTimers(t, ((t.params && t.params.timers) || []).map((x: any) => (ids.includes(x.mId) ? { ...x, enabled: value === '1' ? 1 : 0 } : x)));
    return true;
  }
}
