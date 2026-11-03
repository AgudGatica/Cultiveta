/**
 * Avisos al celular, del lado de la app: anotar este celular (Web Push), darlo de baja, las preferencias y el
 * aviso de prueba. Los manda el servidor (src/server/push/pushService.ts) aunque la app esté cerrada.
 *
 * iPhone: el push solo funciona con Cultiveta agregada a la pantalla de inicio (iOS 16.4+) y abierta desde ahí.
 */
import { authFetch } from './apiClient';

export interface PushSettings {
  resumen: boolean;
  summaryHour: number;
  clima: boolean;
  equipos: boolean;
  comunidad: boolean;
}

export interface PushStatus {
  /** El servidor tiene las claves para mandar avisos. */
  configured: boolean;
  /** Este celular está anotado. */
  subscribed: boolean;
  /** Celulares anotados ("Android", "iPhone"…). */
  devices: string[];
  settings: PushSettings;
  publicKey: string | null;
}

/** Qué se puede hacer en este navegador. */
export type PushSupport = 'ok' | 'ios_needs_install' | 'unsupported' | 'denied';

const PROMPT_DISMISSED_KEY = 'cultiveta_push_prompt_dismissed';

export function isIOS(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  return /iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** Abierta como app instalada (desde el ícono), no en una pestaña del navegador. */
export function isStandalone(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios_needs_install';
  if (!capable) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init ? { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } } : undefined);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'No se pudo completar. Probá de nuevo.');
  return body as T;
}

export const pushNotifications = {
  async status(): Promise<PushStatus> {
    const sub = await currentSubscription();
    return api<PushStatus>(`/api/push/status${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`);
  },

  /** Pide permiso (con el toque de la persona) y anota este celular. */
  async enable(): Promise<PushStatus> {
    const st = await this.status();
    if (!st.configured || !st.publicKey) throw new Error('Los avisos al celular todavía no están activos en Cultiveta.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Sin permiso no te podemos avisar. Si lo bloqueaste, habilitalo en los ajustes del navegador.');
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(st.publicKey) }));
    const status = await api<Omit<PushStatus, 'publicKey'>>('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    return { ...status, publicKey: st.publicKey };
  },

  /** Deja de avisar a este celular. */
  async disable(): Promise<void> {
    const sub = await currentSubscription();
    if (!sub) return;
    await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe().catch(() => false);
  },

  async saveSettings(partial: Partial<PushSettings>): Promise<PushSettings> {
    return (await api<{ settings: PushSettings }>('/api/push/settings', { method: 'POST', body: JSON.stringify(partial) })).settings;
  },

  async test(): Promise<void> {
    await api('/api/push/test', { method: 'POST', body: '{}' });
  },

  /** La tarjeta del Inicio ("¿Te avisamos cuándo regar?") se muestra una sola vez. */
  promptDismissed(): boolean {
    try {
      return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  },
  dismissPrompt(): void {
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
    } catch {
      /* sin almacenamiento: vuelve a aparecer, no pasa nada */
    }
  },
};
