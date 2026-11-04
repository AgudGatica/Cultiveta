/**
 * tests/photo_prep.test.ts
 *
 * SUITE: FOTOS DEL CELULAR (src/services/imagePrep.ts y la pantalla "Subir foto").
 *
 * 1. El formato se reconoce por el contenido: JPEG, PNG, WebP, HEIC, AVIF, vacío o cualquier otra cosa.
 * 2. Una foto chica en JPEG no se vuelve a comprimir, pero pierde los datos internos (ubicación).
 * 3. Una foto grande del celular se achica a 2560 px y se guarda en JPEG.
 * 4. Una foto enorme (50 MP o más) se abre ya achicada, para no quedarse sin memoria.
 * 5. HEIC ("alta eficiencia") que el navegador no abre: se convierte a JPEG; si no se puede, lo dice.
 * 6. Vacía (en la nube), no es una foto o no abre: cada caso con su mensaje, nunca "puede estar dañado".
 * 7. Poca memoria: prueba más chica. Si al sacarle los datos no abre, se usa la del lienzo.
 * 8. Pantalla "Subir foto": botón para sacar la foto con la cámara y otro para la galería; una HEIC
 *    queda lista para guardar y una vacía dice por qué; el día de cultivo de la foto es el correcto.
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { jpegSize, preparePhoto, setImageEnv, sniffImage, PhotoPrepError, type ImageEnv } from '../src/services/imagePrep';
import { PhotoUploadModal } from '../src/components/logs/PhotoUploadModal';
import { addDays, getLocalTodayDateOnly } from '../src/utils/growthStageUtils';

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
async function rejects(p: Promise<unknown>, re: RegExp, kind?: string) {
  let err: any = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert(err instanceof PhotoPrepError && re.test(err.message) && (!kind || err.kind === kind), `esperaba ${re} (${kind || ''}): ${err?.message} ${err?.kind || ''}`);
  assert(!/dañad/i.test(err.message), 'nunca "puede estar dañado"');
}

// Un JPEG de verdad (1×1) al que se le cambian el ancho y el alto del encabezado
const BASE_JPEG = [
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05,
  0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e,
  0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b,
  0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9,
];
/** EXIF con un texto de "ubicación" adentro (para ver que se va). */
const gpsExif = () => {
  const payload = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0], [...'GPSDATA-34.6S-58.4W'].map((c) => c.charCodeAt(0)));
  const len = payload.length + 2;
  return [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
};
function jpeg(width: number, height: number, o: { gps?: boolean; padTo?: number } = {}): Uint8Array {
  const b = [...BASE_JPEG];
  const sof = b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xc0);
  b[sof + 5] = height >> 8;
  b[sof + 6] = height & 0xff;
  b[sof + 7] = width >> 8;
  b[sof + 8] = width & 0xff;
  const out = o.gps ? [0xff, 0xd8, ...gpsExif(), ...b.slice(2)] : b;
  // relleno dentro de un COM… no: se agrega antes del fin como datos del barrido (peso de una foto real)
  if (o.padTo && o.padTo > out.length) out.splice(out.length - 2, 0, ...new Array(o.padTo - out.length).fill(0x11));
  return Uint8Array.from(out);
}
const ftyp = (major: string, compat: string[]) => {
  const brands = [major, '\0\0\0\0', ...compat].join('');
  const size = 8 + brands.length;
  return Uint8Array.from([0, 0, 0, size, ...[...'ftyp', ...brands].map((c) => c.charCodeAt(0)), 0, 0, 0, 8]);
};
const text = (b: Uint8Array) => String.fromCharCode(...b);
const file = (bytes: Uint8Array, name: string, type = '') => new File([bytes], name, { type });

/** Navegador de mentira: abre JPEG y PNG (no HEIC), y "dibuja" devolviendo un JPEG del tamaño pedido. */
function fakeEnv(o: { failDecode?: (n: number, bytes: Uint8Array) => boolean; encodeFailsFirst?: boolean; heicFails?: boolean } = {}) {
  const calls = { decode: [] as Array<{ size: number; resize: any }>, encode: [] as Array<{ w: number; h: number }>, heic: 0 };
  let encodeFailed = false;
  const env: ImageEnv = {
    async decode(blob, resize) {
      const b = new Uint8Array(await blob.arrayBuffer());
      calls.decode.push({ size: b.length, resize: resize || null });
      if (o.failDecode?.(calls.decode.length, b)) return null;
      const kind = sniffImage(b);
      if (kind !== 'jpeg' && kind !== 'png') return null;
      const s = kind === 'jpeg' ? jpegSize(b) : { width: 800, height: 600 };
      if (!s) return null;
      const out = resize ? { width: resize.width, height: Math.round((resize.width * s.height) / s.width) } : s;
      return { ...out, source: {} as CanvasImageSource, close() {} };
    },
    async encode(_source, w, h) {
      calls.encode.push({ w, h });
      if (o.encodeFailsFirst && !encodeFailed) {
        encodeFailed = true;
        return null;
      }
      return new Blob([jpeg(w, h)], { type: 'image/jpeg' });
    },
    async heicToJpeg() {
      calls.heic++;
      if (o.heicFails) throw new Error('libheif');
      return new Blob([jpeg(4032, 3024)], { type: 'image/jpeg' });
    },
  };
  return { env, calls };
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function run() {
  console.log('\n================================================================');
  console.log('   FOTOS DEL CELULAR');
  console.log('================================================================\n');

  await check('1. El formato se reconoce por el contenido', () => {
    assert(sniffImage(jpeg(10, 10)) === 'jpeg', 'jpeg');
    assert(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'png', 'png');
    assert(sniffImage(Uint8Array.from([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)))) === 'webp', 'webp');
    assert(sniffImage(ftyp('heic', ['mif1', 'heic'])) === 'heic', 'heic de iPhone');
    assert(sniffImage(ftyp('mif1', ['heic', 'miaf'])) === 'heic', 'heif de Samsung (mif1)');
    assert(sniffImage(ftyp('avif', ['mif1', 'miaf'])) === 'avif', 'avif');
    assert(sniffImage(new Uint8Array()) === 'empty', 'vacío');
    assert(sniffImage(Uint8Array.from([...'hola, no soy una foto'].map((c) => c.charCodeAt(0)))) === 'unknown', 'otra cosa');
    const s = jpegSize(jpeg(4032, 3024));
    assert(s?.width === 4032 && s.height === 3024, JSON.stringify(s));
  });

  await check('2. Foto chica en JPEG: no se vuelve a comprimir, pero se va la ubicación', async () => {
    const { env, calls } = fakeEnv();
    const r = await preparePhoto(file(jpeg(1200, 900, { gps: true }), 'mi foto.JPG', 'image/jpeg'), {}, env);
    const out = new Uint8Array(await r.file.arrayBuffer());
    assert(!r.reencoded && calls.encode.length === 0 && r.width === 1200 && r.height === 900, JSON.stringify({ r: r.reencoded, enc: calls.encode }));
    assert(r.file.type === 'image/jpeg' && r.file.name === 'mi foto.jpg' && !text(out).includes('GPSDATA') && sniffImage(out) === 'jpeg', `${r.file.name} ${r.file.type}`);
  });

  await check('3. Foto grande del celular: se achica a 2560 px y queda en JPEG', async () => {
    const { env, calls } = fakeEnv();
    const r = await preparePhoto(file(jpeg(4032, 3024, { gps: true, padTo: 50_000 }), 'IMG_20261104.jpg', 'image/jpeg'), {}, env);
    assert(r.reencoded && r.width === 2560 && r.height === 1920 && calls.encode[0].w === 2560 && calls.encode[0].h === 1920, JSON.stringify({ r, enc: calls.encode }));
    assert(calls.decode[0].resize === null, 'a 4032 px se abre entera');
    assert(r.file.type === 'image/jpeg' && /\.jpg$/.test(r.file.name), r.file.name);
  });

  await check('4. Foto enorme (12000 px): se abre ya achicada y se guarda achicada (aunque pese poco)', async () => {
    const { env, calls } = fakeEnv();
    const r = await preparePhoto(file(jpeg(12000, 9000), 'ultra.jpg', 'image/jpeg'), {}, env);
    assert(calls.decode[0].resize?.width === 2560 && r.width === 2560 && r.height === 1920, JSON.stringify({ d: calls.decode, r }));
    // pesa menos de 3 MB pero mide 12000 px: no se puede dejar la original
    assert(r.reencoded && calls.encode.length === 1 && jpegSize(new Uint8Array(await r.file.arrayBuffer()))?.width === 2560, 'la guardada mide 2560');
  });

  await check('5. HEIC: se convierte a JPEG; si no se puede, lo dice', async () => {
    const heic = Uint8Array.from([...ftyp('heic', ['mif1', 'heic']), ...new Array(200).fill(7)]);
    const a = fakeEnv();
    const r = await preparePhoto(file(heic, 'IMG_0001.HEIC', 'image/heic'), {}, a.env);
    assert(a.calls.heic === 1 && r.kind === 'heic' && r.reencoded && r.width === 2560 && r.file.name === 'IMG_0001.jpg' && r.file.type === 'image/jpeg', JSON.stringify(r));
    // aunque venga con otro nombre (sin .heic), se reconoce por el contenido
    const b = fakeEnv();
    await preparePhoto(file(heic, '1000045678', ''), {}, b.env);
    assert(b.calls.heic === 1, 'sin extensión también');
    const c = fakeEnv({ heicFails: true });
    await rejects(preparePhoto(file(heic, 'IMG_0002.heic', 'image/heic'), {}, c.env), /HEIC/, 'heic');
  });

  await check('6. Vacía, no es una foto o no abre: cada una con su mensaje', async () => {
    const { env } = fakeEnv();
    await rejects(preparePhoto(file(new Uint8Array(), 'foto.jpg', 'image/jpeg'), {}, env), /vacía.*nube/, 'empty');
    await rejects(preparePhoto(file(Uint8Array.from([...'%PDF-1.7 hola'].map((c) => c.charCodeAt(0))), 'doc.jpg', 'image/jpeg'), {}, env), /no es una foto/, 'unknown');
    const broken = fakeEnv({ failDecode: () => true });
    await rejects(preparePhoto(file(jpeg(4032, 3024), 'rota.jpg', 'image/jpeg'), {}, broken.env), /No se pudo abrir esta foto \(JPG/, 'jpeg');
  });

  await check('7. Poca memoria: más chica; si sin los datos no abre, se usa la del lienzo', async () => {
    const a = fakeEnv({ encodeFailsFirst: true });
    const r = await preparePhoto(file(jpeg(4032, 3024), 'grande.jpg', 'image/jpeg'), {}, a.env);
    assert(a.calls.encode.length === 2 && a.calls.encode[1].w === 1600 && r.width === 1600 && r.height === 1200, JSON.stringify(a.calls.encode));
    // la limpia no abre (2.ª apertura): se dibuja de nuevo
    const b = fakeEnv({ failDecode: (n) => n === 2 });
    const s = await preparePhoto(file(jpeg(1000, 800, { gps: true }), 'chica.jpg', 'image/jpeg'), {}, b.env);
    assert(s.reencoded && b.calls.encode.length === 1 && s.width === 1000, JSON.stringify({ s, enc: b.calls.encode }));
  });

  await check('8. "Subir foto": cámara y galería; una HEIC queda lista y una vacía dice por qué', async () => {
    const { env, calls } = fakeEnv();
    setImageEnv(env);
    const realCreate = (URL as any).createObjectURL;
    const realRevoke = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = () => 'blob:prueba';
    (URL as any).revokeObjectURL = () => {};
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    // empezó hace 10 días: la foto de hoy es del día 11 (antes, en Argentina, decía 12)
    const crop = { id: 'c1', name: 'Gelato', currentStage: 'Floración', startDate: addDays(getLocalTodayDateOnly(), -10) } as any;
    try {
      await act(async () => root.render(React.createElement(PhotoUploadModal, { isOpen: true, onClose: () => {}, userId: 'u1', cultivations: [crop], defaultCultivationId: 'c1', onPhotoUploaded: () => {} })));
      assert(/\(Día 11\)/.test(container.textContent || ''), `día de la foto: ${(container.textContent || '').match(/Día \d+/)?.[0]}`);
      const camera = container.querySelector('#photo-camera-input') as HTMLInputElement;
      const gallery = container.querySelector('#photo-file-input') as HTMLInputElement;
      assert(camera?.getAttribute('capture') === 'environment' && camera.accept === 'image/*', 'la cámara trasera, cualquier foto');
      assert(gallery && gallery.accept === 'image/*' && !gallery.hasAttribute('capture'), 'galería: cualquier foto (también HEIC)');
      assert((container.querySelector('#photo-camera-btn') as HTMLLabelElement)?.htmlFor === 'photo-camera-input' && /Sacar foto/.test(container.textContent || ''), 'botón Sacar foto');
      assert((container.querySelector('#photo-gallery-btn') as HTMLLabelElement)?.htmlFor === 'photo-file-input', 'botón Galería');
      const pick = async (input: HTMLInputElement, f: File) => {
        const k = Object.keys(input).find((x) => x.startsWith('__reactProps'))!;
        await act(async () => (input as any)[k].onChange({ target: { files: [f], value: 'C:\\fakepath\\x' } }));
        for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
      };
      const heic = Uint8Array.from([...ftyp('heic', ['mif1', 'heic']), ...new Array(200).fill(7)]);
      await pick(camera, file(heic, 'IMG_0001.HEIC', 'image/heic'));
      assert(calls.heic === 1 && container.querySelector('#photo-preview') && !(container.querySelector('#save-photo-btn') as HTMLButtonElement).disabled, `HEIC lista: ${container.textContent?.slice(0, 200)}`);
      assert(/Lista para guardar/.test(container.textContent || '') && /Sacar otra/.test(container.textContent || ''), 'dice que está lista');
      await pick(gallery, file(new Uint8Array(), 'nube.jpg', 'image/jpeg'));
      assert(/vacía/.test(container.textContent || '') && !/dañad/i.test(container.textContent || '') && (container.querySelector('#save-photo-btn') as HTMLButtonElement).disabled, 'vacía: el porqué');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      setImageEnv();
      (URL as any).createObjectURL = realCreate;
      (URL as any).revokeObjectURL = realRevoke;
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO FOTOS DEL CELULAR: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en photo_prep:', err);
  process.exit(1);
});
