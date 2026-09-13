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
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Genetics } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const geneticsService = {
  subscribeGenetics(userId: string, callback: (genetics: Genetics[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<Genetics>('genetics', userId, (localList) => {
      callback(localList.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'genetics'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Genetics))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<Genetics>('genetics', userId);
            const mergedMap = new Map<string, Genetics>();
            currentLocal.forEach((g) => mergedMap.set(g.id, g));
            cloudList.forEach((g) => mergedMap.set(g.id, g));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => (a.name || '').localeCompare(b.name || '')
            );
            localStore.saveAll('genetics', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot genetics unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore genetics subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
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
    const newGenetics: Genetics = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    localStore.saveItem('genetics', newGenetics);

    try {
      const cleaned = cleanFirestoreData(newGenetics);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc genetics pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on genetics:', err);
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
      updateDoc(docRef, cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      })).catch((err) => {
        console.warn('Firestore updateDoc genetics failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('updateDoc error on genetics:', err);
    }
  },

  async deleteGenetics(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('genetics', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('genetics', id, lastUid);
    }
    try {
      const docRef = doc(db, 'genetics', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc genetics failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on genetics:', err);
    }
  }
};
