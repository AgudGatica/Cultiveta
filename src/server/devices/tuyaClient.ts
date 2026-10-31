/**
 * Cliente de la API oficial de Tuya Cloud (Smart Life / Tuya Smart), traído de Órbita.
 * Usa el proyecto de desarrollador de cada persona (iot.tuya.com): Access ID + Access Secret, con su
 * cuenta de Smart Life vinculada por QR. Firma "new signature" de la documentación oficial.
 * Corre solo en el servidor: el secreto nunca llega al navegador.
 */
import crypto from 'crypto';

type FetchLike = (url: string, init?: any) => Promise<{ status: number; json: () => Promise<any> }>;

/** Centros de datos. Las cuentas de Smart Life de Argentina suelen estar en "Oeste de América". */
export const TUYA_REGIONS: Record<string, { label: string; host: string }> = {
  us: { label: 'Oeste de América (Argentina y casi toda Latinoamérica)', host: 'https://openapi.tuyaus.com' },
  'us-e': { label: 'Este de América', host: 'https://openapi-ueaz.tuyaus.com' },
  eu: { label: 'Europa Central', host: 'https://openapi.tuyaeu.com' },
  'eu-w': { label: 'Europa Occidental', host: 'https://openapi-weaz.tuyaeu.com' },
  in: { label: 'India', host: 'https://openapi.tuyain.com' },
  cn: { label: 'China', host: 'https://openapi.tuyacn.com' },
  sg: { label: 'Singapur', host: 'https://openapi-sg.iotbing.com' },
};
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** URL firmada: ruta + query ordenada por clave (sin "?" si no hay query). */
export function signUrl(path: string, query?: Record<string, unknown>): string {
  const keys = Object.keys(query || {}).filter((k) => query![k] !== undefined && query![k] !== null).sort();
  return keys.length ? `${path}?${keys.map((k) => `${k}=${query![k]}`).join('&')}` : path;
}
function stringToSign(method: string, bodyStr: string, url: string): string {
  const hash = bodyStr ? crypto.createHash('sha256').update(bodyStr).digest('hex') : EMPTY_SHA256;
  return `${method.toUpperCase()}\n${hash}\n\n${url}`;
}
/** sign = HMAC-SHA256(secret, client_id + [access_token] + t + nonce + stringToSign), en mayúsculas. */
export function tuyaSign(o: { clientId: string; secret: string; accessToken?: string; t: string; nonce?: string; method: string; url: string; body?: string; sigHeaders?: Array<[string, string]> }): string {
  const headerLines = (o.sigHeaders || []).map(([k, v]) => `${k}:${v}\n`).join('');
  const sts = o.sigHeaders && o.sigHeaders.length
    ? `${o.method.toUpperCase()}\n${o.body ? crypto.createHash('sha256').update(o.body).digest('hex') : EMPTY_SHA256}\n${headerLines}\n${o.url}`
    : stringToSign(o.method, o.body || '', o.url);
  const str = o.clientId + (o.accessToken || '') + o.t + (o.nonce || '') + sts;
  return crypto.createHmac('sha256', o.secret).update(str, 'utf8').digest('hex').toUpperCase();
}

export class TuyaError extends Error {
  code: string;
  constructor(code: string | number, msg: string) {
    super(msg);
    this.code = String(code);
  }
}

/** Mensajes en castellano para los errores típicos del alta. */
export function tuyaFriendlyError(code: string | number, msg?: string): string {
  const c = String(code);
  if (c === '1004') return 'Firma inválida: revisá que el Access Secret esté bien copiado.';
  if (c === '1005' || c === '2009') return 'El Access ID no existe o no coincide con el centro de datos elegido.';
  if (c === '1010' || c === '1011') return 'El token venció; se vuelve a pedir solo.';
  if (c === '1106' || c === '1100') return 'Sin permiso: en el proyecto de Tuya tienen que estar autorizados "IoT Core" y "Authorization Token Management", y la cuenta de Smart Life vinculada.';
  if (c === '28841105' || c === '28841107') return 'El servicio IoT Core del proyecto venció: renovalo (gratis) en iot.tuya.com → Cloud → Cloud Services.';
  if (c === '2017' || c === '1109') return 'Parámetro inválido en la orden enviada al equipo.';
  if (c === '2008') return 'El equipo no está conectado.';
  return msg || `Error ${c} de Tuya`;
}

export interface TuyaTimer {
  category: string;
  groupId: string;
  timerId: string | number;
  time: string;
  loops: string;
  date: string;
  active: boolean;
  functions: Array<{ code: string; value: unknown }>;
  alias: string;
}

export class TuyaCloud {
  clientId: string;
  secret: string;
  region: string;
  baseUrl: string;
  calls = 0;
  private fetchImpl: FetchLike;
  private now: () => number;
  private token: { access_token: string; refresh_token: string; expireAt: number } | null = null;

  constructor(o: { accessId: string; accessSecret: string; region?: string; baseUrl?: string; fetchImpl?: FetchLike; now?: () => number }) {
    this.clientId = o.accessId;
    this.secret = o.accessSecret;
    this.region = o.region || 'us';
    this.baseUrl = o.baseUrl || (TUYA_REGIONS[this.region] || TUYA_REGIONS.us).host;
    this.fetchImpl = o.fetchImpl || ((url, init) => fetch(url, init) as any);
    this.now = o.now || Date.now;
  }

  private async raw(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown; withToken?: boolean } = {}) {
    const url = signUrl(path, opts.query);
    const bodyStr = opts.body ? JSON.stringify(opts.body) : '';
    const t = String(this.now());
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const accessToken = opts.withToken === false ? '' : this.token?.access_token || '';
    const headers: Record<string, string> = {
      client_id: this.clientId,
      t,
      nonce,
      sign_method: 'HMAC-SHA256',
      sign: tuyaSign({ clientId: this.clientId, secret: this.secret, accessToken, t, nonce, method, url, body: bodyStr }),
    };
    if (accessToken) headers.access_token = accessToken;
    if (bodyStr) headers['Content-Type'] = 'application/json';
    this.calls++;
    let res;
    try {
      res = await this.fetchImpl(this.baseUrl + url, { method, headers, body: bodyStr || undefined });
    } catch (e: any) {
      throw new TuyaError('network', `No se pudo hablar con Tuya (${e?.message || e}).`);
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new TuyaError('http', `Respuesta inválida de Tuya (HTTP ${res.status}).`);
    }
    if (!json.success) throw new TuyaError(json.code, tuyaFriendlyError(json.code, json.msg));
    return json.result;
  }

  async ensureToken(force = false) {
    const now = this.now();
    if (!force && this.token && this.token.expireAt - 60000 > now) return this.token;
    let r: any = null;
    if (!force && this.token?.refresh_token) {
      try {
        r = await this.raw('GET', `/v1.0/token/${this.token.refresh_token}`, { withToken: false });
      } catch {
        r = null;
      }
    }
    if (!r) r = await this.raw('GET', '/v1.0/token', { query: { grant_type: 1 }, withToken: false });
    this.token = { access_token: r.access_token, refresh_token: r.refresh_token, expireAt: now + (r.expire_time || 7200) * 1000 };
    return this.token;
  }

  async request(method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown }) {
    await this.ensureToken();
    try {
      return await this.raw(method, path, opts);
    } catch (e: any) {
      if (e?.code === '1010' || e?.code === '1011') {
        await this.ensureToken(true);
        return this.raw(method, path, opts);
      }
      throw e;
    }
  }

  /** Equipos de las cuentas de Smart Life vinculadas al proyecto (paginado). */
  async listDevices(): Promise<any[]> {
    const out: any[] = [];
    let lastRowKey: string | undefined;
    let guard = 0;
    do {
      const r = await this.request('GET', '/v1.0/iot-01/associated-users/devices', { query: { size: 50, last_row_key: lastRowKey } });
      (r.devices || []).forEach((d: any) => out.push(d));
      lastRowKey = r.has_more ? r.last_row_key : undefined;
    } while (lastRowKey && ++guard < 20);
    return out;
  }
  getDevice(id: string) {
    return this.request('GET', `/v1.0/devices/${encodeURIComponent(id)}`);
  }
  getSpecification(id: string) {
    return this.request('GET', `/v1.0/iot-03/devices/${encodeURIComponent(id)}/specification`);
  }
  sendCommands(id: string, commands: Array<{ code: string; value: unknown }>) {
    return this.request('POST', `/v1.0/iot-03/devices/${encodeURIComponent(id)}/commands`, { body: { commands } });
  }
  /** Programaciones guardadas en la nube de Tuya (las de la app Smart Life y las que carga Cultiveta). */
  async getTimers(id: string): Promise<TuyaTimer[]> {
    const r = await this.request('GET', `/v1.0/devices/${encodeURIComponent(id)}/timers`);
    const out: TuyaTimer[] = [];
    (Array.isArray(r) ? r : []).forEach((cat: any) =>
      (cat.groups || []).forEach((g: any) =>
        (g.timers || []).forEach((t: any) =>
          out.push({
            category: typeof cat.category === 'string' ? cat.category : cat.category?.category,
            groupId: g.id,
            timerId: t.timer_id,
            time: t.time,
            loops: t.loops,
            date: t.date,
            active: t.status === 1,
            functions: (t.functions || []).map((f: any) => ({ code: f.code, value: f.value })),
            alias: t.alias_name || g.alias_name || '',
          })
        )
      )
    );
    return out;
  }
  addTimers(id: string, body: unknown) {
    return this.request('POST', `/v1.0/devices/${encodeURIComponent(id)}/timers`, { body });
  }
  deleteTimerGroup(id: string, category: string, groupId: string) {
    return this.request('DELETE', `/v1.0/devices/${encodeURIComponent(id)}/timers/categories/${encodeURIComponent(category)}/groups/${encodeURIComponent(groupId)}`);
  }
  deleteTimerCategory(id: string, category: string) {
    return this.request('DELETE', `/v1.0/devices/${encodeURIComponent(id)}/timers/categories/${encodeURIComponent(category)}`);
  }
  /** value: "0" pausada, "1" activa (reversible). Nunca se borra lo de la persona. */
  setTimerGroupStatus(id: string, category: string, groupId: string, value: '0' | '1') {
    return this.request('PUT', `/v1.0/devices/${encodeURIComponent(id)}/timers/categories/${encodeURIComponent(category)}/groups/${encodeURIComponent(groupId)}/status`, { body: { value } });
  }
}

// ---------- lectura del estado ----------

export interface TuyaChannel {
  code: string;
  label: string;
  on: boolean;
  countdownCode: string | null;
  countdownUnit: 's' | 'min' | null;
}

/** Cada "switch", "switch_N" o "switch_usbN" es un toma que se maneja aparte. */
export function channelsOf(statusList: Array<{ code: string; value: unknown }> | undefined, spec?: any): TuyaChannel[] {
  const status = Object.fromEntries((statusList || []).map((s) => [s.code, s.value]));
  const fns = Object.fromEntries(((spec && spec.functions) || []).map((f: any) => [f.code, f]));
  const codes = Object.keys(status).concat(Object.keys(fns)).filter((c, i, a) => a.indexOf(c) === i && /^switch(_\d+|_usb\d*)?$/.test(c));
  const num = (c: string) => {
    const m = /(\d+)$/.exec(c);
    return m ? +m[1] : 0;
  };
  codes.sort((a, b) => (a.includes('usb') ? 100 : 0) + num(a) - ((b.includes('usb') ? 100 : 0) + num(b)));
  return codes.map((code) => {
    const n = num(code);
    const cd = code.includes('usb') ? null : n ? `countdown_${n}` : 'countdown_1';
    let unit: 's' | 'min' | null = null;
    if (cd && (fns[cd] || cd in status)) {
      try {
        const v = JSON.parse((fns[cd] && fns[cd].values) || '{}');
        unit = v.unit === 'min' ? 'min' : 's';
      } catch {
        unit = 's';
      }
    }
    return { code, label: code.includes('usb') ? `USB${code.replace('switch_usb', '') || ''}` : `Toma ${n || 1}`, on: status[code] === true, countdownCode: unit ? cd : null, countdownUnit: unit };
  });
}

const SENSOR_CODES = {
  temperature: ['va_temperature', 'temp_current', 'temp_indoor', 'temp_value', 'temperature'],
  humidity: ['va_humidity', 'humidity_value', 'humidity_indoor', 'humidity'],
  co2: ['co2_value', 'co2'],
  battery: ['battery_percentage', 'va_battery', 'battery'],
};

export interface SensorReadings {
  temperature: number | null;
  humidity: number | null;
  soil: number | null;
  co2: number | null;
  battery: number | null;
}

/**
 * Lecturas de sensores: temperatura y humedad del aire, humedad del sustrato, CO₂ y batería.
 * La escala sale de la especificación (235 con scale 1 = 23,5 °C). En los sensores de suelo (zwjcy)
 * "humidity" es la del sustrato.
 */
export function sensorsOf(statusList: Array<{ code: string; value: unknown }> | undefined, spec?: any, category?: string): SensorReadings | null {
  const status = Object.fromEntries((statusList || []).map((s) => [s.code, s.value]));
  const scales: Record<string, number> = {};
  [...((spec && spec.status) || []), ...((spec && spec.functions) || [])].forEach((f: any) => {
    try {
      const v = JSON.parse(f.values || '{}');
      if (Number.isFinite(v.scale)) scales[f.code] = v.scale;
    } catch {
      /* sin escala */
    }
  });
  const pick = (codes: string[], max: number): number | null => {
    for (const c of codes) {
      if (typeof status[c] !== 'number') continue;
      let v = (status[c] as number) / Math.pow(10, scales[c] || 0);
      if (!(c in scales) && Math.abs(v) > max) v /= 10;
      return Math.round(v * 10) / 10;
    }
    return null;
  };
  const out: SensorReadings = { temperature: pick(SENSOR_CODES.temperature, 80), humidity: pick(SENSOR_CODES.humidity, 100), co2: pick(SENSOR_CODES.co2, 1e5), battery: pick(SENSOR_CODES.battery, 100), soil: null };
  if (out.temperature != null && String(status.temp_unit_convert).toLowerCase() === 'f') out.temperature = Math.round(((out.temperature - 32) / 1.8) * 10) / 10;
  if (category === 'zwjcy') {
    out.soil = out.humidity;
    out.humidity = null;
  }
  return out.temperature != null || out.humidity != null || out.soil != null || out.co2 != null ? out : null;
}

/** Consumo si el equipo lo informa (cur_power viene en décimas de W en la mayoría de los enchufes). */
export function powerOf(statusList: Array<{ code: string; value: unknown }> | undefined): { watts: number } | null {
  const s = Object.fromEntries((statusList || []).map((x) => [x.code, x.value]));
  return typeof s.cur_power === 'number' ? { watts: s.cur_power / 10 } : null;
}

export const maskId = (id?: string): string => (id ? `${String(id).slice(0, 4)}…${String(id).slice(-3)}` : '');
