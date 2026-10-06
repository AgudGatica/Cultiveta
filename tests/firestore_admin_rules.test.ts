/**
 * tests/firestore_admin_rules.test.ts
 *
 * SUITE DE PRUEBAS REALES DE FIRESTORE RULES (7 CASOS):
 * 1. Usuario autenticado puede crear /users/{uid} con role:'user' e isCreator:false
 * 2. Usuario NO puede crear /users/{uid} con role:'admin'
 * 3. Usuario NO puede crear /users/{uid} con isCreator:true
 * 4. Usuario NO puede actualizar role en /users/{uid}
 * 5. Usuario NO puede actualizar isCreator en /users/{uid}
 * 6. Usuario sí puede actualizar preferences en /users/{uid}
 * 7. Usuario NO puede crear/leer/escribir directamente /geneticsCatalogPhotos/{docId},
 *    específicamente intentando explotar el catch-all /{collection}/{document}
 *    con { userId: authenticatedUid, name: "Exploit attempt" }.
 *
 * Si Firestore Emulator no está disponible en el entorno de ejecución:
 * Sale estrictamente con código 2 (SKIPPED), sin falsos éxitos.
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

async function isEmulatorRunning(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/`, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('   PRUEBAS DE SEGURIDAD EN FIRESTORE RULES (7 CASOS REALES)     ');
  console.log('================================================================');

  const emulatorHostEnv = process.env.FIRESTORE_EMULATOR_HOST;
  let host = '127.0.0.1';
  let port = 8080;

  if (emulatorHostEnv) {
    const parts = emulatorHostEnv.split(':');
    host = parts[0] || '127.0.0.1';
    port = parseInt(parts[1] || '8080', 10);
  }

  const emulatorActive = await isEmulatorRunning(host, port);

  if (!emulatorActive && !emulatorHostEnv) {
    console.log('\n  ⚠️ [OMITIDA] SKIPPED — Firestore Emulator no disponible.');
    console.log('    Para ejecutar esta suite real, inicie el emulador con: firebase emulators:start --only firestore');
    console.log('================================================================\n');
    process.exit(2);
  }

  let rulesTesting: any;
  try {
    rulesTesting = await import('@firebase/rules-unit-testing');
  } catch (err) {
    console.log('\n  ⚠️ [OMITIDA] SKIPPED — Paquete @firebase/rules-unit-testing no disponible.');
    console.log('================================================================\n');
    process.exit(2);
  }

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  if (!fs.existsSync(rulesPath)) {
    console.error('❌ Archivo firestore.rules no encontrado.');
    process.exit(1);
  }
  const rules = fs.readFileSync(rulesPath, 'utf8');

  let testEnv: any;
  try {
    testEnv = await rulesTesting.initializeTestEnvironment({
      projectId: 'cultiveta-rules-test-' + Date.now(),
      firestore: {
        rules,
        host,
        port,
      },
    });
  } catch (err: any) {
    console.log('\n  ⚠️ [OMITIDA] SKIPPED — Firestore Emulator no disponible o fallo de conexión:', err?.message || err);
    console.log('================================================================\n');
    process.exit(2);
  }

  let passed = 0;
  let failed = 0;

  function recordPass(desc: string) {
    passed++;
    console.log(`  ✓ [PASÓ] ${desc}`);
  }

  function recordFail(desc: string, err?: any) {
    failed++;
    console.error(`  ❌ [FALLÓ] ${desc}`, err ? err.message || err : '');
  }

  const uid = 'user-test-normal-42';
  const otherUid = 'user-other-99';
  const authenticatedContext = testEnv.authenticatedContext(uid);
  const unauthenticatedContext = testEnv.unauthenticatedContext();
  const db = authenticatedContext.firestore();

  try {
    // -------------------------------------------------------------
    // CASO 1: usuario puede crear /users/{uid} con role:'user' e isCreator:false
    // -------------------------------------------------------------
    try {
      const userDoc = db.collection('users').doc(uid);
      await rulesTesting.assertSucceeds(
        userDoc.set({
          uid,
          displayName: 'Cultivador Normal',
          role: 'user',
          isCreator: false,
          preferences: { advancedMode: false },
        })
      );
      recordPass("1. Usuario puede crear /users/{uid} con role:'user' e isCreator:false");
    } catch (err) {
      recordFail("1. Usuario no pudo crear /users/{uid} válido", err);
    }

    // -------------------------------------------------------------
    // CASO 2: usuario NO puede crear /users/{uid} con role:'admin'
    // -------------------------------------------------------------
    try {
      const attackerDoc = db.collection('users').doc('attacker-role-admin');
      const attackerContext = testEnv.authenticatedContext('attacker-role-admin');
      await rulesTesting.assertFails(
        attackerContext.firestore().collection('users').doc('attacker-role-admin').set({
          uid: 'attacker-role-admin',
          displayName: 'Attacker Admin',
          role: 'admin',
          isCreator: false,
        })
      );
      recordPass("2. Usuario NO puede crear /users/{uid} con role:'admin'");
    } catch (err) {
      recordFail("2. Falló bloqueo de creación con role:'admin'", err);
    }

    // -------------------------------------------------------------
    // CASO 3: usuario NO puede crear /users/{uid} con isCreator:true
    // -------------------------------------------------------------
    try {
      const attackerContext = testEnv.authenticatedContext('attacker-creator');
      await rulesTesting.assertFails(
        attackerContext.firestore().collection('users').doc('attacker-creator').set({
          uid: 'attacker-creator',
          displayName: 'Attacker Creator',
          role: 'user',
          isCreator: true,
        })
      );
      recordPass("3. Usuario NO puede crear /users/{uid} con isCreator:true");
    } catch (err) {
      recordFail("3. Falló bloqueo de creación con isCreator:true", err);
    }

    // -------------------------------------------------------------
    // CASO 4: usuario NO puede actualizar role en /users/{uid}
    // -------------------------------------------------------------
    try {
      const userDoc = db.collection('users').doc(uid);
      await rulesTesting.assertFails(
        userDoc.update({
          role: 'admin',
        })
      );
      recordPass("4. Usuario NO puede actualizar role");
    } catch (err) {
      recordFail("4. Falló bloqueo de mutación de role", err);
    }

    // -------------------------------------------------------------
    // CASO 5: usuario NO puede actualizar isCreator en /users/{uid}
    // -------------------------------------------------------------
    try {
      const userDoc = db.collection('users').doc(uid);
      await rulesTesting.assertFails(
        userDoc.update({
          isCreator: true,
        })
      );
      recordPass("5. Usuario NO puede actualizar isCreator");
    } catch (err) {
      recordFail("5. Falló bloqueo de mutación de isCreator", err);
    }

    // -------------------------------------------------------------
    // CASO 6: usuario sí puede actualizar preferences en /users/{uid}
    // -------------------------------------------------------------
    try {
      const userDoc = db.collection('users').doc(uid);
      await rulesTesting.assertSucceeds(
        userDoc.update({
          displayName: 'Nombre Actualizado',
          preferences: { advancedMode: true, tempUnit: 'C' },
        })
      );
      recordPass("6. Usuario sí puede actualizar preferences");
    } catch (err) {
      recordFail("6. Falló actualización de preferences legítimas", err);
    }

    // -------------------------------------------------------------
    // CASO 7: usuario NO puede crear/leer/escribir directamente /geneticsCatalogPhotos/{docId}
    // (Intentando explotar también el catch-all /{collection}/{document} con userId: authenticatedUid)
    // -------------------------------------------------------------
    try {
      const catalogDoc = db.collection('geneticsCatalogPhotos').doc('sensi-seeds__skunk-1');
      
      // Intento A: Lectura directa rechazada
      const readAttempt = rulesTesting.assertFails(catalogDoc.get());
      
      // Intento B: Escritura directa rechazada
      const writeAttempt = rulesTesting.assertFails(
        catalogDoc.set({
          seedBank: 'Sensi Seeds',
          name: 'Skunk #1',
          photoUrl: 'https://malicious.com/exploit.jpg',
        })
      );

      // Intento C (Bypass Catch-all): Crear con userId: uid para intentar engañar el match genérico
      const exploitDoc = db.collection('geneticsCatalogPhotos').doc('exploit-attempt-doc');
      const exploitAttempt = rulesTesting.assertFails(
        exploitDoc.set({
          userId: uid,
          name: 'Exploit attempt',
          photoUrl: 'https://malicious.com/exploit.jpg',
        })
      );

      await Promise.all([readAttempt, writeAttempt, exploitAttempt]);
      recordPass("7. Usuario NO puede crear/leer/escribir /geneticsCatalogPhotos (intento de bypass catch-all bloqueado)");
    } catch (err) {
      recordFail("7. Falló aislamiento de geneticsCatalogPhotos contra cliente / bypass de catch-all", err);
    }

  } finally {
    await testEnv.cleanup();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: 7 | PASARON: ${passed} | FALLARON: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
