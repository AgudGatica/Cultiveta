/**
 * Equipos inteligentes de cada persona (traído de Órbita): Smart Life / Tuya, Sonoff / eWeLink y Shelly.
 * Las tres marcas pasan por un enrutador (cloud.ts) que habla "como" Tuya; acá no se distingue la marca
 * salvo para guardar el horario de la luz (programaciones, bucle o "se da vuelta solo").
 *
 * - Las claves (Access ID + Secret de iot.tuya.com, el token de eWeLink, la clave de Shelly Cloud) quedan
 *   guardadas solo del lado del servidor: la colección "deviceIntegrations" no la puede leer el navegador.
 * - Cada toma o sensor se asigna a un cultivo:
 *     · la luz (sigue el horario del cultivo);
 *     · la bomba de riego (solo prende para regar, con la cuenta regresiva del enchufe);
 *     · un equipo de clima (extractor, humidificador…): por sensor, siguiendo a la luz (o al revés),
 *       siempre prendido o con su propio horario;
 *     · un sensor de ambiente o una sonda de sustrato.
 *   Las demás tomas se manejan a mano desde Equipos. La luz y los equipos de clima también se pueden
 *   prender o apagar a mano, como en un timer: quedan así hasta el próximo cambio de su horario (o una
 *   hora, si no tienen horario) y después siguen solos.
 * - Al asignar un toma, se pausan las programaciones de la app Smart Life de ese toma (se reactivan al
 *   desasignarlo o al desconectar). La luz y lo que la sigue quedan cargados en Smart Life: siguen
 *   aunque el servidor no corra. La revisión periódica (Cloud Scheduler, cada 5 min) rellena lo
 *   cargado, aplica las reglas por sensor, corrige lo que quedó al revés y apaga una bomba olvidada.
 * - La bomba puede regar sola (programado o por humedad del sustrato): lo decide la revisión, con los
 *   mismos topes que "Regar", y cada riego queda anotado en el cultivo.
 */
import crypto from 'crypto';
import { TuyaCloud, TuyaError, TUYA_REGIONS, channelsOf, maskId, powerOf, sensorsOf, type SensorReadings } from './tuyaClient';
import { createMockTuya, MOCK_TUYA_ID, MOCK_TUYA_SECRET, type MockTuya } from './tuyaMock';
import { DeviceRouter, vendorOf, VENDOR_APP, type Vendor } from './cloud';
import { EwelinkCloud, EWELINK_REGIONS, type EwelinkConfig } from './ewelinkClient';
import { createMockEwelink, MOCK_EWELINK_APP, MOCK_EWELINK_CODE, type MockEwelink } from './ewelinkMock';
import { ShellyCloud, cleanShellyServer, isShellyAuthKey, isShellyDeviceId } from './shellyClient';
import { createMockShelly, MOCK_SHELLY, type MockShelly } from './shellyMock';
import { clearSchedule, dailyPlan, syncLoops, syncSchedule, SCHEDULE_CATEGORY, type LightItem, type ScheduleState } from './lightSchedule';
import { isValidTimeZone, zonedClock, zonedDateKey, zonedParts, zonedToMs } from './tz';
import { LATE_MS, scheduledWaterings, wetDryStep, type WetDryState } from './autoIrrigation';
import { DAY_MS, HOUR_MS, lightState } from '../../utils/lightCycle';
import {
  checkWaterOrder,
  defaultClimateRule,
  evaluateClimate,
  isClimateRole,
  scheduleOnHours,
  validateClimateRule,
  validatePump,
  validateAutoIrrigation,
  DEFAULT_AUTO_IRRIGATION,
  DEFAULT_PUMP,
  type AutoIrrigation,
  type ClimateRole,
  type ClimateRule,
  type PumpConfig,
} from '../../utils/deviceRules';

export type BindingRole = 'light' | 'pump' | 'climate' | 'sensor_th' | 'sensor_soil';
const MANAGED: BindingRole[] = ['light', 'pump', 'climate'];

export interface LightScheduleSnapshot {
  lightHours: number;
  darkHours: number;
  /** Un encendido (ms), calculado en el navegador con la hora de la persona. */
  anchorMs: number;
  timeZone: string;
}

export interface DeviceBinding {
  id: string;
  deviceId: string;
  deviceName: string;
  code: string;
  label: string;
  /** Id del cultivo o del indoor al que está asignado (ver targetKind). */
  cultivationId: string;
  cultivationName: string;
  /** Indoor: la luz, el clima y el ambiente se asignan a la carpa y valen para sus cultivos. */
  targetKind?: 'cultivation' | 'indoor';
  role: BindingRole;
  /** Luz: su horario. Bomba: el horario de la luz del cultivo (para el riego atado a la luz y para saber si es de noche). */
  schedule?: LightScheduleSnapshot | null;
  /** Equipo de clima: qué es y cómo se maneja. */
  climateRole?: ClimateRole | null;
  rule?: ClimateRule | null;
  /** Bomba: caudal y topes; cuenta regresiva del toma (el seguro que la apaga sola). */
  pump?: PumpConfig | null;
  countdownCode?: string | null;
  countdownUnit?: 's' | 'min' | null;
  /** Bomba: riego automático (programado o por humedad). */
  auto?: AutoIrrigation | null;
  /** Por qué está prendido o apagado (lo último que decidió la revisión). */
  lastReason?: string | null;
  /** Prendido o apagado a mano: queda así hasta "until" (el próximo cambio de su horario) y después sigue solo. */
  manual?: { value: boolean; until: number } | null;
}

interface CacheEntry {
  name: string;
  online: boolean;
  status: Record<string, unknown>;
  sensors: SensorReadings | null;
  power: { watts: number } | null;
  at: number;
}

export interface DeviceIntegration {
  userId: string;
  tuya: { accessId: string; accessSecret: string; region: string; mock?: boolean; connectedAt: number } | null;
  /** eWeLink: token de la persona en la app de Cultiveta (y los bucles que cargó Cultiveta en cada equipo). */
  ewelink?: { region: string; at?: string; rt?: string; atExp?: number; rtExp?: number; mine: Record<string, string[]>; mock?: boolean; connectedAt: number } | null;
  /** Shelly Cloud: el server y la clave de la nube; Device Ids cargados a mano (si la lista no los trae). */
  shelly?: { server: string; authKey: string; ids: string[]; mock?: boolean; connectedAt: number } | null;
  /** Inicio de sesión en eWeLink en curso (para comprobar que la vuelta es de esta persona). */
  oauth?: { state: string; at: number } | null;
  bindings: DeviceBinding[];
  /** Programaciones de la app Smart Life que pausó Cultiveta (para reactivarlas después). */
  paused: Array<{ deviceId: string; category: string; groupId: string; code: string }>;
  schedules: Record<string, ScheduleState>;
  cache: Record<string, CacheEntry>;
  lastCommand: Record<string, { at: number; value: boolean }>;
  /** Riegos con bomba: el último de cada bomba (por id de asignación). */
  watering?: Record<string, { at: number; seconds: number; liters: number; endsAt: number; auto?: boolean }>;
  /** Riego automático de cada bomba: hasta dónde miró, el estado del modo por humedad y lo último que hizo. */
  irrigation?: Record<string, IrrigationState>;
  lastError: string | null;
  updatedAt: number;
}

export interface IrrigationState {
  lastCheck: number;
  wetdry: WetDryState | null;
  last: { at: number; seconds: number; liters: number; reason: string } | null;
  /** Por qué no regó en la última revisión (o el error). */
  note: string | null;
}

/** Lo que se anota en los riegos del cultivo (colección waterings). */
export interface AutoWateringRecord {
  cultivationId: string;
  date: string;
  time: string;
  volumeLiters: number;
  observations: string;
}

export interface DeviceStore {
  get(userId: string): Promise<DeviceIntegration | null>;
  save(userId: string, data: DeviceIntegration): Promise<void>;
  remove(userId: string): Promise<void>;
  listUserIds(): Promise<string[]>;
}

/** Desarrollo local y tests: en memoria. */
export class MemoryDeviceStore implements DeviceStore {
  private data = new Map<string, DeviceIntegration>();
  async get(userId: string) {
    const d = this.data.get(userId);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }
  async save(userId: string, data: DeviceIntegration) {
    this.data.set(userId, JSON.parse(JSON.stringify(data)));
  }
  async remove(userId: string) {
    this.data.delete(userId);
  }
  async listUserIds() {
    return [...this.data.keys()];
  }
}

/** Producción: Firestore con Firebase Admin (las reglas no dejan que el navegador lea esta colección). */
export class FirestoreDeviceStore implements DeviceStore {
  constructor(private db: any, private collection = 'deviceIntegrations') {}
  async get(userId: string) {
    const snap = await this.db.collection(this.collection).doc(userId).get();
    return snap.exists ? (snap.data() as DeviceIntegration) : null;
  }
  async save(userId: string, data: DeviceIntegration) {
    await this.db.collection(this.collection).doc(userId).set(JSON.parse(JSON.stringify(data)));
  }
  async remove(userId: string) {
    await this.db.collection(this.collection).doc(userId).delete();
  }
  async listUserIds() {
    const snap = await this.db.collection(this.collection).select().get();
    return snap.docs.map((d: any) => d.id);
  }
}

export class DeviceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const POLL_MS = 60_000;             // estado de un equipo desde la app: como mucho una lectura por minuto
const SENSOR_POLL_MS = 4 * 60_000;  // en la revisión: sensores y equipos por sensor, cada vuelta (5 min)
const SLOW_POLL_MS = 14 * 60_000;   // luz y lo que la sigue: alcanza con mirar cada 15 min (cuida el cupo de Tuya)
const GRACE_MS = 60_000;            // después de una orden, se espera antes de "corregir"
const SENSOR_STALE_MS = 30 * 60_000; // una lectura más vieja que esto cuenta como "sensor sin datos"
const SWITCH_CODE = /^switch(_\d+|_usb\d*)?$/;
const OAUTH_MS = 15 * 60_000; // el inicio de sesión en eWeLink vale 15 min
const MANUAL_MS = 60 * 60_000; // a mano, sin horario que lo vuelva a poner: una hora
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
/** Modos de un equipo de clima que tienen horario (quedan cargados en el equipo como la luz). */
const TIMED_MODES = ['follow', 'follow_inverted', 'schedule'];
const VENDORS: Vendor[] = ['tuya', 'ewelink', 'shelly'];
const connectedAny = (integ: DeviceIntegration | null | undefined) => !!(integ && (integ.tuya || integ.ewelink || integ.shelly));
/** "countdown_N" del toma "switch_N". */
const countdownOf = (code: string) => code.replace(/^switch/, 'countdown');

export interface EwelinkApp {
  appId: string;
  appSecret: string;
  redirectUrl: string;
}

function blank(userId: string, now: number): DeviceIntegration {
  return { userId, tuya: null, ewelink: null, shelly: null, oauth: null, bindings: [], paused: [], schedules: {}, cache: {}, lastCommand: {}, watering: {}, irrigation: {}, lastError: null, updatedAt: now };
}

export function validateSchedule(s: any): LightScheduleSnapshot | null {
  if (!s || typeof s !== 'object') return null;
  const lightHours = Number(s.lightHours);
  const darkHours = Number(s.darkHours);
  const anchorMs = Number(s.anchorMs);
  const timeZone = String(s.timeZone || '');
  if (!(lightHours > 0 && lightHours <= 48) || !(darkHours >= 0 && darkHours <= 48) || !Number.isFinite(anchorMs) || !isValidTimeZone(timeZone)) {
    throw new DeviceError('Horario de luz inválido.');
  }
  return { lightHours, darkHours, anchorMs, timeZone };
}

/**
 * El horario propio de un equipo (prende y apaga a una hora, todos los días) como el de una luz de 24 h.
 * El encendido de referencia es el de ayer: así un horario que pasa la medianoche (20:00 a 08:00) ya
 * cuenta de madrugada.
 */
export function scheduleItem(times: { on: string; off: string }, timeZone: string, t: number) {
  const lightHours = scheduleOnHours(times);
  return { lightHours, darkHours: 24 - lightHours, anchorMs: zonedToMs(zonedDateKey(t, timeZone), times.on, timeZone) - DAY_MS, timeZone };
}

function cleanRule(role: ClimateRole, raw: any, o: { hasSensor?: boolean } = {}): ClimateRule {
  if (!raw || typeof raw !== 'object') return defaultClimateRule(role, o);
  const num = (v: any) => Number(v);
  const own = raw.mode === 'schedule';
  const rule: ClimateRule = {
    mode: raw.mode,
    metric: raw.metric,
    on: num(raw.on),
    off: num(raw.off),
    night: raw.night && typeof raw.night === 'object' ? { on: num(raw.night.on), off: num(raw.night.off) } : null,
    sensorLoss: raw.sensorLoss || 'off',
    times: own && raw.times && typeof raw.times === 'object' ? { on: String(raw.times.on || ''), off: String(raw.times.off || '') } : null,
    timeZone: own ? (isValidTimeZone(String(raw.timeZone || '')) ? String(raw.timeZone) : DEFAULT_TZ) : null,
  };
  if (rule.mode !== 'sensor') Object.assign(rule, { metric: rule.metric || 'temperature', on: Number.isFinite(rule.on) ? rule.on : 27, off: Number.isFinite(rule.off) ? rule.off : 24 });
  const errs = validateClimateRule(role, rule);
  if (errs.length) throw new DeviceError(errs[0]);
  return rule;
}

function cleanPump(raw: any): PumpConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PUMP };
  const cfg = { flowLph: Number(raw.flowLph), maxSeconds: Number(raw.maxSeconds), maxLiters: Number(raw.maxLiters) };
  const errs = validatePump(cfg);
  if (errs.length) throw new DeviceError(errs[0]);
  return cfg;
}

function cleanAuto(raw: any, maxSeconds: number): AutoIrrigation {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUTO_IRRIGATION };
  const d = DEFAULT_AUTO_IRRIGATION;
  const num = (v: any, def: number) => (v == null || v === '' ? def : Number(v));
  const sc = raw.scheduled || {};
  const wd = raw.wetdry || {};
  const auto: AutoIrrigation = {
    mode: raw.mode,
    scheduled: {
      when: sc.when === 'fixed' ? 'fixed' : 'light',
      trigger: sc.trigger === 'before_off' ? 'before_off' : 'after_on',
      offsetMin: num(sc.offsetMin, d.scheduled.offsetMin),
      fixedTime: String(sc.fixedTime || d.scheduled.fixedTime),
      shotS: num(sc.shotS, d.scheduled.shotS),
      pulses: num(sc.pulses, d.scheduled.pulses),
      pauseMin: num(sc.pauseMin, d.scheduled.pauseMin),
    },
    wetdry: { dry: num(wd.dry, d.wetdry.dry), wet: num(wd.wet, d.wetdry.wet), shotS: num(wd.shotS, d.wetdry.shotS), pauseMin: num(wd.pauseMin, d.wetdry.pauseMin), maxShots: num(wd.maxShots, d.wetdry.maxShots) },
    timeZone: isValidTimeZone(String(raw.timeZone || '')) ? String(raw.timeZone) : d.timeZone,
  };
  const errs = validateAutoIrrigation(auto, maxSeconds);
  if (errs.length) throw new DeviceError(errs[0]);
  return auto;
}

export class DeviceService {
  private store: DeviceStore;
  private now: () => number;
  private fetchImpl?: (url: string, init?: any) => Promise<any>;
  private clients = new Map<string, TuyaCloud>();
  private shellyClients = new Map<string, ShellyCloud>();
  private mocks = new Map<string, MockTuya>();
  private ewelinkMocks = new Map<string, MockEwelink>();
  private shellyMocks = new Map<string, MockShelly>();
  private ewelinkApp: EwelinkApp | null;
  private specs = new Map<string, any>();
  private verifyCultivation: (userId: string, cultivationId: string, kind: 'cultivation' | 'indoor') => Promise<{ name: string } | null>;
  private recordWatering: (userId: string, w: AutoWateringRecord) => Promise<void>;
  private onProblem: (userId: string, text: string) => void;

  constructor(o: {
    store: DeviceStore;
    now?: () => number;
    fetchImpl?: (url: string, init?: any) => Promise<any>;
    /** Con Firestore Admin: confirma que el cultivo (o el indoor) es de esa persona y devuelve su nombre. */
    verifyCultivation?: (userId: string, cultivationId: string, kind: 'cultivation' | 'indoor') => Promise<{ name: string } | null>;
    /** Con Firestore Admin: anota en el cultivo cada riego automático. */
    recordWatering?: (userId: string, w: AutoWateringRecord) => Promise<void>;
    /** Avisos al celular: en la revisión programada apareció un error nuevo con los equipos. */
    onProblem?: (userId: string, text: string) => void;
    /** La app de Cultiveta en dev.ewelink.cc (sin ella, eWeLink solo se puede probar con el de prueba). */
    ewelinkApp?: EwelinkApp | null;
  }) {
    this.store = o.store;
    this.now = o.now || Date.now;
    this.fetchImpl = o.fetchImpl;
    this.verifyCultivation = o.verifyCultivation || (async () => null);
    this.recordWatering = o.recordWatering || (async () => {});
    this.onProblem = o.onProblem || (() => {});
    this.ewelinkApp = o.ewelinkApp && o.ewelinkApp.appId && o.ewelinkApp.appSecret && o.ewelinkApp.redirectUrl ? o.ewelinkApp : null;
  }

  /** La zapatilla de prueba de esa persona (para tests y para "probar sin cuenta"). */
  mockOf(userId: string): MockTuya {
    let m = this.mocks.get(userId);
    if (!m) {
      m = createMockTuya({ now: this.now });
      this.mocks.set(userId, m);
    }
    return m;
  }

  /** Los equipos de eWeLink de prueba de esa persona. */
  ewelinkMockOf(userId: string): MockEwelink {
    let m = this.ewelinkMocks.get(userId);
    if (!m) {
      m = createMockEwelink({ now: this.now });
      this.ewelinkMocks.set(userId, m);
    }
    return m;
  }
  /** Los Shelly de prueba de esa persona. */
  shellyMockOf(userId: string): MockShelly {
    let m = this.shellyMocks.get(userId);
    if (!m) {
      m = createMockShelly({ now: this.now });
      this.shellyMocks.set(userId, m);
    }
    return m;
  }

  /** El enrutador con las marcas conectadas de esa persona. */
  private client(userId: string, integ: DeviceIntegration): DeviceRouter {
    if (!connectedAny(integ)) throw new DeviceError('Todavía no hay ninguna marca de equipos conectada.', 409);
    return new DeviceRouter({
      tuya: integ.tuya ? this.tuyaClient(userId, integ) : undefined,
      ewelink: integ.ewelink ? this.ewelinkClient(userId, integ) : undefined,
      shelly: integ.shelly ? this.shellyClient(userId, integ) : undefined,
    });
  }

  private ewelinkClient(userId: string, integ: DeviceIntegration): EwelinkCloud {
    const e = integ.ewelink!;
    const app = e.mock ? MOCK_EWELINK_APP : this.ewelinkApp;
    if (!app) throw new DeviceError('eWeLink no está habilitado en este servidor.', 503);
    // los tokens nuevos (y los bucles cargados) vuelven a lo que se guarda de la persona
    return new EwelinkCloud({
      cfg: { ...app, region: e.region, at: e.at, rt: e.rt, atExp: e.atExp, rtExp: e.rtExp, mine: e.mine || {} },
      fetchImpl: e.mock ? this.ewelinkMockOf(userId).fetchImpl : this.fetchImpl,
      now: this.now,
      onChange: (cfg: EwelinkConfig) => {
        if (integ.ewelink) Object.assign(integ.ewelink, { region: cfg.region, at: cfg.at, rt: cfg.rt, atExp: cfg.atExp, rtExp: cfg.rtExp, mine: { ...cfg.mine } });
      },
    });
  }

  private shellyClient(userId: string, integ: DeviceIntegration): ShellyCloud {
    const sh = integ.shelly!;
    // uno por cuenta y clave: así la fila de "una consulta por segundo" vale entre pedidos
    const key = `${userId}|${sh.mock ? 'mock' : sh.server}|${sh.authKey.slice(-6)}|${(sh.ids || []).join(',')}`;
    let c = this.shellyClients.get(key);
    if (!c) {
      c = sh.mock
        ? new ShellyCloud({ server: MOCK_SHELLY.server, authKey: MOCK_SHELLY.authKey, ids: sh.ids, fetchImpl: this.shellyMockOf(userId).fetchImpl, now: this.now, gapMs: 0 })
        : new ShellyCloud({ server: sh.server, authKey: sh.authKey, ids: sh.ids, fetchImpl: this.fetchImpl, now: this.now });
      this.shellyClients.set(key, c);
    }
    return c;
  }

  private tuyaClient(userId: string, integ: DeviceIntegration): TuyaCloud {
    const t = integ.tuya!;
    const key = `${userId}|${t.mock ? 'mock' : t.accessId}|${t.region}`;
    let c = this.clients.get(key);
    if (!c) {
      c = t.mock
        ? new TuyaCloud({ accessId: MOCK_TUYA_ID, accessSecret: MOCK_TUYA_SECRET, baseUrl: 'http://mock.tuya', fetchImpl: this.mockOf(userId).fetchImpl, now: this.now })
        : new TuyaCloud({ accessId: t.accessId, accessSecret: t.accessSecret, region: t.region, fetchImpl: this.fetchImpl, now: this.now });
      this.clients.set(key, c);
    }
    return c;
  }

  private async load(userId: string): Promise<DeviceIntegration> {
    const integ = (await this.store.get(userId)) || blank(userId, this.now());
    integ.watering = integ.watering || {};
    integ.irrigation = integ.irrigation || {};
    return integ;
  }
  private async persist(integ: DeviceIntegration) {
    integ.updatedAt = this.now();
    await this.store.save(integ.userId, integ);
  }

  private async spec(c: DeviceRouter, deviceId: string) {
    if (!this.specs.has(deviceId)) {
      try {
        this.specs.set(deviceId, await c.getSpecification(deviceId));
      } catch {
        return null;
      }
    }
    return this.specs.get(deviceId);
  }

  // ---------- cuenta ----------

  async status(userId: string) {
    const integ = await this.store.get(userId);
    const t = integ?.tuya;
    const e = integ?.ewelink;
    const sh = integ?.shelly;
    return {
      tuya: { connected: !!t, mock: !!t?.mock, region: t?.region || null, accessId: t && !t.mock ? maskId(t.accessId) : '' },
      ewelink: { connected: !!e, mock: !!e?.mock, region: e?.region || null, available: !!this.ewelinkApp },
      shelly: { connected: !!sh, mock: !!sh?.mock, server: sh && !sh.mock ? sh.server.replace('https://', '') : null, ids: sh?.ids || [] },
      regions: Object.fromEntries(Object.entries(TUYA_REGIONS).map(([k, r]) => [k, r.label])),
    };
  }

  async connectTuya(userId: string, input: { accessId?: string; accessSecret?: string; region?: string; mock?: boolean }) {
    const integ = await this.load(userId);
    if (integ.tuya) await this.releaseVendor(integ, 'tuya');
    const cfg = input.mock
      ? { accessId: MOCK_TUYA_ID, accessSecret: MOCK_TUYA_SECRET, region: 'us', mock: true, connectedAt: this.now() }
      : { accessId: String(input.accessId || '').trim(), accessSecret: String(input.accessSecret || '').trim(), region: TUYA_REGIONS[input.region || ''] ? String(input.region) : 'us', connectedAt: this.now() };
    if (!cfg.mock && (!/^[a-z0-9]{10,40}$/i.test(cfg.accessId) || !/^[a-z0-9]{16,64}$/i.test(cfg.accessSecret))) {
      throw new DeviceError('El Access ID y el Access Secret son letras y números: copialos de la pestaña Overview de tu proyecto en iot.tuya.com.');
    }
    const trial = { ...integ, tuya: cfg };
    const c = this.client(userId, trial);
    const devices = await c.listDevices();
    integ.tuya = cfg;
    integ.lastError = null;
    await this.persist(integ);
    return {
      devices: devices.length,
      warning: devices.length ? null : 'Las claves andan, pero no aparece ningún equipo: falta vincular tu cuenta de Smart Life al proyecto (Devices → Link App Account → escanear el QR con Smart Life).',
    };
  }

  async disconnectTuya(userId: string) {
    await this.disconnectVendor(userId, 'tuya');
  }
  async disconnectEwelink(userId: string) {
    await this.disconnectVendor(userId, 'ewelink');
  }
  async disconnectShelly(userId: string) {
    await this.disconnectVendor(userId, 'shelly');
  }
  /** Al borrar la cuenta: todas las marcas. */
  async disconnectAll(userId: string) {
    for (const v of VENDORS) await this.disconnectVendor(userId, v);
    await this.store.remove(userId);
  }

  private async disconnectVendor(userId: string, vendor: Vendor) {
    const integ = await this.store.get(userId);
    if (!integ || !integ[vendor]) return;
    integ.watering = integ.watering || {};
    integ.irrigation = integ.irrigation || {};
    await this.releaseVendor(integ, vendor).catch(() => {});
    integ[vendor] = null;
    if (connectedAny(integ)) await this.persist(integ);
    else await this.store.remove(userId);
  }

  /** Saca lo de Cultiveta de los equipos de esa marca y reactiva las programaciones de la persona. */
  private async releaseVendor(integ: DeviceIntegration, vendor: Vendor) {
    const mine = (deviceId: string) => vendorOf(deviceId) === vendor;
    let c: DeviceRouter | null = null;
    try {
      c = this.client(integ.userId, integ);
    } catch {
      c = null;
    }
    if (c) {
      for (const deviceId of Object.keys(integ.schedules).filter(mine)) {
        try {
          await clearSchedule(c, deviceId, integ.schedules[deviceId], this.now());
        } catch {
          /* sigue con los demás */
        }
      }
      // una bomba no queda prendida al desconectar
      for (const b of integ.bindings.filter((x) => x.role === 'pump' && mine(x.deviceId))) {
        await c.sendCommands(b.deviceId, [{ code: b.code, value: false }]).catch(() => {});
      }
      await this.reactivate(c, integ, integ.paused.filter((p) => mine(p.deviceId)));
    }
    for (const b of integ.bindings.filter((x) => mine(x.deviceId))) {
      delete integ.irrigation?.[b.id];
      delete integ.watering?.[b.id];
      delete integ.lastCommand[b.id];
    }
    integ.bindings = integ.bindings.filter((x) => !mine(x.deviceId));
    integ.paused = integ.paused.filter((p) => !mine(p.deviceId));
    for (const id of Object.keys(integ.schedules).filter(mine)) delete integ.schedules[id];
    for (const id of Object.keys(integ.cache).filter(mine)) delete integ.cache[id];
  }

  // ---------- eWeLink ----------

  /** Página de inicio de sesión de eWeLink (vuelve a /equipos con un código). */
  async ewelinkLogin(userId: string) {
    if (!this.ewelinkApp) throw new DeviceError('eWeLink todavía no está habilitado en Cultiveta: falta la app de Cultiveta en dev.ewelink.cc.', 503);
    const integ = await this.load(userId);
    const state = crypto.randomBytes(16).toString('hex');
    integ.oauth = { state, at: this.now() };
    await this.persist(integ);
    const c = new EwelinkCloud({ cfg: { ...this.ewelinkApp, region: 'us', mine: {} }, now: this.now });
    return { url: c.loginUrl(state) };
  }

  async connectEwelink(userId: string, input: { code?: string; region?: string; state?: string; mock?: boolean }) {
    const integ = await this.load(userId);
    const mock = input.mock === true;
    const region = String(input.region || 'us');
    if (!mock) {
      if (!this.ewelinkApp) throw new DeviceError('eWeLink todavía no está habilitado en Cultiveta.', 503);
      if (!integ.oauth || integ.oauth.state !== String(input.state || '') || this.now() - integ.oauth.at > OAUTH_MS) {
        throw new DeviceError('El inicio de sesión de eWeLink venció o no es de esta cuenta: tocá "Conectar con eWeLink" de nuevo.');
      }
      if (!(EWELINK_REGIONS as readonly string[]).includes(region) || !/^[\w-]{4,200}$/.test(String(input.code || ''))) throw new DeviceError('eWeLink no devolvió un código válido.');
    }
    if (integ.ewelink) await this.releaseVendor(integ, 'ewelink');
    integ.ewelink = { region: mock ? 'us' : region, mine: {}, mock, connectedAt: this.now() };
    const c = this.ewelinkClient(userId, integ);
    try {
      await c.exchange(mock ? MOCK_EWELINK_CODE : String(input.code), mock ? 'us' : region);
    } catch (e) {
      integ.ewelink = null;
      throw e;
    }
    const devices = await c.listDevices();
    integ.oauth = null;
    integ.lastError = null;
    await this.persist(integ);
    return { devices: devices.length, warning: devices.length ? null : 'Tu cuenta de eWeLink no tiene equipos: agregalos primero en la app eWeLink.' };
  }

  // ---------- Shelly ----------

  async connectShelly(userId: string, input: { server?: string; authKey?: string; ids?: string | string[]; mock?: boolean }) {
    const integ = await this.load(userId);
    const mock = input.mock === true;
    const ids = (Array.isArray(input.ids) ? input.ids : String(input.ids || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
    if (ids.length > 30 || ids.some((x) => !isShellyDeviceId(x))) throw new DeviceError('Los Device Id de Shelly son letras, números y guiones (app Shelly → el equipo → Configuración → Información del equipo).');
    const server = mock ? MOCK_SHELLY.server : cleanShellyServer(String(input.server || ''));
    const authKey = mock ? MOCK_SHELLY.authKey : String(input.authKey || '').trim();
    if (!server) throw new DeviceError('El server de Shelly Cloud es algo como "shelly-103-eu.shelly.cloud": copialo de la app Shelly → Configuración de usuario → Clave de autorización de la nube.');
    if (!isShellyAuthKey(authKey)) throw new DeviceError('La clave de autorización de la nube de Shelly es un texto largo: copiala entera de la app Shelly.');
    const cfg = { server, authKey, ids: Array.from(new Set(ids)), mock, connectedAt: this.now() };
    const devices = await this.client(userId, { ...integ, tuya: null, ewelink: null, shelly: cfg }).listDevices();
    if (integ.shelly) await this.releaseVendor(integ, 'shelly');
    integ.shelly = cfg;
    integ.lastError = null;
    await this.persist(integ);
    return { devices: devices.length, warning: devices.length ? null : 'La clave anda, pero no aparece ningún Shelly: agregá el Device Id de cada uno.' };
  }

  private async reactivate(c: DeviceRouter, integ: DeviceIntegration, groups: DeviceIntegration['paused']) {
    for (const g of groups) {
      try {
        await c.setTimerGroupStatus(g.deviceId, g.category, g.groupId, '1');
      } catch {
        /* ya no estaba */
      }
    }
    const done = new Set(groups.map((g) => `${g.deviceId}|${g.groupId}`));
    integ.paused = integ.paused.filter((g) => !done.has(`${g.deviceId}|${g.groupId}`));
  }

  // ---------- equipos ----------

  async devices(userId: string) {
    return (await this.devicesWithErrors(userId)).devices;
  }

  /** Los equipos de todas las marcas conectadas; si una marca falla, las otras se ven igual. */
  async devicesWithErrors(userId: string) {
    const integ = await this.load(userId);
    const c = this.client(userId, integ);
    const list = await c.listDevices();
    const errors = Object.fromEntries(Object.entries(c.lastErrors).map(([v, m]) => [v, `${VENDOR_APP[v as Vendor]}: ${m}`]));
    const out = [];
    for (const d of list) {
      const spec = await this.spec(c, d.id);
      const sensors = sensorsOf(d.status, spec, d.category);
      integ.cache[d.id] = { name: d.name, online: !!d.online, status: Object.fromEntries((d.status || []).map((s: any) => [s.code, s.value])), sensors, power: powerOf(d.status), at: this.now() };
      out.push({
        id: d.id,
        vendor: vendorOf(d.id),
        name: d.name,
        product: d.product_name || '',
        category: d.category || '',
        online: !!d.online,
        channels: channelsOf(d.status, spec).map((ch) => ({
          ...ch,
          hasCountdown: !!ch.countdownCode,
          binding: integ.bindings.find((b) => b.deviceId === d.id && b.code === ch.code) || null,
        })),
        sensors,
        sensorBindings: integ.bindings.filter((b) => b.deviceId === d.id && b.code === 'sensor'),
        power: powerOf(d.status),
      });
    }
    await this.persist(integ);
    return { devices: out, errors };
  }

  async bind(
    userId: string,
    input: { deviceId: string; code: string; role: BindingRole; cultivationId: string; cultivationName?: string; targetKind?: unknown; schedule?: unknown; climateRole?: unknown; rule?: unknown; pump?: unknown }
  ) {
    const integ = await this.load(userId);
    const c = this.client(userId, integ);
    const role = input.role;
    if (!['light', 'pump', 'climate', 'sensor_th', 'sensor_soil'].includes(role)) throw new DeviceError('Función inválida para el equipo.');
    const isSwitch = MANAGED.includes(role);
    if (isSwitch && !SWITCH_CODE.test(input.code)) throw new DeviceError('Para eso hay que elegir un toma.');
    if (role === 'climate' && !isClimateRole(input.climateRole)) throw new DeviceError('Elegí qué equipo de clima es.');
    const targetKind = input.targetKind === 'indoor' ? 'indoor' : 'cultivation';
    if (targetKind === 'indoor' && (role === 'pump' || role === 'sensor_soil')) throw new DeviceError('La bomba y la sonda de sustrato van en un cultivo: cada maceta se riega aparte.');
    const owned = await this.verifyCultivation(userId, input.cultivationId, targetKind);
    const cultivationName = owned?.name || String(input.cultivationName || 'Cultivo').slice(0, 60);
    const device = (await c.listDevices()).find((d) => d.id === input.deviceId);
    if (!device) throw new DeviceError('Ese equipo no está en tu cuenta de Smart Life.', 404);
    const code = isSwitch ? input.code : 'sensor';
    const channel = isSwitch ? channelsOf(device.status, await this.spec(c, device.id)).find((ch) => ch.code === code) : null;
    if (isSwitch && !channel) throw new DeviceError('Ese toma no existe en el equipo.');
    if (role === 'pump' && !channel!.countdownCode) throw new DeviceError('Este toma no tiene cuenta regresiva (no se apaga solo): sin ese seguro no se usa para regar.');

    const climateRole = role === 'climate' ? (input.climateRole as ClimateRole) : null;
    // sin regla elegida: por sensor si ese lugar tiene sensor de ambiente; si no, sigue a la luz
    const hasSensor = integ.bindings.some((x) => x.cultivationId === input.cultivationId && x.role === 'sensor_th');
    const rule = climateRole ? cleanRule(climateRole, input.rule, { hasSensor }) : null;
    const pump = role === 'pump' ? cleanPump(input.pump) : null;

    // un toma o sensor en un solo lugar; una luz, una bomba y un sensor de cada tipo por cultivo
    const replaced = integ.bindings.filter(
      (b) => (b.deviceId === input.deviceId && b.code === code) || (b.cultivationId === input.cultivationId && b.role === role && role !== 'climate')
    );
    for (const b of replaced) await this.unbindInto(c, integ, b);

    const binding: DeviceBinding = {
      id: crypto.randomUUID(),
      deviceId: device.id,
      deviceName: device.name,
      code,
      label: channel ? channel.label : 'Sensor',
      cultivationId: input.cultivationId,
      cultivationName,
      targetKind,
      role,
      schedule: role === 'light' || role === 'pump' ? validateSchedule(input.schedule) : null,
      climateRole,
      rule,
      pump,
      countdownCode: role === 'pump' ? channel!.countdownCode : null,
      countdownUnit: role === 'pump' ? channel!.countdownUnit : null,
      auto: null,
      lastReason: null,
      manual: null,
    };
    integ.bindings.push(binding);

    if (isSwitch) {
      // ese toma lo maneja Cultiveta: se pausan las programaciones de la persona en ese toma
      const timers = await c.getTimers(device.id);
      const ownGroups = new Set((integ.schedules[device.id]?.groups || []).map((g) => g.groupId));
      const theirs = [...new Map(timers.filter((t) => t.category !== SCHEDULE_CATEGORY && !ownGroups.has(t.groupId) && t.active && t.functions.some((f) => f.code === code)).map((t) => [t.groupId, t])).values()];
      for (const t of theirs) {
        await c.setTimerGroupStatus(device.id, t.category, t.groupId, '0');
        integ.paused.push({ deviceId: device.id, category: t.category, groupId: t.groupId, code });
      }
      await this.syncDevice(c, integ, device.id, true);
      await this.applyNow(c, integ, binding);
    } else if (role === 'sensor_th') {
      // un sensor nuevo: los equipos por sensor de ese cultivo deciden enseguida con su lectura
      for (const b of integ.bindings.filter((x) => x.cultivationId === input.cultivationId && x.role === 'climate' && x.rule?.mode === 'sensor')) await this.applyNow(c, integ, b);
    }
    await this.persist(integ);
    return binding;
  }

  private async unbindInto(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding) {
    integ.bindings = integ.bindings.filter((x) => x.id !== b.id);
    if (integ.irrigation) delete integ.irrigation[b.id];
    if (!MANAGED.includes(b.role)) return;
    if (b.role === 'pump') await c.sendCommands(b.deviceId, [{ code: b.code, value: false }]).catch(() => {});
    // si era una luz, lo que la seguía en otros equipos se vuelve a cargar sin ella
    const devices = new Set([b.deviceId, ...(b.role === 'light' ? this.followers(integ, b.cultivationId).map((f) => f.deviceId) : [])]);
    for (const id of devices) await this.syncDevice(c, integ, id, true);
    await this.reactivate(c, integ, integ.paused.filter((p) => p.deviceId === b.deviceId && p.code === b.code));
  }

  async unbind(userId: string, bindingId: string) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId);
    if (!b) throw new DeviceError('Esa asignación ya no existe.', 404);
    await this.unbindInto(this.client(userId, integ), integ, b);
    await this.persist(integ);
  }

  /** Cambia cómo se maneja un equipo de clima (por sensor, sigue a la luz o al revés, y sus valores). */
  async setRule(userId: string, bindingId: string, raw: unknown) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId && x.role === 'climate');
    if (!b || !b.climateRole) throw new DeviceError('Ese equipo de clima ya no está asignado.', 404);
    b.rule = cleanRule(b.climateRole, raw);
    b.manual = null; // con la regla nueva, deja de estar a mano
    const c = this.client(userId, integ);
    await this.syncDevice(c, integ, b.deviceId, true);
    await this.applyNow(c, integ, b);
    await this.persist(integ);
    return b;
  }

  /** Cambia el caudal y los topes de una bomba. */
  async setPump(userId: string, bindingId: string, raw: unknown) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId && x.role === 'pump');
    if (!b) throw new DeviceError('Esa bomba ya no está asignada.', 404);
    const pump = cleanPump(raw);
    if (b.auto && b.auto.mode !== 'off') {
      const errs = validateAutoIrrigation(b.auto, pump.maxSeconds);
      if (errs.length) throw new DeviceError(`Con ese tope no anda el riego automático: ${errs[0]}`);
    }
    b.pump = pump;
    await this.persist(integ);
    return b;
  }

  /** Riego automático de una bomba: programado, por humedad o apagado. Empieza a contar desde ahora. */
  async setAuto(userId: string, bindingId: string, raw: unknown) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId && x.role === 'pump');
    if (!b) throw new DeviceError('Esa bomba ya no está asignada.', 404);
    const auto = cleanAuto(raw, (b.pump || DEFAULT_PUMP).maxSeconds);
    if (auto.mode === 'wetdry' && !integ.bindings.some((x) => x.cultivationId === b.cultivationId && x.role === 'sensor_soil')) {
      throw new DeviceError('Para regar por humedad hace falta una sonda de sustrato asignada a este cultivo.');
    }
    b.auto = auto;
    integ.irrigation![b.id] = { lastCheck: this.now(), wetdry: null, last: integ.irrigation![b.id]?.last || null, note: null };
    await this.persist(integ);
    return b;
  }

  /** El horario del cultivo cambió (hora de encendido o fotoperiodo): se vuelve a cargar en Smart Life. */
  async setSchedule(userId: string, cultivationId: string, schedule: unknown) {
    const integ = await this.store.get(userId);
    const targets = integ?.bindings.filter((x) => x.cultivationId === cultivationId && (x.role === 'light' || x.role === 'pump')) || [];
    if (!integ || !targets.length) return { changed: false };
    integ.watering = integ.watering || {};
    integ.irrigation = integ.irrigation || {};
    const next = schedule == null ? null : validateSchedule(schedule);
    const changed = targets.filter((x) => JSON.stringify(next) !== JSON.stringify(x.schedule ?? null));
    if (!changed.length) return { changed: false };
    for (const x of changed) {
      x.schedule = next;
      x.manual = null; // con el horario nuevo, la luz deja de estar a mano
    }
    const b = changed.find((x) => x.role === 'light');
    if (b) {
      const c = this.client(userId, integ);
      const followers = this.followers(integ, cultivationId);
      for (const id of new Set([b.deviceId, ...followers.map((f) => f.deviceId)])) await this.syncDevice(c, integ, id, true);
      for (const x of [b, ...followers]) await this.applyNow(c, integ, x);
    }
    await this.persist(integ);
    return { changed: true };
  }

  /**
   * Prender o apagar un toma a mano. Un toma libre, sin más. La luz o un equipo de clima, como en un
   * timer: queda así hasta el próximo cambio de su horario (o una hora, si no tiene horario) y después
   * sigue solo; si se lo deja como dice su horario, vuelve al horario. La bomba no: solo prende para regar.
   */
  async command(userId: string, deviceId: string, code: string, value: boolean) {
    if (!SWITCH_CODE.test(code)) throw new DeviceError('Toma inválido.');
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.deviceId === deviceId && x.code === code && MANAGED.includes(x.role));
    if (b?.role === 'pump') throw new DeviceError(`Ese toma es la bomba de riego de ${b.cultivationName}: se prende solo para regar (usá "Regar" en el cultivo).`, 409);
    const c = this.client(userId, integ);
    const t = this.now();
    if (b) {
      b.manual = null;
      const planned = this.desiredFor(integ, b, t);
      if (planned && planned.value === value) {
        // lo deja como dice su horario: vuelve al horario
        await c.sendCommands(deviceId, this.switchCommands(c, integ, b, value, t));
        b.lastReason = planned.reason;
      } else {
        const next = this.nextChangeOf(integ, b, t);
        b.manual = { value, until: next != null && next > t ? next : t + MANUAL_MS };
        await c.sendCommands(deviceId, [{ code, value }]);
        b.lastReason = this.manualReason(integ, b);
      }
      integ.lastCommand[b.id] = { at: t, value };
    } else {
      await c.sendCommands(deviceId, [{ code, value }]);
    }
    const entry = integ.cache[deviceId];
    if (entry) entry.status[code] = value;
    await this.persist(integ);
    return { manual: b?.manual ?? null };
  }

  // ---------- riego con bomba ----------

  /** Riega N segundos: prende la bomba con la cuenta regresiva del toma (se apaga sola). */
  async water(userId: string, bindingId: string, seconds: number) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId && x.role === 'pump');
    if (!b) throw new DeviceError('Ese cultivo no tiene una bomba asignada.', 404);
    const r = await this.waterInto(this.client(userId, integ), integ, b, seconds, false);
    await this.persist(integ);
    return { ...r, cultivationId: b.cultivationId };
  }

  /** Prende la bomba con su cuenta regresiva (pasando por los topes). No guarda: lo hace quien llama. */
  private async waterInto(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding, seconds: number, auto: boolean) {
    let online = false;
    try {
      online = (await this.poll(c, integ, b.deviceId, 0)).online;
    } catch {
      online = false;
    }
    const check = checkWaterOrder(Number(seconds), b.pump || DEFAULT_PUMP, { online, hasCountdown: !!b.countdownCode });
    if (check.ok === false) throw new DeviceError(check.text, 409);
    const value = b.countdownUnit === 'min' ? Math.max(1, Math.ceil(check.seconds / 60)) : check.seconds;
    const realSeconds = b.countdownUnit === 'min' ? value * 60 : check.seconds;
    await c.sendCommands(b.deviceId, [
      { code: b.code, value: true },
      { code: b.countdownCode!, value },
    ]);
    const t = this.now();
    const liters = (realSeconds * (b.pump || DEFAULT_PUMP).flowLph) / 3600;
    integ.watering![b.id] = { at: t, seconds: realSeconds, liters, endsAt: t + realSeconds * 1000, ...(auto ? { auto: true } : {}) };
    integ.lastCommand[b.id] = { at: t, value: true };
    if (integ.cache[b.deviceId]) integ.cache[b.deviceId].status[b.code] = true;
    return { seconds: realSeconds, liters, endsAt: t + realSeconds * 1000 };
  }

  /** La luz del cultivo para el riego: la del toma de luz si hay, o la que mandó la app con la bomba. */
  private irrigationLight(integ: DeviceIntegration, pump: DeviceBinding) {
    return this.lightOf(integ, pump.cultivationId)?.schedule || pump.schedule || null;
  }

  /** Un paso del riego automático de una bomba (en la revisión). */
  private async stepAuto(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding, t: number) {
    const auto = b.auto;
    if (!auto || auto.mode === 'off') return;
    const st = (integ.irrigation![b.id] ||= { lastCheck: t, wetdry: null, last: null, note: null });
    const running = integ.watering?.[b.id];
    const busy = !!running && t < running.endsAt + 30_000;
    let due: { seconds: number; reason: string } | null = null;
    if (auto.mode === 'scheduled') {
      const from = Math.max(st.lastCheck ?? t, t - LATE_MS); // si el servidor estuvo caído, no riega atrasado
      const list = scheduledWaterings(auto, this.irrigationLight(integ, b), from, t + 1);
      st.lastCheck = t + 1;
      if (!list.length) {
        if (auto.scheduled.when === 'light' && !this.irrigationLight(integ, b)) st.note = 'falta la hora de encendido de la luz del cultivo';
        return;
      }
      if (busy) {
        st.note = 'se salteó un riego programado porque la bomba ya estaba regando';
        return;
      }
      due = list[list.length - 1];
    } else {
      if (busy) return;
      const soil = integ.bindings.find((x) => x.cultivationId === b.cultivationId && x.role === 'sensor_soil');
      const entry = soil ? integ.cache[soil.deviceId] : null;
      const moisture = entry && entry.online !== false && t - entry.at <= SENSOR_STALE_MS ? entry.sensors?.soil ?? null : null;
      const light = this.irrigationLight(integ, b);
      const s = light ? lightState({ lightHours: light.lightHours, darkHours: light.darkHours }, light.anchorMs, t) : null;
      const isNight = !!s && (!s.started || !s.on);
      const prev = st.wetdry;
      const r = wetDryStep(prev, moisture, isNight, t, auto.wetdry, auto.timeZone);
      st.wetdry = r.state;
      st.note = r.action === 'shot' ? null : soil ? r.reason : 'falta una sonda de sustrato en el cultivo';
      if (r.action !== 'shot') return;
      due = { seconds: r.seconds!, reason: r.reason };
      try {
        return await this.autoWater(c, integ, b, st, due);
      } catch (e) {
        st.wetdry = { ...r.state, shotsToday: r.state.shotsToday - 1, lastShotAt: prev?.lastShotAt ?? null }; // no cuenta el que no salió
        throw e;
      }
    }
    await this.autoWater(c, integ, b, st, due);
  }

  private async autoWater(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding, st: IrrigationState, due: { seconds: number; reason: string }) {
    try {
      const r = await this.waterInto(c, integ, b, due.seconds, true);
      const at = this.now();
      st.last = { at, seconds: r.seconds, liters: r.liters, reason: due.reason };
      st.note = null;
      const tz = b.auto?.timeZone || DEFAULT_AUTO_IRRIGATION.timeZone;
      const p = zonedParts(at, tz);
      const pad = (n: number) => String(n).padStart(2, '0');
      try {
        await this.recordWatering(integ.userId, {
          cultivationId: b.cultivationId,
          date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
          time: `${pad(p.hour)}:${pad(p.minute)}`,
          volumeLiters: Math.round(r.liters * 100) / 100,
          observations: `Riego automático con bomba (${r.seconds} s) · ${due.reason}`,
        });
      } catch (e: any) {
        st.note = `regó, pero no se pudo anotar el riego: ${e?.message || e}`;
      }
    } catch (e: any) {
      st.note = `no pudo regar: ${e?.message || e}`;
      throw e;
    }
  }

  async stopWater(userId: string, bindingId: string) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId && x.role === 'pump');
    if (!b) throw new DeviceError('Ese cultivo no tiene una bomba asignada.', 404);
    const c = this.client(userId, integ);
    await c.sendCommands(b.deviceId, [{ code: b.code, value: false }, ...(b.countdownCode ? [{ code: b.countdownCode, value: 0 }] : [])]);
    const w = integ.watering![b.id];
    if (w) w.endsAt = this.now();
    integ.lastCommand[b.id] = { at: this.now(), value: false };
    if (integ.cache[b.deviceId]) integ.cache[b.deviceId].status[b.code] = false;
    await this.persist(integ);
  }

  // ---------- qué tiene que hacer cada toma ----------

  private lightOf(integ: DeviceIntegration, cultivationId: string) {
    return integ.bindings.find((x) => x.cultivationId === cultivationId && x.role === 'light' && x.schedule) || null;
  }
  /** Los equipos de clima que dependen del horario de la luz de ese lugar (la siguen o van al revés). */
  private followers(integ: DeviceIntegration, cultivationId: string) {
    return integ.bindings.filter((x) => x.cultivationId === cultivationId && x.role === 'climate' && (x.rule?.mode === 'follow' || x.rule?.mode === 'follow_inverted'));
  }
  /** ¿Tiene horario cargado en el equipo? (la luz, lo que la sigue o un horario propio). */
  private hasTimer(b: DeviceBinding) {
    return b.role === 'light' || (b.role === 'climate' && !!b.rule && TIMED_MODES.includes(b.rule.mode));
  }
  /** Lo hecho a mano que sigue vigente (lo vencido se borra). */
  private manualOf(b: DeviceBinding, t: number) {
    if (b.manual && t < b.manual.until) return b.manual;
    if (b.manual) b.manual = null;
    return null;
  }
  private tzOf(integ: DeviceIntegration, b: DeviceBinding) {
    return b.schedule?.timeZone || b.rule?.timeZone || this.lightOf(integ, b.cultivationId)?.schedule?.timeZone || DEFAULT_TZ;
  }
  private manualReason(integ: DeviceIntegration, b: DeviceBinding) {
    return b.manual ? `${b.manual.value ? 'prendido' : 'apagado'} a mano hasta las ${zonedClock(b.manual.until, this.tzOf(integ, b))}` : null;
  }
  private lightOnAt(integ: DeviceIntegration, cultivationId: string, t: number): boolean | null {
    const l = this.lightOf(integ, cultivationId);
    if (!l?.schedule) return null;
    const s = lightState({ lightHours: l.schedule.lightHours, darkHours: l.schedule.darkHours }, l.schedule.anchorMs, t);
    return s.started ? s.on : false;
  }

  /** Lo que tiene que estar haciendo un toma ahora (null = Cultiveta no lo decide en este momento). */
  private desiredFor(integ: DeviceIntegration, b: DeviceBinding, t: number): { value: boolean; reason: string } | null {
    const manual = this.manualOf(b, t);
    if (manual) return { value: manual.value, reason: this.manualReason(integ, b)! };
    return this.plannedFor(integ, b, t);
  }

  /** Lo que dice su horario o su regla (sin contar lo hecho a mano). */
  private plannedFor(integ: DeviceIntegration, b: DeviceBinding, t: number): { value: boolean; reason: string } | null {
    if (b.role === 'light') {
      if (!b.schedule) return null;
      const s = lightState({ lightHours: b.schedule.lightHours, darkHours: b.schedule.darkHours }, b.schedule.anchorMs, t);
      return { value: s.started ? s.on : false, reason: 'horario de la luz' };
    }
    if (b.role === 'pump') {
      const w = integ.watering?.[b.id];
      if (w && t < w.endsAt + 60_000) return null; // regando: la apaga su cuenta regresiva
      return { value: false, reason: 'la bomba solo prende para regar' };
    }
    if (b.role === 'climate' && b.climateRole && b.rule) {
      if (b.rule.mode === 'always') return { value: true, reason: 'siempre prendido' };
      if (b.rule.mode === 'schedule') {
        const it = this.itemOf(integ, b);
        if (!it) return null;
        const s = lightState({ lightHours: it.lightHours, darkHours: it.darkHours }, it.anchorMs, t);
        const r = evaluateClimate(b.climateRole, b.rule, { readings: null, lightOn: null, currentOn: false, scheduleOn: s.started && s.on });
        return { value: r.on, reason: r.reason };
      }
      const lightOn = this.lightOnAt(integ, b.cultivationId, t);
      if (b.rule.mode !== 'sensor') {
        if (lightOn == null) return null;
        const r = evaluateClimate(b.climateRole, b.rule, { readings: null, lightOn, currentOn: false });
        return { value: r.on, reason: r.reason };
      }
      const sensor = integ.bindings.find((x) => x.cultivationId === b.cultivationId && x.role === 'sensor_th');
      const entry = sensor ? integ.cache[sensor.deviceId] : null;
      const fresh = entry && entry.online !== false && t - entry.at <= SENSOR_STALE_MS ? entry.sensors : null;
      const currentOn = integ.cache[b.deviceId]?.status[b.code] === true;
      const r = evaluateClimate(b.climateRole, b.rule, {
        readings: fresh ? { temperature: fresh.temperature, humidity: fresh.humidity } : null,
        lightOn,
        currentOn,
      });
      return { value: r.on, reason: sensor ? r.reason : 'falta un sensor de ambiente en el cultivo' };
    }
    return null;
  }

  /** El horario de un toma con horario (la luz, lo que la sigue o va al revés, o un horario propio): null si no tiene. */
  private itemOf(integ: DeviceIntegration, b: DeviceBinding): LightItem | null {
    if (b.role === 'light' && b.schedule) return { code: b.code, ...b.schedule };
    if (b.role === 'climate' && b.rule?.mode === 'schedule' && b.rule.times) return { code: b.code, ...scheduleItem(b.rule.times, b.rule.timeZone || DEFAULT_TZ, this.now()) };
    if (b.role === 'climate' && b.rule && (b.rule.mode === 'follow' || b.rule.mode === 'follow_inverted')) {
      // lo que sigue a la luz también queda cargado (al revés: luz y oscuridad invertidas)
      const l = this.lightOf(integ, b.cultivationId)?.schedule;
      if (!l) return null;
      if (b.rule.mode === 'follow') return { code: b.code, ...l };
      if (l.darkHours > 0) return { code: b.code, lightHours: l.darkHours, darkHours: l.lightHours, anchorMs: l.anchorMs + l.lightHours * HOUR_MS, timeZone: l.timeZone };
    }
    return null;
  }

  /** Órdenes para dejar un toma en un estado. En Shelly, el toma con horario además queda "dándose vuelta solo" en el próximo cambio. */
  private switchCommands(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding, value: boolean, t: number) {
    const cmds: Array<{ code: string; value: unknown }> = [{ code: b.code, value }];
    // a mano no se da vuelta solo: al terminar, la revisión lo deja como dice el horario
    const next = c.scheduleKind(b.deviceId) === 'toggle' && !this.manualOf(b, t) ? this.nextChangeOf(integ, b, t) : null;
    if (next != null) cmds.push({ code: countdownOf(b.code), value: Math.max(1, Math.round((next - t) / 1000)) });
    return cmds;
  }
  private nextChangeOf(integ: DeviceIntegration, b: DeviceBinding, t: number): number | null {
    const it = this.itemOf(integ, b);
    return it ? lightState({ lightHours: it.lightHours, darkHours: it.darkHours }, it.anchorMs, t).nextChangeAt : null;
  }

  private async syncDevice(c: DeviceRouter, integ: DeviceIntegration, deviceId: string, force = false) {
    const items = integ.bindings.filter((x) => x.deviceId === deviceId).map((b) => this.itemOf(integ, b)).filter((x): x is LightItem => !!x);
    const prev = integ.schedules[deviceId];
    const t = this.now();
    try {
      const kind = c.scheduleKind(deviceId);
      if (kind === 'loops') integ.schedules[deviceId] = await syncLoops(c, deviceId, items, prev, t, force);
      else if (kind === 'toggle') {
        // Shelly: la nube no guarda horarios; cada cambio lo deja programado la revisión (switchCommands)
        integ.schedules[deviceId] = { mode: items.length ? 'server' : 'none', sig: 'server', until: null, span: 0, count: items.length, codes: items.map((it) => it.code), groups: [], daily: dailyPlan(items) || undefined, at: t, error: null };
      } else integ.schedules[deviceId] = await syncSchedule(c, deviceId, items, prev, t, force);
    } catch (e: any) {
      integ.schedules[deviceId] = { ...(prev || { mode: 'none', sig: 'none', until: null, span: 0, count: 0, codes: [], groups: [] }), at: this.now(), error: e?.message || 'Error' } as ScheduleState;
    }
  }

  /** Deja el toma como corresponde ahora mismo (si no, el primer cambio cargado puede tardar horas). */
  private async applyNow(c: DeviceRouter, integ: DeviceIntegration, b: DeviceBinding) {
    if (b.role === 'climate' && b.rule?.mode === 'sensor') {
      // por sensor: hace falta lo que mide el sensor del cultivo y cómo está el equipo ahora
      const sensor = integ.bindings.find((x) => x.cultivationId === b.cultivationId && x.role === 'sensor_th');
      try {
        if (sensor) await this.poll(c, integ, sensor.deviceId, SENSOR_POLL_MS);
        await this.poll(c, integ, b.deviceId, SENSOR_POLL_MS);
      } catch {
        /* sin lectura: decide con lo que haya */
      }
    }
    const d = this.desiredFor(integ, b, this.now());
    if (!d) return;
    b.lastReason = d.reason;
    try {
      await c.sendCommands(b.deviceId, this.switchCommands(c, integ, b, d.value, this.now()));
      integ.lastCommand[b.id] = { at: this.now(), value: d.value };
      const entry = integ.cache[b.deviceId];
      if (entry) entry.status[b.code] = d.value;
    } catch (e: any) {
      integ.lastError = e?.message || 'No se pudo aplicar lo programado.';
    }
  }

  private async poll(c: DeviceRouter, integ: DeviceIntegration, deviceId: string, maxAge = POLL_MS) {
    const prev = integ.cache[deviceId];
    if (prev && this.now() - prev.at < maxAge) return prev;
    const d = await c.getDevice(deviceId);
    const spec = await this.spec(c, deviceId);
    const entry: CacheEntry = {
      name: d.name,
      online: !!d.online,
      status: Object.fromEntries((d.status || []).map((s: any) => [s.code, s.value])),
      sensors: sensorsOf(d.status, spec, d.category),
      power: powerOf(d.status),
      at: this.now(),
    };
    integ.cache[deviceId] = entry;
    return entry;
  }

  // ---------- lo que ve el cultivo ----------

  /** Estado de los equipos asignados (lo que muestran la luz, el ambiente, el riego y los equipos del cultivo). */
  async overview(userId: string) {
    const integ = await this.store.get(userId);
    if (!integ || !connectedAny(integ)) return { connected: false, mock: false, bindings: [] as any[] };
    integ.watering = integ.watering || {};
    const c = this.client(userId, integ);
    const t = this.now();
    const out = [];
    for (const b of integ.bindings) {
      let entry: CacheEntry | null = null;
      try {
        entry = await this.poll(c, integ, b.deviceId);
      } catch {
        entry = integ.cache[b.deviceId] || null;
      }
      const sched = integ.schedules[b.deviceId];
      const w = integ.watering[b.id];
      const manual = this.manualOf(b, t);
      out.push({
        ...b,
        manual,
        vendor: vendorOf(b.deviceId),
        online: entry?.online ?? null,
        on: MANAGED.includes(b.role) && entry ? entry.status[b.code] === true : null,
        sensors: b.role === 'sensor_th' || b.role === 'sensor_soil' ? entry?.sensors ?? null : null,
        readAt: entry?.at ?? null,
        loaded: (b.role === 'light' || b.role === 'climate') && sched && sched.codes.includes(b.code) ? { mode: sched.mode, until: sched.until, daily: sched.daily?.find((p) => p.code === b.code) || null, error: sched.error } : null,
        watering: b.role === 'pump' && w ? { ...w, active: t < w.endsAt } : null,
        irrigation: b.role === 'pump' && integ.irrigation?.[b.id] ? { last: integ.irrigation[b.id].last, note: integ.irrigation[b.id].note } : null,
      });
    }
    await this.persist(integ);
    return { connected: true, mock: !!(integ.tuya?.mock || integ.ewelink?.mock || integ.shelly?.mock), bindings: out, lastError: integ.lastError };
  }

  // ---------- revisión periódica (Cloud Scheduler, cada 5 min) ----------

  /** Rellena lo cargado, aplica las reglas por sensor, corrige lo que quedó al revés y lee los sensores. */
  async tick(userId: string) {
    const integ = await this.store.get(userId);
    if (!integ || !connectedAny(integ)) return { devices: 0, fixes: 0, waterings: 0 };
    integ.watering = integ.watering || {};
    integ.irrigation = integ.irrigation || {};
    const c = this.client(userId, integ);
    const t = this.now();
    const errorBefore = integ.lastError;
    let fixes = 0;
    let waterings = 0;
    // los sensores de cultivos con reglas por sensor o riego por humedad se leen en cada vuelta (antes que los equipos)
    const sensorRules = new Set(
      integ.bindings.filter((b) => (b.role === 'climate' && b.rule?.mode === 'sensor') || (b.role === 'pump' && b.auto?.mode === 'wetdry')).map((b) => b.cultivationId)
    );
    for (const s of integ.bindings.filter((b) => b.role === 'sensor_th' || b.role === 'sensor_soil')) {
      try {
        await this.poll(c, integ, s.deviceId, sensorRules.has(s.cultivationId) ? SENSOR_POLL_MS : SLOW_POLL_MS);
      } catch (e: any) {
        integ.lastError = e?.message || String(e);
      }
    }
    for (const b of integ.bindings.filter((x) => x.role === 'pump' && x.auto && x.auto.mode !== 'off')) {
      const before = integ.irrigation[b.id]?.last?.at;
      try {
        await this.stepAuto(c, integ, b, t);
      } catch (e: any) {
        integ.lastError = e?.message || String(e);
      }
      if (integ.irrigation[b.id]?.last?.at !== before) waterings++;
    }
    const deviceIds = [...new Set(integ.bindings.filter((b) => MANAGED.includes(b.role)).map((b) => b.deviceId))];
    for (const deviceId of deviceIds) {
      try {
        const here = integ.bindings.filter((x) => x.deviceId === deviceId && MANAGED.includes(x.role));
        if (here.some((b) => this.hasTimer(b))) await this.syncDevice(c, integ, deviceId);
        const toggle = c.scheduleKind(deviceId) === 'toggle';
        // Shelly con horario: cada vuelta, para dejar programado el cambio siguiente apenas pasa uno
        const fast = toggle || here.some((b) => b.role === 'pump' || (b.role === 'climate' && b.rule?.mode === 'sensor'));
        const entry = await this.poll(c, integ, deviceId, fast ? SENSOR_POLL_MS : SLOW_POLL_MS);
        if (!entry.online) continue;
        for (const b of here) {
          const d = this.desiredFor(integ, b, t);
          if (!d) continue;
          b.lastReason = d.reason;
          if (entry.status[b.code] === d.value) {
            // Shelly: además tiene que estar por darse vuelta en el próximo cambio (±2 min); a mano, no
            const next = toggle && !this.manualOf(b, t) ? this.nextChangeOf(integ, b, t) : null;
            if (next == null) continue;
            const left = Number(entry.status[countdownOf(b.code)] || 0) - (t - entry.at) / 1000;
            if (Math.abs(left - (next - t) / 1000) <= 120) continue;
          } else {
            const last = integ.lastCommand[b.id];
            if (last && last.value === d.value && t - last.at < GRACE_MS) continue;
          }
          const cmds = this.switchCommands(c, integ, b, d.value, t);
          await c.sendCommands(deviceId, cmds);
          const cd = cmds.find((x) => x.code !== b.code);
          if (cd) entry.status[cd.code] = cd.value;
          integ.lastCommand[b.id] = { at: t, value: d.value };
          entry.status[b.code] = d.value;
          fixes++;
        }
        integ.lastError = null;
      } catch (e: any) {
        integ.lastError = e instanceof TuyaError || e instanceof Error ? e.message : String(e);
      }
    }
    await this.persist(integ);
    if (integ.lastError && integ.lastError !== errorBefore) this.onProblem(userId, integ.lastError);
    return { devices: deviceIds.length, fixes, waterings };
  }

  async tickAll() {
    const ids = await this.store.listUserIds();
    let fixes = 0;
    let waterings = 0;
    for (const id of ids) {
      try {
        const r = await this.tick(id);
        fixes += r.fixes;
        waterings += r.waterings || 0;
      } catch {
        /* sigue con las demás cuentas */
      }
    }
    return { accounts: ids.length, fixes, waterings };
  }
}
