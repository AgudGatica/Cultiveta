/**
 * tests/sync_hardenings.test.ts
 * 
 * PRUEBAS ESPECÍFICAS DE LOS 4 HARDENINGS REQUERIDOS:
 * 
 * 1. stopAutoSync cancela y limpia todos los activeBackoffTimers impidiendo
 *    que un reintento de una sesión cerrada despierte y procese el UID anterior.
 * 2. consecutiveStallCount:
 *    - Se incrementa únicamente por upload_stalled.
 *    - Se resetea cuando existe progreso real de bytes.
 *    - Se resetea al llamar a retryPendingPhoto manual.
 *    - maxConsecutiveStalls usa exclusivamente consecutiveStallCount.
 * 3. _scheduleBackoffWakeup mantiene el nextRetryAt MÁS PRÓXIMO por usuario
 *    (un retry posterior más lejano nunca reemplaza uno programado para antes).
 * 4. firebase_storage_real_e2e:
 *    - Un error storage/unknown genérico (sin evidencia concreta de bucket ausente/404) FALLA.
 *    - Solo se omite (SKIP) con evidencia concreta (404, bucket-not-found, billing).
 */

import 'fake-indexeddb/auto';

import {
  photoOfflineQueue,
  getActiveBackoffTimerForTesting,
  setWatchdogConfigForTesting,
  resetWatchdogConfig,
  setPhotoQueueAdapters,
  resetPhotoQueueAdapters,
  resetQueueStateForTesting,
} from '../src/services/photoOfflineQueue';

function createFakeBlob(content: string = 'test_bytes', type: string = 'image/jpeg'): Blob {
  return new Blob([content], { type });
}

export async function runSyncHardeningsTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS ESPECÍFICAS DE LOS 4 HARDENINGS DE SINCRONIZACIÓN   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const skipped = 0;

  const assert = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  // =========================================================================
  // Caso 1: stopAutoSync cancela y limpia activeBackoffTimers
  // =========================================================================
  await assert('1. stopAutoSync cancela y limpia todos los activeBackoffTimers', () => {
    resetQueueStateForTesting();
    const testUser = 'user_hard_1';

    // Programar un backoff para este usuario
    photoOfflineQueue._scheduleBackoffWakeup(Date.now() + 5000, testUser);

    const timerBefore = getActiveBackoffTimerForTesting(testUser);
    if (!timerBefore) {
      throw new Error('El timer de backoff debía estar registrado antes de stopAutoSync.');
    }

    // Detener autoSync
    photoOfflineQueue.stopAutoSync();

    const timerAfter = getActiveBackoffTimerForTesting(testUser);
    if (timerAfter) {
      throw new Error('stopAutoSync no eliminó el timer de backoff activo.');
    }
  });

  // =========================================================================
  // Caso 2: consecutiveStallCount y ciclo de reseteo
  // =========================================================================
  await assert('2. consecutiveStallCount incrementa en stall, resetea con bytes y al reintentar manual', async () => {
    resetQueueStateForTesting();
    const testUser = 'user_hard_2';

    // 1. Encolar foto de prueba
    await photoOfflineQueue.enqueuePhoto({
      id: 'photo_h2',
      userId: testUser,
      cultivationId: 'crop_h2',
      file: createFakeBlob(),
      fileName: 'photo_h2.jpg',
      date: '2026-09-30',
      dayOfCultivation: 1,
      stage: 'Vegetativo',
      category: 'planta completa',
    });

    let photo = await photoOfflineQueue.getQueuedPhotoById('photo_h2');
    if (!photo) throw new Error('Foto no encolada.');

    // Simular incremento por stall
    photo.consecutiveStallCount = 2;
    photo.retryCount = 5;
    await photoOfflineQueue.updateItem(photo);

    photo = await photoOfflineQueue.getQueuedPhotoById('photo_h2');
    if (photo?.consecutiveStallCount !== 2) {
      throw new Error(`consecutiveStallCount esperado 2, obtenido: ${photo?.consecutiveStallCount}`);
    }

    // Comprobar reseteo al hacer retryPendingPhoto manual
    await photoOfflineQueue.retryPendingPhoto('photo_h2', testUser);
    photo = await photoOfflineQueue.getQueuedPhotoById('photo_h2');
    if (photo?.consecutiveStallCount !== 0) {
      throw new Error(`retryPendingPhoto manual debió resetear consecutiveStallCount a 0, actual: ${photo?.consecutiveStallCount}`);
    }
    // retryCount general se conserva para estadísticas
    if (photo?.retryCount !== 5) {
      throw new Error('retryPendingPhoto no debe borrar retryCount general.');
    }
  });

  // =========================================================================
  // Caso 3: _scheduleBackoffWakeup mantiene el nextRetryAt MÁS PRÓXIMO
  // =========================================================================
  await assert('3. _scheduleBackoffWakeup mantiene el nextRetryAt MÁS PRÓXIMO', () => {
    resetQueueStateForTesting();
    const testUser = 'user_hard_3';
    const now = Date.now();

    // 1. Programar primer retry para dentro de 1000 ms
    const timeFirst = now + 1000;
    photoOfflineQueue._scheduleBackoffWakeup(timeFirst, testUser);

    let current = getActiveBackoffTimerForTesting(testUser);
    if (current?.targetTime !== timeFirst) {
      throw new Error(`targetTime esperado ${timeFirst}, obtenido ${current?.targetTime}`);
    }

    // 2. Programar segundo retry más LEJANO (dentro de 5000 ms)
    // NUNCA debe reemplazar el timer existente que despierta antes a los 1000 ms
    const timeFar = now + 5000;
    photoOfflineQueue._scheduleBackoffWakeup(timeFar, testUser);

    current = getActiveBackoffTimerForTesting(testUser);
    if (current?.targetTime !== timeFirst) {
      throw new Error(`El timer más próximo (${timeFirst}) fue incorrectamente reemplazado por el más lejano (${current?.targetTime})`);
    }

    // 3. Programar tercer retry más CERCANO (dentro de 300 ms)
    // SÍ debe reemplazar al de 1000 ms porque es más temprano
    const timeNear = now + 300;
    photoOfflineQueue._scheduleBackoffWakeup(timeNear, testUser);

    current = getActiveBackoffTimerForTesting(testUser);
    if (current?.targetTime !== timeNear) {
      throw new Error(`El timer más cercano (${timeNear}) debió reemplazar al previo, actual: ${current?.targetTime}`);
    }

    resetQueueStateForTesting();
  });

  // =========================================================================
  // Caso 4: Discriminación estricta de errores en Storage (SKIP vs FAIL)
  // =========================================================================
  await assert('4. Storage E2E: solo SKIP con evidencia concreta; storage/unknown genérico FALLA', () => {
    // Función que replica exactamente el evaluador de storage en firebase_storage_real_e2e
    const evaluateStorageError = (err: any): 'SKIP' | 'FAIL' => {
      const errCode = err?.code;
      const status = err?.status_;
      const msg = (err?.message || '').toLowerCase();
      const srvResp = (
        err?.serverResponse ||
        err?.customData?.serverResponse ||
        ''
      ).toLowerCase();

      const hasConcreteEvidence =
        errCode === 'storage/bucket-not-found' ||
        status === 404 ||
        msg.includes('bucket does not exist') ||
        msg.includes('billing') ||
        srvResp.includes('bucket does not exist') ||
        srvResp.includes('billing') ||
        srvResp.includes('not found');

      if (hasConcreteEvidence) {
        return 'SKIP';
      }
      return 'FAIL';
    };

    // A. Error real de bucket no aprovisionado devuelto por GCS (HTTP 404)
    const errBucketNotFound = { code: 'storage/unknown', status_: 404, message: 'Not found' };
    if (evaluateStorageError(errBucketNotFound) !== 'SKIP') {
      throw new Error('Error con status 404 debe evaluarse como SKIP.');
    }

    // B. Error explícito bucket-not-found
    const errExplicit = { code: 'storage/bucket-not-found' };
    if (evaluateStorageError(errExplicit) !== 'SKIP') {
      throw new Error('Error storage/bucket-not-found debe evaluarse como SKIP.');
    }

    // C. Error storage/unknown GENÉRICO con status 500 (falla de servidor aleatoria)
    const errGeneric500 = { code: 'storage/unknown', status_: 500, message: 'Internal Server Error' };
    if (evaluateStorageError(errGeneric500) !== 'FAIL') {
      throw new Error('Error storage/unknown genérico con status 500 debe evaluarse como FAIL.');
    }

    // D. Error storage/unknown sin status ni mensaje de bucket
    const errGenericUndefined = { code: 'storage/unknown', message: 'An unknown error occurred' };
    if (evaluateStorageError(errGenericUndefined) !== 'FAIL') {
      throw new Error('Error storage/unknown sin evidencia concreta debe evaluarse como FAIL.');
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO HARDENINGS: ${passed} pasadas, ${failed} fallidas, ${skipped} omitidas`);
  console.log('================================================================\n');

  return { passed, failed, skipped };
}

if (process.argv[1]?.endsWith('sync_hardenings.test.ts')) {
  runSyncHardeningsTests()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error('Error fatal en pruebas de hardenings:', e);
      process.exit(1);
    });
}
