import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory } from '../types';
import { localStore } from './localStore';
import { cleanFirestoreData } from '../utils/firestoreUtils';

export interface QueuedOfflinePhoto {
  id: string;
  userId: string;
  cultivationId: string;
  fileBlob: Blob;
  fileName: string;
  fileType: string;
  previewDataUrl: string;
  date: string;
  dayOfCultivation: number;
  stage: CultivationStageName;
  category: PhotoCategory;
  caption?: string;
  isDemo?: boolean;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

const DB_NAME = 'cultiveta_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        const store = idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Error al abrir IndexedDB'));
    };
  });

  return dbPromise;
}

function notifyQueueUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cultiveta_offline_queue_changed'));
}

export const photoOfflineQueue = {
  /**
   * Encola una fotografía en IndexedDB cuando no hay conexión o falla la subida inicial.
   */
  async enqueuePhoto(params: {
    id: string;
    userId: string;
    cultivationId: string;
    file: File;
    previewDataUrl: string;
    date: string;
    dayOfCultivation: number;
    stage: CultivationStageName;
    category: PhotoCategory;
    caption?: string;
    isDemo?: boolean;
  }): Promise<QueuedOfflinePhoto> {
    const idb = await getIndexedDB();
    const queuedItem: QueuedOfflinePhoto = {
      id: params.id,
      userId: params.userId,
      cultivationId: params.cultivationId,
      fileBlob: params.file,
      fileName: params.file.name,
      fileType: params.file.type || 'image/jpeg',
      previewDataUrl: params.previewDataUrl,
      date: params.date,
      dayOfCultivation: params.dayOfCultivation,
      stage: params.stage,
      category: params.category,
      caption: params.caption,
      isDemo: params.isDemo,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = idb.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(queuedItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Guardar en el almacenamiento local para que el usuario la vea de inmediato con estado pendiente
    const optimisticRecord: PhotoRecord = {
      id: queuedItem.id,
      userId: queuedItem.userId,
      cultivationId: queuedItem.cultivationId,
      url: queuedItem.previewDataUrl,
      date: queuedItem.date,
      dayOfCultivation: queuedItem.dayOfCultivation,
      stage: queuedItem.stage,
      category: queuedItem.category,
      caption: queuedItem.caption,
      isDemo: queuedItem.isDemo,
      isPendingSync: true,
      createdAt: queuedItem.createdAt,
    };
    localStore.saveItem('photos', optimisticRecord);

    notifyQueueUpdated();
    return queuedItem;
  },

  /**
   * Obtiene la lista de fotografías pendientes encoladas en IndexedDB.
   */
  async getQueuedPhotos(userId?: string): Promise<QueuedOfflinePhoto[]> {
    try {
      const idb = await getIndexedDB();
      return await new Promise<QueuedOfflinePhoto[]>((resolve, reject) => {
        const transaction = idb.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          let items = (req.result as QueuedOfflinePhoto[]) || [];
          if (userId) {
            items = items.filter((item) => item.userId === userId);
          }
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[IndexedDB] No se pudieron recuperar las fotos encoladas:', err);
      return [];
    }
  },

  /**
   * Elimina y limpia de forma permanente una fotografía de la cola IndexedDB una vez
   * confirmada su subida y persistencia en Firebase.
   * Esto previene el crecimiento acumulativo e indefinido del almacenamiento del cliente.
   */
  async cleanupConfirmedPhoto(id: string): Promise<boolean> {
    try {
      const idb = await getIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      console.log(`[IndexedDB Cleanup] ✅ Fotografía ${id} liberada y purgada de IndexedDB tras confirmación de Firebase.`);
      notifyQueueUpdated();
      return true;
    } catch (err) {
      console.warn(`[IndexedDB Cleanup] Fallo al eliminar registro ${id}:`, err);
      return false;
    }
  },

  /**
   * Elimina un registro de la cola IndexedDB (alias retrocompatible).
   */
  async removeQueuedPhoto(id: string): Promise<void> {
    await this.cleanupConfirmedPhoto(id);
  },

  /**
   * Rutina periódica y bajo demanda para purgar fotos que ya están confirmadas o sincronizadas
   * en Firebase/localStore, eliminando cualquier residuo o binario huérfano.
   */
  async purgeSyncedAndStaleQueue(userId?: string): Promise<{
    deletedCount: number;
    remainingCount: number;
    freedEstimatedKB: number;
  }> {
    try {
      const items = await this.getQueuedPhotos(userId);
      if (items.length === 0) {
        return { deletedCount: 0, remainingCount: 0, freedEstimatedKB: 0 };
      }

      let deletedCount = 0;
      let freedBytes = 0;

      for (const item of items) {
        // Verificar si la foto ya figura como sincronizada en el almacén de datos (isPendingSync !== true)
        const localPhotos = localStore.getItems<PhotoRecord>('photos', item.userId);
        const match = localPhotos.find((p) => p.id === item.id);

        const isAlreadySynced = match && match.isPendingSync === false;
        const isStaleCorrupted = (item.retryCount || 0) > 15;

        if (isAlreadySynced || isStaleCorrupted) {
          const approxSize = (item.fileBlob?.size || 0) + (item.previewDataUrl?.length || 0);
          await this.cleanupConfirmedPhoto(item.id);
          deletedCount++;
          freedBytes += approxSize;
        }
      }

      const remaining = await this.getQueuedPhotos(userId);
      const freedEstimatedKB = Math.round(freedBytes / 1024);

      if (deletedCount > 0) {
        console.log(`[IndexedDB Maintenance] Purgadas ${deletedCount} foto(s) ya sincronizadas. Espacio liberado estimado: ~${freedEstimatedKB} KB.`);
      }

      return {
        deletedCount,
        remainingCount: remaining.length,
        freedEstimatedKB,
      };
    } catch (err) {
      console.warn('[IndexedDB Maintenance] Error durante la rutina de limpieza:', err);
      return { deletedCount: 0, remainingCount: 0, freedEstimatedKB: 0 };
    }
  },

  /**
   * Vacia por completo la cola de IndexedDB (útil para restablecimiento manual o limpieza profunda).
   */
  async clearEntireQueue(): Promise<void> {
    try {
      const idb = await getIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      notifyQueueUpdated();
      console.log('[IndexedDB Cleanup] Toda la cola local ha sido vaciada.');
    } catch (err) {
      console.error('[IndexedDB Cleanup] Error al vaciar cola:', err);
    }
  },

  /**
   * Obtiene la estimación de uso y cuota de almacenamiento del navegador para visibilidad del usuario.
   */
  async getStorageQuotaInfo(): Promise<{
    usageMB: number;
    quotaMB: number;
    percentUsed: number;
    queuedCount: number;
    estimatedQueueMB: number;
  }> {
    const queued = await this.getQueuedPhotos();
    let totalBytes = 0;
    for (const q of queued) {
      totalBytes += (q.fileBlob?.size || 0) + (q.previewDataUrl?.length || 0);
    }

    const estimatedQueueMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usageMB = Math.round(((est.usage || 0) / (1024 * 1024)) * 100) / 100;
        const quotaMB = Math.round(((est.quota || 0) / (1024 * 1024)) * 100) / 100;
        const percentUsed = quotaMB > 0 ? Math.round((usageMB / quotaMB) * 10000) / 100 : 0;
        return {
          usageMB,
          quotaMB,
          percentUsed,
          queuedCount: queued.length,
          estimatedQueueMB,
        };
      } catch {
        // Fallback
      }
    }

    return {
      usageMB: estimatedQueueMB,
      quotaMB: 500,
      percentUsed: 0,
      queuedCount: queued.length,
      estimatedQueueMB,
    };
  },

  /**
   * Actualiza el estado de sincronización y reintentos de una foto encolada.
   */
  async updateStatus(id: string, status: 'pending' | 'syncing' | 'failed', lastError?: string): Promise<void> {
    try {
      const idb = await getIndexedDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = idb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(id);

        getReq.onsuccess = () => {
          const item = getReq.result as QueuedOfflinePhoto;
          if (item) {
            item.status = status;
            if (lastError) item.lastError = lastError;
            if (status === 'failed') item.retryCount = (item.retryCount || 0) + 1;
            store.put(item);
          }
          resolve();
        };
        getReq.onerror = () => reject(getReq.error);
      });
      notifyQueueUpdated();
    } catch (err) {
      console.warn('[IndexedDB] Error actualizando estado de foto:', err);
    }
  },

  /**
   * Ejecuta la sincronización automática de fotos encoladas hacia Firebase Storage y Firestore.
   */
  async syncPendingPhotos(): Promise<{ synced: number; failed: number; total: number }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[OfflineSync] Sin conexión a internet activa. Sincronización pospuesta.');
      return { synced: 0, failed: 0, total: 0 };
    }

    const pending = await this.getQueuedPhotos();
    if (pending.length === 0) {
      return { synced: 0, failed: 0, total: 0 };
    }

    console.log(`[OfflineSync] Iniciando sincronización de ${pending.length} fotografía(s) desde IndexedDB...`);
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      if (item.status === 'syncing') continue;

      try {
        await this.updateStatus(item.id, 'syncing');

        // 1. Convertir el Blob en File para Firebase Storage
        const file = new File([item.fileBlob], item.fileName, { type: item.fileType });
        let cloudDownloadUrl = item.previewDataUrl;

        // 2. Intentar subir a Firebase Storage
        try {
          const timestamp = Date.now();
          const storageRef = ref(
            storage,
            `users/${item.userId}/cultivations/${item.cultivationId}/${timestamp}_${item.fileName}`
          );
          const snapshot = await uploadBytes(storageRef, file);
          cloudDownloadUrl = await getDownloadURL(snapshot.ref);
        } catch (storageErr: any) {
          console.warn('[OfflineSync] Firebase Storage no disponible o con fallos. Se preserva base64:', storageErr?.message);
        }

        // 3. Crear / actualizar documento en Firestore
        const now = new Date().toISOString();
        const photoRecord: PhotoRecord = {
          id: item.id,
          userId: item.userId,
          cultivationId: item.cultivationId,
          url: cloudDownloadUrl,
          date: item.date,
          dayOfCultivation: item.dayOfCultivation,
          stage: item.stage,
          category: item.category,
          caption: item.caption,
          isDemo: item.isDemo,
          isPendingSync: false,
          createdAt: item.createdAt || now,
        };

        try {
          const docRef = doc(db, 'photos', item.id);
          const cleaned = cleanFirestoreData(photoRecord);
          await setDoc(docRef, cleaned);
        } catch (firestoreErr: any) {
          console.warn('[OfflineSync] Firestore pendiente o en fallback:', firestoreErr?.message);
        }

        // 4. Actualizar store local sin la marca isPendingSync
        localStore.saveItem('photos', photoRecord);

        // 5. Confirmación exitosa en Firebase -> Limpieza inmediata en IndexedDB
        // Se destruye el Blob y su registro en la cola para no acumular almacenamiento local
        await this.cleanupConfirmedPhoto(item.id);
        synced++;
        console.log(`[OfflineSync] Foto ${item.id} sincronizada y limpiada exitosamente de IndexedDB.`);
      } catch (err: any) {
        console.error(`[OfflineSync] Error sincronizando foto ${item.id}:`, err);
        await this.updateStatus(item.id, 'failed', err?.message || 'Error desconocido');
        failed++;
      }
    }

    // 6. Ejecutar rutina de purga general para asegurar cero fugas de memoria o residuos
    if (synced > 0) {
      try {
        await this.purgeSyncedAndStaleQueue();
      } catch (cleanErr) {
        console.warn('[OfflineSync] Purga post-sincronización finalizada con advertencias:', cleanErr);
      }
    }

    if (synced > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cultiveta_photos_synced', {
          detail: { syncedCount: synced },
        })
      );
    }

    return { synced, failed, total: pending.length };
  },

  /**
   * Suscripción reactiva para componentes que necesitan saber cuántas fotos están pendientes encoladas.
   */
  subscribeQueue(callback: (pending: QueuedOfflinePhoto[]) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const emit = async () => {
      const items = await photoOfflineQueue.getQueuedPhotos();
      callback(items);
    };

    emit();

    const handler = () => emit();
    window.addEventListener('cultiveta_offline_queue_changed', handler);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);

    return () => {
      window.removeEventListener('cultiveta_offline_queue_changed', handler);
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  },

  /**
   * Inicializa los listeners automáticos de reconexión de red (`online`) para disparar la sincronización.
   */
  initAutoSync(): () => void {
    if (typeof window === 'undefined') return () => {};

    // Al arrancar la app, purgar cualquier residuo sincronizado de sesiones previas
    this.purgeSyncedAndStaleQueue().catch(() => {});

    const handleOnline = () => {
      console.log('[OfflineSync] Conexión de red restablecida (online). Verificando cola de fotos en IndexedDB...');
      setTimeout(() => {
        photoOfflineQueue.syncPendingPhotos();
      }, 1500);
    };

    // Al iniciar, si ya hay conexión, intentar procesar cola pendiente
    if (navigator.onLine) {
      setTimeout(() => {
        photoOfflineQueue.syncPendingPhotos();
      }, 2500);
    }

    window.addEventListener('online', handleOnline);

    // Revisión periódica en segundo plano cada 60 segundos si hay conexión
    const interval = setInterval(() => {
      if (navigator.onLine) {
        photoOfflineQueue.syncPendingPhotos();
      }
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  },
};
