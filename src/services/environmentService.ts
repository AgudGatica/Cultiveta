import { calculateVPD } from '../utils/vpd';
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
import { EnvironmentRecord } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';
import { authFetch } from './apiClient';
import { cloudWrite } from './cloudWrite';

export const environmentService = {
  subscribeEnvironment(userId: string, callback: (records: EnvironmentRecord[]) => void): Unsubscribe {
    // Sincronizar registros meteorológicos automáticos generados por el backend
    this.fetchServerRecords(userId).catch(() => {});

    return subscribeCollection<EnvironmentRecord>({
      collectionName: 'environmentRecords',
      userId,
      sortFn: (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
      callback,
    });
  },

  async fetchServerRecords(userId: string): Promise<void> {
    try {
      // El servidor toma el usuario del token, no del parámetro.
      const res = await authFetch('/api/outdoor/environment-records');
      if (!res.ok) return;
      const serverRecords: EnvironmentRecord[] = await res.json();
      if (Array.isArray(serverRecords) && serverRecords.length > 0) {
        const currentLocal = localStore.getItems<EnvironmentRecord>('environmentRecords', userId);
        const currentIds = new Set(currentLocal.map((r) => r.id));
        const toAdd = serverRecords.filter((r) => !currentIds.has(r.id));
        if (toAdd.length > 0) {
          localStore.saveAll('environmentRecords', userId, [...currentLocal, ...toAdd]);
        }
      }
    } catch {
      // Benign offline fetch failure
    }
  },

  calculateVPD(airTempC: number, humidityPct: number, leafTempC?: number): number {
    return calculateVPD(airTempC, humidityPct, leafTempC);
  },

  async getEnvironmentRecordsByCultivation(cultivationId: string, userId?: string): Promise<EnvironmentRecord[]> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<EnvironmentRecord>('environmentRecords', targetUserId)
      .filter((e) => e.cultivationId === cultivationId);

    try {
      const q = query(
        collection(db, 'environmentRecords'),
        where('cultivationId', '==', cultivationId),
        where('userId', '==', targetUserId)
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

    const newRecord: EnvironmentRecord & { _isPendingLocal?: boolean } = {
      ...data,
      vpdKPa,
      id: docRef.id,
      createdAt: now,
      _isPendingLocal: true,
    };

    localStore.saveItem('environmentRecords', newRecord as EnvironmentRecord);

    try {
      const cleaned = cleanFirestoreData(newRecord);
      cloudWrite(() => setDoc(docRef, cleaned), () => localStore.saveItem('environmentRecords', { ...newRecord, _isPendingLocal: false } as EnvironmentRecord));
    } catch (err: any) {
      console.warn('Firestore setDoc environmentRecords pending or unavailable:', err?.message || err);
    }

    return newRecord;
  },

  async deleteEnvironmentRecord(id: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('environmentRecords', id, targetUid);

    try {
      const docRef = doc(db, 'environmentRecords', id);
      cloudWrite(() => deleteDoc(docRef));
    } catch (err: any) {
      console.warn('deleteDoc error on environmentRecords:', err);
    }
  }
};
