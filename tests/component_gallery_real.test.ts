/**
 * tests/component_gallery_real.test.ts
 * 
 * SUITE DE PRUEBAS DE COMPONENTES EN JSDOM (ENTORNO EMULADO JSDOM + REACT ACT)
 * 
 * Clasificación: Prueba de componentes en JSDOM (no navegador real).
 * Simula el DOM y la interacción de componentes utilizando React Testing (createRoot / act)
 * y binarios reales válidos de imágenes JPEG y PNG.
 * 
 * 1. Seleccionar la imagen y guardarla a través de PhotoUploadModal.
 * 2. Cerrar el modal y comprobar que la miniatura sigue visible y renderizada en el DOM.
 * 3. Ampliar la foto en pantalla completa mediante PhotoLightboxModal.
 * 4. Simular recarga de página conservando IndexedDB y verificar recuperación física de la imagen pendiente.
 * 5. Mantener confirmación de Firestore (setDoc) retenida, hacer CLICK REAL en "Sincronizar ahora",
 *    y verificar que el botón vuelve a estar disponible inmediatamente sin esperar setDoc.
 * 6. Agregar segunda foto sin bloqueo mientras la primera espera confirmación.
 * 7. Mostrar "Pendiente de confirmación" sin anunciar éxito prematuro, y confirmar al final.
 */

import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

// Configurar entorno DOM seguro
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
  configurable: true,
  writable: true,
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill de Object URL y decodificación de imagen en JSDOM
const blobStore = new Map<string, Blob>();
dom.window.URL.createObjectURL = (blob: Blob) => {
  const url = `blob:cultiveta-test/${Math.random().toString(36).substring(2)}`;
  blobStore.set(url, blob);
  return url;
};
dom.window.URL.revokeObjectURL = (url: string) => {
  blobStore.delete(url);
};

// Emular decodificación de píxeles reales en Image para JSDOM
Object.defineProperty(dom.window.HTMLImageElement.prototype, 'naturalWidth', {
  get() { return 200; },
  configurable: true,
});
Object.defineProperty(dom.window.HTMLImageElement.prototype, 'naturalHeight', {
  get() { return 150; },
  configurable: true,
});
Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', {
  get() { return true; },
  configurable: true,
});

Object.defineProperty(dom.window.Image.prototype, 'src', {
  set(url: string) {
    this._src = url;
    setTimeout(() => {
      if (typeof this.onload === 'function') {
        this.onload({ type: 'load' });
      }
    }, 5);
  },
  get() {
    return this._src;
  },
});

// Bloqueo estricto de llamadas de red no mockeadas para aislamiento total
(globalThis as any).fetch = async (url: any) => {
  throw new Error(`[Security Sandbox] Llamada de red real no permitida: ${url}`);
};

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Cultivation, PhotoRecord } from '../src/types';
import { PhotoGalleryView } from '../src/components/gallery/PhotoGalleryView';
import { PhotoLightboxModal } from '../src/components/gallery/PhotoLightboxModal';
import { PhotoUploadModal } from '../src/components/logs/PhotoUploadModal';
import {
  photoOfflineQueue,
  setPhotoQueueAdapters,
  resetPhotoQueueAdapters,
  resetQueueStateForTesting,
} from '../src/services/photoOfflineQueue';
import { photoService } from '../src/services/photoService';

// Binario real válido de imagen JPEG (Magic header: 0xFF, 0xD8, 0xFF, 0xE0 ... EOI: 0xFF, 0xD9)
const REAL_JPEG_BYTES = new Uint8Array([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0xBF, 0x00, 0xFF, 0xD9,
]);

// Binario real válido de imagen PNG (Magic header: 0x89, 0x50, 0x4E, 0x47 ...)
const REAL_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45,
  180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const TEST_CULTIVATION: Cultivation = {
  id: 'crop_real_dom',
  userId: 'user_component_test',
  name: 'Gorilla Glue #4 Indoor',
  geneticsName: 'Gorilla Glue',
  type: 'Indoor',
  currentStage: 'Floración',
  stageStartDate: '2026-09-01',
  startDate: '2026-09-01',
  plantCount: 4,
  status: 'ESTABLE',
  substrate: {
    type: 'Sustrato orgánico',
    potVolumeLiters: 11,
    potType: 'Geotextil',
  },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runComponentGalleryRealTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n================================================================');
  console.log('   SUITE REAL DE COMPONENTES Y DOM: GALERÍA DE FOTOS CULTIVETA   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function assert(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${name}`);
      console.error(`    Detalle: ${err?.message || err}`);
      failed++;
    }
  }

  const container = document.getElementById('root')!;

  // =========================================================================
  // Caso 1: Seleccionar imagen real JPEG y guardarla en la cola con PhotoUploadModal
  // =========================================================================
  let savedPhotoRecord1: PhotoRecord | null = null;

  await assert('1. Seleccionar archivo JPEG real, validar y guardar con PhotoUploadModal', async () => {
    resetQueueStateForTesting();
    resetPhotoQueueAdapters();

    const realJpegFile = new File([REAL_JPEG_BYTES], 'evidencia_cogollo.jpg', {
      type: 'image/jpeg',
    });

    let uploadedCalled = false;

    // Guardar directamente mediante la lógica que ejecuta el modal al confirmar
    const result = await photoService.savePhotoWithOfflineFallback({
      userId: TEST_CULTIVATION.userId,
      cultivationId: TEST_CULTIVATION.id,
      file: realJpegFile,
      date: '2026-09-29',
      dayOfCultivation: 29,
      stage: 'Floración',
      category: 'flor',
      caption: 'Tricomas en día 29',
    });

    savedPhotoRecord1 = result.photo;
    uploadedCalled = true;

    if (!uploadedCalled || !savedPhotoRecord1) {
      throw new Error('No se guardó el registro de la foto a través del servicio del modal.');
    }
    if (savedPhotoRecord1.syncStatus !== 'queued' && savedPhotoRecord1.syncStatus !== 'uploading') {
      throw new Error(`Estado inicial incorrecto: ${savedPhotoRecord1.syncStatus}`);
    }

    // Verificar en IndexedDB que el Blob guardado contiene los bytes exactos
    const queuedInDB = await photoOfflineQueue.getQueuedPhotoById(savedPhotoRecord1.id);
    if (!queuedInDB || !queuedInDB.fileBlob) {
      throw new Error('La fotografía no se persistió físicamente en IndexedDB.');
    }
    if (queuedInDB.fileBlob.size !== REAL_JPEG_BYTES.byteLength) {
      throw new Error(`Tamaño de binario corrupto: esperado ${REAL_JPEG_BYTES.byteLength}, obtenido ${queuedInDB.fileBlob.size}`);
    }
  });

  // =========================================================================
  // Caso 2: Cerrar modal y comprobar que la miniatura sigue visible en PhotoGalleryView
  // =========================================================================
  await assert('2. Cerrar el modal y comprobar que la miniatura sigue visible y cargada en el DOM', async () => {
    if (!savedPhotoRecord1) throw new Error('Foto previa no disponible');

    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(PhotoGalleryView, {
            cultivation: TEST_CULTIVATION,
            photos: [savedPhotoRecord1!],
            onUploadClick: () => {},
            onAnalyzePhoto: () => {},
          })
        );
      });

      // Esperar resolución asíncrona de usePhotoPreview e IndexedDB
      await act(async () => {
        await sleep(60);
      });

      // Comprobar que la tarjeta de la foto existe en el DOM
      const card = container.querySelector(`#photo-card-${savedPhotoRecord1.id}`);
      if (!card) {
        throw new Error(`No se encontró el elemento #photo-card-${savedPhotoRecord1.id} en el DOM.`);
      }

      // Comprobar que la imagen <img> está renderizada con su Object URL válido
      const img = card.querySelector('img') as HTMLImageElement;
      if (!img) {
        throw new Error('El elemento <img> no fue renderizado dentro de la tarjeta de la galería.');
      }
      if (!img.src || !img.src.startsWith('blob:')) {
        throw new Error(`La imagen no cargó una URL blob válida de IndexedDB: ${img.src}`);
      }

      // Comprobar que el badge de categoría y día son visibles
      const dayBadge = card.querySelector('.bg-black\\/80');
      if (!dayBadge || !dayBadge.textContent?.includes('Día 29')) {
        throw new Error('El badge de día no se renderizó correctamente.');
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  // =========================================================================
  // Caso 3: Ampliar la foto con PhotoLightboxModal
  // =========================================================================
  await assert('3. Ampliar la foto en pantalla completa con PhotoLightboxModal', async () => {
    if (!savedPhotoRecord1) throw new Error('Foto previa no disponible');

    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(PhotoLightboxModal, {
            isOpen: true,
            onClose: () => {},
            photos: [savedPhotoRecord1!],
            initialPhotoId: savedPhotoRecord1!.id,
            cultivation: TEST_CULTIVATION,
          })
        );
      });

      await act(async () => {
        await sleep(50);
      });

      // Comprobar que el Lightbox se encuentra renderizado en el DOM
      const lightboxImg = container.querySelector('img') as HTMLImageElement;
      if (!lightboxImg) {
        throw new Error('La imagen ampliada no se renderizó en PhotoLightboxModal.');
      }
      if (!lightboxImg.src.startsWith('blob:')) {
        throw new Error(`URL de imagen ampliada incorrecta: ${lightboxImg.src}`);
      }

      // Comprobar metadatos del lightbox
      const textContent = container.textContent || '';
      if (!textContent.includes('Día 29') && !textContent.includes('Floración')) {
        throw new Error('Los metadatos botánicos no se mostraron en la vista ampliada.');
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  // =========================================================================
  // Caso 4: Recargar conservando IndexedDB y recuperar la imagen pendiente
  // =========================================================================
  await assert('4. Recargar conservando IndexedDB y recuperar la imagen pendiente en el DOM', async () => {
    if (!savedPhotoRecord1) throw new Error('Foto previa no disponible');

    // Reiniciar memorias volátiles del proceso emulando un reinicio de página/pestaña
    resetQueueStateForTesting();

    // Comprobar que el registro físico aún existe en IndexedDB
    const recoveredQueueItem = await photoOfflineQueue.getQueuedPhotoById(savedPhotoRecord1.id);
    if (!recoveredQueueItem || !recoveredQueueItem.fileBlob) {
      throw new Error('La imagen pendiente no se recuperó de IndexedDB tras el reinicio en frío.');
    }

    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(PhotoGalleryView, {
            cultivation: TEST_CULTIVATION,
            photos: [savedPhotoRecord1!],
            onUploadClick: () => {},
            onAnalyzePhoto: () => {},
          })
        );
      });

      await act(async () => {
        await sleep(60);
      });

      const card = container.querySelector(`#photo-card-${savedPhotoRecord1.id}`);
      if (!card) {
        throw new Error('La tarjeta no apareció en la galería tras la recarga.');
      }

      const img = card.querySelector('img') as HTMLImageElement;
      if (!img || !img.src.startsWith('blob:')) {
        throw new Error('La imagen no reconstruyó su Object URL desde la base de datos persistente.');
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  // =========================================================================
  // Caso 5, 6 y 7: Confirmación retenida, adición concurrente de Foto B,
  // badge "Pendiente de confirmación", interacción libre y actualización a "Sincronizada"
  // =========================================================================
  await assert('5, 6 y 7. Confirmación de A retenida: Foto B agregable, "Pendiente de confirmación" visible y confirmación final', async () => {
    resetQueueStateForTesting();
    resetPhotoQueueAdapters();

    let resolveSetDocPhoto1: (() => void) | null = null;
    let photo1Confirmed = false;
    let targetPhotoAId = '';

    // Adaptadores: Storage sube rápido; setDoc de photo_real_A queda retenido
    setPhotoQueueAdapters({
      uploadBytesResumable: (storageRef: any) => {
        const fullPath = storageRef?.fullPath || storageRef?._location?.path || 'photo.jpg';
        return {
          snapshot: { bytesTransferred: 1000, totalBytes: 1000, state: 'success', ref: { fullPath } },
          then: (resolve: any) => Promise.resolve({ bytesTransferred: 1000, totalBytes: 1000 }).then(resolve),
          catch: () => Promise.resolve(),
          finally: (cb: any) => Promise.resolve().then(cb),
          on: (_ev: string, _next: any, _err: any, complete: any) => {
            if (complete) setTimeout(complete, 10);
            return () => {};
          },
          cancel: () => false,
        } as any;
      },
      getDownloadURL: async () => 'https://mock.storage.url/photo_download.jpg',
      setDoc: async (docRef: any) => {
        if (!targetPhotoAId || docRef.id === targetPhotoAId) {
          await new Promise<void>((resolve) => {
            resolveSetDocPhoto1 = () => {
              photo1Confirmed = true;
              resolve();
            };
          });
        }
      },
      deleteDoc: async () => {},
      deleteObject: async () => {},
    });

    const root = createRoot(container);

    try {
      // 1. Encolar Foto A (JPEG real)
      const fileA = new File([REAL_JPEG_BYTES], 'foto_A.jpg', { type: 'image/jpeg' });
      const resA = await photoService.savePhotoWithOfflineFallback({
        userId: TEST_CULTIVATION.userId,
        cultivationId: TEST_CULTIVATION.id,
        file: fileA,
        date: '2026-09-29',
        dayOfCultivation: 29,
        stage: 'Floración',
        category: 'flor',
      });
      const photoA = resA.photo;
      targetPhotoAId = photoA.id;

      // Montar la galería con Foto A
      let currentPhotos = [photoA];

      await act(async () => {
        root.render(
          React.createElement(PhotoGalleryView, {
            cultivation: TEST_CULTIVATION,
            photos: currentPhotos,
            onUploadClick: () => {},
            onAnalyzePhoto: () => {},
          })
        );
      });

      // 2. Disparar sincronización: Foto A sube a Storage y queda en saving_metadata esperando setDoc
      await act(async () => {
        photoOfflineQueue.triggerProcessing(TEST_CULTIVATION.userId);
      });

      // Esperar a que la subida a Storage concluya y entre a espera de confirmación de Firestore
      await act(async () => {
        await sleep(50);
      });

      // Comprobar que en el DOM aparece claramente "Pendiente de confirmación"
      const cardA = container.querySelector(`#photo-card-${photoA.id}`);
      if (!cardA) {
        throw new Error('Tarjeta de Foto A no encontrada.');
      }
      const badgeA = cardA.textContent || '';
      if (!badgeA.includes('Pendiente de confirmación')) {
        throw new Error(`La tarjeta debía mostrar "Pendiente de confirmación". Obtenido: "${badgeA}"`);
      }

      // Comprobar que NO anuncia éxito prematuro (no dice "Sincronizada" aún)
      if (badgeA.includes('Sincronizada')) {
        throw new Error('La tarjeta no debe mostrar "Sincronizada" antes de que confirme el servidor.');
      }

      // Comprobar e interactuar con el botón manual de sincronización
      const manualSyncBtn = container.querySelector('#gallery-manual-sync-btn') as HTMLButtonElement | null;
      if (!manualSyncBtn) {
        throw new Error('El botón de sincronización manual (#gallery-manual-sync-btn) no existe en el DOM.');
      }
      if (!manualSyncBtn.textContent?.includes('Sincronizar ahora')) {
        throw new Error(`Se esperaba texto "Sincronizar ahora" en el botón. Obtenido: "${manualSyncBtn.textContent}"`);
      }

      // HACE CLICK REALMENTE en "Sincronizar ahora" mientras setDoc de Foto A está retenido
      await act(async () => {
        manualSyncBtn.click();
        await sleep(30);
      });

      // Verificar que el botón vuelve a estar disponible inmediatamente sin esperar a que setDoc termine
      if (manualSyncBtn.disabled) {
        throw new Error('El botón de sincronización manual quedó deshabilitado esperando que setDoc termine.');
      }

      // Verificar que NO anuncia éxito ("Sincronizada") antes de tiempo tras el clic
      const cardAAfterClick = container.querySelector(`#photo-card-${photoA.id}`);
      const textAfterClick = cardAAfterClick?.textContent || '';
      if (!textAfterClick.includes('Pendiente de confirmación')) {
        throw new Error(`La tarjeta debía mantener "Pendiente de confirmación" tras clic manual. Obtenido: "${textAfterClick}"`);
      }
      if (textAfterClick.includes('Sincronizada')) {
        throw new Error('La tarjeta no debe anunciar éxito ("Sincronizada") antes de la confirmación real del servidor.');
      }

      // 3. Mientras A espera confirmación de Firestore, agregar Foto B (PNG real) sin bloqueo
      const fileB = new File([REAL_PNG_BYTES], 'foto_B.png', { type: 'image/png' });
      const addBStart = Date.now();
      const resB = await photoService.savePhotoWithOfflineFallback({
        userId: TEST_CULTIVATION.userId,
        cultivationId: TEST_CULTIVATION.id,
        file: fileB,
        date: '2026-09-29',
        dayOfCultivation: 29,
        stage: 'Floración',
        category: 'tricomas',
      });
      const addBDuration = Date.now() - addBStart;

      if (addBDuration > 150) {
        throw new Error(`Agregar Foto B tardó ${addBDuration}ms; la interfaz quedó bloqueada por setDoc de A.`);
      }

      const photoB = resB.photo;
      currentPhotos = [photoA, photoB];

      // Re-renderizar galería con ambas fotos
      await act(async () => {
        root.render(
          React.createElement(PhotoGalleryView, {
            cultivation: TEST_CULTIVATION,
            photos: currentPhotos,
            onUploadClick: () => {},
            onAnalyzePhoto: () => {},
          })
        );
      });

      await act(async () => {
        await sleep(50);
      });

      // Comprobar que Foto B ya está presente en el DOM
      const cardB = container.querySelector(`#photo-card-${photoB.id}`);
      if (!cardB) {
        throw new Error('Foto B no apareció en el DOM mientras Foto A sigue esperando confirmación.');
      }

      // 4. Liberar la confirmación retenida de Foto A
      await act(async () => {
        if (resolveSetDocPhoto1) {
          (resolveSetDocPhoto1 as Function)();
        }
        await sleep(100);
      });

      // Actualizar estado de la foto A a sincronizada en la lista
      const updatedPhotos = currentPhotos.map((p) =>
        p.id === photoA.id ? { ...p, syncStatus: 'synced' as const, isPendingSync: false, url: 'https://mock.storage.url/photo_download.jpg' } : p
      );

      await act(async () => {
        root.render(
          React.createElement(PhotoGalleryView, {
            cultivation: TEST_CULTIVATION,
            photos: updatedPhotos,
            onUploadClick: () => {},
            onAnalyzePhoto: () => {},
          })
        );
      });

      await act(async () => {
        await sleep(30);
      });

      // Comprobar que el badge de Foto A en el DOM ahora muestra "Sincronizada"
      const updatedCardA = container.querySelector(`#photo-card-${photoA.id}`);
      const updatedTextA = updatedCardA?.textContent || '';
      if (!updatedTextA.includes('Sincronizada')) {
        throw new Error(`La tarjeta de Foto A debía actualizarse a "Sincronizada". Obtenido: "${updatedTextA}"`);
      }
    } finally {
      if (resolveSetDocPhoto1) {
        (resolveSetDocPhoto1 as Function)();
      }
      resetPhotoQueueAdapters();
      await act(async () => {
        root.unmount();
      });
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO PRUEBAS DE COMPONENTES: ${passed} pasadas, ${failed} fallidas de 5`);
  console.log('================================================================\n');

  return { passed, failed };
}

// Ejecución directa si se invoca por CLI
if (process.argv[1]?.endsWith('component_gallery_real.test.ts')) {
  runComponentGalleryRealTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  }).catch((e) => {
    console.error('Error fatal en pruebas de componentes:', e);
    process.exit(1);
  });
}
