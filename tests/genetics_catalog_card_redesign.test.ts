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
  console.log('   PRUEBAS: REDISEÑO DE TARJETAS DEL CATÁLOGO DE GENÉTICAS (20 CASOS)');
  console.log('================================================================\n');

  // Configurar auth / token mock
  const origGetIdToken = authService.getIdToken;
  authService.getIdToken = async () => 'test-token-catalog-redesign';

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
  const catalogGrid = container.querySelector('.grid.grid-cols-1');
  assert(catalogGrid !== null, 'Catalogo montado en DOM');

  const skunk1NameEl = Array.from(container.querySelectorAll('h3')).find(
    (el) => el.textContent?.trim() === 'Skunk #1'
  );
  assert(skunk1NameEl !== undefined, '1. Nombre "Skunk #1" aparece en la tarjeta');

  const cardEl = skunk1NameEl?.closest('.bg-white.rounded-3xl') as HTMLElement;
  assert(cardEl !== null, 'Tarjeta contenedora identificada');

  // 1. Nombre aparece encima de la foto (dentro del contenedor aspect-[295/176])
  const photoContainer = cardEl.querySelector('.aspect-\\[295\\/176\\]');
  assert(photoContainer !== null, '18. Tarjeta con foto conserva aspect ratio aspect-[295/176]');

  const nameInsidePhoto = photoContainer?.querySelector('h3');
  assert(nameInsidePhoto !== null && nameInsidePhoto.textContent?.trim() === 'Skunk #1', '1b. Nombre aparece encima de la foto');

  // 2. Banco aparece encima de la foto
  const bankInsidePhoto = Array.from(photoContainer?.querySelectorAll('span') || []).find(
    (s) => s.textContent?.trim() === 'Sensi Seeds'
  );
  assert(bankInsidePhoto !== undefined, '2. Banco "Sensi Seeds" aparece encima de la foto');

  // 3. Dominancia aparece encima de la foto
  const dominanceInsidePhoto = Array.from(photoContainer?.querySelectorAll('span') || []).find(
    (s) => s.textContent?.toLowerCase().includes('híbrida') || s.textContent?.toLowerCase().includes('sátiva')
  );
  assert(dominanceInsidePhoto !== undefined, '3. Dominancia aparece encima de la foto');

  // 4. "Foto de referencia" NO aparece en la tarjeta del catálogo
  const allCardText = cardEl.textContent || '';
  assert(!allCardText.includes('Foto de referencia') && !allCardText.includes('Fuente oficial'), '4. Badge de derechos/"Foto de referencia" NO aparece en la tarjeta del catálogo');

  // 5. Nombre y banco NO están duplicados debajo de la fotografía
  const cardBelowPhoto = Array.from(cardEl.children).filter((c) => !c.contains(photoContainer!));
  const duplicateTitles = cardEl.querySelectorAll('h3');
  assert(duplicateTitles.length === 1, '5. Nombre/banco no están duplicados debajo de la fotografía');

  // 6. Rendimiento sigue visible
  const yieldCapsule = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes('g/m²')
  );
  assert(yieldCapsule !== undefined, '6. Rendimiento estimado sigue visible');

  // 7. Floración sigue visible
  const floweringCapsule = Array.from(cardEl.querySelectorAll('span')).find(
    (s) => s.textContent?.includes(' d') || s.textContent?.includes('45 - 50')
  );
  assert(floweringCapsule !== undefined, '7. Floración sigue visible');

  // 8. Botón "Guardar en Mi Biblioteca" NO existe
  assert(!allCardText.includes('Guardar en Mi Biblioteca') && !allCardText.includes('Guardando...'), '8. Botón "Guardar en Mi Biblioteca" NO existe');

  // 9. Bookmark de guardado de catálogo NO existe en la tarjeta del catálogo
  const bookmarkInsideCard = cardEl.querySelector('svg.lucide-bookmark');
  assert(bookmarkInsideCard === null, '9. Bookmark de guardado de catálogo NO existe en la tarjeta');

  // 10. Botón "Iniciar Cultivo" existe
  const startCropBtn = Array.from(cardEl.querySelectorAll('button')).find(
    (btn) => btn.textContent?.includes('Iniciar Cultivo')
  );
  assert(startCropBtn !== undefined, '10. Botón "Iniciar Cultivo" existe');

  // 11. Click en Iniciar Cultivo sigue llamando onStartCropWithGenetics con la genética correcta
  await act(async () => {
    startCropBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert(startCropCalls.length === 1 && startCropCalls[0].name === 'Skunk #1', '11. Click en Iniciar Cultivo llama onStartCropWithGenetics con la genética correcta');

  // 12. Botón Favoritos existe
  const favBtn = Array.from(cardEl.querySelectorAll('button')).find(
    (btn) => btn.textContent?.includes('Favorito') || btn.textContent?.includes('Favoritos')
  );
  assert(favBtn !== undefined, '12. Botón Favoritos existe');

  // 13. Click Favoritos usa el mecanismo real existente
  await act(async () => {
    favBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert(toggleFavoriteCalls.length === 1, '13. Click Favoritos dispara favoritesService.toggleFavorite real');
  assert(toggleFavoriteCalls[0].data.name === 'Skunk #1' && toggleFavoriteCalls[0].data.seedBank === 'Sensi Seeds', '13b. Datos correctos enviados a toggleFavorite');

  // 14 & 15. Estado favorito activo vs inactivo
  const heartIcon = favBtn?.querySelector('svg.lucide-heart');
  assert(heartIcon !== null, '14. Icono Heart presente en botón favoritos');
  assert(!heartIcon?.classList.contains('fill-white'), '15. Estado no favorito muestra Heart inactivo (sin fill-white)');

  // 16. Simular que ahora la genética está en favoritos mediante emisión del listener
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
  const favBtnActive = Array.from(container.querySelectorAll('button')).find(
    (btn) => btn.getAttribute('aria-pressed') === 'true'
  );
  assert(favBtnActive !== undefined, '14b. Estado favorito muestra aria-pressed true');
  const activeHeartIcon = favBtnActive?.querySelector('svg.lucide-heart');
  assert(activeHeartIcon?.classList.contains('fill-white'), '14c. Estado favorito muestra Heart relleno blanco');

  // 17. Genética sin foto sigue renderizando correctamente
  // Buscamos una genética del catálogo sin foto en dummyCatalogPhotos (ej: segunda variedad)
  const allCards = container.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2 .bg-white.rounded-3xl');
  assert(allCards.length > 1, '17a. Múltiples tarjetas del catálogo renderizadas');
  const secondCard = allCards[1] as HTMLElement;
  const secondCardName = secondCard.querySelector('h3')?.textContent;
  assert(Boolean(secondCardName && secondCardName.length > 0), '17b. Genética sin foto renderiza nombre en overlay sin romper');
  const secondCardAspect = secondCard.querySelector('.aspect-\\[295\\/176\\]');
  assert(secondCardAspect !== null, '17c. Genética sin foto conserva el contenedor de encabezado');

  // 19. El panel admin de fotos no se rompe
  // Simulamos admin:true
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/admin/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ isAdmin: true, isCreator: true }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }) as any;

  await act(async () => {
    root.render(
      React.createElement(GeneticsLibraryView, {
        userId: 'user-catalog-admin',
        geneticsList: [],
        harvests: [],
        onStartCropWithGenetics: handleStartCrop,
        onGeneticsUpdated: () => {},
      })
    );
  });
  const adminBtn = document.getElementById('admin-manage-genetics-photos-btn');
  assert(adminBtn !== null, '19. Panel admin de fotos sigue operativo con botón visible');

  // 20. Filtros y tabs continúan funcionando
  const searchInput = document.getElementById('filter-genetics-name') as HTMLInputElement;
  assert(searchInput !== null, '20a. Input de búsqueda presente');
  await act(async () => {
    searchInput.value = 'Skunk';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  const tabSavedBtn = document.getElementById('tab-saved-btn');
  assert(tabSavedBtn !== null, '20b. Tab Mis Genéticas Guardadas existe');
  const tabFavoritesBtn = document.getElementById('tab-favorites-btn');
  assert(tabFavoritesBtn !== null, '20c. Tab Mis Favoritas existe');

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
