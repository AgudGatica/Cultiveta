/**
 * Ambientes (en el código "indoors"): carpas, salas y armarios, o lugares de exterior (patio, balcón,
 * terraza, invernadero). Cuentas y armado de datos que no dependen de Firestore. Los cultivos de un
 * ambiente interior comparten su luz; el resto (plantas, genéticas, etapas) sigue siendo de cada cultivo.
 */
import type { Cultivation, CultivationType, Genetics, GeneticsCatalogPhoto, Indoor, IndoorKind } from '../types';
import { CROP_COVER_IMAGES, getCropDayLabel, isCropFinished } from './cropCardInfo';
import { resolveCropGenetics, type CropGeneticsCard } from './cropGenetics';
import { buildCultivationStageSchedule } from './growthStageUtils';

export type AmbientEnvironment = 'indoor' | 'exterior';

export const AMBIENT_KINDS: Record<AmbientEnvironment, Partial<Record<IndoorKind, string>>> = {
  indoor: { carpa: 'Carpa', sala: 'Sala', armario: 'Armario' },
  exterior: { patio: 'Patio', balcon: 'Balcón', terraza: 'Terraza', invernadero: 'Invernadero' },
};
/** Nombre de cada tipo (interior o exterior). */
export const INDOOR_KINDS: Record<IndoorKind, string> = { ...AMBIENT_KINDS.indoor, ...AMBIENT_KINDS.exterior } as Record<IndoorKind, string>;

/** Interior o exterior (los ambientes viejos, sin el dato, son interiores). */
export const ambientEnvironment = (a: Pick<Indoor, 'environment'>): AmbientEnvironment => (a.environment === 'exterior' ? 'exterior' : 'indoor');
export const isExteriorAmbient = (a: Pick<Indoor, 'environment'>) => ambientEnvironment(a) === 'exterior';
/** La foto de portada: la de interior o la de exterior (las mismas de los cultivos). */
export const ambientCoverImage = (a: Pick<Indoor, 'environment'>) => CROP_COVER_IMAGES[isExteriorAmbient(a) ? 'exterior' : 'interior'];
/** Interior/exterior de un tipo de cultivo. */
export const environmentForCropType = (t: CultivationType | undefined): AmbientEnvironment => (t === 'Outdoor' || t === 'Invernadero' ? 'exterior' : 'indoor');
/** Tipo de cultivo que corresponde a un ambiente (para crear cultivos adentro). */
export const cropTypeForAmbient = (a: Pick<Indoor, 'environment' | 'kind'>): CultivationType => (!isExteriorAmbient(a) ? 'Indoor' : a.kind === 'invernadero' ? 'Invernadero' : 'Outdoor');

/** Los cultivos con la luz del ambiente interior donde están (el resto, tal cual). */
export function withIndoorLighting(crops: Cultivation[], indoors: Indoor[]): Cultivation[] {
  if (!indoors.length) return crops;
  const byId = new Map(indoors.map((i) => [i.id, i]));
  return crops.map((c) => {
    const indoor = c.indoorId ? byId.get(c.indoorId) : undefined;
    return indoor?.lighting && !isExteriorAmbient(indoor) ? { ...c, lighting: indoor.lighting } : c;
  });
}

/** Cultivos activos de un ambiente (los terminados quedan en su historial). */
export const cropsInIndoor = (crops: Cultivation[], indoorId: string) => crops.filter((c) => c.indoorId === indoorId && !isCropFinished(c));

/** Cultivos activos sin ambiente (se les arma uno solo). */
export const cropsWithoutAmbient = (crops: Cultivation[]) => crops.filter((c) => !c.indoorId && !isCropFinished(c));

/** Ambientes a los que se puede mover un cultivo: los de su mismo tipo (interior o exterior). */
export const ambientsForCrop = (crop: Pick<Cultivation, 'type'>, ambients: Indoor[]) => ambients.filter((a) => ambientEnvironment(a) === environmentForCropType(crop.type));

/** Id fijo del ambiente que se arma para un cultivo suelto: si dos dispositivos lo hacen a la vez, no se duplica. */
export const autoAmbientId = (cropId: string) => `auto_${cropId}`;

/** El ambiente que se arma para un cultivo que no está en ninguno: con su nombre, interior o exterior, y su luz. */
export function ambientForCrop(crop: Cultivation): Omit<Indoor, 'id' | 'createdAt' | 'updatedAt'> {
  const environment = environmentForCropType(crop.type);
  return {
    userId: crop.userId,
    name: crop.name,
    environment,
    kind: environment === 'indoor' ? 'carpa' : crop.type === 'Invernadero' ? 'invernadero' : 'patio',
    ...(environment === 'indoor' && crop.lighting ? { lighting: crop.lighting } : {}),
    ...(crop.isDemo ? { isDemo: true } : {}),
  };
}

export interface IndoorGenetic {
  name: string;
  plants: number;
  crops: string[];
}

/** Todas las genéticas de adentro, con cuántas plantas hay de cada una y en qué cultivos. */
export function indoorGenetics(crops: Cultivation[]): IndoorGenetic[] {
  const map = new Map<string, IndoorGenetic>();
  const add = (name: string, plants: number, crop: string) => {
    const key = name.trim().toLowerCase();
    const g = map.get(key) || { name: name.trim(), plants: 0, crops: [] };
    g.plants += plants;
    if (!g.crops.includes(crop)) g.crops.push(crop);
    map.set(key, g);
  };
  for (const c of crops) {
    const list = (c.geneticsList || []).filter((g) => g.name?.trim());
    if (list.length) list.forEach((g) => add(g.name, Math.max(1, g.plantCount || 1), c.name));
    else add(c.geneticsName?.trim() || 'Genética sin cargar', Math.max(1, c.plantCount || 1), c.name);
  }
  return [...map.values()].sort((a, b) => b.plants - a.plants || a.name.localeCompare(b.name));
}

/** Un cultivo mirado desde una sola de sus genéticas (su floración, su tipo y sus plantas). */
export function cropForGenetic(crop: Cultivation, index: number): Cultivation {
  const list = (crop.geneticsList || []).filter((g) => g.name?.trim());
  const g = list[index];
  if (!g) return crop;
  return {
    ...crop,
    geneticsId: g.geneticsId,
    geneticsName: g.name,
    seedBank: g.seedBank || crop.seedBank,
    photoperiodType: g.photoperiodType || crop.photoperiodType,
    declaredFloweringWeeks: g.declaredFloweringWeeks || crop.declaredFloweringWeeks,
    plantCount: g.plantCount || crop.plantCount,
    geneticsList: [g],
  };
}

export interface GeneticEntry {
  /** Cultivo al que pertenece y posición de la genética en él. */
  crop: Cultivation;
  index: number;
  card: CropGeneticsCard;
  plants: number;
  stage: string;
  dayLabel: string;
  /** Días que faltan para cortar (0 = lista) y fecha estimada (YYYY-MM-DD). */
  daysToHarvest: number;
  harvestDate: string;
}

/** Las genéticas de un ambiente, cada una con su foto, sus plantas y cuánto le falta para cortar. */
export function geneticEntries(crops: Cultivation[], saved: Genetics[] = [], photos: Record<string, GeneticsCatalogPhoto> = {}): GeneticEntry[] {
  const out: GeneticEntry[] = [];
  for (const crop of crops) {
    resolveCropGenetics(crop, saved, photos).forEach((card, index) => {
      const one = cropForGenetic(crop, index);
      const schedule = buildCultivationStageSchedule(one, saved);
      out.push({
        crop,
        index,
        card,
        plants: Math.max(1, card.plantCount || one.plantCount || 1),
        stage: crop.currentStage || schedule.activeStage?.name || 'Vegetativo',
        dayLabel: getCropDayLabel(one, saved),
        daysToHarvest: schedule.daysUntilHarvest,
        harvestDate: schedule.estimatedHarvestDate,
      });
    });
  }
  return out.sort((a, b) => a.daysToHarvest - b.daysToHarvest || a.card.name.localeCompare(b.card.name));
}

/** "Faltan 23 días para cortar" / "Lista para cortar". */
export const harvestText = (days: number) => (days <= 0 ? 'Lista para cortar' : days === 1 ? 'Falta 1 día para cortar' : `Faltan ${days} días para cortar`);

/** Volumen (m³) y watts por m² de piso, si están las medidas (y los watts de la luz). */
export function indoorMetrics(indoor: Pick<Indoor, 'widthCm' | 'depthCm' | 'heightCm' | 'lighting'>): { areaM2: number | null; volumeM3: number | null; wattsPerM2: number | null } {
  const w = Number(indoor.widthCm) || 0;
  const d = Number(indoor.depthCm) || 0;
  const h = Number(indoor.heightCm) || 0;
  const areaM2 = w > 0 && d > 0 ? (w * d) / 10000 : null;
  const volumeM3 = areaM2 && h > 0 ? (areaM2 * h) / 100 : null;
  const watts = indoor.lighting?.usedWatts || indoor.lighting?.nominalWatts || 0;
  return { areaM2, volumeM3, wattsPerM2: areaM2 && watts > 0 ? watts / areaM2 : null };
}

/** "120 × 120 × 200 cm" (lo que haya). */
export function indoorSizeText(indoor: Pick<Indoor, 'widthCm' | 'depthCm' | 'heightCm'>): string {
  const parts = [indoor.widthCm, indoor.depthCm, indoor.heightCm].filter((x) => Number(x) > 0);
  return parts.length ? `${parts.join(' × ')} cm` : '';
}
