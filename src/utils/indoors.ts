/**
 * Indoors (carpas, salas, armarios): cuentas y armado de datos que no dependen de Firestore.
 * Los cultivos de un indoor comparten su luz; el resto (plantas, genéticas, etapas) sigue siendo de
 * cada cultivo.
 */
import type { Cultivation, Indoor, IndoorKind } from '../types';

export const INDOOR_KINDS: Record<IndoorKind, string> = { carpa: 'Carpa', sala: 'Sala', armario: 'Armario' };

/** Los cultivos con la luz del indoor donde están (el resto, tal cual). */
export function withIndoorLighting(crops: Cultivation[], indoors: Indoor[]): Cultivation[] {
  if (!indoors.length) return crops;
  const byId = new Map(indoors.map((i) => [i.id, i]));
  return crops.map((c) => {
    const indoor = c.indoorId ? byId.get(c.indoorId) : undefined;
    return indoor?.lighting ? { ...c, lighting: indoor.lighting } : c;
  });
}

/** Cultivos activos de un indoor (los terminados quedan en su historial). */
export const cropsInIndoor = (crops: Cultivation[], indoorId: string) => crops.filter((c) => c.indoorId === indoorId && !c.isFinished);

/** Cultivos activos que se pueden meter en un indoor: interiores y sin indoor. */
export const looseIndoorCrops = (crops: Cultivation[]) => crops.filter((c) => !c.isFinished && !c.indoorId && c.type === 'Indoor');

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
