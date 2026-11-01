import { stripImageMetadata } from '../utils/imageMetadata';

/**
 * Devuelve la foto sin datos internos (ubicación GPS, modelo del celular, fecha) antes de guardarla.
 * JPEG, PNG y WebP se limpian sin volver a comprimir. Otro formato (HEIC, GIF…) se pasa a JPEG con un
 * canvas, que no copia ningún dato. Si nada de eso se puede (navegador sin canvas), se guarda tal cual.
 */
export async function cleanPhotoFile(file: File): Promise<File> {
  const original = new Uint8Array(await readBytes(file));
  const r = stripImageMetadata(original);
  if (r.supported) {
    if (r.removed === 0) return file;
    return new File([r.bytes], file.name, { type: file.type || 'image/jpeg', lastModified: file.lastModified });
  }
  return (await reencodeAsJpeg(file)) || file;
}

function readBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(file);
  });
}

async function reencodeAsJpeg(file: File): Promise<File | null> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return null;
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return null;
  }
}
