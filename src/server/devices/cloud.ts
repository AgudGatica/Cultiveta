/**
 * Un solo "cliente" para los equipos de todas las marcas (traído de Órbita): reparte cada pedido según el
 * id del equipo. Los de eWeLink empiezan con "ewelink-", los de Shelly con "shelly-" y el resto es de
 * Smart Life / Tuya. Las tres marcas hablan "como" Tuya (tomas "switch_N", cuenta regresiva
 * "countdown_N", sensores "va_temperature"…), así el servicio de equipos, las reglas y el riego no
 * saben de marcas. Lo que cambia es cómo se guarda el horario de la luz en el equipo:
 *   · Smart Life: programaciones en su nube (diaria o la semana de un superciclo);
 *   · eWeLink: un bucle por toma guardado en el equipo (no vence);
 *   · Shelly: su nube no deja guardar horarios, así que la revisión deja programado cada cambio en el
 *     equipo ("se da vuelta solo a los N segundos").
 */
import type { TuyaTimer } from './tuyaClient';

export type Vendor = 'tuya' | 'ewelink' | 'shelly';
export type ScheduleKind = 'timers' | 'loops' | 'toggle';

export const VENDOR_APP: Record<Vendor, string> = { tuya: 'Smart Life', ewelink: 'eWeLink', shelly: 'Shelly' };

export const vendorOf = (id: string): Vendor => (/^ewelink-/.test(String(id)) ? 'ewelink' : /^shelly-/.test(String(id)) ? 'shelly' : 'tuya');

/** Un bucle de eWeLink: desde `start`, cada `periodMin` hace la orden de inicio y a los `runMin` la contraria. */
export interface LoopPlan {
  code: string;
  start: number;
  periodMin: number;
  runMin: number;
  startOn: boolean;
}

export interface DeviceCloud {
  calls: number;
  listDevices(): Promise<any[]>;
  getDevice(id: string): Promise<any>;
  getSpecification(id: string): Promise<any>;
  sendCommands(id: string, commands: Array<{ code: string; value: unknown }>): Promise<unknown>;
  getTimers(id: string): Promise<TuyaTimer[]>;
  addTimers(id: string, body: unknown): Promise<any>;
  deleteTimerGroup(id: string, category: string, groupId: string): Promise<unknown>;
  deleteTimerCategory(id: string, category: string): Promise<unknown>;
  setTimerGroupStatus(id: string, category: string, groupId: string, value: '0' | '1'): Promise<unknown>;
  /** eWeLink: el horario como bucles guardados en el equipo. */
  setLoops?(id: string, plans: LoopPlan[]): Promise<void>;
  loopsPresent?(id: string): Promise<boolean>;
}

const MISSING: Record<Vendor, string> = {
  tuya: 'Smart Life no está conectado.',
  ewelink: 'eWeLink no está conectado.',
  shelly: 'Shelly no está conectado.',
};

export class DeviceRouter implements DeviceCloud {
  /** Error de cada marca en la última lista (si una falla, las otras se siguen viendo). */
  lastErrors: Partial<Record<Vendor, string>> = {};
  constructor(private clients: Partial<Record<Vendor, DeviceCloud>>) {}

  get calls() {
    return Object.values(this.clients).reduce((n, c) => n + (c?.calls || 0), 0);
  }
  has(v: Vendor) {
    return !!this.clients[v];
  }
  scheduleKind(id: string): ScheduleKind {
    const v = vendorOf(id);
    return v === 'ewelink' ? 'loops' : v === 'shelly' ? 'toggle' : 'timers';
  }
  private pick(id: string): DeviceCloud {
    const v = vendorOf(id);
    const c = this.clients[v];
    if (!c) throw Object.assign(new Error(MISSING[v]), { status: 409 });
    return c;
  }

  async listDevices() {
    const jobs = (Object.entries(this.clients) as Array<[Vendor, DeviceCloud | undefined]>).filter(([, c]) => !!c) as Array<[Vendor, DeviceCloud]>;
    const res = await Promise.allSettled(jobs.map(([, c]) => c.listDevices()));
    const out: any[] = [];
    this.lastErrors = {};
    res.forEach((r, i) => {
      if (r.status === 'fulfilled') out.push(...r.value);
      else this.lastErrors[jobs[i][0]] = r.reason?.message || 'Error';
    });
    const failed = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed && Object.keys(this.lastErrors).length === jobs.length) throw failed.reason; // fallaron todas
    return out;
  }
  async getDevice(id: string) {
    return this.pick(id).getDevice(id);
  }
  async getSpecification(id: string) {
    return this.pick(id).getSpecification(id);
  }
  async sendCommands(id: string, commands: Array<{ code: string; value: unknown }>) {
    return this.pick(id).sendCommands(id, commands);
  }
  async getTimers(id: string) {
    return this.pick(id).getTimers(id);
  }
  async addTimers(id: string, body: unknown) {
    return this.pick(id).addTimers(id, body);
  }
  async deleteTimerGroup(id: string, category: string, groupId: string) {
    return this.pick(id).deleteTimerGroup(id, category, groupId);
  }
  async deleteTimerCategory(id: string, category: string) {
    return this.pick(id).deleteTimerCategory(id, category);
  }
  async setTimerGroupStatus(id: string, category: string, groupId: string, value: '0' | '1') {
    return this.pick(id).setTimerGroupStatus(id, category, groupId, value);
  }
  async setLoops(id: string, plans: LoopPlan[]) {
    const c = this.pick(id);
    if (!c.setLoops) throw new Error('Este equipo no guarda bucles.');
    return c.setLoops(id, plans);
  }
  async loopsPresent(id: string) {
    const c = this.pick(id);
    return c.loopsPresent ? c.loopsPresent(id) : true;
  }
}
