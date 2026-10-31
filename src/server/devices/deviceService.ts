/**
 * Equipos inteligentes de cada persona (traído de Órbita, etapa 2: Smart Life real).
 *
 * - La cuenta de Smart Life (Access ID + Access Secret del proyecto de iot.tuya.com) queda guardada
 *   solo del lado del servidor: la colección "deviceIntegrations" no la puede leer el navegador.
 * - Cada toma o sensor se asigna a un cultivo:
 *     · la luz (sigue el horario del cultivo);
 *     · la bomba de riego (solo prende para regar, con la cuenta regresiva del enchufe);
 *     · un equipo de clima (extractor, humidificador…): por sensor, o siguiendo a la luz (o al revés);
 *     · un sensor de ambiente o una sonda de sustrato.
 *   Las demás tomas se manejan a mano desde Equipos.
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
import { clearSchedule, syncSchedule, SCHEDULE_CATEGORY, type LightItem, type ScheduleState } from './lightSchedule';
import { isValidTimeZone, zonedParts } from './tz';
import { LATE_MS, scheduledWaterings, wetDryStep, type WetDryState } from './autoIrrigation';
import { HOUR_MS, lightState } from '../../utils/lightCycle';
import {
  checkWaterOrder,
  defaultClimateRule,
  evaluateClimate,
  isClimateRole,
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
  cultivationId: string;
  cultivationName: string;
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

function blank(userId: string, now: number): DeviceIntegration {
  return { userId, tuya: null, bindings: [], paused: [], schedules: {}, cache: {}, lastCommand: {}, watering: {}, irrigation: {}, lastError: null, updatedAt: now };
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

function cleanRule(role: ClimateRole, raw: any): ClimateRule {
  if (!raw || typeof raw !== 'object') return defaultClimateRule(role);
  const num = (v: any) => Number(v);
  const rule: ClimateRule = {
    mode: raw.mode,
    metric: raw.metric,
    on: num(raw.on),
    off: num(raw.off),
    night: raw.night && typeof raw.night === 'object' ? { on: num(raw.night.on), off: num(raw.night.off) } : null,
    sensorLoss: raw.sensorLoss || 'off',
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
  private mocks = new Map<string, MockTuya>();
  private specs = new Map<string, any>();
  private verifyCultivation: (userId: string, cultivationId: string) => Promise<{ name: string } | null>;
  private recordWatering: (userId: string, w: AutoWateringRecord) => Promise<void>;

  constructor(o: {
    store: DeviceStore;
    now?: () => number;
    fetchImpl?: (url: string, init?: any) => Promise<any>;
    /** Con Firestore Admin: confirma que el cultivo es de esa persona y devuelve su nombre. */
    verifyCultivation?: (userId: string, cultivationId: string) => Promise<{ name: string } | null>;
    /** Con Firestore Admin: anota en el cultivo cada riego automático. */
    recordWatering?: (userId: string, w: AutoWateringRecord) => Promise<void>;
  }) {
    this.store = o.store;
    this.now = o.now || Date.now;
    this.fetchImpl = o.fetchImpl;
    this.verifyCultivation = o.verifyCultivation || (async () => null);
    this.recordWatering = o.recordWatering || (async () => {});
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

  private client(userId: string, integ: DeviceIntegration): TuyaCloud {
    if (!integ.tuya) throw new DeviceError('Smart Life todavía no está conectado.', 409);
    const t = integ.tuya;
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

  private async spec(c: TuyaCloud, deviceId: string) {
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
    return {
      tuya: { connected: !!t, mock: !!t?.mock, region: t?.region || null, accessId: t && !t.mock ? maskId(t.accessId) : '' },
      regions: Object.fromEntries(Object.entries(TUYA_REGIONS).map(([k, r]) => [k, r.label])),
    };
  }

  async connectTuya(userId: string, input: { accessId?: string; accessSecret?: string; region?: string; mock?: boolean }) {
    const integ = await this.load(userId);
    if (integ.tuya) await this.releaseAll(integ);
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
    const integ = await this.store.get(userId);
    if (!integ) return;
    if (integ.tuya) await this.releaseAll(integ).catch(() => {});
    await this.store.remove(userId);
  }

  /** Saca lo de Cultiveta de todos los equipos y reactiva las programaciones de la persona. */
  private async releaseAll(integ: DeviceIntegration) {
    const c = this.client(integ.userId, integ);
    for (const deviceId of Object.keys(integ.schedules)) {
      try {
        await clearSchedule(c, deviceId, integ.schedules[deviceId], this.now());
      } catch {
        /* sigue con los demás */
      }
    }
    // una bomba no queda prendida al desconectar
    for (const b of integ.bindings.filter((x) => x.role === 'pump')) {
      await c.sendCommands(b.deviceId, [{ code: b.code, value: false }]).catch(() => {});
    }
    await this.reactivate(c, integ, integ.paused.slice());
    integ.bindings = [];
    integ.schedules = {};
    integ.paused = [];
  }

  private async reactivate(c: TuyaCloud, integ: DeviceIntegration, groups: DeviceIntegration['paused']) {
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
    const integ = await this.load(userId);
    const c = this.client(userId, integ);
    const list = await c.listDevices();
    const out = [];
    for (const d of list) {
      const spec = await this.spec(c, d.id);
      const sensors = sensorsOf(d.status, spec, d.category);
      integ.cache[d.id] = { name: d.name, online: !!d.online, status: Object.fromEntries((d.status || []).map((s: any) => [s.code, s.value])), sensors, power: powerOf(d.status), at: this.now() };
      out.push({
        id: d.id,
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
    return out;
  }

  async bind(
    userId: string,
    input: { deviceId: string; code: string; role: BindingRole; cultivationId: string; cultivationName?: string; schedule?: unknown; climateRole?: unknown; rule?: unknown; pump?: unknown }
  ) {
    const integ = await this.load(userId);
    const c = this.client(userId, integ);
    const role = input.role;
    if (!['light', 'pump', 'climate', 'sensor_th', 'sensor_soil'].includes(role)) throw new DeviceError('Función inválida para el equipo.');
    const isSwitch = MANAGED.includes(role);
    if (isSwitch && !SWITCH_CODE.test(input.code)) throw new DeviceError('Para eso hay que elegir un toma.');
    if (role === 'climate' && !isClimateRole(input.climateRole)) throw new DeviceError('Elegí qué equipo de clima es.');
    const owned = await this.verifyCultivation(userId, input.cultivationId);
    const cultivationName = owned?.name || String(input.cultivationName || 'Cultivo').slice(0, 60);
    const device = (await c.listDevices()).find((d) => d.id === input.deviceId);
    if (!device) throw new DeviceError('Ese equipo no está en tu cuenta de Smart Life.', 404);
    const code = isSwitch ? input.code : 'sensor';
    const channel = isSwitch ? channelsOf(device.status, await this.spec(c, device.id)).find((ch) => ch.code === code) : null;
    if (isSwitch && !channel) throw new DeviceError('Ese toma no existe en el equipo.');
    if (role === 'pump' && !channel!.countdownCode) throw new DeviceError('Este toma no tiene cuenta regresiva (no se apaga solo): sin ese seguro no se usa para regar.');

    const climateRole = role === 'climate' ? (input.climateRole as ClimateRole) : null;
    const rule = climateRole ? cleanRule(climateRole, input.rule) : null;
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
      role,
      schedule: role === 'light' || role === 'pump' ? validateSchedule(input.schedule) : null,
      climateRole,
      rule,
      pump,
      countdownCode: role === 'pump' ? channel!.countdownCode : null,
      countdownUnit: role === 'pump' ? channel!.countdownUnit : null,
      auto: null,
      lastReason: null,
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

  private async unbindInto(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding) {
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
    for (const x of changed) x.schedule = next;
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

  async command(userId: string, deviceId: string, code: string, value: boolean) {
    if (!SWITCH_CODE.test(code)) throw new DeviceError('Toma inválido.');
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.deviceId === deviceId && x.code === code && MANAGED.includes(x.role));
    if (b?.role === 'light' && b.schedule) throw new DeviceError(`Ese toma maneja la luz de ${b.cultivationName}: sigue su horario. Para prenderla o apagarla a mano, primero desasignala.`, 409);
    if (b?.role === 'pump') throw new DeviceError(`Ese toma es la bomba de riego de ${b.cultivationName}: se prende solo para regar (usá "Regar" en el cultivo).`, 409);
    if (b?.role === 'climate') throw new DeviceError(`Ese toma lo maneja su regla (${b.cultivationName}). Para manejarlo a mano, primero desasignalo.`, 409);
    const c = this.client(userId, integ);
    await c.sendCommands(deviceId, [{ code, value }]);
    const entry = integ.cache[deviceId];
    if (entry) entry.status[code] = value;
    await this.persist(integ);
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
  private async waterInto(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding, seconds: number, auto: boolean) {
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
  private async stepAuto(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding, t: number) {
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

  private async autoWater(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding, st: IrrigationState, due: { seconds: number; reason: string }) {
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
  private followers(integ: DeviceIntegration, cultivationId: string) {
    return integ.bindings.filter((x) => x.cultivationId === cultivationId && x.role === 'climate' && x.rule && x.rule.mode !== 'sensor');
  }
  private lightOnAt(integ: DeviceIntegration, cultivationId: string, t: number): boolean | null {
    const l = this.lightOf(integ, cultivationId);
    if (!l?.schedule) return null;
    const s = lightState({ lightHours: l.schedule.lightHours, darkHours: l.schedule.darkHours }, l.schedule.anchorMs, t);
    return s.started ? s.on : false;
  }

  /** Lo que tiene que estar haciendo un toma ahora (null = Cultiveta no lo decide en este momento). */
  private desiredFor(integ: DeviceIntegration, b: DeviceBinding, t: number): { value: boolean; reason: string } | null {
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

  private async syncDevice(c: TuyaCloud, integ: DeviceIntegration, deviceId: string, force = false) {
    const items: LightItem[] = [];
    for (const b of integ.bindings.filter((x) => x.deviceId === deviceId)) {
      if (b.role === 'light' && b.schedule) items.push({ code: b.code, ...b.schedule });
      if (b.role === 'climate' && b.rule && b.rule.mode !== 'sensor') {
        // lo que sigue a la luz también queda cargado en Smart Life (al revés: luz y oscuridad invertidas)
        const l = this.lightOf(integ, b.cultivationId)?.schedule;
        if (!l) continue;
        if (b.rule.mode === 'follow') items.push({ code: b.code, ...l });
        else if (l.darkHours > 0) items.push({ code: b.code, lightHours: l.darkHours, darkHours: l.lightHours, anchorMs: l.anchorMs + l.lightHours * HOUR_MS, timeZone: l.timeZone });
      }
    }
    const prev = integ.schedules[deviceId];
    try {
      integ.schedules[deviceId] = await syncSchedule(c, deviceId, items, prev, this.now(), force);
    } catch (e: any) {
      integ.schedules[deviceId] = { ...(prev || { mode: 'none', sig: 'none', until: null, span: 0, count: 0, codes: [], groups: [] }), at: this.now(), error: e?.message || 'Error' } as ScheduleState;
    }
  }

  /** Deja el toma como corresponde ahora mismo (si no, el primer cambio cargado puede tardar horas). */
  private async applyNow(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding) {
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
      await c.sendCommands(b.deviceId, [{ code: b.code, value: d.value }]);
      integ.lastCommand[b.id] = { at: this.now(), value: d.value };
      const entry = integ.cache[b.deviceId];
      if (entry) entry.status[b.code] = d.value;
    } catch (e: any) {
      integ.lastError = e?.message || 'No se pudo aplicar lo programado.';
    }
  }

  private async poll(c: TuyaCloud, integ: DeviceIntegration, deviceId: string, maxAge = POLL_MS) {
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
    if (!integ?.tuya) return { connected: false, mock: false, bindings: [] as any[] };
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
      out.push({
        ...b,
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
    return { connected: true, mock: !!integ.tuya.mock, bindings: out, lastError: integ.lastError };
  }

  // ---------- revisión periódica (Cloud Scheduler, cada 5 min) ----------

  /** Rellena lo cargado, aplica las reglas por sensor, corrige lo que quedó al revés y lee los sensores. */
  async tick(userId: string) {
    const integ = await this.store.get(userId);
    if (!integ?.tuya) return { devices: 0, fixes: 0, waterings: 0 };
    integ.watering = integ.watering || {};
    integ.irrigation = integ.irrigation || {};
    const c = this.client(userId, integ);
    const t = this.now();
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
        if (here.some((b) => b.role === 'light' || (b.role === 'climate' && b.rule?.mode !== 'sensor'))) await this.syncDevice(c, integ, deviceId);
        const fast = here.some((b) => b.role === 'pump' || (b.role === 'climate' && b.rule?.mode === 'sensor'));
        const entry = await this.poll(c, integ, deviceId, fast ? SENSOR_POLL_MS : SLOW_POLL_MS);
        if (!entry.online) continue;
        for (const b of here) {
          const d = this.desiredFor(integ, b, t);
          if (!d) continue;
          b.lastReason = d.reason;
          if (entry.status[b.code] === d.value) continue;
          const last = integ.lastCommand[b.id];
          if (last && last.value === d.value && t - last.at < GRACE_MS) continue;
          await c.sendCommands(deviceId, [{ code: b.code, value: d.value }]);
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
