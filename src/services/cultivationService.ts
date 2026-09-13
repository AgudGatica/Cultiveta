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
  limit,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cultivation, HealthStatus, Watering, EnvironmentRecord } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const cultivationService = {
  subscribeCultivations(userId: string, callback: (cultivations: Cultivation[]) => void): Unsubscribe {
    // 1. Immediately subscribe to local persistence for zero latency and offline support
    const unsubLocal = localStore.subscribe<Cultivation>('cultivations', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
    });

    // 2. Also try Cloud Firestore snapshot listener safely
    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'cultivations'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Cultivation))
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<Cultivation>('cultivations', userId);
            const mergedMap = new Map<string, Cultivation>();
            currentLocal.forEach((c) => mergedMap.set(c.id, c));
            cloudList.forEach((c) => mergedMap.set(c.id, c));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            localStore.saveAll('cultivations', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot unavailable, operating with local persistence:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  async getCultivationsByUser(userId: string): Promise<Cultivation[]> {
    const local = localStore.getItems<Cultivation>('cultivations', userId);
    try {
      const q = query(
        collection(db, 'cultivations'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Cultivation));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, Cultivation>();
        local.forEach((c) => mergedMap.set(c.id, c));
        cloud.forEach((c) => mergedMap.set(c.id, c));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      }
    } catch (err) {
      // Fall back to local store
    }
    return local.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  },

  async getCultivationById(id: string, userId?: string): Promise<Cultivation | null> {
    if (userId) {
      const local = localStore.getItems<Cultivation>('cultivations', userId).find((c) => c.id === id);
      if (local) return local;
    }
    try {
      const docRef = doc(db, 'cultivations', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Cultivation;
      }
    } catch (err) {
      // Fallback
    }
    return null;
  },

  async createCultivation(data: Omit<Cultivation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Cultivation> {
    const docRef = doc(collection(db, 'cultivations'));
    const now = new Date().toISOString();
    const newCultivation: Cultivation = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Immediately store in localStore (instant UI update & offline reliability)
    localStore.saveItem('cultivations', newCultivation);

    // 2. Attempt Cloud Firestore write in the background without throwing if API is pending/offline
    try {
      const cleaned = cleanFirestoreData(newCultivation);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Cloud Firestore sync pending or unavailable (persisted locally):', err?.message || err);
      });
    } catch (err) {
      console.warn('Cloud Firestore serialization failed (persisted locally):', err);
    }

    return newCultivation;
  },

  async updateCultivation(id: string, updates: Partial<Cultivation>, userId?: string): Promise<void> {
    const targetUserId = userId || updates.userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const existingList = localStore.getItems<Cultivation>('cultivations', targetUserId);
    const existing = existingList.find((c) => c.id === id);
    if (existing) {
      localStore.saveItem('cultivations', {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      });
    }

    try {
      const docRef = doc(db, 'cultivations', id);
      const cleanedUpdates = cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      updateDoc(docRef, cleanedUpdates).catch((err) => {
        console.warn('Cloud Firestore update pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Cloud Firestore updateDoc failed:', err);
    }
  },

  async deleteCultivation(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('cultivations', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('cultivations', id, lastUid);
    }

    try {
      const docRef = doc(db, 'cultivations', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Cloud Firestore deleteDoc pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Cloud Firestore deleteDoc failed:', err);
    }
  },

  // Date and stage calculation helpers
  calculateDays(startDateStr?: string, endDateStr?: string): number {
    if (!startDateStr) return 1;
    const start = new Date(startDateStr);
    const end = endDateStr ? new Date(endDateStr) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
  },

  calculateStageDays(stageStartDateStr?: string): number {
    if (!stageStartDateStr) return 1;
    return this.calculateDays(stageStartDateStr);
  },

  calculateFloweringDays(floweringStartDateStr?: string): number | null {
    if (!floweringStartDateStr) return null;
    return this.calculateDays(floweringStartDateStr);
  },

  calculateFloweringProgress(floweringStartDateStr?: string, declaredWeeks = 8): number {
    if (!floweringStartDateStr) return 0;
    const days = this.calculateFloweringDays(floweringStartDateStr) || 0;
    const totalTargetDays = (declaredWeeks || 8) * 7;
    return Math.min(100, Math.round((days / totalTargetDays) * 100));
  },

  // Health evaluation strictly derived from real recorded data
  computeHealthStatus(
    cultivation: Cultivation,
    latestWatering?: Watering | null,
    latestEnv?: EnvironmentRecord | null
  ): { status: HealthStatus; reason: string } {
    if (cultivation.isFinished) {
      return { status: 'ESTABLE', reason: 'Ciclo finalizado y registrado.' };
    }

    const issues: string[] = [];

    // Check environment if recorded
    if (latestEnv) {
      if (latestEnv.temperatureC > 32) {
        issues.push(`Temperatura alta registrada (${latestEnv.temperatureC}°C)`);
      } else if (latestEnv.temperatureC < 16) {
        issues.push(`Temperatura baja registrada (${latestEnv.temperatureC}°C)`);
      }

      if (latestEnv.humidityPct > 75 && (cultivation.currentStage === 'Floración' || cultivation.currentStage === 'Maduración')) {
        issues.push(`Humedad elevada en floración (${latestEnv.humidityPct}%)`);
      } else if (latestEnv.humidityPct < 30) {
        issues.push(`Humedad baja registrada (${latestEnv.humidityPct}%)`);
      }
    }

    // Check watering pH / EC if recorded
    if (latestWatering) {
      if (latestWatering.phIn && (latestWatering.phIn < 5.4 || latestWatering.phIn > 7.2)) {
        issues.push(`pH de riego fuera de rango usual (${latestWatering.phIn})`);
      }
      if (latestWatering.ecIn && latestWatering.ecIn > 2.6) {
        issues.push(`EC de riego elevada (${latestWatering.ecIn} mS/cm)`);
      }
    }

    if (issues.length >= 2) {
      return { status: 'ATENCION', reason: issues.join('. ') };
    }
    if (issues.length === 1) {
      return { status: 'REVISAR', reason: issues[0] };
    }

    return {
      status: 'ESTABLE',
      reason: 'No aparecen cambios relevantes según los registros disponibles.'
    };
  }
};
