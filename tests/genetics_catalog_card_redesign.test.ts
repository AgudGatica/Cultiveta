import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

globalThis.window = dom.window as any;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.localStorage = dom.window.localStorage as any;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GeneticsLibraryView } from '../src/components/genetics/GeneticsLibraryView';
import { GENETICS_DATABASE } from '../src/data/predefinedGenetics';
import { favoritesService, getGeneticsKey } from '../src/services/favoritesService';
import { geneticsCatalogPhotoService, getGeneticsPhotoKey } from '../src/services/geneticsCatalogPhotoService';
import { authService } from '../src/services/authService';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASSED: ${desc}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAILED: ${desc}`);
  }
}

export async function runGeneticsCatalogCardRedesignTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS: REVERSIÓN DE TARJETAS AL ESTADO ORIGINAL (SIN DEGRADÉ)');
  console.log('================================================================\n');

  // Configurar auth / token mock
  const origGetIdToken = authService.getIdToken;
  authService.getIdToken = async () => 'test-token-catalog-revert';

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/admin/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ isAdmin: false, isCreator: false }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }) as any;

  // Inyectar foto oficial de prueba para Skunk #1 (Sensi Seeds)
  const testPhotoKey = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
  const dummyCatalogPhotos = {
    [testPhotoKey]: {
      key: testPhotoKey,
      seedBank: 'Sensi Seeds',
      name: 'Skunk #1',
      photoUrl: 'https://images.unsplash.com/photo-skunk1-catalog.jpg',
      storagePath: 'genetics/reference/skunk1.jpg',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'official-source',
    },
  };

  const origSubscribeCatalog = geneticsCatalogPhotoService.subscribeCatalogPhotos;
  geneticsCatalogPhotoService.subscribeCatalogPhotos = (callback: any) => {
    callback(dummyCatalogPhotos);
    return () => {};
  };

  let startCropCalls: any[] = [];
  const handleStartCrop = (converted: any) => {
    startCropCalls.push(converted);
  };

  const container = document.getElementById('root')!;
  container.innerHTML = '';
  const root = createRoot(container);

  // Render inicial
  await act(async () => {
    root.render(
      React.createElement(GeneticsLibraryView, {
        userId: 'user-catalog-test',
        geneticsList: [],
        harvests: [],
        onStartCropWithGenetics: handleStartCrop,
        onGeneticsUpdated: () => {},
      })
    );
  });

  // Tomamos la primera tarjeta del catálogo renderizada (Skunk #1)
  const catalogGrid = container.querySelector('.grid.grid-cols-1');
  assert(catalogGrid !== null, 'Catalogo montado en DOM');

  const skunk1NameEl = Array.from(container.querySelectorAll('h3')).find(
    (el) => el.textContent?.trim() === 'Skunk #1'
  );
  assert(skunk1NameEl !== undefined, '1. Nombre "Skunk #1" aparece en su posición original');

  const cardEl = skunk1NameEl?.closest('.bg-white.rounded-3xl') as HTMLElement;
  assert(cardEl !== null, 'Tarjeta contenedora identificada');

  // 1. Foto limpia, sin degradé negro ni overlay oscuro
  const photoContainer = cardEl.querySelector('.relative.w-full.h-44');
  assert(photoContainer !== null, 'Foto en contenedor original h-44');

  const darkGradient = photoContainer?.querySelector('.bg-gradient-to-b');
  assert(darkGradient === null, '1b. Cero degradé negro o sombra encima de la foto (foto limpia y natural)');

  // 2. Badge de derechos sobre la foto presente como en el diseño original
  const rightsBadge = photoContainer?.querySelector('.absolute.top-2\\.5.left-2\\.5');
  assert(rightsBadge !== null, '2. Badge oficial original sobre la foto conservado');

  // 3. Título y banco en cuerpo de tarjeta
  const bankEl = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.trim() === 'Sensi Seeds'
  );
  assert(bankEl !== undefined, '3. Banco "Sensi Seeds" visible en el cuerpo de la tarjeta');

  // 4. Botón de guardado a biblioteca Bookmark en la esquina superior del título
  const bookmarkBtn = cardEl.querySelector('button[title*="biblioteca"]');
  assert(bookmarkBtn !== null, '4. Botón Bookmark original conservado');

  // 5. Badges originales de dominancia, días de floración y rendimiento
  const domBadge = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes('Híbrida')
  );
  assert(domBadge !== undefined, '5. Badge de dominancia original presente');

  const flowBadge = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes('45 - 50 d')
  );
  assert(flowBadge !== undefined, '6. Badge de floración original presente');

  const yieldBadge = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes('500 - 600 g/m²')
  );
  assert(yieldBadge !== undefined, '7. Badge de rendimiento original presente');

  // 6. Sección de Aroma y Gusto original
  const aromaText = cardEl.querySelector('p.italic');
  assert(aromaText !== null && aromaText.textContent?.includes('Skunk acre'), '8. Aroma y gusto original presente');

  // 7. Botón "Iniciar Cultivo con Skunk #1"
  const startCropBtn = Array.from(cardEl.querySelectorAll('button')).find(
    (btn) => btn.textContent?.includes('Iniciar Cultivo con Skunk #1')
  );
  assert(startCropBtn !== undefined, '9. Botón original "Iniciar Cultivo con Skunk #1" presente');

  // 8. Botón "Guardar en Mi Biblioteca" inferior original
  const saveLibraryBtn = Array.from(cardEl.querySelectorAll('button')).find(
    (btn) => btn.textContent?.includes('Guardar en Mi Biblioteca')
  );
  assert(saveLibraryBtn !== undefined, '10. Botón inferior "Guardar en Mi Biblioteca" presente');

  // 9. Click en Iniciar Cultivo
  await act(async () => {
    startCropBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert(startCropCalls.length === 1 && startCropCalls[0].name === 'Skunk #1', '11. Click en Iniciar Cultivo funciona');

  // 10. Genética sin foto renderiza correctamente
  const allCards = container.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2 .bg-white.rounded-3xl');
  assert(allCards.length > 1, '12. Catálogo renderiza todas las variedades');

  // 11. Tabs y filtros funcionan normalmente
  const tabSavedBtn = document.getElementById('tab-saved-btn');
  assert(tabSavedBtn !== null, '13. Tab Mis Genéticas Guardadas existe');

  await act(async () => {
    root.unmount();
  });

  // Restaurar mocks
  authService.getIdToken = origGetIdToken;
  globalThis.fetch = origFetch;
  geneticsCatalogPhotoService.subscribeCatalogPhotos = origSubscribeCatalog;

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL PASSED:  ${passedCount}`);
  console.log(`TOTAL FAILED:  ${failedCount}`);
  console.log('----------------------------------------------------------------\n');

  return { passed: passedCount, failed: failedCount, skipped: 0 };
}

if (process.argv[1]?.endsWith('genetics_catalog_card_redesign.test.ts')) {
  runGeneticsCatalogCardRedesignTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
