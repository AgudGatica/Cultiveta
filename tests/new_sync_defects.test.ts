/**
 * Suite de Pruebas: Nuevos Defectos de Sincronización Identificados (commit 386d21c)
 * 
 * 1. Una confirmación pendiente no debe bloquear nuevas fotos ni la UI.
 * 2. Cierre de sesión con cola de confirmación no vacía (evitar bucle infinito y distinguir generaciones).
 * 3. Contadores coherentes (eliminar 1 de 2 no debe reportar pending: 1).
 * 4. Borrado durable y recuperable (intención persistente en IDB ante recargas y reintentos de limpieza remota).
 * 5. updateItem debe informar el resultado real y no publicar modificaciones rechazadas en liveQueueItems.
 */

import 'fake-indexeddb/auto';

// Configuración del entorno
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

import {
  photoOfflineQueue,
  setPhotoQueueAdapters,
  resetPhotoQueueAdapters,
  resetQueueStateForTesting,
} from '../src/services/photoOfflineQueue';
import { localStore } from '../src/services/localStore';

function createFakeBlob(content: string = 'test_bytes'): Blob {
  return new Blob([content], { type: 'image/jpeg' });
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
    }, options.delayMs || 30);
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

export async function runNewDefectTests() {
  console.log('\n======================================================');
  console.log(' EJECUTANDO PRUEBAS DE LOS 5 NUEVOS CASOS (commit 386d21c)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function assert(desc: string, fn: () => Promise<void> | void) {
    try {
      resetQueueStateForTesting();
      resetPhotoQueueAdapters();
      await fn();
      console.log(`  ✓ [PASÓ] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${desc}`);
      console.error(`    Detalle: ${err.message || err}`);
      failed++;
    }
  }

  // =========================================================================
  // Caso 1: Una confirmación pendiente no debe bloquear nuevas fotos ni la UI
  // =========================================================================
  await assert('1. Confirmación pendiente de A no bloquea la subida de foto B agregada posteriormente', async () => {
    const testUid = 'user_c1';
    let photoBStartedUpload = false;
    let setDocAResolve: (() => void) | null = null;

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        if (storageRef.fullPath?.includes('photo_B')) {
          photoBStartedUpload = true;
        }
        return createMockUploadTask({ storageRef, delayMs: 40 });
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async (docRef: any) => {
        if (docRef.id === 'photo_A') {
          // Dejar setDoc de foto A pendiente
          await new Promise<void>((r) => {
            setDocAResolve = r;
          });
        }
      },
    });

    // 1. Encolar A e iniciar sincronización
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

    const syncA = photoOfflineQueue.syncPendingPhotos(testUid);

    // Esperar a que foto A termine su subida binaria y entre a setDoc
    await new Promise((r) => setTimeout(r, 80));

    // 2. Encolar B después
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

    // Disparar sincronización (como ocurre al encolar o interactuar con la app)
    const syncB = photoOfflineQueue.syncPendingPhotos(testUid);

    // Esperar un intervalo para verificar si B comenzó a subir SIN liberar setDoc de A
    await new Promise((r) => setTimeout(r, 120));

    // Liberar setDoc de A para permitir que todo termine
    if (setDocAResolve) {
      (setDocAResolve as Function)();
    }
    await Promise.all([syncA, syncB]);

    if (!photoBStartedUpload) {
      throw new Error('Foto B NO comenzó a subir mientras la confirmación de A estaba pendiente.');
    }
  });

  // =========================================================================
  // Caso 2: Cierre de sesión con cola de confirmación no vacía
  // =========================================================================
  await assert('2. Cierre de sesión con cola de confirmación no vacía termina sin bucle infinito', async () => {
    const testUid = 'user_c2';
    const setDocResolvers: (() => void)[] = [];

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => createMockUploadTask({ storageRef, delayMs: 20 }),
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {
        await new Promise<void>((r) => {
          setDocResolvers.push(r);
        });
      },
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

    // Esperar a que las 4 fotos suban su binario y 3 entren a setDoc
    await new Promise((r) => setTimeout(r, 100));

    // Cerrar sesión
    photoOfflineQueue.stopAutoSync();

    // Resolver las 3 confirmaciones activas
    await new Promise((r) => setTimeout(r, 30));
    setDocResolvers.forEach((res) => res());

    // El syncPromise DEBE resolverse rápidamente sin colgarse en un bucle infinito
    const timeoutPromise = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1500));
    const raceResult = await Promise.race([syncPromise, timeoutPromise]);

    if (raceResult === 'timeout') {
      throw new Error('El planificador se quedó en un bucle infinito al cerrar sesión con confirmaciones en cola.');
    }

    if (!raceResult.stopped || raceResult.reason !== 'session_closed') {
      throw new Error(`Esperado stopped: true y reason: 'session_closed', obtenido: ${JSON.stringify(raceResult)}`);
    }

    // Probar generación de sesión: salir y volver a entrar con la misma cuenta debe permitir sincronizar
    const secondSyncPromise = photoOfflineQueue.syncPendingPhotos(testUid);
    const secondResult = await secondSyncPromise;
    if (secondResult.reason === 'session_closed') {
      throw new Error('Volver a iniciar sesión con la misma cuenta quedó bloqueado permanentemente por la sesión anterior.');
    }
  });

  // =========================================================================
  // Caso 3: Contadores coherentes
  // =========================================================================
  await assert('3. Contadores coherentes: eliminar 1 de 2 durante subida no informa pendiente inexistente', async () => {
    const testUid = 'user_c3';
    const deleteId = 'photo_c3_del';
    const keepId = 'photo_c3_keep';

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        return createMockUploadTask({ storageRef, delayMs: 80 });
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {},
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
    }, 25);

    const result = await syncPromise;

    if (result.synced !== 1) {
      throw new Error(`Esperado synced: 1, obtenido: ${result.synced}`);
    }
    // El resumen NO debe informar una foto pendiente inexistente
    if (result.pending !== 0) {
      throw new Error(`Contador erróneo: reportó pending: ${result.pending} cuando la cola real no tiene pendientes.`);
    }
  });

  // =========================================================================
  // Caso 4: Borrado durable y recuperable
  // =========================================================================
  await assert('4. Borrado durable y recuperable: intención persistente en IDB ante recargas y reintentos', async () => {
    const testUid = 'user_c4';
    const photoId = 'photo_c4_durable';

    let deleteDocFailOnce = true;
    let deleteDocAttemptCount = 0;

    setPhotoQueueAdapters({
      uploadBytesResumable: () => createMockUploadTask({ delayMs: 40 }),
      getDownloadURL: async () => 'https://mock.storage.url/durable.jpg',
      setDoc: async () => {
        await new Promise((r) => setTimeout(r, 60));
      },
      deleteDoc: async () => {
        deleteDocAttemptCount++;
        if (deleteDocFailOnce) {
          deleteDocFailOnce = false;
          throw new Error('Fallo de red temporal simulado en deleteDoc');
        }
      },
      deleteObject: async () => {},
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

    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Solicitar borrado mientras setDoc está en curso
    setTimeout(async () => {
      await photoOfflineQueue.deletePendingPhoto(photoId, testUid);
    }, 45);

    await syncPromise;

    // Simular recarga de página (limpieza de memoria interna)
    resetQueueStateForTesting();

    // Comprobar que en IndexedDB la foto NO reaparece como activa/encolada
    const queuedAfterReload = await photoOfflineQueue.getQueuedPhotos(testUid);
    const found = queuedAfterReload.find((p) => p.id === photoId);
    if (found && found.status !== 'failed') {
      throw new Error('La foto eliminada reapareció como pendiente activa tras recargar la página.');
    }

    // Comprobar que el registro no fue reinsertado en localStore
    const localPhotos = localStore.getItems<any>('photos', testUid);
    const localFound = localPhotos.find((p) => p.id === photoId);
    if (localFound && localFound.syncStatus === 'synced') {
      throw new Error('La foto eliminada fue resucitada en localStore tras recarga.');
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

    // 1. Intento de actualizar con versión obsoleta (opVersion menor)
    const obsoleteItem = {
      ...item,
      opVersion: 0, // Versión obsoleta comparada con 1
      caption: 'Modificación con versión obsoleta',
    };
    const resObsolete = await photoOfflineQueue.updateItem(obsoleteItem);
    if (resObsolete !== false) {
      throw new Error('updateItem debió devolver false ante una opVersion obsoleta.');
    }

    // 2. Intento de actualizar para otro usuario (propietario diferente)
    const wrongOwnerItem = {
      ...item,
      userId: 'different_user_id',
      caption: 'Modificación de otro usuario',
    };
    const resWrongOwner = await photoOfflineQueue.updateItem(wrongOwnerItem);
    if (resWrongOwner !== false) {
      throw new Error('updateItem debió devolver false ante un propietario diferente.');
    }

    // 3. Intento de actualizar registro inexistente
    const nonExistentItem = {
      ...item,
      id: 'photo_non_existent',
    };
    const resNonExistent = await photoOfflineQueue.updateItem(nonExistentItem);
    if (resNonExistent !== false) {
      throw new Error('updateItem debió devolver false ante un registro inexistente.');
    }

    // Comprobar que liveQueueItems NO conservó la modificación rechazada
    const live = await photoOfflineQueue.getQueuedPhotoById(photoId);
    if (live && live.caption === 'Modificación con versión obsoleta') {
      throw new Error('liveQueueItems publicó la modificación que fue rechazada por la base de datos.');
    }
  });

  console.log('\n======================================================');
  console.log(` RESULTADO NUEVAS PRUEBAS: ${passed} pasadas, ${failed} fallidas de 5`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runNewDefectTests().catch((e) => {
  console.error('Error fatal:', e);
  process.exit(1);
});
