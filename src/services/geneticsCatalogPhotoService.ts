import { GeneticsCatalogPhoto, GeneticsCatalogPhotoDTO } from '../types';
import { authService } from './authService';
import { db, auth } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';
import { getGeneticsPhotoKey } from '../utils/geneticsKeyUtils';

export { getGeneticsPhotoKey };

/**
 * Convierte un File local a Data URL estrictamente para vista previa en el navegador.
 * NUNCA se utiliza para persistencia en Firestore ni backend.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

const CATALOG_PHOTOS_STORAGE_KEY = 'cultiveta_genetics_catalog_photos';

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  dimensions?: { width: number; height: number };
}

/**
 * Valida minuciosamente un archivo de imagen en cliente antes de iniciar la subida.
 */
export async function validateGeneticsImageFile(file: File): Promise<ImageValidationResult> {
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo.' };
  }

  // Validar extensión y MIME type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const ext = file.name ? file.name.split('.').pop()?.toLowerCase() || '' : '';
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

  const mimeValid = (file.type && allowedTypes.includes(file.type.toLowerCase())) || allowedExts.includes(ext);
  if (!mimeValid) {
    return {
      valid: false,
      error: 'Formato no admitido. Solo se permiten imágenes JPG, JPEG, PNG o WEBP.',
    };
  }

  // Validar tamaño (máximo 10 MB)
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo excede el tamaño máximo permitido de 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'El archivo de imagen está vacío (0 bytes).' };
  }

  // Validar dimensiones reales cargando la imagen en memoria si está en entorno de navegador
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
            reject(new Error('Dimensiones de imagen inválidas o archivo corrupto.'));
          } else {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('No se pudo decodificar el archivo como una imagen válida.'));
        };
        img.src = objectUrl;
      });

      if (dimensions.width < 50 || dimensions.height < 50) {
        return {
          valid: false,
          error: `La resolución es demasiado baja (${dimensions.width}x${dimensions.height} px). Se requiere al menos 50x50 px.`,
        };
      }

      return { valid: true, dimensions };
    } catch (err: any) {
      return { valid: false, error: err?.message || 'Error al validar las dimensiones de la imagen.' };
    }
  }

  return { valid: true };
}

export interface UploadGeneticsPhotoParams {
  seedBank: string;
  name: string;
  file: File;
  photoSourceName?: string;
  photoSourceUrl?: string;
  photoAttribution?: string;
  photoLicense?: string;
  photoRightsStatus?: 'unknown' | 'official-source' | 'permission-granted' | 'licensed' | 'owned';
}

export interface StorageStatusResult {
  available: boolean;
  code?: string;
  message?: string;
}

class GeneticsCatalogPhotoService {
  private cache: Record<string, GeneticsCatalogPhoto> = {};
  private listeners: ((photos: Record<string, GeneticsCatalogPhoto>) => void)[] = [];
  private isInitialized = false;

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(CATALOG_PHOTOS_STORAGE_KEY);
      if (raw) {
        this.cache = JSON.parse(raw);
      }
    } catch {
      // Ignorar error de deserialización
    }
  }

  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CATALOG_PHOTOS_STORAGE_KEY, JSON.stringify(this.cache));
    } catch (e) {
      console.warn('No se pudo guardar la caché de fotos de catálogo en localStorage:', e);
    }
  }

  private notify(): void {
    const copy = { ...this.cache };
    this.listeners.forEach((cb) => cb(copy));
  }

  getCatalogPhotos(): Record<string, GeneticsCatalogPhoto> {
    return { ...this.cache };
  }

  getPhotoForGenetic(seedBank: string, name: string): GeneticsCatalogPhoto | null {
    const key = getGeneticsPhotoKey(seedBank, name);
    return this.cache[key] || null;
  }

  subscribeCatalogPhotos(callback: (photos: Record<string, GeneticsCatalogPhoto>) => void): () => void {
    this.listeners.push(callback);
    callback({ ...this.cache });

    if (!this.isInitialized) {
      this.initRemoteSync();
    }

    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  private async initRemoteSync(): Promise<void> {
    this.isInitialized = true;

    try {
      if (db) {
        const colRef = collection(db, 'geneticsCatalogPhotos');
        onSnapshot(
          colRef,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              const data = change.doc.data() as GeneticsCatalogPhoto;
              if (change.type === 'removed') {
                delete this.cache[change.doc.id];
              } else if (data && data.key) {
                this.cache[data.key] = data;
              }
            });
            this.saveToLocalStorage();
            this.notify();
          },
          async (err) => {
            console.debug('Firestore geneticsCatalogPhotos snapshot fallback to REST:', err.message);
            await this.fetchFromApi();
          }
        );
        return;
      }
    } catch {
      // Continuar al fetch de API
    }

    await this.fetchFromApi();
  }

  /**
   * Consulta el backend GET /api/genetics/catalog-photos enviando token JWT
   */
  async fetchFromApi(): Promise<void> {
    try {
      const token = await authService.getIdToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/genetics/catalog-photos', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.photos) {
          this.cache = { ...this.cache, ...data.photos };
          this.saveToLocalStorage();
          this.notify();
        }
      }
    } catch {
      // Sin conexión o ambiente local
    }
  }

  /**
   * Verifica el estado real de Firebase Storage en el backend
   */
  async checkStorageStatus(): Promise<StorageStatusResult> {
    const token = await authService.getIdToken();
    try {
      const res = await fetch('/api/admin/genetics/storage-status', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.status === 503) {
        const errorData = await res.json().catch(() => ({}));
        return {
          available: false,
          code: errorData?.code || 'storage/unavailable',
          message: errorData?.message || 'El almacenamiento de imágenes todavía no está habilitado.',
        };
      }

      if (res.ok) {
        return { available: true };
      }

      const errJson = await res.json().catch(() => ({}));
      return {
        available: false,
        code: errJson?.code || 'storage/error',
        message: errJson?.message || 'Error verificando el estado del almacenamiento.',
      };
    } catch (netErr: any) {
      return {
        available: false,
        code: 'storage/network-error',
        message: netErr?.message || 'No se pudo conectar con el servidor para verificar el almacenamiento.',
      };
    }
  }

  /**
   * Subida de fotografía oficial por el creador / administrador.
   * Envía el binario mediante multipart/form-data.
   * NUNCA actualiza caché ni responde éxito si el backend o Firestore fallan.
   */
  async uploadPhoto(params: UploadGeneticsPhotoParams): Promise<GeneticsCatalogPhoto> {
    const {
      seedBank,
      name,
      file,
      photoSourceName,
      photoSourceUrl,
      photoAttribution,
      photoLicense,
      photoRightsStatus,
    } = params;

    // 1. Validar archivo minuciosamente
    const validation = await validateGeneticsImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Archivo de imagen no válido.');
    }

    const key = getGeneticsPhotoKey(seedBank, name);

    // 2. Obtener token de autenticación
    const token = await authService.getIdToken();
    if (!token) {
      throw new Error('Acceso no autorizado: Debes iniciar sesión como administrador.');
    }

    // 3. Empaquetar como multipart/form-data (PARTE E)
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('seedBank', seedBank.trim());
    formData.append('name', name.trim());
    if (photoSourceName) formData.append('photoSourceName', photoSourceName.trim());
    if (photoSourceUrl) formData.append('photoSourceUrl', photoSourceUrl.trim());
    if (photoAttribution) formData.append('photoAttribution', photoAttribution.trim());
    if (photoLicense) formData.append('photoLicense', photoLicense.trim());
    if (photoRightsStatus) formData.append('photoRightsStatus', photoRightsStatus);

    // 4. Enviar al endpoint seguro del backend
    const response = await fetch('/api/admin/genetics/upload-photo', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 503 || errorData?.code === 'storage/unavailable') {
        const msg = errorData?.message || 'El almacenamiento de imágenes todavía no está habilitado.';
        const err = new Error(msg);
        (err as any).code = 'storage/unavailable';
        throw err;
      }
      if (response.status === 403) {
        throw new Error('Acceso denegado: Se requieren permisos de creador/administrador para subir fotos.');
      }
      if (response.status === 401) {
        throw new Error('Acceso no autorizado: Sesión de administrador requerida.');
      }
      throw new Error(errorData?.error || errorData?.message || `Error del servidor (${response.status}) al guardar la fotografía.`);
    }

    const resJson = await response.json();
    if (!resJson?.success || !resJson?.photo?.photoUrl || !resJson?.photo?.storagePath) {
      throw new Error('La respuesta del servidor no confirmó la persistencia remota de la fotografía.');
    }

    const savedRecord: GeneticsCatalogPhoto = resJson.photo;

    // 5. Sólo después de respuesta 2xx exitosa confirmada, actualizar caché
    this.cache[key] = savedRecord;
    this.saveToLocalStorage();
    this.notify();

    return savedRecord;
  }

  /**
   * Eliminación de fotografía oficial por el creador / administrador.
   * Si el backend falla, NO altera la caché local.
   */
  async deletePhoto(seedBank: string, name: string): Promise<void> {
    const key = getGeneticsPhotoKey(seedBank, name);
    const token = await authService.getIdToken();
    if (!token) {
      throw new Error('Acceso no autorizado: Debes iniciar sesión como administrador.');
    }

    const response = await fetch('/api/admin/genetics/delete-photo', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        seedBank: seedBank.trim(),
        name: name.trim(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Acceso denegado: Se requieren permisos de creador/administrador para eliminar fotos.');
      }
      if (response.status === 401) {
        throw new Error('Acceso no autorizado: Sesión de administrador requerida.');
      }
      throw new Error(errorData?.error || errorData?.message || `Error del servidor (${response.status}) al eliminar la fotografía.`);
    }

    const resJson = await response.json();
    if (!resJson?.success) {
      throw new Error('El servidor no confirmó la eliminación de la fotografía.');
    }

    // Actualizar caché solo tras confirmación
    delete this.cache[key];
    this.saveToLocalStorage();
    this.notify();
  }
}

export const geneticsCatalogPhotoService = new GeneticsCatalogPhotoService();
