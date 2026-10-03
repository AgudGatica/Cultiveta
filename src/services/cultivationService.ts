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
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cultivation, HealthStatus, Watering, EnvironmentRecord } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';
import { daysBetween, getLocalTodayDateOnly } from '../utils/growthStageUtils';

export const cultivationService = {
  subscribeCultivations(userId: string, callback: (cultivations: Cultivation[]) => void): Unsubscribe {
    return subscribeCollection<Cultivation>({
      collectionName: 'cultivations',
      userId,
      sortFn: (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      callback: (list) => {
        callback(list);

        // Registrar cultivos de exterior en el backend para el cron
        list.forEach((c) => {
          if (
            !c.isFinished &&
            c.locationCoordinates &&
            (c.type === 'Outdoor' || c.type === 'Invernadero')
          ) {
            fetch('/api/outdoor/cultivations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(c),
            }).catch(() => {});
          }
        });
      },
    });
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
    const newCultivation: Cultivation & { _isPendingLocal?: boolean } = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
      _isPendingLocal: true,
    };

    // 1. Immediately store in localStore (instant UI update & offline reliability)
    localStore.saveItem('cultivations', newCultivation as Cultivation);

    // Si es un cultivo exterior/invernadero con coordenadas, registrarlo en el backend para el cron
    if (
      newCultivation.locationCoordinates &&
      (newCultivation.type === 'Outdoor' || newCultivation.type === 'Invernadero')
    ) {
      fetch('/api/outdoor/cultivations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCultivation),
      }).catch(() => {});
    }

    // 2. Cloud Firestore write with pending status update upon confirmation
    try {
      const cleaned = cleanFirestoreData(newCultivation);
      await setDoc(docRef, cleaned);
      localStore.saveItem('cultivations', { ...newCultivation, _isPendingLocal: false } as Cultivation);
    } catch (err: any) {
      console.warn('Cloud Firestore sync pending or unavailable (persisted locally):', err?.message || err);
    }

    return newCultivation;
  },

  async updateCultivation(id: string, updates: Partial<Cultivation>, userId?: string): Promise<void> {
    const targetUserId = userId || updates.userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const existingList = localStore.getItems<Cultivation>('cultivations', targetUserId);
    const existing = existingList.find((c) => c.id === id);
    if (existing) {
      const updatedItem = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      localStore.saveItem('cultivations', updatedItem);

      if (
        updatedItem.locationCoordinates &&
        (updatedItem.type === 'Outdoor' || updatedItem.type === 'Invernadero')
      ) {
        fetch('/api/outdoor/cultivations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedItem),
        }).catch(() => {});
      }
    }

    try {
      const docRef = doc(db, 'cultivations', id);
      const cleanedUpdates = cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      await setDoc(docRef, cleanedUpdates, { merge: true });
    } catch (err) {
      console.warn('Cloud Firestore update failed (saved locally):', err);
    }
  },

  async deleteCultivation(id: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('cultivations', id, targetUid);

    try {
      const docRef = doc(db, 'cultivations', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('Cloud Firestore deleteDoc failed (deleted locally):', err);
    }
  },

  // Date and stage calculation helpers
  calculateDays(startDateStr?: string, endDateStr?: string): number {
    if (!startDateStr) return 1;
    const endStr = endDateStr || getLocalTodayDateOnly();
    const diff = daysBetween(startDateStr, endStr);
    return Math.max(1, diff + 1);
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
