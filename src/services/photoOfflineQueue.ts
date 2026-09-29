import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, storage, auth, FIREBASE_CONFIG_METADATA } from '../firebase/config';
import { PhotoRecord, CultivationStageName, PhotoCategory, PhotoSyncStatus, PhotoSyncResult } from '../types';
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
  isDeleted?: boolean; // Marca interna para invalidación atómica
  deletionPending?: boolean; // Intención duradera de borrado persistente en IndexedDB
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
  isNetworkOffline: boolean;
  isStalled: boolean;
  isPermissionError: boolean;
  diagnosticCategory: 'normal' | 'network_offline' | 'stalled' | 'permission_denied' | 'unrecoverable';
  currentActivePercent?: number;
}

const DB_NAME = 'cultiveta_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_photos';

// Identificador único de esta pestaña para control atómico de concurrencia
const TAB_ID =
  typeof window !== 'undefined'
    ? 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
    : 'tab_server_' + Math.random().toString(36).substring(2, 9);

let dbPromise: Promise<IDBDatabase> | null = null;

// Tareas activas de Storage y latidos de expiración (heartbeats) para renovación de bloqueos
const activeUploadTasks = new Map<string, UploadTask>();
const activeHeartbeats = new Map<string, ReturnType<typeof setInterval>>();
const cancellationReasons = new Map<string, 'user_deleted' | 'logout' | 'offline' | 'stalled'>();

// Seguimiento de confirmaciones remotas activas en Firestore (separación de etapas)
const activeFirestoreSaves = new Map<
  string,
  {
    promise: Promise<void>;
    opVersion: number;
    userId: string;
    cancelled?: boolean;
  }
>();

// Control de generaciones de sesión para distinguir salir y volver a entrar con la misma cuenta
let globalSessionGeneration = 0;
const userSessionGenerations = new Map<string, number>();

function getOrStartSessionGen(userId: string): number {
  let gen = userSessionGenerations.get(userId);
  if (!gen) {
    gen = ++globalSessionGeneration;
    userSessionGenerations.set(userId, gen);
  }
  return gen;
}

function invalidateSession(userId: string): void {
  userSessionGenerations.delete(userId);
}

function isSessionValid(userId: string, gen: number): boolean {
  return userSessionGenerations.get(userId) === gen;
}

// Aislamiento de sincronización y promesas por sesión de usuario
const sessionSyncPromises = new Map<string, Promise<PhotoSyncResult>>();

// Control de workers de subida desacoplados por sesión
const activeUploadWorkers = new Map<string, Promise<void>>();
const uploadWakeTriggers = new Map<string, () => void>();

// Colas de confirmación remota por usuario
const confirmationQueues = new Map<string, QueuedOfflinePhoto[]>();
const confirmationCount = new Map<string, number>();
const confirmationSettledPromises = new Map<string, Promise<void>[]>();

// Fotografías marcadas para eliminación para evitar resurrección y asegurar limpieza tardía
const deletedPhotoIds = new Set<string>();

// Fuente reactiva viva en memoria para progreso instantáneo sin desfasaje con IDB
const liveQueueItems = new Map<string, QueuedOfflinePhoto>();

// Suscriptores directos a cambios en la cola
const queueSubscribers = new Set<{
  callback: (items: QueuedOfflinePhoto[]) => void;
  userId?: string;
}>();

export interface PhotoQueueAdapters {
  uploadBytesResumable?: (storageRef: any, data: Blob | Uint8Array | ArrayBuffer, metadata?: any) => UploadTask;
  getDownloadURL?: (ref: any) => Promise<string>;
  deleteObject?: (ref: any) => Promise<void>;
  setDoc?: (docRef: any, data: any, options?: any) => Promise<void>;
  deleteDoc?: (docRef: any) => Promise<void>;
}

let activeAdapters: PhotoQueueAdapters = {};

export function setPhotoQueueAdapters(adapters: PhotoQueueAdapters): void {
  activeAdapters = { ...activeAdapters, ...adapters };
}

export function resetPhotoQueueAdapters(): void {
  activeAdapters = {};
}

export function resetQueueStateForTesting(): void {
  activeUploadTasks.clear();
  activeHeartbeats.forEach((int) => clearInterval(int));
  activeHeartbeats.clear();
  cancellationReasons.clear();
  activeFirestoreSaves.clear();
  sessionSyncPromises.clear();
  activeUploadWorkers.clear();
  uploadWakeTriggers.clear();
  confirmationQueues.clear();
  confirmationCount.clear();
  confirmationSettledPromises.clear();
  userSessionGenerations.clear();
  deletedPhotoIds.clear();
  liveQueueItems.clear();
  queueSubscribers.clear();
  autoSyncUserId = null;
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
  autoSyncOnlineHandler = null;
  activeAdapters = {};
}

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

  const isBlobLike =
    Boolean(
      raw.fileBlob &&
        (typeof Blob !== 'undefined' && raw.fileBlob instanceof Blob
          ? true
          : typeof raw.fileBlob === 'object' && typeof raw.fileBlob.size === 'number')
    );

  const unrecoverable =
    (!isBlobLike && !raw.cloudDownloadUrl) ||
    (isBlobLike && raw.fileBlob.size === 0 && !raw.cloudDownloadUrl);

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
    isDeleted: Boolean(raw.isDeleted),
    deletionPending: Boolean(raw.deletionPending),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt,
  };
}

/**
 * Obtiene la conexión a IndexedDB manejando bloqueos, cambios de versión y cierres inesperados.
 */
function getIndexedDB(): Promise<IDBDatabase> {
  const idbFactory: IDBFactory | undefined =
    (typeof indexedDB !== 'undefined' && indexedDB) ||
    (typeof window !== 'undefined' && window.indexedDB) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB);

  if (!idbFactory) {
    return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = idbFactory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      return reject(err);
    }

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
  // Notificar directamente a los observadores reactivos registrados en memoria
  queueSubscribers.forEach(({ callback, userId }) => {
    try {
      const items = Array.from(liveQueueItems.values())
        .filter((item) => !deletedPhotoIds.has(item.id) && !item.isDeleted && !item.deletionPending)
        .filter((item) => (userId ? item.userId === userId : true));
      callback(items);
    } catch (err) {
      console.warn('[QueueSubscribers] Error en callback de suscriptor:', err);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cultiveta_offline_queue_changed'));
  }
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

    // Registrar en fuente reactiva viva y remover de eliminadas
    deletedPhotoIds.delete(params.id);
    liveQueueItems.set(queuedItem.id, queuedItem);

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

    // Despertar el bucle de subida inmediatamente si ya hay un planificador en marcha
    const waker = uploadWakeTriggers.get(params.userId);
    if (waker) {
      waker();
    }

    return queuedItem;
  },

  /**
   * Obtiene la lista de fotografías pendientes encoladas en IndexedDB,
   * filtrando exclusivamente por el UID provisto y sincronizando la fuente reactiva viva.
   */
  async getQueuedPhotos(userId?: string): Promise<QueuedOfflinePhoto[]> {
    try {
      const items = await runIDBTransaction<any[]>('readonly', (store) => store.getAll());
      if (!items || !Array.isArray(items)) return [];

      const normalized = items
        .map(normalizeRecord)
        .filter((item) => {
          if (item.deletionPending || item.isDeleted || deletedPhotoIds.has(item.id)) {
            deletedPhotoIds.add(item.id);
            // Reintentar purga remota en segundo plano para limpiezas pendientes
            this._purgeRemoteArtifactsAndFinalize(item.id, item).catch(() => {});
            return false;
          }
          return true;
        });

      // Sincronizar fuente viva
      normalized.forEach((item) => {
        const live = liveQueueItems.get(item.id);
        if (!live || (item.opVersion || 1) >= (live.opVersion || 1)) {
          liveQueueItems.set(item.id, {
            ...item,
            bytesTransferred: live?.bytesTransferred ?? item.bytesTransferred,
            totalBytes: live?.totalBytes ?? item.totalBytes,
            progressPercent: live?.progressPercent ?? item.progressPercent,
            lastProgressAt: live?.lastProgressAt ?? item.lastProgressAt,
          });
        }
      });

      const merged = normalized.map((item) => {
        const live = liveQueueItems.get(item.id);
        if (live && (live.opVersion || 1) >= (item.opVersion || 1)) {
          return {
            ...item,
            status: live.status,
            bytesTransferred: live.bytesTransferred ?? item.bytesTransferred,
            totalBytes: live.totalBytes ?? item.totalBytes,
            progressPercent: live.progressPercent ?? item.progressPercent,
            lastProgressAt: live.lastProgressAt ?? item.lastProgressAt,
            lastError: live.lastError ?? item.lastError,
            lastErrorCode: live.lastErrorCode ?? item.lastErrorCode,
          };
        }
        return item;
      });

      if (userId) {
        return merged.filter((item) => item.userId === userId);
      }
      return merged;
    } catch (err) {
      console.warn('[IndexedDB] Error al recuperar fotos encoladas:', err);
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
   * Obtiene un registro individual de la cola por su ID, enriquecido con estado en tiempo real.
   */
  async getQueuedPhotoById(id: string): Promise<QueuedOfflinePhoto | null> {
    if (deletedPhotoIds.has(id)) return null;
    try {
      const item = await runIDBTransaction<any | undefined>('readonly', (store) => store.get(id));
      if (!item || item.isDeleted || item.deletionPending) return null;
      const normalized = normalizeRecord(item);
      const live = liveQueueItems.get(id);
      if (live && (live.opVersion || 1) >= (normalized.opVersion || 1)) {
        return {
          ...normalized,
          status: live.status,
          bytesTransferred: live.bytesTransferred ?? normalized.bytesTransferred,
          totalBytes: live.totalBytes ?? normalized.totalBytes,
          progressPercent: live.progressPercent ?? normalized.progressPercent,
          lastProgressAt: live.lastProgressAt ?? normalized.lastProgressAt,
          lastError: live.lastError ?? normalized.lastError,
          lastErrorCode: live.lastErrorCode ?? normalized.lastErrorCode,
        };
      }
      return normalized;
    } catch (err) {
      console.warn(`[IndexedDB] Error al recuperar foto ${id}:`, err);
      return null;
    }
  },

  /**
   * Reclama atómicamente una tarea en una sola transacción readwrite de IndexedDB.
   * La transacción se CIERRA Y CONFIRMA antes de realizar cualquier llamada de red.
   * Devuelve el resultado real directamente desde la misma transacción; NUNCA
   * asume adquisición por encontrar registros preexistentes con lockOwner === TAB_ID.
   */
  async claimTask(
    photoId: string,
    currentAuthUid: string
  ): Promise<{ claimed: boolean; item?: QueuedOfflinePhoto }> {
    if (
      activeUploadTasks.has(photoId) ||
      activeFirestoreSaves.has(photoId) ||
      deletedPhotoIds.has(photoId)
    ) {
      return { claimed: false };
    }

    try {
      const idb = await getIndexedDB();
      return await new Promise<{ claimed: boolean; item?: QueuedOfflinePhoto }>((resolve) => {
        let outcome: { claimed: boolean; item?: QueuedOfflinePhoto } = { claimed: false };
        let tx: IDBTransaction;
        try {
          tx = idb.transaction(STORE_NAME, 'readwrite');
        } catch {
          return resolve({ claimed: false });
        }

        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => {
          if (outcome.claimed && outcome.item) {
            liveQueueItems.set(outcome.item.id, outcome.item);
          }
          resolve(outcome);
        };
        tx.onerror = () => resolve({ claimed: false });
        tx.onabort = () => resolve({ claimed: false });

        const getReq = store.get(photoId);
        getReq.onsuccess = () => {
          const raw = getReq.result;
          if (!raw || raw.isDeleted || raw.deletionPending || deletedPhotoIds.has(photoId)) {
            outcome = { claimed: false };
            return;
          }

          const item = normalizeRecord(raw);

          // Validar UID real de auth
          if (item.userId !== currentAuthUid) {
            outcome = { claimed: false };
            return;
          }

          // Si es irrecuperable
          if (item.unrecoverable) {
            outcome = { claimed: false };
            return;
          }

          // Si ya está activa en esta misma pestaña
          if (activeUploadTasks.has(photoId) || activeFirestoreSaves.has(photoId)) {
            outcome = { claimed: false };
            return;
          }

          const now = Date.now();
          // Si el bloqueo está activo y vigente (sea de otra pestaña o de esta), NO volver a reclamar
          if (item.lockUntil && item.lockUntil > now) {
            outcome = { claimed: false };
            return;
          }

          // Asignar reclamo atómico en la transacción
          item.lockOwner = TAB_ID;
          item.lockUntil = now + 35000;
          item.opVersion = (item.opVersion || 0) + 1;
          item.startedAt = item.startedAt || new Date().toISOString();

          store.put(item);
          outcome = { claimed: true, item };
        };
      });
    } catch {
      return { claimed: false };
    }
  },

  /**
   * Inicia un latido de renovación de concesión (heartbeat) para mantener el bloqueo
   * activo mientras una subida de Storage o guardado en Firestore está en curso.
   */
  startHeartbeat(photoId: string, opVersion: number): void {
    this.stopHeartbeat(photoId);

    const interval = setInterval(async () => {
      if (deletedPhotoIds.has(photoId)) {
        this.stopHeartbeat(photoId);
        return;
      }
      try {
        await runIDBTransaction('readwrite', (store) => {
          const req = store.get(photoId);
          req.onsuccess = () => {
            const raw = req.result;
            if (
              raw &&
              !deletedPhotoIds.has(photoId) &&
              !raw.isDeleted &&
              !raw.deletionPending &&
              raw.lockOwner === TAB_ID &&
              (raw.opVersion || 1) === opVersion
            ) {
              raw.lockUntil = Date.now() + 35000;
              store.put(raw);
            }
          };
        });
      } catch (err) {
        console.warn(`[Heartbeat] Fallo al renovar concesión para ${photoId}:`, err);
      }
    }, 12000);

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
    activeFirestoreSaves.delete(id);
    liveQueueItems.delete(id);

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
   * BORRADO DURABLE Y RECUPERABLE: Registra la intención persistente en IndexedDB
   * antes de purgar recursos remotos, previniendo reapariciones ante recargas o fallos.
   */
  async deletePendingPhoto(id: string, userId: string): Promise<boolean> {
    deletedPhotoIds.add(id);
    liveQueueItems.delete(id);

    // Cancelar subida en Storage si está activa
    const task = activeUploadTasks.get(id);
    if (task) {
      cancellationReasons.set(id, 'user_deleted');
      try {
        task.cancel();
      } catch {}
      activeUploadTasks.delete(id);
    }

    // Cancelar confirmación en Firestore si está activa
    const activeSave = activeFirestoreSaves.get(id);
    if (activeSave) {
      activeSave.cancelled = true;
    }

    this.stopHeartbeat(id);

    // Limpiar de localStore inmediatamente para reactividad instantánea en la UI
    localStore.deleteItem('photos', id, userId);

    // 1. Marcar intención de borrado persistente en IndexedDB (DURABLE DELETE)
    let itemRecord: QueuedOfflinePhoto | null = null;
    try {
      await runIDBTransaction('readwrite', (store) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const raw = req.result;
          if (raw) {
            raw.deletionPending = true;
            raw.isDeleted = true;
            raw.status = 'queued';
            store.put(raw);
            itemRecord = normalizeRecord(raw);
          }
        };
      });
    } catch (err) {
      console.warn(`[deletePendingPhoto] Error registrando intención de borrado para ${id}:`, err);
    }

    notifyQueueUpdated();

    // 2. Ejecutar limpieza remota requerida y purgar registro si fue exitosa
    const targetItem = itemRecord || (await this.getQueuedPhotoById(id));
    return await this._purgeRemoteArtifactsAndFinalize(id, targetItem);
  },

  /**
   * Purga recursos remotos (Firestore y Storage) y, tras confirmar la limpieza,
   * elimina definitivamente el registro durable de IndexedDB.
   */
  async _purgeRemoteArtifactsAndFinalize(id: string, item: QueuedOfflinePhoto | null): Promise<boolean> {
    let remoteCleaned = true;
    const doDeleteDoc = activeAdapters.deleteDoc || deleteDoc;
    const doDeleteObject = activeAdapters.deleteObject || deleteObject;

    if (item?.storagePath) {
      try {
        await doDeleteObject(ref(storage, item.storagePath));
      } catch (err: any) {
        if (err?.code !== 'storage/object-not-found') {
          console.warn(`[DurableDelete] Error al purgar binario en Storage para ${id}:`, err);
          remoteCleaned = false;
        }
      }
    }

    try {
      const docRef = doc(db, 'photos', id);
      await doDeleteDoc(docRef);
    } catch (err: any) {
      console.warn(`[DurableDelete] Error al purgar documento en Firestore para ${id}:`, err);
      remoteCleaned = false;
    }

    if (remoteCleaned) {
      try {
        await runIDBTransaction('readwrite', (store) => store.delete(id));
      } catch {}
    } else {
      console.warn(`[DurableDelete] ⚠️ Limpieza remota pendiente de reintento para ${id}. Se conserva intención duradera.`);
    }

    notifyQueueUpdated();
    return remoteCleaned;
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
   * Actualiza el estado de un registro de foto encolado de forma atómica.
   * DEVUELVE EL RESULTADO REAL de la operación desde la transacción.
   * NO publica en liveQueueItems una modificación rechazada.
   */
  async updateItem(item: QueuedOfflinePhoto): Promise<boolean> {
    if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
      return false;
    }

    try {
      const idb = await getIndexedDB();
      return await new Promise<boolean>((resolve) => {
        let applied = false;
        let tx: IDBTransaction;
        try {
          tx = idb.transaction(STORE_NAME, 'readwrite');
        } catch {
          return resolve(false);
        }

        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => {
          if (applied) {
            // ÚNICAMENTE si la base de datos aplicó el cambio se publica en la fuente reactiva
            liveQueueItems.set(item.id, { ...item });
            notifyQueueUpdated();
          }
          resolve(applied);
        };
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);

        const req = store.get(item.id);
        req.onsuccess = () => {
          const current = req.result;
          if (!current) {
            return; // Inexistente: applied = false
          }
          if (current.isDeleted || current.deletionPending || deletedPhotoIds.has(item.id)) {
            return; // Borrado concurrente: applied = false
          }
          if (current.userId !== item.userId) {
            return; // Propietario diferente: applied = false
          }
          if (current.lockOwner && current.lockOwner !== TAB_ID) {
            const now = Date.now();
            if (current.lockUntil && current.lockUntil > now) {
              return; // Bloqueado activamente por otra pestaña: applied = false
            }
          }
          if (
            typeof current.opVersion === 'number' &&
            typeof item.opVersion === 'number' &&
            current.opVersion > item.opVersion
          ) {
            return; // Versión obsoleta: applied = false
          }

          item.updatedAt = new Date().toISOString();
          store.put(item);
          applied = true;
        };
      });
    } catch {
      return false;
    }
  },

  /**
   * Persiste un punto de recuperación durable en IndexedDB durante la transferencia de bytes.
   */
  async persistProgressCheckpoint(item: QueuedOfflinePhoto): Promise<void> {
    if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) return;
    try {
      await runIDBTransaction('readwrite', (store) => {
        const req = store.get(item.id);
        req.onsuccess = () => {
          const current = req.result;
          if (current && !deletedPhotoIds.has(item.id) && !current.isDeleted && !current.deletionPending) {
            current.bytesTransferred = item.bytesTransferred;
            current.totalBytes = item.totalBytes;
            current.progressPercent = item.progressPercent;
            current.lastProgressAt = item.lastProgressAt;
            store.put(current);
          }
        };
      });
    } catch {}
  },

  /**
   * Forzar reintento explícito por parte del usuario para un elemento fallido.
   * Respeta tareas que ya se encuentren activas.
   */
  async retryPendingPhoto(id: string, userId: string): Promise<boolean> {
    deletedPhotoIds.delete(id);
    const item = await this.getQueuedPhotoById(id);
    if (!item) return false;

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
   * Utiliza la fuente reactiva en memoria para presentar porcentajes y bytes en tiempo real.
   * Distingue falta de conexión, estancamiento y errores de permisos.
   * NUNCA presenta un porcentaje antiguo como diagnóstico actual de subida activa.
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

    const isNetworkOffline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      item.lastErrorCode === 'network_offline';

    const isStalled = item.lastErrorCode === 'upload_stalled';

    const isPermissionError =
      item.lastErrorCode === 'permission_denied' ||
      item.lastErrorCode === 'storage/unauthorized' ||
      Boolean(item.lastError && item.lastError.toLowerCase().includes('permission'));

    let diagnosticCategory: PhotoDiagnosticInfo['diagnosticCategory'] = 'normal';
    if (item.unrecoverable) diagnosticCategory = 'unrecoverable';
    else if (isPermissionError) diagnosticCategory = 'permission_denied';
    else if (isStalled) diagnosticCategory = 'stalled';
    else if (isNetworkOffline) diagnosticCategory = 'network_offline';

    const currentActivePercent = item.status === 'uploading' ? (item.progressPercent || 0) : 0;

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
      isNetworkOffline,
      isStalled,
      isPermissionError,
      diagnosticCategory,
      currentActivePercent,
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
      `Categoría diagnóstico: ${diag.diagnosticCategory.toUpperCase()}`,
      `Progreso activo en curso: ${diag.currentActivePercent}%`,
      `Último avance registrado: ${diag.progressPercent}% (${diag.bytesTransferred} / ${diag.totalBytes} bytes)`,
      `Fecha último avance: ${diag.lastProgressAt || 'Sin avance registrado'}`,
      `Tiempo transcurrido: ${diag.elapsedSeconds ? `${diag.elapsedSeconds}s` : 'N/A'}`,
      `Intentos: ${diag.retryCount}`,
      `Falta de red: ${diag.isNetworkOffline ? 'SÍ (Sin red)' : 'No'}`,
      `Subida estancada: ${diag.isStalled ? 'SÍ (Sin avance de bytes en red)' : 'No'}`,
      `Error de permisos: ${diag.isPermissionError ? 'SÍ (Acceso denegado en Firebase)' : 'No'}`,
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
   * Devuelve un PhotoSyncResult tipado en todas las salidas.
   * Desacopla la subida de binarios de la confirmación remota, permitiendo que
   * nuevas fotos comiencen a subir sin esperar que terminen los setDoc anteriores.
   */
  syncPendingPhotos(userId?: string): Promise<PhotoSyncResult> {
    const currentAuthUser = auth.currentUser;
    const targetUserId = userId || (currentAuthUser ? currentAuthUser.uid : autoSyncUserId);

    if (!targetUserId) {
      console.log('[OfflineSync] Sin usuario autenticado. Sincronización pospuesta.');
      return Promise.resolve({
        synced: 0,
        failed: 0,
        deleted: 0,
        pending: 0,
        total: 0,
        stopped: true,
        reason: 'session_closed',
      });
    }

    const sessionGen = getOrStartSessionGen(targetUserId);

    // Asegurar que el pipeline de subida continuo esté activo o tome nuevas tareas
    this._ensureUploadPipeline(targetUserId, sessionGen);

    const existingPromise = sessionSyncPromises.get(targetUserId);
    if (existingPromise) {
      return existingPromise;
    }

    const p = this._executeSync(targetUserId, sessionGen).finally(() => {
      sessionSyncPromises.delete(targetUserId);
    });

    sessionSyncPromises.set(targetUserId, p);
    return p;
  },

  /**
   * Obtiene la siguiente tarea elegible para subida a Storage o confirmación remota.
   */
  async _getNextEligibleUploadTask(targetUserId: string): Promise<QueuedOfflinePhoto | null> {
    try {
      const pending = await this.getQueuedPhotos(targetUserId);
      for (const item of pending) {
        if (item.unrecoverable || item.isDeleted || item.deletionPending || deletedPhotoIds.has(item.id)) {
          continue;
        }
        if (activeUploadTasks.has(item.id) || activeFirestoreSaves.has(item.id)) {
          continue;
        }
        // Si ya está en la cola de confirmación en espera de slot de setDoc
        const q = confirmationQueues.get(targetUserId);
        if (q && q.some((p) => p.id === item.id)) {
          continue;
        }

        const claim = await this.claimTask(item.id, targetUserId);
        if (claim.claimed && claim.item) {
          return claim.item;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Asegura que el pipeline de subida continua esté ejecutándose para este usuario.
   * Permite que nuevas fotos agregadas posteriormente (ej. Foto B) se reclamen
   * y comiencen a subir de inmediato sin esperar que terminen las confirmaciones anteriores.
   */
  _ensureUploadPipeline(targetUserId: string, sessionGen: number): Promise<void> {
    if (!isSessionValid(targetUserId, sessionGen)) {
      return Promise.resolve();
    }

    // Si ya hay un disparador de despertar, activarlo
    const waker = uploadWakeTriggers.get(targetUserId);
    if (waker) {
      waker();
    }

    const existingRunner = activeUploadWorkers.get(targetUserId);
    if (existingRunner) {
      return existingRunner;
    }

    const MAX_CONCURRENT_UPLOADS = 2;

    const runner = (async () => {
      let keepRunning = true;
      while (keepRunning && isSessionValid(targetUserId, sessionGen)) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          break;
        }

        // Buscar siguiente tarea elegible
        const item = await this._getNextEligibleUploadTask(targetUserId);
        if (!item) {
          // Esperar hasta que se encole una nueva foto o concluir tras breve espera
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              uploadWakeTriggers.delete(targetUserId);
              keepRunning = false;
              resolve();
            }, 60);

            uploadWakeTriggers.set(targetUserId, () => {
              clearTimeout(timer);
              uploadWakeTriggers.delete(targetUserId);
              resolve();
            });
          });
          continue;
        }

        // Si ya tiene cloudDownloadUrl, pasa directamente a la cola de confirmación
        if (item.cloudDownloadUrl) {
          this._enqueueConfirmation(item, targetUserId, sessionGen);
          continue;
        }

        // Subir binario a Storage
        const uploadResult = await this._uploadBinaryToStorage(item, targetUserId, sessionGen);
        if (uploadResult.status === 'ready_for_confirm' && uploadResult.item) {
          // Inmediatamente pasamos a la cola de Firestore
          // y este worker queda libre para tomar la siguiente foto
          this._enqueueConfirmation(uploadResult.item, targetUserId, sessionGen);
        }
      }
    })().finally(() => {
      activeUploadWorkers.delete(targetUserId);
      uploadWakeTriggers.delete(targetUserId);
    });

    activeUploadWorkers.set(targetUserId, runner);
    return runner;
  },

  /**
   * Pone en cola una foto lista para confirmación remota en Firestore
   * y planifica su ejecución en paralelo con concurrencia controlada (máx 3).
   */
  _enqueueConfirmation(item: QueuedOfflinePhoto, targetUserId: string, sessionGen: number): void {
    if (!isSessionValid(targetUserId, sessionGen)) return;

    let q = confirmationQueues.get(targetUserId);
    if (!q) {
      q = [];
      confirmationQueues.set(targetUserId, q);
    }
    q.push(item);
    this._scheduleConfirmations(targetUserId, sessionGen);
  },

  _scheduleConfirmations(targetUserId: string, sessionGen: number): void {
    const q = confirmationQueues.get(targetUserId) || [];
    let currentActive = confirmationCount.get(targetUserId) || 0;
    const MAX_CONFIRM_CONCURRENCY = 3;

    let settledList = confirmationSettledPromises.get(targetUserId);
    if (!settledList) {
      settledList = [];
      confirmationSettledPromises.set(targetUserId, settledList);
    }

    while (q.length > 0 && currentActive < MAX_CONFIRM_CONCURRENCY) {
      if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
        // VACIAR confirmationQueue liberando bloqueos en IDB para que los elementos no se pierdan
        while (q.length > 0) {
          const waitingItem = q.shift();
          if (waitingItem) {
            waitingItem.lockOwner = undefined;
            waitingItem.lockUntil = undefined;
            waitingItem.status = 'queued';
            this.updateItem(waitingItem).catch(() => {});
          }
        }
        break;
      }

      const nextPhoto = q.shift();
      if (!nextPhoto) break;

      currentActive++;
      confirmationCount.set(targetUserId, currentActive);

      const promise = this._confirmPhotoInFirestore(nextPhoto, targetUserId, sessionGen)
        .catch((err) => {
          console.warn(`[ConfirmationPipeline] Error inesperado en confirmación de ${nextPhoto.id}:`, err);
          return 'failed';
        })
        .finally(() => {
          const cur = (confirmationCount.get(targetUserId) || 1) - 1;
          confirmationCount.set(targetUserId, Math.max(0, cur));
          this._scheduleConfirmations(targetUserId, sessionGen);
        });

      settledList.push(promise.then(() => {}));
    }
  },

  /**
   * Ejecuta la sincronización separando planificación, ejecución de subida y confirmación remota.
   * Concurrencia desacoplada: una confirmación pendiente jamás bloquea nuevas fotos ni la UI.
   */
  async _executeSync(targetUserId: string, sessionGen: number): Promise<PhotoSyncResult> {
    if (!targetUserId || !isSessionValid(targetUserId, sessionGen)) {
      return { synced: 0, failed: 0, deleted: 0, pending: 0, total: 0, stopped: true, reason: 'session_closed' };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      let pendingCount = 0;
      try {
        const p = await this.getQueuedPhotos(targetUserId);
        pendingCount = p.filter((i) => !i.isDeleted && !i.deletionPending).length;
      } catch {}
      return {
        synced: 0,
        failed: 0,
        deleted: 0,
        pending: pendingCount,
        total: pendingCount,
        stopped: true,
        reason: 'network_offline',
      };
    }

    let initialPending: QueuedOfflinePhoto[] = [];
    try {
      initialPending = await this.getQueuedPhotos(targetUserId);
    } catch {
      return { synced: 0, failed: 0, deleted: 0, pending: 0, total: 0, stopped: true, reason: 'aborted' };
    }

    let unrecoverableCount = 0;
    for (const item of initialPending) {
      if (item.unrecoverable) {
        unrecoverableCount++;
      }
    }

    let synced = 0;
    let failed = unrecoverableCount;
    let deletedCount = 0;
    let stopped = false;
    let stopReason: PhotoSyncResult['reason'] = 'completed';

    // Lanzar y asegurar pipeline de subida
    const uploadRunner = this._ensureUploadPipeline(targetUserId, sessionGen);

    // Esperar a que la subida de los elementos iniciales concluya
    await uploadRunner;

    // Disparar y esperar que concluyan las confirmaciones de esta sesión
    this._scheduleConfirmations(targetUserId, sessionGen);

    const q = confirmationQueues.get(targetUserId) || [];

    while (
      (confirmationCount.get(targetUserId) || 0) > 0 ||
      (confirmationQueues.get(targetUserId) && confirmationQueues.get(targetUserId)!.length > 0)
    ) {
      if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
        stopped = true;
        stopReason = 'session_closed';
        const currentQ = confirmationQueues.get(targetUserId);
        if (currentQ) {
          while (currentQ.length > 0) {
            const waitingItem = currentQ.shift();
            if (waitingItem) {
              waitingItem.lockOwner = undefined;
              waitingItem.lockUntil = undefined;
              waitingItem.status = 'queued';
              this.updateItem(waitingItem).catch(() => {});
            }
          }
        }
      }

      const settledList = confirmationSettledPromises.get(targetUserId);
      if (settledList && settledList.length > 0) {
        const toWait = [...settledList];
        settledList.length = 0;
        await Promise.all(toWait);
      } else {
        await new Promise((r) => setTimeout(r, 20));
      }
    }

    // Calcular cantidad real de pendientes en la cola tras la sincronización
    let realPendingCount = 0;
    try {
      const remainingItems = await this.getQueuedPhotos(targetUserId);
      realPendingCount = remainingItems.filter(
        (p) => !p.isDeleted && !p.deletionPending && !deletedPhotoIds.has(p.id) && p.status !== 'synced'
      ).length;
    } catch {
      realPendingCount = Math.max(0, initialPending.length - synced - failed - deletedCount);
    }

    // Determinar cantidad de sincronizadas reales
    const syncedCount = Math.max(0, initialPending.length - realPendingCount - failed - deletedCount);

    if (syncedCount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cultiveta_photos_synced', {
          detail: { syncedCount },
        })
      );
    }

    return {
      synced: syncedCount,
      failed,
      deleted: deletedCount,
      pending: realPendingCount,
      total: initialPending.length,
      stopped,
      reason: stopReason,
    };
  },

  /**
   * Ejecución por foto: Fase de subida de binarios a Storage con uploadBytesResumable.
   */
  async _uploadBinaryToStorage(
    item: QueuedOfflinePhoto,
    targetUserId: string,
    sessionGen: number
  ): Promise<{
    status: 'ready_for_confirm' | 'failed' | 'deleted' | 'session_closed' | 'network_offline' | 'retry_later';
    item?: QueuedOfflinePhoto;
  }> {
    if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
      return { status: 'deleted' };
    }
    if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
      return { status: 'session_closed' };
    }

    const opVersion = item.opVersion || 1;
    this.startHeartbeat(item.id, opVersion);

    try {
      item.status = 'uploading';
      await this.updateItem(item);

      if (auth.currentUser?.uid === targetUserId && !deletedPhotoIds.has(item.id) && !item.deletionPending) {
        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: 'uploading',
          isPendingSync: true,
        });
      }

      const doUpload = activeAdapters.uploadBytesResumable || uploadBytesResumable;
      const doGetDownloadURL = activeAdapters.getDownloadURL || getDownloadURL;
      const doDeleteObject = activeAdapters.deleteObject || deleteObject;

      const storageRef = ref(storage, item.storagePath);
      const uploadTask = doUpload(storageRef, item.fileBlob, {
        contentType: item.fileType,
      });
      activeUploadTasks.set(item.id, uploadTask);

      let lastBytes = 0;
      let lastProgressTimestamp = Date.now();
      let lastPersistedPercent = item.progressPercent || 0;
      let lastPersistedTime = Date.now();

      const stallCheckTimer = setInterval(() => {
        const now = Date.now();
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          cancellationReasons.set(item.id, 'offline');
          uploadTask.cancel();
          return;
        }
        if (now - lastProgressTimestamp > 35000) {
          console.warn(`[OfflineSync] Subida estancada detectada en foto ${item.id}. Cancelando tarea para reintento.`);
          cancellationReasons.set(item.id, 'stalled');
          uploadTask.cancel();
        }
      }, 5000);

      uploadTask.on('state_changed', (snapshot) => {
        const now = Date.now();
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          lastProgressTimestamp = now;
        } else if (snapshot.state === 'running' && lastBytes === 0) {
          lastProgressTimestamp = now;
        }

        const percent =
          snapshot.totalBytes > 0
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;

        item.bytesTransferred = snapshot.bytesTransferred;
        item.totalBytes = snapshot.totalBytes;
        item.progressPercent = percent;
        item.lastProgressAt = new Date().toISOString();

        // Notificación reactiva instantánea en memoria
        liveQueueItems.set(item.id, { ...item });
        notifyQueueUpdated();

        // Persistencia durable de checkpoints cada 25% o 5s
        if (percent - lastPersistedPercent >= 25 || now - lastPersistedTime >= 5000) {
          lastPersistedPercent = percent;
          lastPersistedTime = now;
          this.persistProgressCheckpoint(item);
        }
      });

      try {
        await uploadTask;
      } finally {
        clearInterval(stallCheckTimer);
        activeUploadTasks.delete(item.id);
      }

      // Comprobación de borrado durante la subida
      if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
        try {
          await doDeleteObject(uploadTask.snapshot.ref);
        } catch {}
        this.stopHeartbeat(item.id);
        return { status: 'deleted' };
      }

      // Comprobación de cambio de sesión durante la subida
      if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
        this.stopHeartbeat(item.id);
        item.lockUntil = undefined;
        item.lockOwner = undefined;
        item.status = 'queued';
        await this.updateItem(item);
        return { status: 'session_closed' };
      }

      // Obtener URL de descarga en la nube
      const downloadUrl = await doGetDownloadURL(uploadTask.snapshot.ref);

      if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
        try {
          await doDeleteObject(uploadTask.snapshot.ref);
        } catch {}
        this.stopHeartbeat(item.id);
        return { status: 'deleted' };
      }

      // TWO-PHASE COMMIT: Guardar cloudDownloadUrl en IndexedDB antes de pasar a Firestore
      item.cloudDownloadUrl = downloadUrl;
      item.stagePending = 'firestore';
      item.progressPercent = 100;
      await this.updateItem(item);

      return { status: 'ready_for_confirm', item };
    } catch (stepErr: unknown) {
      this.stopHeartbeat(item.id);
      activeUploadTasks.delete(item.id);

      const errObj = stepErr as { message?: string; code?: string; name?: string } | undefined;
      const isCanceled = errObj?.code === 'storage/canceled';
      const cancelReason = cancellationReasons.get(item.id);
      cancellationReasons.delete(item.id);

      if (isCanceled) {
        if (cancelReason === 'user_deleted' || deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
          console.log(`[OfflineSync] Subida de foto ${item.id} cancelada por eliminación voluntaria.`);
          return { status: 'deleted' };
        }
        if (cancelReason === 'logout' || !isSessionValid(targetUserId, sessionGen)) {
          console.log(`[OfflineSync] Subida de foto ${item.id} pausada por cierre de sesión.`);
          item.lockUntil = undefined;
          item.lockOwner = undefined;
          item.status = 'queued';
          await this.updateItem(item);
          return { status: 'session_closed' };
        }
        if (cancelReason === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
          console.info(`[OfflineSync] Subida de foto ${item.id} pausada por desconexión de red.`);
          item.status = 'waiting_network';
          item.lastError = 'Conexión de red interrumpida durante la subida.';
          item.lastErrorCode = 'network_offline';
          item.lockUntil = undefined;
          item.lockOwner = undefined;
          await this.updateItem(item);
          if (auth.currentUser?.uid === targetUserId && !deletedPhotoIds.has(item.id)) {
            localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
              id: item.id,
              userId: item.userId,
              syncStatus: 'waiting_network',
              syncError: item.lastError,
              isPendingSync: true,
            });
          }
          return { status: 'network_offline' };
        }
        if (cancelReason === 'stalled') {
          console.warn(`[OfflineSync] Subida de foto ${item.id} estancada en red; reprogramada.`);
          item.status = 'queued';
          item.lastError = 'La subida se estancó sin avance de bytes; reprogramada.';
          item.lastErrorCode = 'upload_stalled';
          item.lockUntil = undefined;
          item.lockOwner = undefined;
          await this.updateItem(item);
          return { status: 'retry_later' };
        }

        item.status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'waiting_network' : 'queued';
        item.lastError = 'Subida cancelada o reprogramada.';
        item.lastErrorCode = 'storage/canceled';
        item.lockUntil = undefined;
        item.lockOwner = undefined;
        await this.updateItem(item);
        return { status: 'retry_later' };
      }

      if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
        return { status: 'deleted' };
      }

      console.error(`[OfflineSync] Fallo en subida de foto ${item.id}:`, stepErr);

      const isPermission =
        errObj?.code === 'storage/unauthorized' ||
        errObj?.code === 'permission-denied' ||
        Boolean(errObj?.message && errObj.message.toLowerCase().includes('permission'));

      item.status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'waiting_network' : 'failed';
      item.retryCount = (item.retryCount || 0) + 1;
      item.lastError = errObj?.message || 'Error durante la subida a Storage.';
      item.lastErrorCode = isPermission
        ? 'permission_denied'
        : errObj?.code || (errObj?.name === 'FirebaseError' ? 'firebase-error' : 'network-error');
      item.lastErrorAt = new Date().toISOString();
      item.lockUntil = undefined;
      item.lockOwner = undefined;

      await this.updateItem(item);

      if (auth.currentUser?.uid === targetUserId && !deletedPhotoIds.has(item.id)) {
        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: mapQueueStatusToSyncStatus(item.status),
          syncError: item.lastError,
          isPendingSync: true,
        });
      }

      return { status: 'failed' };
    }
  },

  /**
   * Confirmación remota: Fase de persistencia de metadatos en Cloud Firestore.
   * NO simula cancelación mediante Promise.race; gestiona confirmaciones tardías
   * sin duplicar escrituras ni marcar sincronizada una foto sin confirmación real.
   */
  async _confirmPhotoInFirestore(
    item: QueuedOfflinePhoto,
    targetUserId: string,
    sessionGen: number
  ): Promise<'synced' | 'failed' | 'deleted' | 'session_closed'> {
    const doSetDoc = activeAdapters.setDoc || setDoc;
    const doDeleteDoc = activeAdapters.deleteDoc || deleteDoc;
    const doDeleteObject = activeAdapters.deleteObject || deleteObject;

    if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
      if (item.cloudDownloadUrl) {
        try {
          await doDeleteObject(ref(storage, item.storagePath));
        } catch {}
      }
      this.stopHeartbeat(item.id);
      return 'deleted';
    }

    if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
      this.stopHeartbeat(item.id);
      item.lockUntil = undefined;
      item.lockOwner = undefined;
      item.status = 'queued';
      await this.updateItem(item);
      return 'session_closed';
    }

    const opVersion = item.opVersion || 1;
    this.startHeartbeat(item.id, opVersion);

    item.status = 'saving_metadata';
    await this.updateItem(item);

    if (auth.currentUser?.uid === targetUserId && !deletedPhotoIds.has(item.id) && !item.deletionPending) {
      localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
        id: item.id,
        userId: item.userId,
        syncStatus: 'saving_metadata',
        isPendingSync: true,
      });
    }

    const photoRecord: PhotoRecord = {
      id: item.id,
      userId: item.userId,
      cultivationId: item.cultivationId,
      url: item.cloudDownloadUrl || '',
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

    const saveExecution = (async (): Promise<void> => {
      await doSetDoc(docRef, cleaned);
    })();

    activeFirestoreSaves.set(item.id, {
      promise: saveExecution,
      opVersion,
      userId: targetUserId,
    });

    try {
      await saveExecution;
    } catch (saveErr: unknown) {
      activeFirestoreSaves.delete(item.id);
      this.stopHeartbeat(item.id);

      if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
        return 'deleted';
      }

      console.error(`[OfflineSync] Error al guardar metadatos en Firestore para foto ${item.id}:`, saveErr);

      const errObj = saveErr as { message?: string; code?: string; name?: string } | undefined;
      const isPermission =
        errObj?.code === 'permission-denied' ||
        Boolean(errObj?.message && errObj.message.toLowerCase().includes('permission'));

      item.status = 'failed';
      item.retryCount = (item.retryCount || 0) + 1;
      item.lastError = errObj?.message || 'Error al persistir metadatos en Firestore.';
      item.lastErrorCode = isPermission ? 'permission_denied' : errObj?.code || 'firestore_error';
      item.lastErrorAt = new Date().toISOString();
      item.lockUntil = undefined;
      item.lockOwner = undefined;

      await this.updateItem(item);

      if (auth.currentUser?.uid === targetUserId && !deletedPhotoIds.has(item.id)) {
        localStore.saveItem<Partial<PhotoRecord> & { id: string; userId: string }>('photos', {
          id: item.id,
          userId: item.userId,
          syncStatus: 'error',
          syncError: item.lastError,
          isPendingSync: true,
        });
      }

      return 'failed';
    } finally {
      activeFirestoreSaves.delete(item.id);
    }

    // ==============================================================
    // GESTIÓN DE CONFIRMACIONES TARDÍAS Y BORRADO CONCURRENTE
    // ==============================================================
    if (deletedPhotoIds.has(item.id) || item.deletionPending || item.isDeleted) {
      console.warn(`[OfflineSync] Foto ${item.id} confirmada después de solicitar borrado. Purgando documentos remotos.`);
      try {
        await doDeleteDoc(docRef);
      } catch {}
      try {
        await doDeleteObject(ref(storage, item.storagePath));
      } catch {}
      this.stopHeartbeat(item.id);
      return 'deleted';
    }

    if (!isSessionValid(targetUserId, sessionGen) || (auth.currentUser && auth.currentUser.uid !== targetUserId)) {
      console.info(`[OfflineSync] Foto ${item.id} confirmada tras cambio de sesión. Limpiando de cola sin alterar UI ajena.`);
      this.stopHeartbeat(item.id);
      await this.cleanupConfirmedPhoto(item.id);
      return 'session_closed';
    }

    // Confirmación exitosa completa
    this.stopHeartbeat(item.id);
    localStore.saveItem('photos', photoRecord);
    await this.cleanupConfirmedPhoto(item.id);
    console.log(`[OfflineSync] ✅ Foto ${item.id} confirmada y sincronizada en Firestore.`);
    return 'synced';
  },

  /**
   * Suscripción reactiva para observar cambios en la cola.
   * Los observadores reciben actualizaciones instantáneas desde la fuente viva en memoria.
   */
  subscribeQueue(callback: (pending: QueuedOfflinePhoto[]) => void, userId?: string): () => void {
    const subscriber = { callback, userId };
    queueSubscribers.add(subscriber);

    // Emisión inmediata con estado actual
    this.getQueuedPhotos(userId || autoSyncUserId || undefined)
      .then((items) => {
        if (queueSubscribers.has(subscriber)) {
          callback(items);
        }
      })
      .catch((err) => {
        console.warn('[subscribeQueue] Error emitiendo cola inicial:', err);
      });

    return () => {
      queueSubscribers.delete(subscriber);
    };
  },

  /**
   * Inicia el procesamiento automático de la cola offline exclusivamente
   * para el UID autenticado resuelto.
   */
  initAutoSync(userId: string): () => void {
    if (typeof window === 'undefined' || !userId) return () => {};

    getOrStartSessionGen(userId);

    if (autoSyncUserId === userId && (autoSyncInterval || autoSyncOnlineHandler)) {
      return () => {
        if (autoSyncUserId && autoSyncUserId !== userId) {
          this.stopAutoSync();
        }
      };
    }

    if (autoSyncUserId && autoSyncUserId !== userId) {
      this.stopAutoSync();
    }

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

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      setTimeout(() => {
        if (autoSyncUserId) {
          photoOfflineQueue.syncPendingPhotos(autoSyncUserId).catch(() => {});
        }
      }, 2000);
    }

    autoSyncInterval = setInterval(() => {
      if ((typeof navigator === 'undefined' || navigator.onLine !== false) && autoSyncUserId) {
        photoOfflineQueue.syncPendingPhotos(autoSyncUserId).catch(() => {});
      }
    }, 45000);

    return () => {
      if (autoSyncUserId && autoSyncUserId !== userId) {
        this.stopAutoSync();
      }
    };
  },

  /**
   * Detiene el procesamiento de la cola al cerrar sesión o cambiar de usuario.
   * Cancela tareas de subida activas, temporizadores y latidos.
   * Conserva intactos los archivos pendientes en IndexedDB.
   */
  stopAutoSync(): void {
    if (autoSyncUserId) {
      invalidateSession(autoSyncUserId);
    }
    userSessionGenerations.clear();

    if (autoSyncOnlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', autoSyncOnlineHandler);
      autoSyncOnlineHandler = null;
    }
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }

    // Cancelar tareas activas de subida marcando explícitamente razón de cierre de sesión
    activeUploadTasks.forEach((task, photoId) => {
      cancellationReasons.set(photoId, 'logout');
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
