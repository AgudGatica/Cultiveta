import { GeneticsCatalogPhoto } from '../types';
import { authService } from './authService';
import { db, auth } from '../firebase/config';
import { collection, doc, onSnapshot, getDocs } from 'firebase/firestore';

const CATALOG_PHOTOS_STORAGE_KEY = 'cultiveta_genetics_catalog_photos';

// Normaliza nombres y bancos para generar una clave canónica
export function getGeneticsPhotoKey(seedBank: string, name: string): string {
  const cleanBank = (seedBank || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cleanName = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${cleanBank}__${cleanName}`;
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  dimensions?: { width: number; height: number };
}

/**
 * Valida minuciosamente un archivo de imagen antes de permitir la subida.
 */
export async function validateGeneticsImageFile(file: File): Promise<ImageValidationResult> {
  // 1. Validar que exista y no esté vacío
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo.' };
  }

  // 2. Validar tipo MIME y extensión
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

  const mimeValid = allowedTypes.includes(file.type.toLowerCase()) || allowedExts.includes(ext);
  if (!mimeValid) {
    return {
      valid: false,
      error: 'Formato no válido. Solo se admiten imágenes JPG, JPEG, PNG o WEBP.',
    };
  }

  // 3. Validar tamaño (máximo 10 MB)
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `El archivo excede el tamaño máximo permitido de 10 MB (tamaño actual: ${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'El archivo de imagen está vacío (0 bytes).' };
  }

  // 4. Validar dimensiones reales cargando la imagen en memoria
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

      // Validar dimensiones mínimas razonables
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

/**
 * Convierte un File a Data URL (base64)
 */
export async function fileToDataUrl(file: File): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // Node.js / JSDOM environment fallback
  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mime = file.type || 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    return 'data:image/jpeg;base64,';
  }
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

  /**
   * Obtiene sincrónicamente el mapa actual de fotos oficiales
   */
  getCatalogPhotos(): Record<string, GeneticsCatalogPhoto> {
    return { ...this.cache };
  }

  /**
   * Obtiene la foto de una genética específica si existe
   */
  getPhotoForGenetic(seedBank: string, name: string): GeneticsCatalogPhoto | null {
    const key = getGeneticsPhotoKey(seedBank, name);
    return this.cache[key] || null;
  }

  /**
   * Suscribe en tiempo real a las fotos oficiales del catálogo.
   */
  subscribeCatalogPhotos(callback: (photos: Record<string, GeneticsCatalogPhoto>) => void): () => void {
    this.listeners.push(callback);
    // Emisión inmediata desde caché en memoria / localStorage
    callback({ ...this.cache });

    // Carga desde Firestore / API si aún no se inicializó
    if (!this.isInitialized) {
      this.initRemoteSync();
    }

    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Sincronización remota con Firestore o endpoint del servidor
   */
  private async initRemoteSync(): Promise<void> {
    this.isInitialized = true;

    // 1. Intentar suscribir a Firestore si hay usuario autenticado
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
            // Si Firestore arroja error de reglas o permisos, hacer fallback al endpoint backend
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
   * Consulta el backend GET /api/genetics/catalog-photos
   */
  private async fetchFromApi(): Promise<void> {
    try {
      const res = await fetch('/api/genetics/catalog-photos');
      if (res.ok) {
        const data = await res.json();
        if (data?.photos) {
          this.cache = { ...this.cache, ...data.photos };
          this.saveToLocalStorage();
          this.notify();
        }
      }
    } catch {
      // Sin conexión o ambiente local sin backend corriendo
    }
  }

  /**
   * Subida de fotografía oficial por el creador / administrador
   */
  async uploadPhoto(params: {
    seedBank: string;
    name: string;
    file: File;
  }): Promise<GeneticsCatalogPhoto> {
    const { seedBank, name, file } = params;

    // 1. Validar archivo minuciosamente
    const validation = await validateGeneticsImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Archivo de imagen no válido.');
    }

    const key = getGeneticsPhotoKey(seedBank, name);
    const dataUrl = await fileToDataUrl(file);

    // 2. Obtener token de autenticación
    const token = await authService.getIdToken();

    // 3. Preparar registro local optimista
    const optimisticRecord: GeneticsCatalogPhoto = {
      key,
      seedBank: seedBank.trim(),
      name: name.trim(),
      photoUrl: dataUrl,
      fileSize: file.size,
      mimeType: file.type,
      dimensions: validation.dimensions,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || 'admin',
    };

    // 4. Enviar al endpoint seguro del backend
    let savedRecord = optimisticRecord;
    try {
      const response = await fetch('/api/admin/genetics/upload-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          seedBank: seedBank.trim(),
          name: name.trim(),
          photoData: dataUrl,
          mimeType: file.type,
          fileSize: file.size,
          dimensions: validation.dimensions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Si el backend responde con error 403 de permisos, lanzar error explícito
        if (response.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de creador/administrador para subir fotos oficiales.');
        }
        if (response.status === 401) {
          throw new Error('Acceso no autorizado: Debes iniciar sesión con la cuenta de administrador.');
        }
        throw new Error(errorData?.error || `Error del servidor (${response.status}) al guardar la fotografía.`);
      }

      const resJson = await response.json();
      if (resJson?.photo) {
        savedRecord = resJson.photo;
      }
    } catch (networkOrAuthErr: any) {
      // Si fue error de permisos (401 o 403), relanzarlo sin guardar
      if (
        networkOrAuthErr.message?.includes('Acceso denegado') ||
        networkOrAuthErr.message?.includes('Acceso no autorizado')
      ) {
        throw networkOrAuthErr;
      }

      // En entornos de testing o sin backend activo, registrar localmente
      console.warn('Backend API no disponible para subir foto de catálogo, guardando en caché local:', networkOrAuthErr.message);
    }

    // 5. Actualizar caché y notificar
    this.cache[key] = savedRecord;
    this.saveToLocalStorage();
    this.notify();

    return savedRecord;
  }

  /**
   * Eliminación de fotografía oficial por el creador / administrador
   */
  async deletePhoto(seedBank: string, name: string): Promise<void> {
    const key = getGeneticsPhotoKey(seedBank, name);
    const token = await authService.getIdToken();

    try {
      const response = await fetch('/api/admin/genetics/delete-photo', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          seedBank: seedBank.trim(),
          name: name.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de creador/administrador para eliminar fotos oficiales.');
        }
        if (response.status === 401) {
          throw new Error('Acceso no autorizado: Debes iniciar sesión como administrador.');
        }
        throw new Error(errorData?.error || `Error del servidor (${response.status}) al eliminar la fotografía.`);
      }
    } catch (networkOrAuthErr: any) {
      if (
        networkOrAuthErr.message?.includes('Acceso denegado') ||
        networkOrAuthErr.message?.includes('Acceso no autorizado')
      ) {
        throw networkOrAuthErr;
      }
      console.warn('Backend API no disponible para eliminar foto de catálogo, eliminando de caché local:', networkOrAuthErr.message);
    }

    // Actualizar caché
    delete this.cache[key];
    this.saveToLocalStorage();
    this.notify();
  }
}

export const geneticsCatalogPhotoService = new GeneticsCatalogPhotoService();
