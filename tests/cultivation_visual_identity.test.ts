import './helpers/setupDom';
import 'fake-indexeddb/auto';



import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Cultivation, GeneticsCatalogPhoto } from '../src/types';
import { resolveCultivationDisplayPhoto } from '../src/utils/cultivationPhotoResolver';
import { CultivationDetailView } from '../src/components/cultivations/CultivationDetailView';
import { CultivationCard } from '../src/components/cultivations/CultivationCard';
import { getGeneticsPhotoKey } from '../src/utils/geneticsKeyUtils';

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

async function runTests() {
  console.log('\n============================================================');
  console.log('   PRUEBAS: IDENTIDAD VISUAL DE GENÉTICAS EN CULTIVOS       ');
  console.log('============================================================\n');

  const catalogPhotosFixture: Record<string, GeneticsCatalogPhoto> = {
    [getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1')]: {
      key: getGeneticsPhotoKey('Sensi Seeds', 'Skunk #1'),
      seedBank: 'Sensi Seeds',
      name: 'Skunk #1',
      photoUrl: 'https://storage.googleapis.com/test-bucket/skunk1.webp',
      storagePath: 'genetics/reference/skunk1.webp',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'official-source',
    },
    [getGeneticsPhotoKey("Barney's Farm", 'Gorilla Zkittlez')]: {
      key: getGeneticsPhotoKey("Barney's Farm", 'Gorilla Zkittlez'),
      seedBank: "Barney's Farm",
      name: 'Gorilla Zkittlez',
      photoUrl: 'https://storage.googleapis.com/test-bucket/gorilla.webp',
      storagePath: 'genetics/reference/gorilla.webp',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'licensed',
    },
    // Misma variedad 'Amnesia Haze' presente en dos seed banks distintos
    [getGeneticsPhotoKey('Royal Queen Seeds', 'Amnesia Haze')]: {
      key: getGeneticsPhotoKey('Royal Queen Seeds', 'Amnesia Haze'),
      seedBank: 'Royal Queen Seeds',
      name: 'Amnesia Haze',
      photoUrl: 'https://storage.googleapis.com/test-bucket/rqs-amnesia.webp',
      storagePath: 'genetics/reference/rqs-amnesia.webp',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'official-source',
    },
    [getGeneticsPhotoKey('Soma Seeds', 'Amnesia Haze')]: {
      key: getGeneticsPhotoKey('Soma Seeds', 'Amnesia Haze'),
      seedBank: 'Soma Seeds',
      name: 'Amnesia Haze',
      photoUrl: 'https://storage.googleapis.com/test-bucket/soma-amnesia.webp',
      storagePath: 'genetics/reference/soma-amnesia.webp',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'official-source',
    },
    // Variedad única sin colisión
    [getGeneticsPhotoKey('Sweet Seeds', 'Cream Caramel')]: {
      key: getGeneticsPhotoKey('Sweet Seeds', 'Cream Caramel'),
      seedBank: 'Sweet Seeds',
      name: 'Cream Caramel',
      photoUrl: 'https://storage.googleapis.com/test-bucket/sweet-caramel.webp',
      storagePath: 'genetics/reference/sweet-caramel.webp',
      updatedAt: new Date().toISOString(),
      photoRightsStatus: 'official-source',
    },
  };

  // 1. Cultivo con foto propia -> gana coverPhotoUrl
  {
    const crop: Cultivation = {
      id: 'crop-1',
      userId: 'user-1',
      name: 'Mi Cultivo Propio',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 2,
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      coverPhotoUrl: 'https://images.unsplash.com/photo-propia.jpg',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(crop, catalogPhotosFixture);
    assert(res.displayPhotoUrl === 'https://images.unsplash.com/photo-propia.jpg', '1. Cultivo con foto propia gana coverPhotoUrl');
    assert(res.source === 'cover', '1b. Fuente es cover');
    assert(res.isReferencePhoto === false, '6. Cover propia NO muestra "Foto de referencia"');
  }

  // 2. Cultivo sin foto propia + genética con foto -> catálogo
  {
    const crop: Cultivation = {
      id: 'crop-2',
      userId: 'user-1',
      name: 'Cultivo Skunk',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      currentStage: 'Floración',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(crop, catalogPhotosFixture);
    assert(res.displayPhotoUrl === 'https://storage.googleapis.com/test-bucket/skunk1.webp', '2. Cultivo sin foto propia resuelve foto del catálogo');
    assert(res.source === 'catalog', '2b. Fuente es catálogo');
    assert(res.isReferencePhoto === true, '5. Foto catálogo muestra "Foto de referencia"');
  }

  // 3. Cultivo sin ninguna foto -> layout normal sin placeholder obligatorio
  {
    const crop: Cultivation = {
      id: 'crop-3',
      userId: 'user-1',
      name: 'Cultivo Sin Foto',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'NN Desconocida',
      seedBank: 'Banco Desconocido',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(crop, catalogPhotosFixture);
    assert(res.displayPhotoUrl === undefined, '3. Cultivo sin ninguna foto tiene displayPhotoUrl undefined');
    assert(res.source === 'none', '3b. Fuente es none');
    assert(res.isReferencePhoto === false, '3c. isReferencePhoto es false');
  }

  // 4. Cultivo existente resuelto por seedBank/name
  {
    const crop: Cultivation = {
      id: 'crop-4',
      userId: 'user-1',
      name: 'Cultivo Barney',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Gorilla Zkittlez',
      seedBank: "Barney's Farm",
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(crop, catalogPhotosFixture);
    assert(res.displayPhotoUrl === 'https://storage.googleapis.com/test-bucket/gorilla.webp', '4. Cultivo existente resuelto por seedBank/name canónico');
  }

  // 5 & 6. Distinción foto catálogo muestra "Foto de referencia" y cover propia NO la muestra
  {
    const cropWithCover: Cultivation = {
      id: 'crop-5a',
      userId: 'user-1',
      name: 'Cultivo Con Cover',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      coverPhotoUrl: 'https://images.unsplash.com/cover.jpg',
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const resCover = resolveCultivationDisplayPhoto(cropWithCover, catalogPhotosFixture);
    assert(resCover.isReferencePhoto === false, '6. Cover propia NO activa isReferencePhoto');

    const cropCatalog: Cultivation = {
      id: 'crop-5b',
      userId: 'user-1',
      name: 'Cultivo Con Catalogo',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const resCat = resolveCultivationDisplayPhoto(cropCatalog, catalogPhotosFixture);
    assert(resCat.isReferencePhoto === true, '5. Foto catálogo muestra isReferencePhoto true');
  }

  // 7. Múltiples genéticas no atribuyen incorrectamente una foto
  {
    const cropMulti: Cultivation = {
      id: 'crop-multi',
      userId: 'user-1',
      name: 'Carpa Mixta',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 3,
      geneticsList: [
        { id: 'g1', name: 'Skunk #1', seedBank: 'Sensi Seeds', plantCount: 2 },
        { id: 'g2', name: 'Desconocida NN', seedBank: 'Banco Desconocido', plantCount: 1 },
      ],
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const resMulti = resolveCultivationDisplayPhoto(cropMulti, catalogPhotosFixture);
    assert(resMulti.hasMultipleGenetics === true, '7a. hasMultipleGenetics es true');
    assert(resMulti.totalGeneticsCount === 2, '7b. totalGeneticsCount es 2');
    assert(resMulti.individualGeneticsPhotos.length === 1, '7c. individualGeneticsPhotos contiene solo la foto existente');
    assert(resMulti.individualGeneticsPhotos[0].name === 'Skunk #1', '7d. La foto resuelta está atribuida a Skunk #1 y no a todas');
  }

  // 8. Fallo/carga de foto no rompe el hero en CultivationDetailView
  {
    const cropWithoutPhoto: Cultivation = {
      id: 'crop-empty',
      userId: 'user-1',
      name: 'Hero Resiliente',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(CultivationDetailView, {
          cultivation: cropWithoutPhoto,
          userId: 'user-1',
          waterings: [],
          envRecords: [],
          photos: [],
          diaryEntries: [],
          onBack: () => {},
          onEditCultivation: () => {},
          onDeleteCultivation: () => {},
          onOpenWateringModal: () => {},
          onOpenEnvModal: () => {},
          onOpenPhotoModal: () => {},
          onOpenDiaryModal: () => {},
          onHarvestFinalized: () => {},
        })
      );
    });

    const titleEl = container.querySelector('h1');
    assert(titleEl !== null && titleEl.textContent === 'Hero Resiliente', '8. El hero renderiza sin romper cuando no hay foto');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  }

  // 9. CultivationDetailView con foto del catálogo muestra "Foto de referencia"
  {
    const cropWithCatalogPhoto: Cultivation = {
      id: 'crop-with-catalog',
      userId: 'user-1',
      name: 'Hero con Foto de Catálogo',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      currentStage: 'Floración',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(CultivationDetailView, {
          cultivation: cropWithCatalogPhoto,
          catalogPhotos: catalogPhotosFixture,
          userId: 'user-1',
          waterings: [],
          envRecords: [],
          photos: [],
          diaryEntries: [],
          onBack: () => {},
          onEditCultivation: () => {},
          onDeleteCultivation: () => {},
          onOpenWateringModal: () => {},
          onOpenEnvModal: () => {},
          onOpenPhotoModal: () => {},
          onOpenDiaryModal: () => {},
          onHarvestFinalized: () => {},
        })
      );
    });

    const heroImg = container.querySelector('div[data-testid="cultivation-header-photo-container"] img');
    assert(heroImg !== null, '9a. Hero card renderiza imagen');
    const refBadge = container.querySelector('[data-testid="reference-photo-badge"]');
    assert(refBadge !== null && refBadge.textContent?.includes('Foto de referencia'), '9b. Hero card muestra badge "✨ Foto de referencia"');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  }

  // 10. Renderizado de CultivationCard con miniatura
  {
    const cropWithPhoto: Cultivation = {
      id: 'crop-card-test',
      userId: 'user-1',
      name: 'Cultivo con Miniatura',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Skunk #1',
      seedBank: 'Sensi Seeds',
      currentStage: 'Floración',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const cardContainer = document.createElement('div');
    document.body.appendChild(cardContainer);
    const root = createRoot(cardContainer);

    await act(async () => {
      root.render(
        React.createElement(CultivationCard, {
          cultivation: cropWithPhoto,
          catalogPhotos: catalogPhotosFixture,
        })
      );
    });

    const thumbImg = cardContainer.querySelector('img[data-testid="cultivation-card-thumbnail"]');
    assert(thumbImg !== null, '10a. CultivationCard renderiza miniatura compacta');
    assert(thumbImg?.getAttribute('src') === 'https://storage.googleapis.com/test-bucket/skunk1.webp', '10b. Miniatura tiene la URL correcta');

    await act(async () => {
      root.unmount();
    });
    cardContainer.remove();
  }

  // =========================================================================
  // NUEVAS PRUEBAS ESTRICTAS: PREVENCIÓN DE ATRIBUCIÓN CRUZADA ENTRE BANCOS
  // =========================================================================

  // Test 11: Mismo nombre en dos seed banks -> no resolver por nombre ambiguo si seedBank está vacío
  {
    const cropAmbiguous: Cultivation = {
      id: 'crop-ambiguous',
      userId: 'user-1',
      name: 'Amnesia Desconocida',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Amnesia Haze',
      seedBank: '', // Banco no especificado
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(cropAmbiguous, catalogPhotosFixture);
    assert(res.displayPhotoUrl === undefined, '11. Mismo nombre en dos seed banks sin banco -> no resolver por nombre ambiguo (displayPhotoUrl undefined)');
    assert(res.source === 'none', '11b. Fuente permanece none');
  }

  // Test 12: SeedBank incorrecto + mismo nombre existente en otro banco -> NO foto
  {
    const cropWrongBank: Cultivation = {
      id: 'crop-wrong-bank',
      userId: 'user-1',
      name: 'Amnesia de Banco Inventado',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Amnesia Haze',
      seedBank: 'Banco Inexistente', // El catálogo tiene Amnesia Haze en RQS y Soma, pero NO en este banco
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(cropWrongBank, catalogPhotosFixture);
    assert(res.displayPhotoUrl === undefined, '12. seedBank incorrecto + mismo nombre existente en otro banco -> NO foto (cero atribución cruzada)');
    assert(res.source === 'none', '12b. No rellena foto de otro banco');
  }

  // Test 13: SeedBank vacío + una ÚNICA coincidencia -> SÍ resuelve
  {
    const cropSingleMatch: Cultivation = {
      id: 'crop-single-match',
      userId: 'user-1',
      name: 'Mi Cream Caramel',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Cream Caramel', // Solo existe en Sweet Seeds en el catálogo
      seedBank: '',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(cropSingleMatch, catalogPhotosFixture);
    assert(res.displayPhotoUrl === 'https://storage.googleapis.com/test-bucket/sweet-caramel.webp', '13. seedBank vacío + una única coincidencia -> resuelve foto correctamente');
    assert(res.source === 'catalog', '13b. Fuente resuelta es catalog');
  }

  // Test 14: SeedBank vacío + dos coincidencias -> NO foto
  {
    const cropTwoMatches: Cultivation = {
      id: 'crop-two-matches',
      userId: 'user-1',
      name: 'Amnesia Sin Banco',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'amnesia-haze', // Probar normalización con slug
      seedBank: '',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const res = resolveCultivationDisplayPhoto(cropTwoMatches, catalogPhotosFixture);
    assert(res.displayPhotoUrl === undefined, '14. seedBank vacío + dos coincidencias -> NO foto');
  }

  // Test 15: Key exacta seedBank + name -> sigue resolviendo normalmente
  {
    const cropExactRqs: Cultivation = {
      id: 'crop-exact-rqs',
      userId: 'user-1',
      name: 'Amnesia RQS Oficial',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Amnesia Haze',
      seedBank: 'Royal Queen Seeds',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const resRqs = resolveCultivationDisplayPhoto(cropExactRqs, catalogPhotosFixture);
    assert(resRqs.displayPhotoUrl === 'https://storage.googleapis.com/test-bucket/rqs-amnesia.webp', '15a. Key exacta RQS + Amnesia Haze resuelve foto exacta de RQS');

    const cropExactSoma: Cultivation = {
      id: 'crop-exact-soma',
      userId: 'user-1',
      name: 'Amnesia Soma Oficial',
      startDate: '2026-01-01',
      type: 'Indoor',
      plantCount: 1,
      geneticsName: 'Amnesia Haze',
      seedBank: 'Soma Seeds',
      currentStage: 'Vegetativo',
      stageStartDate: '2026-01-01',
      substrate: { type: 'Sustrato', potVolumeLiters: 11, potType: 'Geotextil' },
      status: 'ESTABLE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const resSoma = resolveCultivationDisplayPhoto(cropExactSoma, catalogPhotosFixture);
    assert(resSoma.displayPhotoUrl === 'https://storage.googleapis.com/test-bucket/soma-amnesia.webp', '15b. Key exacta Soma + Amnesia Haze resuelve foto exacta de Soma');
  }

  console.log('\n------------------------------------------------------------');
  console.log(`TOTAL PASSED:  ${passedCount}`);
  console.log(`TOTAL FAILED:  ${failedCount}`);
  console.log('------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal error en test suite:', e);
  process.exit(1);
});
