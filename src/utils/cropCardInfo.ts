/**
 * Datos de presentación de las tarjetas de cultivo del Inicio y del historial de Cultivos,
 * y reglas de navegación entre esas pantallas y el detalle. Módulo puro (sin React ni Firebase).
 */
import type { Cultivation, CultivationTask, Genetics, Harvest, PhotoRecord } from '../types';
import { buildCultivationStageSchedule, daysBetween, getLocalTodayDateOnly } from './growthStageUtils';

/** Cultivo terminado (cosechado o finalizado). Antes vivía en CultivationsFilterBar. */
export function isCropFinished(crop: Cultivation): boolean {
  return Boolean(
    crop.isFinished === true ||
      crop.status?.toLowerCase() === 'cosechado' ||
      crop.status?.toLowerCase() === 'finalizado' ||
      crop.currentStage?.toLowerCase() === 'cosechado'
  );
}

/**
 * "Semana X · Día Y" desde el inicio del ciclo. Si el inicio no se conoce (cycleStartKnown false),
 * "Día N de <etapa>" con los días en la etapa actual, como el resto de la app.
 */
export function getCropDayLabel(crop: Cultivation, geneticsList: Genetics[] = [], today: string = getLocalTodayDateOnly()): string {
  const schedule = buildCultivationStageSchedule(crop, geneticsList);
  if (schedule.isCycleStartKnown) {
    const day =
      typeof schedule.totalElapsedDays === 'number' && schedule.totalElapsedDays > 0
        ? schedule.totalElapsedDays
        : Math.max(1, daysBetween(crop.startDate, today) + 1);
    const week = Math.floor((day - 1) / 7) + 1;
    return `Semana ${week} · Día ${day}`;
  }
  const stageName = crop.currentStage || schedule.activeStage?.name || 'la etapa';
  return `Día ${schedule.activeStageElapsedDays || 1} de ${stageName}`;
}

/** Genética para mostrar: el nombre, "N genéticas" si hay varias, o null si no hay dato. */
export function getGeneticsLabel(crop: Pick<Cultivation, 'geneticsName' | 'geneticsList'>): string | null {
  const list = crop.geneticsList || [];
  if (list.length > 1) return `${list.length} genéticas`;
  return crop.geneticsName || list[0]?.name || null;
}

/** Pantalla a la que vuelve el detalle: Inicio si el cultivo está activo, Cultivos si terminó. */
export function getDetailBackTarget(crop: Cultivation | null | undefined): 'dashboard' | 'cultivations' {
  return crop && isCropFinished(crop) ? 'cultivations' : 'dashboard';
}

/** Ítem de navegación resaltado: el detalle se marca como Inicio o Cultivos según el cultivo. */
export function getNavHighlight(view: string, selectedCrop: Cultivation | null | undefined): string {
  if (view === 'cultivation_detail') return getDetailBackTarget(selectedCrop);
  return view;
}

/** "Para hoy": tareas sin hacer de hoy o atrasadas, en el orden que ya da taskService. */
export function selectTodayTasks(tasks: CultivationTask[]): CultivationTask[] {
  return tasks.filter((t) => !t.isCompleted && (t.urgency === 'today' || t.urgency === 'overdue'));
}

export interface FinishedCropSummary {
  crop: Cultivation;
  harvest: Harvest | null;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  /** Peso seco en gramos (cosecha registrada o peso final del cultivo). */
  dryWeightGrams: number | null;
  rating: number | null;
}

/** Resumen de un cultivo terminado con los datos de su cosecha, si existe. */
export function summarizeFinishedCrop(crop: Cultivation, harvests: Harvest[]): FinishedCropSummary {
  const harvest =
    harvests.find((h) => h.cultivationId === crop.id) ||
    (crop.harvestId ? harvests.find((h) => h.id === crop.harvestId) : undefined) ||
    null;
  const startDate = harvest?.startDate || crop.startDate || null;
  const endDate = harvest?.harvestDate || crop.harvestDate || crop.endDate || null;
  let totalDays: number | null = harvest?.totalDays && harvest.totalDays > 0 ? harvest.totalDays : null;
  if (totalDays === null && startDate && endDate) {
    const diff = daysBetween(startDate, endDate);
    totalDays = diff > 0 ? diff : null;
  }
  const weight = harvest?.finalDryWeightGrams || crop.finalWeight || null;
  return {
    crop,
    harvest,
    startDate,
    endDate,
    totalDays,
    dryWeightGrams: typeof weight === 'number' && weight > 0 ? weight : null,
    rating: harvest?.rating1To5 || null,
  };
}

/** Cultivos terminados, del más reciente al más viejo según su fecha de fin. */
export function listFinishedCrops(cultivations: Cultivation[], harvests: Harvest[]): FinishedCropSummary[] {
  return cultivations
    .filter(isCropFinished)
    .map((c) => summarizeFinishedCrop(c, harvests))
    .sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
}

/** Última foto ya subida del cultivo (las que siguen en la cola local no tienen URL pública). */
export function latestUploadedPhotoUrl(photos: PhotoRecord[], cropId: string): string | null {
  const latest = photos
    .filter((p) => p.cultivationId === cropId && !p.isPendingSync && /^https?:\/\//.test(p.thumbnailUrl || p.url || ''))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  return latest ? latest.thumbnailUrl || latest.url : null;
}

/**
 * Portadas fijas de las tarjetas de cultivo: una para interior y otra para exterior.
 * Proporción 2:1 (recomendado 1600 × 800 px). Invernadero usa la de exterior (luz natural).
 */
export const CROP_COVER_IMAGES = {
  interior: '/portadas/interior.webp',
  exterior: '/portadas/exterior.webp',
} as const;

export type CropCoverKind = keyof typeof CROP_COVER_IMAGES;

export function getCropCoverKind(crop: Pick<Cultivation, 'type'>): CropCoverKind {
  return crop.type === 'Outdoor' || crop.type === 'Invernadero' ? 'exterior' : 'interior';
}

export function getCropCoverImage(crop: Pick<Cultivation, 'type'>): string {
  return CROP_COVER_IMAGES[getCropCoverKind(crop)];
}
