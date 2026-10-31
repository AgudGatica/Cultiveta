/**
 * tests/devices_view.test.ts
 *
 * SUITE: EQUIPOS (pantalla traída de Órbita) y sus accesos.
 *
 * 1. Ruta: /equipos abre Equipos y Equipos vuelve a /equipos.
 * 2. Sin equipos: lo dice, muestra las tres marcas como "Próximamente" y la guía de Qué comprar.
 * 3. Llegando desde el ambiente: se resalta el sensor y Qué comprar muestra sensores.
 * 4. Los enlaces de compra son búsquedas de Mercado Libre Argentina que se abren aparte.
 * 5. El menú "Más" del celular tiene Equipos.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseAppRoute, pathForView } from '../src/appRoutes';
import { DevicesView } from '../src/components/devices/DevicesView';
import { MobileNav } from '../src/components/common/MobileNav';
import { mercadoLibreUrl, SHOP_ITEMS } from '../src/data/deviceCatalog';
import { devicesService } from '../src/services/devicesService';

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

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}

async function run() {
  console.log('\n================================================================');
  console.log('   EQUIPOS (ENCHUFES, SENSORES Y RIEGO)');
  console.log('================================================================\n');

  await check('1. /equipos abre Equipos y Equipos vuelve a /equipos', () => {
    assert(parseAppRoute('/equipos').view === 'devices', 'ruta');
    assert(pathForView('devices') === '/equipos', 'camino');
  });

  await check('2. Sin equipos: lo dice, Smart Life se conecta, eWeLink y Shelly "Próximamente", y Qué comprar', async () => {
    const { container, unmount } = await mount(React.createElement(DevicesView, {}));
    assert(/no conectaste ningún equipo/.test(container.querySelector('#devices-mine')?.textContent || ''), 'aviso de que no hay equipos');
    const tuya = container.querySelector('#device-brand-tuya');
    assert(tuya && !/Próximamente/i.test(tuya.textContent || ''), 'Smart Life ya no está en "Próximamente"');
    for (const id of ['ewelink', 'shelly']) {
      const card = container.querySelector(`#device-brand-${id}`);
      assert(card && /Próximamente/i.test(card.textContent || ''), `marca ${id}`);
      assert((card!.querySelector('button') as HTMLButtonElement).disabled, `${id}: todavía no se conecta`);
    }
    assert(container.querySelectorAll('.shop-item').length === SHOP_ITEMS.length, 'todos los equipos para comprar');
    await unmount();
  });

  await check('3. Desde el ambiente: se resalta el sensor y se ven sensores para comprar', async () => {
    const { container, unmount } = await mount(React.createElement(DevicesView, { focus: 'ambiente' }));
    assert(container.querySelector('#device-use-ambiente')?.className.includes('ring-2'), 'resaltado');
    const names = [...container.querySelectorAll('.shop-item')].map((x) => x.textContent || '');
    assert(names.length === SHOP_ITEMS.filter((i) => i.section === 'sensores').length, `solo sensores: ${names.length}`);
    await unmount();
  });

  await check('4. Los enlaces de compra van a Mercado Libre Argentina y se abren aparte', async () => {
    assert(mercadoLibreUrl('Enchufe inteligente  wifi') === 'https://listado.mercadolibre.com.ar/enchufe-inteligente-wifi', mercadoLibreUrl('Enchufe inteligente  wifi'));
    const { container, unmount } = await mount(React.createElement(DevicesView, {}));
    const links = [...container.querySelectorAll('#devices-shop a')] as HTMLAnchorElement[];
    assert(links.length > 0 && links.every((a) => a.href.startsWith('https://listado.mercadolibre.com.ar/') && a.target === '_blank' && a.rel.includes('noopener')), 'enlaces');
    await unmount();
  });

  await check('5. El menú "Más" del celular tiene Equipos', async () => {
    const visited: string[] = [];
    const { container, unmount } = await mount(
      React.createElement(MobileNav, { currentView: 'dashboard', onNavigate: (v: string) => visited.push(v), onOpenQuickAction: () => {} })
    );
    const more = [...container.querySelectorAll('button')].find((b) => /Más/.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => more.click());
    const item = [...container.querySelectorAll('button')].find((b) => /Equipos/.test(b.textContent || '')) as HTMLButtonElement;
    assert(item, 'falta Equipos en Más');
    await act(async () => item.click());
    assert(visited.includes('devices'), `navegó a ${visited.join(',')}`);
    await unmount();
  });

  await check('6. Si el servidor no tiene la parte de equipos (responde una página), la app no se rompe', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    try {
      const o = await devicesService.refreshOverview();
      assert(Array.isArray(o.bindings) && o.connected === false, `estado: ${JSON.stringify(o)}`);
    } finally {
      (globalThis as any).fetch = realFetch;
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO EQUIPOS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en devices_view:', err);
  process.exit(1);
});
