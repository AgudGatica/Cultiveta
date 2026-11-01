/**
 * Dónde guarda la Comunidad: una base de documentos (Firestore en producción, memoria en los tests) y los
 * archivos públicos (fotos de los growlogs y avatares, en Firebase Storage).
 *
 * Los caminos son como en Firestore: "colección/doc" o "colección/doc/subcolección/doc".
 */
import crypto from 'crypto';

export type Where = [field: string, op: '==' | 'in' | 'array-contains', value: unknown];

export interface QueryOptions {
  where?: Where[];
  orderBy?: { field: string; dir?: 'asc' | 'desc' };
  limit?: number;
}

export interface DocSnap<T = any> {
  id: string;
  data: T;
}

export interface CommunityDb {
  get<T = any>(path: string): Promise<T | null>;
  set(path: string, data: object): Promise<void>;
  update(path: string, data: object): Promise<void>;
  /** Crea solo si no existe; false si ya existía (para @usuario único, una vista por día, un me gusta). */
  create(path: string, data: object): Promise<boolean>;
  delete(path: string): Promise<void>;
  /** Suma (o resta) a campos numéricos de un documento que ya existe. */
  increment(path: string, fields: Record<string, number>): Promise<void>;
  query<T = any>(collection: string, options?: QueryOptions): Promise<DocSnap<T>[]>;
  /** Borra un documento y todas sus subcolecciones. */
  deleteDeep(path: string): Promise<void>;
}

export interface CommunityFiles {
  /** Lee un archivo (null si no existe). */
  read(path: string): Promise<Uint8Array | null>;
  /** Guarda un archivo público y devuelve su dirección para mostrarlo. */
  write(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
  delete(path: string): Promise<void>;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function matches(data: any, where: Where[] = []): boolean {
  return where.every(([field, op, value]) => {
    const v = field.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
    if (op === '==') return v === value;
    if (op === 'in') return Array.isArray(value) && value.includes(v);
    return Array.isArray(v) && v.includes(value);
  });
}

/** En memoria: tests y desarrollo sin Firebase. */
export class MemoryCommunityDb implements CommunityDb {
  docs = new Map<string, any>();
  async get(path: string) {
    return this.docs.has(path) ? clone(this.docs.get(path)) : null;
  }
  async set(path: string, data: object) {
    this.docs.set(path, clone(data));
  }
  async update(path: string, data: object) {
    if (!this.docs.has(path)) throw new Error(`No existe ${path}`);
    this.docs.set(path, { ...this.docs.get(path), ...clone(data) });
  }
  async create(path: string, data: object) {
    if (this.docs.has(path)) return false;
    this.docs.set(path, clone(data));
    return true;
  }
  async delete(path: string) {
    this.docs.delete(path);
  }
  async increment(path: string, fields: Record<string, number>) {
    const d = this.docs.get(path);
    if (!d) return;
    for (const [k, n] of Object.entries(fields)) d[k] = (Number(d[k]) || 0) + n;
  }
  async query(collection: string, options: QueryOptions = {}) {
    const depth = collection.split('/').length;
    let out = [...this.docs.entries()]
      .filter(([p]) => p.startsWith(`${collection}/`) && p.split('/').length === depth + 1)
      .map(([p, data]) => ({ id: p.split('/').pop() as string, data: clone(data) }))
      .filter((d) => matches(d.data, options.where));
    if (options.orderBy) {
      const { field, dir = 'asc' } = options.orderBy;
      out.sort((a, b) => {
        const x = a.data[field] ?? '';
        const y = b.data[field] ?? '';
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    }
    if (options.limit) out = out.slice(0, options.limit);
    return out;
  }
  async deleteDeep(path: string) {
    for (const p of [...this.docs.keys()]) if (p === path || p.startsWith(`${path}/`)) this.docs.delete(p);
  }
}

export class MemoryCommunityFiles implements CommunityFiles {
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async read(path: string) {
    return this.files.get(path)?.bytes ?? null;
  }
  async write(path: string, bytes: Uint8Array, contentType: string) {
    this.files.set(path, { bytes, contentType });
    return `memory://${path}`;
  }
  async deletePrefix(prefix: string) {
    for (const p of [...this.files.keys()]) if (p.startsWith(prefix)) this.files.delete(p);
  }
  async delete(path: string) {
    this.files.delete(path);
  }
}

/** Firestore con Firebase Admin. */
export class FirestoreCommunityDb implements CommunityDb {
  constructor(private db: any, private fieldValue: any) {}
  private ref(path: string) {
    return this.db.doc(path);
  }
  async get(path: string) {
    const s = await this.ref(path).get();
    return s.exists ? s.data() : null;
  }
  async set(path: string, data: object) {
    await this.ref(path).set(clone(data));
  }
  async update(path: string, data: object) {
    await this.ref(path).update(clone(data));
  }
  async create(path: string, data: object) {
    try {
      await this.ref(path).create(clone(data));
      return true;
    } catch (err: any) {
      if (err?.code === 6 || /already exists/i.test(String(err?.message))) return false;
      throw err;
    }
  }
  async delete(path: string) {
    await this.ref(path).delete();
  }
  async increment(path: string, fields: Record<string, number>) {
    const patch: Record<string, unknown> = {};
    for (const [k, n] of Object.entries(fields)) patch[k] = this.fieldValue.increment(n);
    try {
      await this.ref(path).update(patch);
    } catch (err: any) {
      if (err?.code !== 5) throw err; // NOT_FOUND: ya no existe, no hay nada que contar
    }
  }
  async query(collection: string, options: QueryOptions = {}) {
    let q = this.db.collection(collection);
    for (const [f, op, v] of options.where || []) q = q.where(f, op, v);
    if (options.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.dir || 'asc');
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
  }
  async deleteDeep(path: string) {
    await this.db.recursiveDelete(this.ref(path));
  }
}

/** Firebase Storage con Firebase Admin: los archivos públicos se leen con un enlace con token. */
export class StorageCommunityFiles implements CommunityFiles {
  constructor(private bucket: any) {}
  async read(path: string) {
    try {
      const [buf] = await this.bucket.file(path).download();
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    } catch (err: any) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
  async write(path: string, bytes: Uint8Array, contentType: string) {
    const token = crypto.randomUUID();
    await this.bucket.file(path).save(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), {
      metadata: { contentType, cacheControl: 'public, max-age=86400', metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${this.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  async deletePrefix(prefix: string) {
    await this.bucket.deleteFiles({ prefix });
  }
  async delete(path: string) {
    await this.bucket.file(path).delete({ ignoreNotFound: true });
  }
}
