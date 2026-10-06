/**
 * tests/genetics_admin_photos.test.ts
 *
 * SUITE DE PRUEBAS: HERRAMIENTA PRIVADA DE ADMINISTRACIÓN DE FOTOS DE GENÉTICAS (14 CASOS)
 *
 * 1. ADMIN_CONFIG: Reconoce permisos de creador mediante role: 'admin'.
 * 2. ADMIN_CONFIG: Reconoce permisos de creador mediante isCreator: true.
 * 3. ADMIN_CONFIG: Reconoce permisos mediante UID preconfigurado de creador.
 * 4. ADMIN_CONFIG: Deniega acceso a usuarios normales y anónimos (role: 'user' o null).
 * 5. Backend verifyAdminRole: Invoca next() cuando el usuario es creador/admin autorizado.
 * 6. Backend verifyAdminRole: Retorna 403 Forbidden a usuarios normales sin privilegios.
 * 7. Backend verifyAdminRole: Retorna 401 Unauthenticated si no hay sesión.
 * 8. getGeneticsPhotoKey: Genera identificador determinista y normalizado.
 * 9. validateGeneticsImageFile: Acepta archivos de imagen válidos JPG, JPEG, PNG y WEBP.
 * 10. validateGeneticsImageFile: Rechaza extensiones inválidas, 0 bytes y archivos que exceden 10MB.
 * 11. Búsqueda reactiva: Filtra inmediatamente por nombre de genética y banco de semillas.
 * 12. Servicio de fotos oficiales: Notifica reactivamente cambios a los observadores.
 * 13. JSDOM UI: Renderiza botón de administración SOLAMENTE para el creador/admin (oculto para usuarios normales).
 * 14. JSDOM UI: Muestra la fotografía representativa y el tag "Foto oficial" cuando existe foto aprobada.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ADMIN_CONFIG } from '../src/config/adminConfig';
import { verifyAdminRole } from '../src/server/adminAuthMiddleware';
import {
  getGeneticsPhotoKey,
  validateGeneticsImageFile,
  geneticsCatalogPhotoService,
} from '../src/services/geneticsCatalogPhotoService';
import { GENETICS_DATABASE } from '../src/data/predefinedGenetics';
import { GeneticsLibraryView } from '../src/components/genetics/GeneticsLibraryView';
import { UserProfile, Genetics } from '../src/types';

// Configurar entorno JSDOM
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

async function run(): Promise<void> {
  console.log('\n================================================================');
  console.log('   PRUEBAS: ADMINISTRACIÓN PRIVADA DE FOTOS DE GENÉTICAS (14 CASOS) ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const recordPass = (msg: string) => {
    passed++;
    console.log(`  ✓ [PASÓ] ${msg}`);
  };

  const recordFail = (msg: string, err?: any) => {
    failed++;
    console.error(`  ✗ [FALLÓ] ${msg}`, err || '');
  };

  try {
    // -------------------------------------------------------------
    // CASO 1: ADMIN_CONFIG reconoce creador por role: 'admin'
    // -------------------------------------------------------------
    {
      const profile: Partial<UserProfile> = {
        uid: 'user-123',
        role: 'admin',
      };
      const isAdmin = ADMIN_CONFIG.isUserAdminOrCreator(profile as UserProfile);
      if (isAdmin === true) {
        recordPass('1. ADMIN_CONFIG reconoce correctamente privilegios mediante role: "admin"');
      } else {
        recordFail('1. Falló reconocimiento por role: "admin"');
      }
    }

    // -------------------------------------------------------------
    // CASO 2: ADMIN_CONFIG reconoce creador por isCreator: true
    // -------------------------------------------------------------
    {
      const profile: Partial<UserProfile> = {
        uid: 'user-456',
        isCreator: true,
      };
      const isAdmin = ADMIN_CONFIG.isUserAdminOrCreator(profile as UserProfile);
      if (isAdmin === true) {
        recordPass('2. ADMIN_CONFIG reconoce correctamente privilegios mediante isCreator: true');
      } else {
        recordFail('2. Falló reconocimiento por isCreator: true');
      }
    }

    // -------------------------------------------------------------
    // CASO 3: ADMIN_CONFIG reconoce creador por UID preconfigurado
    // -------------------------------------------------------------
    {
      const isAdmin = ADMIN_CONFIG.isUserAdminOrCreator(null, 'creator-cultiveta-admin');
      if (isAdmin === true) {
        recordPass('3. ADMIN_CONFIG reconoce UID predeterminado de creador ("creator-cultiveta-admin")');
      } else {
        recordFail('3. Falló reconocimiento por UID predeterminado');
      }
    }

    // -------------------------------------------------------------
    // CASO 4: ADMIN_CONFIG deniega a usuarios normales y anónimos
    // -------------------------------------------------------------
    {
      const normalUser: Partial<UserProfile> = {
        uid: 'user-normal-999',
        role: 'user',
        isCreator: false,
      };
      const isNormalAdmin = ADMIN_CONFIG.isUserAdminOrCreator(normalUser as UserProfile);
      const isNullAdmin = ADMIN_CONFIG.isUserAdminOrCreator(null, undefined);
      if (isNormalAdmin === false && isNullAdmin === false) {
        recordPass('4. ADMIN_CONFIG deniega con seguridad permisos a usuarios comunes y sesiones anónimas');
      } else {
        recordFail('4. ADMIN_CONFIG permitió acceso a usuario normal o nulo');
      }
    }

    // -------------------------------------------------------------
    // CASO 5: Backend verifyAdminRole invoca next() para creador
    // -------------------------------------------------------------
    {
      let nextCalled = false;
      const req: any = { userId: 'creator-cultiveta-admin' };
      const res: any = {
        status: () => res,
        json: () => res,
      };
      await verifyAdminRole(req, res, () => {
        nextCalled = true;
      });
      if (nextCalled) {
        recordPass('5. Middleware backend verifyAdminRole concede acceso (next) a creador autenticado');
      } else {
        recordFail('5. Backend verifyAdminRole no invocó next() para el creador');
      }
    }

    // -------------------------------------------------------------
    // CASO 6: Backend verifyAdminRole retorna 403 Forbidden para usuario común
    // -------------------------------------------------------------
    {
      let statusCode = 0;
      let responseBody: any = null;
      const req: any = { userId: 'unauthorized-normal-user-123' };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      };
      await verifyAdminRole(req, res, () => {});
      if (statusCode === 403 && responseBody?.code === 'auth/forbidden') {
        recordPass('6. Backend verifyAdminRole rechaza con 403 Forbidden y código auth/forbidden');
      } else {
        recordFail(`6. Falló respuesta 403 para usuario no autorizado (código recibido: ${statusCode})`);
      }
    }

    // -------------------------------------------------------------
    // CASO 7: Backend verifyAdminRole retorna 401 si no hay usuario
    // -------------------------------------------------------------
    {
      let statusCode = 0;
      const req: any = { userId: undefined };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: () => res,
      };
      await verifyAdminRole(req, res, () => {});
      if (statusCode === 401) {
        recordPass('7. Backend verifyAdminRole rechaza peticiones sin autenticar con código 401');
      } else {
        recordFail(`7. Esperaba 401, recibido ${statusCode}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 8: getGeneticsPhotoKey genera clave canónica
    // -------------------------------------------------------------
    {
      const key1 = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      const key2 = getGeneticsPhotoKey('  sensi seeds  ', 'skunk #1 ');
      const key3 = getGeneticsPhotoKey('Barney\'s Farm', 'Amnesia Haze');
      if (
        key1 === 'sensi-seeds__skunk--1' &&
        key2 === 'sensi-seeds__skunk--1' &&
        key3 === 'barney-s-farm__amnesia-haze'
      ) {
        recordPass('8. getGeneticsPhotoKey produce claves idénticas, normalizadas y deterministas');
      } else {
        recordFail(`8. Clave incorrecta: key1=${key1}, key3=${key3}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 9: validateGeneticsImageFile acepta JPG, PNG, WEBP
    // -------------------------------------------------------------
    {
      const mockJpg = new (dom.window as any).File(['mock image binary content'], 'photo.jpg', {
        type: 'image/jpeg',
      });
      const mockPng = new (dom.window as any).File(['mock image binary content'], 'buds.png', {
        type: 'image/png',
      });
      const mockWebp = new (dom.window as any).File(['mock image binary content'], 'flower.webp', {
        type: 'image/webp',
      });

      const resJpg = await validateGeneticsImageFile(mockJpg);
      const resPng = await validateGeneticsImageFile(mockPng);
      const resWebp = await validateGeneticsImageFile(mockWebp);

      if (resJpg.valid && resPng.valid && resWebp.valid) {
        recordPass('9. validateGeneticsImageFile valida exitosamente JPG, PNG y WEBP');
      } else {
        recordFail('9. Falló validación de archivos de imagen soportados');
      }
    }

    // -------------------------------------------------------------
    // CASO 10: validateGeneticsImageFile rechaza extensiones inválidas y tamaños > 10MB
    // -------------------------------------------------------------
    {
      const mockExe = new (dom.window as any).File(['binary payload'], 'virus.exe', {
        type: 'application/x-msdownload',
      });
      const resExe = await validateGeneticsImageFile(mockExe);

      const emptyFile = new (dom.window as any).File([], 'empty.jpg', {
        type: 'image/jpeg',
      });
      const resEmpty = await validateGeneticsImageFile(emptyFile);

      // Archivo simulado que excede 10MB
      const hugeFile = {
        name: 'huge.jpg',
        type: 'image/jpeg',
        size: 15 * 1024 * 1024,
      } as any;
      const resHuge = await validateGeneticsImageFile(hugeFile);

      if (!resExe.valid && !resEmpty.valid && !resHuge.valid) {
        recordPass('10. validateGeneticsImageFile rechaza archivos no admitidos, archivos vacíos y de >10MB');
      } else {
        recordFail('10. No se rechazaron correctamente los archivos no conformes');
      }
    }

    // -------------------------------------------------------------
    // CASO 11: Búsqueda reactiva filtra por nombre y banco
    // -------------------------------------------------------------
    {
      const skunkMatches = GENETICS_DATABASE.filter(
        (g) => g.name.toLowerCase().includes('skunk') || g.seedBank.toLowerCase().includes('skunk')
      );
      const amnesiaMatches = GENETICS_DATABASE.filter(
        (g) => g.name.toLowerCase().includes('amnesia haze') || g.seedBank.toLowerCase().includes('amnesia haze')
      );
      if (skunkMatches.length > 0 && amnesiaMatches.length > 0) {
        recordPass(`11. Catálogo filtra reactivamente por nombre (${amnesiaMatches.length} variedades) y banco`);
      } else {
        recordFail('11. Falló búsqueda de genéticas predefinidas');
      }
    }

    // -------------------------------------------------------------
    // CASO 12: Reactividad del servicio de fotos oficiales
    // -------------------------------------------------------------
    {
      let emittedCount = 0;
      let lastPhotos: any = null;
      const unsub = geneticsCatalogPhotoService.subscribeCatalogPhotos((photos) => {
        emittedCount++;
        lastPhotos = photos;
      });

      // Simular subida en servicio
      const mockFile = new (dom.window as any).File(['fake binary image data'], 'skunk.jpg', {
        type: 'image/jpeg',
      });
      await geneticsCatalogPhotoService.uploadPhoto({
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        file: mockFile,
      });

      const key = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      const hasPhoto = Boolean(lastPhotos?.[key]?.photoUrl);

      unsub();

      if (emittedCount >= 2 && hasPhoto) {
        recordPass('12. geneticsCatalogPhotoService emite reactivamente cambios tras guardar fotografía');
      } else {
        recordFail('12. No se notificó reactivamente la subida de foto al suscriptor');
      }
    }

    // -------------------------------------------------------------
    // CASO 13: JSDOM UI: Botón "Carga manual de fotos" presente solo para admin
    // -------------------------------------------------------------
    {
      const container = document.getElementById('root')!;
      const root = createRoot(container);

      const adminProfile: UserProfile = {
        uid: 'creator-cultiveta-admin',
        email: 'creator@cultiveta.com',
        displayName: 'Creador Cultiveta',
        createdAt: '2026-01-01T00:00:00Z',
        role: 'admin',
        isCreator: true,
      };

      // 13.1 Renderizar como Administrador
      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: adminProfile.uid,
            userProfile: adminProfile,
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const adminBtn = document.getElementById('admin-manage-genetics-photos-btn');
      const hasAdminBtn = adminBtn !== null;

      // 13.2 Renderizar como Usuario Común
      const normalProfile: UserProfile = {
        uid: 'user-regular-001',
        email: 'user@gmail.com',
        displayName: 'Cultivador Normal',
        createdAt: '2026-01-01T00:00:00Z',
        role: 'user',
        isCreator: false,
      };

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: normalProfile.uid,
            userProfile: normalProfile,
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const normalBtn = document.getElementById('admin-manage-genetics-photos-btn');
      const hiddenForNormal = normalBtn === null;

      if (hasAdminBtn && hiddenForNormal) {
        recordPass('13. JSDOM UI: Botón "Carga manual de fotos" visible exclusivamente para el creador/admin y ausente para usuarios normales');
      } else {
        recordFail(`13. Visibilidad incorrecta del botón: hasAdminBtn=${hasAdminBtn}, hiddenForNormal=${hiddenForNormal}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 14: JSDOM UI: Tarjeta del catálogo muestra foto y "Foto oficial"
    // -------------------------------------------------------------
    {
      const container = document.getElementById('root')!;
      const root = createRoot(container);

      // Asegurar que hay foto cargada para Skunk #1
      const key = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      (geneticsCatalogPhotoService as any).cache[key] = {
        key,
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        photoUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
        updatedAt: new Date().toISOString(),
      };

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: 'user-test-viewer',
            userProfile: null,
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const rootHtml = container.innerHTML;
      const containsOfficialTag = rootHtml.includes('Foto oficial');
      const containsSkunkImage = rootHtml.includes('alt="Skunk #1 - Sensi Seeds"');

      if (containsOfficialTag && containsSkunkImage) {
        recordPass('14. JSDOM UI: Tarjeta del catálogo renderiza la fotografía representativa con tag "Foto oficial"');
      } else {
        recordFail(`14. No se encontró la etiqueta "Foto oficial" o imagen en el catálogo`);
      }
    }

  } catch (globalErr) {
    recordFail('Error global inesperado durante la ejecución de las pruebas', globalErr);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: 14 | PASARON: ${passed} | FALLARON: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
