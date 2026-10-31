/**
 * Equipos inteligentes de cada persona (traído de Órbita, etapa 2: Smart Life real).
 *
 * - La cuenta de Smart Life (Access ID + Access Secret del proyecto de iot.tuya.com) queda guardada
 *   solo del lado del servidor: la colección "deviceIntegrations" no la puede leer el navegador.
 * - Cada toma o sensor se asigna a un cultivo: la luz (sigue el horario del cultivo), un sensor de
 *   ambiente o una sonda de sustrato. Las demás tomas se manejan a mano desde Equipos.
 * - Al asignar la luz, se pausan las programaciones de la app Smart Life de ese toma (se reactivan al
 *   desasignarla o al desconectar) y el horario queda cargado en Smart Life: sigue aunque el servidor
 *   no corra. La revisión periódica (Cloud Scheduler) rellena lo cargado, corrige la luz si quedó al
 *   revés y lee los sensores.
 */
import crypto from 'crypto';
import { TuyaCloud, TuyaError, TUYA_REGIONS, channelsOf, maskId, powerOf, sensorsOf, type SensorReadings } from './tuyaClient';
import { createMockTuya, MOCK_TUYA_ID, MOCK_TUYA_SECRET, type MockTuya } from './tuyaMock';
import { clearSchedule, syncSchedule, SCHEDULE_CATEGORY, type LightItem, type ScheduleState } from './lightSchedule';
import { isValidTimeZone } from './tz';
import { lightState } from '../../utils/lightCycle';

export type BindingRole = 'light' | 'sensor_th' | 'sensor_soil';

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
  schedule?: LightScheduleSnapshot | null;
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
  lastError: string | null;
  updatedAt: number;
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

const POLL_MS = 60_000;          // estado de un equipo: como mucho una lectura por minuto
const GRACE_MS = 60_000;         // después de una orden, se espera antes de "corregir"
const SWITCH_CODE = /^switch(_\d+|_usb\d*)?$/;

function blank(userId: string, now: number): DeviceIntegration {
  return { userId, tuya: null, bindings: [], paused: [], schedules: {}, cache: {}, lastCommand: {}, lastError: null, updatedAt: now };
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

export class DeviceService {
  private store: DeviceStore;
  private now: () => number;
  private fetchImpl?: (url: string, init?: any) => Promise<any>;
  private clients = new Map<string, TuyaCloud>();
  private mocks = new Map<string, MockTuya>();
  private specs = new Map<string, any>();
  private verifyCultivation: (userId: string, cultivationId: string) => Promise<{ name: string } | null>;

  constructor(o: {
    store: DeviceStore;
    now?: () => number;
    fetchImpl?: (url: string, init?: any) => Promise<any>;
    /** Con Firestore Admin: confirma que el cultivo es de esa persona y devuelve su nombre. */
    verifyCultivation?: (userId: string, cultivationId: string) => Promise<{ name: string } | null>;
  }) {
    this.store = o.store;
    this.now = o.now || Date.now;
    this.fetchImpl = o.fetchImpl;
    this.verifyCultivation = o.verifyCultivation || (async () => null);
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
    return (await this.store.get(userId)) || blank(userId, this.now());
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
        channels: channelsOf(d.status, spec).map((ch) => ({ ...ch, binding: integ.bindings.find((b) => b.deviceId === d.id && b.code === ch.code) || null })),
        sensors,
        sensorBindings: integ.bindings.filter((b) => b.deviceId === d.id && b.code === 'sensor'),
        power: powerOf(d.status),
      });
    }
    await this.persist(integ);
    return out;
  }

  async bind(userId: string, input: { deviceId: string; code: string; role: BindingRole; cultivationId: string; cultivationName?: string; schedule?: unknown }) {
    const integ = await this.load(userId);
    const c = this.client(userId, integ);
    const role = input.role;
    if (!['light', 'sensor_th', 'sensor_soil'].includes(role)) throw new DeviceError('Función inválida para el equipo.');
    if (role === 'light' && !SWITCH_CODE.test(input.code)) throw new DeviceError('Para la luz hay que elegir un toma.');
    const owned = await this.verifyCultivation(userId, input.cultivationId);
    const cultivationName = owned?.name || String(input.cultivationName || 'Cultivo').slice(0, 60);
    const device = (await c.listDevices()).find((d) => d.id === input.deviceId);
    if (!device) throw new DeviceError('Ese equipo no está en tu cuenta de Smart Life.', 404);
    const code = role === 'light' ? input.code : 'sensor';
    const label = role === 'light' ? (channelsOf(device.status, await this.spec(c, device.id)).find((ch) => ch.code === code)?.label || code) : 'Sensor';

    // una luz por cultivo y un sensor de cada tipo por cultivo; un toma o sensor, en un solo lugar
    const replaced = integ.bindings.filter(
      (b) => (b.deviceId === input.deviceId && b.code === code) || (b.cultivationId === input.cultivationId && b.role === role)
    );
    for (const b of replaced) await this.unbindInto(c, integ, b);

    const binding: DeviceBinding = {
      id: crypto.randomUUID(),
      deviceId: device.id,
      deviceName: device.name,
      code,
      label,
      cultivationId: input.cultivationId,
      cultivationName,
      role,
      schedule: role === 'light' ? validateSchedule(input.schedule) : null,
    };
    integ.bindings.push(binding);

    if (role === 'light') {
      // la luz la maneja Cultiveta: se pausan las programaciones de la persona en ese toma
      const timers = await c.getTimers(device.id);
      const owned2 = new Set((integ.schedules[device.id]?.groups || []).map((g) => g.groupId));
      const mine = [...new Map(timers.filter((t) => t.category !== SCHEDULE_CATEGORY && !owned2.has(t.groupId) && t.active && t.functions.some((f) => f.code === code)).map((t) => [t.groupId, t])).values()];
      for (const t of mine) {
        await c.setTimerGroupStatus(device.id, t.category, t.groupId, '0');
        integ.paused.push({ deviceId: device.id, category: t.category, groupId: t.groupId, code });
      }
      await this.syncDevice(c, integ, device.id, true);
      await this.applyNow(c, integ, binding);
    }
    await this.persist(integ);
    return binding;
  }

  private async unbindInto(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding) {
    integ.bindings = integ.bindings.filter((x) => x.id !== b.id);
    if (b.role !== 'light') return;
    await this.syncDevice(c, integ, b.deviceId, true);
    await this.reactivate(c, integ, integ.paused.filter((p) => p.deviceId === b.deviceId && p.code === b.code));
  }

  async unbind(userId: string, bindingId: string) {
    const integ = await this.load(userId);
    const b = integ.bindings.find((x) => x.id === bindingId);
    if (!b) throw new DeviceError('Esa asignación ya no existe.', 404);
    await this.unbindInto(this.client(userId, integ), integ, b);
    await this.persist(integ);
  }

  /** El horario del cultivo cambió (hora de encendido o fotoperiodo): se vuelve a cargar en Smart Life. */
  async setSchedule(userId: string, cultivationId: string, schedule: unknown) {
    const integ = await this.store.get(userId);
    const b = integ?.bindings.find((x) => x.cultivationId === cultivationId && x.role === 'light');
    if (!integ || !b) return { changed: false };
    const next = schedule == null ? null : validateSchedule(schedule);
    if (JSON.stringify(next) === JSON.stringify(b.schedule ?? null)) return { changed: false };
    b.schedule = next;
    const c = this.client(userId, integ);
    await this.syncDevice(c, integ, b.deviceId, true);
    await this.applyNow(c, integ, b);
    await this.persist(integ);
    return { changed: true };
  }

  async command(userId: string, deviceId: string, code: string, value: boolean) {
    if (!SWITCH_CODE.test(code)) throw new DeviceError('Toma inválido.');
    const integ = await this.load(userId);
    const light = integ.bindings.find((b) => b.deviceId === deviceId && b.code === code && b.role === 'light');
    if (light && light.schedule) throw new DeviceError(`Ese toma maneja la luz de ${light.cultivationName}: sigue su horario. Para prenderla o apagarla a mano, primero desasignala.`, 409);
    const c = this.client(userId, integ);
    await c.sendCommands(deviceId, [{ code, value }]);
    const entry = integ.cache[deviceId];
    if (entry) entry.status[code] = value;
    await this.persist(integ);
  }

  private async syncDevice(c: TuyaCloud, integ: DeviceIntegration, deviceId: string, force = false) {
    const items: LightItem[] = integ.bindings
      .filter((b) => b.deviceId === deviceId && b.role === 'light' && b.schedule)
      .map((b) => ({ code: b.code, ...(b.schedule as LightScheduleSnapshot) }));
    const prev = integ.schedules[deviceId];
    try {
      integ.schedules[deviceId] = await syncSchedule(c, deviceId, items, prev, this.now(), force);
    } catch (e: any) {
      integ.schedules[deviceId] = { ...(prev || { mode: 'none', sig: 'none', until: null, span: 0, count: 0, codes: [], groups: [] }), at: this.now(), error: e?.message || 'Error' } as ScheduleState;
    }
  }

  /** Deja la luz como corresponde ahora mismo (si no, el primer cambio cargado puede tardar horas). */
  private async applyNow(c: TuyaCloud, integ: DeviceIntegration, b: DeviceBinding) {
    if (!b.schedule) return;
    const s = lightState({ lightHours: b.schedule.lightHours, darkHours: b.schedule.darkHours }, b.schedule.anchorMs, this.now());
    const desired = s.started ? s.on : false;
    try {
      await c.sendCommands(b.deviceId, [{ code: b.code, value: desired }]);
      integ.lastCommand[b.id] = { at: this.now(), value: desired };
      const entry = integ.cache[b.deviceId];
      if (entry) entry.status[b.code] = desired;
    } catch (e: any) {
      integ.lastError = e?.message || 'No se pudo aplicar el horario.';
    }
  }

  private async poll(c: TuyaCloud, integ: DeviceIntegration, deviceId: string, force = false) {
    const prev = integ.cache[deviceId];
    if (!force && prev && this.now() - prev.at < POLL_MS) return prev;
    const d = await c.getDevice(deviceId);
    const spec = await this.spec(c, deviceId);
    const entry: CacheEntry = {
      name: d.name,
      online: !!d.online,
      status: Object.fromEntries((d.status || []).map((s: any) => [s.code, s.value])),
      sensors: sensorsOf(d.status, spec, d.category),
      power: powerOf(d.status),
      at: d.update_time ? Math.min(this.now(), d.update_time * 1000) : this.now(),
    };
    integ.cache[deviceId] = entry;
    return entry;
  }

  // ---------- lo que ve el cultivo ----------

  /** Estado de los equipos asignados (lo que muestran la luz y el ambiente de cada cultivo). */
  async overview(userId: string) {
    const integ = await this.store.get(userId);
    if (!integ?.tuya) return { connected: false, mock: false, bindings: [] as any[] };
    const c = this.client(userId, integ);
    const out = [];
    for (const b of integ.bindings) {
      let entry: CacheEntry | null = null;
      try {
        entry = await this.poll(c, integ, b.deviceId);
      } catch {
        entry = integ.cache[b.deviceId] || null;
      }
      const sched = integ.schedules[b.deviceId];
      out.push({
        ...b,
        online: entry?.online ?? null,
        on: b.role === 'light' && entry ? entry.status[b.code] === true : null,
        sensors: b.role !== 'light' ? entry?.sensors ?? null : null,
        readAt: entry?.at ?? null,
        loaded: b.role === 'light' && sched ? { mode: sched.mode, until: sched.until, daily: sched.daily?.find((p) => p.code === b.code) || null, error: sched.error } : null,
      });
    }
    await this.persist(integ);
    return { connected: true, mock: !!integ.tuya.mock, bindings: out, lastError: integ.lastError };
  }

  // ---------- revisión periódica (Cloud Scheduler) ----------

  /** Rellena lo cargado, corrige la luz si quedó al revés y lee los sensores asignados. */
  async tick(userId: string) {
    const integ = await this.store.get(userId);
    if (!integ?.tuya) return { devices: 0, fixes: 0 };
    const c = this.client(userId, integ);
    const t = this.now();
    let fixes = 0;
    const deviceIds = [...new Set(integ.bindings.map((b) => b.deviceId))];
    for (const deviceId of deviceIds) {
      try {
        if (integ.bindings.some((b) => b.deviceId === deviceId && b.role === 'light')) await this.syncDevice(c, integ, deviceId);
        const entry = await this.poll(c, integ, deviceId, true);
        for (const b of integ.bindings.filter((x) => x.deviceId === deviceId && x.role === 'light' && x.schedule)) {
          if (!entry.online) continue;
          const s = lightState({ lightHours: b.schedule!.lightHours, darkHours: b.schedule!.darkHours }, b.schedule!.anchorMs, t);
          const desired = s.started ? s.on : false;
          if (entry.status[b.code] === desired) continue;
          const last = integ.lastCommand[b.id];
          if (last && last.value === desired && t - last.at < GRACE_MS) continue;
          await c.sendCommands(deviceId, [{ code: b.code, value: desired }]);
          integ.lastCommand[b.id] = { at: t, value: desired };
          entry.status[b.code] = desired;
          fixes++;
        }
        integ.lastError = null;
      } catch (e: any) {
        integ.lastError = e instanceof TuyaError || e instanceof Error ? e.message : String(e);
      }
    }
    await this.persist(integ);
    return { devices: deviceIds.length, fixes };
  }

  async tickAll() {
    const ids = await this.store.listUserIds();
    let fixes = 0;
    for (const id of ids) {
      try {
        fixes += (await this.tick(id)).fixes;
      } catch {
        /* sigue con las demás cuentas */
      }
    }
    return { accounts: ids.length, fixes };
  }
}
