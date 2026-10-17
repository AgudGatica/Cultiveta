/**
 * tests/run_all_tests.ts
 *
 * Ejecutor Unificado de Pruebas de Cultiveta
 *
 * - Descubre automáticamente todos los archivos tests/*.test.ts (no hay lista escrita a mano).
 * - Cuenta los casos de cada suite a partir de su salida real:
 *     pasados  -> "✓ [PASÓ]" o "✅ PASSED:"
 *     fallidos -> "✗ [FALLÓ]", "❌ [FALLÓ]" o "❌ FAILED:"
 *     omitidos -> "[OMITIDA]"
 * - Códigos de salida de cada suite: 0 = pasó, 2 = omitida, otro = falló.
 * - Distingue passed / failed / skipped en el resumen global; un test omitido jamás suma a passed.
 * - Termina con código de salida 1 si alguna suite falla.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TESTS_DIR = path.resolve(process.cwd(), 'tests');
const TSX_CLI = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
// Una suite que no termina en este tiempo se reporta como fallida (evita que el runner quede colgado).
const SUITE_TIMEOUT_MS = 10 * 60 * 1000;

const PASS_MARKER = /✓ \[PASÓ\]|✅ PASSED:/g;
const FAIL_MARKER = /✗ \[FALLÓ\]|❌ \[FALLÓ\]|❌ FAILED:/g;
const SKIP_MARKER = /\[OMITIDA\]/g;

export interface SuiteCounts {
  passed: number;
  failed: number;
  skipped: number;
}

/** Cuenta los casos reportados por una suite a partir de su salida. */
export function countSuiteResults(output: string): SuiteCounts {
  return {
    passed: (output.match(PASS_MARKER) || []).length,
    failed: (output.match(FAIL_MARKER) || []).length,
    skipped: (output.match(SKIP_MARKER) || []).length,
  };
}

/** Lista los archivos de test descubiertos (orden alfabético estable). */
export function discoverTestFiles(dir: string = TESTS_DIR): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
    .map((name) => path.join('tests', name));
}

function runAll(): void {
  console.log('\n================================================================');
  console.log('   CULTIVETA: SUITE COMPLETA DE VERIFICACIÓN Y SINCRONIZACIÓN   ');
  console.log('================================================================\n');

  const files = discoverTestFiles();
  let totalPassed = 0;
  let totalFailedCases = 0;
  let totalSkipped = 0;
  let failedSuites = 0;

  files.forEach((file, i) => {
    console.log(`\n>>> [${i + 1}/${files.length}] Ejecutando ${file} ...`);

    const res = spawnSync(process.execPath, [TSX_CLI, file], {
      env: process.env,
      encoding: 'utf8',
      timeout: SUITE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });

    const output = `${res.stdout || ''}${res.stderr || ''}`;
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);

    const counts = countSuiteResults(output);

    if (res.error) {
      failedSuites++;
      const reason = (res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
        ? `superó el tiempo máximo de ${SUITE_TIMEOUT_MS / 60000} min`
        : res.error.message;
      console.error(`\n❌ Fallo en suite ${file}: ${reason}`);
      totalFailedCases += counts.failed;
      return;
    }

    if (res.status === 0) {
      totalPassed += counts.passed;
      if (counts.passed === 0) {
        console.log(`  ℹ️ Suite ${file} terminó bien pero no reportó casos con las marcas conocidas.`);
      }
    } else if (res.status === 2) {
      // Código de salida 2 indica suite OMITIDA (por falta de credenciales, navegador o emulador).
      // NUNCA se incrementa totalPassed.
      totalSkipped += Math.max(1, counts.skipped);
      console.log(`  ℹ️ Suite ${file} registrada como OMITIDA (skipped).`);
    } else {
      failedSuites++;
      totalFailedCases += counts.failed;
      console.error(`\n❌ Fallo en suite ${file} (código de salida: ${res.status})`);
    }
  });

  console.log('\n================================================================');
  console.log('                 RESUMEN GLOBAL DE VERIFICACIÓN                 ');
  console.log('================================================================');
  console.log(`  * Suites descubiertas:          ${files.length}`);
  console.log(`  * Pruebas PASADAS (passed):     ${totalPassed}`);
  console.log(`  * Pruebas FALLIDAS (failed):    ${totalFailedCases}`);
  console.log(`  * Pruebas OMITIDAS (skipped):   ${totalSkipped}`);
  console.log(`  * Suites FALLIDAS:              ${failedSuites}`);
  console.log('----------------------------------------------------------------');

  if (failedSuites > 0) {
    console.error('❌ ESTADO: FALLÓ la verificación global.');
    process.exit(1);
  } else {
    console.log('✅ ESTADO: TODAS las pruebas evaluadas pasaron exitosamente.');
    process.exit(0);
  }
}

// Solo ejecuta cuando se invoca directamente (permite importar los helpers desde los tests).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(TESTS_DIR, 'run_all_tests.ts');
if (invokedDirectly) {
  runAll();
}
