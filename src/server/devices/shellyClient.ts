/**
 * Shelly por su nube ("Shelly Cloud Control API"). El servidor de Cultiveta corre en la nube y no ve la
 * red de la casa, así que se conecta con la clave de la nube de la persona: en la app Shelly,
 * Configuración de usuario → Clave de autorización de la nube (el "server" y la clave).
 *   · Lista: POST /device/all_status (todos los equipos de la cuenta, en una consulta) y, si la persona
 *     cargó Device Ids a mano, POST /v2/devices/api/get (de a 10).
 *   · Órdenes: POST /v2/devices/api/set/switch { id, channel, on, toggle_after }: con toggle_after el
 *     equipo se da vuelta solo a los N segundos (la bomba se apaga sola; la luz cambia a horario).
 *   · La nube no deja guardar horarios en el equipo ni ver los de la app Shelly.
 *   · Una consulta por segundo como máximo (lo pide Shelly): las consultas van en fila.
 * Habla "como" Tuya: tomas "switch_N" (canal N-1), "countdown_N" = segundos que le faltan para darse
 * vuelta, y sensores "va_temperature", "va_humidity", "battery_percentage".
 */
import type { TuyaTimer } from './tuyaClient';
import type { DeviceCloud } from './cloud';

type FetchLike = (url: string, init?: any) => Promise<{ status: number; ok?: boolean; json: () => Promise<any> }>;

export const SHELLY_PREFIX = 'shelly-';
/** Nombres de los modelos más comunes (la nube da el código; el resto se muestra con el código). */
const MODEL_NAMES: Record<string, string> = {
  'SHSW-1': 'Shelly 1',
  'SHSW-PM': 'Shelly 1PM',
  'SHSW-25': 'Shelly 2.5',
  'SHPLG-S': 'Shelly Plug S',
  'SHHT-1': 'Shelly H&T',
  'SNSW-001X16EU': 'Shelly Plus 1',
  'SNSW-001P16EU': 'Shelly Plus 1PM',
  'SNSW-102P16EU': 'Shelly Plus 2PM',
  'SNPL-00112EU': 'Shelly Plus Plug S',
  'SNSN-0013A': 'Shelly Plus H&T',
};
const rawId = (id: string) => String(id).replace(SHELLY_PREFIX, '');

export class ShellyError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** "shelly-103-eu.shelly.cloud" o con https:// → "https://shelly-103-eu.shelly.cloud". Solo hosts de shelly.cloud. */
export function cleanShellyServer(input: string): string | null {
  const m = /^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.shelly\.cloud)(?::\d+)?\/?$/i.exec(String(input || '').trim());
  return m ? `https://${m[1].toLowerCase()}` : null;
}
export const isShellyAuthKey = (k: string) => /^[A-Za-z0-9+/=_-]{20,400}$/.test(String(k || '').trim());
/** Device Id de Shelly: hex del MAC (12) o el id de los Gen2+ ("shellyplus1pm-a8032ab1c2d3"). */
export const isShellyDeviceId = (id: string) => /^[a-z0-9-]{6,64}$/i.test(String(id || '').trim());

function friendly(code: string, status: number, messages?: string[]): string {
  if (status === 401 || /auth/i.test(code)) return 'La clave de Shelly Cloud no sirve (cambia si cambiás la contraseña): generá una nueva en la app Shelly → Configuración de usuario → Clave de autorización de la nube.';
  if (status === 429) return 'Shelly pidió esperar (acepta una consulta por segundo). Probá de nuevo en un rato.';
  if (code === 'DEVICE_OFFLINE') return 'El Shelly no responde (sin conexión).';
  if (code === 'DEVICE_NOT_FOUND') return 'Ese Shelly no está en tu cuenta de Shelly Cloud.';
  if (code === 'DEVICE_INVALID_CHANNEL') return 'Ese Shelly no tiene esa salida.';
  return `Shelly: ${messages?.[0] || code || `error ${status}`}.`;
}

/** Estado de un Shelly (Gen1 o Gen2+) en el formato de Tuya. */
export function shellyStatus(st: any, gen: number, nowMs: number): Array<{ code: string; value: unknown }> {
  const status: Array<{ code: string; value: unknown }> = [];
  let watts = 0;
  let sw = 0;
  if (!st || typeof st !== 'object') return status;
  if (gen >= 2) {
    const first = (re: RegExp) => Object.keys(st).filter((k) => re.test(k)).sort((a, b) => +a.split(':')[1] - +b.split(':')[1])[0];
    const tK = first(/^temperature:\d+$/);
    const hK = first(/^humidity:\d+$/);
    for (const [k, v] of Object.entries<any>(st)) {
      const m = /^switch:(\d+)$/.exec(k);
      if (m) {
        sw++;
        const n = +m[1] + 1;
        status.push({ code: `switch_${n}`, value: !!v.output });
        const left = v.timer_started_at && v.timer_duration ? Math.max(0, Math.round(v.timer_started_at + v.timer_duration - nowMs / 1000)) : 0;
        status.push({ code: `countdown_${n}`, value: left });
        if (Number.isFinite(v.apower)) watts += v.apower;
        continue;
      }
      if (k === tK && Number.isFinite(v?.tC)) status.push({ code: 'va_temperature', value: v.tC });
      if (k === hK && Number.isFinite(v?.rh)) status.push({ code: 'va_humidity', value: v.rh });
      if (k === 'devicepower:0' && Number.isFinite(v?.battery?.percent)) status.push({ code: 'battery_percentage', value: v.battery.percent });
    }
  } else {
    (st.relays || []).forEach((r: any, i: number) => {
      sw++;
      status.push({ code: `switch_${i + 1}`, value: !!r.ison });
      status.push({ code: `countdown_${i + 1}`, value: r.has_timer ? Math.max(0, Math.round(r.timer_remaining || 0)) : 0 });
    });
    (st.meters || []).forEach((m: any) => {
      if (Number.isFinite(m.power)) watts += m.power;
    });
    if (Number.isFinite(st.tmp?.tC)) status.push({ code: 'va_temperature', value: st.tmp.tC });
    if (Number.isFinite(st.hum?.value)) status.push({ code: 'va_humidity', value: st.hum.value });
    if (Number.isFinite(st.bat?.value)) status.push({ code: 'battery_percentage', value: st.bat.value });
  }
  if (sw) status.push({ code: 'cur_power', value: Math.round(watts * 10) });
  return status;
}

export class ShellyCloud implements DeviceCloud {
  calls = 0;
  private server: string;
  private authKey: string;
  private ids: string[];
  private fetchImpl: FetchLike;
  private now: () => number;
  private gapMs: number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  private names: Record<string, string> = {};

  constructor(o: { server: string; authKey: string; ids?: string[]; fetchImpl?: FetchLike; now?: () => number; gapMs?: number }) {
    this.server = o.server;
    this.authKey = o.authKey;
    this.ids = o.ids || [];
    this.fetchImpl = o.fetchImpl || ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }) as any);
    this.now = o.now || Date.now;
    this.gapMs = o.gapMs ?? 1100;
  }

  /** De a una consulta por segundo. */
  private call(path: string, init: any): Promise<any> {
    const run = async () => {
      const wait = this.lastCall + this.gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      this.calls++;
      let res;
      try {
        res = await this.fetchImpl(`${this.server}${path}`, init);
      } catch {
        throw new ShellyError('No hay conexión con Shelly Cloud.', 'network');
      }
      let j: any = null;
      try {
        j = await res.json();
      } catch {
        j = null;
      }
      if (res.status >= 400 || (j && (j.isok === false || j.error))) {
        const code = String(j?.error || (j?.errors ? Object.keys(j.errors)[0] : '') || res.status);
        throw new ShellyError(friendly(code, res.status, j?.data?.messages), code);
      }
      return j;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  private v1(path: string, params: Record<string, string>) {
    return this.call(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, auth_key: this.authKey }).toString() });
  }
  private v2(path: string, body: unknown) {
    return this.call(`${path}?auth_key=${encodeURIComponent(this.authKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  private toDevice(id: string, gen: number, online: boolean, st: any, info: any) {
    const status = shellyStatus(st, gen, this.now());
    const relay = status.some((s) => /^switch_/.test(s.code));
    const code = info?.code || info?.type || 'Shelly';
    const model = MODEL_NAMES[code] || code;
    const name = info?.name || this.names[id] || `${model} · ${id.slice(-4)}`;
    this.names[id] = name;
    return { id: SHELLY_PREFIX + id, name, product_name: model, online, category: relay ? 'cz' : 'wsdcg', update_time: Math.floor(this.now() / 1000), status, gen };
  }
  private async getMany(ids: string[]) {
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const r = await this.v2('/v2/devices/api/get', { ids: ids.slice(i, i + 10), select: ['status'] });
      for (const d of Array.isArray(r) ? r : []) out.push(this.toDevice(String(d.id), +d.gen || 2, !!d.online, d.status, { code: d.code, type: d.type }));
    }
    return out;
  }

  /** Todos los equipos de la cuenta, más los que se cargaron por Device Id. */
  async listDevices() {
    let all: any[] = [];
    let failed: Error | null = null;
    try {
      const r = await this.v1('/device/all_status', { show_info: 'true' });
      const map = r?.data?.devices_status || {};
      all = Object.entries<any>(map).map(([id, st]) => {
        const info = st?._dev_info || {};
        return this.toDevice(String(info.id || id), +info.gen || (st && 'relays' in st ? 1 : 2), info.online !== false, st, info);
      });
    } catch (e: any) {
      failed = e;
    }
    const missing = this.ids.filter((id) => !all.some((d) => d.id === SHELLY_PREFIX + id));
    if (missing.length) all = all.concat(await this.getMany(missing));
    if (failed && !all.length) {
      if (failed instanceof ShellyError && failed.code !== 'network' && !this.ids.length) {
        throw new ShellyError('Shelly Cloud no devolvió la lista de equipos: agregá el Device Id de cada uno (app Shelly → el equipo → Configuración → Información del equipo).', failed.code);
      }
      throw failed;
    }
    return all;
  }
  async getDevice(id: string) {
    const [d] = await this.getMany([rawId(id)]);
    if (!d) throw new ShellyError('Ese Shelly no está en tu cuenta de Shelly Cloud.', 'DEVICE_NOT_FOUND');
    return d;
  }
  /** Los valores ya vienen en unidades (sin escala). */
  async getSpecification() {
    return { functions: [], status: ['va_temperature', 'va_humidity', 'battery_percentage'].map((code) => ({ code, values: '{"scale":0}' })) };
  }
  /** [{ code: 'switch_1', value: true }, { code: 'countdown_1', value: 30 }] → prender y que se apague solo a los 30 s. */
  async sendCommands(id: string, commands: Array<{ code: string; value: unknown }>) {
    const byCh = new Map<number, { on?: boolean; after?: number }>();
    for (const c of commands || []) {
      const m = /^(switch|countdown)_(\d+)$/.exec(String(c.code));
      if (!m) throw new ShellyError(`Salida inválida para Shelly: ${c.code}`, 'BAD_REQUEST');
      const e = byCh.get(+m[2] - 1) || {};
      if (m[1] === 'switch') e.on = !!c.value;
      else e.after = +(c.value as number);
      byCh.set(+m[2] - 1, e);
    }
    for (const [channel, e] of byCh) {
      if (e.on == null) continue;
      await this.v2('/v2/devices/api/set/switch', { id: rawId(id), channel, on: e.on, ...((e.after || 0) > 0 ? { toggle_after: Math.round(e.after as number) } : {}) });
    }
    return true;
  }
  // La nube de Shelly no deja ver ni guardar horarios: lo de la persona en la app Shelly no se toca.
  async getTimers(): Promise<TuyaTimer[]> {
    return [];
  }
  async addTimers(): Promise<any> {
    throw new ShellyError('La nube de Shelly no guarda horarios: los maneja la revisión de Cultiveta.', 'BAD_REQUEST');
  }
  async deleteTimerGroup() {
    return true;
  }
  async deleteTimerCategory() {
    return true;
  }
  async setTimerGroupStatus() {
    return true;
  }
}
