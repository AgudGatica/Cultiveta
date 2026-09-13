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
import { EnvironmentRecord } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const environmentService = {
  subscribeEnvironment(userId: string, callback: (records: EnvironmentRecord[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<EnvironmentRecord>('environmentRecords', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'environmentRecords'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as EnvironmentRecord))
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<EnvironmentRecord>('environmentRecords', userId);
            const mergedMap = new Map<string, EnvironmentRecord>();
            currentLocal.forEach((e) => mergedMap.set(e.id, e));
            cloudList.forEach((e) => mergedMap.set(e.id, e));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
            );
            localStore.saveAll('environmentRecords', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot environmentRecords unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore environmentRecords subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  calculateVPD(airTempC: number, humidityPct: number, leafTempC?: number): number {
    const leafTemp = leafTempC ?? airTempC - 2;
    const vpsat = 0.61078 * Math.exp((17.27 * leafTemp) / (leafTemp + 237.3));
    const vpair = 0.61078 * Math.exp((17.27 * airTempC) / (airTempC + 237.3)) * (humidityPct / 100);
    return Number(Math.max(0, vpsat - vpair).toFixed(2));
  },

  async getEnvironmentRecordsByCultivation(cultivationId: string, userId?: string): Promise<EnvironmentRecord[]> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<EnvironmentRecord>('environmentRecords', targetUserId)
      .filter((e) => e.cultivationId === cultivationId);

    try {
      const q = query(
        collection(db, 'environmentRecords'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as EnvironmentRecord));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, EnvironmentRecord>();
        local.forEach((e) => mergedMap.set(e.id, e));
        cloud.forEach((e) => mergedMap.set(e.id, e));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
        );
      }
    } catch (e) {
      // Fallback
    }
    return local.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  },

  async getLatestEnvironmentRecord(cultivationId: string, userId?: string): Promise<EnvironmentRecord | null> {
    const records = await this.getEnvironmentRecordsByCultivation(cultivationId, userId);
    return records.length > 0 ? records[records.length - 1] : null;
  },

  async addEnvironmentRecord(data: Omit<EnvironmentRecord, 'id' | 'createdAt'>): Promise<EnvironmentRecord> {
    const docRef = doc(collection(db, 'environmentRecords'));
    const now = new Date().toISOString();

    let vpdKPa = data.vpdKPa;
    if (!vpdKPa && data.temperatureC && data.humidityPct) {
      vpdKPa = this.calculateVPD(data.temperatureC, data.humidityPct, data.leafTempC);
    }

    const newRecord: EnvironmentRecord = {
      ...data,
      vpdKPa,
      id: docRef.id,
      createdAt: now,
    };

    localStore.saveItem('environmentRecords', newRecord);

    try {
      const cleaned = cleanFirestoreData(newRecord);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc environmentRecords pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on environmentRecord:', err);
    }

    return newRecord;
  },

  async deleteEnvironmentRecord(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('environmentRecords', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('environmentRecords', id, lastUid);
    }
    try {
      const docRef = doc(db, 'environmentRecords', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc environmentRecords failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on environmentRecords:', err);
    }
  }
};
