/**
 * tests/photoperiods.test.ts
 *
 * SUITE: FOTOPERIODOS Y SUPERCICLOS (src/utils/photoperiods.ts y PhotoperiodPresetPicker)
 *
 * 1. Presets de 24 h: 20/4 (vegetativo largo, para autoflorecientes) y 18/6; 13/11, 12/12 y 11/13 de floración.
 *    No existe 24/0: siempre hay oscuridad (máximo 20 h de luz).
 * 2. 13/11 es de floración: 13 h de luz y 11 de oscuridad, con una hora más de luz que el 12/12.
 * 3. Superciclos: 13/13 (26 h) y 14/14 (28 h), experimentales.
 * 4. Horas de oscuridad: las guardadas o las que completan 24 h.
 * 5. Descripción: nombre, duración del ciclo y porcentajes sobre la duración real.
 * 6. Sin enchufe inteligente los superciclos no se pueden usar; con enchufe, sí.
 * 7. Botones: elegir 13/11 devuelve 13 de luz y 11 de oscuridad; el elegido queda marcado.
 * 8. Botones: los superciclos se ven bloqueados, con "Experimental" y el aviso del enchufe Wi-Fi.
 * 9. Botones: con enchufe conectado, los superciclos se pueden elegir.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PHOTOPERIOD_PRESETS,
  STANDARD_PRESETS,
  SUPERCYCLE_PRESETS,
  canUseSupercycles,
  darkHoursFor,
  describePhotoperiod,
  findPhotoperiodPreset,
  MAX_LIGHT_HOURS,
  clampLightHours,
} from '../src/utils/photoperiods';
import { PhotoperiodPresetPicker } from '../src/components/cultivations/PhotoperiodPresetPicker';

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASÓ] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log('\n================================================================');
  console.log('   FOTOPERIODOS Y SUPERCICLOS');
  console.log('================================================================\n');

  await check('1. Presets de 24 h de vegetativo y floración', () => {
    const ids = STANDARD_PRESETS.map((p) => p.id);
    assert(ids.join(',') === '20-4,18-6,13-11,12-12,11-13', `presets: ${ids.join(',')}`);
    assert(STANDARD_PRESETS.every((p) => p.light + p.dark === 24), 'todos suman 24 h');
    const veg = STANDARD_PRESETS.filter((p) => p.phase === 'veg').map((p) => p.id);
    assert(veg.join(',') === '20-4,18-6', `vegetativo: ${veg.join(',')}`);
    const long = findPhotoperiodPreset(20, 4)!;
    assert(long.name === 'Vegetativo largo' && long.note === 'recomendado para autoflorecientes', `20/4: ${long.name} (${long.note})`);
    assert(STANDARD_PRESETS.every((p) => p.dark > 0), 'siempre hay oscuridad');
    assert(clampLightHours(24) === MAX_LIGHT_HOURS && MAX_LIGHT_HOURS === 20 && clampLightHours(-2) === 0, 'tope de horas de luz');
  });

  await check('2. 13/11 es de floración con una hora más de luz', () => {
    const p = findPhotoperiodPreset(13, 11)!;
    assert(p && p.phase === 'flower' && p.light === 13 && p.dark === 11, 'datos del 13/11');
    assert(p.name === 'Floración +1 h', `nombre: ${p.name}`);
    assert(/floración|florece/i.test(p.hint) && /peso/i.test(p.hint), `explicación: ${p.hint}`);
    assert(findPhotoperiodPreset(13) === p, 'sin oscuridad guardada, 13 h de luz es 13/11');
  });

  await check('3. Superciclos 13/13 (26 h) y 14/14 (28 h)', () => {
    assert(SUPERCYCLE_PRESETS.map((p) => p.id).join(',') === '13-13,14-14', 'ids');
    const s26 = describePhotoperiod(13, 13);
    const s28 = describePhotoperiod(14, 14);
    assert(s26.supercycle && s26.cycleHours === 26 && s26.name === 'Superciclo 26 h', JSON.stringify(s26));
    assert(s28.supercycle && s28.cycleHours === 28 && s28.name === 'Superciclo 28 h', JSON.stringify(s28));
    assert(PHOTOPERIOD_PRESETS.length === STANDARD_PRESETS.length + SUPERCYCLE_PRESETS.length, 'listas');
  });

  await check('4. Oscuridad guardada o la que completa 24 h', () => {
    assert(darkHoursFor(18) === 6 && darkHoursFor(13) === 11 && darkHoursFor(24) === 0, 'completa 24 h');
    assert(darkHoursFor(13, 13) === 13 && darkHoursFor(12, 0) === 0, 'respeta la guardada');
    assert(darkHoursFor(30) === 0 && darkHoursFor(NaN) === 24, 'valores raros');
  });

  await check('5. Nombre, duración y porcentajes sobre el ciclo real', () => {
    const f = describePhotoperiod(13, 11);
    assert(f.label === '13/11' && f.cycleHours === 24 && !f.supercycle, JSON.stringify(f));
    assert(f.lightPct === 54 && f.darkPct === 46, `porcentajes 13/11: ${f.lightPct}/${f.darkPct}`);
    const s = describePhotoperiod(13, 13);
    assert(s.lightPct === 50 && s.darkPct === 50, `superciclo sobre 26 h: ${s.lightPct}/${s.darkPct}`);
    assert(describePhotoperiod(16).name === null, '16/8 no tiene nombre');
    const odd = describePhotoperiod(15, 15);
    assert(odd.supercycle && odd.name === 'Superciclo 30 h', 'cualquier ciclo de más de 24 h es superciclo');
  });

  await check('6. Superciclos solo con enchufe inteligente', () => {
    assert(canUseSupercycles() === false, 'sin enchufe');
    assert(canUseSupercycles(true) === true, 'con enchufe');
  });

  const container = document.getElementById('root')!;
  const picks: string[] = [];
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(PhotoperiodPresetPicker, {
        light: 12,
        idPrefix: 'test',
        onSelect: (l: number, d: number) => picks.push(`${l}/${d}`),
      })
    );
  });

  await check('7. Elegir 13/11 devuelve 13 y 11; el elegido queda marcado', async () => {
    const btn = container.querySelector('#test-13-11') as HTMLButtonElement;
    assert(btn && btn.textContent?.includes('Floración +1 h'), btn?.textContent || 'falta el botón');
    await act(async () => btn.click());
    assert(picks.join(',') === '13/11', `elegidos: ${picks.join(',')}`);
    assert(container.querySelector('#test-12-12')?.getAttribute('aria-pressed') === 'true', '12/12 marcado');
    assert(!container.querySelector('#test-24-0'), 'no debe existir el 24/0');
    const long = container.querySelector('#test-20-4');
    assert(long?.textContent?.includes('Vegetativo largo') && long.textContent.includes('(recomendado para autoflorecientes)'), long?.textContent || 'falta el 20/4');
  });

  await check('8. Superciclos bloqueados, con "Experimental" y aviso del enchufe Wi-Fi', async () => {
    const box = container.querySelector('#test-supercycles');
    const text = box?.textContent || '';
    assert(text.includes('Experimental') && /enchufe inteligente Wi-Fi/.test(text), `texto: ${text}`);
    const s26 = container.querySelector('#test-13-13') as HTMLButtonElement;
    const s28 = container.querySelector('#test-14-14') as HTMLButtonElement;
    assert(s26?.disabled && s28?.disabled, 'deberían estar bloqueados');
    await act(async () => s26.click());
    assert(!picks.includes('13/13'), 'no se pudo elegir');
  });

  await act(async () => root.unmount());

  const root2 = createRoot(container);
  await act(async () => {
    root2.render(
      React.createElement(PhotoperiodPresetPicker, {
        light: 13,
        dark: 13,
        idPrefix: 'plug',
        hasSmartPlug: true,
        onSelect: (l: number, d: number) => picks.push(`${l}/${d}`),
      })
    );
  });

  await check('9. Con enchufe conectado los superciclos se pueden elegir', async () => {
    const s28 = container.querySelector('#plug-14-14') as HTMLButtonElement;
    assert(s28 && !s28.disabled, 'debería estar habilitado');
    assert(container.querySelector('#plug-13-13')?.getAttribute('aria-pressed') === 'true', '13/13 marcado');
    await act(async () => s28.click());
    assert(picks.includes('14/14'), `elegidos: ${picks.join(',')}`);
  });

  await act(async () => root2.unmount());

  console.log('\n================================================================');
  console.log(` RESULTADO FOTOPERIODOS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en photoperiods:', err);
  process.exit(1);
});
