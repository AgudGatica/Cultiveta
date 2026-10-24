/**
 * Genéticas de un cultivo con los datos de la tarjeta de la pantalla Genéticas: se buscan en el
 * catálogo (banco + nombre), en las genéticas guardadas por la persona y, si no hay más, se usa lo
 * que tiene el propio cultivo. Módulo puro.
 */
import type { Cultivation, Genetics, GeneticsCatalogPhoto } from '../types';
import { GENETICS_DATABASE, type PredefinedGenetic } from '../data/predefinedGenetics';
import { getGeneticsPhotoKey, normalizeGeneticsSlug } from './geneticsKeyUtils';

export interface CropGeneticsCard {
  key: string;
  name: string;
  seedBank: string;
  dominance: string | null;
  photoUrl: string | null;
  estimatedYield: string | null;
  floweringDays: string | null;
  organolepticProfile: string | null;
  /** Plantas de esta genética en el cultivo (si se sabe). */
  plantCount: number | null;
  photoperiodType: string | null;
  source: 'catalog' | 'saved' | 'crop';
}

const sameGenetics = (a: { name: string; seedBank?: string }, b: { name: string; seedBank?: string }) =>
  normalizeGeneticsSlug(a.name) === normalizeGeneticsSlug(b.name) &&
  normalizeGeneticsSlug(a.seedBank || '') === normalizeGeneticsSlug(b.seedBank || '');

function findCatalog(name: string, seedBank?: string): PredefinedGenetic | null {
  if (!name) return null;
  const exact = GENETICS_DATABASE.find((g) => sameGenetics(g, { name, seedBank }));
  if (exact) return exact;
  // Sin banco cargado: solo si el nombre identifica una única genética del catálogo
  if (!seedBank) {
    const byName = GENETICS_DATABASE.filter((g) => normalizeGeneticsSlug(g.name) === normalizeGeneticsSlug(name));
    return byName.length === 1 ? byName[0] : null;
  }
  return null;
}

function savedFlowering(g: Genetics | undefined, weeks?: number): string | null {
  if (g?.declaredFloweringDays) return String(g.declaredFloweringDays);
  const w = g?.declaredFloweringWeeks || weeks;
  return w ? String(Math.round(w * 7)) : null;
}

function savedAroma(g: Genetics | undefined): string | null {
  const parts = [g?.expectedAroma, g?.expectedFlavor].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function resolveCropGenetics(
  crop: Cultivation,
  savedGenetics: Genetics[] = [],
  catalogPhotos: Record<string, GeneticsCatalogPhoto> = {}
): CropGeneticsCard[] {
  const items =
    crop.geneticsList && crop.geneticsList.length > 0
      ? crop.geneticsList.map((g) => ({
          name: g.name,
          seedBank: g.seedBank || '',
          geneticsId: g.geneticsId,
          plantCount: g.plantCount ?? null,
          photoperiodType: g.photoperiodType || null,
          floweringWeeks: g.declaredFloweringWeeks,
        }))
      : crop.geneticsName
        ? [
            {
              name: crop.geneticsName,
              seedBank: crop.seedBank || '',
              geneticsId: crop.geneticsId,
              plantCount: crop.plantCount ?? null,
              photoperiodType: crop.photoperiodType || null,
              floweringWeeks: crop.declaredFloweringWeeks,
            },
          ]
        : [];

  return items
    .filter((item) => item.name && item.name.trim())
    .map((item, idx) => {
      const saved =
        (item.geneticsId ? savedGenetics.find((g) => g.id === item.geneticsId) : undefined) ||
        savedGenetics.find((g) => sameGenetics(g, item));
      const seedBank = item.seedBank || saved?.seedBank || '';
      const catalog = findCatalog(item.name, seedBank);
      const bank = seedBank || catalog?.seedBank || '';
      const photoKey = getGeneticsPhotoKey(bank, catalog?.name || item.name);
      const photoUrl = saved?.photoUrl || catalogPhotos[photoKey]?.photoUrl || null;

      return {
        key: `${photoKey}_${idx}`,
        name: catalog?.name || item.name,
        seedBank: bank,
        dominance: catalog?.dominance || saved?.sativaIndicaRatio || saved?.dominance || null,
        photoUrl,
        estimatedYield: catalog?.estimatedYield || null,
        floweringDays: catalog?.floweringDays || savedFlowering(saved, item.floweringWeeks),
        organolepticProfile: catalog?.organolepticProfile || savedAroma(saved),
        plantCount: item.plantCount,
        photoperiodType: item.photoperiodType || saved?.photoperiodType || null,
        source: catalog ? 'catalog' : saved ? 'saved' : 'crop',
      } satisfies CropGeneticsCard;
    });
}
