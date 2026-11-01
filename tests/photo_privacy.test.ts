/**
 * tests/photo_privacy.test.ts
 *
 * SUITE: FOTOS SIN UBICACIÓN NI DATOS DEL CELULAR (src/utils/imageMetadata.ts, src/services/photoPrivacy.ts)
 *
 *  1. JPEG: se va el EXIF (con el GPS), el XMP, el IPTC, los comentarios y lo pegado después del fin;
 *     quedan el JFIF, el perfil de color y la imagen intacta.
 *  2. JPEG sacado de costado: queda un EXIF mínimo con SOLO la orientación.
 *  3. JPEG con orientación normal: no se agrega nada.
 *  4. JPEG progresivo (varios barridos) y con reinicios: la imagen queda entera.
 *  5. PNG: se van eXIf, tEXt, iTXt y tIME; queda la imagen.
 *  6. WebP: se van EXIF y XMP, se apagan sus marcas y se corrige el tamaño.
 *  7. Formato desconocido o archivo cortado: vuelve tal cual (no se rompe la foto).
 *  8. cleanPhotoFile: devuelve un File limpio con el mismo nombre y tipo; si no había nada, el mismo.
 */

import './helpers/setupDom';
import { exifOrientation, stripImageMetadata } from '../src/utils/imageMetadata';
import { cleanPhotoFile } from '../src/services/photoPrivacy';

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASÓ] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));

/** Segmento JPEG: FF marcador + largo + contenido. */
function seg(marker: number, payload: number[]): number[] {
  const len = payload.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...payload];
}

/** EXIF (little-endian, como los celulares) con orientación y un texto que simula el GPS. */
function exif(orientation: number): number[] {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II, IFD0 en 8
    0x02, 0x00, // dos entradas
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation
    0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00, // GPS IFD (puntero)
    0x00, 0x00, 0x00, 0x00,
    ...ascii('GPS-34.6037S-58.3816W PixelPhone'),
  ];
  return [...ascii('Exif'), 0, 0, ...tiff];
}

const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78]; // datos con relleno FF00 y un reinicio FFD0

function jpeg(orientation: number, extra: number[][] = []): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, exif(orientation)),
    ...seg(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0, ...ascii('<xmp>Buenos Aires</xmp>')]),
    ...seg(0xe2, [...ascii('ICC_PROFILE'), 0, 1, 1, 9, 9]),
    ...seg(0xed, [...ascii('Photoshop 3.0'), 0, ...ascii('IPTC-City')]),
    ...seg(0xfe, ascii('comentario con datos')),
    ...seg(0xdb, [0x00, 1, 2, 3]),
    ...extra.flat(),
    ...seg(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    ...SCAN,
    0xff, 0xd9,
    // otra imagen pegada después del fin (mapa HDR) con su propio EXIF
    0xff, 0xd8, ...seg(0xe1, exif(1)), 0xff, 0xd9,
  ]);
}

async function run() {
  console.log('\n🧪 Fotos sin ubicación ni datos del celular\n');

  await check('1. JPEG: se van los datos internos y queda la imagen', () => {
    const r = stripImageMetadata(jpeg(1));
    assert(r.supported, 'entiende el JPEG');
    for (const s of ['GPS-34', 'PixelPhone', 'Buenos Aires', 'IPTC-City', 'comentario']) assert(!has(r.bytes, s), `quedó "${s}"`);
    assert(has(r.bytes, 'JFIF') && has(r.bytes, 'ICC_PROFILE'), 'conserva JFIF y perfil de color');
    assert(Buffer.from(r.bytes).includes(Buffer.from(SCAN)), 'la imagen comprimida quedó igual');
    assert(r.bytes[r.bytes.length - 2] === 0xff && r.bytes[r.bytes.length - 1] === 0xd9, 'termina en el fin de imagen');
    assert(r.removed >= 5, `bloques sacados: ${r.removed}`);
  });

  await check('2. JPEG de costado: queda solo la orientación', () => {
    const r = stripImageMetadata(jpeg(6));
    assert(!has(r.bytes, 'GPS-34') && !has(r.bytes, 'PixelPhone'), 'sin GPS ni modelo');
    const at = Buffer.from(r.bytes).indexOf(Buffer.from('Exif\0\0', 'latin1'));
    assert(at > 0, 'tiene un EXIF mínimo');
    const len = (r.bytes[at - 2] << 8) | r.bytes[at - 1];
    assert(exifOrientation(r.bytes.subarray(at, at + len - 2)) === 6, 'orientación 6');
    assert(len - 2 === 32, `EXIF mínimo de 32 bytes: ${len - 2}`);
  });

  await check('3. JPEG derecho: no se agrega EXIF', () => {
    const r = stripImageMetadata(jpeg(1));
    assert(!has(r.bytes, 'Exif'), 'sin EXIF');
  });

  await check('4. JPEG progresivo con varios barridos: queda entero', () => {
    // cabecera limpia + barrido 1 + tabla nueva (con FF D9 adentro, que no es el fin) + barrido 2 + fin
    const second = [...seg(0xc4, [0x10, 0xff, 0xd9]), ...seg(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]), 0x9a, 0xbc];
    const head = Array.from(stripImageMetadata(jpeg(1)).bytes);
    const progressive = Uint8Array.from([...head.slice(0, head.length - 2), ...second, 0xff, 0xd9]);
    const r = stripImageMetadata(progressive);
    assert(r.supported && r.removed === 0, `ya estaba limpio: ${r.removed}`);
    assert(Buffer.from(r.bytes).equals(Buffer.from(progressive)), 'mismos bytes');
  });

  await check('5. PNG: se van los textos y el EXIF', () => {
    const chunk = (type: string, data: number[]) => {
      const n = data.length;
      return [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...ascii(type), ...data, 0, 0, 0, 0];
    };
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
      ...chunk('tEXt', ascii('Location\0Buenos Aires')),
      ...chunk('eXIf', exif(1).slice(6)),
      ...chunk('iTXt', ascii('XML:com.adobe.xmp\0\0\0\0\0<x/>')),
      ...chunk('tIME', [7, 234, 11, 1, 12, 0, 0]),
      ...chunk('IDAT', [1, 2, 3]),
      ...chunk('IEND', []),
    ]);
    const r = stripImageMetadata(png);
    assert(r.supported && r.removed === 4, `sacó ${r.removed}`);
    assert(!has(r.bytes, 'Buenos Aires') && !has(r.bytes, 'GPS-34') && !has(r.bytes, 'tIME'), 'sin datos');
    assert(has(r.bytes, 'IHDR') && has(r.bytes, 'IDAT') && has(r.bytes, 'IEND'), 'queda la imagen');
  });

  await check('6. WebP: se van EXIF y XMP y se corrige el encabezado', () => {
    const chunk = (type: string, data: number[]) => {
      const n = data.length;
      return [...ascii(type), n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24, ...data, ...(n & 1 ? [0] : [])];
    };
    const body = [
      ...ascii('WEBP'),
      ...chunk('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...chunk('VP8 ', [1, 2, 3, 4, 5]),
      ...chunk('EXIF', exif(1).slice(6)),
      ...chunk('XMP ', ascii('<x>Buenos Aires</x>')),
    ];
    const n = body.length;
    const webp = Uint8Array.from([...ascii('RIFF'), n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24, ...body]);
    const r = stripImageMetadata(webp);
    assert(r.supported && r.removed === 2, `sacó ${r.removed}`);
    assert(!has(r.bytes, 'GPS-34') && !has(r.bytes, 'Buenos Aires'), 'sin datos');
    const size = r.bytes[4] | (r.bytes[5] << 8) | (r.bytes[6] << 16) | (r.bytes[7] << 24);
    assert(size === r.bytes.length - 8, `tamaño RIFF ${size} vs ${r.bytes.length - 8}`);
    assert((r.bytes[20] & 0x0c) === 0, 'marcas de EXIF y XMP apagadas');
    assert(has(r.bytes, 'VP8 '), 'queda la imagen');
  });

  await check('7. Formato desconocido o archivo cortado: vuelve tal cual', () => {
    const gif = Uint8Array.from(ascii('GIF89a....'));
    const r = stripImageMetadata(gif);
    assert(!r.supported && r.bytes === gif, 'GIF tal cual');
    const cut = jpeg(1).subarray(0, 40);
    const c = stripImageMetadata(cut);
    assert(!c.supported && c.bytes === cut, 'JPEG cortado tal cual');
  });

  await check('8. cleanPhotoFile devuelve un File limpio con el mismo nombre', async () => {
    const dirty = new File([jpeg(6)], 'cogollo.jpg', { type: 'image/jpeg' });
    const clean = await cleanPhotoFile(dirty);
    assert(clean !== dirty && clean.name === 'cogollo.jpg' && clean.type === 'image/jpeg', `${clean.name} ${clean.type}`);
    const bytes = new Uint8Array(await clean.arrayBuffer());
    assert(!has(bytes, 'GPS-34') && clean.size < dirty.size, 'más chico y sin GPS');
    const already = new File([bytes], 'otra.jpg', { type: 'image/jpeg' });
    assert((await cleanPhotoFile(already)) === already, 'si ya estaba limpio, el mismo archivo');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
