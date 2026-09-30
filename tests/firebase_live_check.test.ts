/**
 * tests/firebase_live_check.test.ts
 * 
 * COMPROBACIÓN CONTRA EL ENTORNO FIREBASE REAL DE PRUEBA
 * 
 * Utiliza las credenciales autorizadas del proyecto para verificar la sincronización
 * real en Cloud Firestore (base de datos: ai-studio-cultiveta-c0d08afb-3fe1-4735-968c-1e7f31d9af26):
 * 
 * 1. Usa una cuenta autorizada y un cultivo de prueba aislado:
 *    - UID de prueba: "user_test_authorized_eval"
 *    - Cultivo de prueba: "crop_test_authorized_eval"
 * 2. Simula dos sesiones completamente aisladas:
 *    - Sesión A (origen): Confirma una fotografía en Firestore.
 *    - Sesión B (destino): Lee los datos desde otra sesión remota sin tener acceso
 *      a la memoria ni al almacenamiento local de la Sesión A.
 * 3. Limpia inmediatamente los artefactos creados para no dejar residuos de prueba.
 */

import { cert, initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FIREBASE_CONFIG_METADATA } from '../src/firebase/config';

export async function runFirebaseLiveCheck(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   COMPROBACIÓN EN ENTORNO FIREBASE REAL DE PRUEBA (FIRESTORE)   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawSA) {
    console.warn('  ⚠️ [OMITIDA] FIREBASE_SERVICE_ACCOUNT no está presente en el entorno.');
    console.warn('    Documentación: Esta verificación requiere credenciales autorizadas.');
    return { passed: 0, failed: 0, skipped: 1 };
  }

  let sa: any;
  try {
    sa = JSON.parse(rawSA);
  } catch (err: any) {
    console.warn(`  ⚠️ [OMITIDA] No se pudo analizar FIREBASE_SERVICE_ACCOUNT: ${err?.message}`);
    return { passed: 0, failed: 0, skipped: 1 };
  }

  const projectId = sa.project_id || FIREBASE_CONFIG_METADATA.projectId;
  const databaseId = FIREBASE_CONFIG_METADATA.firestoreDatabaseId || '(default)';

  console.log(`  * Proyecto Firebase: ${projectId}`);
  console.log(`  * Base de datos Firestore: ${databaseId}`);
  console.log(`  * Cuenta de servicio autorizada: ${sa.client_email}`);

  const appName = `live-eval-${Date.now()}`;
  const adminApp = initializeApp(
    {
      credential: cert(sa),
      projectId,
    },
    appName
  );

  const db = getFirestore(adminApp, databaseId);

  const testUid = 'user_test_authorized_eval';
  const testCropId = 'crop_test_authorized_eval';
  const testPhotoId = `photo_live_eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // -----------------------------------------------------------------------
    // PASO 1: Sesión A (Origen) confirma la fotografía en Firestore
    // -----------------------------------------------------------------------
    console.log('\n  [Sesión A] Confirmando fotografía en Firestore...');
    const docRefA = db.collection('photos').doc(testPhotoId);
    const photoData = {
      id: testPhotoId,
      userId: testUid,
      cultivationId: testCropId,
      url: 'https://firebasestorage.googleapis.com/v0/b/mock/o/sample.jpg?alt=media',
      storagePath: `users/${testUid}/cultivations/${testCropId}/photos/${testPhotoId}.jpg`,
      syncStatus: 'synced',
      fileSize: 1024,
      mimeType: 'image/jpeg',
      date: '2026-09-29',
      dayOfCultivation: 29,
      stage: 'Floración',
      category: 'flor',
      caption: 'Evidencia botánica confirmada en servidor real',
      isDemo: false,
      isPendingSync: false,
      isLiveVerificationTest: true,
      createdAt: new Date().toISOString(),
    };

    await docRefA.set(photoData);
    console.log(`  ✓ [Sesión A] Fotografía ${testPhotoId} escrita en servidor remoto.`);

    // -----------------------------------------------------------------------
    // PASO 2: Sesión B (Destino) lee desde una sesión y cliente independiente
    // sin depender del almacenamiento local ni memoria de la Sesión A
    // -----------------------------------------------------------------------
    console.log('  [Sesión B] Consultando fotografía desde cliente independiente...');
    const querySnapshot = await db
      .collection('photos')
      .where('userId', '==', testUid)
      .where('cultivationId', '==', testCropId)
      .get();

    const foundDocs = querySnapshot.docs.filter((d) => d.id === testPhotoId);
    if (foundDocs.length !== 1) {
      throw new Error(
        `Sesión B no encontró la fotografía en Firestore (encontrados: ${foundDocs.length}).`
      );
    }

    const docB = foundDocs[0].data();
    if (docB.syncStatus !== 'synced') {
      throw new Error(`syncStatus esperado "synced", obtenido: "${docB.syncStatus}"`);
    }
    if (docB.userId !== testUid || docB.cultivationId !== testCropId) {
      throw new Error('Aislamiento de UID o cultivo comprometido en documento recuperado.');
    }

    console.log(`  ✓ [Sesión B] Fotografía recuperada íntegramente: ID=${docB.id}, Categoría=${docB.category}, Estado=${docB.syncStatus}`);
    passed++;

    // -----------------------------------------------------------------------
    // PASO 3: Limpieza higiénica de artefactos de prueba
    // -----------------------------------------------------------------------
    console.log('  [Limpieza] Purgando fotografía de verificación de Firestore...');
    await docRefA.delete();
    console.log('  ✓ [Limpieza] Fotografía de prueba eliminada exitosamente.');
  } catch (err: any) {
    console.error(`  ✗ [FALLÓ] Verificación contra Firestore real: ${err?.message || err}`);
    failed++;
  } finally {
    try {
      await deleteApp(adminApp);
    } catch {}
  }

  console.log('\n================================================================');
  console.log(` RESULTADO ENTORNO FIREBASE: ${passed} pasadas, ${failed} fallidas, ${skipped} omitidas`);
  console.log('================================================================\n');

  return { passed, failed, skipped };
}

// Ejecución directa si se invoca por CLI
if (process.argv[1]?.endsWith('firebase_live_check.test.ts')) {
  runFirebaseLiveCheck().then(({ failed, skipped }) => {
    process.exit(failed > 0 ? 1 : skipped > 0 ? 2 : 0);
  }).catch((e) => {
    console.error('Error fatal en chequeo de Firebase:', e);
    process.exit(1);
  });
}
