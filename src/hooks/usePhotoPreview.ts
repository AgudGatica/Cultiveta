import { useState, useEffect, useRef, useCallback } from 'react';
import { PhotoRecord } from '../types';
import { photoOfflineQueue } from '../services/photoOfflineQueue';

export interface UsePhotoPreviewResult {
  imageUrl: string | null;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
  isLocalBlob: boolean;
  handleImageError: () => void;
  reloadPreview: () => void;
}

/**
 * Hook de resolución y ciclo de vida de vistas previas de fotografías en Cultiveta.
 *
 * Reglas críticas:
 * 1. Para fotos pendientes o sin URL remota, obtiene el Blob durable de IndexedDB del usuario activo.
 * 2. Crea una Object URL propia para el consumidor que invoca el hook y controla su ciclo de vida (revoca al desmontar o cambiar).
 * 3. No reutiliza URLs revocadas del modal ni confía en URLs blob: caducadas de localStorage.
 * 4. No revoca URLs que otro componente esté utilizando de forma concurrente.
 * 5. Al recargar la página, reconstruye la vista previa directamente desde IndexedDB.
 * 6. Para fotos remotas, usa su URL remota (Firebase Storage / CDN); si su lectura falla (img.onerror),
 *    intenta automáticamente el respaldo local en IndexedDB si aún existe antes de marcar error definitivo.
 * 7. Evita dejar "Cargando imagen..." indefinidamente cuando img.onerror se dispare.
 */
export function usePhotoPreview(photo: PhotoRecord | undefined, userId?: string): UsePhotoPreviewResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLocalBlob, setIsLocalBlob] = useState<boolean>(false);

  // Referencia al Object URL creado por esta instancia para revocarlo limpiamente
  const createdObjectUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const loadTokenRef = useRef<number>(0);

  const cleanupCreatedUrl = useCallback(() => {
    if (createdObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(createdObjectUrlRef.current);
      } catch {
        // Ignorar fallo de revocación si ya fue liberado
      }
      createdObjectUrlRef.current = null;
    }
  }, []);

  const loadFromIndexedDB = useCallback(
    async (photoId: string, currentToken: number): Promise<boolean> => {
      try {
        const queuedItem = await photoOfflineQueue.getQueuedPhotoById(photoId);
        if (loadTokenRef.current !== currentToken || !isMountedRef.current) {
          return false;
        }

        if (queuedItem && queuedItem.fileBlob) {
          // Validar aislamiento de inquilino si se especificó userId
          if (userId && queuedItem.userId && queuedItem.userId !== userId) {
            console.warn(`[usePhotoPreview] Foto ${photoId} pertenece a otro UID.`);
            return false;
          }

          // Crear Object URL dedicado para este componente
          cleanupCreatedUrl();
          const newObjectUrl = URL.createObjectURL(queuedItem.fileBlob);
          createdObjectUrlRef.current = newObjectUrl;

          setImageUrl(newObjectUrl);
          setIsLocalBlob(true);
          setIsLoading(false);
          setHasError(false);
          setErrorMessage(null);
          return true;
        }
      } catch (err) {
        console.warn(`[usePhotoPreview] Error al leer Blob de IndexedDB para foto ${photoId}:`, err);
      }
      return false;
    },
    [userId, cleanupCreatedUrl]
  );

  const resolvePreview = useCallback(async () => {
    if (!photo || !photo.id) {
      cleanupCreatedUrl();
      setImageUrl(null);
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('Registro de fotografía no válido');
      return;
    }

    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);

    const rawUrl = photo.url ? photo.url.trim() : '';
    const isBlobUrl = rawUrl.startsWith('blob:');
    const isRemoteUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:');

    // 1. Si la URL guardada es un blob: (probablemente revocada del modal o sesión anterior),
    // NO confiar en ella; reconstruir de inmediato desde IndexedDB
    if (isBlobUrl || !rawUrl) {
      const restored = await loadFromIndexedDB(photo.id, token);
      if (token !== loadTokenRef.current || !isMountedRef.current) return;

      if (!restored) {
        // Si no se encontró en IndexedDB pero tiene thumbnail o storagePath, intentar informar
        cleanupCreatedUrl();
        setImageUrl(null);
        setIsLocalBlob(false);
        setIsLoading(false);
        setHasError(true);
        setErrorMessage('La imagen local no se encuentra en IndexedDB ni en la nube.');
      }
      return;
    }

    // 2. Es una URL remota legítima (Firebase Storage o CDN)
    if (isRemoteUrl) {
      cleanupCreatedUrl();
      setImageUrl(rawUrl);
      setIsLocalBlob(false);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    // 3. Fallback: intentar leer desde IndexedDB
    const fallbackRestored = await loadFromIndexedDB(photo.id, token);
    if (token !== loadTokenRef.current || !isMountedRef.current) return;

    if (!fallbackRestored) {
      cleanupCreatedUrl();
      setImageUrl(null);
      setIsLocalBlob(false);
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('No fue posible resolver la ubicación de la imagen.');
    }
  }, [photo, loadFromIndexedDB, cleanupCreatedUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    resolvePreview();

    return () => {
      isMountedRef.current = false;
      cleanupCreatedUrl();
    };
  }, [resolvePreview, cleanupCreatedUrl]);

  /**
   * Manejador de error nativo del tag <img>.
   * Si la imagen remota falla al cargar (red, token expirado, CORS),
   * intenta automáticamente obtener el Blob local si aún está en la cola antes de rendirse.
   */
  const handleImageError = useCallback(async () => {
    if (!photo?.id || !isMountedRef.current) return;

    // Si ya era un blob local y falló, la imagen está realmente rota
    if (isLocalBlob) {
      setHasError(true);
      setIsLoading(false);
      setErrorMessage('El archivo de imagen local parece estar corrupto.');
      return;
    }

    // Si era una URL remota que falló, buscar alternativa local en IndexedDB
    const token = ++loadTokenRef.current;
    const restored = await loadFromIndexedDB(photo.id, token);
    if (token !== loadTokenRef.current || !isMountedRef.current) return;

    if (!restored) {
      setHasError(true);
      setIsLoading(false);
      setErrorMessage('Error al descargar la imagen remota.');
    }
  }, [photo?.id, isLocalBlob, loadFromIndexedDB]);

  return {
    imageUrl,
    isLoading,
    hasError,
    errorMessage,
    isLocalBlob,
    handleImageError,
    reloadPreview: resolvePreview,
  };
}
