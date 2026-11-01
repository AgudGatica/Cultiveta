/**
 * tests/scroll_top.test.ts
 *
 * SUITE: CADA PANTALLA ARRANCA ARRIBA DE TODO (src/hooks/useScrollTopOnNavigate.ts)
 *
 *  1. Al entrar, al pasar a otra pestaña y al volver con "atrás", la página sube arriba de todo.
 *  2. El navegador no restaura el scroll viejo al volver (scrollRestoration manual).
 *  3. Si no cambia la pantalla (mismo camino), no se mueve.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router';
import { useScrollTopOnNavigate } from '../src/hooks/useScrollTopOnNavigate';

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

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const scrolls: unknown[] = [];
window.scrollTo = ((...args: unknown[]) => {
  scrolls.push(args[0]);
}) as typeof window.scrollTo;

// jsdom no trae history.scrollRestoration: se agrega como en un navegador ('auto' de entrada)
Object.defineProperty(window.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true });

let go: ((to: string | number) => void) | null = null;

function Screen() {
  useScrollTopOnNavigate();
  const navigate = useNavigate();
  go = (to) => (typeof to === 'number' ? navigate(to) : navigate(to));
  return null;
}

async function run() {
  console.log('\n🧪 Cada pantalla arranca arriba de todo\n');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(Screen)));
  });

  await check('1. Al entrar, al cambiar de pestaña y al volver, sube arriba de todo', async () => {
    assert(scrolls.length === 1, `al entrar: ${scrolls.length}`);
    await act(async () => go!('/cultivos'));
    assert(scrolls.length === 2, `al pasar a Cultivos: ${scrolls.length}`);
    await act(async () => go!(-1));
    assert(scrolls.length === 3, `al volver con "atrás": ${scrolls.length}`);
    const last = scrolls[scrolls.length - 1] as { top?: number };
    assert(last && last.top === 0, JSON.stringify(last));
  });

  await check('2. El navegador no restaura el scroll viejo', () => {
    assert(window.history.scrollRestoration === 'manual', String(window.history.scrollRestoration));
  });

  await check('3. Si no cambia la pantalla, no se mueve', async () => {
    const before = scrolls.length;
    await act(async () => go!('/'));
    assert(scrolls.length === before, `se movió sin cambiar de pantalla: ${scrolls.length - before}`);
  });

  await act(async () => root.unmount());

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
