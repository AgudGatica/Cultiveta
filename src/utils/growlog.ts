/**
 * Growlogs de la Comunidad (como en Canopia): la copia pública de una genética de un cultivo.
 *
 * Lo arma el servidor al publicar con SOLO lo que se muestra: los cultivos, fotos y riegos de cada persona
 * siguen siendo privados. La copia guarda los datos con la misma forma que usa la app (un cultivo, sus fotos,
 * riegos y notas), así la página pública reusa la línea de tiempo con la maceta y las etapas.
 *
 * Nunca se copian: las coordenadas del cultivo, el id de la persona en los registros, la portada privada, las
 * notas internas del cultivo, los umbrales de alerta ni las direcciones privadas de las fotos.
 */
import type { Cultivation, DiaryEntry, Indoor, PhotoRecord, Watering } from '../types';
import { ambientHistory, type AmbientPoint } from './ambientEvaluation';
import { isCropFinished } from './cropCardInfo';
import { cropForGenetic } from './indoors';

export type GrowlogPrivacy = 'unlisted' | 'public';
export type AvatarMode = 'google' | 'photo' | 'incognito';

export interface PublicProfile {
  uid: string;
  handle: string;
  displayName: string;
  avatarMode: AvatarMode;
  avatarUrl: string | null;
  /** Color del avatar incógnito (y de respaldo si la foto no carga). */
  avatarColor: string;
  bio: string;
  location: string | null;
  level: number;
  levelName: string;
  followers: number;
  following: number;
  /** Growlogs públicos (los no listados no cuentan). */
  growlogs: number;
  views: number;
  hidden: boolean;
  acceptedRulesAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrowlogPhoto {
  id: string;
  url: string;
  /** Archivo público (community/growlogs/{id}/...), para borrarlo al despublicar. */
  path: string;
  date: string;
  dayOfCultivation: number;
  stage: PhotoRecord['stage'];
  category: PhotoRecord['category'];
  caption?: string;
}

export interface Growlog {
  id: string;
  ownerUid: string;
  ownerHandle: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  ownerAvatarColor: string;
  privacy: GrowlogPrivacy;
  /** Oculto por moderación (denuncias o admin). */
  hidden: boolean;
  /** Aparece en Explorar: público y no oculto (un solo campo para poder listar sin índices compuestos). */
  listed: boolean;
  cropId: string;
  /** Qué genética del cultivo es (su id o "n" + posición si el cultivo es viejo). */
  geneticKey: string;
  geneticIndex: number;
  title: string;
  cropName: string;
  bank: string;
  photoperiodType: string | null;
  plants: number;
  env: 'indoor' | 'exterior';
  ambientKind: string | null;
  medium: 'tierra' | 'coco' | 'hidro' | 'otro';
  substrateText: string;
  light: string;
  potLiters: number | null;
  /** El cultivo mirado desde esta genética, sin datos privados. */
  crop: Cultivation;
  photos: GrowlogPhoto[];
  waterings: Watering[];
  notes: DiaryEntry[];
  climate: AmbientPoint[];
  coverUrl: string | null;
  startDate: string;
  stage: string;
  finished: boolean;
  harvest: { date: string | null; weightG: number | null } | null;
  location: string | null;
  tokens: string[];
  views: number;
  likes: number;
  comments: number;
  reports: number;
  publishedAt: string;
  updatedAt: string;
}

export const MAX_GROWLOG_PHOTOS = 60;
const MAX_WATERINGS = 300;
const MAX_NOTES = 150;
const MAX_CLIMATE = 400;
const MAX_TEXT = 1000;

const AVATAR_COLORS = ['#2D6B28', '#1F6F8B', '#8B5E1F', '#6B2D5C', '#2D4F6B', '#5C6B2D', '#8B1F3A', '#3A2D6B'];
/** Color fijo por persona (para el avatar incógnito). */
export function avatarColorFor(uid: string): string {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Palabras para buscar (sin tildes, en minúscula, de 2 letras o más). */
export function growlogTokens(...texts: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const w of norm(t || '').split(/[^a-z0-9_]+/)) if (w.length >= 2) out.add(w);
  return [...out].slice(0, 60);
}

/** ¿Coincide con lo que se escribió en el buscador? (todas las palabras, por el comienzo). */
export function growlogMatches(g: Pick<Growlog, 'tokens'>, query: string): boolean {
  const words = growlogTokens(query);
  return words.every((w) => g.tokens.some((t) => t.startsWith(w)));
}

export function mediumOf(substrateType: string | undefined): Growlog['medium'] {
  const s = norm(substrateType || '');
  if (/hidro|aero|dwc|nft/.test(s)) return 'hidro';
  if (/coco/.test(s)) return 'coco';
  if (/tierra|sustrato|suelo|organ/.test(s) || !s) return 'tierra';
  return 'otro';
}

const EXTERIOR_KINDS = new Set(['patio', 'balcon', 'terraza', 'invernadero']);

const clip = (s: unknown, n = MAX_TEXT) => (typeof s === 'string' ? s.slice(0, n) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const drop = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

/** El cultivo mirado desde la genética, solo con lo que se puede mostrar. */
export function publicCrop(one: Cultivation, growlogId: string, coverUrl: string | null): Cultivation {
  return drop({
    id: growlogId,
    userId: '',
    name: one.name,
    startDate: one.startDate,
    type: one.type,
    plantCount: one.plantCount,
    geneticsId: one.geneticsId,
    geneticsName: one.geneticsName,
    seedBank: one.seedBank,
    photoperiodType: one.photoperiodType,
    declaredFloweringWeeks: one.declaredFloweringWeeks,
    geneticsList: (one.geneticsList || []).map((g) => ({ id: g.id, name: g.name, seedBank: g.seedBank, photoperiodType: g.photoperiodType, declaredFloweringWeeks: g.declaredFloweringWeeks, plantCount: g.plantCount })),
    currentStage: one.currentStage,
    stageStartDate: one.stageStartDate,
    floweringStartDate: one.floweringStartDate,
    stagesTimeline: (one.stagesTimeline || []).map((s) => ({ ...s, notes: undefined })),
    cycleStartKnown: one.cycleStartKnown,
    timelineHistoryMode: one.timelineHistoryMode,
    substrate: { type: one.substrate?.type || '', potVolumeLiters: num(one.substrate?.potVolumeLiters) || 0, potType: one.substrate?.potType },
    lighting: one.lighting
      ? { type: one.lighting.type, nominalWatts: num(one.lighting.nominalWatts), usedWatts: num(one.lighting.usedWatts), photoperiodHoursLight: num(one.lighting.photoperiodHoursLight), photoperiodHoursDark: num(one.lighting.photoperiodHoursDark) }
      : undefined,
    indoorId: null,
    coverPhotoUrl: coverUrl || undefined,
    status: one.status,
    isFinished: one.isFinished,
    harvestDate: one.harvestDate,
    endDate: one.endDate,
    finalWeight: num(one.finalWeight),
    createdAt: one.createdAt,
    updatedAt: one.updatedAt,
  }) as Cultivation;
}

export interface BuildGrowlogInput {
  id: string;
  crop: Cultivation;
  geneticIndex: number;
  geneticKey: string;
  profile: Pick<PublicProfile, 'uid' | 'handle' | 'displayName' | 'avatarUrl' | 'avatarColor'>;
  privacy: GrowlogPrivacy;
  location: string | null;
  hidden?: boolean;
  /** Fotos ya copiadas a su lugar público (más vieja primero). */
  photos: GrowlogPhoto[];
  waterings: Watering[];
  notes: DiaryEntry[];
  envRecords: Array<{ createdAt?: string; date: string; time?: string; temperatureC: number; humidityPct: number }>;
  ambient: Pick<Indoor, 'kind' | 'environment' | 'lighting'> | null;
  counters?: Pick<Growlog, 'views' | 'likes' | 'comments' | 'reports'>;
  publishedAt?: string;
  now: string;
}

export function buildGrowlog(input: BuildGrowlogInput): Growlog {
  const one = cropForGenetic(input.crop, input.geneticIndex);
  const cover = input.photos.length ? input.photos[input.photos.length - 1].url : null;
  const ambient = input.ambient;
  const exterior = ambient ? ambient.environment === 'exterior' || EXTERIOR_KINDS.has(ambient.kind) : input.crop.type !== 'Indoor';
  const lighting = ambient?.lighting || one.lighting;
  const watts = lighting?.usedWatts || lighting?.nominalWatts;
  const light = exterior ? 'Sol' : lighting?.type ? `${lighting.type}${watts ? ` ${watts} W` : ''}` : '';
  const finished = isCropFinished(input.crop);
  const crop = publicCrop({ ...one, lighting: lighting || one.lighting }, input.id, cover);
  const waterings = input.waterings
    .slice()
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(-MAX_WATERINGS)
    .map((w) =>
      drop({
        id: w.id,
        userId: '',
        cultivationId: input.id,
        date: w.date,
        time: w.time,
        volumeLiters: num(w.volumeLiters) || 0,
        phIn: num(w.phIn),
        ecIn: num(w.ecIn),
        phRunoff: num(w.phRunoff),
        ecRunoff: num(w.ecRunoff),
        waterTempC: num(w.waterTempC),
        productsUsed: (w.productsUsed || []).map((p: any) => drop({ name: clip(p?.name, 80), dosageMlPerL: num(p?.dosageMlPerL), brand: clip(p?.brand, 60) })),
        observations: clip(w.observations),
        createdAt: w.createdAt,
      }) as Watering
    );
  const notes = input.notes
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_NOTES)
    .map((n) => drop({ id: n.id, userId: '', cultivationId: input.id, date: n.date, title: clip(n.title, 120), content: clip(n.content) || '', tags: (n.tags || []).slice(0, 10), createdAt: n.createdAt, updatedAt: n.updatedAt }) as DiaryEntry);
  const climate = ambientHistory(input.envRecords).slice(-MAX_CLIMATE);
  const bank = one.seedBank || '';
  const title = one.geneticsName?.trim() || 'Genética sin nombre';
  return {
    id: input.id,
    ownerUid: input.profile.uid,
    ownerHandle: input.profile.handle,
    ownerName: input.profile.displayName,
    ownerAvatarUrl: input.profile.avatarUrl,
    ownerAvatarColor: input.profile.avatarColor,
    privacy: input.privacy,
    hidden: Boolean(input.hidden),
    listed: input.privacy === 'public' && !input.hidden,
    cropId: input.crop.id,
    geneticKey: input.geneticKey,
    geneticIndex: input.geneticIndex,
    title,
    cropName: input.crop.name,
    bank,
    photoperiodType: one.photoperiodType || null,
    plants: Math.max(1, Number(one.plantCount) || 1),
    env: exterior ? 'exterior' : 'indoor',
    ambientKind: ambient?.kind || null,
    medium: mediumOf(one.substrate?.type),
    substrateText: one.substrate?.type || '',
    light,
    potLiters: num(one.substrate?.potVolumeLiters) || null,
    crop,
    photos: input.photos,
    waterings,
    notes,
    climate,
    coverUrl: cover,
    startDate: one.startDate,
    stage: one.currentStage,
    finished,
    harvest: finished ? { date: input.crop.harvestDate || input.crop.endDate || null, weightG: num(input.crop.finalWeight) ?? null } : null,
    location: input.location,
    tokens: growlogTokens(title, bank, input.crop.name, input.profile.handle, input.profile.displayName, one.substrate?.type, exterior ? 'exterior' : 'indoor', one.photoperiodType),
    views: input.counters?.views || 0,
    likes: input.counters?.likes || 0,
    comments: input.counters?.comments || 0,
    reports: input.counters?.reports || 0,
    publishedAt: input.publishedAt || input.now,
    updatedAt: input.now,
  };
}

/** Clave de una genética de un cultivo: su id, o su posición si el cultivo es viejo y no tiene. */
export function geneticKeyOf(crop: Cultivation, index: number): string | null {
  const list = (crop.geneticsList || []).filter((g) => g.name?.trim());
  if (list.length) return list[index] ? list[index].id || `n${index}` : null;
  return index === 0 && crop.geneticsName?.trim() ? 'n0' : null;
}

/** Ubicación general: país, provincia o ciudad. Sin números (ni direcciones ni coordenadas). */
export function cleanLocation(raw: unknown): { value: string | null; error: string | null } {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!s) return { value: null, error: null };
  if (/\d/.test(s)) return { value: null, error: 'Poné solo país, provincia o ciudad, sin direcciones ni números.' };
  if (s.length > 60) return { value: null, error: 'La ubicación puede tener hasta 60 letras.' };
  return { value: s, error: null };
}

const RESERVED_HANDLES = new Set(['admin', 'administrador', 'cultiveta', 'soporte', 'support', 'moderador', 'mod', 'staff', 'oficial', 'comunidad', 'root', 'null', 'undefined']);

/** @usuario: 3 a 20 letras minúsculas, números o guion bajo. */
export function cleanHandle(raw: unknown): { value: string; error: string | null } {
  const s = typeof raw === 'string' ? raw.trim().replace(/^@/, '').toLowerCase() : '';
  if (!/^[a-z0-9_]{3,20}$/.test(s)) return { value: s, error: 'El usuario tiene que tener de 3 a 20 letras, números o guion bajo (sin espacios ni tildes).' };
  if (RESERVED_HANDLES.has(s)) return { value: s, error: 'Ese usuario está reservado. Probá con otro.' };
  return { value: s, error: null };
}

/** Lo que muestra una tarjeta (Explorar, Siguiendo, perfil): sin el cultivo, los riegos ni las fotos (con las palabras para buscar). */
export type GrowlogCard = Omit<Growlog, 'crop' | 'waterings' | 'notes' | 'climate' | 'photos'> & {
  photosCount: number;
  lastNote: string | null;
};

export function growlogCard(g: Growlog): GrowlogCard {
  const { crop, waterings, notes, climate, photos, ...rest } = g;
  const last = notes.length ? notes[notes.length - 1] : null;
  return { ...rest, photosCount: photos.length, lastNote: last ? (last.title ? `${last.title}: ` : '') + last.content.slice(0, 200) : null };
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const longDate = (d: string | null | undefined) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

/** Resumen automático (como el de Canopia): un párrafo armado con los datos del growlog. */
export function growlogSummary(g: Growlog, when: { day: number | null; stageDay: number }): string {
  const parts: string[] = [];
  const type = g.photoperiodType ? `, ${g.photoperiodType.toLowerCase()}` : '';
  const where = g.env === 'exterior' ? 'exterior' : 'indoor';
  const light = g.env === 'exterior' ? '' : g.light ? ` con luz ${g.light}` : '';
  const medium = g.substrateText ? `, en ${g.substrateText.toLowerCase()}` : '';
  const pot = g.potLiters ? ` (maceta de ${n1(g.potLiters)} L)` : '';
  parts.push(`${g.title}${g.bank ? ` de ${g.bank}` : ''}${type}: ${g.plants === 1 ? '1 planta' : `${g.plants} plantas`} en ${where}${light}${medium}${pot}.`);
  if (g.finished) {
    const w = g.harvest?.weightG;
    parts.push(`Ya se cosechó${g.harvest?.date ? ` el ${longDate(g.harvest.date)}` : ''}${w ? `, con ${n1(w)} g` : ''}.`);
  } else if (when.day) {
    parts.push(`Arrancó el ${longDate(g.startDate)} y va por el día ${when.day} (semana ${Math.floor((when.day - 1) / 7) + 1}), en ${g.stage.toLowerCase()}.`);
  } else {
    parts.push(`Está en ${g.stage.toLowerCase()} desde hace ${Math.max(1, when.stageDay)} ${when.stageDay === 1 ? 'día' : 'días'}.`);
  }
  const liters = g.waterings.reduce((a, w) => a + (Number(w.volumeLiters) || 0), 0);
  const phs = g.waterings.map((w) => Number(w.phIn)).filter((v) => Number.isFinite(v) && v > 0);
  const counts: string[] = [];
  if (g.waterings.length) counts.push(`${g.waterings.length === 1 ? '1 riego' : `${g.waterings.length} riegos`} (${n1(liters)} L${phs.length ? `, pH promedio ${n1(phs.reduce((a, v) => a + v, 0) / phs.length)}` : ''})`);
  if (g.notes.length) counts.push(g.notes.length === 1 ? '1 nota' : `${g.notes.length} notas`);
  if (g.photos.length) counts.push(g.photos.length === 1 ? '1 foto' : `${g.photos.length} fotos`);
  if (counts.length) parts.push(`Lleva anotados ${counts.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`);
  return parts.join(' ');
}

/** Riegos por semana del cultivo (para el gráfico): [semana, cantidad, litros]. */
export function wateringsByWeek(g: Pick<Growlog, 'waterings' | 'startDate'>): Array<{ week: number; count: number; liters: number }> {
  const start = Date.parse(`${g.startDate}T00:00:00`);
  if (!Number.isFinite(start)) return [];
  const map = new Map<number, { week: number; count: number; liters: number }>();
  for (const w of g.waterings) {
    const t = Date.parse(`${w.date}T00:00:00`);
    if (!Number.isFinite(t) || t < start) continue;
    const week = Math.floor((t - start) / (7 * 86400_000)) + 1;
    const row = map.get(week) || { week, count: 0, liters: 0 };
    row.count++;
    row.liters += Number(w.volumeLiters) || 0;
    map.set(week, row);
  }
  return [...map.values()].sort((a, b) => a.week - b.week);
}

/** Un grower en una lista (Explorar, seguidores): lo justo para la tarjeta. */
export type GrowerCard = Pick<PublicProfile, 'uid' | 'handle' | 'displayName' | 'avatarUrl' | 'avatarColor' | 'level' | 'levelName' | 'followers' | 'growlogs' | 'location'>;

export function growerCard(p: PublicProfile): GrowerCard {
  return { uid: p.uid, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl, avatarColor: p.avatarColor, level: p.level, levelName: p.levelName, followers: p.followers || 0, growlogs: p.growlogs || 0, location: p.location };
}

export interface ExploreSection {
  id: 'vistos' | 'indoor' | 'exterior' | 'auto' | 'hidro' | 'tierra';
  title: string;
  growlogs: GrowlogCard[];
}

/** Explorar (como en Canopia): el growlog del mes y las colecciones. now: para saber qué mes es. */
export function exploreSections(cards: GrowlogCard[], now: Date): { top: GrowlogCard | null; sections: ExploreSection[] } {
  const month = now.toISOString().slice(0, 7);
  const byViews = (a: GrowlogCard, b: GrowlogCard) => b.views - a.views || b.likes - a.likes;
  const thisMonth = cards.filter((g) => g.updatedAt.slice(0, 7) === month);
  const top = [...(thisMonth.length ? thisMonth : cards)].sort((a, b) => b.likes - a.likes || byViews(a, b))[0] || null;
  const isAuto = (g: GrowlogCard) => /auto/i.test(g.photoperiodType || '');
  const sections: ExploreSection[] = [
    { id: 'vistos', title: 'Más vistos', growlogs: cards.filter((g) => g.views > 0) },
    { id: 'indoor', title: 'Indoor', growlogs: cards.filter((g) => g.env === 'indoor') },
    { id: 'exterior', title: 'Exterior', growlogs: cards.filter((g) => g.env === 'exterior') },
    { id: 'auto', title: 'Automáticas', growlogs: cards.filter(isAuto) },
    { id: 'hidro', title: 'Hidroponía', growlogs: cards.filter((g) => g.medium === 'hidro') },
    { id: 'tierra', title: 'En tierra', growlogs: cards.filter((g) => g.medium === 'tierra') },
  ];
  for (const s of sections) s.growlogs = s.growlogs.slice().sort(byViews).slice(0, 20);
  return { top, sections: sections.filter((s) => s.growlogs.length) };
}
