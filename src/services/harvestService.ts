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
import { Harvest } from '../types';
import { cultivationService } from './cultivationService';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';

export const harvestService = {
  subscribeHarvests(userId: string, callback: (harvests: Harvest[]) => void): Unsubscribe {
    return subscribeCollection<Harvest>({
      collectionName: 'harvests',
      userId,
      sortFn: (a, b) => new Date(b.harvestDate || 0).getTime() - new Date(a.harvestDate || 0).getTime(),
      callback,
    });
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
    const newHarvest: Harvest & { _isPendingLocal?: boolean } = {
      ...data,
      id: docRef.id,
      createdAt: now,
      _isPendingLocal: true,
    };

    localStore.saveItem('harvests', newHarvest as Harvest);

    // Update cultivation status to cosechado / finished
    await cultivationService.updateCultivation(data.cultivationId, {
      isFinished: true,
      currentStage: 'Cosechado',
      status: 'cosechado',
      harvestId: docRef.id,
      harvestDate: data.harvestDate,
      endDate: data.harvestDate,
      estimatedWeight: data.finalDryWeightGrams,
      finalWeight: data.finalDryWeightGrams,
    }, data.userId);

    try {
      const cleaned = cleanFirestoreData(newHarvest);
      await setDoc(docRef, cleaned);
      localStore.saveItem('harvests', { ...newHarvest, _isPendingLocal: false } as Harvest);
    } catch (err) {
      console.warn('Serialization error on harvest in Firestore:', err);
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
      await setDoc(docRef, cleaned, { merge: true });
    } catch (err) {
      console.warn('updateDoc error on harvests:', err);
    }

    return updatedHarvest;
  },

  async deleteHarvest(id: string, cultivationId: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('harvests', id, targetUid);

    await cultivationService.updateCultivation(cultivationId, {
      isFinished: false,
      currentStage: 'Floración',
      harvestId: undefined,
    }, userId);

    try {
      const docRef = doc(db, 'harvests', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('deleteDoc error on harvests:', err);
    }
  }
};
