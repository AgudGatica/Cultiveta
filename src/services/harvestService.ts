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
import { Harvest } from '../types';
import { cultivationService } from './cultivationService';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const harvestService = {
  subscribeHarvests(userId: string, callback: (harvests: Harvest[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<Harvest>('harvests', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime()));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'harvests'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Harvest))
            .sort((a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<Harvest>('harvests', userId);
            const mergedMap = new Map<string, Harvest>();
            currentLocal.forEach((h) => mergedMap.set(h.id, h));
            cloudList.forEach((h) => mergedMap.set(h.id, h));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime()
            );
            localStore.saveAll('harvests', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot harvests unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore harvests subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  async getHarvestsByUser(userId: string): Promise<Harvest[]> {
    const local = localStore.getItems<Harvest>('harvests', userId);
    try {
      const q = query(
        collection(db, 'harvests'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Harvest));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, Harvest>();
        local.forEach((h) => mergedMap.set(h.id, h));
        cloud.forEach((h) => mergedMap.set(h.id, h));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime()
        );
      }
    } catch (e) {
      // Fallback
    }
    return local.sort((a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime());
  },

  async getHarvestByCultivationId(cultivationId: string, userId?: string): Promise<Harvest | null> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<Harvest>('harvests', targetUserId).find((h) => h.cultivationId === cultivationId);
    if (local) return local;

    try {
      const q = query(
        collection(db, 'harvests'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Harvest);
    } catch (e) {
      return null;
    }
  },

  async recordHarvest(data: Omit<Harvest, 'id' | 'createdAt'>): Promise<Harvest> {
    const docRef = doc(collection(db, 'harvests'));
    const now = new Date().toISOString();
    const newHarvest: Harvest = {
      ...data,
      id: docRef.id,
      createdAt: now,
    };

    localStore.saveItem('harvests', newHarvest);

    // Update cultivation status to finished
    await cultivationService.updateCultivation(data.cultivationId, {
      isFinished: true,
      currentStage: 'Finalizado',
      harvestId: docRef.id,
      status: 'ESTABLE',
    }, data.userId);

    try {
      const cleaned = cleanFirestoreData(newHarvest);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc harvests pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on harvest:', err);
    }

    return newHarvest;
  },

  async updateHarvest(id: string, updates: Partial<Harvest>, userId?: string): Promise<Harvest> {
    const targetUserId =
      userId ||
      updates.userId ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('cultiveta_last_user_id') || 'default_user'
        : 'default_user');

    const local = localStore.getItems<Harvest>('harvests', targetUserId);
    const existing = local.find((h) => h.id === id);

    const updatedHarvest: Harvest = {
      ...(existing || ({} as any)),
      ...updates,
      id,
      userId: targetUserId,
    };

    localStore.saveItem('harvests', updatedHarvest);

    try {
      const docRef = doc(db, 'harvests', id);
      const cleaned = cleanFirestoreData(updates);
      updateDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore updateDoc harvests failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('updateDoc error on harvests:', err);
    }

    return updatedHarvest;
  },

  async deleteHarvest(id: string, cultivationId: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('harvests', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('harvests', id, lastUid);
    }

    await cultivationService.updateCultivation(cultivationId, {
      isFinished: false,
      currentStage: 'Floración',
      harvestId: undefined,
    }, userId);

    try {
      const docRef = doc(db, 'harvests', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc harvests failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on harvests:', err);
    }
  }
};
