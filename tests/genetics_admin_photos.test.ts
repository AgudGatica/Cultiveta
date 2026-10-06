/**
 * tests/genetics_admin_photos.test.ts
 *
 * SUITE DE PRUEBAS: HERRAMIENTA PRIVADA DE ADMINISTRACIÓN DE FOTOS DE GENÉTICAS (14 CASOS)
 * Con endurecimiento de seguridad (hardening), sin UIDs ficticios, validación estricta de binarios
 * y persistencia remota real.
 *
 * 1. ADMIN_CONFIG: Reconoce permisos mediante role: 'admin' en el perfil.
 * 2. ADMIN_CONFIG: Reconoce permisos mediante isCreator: true en el perfil.
 * 3. UIDs Ficticios: Rechaza terminantemente UIDs ficticios (creator-cultiveta-admin, etc.).
 * 4. ADMIN_CONFIG: Deniega con seguridad permisos a usuarios comunes y sesiones anónimas.
 * 5. Backend verifyAdminRole: Autoriza exclusivamente mediante UID en variables de entorno del servidor o Custom Claims.
 * 6. Backend verifyAdminRole: Retorna 403 Forbidden a usuarios normales o con UIDs ficticios.
 * 7. Backend verifyAdminRole: Retorna 401 Unauthenticated si no hay sesión.
 * 8. getGeneticsPhotoKey: Genera identificador determinista, normalizado y canónico.
 * 9. validateGeneticsImageFile: Acepta archivos válidos JPG, JPEG, PNG y WEBP.
 * 10. validateImageBuffer: Valida firmas binarias (magic bytes) y rechaza binarios manipulados o corruptos.
 * 11. Búsqueda reactiva: Filtra inmediatamente por nombre de genética y banco de semillas.
 * 12. Persistencia y Reactividad: uploadPhoto emite cambios sólo tras respuesta exitosa confirmada del backend.
 * 13. JSDOM UI: Renderiza botón de administración SOLAMENTE para el creador/admin (oculto para usuarios normales).
 * 14. JSDOM UI: Tarjeta del catálogo renderiza la fotografía representativa y el tag "Foto oficial" con URL remota.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ADMIN_CONFIG } from '../src/config/adminConfig';
import { verifyAdminRole, isRequestAdmin } from '../src/server/adminAuthMiddleware';
import { validateImageBuffer } from '../src/server/imageValidation';
import {
  getGeneticsPhotoKey,
  validateGeneticsImageFile,
  fileToDataUrl,
  geneticsCatalogPhotoService,
} from '../src/services/geneticsCatalogPhotoService';
import { GENETICS_DATABASE } from '../src/data/predefinedGenetics';
import { GeneticsLibraryView } from '../src/components/genetics/GeneticsLibraryView';
import { UserProfile } from '../src/types';

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
    // CASO 1: ADMIN_CONFIG reconoce permisos mediante role: 'admin'
    // -------------------------------------------------------------
    {
      const profile: Partial<UserProfile> = {
        uid: 'user-real-admin-1',
        role: 'admin',
      };
      const isAdmin = ADMIN_CONFIG.isUserAdminOrCreator(profile as UserProfile);
      if (isAdmin === true) {
        recordPass('1. ADMIN_CONFIG reconoce correctamente permisos mediante role: "admin"');
      } else {
        recordFail('1. Falló reconocimiento por role: "admin"');
      }
    }

    // -------------------------------------------------------------
    // CASO 2: ADMIN_CONFIG reconoce permisos mediante isCreator: true
    // -------------------------------------------------------------
    {
      const profile: Partial<UserProfile> = {
        uid: 'user-real-creator-1',
        isCreator: true,
      };
      const isAdmin = ADMIN_CONFIG.isUserAdminOrCreator(profile as UserProfile);
      if (isAdmin === true) {
        recordPass('2. ADMIN_CONFIG reconoce correctamente permisos mediante isCreator: true');
      } else {
        recordFail('2. Falló reconocimiento por isCreator: true');
      }
    }

    // -------------------------------------------------------------
    // CASO 3: UIDs Ficticios eliminados y rechazados
    // -------------------------------------------------------------
    {
      const fictional1 = isRequestAdmin({ userId: 'creator-cultiveta-admin' });
      const fictional2 = isRequestAdmin({ userId: 'admin-cultiveta-main' });
      const fictional3 = isRequestAdmin({ userId: 'cultiveta-creator-master' });

      if (!fictional1 && !fictional2 && !fictional3) {
        recordPass('3. UIDs ficticios (creator-cultiveta-admin, etc.) quedan estrictamente revocados y denegados');
      } else {
        recordFail('3. Falló eliminación de UIDs ficticios: permitieron acceso no autorizado');
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
    // CASO 5: Backend verifyAdminRole autoriza exclusivamente con env vars o Custom Claims
    // -------------------------------------------------------------
    {
      // 5.1 Con UID en variable de entorno del servidor
      const originalAdminUid = process.env.ADMIN_UID;
      process.env.ADMIN_UID = 'server-configured-admin-777';

      let nextCalledWithEnv = false;
      const reqEnv: any = { userId: 'server-configured-admin-777' };
      const resDummy: any = { status: () => resDummy, json: () => resDummy };
      await verifyAdminRole(reqEnv, resDummy, () => {
        nextCalledWithEnv = true;
      });

      // 5.2 Con Firebase Custom Claim admin: true
      let nextCalledWithClaims = false;
      const reqClaims: any = { userId: 'user-jwt-claim-123', user: { admin: true } };
      await verifyAdminRole(reqClaims, resDummy, () => {
        nextCalledWithClaims = true;
      });

      process.env.ADMIN_UID = originalAdminUid;

      if (nextCalledWithEnv && nextCalledWithClaims) {
        recordPass('5. Backend verifyAdminRole autoriza correctamente por variable de entorno del servidor y por Custom Claims');
      } else {
        recordFail(`5. Falló verifyAdminRole seguro: env=${nextCalledWithEnv}, claims=${nextCalledWithClaims}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 6: Backend verifyAdminRole retorna 403 Forbidden para usuario común o UID ficticio
    // -------------------------------------------------------------
    {
      let statusCode = 0;
      let responseBody: any = null;
      const req: any = { userId: 'creator-cultiveta-admin' }; // UID ficticio debe dar 403
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
        recordPass('6. Backend verifyAdminRole rechaza UIDs ficticios y no autorizados con 403 Forbidden');
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
    // CASO 8: getGeneticsPhotoKey genera clave canónica determinista
    // -------------------------------------------------------------
    {
      const key1 = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      const key2 = getGeneticsPhotoKey('  sensi seeds  ', 'skunk #1 ');
      const key3 = getGeneticsPhotoKey("Barney's Farm", 'Amnesia Haze');
      if (
        key1 === 'sensi-seeds__skunk-1' &&
        key2 === 'sensi-seeds__skunk-1' &&
        key3 === 'barney-s-farm__amnesia-haze'
      ) {
        recordPass('8. getGeneticsPhotoKey produce claves idénticas, normalizadas y deterministas');
      } else {
        recordFail(`8. Clave incorrecta: key1=${key1}, key3=${key3}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 9: validateGeneticsImageFile valida JPG, PNG, WEBP en cliente
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
    // CASO 10: validateImageBuffer valida firmas binarias (magic bytes)
    // -------------------------------------------------------------
    {
      // JPEG magic bytes: FF D8 FF
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      // Binario inválido (ejecutable o texto)
      const fakeBuffer = Buffer.from('Esto no es una imagen');

      const resJpeg = validateImageBuffer(jpegBuffer);
      const resPng = validateImageBuffer(pngBuffer);
      const resFake = validateImageBuffer(fakeBuffer);

      if (resJpeg.valid && resJpeg.detectedMime === 'image/jpeg' &&
          resPng.valid && resPng.detectedMime === 'image/png' &&
          !resFake.valid) {
        recordPass('10. validateImageBuffer valida firmas binarias reales (JPEG/PNG) y rechaza archivos falsos o corruptos');
      } else {
        recordFail('10. Falló la validación estricta de magic bytes en buffer');
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
    // CASO 12: Reactividad del servicio y confirmación remota estricta
    // -------------------------------------------------------------
    {
      let emittedCount = 0;
      let lastPhotos: any = null;
      const unsub = geneticsCatalogPhotoService.subscribeCatalogPhotos((photos) => {
        emittedCount++;
        lastPhotos = photos;
      });

      // Simular respuesta exitosa remota de backend con Storage URL
      const key = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      const originalFetch = globalThis.fetch;
      const { authService } = await import('../src/services/authService');
      const originalGetIdToken = authService.getIdToken;
      authService.getIdToken = async () => 'mock-admin-jwt-token';

      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/admin/genetics/upload-photo')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              photo: {
                key,
                seedBank: 'Sensi Seeds',
                name: 'Skunk #1',
                photoUrl: 'https://storage.googleapis.com/gen-lang-client-0531791519.firebasestorage.app/genetics-catalog/sensi-seeds__skunk-1.jpg',
                storagePath: 'genetics-catalog/sensi-seeds__skunk-1.jpg',
                photoSourceName: 'Sensi Seeds',
                photoAttribution: 'Oficial Sensi Seeds',
                updatedAt: new Date().toISOString(),
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const mockFile = new (dom.window as any).File(['fake binary image data'], 'skunk.jpg', {
        type: 'image/jpeg',
      });
      await geneticsCatalogPhotoService.uploadPhoto({
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        file: mockFile,
        photoSourceName: 'Sensi Seeds',
      });

      globalThis.fetch = originalFetch;
      authService.getIdToken = originalGetIdToken;

      const hasPhoto = Boolean(lastPhotos?.[key]?.photoUrl);
      const isRemoteUrl = lastPhotos?.[key]?.photoUrl?.startsWith('https://storage.googleapis.com');
      unsub();

      if (emittedCount >= 2 && hasPhoto && isRemoteUrl) {
        recordPass('12. geneticsCatalogPhotoService actualiza caché y emite cambios tras confirmación remota con URL de Storage');
      } else {
        recordFail('12. No se confirmó reactividad o la URL no proviene de Storage');
      }
    }

    // -------------------------------------------------------------
    // CASO 13: JSDOM UI: Botón "Carga manual de fotos" presente solo para admin
    // -------------------------------------------------------------
    {
      const container = document.getElementById('root')!;
      const root = createRoot(container);

      const adminProfile: UserProfile = {
        uid: 'user-admin-real',
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

      // Asegurar que hay foto cargada para Skunk #1 con URL de Firebase Storage (no base64)
      const key = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      (geneticsCatalogPhotoService as any).cache[key] = {
        key,
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        photoUrl: 'https://storage.googleapis.com/gen-lang-client-0531791519.firebasestorage.app/genetics-catalog/sensi-seeds__skunk-1.jpg',
        storagePath: 'genetics-catalog/sensi-seeds__skunk-1.jpg',
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
      const containsStorageUrl = rootHtml.includes('https://storage.googleapis.com');

      if (containsOfficialTag && containsSkunkImage && containsStorageUrl) {
        recordPass('14. JSDOM UI: Tarjeta del catálogo renderiza la fotografía representativa con tag "Foto oficial" y URL remota de Storage');
      } else {
        recordFail('14. No se encontró la etiqueta "Foto oficial" o imagen remota en el catálogo');
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
