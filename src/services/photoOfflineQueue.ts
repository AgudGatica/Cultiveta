import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory, PhotoSyncStatus } from '../types';
import { localStore } from './localStore';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { getPhotoStoragePath } from '../firebase/paths';

export interface QueuedOfflinePhoto {
  id: string; // Identificador determinista único
  userId: string; // UID del usuario autenticado
  cultivationId: string;
  fileBlob: Blob; // Binario real de la imagen
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string; // Ruta determinista: users/{userId}/cultivations/{cultivationId}/photos/{photoId}.{ext}
  cloudDownloadUrl?: string; // Se almacena una vez subido a Storage para no re-subir en reintentos
  stagePending: 'storage' | 'firestore'; // 'storage': pendiente de subir binario; 'firestore': binario ya en Storage, falta metadatos
  date: string; // Fecha de la evidencia (YYYY-MM-DD)
  dayOfCultivation: number; // Calculado respecto a startDate del cultivo
  stage: CultivationStageName;
  category: PhotoCategory;
  caption?: string;
  isDemo?: boolean;
  status: 'queued' | 'uploading' | 'saving_metadata' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  lastErrorCode?: string;
  lastErrorAt?: string;
  lockUntil?: number; // Bloqueo con expiración para evitar ejecuciones concurrentes entre pestañas
  createdAt: string;
}

const DB_NAME = 'cultiveta_offline_db';
const DB_VERSION = 2;
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
      let store: IDBObjectStore;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        store = idb.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else {
        store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('userId')) {
        store.createIndex('userId', 'userId', { unique: false });
      }
      if (!store.indexNames.contains('status')) {
        store.createIndex('status', 'status', { unique: false });
      }
      if (!store.indexNames.contains('createdAt')) {
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

/**
 * Ejecuta una operación en IndexedDB esperando la confirmación (commit) completa
 * de la transacción vía oncomplete, manejando oncomplete, onerror y onabort (FASE 3).
 */
function runIDBTransaction<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return getIndexedDB().then(
    (idb) =>
      new Promise<T>((resolve, reject) => {
        let reqResult: T;
        const tx = idb.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => {
          resolve(reqResult);
        };

        tx.onerror = () => {
          reject(tx.error || new Error('Transacción de IndexedDB fallida.'));
        };

        tx.onabort = () => {
          reject(tx.error || new Error('Transacción de IndexedDB abortada.'));
        };

        try {
          const req = runner(store);
          if (req) {
            req.onsuccess = () => {
              reqResult = req.result;
            };
          }
        } catch (err) {
          reject(err);
        }
      })
  );
}

function notifyQueueUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cultiveta_offline_queue_changed'));
}

let autoSyncUserId: string | null = null;
let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
let autoSyncOnlineHandler: (() => void) | null = null;

export const photoOfflineQueue = {
  /**
   * Encola una fotografía en IndexedDB de forma persistente y determinista.
   */
  async enqueuePhoto(params: {
    id: string;
    userId: string;
    cultivationId: string;
    file: File | Blob;
    fileName: string;
    fileType?: string;
    date: string;
    dayOfCultivation: number;
    stage: CultivationStageName;
    category: PhotoCategory;
    caption?: string;
    isDemo?: boolean;
    previewUrl?: string;
  }): Promise<QueuedOfflinePhoto> {
    const ext = params.fileName.split('.').pop() || 'jpg';
    const storagePath = getPhotoStoragePath(params.userId, params.cultivationId, params.id, ext);

    const queuedItem: QueuedOfflinePhoto = {
      id: params.id,
      userId: params.userId,
      cultivationId: params.cultivationId,
      fileBlob: params.file,
      fileName: params.fileName,
      fileType: params.fileType || params.file.type || 'image/jpeg',
      fileSize: params.file.size,
      storagePath,
      stagePending: 'storage',
      date: params.date,
      dayOfCultivation: params.dayOfCultivation,
      stage: params.stage,
      category: params.category,
      caption: params.caption,
      isDemo: params.isDemo,
      status: 'queued',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    await runIDBTransaction('readwrite', (store) => store.put(queuedItem));

    // Reflejar de inmediato en localStore como registro pendiente para la UI
    const optimisticRecord: PhotoRecord = {
      id: queuedItem.id,
      userId: queuedItem.userId,
      cultivationId: queuedItem.cultivationId,
      url: params.previewUrl || '',
      storagePath: queuedItem.storagePath,
      syncStatus: 'queued',
      fileSize: queuedItem.fileSize,
      mimeType: queuedItem.fileType,
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
   * Obtiene la lista de fotografías pendientes encoladas en IndexedDB,
   * filtrando exclusivamente por el UID provisto (FASE 3).
   */
  async getQueuedPhotos(userId?: string): Promise<QueuedOfflinePhoto[]> {
    try {
      const items = await runIDBTransaction<QueuedOfflinePhoto[]>('readonly', (store) => store.getAll());
      if (!items || !Array.isArray(items)) return [];
      if (userId) {
        return items.filter((item) => item.userId === userId);
      }
      return items;
    } catch (err) {
      console.warn('[IndexedDB] No se pudieron recuperar las fotos encoladas:', err);
      return [];
    }
  },

  /**
   * Obtiene un registro individual de la cola por su ID
   */
  async getQueuedPhotoById(id: string): Promise<QueuedOfflinePhoto | null> {
    try {
      const item = await runIDBTransaction<QueuedOfflinePhoto | undefined>('readonly', (store) => store.get(id));
      return item || null;
    } catch {
      return null;
    }
  },

  /**
   * Elimina y limpia de forma permanente una fotografía de la cola IndexedDB
   * ÚNICAMENTE cuando se ha confirmado el guardado remoto en Storage y Firestore (FASE 3).
   */
  async cleanupConfirmedPhoto(id: string): Promise<boolean> {
    try {
      await runIDBTransaction('readwrite', (store) => store.delete(id));
      console.log(`[IndexedDB Cleanup] ✅ Fotografía ${id} liberada y purgada de IndexedDB tras confirmación completa.`);
      notifyQueueUpdated();
      return true;
    } catch (err) {
      console.warn(`[IndexedDB Cleanup] Fallo al eliminar registro ${id}:`, err);
      return false;
    }
  },

  /**
   * Elimina manualmente una foto pendiente a solicitud explícita del usuario
   */
  async deletePendingPhoto(id: string, userId: string): Promise<boolean> {
    const success = await this.cleanupConfirmedPhoto(id);
    if (success) {
      localStore.deleteItem('photos', id, userId);
    }
    return success;
  },

  /**
   * Permite al usuario exportar el archivo binario original de una foto pendiente
   * para que nunca pierda su evidencia fotográfica (FASE 3).
   */
  async exportPendingPhotoBlob(id: string): Promise<{ blob: Blob; fileName: string } | null> {
    const item = await this.getQueuedPhotoById(id);
    if (!item || !item.fileBlob) return null;
    return {
      blob: item.fileBlob,
      fileName: item.fileName || `evidencia_${item.date}_${item.id}.jpg`,
    };
  },

  /**
   * Dispara una descarga directa en el navegador de una foto fallida o pendiente
   */
  async triggerPhotoDownload(id: string): Promise<boolean> {
    const data = await this.exportPendingPhotoBlob(id);
    if (!data) return false;
    if (typeof window === 'undefined') return false;

    const url = URL.createObjectURL(data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  },

  /**
   * Actualiza el estado de un registro de foto encolado
   */
  async updateItem(item: QueuedOfflinePhoto): Promise<void> {
    await runIDBTransaction('readwrite', (store) => store.put(item));
    notifyQueueUpdated();
  },

  /**
   * Forzar reintento explícito por parte del usuario para un elemento fallido
   */
  async retryPendingPhoto(id: string, userId: string): Promise<boolean> {
    const item = await this.getQueuedPhotoById(id);
    if (!item) return false;
    item.status = 'queued';
    item.lockUntil = undefined;
    item.lastError = undefined;
    item.lastErrorCode = undefined;
    await this.updateItem(item);
    this.syncPendingPhotos(userId);
    return true;
  },

  /**
   * Sincroniza la cola de fotos pendientes hacia Firebase.
   * Reglas críticas (FASE 2 y 3):
   * 1. Solo procesa el UID autenticado.
   * 2. Reutiliza el identificador id y ruta storagePath determinista.
   * 3. Si Storage funciona pero Firestore falla, preserva cloudDownloadUrl para no re-subir el archivo binario.
   * 4. Solo marca synced y llama cleanupConfirmedPhoto si AMBOS (Storage y Firestore) concluyeron con éxito.
   * 5. No borra fotos por superar 15 reintentos; las conserva en 'failed' con detalle de error.
   * 6. Usa bloqueo lockUntil con vencimiento para prevenir ejecuciones concurrentes.
   */
  async syncPendingPhotos(userId?: string): Promise<{ synced: number; failed: number; total: number }> {
    const targetUserId = userId || autoSyncUserId;
    if (!targetUserId) {
      console.log('[OfflineSync] Sin usuario autenticado. Sincronización pospuesta.');
      return { synced: 0, failed: 0, total: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[OfflineSync] Sin conexión a internet activa. Sincronización pospuesta.');
      return { synced: 0, failed: 0, total: 0 };
    }

    const pending = await this.getQueuedPhotos(targetUserId);
    if (pending.length === 0) {
      return { synced: 0, failed: 0, total: 0 };
    }

    console.log(`[OfflineSync] Procesando ${pending.length} fotografía(s) de usuario "${targetUserId}"...`);
    let synced = 0;
    let failed = 0;
    const nowMs = Date.now();

    for (const item of pending) {
      // 1. Control de concurrencia y bloqueo con vencimiento (FASE 3)
      if (item.status === 'uploading' || item.status === 'saving_metadata') {
        if (item.lockUntil && item.lockUntil > nowMs) {
          // Operación en curso activa en otra pestaña o temporizador; omitir
          continue;
        }
        // Bloqueo expirado (>60s), recuperar el registro para reintento
        console.warn(`[OfflineSync] Bloqueo expirado detectado en foto ${item.id}. Recuperando estado.`);
      }

      // 2. Espera progresiva (exponential backoff) para reintentos fallidos
      if (item.status === 'failed' && item.lastErrorAt) {
        const lastErrTime = new Date(item.lastErrorAt).getTime();
        const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount || 1), 60000);
        if (nowMs - lastErrTime < backoffMs) {
          // Aún dentro del periodo de enfriamiento
          continue;
        }
      }

      const lockDurationMs = 60000;
      let downloadUrl = item.cloudDownloadUrl;

      try {
        // ==============================================================
        // PASO 1: Subida del binario a Firebase Storage (si aún no se completó)
        // ==============================================================
        if (!downloadUrl) {
          item.status = 'uploading';
          item.lockUntil = Date.now() + lockDurationMs;
          await this.updateItem(item);

          // Actualizar estado visual en localStore
          localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
            id: item.id,
            userId: item.userId,
            syncStatus: 'uploading' as PhotoSyncStatus,
            isPendingSync: true,
          });

          const storageRef = ref(storage, item.storagePath);
          const uploadSnapshot = await uploadBytes(storageRef, item.fileBlob, {
            contentType: item.fileType,
          });
          downloadUrl = await getDownloadURL(uploadSnapshot.ref);

          // Persistir la URL remota obtenida para que un fallo posterior en Firestore no fuerce re-subir
          item.cloudDownloadUrl = downloadUrl;
          item.stagePending = 'firestore';
          item.lockUntil = Date.now() + lockDurationMs;
          await this.updateItem(item);
        }

        // ==============================================================
        // PASO 2: Persistencia de metadatos en Cloud Firestore
        // ==============================================================
        item.status = 'saving_metadata';
        item.lockUntil = Date.now() + lockDurationMs;
        await this.updateItem(item);

        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: 'saving_metadata' as PhotoSyncStatus,
          isPendingSync: true,
        });

        const photoRecord: PhotoRecord = {
          id: item.id,
          userId: item.userId,
          cultivationId: item.cultivationId,
          url: downloadUrl,
          storagePath: item.storagePath,
          syncStatus: 'synced',
          fileSize: item.fileSize,
          mimeType: item.fileType,
          date: item.date,
          dayOfCultivation: item.dayOfCultivation,
          stage: item.stage,
          category: item.category,
          caption: item.caption,
          isDemo: item.isDemo,
          isPendingSync: false,
          createdAt: item.createdAt,
        };

        const docRef = doc(db, 'photos', item.id);
        const cleaned = cleanFirestoreData(photoRecord);

        // Sin catch silencioso: debe confirmar la escritura remota
        await setDoc(docRef, cleaned);

        // ==============================================================
        // PASO 3: Confirmación exitosa en Storage + Firestore -> Limpieza
        // ==============================================================
        // Actualizar almacén local marcando como completamente sincronizada
        localStore.saveItem('photos', photoRecord);

        // Ahora y solo ahora limpiar de la cola IndexedDB
        await this.cleanupConfirmedPhoto(item.id);
        synced++;
        console.log(`[OfflineSync] ✅ Foto ${item.id} sincronizada y confirmada en la nube.`);
      } catch (stepErr: unknown) {
        // En caso de fallo en cualquier etapa:
        // 1. NO borrar la fotografía
        // 2. Registrar código y mensaje real
        // 3. Incrementar retryCount
        console.error(`[OfflineSync] Fallo en sincronización de foto ${item.id}:`, stepErr);
        const errObj = stepErr as { message?: string; code?: string; name?: string } | undefined;
        item.status = 'failed';
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = errObj?.message || 'Error desconocido durante la sincronización.';
        item.lastErrorCode = errObj?.code || (errObj?.name === 'FirebaseError' ? 'firebase-error' : 'network-error');
        item.lastErrorAt = new Date().toISOString();
        item.lockUntil = undefined;

        await this.updateItem(item);

        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: 'error' as PhotoSyncStatus,
          syncError: item.lastError,
          isPendingSync: true,
        });

        failed++;
      }
    }

    // Emitir evento solo si realmente se sincronizó al menos una fotografía
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
   * Suscripción reactiva para observar cambios en la cola
   */
  subscribeQueue(callback: (pending: QueuedOfflinePhoto[]) => void, userId?: string): () => void {
    if (typeof window === 'undefined') return () => {};

    const emit = async () => {
      const items = await photoOfflineQueue.getQueuedPhotos(userId || autoSyncUserId || undefined);
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
   * Inicia el procesamiento automático de la cola offline exclusivamente
   * para el UID autenticado resuelto (FASE 3).
   */
  initAutoSync(userId: string): () => void {
    if (typeof window === 'undefined' || !userId) return () => {};

    this.stopAutoSync();
    autoSyncUserId = userId;

    console.log(`[OfflineSync] 🟢 AutoSync activado para usuario ${userId}.`);

    autoSyncOnlineHandler = () => {
      console.log('[OfflineSync] Red reestablecida. Verificando cola pendiente...');
      setTimeout(() => {
        photoOfflineQueue.syncPendingPhotos(autoSyncUserId || undefined);
      }, 1500);
    };

    window.addEventListener('online', autoSyncOnlineHandler);

    // Ejecución inicial si ya hay conexión
    if (navigator.onLine) {
      setTimeout(() => {
        photoOfflineQueue.syncPendingPhotos(autoSyncUserId || undefined);
      }, 2000);
    }

    // Revisión periódica en segundo plano cada 45 segundos
    autoSyncInterval = setInterval(() => {
      if (navigator.onLine && autoSyncUserId) {
        photoOfflineQueue.syncPendingPhotos(autoSyncUserId);
      }
    }, 45000);

    return () => {
      this.stopAutoSync();
    };
  },

  /**
   * Detiene el procesamiento de la cola al cerrar sesión o cambiar de usuario (FASE 3).
   */
  stopAutoSync(): void {
    if (autoSyncOnlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', autoSyncOnlineHandler);
      autoSyncOnlineHandler = null;
    }
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
    autoSyncUserId = null;
    console.log('[OfflineSync] 🔴 AutoSync detenido.');
  },
};
