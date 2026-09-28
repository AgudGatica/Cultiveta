import {
  collection,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { localStore } from './localStore';

export interface SyncMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
  isInitial: boolean;
  empty: boolean;
}

export interface SubscribeCollectionOptions<T> {
  collectionName: string;
  userId: string;
  sortFn?: (a: T, b: T) => number;
  callback: (items: T[], metadata?: SyncMetadata) => void;
  onError?: (error: Error) => void;
}

/**
 * Universal real-time subscription helper for Cultiveta entities.
 *
 * Guarantees:
 * 1. Immediate 0ms local emission if cached items exist in localStore.
 * 2. Real-time authoritative updates from Firestore onSnapshot.
 * 3. Correct processing of DELETIONS and EMPTY collections without leaving zombie records.
 * 4. Preservation of local items that are truly pending synchronization (_isPendingLocal).
 * 5. Direct callback invocation so UI reactivity never depends on localStorage write success.
 * 6. Visible error handling on permission or network failures.
 * 7. Clean cancellation on user logout or account switch.
 */
export function subscribeCollection<T extends { id: string; userId?: string; _isPendingLocal?: boolean }>(
  options: SubscribeCollectionOptions<T>
): Unsubscribe {
  const { collectionName, userId, sortFn, callback, onError } = options;

  let isCancelled = false;
  let initialEmitted = false;
  let hasReceivedServerResponse = false;

  // 1. Immediate local cache emission for instant UI rendering
  try {
    const localItems = localStore.getItems<T>(collectionName, userId);
    if (localItems.length > 0) {
      const sorted = sortFn ? [...localItems].sort(sortFn) : localItems;
      callback(sorted, {
        fromCache: true,
        hasPendingWrites: false,
        isInitial: true,
        empty: sorted.length === 0,
      });
      initialEmitted = true;
    }
  } catch (err) {
    console.warn(`[dataSyncHelper] Error reading local cache for ${collectionName}:`, err);
  }

  // 2. React to local store optimistic events
  const unsubLocal = localStore.subscribe<T>(collectionName, userId, (updatedLocal) => {
    if (isCancelled) return;
    const sorted = sortFn ? [...updatedLocal].sort(sortFn) : updatedLocal;
    callback(sorted, {
      fromCache: true,
      hasPendingWrites: true,
      isInitial: !initialEmitted,
      empty: sorted.length === 0,
    });
  });

  // 3. Cloud Firestore real-time onSnapshot listener
  let unsubFirestore: Unsubscribe = () => {};
  try {
    const q = query(collection(db, collectionName), where('userId', '==', userId));

    unsubFirestore = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap: QuerySnapshot<DocumentData>) => {
        if (isCancelled) return;
        initialEmitted = true;

        const fromCache = snap.metadata.fromCache;
        const hasPendingWrites = snap.metadata.hasPendingWrites;

        if (!fromCache) {
          hasReceivedServerResponse = true;
        }

        const cloudList: T[] = snap.docs.map((d) => {
          const docData = d.data();
          return {
            id: d.id,
            ...docData,
            _isPendingLocal: d.metadata.hasPendingWrites,
            _fromCache: fromCache,
          } as unknown as T;
        });

        // Identify local items that were created offline or pending and haven't hit Firestore snapshot yet
        const currentLocal = localStore.getItems<T>(collectionName, userId);

        // CONDICIÓN CRÍTICA: No interpretar un snapshot de caché vacío como una eliminación remota confirmada
        // Si el snapshot proviene de caché, está vacío y el servidor aún no ha respondido,
        // pero tenemos datos locales existentes, conservamos los datos locales para no dejar la vista vacía.
        if (fromCache && snap.empty && !hasReceivedServerResponse && currentLocal.length > 0) {
          const preservedList = sortFn ? [...currentLocal].sort(sortFn) : currentLocal;
          callback(preservedList, {
            fromCache: true,
            hasPendingWrites: false,
            isInitial: false,
            empty: preservedList.length === 0,
          });
          return;
        }

        const cloudIds = new Set(cloudList.map((c) => c.id));

        const pendingLocalItems = currentLocal.filter(
          (item) => Boolean(item._isPendingLocal) && !cloudIds.has(item.id)
        );

        // Firestore is authoritative for all existing and deleted documents
        const mergedMap = new Map<string, T>();
        cloudList.forEach((item) => mergedMap.set(item.id, item));
        pendingLocalItems.forEach((item) => mergedMap.set(item.id, item));

        const finalList = Array.from(mergedMap.values());
        if (sortFn) {
          finalList.sort(sortFn);
        }

        // DIRECT EMISSION TO REACT: UI updates immediately without waiting for localStorage
        callback(finalList, {
          fromCache,
          hasPendingWrites,
          isInitial: false,
          empty: finalList.length === 0,
        });

        // ASYNC BACKUP TO LOCAL STORE: Keeps local store in sync with deletions and empty lists
        // Solo sobrescribir almacén local si proviene del servidor o hay documentos
        if (!fromCache || cloudList.length > 0 || hasReceivedServerResponse) {
          try {
            localStore.saveAll(collectionName, userId, finalList);
          } catch (saveErr) {
            console.warn(`[dataSyncHelper] Could not persist backup for ${collectionName}:`, saveErr);
          }
        }
      },
      (error) => {
        if (isCancelled) return;
        console.warn(`[dataSyncHelper] onSnapshot error for ${collectionName}:`, error.message);

        if (onError) {
          onError(error);
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('cultiveta_listener_error', {
              detail: {
                collection: collectionName,
                code: (error as any)?.code,
                message:
                  (error as any)?.code === 'permission-denied'
                    ? `Permisos denegados en la colección ${collectionName}. Verifica tu sesión.`
                    : `Firestore sin conexión para ${collectionName}. Usando datos locales.`,
              },
            })
          );
        }

        // Mark initial emission so skeleton doesn't hang indefinitely if offline and cache is empty
        if (!initialEmitted) {
          initialEmitted = true;
          const fallback = localStore.getItems<T>(collectionName, userId);
          const sorted = sortFn ? [...fallback].sort(sortFn) : fallback;
          callback(sorted, {
            fromCache: true,
            hasPendingWrites: false,
            isInitial: false,
            empty: sorted.length === 0,
          });
        }
      }
    );
  } catch (err) {
    console.warn(`[dataSyncHelper] Failed to setup onSnapshot for ${collectionName}:`, err);
    if (!initialEmitted) {
      initialEmitted = true;
      const fallback = localStore.getItems<T>(collectionName, userId);
      const sorted = sortFn ? [...fallback].sort(sortFn) : fallback;
      callback(sorted, {
        fromCache: true,
        hasPendingWrites: false,
        isInitial: false,
        empty: sorted.length === 0,
      });
    }
  }

  return () => {
    isCancelled = true;
    unsubLocal();
    unsubFirestore();
  };
}
