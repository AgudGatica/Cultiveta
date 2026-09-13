import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { FavoriteGenetic } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

/**
 * Generates a normalized unique key representing a genetics strain based on bank and name.
 */
export function getGeneticsKey(name: string, seedBank: string): string {
  const normBank = (seedBank || 'desconocido').trim().toLowerCase();
  const normName = (name || '').trim().toLowerCase();
  return `${normBank}:::${normName}`;
}

/**
 * Generates a safe, deterministic Firestore document ID for a favorite record.
 */
export function getFavoriteDocId(userId: string, geneticsKey: string): string {
  const safeUid = userId.replace(/[^a-zA-Z0-9]/g, '_');
  const safeKey = encodeURIComponent(geneticsKey).replace(/[^a-zA-Z0-9_]/g, '_');
  return `fav_${safeUid}_${safeKey}`;
}

export const favoritesService = {
  /**
   * Subscribes to real-time updates of the user's favorite genetics.
   * Leverages localStore for immediate offline-first responsiveness and merges with Firestore.
   */
  subscribeFavorites(userId: string, callback: (favorites: FavoriteGenetic[]) => void): Unsubscribe {
    const unsubLocal = localStore.subscribe<FavoriteGenetic>('favoriteGenetics', userId, (localList) => {
      callback(localList.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });

    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'favoriteGenetics'),
        where('userId', '==', userId)
      );

      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const cloudList = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as FavoriteGenetic))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          // Update localStore with cloud data
          const currentLocal = localStore.getItems<FavoriteGenetic>('favoriteGenetics', userId);
          const mergedMap = new Map<string, FavoriteGenetic>();
          currentLocal.forEach((f) => mergedMap.set(f.geneticsKey || f.id, f));
          cloudList.forEach((f) => mergedMap.set(f.geneticsKey || f.id, f));

          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => (a.name || '').localeCompare(b.name || '')
          );
          localStore.saveAll('favoriteGenetics', userId, merged);
        },
        (error) => {
          console.warn('Firestore favoriteGenetics listener unavailable, fallback to localStore:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not initialize Firestore favoriteGenetics subscription:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  /**
   * Retrieves all favorite genetics for a given user.
   */
  async getFavoritesByUser(userId: string): Promise<FavoriteGenetic[]> {
    const local = localStore.getItems<FavoriteGenetic>('favoriteGenetics', userId);
    try {
      const q = query(
        collection(db, 'favoriteGenetics'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      const cloud = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FavoriteGenetic));
      if (cloud.length > 0) {
        const mergedMap = new Map<string, FavoriteGenetic>();
        local.forEach((f) => mergedMap.set(f.geneticsKey || f.id, f));
        cloud.forEach((f) => mergedMap.set(f.geneticsKey || f.id, f));
        return Array.from(mergedMap.values()).sort(
          (a, b) => (a.name || '').localeCompare(b.name || '')
        );
      }
    } catch (e) {
      // Fallback to local
    }
    return local.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  /**
   * Adds a genetics strain to user's favorites in Firestore and localStore.
   */
  async addFavorite(
    userId: string,
    data: {
      name: string;
      seedBank: string;
      geneticsId?: string;
      photoperiodType?: string;
      dominance?: string;
      floweringDays?: string | number;
      estimatedYield?: number;
      organolepticProfile?: string;
    }
  ): Promise<FavoriteGenetic> {
    const geneticsKey = getGeneticsKey(data.name, data.seedBank);
    const docId = getFavoriteDocId(userId, geneticsKey);
    const now = new Date().toISOString();

    const newFavorite: FavoriteGenetic = {
      id: docId,
      userId,
      geneticsKey,
      name: data.name,
      seedBank: data.seedBank,
      geneticsId: data.geneticsId,
      photoperiodType: data.photoperiodType,
      dominance: data.dominance,
      floweringDays: data.floweringDays,
      estimatedYield: data.estimatedYield,
      organolepticProfile: data.organolepticProfile,
      createdAt: now,
    };

    // Save locally first for instant UI response
    localStore.saveItem('favoriteGenetics', newFavorite);

    // Persist to Cloud Firestore
    try {
      const docRef = doc(db, 'favoriteGenetics', docId);
      const cleaned = cleanFirestoreData(newFavorite);
      setDoc(docRef, cleaned).catch((err) => {
        console.warn('Firestore setDoc favoriteGenetics failed or offline:', err?.message || err);
      });
    } catch (err) {
      console.warn('Error saving favorite to Firestore:', err);
    }

    return newFavorite;
  },

  /**
   * Removes a genetics strain from user's favorites in Firestore and localStore.
   */
  async removeFavorite(userId: string, name: string, seedBank: string): Promise<void> {
    const geneticsKey = getGeneticsKey(name, seedBank);
    const docId = getFavoriteDocId(userId, geneticsKey);

    // Delete locally first
    localStore.deleteItem('favoriteGenetics', docId, userId);

    // Delete from Cloud Firestore
    try {
      const docRef = doc(db, 'favoriteGenetics', docId);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteDoc favoriteGenetics failed or offline:', err?.message || err);
      });
    } catch (err) {
      console.warn('Error removing favorite from Firestore:', err);
    }
  },

  /**
   * Toggles favorite state: if favorite, removes it; if not, adds it.
   */
  async toggleFavorite(
    userId: string,
    isCurrentlyFav: boolean,
    data: {
      name: string;
      seedBank: string;
      geneticsId?: string;
      photoperiodType?: string;
      dominance?: string;
      floweringDays?: string | number;
      estimatedYield?: number;
      organolepticProfile?: string;
    }
  ): Promise<boolean> {
    if (isCurrentlyFav) {
      await this.removeFavorite(userId, data.name, data.seedBank);
      return false;
    } else {
      await this.addFavorite(userId, data);
      return true;
    }
  }
};
