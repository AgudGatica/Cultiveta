import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory, PhotoSyncStatus } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import {
  photoOfflineQueue,
  QueuedOfflinePhoto,
  mapQueueStatusToSyncStatus,
} from './photoOfflineQueue';
import { getPhotoStoragePath, FIRESTORE_COLLECTIONS } from '../firebase/paths';

export const photoService = {
  /**
   * Suscribe en tiempo real a las fotos del usuario autenticado,
   * combinando reactivamente Firestore e IndexedDB (cola offline).
   *
   * Garantías:
   * 1. Reactividad directa: escucha cambios de Firestore Y de la cola IndexedDB sin intermediación obligatoria de localStorage.
   * 2. No confía en URLs blob: caducadas de sesiones anteriores.
   * 3. No interpreta un snapshot de caché vacío como una eliminación remota confirmada.
   * 4. Deduplica por ID y preserva estados pendientes de la cola con prioridad en UI.
   * 5. Conversión explícita de status (failed -> error).
   * 6. Evita callbacks obsoletos ante cambio de UID o desmontaje.
   */
  subscribePhotos(userId: string, callback: (photos: PhotoRecord[]) => void): Unsubscribe {
    let isCancelled = false;
    let hasServerResponded = false;

    // Mapas en memoria para reconciliación en tiempo real
    const firestoreMap = new Map<string, PhotoRecord>();
    const queueMap = new Map<string, QueuedOfflinePhoto>();
    const localCacheMap = new Map<string, PhotoRecord>();

    // 0. Cargar caché previo de localStore para emisión instantánea (0ms)
    try {
      const initialLocal = localStore.getItems<PhotoRecord>('photos', userId);
      initialLocal.forEach((p) => {
        // Sanitizar URLs blob: caducadas que pudieran estar en localStorage de versiones anteriores
        const cleanUrl = p.url && p.url.startsWith('blob:') ? '' : p.url;
        localCacheMap.set(p.id, { ...p, url: cleanUrl });
      });

      if (localCacheMap.size > 0) {
        const initialSorted = Array.from(localCacheMap.values()).sort(
          (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );
        callback(initialSorted);
      }
    } catch {
      // Ignorar error de lectura inicial
    }

    // Función unificada de recombinación y emisión
    const emitCombined = () => {
      if (isCancelled) return;

      const merged = new Map<string, PhotoRecord>();

      // 1. Fotos confirmadas de Firestore o del caché local
      if (hasServerResponded) {
        firestoreMap.forEach((doc) => merged.set(doc.id, doc));
      } else {
        // Aún no responde el servidor: combinar lo que tenga Firestore con el caché local preexistente
        localCacheMap.forEach((doc) => merged.set(doc.id, doc));
        firestoreMap.forEach((doc) => merged.set(doc.id, doc));
      }

      // 2. Elementos pendientes de IndexedDB (tienen prioridad para estados de sincronización)
      queueMap.forEach((item) => {
        const existing = merged.get(item.id);
        const effectiveUrl =
          item.cloudDownloadUrl ||
          (existing?.url && !existing.url.startsWith('blob:') ? existing.url : '');

        merged.set(item.id, {
          id: item.id,
          userId: item.userId,
          cultivationId: item.cultivationId,
          url: effectiveUrl,
          storagePath: item.storagePath,
          syncStatus: mapQueueStatusToSyncStatus(item.status),
          syncError: item.lastError,
          fileSize: item.fileSize,
          mimeType: item.fileType,
          date: item.date,
          dayOfCultivation: item.dayOfCultivation,
          stage: item.stage,
          category: item.category,
          caption: item.caption,
          isDemo: item.isDemo,
          isPendingSync: true,
          createdAt: item.createdAt,
        });
      });

      const sorted = Array.from(merged.values()).sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );

      // Emisión directa a React independiente de localStorage
      callback(sorted);

      // Respaldo secundario en localStore solo si hay datos válidos y autoritativos
      if (hasServerResponded || sorted.length > 0) {
        try {
          localStore.saveAll('photos', userId, sorted);
        } catch {
          // Quota safe
        }
      }
    };

    // 1. Suscripción directa y reactiva a la cola de IndexedDB
    const unsubQueue = photoOfflineQueue.subscribeQueue((queuedItems) => {
      if (isCancelled) return;
      queueMap.clear();
      queuedItems.forEach((item) => {
        if (item.userId === userId) {
          queueMap.set(item.id, item);
        }
      });
      emitCombined();
    }, userId);

    // 2. Suscripción reactiva a Cloud Firestore con includeMetadataChanges
    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.PHOTOS),
        where('userId', '==', userId)
      );

      unsubFirestore = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          if (isCancelled) return;

          const fromCache = snap.metadata.fromCache;
          const hasPendingWrites = snap.metadata.hasPendingWrites;

          if (!fromCache) {
            hasServerResponded = true;
          }

          // CONDICIÓN CRÍTICA: No interpretar un snapshot de caché vacío como una eliminación remota confirmada
          if (fromCache && snap.empty && !hasServerResponded && localCacheMap.size > 0) {
            // El servidor no ha respondido y la caché de Firestore está fría; conservar localCacheMap
            emitCombined();
            return;
          }

          firestoreMap.clear();
          snap.docs.forEach((d) => {
            const data = d.data();
            const cleanUrl = data.url && data.url.startsWith('blob:') ? '' : (data.url || '');

            firestoreMap.set(d.id, {
              id: d.id,
              ...data,
              url: cleanUrl,
              isPendingSync: hasPendingWrites || d.metadata.hasPendingWrites,
              syncStatus: (hasPendingWrites || d.metadata.hasPendingWrites) ? 'saving_metadata' : 'synced',
            } as PhotoRecord);
          });

          emitCombined();
        },
        (error) => {
          if (isCancelled) return;
          console.warn('[photoService] onSnapshot photos no disponible (modo offline o sin red):', error.message);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('cultiveta_listener_error', {
                detail: {
                  collection: 'photos',
                  code: (error as any)?.code,
                  message:
                    (error as any)?.code === 'permission-denied'
                      ? 'Error de permisos al leer fotografías.'
                      : 'Modo sin conexión en galería fotográfica.',
                },
              })
            );
          }
        }
      );
    } catch (err) {
      console.warn('[photoService] No se pudo establecer listener en Firestore:', err);
    }

    return () => {
      isCancelled = true;
      unsubQueue();
      unsubFirestore();
    };
  },

  /**
   * Obtiene las fotos de un cultivo determinado uniendo remotas y pendientes locales.
   */
  async getPhotosByCultivation(cultivationId: string, userId?: string): Promise<PhotoRecord[]> {
    const targetUserId =
      userId ||
      (auth.currentUser ? auth.currentUser.uid : 'default_user');

    const mergedMap = new Map<string, PhotoRecord>();

    // 1. LocalStore
    try {
      const local = localStore
        .getItems<PhotoRecord>('photos', targetUserId)
        .filter((p) => p.cultivationId === cultivationId);
      local.forEach((p) => {
        const cleanUrl = p.url && p.url.startsWith('blob:') ? '' : p.url;
        mergedMap.set(p.id, { ...p, url: cleanUrl });
      });
    } catch {}

    // 2. Agregar pendientes de IndexedDB
    try {
      const pending = await photoOfflineQueue.getQueuedPhotos(targetUserId);
      pending
        .filter((item) => item.cultivationId === cultivationId)
        .forEach((item) => {
          const existing = mergedMap.get(item.id);
          mergedMap.set(item.id, {
            id: item.id,
            userId: item.userId,
            cultivationId: item.cultivationId,
            url: item.cloudDownloadUrl || existing?.url || '',
            storagePath: item.storagePath,
            syncStatus: mapQueueStatusToSyncStatus(item.status),
            syncError: item.lastError,
            fileSize: item.fileSize,
            mimeType: item.fileType,
            date: item.date,
            dayOfCultivation: item.dayOfCultivation,
            stage: item.stage,
            category: item.category,
            caption: item.caption,
            isDemo: item.isDemo,
            isPendingSync: true,
            createdAt: item.createdAt,
          });
        });
    } catch {}

    // 3. Firestore query
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.PHOTOS),
        where('cultivationId', '==', cultivationId),
        where('userId', '==', targetUserId)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const cloudPhoto = {
          id: d.id,
          ...d.data(),
          isPendingSync: false,
          syncStatus: 'synced' as PhotoSyncStatus,
        } as PhotoRecord;
        mergedMap.set(d.id, cloudPhoto);
      });
    } catch {
      // Offline fallback
    }

    return Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
  },

  /**
   * Sube el archivo binario a Firebase Storage utilizando una ruta determinista.
   */
  async uploadPhotoFile(
    userId: string,
    cultivationId: string,
    photoIdOrFile: string | File | Blob,
    fileOrExt?: File | Blob | string,
    extension = 'jpg'
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    let photoId: string;
    let file: File | Blob;
    let ext = extension;

    if (typeof photoIdOrFile === 'string') {
      photoId = photoIdOrFile;
      file = fileOrExt as File | Blob;
    } else {
      photoId = 'photo_' + Date.now();
      file = photoIdOrFile;
      ext = typeof fileOrExt === 'string' ? fileOrExt : ((file as File).name?.split('.').pop() || 'jpg');
    }

    const storagePath = getPhotoStoragePath(userId, cultivationId, photoId, ext);
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg',
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return { downloadUrl, storagePath };
  },

  /**
   * Guarda una foto separando:
   * 1. Binario en IndexedDB (respaldo local garantizado).
   * 2. NO almacena URLs blob: efímeras en localStorage ni Firestore.
   * 3. Dispara sincronización en segundo plano sin bloquear el cierre del modal ni la UI.
   */
  async savePhotoWithOfflineFallback(params: {
    userId: string;
    cultivationId: string;
    file: File;
    date: string;
    dayOfCultivation: number;
    stage: CultivationStageName;
    category: PhotoCategory;
    caption?: string;
    isDemo?: boolean;
    previewUrl?: string; // Mantenido para retrocompatibilidad de firma, pero ignorado para persistencia
  }): Promise<{ photo: PhotoRecord; enqueuedOffline: boolean }> {
    // 1. Identificador determinista único
    const photoId = doc(collection(db, FIRESTORE_COLLECTIONS.PHOTOS)).id;
    const ext = params.file.name.split('.').pop() || 'jpg';
    const storagePath = getPhotoStoragePath(params.userId, params.cultivationId, photoId, ext);

    // 2. Encolar en IndexedDB inmediatamente para garantizar que el archivo binario esté seguro
    await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: params.userId,
      cultivationId: params.cultivationId,
      file: params.file,
      fileName: params.file.name,
      fileType: params.file.type,
      date: params.date,
      dayOfCultivation: params.dayOfCultivation,
      stage: params.stage,
      category: params.category,
      caption: params.caption,
      isDemo: params.isDemo,
    });

    const initialPhoto: PhotoRecord = {
      id: photoId,
      userId: params.userId,
      cultivationId: params.cultivationId,
      url: '', // usePhotoPreview resolverá dinámicamente desde IndexedDB sin URLs revocadas
      storagePath,
      syncStatus: 'queued',
      fileSize: params.file.size,
      mimeType: params.file.type,
      date: params.date,
      dayOfCultivation: params.dayOfCultivation,
      stage: params.stage,
      category: params.category,
      caption: params.caption,
      isDemo: params.isDemo,
      isPendingSync: true,
      createdAt: new Date().toISOString(),
    };

    // 3. Si hay conexión a internet activa, disparar sincronización en segundo plano de forma no bloqueante
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      photoOfflineQueue.syncPendingPhotos(params.userId).catch((err) => {
        console.warn('[photoService] Sincronización en segundo plano pospuesta:', err);
      });
    }

    return { photo: initialPhoto, enqueuedOffline: true };
  },

  /**
   * Elimina una fotografía tanto remotamente (Firestore + Storage) como localmente (IndexedDB + localStore).
   */
  async deletePhoto(photoId: string, userId: string, cultivationId?: string, storagePath?: string): Promise<void> {
    // 1. Limpiar de IndexedDB si estuviese en cola
    await photoOfflineQueue.cleanupConfirmedPhoto(photoId);

    // 2. Limpiar de localStore
    localStore.deleteItem('photos', photoId, userId);

    // 3. Eliminar documento de Cloud Firestore
    try {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.PHOTOS, photoId);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('[photoService] Error al eliminar documento en Firestore:', e);
    }

    // 4. Eliminar archivo de Firebase Storage
    try {
      const targetPath =
        storagePath ||
        (cultivationId ? getPhotoStoragePath(userId, cultivationId, photoId) : null);

      if (targetPath) {
        const storageRef = ref(storage, targetPath);
        await deleteObject(storageRef);
      }
    } catch (e) {
      // Ignorar si no existía en Storage
    }
  },

  async deletePhotoRecord(photoId: string, userId?: string, cultivationId?: string): Promise<void> {
    const targetUid = userId || (auth.currentUser ? auth.currentUser.uid : 'default_user');
    return this.deletePhoto(photoId, targetUid, cultivationId);
  },

  /**
   * Agrega un registro directamente a Firestore y localStore.
   */
  async addPhotoRecord(data: Omit<PhotoRecord, 'id' | 'createdAt'>): Promise<PhotoRecord> {
    const docRef = doc(collection(db, FIRESTORE_COLLECTIONS.PHOTOS));
    const now = new Date().toISOString();
    const newPhoto: PhotoRecord = {
      ...data,
      id: docRef.id,
      createdAt: now,
      syncStatus: 'synced',
      isPendingSync: false,
    };

    localStore.saveItem('photos', newPhoto);

    try {
      const cleaned = cleanFirestoreData(newPhoto);
      await setDoc(docRef, cleaned);
    } catch (err) {
      console.warn('[photoService] Fallo guardando photoRecord en Firestore:', err);
    }

    return newPhoto;
  },
};
