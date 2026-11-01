/**
 * tests/devices_view.test.ts
 *
 * SUITE: EQUIPOS (pantalla traída de Órbita) y sus accesos.
 *
 * 1. Ruta: /equipos abre Equipos y Equipos vuelve a /equipos.
 * 2. Sin equipos: lo dice, las tres marcas (Smart Life, eWeLink y Shelly) se conectan y está la guía de Qué comprar.
 * 3. Llegando desde el ambiente: se resalta el sensor y Qué comprar muestra sensores.
 * 4. Los enlaces de compra son búsquedas de Mercado Libre Argentina que se abren aparte.
 * 5. El menú "Más" del celular tiene Equipos.
 * 7. Marcas: Smart Life con sus pasos, eWeLink sin la app de Cultiveta solo con el de prueba y Shelly con
 *    server y clave; con equipos de varias marcas, cada uno dice de cuál es.
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

  await check('2. Sin equipos: lo dice, las tres marcas se conectan y está Qué comprar', async () => {
    const { container, unmount } = await mount(React.createElement(DevicesView, {}));
    assert(/no conectaste ningún equipo/.test(container.querySelector('#devices-mine')?.textContent || ''), 'aviso de que no hay equipos');
    assert(!/Próximamente/i.test(container.querySelector('#devices-connect')?.textContent || ''), 'ninguna marca en "Próximamente"');
    for (const id of ['tuya', 'ewelink', 'shelly']) {
      const card = container.querySelector(`#device-brand-${id}`);
      assert(card && card.querySelector(`#${id}-open`), `marca ${id} con su botón Conectar`);
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

  await check('7. Marcas: Smart Life con sus pasos, eWeLink sin la app solo de prueba, Shelly con server y clave', async () => {
    const realFetch = globalThis.fetch;
    const status = (ewelinkConnected: boolean) => ({
      tuya: { connected: false, mock: false, region: null, accessId: '' },
      ewelink: { connected: ewelinkConnected, mock: ewelinkConnected, region: ewelinkConnected ? 'us' : null, available: false },
      shelly: { connected: false, mock: false, server: null, ids: [] },
      regions: { us: 'Western America' },
    });
    let connected = false;
    (globalThis as any).fetch = async (url: string) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      const body =
        path === '/api/devices/status'
          ? status(connected)
          : path === '/api/devices'
            ? { devices: [{ id: 'ewelink-1000a1b2c3', vendor: 'ewelink', name: 'Sonoff Basic', product: 'BASICR2', category: 'cz', online: true, channels: [{ code: 'switch_1', label: 'Toma 1', on: false, hasCountdown: true, binding: null }], sensors: null, sensorBindings: [], power: null }], errors: {} }
            : { connected: false, mock: false, bindings: [] };
      return { ok: true, status: 200, json: async () => body };
    };
    const flush = async () => {
      for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    };
    const click = async (el: Element | null) => {
      assert(el, 'botón');
      await act(async () => (el as HTMLButtonElement).click());
    };
    try {
      // sin marcas conectadas
      let m = await mount(React.createElement(DevicesView, { cultivations: [] }));
      await flush();
      await click(m.container.querySelector('#tuya-open'));
      assert(m.container.querySelector('#tuya-access-id') && /iot\.tuya\.com/.test(m.container.querySelector('#device-brand-tuya')?.textContent || ''), 'Smart Life con sus pasos');
      await click(m.container.querySelector('#ewelink-open'));
      const ew = m.container.querySelector('#device-brand-ewelink')?.textContent || '';
      assert(/todavía no está habilitado/.test(ew) && !m.container.querySelector('#ewelink-login') && m.container.querySelector('#ewelink-mock'), `eWeLink sin la app: ${ew}`);
      await click(m.container.querySelector('#shelly-open'));
      assert(m.container.querySelector('#shelly-server') && m.container.querySelector('#shelly-key') && m.container.querySelector('#shelly-ids'), 'Shelly: server, clave y Device Ids');
      await m.unmount();
      // con eWeLink conectado: su tarjeta lo dice y cada equipo dice de qué marca es
      connected = true;
      m = await mount(React.createElement(DevicesView, { cultivations: [] }));
      await flush();
      const card = m.container.querySelector('#device-brand-ewelink')?.textContent || '';
      assert(/Conectado · Sonoff de prueba/.test(card) && m.container.querySelector('#ewelink-disconnect'), `eWeLink conectado: ${card}`);
      const dev = m.container.querySelector('.smart-device')?.textContent || '';
      assert(/eWeLink · BASICR2/.test(dev) && /Toma 1/.test(dev), `equipo con su marca: ${dev}`);
      await m.unmount();
    } finally {
      (globalThis as any).fetch = realFetch;
      devicesService.reset();
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
