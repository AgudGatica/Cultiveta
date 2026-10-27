/**
 * Línea de tiempo con forma de planta: arma los eventos del cultivo (fotos, notas, riegos
 * importantes, cambios de etapa) ordenados del más reciente al más viejo, con los días que los
 * separan (para el largo del tallo) y la forma de la copa según la etapa. Módulo puro.
 */
import type { Cultivation, DiaryEntry, Genetics, PhotoRecord, Watering } from '../types';
import {
  buildCultivationStageSchedule,
  daysBetween,
  getLocalTodayDateOnly,
  isFloweringStage,
  isPreFloweringStage,
  parseDateOnly,
} from './growthStageUtils';
import { isCropFinished } from './cropCardInfo';

export type PlantEventKind = 'stage' | 'photo' | 'note' | 'watering' | 'watering_group';

export interface PlantTimelineEvent {
  id: string;
  kind: PlantEventKind;
  /** YYYY-MM-DD */
  date: string;
  /** Día del cultivo (1 = día de inicio). */
  dayNumber: number;
  week: number;
  title: string;
  detail?: string;
  photo?: PhotoRecord;
  liters?: number;
  count?: number;
  /** Días hasta el evento anterior (más viejo) o hasta el inicio: define el tramo de tallo debajo. */
  gapDaysToOlder: number;
  /** Etapa en que estaba el cultivo ese día y día dentro de esa etapa (si se sabe). */
  stageName?: string;
  stageDay?: number;
}

/** Forma de la copa de la planta. */
export type PlantCrown = 'seedling' | 'vegetative' | 'preflower' | 'flower' | 'harvest';

export interface PlantTimelineModel {
  /** Del más reciente (arriba) al más viejo (abajo). */
  events: PlantTimelineEvent[];
  startDate: string;
  /** Si el inicio real del ciclo no se conoce, el tallo arranca en el primer dato registrado. */
  isStartKnown: boolean;
  totalDays: number;
  /** Avance del ciclo de 0 a 1 (tamaño de la planta). */
  growth: number;
  crown: PlantCrown;
  stageName: string;
  /** Días desde el evento más reciente hasta hoy (tramo de tallo arriba de todo). */
  gapDaysToToday: number;
}

const dateOnly = (value?: string | null): string | null => {
  const p = parseDateOnly(value);
  if (!p) return null;
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

type StageLike = { name: string; startDate?: string; isUnknown?: boolean; dateKnowledge?: string };

/**
 * Etapa vigente en una fecha y día dentro de esa etapa, según las fechas de inicio de cada etapa
 * (reales o estimadas). Si se pasa el nombre de la etapa registrado (por ejemplo, el de una foto),
 * se respeta ese nombre y el día se cuenta desde el inicio de esa etapa.
 */
export function stageAtDate(stages: StageLike[], date: string, recordedStage?: string): { name: string; day?: number } | null {
  const known = stages
    .filter((s) => s.startDate && !s.isUnknown && s.dateKnowledge !== 'unknown')
    .map((s) => ({ name: s.name, start: dateOnly(s.startDate)! }))
    .filter((s) => s.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (recordedStage && recordedStage.trim()) {
    const same = known.filter((s) => s.name.toLowerCase() === recordedStage.trim().toLowerCase() && s.start <= date).pop();
    return { name: recordedStage.trim(), day: same ? daysBetween(same.start, date) + 1 : undefined };
  }
  let found: { name: string; start: string } | null = null;
  for (const s of known) if (s.start <= date) found = s;
  return found ? { name: found.name, day: daysBetween(found.start, date) + 1 } : null;
}

/** Riego "importante": con nutrientes, pH o EC medidos, drenaje u observaciones. */
export function isImportantWatering(w: Watering): boolean {
  return Boolean(
    (w.productsUsed && w.productsUsed.length > 0) ||
      typeof w.phIn === 'number' ||
      typeof w.ecIn === 'number' ||
      typeof w.phRunoff === 'number' ||
      typeof w.ecRunoff === 'number' ||
      (w.observations && w.observations.trim())
  );
}

export function crownForStage(stage: string | undefined, finished: boolean): PlantCrown {
  const s = (stage || '').toLowerCase();
  if (finished || /cosech|secad|curad|finaliz/.test(s)) return 'harvest';
  if (isPreFloweringStage(stage || '')) return 'preflower';
  if (isFloweringStage(stage || '') || /madur|lavad/.test(s)) return 'flower';
  if (/germin|plánt|plant/.test(s)) return 'seedling';
  return 'vegetative';
}

function wateringDetail(w: Watering): string {
  const parts: string[] = [];
  if (w.volumeLiters) parts.push(`${w.volumeLiters} L`);
  if (typeof w.phIn === 'number') parts.push(`pH ${w.phIn}`);
  if (typeof w.ecIn === 'number') parts.push(`EC ${w.ecIn}`);
  if (w.productsUsed && w.productsUsed.length > 0) parts.push(w.productsUsed.map((p) => p.name).join(', '));
  if (w.observations && w.observations.trim()) parts.push(w.observations.trim());
  return parts.join(' · ');
}

export function buildPlantTimeline(
  crop: Cultivation,
  data: { waterings: Watering[]; diaryEntries: DiaryEntry[]; photos: PhotoRecord[] },
  geneticsList: Genetics[] = [],
  today: string = getLocalTodayDateOnly()
): PlantTimelineModel {
  const schedule = buildCultivationStageSchedule(crop, geneticsList);
  const finished = isCropFinished(crop);
  const isStartKnown = Boolean(schedule.isCycleStartKnown);

  const waterings = data.waterings.filter((w) => w.cultivationId === crop.id);
  const notes = data.diaryEntries.filter((d) => d.cultivationId === crop.id);
  const photos = data.photos.filter((p) => p.cultivationId === crop.id);

  type Raw = Omit<PlantTimelineEvent, 'dayNumber' | 'week' | 'gapDaysToOlder'> & { order: number };
  const raw: Raw[] = [];

  // Cambios de etapa con fecha real (el primero es el arranque y lo representa la maceta)
  const realStages = (crop.stagesTimeline || [])
    .filter((s) => s.actualStartDate)
    .map((s) => ({ name: s.name, date: dateOnly(s.actualStartDate) }))
    .filter((s): s is { name: string; date: string } => Boolean(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  realStages.slice(1).forEach((s, i) => {
    raw.push({ id: `stage_${i}_${s.name}`, kind: 'stage', date: s.date, title: `Empieza ${s.name}`, order: 0 });
  });

  photos.forEach((p) => {
    const d = dateOnly(p.date);
    if (d) raw.push({ id: `photo_${p.id}`, kind: 'photo', date: d, title: p.caption?.trim() || 'Foto', detail: p.category, photo: p, order: 2 });
  });

  notes.forEach((n) => {
    const d = dateOnly(n.date);
    if (d) raw.push({ id: `note_${n.id}`, kind: 'note', date: d, title: n.title?.trim() || 'Nota del diario', detail: n.content, order: 1 });
  });

  // Riegos: los importantes van solos; los comunes se agrupan por semana del cultivo
  const commonByWeek = new Map<string, Watering[]>();
  const cropStart = dateOnly(crop.startDate) || today;
  waterings.forEach((w) => {
    const d = dateOnly(w.date);
    if (!d) return;
    if (isImportantWatering(w)) {
      raw.push({ id: `watering_${w.id}`, kind: 'watering', date: d, title: 'Riego', detail: wateringDetail(w), liters: w.volumeLiters, order: 3 });
    } else {
      const week = Math.floor(Math.max(0, daysBetween(cropStart, d)) / 7);
      const key = String(week);
      commonByWeek.set(key, [...(commonByWeek.get(key) || []), w]);
    }
  });
  commonByWeek.forEach((list, key) => {
    const dates = list.map((w) => dateOnly(w.date)!).sort();
    const liters = list.reduce((acc, w) => acc + (Number(w.volumeLiters) || 0), 0);
    raw.push({
      id: `watering_group_${key}`,
      kind: 'watering_group',
      date: dates[dates.length - 1],
      title: list.length === 1 ? '1 riego' : `${list.length} riegos`,
      detail: liters > 0 ? `${Math.round(liters * 10) / 10} L en total` : undefined,
      count: list.length,
      liters,
      order: 4,
    });
  });

  // Inicio del tallo: el inicio del cultivo; si se desconoce o hay datos anteriores, el dato más viejo
  const oldestEvent = raw.reduce<string | null>((acc, e) => (!acc || e.date < acc ? e.date : acc), null);
  let startDate = dateOnly(crop.startDate) || oldestEvent || today;
  if (oldestEvent && oldestEvent < startDate) startDate = oldestEvent;

  const sorted = raw
    .filter((e) => e.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const events: PlantTimelineEvent[] = sorted.map((e, i) => {
    const dayNumber = Math.max(1, daysBetween(startDate, e.date) + 1);
    const olderDate = i === 0 ? startDate : sorted[i - 1].date;
    const { order: _order, ...rest } = e;
    const stage = stageAtDate(schedule.stages, e.date, e.kind === 'photo' ? e.photo?.stage : undefined);
    return {
      ...rest,
      dayNumber,
      week: Math.floor((dayNumber - 1) / 7) + 1,
      gapDaysToOlder: Math.max(0, daysBetween(olderDate, e.date)),
      stageName: stage?.name,
      stageDay: stage?.day,
    };
  });

  const endDate = finished ? dateOnly(crop.harvestDate || crop.endDate) || today : today;
  const totalDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const expected = schedule.totalCycleDays && schedule.totalCycleDays > 0 ? schedule.totalCycleDays : 120;
  const latest = events.length ? events[events.length - 1].date : startDate;

  return {
    events: events.reverse(),
    startDate,
    isStartKnown,
    totalDays,
    growth: finished ? 1 : Math.min(1, totalDays / expected),
    crown: crownForStage(crop.currentStage, finished),
    stageName: crop.currentStage || schedule.activeStage?.name || 'Vegetativo',
    gapDaysToToday: Math.max(0, daysBetween(latest, endDate)),
  };
}

/** Largo del tramo de tallo (px) para una cantidad de días: crece con el tiempo, con tope. */
export function stemSegmentPx(days: number): number {
  return Math.round(Math.min(120, 14 + Math.max(0, days) * 6));
}
