import { collection, doc, setDoc, deleteDoc, Unsubscribe } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { db } from '../firebase/config';
import type { Cultivation, Indoor } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';
import { cultivationService } from './cultivationService';

/**
 * Indoors (carpas, salas, armarios) de la persona: colección "indoors" con su userId (la regla general
 * de Firestore ya la protege). Los cultivos guardan el indoorId; la luz de un cultivo con indoor es la
 * del indoor, así que los cambios de luz de ese cultivo se guardan en el indoor.
 */

let cache: Indoor[] = [];
const listeners = new Set<() => void>();
const setCache = (list: Indoor[]) => {
  cache = list;
  listeners.forEach((fn) => fn());
};
const lastUserId = () => (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');

export const indoorService = {
  subscribeIndoors(userId: string, callback: (indoors: Indoor[]) => void): Unsubscribe {
    return subscribeCollection<Indoor>({
      collectionName: 'indoors',
      userId,
      sortFn: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      callback: (list) => {
        setCache(list);
        callback(list);
      },
    });
  },
  /** Los indoors que se leyeron (para componentes que no los reciben por props). */
  getIndoors: () => cache,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  reset() {
    setCache([]);
  },

  async createIndoor(data: Omit<Indoor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Indoor> {
    const ref = doc(collection(db, 'indoors'));
    const now = new Date().toISOString();
    const indoor: Indoor & { _isPendingLocal?: boolean } = { ...data, id: ref.id, createdAt: now, updatedAt: now, _isPendingLocal: true };
    localStore.saveItem('indoors', indoor as Indoor);
    try {
      await setDoc(ref, cleanFirestoreData(indoor));
      localStore.saveItem('indoors', { ...indoor, _isPendingLocal: false } as Indoor);
    } catch (err: any) {
      console.warn('Indoor guardado solo en este dispositivo (Firestore no disponible):', err?.message || err);
    }
    return indoor;
  },

  async updateIndoor(id: string, updates: Partial<Indoor>, userId?: string): Promise<void> {
    const uid = userId || lastUserId();
    const existing = localStore.getItems<Indoor>('indoors', uid).find((i) => i.id === id);
    const updatedAt = new Date().toISOString();
    if (existing) localStore.saveItem('indoors', { ...existing, ...updates, updatedAt });
    try {
      await setDoc(doc(db, 'indoors', id), cleanFirestoreData({ ...updates, updatedAt }), { merge: true });
    } catch (err) {
      console.warn('No se pudo actualizar el indoor en Firestore (quedó en este dispositivo):', err);
    }
  },

  /**
   * Borra el indoor. Sus cultivos activos salen del indoor y se llevan su luz (así siguen con el mismo
   * horario); los terminados también dejan de apuntar a él.
   */
  async deleteIndoor(indoor: Indoor, crops: Cultivation[], userId?: string): Promise<void> {
    for (const c of crops.filter((x) => x.indoorId === indoor.id)) {
      await cultivationService.updateCultivation(c.id, { indoorId: null, ...(!c.isFinished && indoor.lighting ? { lighting: indoor.lighting } : {}) }, userId);
    }
    localStore.deleteItem('indoors', indoor.id, userId || lastUserId());
    try {
      await deleteDoc(doc(db, 'indoors', indoor.id));
    } catch (err) {
      console.warn('No se pudo borrar el indoor en Firestore (se borró en este dispositivo):', err);
    }
  },

  /** Mete un cultivo en el indoor. Si el indoor todavía no tiene luz cargada, toma la del cultivo. */
  async addCrop(indoor: Indoor, crop: Cultivation, userId?: string): Promise<Cultivation> {
    if (!indoor.lighting?.photoperiodHoursLight && crop.lighting) {
      await indoorService.updateIndoor(indoor.id, { lighting: crop.lighting }, userId);
    }
    await cultivationService.updateCultivation(crop.id, { indoorId: indoor.id }, userId);
    return { ...crop, indoorId: indoor.id, lighting: indoor.lighting?.photoperiodHoursLight ? indoor.lighting : crop.lighting };
  },

  /** Saca un cultivo del indoor: se queda con la luz que tenía el indoor. */
  async removeCrop(indoor: Indoor, crop: Cultivation, userId?: string): Promise<Cultivation> {
    const lighting = indoor.lighting || crop.lighting;
    await cultivationService.updateCultivation(crop.id, { indoorId: null, ...(lighting ? { lighting } : {}) }, userId);
    return { ...crop, indoorId: null, lighting };
  },

  /**
   * Guarda cambios de un cultivo. Si está en un indoor, la luz (fotoperiodo, hora de encendido) se
   * guarda en el indoor: vale para todos los cultivos de adentro.
   */
  async saveCropUpdates(crop: Cultivation, updates: Partial<Cultivation>, userId?: string): Promise<void> {
    const { lighting, ...rest } = updates;
    if (crop.indoorId && lighting) {
      const indoor = cache.find((i) => i.id === crop.indoorId);
      await indoorService.updateIndoor(crop.indoorId, { lighting: { ...(indoor?.lighting || {}), ...lighting } as Indoor['lighting'] }, userId);
      if (Object.keys(rest).length) await cultivationService.updateCultivation(crop.id, rest, userId);
      return;
    }
    await cultivationService.updateCultivation(crop.id, updates, userId);
  },
};

/** Los indoors de la persona, para cualquier componente (se actualiza solo). */
export function useIndoors(): Indoor[] {
  return useSyncExternalStore(indoorService.subscribe, indoorService.getIndoors, indoorService.getIndoors);
}
