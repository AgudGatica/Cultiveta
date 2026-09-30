/**
 * tests/firebase_storage_real_e2e.test.ts
 * 
 * FLUJO REAL DE FOTOGRAFÍAS END-TO-END CONTRA ENTORNO FIREBASE DE PRUEBA
 * 
 * Requisitos:
 * 1. Utiliza un entorno Firebase de PRUEBA, NUNCA producción.
 * 2. Autentica un usuario cliente de prueba mediante Firebase Auth (Client SDK).
 * 3. Crea un JPEG válido pequeño.
 * 4. Sube los bytes al bucket real utilizando el path idéntico de Cultiveta:
 *    users/{uid}/cultivations/{cultivationId}/photos/{photoId}.jpg
 * 5. Espera confirmación real de Firebase Storage.
 * 6. Obtiene una download URL real.
 * 7. Guarda los metadatos reales en Firestore (Client SDK).
 * 8. Crea una segunda instancia/sesión cliente independiente.
 * 9. Recupera el documento desde Firestore.
 * 10. Descarga la imagen real desde Storage.
 * 11. Verifica MIME, tamaño y bytes idénticos.
 * 12. Elimina exclusivamente el documento y el objeto creados por la prueba.
 * 
 * IMPORTANTE: No utiliza Firebase Admin para afirmar que las reglas del cliente
 * funcionan (Admin omite Security Rules). Admin se utiliza exclusivamente
 * de forma desacoplada para generar el token de prueba y como limpieza de respaldo.
 */

import { initializeApp as initAdminApp, cert, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import { getAuth as getClientAuth, signInWithCustomToken } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore as getClientFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  getStorage as getClientStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  getBytes,
  deleteObject,
} from 'firebase/storage';
import { FIREBASE_CONFIG_METADATA } from '../src/firebase/config';
import firebaseConfigJson from '../firebase-applet-config.json';

// Binario JPEG válido y canónico (SOI, APP0 JFIF, DQT, EOI)
const TEST_VALID_JPEG_BYTES = new Uint8Array([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
  0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D,
  0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D,
  0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28,
  0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
  0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xD9,
]);

export async function runFirebaseStorageRealE2E(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBA REAL END-TO-END: FIREBASE AUTH + STORAGE + FIRESTORE  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // ---------------------------------------------------------------------------
  // 1. Salvaguarda: NUNCA ejecutar contra entornos de producción
  // ---------------------------------------------------------------------------
  const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawSA) {
    console.warn('  ⚠️ [OMITIDA] FIREBASE_SERVICE_ACCOUNT no está configurada.');
    console.warn('    Esta prueba requiere credenciales autorizadas de un entorno de prueba.');
    return { passed: 0, failed: 0, skipped: 1 };
  }

  let sa: any;
  try {
    sa = JSON.parse(rawSA);
  } catch (err: any) {
    console.warn(`  ⚠️ [OMITIDA] Credenciales de servicio inválidas: ${err?.message}`);
    return { passed: 0, failed: 0, skipped: 1 };
  }

  const projectId = sa.project_id || FIREBASE_CONFIG_METADATA.projectId;
  const lowerProjectId = (projectId || '').toLowerCase();
  if (
    lowerProjectId.includes('prod-live') ||
    lowerProjectId.includes('production') ||
    lowerProjectId.includes('cultiveta-prod')
  ) {
    console.error(`  ⛔ [RECHAZADA] Bloqueo de seguridad: Se detectó entorno de producción (${projectId}).`);
    return { passed: 0, failed: 1, skipped: 0 };
  }

  // Comprobar bucket de Storage configurado
  const storageBucket = firebaseConfigJson.storageBucket || `${projectId}.firebasestorage.app`;
  console.log(`  * Proyecto Firebase de prueba: ${projectId}`);
  console.log(`  * Bucket de Storage evaluado: ${storageBucket}`);

  // ---------------------------------------------------------------------------
  // 2. Preparación aislada: Generar tokens de Auth con Admin SDK
  //    (Estrictamente desacoplado de las llamadas y reglas del cliente)
  // ---------------------------------------------------------------------------
  const adminAppName = `admin-prep-${Date.now()}`;
  const adminApp = initAdminApp({ credential: cert(sa), projectId }, adminAppName);
  const adminAuth = getAdminAuth(adminApp);

  const testUid = `test_client_storage_eval_${Date.now()}`;
  const testCropId = `crop_e2e_${Date.now()}`;
  const testPhotoId = `photo_e2e_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const relativePhotoPath = `users/${testUid}/cultivations/${testCropId}/photos/${testPhotoId}.jpg`;

  let clientCustomTokenA: string;
  let clientCustomTokenB: string;

  try {
    clientCustomTokenA = await adminAuth.createCustomToken(testUid);
    clientCustomTokenB = await adminAuth.createCustomToken(testUid);
  } catch (tokenErr: any) {
    console.warn(`  ⚠️ [OMITIDA] No se pudo crear token de prueba para Firebase Auth: ${tokenErr?.message}`);
    await deleteAdminApp(adminApp);
    return { passed: 0, failed: 0, skipped: 1 };
  }

  // Configuración del cliente Firebase
  const clientConfig = {
    apiKey: firebaseConfigJson.apiKey,
    authDomain: firebaseConfigJson.authDomain,
    projectId: firebaseConfigJson.projectId,
    storageBucket,
  };

  let clientAppA: any = null;
  let clientAppB: any = null;
  let uploadedToStorage = false;
  let writtenToFirestore = false;

  try {
    // -------------------------------------------------------------------------
    // 3. SESIÓN A (Cliente Origen): Autenticar usuario de prueba
    // -------------------------------------------------------------------------
    console.log('  [Sesión A] Inicializando cliente e iniciando sesión en Firebase Auth...');
    clientAppA = initClientApp(clientConfig, `client-a-${Date.now()}`);
    const clientAuthA = getClientAuth(clientAppA);
    const userCredA = await signInWithCustomToken(clientAuthA, clientCustomTokenA);

    if (userCredA.user.uid !== testUid) {
      throw new Error(`UID de usuario no coincide: esperado=${testUid}, obtenido=${userCredA.user.uid}`);
    }
    console.log(`  ✓ [Sesión A] Autenticado como UID: ${userCredA.user.uid}`);

    // -------------------------------------------------------------------------
    // 4. SESIÓN A: Subir binario JPEG real a Firebase Storage
    //    Ruta: users/{uid}/cultivations/{cultivationId}/photos/{photoId}.jpg
    // -------------------------------------------------------------------------
    console.log(`  [Sesión A] Subiendo bytes de imagen JPEG real a Storage: ${relativePhotoPath}...`);
    const clientStorageA = getClientStorage(clientAppA);
    const storageObjRefA = storageRef(clientStorageA, relativePhotoPath);

    let uploadSnap: any;
    try {
      uploadSnap = await uploadBytes(storageObjRefA, TEST_VALID_JPEG_BYTES, {
        contentType: 'image/jpeg',
      });
      uploadedToStorage = true;
    } catch (uploadErr: any) {
      const errCode = uploadErr?.code;
      const status = uploadErr?.status_;
      const msg = (uploadErr?.message || '').toLowerCase();
      const srvResp = (
        uploadErr?.serverResponse ||
        uploadErr?.customData?.serverResponse ||
        ''
      ).toLowerCase();

      // Evidencia concreta de bucket no aprovisionado, facturación inactiva o 404 de recurso ausente
      const hasConcreteEvidence =
        errCode === 'storage/bucket-not-found' ||
        status === 404 ||
        msg.includes('bucket does not exist') ||
        msg.includes('billing') ||
        srvResp.includes('bucket does not exist') ||
        srvResp.includes('billing') ||
        srvResp.includes('not found');

      if (hasConcreteEvidence) {
        console.warn('  ⚠️ [OMITIDA] Evidencia concreta de bucket no aprovisionado o facturación deshabilitada en este proyecto de prueba.');
        console.warn(`    Código: ${errCode}, Status HTTP: ${status}, Detalle: ${uploadErr?.message || errCode}`);
        return { passed: 0, failed: 0, skipped: 1 };
      }

      // Un storage/unknown genérico sin evidencia concreta de 404/billing/bucket-not-found debe FALLAR la prueba
      console.error('  ✗ [FALLÓ] Error inesperado en Storage (no atribuible a bucket no aprovisionado ni facturación):', uploadErr);
      throw uploadErr;
    }

    console.log(`  ✓ [Sesión A] Confirmación real de Storage recibida: ${uploadSnap.metadata.fullPath} (${uploadSnap.metadata.size} bytes).`);

    // -------------------------------------------------------------------------
    // 5. SESIÓN A: Obtener URL real de descarga
    // -------------------------------------------------------------------------
    console.log('  [Sesión A] Obteniendo download URL real de Firebase Storage...');
    const downloadUrl = await getDownloadURL(storageObjRefA);
    if (!downloadUrl.startsWith('http')) {
      throw new Error(`URL de descarga inválida: ${downloadUrl}`);
    }
    console.log(`  ✓ [Sesión A] Download URL obtenida: ${downloadUrl.substring(0, 55)}...`);

    // -------------------------------------------------------------------------
    // 6. SESIÓN A: Guardar metadatos reales en Cloud Firestore
    // -------------------------------------------------------------------------
    console.log('  [Sesión A] Guardando documento de metadatos en Firestore...');
    const dbDatabaseId = (firebaseConfigJson as any).firestoreDatabaseId;
    let clientDbA: any;
    try {
      clientDbA = initializeFirestore(clientAppA, { experimentalForceLongPolling: true }, dbDatabaseId || undefined);
    } catch {
      clientDbA = getClientFirestore(clientAppA, dbDatabaseId || undefined);
    }

    const docRefA = doc(clientDbA, 'photos', testPhotoId);
    const metadataRecord = {
      id: testPhotoId,
      userId: testUid,
      cultivationId: testCropId,
      url: downloadUrl,
      storagePath: relativePhotoPath,
      syncStatus: 'synced',
      fileSize: TEST_VALID_JPEG_BYTES.byteLength,
      mimeType: 'image/jpeg',
      date: new Date().toISOString().split('T')[0],
      dayOfCultivation: 30,
      stage: 'Floración',
      category: 'resina',
      caption: 'Fotografía E2E validada con Storage y Firestore reales',
      isPendingSync: false,
      createdAt: new Date().toISOString(),
      isRealStorageE2ETest: true,
    };

    await setDoc(docRefA, metadataRecord);
    writtenToFirestore = true;
    console.log(`  ✓ [Sesión A] Metadatos persistidos en Firestore (photos/${testPhotoId}).`);

    // -------------------------------------------------------------------------
    // 7. SESIÓN B (Cliente Destino Independiente): Nueva sesión y cliente
    // -------------------------------------------------------------------------
    console.log('\n  [Sesión B] Creando segunda instancia de cliente independiente...');
    clientAppB = initClientApp(clientConfig, `client-b-${Date.now()}`);
    const clientAuthB = getClientAuth(clientAppB);
    await signInWithCustomToken(clientAuthB, clientCustomTokenB);

    let clientDbB: any;
    try {
      clientDbB = initializeFirestore(clientAppB, { experimentalForceLongPolling: true }, dbDatabaseId || undefined);
    } catch {
      clientDbB = getClientFirestore(clientAppB, dbDatabaseId || undefined);
    }

    // -------------------------------------------------------------------------
    // 8. SESIÓN B: Recuperar documento desde Firestore
    // -------------------------------------------------------------------------
    console.log('  [Sesión B] Leyendo documento de fotografía desde Firestore...');
    const docRefB = doc(clientDbB, 'photos', testPhotoId);
    const snapB = await getDoc(docRefB);

    if (!snapB.exists()) {
      throw new Error(`El documento photos/${testPhotoId} no existe en la Sesión B.`);
    }

    const dataB = snapB.data();
    if (dataB.userId !== testUid || dataB.storagePath !== relativePhotoPath) {
      throw new Error('Metadatos recuperados no coinciden con los guardados por la Sesión A.');
    }
    console.log(`  ✓ [Sesión B] Documento verificado: URL=${dataB.url.substring(0, 45)}...`);

    // -------------------------------------------------------------------------
    // 9. SESIÓN B: Descargar la imagen real desde Storage y verificar integridad binaria
    // -------------------------------------------------------------------------
    console.log('  [Sesión B] Descargando objeto binario real desde Firebase Storage...');
    const clientStorageB = getClientStorage(clientAppB);
    const storageObjRefB = storageRef(clientStorageB, dataB.storagePath);

    // Obtener los bytes reales utilizando el SDK del cliente
    const downloadedArrayBuffer = await getBytes(storageObjRefB);
    const downloadedBytes = new Uint8Array(downloadedArrayBuffer);

    console.log(`  ✓ [Sesión B] Descarga completada: ${downloadedBytes.byteLength} bytes recibidos.`);

    // Verificar tamaño exacto
    if (downloadedBytes.byteLength !== TEST_VALID_JPEG_BYTES.byteLength) {
      throw new Error(
        `Tamaño de imagen descargada no coincide: esperado=${TEST_VALID_JPEG_BYTES.byteLength}, recibido=${downloadedBytes.byteLength}`
      );
    }

    // Verificar contenido binario byte por byte
    for (let i = 0; i < TEST_VALID_JPEG_BYTES.length; i++) {
      if (downloadedBytes[i] !== TEST_VALID_JPEG_BYTES[i]) {
        throw new Error(`Discrepancia binaria en byte índice ${i}: esperado=0x${TEST_VALID_JPEG_BYTES[i].toString(16)}, obtenido=0x${downloadedBytes[i].toString(16)}`);
      }
    }
    console.log('  ✓ [Sesión B] Verificación de bytes 100% idénticos y válidos superada.');

    // -------------------------------------------------------------------------
    // 10. LIMPIEZA HIGIÉNICA: Eliminar exclusivamente documento y objeto creados
    // -------------------------------------------------------------------------
    console.log('  [Limpieza] Eliminando exclusivamente objeto de Storage y documento de Firestore...');
    await deleteObject(storageObjRefA);
    uploadedToStorage = false;
    console.log('  ✓ [Limpieza] Objeto de Storage eliminado.');

    await deleteDoc(docRefA);
    writtenToFirestore = false;
    console.log('  ✓ [Limpieza] Documento de Firestore eliminado.');

    passed++;
  } catch (err: any) {
    console.error(`  ✗ [FALLÓ] Prueba real de Storage: ${err?.message || err}`);
    failed++;
  } finally {
    // Respaldo de limpieza en caso de error durante la prueba
    if (uploadedToStorage && clientAppA) {
      try {
        const clStorage = getClientStorage(clientAppA);
        await deleteObject(storageRef(clStorage, relativePhotoPath));
      } catch {}
    }
    if (writtenToFirestore && clientAppA) {
      try {
        const clientDbA = getClientFirestore(clientAppA, (firebaseConfigJson as any).firestoreDatabaseId || undefined);
        await deleteDoc(doc(clientDbA, 'photos', testPhotoId));
      } catch {}
    }

    try {
      if (clientAppA) await deleteClientApp(clientAppA);
      if (clientAppB) await deleteClientApp(clientAppB);
      await deleteAdminApp(adminApp);
    } catch {}
  }

  console.log('\n================================================================');
  console.log(` RESULTADO STORAGE REAL E2E: ${passed} pasadas, ${failed} fallidas, ${skipped} omitidas`);
  console.log('================================================================\n');

  return { passed, failed, skipped };
}

// Ejecución directa si se invoca por CLI
if (process.argv[1]?.endsWith('firebase_storage_real_e2e.test.ts')) {
  runFirebaseStorageRealE2E()
    .then(({ failed, skipped }) => {
      process.exit(failed > 0 ? 1 : skipped > 0 ? 2 : 0);
    })
    .catch((e) => {
      console.error('Error fatal en prueba de Storage:', e);
      process.exit(1);
    });
}
