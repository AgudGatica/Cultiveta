import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { PhotoRecord } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export const photoService = {
  subscribePhotos(userId: string, callback: (photos: PhotoRecord[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<PhotoRecord>('photos', userId, (localList) => {
      callback(localList.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'photos'),
        where('userId', '==', userId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PhotoRecord))
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

          if (cloudList.length > 0) {
            const currentLocal = localStore.getItems<PhotoRecord>('photos', userId);
            const mergedMap = new Map<string, PhotoRecord>();
            currentLocal.forEach((p) => mergedMap.set(p.id, p));
            cloudList.forEach((p) => mergedMap.set(p.id, p));
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
            );
            localStore.saveAll('photos', userId, merged);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot photos unavailable, using local:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not establish Firestore photos subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  async getPhotosByCultivation(cultivationId: string, userId?: string): Promise<PhotoRecord[]> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const local = localStore.getItems<PhotoRecord>('photos', targetUserId)
      .filter((p) => p.cultivationId === cultivationId);

    try {
      const q = query(
        collection(db, 'photos'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PhotoRecord));

      if (cloud.length > 0) {
        const mergedMap = new Map<string, PhotoRecord>();
        local.forEach((p) => mergedMap.set(p.id, p));
        cloud.forEach((p) => mergedMap.set(p.id, p));
        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );
      }
    } catch (e) {
      // Fallback
    }
    return local.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  },

  async uploadPhotoFile(userId: string, cultivationId: string, file: File): Promise<string> {
    try {
      const timestamp = Date.now();
      const storageRef = ref(storage, `users/${userId}/cultivations/${cultivationId}/${timestamp}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (err) {
      console.warn('Storage upload fallback to compressed base64', err);
      return await this.compressAndReadFileAsDataUrl(file);
    }
  },

  compressAndReadFileAsDataUrl(file: File, maxDimension = 1200, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async addPhotoRecord(data: Omit<PhotoRecord, 'id' | 'createdAt'>): Promise<PhotoRecord> {
    const docRef = doc(collection(db, 'photos'));
    const now = new Date().toISOString();
    const newPhoto: PhotoRecord = {
      ...data,
      id: docRef.id,
      createdAt: now,
    };

    localStore.saveItem('photos', newPhoto);

    try {
      const cleaned = cleanFirestoreData(newPhoto);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc photos pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on photoRecord:', err);
    }

    return newPhoto;
  },

  async deletePhotoRecord(id: string, userId?: string): Promise<void> {
    if (userId) {
      localStore.deleteItem('photos', id, userId);
    } else if (typeof window !== 'undefined') {
      const lastUid = localStorage.getItem('cultiveta_last_user_id') || 'default_user';
      localStore.deleteItem('photos', id, lastUid);
    }
    try {
      const docRef = doc(db, 'photos', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc photos failed:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on photos:', err);
    }
  }
};
