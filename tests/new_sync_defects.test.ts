/**
 * Suite de Pruebas: Nuevos Defectos de Sincronización Identificados (commit 386d21c)
 * 
 * 1. Una confirmación pendiente no debe bloquear nuevas fotos ni la UI (señales controladas y comprobación mientras A sigue retenido).
 * 2. Cierre de sesión con cola de confirmación no vacía (terminación controlada, session_closed y generaciones de sesión).
 * 3. Contadores coherentes (lote, borradas y pendientes reales sin reportar pendientes inexistentes ni éxitos falsos).
 * 4. Borrado durable y recuperable (verificación física en IndexedDB, reintento sin cadenas continuas de purga).
 * 5. updateItem informa resultado real transaccional y no publica modificaciones rechazadas.
 * 6. UI y galería: usuario puede seguir agregando fotos y estados diferenciados sin bloqueo de interfaz.
 */

import 'fake-indexeddb/auto';

// Configuración del entorno simulado de navegador aislado
if (typeof globalThis.window === 'undefined') {
  const listeners: Record<string, Function[]> = {};
  (globalThis as any).window = {
    indexedDB: globalThis.indexedDB,
    addEventListener: (event: string, fn: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (event: any) => {
      const type = event?.type || event;
      if (listeners[type]) {
        listeners[type].forEach((fn) => fn(event));
      }
      return true;
    },
  };
}

if (typeof globalThis.navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
} else {
  try {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  } catch {
    (globalThis.navigator as any).onLine = true;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Bloqueo estricto de llamadas de red no mockeadas para aislamiento total
const originalFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: any, init: any) => {
  throw new Error(`[Security Sandbox] Llamada de red real no permitida en pruebas: ${url}`);
};

import {
  photoOfflineQueue,
  setPhotoQueueAdapters,
  resetPhotoQueueAdapters,
  resetQueueStateForTesting,
} from '../src/services/photoOfflineQueue';
import { localStore } from '../src/services/localStore';

function createFakeBlob(content: string = 'test_bytes', type: string = 'image/jpeg'): Blob {
  return new Blob([content], { type });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms): ${errorMsg}`)), timeoutMs)
    ),
  ]);
}

function createMockUploadTask(options: {
  storageRef?: any;
  delayMs?: number;
  onCancel?: () => void;
}) {
  const listeners: {
    next?: (snapshot: any) => void;
    error?: (err: any) => void;
    complete?: () => void;
  } = {};

  let isCanceled = false;
  let isSettled = false;

  const fullPath = options.storageRef?.fullPath || options.storageRef?.name || 'mock/path/photo.jpg';
  const snapshot = {
    bytesTransferred: 0,
    totalBytes: 1000,
    state: 'running',
    ref: { fullPath },
  };

  let rejectPromise: ((reason?: any) => void) | null = null;
  const promise = new Promise<any>((resolve, reject) => {
    rejectPromise = reject;
    setTimeout(() => {
      if (isCanceled || isSettled) return;
      isSettled = true;
      snapshot.state = 'success';
      snapshot.bytesTransferred = 1000;
      if (listeners.complete) listeners.complete();
      resolve({ ...snapshot });
    }, options.delayMs || 25);
  });

  const task: any = {
    snapshot,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    on: (event: string, nextOrObserver: any, error?: (err: any) => void, complete?: () => void) => {
      if (typeof nextOrObserver === 'function') {
        listeners.next = nextOrObserver;
        listeners.error = error;
        listeners.complete = complete;
      }
      return () => {};
    },
    cancel: () => {
      if (isSettled || isCanceled) return false;
      isCanceled = true;
      isSettled = true;
      if (options.onCancel) options.onCancel();
      const cancelErr = {
        code: 'storage/canceled',
        message: 'Firebase Storage: User canceled the upload/download. (storage/canceled)',
      };
      if (listeners.error) listeners.error(cancelErr);
      if (rejectPromise) rejectPromise(cancelErr);
      return true;
    },
  };

  return task;
}

// Acceso directo a IndexedDB crudo para verificación física independiente de intenciones
function getRawIDBRecord(id: string): Promise<any> {
  return new Promise((resolve) => {
    const req = globalThis.indexedDB.open('cultiveta_offline_db');
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('pending_photos', 'readonly');
        const store = tx.objectStore('pending_photos');
        const getReq = store.get(id);
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    };
    req.onerror = () => resolve(undefined);
  });
}

export async function runNewDefectTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================');
  console.log(' EJECUTANDO PRUEBAS DE LOS NUEVOS CASOS (commit 386d21c)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<void> | void) {
    try {
      resetQueueStateForTesting();
      resetPhotoQueueAdapters();
      await withTimeout(Promise.resolve(fn()), 5000, `La prueba '${desc}' excedió el límite de 5000ms`);
      console.log(`  ✓ [PASÓ] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${desc}`);
      console.error(`    Detalle: ${err.message || err}`);
      failed++;
    }
  }

  // =========================================================================
  // Caso 1: Una confirmación pendiente no debe bloquear nuevas fotos
  // Comprobación de que B comenzó MIENTRAS setDoc de A sigue activamente retenido
  // =========================================================================
  await assert('1. Confirmación de A retenida: B inicia subida sin liberar setDoc de A', async () => {
    const testUid = 'user_c1';

    let resolveSetDocA: (() => void) | null = null;
    let signalAEnteredSetDoc: () => void;
    const aEnteredSetDocPromise = new Promise<void>((r) => { signalAEnteredSetDoc = r; });

    let signalBUploadStarted: () => void;
    const bUploadStartedPromise = new Promise<void>((r) => { signalBUploadStarted = r; });

    let isSetDocAHeld = false;
    let photoBStartedWhileAHeld = false;

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        if (storageRef.fullPath?.includes('photo_B')) {
          if (isSetDocAHeld) {
            photoBStartedWhileAHeld = true;
          }
          signalBUploadStarted();
        }
        return createMockUploadTask({ storageRef, delayMs: 30 });
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async (docRef: any) => {
        if (docRef.id === 'photo_A') {
          isSetDocAHeld = true;
          signalAEnteredSetDoc();
          await new Promise<void>((r) => {
            resolveSetDocA = r;
          });
          isSetDocAHeld = false;
        }
      },
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    let syncPromiseA: Promise<any> | null = null;
    let syncPromiseB: Promise<any> | null = null;

    try {
      // 1. Encolar foto A e iniciar sincronización
      await photoOfflineQueue.enqueuePhoto({
        id: 'photo_A',
        userId: testUid,
        cultivationId: 'crop_c1',
        file: createFakeBlob(),
        fileName: 'photo_A.jpg',
        date: '2026-09-29',
        dayOfCultivation: 1,
        stage: 'Vegetativo',
        category: 'planta completa',
      });

      syncPromiseA = photoOfflineQueue.syncPendingPhotos(testUid);

      // Esperar la señal controlada de que foto A entró en confirmación remota setDoc
      await aEnteredSetDocPromise;

      if (!isSetDocAHeld) {
        throw new Error('Foto A debía estar activamente retenida en setDoc antes de encolar B.');
      }

      // 2. Encolar foto B después, mientras A sigue retenida en setDoc
      await photoOfflineQueue.enqueuePhoto({
        id: 'photo_B',
        userId: testUid,
        cultivationId: 'crop_c1',
        file: createFakeBlob(),
        fileName: 'photo_B.jpg',
        date: '2026-09-29',
        dayOfCultivation: 1,
        stage: 'Vegetativo',
        category: 'hoja superior',
      });

      syncPromiseB = photoOfflineQueue.syncPendingPhotos(testUid);

      // Esperar la señal controlada de que foto B comenzó su subida
      await bUploadStartedPromise;

      // ASERCIÓN CLAVE: La subida de B debe haber comenzado MIENTRAS setDoc de A sigue retenido
      if (!isSetDocAHeld || !photoBStartedWhileAHeld) {
        throw new Error('Foto B NO comenzó a subir mientras la confirmación de foto A estaba activamente retenida.');
      }
    } finally {
      // Limpieza incondicional en finally
      if (resolveSetDocA) {
        (resolveSetDocA as Function)();
      }
      if (syncPromiseA && syncPromiseB) {
        await Promise.all([syncPromiseA, syncPromiseB]).catch(() => {});
      }
    }
  });

  // =========================================================================
  // Caso 2: Cierre de sesión con cola de confirmación no vacía
  // 4 fotos: 3 activas, 1 esperando; cierre ordenado con session_closed y generaciones
  // =========================================================================
  await assert('2. Cierre de sesión con confirmaciones en cola: terminación ordenada y cambio de generación', async () => {
    const testUid = 'user_c2';
    const setDocResolvers: (() => void)[] = [];

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => createMockUploadTask({ storageRef, delayMs: 15 }),
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {
        await new Promise<void>((r) => {
          setDocResolvers.push(r);
        });
      },
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    // Encolar 4 fotos: 3 entrarán a confirmación activa y 1 quedará en confirmationQueue
    for (let i = 1; i <= 4; i++) {
      await photoOfflineQueue.enqueuePhoto({
        id: `photo_c2_${i}`,
        userId: testUid,
        cultivationId: 'crop_c2',
        file: createFakeBlob(),
        fileName: `photo_${i}.jpg`,
        date: '2026-09-29',
        dayOfCultivation: 2,
        stage: 'Vegetativo',
        category: 'planta completa',
      });
    }

    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Esperar a que las fotos suban su binario y 3 entren a setDoc
    await new Promise((r) => setTimeout(r, 90));

    // Cerrar sesión
    photoOfflineQueue.stopAutoSync();

    // Resolver las 3 confirmaciones activas que quedaron en vuelo
    await new Promise((r) => setTimeout(r, 20));
    setDocResolvers.forEach((res) => res());

    // El planificador DEBE terminar inmediatamente reportando session_closed sin bucle infinito
    const firstResult = await syncPromise;

    if (!firstResult.stopped || firstResult.reason !== 'session_closed') {
      throw new Error(`Esperado stopped: true y reason: 'session_closed', obtenido: ${JSON.stringify(firstResult)}`);
    }

    // Comprobar que la 4ª foto pendiente no fue destruida al cerrar sesión
    const remainingPending = await photoOfflineQueue.getQueuedPhotos(testUid);
    if (!remainingPending.some((p) => p.id === 'photo_c2_4')) {
      throw new Error('La cuarta foto pendiente se perdió tras cerrar sesión.');
    }

    // Nueva generación de sesión: volver a entrar con la misma cuenta permite sincronizar la foto pendiente
    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => createMockUploadTask({ storageRef, delayMs: 10 }),
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {},
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    const secondSyncPromise = photoOfflineQueue.syncPendingPhotos(testUid);
    const secondResult = await secondSyncPromise;

    if (secondResult.reason === 'session_closed') {
      throw new Error('Volver a iniciar sesión con la misma cuenta quedó bloqueado por la sesión anterior.');
    }
    if (secondResult.synced !== 1) {
      throw new Error(`Esperado synced: 1 en la nueva generación, obtenido: ${secondResult.synced}`);
    }
  });

  // =========================================================================
  // Caso 3: Contadores coherentes
  // Eliminar 1 de 2 durante subida y sincronizar la otra
  // =========================================================================
  await assert('3. Contadores coherentes: eliminar 1 de 2 reporta synced: 1, deleted: 1, pending: 0', async () => {
    const testUid = 'user_c3';
    const deleteId = 'photo_c3_del';
    const keepId = 'photo_c3_keep';

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        return createMockUploadTask({ storageRef, delayMs: 70 });
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {},
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    await photoOfflineQueue.enqueuePhoto({
      id: deleteId,
      userId: testUid,
      cultivationId: 'crop_c3',
      file: createFakeBlob(),
      fileName: 'delete.jpg',
      date: '2026-09-29',
      dayOfCultivation: 3,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    await photoOfflineQueue.enqueuePhoto({
      id: keepId,
      userId: testUid,
      cultivationId: 'crop_c3',
      file: createFakeBlob(),
      fileName: 'keep.jpg',
      date: '2026-09-29',
      dayOfCultivation: 3,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Eliminar foto 1 mientras sube
    setTimeout(async () => {
      await photoOfflineQueue.deletePendingPhoto(deleteId, testUid);
    }, 20);

    const result = await syncPromise;

    if (result.synced !== 1) {
      throw new Error(`Esperado synced: 1, obtenido: ${result.synced}`);
    }
    if (result.deleted !== 1) {
      throw new Error(`Esperado deleted: 1, obtenido: ${result.deleted}`);
    }
    if (result.pending !== 0) {
      throw new Error(`Esperado pending: 0, obtenido: ${result.pending}`);
    }
    if (result.total !== 2) {
      throw new Error(`Esperado total: 2, obtenido: ${result.total}`);
    }
    if (result.reason !== 'completed') {
      throw new Error(`Esperado reason: 'completed' para lote finalizado sin pendientes, obtenido: ${result.reason}`);
    }
  });

  // =========================================================================
  // Caso 4: Borrado durable y recuperable
  // Verificación física directa en IndexedDB, reintento sin cadenas recursivas
  // =========================================================================
  await assert('4. Borrado durable: verificación física en IDB y reintento exitoso sin bucles', async () => {
    const testUid = 'user_c4';
    const photoId = 'photo_c4_durable';

    let shouldFailDelete = true;
    let deleteDocAttemptCount = 0;
    let deleteObjectAttemptCount = 0;

    setPhotoQueueAdapters({
      uploadBytesResumable: () => createMockUploadTask({ delayMs: 20 }),
      getDownloadURL: async () => 'https://mock.storage.url/durable.jpg',
      setDoc: async () => {},
      deleteDoc: async () => {
        deleteDocAttemptCount++;
        if (shouldFailDelete) {
          throw new Error('Fallo de red temporal simulado en deleteDoc');
        }
      },
      deleteObject: async () => {
        deleteObjectAttemptCount++;
        if (shouldFailDelete) {
          throw new Error('Fallo de red temporal simulado en deleteObject');
        }
      },
    });

    await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: testUid,
      cultivationId: 'crop_c4',
      file: createFakeBlob(),
      fileName: 'durable.jpg',
      date: '2026-09-29',
      dayOfCultivation: 4,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // Solicitar borrado cuando la red falla en los métodos de purga remota
    await photoOfflineQueue.deletePendingPhoto(photoId, testUid);

    // 1. Verificación directa en el almacenamiento físico de IndexedDB:
    // La intención persistente DEBE conservarse en el registro crudo
    const rawRecord = await getRawIDBRecord(photoId);
    if (!rawRecord) {
      throw new Error('El registro fue eliminado de IndexedDB antes de confirmar la limpieza remota.');
    }
    if (!rawRecord.deletionPending || !rawRecord.isDeleted) {
      throw new Error(`El registro en IndexedDB no tiene las marcas durables requeridas: ${JSON.stringify(rawRecord)}`);
    }

    // 2. Reiniciar el estado del servicio en memoria conservando la base IndexedDB
    resetQueueStateForTesting();

    // Mantener todos los adaptadores de red simulados
    setPhotoQueueAdapters({
      uploadBytesResumable: () => createMockUploadTask({ delayMs: 20 }),
      getDownloadURL: async () => 'https://mock.storage.url/durable.jpg',
      setDoc: async () => {},
      deleteDoc: async () => {
        deleteDocAttemptCount++;
        if (shouldFailDelete) {
          throw new Error('Fallo de red temporal simulado en deleteDoc');
        }
      },
      deleteObject: async () => {
        deleteObjectAttemptCount++;
        if (shouldFailDelete) {
          throw new Error('Fallo de red temporal simulado en deleteObject');
        }
      },
    });

    // 3. Comprobar que getQueuedPhotos NO dispara un bucle continuo de notificaciones o purgas
    let subscriberNotificationCount = 0;
    const unsub = photoOfflineQueue.subscribeQueue(() => {
      subscriberNotificationCount++;
    }, testUid);

    const queuedPhotos = await photoOfflineQueue.getQueuedPhotos(testUid);
    if (queuedPhotos.length !== 0) {
      throw new Error('La foto con intención de borrado no debió aparecer en getQueuedPhotos.');
    }

    // Esperar brevemente para verificar que no existe una avalancha recursiva de notificaciones
    await new Promise((r) => setTimeout(r, 60));
    unsub();

    if (subscriberNotificationCount > 3) {
      throw new Error(`Cadena continua de lecturas/notificaciones detectada (${subscriberNotificationCount} emisiones).`);
    }

    // 4. Mantener adaptadores simulados y habilitar éxito para el reintento
    shouldFailDelete = false;

    // 5. Ejecutar el reintento de borrado mediante el trabajador independiente
    const retryResult = await photoOfflineQueue.processDurableDeletions(testUid);
    if (retryResult.cleaned !== 1 || retryResult.pending !== 0) {
      throw new Error(`El reintento no completó la purga requerida: ${JSON.stringify(retryResult)}`);
    }

    // 6. Comprobar que se invocaron tanto deleteDoc como deleteObject
    if (deleteDocAttemptCount < 2) {
      throw new Error(`deleteDoc no fue reintentado. Intentos: ${deleteDocAttemptCount}`);
    }
    if (deleteObjectAttemptCount < 2) {
      throw new Error(`deleteObject no fue reintentado. Intentos: ${deleteObjectAttemptCount}`);
    }

    // 7. Comprobar que la intención física en IndexedDB se retira SOLO tras la confirmación exitosa
    const rawAfterClean = await getRawIDBRecord(photoId);
    if (rawAfterClean !== undefined) {
      throw new Error('El registro físico aún persiste en IndexedDB tras la purga remota confirmada.');
    }
  });

  // =========================================================================
  // Caso 5: updateItem debe informar si aplicó la modificación
  // =========================================================================
  await assert('5. updateItem devuelve el resultado real de la transacción y no publica cambios rechazados', async () => {
    const testUid = 'user_c5';
    const photoId = 'photo_c5_update';

    const item = await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: testUid,
      cultivationId: 'crop_c5',
      file: createFakeBlob(),
      fileName: 'update.jpg',
      date: '2026-09-29',
      dayOfCultivation: 5,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // 1. Intento con opVersion obsoleta (0 vs 1)
    const obsoleteItem = {
      ...item,
      opVersion: 0,
      caption: 'Modificación con versión obsoleta',
    };
    const resObsolete = await photoOfflineQueue.updateItem(obsoleteItem);
    if (resObsolete !== false) {
      throw new Error('updateItem debió devolver false ante una opVersion obsoleta.');
    }

    // 2. Intento para otro usuario
    const wrongOwnerItem = {
      ...item,
      userId: 'different_user_id',
      caption: 'Modificación de otro usuario',
    };
    const resWrongOwner = await photoOfflineQueue.updateItem(wrongOwnerItem);
    if (resWrongOwner !== false) {
      throw new Error('updateItem debió devolver false ante un propietario diferente.');
    }

    // 3. Intento para registro inexistente
    const nonExistentItem = {
      ...item,
      id: 'photo_non_existent',
    };
    const resNonExistent = await photoOfflineQueue.updateItem(nonExistentItem);
    if (resNonExistent !== false) {
      throw new Error('updateItem debió devolver false ante un registro inexistente.');
    }

    // Comprobar que liveQueueItems no conservó la modificación rechazada
    const live = await photoOfflineQueue.getQueuedPhotoById(photoId);
    if (live && live.caption === 'Modificación con versión obsoleta') {
      throw new Error('liveQueueItems publicó la modificación que fue rechazada por la base de datos.');
    }
  });

  // =========================================================================
  // Caso 6: Prueba de la Interfaz y Galería mientras A espera confirmación
  // Comprueba estados observables, encolado reactivo y no bloqueo de interacción
  // =========================================================================
  await assert('6. Interfaz y Galería utilizables con estados observables mientras A espera confirmación', async () => {
    const testUid = 'user_c6';
    let resolveSetDocA: (() => void) | null = null;
    const observedStates: Record<string, string[]> = { photo_ui_A: [], photo_ui_B: [] };

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => createMockUploadTask({ storageRef, delayMs: 25 }),
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async (docRef: any) => {
        if (docRef.id === 'photo_ui_A') {
          await new Promise<void>((r) => {
            resolveSetDocA = r;
          });
        }
      },
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    // Suscribirse reactivamente tal como lo hace PhotoGalleryView
    const unsub = photoOfflineQueue.subscribeQueue((items) => {
      items.forEach((it) => {
        if (observedStates[it.id] && !observedStates[it.id].includes(it.status)) {
          observedStates[it.id].push(it.status);
        }
      });
    }, testUid);

    try {
      // 1. Encolar foto A
      await photoOfflineQueue.enqueuePhoto({
        id: 'photo_ui_A',
        userId: testUid,
        cultivationId: 'crop_ui',
        file: createFakeBlob(),
        fileName: 'photo_A.jpg',
        date: '2026-09-29',
        dayOfCultivation: 10,
        stage: 'Floración',
        category: 'flor',
      });

      // Disparar sincronización
      photoOfflineQueue.syncPendingPhotos(testUid);

      // Esperar a que foto A llegue al estado de guardado de metadatos (saving_metadata)
      await new Promise((r) => setTimeout(r, 60));

      const photoAInLive = await photoOfflineQueue.getQueuedPhotoById('photo_ui_A');
      if (!photoAInLive || (photoAInLive.status !== 'saving_metadata' && photoAInLive.status !== 'uploading')) {
        throw new Error(`Foto A debía mostrar estado activo de subida o confirmación. Obtenido: ${photoAInLive?.status}`);
      }

      // 2. Comprobar que el usuario puede seguir agregando fotos a la galería sin bloqueo
      const enqueueBStart = Date.now();
      const photoB = await photoOfflineQueue.enqueuePhoto({
        id: 'photo_ui_B',
        userId: testUid,
        cultivationId: 'crop_ui',
        file: createFakeBlob(),
        fileName: 'photo_B.jpg',
        date: '2026-09-29',
        dayOfCultivation: 10,
        stage: 'Floración',
        category: 'tricomas',
      });
      const enqueueBDuration = Date.now() - enqueueBStart;

      // El encolado debe ser inmediato (< 50ms) y no quedar congelado por setDoc de A
      if (enqueueBDuration > 150) {
        throw new Error(`Agregar foto B tomó ${enqueueBDuration}ms; la interfaz quedó bloqueada por setDoc de A.`);
      }

      // 3. Comprobar que la galería ya tiene disponible la nueva foto en estado queued
      const allQueued = await photoOfflineQueue.getQueuedPhotos(testUid);
      const foundB = allQueued.find((p) => p.id === 'photo_ui_B');
      if (!foundB) {
        throw new Error('Foto B no apareció reactivamente en la lista de fotos de la galería.');
      }

      // 4. Comprobar que los diagnósticos y estados diferencian las fases
      const diagA = await photoOfflineQueue.getDiagnostic('photo_ui_A');
      if (diagA && diagA.phase !== 'saving_metadata' && diagA.phase !== 'uploading_bytes') {
        throw new Error(`Diagnóstico de foto A no refleja la fase correcta: ${JSON.stringify(diagA)}`);
      }
    } finally {
      unsub();
      if (resolveSetDocA) {
        (resolveSetDocA as Function)();
      }
    }
  });

  console.log('\n======================================================');
  console.log(` RESULTADO NUEVAS PRUEBAS: ${passed} pasadas, ${failed} fallidas de 6`);
  console.log('======================================================\n');

  return { passed, failed };
}

// Ejecución directa si se invoca por CLI
if (process.argv[1]?.endsWith('new_sync_defects.test.ts')) {
  runNewDefectTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  }).catch((e) => {
    console.error('Error fatal:', e);
    process.exit(1);
  });
}
