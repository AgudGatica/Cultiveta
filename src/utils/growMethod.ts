/**
 * Cómo se cultiva, que cambia cómo se riega:
 * - tierra con fertilizantes y coco o sustrato: pH y EC en cada riego;
 * - living soil (tierra viva): solo agua; la tierra y su vida regulan el pH y dan los nutrientes;
 * - hidroponía: se controla un tanque de solución (pH y EC todos los días, cambio cada 2 semanas).
 * Los cultivos que no lo tienen elegido lo deducen del texto del sustrato.
 */
import type { Cultivation, GrowMethod } from '../types';

export const GROW_METHODS: Array<{ id: GrowMethod; label: string; desc: string }> = [
  { id: 'tierra', label: 'Tierra con fertilizantes', desc: 'Regás con nutrientes: pH y EC en cada riego.' },
  { id: 'living_soil', label: 'Living soil', desc: 'Tierra viva: solo agua, se alimenta la tierra.' },
  { id: 'sustrato', label: 'Coco o sustrato', desc: 'Coco, turba o perlita: pH y EC en cada riego.' },
  { id: 'hidro', label: 'Hidroponía', desc: 'Tanque de solución: pH y EC todos los días.' },
];

export const GROW_METHOD_LABEL: Record<GrowMethod, string> = {
  tierra: 'tierra',
  living_soil: 'living soil',
  sustrato: 'sustrato',
  hidro: 'hidroponía',
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Lo que se deduce del texto del sustrato ("Coco", "Living soil", "DWC"…). */
export function growMethodFromText(substrateType: string | undefined): GrowMethod {
  const s = norm(substrateType || '');
  if (/living|super ?soil|tierra viva|no[- ]?till|organico vivo|suelo vivo/.test(s)) return 'living_soil';
  if (/hidro|hydro|aero|dwc|rdwc|nft|ebb|flujo y reflujo/.test(s)) return 'hidro';
  if (/coco|turba|perlita|lana de roca|rockwool|vermiculita|sustrato sin tierra/.test(s)) return 'sustrato';
  return 'tierra';
}

/** El método del cultivo: el elegido o, si no hay, el que dice su sustrato. */
export function growMethodOf(crop: Pick<Cultivation, 'growMethod' | 'substrate'>): GrowMethod {
  return crop.growMethod || growMethodFromText(crop.substrate?.type);
}
