import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Genetics } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';

export const geneticsService = {
  subscribeGenetics(userId: string, callback: (genetics: Genetics[]) => void): Unsubscribe {
    return subscribeCollection<Genetics>({
      collectionName: 'genetics',
      userId,
      sortFn: (a, b) => (a.name || '').localeCompare(b.name || ''),
      callback,
    });
  },

  async getGeneticsByUser(userId: string): Promise<Genetics[]> {
    const local = localStore.getItems<Genetics>('genetics', userId);
    try {
      const q = query(
        collection(db, 'genetics'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Genetics));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, Genetics>();
        local.forEach((g) => mergedMap.set(g.id, g));
        cloud.forEach((g) => mergedMap.set(g.id, g));
        return Array.from(mergedMap.values()).sort(
          (a, b) => (a.name || '').localeCompare(b.name || '')
        );
      }
    } catch (e) {
      // Fallback
    }
    return local.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  async getGeneticsById(id: string, userId?: string): Promise<Genetics | null> {
    if (userId) {
      const local = localStore.getItems<Genetics>('genetics', userId).find((g) => g.id === id);
      if (local) return local;
    }
    try {
      const docRef = doc(db, 'genetics', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Genetics;
    } catch (e) {
      // Fallback
    }
    return null;
  },

  async createGenetics(data: Omit<Genetics, 'id' | 'createdAt' | 'updatedAt'>): Promise<Genetics> {
    const docRef = doc(collection(db, 'genetics'));
    const now = new Date().toISOString();
    const newGenetics: Genetics & { _isPendingLocal?: boolean } = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
      _isPendingLocal: true,
    };

    localStore.saveItem('genetics', newGenetics as Genetics);

    try {
      const cleaned = cleanFirestoreData(newGenetics);
      await setDoc(docRef, cleaned);
      localStore.saveItem('genetics', { ...newGenetics, _isPendingLocal: false } as Genetics);
    } catch (err: any) {
      console.warn('Firestore setDoc genetics pending or unavailable:', err?.message || err);
    }

    return newGenetics;
  },

  async updateGenetics(id: string, updates: Partial<Genetics>, userId?: string): Promise<void> {
    const targetUserId = userId || updates.userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const existingList = localStore.getItems<Genetics>('genetics', targetUserId);
    const existing = existingList.find((g) => g.id === id);
    if (existing) {
      localStore.saveItem('genetics', {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      const docRef = doc(db, 'genetics', id);
      await setDoc(docRef, cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    } catch (err) {
      console.warn('updateDoc error on genetics:', err);
    }
  },

  async deleteGenetics(id: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('genetics', id, targetUid);

    try {
      const docRef = doc(db, 'genetics', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('deleteDoc error on genetics:', err);
    }
  }
};
