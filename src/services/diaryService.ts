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
import { DiaryEntry } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { subscribeCollection } from './dataSyncHelper';

export const diaryService = {
  subscribeDiary(userId: string, callback: (entries: DiaryEntry[]) => void): Unsubscribe {
    return subscribeCollection<DiaryEntry>({
      collectionName: 'diaryEntries',
      userId,
      sortFn: (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
      callback,
    });
  },

  async getDiaryEntriesByCultivation(cultivationId: string, userId?: string): Promise<DiaryEntry[]> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<DiaryEntry>('diaryEntries', targetUserId)
      .filter((d) => d.cultivationId === cultivationId);

    try {
      const q = query(
        collection(db, 'diaryEntries'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as DiaryEntry));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, DiaryEntry>();
        local.forEach((d) => mergedMap.set(d.id, d));
        cloud.forEach((d) => mergedMap.set(d.id, d));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );
      }
    } catch (e) {
      // Fallback
    }
    return local.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  },

  async addDiaryEntry(data: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<DiaryEntry> {
    const docRef = doc(collection(db, 'diaryEntries'));
    const now = new Date().toISOString();
    const newEntry: DiaryEntry & { _isPendingLocal?: boolean } = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
      _isPendingLocal: true,
    };

    localStore.saveItem('diaryEntries', newEntry as DiaryEntry);

    try {
      const cleaned = cleanFirestoreData(newEntry);
      await setDoc(docRef, cleaned);
      localStore.saveItem('diaryEntries', { ...newEntry, _isPendingLocal: false } as DiaryEntry);
    } catch (err) {
      console.warn('Serialization error on diaryEntry:', err);
    }

    return newEntry;
  },

  async updateDiaryEntry(id: string, updates: Partial<DiaryEntry>, userId?: string): Promise<void> {
    const targetUserId = userId || updates.userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const existingList = localStore.getItems<DiaryEntry>('diaryEntries', targetUserId);
    const existing = existingList.find((d) => d.id === id);
    if (existing) {
      localStore.saveItem('diaryEntries', {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      const docRef = doc(db, 'diaryEntries', id);
      await setDoc(docRef, cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    } catch (err) {
      console.warn('updateDoc error on diaryEntries:', err);
    }
  },

  async deleteDiaryEntry(id: string, userId?: string): Promise<void> {
    const targetUid = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('diaryEntries', id, targetUid);

    try {
      const docRef = doc(db, 'diaryEntries', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn('deleteDoc error on diaryEntries:', err);
    }
  }
};
