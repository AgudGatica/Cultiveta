/**
 * Equipos inteligentes en el navegador: habla con /api/devices (el servidor guarda las claves de
 * Smart Life, eWeLink y Shelly y maneja los equipos) y guarda en memoria el estado de lo asignado a cada cultivo para
 * que la luz y el ambiente lo muestren.
 */
import { useSyncExternalStore } from 'react';
import { authFetch } from './apiClient';
import type { Cultivation } from '../types';
import { cycleFromLighting, cycleMs, isDailyCycle, lightAnchor } from '../utils/lightCycle';
import type { AutoIrrigation, ClimateRole, ClimateRule, PumpConfig } from '../utils/deviceRules';

export type DeviceRole = 'light' | 'pump' | 'climate' | 'sensor_th' | 'sensor_soil';
export type DeviceVendor = 'tuya' | 'ewelink' | 'shelly';

export interface DevicesStatus {
  tuya: { connected: boolean; mock: boolean; region: string | null; accessId: string };
  /** available: el servidor tiene la app de Cultiveta en dev.ewelink.cc (si no, solo el de prueba). */
  ewelink: { connected: boolean; mock: boolean; region: string | null; available: boolean };
  shelly: { connected: boolean; mock: boolean; server: string | null; ids: string[] };
  regions: Record<string, string>;
}

export interface LightScheduleSnapshot {
  lightHours: number;
  darkHours: number;
  anchorMs: number;
  timeZone: string;
}

export interface SensorReadings {
  temperature: number | null;
  humidity: number | null;
  soil: number | null;
  co2: number | null;
  battery: number | null;
}

export interface DeviceBindingState {
  id: string;
  deviceId: string;
  deviceName: string;
  code: string;
  label: string;
  cultivationId: string;
  cultivationName: string;
  role: DeviceRole;
  /** A qué está asignado: un cultivo o un indoor (cultivationId es el id de uno u otro). */
  targetKind?: 'cultivation' | 'indoor';
  vendor?: DeviceVendor;
  schedule?: LightScheduleSnapshot | null;
  climateRole?: ClimateRole | null;
  rule?: ClimateRule | null;
  pump?: PumpConfig | null;
  countdownCode?: string | null;
  /** Bomba: riego automático y lo último que hizo (o por qué no regó). */
  auto?: AutoIrrigation | null;
  irrigation?: { last: { at: number; seconds: number; liters: number; reason: string } | null; note: string | null } | null;
  /** Por qué está prendido o apagado (lo último que decidió el servidor). */
  lastReason?: string | null;
  watering?: { at: number; seconds: number; liters: number; endsAt: number; active: boolean; auto?: boolean } | null;
  online: boolean | null;
  on: boolean | null;
  sensors: SensorReadings | null;
  readAt: number | null;
  loaded: { mode: 'once' | 'daily' | 'loop' | 'server' | 'none'; until: number | null; daily: { on: string; off: string } | null; error: string | null } | null;
}

export interface DevicesOverview {
  connected: boolean;
  mock: boolean;
  bindings: DeviceBindingState[];
  lastError?: string | null;
}

export interface SmartDevice {
  id: string;
  vendor: DeviceVendor;
  name: string;
  product: string;
  category: string;
  online: boolean;
  channels: Array<{ code: string; label: string; on: boolean; hasCountdown: boolean; binding: DeviceBindingState | null }>;
  sensors: SensorReadings | null;
  sensorBindings: DeviceBindingState[];
  power: { watts: number } | null;
}

const EMPTY: DevicesOverview = { connected: false, mock: false, bindings: [] };
let current: DevicesOverview = EMPTY;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* sin cuerpo, o una página en vez de la API (un servidor sin estas rutas) */
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  if (data == null || typeof data !== 'object') throw new Error('El servidor de Cultiveta no tiene todavía la parte de equipos.');
  return data as T;
}

/** Lo que el servidor necesita del horario de la luz: horas y un encendido calculado con la hora local. */
export function scheduleSnapshot(cultivation: Pick<Cultivation, 'lighting'>, nowMs = Date.now()): LightScheduleSnapshot | null {
  const cycle = cycleFromLighting(cultivation.lighting);
  const daily = isDailyCycle(cycle);
  const date = daily ? '' : cultivation.lighting?.lightsOnDate || '';
  if (!daily && !date) return null;
  const anchorMs = lightAnchor({ lightsOnTime: cultivation.lighting?.lightsOnTime, lightsOnDate: date }, nowMs);
  if (anchorMs == null) return null;
  return { lightHours: cycle.lightHours, darkHours: cycle.darkHours, anchorMs, timeZone: localTimeZone() };
}
/** Zona horaria del navegador (con la que se cargan los horarios y el riego automático). */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';
  } catch {
    return 'America/Argentina/Buenos_Aires';
  }
}

/** ¿Es el mismo horario? (el encendido puede venir de otro día del mismo ciclo). */
export function sameSchedule(a?: LightScheduleSnapshot | null, b?: LightScheduleSnapshot | null): boolean {
  if (!a || !b) return !a && !b;
  const total = cycleMs(a).totalMs;
  return a.lightHours === b.lightHours && a.darkHours === b.darkHours && a.timeZone === b.timeZone && total > 0 && ((a.anchorMs - b.anchorMs) % total + total) % total === 0;
}

export const lightBindingFor = (o: DevicesOverview, cultivationId: string) => o.bindings.find((b) => b.cultivationId === cultivationId && b.role === 'light') || null;
export const pumpBindingFor = (o: DevicesOverview, cultivationId: string) => o.bindings.find((b) => b.cultivationId === cultivationId && b.role === 'pump') || null;
export const climateBindingsFor = (o: DevicesOverview, cultivationId: string) => o.bindings.filter((b) => b.cultivationId === cultivationId && b.role === 'climate');
export const sensorBindingFor = (o: DevicesOverview, cultivationId: string, role: 'sensor_th' | 'sensor_soil') =>
  o.bindings.find((b) => b.cultivationId === cultivationId && b.role === role) || null;

export const devicesService = {
  getOverview: () => current,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async refreshOverview(): Promise<DevicesOverview> {
    try {
      const next = await api<DevicesOverview>('GET', '/api/devices/overview');
      if (Array.isArray(next?.bindings)) current = next;
    } catch {
      /* sin servidor o sin sesión: queda lo último que se leyó */
    }
    notify();
    return current;
  },
  reset() {
    current = EMPTY;
    notify();
  },
  status: () => api<DevicesStatus>('GET', '/api/devices/status'),
  async connectTuya(body: { accessId?: string; accessSecret?: string; region?: string; mock?: boolean }) {
    const r = await api<{ devices: number; warning: string | null }>('POST', '/api/devices/tuya/connect', body);
    await devicesService.refreshOverview();
    return r;
  },
  async disconnectTuya() {
    await api('DELETE', '/api/devices/tuya');
    await devicesService.refreshOverview();
  },
  /** Página de inicio de sesión de eWeLink (vuelve a /equipos con el código). */
  ewelinkLoginUrl: () => api<{ url: string }>('GET', '/api/devices/ewelink/login').then((r) => r.url),
  async connectEwelink(body: { code?: string; region?: string; state?: string; mock?: boolean }) {
    const r = await api<{ devices: number; warning: string | null }>('POST', '/api/devices/ewelink/connect', body);
    await devicesService.refreshOverview();
    return r;
  },
  async disconnectEwelink() {
    await api('DELETE', '/api/devices/ewelink');
    await devicesService.refreshOverview();
  },
  async connectShelly(body: { server?: string; authKey?: string; ids?: string; mock?: boolean }) {
    const r = await api<{ devices: number; warning: string | null }>('POST', '/api/devices/shelly/connect', body);
    await devicesService.refreshOverview();
    return r;
  },
  async disconnectShelly() {
    await api('DELETE', '/api/devices/shelly');
    await devicesService.refreshOverview();
  },
  listDevices: () => api<{ devices: SmartDevice[] }>('GET', '/api/devices').then((r) => r.devices),
  /** Los equipos y, si una marca falló, su error (las otras se ven igual). */
  listDevicesWithErrors: () => api<{ devices: SmartDevice[]; errors?: Partial<Record<DeviceVendor, string>> }>('GET', '/api/devices').then((r) => ({ devices: r.devices || [], errors: r.errors || {} })),
  async bind(body: { deviceId: string; code: string; role: DeviceRole; cultivationId: string; cultivationName: string; targetKind?: 'cultivation' | 'indoor'; schedule?: LightScheduleSnapshot | null; climateRole?: ClimateRole; rule?: ClimateRule; pump?: PumpConfig }) {
    await api('POST', '/api/devices/bindings', body);
    await devicesService.refreshOverview();
  },
  async unbind(id: string) {
    await api('DELETE', `/api/devices/bindings/${encodeURIComponent(id)}`);
    await devicesService.refreshOverview();
  },
  async setRule(bindingId: string, rule: ClimateRule) {
    await api('POST', `/api/devices/bindings/${encodeURIComponent(bindingId)}/rule`, { rule });
    await devicesService.refreshOverview();
  },
  async setPump(bindingId: string, pump: PumpConfig) {
    await api('POST', `/api/devices/bindings/${encodeURIComponent(bindingId)}/pump`, { pump });
    await devicesService.refreshOverview();
  },
  async setAuto(bindingId: string, auto: AutoIrrigation) {
    await api('POST', `/api/devices/bindings/${encodeURIComponent(bindingId)}/auto`, { auto });
    await devicesService.refreshOverview();
  },
  /** Riega N segundos con la bomba (se apaga sola). */
  async water(bindingId: string, seconds: number) {
    const r = await api<{ seconds: number; liters: number; endsAt: number; cultivationId: string }>('POST', `/api/devices/bindings/${encodeURIComponent(bindingId)}/water`, { seconds });
    await devicesService.refreshOverview();
    return r;
  },
  async stopWater(bindingId: string) {
    await api('POST', `/api/devices/bindings/${encodeURIComponent(bindingId)}/water/stop`, {});
    await devicesService.refreshOverview();
  },
  command: (deviceId: string, code: string, value: boolean) => api('POST', `/api/devices/${encodeURIComponent(deviceId)}/command`, { code, value }),
  pushSchedule: (cultivationId: string, schedule: LightScheduleSnapshot | null) => api<{ changed: boolean }>('POST', '/api/devices/schedule', { cultivationId, schedule }),
};

/** Estado de los equipos asignados, para cualquier componente (se actualiza solo). */
export function useDevicesOverview(): DevicesOverview {
  return useSyncExternalStore(devicesService.subscribe, devicesService.getOverview, devicesService.getOverview);
}

/**
 * La vuelta del inicio de sesión de eWeLink (/equipos?code=…&region=…&state=…). Se lee una sola vez al
 * cargar la app, antes de que el ruteo pueda cambiar la dirección, y se borra de la barra.
 */
let ewelinkReturn: { code: string; region: string; state: string } | null = null;
try {
  if (typeof window !== 'undefined' && /^\/equipos\/?$/.test(window.location.pathname)) {
    const q = new URLSearchParams(window.location.search);
    if (q.get('code') && q.get('state')) {
      ewelinkReturn = { code: q.get('code')!, region: q.get('region') || 'us', state: q.get('state')! };
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }
} catch {
  /* sin ventana */
}
/** Se entrega una vez (a la pantalla Equipos, que termina de conectar). */
export function takeEwelinkReturn() {
  const r = ewelinkReturn;
  ewelinkReturn = null;
  return r;
}
