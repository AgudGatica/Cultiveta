import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Watering } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';

export const wateringService = {
  subscribeWaterings(userId: string, callback: (waterings: Watering[]) => void): Unsubscribe {
    return subscribeCollection<Watering>({
      collectionName: 'waterings',
      userId,
      sortFn: (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
      callback,
    });
  },

  async getWateringsByCultivation(cultivationId: string, userId?: string): Promise<Watering[]> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<Watering>('waterings', targetUserId)
      .filter((w) => w.cultivationId === cultivationId);

    try {
      const q = query(
        collection(db, 'waterings'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Watering));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, Watering>();
        local.forEach((w) => mergedMap.set(w.id, w));
        cloud.forEach((w) => mergedMap.set(w.id, w));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );
      }
    } catch (e) {
      // Fall back
    }
    return local.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  },

  async getLatestWatering(cultivationId: string, userId?: string): Promise<Watering | null> {
    const waterings = await this.getWateringsByCultivation(cultivationId, userId);
    return waterings.length > 0 ? waterings[0] : null;
  },

  async addWatering(data: Omit<Watering, 'id' | 'createdAt'>): Promise<Watering> {
    const docRef = doc(collection(db, 'waterings'));
    const now = new Date().toISOString();
    const newWatering: Watering & { _isPendingLocal?: boolean } = {
      ...data,
      id: docRef.id,
      createdAt: now,
      _isPendingLocal: true,
    };

    localStore.saveItem('waterings', newWatering as Watering);

    try {
      const cleaned = cleanFirestoreData(newWatering);
      await setDoc(docRef, cleaned);
      localStore.saveItem('waterings', { ...newWatering, _isPendingLocal: false } as Watering);
    } catch (err: any) {
      console.warn('Firestore setDoc waterings pending or unavailable:', err?.message || err);
    }

    return newWatering;
  },

  async updateWatering(id: string, partial: Partial<Watering>, userId?: string): Promise<Watering | null> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const existing = localStore.getItems<Watering>('waterings', targetUserId).find((w) => w.id === id);
    if (!existing) return null;

    const updated: Watering = {
      ...existing,
      ...partial,
      id,
    };

    localStore.saveItem('waterings', updated);

    try {
      const docRef = doc(db, 'waterings', id);
      const cleaned = cleanFirestoreData(updated);
      await setDoc(docRef, cleaned, { merge: true });
    } catch (err: any) {
      console.warn('Firestore updateWatering error:', err?.message || err);
    }

    return updated;
  },

  async deleteWatering(id: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('waterings', id, targetUid);

    try {
      const docRef = doc(db, 'waterings', id);
      await deleteDoc(docRef);
    } catch (err: any) {
      console.warn('Firestore deleteDoc waterings failed:', err?.message || err);
    }
  },
};
