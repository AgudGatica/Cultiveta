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
import { DiaryEntry } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const diaryService = {
  subscribeDiary(userId: string, callback: (entries: DiaryEntry[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<DiaryEntry>('diaryEntries', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'diaryEntries'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as DiaryEntry))
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<DiaryEntry>('diaryEntries', userId);
            const mergedMap = new Map<string, DiaryEntry>();
            currentLocal.forEach((d) => mergedMap.set(d.id, d));
            cloudList.forEach((d) => mergedMap.set(d.id, d));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
            );
            localStore.saveAll('diaryEntries', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot diaryEntries unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore diaryEntries subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
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
    const newEntry: DiaryEntry = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    localStore.saveItem('diaryEntries', newEntry);

    try {
      const cleaned = cleanFirestoreData(newEntry);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc diaryEntries pending or unavailable:', err?.message || err);
      });
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
      updateDoc(docRef, cleanFirestoreData({
        ...updates,
        updatedAt: new Date().toISOString(),
      })).catch((err) => {
        console.warn('Firestore updateDoc diaryEntries failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('updateDoc error on diaryEntries:', err);
    }
  },

  async deleteDiaryEntry(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('diaryEntries', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('diaryEntries', id, lastUid);
    }
    try {
      const docRef = doc(db, 'diaryEntries', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc diaryEntries failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on diaryEntries:', err);
    }
  }
};
