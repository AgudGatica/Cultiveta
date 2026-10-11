import { Cultivation, CultivationGeneticsItem, GeneticsCatalogPhoto } from '../types';
import { getGeneticsPhotoKey, normalizeGeneticsSlug } from './geneticsKeyUtils';

export interface ResolvedGeneticsPhotoItem {
  name: string;
  seedBank?: string;
  photoUrl: string;
  source: 'catalog' | 'persisted';
  badgeLabel?: string;
}

export interface CultivationPhotoResolution {
  /** URL final de la foto principal o portada */
  displayPhotoUrl?: string;
  /** Origen de la foto principal */
  source: 'cover' | 'catalog' | 'persisted' | 'none';
  /** Si debe mostrar la insignia '✨ Foto de referencia' */
  isReferencePhoto: boolean;
  /** Si existen múltiples genéticas en este cultivo */
  hasMultipleGenetics: boolean;
  /** Total de variedades/genéticas registradas */
  totalGeneticsCount: number;
  /** Fotos resueltas individualmente por cada genética (máximo 2 o 3 para composición) */
  individualGeneticsPhotos: ResolvedGeneticsPhotoItem[];
}

/**
 * Resuelve la identidad fotográfica de un cultivo según las reglas de prioridad:
 * 1. cultivation.coverPhotoUrl (foto propia del cultivo - gana con máxima prioridad, sin badge de referencia)
 * 2. Catálogo oficial de genéticas (geneticsCatalogPhotos):
 *    - Si hay seedBank + geneticsName:
 *      resolver ÚNICAMENTE mediante getGeneticsPhotoKey(seedBank, geneticsName).
 *      Si no existe esa key exacta, NO buscar por nombre solamente (evita atribución cruzada entre bancos).
 *    - Sólo permitir fallback por nombre si seedBank está vacío o ausente:
 *      normalizar el nombre con normalizeGeneticsSlug(...) y recopilar todas las entradas coincidentes.
 *      Usar la foto solamente si existe EXACTAMENTE 1 coincidencia.
 *      Si existen 0 o más de 1, devolver sin foto.
 *    - Nunca usar una foto de otro seedBank para “rellenar” una coincidencia faltante.
 * 3. geneticsPhotoUrl persistida en el cultivo o en su genética asociada
 * 4. undefined (sin placeholder obligatorio, preserva el layout)
 *
 * Múltiples genéticas:
 * - Si hay una sola genética: se muestra su fotografía normalmente.
 * - Si hay varias: se resuelven individualmente, indicando claramente la multiplicidad sin atribuir
 *   falsamente una foto a todas las genéticas.
 */
export function resolveCultivationDisplayPhoto(
  cultivation: Cultivation,
  catalogPhotos: Record<string, GeneticsCatalogPhoto> = {}
): CultivationPhotoResolution {
  // 1. Prioridad Máxima: coverPhotoUrl propia del cultivo
  if (cultivation.coverPhotoUrl && cultivation.coverPhotoUrl.trim() !== '') {
    return {
      displayPhotoUrl: cultivation.coverPhotoUrl.trim(),
      source: 'cover',
      isReferencePhoto: false,
      hasMultipleGenetics: Boolean(cultivation.geneticsList && cultivation.geneticsList.length > 1),
      totalGeneticsCount: cultivation.geneticsList && cultivation.geneticsList.length > 0
        ? cultivation.geneticsList.length
        : 1,
      individualGeneticsPhotos: [],
    };
  }

  // Normalizar lista de genéticas del cultivo
  const rawList: CultivationGeneticsItem[] = Array.isArray(cultivation.geneticsList) && cultivation.geneticsList.length > 0
    ? cultivation.geneticsList
    : [];

  const effectiveGeneticsList: Array<{ name: string; seedBank?: string; persistedPhotoUrl?: string }> = [];

  if (rawList.length > 0) {
    for (const item of rawList) {
      if (item && item.name && item.name.trim() !== '') {
        const itemBank = (item.seedBank && item.seedBank.trim()) || (cultivation.seedBank && cultivation.seedBank.trim()) || '';
        effectiveGeneticsList.push({
          name: item.name.trim(),
          seedBank: itemBank,
          persistedPhotoUrl: (item as any).geneticsPhotoUrl || (item as any).photoUrl || '',
        });
      }
    }
  } else if (cultivation.geneticsName && cultivation.geneticsName.trim() !== '') {
    effectiveGeneticsList.push({
      name: cultivation.geneticsName.trim(),
      seedBank: (cultivation.seedBank && cultivation.seedBank.trim()) || '',
      persistedPhotoUrl: (cultivation as any).geneticsPhotoUrl || '',
    });
  }

  const totalGeneticsCount = effectiveGeneticsList.length;
  const hasMultipleGenetics = totalGeneticsCount > 1;

  // Resolver individualmente fotos de cada genética
  const resolvedGeneticsPhotos: ResolvedGeneticsPhotoItem[] = [];

  for (const gen of effectiveGeneticsList) {
    let photoUrl: string | undefined = undefined;
    let source: 'catalog' | 'persisted' = 'catalog';

    const hasSeedBank = Boolean(gen.seedBank && gen.seedBank.trim() !== '');

    if (hasSeedBank) {
      // 1. Regla obligatoria: Si hay seedBank + geneticsName -> ÚNICAMENTE key exacta
      const key = getGeneticsPhotoKey(gen.seedBank!, gen.name);
      const catalogEntry = catalogPhotos[key];
      if (catalogEntry && catalogEntry.photoUrl) {
        photoUrl = catalogEntry.photoUrl;
        source = 'catalog';
      }
      // Si no existe esa key exacta, NO buscar por nombre solamente. Nunca rellenar con otro banco.
    } else {
      // 2. Sólo permitir fallback por nombre si seedBank está vacío
      if (gen.name && gen.name.trim() !== '') {
        const targetSlug = normalizeGeneticsSlug(gen.name);
        const matchingEntries: GeneticsCatalogPhoto[] = [];

        for (const catKey of Object.keys(catalogPhotos)) {
          const entry = catalogPhotos[catKey];
          if (entry && entry.name && normalizeGeneticsSlug(entry.name) === targetSlug && entry.photoUrl) {
            matchingEntries.push(entry);
          }
        }

        // 3. Usar la foto solamente si existe EXACTAMENTE 1 coincidencia
        if (matchingEntries.length === 1) {
          photoUrl = matchingEntries[0].photoUrl;
          source = 'catalog';
        }
      }
    }

    // 4. geneticsPhotoUrl persistida si existiera
    if (!photoUrl && gen.persistedPhotoUrl && gen.persistedPhotoUrl.trim() !== '') {
      photoUrl = gen.persistedPhotoUrl.trim();
      source = 'persisted';
    }

    if (photoUrl) {
      resolvedGeneticsPhotos.push({
        name: gen.name,
        seedBank: gen.seedBank,
        photoUrl,
        source,
        badgeLabel: '✨ Foto de referencia',
      });
    }
  }

  // Si no hay ninguna foto resuelta
  if (resolvedGeneticsPhotos.length === 0) {
    return {
      displayPhotoUrl: undefined,
      source: 'none',
      isReferencePhoto: false,
      hasMultipleGenetics,
      totalGeneticsCount,
      individualGeneticsPhotos: [],
    };
  }

  // Si hay una sola genética
  if (!hasMultipleGenetics) {
    const primary = resolvedGeneticsPhotos[0];
    return {
      displayPhotoUrl: primary.photoUrl,
      source: primary.source,
      isReferencePhoto: true,
      hasMultipleGenetics: false,
      totalGeneticsCount: 1,
      individualGeneticsPhotos: resolvedGeneticsPhotos,
    };
  }

  // Si hay múltiples genéticas
  return {
    displayPhotoUrl: resolvedGeneticsPhotos[0].photoUrl,
    source: resolvedGeneticsPhotos[0].source,
    isReferencePhoto: true,
    hasMultipleGenetics: true,
    totalGeneticsCount,
    // Tomamos como máximo 2 o 3 para composición visual simple
    individualGeneticsPhotos: resolvedGeneticsPhotos.slice(0, 3),
  };
}
