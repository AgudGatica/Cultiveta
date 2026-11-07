import { collection, doc, setDoc, deleteDoc, Unsubscribe } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { db } from '../firebase/config';
import type { Cultivation, EnvironmentRecord, Indoor } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';
import { cultivationService } from './cultivationService';
import { environmentService } from './environmentService';
import { ambientEnvironment, ambientForCrop, autoAmbientId, cropTypeForAmbient, environmentForCropType, isExteriorAmbient } from '../utils/indoors';
import { getLocalTodayDateOnly } from '../utils/growthStageUtils';

/**
 * Ambientes de la persona (carpas, salas, armarios o lugares de exterior): colección "indoors" con su
 * userId (la regla general de Firestore ya la protege). Los cultivos guardan el indoorId; la luz de un
 * cultivo en un ambiente interior es la del ambiente, así que esos cambios de luz se guardan en el ambiente.
 */

let cache: Indoor[] = [];
const listeners = new Set<() => void>();
const setCache = (list: Indoor[]) => {
  cache = list;
  listeners.forEach((fn) => fn());
};
const lastUserId = () => (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');

export const indoorService = {
  /** meta.fromCache false: la lista ya vino del servidor. */
  subscribeIndoors(userId: string, callback: (indoors: Indoor[], meta?: { fromCache: boolean }) => void): Unsubscribe {
    return subscribeCollection<Indoor>({
      collectionName: 'indoors',
      userId,
      sortFn: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      callback: (list, meta) => {
        setCache(list);
        callback(list, meta);
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

  /** id: fijo, para los ambientes que se arman solos (así no se duplican). */
  async createIndoor(data: Omit<Indoor, 'id' | 'createdAt' | 'updatedAt'>, id?: string): Promise<Indoor> {
    const ref = id ? doc(db, 'indoors', id) : doc(collection(db, 'indoors'));
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

  /** Un cultivo sin ambiente: se le arma uno con su nombre (interior o exterior, con su luz) y queda adentro. */
  async createAmbientForCrop(crop: Cultivation, userId?: string): Promise<Indoor> {
    const ambient = await indoorService.createIndoor({ ...ambientForCrop(crop), userId: userId || crop.userId }, autoAmbientId(crop.id));
    await cultivationService.updateCultivation(crop.id, { indoorId: ambient.id }, userId);
    return ambient;
  },

  /** Pasa un cultivo a otro ambiente. Si es interior y todavía no tiene luz cargada, toma la del cultivo. */
  async moveCrop(crop: Cultivation, to: Indoor, userId?: string): Promise<Cultivation> {
    if (!isExteriorAmbient(to) && !to.lighting?.photoperiodHoursLight && crop.lighting) {
      await indoorService.updateIndoor(to.id, { lighting: crop.lighting }, userId);
    }
    const updates: Partial<Cultivation> = { indoorId: to.id };
    if (ambientEnvironment(to) !== environmentForCropType(crop.type)) updates.type = cropTypeForAmbient(to);
    await cultivationService.updateCultivation(crop.id, updates, userId);
    return { ...crop, ...updates };
  },

  /**
   * Clima anotado a mano en un ambiente: la misma lectura queda en cada cultivo activo de adentro (así
   * sus gráficos y avisos la usan), marcada con el ambiente.
   */
  async addAmbientReading(indoor: Indoor, crops: Cultivation[], reading: { temperatureC: number; humidityPct: number }, userId: string, now = new Date()): Promise<EnvironmentRecord[]> {
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const out: EnvironmentRecord[] = [];
    for (const c of crops) {
      out.push(
        await environmentService.addEnvironmentRecord({
          userId,
          cultivationId: c.id,
          date: getLocalTodayDateOnly(),
          time,
          temperatureC: reading.temperatureC,
          humidityPct: reading.humidityPct,
          vpdKPa: environmentService.calculateVPD(reading.temperatureC, reading.humidityPct),
          indoorId: indoor.id,
          notes: `Anotado en el ambiente ${indoor.name}`,
        })
      );
    }
    return out;
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
   * Guarda cambios de un cultivo. Si está en un ambiente interior, la luz (fotoperiodo, hora de
   * encendido) se guarda en el ambiente: vale para todas sus plantas.
   */
  async saveCropUpdates(crop: Cultivation, updates: Partial<Cultivation>, userId?: string): Promise<void> {
    const { lighting, ...rest } = updates;
    const indoor = crop.indoorId ? cache.find((i) => i.id === crop.indoorId) : undefined;
    // en exterior no hay luz compartida: la del cultivo se guarda en el cultivo
    if (crop.indoorId && lighting && !(indoor && isExteriorAmbient(indoor))) {
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
