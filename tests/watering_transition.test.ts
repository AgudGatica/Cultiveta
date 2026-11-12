/**
 * tests/watering_transition.test.ts
 *
 * SUITE: TRANSICIÓN DE AGUA AL REGISTRAR UN RIEGO
 *
 * 1. Los datos del respaldo vectorial (salen de Blender) respetan el guion: 48 cuadros a 24 por segundo,
 *    la paleta pedida, pantalla cubierta del cuadro 20 al 28 y nada a la vista en los cuadros 47 y 48.
 * 2. El dibujo en canvas: un cuadro vacío no dibuja nada, uno cubierto dibuja el agua, y ninguna forma es texto.
 * 3. El formulario de riego dispara la transición solo cuando el riego quedó anotado: no al abrirlo, ni si
 *    el guardado falla, ni al cancelar.
 * 4. La transición no captura toques, está oculta al lector de pantalla, no tiene texto y se desmonta sola.
 * 5. La confirmación es solo para lector de pantalla ("Riego registrado.") y App.tsx ya no muestra el cartel.
 */

import './helpers/setupDom';
import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WateringModal } from '../src/components/logs/WateringModal';
import { WateringTransition, drawWaterFrame, type WaterBake } from '../src/components/logs/WateringTransition';
import { useWateringTransition, WATERING_ANNOUNCEMENT, WATERING_TRANSITION_MS } from '../src/hooks/useWateringTransition';
import { wateringService } from '../src/services/wateringService';
import { fertilizationService } from '../src/services/fertilizationService';
import type { Cultivation, Watering } from '../src/types';

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ROOT = process.cwd();
const loadBake = (fmt: 'mobile' | 'desktop'): WaterBake =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'transiciones', `riego-${fmt}.bake.json`), 'utf8'));

/** Contexto de canvas de mentira: anota lo que se le pide dibujar. */
function fakeContext() {
  const calls = { fill: 0, fillText: 0, strokeText: 0, colors: new Set<string>(), minY: Infinity, maxY: -Infinity, clear: 0 };
  const track = (y: number) => {
    calls.minY = Math.min(calls.minY, y);
    calls.maxY = Math.max(calls.maxY, y);
  };
  const ctx: any = {
    fillStyle: '',
    setTransform() {},
    clearRect() {
      calls.clear++;
    },
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo: (_x: number, y: number) => track(y),
    lineTo: (_x: number, y: number) => track(y),
    quadraticCurveTo: (_cx: number, cy: number, _x: number, y: number) => {
      track(cy);
      track(y);
    },
    fill() {
      calls.fill++;
      calls.colors.add(String(ctx.fillStyle).toUpperCase());
    },
    fillText() {
      calls.fillText++;
    },
    strokeText() {
      calls.strokeText++;
    },
  };
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

const crop: Cultivation = {
  id: 'crop_riego_fx',
  userId: 'user_riego_fx',
  name: 'Cultivo de prueba',
  type: 'Indoor',
  plantCount: 2,
  startDate: '2026-10-01',
  currentStage: 'Floración',
  stageStartDate: '2026-10-20',
  floweringStartDate: '2026-10-20',
  substrate: { type: 'Turba / Perlita / Humus', potVolumeLiters: 11, potType: 'Geotextil' },
  status: 'ESTABLE',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
} as Cultivation;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Igual que App.tsx: el formulario real, y la transición conectada a su onWateringAdded. */
const Screen: React.FC<{ onState: (s: ReturnType<typeof useWateringTransition>) => void; onClose: () => void }> = ({ onState, onClose }) => {
  const fx = useWateringTransition();
  onState(fx);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('p', { id: 'watering-live-region', role: 'status', 'aria-live': 'polite', className: 'sr-only' }, fx.announcement),
    fx.playKey > 0 ? React.createElement(WateringTransition, { key: fx.playKey, mode: 'reduced', onDone: () => fx.finish(fx.playKey) }) : null,
    React.createElement(WateringModal, {
      isOpen: true,
      onClose,
      userId: crop.userId,
      cultivations: [crop],
      defaultCultivationId: crop.id,
      onWateringAdded: () => fx.play(),
    })
  );
};

async function run() {
  console.log('\n================================================================');
  console.log('   PRUEBAS: TRANSICIÓN DE AGUA AL REGISTRAR UN RIEGO');
  console.log('================================================================\n');

  const PALETA = ['#39C9E7', '#71E6F3', '#1887BD', '#DDFBFF', '#173B65'];

  for (const fmt of ['mobile', 'desktop'] as const) {
    const bake = loadBake(fmt);
    const [w, h] = fmt === 'mobile' ? [1080, 1920] : [1920, 1080];

    await check(`1.${fmt}. 48 cuadros a 24 por segundo, tamaño ${w}×${h} y la paleta pedida`, () => {
      assert(bake.frames === 48 && bake.fps === 24, `frames ${bake.frames}, fps ${bake.fps}`);
      assert((bake.frames / bake.fps) * 1000 === WATERING_TRANSITION_MS, 'no dura 2 segundos');
      assert(bake.w === w && bake.h === h, `tamaño ${bake.w}×${bake.h}`);
      assert(JSON.stringify(bake.pal.map((c) => c.toUpperCase())) === JSON.stringify(PALETA), `paleta ${bake.pal.join(',')}`);
      for (const layer of bake.layers) {
        if (layer.t !== 'b') assert(layer.f.length === 48, 'una tira no tiene 48 cuadros');
      }
      for (const track of bake.tracks) assert(track.length === 48, 'una figura no tiene 48 cuadros');
    });

    await check(`1.${fmt}. cuadros 47 y 48: no queda nada a la vista`, () => {
      for (const frame of [47, 48]) {
        const { ctx, calls } = fakeContext();
        const drawn = drawWaterFrame(ctx, bake, frame, w, h);
        assert(drawn === 0 && calls.fill === 0, `el cuadro ${frame} dibuja ${drawn} formas`);
      }
    });

    await check(`1.${fmt}. cuadros 20 a 28: el agua cubre toda la pantalla`, () => {
      const body = bake.layers.find((l) => l.t === 'y' && l.c === 0) as { f: Array<number[] | null> };
      const n = bake.x.length;
      assert(bake.x[0] <= 0 && bake.x[n - 1] >= w, 'el agua no llega a los costados');
      for (let frame = 20; frame <= 28; frame++) {
        const rows = body.f[frame - 1];
        assert(rows, `cuadro ${frame}: no hay agua`);
        const top = Math.max(...rows.slice(0, n));
        const bottom = Math.min(...rows.slice(n));
        assert(top <= 0 && bottom >= h, `cuadro ${frame}: cubre de ${top} a ${bottom} (alto ${h})`);
      }
    });

    await check(`1.${fmt}. cuadros 1 a 6: solo lluvia (entre 8 y 14 gotas), todavía sin ola`, () => {
      const body = bake.layers.find((l) => l.t === 'y' && l.c === 0) as { f: Array<number[] | null> };
      for (let frame = 1; frame <= 6; frame++) assert(body.f[frame - 1] === null, `cuadro ${frame}: ya hay ola`);
      // Hasta el cuadro 6 lo único que hay son gotas de lluvia (en el 7 ya asoma la ola con su espuma)
      const visibles = new Set<number>();
      bake.tracks.forEach((track, k) => {
        for (let frame = 1; frame <= 6; frame++) {
          const t = track[frame - 1];
          if (t && t[1] > 0 && t[1] < h) visibles.add(k);
        }
      });
      assert(visibles.size >= 8 && visibles.size <= 14, `gotas en pantalla: ${visibles.size}`);
    });

    await check(`2.${fmt}. el canvas dibuja solo formas de la paleta, nunca texto`, () => {
      for (const frame of [4, 12, 24, 36, 44]) {
        const { ctx, calls } = fakeContext();
        const drawn = drawWaterFrame(ctx, bake, frame, w, h);
        assert(drawn > 0 && calls.fill === drawn, `cuadro ${frame}: no dibujó`);
        assert(calls.fillText === 0 && calls.strokeText === 0, `cuadro ${frame}: dibujó texto`);
        for (const color of calls.colors) assert(PALETA.includes(color), `cuadro ${frame}: color fuera de la paleta ${color}`);
      }
    });
  }

  await check('2. el canvas se adapta a una pantalla de otra proporción cubriéndola entera', () => {
    const bake = loadBake('mobile');
    const { ctx, calls } = fakeContext();
    assert(drawWaterFrame(ctx, bake, 24, 780, 1900) > 0, 'no dibujó');
    assert(calls.minY <= 0 && calls.maxY >= bake.h, 'no cubre de arriba a abajo');
    assert(drawWaterFrame(ctx, bake, 0, 780, 1900) === 0 && drawWaterFrame(ctx, bake, 49, 780, 1900) === 0, 'dibuja fuera de los 48 cuadros');
  });

  // --- Formulario real + transición, conectados como en App.tsx ---
  const original = { add: wateringService.addWatering, sched: fertilizationService.getScheduleByCultivation };
  (fertilizationService as any).getScheduleByCultivation = async () => null;
  let saveMode: 'ok' | 'fail' = 'ok';
  let saves = 0;
  (wateringService as any).addWatering = async (data: Omit<Watering, 'id' | 'createdAt'>) => {
    if (saveMode === 'fail') throw new Error('Falla simulada');
    saves++;
    return { ...data, id: `w_${saves}`, createdAt: new Date().toISOString() } as Watering;
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let fx!: ReturnType<typeof useWateringTransition>;
  let closed = 0;
  const overlay = () => document.querySelector('[data-testid="watering-transition"]') as HTMLElement | null;
  const region = () => document.querySelector('#watering-live-region') as HTMLElement;
  const submit = async () => {
    await act(async () => {
      (container.querySelector('#save-watering-btn') as HTMLButtonElement).click();
      await sleep(30);
    });
  };

  await act(async () => {
    root.render(React.createElement(Screen, { onState: (s) => (fx = s), onClose: () => closed++ }));
    await sleep(20);
  });

  await check('3. abrir el formulario no dispara la transición', () => {
    assert(container.querySelector('#watering-modal-box'), 'no se montó el formulario');
    assert(!overlay() && fx.playKey === 0 && region().textContent === '', 'la transición arrancó sola');
  });

  await check('3. si faltan los litros no se guarda ni hay transición', async () => {
    await submit();
    assert(saves === 0 && !overlay() && fx.playKey === 0, 'se disparó sin datos');
    assert(container.querySelector('[role="alert"]'), 'no avisó qué falta');
  });

  await check('3. si el guardado falla: mensaje de error, sin transición y sin anuncio', async () => {
    saveMode = 'fail';
    await act(async () => setInputValue(container.querySelector('#watering-volume-input') as HTMLInputElement, '2.5'));
    // El formulario deja el error en la consola: acá es lo esperado
    const originalError = console.error;
    console.error = () => {};
    try {
      await submit();
    } finally {
      console.error = originalError;
    }
    assert(container.querySelector('[role="alert"]')?.textContent?.includes('Falla simulada'), 'no mostró el error');
    assert(!overlay() && fx.playKey === 0 && region().textContent === '' && closed === 0, 'hubo transición con error');
  });

  await check('3. cancelar no dispara la transición', async () => {
    const cancel = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar') as HTMLButtonElement;
    await act(async () => cancel.click());
    assert(closed === 1 && !overlay() && fx.playKey === 0, 'cancelar la disparó');
  });

  await check('3 y 4. con el riego anotado: una sola transición, sin texto, sin capturar toques', async () => {
    saveMode = 'ok';
    await act(async () => {
      (container.querySelector('#save-watering-btn') as HTMLButtonElement).click();
      await sleep(10);
    });
    assert(saves === 1, `guardados: ${saves}`);
    const el = overlay();
    assert(el, 'no apareció la transición');
    assert(document.querySelectorAll('[data-testid="watering-transition"]').length === 1, 'apareció más de una');
    assert(el.getAttribute('aria-hidden') === 'true', 'no está oculta al lector de pantalla');
    assert(/\bpointer-events-none\b/.test(el.className) && /\bfixed\b/.test(el.className) && /\binset-0\b/.test(el.className), `clases: ${el.className}`);
    assert((el.textContent || '') === '', 'la transición tiene texto');
    assert(!el.querySelector('button, a, input, img, svg'), 'la transición tiene botones, íconos o imágenes');
  });

  await check('5. la confirmación es solo para lector de pantalla', async () => {
    await act(async () => sleep(120));
    assert(region().textContent === WATERING_ANNOUNCEMENT, `anuncio: "${region().textContent}"`);
    assert(region().getAttribute('aria-live') === 'polite' && /\bsr-only\b/.test(region().className), 'la región no es accesible u oculta');
    const visible = Array.from(document.body.querySelectorAll('*')).filter(
      (n) => n !== region() && n.children.length === 0 && /riego registrado|felicidades/i.test(n.textContent || '')
    );
    assert(visible.length === 0, 'hay un texto de confirmación a la vista');
  });

  await check('4. se desmonta sola y el formulario se cerró', async () => {
    await act(async () => sleep(250));
    assert(!overlay() && fx.playKey === 0, 'la transición quedó montada');
    assert(closed === 2, 'el formulario no se cerró al guardar');
  });

  await check('4. si la animación no se pudiera mostrar, igual se da por terminada', async () => {
    const realSetTimeout = window.setTimeout;
    const pending: Array<{ fn: () => void; ms: number }> = [];
    (window as any).setTimeout = (fn: () => void, ms: number) => {
      pending.push({ fn, ms });
      return pending.length;
    };
    try {
      await act(async () => fx.play());
      const safety = pending.find((p) => p.ms === WATERING_TRANSITION_MS + 2500);
      assert(safety, 'no hay un límite de tiempo');
      await act(async () => safety.fn());
      assert(fx.playKey === 0, 'quedó "reproduciendo" para siempre');
    } finally {
      (window as any).setTimeout = realSetTimeout;
    }
  });

  await act(async () => root.unmount());
  container.remove();
  wateringService.addWatering = original.add;
  fertilizationService.getScheduleByCultivation = original.sched;

  await check('5. App.tsx: el riego registrado dispara la transición y ya no muestra el cartel de éxito', () => {
    const app = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
    assert(!/Riego registrado con éxito/.test(app), 'sigue el cartel "Riego registrado con éxito"');
    const start = app.indexOf('<WateringModal');
    const block = app.slice(start, app.indexOf('</LazyModal>', start));
    assert(/onWateringAdded=\{\(w\) => \{[\s\S]*wateringFx\.play\(\);/.test(block), 'onWateringAdded no dispara la transición');
    assert(!/showToast\(/.test(block), 'onWateringAdded sigue mostrando un cartel');
    assert(/id="watering-live-region"[^>]*aria-live="polite"[^>]*className="sr-only"/.test(app), 'falta la región para lector de pantalla');
    assert(/<WateringTransition key=\{wateringFx\.playKey\}/.test(app), 'la transición no está montada en la app');
    // Los demás avisos de la app no se tocaron
    assert(/No se pudo guardar en tu cuenta/.test(app) && /Medición ambiental registrada/.test(app), 'se perdieron otros avisos');
  });

  console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('❌ [FALLÓ] error inesperado en la suite:', err);
  process.exit(1);
});
