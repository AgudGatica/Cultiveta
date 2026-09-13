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
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Watering } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const wateringService = {
  subscribeWaterings(userId: string, callback: (waterings: Watering[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<Watering>('waterings', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'waterings'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Watering))
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<Watering>('waterings', userId);
            const mergedMap = new Map<string, Watering>();
            currentLocal.forEach((w) => mergedMap.set(w.id, w));
            cloudList.forEach((w) => mergedMap.set(w.id, w));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
            );
            localStore.saveAll('waterings', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot waterings unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore waterings subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
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
    const newWatering: Watering = {
      ...data,
      id: docRef.id,
      createdAt: now,
    };

    localStore.saveItem('waterings', newWatering);

    try {
      const cleaned = cleanFirestoreData(newWatering);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc waterings pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on watering:', err);
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
      setDoc(docRef, cleaned, { merge: true }).catch((err) => {
        console.warn('Firestore updateWatering error:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on updateWatering:', err);
    }

    return updated;
  },

  async deleteWatering(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('waterings', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('waterings', id, lastUid);
    }
    try {
      const docRef = doc(db, 'waterings', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc waterings failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on waterings:', err);
    }
  },
};
