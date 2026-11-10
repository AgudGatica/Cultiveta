/**
 * Foto por defecto de las genéticas sin foto real:
 *  1. Sin foto: la foto por defecto.
 *  2. Si la foto no carga: la foto por defecto; si esa tampoco: el ícono.
 */
import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GeneticPhoto, GENETIC_PLACEHOLDER } from '../src/components/genetics/GeneticPhoto';

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
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
const mount = async (el: React.ReactElement) => {
  const div = document.createElement('div');
  const root = createRoot(div);
  await act(async () => root.render(el));
  return { div, unmount: () => act(async () => root.unmount()) };
};
const fail = async (img: Element | null) => {
  await act(async () => {
    img!.dispatchEvent(new window.Event('error'));
  });
};

async function run() {
  console.log('\n   FOTO POR DEFECTO DE LAS GENÉTICAS\n');
  const icon = React.createElement('i', { id: 'icono' });

  await check('1. Sin foto: la foto por defecto', async () => {
    const m = await mount(React.createElement(GeneticPhoto, { src: null, fallback: icon }));
    const img = m.div.querySelector('img');
    assert(img?.getAttribute('src') === GENETIC_PLACEHOLDER && img.getAttribute('data-placeholder') === 'true', 'muestra la foto por defecto');
    await m.unmount();
  });

  await check('2. Foto que no carga: la de por defecto; si tampoco carga, el ícono', async () => {
    const m = await mount(React.createElement(GeneticPhoto, { src: 'https://ejemplo.test/rota.jpg', fallback: icon }));
    assert(m.div.querySelector('img')?.getAttribute('src') === 'https://ejemplo.test/rota.jpg', 'primero la real');
    await fail(m.div.querySelector('img'));
    assert(m.div.querySelector('img')?.getAttribute('src') === GENETIC_PLACEHOLDER, 'después la de por defecto');
    await fail(m.div.querySelector('img'));
    assert(!m.div.querySelector('img') && m.div.querySelector('#icono'), 'y si falta, el ícono');
    await m.unmount();
  });

  console.log(`\n RESULTADO FOTO POR DEFECTO: ${passed} pasadas, ${failed} fallidas de ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en genetic_placeholder:', err);
  process.exit(1);
});
