/**
 * Privacidad de las fotos: borra los datos internos que guarda el celular (EXIF con la ubicación GPS,
 * modelo, fecha y hora; XMP; IPTC; comentarios) sin volver a comprimir la imagen.
 *
 * - JPEG: se sacan los segmentos APP1 (EXIF/XMP), APP3–APP13, APP15 y COM, y todo lo que viene después
 *   del fin de la imagen (otras imágenes pegadas, como el mapa de HDR, que pueden traer sus propios datos).
 *   Se conservan APP0 (JFIF), APP2 (perfil de color) y APP14 (Adobe). Si la foto tenía orientación
 *   (sacada con el celular de costado), se deja un EXIF mínimo con SOLO la orientación para que no
 *   aparezca girada.
 * - PNG: se sacan los bloques eXIf, tEXt, zTXt, iTXt y tIME.
 * - WebP: se sacan los bloques EXIF y XMP y se corrigen las marcas y el tamaño.
 * Otro formato (o un archivo roto) vuelve tal cual con supported: false.
 *
 * Funciona igual en el navegador y en el servidor (solo usa Uint8Array).
 */

export interface StripResult {
  bytes: Uint8Array;
  /** Se entendió el formato y quedó limpio. */
  supported: boolean;
  /** Cantidad de bloques de datos que se sacaron. */
  removed: number;
}

const JPEG_DROP = new Set([0xe1, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xef, 0xfe]);

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];

/** Orientación (1–8) guardada en un segmento EXIF; null si no tiene. */
export function exifOrientation(seg: Uint8Array): number | null {
  // seg = contenido del APP1 (sin marcador ni largo): "Exif\0\0" + TIFF
  if (seg.length < 14 || String.fromCharCode(...seg.subarray(0, 4)) !== 'Exif') return null;
  const t = 6;
  const le = seg[t] === 0x49 && seg[t + 1] === 0x49;
  if (!le && !(seg[t] === 0x4d && seg[t + 1] === 0x4d)) return null;
  const r16 = (i: number) => (le ? seg[i] | (seg[i + 1] << 8) : (seg[i] << 8) | seg[i + 1]);
  const r32 = (i: number) => (le ? (seg[i] | (seg[i + 1] << 8) | (seg[i + 2] << 16)) + seg[i + 3] * 0x1000000 : seg[i] * 0x1000000 + ((seg[i + 1] << 16) | (seg[i + 2] << 8) | seg[i + 3]));
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.length) return null;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > seg.length) return null;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** APP1 con un EXIF que solo dice la orientación. */
function orientationSegment(orientation: number): Uint8Array {
  const payload = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD0 en 8
    0x00, 0x01, // una entrada
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation (SHORT)
    0x00, 0x00, 0x00, 0x00, // no hay más IFD
  ];
  const len = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
}

function stripJpeg(b: Uint8Array): StripResult | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let removed = 0;
  let orientation: number | null = null;
  let orientationAt = -1;
  let i = 2;
  let inScan = false;
  while (i < b.length) {
    if (inScan) {
      // Datos comprimidos: termina en el próximo marcador que no sea relleno (FF00) ni reinicio (FFD0–FFD7)
      let j = i;
      while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7))) j++;
      if (j + 1 >= b.length) return null; // sin fin de imagen: archivo cortado
      parts.push(b.subarray(i, j));
      i = j;
      inScan = false;
      continue;
    }
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    let k = i + 1;
    while (m === 0xff && k + 1 < b.length) m = b[++k]; // relleno entre marcadores
    const start = k - 1;
    if (m === 0xd9) {
      parts.push(Uint8Array.from([0xff, 0xd9]));
      removed += b.length > k + 1 ? 1 : 0; // lo pegado después del fin
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      parts.push(b.subarray(start, k + 1));
      i = k + 1;
      continue;
    }
    if (k + 2 >= b.length) return null;
    const len = u16be(b, k + 1);
    const end = k + 1 + len;
    if (len < 2 || end > b.length) return null;
    if (JPEG_DROP.has(m)) {
      removed++;
      if (m === 0xe1 && orientation === null) {
        const o = exifOrientation(b.subarray(k + 3, end));
        if (o !== null) {
          orientation = o;
          orientationAt = parts.length;
        }
      }
    } else {
      parts.push(b.subarray(start, end));
    }
    i = end;
    if (m === 0xda) inScan = true;
  }
  if (orientation !== null && orientation !== 1) parts.splice(orientationAt, 0, orientationSegment(orientation));
  return { bytes: concat(parts), supported: true, removed };
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(b: Uint8Array): StripResult | null {
  if (b.length < 8 || PNG_SIG.some((v, i) => b[i] !== v)) return null;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let removed = 0;
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
    const end = i + 12 + len;
    if (end > b.length) return null;
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (PNG_DROP.has(type)) removed++;
    else parts.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return { bytes: concat(parts), supported: true, removed };
}

function stripWebp(b: Uint8Array): StripResult | null {
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
  const parts: Uint8Array[] = [];
  let removed = 0;
  let i = 12;
  while (i + 8 <= b.length) {
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] * 0x1000000);
    const end = i + 8 + len + (len & 1);
    if (i + 8 + len > b.length) return null;
    const type = tag(i);
    if (type === 'EXIF' || type === 'XMP ') removed++;
    else if (type === 'VP8X') {
      const c = b.slice(i, Math.min(end, b.length));
      c[8] &= ~0x0c; // ya no hay EXIF (0x08) ni XMP (0x04)
      parts.push(c);
    } else parts.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  const body = concat(parts);
  const size = body.length + 4;
  const head = Uint8Array.from([0x52, 0x49, 0x46, 0x46, size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff, 0x57, 0x45, 0x42, 0x50]);
  return { bytes: concat([head, body]), supported: true, removed };
}

export function stripImageMetadata(bytes: Uint8Array): StripResult {
  try {
    const r = stripJpeg(bytes) || stripPng(bytes) || stripWebp(bytes);
    // Ya estaba limpia (por ejemplo, solo tenía la orientación que se vuelve a poner): la misma
    if (r && r.bytes.length === bytes.length && r.bytes.every((v, i) => v === bytes[i])) return { bytes, supported: true, removed: 0 };
    if (r) return r;
  } catch {
    // archivo raro: se trata como formato no soportado
  }
  return { bytes, supported: false, removed: 0 };
}
