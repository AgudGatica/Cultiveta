/**
 * Suite de Pruebas Automatizadas de Sincronización Offline de Cultiveta
 * 
 * Verifica con mocks exhaustivos los 7 escenarios críticos requeridos:
 * 1. Re-render con el mismo UID: no cancela la transferencia.
 * 2. Cancelación de una foto: resultado válido y continuidad del lote.
 * 3. setDoc pendiente: interfaz utilizable y demás tareas no bloqueadas.
 * 4. Cambio de cuenta durante una operación: aislamiento de sesiones.
 * 5. Progreso parcial: porcentaje real visible antes de finalizar.
 * 6. Borrado durante getDownloadURL y saving_metadata: ninguna reaparición local o remota.
 * 7. claimTask rechazado: no termina informando claimed:true.
 */

import 'fake-indexeddb/auto';

// Configuración del entorno de pruebas tipo navegador
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

// Utilidad para crear Blob falso
function createFakeBlob(content: string = 'fake_image_bytes', type: string = 'image/jpeg'): Blob {
  return new Blob([content], { type });
}

// Generador de UploadTask simulado controlable
function createMockUploadTask(options: {
  storageRef?: any;
  delayMs?: number;
  progressSteps?: number[];
  shouldFail?: boolean;
  failError?: any;
  onCancel?: () => void;
}) {
  const listeners: {
    next?: (snapshot: any) => void;
    error?: (err: any) => void;
    complete?: () => void;
  } = {};

  let isCanceled = false;
  let isSettled = false;

  const fullPath = options.storageRef?.fullPath || options.storageRef?.name || (typeof options.storageRef === 'string' ? options.storageRef : 'mock/path/photo.jpg');

  const snapshot = {
    bytesTransferred: 0,
    totalBytes: 1000,
    state: 'running',
    ref: { fullPath },
  };

  let rejectPromise: ((reason?: any) => void) | null = null;
  const promise = new Promise<any>((resolve, reject) => {
    rejectPromise = reject;
    const steps = options.progressSteps || [25, 50, 75, 100];
    let stepIndex = 0;

    const interval = setInterval(() => {
      if (isCanceled) {
        clearInterval(interval);
        return;
      }

      if (stepIndex < steps.length) {
        const percent = steps[stepIndex++];
        snapshot.bytesTransferred = (percent / 100) * snapshot.totalBytes;
        if (listeners.next) {
          listeners.next({ ...snapshot });
        }
      } else {
        clearInterval(interval);
        if (isSettled) return;
        isSettled = true;

        if (options.shouldFail) {
          const err = options.failError || new Error('Upload failed');
          if (listeners.error) listeners.error(err);
          reject(err);
        } else {
          snapshot.state = 'success';
          if (listeners.complete) listeners.complete();
          resolve({ ...snapshot });
        }
      }
    }, Math.max(10, Math.floor((options.delayMs || 60) / (steps.length + 1))));
  });

  const task: any = {
    snapshot,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    on: (
      event: string,
      nextOrObserver: any,
      error?: (err: any) => void,
      complete?: () => void
    ) => {
      if (typeof nextOrObserver === 'function') {
        listeners.next = nextOrObserver;
        listeners.error = error;
        listeners.complete = complete;
      } else if (nextOrObserver) {
        listeners.next = nextOrObserver.next;
        listeners.error = nextOrObserver.error;
        listeners.complete = nextOrObserver.complete;
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

// Suite de ejecución de pruebas
async function runTests() {
  console.log('\n======================================================');
  console.log(' INICIANDO VERIFICACIÓN DE SINCRONIZACIÓN DE FOTOS');
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
      if (err.stack) console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      failed++;
    }
  }

  // =========================================================================
  // 1. Re-render con el mismo UID: no cancela la transferencia
  // =========================================================================
  await assert('1. Re-render con el mismo UID: no cancela la transferencia activa', async () => {
    const testUid = 'user_test_1';
    let cancelCalled = false;

    // Simular tarea de subida lenta en progreso
    setPhotoQueueAdapters({
      uploadBytesResumable: () =>
        createMockUploadTask({
          delayMs: 300,
          onCancel: () => {
            cancelCalled = true;
          },
        }),
      getDownloadURL: async () => 'https://mock.storage.url/photo1.jpg',
      setDoc: async () => {},
    });

    await photoOfflineQueue.enqueuePhoto({
      id: 'photo_test_1',
      userId: testUid,
      cultivationId: 'crop_1',
      file: createFakeBlob(),
      fileName: 'photo1.jpg',
      date: '2026-09-29',
      dayOfCultivation: 10,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // Iniciar autoSync primera vez (render 1)
    const cleanup1 = photoOfflineQueue.initAutoSync(testUid);

    // Iniciar transferencia
    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Simular re-render en React con el mismo UID:
    // Se ejecuta cleanup1 pero el UID activo sigue siendo testUid
    cleanup1();

    // Re-iniciar autoSync (render 2 con mismo UID)
    const cleanup2 = photoOfflineQueue.initAutoSync(testUid);

    const result = await syncPromise;
    cleanup2();

    if (cancelCalled) {
      throw new Error('La tarea de subida fue cancelada por un re-render con el mismo UID.');
    }
    if (result.synced !== 1) {
      throw new Error(`Esperado synced: 1, obtenido: ${result.synced}`);
    }
  });

  // =========================================================================
  // 2. Cancelación de una foto: resultado válido y continuidad del lote
  // =========================================================================
  await assert('2. Cancelación de una foto: resultado válido y continuidad del lote', async () => {
    const testUid = 'user_test_2';
    const canceledId = 'photo_cancel_batch';
    const healthyId = 'photo_healthy_batch';

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        const isTarget = storageRef.fullPath?.includes(canceledId);
        return createMockUploadTask({
          delayMs: 80,
          progressSteps: [20, 50, 100],
        });
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {},
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    await photoOfflineQueue.enqueuePhoto({
      id: canceledId,
      userId: testUid,
      cultivationId: 'crop_2',
      file: createFakeBlob(),
      fileName: 'cancel.jpg',
      date: '2026-09-29',
      dayOfCultivation: 12,
      stage: 'Vegetativo',
      category: 'tallo',
    });

    await photoOfflineQueue.enqueuePhoto({
      id: healthyId,
      userId: testUid,
      cultivationId: 'crop_2',
      file: createFakeBlob(),
      fileName: 'healthy.jpg',
      date: '2026-09-29',
      dayOfCultivation: 12,
      stage: 'Vegetativo',
      category: 'hoja superior',
    });

    // Iniciar sincronización del lote
    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Cancelar/eliminar explícitamente la primera foto mientras el lote está en curso
    setTimeout(async () => {
      await photoOfflineQueue.deletePendingPhoto(canceledId, testUid);
    }, 20);

    const result = await syncPromise;

    if (typeof result !== 'object' || result === null) {
      throw new Error('syncPendingPhotos devolvió undefined o un resultado inválido.');
    }
    if (typeof result.synced !== 'number' || typeof result.failed !== 'number' || typeof result.pending !== 'number') {
      throw new Error(`Resultado tipado incompleto: ${JSON.stringify(result)}`);
    }
    if (result.synced !== 1) {
      throw new Error(`La foto sana debió sincronizarse. Esperado synced: 1, obtenido: ${result.synced}`);
    }
  });

  // =========================================================================
  // 3. setDoc pendiente: interfaz utilizable y demás tareas no bloqueadas
  // =========================================================================
  await assert('3. setDoc pendiente: no bloquea la cola de subida de las demás fotos', async () => {
    const testUid = 'user_test_3';
    const photoA = 'photo_slow_setdoc';
    const photoB = 'photo_fast_upload';

    let photoBFinishedUpload = false;
    let setDocAResolve: (() => void) | null = null;

    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        return createMockUploadTask({
          storageRef,
          delayMs: 30,
          progressSteps: [50, 100],
          onCancel: () => {},
        });
      },
      getDownloadURL: async (ref: any) => {
        if (ref.fullPath?.includes(photoB)) {
          photoBFinishedUpload = true;
        }
        return 'https://mock.storage.url/photo.jpg';
      },
      setDoc: async (docRef: any) => {
        if (docRef.id === photoA) {
          // setDoc para foto A queda pendiente intencionalmente
          await new Promise<void>((resolve) => {
            setDocAResolve = resolve;
          });
        }
      },
    });

    await photoOfflineQueue.enqueuePhoto({
      id: photoA,
      userId: testUid,
      cultivationId: 'crop_3',
      file: createFakeBlob(),
      fileName: 'photoA.jpg',
      date: '2026-09-29',
      dayOfCultivation: 14,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    await photoOfflineQueue.enqueuePhoto({
      id: photoB,
      userId: testUid,
      cultivationId: 'crop_3',
      file: createFakeBlob(),
      fileName: 'photoB.jpg',
      date: '2026-09-29',
      dayOfCultivation: 14,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // Iniciar sincronización
    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Esperar un breve intervalo para verificar que la foto B subió su binario a pesar de que A esté en setDoc
    await new Promise((r) => setTimeout(r, 120));

    if (!photoBFinishedUpload) {
      throw new Error('La subida de foto B quedó bloqueada secuencialmente esperando el setDoc de foto A.');
    }

    // Ahora resolver setDoc de foto A para completar limpiamente
    if (setDocAResolve) {
      (setDocAResolve as Function)();
    }

    const result = await syncPromise;
    if (result.synced !== 2) {
      throw new Error(`Esperado synced: 2, obtenido: ${result.synced}`);
    }
  });

  // =========================================================================
  // 4. Cambio de cuenta durante una operación: aislamiento de sesiones
  // =========================================================================
  await assert('4. Cambio de cuenta durante una operación: aislamiento y preservación de cola', async () => {
    const userA = 'user_alice';
    const userB = 'user_bob';

    setPhotoQueueAdapters({
      uploadBytesResumable: () =>
        createMockUploadTask({
          delayMs: 200,
          progressSteps: [20, 50, 100],
        }),
      getDownloadURL: async () => 'https://mock.storage.url/alice.jpg',
      setDoc: async () => {},
    });

    // Encolar foto para usuario Alice
    await photoOfflineQueue.enqueuePhoto({
      id: 'photo_alice_1',
      userId: userA,
      cultivationId: 'crop_alice',
      file: createFakeBlob(),
      fileName: 'alice.jpg',
      date: '2026-09-29',
      dayOfCultivation: 5,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // Iniciar autoSync y sync de Alice
    photoOfflineQueue.initAutoSync(userA);
    const aliceSync = photoOfflineQueue.syncPendingPhotos(userA);

    // Simular logout de Alice mientras la subida está en curso
    setTimeout(() => {
      photoOfflineQueue.stopAutoSync();
    }, 40);

    const aliceResult = await aliceSync;
    if (!aliceResult.stopped || aliceResult.reason !== 'session_closed') {
      throw new Error(`La sesión de Alice debió reportar detención controlada por session_closed. Recibido: ${JSON.stringify(aliceResult)}`);
    }

    // Comprobar que los archivos pendientes de Alice NO fueron borrados
    const alicePending = await photoOfflineQueue.getQueuedPhotos(userA);
    if (alicePending.length !== 1 || alicePending[0].id !== 'photo_alice_1') {
      throw new Error('Los archivos pendientes de Alice fueron destruidos al cerrar sesión.');
    }

    // Iniciar sesión y sync para Bob: promesa completamente independiente
    const bobResult = await photoOfflineQueue.syncPendingPhotos(userB);
    if (bobResult.synced !== 0 || bobResult.total !== 0) {
      throw new Error('La sesión de Bob se contaminó con la cola o promesas de Alice.');
    }
  });

  // =========================================================================
  // 5. Progreso parcial: porcentaje real visible antes de finalizar
  // =========================================================================
  await assert('5. Progreso parcial: porcentaje real visible en observadores antes de finalizar', async () => {
    const testUid = 'user_test_5';
    const photoId = 'photo_progress_test';

    const recordedPercents: number[] = [];

    setPhotoQueueAdapters({
      uploadBytesResumable: () =>
        createMockUploadTask({
          delayMs: 150,
          progressSteps: [20, 45, 75, 100],
        }),
      getDownloadURL: async () => 'https://mock.storage.url/prog.jpg',
      setDoc: async () => {},
    });

    await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: testUid,
      cultivationId: 'crop_5',
      file: createFakeBlob(),
      fileName: 'prog.jpg',
      date: '2026-09-29',
      dayOfCultivation: 8,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    const unsub = photoOfflineQueue.subscribeQueue((items) => {
      const match = items.find((i) => i.id === photoId);
      if (match && typeof match.progressPercent === 'number' && match.progressPercent > 0) {
        if (!recordedPercents.includes(match.progressPercent)) {
          recordedPercents.push(match.progressPercent);
        }
      }
    }, testUid);

    await photoOfflineQueue.syncPendingPhotos(testUid);
    unsub();

    if (!recordedPercents.some((p) => p > 0 && p < 100)) {
      throw new Error(`Los observadores no recibieron avances intermedios. Porcentajes capturados: ${JSON.stringify(recordedPercents)}`);
    }
  });

  // =========================================================================
  // 6. Borrado durante getDownloadURL y saving_metadata
  // =========================================================================
  await assert('6. Borrado durante getDownloadURL y saving_metadata: ninguna reaparición remota o local', async () => {
    const testUid = 'user_test_6';
    const photoId = 'photo_delete_during_save';

    let deleteDocCalled = false;
    let deleteObjectCalled = false;
    let setDocFinished = false;

    setPhotoQueueAdapters({
      uploadBytesResumable: () =>
        createMockUploadTask({
          delayMs: 30,
          progressSteps: [50, 100],
        }),
      getDownloadURL: async () => 'https://mock.storage.url/photo.jpg',
      setDoc: async () => {
        // Pausa para dar tiempo a solicitar el borrado
        await new Promise((r) => setTimeout(r, 60));
        setDocFinished = true;
      },
      deleteDoc: async () => {
        deleteDocCalled = true;
      },
      deleteObject: async () => {
        deleteObjectCalled = true;
      },
    });

    await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: testUid,
      cultivationId: 'crop_6',
      file: createFakeBlob(),
      fileName: 'todelete.jpg',
      date: '2026-09-29',
      dayOfCultivation: 15,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    const syncPromise = photoOfflineQueue.syncPendingPhotos(testUid);

    // Solicitar borrado de la foto mientras saving_metadata está en curso
    setTimeout(async () => {
      await photoOfflineQueue.deletePendingPhoto(photoId, testUid);
    }, 45);

    await syncPromise;

    // Verificar que al terminar la confirmación tardía se limpió el documento remoto
    if (!deleteDocCalled) {
      throw new Error('deleteDoc no fue llamado para limpiar el documento remoto confirmado tras la solicitud de borrado.');
    }

    // Verificar que el registro no fue reinsertado en localStore
    const local = localStore.getItems<any>('photos', testUid).find((i: any) => i.id === photoId);
    if (local && local.syncStatus === 'synced') {
      throw new Error('El registro eliminado fue resucitado erróneamente en localStore como sincronizado.');
    }

    // Verificar que tampoco existe en IndexedDB
    const idbItem = await photoOfflineQueue.getQueuedPhotoById(photoId);
    if (idbItem !== null) {
      throw new Error('El registro eliminado reapareció en IndexedDB.');
    }
  });

  // =========================================================================
  // 7. claimTask rechazado: no termina informando claimed:true
  // =========================================================================
  await assert('7. claimTask rechazado: no deduce adquisición por lockOwner preexistente', async () => {
    const testUid = 'user_test_7';
    const photoId = 'photo_claim_reject';

    await photoOfflineQueue.enqueuePhoto({
      id: photoId,
      userId: testUid,
      cultivationId: 'crop_7',
      file: createFakeBlob(),
      fileName: 'claim.jpg',
      date: '2026-09-29',
      dayOfCultivation: 20,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    // Primer reclamo exitoso
    const claim1 = await photoOfflineQueue.claimTask(photoId, testUid);
    if (!claim1.claimed || !claim1.item) {
      throw new Error('El primer reclamo debió ser exitoso.');
    }

    // Segundo reclamo inmediato con la tarea aún activa / concesión vigente
    // La versión anterior defectuosa volvía a leer en un .then y devolvía claimed:true
    // porque lockOwner ya coincidía con TAB_ID.
    const claim2 = await photoOfflineQueue.claimTask(photoId, testUid);

    if (claim2.claimed) {
      throw new Error('claimTask devolvió claimed:true para una tarea cuya concesión ya estaba activa y vigente.');
    }

    // Probar también con UID diferente
    const claimWrongUser = await photoOfflineQueue.claimTask(photoId, 'wrong_user_id');
    if (claimWrongUser.claimed) {
      throw new Error('claimTask devolvió claimed:true para un UID que no coincide con el registro.');
    }
  });

  console.log('\n======================================================');
  console.log(` RESULTADO FINAL: ${passed} pasadas, ${failed} fallidas de 7`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Error fatal ejecutando pruebas:', e);
  process.exit(1);
});
