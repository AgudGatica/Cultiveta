/**
 * Preparar una foto del celular antes de guardarla (fotos de seguimiento, portada del cultivo, foto de
 * perfil). Antes cada pantalla abría la foto a su manera y rechazaba lo que el navegador no mostraba de
 * una ("el archivo puede estar dañado"), sin decir por qué.
 *
 * - Reconoce el formato por su contenido, no por el nombre: JPEG, PNG, WebP, GIF, BMP, AVIF y HEIC/HEIF
 *   (las fotos "de alta eficiencia" de iPhone, Samsung o Xiaomi).
 * - La abre con lo que tenga el navegador (createImageBitmap y, si no, una imagen común). Una HEIC que
 *   el navegador no abre (Chrome) se convierte a JPEG con heic2any, que se descarga solo en ese caso.
 * - Las fotos grandes se achican (por defecto, 2560 px del lado más largo) y se guardan en JPEG: suben
 *   más rápido, ocupan menos y no pierden detalle para ver la planta. Al pasar por el lienzo se van
 *   también los datos internos (ubicación GPS, modelo del celular…).
 * - Una foto chica que ya está en JPEG, PNG o WebP no se vuelve a comprimir: solo se le sacan los datos
 *   internos, y se comprueba que siga abriendo (si no, se usa la del lienzo).
 * - Si no se puede abrir, el error dice qué pasó (vacía, no es una foto, HEIC que no se pudo convertir…).
 */
import { exifOrientation, stripImageMetadata } from '../utils/imageMetadata';

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'empty' | 'unknown';

export const KIND_LABEL: Record<ImageKind, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP',
  avif: 'AVIF',
  heic: 'HEIC (alta eficiencia)',
  empty: 'vacío',
  unknown: 'desconocido',
};

export class PhotoPrepError extends Error {
  constructor(message: string, public kind: ImageKind) {
    super(message);
    this.name = 'PhotoPrepError';
  }
}

export interface PreparedPhoto {
  file: File;
  width: number;
  height: number;
  /** Formato de la foto original. */
  kind: ImageKind;
  /** Se achicó o se pasó a JPEG (si no, es la original sin datos internos). */
  reencoded: boolean;
}

export interface PrepareOptions {
  /** Lado más largo, en píxeles (por defecto 2560). */
  maxEdge?: number;
  /** Calidad del JPEG (por defecto 0,85). */
  quality?: number;
  /** Hasta este peso, una foto chica en JPEG/PNG/WebP se deja tal cual (sin datos internos). */
  keepOriginalUnderBytes?: number;
}

/** Lo que hace falta del navegador (en los tests se reemplaza). */
export interface ImageEnv {
  decode: (blob: Blob, resize?: { width: number; height: number } | null) => Promise<{ width: number; height: number; source: CanvasImageSource; close?: () => void } | null>;
  encode: (source: CanvasImageSource, width: number, height: number, quality: number) => Promise<Blob | null>;
  heicToJpeg: (blob: Blob) => Promise<Blob>;
}

const MAX_INPUT_BYTES = 80 * 1024 * 1024;
const DEFAULT_MAX_EDGE = 2560;
const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** El formato de una foto por sus primeros bytes. */
export function sniffImage(b: Uint8Array): ImageKind {
  if (!b.length) return 'empty';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 4 && ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (b.length >= 2 && ascii(b, 0, 2) === 'BM') return 'bmp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    // marca principal y compatibles del bloque ftyp (HEIC y AVIF son del mismo tipo de archivo)
    const size = Math.min(b.length, (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3] || 32);
    const brands = [ascii(b, 8, 4)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(b, i, 4));
    if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif';
    if (brands.some((x) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(x))) return 'heic';
  }
  return 'unknown';
}

/** Ancho y alto guardados en un JPEG (antes de girar), sin abrir la foto. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0–SOF15 (menos DHT, JPG y DAC): alto y ancho
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    if (m === 0xda || m === 0xd9) return null;
    i += 2 + len;
  }
  return null;
}

/** Orientación EXIF de un JPEG (1 = derecha). */
function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const m = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe1) {
      const o = exifOrientation(b.subarray(i + 4, i + 2 + len));
      if (o) return o;
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return 1;
}

export function fitSize(width: number, height: number, maxEdge: number) {
  const s = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

async function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}

// ---------- navegador ----------

async function decodeWithImageElement(blob: Blob) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      // algún navegador no avisa nunca: a los 20 s se da por perdida (en vez de quedar "preparando" para siempre)
      const timer = setTimeout(() => reject(new Error('timeout')), 20_000);
      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('img'));
      };
      img.src = url;
    });
    if (typeof img.decode === 'function') await img.decode().catch(() => undefined);
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { width: img.naturalWidth, height: img.naturalHeight, source: img as CanvasImageSource, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export const browserImageEnv: ImageEnv = {
  async decode(blob, resize) {
    if (typeof createImageBitmap === 'function') {
      // con la orientación de la foto; si se pidió, ya achicada al abrirla (menos memoria en el celular)
      // (solo el ancho: el alto sale solo y no se deforma aunque el navegador gire después de achicar)
      const tries: ImageBitmapOptions[] = [
        ...(resize ? [{ imageOrientation: 'from-image', resizeWidth: resize.width, resizeQuality: 'high' } as ImageBitmapOptions] : []),
        { imageOrientation: 'from-image' } as ImageBitmapOptions,
      ];
      for (const opts of tries) {
        try {
          const bmp = await createImageBitmap(blob, opts);
          if (bmp.width && bmp.height) return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
        } catch {
          /* probar de otra forma */
        }
      }
    }
    return decodeWithImageElement(blob);
  },
  async encode(source, width, height, quality) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; // una PNG con transparencia queda sobre blanco (el JPEG no tiene transparencia)
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  },
  async heicToJpeg(blob) {
    const mod: any = await import('heic2any');
    const convert = mod.default || mod;
    const out = await convert({ blob, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  },
};

let activeEnv: ImageEnv = browserImageEnv;
/** Para los tests (sin lienzo ni decodificador): reemplaza lo del navegador. Sin argumento, vuelve al real. */
export function setImageEnv(env?: ImageEnv) {
  activeEnv = env || browserImageEnv;
}

// ---------- preparar ----------

const baseName = (name: string) => (name || 'foto').replace(/\.[^.]*$/, '').replace(/[^\w\-. ]+/g, '').trim().slice(0, 60) || 'foto';
const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;

/**
 * Deja la foto lista para guardar: abierta, del tamaño justo y sin datos internos. Tira PhotoPrepError
 * con un mensaje en castellano si no se puede.
 */
export async function preparePhoto(input: File, o: PrepareOptions = {}, env: ImageEnv = activeEnv): Promise<PreparedPhoto> {
  const maxEdge = o.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = o.quality ?? 0.85;
  const keepUnder = o.keepOriginalUnderBytes ?? 3 * 1024 * 1024;

  if (!input || input.size === 0) {
    throw new PhotoPrepError('La foto llegó vacía. Si está guardada en la nube (Google Fotos, iCloud), abrila primero en el celular para que se descargue y probá de nuevo.', 'empty');
  }
  if (input.size > MAX_INPUT_BYTES) throw new PhotoPrepError(`La foto pesa ${mb(input.size)}: es demasiado grande. Probá con otra o sacala de nuevo.`, 'unknown');

  let bytes: Uint8Array;
  try {
    bytes = await readBytes(input);
  } catch {
    throw new PhotoPrepError('No se pudo leer la foto del celular. Si está en la nube, abrila primero para que se descargue y probá de nuevo.', 'unknown');
  }
  const kind = sniffImage(bytes);
  if (kind === 'empty') throw new PhotoPrepError('La foto llegó vacía. Si está guardada en la nube (Google Fotos, iCloud), abrila primero en el celular para que se descargue y probá de nuevo.', 'empty');

  // 1. Abrirla (HEIC: si el navegador no puede, se convierte a JPEG)
  let source: Blob = input;
  let jpegBytes = kind === 'jpeg' ? bytes : null;
  let resize: { width: number; height: number } | null = null;
  if (jpegBytes) {
    // un JPEG enorme se abre ya achicado: así no se queda sin memoria el celular
    const size = jpegSize(jpegBytes);
    if (size && Math.max(size.width, size.height) > maxEdge * 2) {
      const turned = jpegOrientation(jpegBytes) >= 5;
      const out = fitSize(turned ? size.height : size.width, turned ? size.width : size.height, maxEdge);
      resize = out;
    }
  }
  let img = await env.decode(source, resize).catch(() => null);
  if (!img && kind === 'heic') {
    try {
      source = await env.heicToJpeg(input);
      jpegBytes = null;
      img = await env.decode(source, null).catch(() => null);
    } catch {
      img = null;
    }
    if (!img) {
      throw new PhotoPrepError(
        'Esta foto está en HEIC ("alta eficiencia") y no se pudo convertir. En la cámara del celular elegí el formato JPEG o "Más compatible", o sacala con el botón Cámara de Cultiveta.',
        'heic'
      );
    }
  }
  if (!img) {
    if (kind === 'unknown') throw new PhotoPrepError('Ese archivo no es una foto que Cultiveta pueda abrir. Elegí una foto JPG, PNG, WebP o HEIC.', kind);
    throw new PhotoPrepError(`No se pudo abrir esta foto (${KIND_LABEL[kind]}, ${mb(input.size)}). Probá con otra o sacala con el botón Cámara de Cultiveta.`, kind);
  }

  try {
    const target = fitSize(img.width, img.height, maxEdge);
    const name = baseName(input.name);

    // 2. Chica y en un formato de la web: se deja igual, solo sin datos internos (si sigue abriendo).
    //    (Si se abrió ya achicada, la original es grande: nunca se deja tal cual.)
    const small = !resize && target.width === img.width && target.height === img.height && input.size <= keepUnder;
    if (small && (kind === 'jpeg' || kind === 'png' || kind === 'webp') && source === input) {
      const r = stripImageMetadata(bytes);
      if (r.supported) {
        const type = kind === 'jpeg' ? 'image/jpeg' : kind === 'png' ? 'image/png' : 'image/webp';
        const ext = kind === 'jpeg' ? 'jpg' : kind;
        const clean = new File([r.bytes], `${name}.${ext}`, { type, lastModified: input.lastModified });
        const check = r.removed === 0 ? img : await env.decode(clean, null).catch(() => null);
        if (check) {
          if (check !== img) check.close?.();
          return { file: clean, width: img.width, height: img.height, kind, reencoded: false };
        }
      }
    }

    // 3. Si no, al tamaño justo y en JPEG (el lienzo no copia los datos internos)
    let blob = await env.encode(img.source, target.width, target.height, quality);
    let out = target;
    if (!blob) {
      // poca memoria: más chica
      out = fitSize(img.width, img.height, Math.min(1600, maxEdge));
      blob = await env.encode(img.source, out.width, out.height, quality);
    }
    if (!blob || !blob.size) throw new PhotoPrepError('No se pudo preparar la foto en este celular (poca memoria). Cerrá otras apps y probá de nuevo.', kind);
    return { file: new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: input.lastModified }), width: out.width, height: out.height, kind, reencoded: true };
  } finally {
    img.close?.();
  }
}
