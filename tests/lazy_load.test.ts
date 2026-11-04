/**
 * tests/lazy_load.test.ts
 *
 * SUITE: CARGA DIFERIDA (modales y pantallas que se bajan aparte para que la app abra más rápido).
 *
 * 1. Un modal diferido muestra "Cargando…" mientras se baja y después el modal.
 * 2. Si no se pudo bajar (sin conexión o una versión vieja de la app): aviso con "Cerrar" y
 *    "Volver a cargar", y el resto de la app sigue andando (no queda la pantalla en blanco).
 * 3. Un modal que queda montado cerrado no muestra nada mientras se baja ni si falló.
 * 4. Una pantalla que no se pudo abrir se vuelve a intentar al cambiar de pantalla.
 * 5. useOpenedOnce: el modal se monta recién al abrirlo y después queda montado.
 * 6. preloadWhenIdle: baja en segundo plano después de un rato (con requestIdleCallback si existe),
 *    no lo intenta sin conexión, se cancela al salir y una descarga fallida no rompe nada.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyBoundary, LazyModal, lazyNamed, preloadWhenIdle, useOpenedOnce } from '../src/components/common/LazyLoad';

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
const flush = () => act(async () => sleep(0));

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    render: (next: React.ReactElement) => act(async () => root.render(next)),
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** React avisa por consola cada error que atrapa un LazyBoundary: en estos casos es lo esperado. */
async function withoutReactErrorLog(fn: () => Promise<void>) {
  const original = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = original;
  }
}

type Mod<K extends string> = Record<K, React.FC>;
function deferredModule<K extends string>() {
  let resolve!: (m: Mod<K>) => void;
  const load = () => new Promise<Mod<K>>((r) => (resolve = r));
  return { load, resolve: (m: Mod<K>) => resolve(m) };
}
const failingModule = <K extends string>() => () => Promise.reject(new Error('Failed to fetch dynamically imported module')) as Promise<Mod<K>>;

async function run() {
  console.log('\n================================================================');
  console.log('   CARGA DIFERIDA (MODALES Y PANTALLAS APARTE)');
  console.log('================================================================\n');

  await check('1. Modal diferido: "Cargando…" mientras se baja y después el modal', async () => {
    const mod = deferredModule<'Riego'>();
    const Riego = lazyNamed(mod.load, 'Riego');
    const m = await mount(React.createElement(LazyModal, { onClose: () => {}, children: React.createElement(Riego) }));
    assert(/Cargando/.test(m.container.textContent || ''), `dice Cargando: "${m.container.textContent}"`);
    await act(async () => mod.resolve({ Riego: () => React.createElement('p', { id: 'riego' }, 'Registrar riego') }));
    await flush();
    assert(m.container.querySelector('#riego'), `se ve el modal: "${m.container.textContent}"`);
    assert(!/Cargando/.test(m.container.textContent || ''), 'ya no dice Cargando');
    await m.unmount();
  });

  await check('2. Si no se pudo bajar: aviso con Cerrar y Volver a cargar, y el resto sigue andando', () =>
    withoutReactErrorLog(async () => {
      const Roto = lazyNamed(failingModule<'Roto'>(), 'Roto');
      let closed = 0;
      const m = await mount(
        React.createElement(
          'div',
          null,
          React.createElement('p', { id: 'jardin' }, 'Jardín'),
          React.createElement(LazyModal, { onClose: () => closed++, children: React.createElement(Roto) })
        )
      );
      await flush();
      const text = m.container.textContent || '';
      assert(m.container.querySelector('#jardin'), 'el Jardín sigue en pantalla');
      assert(/No se pudo abrir/.test(text), `avisa: "${text}"`);
      const buttons = [...m.container.querySelectorAll('button')];
      assert(buttons.some((b) => /Volver a cargar/.test(b.textContent || '')), 'ofrece volver a cargar');
      const close = buttons.find((b) => /Cerrar/.test(b.textContent || ''));
      assert(close, 'tiene Cerrar');
      await act(async () => {
        close.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });
      assert(closed === 1, `Cerrar cierra el modal (${closed})`);
      await m.unmount();
    })
  );

  await check('3. Modal montado cerrado: no muestra nada mientras se baja ni si falló', () =>
    withoutReactErrorLog(async () => {
      const mod = deferredModule<'Cuenta'>();
      const Cuenta = lazyNamed(mod.load, 'Cuenta');
      const a = await mount(React.createElement(LazyModal, { open: false, onClose: () => {}, children: React.createElement(Cuenta) }));
      assert(a.container.textContent === '', `nada mientras se baja: "${a.container.textContent}"`);
      await act(async () => mod.resolve({ Cuenta: () => null }));
      await flush();
      assert(a.container.textContent === '', 'cerrado sigue sin mostrar nada');
      await a.unmount();

      const Roto = lazyNamed(failingModule<'Roto'>(), 'Roto');
      const b = await mount(React.createElement(LazyModal, { open: false, onClose: () => {}, children: React.createElement(Roto) }));
      await flush();
      assert(b.container.textContent === '', `cerrado no avisa del error: "${b.container.textContent}"`);
      await b.render(React.createElement(LazyModal, { open: true, onClose: () => {}, children: React.createElement(Roto) }));
      assert(/No se pudo abrir/.test(b.container.textContent || ''), 'al abrirlo, avisa');
      await b.unmount();
    })
  );

  await check('4. Pantalla que no se pudo abrir: al cambiar de pantalla se vuelve a intentar', () =>
    withoutReactErrorLog(async () => {
      const Detalle = lazyNamed(failingModule<'Detalle'>(), 'Detalle');
      const view = (path: string, child: React.ReactElement) =>
        React.createElement(LazyBoundary, {
          resetKey: path,
          fallback: React.createElement('p', { id: 'error' }, 'No se pudo abrir esta pantalla.'),
          children: React.createElement(React.Suspense, { fallback: null }, child),
        });
      const m = await mount(view('/cultivos/1', React.createElement(Detalle)));
      await flush();
      assert(m.container.querySelector('#error'), `avisa en esa pantalla: "${m.container.textContent}"`);
      await m.render(view('/', React.createElement('p', { id: 'jardin' }, 'Jardín')));
      assert(m.container.querySelector('#jardin') && !m.container.querySelector('#error'), `el Jardín se ve bien: "${m.container.textContent}"`);
      await m.unmount();
    })
  );

  await check('5. useOpenedOnce: se monta al abrir y queda montado al cerrar', async () => {
    const seen: boolean[] = [];
    const Probe: React.FC<{ open: boolean }> = ({ open }) => {
      seen.push(useOpenedOnce(open));
      return null;
    };
    const m = await mount(React.createElement(Probe, { open: false }));
    assert(seen[seen.length - 1] === false, 'antes de abrir: no se monta');
    await m.render(React.createElement(Probe, { open: true }));
    assert(seen[seen.length - 1] === true, 'al abrir: se monta');
    await m.render(React.createElement(Probe, { open: false }));
    assert(seen[seen.length - 1] === true, 'al cerrar: sigue montado');
    await m.unmount();
  });

  await check('6. preloadWhenIdle: baja después de un rato, no intenta sin conexión y se cancela al salir', async () => {
    const calls: string[] = [];
    const loader = (name: string) => () => {
      calls.push(name);
      return Promise.resolve();
    };
    const failing = () => {
      calls.push('falla');
      return Promise.reject(new Error('sin red'));
    };
    const w = window as any;
    const originalIdle = w.requestIdleCallback;
    const originalCancelIdle = w.cancelIdleCallback;

    // Sin requestIdleCallback (Safari): baja al pasar el tiempo; una descarga fallida no rompe nada
    delete w.requestIdleCallback;
    const stop1 = preloadWhenIdle([loader('riego'), failing], 5);
    assert(calls.length === 0, 'no baja enseguida');
    await sleep(40);
    assert(calls.join(',') === 'riego,falla', `bajó todo: ${calls.join(',')}`);
    stop1();

    // Saliendo antes de tiempo (por ejemplo, se cierra la sesión) no baja nada
    calls.length = 0;
    preloadWhenIdle([loader('foto')], 5)();
    await sleep(40);
    assert(calls.length === 0, `cancelado: ${calls.join(',')}`);

    // Sin conexión no lo intenta (el navegador recordaría la descarga fallida)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      const stop3 = preloadWhenIdle([loader('nota')], 5);
      await sleep(40);
      stop3();
      assert(calls.length === 0, `sin conexión no baja: ${calls.join(',')}`);
    } finally {
      delete (navigator as any).onLine;
    }

    // Con requestIdleCallback espera a que el celular esté libre, y se cancela si se sale antes
    let idleRequests = 0;
    const cancelled: number[] = [];
    w.requestIdleCallback = (cb: () => void) => {
      idleRequests++;
      return setTimeout(cb, 0) as unknown as number;
    };
    w.cancelIdleCallback = (id: number) => {
      cancelled.push(id);
      clearTimeout(id as any);
    };
    try {
      const stop4 = preloadWhenIdle([loader('ambiente')], 5);
      await sleep(40);
      stop4();
      assert(idleRequests === 1 && calls.join(',') === 'ambiente', `usa requestIdleCallback: ${idleRequests} ${calls.join(',')}`);
      assert(cancelled.length === 1, 'al salir cancela el pedido pendiente');
    } finally {
      if (originalIdle) w.requestIdleCallback = originalIdle;
      else delete w.requestIdleCallback;
      if (originalCancelIdle) w.cancelIdleCallback = originalCancelIdle;
      else delete w.cancelIdleCallback;
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO CARGA DIFERIDA: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en lazy_load:', err);
  process.exit(1);
});
