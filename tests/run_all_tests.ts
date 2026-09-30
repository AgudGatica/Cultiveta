/**
 * tests/run_all_tests.ts
 * 
 * Ejecutor Unificado de Pruebas de Cultiveta
 * 
 * Separa rigurosamente y reporta con precisión:
 * 1. MOCKS: Lógica de sincronización offline, colas, bloqueos y estados (sync_scenarios & new_sync_defects)
 * 2. JSDOM: Pruebas de componentes en DOM emulado con React act y binarios reales JPEG/PNG (component_gallery_real)
 * 3. NAVEGADOR E2E: Prueba con navegador real (Chrome / Playwright) si la infraestructura lo permite (e2e_browser_real)
 * 4. FIREBASE REAL DE PRUEBA:
 *    a. Cloud Firestore en vivo (firebase_live_check)
 *    b. Firebase Auth + Storage + Firestore en vivo (firebase_storage_real_e2e)
 * 
 * Cumple estrictamente:
 * - Distingue passed / failed / skipped en el resumen global.
 * - Un test omitido jamás incrementa totalPassed.
 * - Termina con código de salida 1 si alguna suite falla.
 */

import { spawnSync } from 'child_process';

console.log('\n================================================================');
console.log('   CULTIVETA: SUITE COMPLETA DE VERIFICACIÓN Y SINCRONIZACIÓN   ');
console.log('================================================================\n');

let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;

interface SuiteConfig {
  id: string;
  name: string;
  category: 'mocks' | 'jsdom' | 'e2e' | 'firebase_real';
  file: string;
  expectedTests: number;
}

const suites: SuiteConfig[] = [
  {
    id: 'sync_scenarios',
    name: 'Mocks: 7 Escenarios Base de Sincronización',
    category: 'mocks',
    file: 'tests/sync_scenarios.test.ts',
    expectedTests: 7,
  },
  {
    id: 'new_sync_defects',
    name: 'Mocks: 8 Casos Críticos (Concurrencia, Cierre de Sesión, Contadores, Borrado, Backoff y Watchdog Stalled)',
    category: 'mocks',
    file: 'tests/new_sync_defects.test.ts',
    expectedTests: 8,
  },
  {
    id: 'firestore_tasks_isolation',
    name: 'Seguridad y Aislamiento: Consulta estricta por UID de tareas y alertas',
    category: 'mocks',
    file: 'tests/firestore_tasks_isolation.test.ts',
    expectedTests: 3,
  },
  {
    id: 'sync_hardenings',
    name: 'Hardenings: Limpieza de timers en stopAutoSync, consecutiveStallCount, scheduler prioritario y evaluador Storage',
    category: 'mocks',
    file: 'tests/sync_hardenings.test.ts',
    expectedTests: 4,
  },
  {
    id: 'component_gallery_real',
    name: 'JSDOM: Pruebas de Componentes con React act y Binarios Reales JPEG/PNG',
    category: 'jsdom',
    file: 'tests/component_gallery_real.test.ts',
    expectedTests: 5,
  },
  {
    id: 'e2e_browser_real',
    name: 'Navegador E2E: Chrome / Playwright Real (Condicional)',
    category: 'e2e',
    file: 'tests/e2e_browser_real.test.ts',
    expectedTests: 1,
  },
  {
    id: 'firebase_live_check',
    name: 'Firebase Real de Prueba: Cloud Firestore en Vivo',
    category: 'firebase_real',
    file: 'tests/firebase_live_check.test.ts',
    expectedTests: 1,
  },
  {
    id: 'firebase_storage_real_e2e',
    name: 'Firebase Real de Prueba: Auth + Storage + Firestore en Vivo',
    category: 'firebase_real',
    file: 'tests/firebase_storage_real_e2e.test.ts',
    expectedTests: 1,
  },
];

for (let i = 0; i < suites.length; i++) {
  const s = suites[i];
  console.log(`\n>>> [${i + 1}/${suites.length}] Ejecutando ${s.file} (${s.name}) ...`);

  const res = spawnSync('npx', ['tsx', s.file], {
    stdio: 'inherit',
    env: process.env,
  });

  if (res.status === 0) {
    totalPassed += s.expectedTests;
  } else if (res.status === 2) {
    // Código de salida 2 indica prueba OMITIDA (por falta de credenciales o bucket no aprovisionado)
    // NUNCA se incrementa totalPassed
    totalSkipped += s.expectedTests;
    console.log(`  ℹ️ Suite [${s.id}] registrada como OMITIDA (skipped).`);
  } else {
    totalFailed++;
    console.error(`\n❌ Fallo en suite ${s.file} (código de salida: ${res.status})`);
  }
}

console.log('\n================================================================');
console.log('                 RESUMEN GLOBAL DE VERIFICACIÓN                 ');
console.log('================================================================');
console.log(`  * Pruebas PASADAS (passed):   ${totalPassed}`);
console.log(`  * Pruebas OMITIDAS (skipped): ${totalSkipped}`);
console.log(`  * Suites FALLIDAS (failed):   ${totalFailed}`);
console.log('----------------------------------------------------------------');

if (totalFailed > 0) {
  console.error('❌ ESTADO: FALLÓ la verificación global.');
  process.exit(1);
} else {
  console.log('✅ ESTADO: TODAS las pruebas evaluadas pasaron exitosamente.');
  process.exit(0);
}
