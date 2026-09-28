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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory, PhotoSyncStatus } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';
import { photoOfflineQueue } from './photoOfflineQueue';
import { getPhotoStoragePath, FIRESTORE_COLLECTIONS } from '../firebase/paths';

export const photoService = {
  /**
   * Suscribe en tiempo real a las fotos del usuario autenticado,
   * unificando resultados remotos de Firestore con elementos pendientes en IndexedDB.
   */
  subscribePhotos(userId: string, callback: (photos: PhotoRecord[]) => void): Unsubscribe {
    // 1. Suscripción a cambios reactivos del almacén local
    const unsubLocal = localStore.subscribe<PhotoRecord>('photos', userId, async (localList) => {
      // Unir con fotos pendientes de IndexedDB
      const pendingItems = await photoOfflineQueue.getQueuedPhotos(userId);
      const mergedMap = new Map<string, PhotoRecord>();

      localList.forEach((p) => mergedMap.set(p.id, p));

      pendingItems.forEach((item) => {
        if (!mergedMap.has(item.id)) {
          mergedMap.set(item.id, {
            id: item.id,
            userId: item.userId,
            cultivationId: item.cultivationId,
            url: item.cloudDownloadUrl || '',
            storagePath: item.storagePath,
            syncStatus: item.status as PhotoSyncStatus,
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
        }
      });

      const sorted = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );
      callback(sorted);
    });

    // 2. Suscripción remota a Cloud Firestore con restricción de propiedad (where userId == userId)
    let unsubFirestore: Unsubscribe = () => {};
    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.PHOTOS),
        where('userId', '==', userId)
      );

      unsubFirestore = onSnapshot(
        q,
        async (snap) => {
          const cloudList = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              isPendingSync: false,
              syncStatus: 'synced',
            } as PhotoRecord;
          });

          // Obtener pendientes de IndexedDB para no pisar fotos que aún se están subiendo
          const pendingItems = await photoOfflineQueue.getQueuedPhotos(userId);
          const currentLocal = localStore.getItems<PhotoRecord>('photos', userId);
          const mergedMap = new Map<string, PhotoRecord>();

          // Primero colocamos las remotas confirmadas
          cloudList.forEach((p) => mergedMap.set(p.id, p));

          // Si hay fotos locales que están pendientes de sincronizar, mantener su estado
          currentLocal.forEach((p) => {
            if (p.isPendingSync) {
              mergedMap.set(p.id, p);
            }
          });

          // Agregar elementos de IndexedDB pendientes
          pendingItems.forEach((item) => {
            const existing = mergedMap.get(item.id);
            if (!existing || existing.isPendingSync) {
              mergedMap.set(item.id, {
                id: item.id,
                userId: item.userId,
                cultivationId: item.cultivationId,
                url: item.cloudDownloadUrl || existing?.url || '',
                storagePath: item.storagePath,
                syncStatus: item.status as PhotoSyncStatus,
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
            }
          });

          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );

          localStore.saveAll('photos', userId, merged);
        },
        (error) => {
          console.warn('[photoService] onSnapshot photos no disponible (modo offline o sin red):', error.message);
        }
      );
    } catch (err) {
      console.warn('[photoService] No se pudo establecer listener en Firestore:', err);
    }

    return () => {
      unsubLocal();
      unsubFirestore();
    };
  },

  /**
   * Obtiene las fotos de un cultivo determinado uniendo remotas y pendientes locales.
   */
  async getPhotosByCultivation(cultivationId: string, userId?: string): Promise<PhotoRecord[]> {
    const targetUserId =
      userId ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('cultiveta_last_user_id') || 'default_user'
        : 'default_user');

    const local = localStore
      .getItems<PhotoRecord>('photos', targetUserId)
      .filter((p) => p.cultivationId === cultivationId);

    const mergedMap = new Map<string, PhotoRecord>();
    local.forEach((p) => mergedMap.set(p.id, p));

    // Agregar pendientes de IndexedDB
    try {
      const pending = await photoOfflineQueue.getQueuedPhotos(targetUserId);
      pending
        .filter((item) => item.cultivationId === cultivationId)
        .forEach((item) => {
          if (!mergedMap.has(item.id)) {
            mergedMap.set(item.id, {
              id: item.id,
              userId: item.userId,
              cultivationId: item.cultivationId,
              url: item.cloudDownloadUrl || '',
              storagePath: item.storagePath,
              syncStatus: item.status as PhotoSyncStatus,
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
          }
        });
    } catch {}

    try {
      const q = query(
        collection(db, FIRESTORE_COLLECTIONS.PHOTOS),
        where('cultivationId', '==', cultivationId),
        where('userId', '==', targetUserId)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const cloudPhoto = { id: d.id, ...d.data(), isPendingSync: false, syncStatus: 'synced' } as PhotoRecord;
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
   * Sube el archivo binario a Firebase Storage utilizando una ruta determinista
   * vinculada a UID, cultivo y photoId (FASE 2).
   * NUNCA captura errores para convertirlos en base64 de mentira.
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
   * 2. Subida a Firebase Storage con identificador estable.
   * 3. Metadatos en Cloud Firestore.
   * 4. Estado visible en la UI.
   *
   * Si la red se corta, NO bloquea el modal: la foto queda encolada de forma segura
   * en IndexedDB con estado 'queued' para que autoSync la complete en background.
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
    previewUrl?: string;
  }): Promise<{ photo: PhotoRecord; enqueuedOffline: boolean }> {
    // 1. Identificador determinista estable generado una única vez
    const photoId = doc(collection(db, FIRESTORE_COLLECTIONS.PHOTOS)).id;
    const ext = params.file.name.split('.').pop() || 'jpg';
    const storagePath = getPhotoStoragePath(params.userId, params.cultivationId, photoId, ext);

    // 2. Encolar en IndexedDB inmediatamente para garantizar que el archivo esté a salvo en disco
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
      previewUrl: params.previewUrl,
    });

    const initialPhoto: PhotoRecord = {
      id: photoId,
      userId: params.userId,
      cultivationId: params.cultivationId,
      url: params.previewUrl || '',
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

    // 3. Si hay conexión a internet activa, intentar sincronizar de inmediato
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      // Disparar sincronización en segundo plano sin bloquear el cierre del modal
      photoOfflineQueue.syncPendingPhotos(params.userId).catch((err) => {
        console.warn('[photoService] Sincronización inmediata pospuesta:', err);
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
      // Puede que no estuviese aún en Storage o ya se hubiese borrado
    }
  },

  async deletePhotoRecord(photoId: string, userId?: string, cultivationId?: string): Promise<void> {
    const targetUid = userId || (auth.currentUser ? auth.currentUser.uid : 'default_user');
    return this.deletePhoto(photoId, targetUid, cultivationId);
  },

  /**
   * Agrega un registro directamente a Firestore y localStore
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
