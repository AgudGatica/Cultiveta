/**
 * Comunidad (como en Canopia), del lado del servidor. Solo el servidor escribe lo público:
 * - perfil de grower (profiles/{uid}) con @usuario único (handles/{usuario});
 * - growlogs (growlogs/{id}): la copia pública de una genética de un cultivo, con las fotos copiadas a
 *   community/growlogs/{id}/ y limpiadas otra vez (sin ubicación ni datos del celular);
 * - denuncias (reports/{tipo_id_quien}): con 3 de personas distintas se oculta solo, hasta que el admin decida.
 * Los cultivos, fotos y riegos de cada persona siguen siendo privados: se leen acá con permisos de servidor.
 */
import crypto from 'crypto';
import type { Cultivation, DiaryEntry, EnvironmentRecord, Indoor, PhotoRecord, Watering } from '../../types';
import { stripImageMetadata } from '../../utils/imageMetadata';
import {
  MAX_GROWLOG_PHOTOS,
  avatarColorFor,
  buildGrowlog,
  cleanHandle,
  cleanLocation,
  geneticKeyOf,
  growerCard,
  growlogCard,
  type AvatarMode,
  type GrowerCard,
  type Growlog,
  type GrowlogCard,
  type GrowlogPhoto,
  type GrowlogPrivacy,
  type PublicProfile,
} from '../../utils/growlog';
import type { CommunityDb, CommunityFiles } from './communityStore';

export class CommunityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ReportKind = 'growlog' | 'profile' | 'comment';
export const REPORT_REASONS = {
  spam: 'Spam o publicidad',
  venta: 'Venta o intercambio',
  ofensivo: 'Ofensivo o acoso',
  datos: 'Datos personales de alguien',
  menores: 'Contenido con menores',
  otro: 'Otro motivo',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

/** Con esta cantidad de denuncias de personas distintas, se oculta hasta que lo revise el admin. */
export const AUTO_HIDE_REPORTS = 3;
/** Al actualizar solo (por un riego o una foto nueva), como mucho una vez cada tanto. */
export const REFRESH_MIN_MS = 30_000;
/** Cuántos growlogs y growers trae Explorar (se ordenan y filtran en la app). */
export const EXPLORE_LIMIT = 300;

export interface Report {
  id: string;
  kind: ReportKind;
  targetId: string;
  growlogId: string | null;
  reporterUid: string;
  reason: ReportReason;
  text: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface ProfileInput {
  handle?: unknown;
  displayName?: unknown;
  bio?: unknown;
  avatarMode?: unknown;
  location?: unknown;
  acceptRules?: unknown;
  level?: unknown;
  levelName?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const newId = () => crypto.randomBytes(12).toString('base64url');

export class CommunityService {
  constructor(
    private db: CommunityDb,
    private files: CommunityFiles,
    private now: () => Date = () => new Date()
  ) {}

  private iso() {
    return this.now().toISOString();
  }

  // ---------------------------------------------------------------- perfil

  async getProfile(uid: string): Promise<PublicProfile | null> {
    return this.db.get<PublicProfile>(`profiles/${uid}`);
  }

  private async requireProfile(uid: string): Promise<PublicProfile> {
    const p = await this.getProfile(uid);
    if (!p || !p.acceptedRulesAt) throw new CommunityError('Primero armá tu perfil de la comunidad y aceptá las normas.', 409);
    return p;
  }

  /** Crea o edita el perfil. googlePhoto: la foto de la cuenta de Google (si se elige usarla). */
  async saveProfile(uid: string, input: ProfileInput, ctx: { googlePhoto?: string | null } = {}): Promise<PublicProfile> {
    const prev = await this.getProfile(uid);
    if (!prev && input.acceptRules !== true) throw new CommunityError('Para entrar a la comunidad hay que aceptar las normas (mayores de 18, sin venta y con respeto).');
    const handleIn = input.handle ?? prev?.handle;
    const h = cleanHandle(handleIn);
    if (h.error) throw new CommunityError(h.error);
    const displayName = text(input.displayName ?? prev?.displayName, 40);
    if (!displayName) throw new CommunityError('Poné un nombre para mostrar.');
    const loc = cleanLocation(input.location === undefined ? prev?.location : input.location);
    if (loc.error) throw new CommunityError(loc.error);
    // La foto propia se sube aparte (setAvatarPhoto); acá solo se puede quedar con la que ya había
    const modeIn = (input.avatarMode ?? prev?.avatarMode ?? 'incognito') as AvatarMode;
    let avatarMode: AvatarMode = 'incognito';
    if (modeIn === 'google' && ctx.googlePhoto) avatarMode = 'google';
    else if (modeIn === 'photo' && prev?.avatarMode === 'photo' && prev.avatarUrl) avatarMode = 'photo';
    const avatarUrl = avatarMode === 'google' ? ctx.googlePhoto || null : avatarMode === 'photo' ? prev?.avatarUrl || null : null;

    if (h.value !== prev?.handle) {
      const free = await this.db.create(`handles/${h.value}`, { uid, at: this.iso() });
      if (!free) {
        const owner = await this.db.get<{ uid: string }>(`handles/${h.value}`);
        if (owner?.uid !== uid) throw new CommunityError(`@${h.value} ya lo usa otra persona. Probá con otro.`, 409);
      }
      if (prev?.handle) await this.db.delete(`handles/${prev.handle}`);
    }

    const now = this.iso();
    const level = Math.max(1, Math.min(99, Math.round(Number(input.level) || prev?.level || 1)));
    const profile: PublicProfile = {
      uid,
      handle: h.value,
      displayName,
      avatarMode,
      avatarUrl,
      avatarColor: prev?.avatarColor || avatarColorFor(uid),
      bio: text(input.bio ?? prev?.bio, 160),
      location: loc.value,
      level,
      levelName: text(input.levelName ?? prev?.levelName, 40),
      followers: prev?.followers || 0,
      following: prev?.following || 0,
      growlogs: prev?.growlogs || 0,
      views: prev?.views || 0,
      hidden: prev?.hidden || false,
      acceptedRulesAt: prev?.acceptedRulesAt || now,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    };
    await this.db.set(`profiles/${uid}`, profile);
    if (prev && (prev.handle !== profile.handle || prev.displayName !== profile.displayName || prev.avatarUrl !== profile.avatarUrl)) {
      await this.syncOwnerOnGrowlogs(profile);
    }
    return profile;
  }

  /** Foto propia de perfil: se guarda limpia (sin ubicación) y queda como avatar. */
  async setAvatarPhoto(uid: string, bytes: Uint8Array, contentType: string): Promise<PublicProfile> {
    const prev = await this.requireProfile(uid);
    const clean = stripImageMetadata(bytes);
    if (!clean.supported) throw new CommunityError('La foto tiene que ser JPG, PNG o WebP.');
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    await this.files.deletePrefix(`community/avatars/${uid}.`);
    const url = await this.files.write(`community/avatars/${uid}.${ext}`, clean.bytes, contentType);
    const profile: PublicProfile = { ...prev, avatarMode: 'photo', avatarUrl: url, updatedAt: this.iso() };
    await this.db.set(`profiles/${uid}`, profile);
    await this.syncOwnerOnGrowlogs(profile);
    return profile;
  }

  private async syncOwnerOnGrowlogs(p: PublicProfile) {
    const mine = await this.db.query<Growlog>('growlogs', { where: [['ownerUid', '==', p.uid]] });
    for (const g of mine) {
      await this.db.update(`growlogs/${g.id}`, { ownerHandle: p.handle, ownerName: p.displayName, ownerAvatarUrl: p.avatarUrl, ownerAvatarColor: p.avatarColor });
    }
  }

  private async recountProfile(uid: string) {
    const mine = await this.db.query<Growlog>('growlogs', { where: [['ownerUid', '==', uid]] });
    const listed = mine.filter((g) => g.data.listed);
    if (await this.db.get(`profiles/${uid}`)) {
      await this.db.update(`profiles/${uid}`, { growlogs: listed.length, views: mine.reduce((n, g) => n + (g.data.views || 0), 0) });
    }
  }

  // ---------------------------------------------------------------- growlogs

  async myGrowlogs(uid: string): Promise<Growlog[]> {
    return (await this.db.query<Growlog>('growlogs', { where: [['ownerUid', '==', uid]] })).map((d) => d.data);
  }

  /** Un growlog para mirar: público o no listado (con el enlace). Oculto: solo su dueño o el admin. */
  async getGrowlog(viewerUid: string, id: string, opts: { isAdmin?: boolean } = {}): Promise<Growlog> {
    const g = await this.db.get<Growlog>(`growlogs/${id}`);
    const own = g?.ownerUid === viewerUid;
    if (!g || (g.hidden && !own && !opts.isAdmin)) throw new CommunityError('Este growlog es privado o ya no existe.', 404);
    return g;
  }

  /** Publica (o actualiza) la genética n del cultivo con la privacidad elegida. */
  async publish(uid: string, body: { cropId?: unknown; geneticIndex?: unknown; privacy?: unknown; location?: unknown }): Promise<Growlog> {
    const profile = await this.requireProfile(uid);
    const cropId = typeof body.cropId === 'string' ? body.cropId : '';
    const index = Number(body.geneticIndex);
    if (!cropId || !Number.isInteger(index) || index < 0) throw new CommunityError('Falta el cultivo o la genética.');
    const privacy: GrowlogPrivacy = body.privacy === 'public' ? 'public' : body.privacy === 'unlisted' ? 'unlisted' : (null as any);
    if (!privacy) throw new CommunityError('Elegí No listado o Público.');
    const loc = cleanLocation(body.location);
    if (loc.error) throw new CommunityError(loc.error);
    const crop = await this.ownCrop(uid, cropId);
    return this.build(profile, crop, index, privacy, loc.value);
  }

  /** Vuelve a armar los growlogs de un cultivo con lo último (después de un riego, una foto o un cambio de etapa). */
  async refreshCrop(uid: string, cropId: string, opts: { force?: boolean } = {}): Promise<number> {
    const mine = (await this.myGrowlogs(uid)).filter((g) => g.cropId === cropId);
    if (!mine.length) return 0;
    const stored = await this.db.get<Cultivation>(`cultivations/${cropId}`);
    if (!stored || stored.userId !== uid) {
      for (const g of mine) await this.removeGrowlog(g);
      await this.recountProfile(uid);
      return 0;
    }
    const crop = { ...stored, id: cropId };
    const profile = await this.requireProfile(uid);
    let n = 0;
    for (const g of mine) {
      if (!opts.force && this.now().getTime() - Date.parse(g.updatedAt) < REFRESH_MIN_MS) continue;
      const index = this.indexOfKey(crop, g.geneticKey, g.geneticIndex);
      if (index === null) {
        await this.removeGrowlog(g);
        continue;
      }
      await this.build(profile, crop, index, g.privacy, g.location, g);
      n++;
    }
    await this.recountProfile(uid);
    return n;
  }

  /** Dejar de compartir: se borra la copia pública, sus fotos, comentarios y me gusta. */
  async unpublish(uid: string, growlogId: string, opts: { isAdmin?: boolean } = {}): Promise<void> {
    const g = await this.db.get<Growlog>(`growlogs/${growlogId}`);
    if (!g) return;
    if (g.ownerUid !== uid && !opts.isAdmin) throw new CommunityError('Ese growlog no es tuyo.', 403);
    await this.removeGrowlog(g);
    await this.recountProfile(g.ownerUid);
  }

  private async removeGrowlog(g: Growlog) {
    await this.files.deletePrefix(`community/growlogs/${g.id}/`);
    await this.db.deleteDeep(`growlogs/${g.id}`);
  }

  private indexOfKey(crop: Cultivation, key: string, fallback: number): number | null {
    if (geneticKeyOf(crop, fallback) === key) return fallback;
    for (let i = 0; i < 50; i++) {
      const k = geneticKeyOf(crop, i);
      if (k === null) break;
      if (k === key) return i;
    }
    return null;
  }

  private async ownCrop(uid: string, cropId: string): Promise<Cultivation> {
    const crop = await this.db.get<Cultivation>(`cultivations/${cropId}`);
    if (!crop || crop.userId !== uid) throw new CommunityError('No encontramos ese cultivo.', 404);
    if (crop.isDemo) throw new CommunityError('Los cultivos de ejemplo no se pueden publicar.');
    return { ...crop, id: cropId };
  }

  private async build(profile: PublicProfile, crop: Cultivation, index: number, privacy: GrowlogPrivacy, location: string | null, prev?: Growlog): Promise<Growlog> {
    const key = geneticKeyOf(crop, index);
    if (!key) throw new CommunityError('Esa genética no está en el cultivo.', 404);
    const existing =
      prev ||
      (await this.myGrowlogs(profile.uid)).find((g) => g.cropId === crop.id && g.geneticKey === key) ||
      null;
    const id = existing?.id || newId();
    const uid = profile.uid;

    const [photos, waterings, notes, env, ambient] = await Promise.all([
      this.db.query<PhotoRecord>('photos', { where: [['cultivationId', '==', crop.id], ['userId', '==', uid]] }),
      this.db.query<Watering>('waterings', { where: [['cultivationId', '==', crop.id], ['userId', '==', uid]] }),
      this.db.query<DiaryEntry>('diaryEntries', { where: [['cultivationId', '==', crop.id], ['userId', '==', uid]] }),
      this.db.query<EnvironmentRecord>('environmentRecords', { where: [['cultivationId', '==', crop.id], ['userId', '==', uid]] }),
      crop.indoorId ? this.db.get<Indoor>(`indoors/${crop.indoorId}`) : Promise.resolve(null),
    ]);

    const publicPhotos = await this.syncPhotos(uid, id, photos.map((p) => ({ ...p.data, id: p.id })), existing?.photos || []);
    const g = buildGrowlog({
      id,
      crop,
      geneticIndex: index,
      geneticKey: key,
      profile,
      privacy,
      location,
      hidden: existing?.hidden,
      photos: publicPhotos,
      waterings: waterings.map((w) => ({ ...w.data, id: w.id })).filter((w) => !w.isDemo),
      notes: notes.map((n) => ({ ...n.data, id: n.id })).filter((n) => !n.isDemo),
      envRecords: env.map((e) => e.data),
      ambient: ambient && ambient.userId === uid ? ambient : null,
      counters: existing ? { views: existing.views, likes: existing.likes, comments: existing.comments, reports: existing.reports } : undefined,
      publishedAt: existing?.publishedAt,
      now: this.iso(),
    });
    await this.db.set(`growlogs/${id}`, g);
    if (!prev) await this.recountProfile(uid);
    return g;
  }

  /** Copia las fotos nuevas (limpias) y borra las que ya no están. Las últimas MAX_GROWLOG_PHOTOS. */
  private async syncPhotos(uid: string, growlogId: string, photos: PhotoRecord[], before: GrowlogPhoto[]): Promise<GrowlogPhoto[]> {
    const usable = photos
      .filter((p) => !p.isDemo && !p.isPendingSync && typeof p.storagePath === 'string' && p.storagePath.startsWith(`users/${uid}/`))
      .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))
      .slice(-MAX_GROWLOG_PHOTOS);
    const had = new Map(before.map((p) => [p.id, p]));
    const out: GrowlogPhoto[] = [];
    for (const p of usable) {
      const meta = { date: p.date, dayOfCultivation: p.dayOfCultivation, stage: p.stage, category: p.category, ...(p.caption ? { caption: p.caption.slice(0, 280) } : {}) };
      const old = had.get(p.id);
      if (old) {
        out.push({ ...old, ...meta });
        had.delete(p.id);
        continue;
      }
      const bytes = await this.files.read(p.storagePath as string);
      if (!bytes) continue;
      const clean = stripImageMetadata(bytes);
      if (!clean.supported) continue; // formato raro: no se publica una foto que no se pudo limpiar
      const ext = (p.storagePath as string).split('.').pop()?.toLowerCase() || 'jpg';
      const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const path = `community/growlogs/${growlogId}/${p.id}.${ext}`;
      const url = await this.files.write(path, clean.bytes, type);
      out.push({ id: p.id, url, path, ...meta });
    }
    for (const gone of had.values()) await this.files.delete(gone.path);
    return out;
  }

  // ---------------------------------------------------------------- explorar, growers y seguir

  /** Para Explorar: los growlogs públicos (los más nuevos), los growers y a quién seguís. */
  async explore(uid: string): Promise<{ growlogs: GrowlogCard[]; growers: GrowerCard[]; following: string[] }> {
    const [listed, profiles, following] = await Promise.all([
      this.db.query<Growlog>('growlogs', { where: [['listed', '==', true]], limit: EXPLORE_LIMIT }),
      this.db.query<PublicProfile>('profiles', { where: [['hidden', '==', false]], limit: EXPLORE_LIMIT }),
      this.followingOf(uid),
    ]);
    const growlogs = listed.map((d) => growlogCard(d.data)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const growers = profiles
      .map((d) => growerCard(d.data))
      .filter((p) => p.growlogs > 0 || p.uid === uid)
      .sort((a, b) => b.followers - a.followers || b.growlogs - a.growlogs);
    return { growlogs, growers, following };
  }

  /** Perfil de un grower con sus growlogs públicos (los tuyos, todos). */
  async grower(uid: string, handle: string, opts: { isAdmin?: boolean } = {}): Promise<{ profile: PublicProfile; growlogs: GrowlogCard[]; following: boolean }> {
    const owner = await this.db.get<{ uid: string }>(`handles/${String(handle).toLowerCase()}`);
    const profile = owner ? await this.getProfile(owner.uid) : null;
    if (!profile || (profile.hidden && profile.uid !== uid && !opts.isAdmin)) throw new CommunityError('No encontramos a ese grower.', 404);
    const own = profile.uid === uid;
    const mine = await this.myGrowlogs(profile.uid);
    const growlogs = mine
      .filter((g) => own || opts.isAdmin || g.listed)
      .map(growlogCard)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const following = !own && Boolean(await this.db.get(`follows/${uid}_${profile.uid}`));
    return { profile, growlogs, following };
  }

  /** Seguir (o dejar de seguir) a un grower. */
  async follow(uid: string, body: { uid?: unknown; follow?: unknown }): Promise<{ following: boolean; followers: number }> {
    await this.requireProfile(uid);
    const target = typeof body.uid === 'string' ? body.uid : '';
    if (!target || target === uid) throw new CommunityError('No te podés seguir a vos.');
    const other = await this.getProfile(target);
    if (!other || other.hidden) throw new CommunityError('No encontramos a ese grower.', 404);
    const path = `follows/${uid}_${target}`;
    if (body.follow === false) {
      if (await this.db.get(path)) {
        await this.db.delete(path);
        await this.db.increment(`profiles/${target}`, { followers: -1 });
        await this.db.increment(`profiles/${uid}`, { following: -1 });
      }
    } else if (await this.db.create(path, { followerUid: uid, followedUid: target, at: this.iso() })) {
      await this.db.increment(`profiles/${target}`, { followers: 1 });
      await this.db.increment(`profiles/${uid}`, { following: 1 });
    }
    const after = await this.getProfile(target);
    return { following: body.follow !== false, followers: Math.max(0, after?.followers || 0) };
  }

  private async followingOf(uid: string): Promise<string[]> {
    return (await this.db.query<{ followedUid: string }>('follows', { where: [['followerUid', '==', uid]] })).map((d) => d.data.followedUid);
  }

  /** Siguiendo: los growlogs públicos de la gente que seguís, los últimos actualizados primero. */
  async feed(uid: string): Promise<GrowlogCard[]> {
    const following = await this.followingOf(uid);
    const out: GrowlogCard[] = [];
    for (let i = 0; i < following.length; i += 30) {
      const chunk = following.slice(i, i + 30);
      const docs = await this.db.query<Growlog>('growlogs', { where: [['ownerUid', 'in', chunk], ['listed', '==', true]] });
      out.push(...docs.map((d) => growlogCard(d.data)));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
  }

  // ---------------------------------------------------------------- denuncias y moderación

  async report(uid: string, body: { kind?: unknown; targetId?: unknown; growlogId?: unknown; reason?: unknown; text?: unknown }): Promise<{ hidden: boolean }> {
    const kind = body.kind as ReportKind;
    if (!['growlog', 'profile', 'comment'].includes(kind)) throw new CommunityError('No sabemos qué querés denunciar.');
    const targetId = typeof body.targetId === 'string' ? body.targetId : '';
    if (!targetId) throw new CommunityError('Falta qué denunciar.');
    const reason = body.reason as ReportReason;
    if (!(reason in REPORT_REASONS)) throw new CommunityError('Elegí un motivo.');
    const growlogId = kind === 'comment' ? (typeof body.growlogId === 'string' ? body.growlogId : '') : kind === 'growlog' ? targetId : null;
    const path = this.targetPath(kind, targetId, growlogId);
    const target = await this.db.get<any>(path);
    if (!target) throw new CommunityError('Ya no existe.', 404);
    const ownerUid = kind === 'profile' ? targetId : kind === 'growlog' ? target.ownerUid : target.authorUid;
    if (ownerUid === uid) throw new CommunityError('No podés denunciar algo tuyo.');

    const report: Report = { id: `${kind}_${targetId}_${uid}`, kind, targetId, growlogId, reporterUid: uid, reason, text: text(body.text, 300), status: 'open', createdAt: this.iso() };
    const fresh = await this.db.create(`reports/${report.id}`, report);
    if (!fresh) return { hidden: Boolean(target.hidden) };
    await this.db.increment(path, { reports: 1 });
    const count = (Number(target.reports) || 0) + 1;
    if (count >= AUTO_HIDE_REPORTS && !target.hidden) {
      await this.setHidden(kind, targetId, growlogId, true);
      return { hidden: true };
    }
    return { hidden: Boolean(target.hidden) };
  }

  private targetPath(kind: ReportKind, targetId: string, growlogId: string | null) {
    if (kind === 'profile') return `profiles/${targetId}`;
    if (kind === 'growlog') return `growlogs/${targetId}`;
    return `growlogs/${growlogId}/comments/${targetId}`;
  }

  private async setHidden(kind: ReportKind, targetId: string, growlogId: string | null, hidden: boolean) {
    const path = this.targetPath(kind, targetId, growlogId);
    const target = await this.db.get<any>(path);
    if (!target) return;
    if (kind === 'growlog') {
      await this.db.update(path, { hidden, listed: target.privacy === 'public' && !hidden });
      await this.recountProfile(target.ownerUid);
    } else if (kind === 'profile') {
      await this.db.update(path, { hidden });
      const mine = await this.db.query<Growlog>('growlogs', { where: [['ownerUid', '==', targetId]] });
      for (const g of mine) await this.db.update(`growlogs/${g.id}`, { hidden, listed: g.data.privacy === 'public' && !hidden });
    } else {
      await this.db.update(path, { hidden });
    }
  }

  /** Denuncias abiertas agrupadas por lo denunciado (para el admin). */
  async openReports(): Promise<Array<{ kind: ReportKind; targetId: string; growlogId: string | null; reports: Report[]; target: any }>> {
    const open = (await this.db.query<Report>('reports', { where: [['status', '==', 'open']] })).map((d) => d.data);
    const groups = new Map<string, { kind: ReportKind; targetId: string; growlogId: string | null; reports: Report[]; target: any }>();
    for (const r of open) {
      const k = `${r.kind}_${r.targetId}`;
      if (!groups.has(k)) groups.set(k, { kind: r.kind, targetId: r.targetId, growlogId: r.growlogId, reports: [], target: await this.db.get(this.targetPath(r.kind, r.targetId, r.growlogId)) });
      groups.get(k)!.reports.push(r);
    }
    return [...groups.values()].sort((a, b) => b.reports.length - a.reports.length);
  }

  /** El admin decide: ocultar, volver a mostrar (descarta las denuncias) o borrar. */
  async resolveReports(body: { kind?: unknown; targetId?: unknown; growlogId?: unknown; action?: unknown }): Promise<void> {
    const kind = body.kind as ReportKind;
    const targetId = typeof body.targetId === 'string' ? body.targetId : '';
    const growlogId = typeof body.growlogId === 'string' ? body.growlogId : kind === 'growlog' ? targetId : null;
    if (!['growlog', 'profile', 'comment'].includes(kind) || !targetId) throw new CommunityError('Falta qué revisar.');
    const action = body.action;
    if (action === 'hide') await this.setHidden(kind, targetId, growlogId, true);
    else if (action === 'show') {
      await this.setHidden(kind, targetId, growlogId, false);
      if (await this.db.get(this.targetPath(kind, targetId, growlogId))) await this.db.update(this.targetPath(kind, targetId, growlogId), { reports: 0 });
    } else if (action === 'delete') {
      if (kind === 'growlog') {
        const g = await this.db.get<Growlog>(`growlogs/${targetId}`);
        if (g) {
          await this.removeGrowlog(g);
          await this.recountProfile(g.ownerUid);
        }
      } else if (kind === 'comment') {
        if (await this.db.get(`growlogs/${growlogId}/comments/${targetId}`)) {
          await this.db.delete(`growlogs/${growlogId}/comments/${targetId}`);
          await this.db.increment(`growlogs/${growlogId}`, { comments: -1 });
        }
      } else {
        await this.deleteAllForUser(targetId);
      }
    } else throw new CommunityError('Acción desconocida.');
    const reports = await this.db.query<Report>('reports', { where: [['targetId', '==', targetId], ['kind', '==', kind]] });
    for (const r of reports) await this.db.update(`reports/${r.id}`, { status: 'resolved' });
  }

  // ---------------------------------------------------------------- borrar cuenta

  /** Al borrar la cuenta (o por el admin): perfil, @usuario, growlogs y sus fotos. */
  async deleteAllForUser(uid: string): Promise<void> {
    for (const g of await this.myGrowlogs(uid)) await this.removeGrowlog(g);
    const p = await this.getProfile(uid);
    if (p?.handle) await this.db.delete(`handles/${p.handle}`);
    await this.db.delete(`profiles/${uid}`);
    await this.files.deletePrefix(`community/avatars/${uid}.`);
  }
}
