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
export const MAX_COMMENT = 280;
/** Para frenar el spam: comentarios por persona por minuto. */
export const COMMENTS_PER_MINUTE = 10;

export interface Comment {
  id: string;
  growlogId: string;
  authorUid: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorAvatarColor: string;
  text: string;
  hidden: boolean;
  reports: number;
  createdAt: string;
}

/** Aviso de la comunidad: alguien te siguió, le dio me gusta o comentó tu growlog. */
export interface Notice {
  id: string;
  kind: 'follow' | 'like' | 'comment';
  fromUid: string;
  fromHandle: string;
  fromName: string;
  fromAvatarUrl: string | null;
  fromAvatarColor: string;
  growlogId: string | null;
  growlogTitle: string | null;
  text: string | null;
  read: boolean;
  createdAt: string;
}

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
  /** Cuándo comentó cada persona en el último minuto (por instancia del servidor). */
  private commentTimes = new Map<string, number[]>();
  /** Avisos al celular: cada aviso nuevo de la campana (me gusta, comentario, seguidor). */
  onNotice: ((to: string, notice: Notice) => void) | null = null;

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
    const [listed, profiles, following, blocked] = await Promise.all([
      this.db.query<Growlog>('growlogs', { where: [['listed', '==', true]], limit: EXPLORE_LIMIT }),
      this.db.query<PublicProfile>('profiles', { where: [['hidden', '==', false]], limit: EXPLORE_LIMIT }),
      this.followingOf(uid),
      this.blockedBy(uid),
    ]);
    const growlogs = listed
      .filter((d) => !blocked.has(d.data.ownerUid))
      .map((d) => growlogCard(d.data))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const growers = profiles
      .map((d) => growerCard(d.data))
      .filter((p) => (p.growlogs > 0 || p.uid === uid) && !blocked.has(p.uid))
      .sort((a, b) => b.followers - a.followers || b.growlogs - a.growlogs);
    return { growlogs, growers, following };
  }

  /** Perfil de un grower con sus growlogs públicos (los tuyos, todos). */
  async grower(uid: string, handle: string, opts: { isAdmin?: boolean } = {}): Promise<{ profile: PublicProfile; growlogs: GrowlogCard[]; following: boolean; blocked: boolean }> {
    const owner = await this.db.get<{ uid: string }>(`handles/${String(handle).toLowerCase()}`);
    const profile = owner ? await this.getProfile(owner.uid) : null;
    if (!profile || (profile.hidden && profile.uid !== uid && !opts.isAdmin)) throw new CommunityError('No encontramos a ese grower.', 404);
    const own = profile.uid === uid;
    const blocked = !own && Boolean(await this.db.get(`users/${uid}/blocks/${profile.uid}`));
    const mine = blocked ? [] : await this.myGrowlogs(profile.uid);
    const growlogs = mine
      .filter((g) => own || opts.isAdmin || g.listed)
      .map(growlogCard)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const following = !own && Boolean(await this.db.get(`follows/${uid}_${profile.uid}`));
    return { profile, growlogs, following, blocked };
  }

  /** Seguir (o dejar de seguir) a un grower. */
  async follow(uid: string, body: { uid?: unknown; follow?: unknown }): Promise<{ following: boolean; followers: number }> {
    await this.requireProfile(uid);
    const target = typeof body.uid === 'string' ? body.uid : '';
    if (!target || target === uid) throw new CommunityError('No te podés seguir a vos.');
    const other = await this.getProfile(target);
    if (!other || other.hidden) throw new CommunityError('No encontramos a ese grower.', 404);
    if (body.follow === false) await this.unfollow(uid, target);
    else {
      if (await this.db.get(`users/${target}/blocks/${uid}`)) throw new CommunityError('No podés seguir a este grower.', 403);
      const me = await this.requireProfile(uid);
      if (await this.db.create(`follows/${uid}_${target}`, { followerUid: uid, followedUid: target, at: this.iso() })) {
        await this.db.increment(`profiles/${target}`, { followers: 1 });
        await this.db.increment(`profiles/${uid}`, { following: 1 });
        await this.notify(target, `follow_${uid}`, { kind: 'follow', from: me });
      }
    }
    const after = await this.getProfile(target);
    return { following: body.follow !== false, followers: Math.max(0, after?.followers || 0) };
  }

  private async unfollow(uid: string, target: string) {
    if (!(await this.db.get(`follows/${uid}_${target}`))) return;
    await this.db.delete(`follows/${uid}_${target}`);
    await this.db.increment(`profiles/${target}`, { followers: -1 });
    await this.db.increment(`profiles/${uid}`, { following: -1 });
  }

  /** A quiénes bloqueó esta persona (no ve lo suyo). */
  private async blockedBy(uid: string): Promise<Set<string>> {
    return new Set((await this.db.query('users/' + uid + '/blocks')).map((d) => d.id));
  }

  /** Bloquear (o desbloquear) a un grower: no ves lo suyo, no te puede comentar ni seguir y se dejan de seguir. */
  async block(uid: string, body: { uid?: unknown; block?: unknown }): Promise<{ blocked: boolean }> {
    const target = typeof body.uid === 'string' ? body.uid : '';
    if (!target || target === uid) throw new CommunityError('No te podés bloquear a vos.');
    if (body.block === false) {
      await this.db.delete(`users/${uid}/blocks/${target}`);
      return { blocked: false };
    }
    await this.db.set(`users/${uid}/blocks/${target}`, { at: this.iso() });
    await this.unfollow(uid, target);
    await this.unfollow(target, uid);
    return { blocked: true };
  }

  // ---------------------------------------------------------------- me gusta, vistas y comentarios

  /** Lo que ve quien abre un growlog: si le dio me gusta, si sigue al grower y si lo bloqueó. */
  async viewerState(uid: string, g: Growlog): Promise<{ liked: boolean; following: boolean; blocked: boolean }> {
    const own = g.ownerUid === uid;
    const [liked, following, blocked] = await Promise.all([
      this.db.get(`growlogs/${g.id}/likes/${uid}`),
      own ? null : this.db.get(`follows/${uid}_${g.ownerUid}`),
      own ? null : this.db.get(`users/${uid}/blocks/${g.ownerUid}`),
    ]);
    return { liked: Boolean(liked), following: Boolean(following), blocked: Boolean(blocked) };
  }

  /** Una vista por persona por día (las del dueño no cuentan). */
  async view(uid: string, growlogId: string): Promise<{ views: number }> {
    const g = await this.getGrowlog(uid, growlogId);
    if (g.ownerUid === uid) return { views: g.views };
    const day = this.iso().slice(0, 10).replace(/-/g, '');
    if (await this.db.create(`growlogs/${g.id}/views/${uid}_${day}`, { at: this.iso() })) {
      await this.db.increment(`growlogs/${g.id}`, { views: 1 });
      await this.db.increment(`profiles/${g.ownerUid}`, { views: 1 });
      return { views: g.views + 1 };
    }
    return { views: g.views };
  }

  async like(uid: string, growlogId: string, like: boolean): Promise<{ liked: boolean; likes: number }> {
    const me = await this.requireProfile(uid);
    const g = await this.getGrowlog(uid, growlogId);
    const path = `growlogs/${g.id}/likes/${uid}`;
    if (!like) {
      if (await this.db.get(path)) {
        await this.db.delete(path);
        await this.db.delete(`users/${uid}/communityRefs/l_${g.id}`);
        await this.db.increment(`growlogs/${g.id}`, { likes: -1 });
        return { liked: false, likes: Math.max(0, g.likes - 1) };
      }
      return { liked: false, likes: g.likes };
    }
    if (!(await this.db.create(path, { at: this.iso() }))) return { liked: true, likes: g.likes };
    await this.db.set(`users/${uid}/communityRefs/l_${g.id}`, { kind: 'like', growlogId: g.id });
    await this.db.increment(`growlogs/${g.id}`, { likes: 1 });
    if (g.ownerUid !== uid) await this.notify(g.ownerUid, `like_${g.id}_${uid}`, { kind: 'like', from: me, growlog: g });
    return { liked: true, likes: g.likes + 1 };
  }

  /** Comentarios de un growlog, el más viejo primero (sin los ocultos ni los de quien bloqueaste). */
  async comments(uid: string, growlogId: string, opts: { isAdmin?: boolean } = {}): Promise<Comment[]> {
    const g = await this.getGrowlog(uid, growlogId, opts);
    const blocked = await this.blockedBy(uid);
    const all = (await this.db.query<Comment>(`growlogs/${g.id}/comments`, { orderBy: { field: 'createdAt', dir: 'asc' }, limit: 500 })).map((d) => d.data);
    return all.filter((c) => (!c.hidden || c.authorUid === uid || opts.isAdmin) && !blocked.has(c.authorUid));
  }

  async addComment(uid: string, growlogId: string, body: { text?: unknown }): Promise<Comment> {
    const me = await this.requireProfile(uid);
    const g = await this.getGrowlog(uid, growlogId);
    const text = typeof body.text === 'string' ? body.text.trim().replace(/\s+\n/g, '\n').slice(0, MAX_COMMENT) : '';
    if (!text) throw new CommunityError('Escribí algo.');
    if (await this.db.get(`users/${g.ownerUid}/blocks/${uid}`)) throw new CommunityError('No podés comentar en este growlog.', 403);
    const now = this.now().getTime();
    const recent = (this.commentTimes.get(uid) || []).filter((t) => now - t < 60_000);
    if (recent.length >= COMMENTS_PER_MINUTE) throw new CommunityError('Estás comentando muy seguido. Esperá un minuto.', 429);
    this.commentTimes.set(uid, [...recent, now]);
    const c: Comment = {
      id: newId(),
      growlogId: g.id,
      authorUid: uid,
      authorHandle: me.handle,
      authorName: me.displayName,
      authorAvatarUrl: me.avatarUrl,
      authorAvatarColor: me.avatarColor,
      text,
      hidden: false,
      reports: 0,
      createdAt: this.iso(),
    };
    await this.db.set(`growlogs/${g.id}/comments/${c.id}`, c);
    await this.db.set(`users/${uid}/communityRefs/c_${g.id}_${c.id}`, { kind: 'comment', growlogId: g.id, commentId: c.id });
    await this.db.increment(`growlogs/${g.id}`, { comments: 1 });
    if (g.ownerUid !== uid) await this.notify(g.ownerUid, `comment_${c.id}`, { kind: 'comment', from: me, growlog: g, text });
    return c;
  }

  /** Borra quien lo escribió, el dueño del growlog o el admin. */
  async deleteComment(uid: string, growlogId: string, commentId: string, opts: { isAdmin?: boolean } = {}): Promise<void> {
    const g = await this.db.get<Growlog>(`growlogs/${growlogId}`);
    const c = g ? await this.db.get<Comment>(`growlogs/${growlogId}/comments/${commentId}`) : null;
    if (!g || !c) return;
    if (c.authorUid !== uid && g.ownerUid !== uid && !opts.isAdmin) throw new CommunityError('Ese comentario no es tuyo.', 403);
    await this.db.delete(`growlogs/${growlogId}/comments/${commentId}`);
    await this.db.delete(`users/${c.authorUid}/communityRefs/c_${growlogId}_${commentId}`);
    await this.db.increment(`growlogs/${growlogId}`, { comments: -1 });
  }

  // ---------------------------------------------------------------- avisos

  private async notify(to: string, id: string, n: { kind: Notice['kind']; from: PublicProfile; growlog?: Growlog; text?: string }) {
    if (await this.db.get(`users/${to}/blocks/${n.from.uid}`)) return;
    const notice: Notice = {
      id,
      kind: n.kind,
      fromUid: n.from.uid,
      fromHandle: n.from.handle,
      fromName: n.from.displayName,
      fromAvatarUrl: n.from.avatarUrl,
      fromAvatarColor: n.from.avatarColor,
      growlogId: n.growlog?.id || null,
      growlogTitle: n.growlog?.title || null,
      text: n.text ? n.text.slice(0, 140) : null,
      read: false,
      createdAt: this.iso(),
    };
    await this.db.set(`users/${to}/notifications/${id}`, notice);
    this.onNotice?.(to, notice);
  }

  async notifications(uid: string): Promise<Notice[]> {
    return (await this.db.query<Notice>(`users/${uid}/notifications`, { orderBy: { field: 'createdAt', dir: 'desc' }, limit: 50 })).map((d) => d.data);
  }

  async unreadCount(uid: string): Promise<number> {
    return (await this.notifications(uid)).filter((n) => !n.read).length;
  }

  async markRead(uid: string): Promise<void> {
    for (const n of await this.notifications(uid)) if (!n.read) await this.db.update(`users/${uid}/notifications/${n.id}`, { read: true });
  }

  private async followingOf(uid: string): Promise<string[]> {
    return (await this.db.query<{ followedUid: string }>('follows', { where: [['followerUid', '==', uid]] })).map((d) => d.data.followedUid);
  }

  /** Siguiendo: los growlogs públicos de la gente que seguís, los últimos actualizados primero. */
  async feed(uid: string): Promise<{ growlogs: GrowlogCard[]; liked: string[] }> {
    const following = await this.followingOf(uid);
    const out: GrowlogCard[] = [];
    for (let i = 0; i < following.length; i += 30) {
      const chunk = following.slice(i, i + 30);
      const docs = await this.db.query<Growlog>('growlogs', { where: [['ownerUid', 'in', chunk], ['listed', '==', true]] });
      out.push(...docs.map((d) => growlogCard(d.data)));
    }
    const growlogs = out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100);
    const liked = (await Promise.all(growlogs.map(async (g) => ((await this.db.get(`growlogs/${g.id}/likes/${uid}`)) ? g.id : null)))).filter(Boolean) as string[];
    return { growlogs, liked };
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
    // Sus comentarios y me gusta en growlogs de otros (se verifica cada uno: la lista la puede tocar la persona)
    for (const r of await this.db.query<{ kind: string; growlogId: string; commentId?: string }>(`users/${uid}/communityRefs`)) {
      const { kind, growlogId, commentId } = r.data;
      if (kind === 'comment' && commentId) {
        const c = await this.db.get<Comment>(`growlogs/${growlogId}/comments/${commentId}`);
        if (c?.authorUid === uid) await this.deleteComment(uid, growlogId, commentId);
      } else if (kind === 'like' && (await this.db.get(`growlogs/${growlogId}/likes/${uid}`))) {
        await this.db.delete(`growlogs/${growlogId}/likes/${uid}`);
        await this.db.increment(`growlogs/${growlogId}`, { likes: -1 });
      }
      await this.db.delete(`users/${uid}/communityRefs/${r.id}`);
    }
    for (const f of await this.db.query<{ followedUid: string }>('follows', { where: [['followerUid', '==', uid]] })) await this.unfollow(uid, f.data.followedUid);
    for (const f of await this.db.query<{ followerUid: string }>('follows', { where: [['followedUid', '==', uid]] })) await this.unfollow(f.data.followerUid, uid);
    const p = await this.getProfile(uid);
    if (p?.handle) await this.db.delete(`handles/${p.handle}`);
    await this.db.delete(`profiles/${uid}`);
    await this.files.deletePrefix(`community/avatars/${uid}.`);
  }
}
