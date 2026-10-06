/**
 * Validación estricta server-side de firmas binarias (magic bytes) y restricciones
 * para fotografías de catálogo de genéticas.
 *
 * Rechaza firmemente extensiones manipuladas, archivos SVG, ejecutables o binarios corruptos.
 */

export interface ImageBufferValidationResult {
  valid: boolean;
  detectedMime?: 'image/jpeg' | 'image/png' | 'image/webp';
  error?: string;
}

export function validateImageBuffer(buffer: Buffer): ImageBufferValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'El archivo de imagen está vacío (0 bytes).' };
  }

  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  if (buffer.length > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo excede el tamaño máximo permitido de 10 MB (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  // 1. JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: 'image/png' };
  }

  // 3. WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Firma binaria no válida. El archivo debe ser una imagen real JPG/JPEG, PNG o WEBP.',
  };
}
