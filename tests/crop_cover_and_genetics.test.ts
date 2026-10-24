/**
 * tests/crop_cover_and_genetics.test.ts
 *
 * SUITE: PORTADA FIJA (INTERIOR / EXTERIOR) Y GENÉTICAS DENTRO DEL CULTIVO
 *
 * 1. Interior → portada de interior; exterior e invernadero → portada de exterior.
 * 2. La tarjeta del Inicio usa esa portada con proporción fija 2:1.
 * 3. Genética del catálogo (banco + nombre): dominancia, rinde, floración y aroma del catálogo.
 * 4. Varias genéticas con plantas por genética.
 * 5. Genética guardada por la persona (fuera del catálogo): foto, aroma y floración propios.
 * 6. Sin banco: se completa con el catálogo solo si el nombre es único.
 * 7. Sin genética cargada: no se muestra la sección.
 * 8. La sección del detalle muestra la tarjeta de Genéticas con las plantas del cultivo.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation, Genetics } from '../src/types';
import { CROP_COVER_IMAGES, getCropCoverImage, getCropCoverKind } from '../src/utils/cropCardInfo';
import { resolveCropGenetics } from '../src/utils/cropGenetics';
import { GENETICS_DATABASE } from '../src/data/predefinedGenetics';
import { ActiveCropCard } from '../src/components/dashboard/ActiveCropCard';
import { CropGeneticsSection } from '../src/components/cultivations/CropGeneticsSection';

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

function crop(partial: Partial<Cultivation> & { id: string }): Cultivation {
  return {
    userId: 'user_1',
    name: partial.id,
    type: 'Indoor',
    plantCount: 1,
    startDate: '2026-09-01',
    currentStage: 'Vegetativo',
    stageStartDate: '2026-09-10',
    substrate: { type: 'Tierra', potVolumeLiters: 11, potType: 'Plástico' },
    status: 'ESTABLE',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const skunk = GENETICS_DATABASE.find((g) => g.name === 'Skunk #1' && g.seedBank === 'Sensi Seeds')!;
const superSkunk = GENETICS_DATABASE.find((g) => g.name === 'Super Skunk' && g.seedBank === 'Sensi Seeds')!;

async function run() {
  console.log('\n================================================================');
  console.log('   PORTADA FIJA Y GENÉTICAS DENTRO DEL CULTIVO');
  console.log('================================================================\n');

  await check('1. Interior → interior; exterior e invernadero → exterior', () => {
    assert(getCropCoverKind({ type: 'Indoor' }) === 'interior', 'interior');
    assert(getCropCoverKind({ type: 'Outdoor' }) === 'exterior', 'exterior');
    assert(getCropCoverKind({ type: 'Invernadero' }) === 'exterior', 'invernadero');
    assert(getCropCoverImage({ type: 'Outdoor' }) === CROP_COVER_IMAGES.exterior, 'ruta de exterior');
  });

  const container = document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(React.Fragment, null,
        React.createElement(ActiveCropCard, { cultivation: crop({ id: 'in', type: 'Indoor' }), onOpen: () => {} }),
        React.createElement(ActiveCropCard, { cultivation: crop({ id: 'out', type: 'Outdoor' }), onOpen: () => {} })
      )
    );
  });

  await check('2. La tarjeta del Inicio usa la portada fija con proporción 2:1', () => {
    const inCover = container.querySelector('[data-crop-card="in"] [data-cover]') as HTMLElement;
    const outCover = container.querySelector('[data-crop-card="out"] [data-cover]') as HTMLElement;
    assert(inCover?.dataset.cover === 'interior' && outCover?.dataset.cover === 'exterior', 'tipo de portada');
    assert(inCover.className.includes('aspect-[2/1]'), `clases: ${inCover.className}`);
    assert(inCover.querySelector('img')?.getAttribute('src') === CROP_COVER_IMAGES.interior, 'imagen de interior');
    assert(outCover.querySelector('img')?.getAttribute('src') === CROP_COVER_IMAGES.exterior, 'imagen de exterior');
  });

  await act(async () => root.unmount());

  await check('3. Genética del catálogo: datos de la tarjeta de Genéticas', () => {
    const [g] = resolveCropGenetics(crop({ id: 'c', geneticsName: 'Skunk #1', seedBank: 'Sensi Seeds', plantCount: 3 }), [], {
      'sensi-seeds__skunk-1': { key: 'sensi-seeds__skunk-1', seedBank: 'Sensi Seeds', name: 'Skunk #1', photoUrl: 'https://x/skunk.jpg', storagePath: '', updatedAt: '' },
    });
    assert(g.source === 'catalog', `origen: ${g.source}`);
    assert(g.dominance === skunk.dominance && g.estimatedYield === skunk.estimatedYield, 'dominancia y rinde');
    assert(g.floweringDays === skunk.floweringDays && g.organolepticProfile === skunk.organolepticProfile, 'floración y aroma');
    assert(g.photoUrl === 'https://x/skunk.jpg', `foto: ${g.photoUrl}`);
    assert(g.plantCount === 3, 'plantas');
  });

  await check('4. Varias genéticas con plantas por genética', () => {
    const cards = resolveCropGenetics(
      crop({
        id: 'multi',
        geneticsList: [
          { id: 'a', name: 'Skunk #1', seedBank: 'Sensi Seeds', plantCount: 2 },
          { id: 'b', name: 'Super Skunk', seedBank: 'Sensi Seeds', plantCount: 1 },
        ],
      })
    );
    assert(cards.length === 2, `tarjetas: ${cards.length}`);
    assert(cards[0].plantCount === 2 && cards[1].plantCount === 1, 'plantas por genética');
    assert(cards[1].dominance === superSkunk.dominance, 'segunda genética del catálogo');
  });

  await check('5. Genética guardada fuera del catálogo: foto, aroma y floración propios', () => {
    const saved: Genetics = {
      id: 'g_custom', userId: 'user_1', name: 'Mi Cruza', seedBank: 'Casera', photoperiodType: 'Fotoperiódica',
      declaredFloweringDays: 63, expectedAroma: 'Lima', expectedFlavor: 'Pino', sativaIndicaRatio: '60% Índica',
      photoUrl: 'https://x/cruza.jpg', createdAt: '', updatedAt: '',
    };
    const [g] = resolveCropGenetics(crop({ id: 'c', geneticsName: 'Mi Cruza', geneticsId: 'g_custom' }), [saved]);
    assert(g.source === 'saved', `origen: ${g.source}`);
    assert(g.seedBank === 'Casera' && g.photoUrl === 'https://x/cruza.jpg', 'banco y foto');
    assert(g.floweringDays === '63' && g.organolepticProfile === 'Lima · Pino' && g.dominance === '60% Índica', 'datos propios');
    assert(g.estimatedYield === null, 'sin rinde inventado');
  });

  await check('6. Sin banco: el catálogo solo completa si el nombre es único', () => {
    const counts = new Map<string, number>();
    GENETICS_DATABASE.forEach((g) => counts.set(g.name, (counts.get(g.name) || 0) + 1));
    const unique = GENETICS_DATABASE.find((g) => counts.get(g.name) === 1)!;
    const [u] = resolveCropGenetics(crop({ id: 'u', geneticsName: unique.name }));
    assert(u.source === 'catalog' && u.seedBank === unique.seedBank, `${unique.name}: ${u.source} / ${u.seedBank}`);
    const [x] = resolveCropGenetics(crop({ id: 'x', geneticsName: 'Genética Inventada 123' }));
    assert(x.source === 'crop' && x.dominance === null && x.floweringDays === null, 'sin datos inventados');
  });

  await check('7. Sin genética cargada no hay tarjetas', () => {
    assert(resolveCropGenetics(crop({ id: 'none' })).length === 0, 'debería estar vacío');
  });

  const root2 = createRoot(container);
  await act(async () => {
    root2.render(
      React.createElement(CropGeneticsSection, {
        cultivation: crop({
          id: 'multi',
          geneticsList: [
            { id: 'a', name: 'Skunk #1', seedBank: 'Sensi Seeds', plantCount: 2 },
            { id: 'b', name: 'Super Skunk', seedBank: 'Sensi Seeds', plantCount: 1 },
          ],
        }),
        catalogPhotos: {},
      })
    );
  });

  await check('8. La sección del detalle muestra las tarjetas de Genéticas con sus plantas', () => {
    const section = container.querySelector('#crop-genetics-section');
    assert(section, 'falta la sección');
    const text = section.textContent || '';
    assert(text.includes('Genéticas (2)'), 'título');
    assert(text.includes('Skunk #1') && text.includes('Super Skunk') && text.includes('Sensi Seeds'), 'nombres y banco');
    assert(text.includes('AROMA Y GUSTO') && text.includes(`${skunk.estimatedYield} g/m²`), 'mismos bloques que Genéticas');
    assert(text.includes('2 plantas en este cultivo') && text.includes('1 planta en este cultivo'), 'plantas');
    assert(!text.includes('Iniciar Cultivo'), 'no ofrece iniciar otro cultivo');
  });

  await act(async () => root2.unmount());

  console.log('\n================================================================');
  console.log(` RESULTADO PORTADA Y GENÉTICAS: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en crop_cover_and_genetics:', err);
  process.exit(1);
});
