/**
 * tests/run_all_tests.ts
 * 
 * Ejecutor Unificado de Pruebas de Cultiveta
 * 
 * Separa y ejecuta rigurosamente:
 * 1. Pruebas de lógica con mocks (sync_scenarios.test.ts y new_sync_defects.test.ts)
 * 2. Pruebas de componentes o navegador en DOM con binarios reales JPEG/PNG (component_gallery_real.test.ts)
 * 3. Comprobación contra el entorno Firebase real de prueba (firebase_live_check.test.ts)
 * 
 * Termina con código de salida 1 si cualquiera de las suites falla.
 */

import { spawnSync } from 'child_process';

console.log('\n================================================================');
console.log('   CULTIVETA: SUITE COMPLETA DE VERIFICACIÓN Y SINCRONIZACIÓN   ');
console.log('================================================================\n');

let totalPassed = 0;
let totalFailed = 0;

// ============================================================================
// 1. PRUEBAS DE LÓGICA CON MOCKS: 7 Escenarios Base
// ============================================================================
console.log('>>> [1/4] Ejecutando tests/sync_scenarios.test.ts (Lógica con mocks - 7 escenarios) ...');
const res1 = spawnSync('npx', ['tsx', 'tests/sync_scenarios.test.ts'], {
  stdio: 'inherit',
  env: process.env,
});

if (res1.status !== 0) {
  console.error('\n❌ Fallo en tests/sync_scenarios.test.ts');
  totalFailed++;
} else {
  totalPassed += 7;
}

// ============================================================================
// 2. PRUEBAS DE LÓGICA CON MOCKS: 7 Casos Críticos (Concurrencia, Cierre de Sesión,
//    Contadores, Borrado Durable, updateItem, Estados Observables y Errores de Storage)
// ============================================================================
console.log('\n>>> [2/4] Ejecutando tests/new_sync_defects.test.ts (Lógica con mocks - 7 casos críticos) ...');
const res2 = spawnSync('npx', ['tsx', 'tests/new_sync_defects.test.ts'], {
  stdio: 'inherit',
  env: process.env,
});

if (res2.status !== 0) {
  console.error('\n❌ Fallo en tests/new_sync_defects.test.ts');
  totalFailed++;
} else {
  totalPassed += 7;
}

// ============================================================================
// 3. PRUEBAS DE COMPONENTES Y DOM (NAVEGADOR) CON IMÁGENES REALES JPEG / PNG
// ============================================================================
console.log('\n>>> [3/4] Ejecutando tests/component_gallery_real.test.ts (Componentes y DOM) ...');
const res3 = spawnSync('npx', ['tsx', 'tests/component_gallery_real.test.ts'], {
  stdio: 'inherit',
  env: process.env,
});

if (res3.status !== 0) {
  console.error('\n❌ Fallo en tests/component_gallery_real.test.ts');
  totalFailed++;
} else {
  totalPassed += 5;
}

// ============================================================================
// 4. COMPROBACIÓN EN ENTORNO FIREBASE REAL DE PRUEBA
// ============================================================================
console.log('\n>>> [4/4] Ejecutando tests/firebase_live_check.test.ts (Firebase real) ...');
const res4 = spawnSync('npx', ['tsx', 'tests/firebase_live_check.test.ts'], {
  stdio: 'inherit',
  env: process.env,
});

if (res4.status !== 0) {
  console.error('\n❌ Fallo en tests/firebase_live_check.test.ts');
  totalFailed++;
} else {
  totalPassed += 1;
}

console.log('\n================================================================');
console.log(` RESUMEN GLOBAL: ${totalPassed} pruebas pasadas, ${totalFailed} suites con fallos`);
console.log('================================================================\n');

if (totalFailed > 0 || res1.status !== 0 || res2.status !== 0 || res3.status !== 0 || res4.status !== 0) {
  process.exit(1);
} else {
  process.exit(0);
}
