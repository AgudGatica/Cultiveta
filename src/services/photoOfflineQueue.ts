import { ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, storage, auth, FIREBASE_CONFIG_METADATA } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory, PhotoSyncStatus } from '../types';
import { localStore } from './localStore';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { getPhotoStoragePath } from '../firebase/paths';

export type QueuePhotoStatus = 'queued' | 'uploading' | 'saving_metadata' | 'waiting_network' | 'synced' | 'failed';

export interface QueuedOfflinePhoto {
  id: string; // Identificador determinista único
  userId: string; // UID del usuario autenticado
  cultivationId: string;
  fileBlob: Blob; // Binario real de la imagen en almacenamiento durable
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string; // Ruta determinista: users/{userId}/cultivations/{cultivationId}/photos/{photoId}.{ext}
  cloudDownloadUrl?: string; // Se almacena una vez subido a Storage para no re-subir en reintentos
  stagePending: 'storage' | 'firestore'; // 'storage': pendiente de subir binario; 'firestore': binario en Storage, falta Firestore
  date: string; // Fecha de la evidencia (YYYY-MM-DD)
  dayOfCultivation: number;
  stage: CultivationStageName;
  category: PhotoCategory;
  caption?: string;
  isDemo?: boolean;
  status: QueuePhotoStatus;
  retryCount: number;
  lastError?: string;
  lastErrorCode?: string;
  lastErrorAt?: string;
  lockOwner?: string; // ID único de la pestaña/proceso que tiene el bloqueo
  lockUntil?: number; // Timestamp de expiración del bloqueo
  opVersion?: number; // Versión de la operación para evitar respuestas tardías
  bytesTransferred?: number;
  totalBytes?: number;
  progressPercent?: number;
  lastProgressAt?: string;
  startedAt?: string;
  unrecoverable?: boolean; // Elementos corruptos que deben ser exportables pero no bloquear
  createdAt: string;
  updatedAt?: string;
}

export interface PhotoDiagnosticInfo {
  photoId: string;
  userId: string;
  cultivationId: string;
  phase: 'init' | 'queued' | 'uploading_bytes' | 'saving_metadata' | 'waiting_network' | 'synced' | 'failed';
  status: QueuePhotoStatus;
  bytesTransferred: number;
  totalBytes: number;
  progressPercent: number;
  lastProgressAt?: string;
  elapsedSeconds?: number;
  retryCount: number;
  lastErrorCode?: string;
  lastError?: string;
  effectiveProjectId: string;
  effectiveDatabaseId: string;
  effectiveBucket: string;
  lockOwner?: string;
  lockActive: boolean;
  opVersion?: number;
  unrecoverable?: boolean;
}

const DB_NAME = 'cultiveta_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_photos';

// Identificador único de esta pestaña para control atómico de concurrencia
const TAB_ID =
  typeof window !== 'undefined'
    ? 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
    : 'server_env';

let dbPromise: Promise<IDBDatabase> | null = null;

// Tareas activas de Storage y latidos de expiración (heartbeats) para renovación de bloqueos
const activeUploadTasks = new Map<string, UploadTask>();
const activeHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Normaliza y migra idempotentemente registros leídos de IndexedDB.
 * Asegura compatibilidad hacia atrás con registros creados en versión 1 o versiones previas de la v2.
 */
function normalizeRecord(raw: any): QueuedOfflinePhoto {
  const userId = raw.userId || 'default_user';
  const cultivationId = raw.cultivationId || 'unknown';
  const id = raw.id || 'photo_' + Date.now();
  const ext = (raw.fileName || 'evidencia.jpg').split('.').pop() || 'jpg';

  const storagePath =
    raw.storagePath || getPhotoStoragePath(userId, cultivationId, id, ext);

  const fileSize =
    typeof raw.fileSize === 'number' && raw.fileSize > 0
      ? raw.fileSize
      : raw.fileBlob && typeof raw.fileBlob.size === 'number'
      ? raw.fileBlob.size
      : 0;

  // Normalizar estados antiguos
  let status: QueuePhotoStatus = 'queued';
  if (raw.status === 'pending') status = 'queued';
  else if (raw.status === 'syncing') status = 'uploading';
  else if (raw.status === 'error') status = 'failed';
  else if (
    raw.status === 'queued' ||
    raw.status === 'uploading' ||
    raw.status === 'saving_metadata' ||
    raw.status === 'waiting_network' ||
    raw.status === 'synced' ||
    raw.status === 'failed'
  ) {
    status = raw.status;
  }

  const stagePending: 'storage' | 'firestore' =
    raw.stagePending || (raw.cloudDownloadUrl ? 'firestore' : 'storage');

  const unrecoverable =
    !raw.fileBlob || !(raw.fileBlob instanceof Blob) || (raw.fileBlob.size === 0 && !raw.cloudDownloadUrl);

  return {
    id,
    userId,
    cultivationId,
    fileBlob: raw.fileBlob,
    fileName: raw.fileName || `evidencia_${id}.${ext}`,
    fileType: raw.fileType || (raw.fileBlob && raw.fileBlob.type) || 'image/jpeg',
    fileSize,
    storagePath,
    cloudDownloadUrl: raw.cloudDownloadUrl,
    stagePending,
    date: raw.date || (raw.createdAt ? raw.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
    dayOfCultivation: raw.dayOfCultivation || 1,
    stage: raw.stage || 'Vegetativo',
    category: raw.category || 'planta completa',
    caption: raw.caption,
    isDemo: raw.isDemo,
    status,
    retryCount: typeof raw.retryCount === 'number' ? raw.retryCount : 0,
    lastError: unrecoverable ? 'Archivo binario no disponible en el almacenamiento local.' : raw.lastError,
    lastErrorCode: raw.lastErrorCode,
    lastErrorAt: raw.lastErrorAt,
    lockOwner: raw.lockOwner,
    lockUntil: raw.lockUntil,
    opVersion: raw.opVersion || 1,
    bytesTransferred: raw.bytesTransferred,
    totalBytes: raw.totalBytes || fileSize,
    progressPercent: raw.progressPercent,
    lastProgressAt: raw.lastProgressAt,
    startedAt: raw.startedAt,
    unrecoverable,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt,
  };
}

/**
 * Obtiene la conexión a IndexedDB manejando bloqueos, cambios de versión y cierres inesperados.
 */
function getIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      return reject(err);
    }

    // Manejar bloqueo por otra pestaña que tiene una versión antigua abierta
    request.onblocked = () => {
      console.warn('[IndexedDB] Conexión bloqueada: otra pestaña abierta está utilizando una versión anterior.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cultiveta_idb_blocked', {
            detail: { message: 'Otra pestaña de Cultiveta está bloqueando la base de datos local.' },
          })
        );
      }
    };

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
      const idb = request.result;

      // Cerrar limpiamente si otra pestaña necesita actualizar la versión
      idb.onversionchange = () => {
        console.warn('[IndexedDB] Se detectó una nueva versión de base de datos en otra pestaña. Cerrando conexión.');
        idb.close();
        dbPromise = null;
      };

      idb.onclose = () => {
        dbPromise = null;
      };

      idb.onerror = () => {
        dbPromise = null;
      };

      resolve(idb);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Error al abrir IndexedDB'));
    };
  });

  return dbPromise;
}

/**
 * Ejecuta una transacción en IndexedDB con captura rigurosa de commit y abortos.
 */
function runIDBTransaction<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return getIndexedDB().then(
    (idb) =>
      new Promise<T>((resolve, reject) => {
        let reqResult: T;
        let tx: IDBTransaction;
        try {
          tx = idb.transaction(STORE_NAME, mode);
        } catch (err) {
          return reject(err);
        }

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

/**
 * Mapeo explícito y tipado entre estados de la cola y estados de PhotoRecord.
 */
export function mapQueueStatusToSyncStatus(status: QueuePhotoStatus): PhotoSyncStatus {
  if (status === 'failed') return 'error';
  return status;
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
      opVersion: 1,
    };

    await runIDBTransaction('readwrite', (store) => store.put(queuedItem));

    // Reflejar de inmediato en localStore SIN almacenar URLs blob: efímeras
    const optimisticRecord: PhotoRecord = {
      id: queuedItem.id,
      userId: queuedItem.userId,
      cultivationId: queuedItem.cultivationId,
      url: '', // La vista previa se resolverá bajo demanda desde IndexedDB usando usePhotoPreview
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
   * filtrando exclusivamente por el UID provisto y normalizando registros antiguos.
   */
  async getQueuedPhotos(userId?: string): Promise<QueuedOfflinePhoto[]> {
    try {
      const items = await runIDBTransaction<any[]>('readonly', (store) => store.getAll());
      if (!items || !Array.isArray(items)) return [];

      const normalized = items.map(normalizeRecord);

      if (userId) {
        return normalized.filter((item) => item.userId === userId);
      }
      return normalized;
    } catch (err) {
      console.warn('[IndexedDB] Error al recuperar fotos encoladas:', err);
      // No silenciar transformando en lista vacía si hay un error real de IDB
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cultiveta_idb_error', {
            detail: { error: err instanceof Error ? err.message : 'Error al leer IndexedDB' },
          })
        );
      }
      throw err;
    }
  },

  /**
   * Obtiene un registro individual de la cola por su ID.
   */
  async getQueuedPhotoById(id: string): Promise<QueuedOfflinePhoto | null> {
    try {
      const item = await runIDBTransaction<any | undefined>('readonly', (store) => store.get(id));
      if (!item) return null;
      return normalizeRecord(item);
    } catch (err) {
      console.warn(`[IndexedDB] Error al recuperar foto ${id}:`, err);
      return null;
    }
  },

  /**
   * Reclama atómicamente una tarea en una sola transacción readwrite de IndexedDB.
   * La transacción se CIERRA Y CONFIRMA antes de realizar cualquier llamada de red.
   */
  async claimTask(
    photoId: string,
    currentAuthUid: string
  ): Promise<{ claimed: boolean; item?: QueuedOfflinePhoto }> {
    return runIDBTransaction<{ claimed: boolean; item?: QueuedOfflinePhoto }>('readwrite', (store) => {
      const getReq = store.get(photoId);

      getReq.onsuccess = () => {
        const raw = getReq.result;
        if (!raw) return;

        const item = normalizeRecord(raw);

        // Validar UID real de auth
        if (item.userId !== currentAuthUid) {
          console.warn(`[claimTask] Rechazado: UID del registro (${item.userId}) no coincide con el autenticado (${currentAuthUid}).`);
          return;
        }

        // Si es irrecuperable (sin blob y sin url remota), no reclamar para red
        if (item.unrecoverable) {
          return;
        }

        const now = Date.now();
        const isLockedByOther =
          item.lockOwner &&
          item.lockOwner !== TAB_ID &&
          item.lockUntil &&
          item.lockUntil > now;

        if (isLockedByOther) {
          // Bloqueo activo en otra pestaña o proceso
          return;
        }

        // Asignar reclamo atómico
        item.lockOwner = TAB_ID;
        item.lockUntil = now + 35000; // 35 segundos de concesión inicial
        item.opVersion = (item.opVersion || 0) + 1;
        item.startedAt = item.startedAt || new Date().toISOString();

        store.put(item);
      };
    }).then((result) => {
      if (result && result.item && result.item.lockOwner === TAB_ID) {
        return result;
      }
      return this.getQueuedPhotoById(photoId).then((fresh) => {
        if (fresh && fresh.lockOwner === TAB_ID) {
          return { claimed: true, item: fresh };
        }
        return { claimed: false };
      });
    }).catch(() => ({ claimed: false }));
  },

  /**
   * Inicia un latido de renovación de concesión (heartbeat) para mantener el bloqueo
   * activo mientras una subida de Storage o guardado en Firestore está en curso.
   */
  startHeartbeat(photoId: string, opVersion: number): void {
    this.stopHeartbeat(photoId);

    const interval = setInterval(async () => {
      try {
        await runIDBTransaction('readwrite', (store) => {
          const req = store.get(photoId);
          req.onsuccess = () => {
            const raw = req.result;
            if (raw && raw.lockOwner === TAB_ID && (raw.opVersion || 1) === opVersion) {
              raw.lockUntil = Date.now() + 35000;
              store.put(raw);
            }
          };
        });
      } catch (err) {
        console.warn(`[Heartbeat] Fallo al renovar concesión para ${photoId}:`, err);
      }
    }, 12000); // Renovar cada 12 segundos

    activeHeartbeats.set(photoId, interval);
  },

  stopHeartbeat(photoId: string): void {
    const existing = activeHeartbeats.get(photoId);
    if (existing) {
      clearInterval(existing);
      activeHeartbeats.delete(photoId);
    }
  },

  /**
   * Elimina y limpia de forma permanente una fotografía de la cola IndexedDB
   * ÚNICAMENTE cuando se ha confirmado el guardado remoto en Storage Y Firestore.
   */
  async cleanupConfirmedPhoto(id: string): Promise<boolean> {
    this.stopHeartbeat(id);
    activeUploadTasks.delete(id);

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
   * Elimina manualmente una foto pendiente a solicitud explícita del usuario.
   */
  async deletePendingPhoto(id: string, userId: string): Promise<boolean> {
    const task = activeUploadTasks.get(id);
    if (task) {
      try {
        task.cancel();
      } catch {}
      activeUploadTasks.delete(id);
    }
    this.stopHeartbeat(id);

    const success = await this.cleanupConfirmedPhoto(id);
    if (success) {
      localStore.deleteItem('photos', id, userId);
    }
    return success;
  },

  /**
   * Permite al usuario exportar el archivo binario original de una foto pendiente
   * para que nunca pierda su evidencia fotográfica.
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
   * Dispara una descarga directa en el navegador de una foto fallida o pendiente.
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
   * Actualiza el estado de un registro de foto encolado.
   */
  async updateItem(item: QueuedOfflinePhoto): Promise<void> {
    item.updatedAt = new Date().toISOString();
    await runIDBTransaction('readwrite', (store) => store.put(item));
    notifyQueueUpdated();
  },

  /**
   * Forzar reintento explícito por parte del usuario para un elemento fallido.
   * Respeta tareas que ya se encuentren activas.
   */
  async retryPendingPhoto(id: string, userId: string): Promise<boolean> {
    const item = await this.getQueuedPhotoById(id);
    if (!item) return false;

    // Si tiene un bloqueo vigente de otra pestaña, advertir
    const now = Date.now();
    if (item.lockOwner && item.lockOwner !== TAB_ID && item.lockUntil && item.lockUntil > now) {
      console.warn(`[retryPendingPhoto] La fotografía ${id} ya está siendo procesada en otra pestaña.`);
      return false;
    }

    item.status = 'queued';
    item.lockUntil = undefined;
    item.lockOwner = undefined;
    item.lastError = undefined;
    item.lastErrorCode = undefined;
    await this.updateItem(item);

    // Disparar sincronización asíncrona sin bloquear la UI
    this.syncPendingPhotos(userId).catch((err) => {
      console.warn('[retryPendingPhoto] Sincronización en segundo plano:', err);
    });

    return true;
  },

  /**
   * Obtiene la información de diagnóstico seguro para una foto encolada.
   * NUNCA incluye tokens, credenciales, URLs privadas completas ni base64.
   */
  async getDiagnostic(photoId: string): Promise<PhotoDiagnosticInfo | null> {
    const item = await this.getQueuedPhotoById(photoId);
    if (!item) return null;

    let phase: PhotoDiagnosticInfo['phase'] = 'queued';
    if (item.status === 'uploading') phase = 'uploading_bytes';
    else if (item.status === 'saving_metadata') phase = 'saving_metadata';
    else if (item.status === 'waiting_network') phase = 'waiting_network';
    else if (item.status === 'synced') phase = 'synced';
    else if (item.status === 'failed') phase = 'failed';

    const now = Date.now();
    const elapsedSeconds = item.startedAt
      ? Math.max(0, Math.floor((now - new Date(item.startedAt).getTime()) / 1000))
      : undefined;

    return {
      photoId: item.id,
      userId: item.userId,
      cultivationId: item.cultivationId,
      phase,
      status: item.status,
      bytesTransferred: item.bytesTransferred || 0,
      totalBytes: item.totalBytes || item.fileSize || 0,
      progressPercent: item.progressPercent || 0,
      lastProgressAt: item.lastProgressAt,
      elapsedSeconds,
      retryCount: item.retryCount,
      lastErrorCode: item.lastErrorCode,
      lastError: item.lastError,
      effectiveProjectId: FIREBASE_CONFIG_METADATA.projectId,
      effectiveDatabaseId: FIREBASE_CONFIG_METADATA.firestoreDatabaseId,
      effectiveBucket: FIREBASE_CONFIG_METADATA.storageBucket,
      lockOwner: item.lockOwner ? (item.lockOwner === TAB_ID ? 'esta_pestaña' : 'otra_pestaña') : undefined,
      lockActive: Boolean(item.lockUntil && item.lockUntil > now),
      opVersion: item.opVersion,
      unrecoverable: item.unrecoverable,
    };
  },

  /**
   * Genera un resumen de diagnóstico copiable en texto plano.
   */
  async copyDiagnosticSummary(photoId: string): Promise<string> {
    const diag = await this.getDiagnostic(photoId);
    if (!diag) return `Foto ${photoId} no encontrada en la cola local.`;

    return [
      `=== DIAGNÓSTICO CULTIVETA SYNC ===`,
      `Foto ID: ${diag.photoId}`,
      `Cultivo ID: ${diag.cultivationId}`,
      `Fase: ${diag.phase} | Estado: ${diag.status}`,
      `Progreso: ${diag.progressPercent}% (${diag.bytesTransferred} / ${diag.totalBytes} bytes)`,
      `Último avance: ${diag.lastProgressAt || 'Sin avance registrado'}`,
      `Tiempo transcurrido: ${diag.elapsedSeconds ? `${diag.elapsedSeconds}s` : 'N/A'}`,
      `Intentos: ${diag.retryCount}`,
      `Código de error SDK: ${diag.lastErrorCode || 'Ninguno'}`,
      `Mensaje: ${diag.lastError || 'Ninguno'}`,
      `Bloqueo activo: ${diag.lockActive ? `Sí (${diag.lockOwner})` : 'No'}`,
      `Proyecto efectivo: ${diag.effectiveProjectId}`,
      `Base Firestore: ${diag.effectiveDatabaseId}`,
      `Bucket Storage: ${diag.effectiveBucket}`,
      `Irrecuperable: ${diag.unrecoverable ? 'SÍ (Archivo binario no disponible)' : 'No'}`,
      `==================================`,
    ].join('\n');
  },

  /**
   * Sincroniza la cola de fotos pendientes hacia Firebase de forma NO bloqueante.
   * Reglas críticas:
   * 1. Reclama cada tarea atómicamente en una transacción readwrite de IDB y la CIERRA antes de la red.
   * 2. Usa uploadBytesResumable con progreso observable y detección de falta de avance.
   * 3. Two-phase commit: guarda cloudDownloadUrl tras Storage para no re-subir binario si falla Firestore.
   * 4. No bloquea la UI: no usa Promise.race para cancelar setDoc de forma ficticia.
   * 5. No borra el Blob de IndexedDB hasta confirmar AMBOS (Storage y Firestore).
   * 6. Continúa con los demás elementos de la cola si una fotografía falla o es lenta.
   */
  async syncPendingPhotos(userId?: string): Promise<{ synced: number; failed: number; total: number }> {
    const currentAuthUser = auth.currentUser;
    const targetUserId = userId || (currentAuthUser ? currentAuthUser.uid : autoSyncUserId);

    if (!targetUserId) {
      console.log('[OfflineSync] Sin usuario autenticado. Sincronización pospuesta.');
      return { synced: 0, failed: 0, total: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[OfflineSync] Sin conexión a internet activa. Sincronización pospuesta.');
      return { synced: 0, failed: 0, total: 0 };
    }

    let pending: QueuedOfflinePhoto[] = [];
    try {
      pending = await this.getQueuedPhotos(targetUserId);
    } catch {
      return { synced: 0, failed: 0, total: 0 };
    }

    if (pending.length === 0) {
      return { synced: 0, failed: 0, total: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const rawItem of pending) {
      // 0. Si el elemento es irrecuperable por falta de blob, omitir subida de red
      if (rawItem.unrecoverable) {
        failed++;
        continue;
      }

      // 1. Reclamo atómico de la tarea
      const claimResult = await this.claimTask(rawItem.id, targetUserId);
      if (!claimResult.claimed || !claimResult.item) {
        // Bloqueada por otra pestaña activa; omitir
        continue;
      }

      const item = claimResult.item;
      const opVersion = item.opVersion || 1;

      // 2. Iniciar latido de renovación de concesión
      this.startHeartbeat(item.id, opVersion);

      try {
        let downloadUrl = item.cloudDownloadUrl;

        // ==============================================================
        // FASE 1: Subida del binario a Storage con uploadBytesResumable
        // ==============================================================
        if (!downloadUrl) {
          item.status = 'uploading';
          await this.updateItem(item);

          // Actualizar estado reactivo en localStore
          localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
            id: item.id,
            userId: item.userId,
            syncStatus: 'uploading',
            isPendingSync: true,
          });

          const storageRef = ref(storage, item.storagePath);
          const uploadTask = uploadBytesResumable(storageRef, item.fileBlob, {
            contentType: item.fileType,
          });
          activeUploadTasks.set(item.id, uploadTask);

          // Monitor de progreso y detección de bloqueo (stall detection)
          let lastBytes = 0;
          let lastProgressTimestamp = Date.now();

          const stallCheckTimer = setInterval(() => {
            const now = Date.now();
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              uploadTask.cancel();
              return;
            }
            // Si pasan 28 segundos sin transferir ningún byte adicional
            if (now - lastProgressTimestamp > 28000) {
              console.warn(`[OfflineSync] Subida estancada detectada en foto ${item.id}. Cancelando tarea para reintento.`);
              uploadTask.cancel();
            }
          }, 5000);

          uploadTask.on('state_changed', (snapshot) => {
            if (snapshot.bytesTransferred > lastBytes) {
              lastBytes = snapshot.bytesTransferred;
              lastProgressTimestamp = Date.now();
            }

            item.bytesTransferred = snapshot.bytesTransferred;
            item.totalBytes = snapshot.totalBytes;
            item.progressPercent =
              snapshot.totalBytes > 0
                ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                : 0;
            item.lastProgressAt = new Date().toISOString();

            // Notificación ligera
            notifyQueueUpdated();
          });

          try {
            await uploadTask;
          } finally {
            clearInterval(stallCheckTimer);
            activeUploadTasks.delete(item.id);
          }

          downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          // TWO-PHASE COMMIT: Persistir inmediatamente la URL de Storage en IndexedDB.
          // Si setDoc falla posteriormente, ¡NO se volverá a subir el archivo!
          item.cloudDownloadUrl = downloadUrl;
          item.stagePending = 'firestore';
          item.progressPercent = 100;
          await this.updateItem(item);
        }

        // ==============================================================
        // FASE 2: Persistencia de metadatos en Cloud Firestore
        // ==============================================================
        item.status = 'saving_metadata';
        await this.updateItem(item);

        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: 'saving_metadata',
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

        // Validar que el usuario autenticado no haya cambiado durante la operación de red
        if (auth.currentUser && auth.currentUser.uid !== item.userId) {
          throw new Error('Sesión de usuario alterada durante la sincronización.');
        }

        // setDoc autoritativo con confirmación del servidor
        await setDoc(docRef, cleaned);

        // ==============================================================
        // FASE 3: Confirmación exitosa en Storage + Firestore -> Limpieza
        // ==============================================================
        this.stopHeartbeat(item.id);

        // Actualizar almacén local marcando como completamente sincronizada
        localStore.saveItem('photos', photoRecord);

        // Ahora y solo ahora limpiar de la cola IndexedDB
        await this.cleanupConfirmedPhoto(item.id);
        synced++;
        console.log(`[OfflineSync] ✅ Foto ${item.id} sincronizada y confirmada en la nube.`);
      } catch (stepErr: unknown) {
        this.stopHeartbeat(item.id);
        activeUploadTasks.delete(item.id);

        console.error(`[OfflineSync] Fallo en sincronización de foto ${item.id}:`, stepErr);
        const errObj = stepErr as { message?: string; code?: string; name?: string } | undefined;

        item.status = (typeof navigator !== 'undefined' && !navigator.onLine) ? 'waiting_network' : 'failed';
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = errObj?.message || 'Error durante la sincronización.';
        item.lastErrorCode = errObj?.code || (errObj?.name === 'FirebaseError' ? 'firebase-error' : 'network-error');
        item.lastErrorAt = new Date().toISOString();
        item.lockUntil = undefined;
        item.lockOwner = undefined;

        await this.updateItem(item);

        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: mapQueueStatusToSyncStatus(item.status),
          syncError: item.lastError,
          isPendingSync: true,
        });

        failed++;
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
   * Suscripción reactiva para observar cambios en la cola.
   */
  subscribeQueue(callback: (pending: QueuedOfflinePhoto[]) => void, userId?: string): () => void {
    if (typeof window === 'undefined') return () => {};

    let isSubscribed = true;

    const emit = async () => {
      if (!isSubscribed) return;
      try {
        const items = await photoOfflineQueue.getQueuedPhotos(userId || autoSyncUserId || undefined);
        if (isSubscribed) {
          callback(items);
        }
      } catch (err) {
        console.warn('[subscribeQueue] Error emitiendo cola:', err);
      }
    };

    emit();

    const handler = () => emit();
    window.addEventListener('cultiveta_offline_queue_changed', handler);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);

    return () => {
      isSubscribed = false;
      window.removeEventListener('cultiveta_offline_queue_changed', handler);
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  },

  /**
   * Inicia el procesamiento automático de la cola offline exclusivamente
   * para el UID autenticado resuelto.
   */
  initAutoSync(userId: string): () => void {
    if (typeof window === 'undefined' || !userId) return () => {};

    this.stopAutoSync();
    autoSyncUserId = userId;

    console.log(`[OfflineSync] 🟢 AutoSync activado para usuario ${userId}.`);

    autoSyncOnlineHandler = () => {
      console.log('[OfflineSync] Red reestablecida. Verificando cola pendiente...');
      setTimeout(() => {
        if (autoSyncUserId) {
          photoOfflineQueue.syncPendingPhotos(autoSyncUserId).catch(() => {});
        }
      }, 1500);
    };

    window.addEventListener('online', autoSyncOnlineHandler);

    // Ejecución inicial si ya hay conexión
    if (navigator.onLine) {
      setTimeout(() => {
        if (autoSyncUserId) {
          photoOfflineQueue.syncPendingPhotos(autoSyncUserId).catch(() => {});
        }
      }, 2000);
    }

    // Revisión periódica en segundo plano cada 45 segundos
    autoSyncInterval = setInterval(() => {
      if (navigator.onLine && autoSyncUserId) {
        photoOfflineQueue.syncPendingPhotos(autoSyncUserId).catch(() => {});
      }
    }, 45000);

    return () => {
      this.stopAutoSync();
    };
  },

  /**
   * Detiene el procesamiento de la cola al cerrar sesión o cambiar de usuario.
   * Cancela tareas de subida activas, temporizadores y latidos.
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

    // Cancelar tareas activas de subida
    activeUploadTasks.forEach((task) => {
      try {
        task.cancel();
      } catch {}
    });
    activeUploadTasks.clear();

    // Detener todos los latidos
    activeHeartbeats.forEach((int) => clearInterval(int));
    activeHeartbeats.clear();

    autoSyncUserId = null;
    console.log('[OfflineSync] 🔴 AutoSync detenido por completo.');
  },
};
