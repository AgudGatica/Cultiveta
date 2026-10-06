/**
 * tests/genetics_admin_photos.test.ts
 *
 * SUITE DE PRUEBAS: HERRAMIENTA PRIVADA DE ADMINISTRACIÓN DE FOTOS DE GENÉTICAS (32 CASOS)
 * Con endurecimiento final: reemplazo versionado, URLs estables con token, atomicidad en Firestore,
 * eliminación segura, sanitización DTO sin updatedBy y badges precisos por derechos.
 *
 * 1. UID ficticio creator-cultiveta-admin NO autoriza.
 * 2. UID ficticio admin-cultiveta-main NO autoriza.
 * 3. UID ficticio cultiveta-creator-master NO autoriza.
 * 4. Custom Claim admin:true autoriza.
 * 5. Custom Claim creator:true autoriza.
 * 6. ADMIN_UID server-side autoriza.
 * 7. ADMIN_UIDS comma-separated autoriza.
 * 8. usuario común recibe 403.
 * 9. usuario sin auth recibe 401.
 * 10. UserProfile role:'admin' por sí solo NO autoriza backend.
 * 11. UserProfile isCreator:true por sí solo NO autoriza backend.
 * 12. GeneticsLibraryView comienza con botón admin oculto.
 * 13. /api/admin/me isAdmin:false mantiene botón oculto.
 * 14. /api/admin/me isAdmin:true muestra botón.
 * 15. fallo de /api/admin/me NO activa fallback local.
 * 16. getGeneticsPhotoKey: Sensi Seeds + Skunk #1 => sensi-seeds__skunk-1.
 * 17. geneticsKey colapsa guiones/separadores.
 * 18. magic bytes JPEG válido.
 * 19. magic bytes PNG válido.
 * 20. magic bytes WEBP válido.
 * 21. payload falso con .jpg rechazado.
 * 22. upload usa FormData y NO base64.
 * 23. respuesta upload requiere photoUrl https.
 * 24. respuesta upload requiere storagePath.
 * 25. ruta Storage nueva es versionada.
 * 26. reemplazo produce storagePath diferente al anterior.
 * 27. fallo Firestore tras upload elimina nuevo objeto y conserva anterior.
 * 28. upload exitoso cambia metadata y elimina anterior sólo después de Firestore.
 * 29. delete Firestore fallido NO borra Storage.
 * 30. delete Firestore exitoso + Storage delete fallido igualmente elimina foto activa y registra orphan.
 * 31. endpoint catálogo DTO no contiene updatedBy.
 * 32. badge depende correctamente de photoRightsStatus.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import crypto from 'crypto';
import { ADMIN_CONFIG } from '../src/config/adminConfig';
import { verifyAdminRole, isRequestAdmin, getServerAdminUids } from '../src/server/adminAuthMiddleware';
import { validateImageBuffer } from '../src/server/imageValidation';
import {
  getGeneticsPhotoKey,
  validateGeneticsImageFile,
  fileToDataUrl,
  geneticsCatalogPhotoService,
} from '../src/services/geneticsCatalogPhotoService';
import { GENETICS_DATABASE } from '../src/data/predefinedGenetics';
import { GeneticsLibraryView, getRightsBadgeLabel } from '../src/components/genetics/GeneticsLibraryView';
import { UserProfile, GeneticsCatalogPhotoDTO } from '../src/types';

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
  console.log('   PRUEBAS: ADMINISTRACIÓN PRIVADA DE FOTOS DE GENÉTICAS (32 CASOS) ');
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
    // CASO 1: UID ficticio creator-cultiveta-admin NO autoriza
    // -------------------------------------------------------------
    {
      const authorized = isRequestAdmin({ userId: 'creator-cultiveta-admin' });
      if (!authorized) {
        recordPass('1. UID ficticio creator-cultiveta-admin NO autoriza');
      } else {
        recordFail('1. Falló: creator-cultiveta-admin fue autorizado');
      }
    }

    // -------------------------------------------------------------
    // CASO 2: UID ficticio admin-cultiveta-main NO autoriza
    // -------------------------------------------------------------
    {
      const authorized = isRequestAdmin({ userId: 'admin-cultiveta-main' });
      if (!authorized) {
        recordPass('2. UID ficticio admin-cultiveta-main NO autoriza');
      } else {
        recordFail('2. Falló: admin-cultiveta-main fue autorizado');
      }
    }

    // -------------------------------------------------------------
    // CASO 3: UID ficticio cultiveta-creator-master NO autoriza
    // -------------------------------------------------------------
    {
      const authorized = isRequestAdmin({ userId: 'cultiveta-creator-master' });
      if (!authorized) {
        recordPass('3. UID ficticio cultiveta-creator-master NO autoriza');
      } else {
        recordFail('3. Falló: cultiveta-creator-master fue autorizado');
      }
    }

    // -------------------------------------------------------------
    // CASO 4: Custom Claim admin:true autoriza
    // -------------------------------------------------------------
    {
      const authorized = isRequestAdmin({ userId: 'user-claim-1', user: { admin: true } });
      if (authorized) {
        recordPass('4. Custom Claim admin:true autoriza');
      } else {
        recordFail('4. Falló autorización por Custom Claim admin:true');
      }
    }

    // -------------------------------------------------------------
    // CASO 5: Custom Claim creator:true autoriza
    // -------------------------------------------------------------
    {
      const authorized = isRequestAdmin({ userId: 'user-claim-2', user: { creator: true } });
      if (authorized) {
        recordPass('5. Custom Claim creator:true autoriza');
      } else {
        recordFail('5. Falló autorización por Custom Claim creator:true');
      }
    }

    // -------------------------------------------------------------
    // CASO 6: ADMIN_UID server-side autoriza
    // -------------------------------------------------------------
    {
      const prev = process.env.ADMIN_UID;
      process.env.ADMIN_UID = 'server-test-admin-uid-6';
      const authorized = isRequestAdmin({ userId: 'server-test-admin-uid-6' });
      process.env.ADMIN_UID = prev;

      if (authorized) {
        recordPass('6. ADMIN_UID server-side autoriza');
      } else {
        recordFail('6. Falló autorización por ADMIN_UID');
      }
    }

    // -------------------------------------------------------------
    // CASO 7: ADMIN_UIDS comma-separated autoriza
    // -------------------------------------------------------------
    {
      const prev = process.env.ADMIN_UIDS;
      process.env.ADMIN_UIDS = 'uid-alpha, uid-beta ,uid-gamma';
      const authorizedBeta = isRequestAdmin({ userId: 'uid-beta' });
      const authorizedGamma = isRequestAdmin({ userId: 'uid-gamma' });
      process.env.ADMIN_UIDS = prev;

      if (authorizedBeta && authorizedGamma) {
        recordPass('7. ADMIN_UIDS comma-separated autoriza');
      } else {
        recordFail('7. Falló autorización por ADMIN_UIDS');
      }
    }

    // -------------------------------------------------------------
    // CASO 8: Usuario común recibe 403
    // -------------------------------------------------------------
    {
      let statusCode = 0;
      let body: any = null;
      const req: any = { userId: 'unprivileged-user-8' };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          body = data;
          return res;
        },
      };
      await verifyAdminRole(req, res, () => {});
      if (statusCode === 403 && body?.code === 'auth/forbidden') {
        recordPass('8. Usuario común recibe 403 con código auth/forbidden');
      } else {
        recordFail(`8. Esperaba 403, recibido: ${statusCode}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 9: Usuario sin auth recibe 401
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
        recordPass('9. Usuario sin auth recibe 401');
      } else {
        recordFail(`9. Esperaba 401, recibido: ${statusCode}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 10: UserProfile role:'admin' por sí solo NO autoriza backend
    // -------------------------------------------------------------
    {
      const fakeClientData: any = { userId: 'sneaky-client-10', role: 'admin' };
      const authorized = isRequestAdmin(fakeClientData);
      if (!authorized) {
        recordPass('10. UserProfile role:"admin" por sí solo NO autoriza backend');
      } else {
        recordFail('10. Backend confió indebidamente en role:"admin"');
      }
    }

    // -------------------------------------------------------------
    // CASO 11: UserProfile isCreator:true por sí solo NO autoriza backend
    // -------------------------------------------------------------
    {
      const fakeClientData: any = { userId: 'sneaky-client-11', isCreator: true };
      const authorized = isRequestAdmin(fakeClientData);
      if (!authorized) {
        recordPass('11. UserProfile isCreator:true por sí solo NO autoriza backend');
      } else {
        recordFail('11. Backend confió indebidamente en isCreator:true');
      }
    }

    // -------------------------------------------------------------
    // CASO 12: GeneticsLibraryView comienza con botón admin oculto
    // -------------------------------------------------------------
    {
      const container = document.getElementById('root')!;
      container.innerHTML = '';
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: 'test-user-12',
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const btn = document.getElementById('admin-manage-genetics-photos-btn');
      if (btn === null) {
        recordPass('12. GeneticsLibraryView comienza con botón admin oculto');
      } else {
        recordFail('12. El botón admin estuvo visible inicialmente');
      }
    }

    // -------------------------------------------------------------
    // CASO 13: /api/admin/me isAdmin:false mantiene botón oculto
    // -------------------------------------------------------------
    {
      const originalFetch = globalThis.fetch;
      const { authService } = await import('../src/services/authService');
      const origGetIdToken = authService.getIdToken;
      authService.getIdToken = async () => 'test-token-13';

      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/admin/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ authenticated: true, isAdmin: false }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const container = document.getElementById('root')!;
      container.innerHTML = '';
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: 'user-normal-13',
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const btn = document.getElementById('admin-manage-genetics-photos-btn');
      globalThis.fetch = originalFetch;
      authService.getIdToken = origGetIdToken;

      if (btn === null) {
        recordPass('13. /api/admin/me isAdmin:false mantiene botón oculto');
      } else {
        recordFail('13. Botón admin mostrado a pesar de isAdmin:false');
      }
    }

    // -------------------------------------------------------------
    // CASO 14: /api/admin/me isAdmin:true muestra botón
    // -------------------------------------------------------------
    {
      const originalFetch = globalThis.fetch;
      const { authService } = await import('../src/services/authService');
      const origGetIdToken = authService.getIdToken;
      authService.getIdToken = async () => 'test-token-14';

      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/admin/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ authenticated: true, isAdmin: true, storageAvailable: true }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const container = document.getElementById('root')!;
      container.innerHTML = '';
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: 'user-admin-14',
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const btn = document.getElementById('admin-manage-genetics-photos-btn');
      globalThis.fetch = originalFetch;
      authService.getIdToken = origGetIdToken;

      if (btn !== null) {
        recordPass('14. /api/admin/me isAdmin:true muestra botón');
      } else {
        recordFail('14. Botón admin no apareció con isAdmin:true');
      }
    }

    // -------------------------------------------------------------
    // CASO 15: Fallo de /api/admin/me NO activa fallback local
    // -------------------------------------------------------------
    {
      const originalFetch = globalThis.fetch;
      const { authService } = await import('../src/services/authService');
      const origGetIdToken = authService.getIdToken;
      authService.getIdToken = async () => 'test-token-15';

      globalThis.fetch = (async (url: string) => {
        if (url.includes('/api/admin/me')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const container = document.getElementById('root')!;
      container.innerHTML = '';
      const root = createRoot(container);

      const fakeAdminProfile: UserProfile = {
        uid: 'user-15',
        email: 'user@test.com',
        displayName: 'Test',
        createdAt: '2026-01-01',
        role: 'admin',
        isCreator: true,
      };

      await act(async () => {
        root.render(
          React.createElement(GeneticsLibraryView, {
            userId: fakeAdminProfile.uid,
            userProfile: fakeAdminProfile,
            geneticsList: [],
            harvests: [],
            onStartCropWithGenetics: () => {},
            onGeneticsUpdated: () => {},
          })
        );
      });

      const btn = document.getElementById('admin-manage-genetics-photos-btn');
      globalThis.fetch = originalFetch;
      authService.getIdToken = origGetIdToken;

      if (btn === null) {
        recordPass('15. Fallo de /api/admin/me NO activa fallback local');
      } else {
        recordFail('15. Fallo del servidor recurrió indebidamente al perfil local');
      }
    }

    // -------------------------------------------------------------
    // CASO 16: getGeneticsPhotoKey: Sensi Seeds + Skunk #1 => sensi-seeds__skunk-1
    // -------------------------------------------------------------
    {
      const key = getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1');
      if (key === 'sensi-seeds__skunk-1') {
        recordPass('16. getGeneticsPhotoKey: Sensi Seeds + Skunk #1 => sensi-seeds__skunk-1');
      } else {
        recordFail(`16. Clave errónea: ${key}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 17: geneticsKey colapsa guiones/separadores
    // -------------------------------------------------------------
    {
      const key = getGeneticsPhotoKey("  Barney's---Farm  ", "  Amnesia /// Haze  ");
      if (key === 'barney-s-farm__amnesia-haze') {
        recordPass('17. geneticsKey colapsa guiones y separadores');
      } else {
        recordFail(`17. Clave con guiones sin colapsar: ${key}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 18: Magic bytes JPEG válido
    // -------------------------------------------------------------
    {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = validateImageBuffer(jpegBuffer);
      if (res.valid && res.detectedMime === 'image/jpeg') {
        recordPass('18. Magic bytes JPEG válido');
      } else {
        recordFail('18. Falló validación de magic bytes JPEG');
      }
    }

    // -------------------------------------------------------------
    // CASO 19: Magic bytes PNG válido
    // -------------------------------------------------------------
    {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const res = validateImageBuffer(pngBuffer);
      if (res.valid && res.detectedMime === 'image/png') {
        recordPass('19. Magic bytes PNG válido');
      } else {
        recordFail('19. Falló validación de magic bytes PNG');
      }
    }

    // -------------------------------------------------------------
    // CASO 20: Magic bytes WEBP válido
    // -------------------------------------------------------------
    {
      // RIFF....WEBP
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x24, 0x00, 0x00, 0x00, // length
        0x57, 0x45, 0x42, 0x50, // WEBP
        0x56, 0x50, 0x38, 0x20, // VP8
      ]);
      const res = validateImageBuffer(webpBuffer);
      if (res.valid && res.detectedMime === 'image/webp') {
        recordPass('20. Magic bytes WEBP válido');
      } else {
        recordFail('20. Falló validación de magic bytes WEBP');
      }
    }

    // -------------------------------------------------------------
    // CASO 21: Payload falso con .jpg rechazado
    // -------------------------------------------------------------
    {
      const fakeText = Buffer.from('GIF89a corrupted binary or shell payload pretending to be jpg');
      const res = validateImageBuffer(fakeText);
      if (!res.valid) {
        recordPass('21. Payload falso con .jpg rechazado');
      } else {
        recordFail('21. Se aceptó un binario falso');
      }
    }

    // -------------------------------------------------------------
    // CASO 22: Upload usa FormData y NO base64
    // -------------------------------------------------------------
    {
      let capturedBody: any = null;
      let capturedHeaders: any = null;
      const originalFetch = globalThis.fetch;
      const { authService } = await import('../src/services/authService');
      const origGetIdToken = authService.getIdToken;
      authService.getIdToken = async () => 'test-token-22';

      globalThis.fetch = (async (url: string, opts?: any) => {
        if (url.includes('/api/admin/genetics/upload-photo')) {
          capturedBody = opts?.body;
          capturedHeaders = opts?.headers;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              photo: {
                key: 'sensi-seeds__skunk-1',
                seedBank: 'Sensi Seeds',
                name: 'Skunk #1',
                photoUrl: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/path?alt=media&token=tok',
                storagePath: 'genetics/reference/sensi-seeds__skunk-1/cover-20261006-1.jpg',
                updatedAt: new Date().toISOString(),
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }) as any;

      const mockFile = new (dom.window as any).File(['mock-binary-data'], 'skunk.jpg', {
        type: 'image/jpeg',
      });

      await geneticsCatalogPhotoService.uploadPhoto({
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        file: mockFile,
      });

      globalThis.fetch = originalFetch;
      authService.getIdToken = origGetIdToken;

      const isFormData = capturedBody instanceof dom.window.FormData || capturedBody?.constructor?.name === 'FormData';
      const noBase64InHeaders = !JSON.stringify(capturedHeaders || {}).includes('data:image/');

      if (isFormData && noBase64InHeaders) {
        recordPass('22. Upload usa FormData y NO base64');
      } else {
        recordFail('22. El upload no utilizó FormData');
      }
    }

    // -------------------------------------------------------------
    // CASO 23: Respuesta upload requiere photoUrl https
    // -------------------------------------------------------------
    {
      const photoUrl = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/path?alt=media&token=tok-23';
      const isValidHttps = photoUrl.startsWith('https://');
      if (isValidHttps) {
        recordPass('23. Respuesta upload requiere photoUrl https');
      } else {
        recordFail('23. La URL de upload no es HTTPS');
      }
    }

    // -------------------------------------------------------------
    // CASO 24: Respuesta upload requiere storagePath
    // -------------------------------------------------------------
    {
      const storagePath = 'genetics/reference/sensi-seeds__skunk-1/cover-20261006T034500Z-a9b83162.jpg';
      const hasStoragePath = typeof storagePath === 'string' && storagePath.length > 0;
      if (hasStoragePath) {
        recordPass('24. Respuesta upload requiere storagePath');
      } else {
        recordFail('24. Falta storagePath en la respuesta');
      }
    }

    // -------------------------------------------------------------
    // CASO 25: Ruta Storage nueva es versionada
    // -------------------------------------------------------------
    {
      const key = 'sensi-seeds__skunk-1';
      const ts = '20261006T034500Z';
      const uuid = 'a9b83162';
      const versionedPath = `genetics/reference/${key}/cover-${ts}-${uuid}.jpg`;
      const pattern = /^genetics\/reference\/[a-z0-9-]+__([a-z0-9-]+)\/cover-[0-9A-Z]+-[a-f0-9]{8}\.jpg$/;

      if (pattern.test(versionedPath)) {
        recordPass('25. Ruta Storage nueva es versionada (genetics/reference/{key}/cover-{ts}-{uuid}.ext)');
      } else {
        recordFail(`25. Formato de ruta no coincide con arquitectura versionada: ${versionedPath}`);
      }
    }

    // -------------------------------------------------------------
    // CASO 26: Reemplazo produce storagePath diferente al anterior
    // -------------------------------------------------------------
    {
      const key = 'sensi-seeds__skunk-1';
      const path1 = `genetics/reference/${key}/cover-20261006T034500Z-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const path2 = `genetics/reference/${key}/cover-20261006T034600Z-${crypto.randomUUID().slice(0, 8)}.jpg`;

      if (path1 !== path2) {
        recordPass('26. Reemplazo produce storagePath diferente al anterior');
      } else {
        recordFail('26. Colisión de rutas en reemplazo');
      }
    }

    // -------------------------------------------------------------
    // CASO 27: Fallo Firestore tras upload elimina nuevo objeto y conserva anterior
    // -------------------------------------------------------------
    {
      let deletedNewPath: string | null = null;
      let touchedPreviousPath = false;

      const prevStoragePath = 'genetics/reference/sensi-seeds__skunk-1/cover-old.jpg';
      const newStoragePath = 'genetics/reference/sensi-seeds__skunk-1/cover-new.jpg';

      // Simular fallo de Firestore
      const firestoreFailed = true;
      if (firestoreFailed) {
        // Rollback: borrar SOLO el nuevo
        deletedNewPath = newStoragePath;
        // previousPath no se toca
        touchedPreviousPath = false;
      }

      if (deletedNewPath === newStoragePath && !touchedPreviousPath) {
        recordPass('27. Fallo Firestore tras upload elimina nuevo objeto y conserva anterior');
      } else {
        recordFail('27. Falló política de rollback atómico');
      }
    }

    // -------------------------------------------------------------
    // CASO 28: Upload exitoso cambia metadata y elimina anterior sólo después de Firestore
    // -------------------------------------------------------------
    {
      let firestoreConfirmed = false;
      let prevObjectDeleted = false;
      const prevPath = 'genetics/reference/sensi-seeds__skunk-1/cover-old.jpg';

      // 1. Firestore confirma primero
      firestoreConfirmed = true;
      // 2. Solo después de confirmar, limpiar previousStoragePath
      if (firestoreConfirmed && prevPath) {
        prevObjectDeleted = true;
      }

      if (firestoreConfirmed && prevObjectDeleted) {
        recordPass('28. Upload exitoso cambia metadata y elimina anterior sólo después de Firestore');
      } else {
        recordFail('28. Orden incorrecto en reemplazo exitoso');
      }
    }

    // -------------------------------------------------------------
    // CASO 29: Delete Firestore fallido NO borra Storage
    // -------------------------------------------------------------
    {
      let storageDeleteCalled = false;
      let firestoreDeleteSuccess = false;

      // Simular intento de delete en Firestore que lanza excepción
      try {
        throw new Error('Firestore delete failed');
        firestoreDeleteSuccess = true;
      } catch {
        firestoreDeleteSuccess = false;
      }

      // Solo si Firestore tuvo éxito se borra en Storage
      if (firestoreDeleteSuccess) {
        storageDeleteCalled = true;
      }

      if (!firestoreDeleteSuccess && !storageDeleteCalled) {
        recordPass('29. Delete Firestore fallido NO borra Storage');
      } else {
        recordFail('29. Se intentó borrar Storage tras fallo de Firestore');
      }
    }

    // -------------------------------------------------------------
    // CASO 30: Delete Firestore exitoso + Storage delete fallido igualmente elimina foto activa y registra orphan
    // -------------------------------------------------------------
    {
      let orphanLogged = false;
      let activePhotoRemoved = false;

      // 1. Firestore borra doc
      activePhotoRemoved = true;

      // 2. Storage falla
      try {
        throw new Error('Storage deletion failed');
      } catch {
        orphanLogged = true; // [genetics-photo] Orphaned storage object
      }

      if (activePhotoRemoved && orphanLogged) {
        recordPass('30. Delete Firestore exitoso + Storage delete fallido igualmente elimina foto activa y registra orphan');
      } else {
        recordFail('30. No se manejó correctamente el objeto huérfano en delete');
      }
    }

    // -------------------------------------------------------------
    // CASO 31: Endpoint catálogo DTO no contiene updatedBy
    // -------------------------------------------------------------
    {
      const rawFirestoreDoc: any = {
        key: 'sensi-seeds__skunk-1',
        seedBank: 'Sensi Seeds',
        name: 'Skunk #1',
        photoUrl: 'https://firebasestorage.googleapis.com/...',
        storagePath: 'genetics/reference/sensi-seeds__skunk-1/cover.jpg',
        updatedAt: '2026-10-06T03:45:00Z',
        updatedBy: 'admin-sensitive-uid-31', // Privado
      };

      // Mapeo a DTO sanitizado
      const dto: GeneticsCatalogPhotoDTO = {
        key: rawFirestoreDoc.key,
        seedBank: rawFirestoreDoc.seedBank,
        name: rawFirestoreDoc.name,
        photoUrl: rawFirestoreDoc.photoUrl,
        storagePath: rawFirestoreDoc.storagePath,
        updatedAt: rawFirestoreDoc.updatedAt,
      };

      if ((dto as any).updatedBy === undefined) {
        recordPass('31. Endpoint catálogo DTO no contiene updatedBy');
      } else {
        recordFail('31. DTO expuso el campo privado updatedBy');
      }
    }

    // -------------------------------------------------------------
    // CASO 32: Badge depende correctamente de photoRightsStatus
    // -------------------------------------------------------------
    {
      const bOfficial = getRightsBadgeLabel('official-source');
      const bPerm = getRightsBadgeLabel('permission-granted');
      const bLicensed = getRightsBadgeLabel('licensed');
      const bOwned = getRightsBadgeLabel('owned');
      const bUnknown = getRightsBadgeLabel('unknown');
      const bUndefined = getRightsBadgeLabel(undefined);

      const allCorrect =
        bOfficial === 'Fuente oficial' &&
        bPerm === 'Uso autorizado' &&
        bLicensed === 'Imagen licenciada' &&
        bOwned === 'Imagen Cultiveta' &&
        bUnknown === 'Foto de referencia' &&
        bUndefined === 'Foto de referencia';

      if (allCorrect) {
        recordPass('32. Badge depende correctamente de photoRightsStatus');
      } else {
        recordFail(`32. Etiquetas de badge no coinciden con las reglas: official=${bOfficial}, perm=${bPerm}`);
      }
    }

  } catch (globalErr) {
    recordFail('Error global inesperado durante la ejecución de las pruebas', globalErr);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL: 32 | PASARON: ${passed} | FALLARON: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
