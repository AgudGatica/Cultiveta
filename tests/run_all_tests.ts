/**
 * Ejecutor Unificado de Pruebas de Sincronización de Cultiveta
 * 
 * Ejecuta ambas suites de prueba:
 * 1. tests/sync_scenarios.test.ts (7 pruebas fundamentales de arquitectura offline)
 * 2. tests/new_sync_defects.test.ts (6 pruebas de defectos de concurrencia, cierre de sesión, UI y borrado durable)
 * 
 * Falla y devuelve código de salida 1 si cualquiera de las pruebas falla.
 */

import { spawnSync } from 'child_process';

console.log('\n================================================================');
console.log('   CULTIVETA: SUITE COMPLETA DE SINCRONIZACIÓN DE FOTOGRAFÍAS   ');
console.log('================================================================\n');

let totalPassed = 0;
let totalFailed = 0;

// 1. Ejecución de la suite 1 (7 escenarios base)
console.log('>>> [1/2] Ejecutando tests/sync_scenarios.test.ts ...');
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

// 2. Ejecución de la suite 2 (6 nuevos casos y UI)
console.log('\n>>> [2/2] Ejecutando tests/new_sync_defects.test.ts ...');
const res2 = spawnSync('npx', ['tsx', 'tests/new_sync_defects.test.ts'], {
  stdio: 'inherit',
  env: process.env,
});

if (res2.status !== 0) {
  console.error('\n❌ Fallo en tests/new_sync_defects.test.ts');
  totalFailed++;
} else {
  totalPassed += 6;
}

console.log('\n================================================================');
console.log(` RESUMEN GLOBAL: ${totalPassed} pruebas pasadas, ${totalFailed} suites con fallos`);
console.log('================================================================\n');

if (totalFailed > 0 || res1.status !== 0 || res2.status !== 0) {
  process.exit(1);
} else {
  process.exit(0);
}
