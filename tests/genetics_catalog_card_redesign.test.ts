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
  console.log('   PRUEBAS: TARJETA MOBILE GRANDE DE GENÉTICAS (SIN DEGRADÉ NEGRO)');
  console.log('================================================================\n');

  // Configurar auth / token mock
  const origGetIdToken = authService.getIdToken;
  authService.getIdToken = async () => 'test-token-catalog-mobile';

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

  let toggleFavoriteCalls: any[] = [];
  const origToggleFavorite = favoritesService.toggleFavorite;
  favoritesService.toggleFavorite = async (userId, isCurrentlyFav, data): Promise<boolean> => {
    toggleFavoriteCalls.push({ userId, isCurrentlyFav, data });
    return !isCurrentlyFav;
  };

  const origSubscribeFavorites = favoritesService.subscribeFavorites;
  let currentFavs: any[] = [];
  let favListeners: Array<(favs: any[]) => void> = [];
  favoritesService.subscribeFavorites = (userId: string, callback: any) => {
    favListeners.push(callback);
    callback(currentFavs);
    return () => {
      favListeners = favListeners.filter((l) => l !== callback);
    };
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
  const cardEl = container.querySelector('article') as HTMLElement;
  assert(cardEl !== null, 'Tarjeta mobile de genética montada en DOM');

  // 1. Nombre de la genética sobre la foto (reducido a text-[18px])
  const skunk1NameEl = cardEl.querySelector('h2');
  assert(skunk1NameEl !== null && skunk1NameEl.textContent?.trim() === 'Skunk #1', '1a. Nombre "Skunk #1" aparece como h2');
  assert(skunk1NameEl?.classList.contains('text-[18px]'), '1b. Nombre reducido a text-[18px]');

  // 1c. Banco reducido (text-xs)
  const bankBadge = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.trim() === 'Sensi Seeds'
  );
  assert(bankBadge !== undefined && bankBadge.classList.contains('text-xs'), '1c. Banco reducido a text-xs');

  // 1d. Dominancia reducida (text-xs)
  const domBadge = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes('Híbrida')
  );
  assert(domBadge !== undefined && domBadge.classList.contains('text-xs'), '1d. Dominancia reducida a text-xs');

  // 2. Foto grande con zoom hover group-hover:scale-[1.04]
  const photoContainer = Array.from(cardEl.querySelectorAll('div')).find((d) => d.className.includes('aspect-[295/176]'));
  assert(photoContainer !== null, '2a. Contenedor de fotografía con aspect-[295/176] presente');
  assert(photoContainer?.classList.contains('group'), '2b. Contenedor tiene clase group para hover zoom');
  const imgEl = photoContainer?.querySelector('img');
  assert(imgEl !== null, '2c. Imagen renderizada con object-cover');
  assert(imgEl?.classList.contains('group-hover:scale-[1.04]'), '2d. Imagen tiene efecto de hover zoom group-hover:scale-[1.04]');

  // 4 & 5. Rendimiento y Floración en violeta con texto e iconos en blanco
  const violetPills = Array.from(cardEl.querySelectorAll('.bg-violet-600'));
  assert(violetPills.length === 2, '4a. Exactamente 2 pills con fondo violeta (bg-violet-600)');
  assert(violetPills.every((p) => p.classList.contains('text-white')), '4b. Pills de rendimiento y floración con texto en blanco (text-white)');
  const whiteIcons = Array.from(cardEl.querySelectorAll('.bg-violet-600 svg.text-white'));
  assert(whiteIcons.length === 2, '4c. Iconos Scale y Clock con color blanco (text-white)');
  // 7. Bloque AROMA Y GUSTO
  const aromaHeader = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.trim() === 'AROMA Y GUSTO'
  );
  assert(aromaHeader !== undefined, '7a. Encabezado "AROMA Y GUSTO" presente');

  const aromaText = cardEl.querySelector('p.italic');
  assert(aromaText !== null && aromaText.textContent?.includes('Skunk acre'), '7b. Perfil organoléptico real renderizado');

  // 8. Únicamente DOS botones inferiores: "Iniciar Cultivo" y "FAVORITOS"
  const allButtons = Array.from(cardEl.querySelectorAll('button'));
  assert(allButtons.length === 2, '8a. Exactamente 2 botones en la tarjeta');

  const startCropBtn = allButtons.find((b) => b.textContent?.includes('Iniciar Cultivo'));
  assert(startCropBtn !== undefined, '8b. Botón "Iniciar Cultivo" presente');

  const favBtn = allButtons.find((b) => b.textContent?.includes('FAVORITOS'));
  assert(favBtn !== undefined, '8c. Botón "FAVORITOS" presente con corazón');

  // 9. NO deben existir botones eliminados
  const cardText = cardEl.textContent || '';
  assert(!cardText.includes('Ver detalles'), '9a. "Ver detalles" no se renderiza en la tarjeta');
  assert(!cardText.includes('Comparar'), '9b. "Comparar" no se renderiza en la tarjeta');
  assert(!cardText.includes('THC'), '9c. "THC" no se renderiza en la tarjeta');
  assert(!cardText.includes('CBD'), '9d. "CBD" no se renderiza en la tarjeta');
  assert(!cardText.includes('Guardar en Mi Biblioteca'), '9e. "Guardar en Mi Biblioteca" no se renderiza');
  assert(cardEl.querySelector('svg.lucide-bookmark') === null, '9f. Bookmark no se renderiza');

  // 10. Click en "Iniciar Cultivo" dispara onStartCropWithGenetics
  await act(async () => {
    startCropBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert(startCropCalls.length === 1 && startCropCalls[0].name === 'Skunk #1', '10. Click en Iniciar Cultivo llama onStartCropWithGenetics con la genética real');

  // 11. Click en FAVORITOS dispara toggleFavorite
  await act(async () => {
    favBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert(toggleFavoriteCalls.length === 1, '11. Click en FAVORITOS dispara favoritesService.toggleFavorite');

  // 12. Reacción al estado de favorito
  currentFavs = [
    {
      geneticsKey: getGeneticsKey('Skunk #1', 'Sensi Seeds'),
      name: 'Skunk #1',
      seedBank: 'Sensi Seeds',
    },
  ];
  await act(async () => {
    favListeners.forEach((l) => l(currentFavs));
  });
  const heartIcon = favBtn?.querySelector('svg.lucide-heart');
  assert(heartIcon !== null && heartIcon.classList.contains('fill-white'), '12. Estado activo de favorito muestra corazón blanco relleno');

  // 13. Tarjeta responsive centrada
  const catalogContainer = container.querySelector('.max-w-\\[570px\\]');
  assert(catalogContainer !== null, '13. Contenedor centrado max-w-[570px] mobile-first');

  await act(async () => {
    root.unmount();
  });

  // Restaurar mocks
  authService.getIdToken = origGetIdToken;
  globalThis.fetch = origFetch;
  geneticsCatalogPhotoService.subscribeCatalogPhotos = origSubscribeCatalog;
  favoritesService.toggleFavorite = origToggleFavorite;
  favoritesService.subscribeFavorites = origSubscribeFavorites;

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
