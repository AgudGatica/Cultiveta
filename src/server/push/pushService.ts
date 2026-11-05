/**
 * Avisos al celular (Web Push estándar, con claves VAPID; sin Firebase Messaging).
 *
 * Un documento por persona en pushDevices/{uid} (solo lo toca el servidor; las reglas no abren esa colección):
 * sus celulares anotados, qué avisos quiere y lo ya enviado (para no repetir).
 *
 * Avisos:
 * - resumen del día (riego, tanque y calendario): uno por día a la hora elegida, solo si hay algo para hacer;
 * - clima: con las alertas del control de cada hora, todas las plantas en un solo aviso, como mucho uno por hora
 *   y sin repetir en el día una condición ya avisada;
 * - equipos: al momento si algo falla (el mismo error, como mucho cada 6 h) y cuando el riego automático riega;
 * - comunidad: me gusta (uno por publicación por hora), comentarios y seguidores.
 * Comunidad y riego automático no suenan de 23 a 8 (los de la Comunidad quedan igual en la campana).
 *
 * En iPhone el push solo funciona con la app agregada a la pantalla de inicio (iOS 16.4+): eso lo resuelve la app.
 *
 * Seguridad: la regla general de Firestore deja que cada persona cree documentos con su userId en cualquier colección,
 * así que un documento de pushDevices cuyo userId no es el de su id se ignora (si no, alguien podría anotar su
 * celular en la cuenta de otro). Y solo se manda a los servicios de push de verdad (Google, Apple, Mozilla, Microsoft).
 */
import crypto from 'crypto';
import type { Cultivation, CultivationTask, EnvironmentRecord, Watering } from '../../types';
import { buildDailyTasks } from '../../utils/dailyTasks';
import { zonedDateKey, zonedParts } from '../devices/tz';
import type { Firestore } from 'firebase-admin/firestore';

export type PushCategory = 'resumen' | 'clima' | 'equipos' | 'comunidad';

export interface PushSettings {
  resumen: boolean;
  /** Hora del resumen del día (0–23, en la zona de la app). */
  summaryHour: number;
  clima: boolean;
  equipos: boolean;
  comunidad: boolean;
}

export const DEFAULT_PUSH_SETTINGS: PushSettings = { resumen: true, summaryHour: 9, clima: true, equipos: true, comunidad: true };

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** "Android" / "iPhone" / "Computadora" (para mostrar cuántos celulares hay). */
  device: string;
  createdAt: string;
}

export interface PushDoc {
  userId: string;
  subscriptions: StoredSubscription[];
  settings: PushSettings;
  sent: {
    /** Último día (YYYYMMDD) en que se revisó el resumen. */
    summary?: string;
    /** Último aviso de me gusta por publicación (ms). */
    likes?: Record<string, number>;
    /** Último error de equipos avisado. */
    problem?: { text: string; at: number };
    /** Último aviso de clima (ms): como mucho uno por hora para toda la cuenta, sumando todos los cultivos. */
    climateAt?: number;
    /** Día (YYYYMMDD) de climateConds. */
    climateDay?: string;
    /** Condiciones ya avisadas hoy ("hum-alta", "temp-baja"…): la misma no vuelve a sonar en el día. */
    climateConds?: string[];
    /** (Versiones anteriores: último aviso por cultivo. Ya no se usa.) */
    climate?: Record<string, number>;
  };
  updatedAt: string;
}

/** Lo que recibe el service worker (public/sw.js). url: a dónde lleva tocar el aviso. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushStore {
  get(uid: string): Promise<PushDoc | null>;
  set(uid: string, doc: PushDoc): Promise<void>;
  /** Personas con al menos un celular anotado. */
  listUserIds(): Promise<string[]>;
}

/**
 * Envía un push a un celular. Si el celular lo dio de baja, tira un error con statusCode 404 o 410.
 * topic: si el celular está sin conexión, el servicio de push guarda solo el último aviso con ese tema
 * (al volver la conexión llega uno, no todos los que se juntaron).
 */
export interface PushSender {
  send(sub: StoredSubscription, payload: string, opts: { ttlSeconds: number; urgency: 'normal' | 'high'; topic?: string }): Promise<void>;
}

/** Una alerta de clima de un cultivo, para el aviso al celular. conditions: "hum-alta", "temp-baja"… */
export interface ClimateAlertInput {
  title: string;
  description: string;
  cultivationId: string;
  cultivationName?: string;
  conditions?: string[];
}

/** Lo que hace falta para el resumen del día de una persona. */
export interface DayData {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
}

export class PushError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_SUBSCRIPTIONS = 5;
const LIKE_EVERY_MS = 60 * 60_000;
const CLIMATE_EVERY_MS = 60 * 60_000;
/** Una alerta de clima que no llegó en 2 horas (celular apagado o sin señal) ya no se manda. */
const CLIMATE_TTL_SECONDS = 2 * 3600;
const DEFAULT_TTL_SECONDS = 6 * 3600;
const PROBLEM_EVERY_MS = 6 * 60 * 60_000;
/** Si a la hora justa no corrió el control (o falló), el resumen sale en las 2 horas siguientes. */
const SUMMARY_WINDOW_HOURS = 3;
const QUIET_FROM = 23;
const QUIET_TO = 8;
const SUMMARY_ITEMS = 3;

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
/** Los servicios de push de los navegadores (Chrome/Android, Safari/iPhone, Firefox, Edge). */
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export const isPushEndpoint = (endpoint: string): boolean => {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && endpoint.length <= 1000;
  } catch {
    return false;
  }
};

/**
 * Las claves VAPID salen de un secreto que el servidor ya tiene (siempre las mismas, en cualquier instancia y
 * después de reiniciar; no se guardan en ningún lado). Si ese secreto cambia, cada celular tiene que volver a
 * activar los avisos.
 */
export function vapidKeysFromSecret(secret: string): { publicKey: string; privateKey: string } {
  const priv = crypto.createHmac('sha256', secret).update('cultiveta-vapid-v1').digest();
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(priv);
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') };
}

export class MemoryPushStore implements PushStore {
  docs = new Map<string, PushDoc>();
  async get(uid: string) {
    const d = this.docs.get(uid);
    return d ? (JSON.parse(JSON.stringify(d)) as PushDoc) : null;
  }
  async set(uid: string, doc: PushDoc) {
    this.docs.set(uid, JSON.parse(JSON.stringify(doc)));
  }
  async listUserIds() {
    return [...this.docs.entries()].filter(([id, d]) => d.userId === id && d.subscriptions.length).map(([id]) => id);
  }
}

export class FirestorePushStore implements PushStore {
  constructor(private db: Firestore) {}
  async get(uid: string) {
    const snap = await this.db.collection('pushDevices').doc(uid).get();
    return snap.exists ? (snap.data() as PushDoc) : null;
  }
  async set(uid: string, doc: PushDoc) {
    await this.db.collection('pushDevices').doc(uid).set(doc);
  }
  async listUserIds() {
    const snap = await this.db.collection('pushDevices').get();
    return snap.docs.filter((d) => d.data().userId === d.id && (d.data().subscriptions || []).length).map((d) => d.id);
  }
}

/** Qué dice cada tarea en el resumen ("regá Gelato (atrasado)"). */
function taskPhrase(t: CultivationTask): string {
  const name = t.cultivationName;
  if (t.id.startsWith('tank_')) return `revisá el tanque de ${name}`;
  if (t.id.startsWith('solution_')) return `cambiá la solución de ${name}`;
  if (t.type === 'watering') return t.urgency === 'overdue' ? `regá ${name} (atrasado)` : `regá ${name}`;
  if (t.type === 'flush') return `lavado de raíces de ${name}`;
  if (t.type === 'defoliation') return `poda y defoliación de ${name}`;
  if (t.type === 'harvest') return `mirá los tricomas de ${name}`;
  if (t.type === 'stage_change') return `revisá el paso a 12/12 de ${name}`;
  return `${t.title.charAt(0).toLowerCase()}${t.title.slice(1)} (${name})`;
}

/** El aviso del resumen del día (null si no hay nada para hacer hoy). */
export function summaryMessage(tasks: CultivationTask[]): PushMessage | null {
  const due = tasks.filter((t) => !t.isCompleted && (t.urgency === 'overdue' || t.urgency === 'today') && t.type !== 'env_alert');
  if (!due.length) return null;
  const phrases = due.slice(0, SUMMARY_ITEMS).map(taskPhrase);
  const rest = due.length - phrases.length;
  const body = phrases.join(' · ') + (rest > 0 ? ` y ${rest} más` : '');
  const crops = new Set(due.map((t) => t.cultivationId));
  return {
    title: `Hoy en Cultiveta: ${due.length === 1 ? '1 cosa' : `${due.length} cosas`}`,
    body: body.charAt(0).toUpperCase() + body.slice(1),
    url: crops.size === 1 ? `/cultivos/${encodeURIComponent(due[0].cultivationId)}` : '/',
    tag: 'resumen',
  };
}

/**
 * Un solo aviso de clima para todos los cultivos que tuvieron alerta en el mismo control (si hay varias plantas
 * en el mismo lugar, el clima es el mismo para todas).
 */
export function climateMessage(alerts: ClimateAlertInput[]): PushMessage {
  const byCrop = new Map<string, ClimateAlertInput>();
  for (const a of alerts) if (!byCrop.has(a.cultivationId)) byCrop.set(a.cultivationId, a);
  const crops = [...byCrop.values()];
  const first = crops[0];
  if (crops.length === 1) {
    return {
      title: first.title,
      body: first.cultivationName ? `${first.cultivationName}: ${first.description}` : first.description,
      url: `/cultivos/${encodeURIComponent(first.cultivationId)}`,
      tag: 'clima',
    };
  }
  const names = crops.map((a) => a.cultivationName || 'un cultivo');
  const shown = names.slice(0, SUMMARY_ITEMS);
  const rest = names.length - shown.length;
  return {
    title: `Alerta de clima en ${crops.length} cultivos`,
    body: `${first.title}. ${shown.join(', ')}${rest > 0 ? ` y ${rest} más` : ''}.`,
    url: '/',
    tag: 'clima',
  };
}

/** "Android" / "iPhone" / "Computadora" según el navegador. */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  return 'Computadora';
}

export class PushService {
  private store: PushStore;
  private sender: PushSender | null;
  private publicKey: string | null;
  private timeZone: string;
  private now: () => number;
  private loadDay: (uid: string) => Promise<DayData>;

  constructor(o: { store: PushStore; sender: PushSender | null; publicKey: string | null; timeZone: string; now?: () => number; loadDay?: (uid: string) => Promise<DayData> }) {
    this.store = o.store;
    this.sender = o.sender;
    this.publicKey = o.publicKey;
    this.timeZone = o.timeZone;
    this.now = o.now || Date.now;
    this.loadDay = o.loadDay || (async () => ({ cultivations: [], waterings: [], envRecords: [] }));
  }

  /** La clave pública para anotar el celular (null: los avisos no están configurados en este servidor). */
  key(): string | null {
    return this.sender && this.publicKey ? this.publicKey : null;
  }

  private iso() {
    return new Date(this.now()).toISOString();
  }

  private async load(uid: string): Promise<PushDoc> {
    const stored = await this.store.get(uid);
    // un documento con el userId de otra cuenta no es de esta persona: se empieza de cero
    const d = stored && stored.userId === uid ? stored : null;
    return d
      ? { ...d, settings: { ...DEFAULT_PUSH_SETTINGS, ...d.settings }, sent: d.sent || {}, subscriptions: d.subscriptions || [] }
      : { userId: uid, subscriptions: [], settings: { ...DEFAULT_PUSH_SETTINGS }, sent: {}, updatedAt: this.iso() };
  }

  private async save(uid: string, doc: PushDoc) {
    doc.updatedAt = this.iso();
    await this.store.set(uid, doc);
  }

  /** Estado para Ajustes: si este celular (endpoint) está anotado, cuántos hay y las preferencias. */
  async status(uid: string, endpoint?: string) {
    const d = await this.load(uid);
    return {
      configured: !!this.key(),
      subscribed: !!endpoint && d.subscriptions.some((s) => s.endpoint === endpoint),
      devices: d.subscriptions.map((s) => s.device),
      settings: d.settings,
    };
  }

  async subscribe(uid: string, input: any, userAgent?: string) {
    if (!this.key()) throw new PushError('Los avisos al celular todavía no están configurados.', 503);
    const endpoint = String(input?.endpoint || '');
    const p256dh = String(input?.keys?.p256dh || '');
    const auth = String(input?.keys?.auth || '');
    if (!isPushEndpoint(endpoint)) throw new PushError('El celular no mandó una suscripción válida.');
    if (!B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) throw new PushError('El celular no mandó una suscripción válida.');
    const d = await this.load(uid);
    d.subscriptions = d.subscriptions.filter((s) => s.endpoint !== endpoint);
    d.subscriptions.push({ endpoint, keys: { p256dh, auth }, device: deviceLabel(userAgent), createdAt: this.iso() });
    d.subscriptions = d.subscriptions.slice(-MAX_SUBSCRIPTIONS);
    await this.save(uid, d);
    return this.status(uid, endpoint);
  }

  async unsubscribe(uid: string, endpoint: string) {
    const d = await this.load(uid);
    d.subscriptions = d.subscriptions.filter((s) => s.endpoint !== endpoint);
    await this.save(uid, d);
    return this.status(uid, endpoint);
  }

  async saveSettings(uid: string, input: any) {
    const d = await this.load(uid);
    const next = { ...d.settings };
    for (const k of ['resumen', 'clima', 'equipos', 'comunidad'] as const) if (typeof input?.[k] === 'boolean') next[k] = input[k];
    if (input?.summaryHour !== undefined) {
      const h = Number(input.summaryHour);
      if (!Number.isInteger(h) || h < 0 || h > 23) throw new PushError('La hora del resumen va de 0 a 23.');
      next.summaryHour = h;
    }
    // si cambió la hora, el resumen de hoy puede salir a la nueva hora
    if (next.summaryHour !== d.settings.summaryHour) delete d.sent.summary;
    d.settings = next;
    await this.save(uid, d);
    return d.settings;
  }

  private quietNow() {
    const h = zonedParts(this.now(), this.timeZone).hour;
    return h >= QUIET_FROM || h < QUIET_TO;
  }

  /** Manda a todos los celulares de esa persona (y saca los que se dieron de baja). Devuelve cuántos salieron. */
  private async deliver(uid: string, d: PushDoc, msg: PushMessage, urgency: 'normal' | 'high' = 'normal', extra: { ttlSeconds?: number; topic?: string } = {}): Promise<number> {
    if (!this.sender || !d.subscriptions.length) return 0;
    const payload = JSON.stringify(msg);
    let ok = 0;
    const gone: string[] = [];
    for (const sub of d.subscriptions) {
      if (!isPushEndpoint(sub.endpoint)) {
        gone.push(sub.endpoint);
        continue;
      }
      try {
        await this.sender.send(sub, payload, { ttlSeconds: extra.ttlSeconds || DEFAULT_TTL_SECONDS, urgency, ...(extra.topic ? { topic: extra.topic } : {}) });
        ok++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(sub.endpoint);
      }
    }
    if (gone.length) {
      d.subscriptions = d.subscriptions.filter((s) => !gone.includes(s.endpoint));
      await this.save(uid, d);
    }
    return ok;
  }

  /** Un aviso de una categoría, si la persona la tiene prendida (quiet: no suena de 23 a 8). */
  private async sendCategory(uid: string, category: PushCategory, msg: PushMessage, o: { quiet?: boolean; urgency?: 'normal' | 'high' } = {}) {
    const d = await this.load(uid);
    if (!d.subscriptions.length || !d.settings[category]) return 0;
    if (o.quiet && this.quietNow()) return 0;
    return this.deliver(uid, d, msg, o.urgency);
  }

  async test(uid: string) {
    const d = await this.load(uid);
    if (!d.subscriptions.length) throw new PushError('Primero activá los avisos en este celular.');
    const sent = await this.deliver(uid, d, {
      title: '¡Listo! Los avisos funcionan',
      body: 'Así te vamos a avisar cuándo regar, revisar el tanque y lo que pase en tu jardín.',
      url: '/',
      tag: 'prueba',
    }, 'high');
    if (!sent) throw new PushError('No se pudo mandar el aviso. Volvé a activar los avisos en este celular.', 502);
    return { sent };
  }

  /** El resumen del día de cada persona, a su hora (lo llama el control de cada hora). */
  async dailySummaries() {
    const p = zonedParts(this.now(), this.timeZone);
    const today = zonedDateKey(this.now(), this.timeZone);
    let sent = 0;
    for (const uid of await this.store.listUserIds()) {
      try {
        const d = await this.load(uid);
        const h = d.settings.summaryHour;
        if (!d.settings.resumen || d.sent.summary === today || p.hour < h || p.hour >= h + SUMMARY_WINDOW_HOURS) continue;
        const data = await this.loadDay(uid);
        const active = data.cultivations.filter((c) => !c.isFinished && !c.isDemo);
        const msg = summaryMessage(buildDailyTasks(active, data.waterings, data.envRecords));
        d.sent.summary = today;
        await this.save(uid, d);
        if (msg && (await this.deliver(uid, d, msg))) sent++;
      } catch (e: any) {
        console.warn('[Avisos] No se pudo armar el resumen del día:', e?.message || e);
      }
    }
    return { sent };
  }

  // ------------------------------------------------------------ ganchos

  /**
   * Alertas de clima de un control de cada hora, todas juntas en un solo aviso:
   * - como mucho un aviso de clima por hora para toda la cuenta (no uno por planta);
   * - una condición ya avisada hoy (por ejemplo, humedad alta) no vuelve a sonar en el día;
   * - si el celular está sin conexión, llega solo el último y, pasadas 2 horas, ninguno.
   */
  async climateAlerts(uid: string, alerts: ClimateAlertInput[]) {
    if (!alerts.length) return 0;
    const d = await this.load(uid);
    if (!d.subscriptions.length || !d.settings.clima) return 0;
    const today = zonedDateKey(this.now(), this.timeZone);
    const already = new Set(d.sent.climateDay === today ? d.sent.climateConds || [] : []);
    const condsOf = (a: ClimateAlertInput) => (a.conditions && a.conditions.length ? a.conditions : [a.title]);
    const fresh = alerts.filter((a) => condsOf(a).some((c) => !already.has(c)));
    if (!fresh.length) return 0;
    if (this.now() - (d.sent.climateAt || 0) < CLIMATE_EVERY_MS) return 0;
    for (const a of fresh) for (const c of condsOf(a)) already.add(c);
    d.sent.climateAt = this.now();
    d.sent.climateDay = today;
    d.sent.climateConds = [...already].slice(-20);
    delete d.sent.climate;
    await this.save(uid, d);
    return this.deliver(uid, d, climateMessage(fresh), 'high', { ttlSeconds: CLIMATE_TTL_SECONDS, topic: 'clima' });
  }

  /** Una sola alerta de clima (la prueba de Avisos, por ejemplo). */
  climateAlert(uid: string, task: ClimateAlertInput) {
    return this.climateAlerts(uid, [task]);
  }

  /** Un equipo falló (el mismo error se avisa como mucho cada 6 h). */
  async deviceProblem(uid: string, text: string) {
    const d = await this.load(uid);
    const last = d.sent.problem;
    if (last && last.text === text && this.now() - last.at < PROBLEM_EVERY_MS) return 0;
    if (!d.subscriptions.length || !d.settings.equipos) return 0;
    d.sent.problem = { text, at: this.now() };
    await this.save(uid, d);
    return this.deliver(uid, d, { title: 'Equipos: algo no funcionó', body: text, url: '/equipos', tag: 'equipos-error' }, 'high');
  }

  /** El riego automático regó (no suena de 23 a 8). */
  autoWatering(uid: string, cultivationId: string, cultivationName: string, liters: number) {
    const l = String(Math.round(liters * 10) / 10).replace('.', ',');
    return this.sendCategory(uid, 'equipos', { title: 'Riego automático', body: `Se regó ${cultivationName} (${l} L).`, url: `/cultivos/${encodeURIComponent(cultivationId)}`, tag: `riego-auto-${cultivationId}` }, { quiet: true });
  }

  /** Me gusta, comentario o seguidor nuevo (no suena de 23 a 8; me gusta: uno por publicación por hora). */
  async communityNotice(uid: string, n: { kind: 'follow' | 'like' | 'comment'; fromHandle: string; growlogId: string | null; growlogTitle: string | null; text: string | null }) {
    const who = `@${n.fromHandle}`;
    const growlogUrl = n.growlogId ? `/comunidad/growlog/${encodeURIComponent(n.growlogId)}` : '/comunidad';
    if (n.kind === 'like' && n.growlogId) {
      const d = await this.load(uid);
      const likes = d.sent.likes || {};
      if (this.now() - (likes[n.growlogId] || 0) < LIKE_EVERY_MS) return 0;
      if (!d.subscriptions.length || !d.settings.comunidad || this.quietNow()) return 0;
      // se guardan solo los del último día
      d.sent.likes = Object.fromEntries(Object.entries({ ...likes, [n.growlogId]: this.now() }).filter(([, at]) => this.now() - at < 86_400_000));
      await this.save(uid, d);
      return this.deliver(uid, d, { title: `A ${who} le gustó tu growlog`, body: n.growlogTitle || 'Tocá para verlo.', url: growlogUrl, tag: `like-${n.growlogId}` });
    }
    if (n.kind === 'comment') {
      return this.sendCategory(uid, 'comunidad', { title: `${who} comentó tu growlog`, body: n.text || n.growlogTitle || 'Tocá para verlo.', url: growlogUrl, tag: `comment-${n.growlogId}` }, { quiet: true });
    }
    return this.sendCategory(uid, 'comunidad', { title: `${who} empezó a seguirte`, body: 'Tocá para ver su perfil.', url: `/comunidad/growers/${encodeURIComponent(n.fromHandle)}`, tag: `follow-${n.fromHandle}` }, { quiet: true });
  }
}
