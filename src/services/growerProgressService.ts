import { doc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AIPhotoAnalysis, FertilizationSchedule, UserProfile } from '../types';
import type { PersistedProgress } from '../utils/growerProgress';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { subscribeCollection } from './dataSyncHelper';

/** Documento con los logros ganados y el último nivel festejado. */
const progressRef = (uid: string) => doc(db, 'users', uid, 'progress', 'state');

export const USERNAME_MAX = 24;
export const BIO_MAX = 160;

/** Usuario sin @: minúsculas, números, punto y guion bajo. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, USERNAME_MAX);
}

export const growerProgressService = {
  /**
   * Escucha el progreso guardado. Llama con null si la cuenta todavía no tiene documento.
   * `confirmed` es true cuando la respuesta viene del servidor (o si no hay conexión y no
   * va a venir): recién ahí se puede decidir que es la primera vez sin pisar datos.
   */
  subscribeProgress(
    uid: string,
    callback: (data: PersistedProgress | null, confirmed: boolean) => void
  ): Unsubscribe {
    let confirmedOnce = false;
    const offlineTimer = setTimeout(() => {
      confirmedOnce = true;
    }, 5000);
    const unsub = onSnapshot(
      progressRef(uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.metadata.fromCache) confirmedOnce = true;
        const raw = snap.exists() ? (snap.data() as Partial<PersistedProgress>) : null;
        const data = raw
          ? { badges: raw.badges || {}, celebratedLevel: Number(raw.celebratedLevel) || 1 }
          : null;
        callback(data, confirmedOnce);
      },
      (err) => {
        console.warn('[Progreso] No se pudo leer el progreso:', err?.message || err);
        confirmedOnce = true;
        callback(null, false);
      }
    );
    return () => {
      clearTimeout(offlineTimer);
      unsub();
    };
  },

  /** Guarda logros nuevos (solo los ids que se pasan) y el nivel festejado. Funciona offline. */
  async saveProgress(uid: string, patch: { badges?: Record<string, string>; celebratedLevel?: number }): Promise<void> {
    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.badges && Object.keys(patch.badges).length > 0) data.badges = patch.badges;
    if (typeof patch.celebratedLevel === 'number') data.celebratedLevel = patch.celebratedLevel;
    // Sin await: offline, setDoc no resuelve hasta que vuelve la conexión (queda en cola).
    setDoc(progressRef(uid), data, { merge: true }).catch((err) => {
      console.warn('[Progreso] No se pudo guardar el progreso:', err?.message || err);
    });
  },

  /** Tablas de fertilización y análisis de IA: solo hacen falta para contar XP y logros. */
  subscribeFertilizationSchedules(uid: string, callback: (list: FertilizationSchedule[]) => void): Unsubscribe {
    return subscribeCollection<FertilizationSchedule>({ collectionName: 'fertilizationSchedules', userId: uid, callback });
  },

  subscribePhotoAnalyses(uid: string, callback: (list: AIPhotoAnalysis[]) => void): Unsubscribe {
    return subscribeCollection<AIPhotoAnalysis>({ collectionName: 'photoAnalyses', userId: uid, callback });
  },

  /** Actualiza usuario y bio en users/{uid} (y en la copia local del perfil). */
  async updateProfileInfo(uid: string, info: { username: string; bio: string }): Promise<Pick<UserProfile, 'username' | 'bio'>> {
    const clean = {
      username: normalizeUsername(info.username),
      bio: info.bio.trim().slice(0, BIO_MAX),
    };
    if (typeof window !== 'undefined') {
      try {
        const key = `cultiveta_profile_${uid}`;
        const stored = localStorage.getItem(key);
        if (stored) localStorage.setItem(key, JSON.stringify({ ...JSON.parse(stored), ...clean }));
      } catch {
        // copia local opcional
      }
    }
    // Sin await por el mismo motivo; los errores (por ejemplo, permisos) se informan por consola.
    setDoc(doc(db, 'users', uid), cleanFirestoreData(clean), { merge: true }).catch((err) => {
      console.warn('[Perfil] No se pudo guardar el perfil:', err?.message || err);
    });
    return clean;
  },
};
