/**
 * Comunidad en el navegador: habla con /api/community (el servidor arma y guarda lo público) y recuerda en
 * memoria tu perfil y tus growlogs para que la pestaña Comunidad, la ventana Compartir y la página de cada
 * genética lo muestren igual.
 */
import { useSyncExternalStore } from 'react';
import { authFetch } from './apiClient';
import type { GrowerCard, Growlog, GrowlogCard, GrowlogPrivacy, PublicProfile } from '../utils/growlog';

export interface CommunityMe {
  profile: PublicProfile | null;
  growlogs: GrowlogCard[];
  isAdmin: boolean;
  googlePhoto: string | null;
}

export interface ReportGroup {
  kind: 'growlog' | 'profile' | 'comment';
  targetId: string;
  growlogId: string | null;
  reports: Array<{ reason: string; text: string; createdAt: string }>;
  target: any;
}

export const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam o publicidad',
  venta: 'Venta o intercambio',
  ofensivo: 'Ofensivo o acoso',
  datos: 'Datos personales de alguien',
  menores: 'Contenido con menores',
  otro: 'Otro motivo',
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await authFetch(`/api/community${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'No se pudo conectar con la comunidad. Probá de nuevo.');
  return data as T;
}

let me: CommunityMe | null = null;
let loading: Promise<CommunityMe> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setMe = (next: CommunityMe | null) => {
  me = next;
  emit();
};

const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Espera entre un cambio del cultivo y pedir que se actualice su growlog (el servidor tampoco acepta más seguido). */
export const REFRESH_DELAY_MS = 30_000;

export const communityService = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: () => me,

  /** Perfil y growlogs propios (una vez por sesión; force para volver a pedirlos). */
  async loadMe(force = false): Promise<CommunityMe> {
    if (me && !force) return me;
    if (!loading) {
      loading = call<CommunityMe>('/me')
        .then((d) => {
          setMe(d);
          return d;
        })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  },

  reset() {
    refreshTimers.forEach((t) => clearTimeout(t));
    refreshTimers.clear();
    setMe(null);
  },

  async saveProfile(input: Partial<Pick<PublicProfile, 'handle' | 'displayName' | 'bio' | 'avatarMode' | 'location' | 'level' | 'levelName'>> & { acceptRules?: boolean }) {
    const { profile } = await call<{ profile: PublicProfile }>('/profile', { method: 'POST', body: JSON.stringify(input) });
    setMe({ ...(me || { growlogs: [], isAdmin: false, googlePhoto: null }), profile });
    return profile;
  },

  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append('photo', file);
    const { profile } = await call<{ profile: PublicProfile }>('/avatar', { method: 'POST', body: form });
    setMe({ ...(me || { growlogs: [], isAdmin: false, googlePhoto: null }), profile });
    return profile;
  },

  /** Compartir una genética de un cultivo (o cambiar su privacidad o ubicación). */
  async publish(cropId: string, geneticIndex: number, privacy: GrowlogPrivacy, location: string | null) {
    const { growlog } = await call<{ growlog: GrowlogCard }>('/growlogs', { method: 'POST', body: JSON.stringify({ cropId, geneticIndex, privacy, location }) });
    if (me) setMe({ ...me, growlogs: [...me.growlogs.filter((g) => g.id !== growlog.id), growlog] });
    return growlog;
  },

  async unpublish(id: string) {
    await call('/growlogs/' + encodeURIComponent(id), { method: 'DELETE' });
    if (me) setMe({ ...me, growlogs: me.growlogs.filter((g) => g.id !== id) });
  },

  async getGrowlog(id: string): Promise<Growlog> {
    return (await call<{ growlog: Growlog }>('/growlogs/' + encodeURIComponent(id))).growlog;
  },

  /** El cultivo cambió: si tiene growlogs, se actualizan en un rato (varios cambios seguidos cuentan como uno). */
  refreshSoon(cropId: string) {
    if (!me?.growlogs.some((g) => g.cropId === cropId)) return;
    clearTimeout(refreshTimers.get(cropId));
    refreshTimers.set(
      cropId,
      setTimeout(() => {
        refreshTimers.delete(cropId);
        call('/refresh', { method: 'POST', body: JSON.stringify({ cropId }) })
          .then(() => communityService.loadMe(true))
          .catch(() => {});
      }, REFRESH_DELAY_MS)
    );
  },

  async explore(): Promise<{ growlogs: GrowlogCard[]; growers: GrowerCard[]; following: string[] }> {
    return call('/explore');
  },

  async feed(): Promise<GrowlogCard[]> {
    return (await call<{ growlogs: GrowlogCard[] }>('/feed')).growlogs;
  },

  async grower(handle: string): Promise<{ profile: PublicProfile; growlogs: GrowlogCard[]; following: boolean }> {
    return call('/growers/' + encodeURIComponent(handle));
  },

  async follow(uid: string, follow: boolean): Promise<{ following: boolean; followers: number }> {
    const r = await call<{ following: boolean; followers: number }>('/follow', { method: 'POST', body: JSON.stringify({ uid, follow }) });
    if (me?.profile) setMe({ ...me, profile: { ...me.profile, following: Math.max(0, me.profile.following + (follow ? 1 : -1)) } });
    return r;
  },

  async report(kind: ReportGroup['kind'], targetId: string, reason: string, text: string, growlogId?: string) {
    return call<{ hidden: boolean }>('/report', { method: 'POST', body: JSON.stringify({ kind, targetId, reason, text, growlogId }) });
  },

  async adminReports(): Promise<ReportGroup[]> {
    return (await call<{ groups: ReportGroup[] }>('/admin/reports')).groups;
  },

  async resolveReports(group: Pick<ReportGroup, 'kind' | 'targetId' | 'growlogId'>, action: 'hide' | 'show' | 'delete') {
    await call('/admin/reports', { method: 'POST', body: JSON.stringify({ ...group, action }) });
  },
};

/** Perfil y growlogs propios, al día. */
export function useCommunityMe(): CommunityMe | null {
  return useSyncExternalStore(communityService.subscribe, communityService.snapshot, communityService.snapshot);
}

/** El growlog de una genética de un cultivo (si está compartida). */
export function growlogFor(m: CommunityMe | null, cropId: string, geneticIndex: number): GrowlogCard | null {
  return m?.growlogs.find((g) => g.cropId === cropId && g.geneticIndex === geneticIndex) || null;
}

/** Enlace para compartir un growlog. */
export const growlogLink = (id: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/comunidad/growlog/${encodeURIComponent(id)}`;
